import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { currentGen2Root } from '../lab/current-gen2-resources.mjs';

// Transpile and execute the actual pure module; no copied routing function,
// browser, service, fixture or domain write participates in these checks.
const esbuild = createRequire(path.join(currentGen2Root, 'package.json'))('esbuild');
const source = await fs.readFile(new URL('../lab/pilot/native-library-member-entry.ts', import.meta.url), 'utf8');
const compiled = await esbuild.transform(source, { loader: 'ts', format: 'esm', target: 'es2022' });
const { openNativeLibraryMemberEntry: open } = await import('data:text/javascript;base64,' + Buffer.from(compiled.code).toString('base64'));
const checks = [], address = { projectId: 'project', canvasId: 'canvas', kind: 'collection', id: 'collection-exact' };
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
};
const tick = () => new Promise(resolve => setImmediate(resolve));
async function promptly(promise) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Cancellation did not settle promptly.')), 800); })]); }
  finally { clearTimeout(timer); }
}
function harness() {
  const calls = { libraries: 0, entries: [], frames: [] };
  let alive = true;
  const owner = { projectId: 'project', canvasId: 'canvas', async openEntry(kind, id, current, signal) {
    assert.equal(current(), true); assert.equal(signal.aborted, false); calls.entries.push([kind, id]);
  } };
  let list = owner;
  const ports = { current: () => alive, openLibrary: () => { calls.libraries++; }, list: () => list,
    frame: callback => { calls.frames.push(callback); }, timeoutMs: 500 };
  return { calls, owner, ports, setList(value) { list = value; }, cancelCurrent() { alive = false; } };
}

for (const kind of ['context', 'workflow', 'collection']) {
  const h = harness(), wanted = { ...address, kind, id: kind + '-exact' };
  await open(wanted, h.ports);
  assert.equal(h.calls.libraries, 1);
  assert.deepEqual(h.calls.entries, [[kind, wanted.id]]);
  assert.equal(h.calls.frames.length, 0);
}
checks.push('All three kinds open the original Library once and dispatch the exact kind and identity.');

{
  const h = harness(), rows = [{ kind: 'collection', id: 'wrong', title: '同名内容' }, { kind: 'collection', id: 'collection-exact', title: '同名内容' }];
  h.owner.openEntry = async (kind, id, current) => { if (current()) h.calls.entries.push(rows.find(row => row.kind === kind && row.id === id)); };
  await open(address, h.ports);
  assert.deepEqual(h.calls.entries, [rows[1]]);
  assert.equal(h.calls.libraries, 1);
}
checks.push('Identical labels do not select a sibling: the original row receives the requested identity.');

for (const invalid of [null, { ...address, projectId: '' }, { ...address, canvasId: '  ' }, { ...address, id: '' }, { ...address, kind: 'artifact' }]) {
  const h = harness();
  await assert.rejects(open(invalid, h.ports), /内容来源尚未确认/);
  assert.equal(h.calls.libraries, 0); assert.deepEqual(h.calls.entries, []);
}
for (const mode of ['signal', 'current']) {
  const h = harness(), controller = new AbortController();
  if (mode === 'signal') controller.abort(); else h.cancelCurrent();
  await assert.rejects(open(address, h.ports, controller.signal), error => error.name === 'AbortError');
  assert.equal(h.calls.libraries, 0); assert.deepEqual(h.calls.entries, []);
}
checks.push('Incomplete/unsupported addresses and already-cancelled ownership reject before opening anything.');

{
  const h = harness(), wrongCalls = [], wrong = { ...h.owner, projectId: 'another', openEntry: async () => wrongCalls.push('wrong-project') };
  h.setList(wrong);
  const pending = open(address, h.ports);
  assert.equal(h.calls.libraries, 1); assert.equal(h.calls.frames.length, 1);
  h.setList({ ...h.owner, canvasId: 'another', openEntry: async () => wrongCalls.push('wrong-canvas') });
  h.calls.frames.shift()(); await tick();
  assert.equal(h.calls.frames.length, 1);
  h.setList(h.owner); h.calls.frames.shift()(); await pending;
  assert.deepEqual(wrongCalls, []); assert.deepEqual(h.calls.entries, [['collection', 'collection-exact']]);
  assert.equal(h.calls.libraries, 1);
}
checks.push('Wrong project/canvas list owners are ignored until the exact original list mounts.');

