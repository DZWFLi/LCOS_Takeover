import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';
import { readCurrentGen2Resource } from '../lab/current-gen2-resources.mjs';
import { withNativeComposerDraftTransforms } from '../lab/native-composer-draft-source-transform.mjs';
import { transformNativeReferencePickSource } from '../lab/native-reference-pick-source-transform.mjs';

const root = process.cwd();
const dir = await fs.mkdtemp(path.resolve('.runtime/native-reference-pick-original-'));
const output = path.resolve('output/原画布引用点取_20261026/原识别器专项', new Date().toISOString().replaceAll(':', '-'));
await fs.mkdir(output, { recursive: true });
const report = { passed: false, cases: [], networkCalls: 0, domainWrites: 0, models: 0,
  scope: 'Executes the complete adopted original reference-pick function after the exact product source transform. Actual Shell, ReferenceStore/controller, pointer grammar, snapshots and native geometry run. Only browser hit/Canvas observation and preparation transport are controlled. This is not a real-page verification.' };
const spec = value => JSON.stringify(path.resolve(value).replaceAll('\\', '/'));
const absoluteImports = (source, file) => source.replace(/from\s+(['"])(\.[^'"]+)\1/g,
  (_, quote, name) => 'from ' + JSON.stringify(path.resolve(path.dirname(file), name).replaceAll('\\', '/')));
const originalFile = path.resolve('lcos/huabu/apps/web/src/lcos/lcosRecognizers.ts');
const adopted = readCurrentGen2Resource(originalFile);
const original = adopted?.contents ?? await fs.readFile(originalFile, 'utf8');
const transformed = transformNativeReferencePickSource(original, originalFile);
const start = transformed.indexOf('export function createReferencePickRecognizer(');
const endMatch = /\/\*\*\r?\n \* Acquire a payload/.exec(transformed.slice(start));
const end = endMatch ? start + endMatch.index : -1;
assert.ok(start >= 0 && end > start, 'The actual original reference recognizer must retain its complete function seam.');
const originalFunction = transformed.slice(start, end);
const shellFile = path.resolve('lcos/huabu/apps/web/src/lcos/shell/lcosShellStore.ts');
const adoptedShell = readCurrentGen2Resource(shellFile);
const shell = withNativeComposerDraftTransforms()['lcos/huabu/apps/web/src/lcos/shell/lcosShellStore.ts'](
  adoptedShell?.contents ?? await fs.readFile(shellFile, 'utf8'), { sourcePath: shellFile });
await fs.writeFile(path.join(dir, 'shell.ts'), absoluteImports(shell, shellFile));
await fs.writeFile(path.join(dir, 'canvas.ts'), `let state:any={canvasId:null,nodes:[]};
const listeners=new Set<()=>void>();
export default {getState:()=>state,setState(patch:any){state={...state,...patch};for(const listener of [...listeners])listener();},subscribe(listener:()=>void){listeners.add(listener);return()=>listeners.delete(listener);}};`);
await fs.writeFile(path.join(dir, 'recognizer.ts'), `
import {isReferencePick,pointerModifiersOf} from '@local-creative-os/web-gen2';
import {composerInputKey} from ${spec('lcos/huabu/apps/web/src/lcos/composer/composerInputJourney.ts')};
import {draftReferenceUnavailableReason,snapshotDraftReference} from ${spec('lcos/huabu/apps/web/src/lcos/composer/referenceSnapshot.ts')};
import {sameCanvasDropNode,snapshotCanvasDropNodes} from ${spec('lcos/huabu/apps/web/src/lcos/drop/nativeCanvasDropGeometry.ts')};
import {useLcosReferenceStore} from ${spec('lcos/huabu/apps/web/src/lcos/lcosReferenceState.ts')};
import {referencePickOwnerKey} from ${spec('lcos/huabu/apps/web/src/lcos/referencePickOwnership.ts')};
import {markReferencePickCompleted} from ${spec('lcos/huabu/apps/web/src/lcos/referenceClickSuppressor.ts')};
import {useLcosShellStore} from './shell';
import useCanvasStore from './canvas';
type PointerRecognizer<A,B>=any;type CanvasPointerRouterContext=any;type CanvasDropNode=any;type LcosNodeEntityRef=any;
type NativeReferencePickPreparation=(input:any)=>Promise<any>;type NativeReferencePickRuntime=any;
const prepareNativeReferencePick=async()=>{throw Error('Default producer must not run in this transport-isolated test');};
const nodeIdAtScreenPoint=()=>{globalThis.__REFERENCE_PICK_FIXTURE__.legacyHits++;return null;};
const toast=(...args:any[])=>globalThis.__REFERENCE_PICK_FIXTURE__.legacyToasts.push(args);
${originalFunction}
`);
await fs.writeFile(path.join(dir, 'entry.ts'), `export {createReferencePickRecognizer} from './recognizer';
export {useLcosShellStore} from './shell';export {default as canvasStore} from './canvas';
export {useLcosReferenceStore} from ${spec('lcos/huabu/apps/web/src/lcos/lcosReferenceState.ts')};
export {referencePickOwnerKey} from ${spec('lcos/huabu/apps/web/src/lcos/referencePickOwnership.ts')};
export {composerInputKey} from ${spec('lcos/huabu/apps/web/src/lcos/composer/composerInputJourney.ts')};
export {clearReferenceTrailingClick,handleReferenceClickSuppression} from ${spec('lcos/huabu/apps/web/src/lcos/referenceClickSuppressor.ts')};`);
await buildPilotEntry(path.relative(root, path.join(dir, 'entry.ts')), path.join(dir, 'entry.mjs'), 'node');
const { createReferencePickRecognizer, useLcosShellStore: S, useLcosReferenceStore: R, canvasStore: C,
  composerInputKey, referencePickOwnerKey, clearReferenceTrailingClick, handleReferenceClickSuppression } = await import(pathToFileURL(path.join(dir, 'entry.mjs')));
globalThis.__REFERENCE_PICK_FIXTURE__ = { legacyHits: 0, legacyToasts: [] };
const realFetch = globalThis.fetch;
globalThis.fetch = () => { report.networkCalls++; throw Error('No network allowed by this source-level test.'); };
const clone = value => structuredClone(value);
const tick = () => new Promise(resolve => setImmediate(resolve));
const until = async check => { for (let i = 0; i < 50; i++) { if (check()) return; await tick(); } assert.ok(check(), 'Original queued operation did not settle.'); };
const deferred = () => { let resolve, reject; return { promise: new Promise((a, b) => { resolve = a; reject = b; }), resolve: value => resolve(value), reject: error => reject(error) }; };
const ctx = { interactivityLocked: false, explicitToolActive: false };
let serial = 0;
const refs = () => clone(R.getState().orderedNodeReferences());
const exact = (id = 'source', revisionId = 'revision-old') => ({ entityType: 'artifact', entityId: 'artifact-' + id,
  artifactViewId: 'view-' + id, revisionId, mimeType: 'text/plain' });
function event(extra = {}) {
  return { pointerId: 1, pointerType: 'mouse', button: 0, isPrimary: true, ctrlKey: true, metaKey: false,
    shiftKey: false, altKey: false, clientX: 120, clientY: 100, target: { closest: () => null }, prevented: 0, stopped: 0,
    preventDefault() { this.prevented++; }, stopPropagation() { this.stopped++; }, ...extra };
}
function fixture({ bound = true, explicit = false, intent = 'continue' } = {}) {
  const projectId = 'original-pick-' + (++serial), canvasId = 'canvas-' + serial;
  const target = { nodeId: 'receiver', title: '现有原输入', intent, anchor: { x: 0, y: 0, width: 10, height: 10 },
    ...(intent === 'continue' ? { receiverConversationId: 'conversation', messageId: 'message', continuationOperationId: 'operation' } : {}) };
  S.getState().setProject(projectId); R.getState().setProject(projectId);
  S.getState().openComposer(target); S.getState().setComposerPrompt('用户现有文字不改');
  S.getState().rememberComposerCaret({ projectId, targetKey: composerInputKey(S.getState().composerTarget), text: S.getState().composerPrompt, start: 2, end: 5 });
  const nodes = [{ id: 'source', type: 'text', position: { x: 120, y: 100 }, selected: false, data: { content: '真实原正文' } },
    { id: 'selected', type: 'text', position: { x: 400, y: 150 }, selected: true, data: { content: '既有选择' } }];
  C.setState({ canvasId, nodes });
  const owner = referencePickOwnerKey(projectId, S.getState().composerTarget);
  if (explicit) R.getState().setReferencePickOwner(owner);
  if (bound) R.getState().registerNodeEntity('source', exact());
  let live = true, generation = {}, hit = 'source', unavailable;
  const listeners = new Set(), notices = [], calls = [], captures = [];
  let prepare = async input => { const reference = exact(input.source.entityId); R.getState().registerNodeEntity(input.source.entityId, reference); return reference; };
  const runtime = {
    nodeIdAtScreenPoint: e => { captures.push({ x: e.clientX, y: e.clientY, target: e.target }); return hit; },
    captureCurrent: () => { const captured = generation; return () => live && captured === generation; },
    unavailableReason: (id, reference) => typeof unavailable === 'function' ? unavailable(id, reference) : unavailable,
    notice: (message, options) => notices.push({ message, options }),
    subscribeCurrent: listener => { listeners.add(listener); return () => listeners.delete(listener); },
  };
  const recognizer = createReferencePickRecognizer(input => { calls.push(input); return prepare(input); }, runtime);
  const readProtected = () => clone({ nodes: C.getState().nodes, prompt: S.getState().composerPrompt,
    caret: S.getState().composerCaret, target: S.getState().composerTarget });
  const click = (extra = {}, context = ctx) => { const down = event(extra); if (!recognizer.canClaim(down, context)) return 'unclaimed';
    const action = recognizer.onDown(down, context); if (action === 'claim') recognizer.onUp(event(extra), context); return action; };
  return { projectId, canvasId, target, owner, nodes, runtime, recognizer, notices, calls, captures, click, readProtected,
    setHit: value => { hit = value; }, setUnavailable: value => { unavailable = value; }, setPrepare: value => { prepare = value; },
    invalidate: () => { live = false; for (const listener of [...listeners]) listener(); },
    replaceApi: () => { generation = {}; for (const listener of [...listeners]) listener(); }, subscriberCount: () => listeners.size };
}
function begin(f, extra = {}) { const down = event(extra); assert.equal(f.recognizer.canClaim(down, ctx), true); assert.equal(f.recognizer.onDown(down, ctx), 'claim'); return down; }
function finish(f, extra = {}) { f.recognizer.onUp(event(extra), ctx); }
try {
  for (const [name, extra, context, expected] of [
    ['plain left', { ctrlKey: false }, ctx, false], ['Ctrl', {}, ctx, true], ['Command', { ctrlKey: false, metaKey: true }, ctx, true],
    ['Shift wins', { shiftKey: true }, ctx, false], ['Shift+Command wins', { ctrlKey: false, metaKey: true, shiftKey: true }, ctx, false],
    ['original Ctrl+Alt grammar', { altKey: true }, ctx, true], ['Alt only', { ctrlKey: false, altKey: true }, ctx, false],
    ['touch', { pointerType: 'touch' }, ctx, false], ['pen', { pointerType: 'pen' }, ctx, false], ['right button', { button: 2 }, ctx, false],
    ['secondary pointer', { isPrimary: false }, ctx, false], ['tool active', {}, { ...ctx, explicitToolActive: true }, false],
    ['interactivity locked', {}, { ...ctx, interactivityLocked: true }, false],
  ]) { const f = fixture(); assert.equal(f.recognizer.canClaim(event(extra), context), expected, name); assert.equal(refs().length, 0); }
  for (const [extra, expected] of [[{ ctrlKey: false }, true], [{ ctrlKey: false, altKey: true }, false], [{ shiftKey: true }, false]]) {
    const f = fixture({ explicit: true }); assert.equal(f.recognizer.canClaim(event(extra), ctx), expected);
  }
  {
    const f = fixture({ explicit: true });
    S.getState().openComposer({ ...f.target, nodeId: 'another-input' });
    assert.equal(f.recognizer.canClaim(event({ ctrlKey: false }), ctx), false, 'An old input pick owner cannot capture the new input plain click.');
  }
  report.cases.push('Actual original gesture grammar retained: Ctrl/Command or this exact input pick mode; Shift remains selection, Alt without Ctrl/Command, touch, pen, secondary/right button and active tools pass. Ctrl+Alt remains the original Ctrl grammar.');
  for (const kind of ['no-hit', 'interactive-descendant']) {
    const f = fixture(), before = f.readProtected();
    if (kind === 'no-hit') f.setHit(undefined);
    const down = event(kind === 'interactive-descendant' ? { target: { closest: () => ({ tagName: 'BUTTON' }) } } : {});
    assert.equal(f.recognizer.onDown(down, ctx), 'pass'); assert.deepEqual(f.readProtected(), before); assert.equal(refs().length, 0); assert.equal(down.prevented, 0);
  }
  report.cases.push('No visible hit and original button/editor/handle descendant exclusions pass without changing selection, input or draft. Browser occlusion/current-wrapper checks remain adapter coverage, not claimed here.');
  {
    const f = fixture(), before = f.readProtected(), down = begin(f);
    R.getState().registerNodeEntity('source', exact('source', 'revision-new'));
    finish(f); assert.equal(f.calls.length, 0); assert.deepEqual(refs(), [exact()]); assert.deepEqual(f.readProtected(), before);
    assert.equal(down.prevented, 1); assert.equal(down.stopped, 1);
    const click = { target: { closest: () => ({ dataset: { id: 'source' } }) }, prevented: 0, preventDefault() { this.prevented++; }, stopPropagation() {} };
    assert.equal(handleReferenceClickSuppression(click), true); assert.equal(handleReferenceClickSuppression(click), false); assert.equal(click.prevented, 1);
    f.click(); assert.equal(refs().length, 2, 'The new revision is a different exact draft reference.');
    f.click(); assert.deepEqual(refs(), [exact()], 'Toggling only the later exact version retains the historical one.');
    report.cases.push('Registered release uses the exact View/Revision captured on press even when the cache refreshes. Original controller owns version-aware toggling; selection, prompt and caret survive. Only one matching trailing click is suppressed.');
  }
  for (const mode of ['drag', 'cancel', 'wrong-pointer', 'identity-changed', 'input-closed', 'api-changed', 'host-unmounted', 'unavailable']) {
    const f = fixture(), before = f.readProtected(); begin(f);
    if (mode === 'drag') f.recognizer.onMove(event({ clientX: 125 }), ctx);
    if (mode === 'cancel') f.recognizer.onCancel(event(), ctx);
    if (mode === 'wrong-pointer') { finish(f, { pointerId: 2 }); f.recognizer.onCancel(event(), ctx); }
    if (mode === 'identity-changed') R.getState().registerNodeEntity('source', exact('foreign'));
    if (mode === 'input-closed') S.getState().closeComposer();
    if (mode === 'api-changed') f.replaceApi();
    if (mode === 'host-unmounted') f.invalidate();
    if (mode === 'unavailable') f.setUnavailable('这项材料暂时无法引用，已有输入保留。');
    finish(f); assert.equal(refs().length, 0, mode); assert.equal(f.calls.length, 0, mode);
    assert.deepEqual(C.getState().nodes, before.nodes); assert.equal(S.getState().composerPrompt, before.prompt);
  }
  { const f = fixture(); begin(f); f.recognizer.onMove(event({ clientX: 124 }), ctx); finish(f); assert.equal(refs().length, 1, 'Exactly four pixels retains the original click slop.'); }
  report.cases.push('More-than-4px drag, pointer cancel/mismatch, changed material identity/input/API, unmount and explicit unavailability cannot admit a reference. Exactly 4px retains the original click slop. No selection or material mutation occurs.');
  {
    const f = fixture(), before = f.readProtected(), sending = R.getState().beginReferenceInputOperation(f.owner, 'sending');
    f.click(); assert.equal(refs().length, 0); assert.equal(f.calls.length, 0); assert.match(f.notices.at(-1).message, /发送/);
    R.getState().finishReferenceInputOperation(sending); f.click(); assert.equal(refs().length, 1); assert.deepEqual(f.readProtected(), before);
  }
  {
    const f = fixture({ explicit: true }); begin(f, { ctrlKey: false }); R.getState().setReferencePickOwner(null); finish(f, { ctrlKey: false });
    assert.equal(refs().length, 0); assert.match(f.notices.at(-1).message, /改变|取消/);
  }
  report.cases.push('Sending freezes reference mutation through the original owner token and reports via the native notice port; finishing permits a later user pick. Leaving explicit pick mode before release does not write.');
  {
    const f = fixture({ bound: false }), pending = deferred(), before = f.readProtected();
    f.setPrepare(async input => { await pending.promise; const reference = exact(); R.getState().registerNodeEntity('source', reference); return reference; });
    begin(f); assert.equal(f.calls.length, 0); finish(f); await until(() => f.calls.length === 1);
    assert.equal(refs().length, 0); assert.equal(R.getState().referenceInputOperations.size, 1); f.click(); assert.equal(f.calls.length, 1);
    assert.match(f.notices.at(-1).message, /准备/); pending.resolve(); await until(() => R.getState().referenceInputOperations.size === 0);
    assert.deepEqual(refs(), [exact()]); assert.deepEqual(f.readProtected(), before); assert.equal(f.subscriberCount(), 0);
    report.cases.push('Native source preparation begins only after release. Pending reference is never inserted as a placeholder; repeated click starts no duplicate preparation, then exact confirmed reference is admitted and all operation/subscription resources release.');
  }
  {
    const f = fixture({ bound: false }), pending = deferred();
    C.setState({ nodes: [...C.getState().nodes, { id: 'second', type: 'text', position: { x: 600, y: 100 }, data: { content: '第二份正文' } }] });
    R.getState().registerNodeEntity('second', exact('second'));
    f.setPrepare(async () => { await pending.promise; const reference = exact(); R.getState().registerNodeEntity('source', reference); return reference; });
    f.click(); await until(() => f.calls.length === 1); f.setHit('second'); f.click();
    assert.equal(refs().length, 0); assert.equal(R.getState().referenceInputOperations.size, 2);
    R.getState().registerNodeEntity('second', exact('second', 'revision-new')); pending.resolve();
    await until(() => R.getState().referenceInputOperations.size === 0);
    assert.deepEqual(refs(), [exact(), exact('second')]); assert.equal(f.subscriberCount(), 0);
    report.cases.push('A slow first native material and a later registered material preserve actual click order, including the registered material exact version captured before cache refresh; no queued placeholder or latest-version fallback.');
  }
  {
    const f = fixture({ bound: false }), pending = deferred();
    C.setState({ nodes: [...C.getState().nodes, { id: 'second', type: 'text', position: { x: 600, y: 100 }, data: { content: '第二份正文' } }] });
    R.getState().registerNodeEntity('second', exact('second'));
    f.setPrepare(async () => { await pending.promise; return exact(); });
    f.click(); await until(() => f.calls.length === 1); f.setHit('second'); f.click();
    assert.equal(R.getState().referenceInputOperations.size, 2); f.replaceApi(); pending.resolve();
    await until(() => R.getState().referenceInputOperations.size === 0 && f.subscriberCount() === 0);
    assert.equal(refs().length, 0); assert.equal(f.calls.length, 1); assert.equal(f.calls[0].signal.aborted, true);
    report.cases.push('An API owner change cancels both a pending native preparation and a registered reference waiting behind it. The host lifetime guard applies to the whole original queue, not just the producer.');
  }
  for (const change of ['message', 'operation', 'receiver', 'input', 'close', 'canvas', 'project', 'api', 'unmount', 'sending', 'source-content']) {
    const f = fixture({ bound: false }), pending = deferred(); let prepareCurrent;
    f.setPrepare(async input => { prepareCurrent = input; await pending.promise; return exact(); });
    f.click(); await until(() => f.calls.length === 1);
    let token;
    if (change === 'message') S.setState({ composerTarget: { ...S.getState().composerTarget, messageId: 'new-message' } });
    if (change === 'operation') S.setState({ composerTarget: { ...S.getState().composerTarget, continuationOperationId: 'new-operation' } });
    if (change === 'receiver') S.getState().openComposer({ ...f.target, receiverConversationId: 'new-receiver' });
    if (change === 'input') S.getState().openComposer({ ...f.target, nodeId: 'another-input' });
    if (change === 'close') S.getState().closeComposer();
    if (change === 'canvas') C.setState({ canvasId: 'different-canvas' });
    if (change === 'project') { S.getState().setProject('another-project-' + serial); R.getState().setProject('another-project-' + serial); }
    if (change === 'api') f.replaceApi();
    if (change === 'unmount') f.invalidate();
    if (change === 'sending') token = R.getState().beginReferenceInputOperation(f.owner, 'sending');
    if (change === 'source-content') { C.setState({ nodes: C.getState().nodes.map(node => node.id === 'source' ? { ...node, data: { ...node.data, content: '用户修改了原正文' } } : node) }); f.setUnavailable('原内容已改变，本次点取已取消。'); }
    const current = f.readProtected(), currentRefs = refs(); pending.resolve();
    await until(() => [...R.getState().referenceInputOperations.values()].every(operation => operation.kind !== 'preparing') && f.subscriberCount() === 0);
    assert.deepEqual(f.readProtected(), current, change); assert.deepEqual(refs(), currentRefs, change); assert.equal(f.subscriberCount(), 0, change);
    if (change !== 'source-content') assert.equal(prepareCurrent.signal.aborted, true, change + ' invalidates the original AbortSignal');
    if (token) R.getState().finishReferenceInputOperation(token);
    assert.ok(f.notices.length, change + ' is reported at the native notice outlet');
  }
  report.cases.push('Delayed preparation after input/message/continuation operation/receiver/close/project/Canvas/API/unmount/sending/source changes cannot alter the current draft, text, caret or selection. Actual queue releases preparing tokens and host subscription, and current owner changes abort the original signal.');
  for (const blockedPhase of ['before-prepare', 'after-prepare', 'queued-bound']) {
    const f = fixture({ bound: false }), pending = deferred();
    f.setPrepare(async () => { await pending.promise; const reference = exact(); R.getState().registerNodeEntity('source', reference); return reference; });
    if (blockedPhase === 'before-prepare') { f.setUnavailable('材料身份尚未确认，当前输入保留。'); f.click(); assert.equal(f.calls.length, 0); }
    else {
      f.click(); await until(() => f.calls.length === 1);
      if (blockedPhase === 'queued-bound') {
        C.setState({ nodes: [...C.getState().nodes, { id: 'second', type: 'text', position: { x: 600, y: 100 }, data: { content: '第二份正文' } }] });
        R.getState().registerNodeEntity('second', exact('second')); f.setHit('second'); f.click();
        f.setUnavailable(id => id === 'second' ? '这项材料暂时无法引用。' : undefined);
      } else f.setUnavailable('材料身份已改变，当前输入保留。');
      pending.resolve(); await until(() => R.getState().referenceInputOperations.size === 0);
      assert.equal(refs().length, blockedPhase === 'queued-bound' ? 1 : 0);
    }
    assert.ok(f.notices.length); assert.equal(f.subscriberCount(), 0);
  }
  report.cases.push('Native unavailability is checked before preparation, after late preparation and again for a queued registered material. Failed checks retain the current input and route user feedback to the native original notice rather than the unmounted legacy Toast store.');
  {
    const f = fixture({ bound: false }); f.setPrepare(async () => { throw Error('材料读取暂时不可用，已有输入保留。'); });
    f.click(); await until(() => f.calls.length === 1 && R.getState().referenceInputOperations.size === 0);
    assert.equal(refs().length, 0); assert.match(f.notices.at(-1).message, /材料读取暂时不可用/); assert.equal(f.subscriberCount(), 0);
    f.setPrepare(async input => { const reference = exact(); R.getState().registerNodeEntity(input.source.entityId, reference); return reference; });
    f.click(); await until(() => R.getState().referenceInputOperations.size === 0 && refs().length === 1);
    report.cases.push('A rejected preparation uses the supplied native notice, releases the queue and permits a later deliberate pick to succeed. No automatic retry or producer duplication.');
  }
  assert.equal(globalThis.__REFERENCE_PICK_FIXTURE__.legacyHits, 0, 'Runtime hit port must replace the global all-canvas bbox fallback.');
  assert.deepEqual(globalThis.__REFERENCE_PICK_FIXTURE__.legacyToasts, [], 'Every original recognizer notice must reach the native notice port.');
  assert.equal(report.networkCalls, 0);
  report.passed = true;
} catch (error) {
  report.error = { name: error.name, message: error.message, stack: error.stack };
  process.exitCode = 1;
} finally {
  clearReferenceTrailingClick();
  globalThis.fetch = realFetch;
  delete globalThis.__REFERENCE_PICK_FIXTURE__;
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, cases: report.cases.length, output, error: report.error?.message }));
}
