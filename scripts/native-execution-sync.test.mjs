import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeBase = path.join(root, '.runtime');
const runtimeRoot = path.join(runtimeBase, `native-execution-sync-unit-${Date.now()}`);
const entry = path.join(runtimeRoot, 'entry.mjs');
await fs.promises.mkdir(runtimeRoot, { recursive: true });

const source = fs.readFileSync(path.join(root, 'lab/pilot/native-execution-sync.tsx'), 'utf8');
assert.match(source, /new HostLifecycleReconciler/);
assert.match(source, /watchProjectChanges\(watchedProjectId, listener\)/);
assert.match(source, /synchronizeExecutionProjection/);
assert.match(source, /data-lcos-native-execution-sync-retry/);
assert.match(source, /controllerRef\.current\?\.retry\(\)/);
assert.match(source, /controllerRef\.current = null/);
assert.doesNotMatch(source, /\.addNodes\s*\(|\.setNodes\s*\(|location\.reload\s*\(/,
  'the sync leaf delegates to the current original API; it must not own graph application or reload the page');

await buildPilotEntry('lab/pilot/native-execution-sync.tsx', entry, 'node');
const { createNativeExecutionProjectionSyncController } = await import(pathToFileURL(entry).href);

const target = Object.freeze({ projectId: 'project-test', canvasId: 'canvas-test', workspaceId: 'workspace-test' });
const waitFor = async (predicate, message) => {
  const deadline = Date.now() + 1500;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail(message);
};

// Controller unit only: this fake represents the original API shape, not a real Canvas or GUI.
{
  const states = [];
  let projectListener;
  let calls = 0;
  const api = { synchronizeExecutionProjection: async () => { calls += 1; return { ok: true }; } };
  const owner = { ...target, api };
  const controller = createNativeExecutionProjectionSyncController({
    target,
    readOwner: () => ({ status: 'ready', owner }),
    watchProjectChanges: (_projectId, listener) => { projectListener = listener; return () => { projectListener = undefined; }; },
    onState: (state) => states.push(state),
    cooldownMs: 0,
    debounceMs: 12,
  });
  await waitFor(() => states.at(-1)?.status === 'ready', 'project-open sync did not settle ready');
  assert.equal(calls, 1);
  projectListener();
  projectListener();
  projectListener();
  await waitFor(() => calls === 2 && states.at(-1)?.status === 'ready', 'coalesced project invalidation did not sync');
  await new Promise((resolve) => setTimeout(resolve, 35));
  assert.equal(calls, 2, 'a burst of project changes is coalesced into one additional sync');
  controller.dispose();
  assert.equal(projectListener, undefined, 'disposing releases the shared project watcher');
}

{
  const states = [];
  let finishSync;
  const apiA = { synchronizeExecutionProjection: () => new Promise((resolve) => { finishSync = resolve; }) };
  const apiB = { synchronizeExecutionProjection: async () => ({ ok: true }) };
  let owner = { ...target, api: apiA };
  const controller = createNativeExecutionProjectionSyncController({
    target,
    readOwner: () => ({ status: 'ready', owner }),
    watchProjectChanges: () => () => {},
    onState: (state) => states.push(state),
    cooldownMs: 0,
    debounceMs: 5,
  });
  await waitFor(() => typeof finishSync === 'function', 'captured original API was not invoked');
  owner = { ...target, api: apiB };
  finishSync({ ok: true });
  await waitFor(() => states.at(-1)?.status === 'blocked', 'old API completion was not rejected after owner replacement');
  assert.equal(states.some((state) => state.status === 'ready'), false,
    'late success from a replaced API must never be displayed as current success');
  controller.dispose();
}

{
  const states = [];
  let projectListener;
  let oldApiCalls = 0;
  let newApiCalls = 0;
  const oldApi = { synchronizeExecutionProjection: async () => { oldApiCalls += 1; return { ok: true }; } };
  const newApi = { synchronizeExecutionProjection: async () => { newApiCalls += 1; return { ok: true }; } };
  let owner = { ...target, api: oldApi };
  const controller = createNativeExecutionProjectionSyncController({
    target,
    readOwner: () => ({ status: 'ready', owner }),
    watchProjectChanges: (_projectId, listener) => { projectListener = listener; return () => { projectListener = undefined; }; },
    onState: (state) => states.push(state),
    cooldownMs: 0,
    debounceMs: 5,
  });
  await waitFor(() => states.at(-1)?.status === 'ready', 'initial owner sync did not settle');
  owner = { ...target, api: newApi };
  projectListener();
  await waitFor(() => states.at(-1)?.status === 'blocked', 'replacement API was not rejected');
  assert.equal(oldApiCalls, 1, 'the replaced API must not be called again on a project event');
  assert.equal(newApiCalls, 0, 'this controller instance never silently follows a new API');
  controller.dispose();
}

{
  const states = [];
  const retryFlags = [];
  let projectListener;
  let calls = 0;
  const api = { synchronizeExecutionProjection: async (_target, options) => {
    calls += 1;
    retryFlags.push(options?.retryPendingSave);
    return calls === 1 ? { ok: false, reason: 'synthetic blocked receipt' } : { ok: true };
  } };
  const controller = createNativeExecutionProjectionSyncController({
    target,
    readOwner: () => ({ status: 'ready', owner: { ...target, api } }),
    watchProjectChanges: (_projectId, listener) => { projectListener = listener; return () => { projectListener = undefined; }; },
    onState: (state) => states.push(state),
    cooldownMs: 0,
    debounceMs: 5,
  });
  await waitFor(() => states.at(-1)?.status === 'blocked', 'blocked receipt was not surfaced');
  await new Promise((resolve) => setTimeout(resolve, 35));
  assert.equal(calls, 1, 'a failed receipt is observable and does not trigger an automatic replay loop');
  assert.equal(states.at(-1)?.message, 'synthetic blocked receipt');
  controller.retry();
  await waitFor(() => calls === 2 && states.at(-1)?.status === 'ready', 'manual retry did not recover the blocked synchronization');
  assert.deepEqual(retryFlags, [undefined, true], 'only an explicit retry requests recovery of pending original saves');
  projectListener();
  await waitFor(() => calls === 3 && states.at(-1)?.status === 'ready', 'later project invalidation did not perform its ordinary sync');
  assert.deepEqual(retryFlags, [undefined, true, undefined], 'automatic project events never replay a failed pending-save queue');
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(calls, 3, 'a manual retry settles without an automatic retry loop');
  controller.dispose();
}

{
  const states = [];
  let calls = 0;
  let projectListener;
  const api = { synchronizeExecutionProjection: async () => { calls += 1; return { ok: false, reason: 'synthetic failure before dispose' }; } };
  const controller = createNativeExecutionProjectionSyncController({
    target,
    readOwner: () => ({ status: 'ready', owner: { ...target, api } }),
    watchProjectChanges: (_projectId, listener) => { projectListener = listener; return () => { projectListener = undefined; }; },
    onState: (state) => states.push(state),
    cooldownMs: 0,
    debounceMs: 5,
  });
  await waitFor(() => states.at(-1)?.status === 'blocked', 'pre-dispose failure was not observed');
  controller.dispose();
  controller.retry();
  projectListener?.();
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(calls, 1, 'calling retry after dispose cannot invoke a stale API');
  assert.equal(projectListener, undefined, 'dispose releases the shared watcher before retry');
}

{
  const states = [];
  let calls = 0;
  let watched = false;
  const controller = createNativeExecutionProjectionSyncController({
    target,
    readOwner: () => ({ status: 'unavailable', message: 'synthetic owner not ready' }),
    watchProjectChanges: () => { watched = true; return () => {}; },
    onState: (state) => states.push(state),
  });
  assert.equal(states.at(-1)?.status, 'unavailable');
  assert.equal(calls, 0);
  assert.equal(watched, false, 'an unavailable owner is neither called nor subscribed as current');
  controller.dispose();
}

const relative = path.relative(runtimeBase, runtimeRoot);
assert.equal(path.basename(runtimeRoot), `native-execution-sync-unit-${path.basename(runtimeRoot).slice('native-execution-sync-unit-'.length)}`);
assert.ok(relative && relative === path.basename(runtimeRoot) && !path.isAbsolute(relative), 'temporary build must stay under .runtime');
await fs.promises.rm(runtimeRoot, { recursive: true, force: true });

console.log(JSON.stringify({
  passed: true,
  scope: 'native execution sync controller unit with fake API/listener; not real Canvas or GUI verification',
  cases: [
    'project-open call and burst-coalesced project invalidations',
    'replacement API invalidates a late success for the same Canvas ID',
    'same-Canvas API replacement is rejected before a later project-triggered call',
    'failed receipt stays blocked without auto-replay; explicit retry recovers once and uses retryPendingSave only once',
    'dispose clears watcher and a later retry cannot call the original API',
    'unavailable owner is not invoked or watched',
    'shared watcher is released on dispose',
  ],
}, null, 2));
