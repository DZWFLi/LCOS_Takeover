import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildPilotEntry, installedRoot } from '../lab/pilot/build-pilot.mjs';
import { nativeTaskRouteSourceTransforms } from '../lab/native-task-route-source-transform.mjs';
import { withNativeChatSourceTransforms } from '../lab/native-chat-owner-transform.mjs';
import { createNativeUiSourceTransforms } from '../lab/native-ui-source-transforms.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ts = createRequire(path.join(installedRoot, 'package.json'))('typescript');
const files = Object.keys(nativeTaskRouteSourceTransforms);
const transformed = new Map();
const descend = (owner, predicate) => {
  const found = []; const visit = node => { if (predicate(node)) found.push(node); ts.forEachChild(node, visit); }; visit(owner); return found;
};
const parsed = (source, name) => {
  const file = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  assert.equal(file.parseDiagnostics.length, 0); return file;
};
const evaluate = (text, env) => {
  const code = ts.transpileModule('const evaluated = (' + text + ');', { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  return new Function(...Object.keys(env), code + '\nreturn evaluated;')(...Object.values(env));
};
const arrowForCall = (file, name) => {
  const call = descend(file, node => ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === name)[0];
  assert.ok(call, name); let parent = call.parent;
  while (parent && !ts.isArrowFunction(parent)) parent = parent.parent;
  assert.ok(parent); return parent.getText(file);
};
for (const relative of files) {
  const sourcePath = path.join(root, relative), source = await fs.readFile(sourcePath, 'utf8');
  const transform = nativeTaskRouteSourceTransforms[relative];
  const result = transform(source, { sourcePath });
  assert.equal(transform(result, { sourcePath }), result, 'same transformation does not duplicate handlers');
  assert.equal(await fs.readFile(sourcePath, 'utf8'), source, 'copied source remains untouched');
  assert.throws(() => transform(source, { sourcePath: path.join(root, 'lab/unrelated.tsx') }), /exact copied source/);
  if (relative.endsWith('RunWorkViewBody.tsx')) {
    assert.equal(/\.openWindow\(/.test(result), false, 'legacy Run retry selects the native task route');
    assert.equal((result.match(/\.openReader\(/g) ?? []).length, 1, 'existing result Reader delegate remains; shell owns native Viewer routing');
  } else if (!relative.endsWith('LcosActionArc.tsx')) assert.equal(/\.openWindow\(|\.openReader\(/.test(result), false, relative + ' has no old secondary window route');
  transformed.set(relative, { source, result, file: parsed(result, sourcePath) });
}
// Existing real source transforms run before the new routes; do not test only
// a hand-written facsimile that misses the actual build composition.
const composition = withNativeChatSourceTransforms(createNativeUiSourceTransforms({ nativeRailPilot: true }));
for (const relative of files) parsed(composition[relative](await fs.readFile(path.join(root, relative), 'utf8'), { sourcePath: path.join(root, relative) }), relative);
const composerPath = files.find(name => name.endsWith('LcosComposerHost.tsx'));
const finalComposer = parsed(composition[composerPath](await fs.readFile(path.join(root, composerPath), 'utf8'), { sourcePath: path.join(root, composerPath) }), composerPath);
const libraryEvent = descend(finalComposer, node => ts.isNewExpression(node) && node.expression.getText(finalComposer) === 'CustomEvent'
  && node.arguments?.[0].getText(finalComposer) === "'lcos-native-open-library'")[0];
assert.ok(libraryEvent); let libraryClick = libraryEvent.parent;
while (libraryClick && !ts.isArrowFunction(libraryClick)) libraryClick = libraryClick.parent;
const libraryEvents = [];
evaluate(libraryClick.getText(finalComposer), { rememberCaret() {}, composerTarget: { receiverConversationId: 'same-receiver' },
  projectId: 'project', inputKey: 'original-input-key', CustomEvent, window: { dispatchEvent: event => libraryEvents.push(event) } })();
assert.deepEqual(libraryEvents[0].detail, { projectId: 'project', composerOriginKey: 'original-input-key' }, 'native Library receives exact input ownership without an Assembly window');

const continuationEntry = transformed.get(files.find(name => name.endsWith('ConversationContinuationControls.tsx')));
const continuationClicks = descend(continuationEntry.file, node => ts.isCallExpression(node)
  && node.expression.getText(continuationEntry.file) === 'requestNativeConversationView').map(call => {
    let parent = call.parent; while (parent && !ts.isArrowFunction(parent)) parent = parent.parent;
    return parent.getText(continuationEntry.file);
  });
const requestRoutes = [];
for (const click of continuationClicks) evaluate(click, { projectId: 'project', conversationId: 'conversation',
  request: { intent: { operationId: 'original-operation' } }, requestNativeConversationView: target => requestRoutes.push(target) })();
assert.equal(requestRoutes.length, 2);
for (const target of requestRoutes) assert.deepEqual(target, { projectId: 'project', conversationId: 'conversation',
  section: 'recover-session', continuationOperationId: 'original-operation' });
const continuationOld = parsed(continuationEntry.source, 'old-continuation.tsx');
const submitBody = file => descend(file, node => ts.isVariableDeclaration(node) && node.name.getText(file) === 'submit')[0].initializer.getText(file);
assert.equal(submitBody(continuationEntry.file), submitBody(continuationOld), 'continuation producer/immutable snapshot/unknown handling unchanged');

const execution = transformed.get(files.find(name => name.endsWith('ExecutionNodeBody.tsx'))).file;
const routed = [];
const openExecution = evaluate(arrowForCall(execution, 'requestNativeTaskView'), {
  runId: 'exact-run', useLcosShellStore: { getState: () => ({ projectId: 'project' }) }, requestNativeTaskView: value => routed.push(value),
});
openExecution(); assert.deepEqual(routed.pop(), { projectId: 'project', runId: 'exact-run' });
assert.equal(evaluate(arrowForCall(execution, 'requestNativeTaskView'), { runId: undefined,
  useLcosShellStore: { getState: () => ({ projectId: 'project' }) }, requestNativeTaskView: value => routed.push(value) })(), undefined);
assert.equal(routed.length, 0, 'a result slot with no real Run cannot invent one');

const returns = transformed.get(files.find(name => name.endsWith('ArtifactReturnSection.tsx'))).file;
evaluate(arrowForCall(returns, 'requestNativeMaterialView'), {
  projectId: 'project', review: { artifactId: 'artifact', draftRevisionId: 'candidate', title: '候选结果', returnId: 'return' },
  conversationId: 'conversation', useLcosShellStore: { getState: () => ({ projectId: 'project', windows: [] }) },
  requestNativeMaterialView: value => routed.push(value),
})();
assert.deepEqual(routed.pop(), { projectId: 'project', artifactId: 'artifact', revisionId: 'candidate', title: '候选结果', returnId: 'return' });
const arcSource = transformed.get(files.find(name => name.endsWith('LcosActionArc.tsx')));
const arc = arcSource.file;
const arcDispatch = descend(arc, node => ts.isVariableDeclaration(node) && node.name.getText(arc) === 'dispatch')[0].initializer.getText(arc);
const arcFor = ref => evaluate(arcDispatch, { ref, node: { data: { label: '节点标题' } }, nodeId: 'exact-node',
  useLcosShellStore: { getState: () => ({ projectId: 'project', openWindow: () => { throw new Error('Old window must not open.'); } }) },
  useCanvasStore: { getState: () => ({}) }, cancelSectionFocus: { current: undefined }, setMoreOpen() {},
  requestNativeTaskView: value => routed.push(value), requestNativeConversationView: value => routed.push(value),
  requestNativeMaterialView: value => routed.push(value),
});
arcFor({ entityType: 'run', entityId: 'exact-run' })({ id: 'open' });
assert.deepEqual(routed.pop(), { projectId: 'project', runId: 'exact-run' });
arcFor({ entityType: 'result-slot', entityId: 'slot', descriptor: { execution: { runId: 'slot-real-run' } } })({ id: 'open' });
assert.equal(routed.pop().runId, 'slot-real-run');
arcFor({ entityType: 'conversation', entityId: 'exact-conversation' })({ id: 'review-result' });
assert.deepEqual(routed.pop(), { projectId: 'project', conversationId: 'exact-conversation', section: 'review-result' });
arcFor({ entityType: 'artifact', entityId: 'artifact', artifactViewId: 'view', descriptor: { presentedRevisionId: 'OLD', currentRevisionId: 'NEW' } })({ id: 'open' });
assert.deepEqual(routed.pop(), { projectId: 'project', artifactId: 'artifact', artifactViewId: 'view', revisionId: 'OLD', nodeId: 'exact-node', title: '阅读 · 节点标题' });
const oldArc = parsed(arcSource.source, 'old-arc.tsx');
const caseLabels = file => descend(file, node => ts.isCaseClause(node)).map(node => node.expression.getText(file));
assert.deepEqual(caseLabels(arc), caseLabels(oldArc), 'Arc command families are retained; only their secondary destinations change');
const oldReturn = transformed.get(files.find(name => name.endsWith('ArtifactReturnSection.tsx'))).source;
const oldReturnFile = parsed(oldReturn, 'old-return.tsx');
const getDecide = file => descend(file, node => ts.isVariableDeclaration(node) && node.name.getText(file) === 'decide')[0].initializer.getText(file);
assert.equal(getDecide(returns), getDecide(oldReturnFile), 'accept/reject/retry, CAS, receipt and verification controller remain byte-for-byte original');

const composer = transformed.get(files.find(name => name.endsWith('LcosComposerHost.tsx'))).file;
const inspect = descend(composer, node => ts.isVariableDeclaration(node) && node.name.getText(composer) === 'inspectReference')[0].initializer.getText(composer);
let graphReads = 0; const errors = [];
const inspectExact = evaluate(inspect, {
  inputKey: 'exact-input', projectId: 'project', rememberCaret() {}, inspectRequest: { current: undefined }, AbortController,
  session: { projects: { getProjectGraph: async () => { graphReads++; return { artifacts: [{ id: 'artifact', projectId: 'project', currentRevisionId: 'NEW-current' }],
    artifactViews: [{ id: 'view', artifactId: 'artifact', revisionId: 'NEW-view' }] }; } } },
  useLcosShellStore: { getState: () => ({ projectId: 'project', composerTarget: {} }) }, composerInputKey: () => 'exact-input',
  requestNativeMaterialView: value => routed.push(value), setState() {}, setErrorDetail: value => errors.push(value),
});
await inspectExact({ entityType: 'artifact', entityId: 'artifact', revisionId: 'OLD-pinned' }, '引用');
assert.equal(graphReads, 0); assert.equal(routed.pop().revisionId, 'OLD-pinned');
await inspectExact({ entityType: 'view', entityId: 'view', revisionId: 'OLD-pinned' }, '历史引用');
assert.equal(graphReads, 1); assert.deepEqual(routed.pop(), { projectId: 'project', artifactId: 'artifact', revisionId: 'OLD-pinned', title: '历史引用', composerOriginKey: 'exact-input', artifactViewId: 'view' });
assert.deepEqual(errors, []);
// Exercise the actual inline close expression and reference-pick handler.
const close = descend(composer, node => ts.isCallExpression(node) && node.expression.getText(composer) === 'useCloseOnEscape')[0];
const closeEnabled = close.arguments[0].getText(composer);
assert.equal(evaluate(`()=>(${closeEnabled})`, { inline: true, open: true, referencePickerOpen: false, picking: false })(), false);
assert.equal(evaluate(`()=>(${closeEnabled})`, { inline: false, open: true, referencePickerOpen: false, picking: false })(), true);
const pickEscape = descend(composer, node => ts.isArrowFunction(node) && node.parameters[0]?.name.getText(composer) === 'event'
  && node.getText(composer).includes('nativeChatHasHigherTransient()'))[0];
let pickEnded = 0, focus = 0, consumed = 0;
const escape = higher => evaluate(pickEscape.getText(composer), { inline: true, nativeChatHasHigherTransient: () => higher,
  useLcosReferenceStore: { getState: () => ({ setReferencePickOwner: () => pickEnded++ }) }, textareaRef: { current: { focus: () => focus++ } } });
const event = { key: 'Escape', defaultPrevented: false, preventDefault: () => consumed++, stopPropagation: () => consumed++ };
escape(true)(event); assert.equal(pickEnded, 0); assert.equal(consumed, 0, 'higher original library/dialog gets first Escape');
escape(false)(event); assert.equal(pickEnded, 1); assert.equal(focus, 1); assert.equal(consumed, 2);
escape(false)({ ...event, isComposing: true }); assert.equal(pickEnded, 1, 'Escape during IME composition does not cancel picking');

const chatSource = await fs.readFile(path.join(root, 'lab/pilot/native-chat-ui.tsx'), 'utf8');
assert.equal(chatSource.includes('RunWorkViewBody'), false, 'actual right rail no longer mounts a GN2 Run page');
const chatFile = parsed(chatSource, 'native-chat-ui.tsx');
const taskCaller = descend(chatFile, node => ts.isJsxSelfClosingElement(node) && node.tagName.getText(chatFile) === 'NativeTaskDetail');
assert.equal(taskCaller.length, 1, 'NativeTaskDetail is a product caller, not an unreferenced tested leaf');
const targetProp = taskCaller[0].attributes.properties.find(prop => prop.name?.getText(chatFile) === 'runId');
assert.equal(targetProp.initializer.expression.getText(chatFile), 'route.runId');
// Exercise the actual UI handlers: initial Stop only opens confirmation;
// confirm is the sole write path and an uncertain receipt permits reads only.
const declaration = name => descend(chatFile, node => ts.isVariableDeclaration(node) && node.name.getText(chatFile) === name)[0].initializer.getText(chatFile);
const stopButton = descend(chatFile, node => ts.isJsxOpeningElement(node) && node.attributes.properties.some(prop => prop.name?.getText(chatFile) === 'className'
  && prop.initializer?.getText(chatFile) === '"native-chat-stop"'))[0];
const initialStop = stopButton.attributes.properties.find(prop => prop.name?.getText(chatFile) === 'onClick').initializer.expression.getText(chatFile);
let confirmationRun;
evaluate(initialStop, { projection: { activity: { activeRunId: 'run-A' } }, setStopTarget: id => { confirmationRun = id; } })();
assert.equal(confirmationRun, 'run-A');
const stopCalls = [], notices = [], busy = { current: false }, scope = { current: 'project:conversation' };
let uncertain, refreshes = 0, rejectCancel;
const stopEnv = { stopTarget: 'run-A', projection: { activity: { activeRunId: 'run-A' }, capabilities: { canCancel: true } },
  stopBusy: busy, stopUnconfirmed: undefined, scope, client: {}, projectId: 'project', conversationId: 'conversation',
  setStopping() {}, setStopTarget() {}, setNotice: value => notices.push(value), setStopUnconfirmed: value => { uncertain = value; },
  onRefresh: () => refreshes++, cancelConversationRun: (...args) => { stopCalls.push(args); return new Promise((_resolve, reject) => { rejectCancel = reject; }); } };
const confirmStop = evaluate(declaration('stop'), stopEnv);
const firstStop = confirmStop(); await confirmStop(); assert.equal(stopCalls.length, 1, 'double confirm is synchronously guarded');
assert.equal(stopCalls[0][3], 'run-A'); rejectCancel(new Error('Synthetic unknown cancel result')); await firstStop;
assert.equal(uncertain, 'run-A'); assert.equal(busy.current, false);
await evaluate(declaration('stop'), { ...stopEnv, stopUnconfirmed: uncertain })(); assert.equal(stopCalls.length, 1);
await evaluate(declaration('stop'), { ...stopEnv, projection: { activity: { activeRunId: 'run-B' }, capabilities: { canCancel: true } } })();
assert.equal(stopCalls.length, 1, 'confirmation for an old Run does not cancel its replacement');
let verificationReads = 0;
const verifyEnv = { ...stopEnv, stopUnconfirmed: 'run-A', client: { readSession: async () => { verificationReads++;
  return { projectId: 'project', conversationId: 'conversation', activity: { activeRunId: 'run-A' }, capabilities: { canCancel: true } }; } } };
await evaluate(declaration('verifyStop'), verifyEnv)();
assert.equal(verificationReads, 1); assert.equal(stopCalls.length, 1); assert.equal(uncertain, 'run-A');
await evaluate(declaration('verifyStop'), { ...verifyEnv, client: { readSession: async () => ({ projectId: 'project', conversationId: 'conversation',
  activity: {}, capabilities: { canCancel: false } }) } })();
assert.equal(uncertain, undefined); assert.equal(stopCalls.length, 1); assert.equal(refreshes, 2);

const runtimeBase = path.join(root, '.runtime'); await fs.mkdir(runtimeBase, { recursive: true });
const runtime = await fs.mkdtemp(path.join(runtimeBase, 'native-task-route-test-'));
try {
  const bundle = path.join(runtime, 'route.mjs'); await buildPilotEntry('lab/pilot/native-task-route.ts', bundle, 'node');
  const module = await import(pathToFileURL(bundle));
  const conversation = module.nativeChatConversationRoute;
  const list = { page: 'tasks', returnTo: conversation };
  const first = module.nativeChatTaskRoute(list, 'first-run');
  assert.equal(module.nativeChatTaskRoute(first, 'first-run'), first, 'duplicate invocation does not grow return history');
  const retry = module.nativeChatTaskRoute(first, 'confirmed-retry-run');
  assert.equal(module.nativeChatBackRoute(retry), first); assert.equal(module.nativeChatBackRoute(first), list);
  assert.equal(module.nativeChatBackRoute(list), conversation);
  const events = []; const ports = { projectId: () => 'project', dispatch: event => { events.push([event.type, event.detail]); return true; } };
  assert.equal(module.requestNativeTaskView({ projectId: 'other', runId: 'run' }, ports), false);
  assert.equal(module.requestNativeTaskView({ projectId: 'project', runId: '' }, ports), false); assert.equal(events.length, 0);
  assert.equal(module.requestNativeTaskView({ projectId: 'project', runId: 'real-run' }, ports), true);
  assert.deepEqual(events[0], ['lcos-native-open-task', { projectId: 'project', runId: 'real-run' }]);
  events.length = 0; module.requestNativeConversationView({ projectId: 'project', conversationId: 'original-session' }, ports);
  assert.deepEqual(events[0], ['lcos-native-select-conversation', { projectId: 'project', conversationId: 'original-session' }]);
  assert.equal(events[1][0], 'lcos-native-open-conversation');
  events.length = 0;
  assert.equal(module.requestNativeConversationView({ projectId: 'project', conversationId: 'original-session', continuationOperationId: '' }, ports), false);
  assert.equal(events.length, 0);
  assert.equal(module.requestNativeConversationView({ projectId: 'project', conversationId: 'original-session', section: 'recover-session',
    continuationOperationId: 'original-operation', messageId: 'original-message' }, ports), true);
  assert.equal(events[0][1].continuationOperationId, 'original-operation'); assert.equal(events[0][1].messageId, 'original-message');
} finally {
  if (!path.resolve(runtime).startsWith(path.resolve(runtimeBase) + path.sep)) throw new Error('Unexpected test temp directory.');
  await fs.rm(runtime, { recursive: true, force: true });
}
console.log(JSON.stringify({ passed: true, covered: ['actual build transform composition', 'execution exact Run routing', 'candidate exact revision',
  'unchanged review controller and CAS', 'pinned View revision never Current', 'inline Escape leaves native transient owner',
  'task/retry/back identity', 'cross-project and missing identity refusal', 'nested continuation request/recovery preserves operation identity',
  'Stop confirmation, duplicate guard, stale Run refusal and read-only unknown verification'], modelExecuted: false, productionRuntimeChanged: false }, null, 2));