{
  const h = harness(), controller = new AbortController();
  h.setList(null);
  const pending = open(address, h.ports, controller.signal), failure = assert.rejects(pending, error => error.name === 'AbortError');
  controller.abort(); await promptly(failure);
  h.setList(h.owner); h.calls.frames.shift()(); await tick();
  assert.deepEqual(h.calls.entries, []); assert.equal(h.calls.libraries, 1);
}
checks.push('Cancellation while a frame/list is pending rejects immediately; late mount/frame callbacks do not reopen.');

for (const mode of ['signal', 'timeout']) {
  const h = harness(), controller = new AbortController(), gate = deferred();
  let entrySignal, entryCurrent;
  h.ports.timeoutMs = mode === 'timeout' ? 15 : 500;
  h.owner.openEntry = async (kind, id, current, signal) => {
    entrySignal = signal; entryCurrent = current;
    await gate.promise;
    if (current() && !signal.aborted) h.calls.entries.push([kind, id]);
  };
  const pending = open(address, h.ports, controller.signal);
  const failure = assert.rejects(pending, mode === 'signal' ? error => error.name === 'AbortError' : /打开尚未确认/);
  assert.ok(entrySignal);
  if (mode === 'signal') controller.abort();
  await promptly(failure);
  assert.equal(entrySignal.aborted, true); assert.equal(entryCurrent(), false);
  gate.resolve(); await tick();
  assert.deepEqual(h.calls.entries, []); assert.equal(h.calls.libraries, 1);
}
checks.push('Caller abort and timeout reject during a hung original openEntry, abort its signal and disable its late callback.');

{
  const h = harness(), controller = new AbortController(), firstGate = deferred(), secondGate = deferred(), signals = new Map();
  h.owner.openEntry = async (kind, id, current, signal) => {
    signals.set(id, signal);
    await (id === 'old-entry' ? firstGate.promise : secondGate.promise);
    if (current() && !signal.aborted) h.calls.entries.push([kind, id]);
  };
  const first = open({ ...address, id: 'old-entry' }, h.ports, controller.signal);
  const firstFailure = assert.rejects(first, error => error.name === 'AbortError');
  controller.abort(); await promptly(firstFailure);
  const second = open({ ...address, kind: 'workflow', id: 'new-entry' }, h.ports);
  firstGate.resolve(); await tick();
  assert.equal(signals.get('old-entry').aborted, true); assert.equal(signals.get('new-entry').aborted, false);
  assert.deepEqual(h.calls.entries, []);
  secondGate.resolve(); await second;
  assert.deepEqual(h.calls.entries, [['workflow', 'new-entry']]); assert.equal(h.calls.libraries, 2);
}
checks.push('A cancelled old result cannot change, abort or reopen a subsequent exact request; there is no shared request state.');

{
  const h = harness(), gate = deferred(); let signal;
  h.owner.openEntry = async (kind, id, current, passed) => { signal = passed; await gate.promise; if (current()) h.calls.entries.push([kind, id]); };
  const pending = open(address, h.ports), failure = assert.rejects(pending, error => error.name === 'AbortError');
  h.cancelCurrent(); gate.resolve(); await failure;
  assert.equal(signal.aborted, true); assert.deepEqual(h.calls.entries, []);
}
{
  const h = harness(), failure = new Error('Original entry read failed.');
  let signal;
  h.owner.openEntry = async (_kind, _id, _current, passed) => { signal = passed; throw failure; };
  await assert.rejects(open(address, h.ports), error => error === failure);
  assert.equal(signal.aborted, true); assert.equal(h.calls.libraries, 1);
}
checks.push('Ownership is rechecked after the original await, and original entry failures propagate without retrying or opening a substitute.');

console.log(JSON.stringify({ passed: true, checks, networkRequests: 0, domainWrites: 0, browserOrServiceStarted: false }, null, 2));
