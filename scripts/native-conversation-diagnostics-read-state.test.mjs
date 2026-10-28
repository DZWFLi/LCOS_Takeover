import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { currentGen2Root } from '../lab/current-gen2-resources.mjs';
import { transformNativeContinuationReadState, nativeChatSourceTransforms, withNativeChatSourceTransforms } from '../lab/native-chat-owner-transform.mjs';

const root = process.cwd(), dependency = createRequire(path.join(currentGen2Root, 'package.json'));
const ts = dependency('typescript'), web = createRequire(path.join(currentGen2Root, 'huabu/apps/web/package.json'));
const React = web('react'), { renderToStaticMarkup } = web('react-dom/server');
const relative = 'lcos/huabu/apps/web/src/lcos/composer/useComposerContinuation.ts';
const original = await fs.readFile(relative, 'utf8'), transformed = transformNativeContinuationReadState(original);
const checks = [];
function parse(text, name = 'actual.tsx') { const file = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX); assert.equal(file.parseDiagnostics.length, 0); return file; }
function declaration(file, name) {
  const nodes = file.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === name
    || ts.isVariableStatement(node) && node.declarationList.declarations.some(item => item.name.getText(file) === name));
  assert.equal(nodes.length, 1, 'one actual declaration: ' + name); return nodes[0].getText(file).replace(/^export\s+/, '');
}
const compile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, jsx: ts.JsxEmit.React } }).outputText;
assert.equal(nativeChatSourceTransforms[relative], transformNativeContinuationReadState);
assert.equal(withNativeChatSourceTransforms({})[relative](original), transformed, 'the existing build composition applies this actual source bridge');
assert.equal(transformNativeContinuationReadState(transformed), transformed);
assert.throws(() => transformNativeContinuationReadState(original.replace("const enabled = open && target?.intent === 'continue';", 'const enabled = false;')), /diagnostic seam changed/);
const hookFile = parse(transformed), hookCode = compile(declaration(hookFile, 'useComposerContinuation'));
const selectorFile = parse(await fs.readFile('lcos/huabu/apps/web/src/lcos/composer/confirmedConversationOperation.ts', 'utf8'));
const selectConfirmedSendOperation = new Function(compile(declaration(selectorFile, 'selectConfirmedSendOperation')) + ';return selectConfirmedSendOperation;')();
const visibilitySource = await fs.readFile('lab/pilot/native-conversation-recovery-visibility.ts', 'utf8');
const visibilityExports = {}; new Function('exports', ts.transpileModule(visibilitySource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText)(visibilityExports);
checks.push('existing build source-transform registration supplies the typed diagnostic state; changed source seams fail explicitly instead of manufacturing ready');
const tick = () => new Promise(resolve => setImmediate(resolve));
const sameDeps = (a, b) => !!a && !!b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
function hooksRunner(create) {
  const cells = []; let cursor = 0, pending = false, mounted = true, effects = [], args, result;
  const hooks = {
    useState(initial) { const index = cursor++; if (!(index in cells)) cells[index] = { value: typeof initial === 'function' ? initial() : initial };
      return [cells[index].value, update => { if (!mounted) throw Error('setState after unmount'); const value = typeof update === 'function' ? update(cells[index].value) : update;
        if (!Object.is(value, cells[index].value)) { cells[index].value = value; pending = true; } }]; },
    useRef(initial) { const index = cursor++; if (!(index in cells)) cells[index] = { value: { current: initial } }; return cells[index].value; },
    useMemo(callback, deps) { const index = cursor++; if (!cells[index] || !sameDeps(cells[index].deps, deps)) cells[index] = { deps, value: callback() }; return cells[index].value; },
    useCallback(callback, deps) { return hooks.useMemo(() => callback, deps); },
    useEffect(callback, deps) { const index = cursor++, previous = cells[index]; if (!previous || !sameDeps(previous.deps, deps)) {
      cells[index] = { deps, cleanup: previous?.cleanup }; effects.push(() => { cells[index].cleanup?.(); cells[index].cleanup = callback(); }); } },
  };
  const fn = create(hooks);
  const flush = () => { let turns = 0; do { assert.ok(++turns < 30, 'controlled hook render converges'); pending = false; cursor = 0; result = fn(...args);
    for (const effect of effects.splice(0)) effect(); } while (pending); return result; };
  return { render(...next) { args = next; return flush(); }, flush, get value() { return result; },
    unmount() { mounted = false; for (const cell of cells) cell?.cleanup?.(); effects = []; } };
}
const operation = (id = 'op-c', conversationId = 'c') => ({ operationId: id, projectId: 'p', connectedConversationId: conversationId, requestConnectedConversationId: conversationId,
  mode: 'continue_existing', status: 'attaching', cancel: 'none', steps: { external_create: 'confirmed', core_bind: 'confirmed', attach: 'not_started', projection: 'not_started' },
  externalEvidence: { externalSessionId: 'controlled-provider-session' }, allowedActions: [{ action: 'cancel_request', requiresFreshRead: true }] });
function continuationHarness(canSend = false) {
  const reads = [], prepared = [], refreshed = [], watches = [];
  const projectionById = new Map(['c', 'other', 'next'].map(id => [id, { status: 'ready', projection: { projectId: 'p', conversationId: id, capabilities: { canSend } } }]));
  const runner = hooksRunner(hooks => {
    const env = { ...hooks, CoreCollaborationClient: class { readDiagnostics(projectId, conversationId, signal) {
      return new Promise((resolve, reject) => reads.push({ projectId, conversationId, signal, resolve, reject })); } },
      createLcosCoreSession: () => ({ http: {} }), useCollaborationSession: (projectId, conversationId) => { watches.push([projectId, conversationId]); return projectionById.get(conversationId); },
      useCollaborationSessionStore: { getState: () => ({ refresh: (...args) => { refreshed.push(args); return Promise.resolve(); } }) },
      useLcosShellStore: { getState: () => ({ prepareComposerContinuation: (...args) => prepared.push(args) }) }, selectConfirmedSendOperation };
    return new Function(...Object.keys(env), hookCode + ';return useComposerContinuation;')(...Object.values(env));
  });
  return { runner, reads, prepared, refreshed, watches, projectionById };
}
const unrelated = { nodeId: 'another-task', intent: 'delegate', receiverConversationId: 'other' };
const reader = continuationHarness(false);
reader.projectionById.get('c').projection.capabilityReasons = { canSend: '会话已断开，请重新连接。' };
reader.runner.render('p', unrelated, true, 'c');
assert.equal(reader.runner.value.blockedReason, '会话已断开，请重新连接。', 'Known disconnected reason is truthful even while the independent diagnostic read is loading');
assert.equal(reader.reads.length, 1); assert.equal(reader.reads[0].conversationId, 'c'); assert.equal(reader.runner.value.diagnosticsStatus, 'loading');
const originalOp = operation(); reader.reads[0].resolve({ conversationId: 'c', operations: [originalOp] }); await tick(); reader.runner.flush();
assert.equal(reader.runner.value.diagnosticsStatus, 'ready'); assert.equal(reader.runner.value.diagnostics.operations[0], originalOp);
assert.equal(reader.runner.value.error, false, 'canSend=false is not a diagnostic read error'); assert.equal(reader.prepared.length, 0);
reader.runner.value.retry(); reader.runner.flush(); assert.equal(reader.runner.value.diagnosticsStatus, 'loading'); assert.deepEqual(reader.refreshed, [['p', 'c']]);
reader.reads[1].resolve(undefined); await tick(); reader.runner.flush(); assert.equal(reader.runner.value.diagnosticsStatus, 'error'); assert.equal(reader.runner.value.diagnostics, undefined); assert.equal(reader.runner.value.blockedReason, '暂时无法读取会话状态，请重试', 'Actual read error/retry takes precedence over known disconnect');
reader.runner.value.retry(); reader.runner.flush(); reader.reads[2].resolve({ conversationId: 'c', operations: [] }); await tick(); reader.runner.flush();
assert.equal(reader.runner.value.diagnosticsStatus, 'ready'); assert.deepEqual(reader.runner.value.diagnostics.operations, []); assert.equal(reader.prepared.length, 0); reader.runner.unmount();
checks.push('disconnected canonical read ignores an unrelated Composer target, exposes loading/error/true-ready-empty distinctly, keeps original retry and makes zero Composer prepare requests');

for (const canSend of [false, true]) {
  const originalPath = continuationHarness(canSend), target = { nodeId: 'conversation:c', intent: 'continue', receiverConversationId: 'c' };
  originalPath.runner.render('p', target, true); originalPath.reads[0].resolve({ conversationId: 'c', operations: [originalOp] }); await tick(); originalPath.runner.flush();
  assert.equal(originalPath.prepared.length, canSend ? 1 : 0); if (canSend) assert.equal(originalPath.prepared[0][2], originalOp.operationId); originalPath.runner.unmount();
}
checks.push('unchanged three-argument Composer still prepares the original confirmed operation only when canSend=true; read-only viewing does not relax send admission');

const trulyLoading = continuationHarness(true);
trulyLoading.runner.render('p', null, true, 'c'); assert.equal(trulyLoading.runner.value.blockedReason, '正在读取会话状态…');
trulyLoading.reads[0].resolve({ conversationId: 'c', operations: [] }); await tick(); trulyLoading.runner.flush();
assert.equal(trulyLoading.runner.value.blockedReason, '当前会话需要先连接或恢复'); assert.equal(trulyLoading.prepared.length, 0); trulyLoading.runner.unmount();
const projectionLoading = continuationHarness(false); projectionLoading.projectionById.set('c', { status: 'loading' });
projectionLoading.runner.render('p', null, true, 'c'); assert.equal(projectionLoading.runner.value.blockedReason, '正在读取会话状态…');
projectionLoading.reads[0].resolve({ conversationId: 'c', operations: [] }); await tick(); projectionLoading.runner.flush();
assert.equal(projectionLoading.runner.value.blockedReason, '正在读取会话状态…', 'A missing product projection is still reading even after diagnostics settle');
assert.equal(projectionLoading.prepared.length, 0); projectionLoading.runner.unmount();
assert.throws(() => transformNativeContinuationReadState(original.replace('正在准备当前会话…', 'unexpected original wording')), /diagnostic seam changed/);
checks.push('Actual transformed hook prioritizes a known disconnected product reason during diagnostic loading, labels truly unread state as reading, preserves error/retry precedence and original preparation admission, and fails explicitly if the original wording seam changes');

const switched = continuationHarness(false); switched.runner.render('p', null, true, 'c'); const oldRead = switched.reads[0];
switched.runner.render('p', null, true, 'next'); assert.equal(oldRead.signal.aborted, true); const nextRead = switched.reads[1];
oldRead.resolve({ conversationId: 'c', operations: [originalOp] }); await tick(); switched.runner.flush(); assert.equal(switched.runner.value.diagnosticsStatus, 'loading');
nextRead.resolve({ conversationId: 'next', operations: [operation('op-next', 'next')] }); await tick(); switched.runner.flush();
assert.equal(switched.runner.value.diagnostics.conversationId, 'next'); assert.equal(switched.runner.value.diagnostics.operations[0].operationId, 'op-next');
switched.runner.value.retry(); switched.runner.flush(); const closing = switched.reads.at(-1); switched.runner.unmount(); assert.equal(closing.signal.aborted, true);
closing.resolve({ conversationId: 'next', operations: [] }); await tick(); assert.equal(switched.prepared.length, 0);
const mismatched = continuationHarness(false); mismatched.runner.render('p', null, true, 'c'); mismatched.reads[0].resolve({ conversationId: 'foreign', operations: [originalOp] }); await tick(); mismatched.runner.flush();
assert.equal(mismatched.runner.value.diagnosticsStatus, 'error'); mismatched.runner.unmount();
checks.push('actual original AbortController/key checks discard late previous-conversation, closed-page and mismatched diagnostic responses without preparing or mixing records');

const uiSource = await fs.readFile('lab/pilot/native-chat-ui.tsx', 'utf8'), uiFile = parse(uiSource);
const alias = declaration(uiFile, 'useNativeConversationDiagnostics');
const content = declaration(uiFile, 'ConversationContent').replace('(import.meta.env as Record<string, unknown>).LCOS_NATIVE_CANVAS_TOOLS', 'false');
assert.ok(!content.includes('import.meta'), 'only the unrelated optional canvas-tools feature is disabled for this pure leaf');
const uiCode = compile(alias + '\n' + content);
const glythFile = parse(await fs.readFile('lab/pilot/native-glyth-actions.ts', 'utf8'));
const resolveNativeGlythProgressItemId = new Function(compile(declaration(glythFile, 'address') + '\n'
  + declaration(glythFile, 'resolveNativeGlythProgressItemId')) + ';return resolveNativeGlythProgressItemId;')();
const messageExports = {}; new Function('exports', ts.transpileModule(await fs.readFile('lab/pilot/native-chat-messages.ts', 'utf8'),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText)(messageExports);
let diagnostics = { diagnosticsStatus: 'loading', retry: () => { retries++; }, diagnostics: undefined }, retries = 0, parentRefresh = 0, confirmed = 0;
const pendingRecoveryReads = [];
const rafs = new Map(); let rafId = 0, focusCount = 0, scrollCount = 0, lastAfter, lastTree, lastHtml = '';
const focusedElements = [], scrolledElements = [], selectorQueries = [];
const focusable = { focus() { focusCount++; focusedElements.push('original-request-control'); } };
const makeElement = (id, ownFocus = false) => ({ isConnected: true, dataset: {}, matches: () => false,
  querySelector: () => ownFocus ? null : focusable,
  focus() { focusCount++; focusedElements.push(id); },
  scrollIntoView() { scrollCount++; scrolledElements.push(id); } });
const element = makeElement('original-requests'), progressState = makeElement('progress-state', true);
let activityElements = [];
const frameRoot = { querySelector(selector) { selectorQueries.push(selector);
  if (selector === '[data-native-chat-progress-state]') return lastHtml.includes('data-native-chat-progress-state') ? progressState : null;
  if (selector === '[data-native-chat-activity]') return activityElements[0] ?? null;
  return element;
}, querySelectorAll(selector) { selectorQueries.push(selector); return selector === '[data-native-chat-activity-item]' ? activityElements : []; } };
const entry = { status: 'ready', timelineStatus: 'ready', timeline: [], projection: { schemaVersion: 1, projectId: 'p', conversationId: 'c',
  userState: 'ready', capabilities: { canSend: false, canCancel: false }, activity: {}, recentReturns: [] } };
function NativeMessages(props) { lastAfter = props.renderAfterMessages(); return React.createElement('main', null, lastAfter); }
function RecoverySection(props) { return React.createElement('div', { 'data-lcos-recovery-section': true, 'data-execution-target': props.conversationId },
  props.operations.flatMap(op => op.allowedActions.map(action => React.createElement('button', { key: action.action, 'data-lcos-recovery-action': action.action }, action.action)))); }
const ui = hooksRunner(hooks => {
  const env = { ...hooks, React, useComposerContinuation: (_p, _target, _open, owner) => { assert.equal(owner, currentProps.conversationId); return diagnostics; },
    useCollaborationSession: () => entry, useLcosShellStore: selector => selector({ composerTarget: unrelated }),
    createLcosCoreSession: () => ({ http: {} }), CoreCollaborationClient: class {}, useNativeComposerParts: () => undefined,
    refreshNativeRecoveredComposer: input => new Promise(resolve => pendingRecoveryReads.push({ input, resolve })),
    nativeConversationRecoveryOperations: visibilityExports.nativeConversationRecoveryOperations,
    nativeConversationRecoveryExecutionTarget: visibilityExports.nativeConversationRecoveryExecutionTarget,
    projectNativeChatMessages: messageExports.projectNativeChatMessages, resolveNativeGlythProgressItemId, RecoverySection,
    requestAnimationFrame: callback => { const id = ++rafId; rafs.set(id, callback); return id; }, cancelAnimationFrame: id => rafs.delete(id),
    document: { querySelector: selector => { assert.equal(selector, '[data-lcos-native-chat-frame]'); return frameRoot; }, querySelectorAll: () => [] }, useCanvasStore: { getState: () => ({ canvasId: 'main' }) } };
  return new Function(...Object.keys(env), uiCode + ';return ConversationContent;')(...Object.values(env));
});
let currentProps = { projectId: 'p', conversationId: 'c', NativeMessages, onRefresh: () => parentRefresh++, onDismissRequest() {}, onRecoveryConfirmed: () => confirmed++, requestedSection: { section: 'session-diagnostics', sequence: 1 } };
const render = () => { lastTree = ui.render(currentProps); lastHtml = renderToStaticMarkup(lastTree);
  activityElements = [...lastHtml.matchAll(/data-native-chat-activity-item="([^"]+)"/g)].map(([, id]) => {
    const node = makeElement('activity:' + id, true); node.dataset.nativeChatActivityItem = id; return node;
  }); return lastHtml;
};
const runFrames = () => { const callbacks = [...rafs.values()]; rafs.clear(); for (const callback of callbacks) callback(); };
const walk = (node, visit) => { if (Array.isArray(node)) { node.forEach(value => walk(value, visit)); return; } if (!React.isValidElement(node)) return; visit(node); walk(node.props.children, visit); };
let html = render(); assert.match(html, /data-native-chat-requests-state="loading"/); assert.match(html, /正在读取会话请求/); assert.ok(!html.includes('没有请求记录'));
for (const callback of [...rafs.values()]) callback(); rafs.clear(); assert.equal(focusCount, 1);
diagnostics = { diagnosticsStatus: 'error', retry: diagnostics.retry, diagnostics: undefined }; html = render();
assert.match(html, /role="alert"/); assert.match(html, /暂时无法读取会话请求/); assert.ok(!html.includes('没有请求记录'));
let retryButton; walk(lastAfter, node => { if (node.type === 'button' && node.props.onClick === diagnostics.retry) retryButton = node; });
assert.ok(retryButton); retryButton.props.onClick(); assert.equal(retries, 1); assert.equal(parentRefresh, 0, 'request retry belongs to the exact original diagnostic hook instance');
diagnostics = { ...diagnostics, diagnosticsStatus: 'ready', diagnostics: { conversationId: 'c', operations: [] } }; html = render();
assert.match(html, /这段会话还没有请求记录/); assert.ok(!html.includes('暂时无法读取'));
const records = Array.from({ length: 22 }, (_, index) => operation('op-' + index));
diagnostics = { ...diagnostics, diagnostics: { conversationId: 'c', operations: [...records, { ...operation('foreign'), projectId: 'other-project' }] } }; html = render();
assert.equal((html.match(/data-native-chat-operation=/g) ?? []).length, 22); assert.equal((html.match(/data-lcos-recovery-action="cancel_request"/g) ?? []).length, 22);
assert.equal((html.match(/data-execution-target="c"/g) ?? []).length, 22);
const passedOperations = []; let recoveryCallback; walk(lastAfter, node => { if (node.type === RecoverySection) { passedOperations.push(node.props.operations[0]); recoveryCallback ??= node.props.onRefreshed; } });
assert.deepEqual(passedOperations, records); records.forEach((record, index) => assert.equal(passedOperations[index].allowedActions, record.allowedActions));
assert.equal(rafs.size, 0, 'late read/error/retry results do not schedule repeated request focus'); assert.equal(focusCount, 1);
checks.push('actual ConversationContent TSX renders loading/error-local-retry/ready-empty/22 owned original requests and unchanged allowed actions, even with canSend=false; foreign records stay excluded and late reads do not steal focus');

const timelineRow = (itemId, kind, runId) => ({ schemaVersion: 1, itemId, kind, occurredAt: '2026-10-26T00:00:00Z', title: itemId, refs: { runId } });
entry.projection = { ...entry.projection, userState: 'working', activity: { activeRunId: 'current-run' } };
entry.timeline = [timelineRow('old-progress', 'progress', 'previous-run'), timelineRow('current-start', 'work_started', 'current-run'),
  timelineRow('current-last', 'progress', 'current-run'), timelineRow('other-last', 'progress', 'previous-run')];
currentProps = { ...currentProps, requestedSection: { section: 'view-progress', sequence: 10 } };
html = render(); assert.match(html, /data-native-chat-activity-item="current-last" data-native-chat-activity-run="current-run" tabindex="-1"/);
assert.ok(!html.includes('data-native-chat-progress-state')); runFrames();
assert.equal(scrolledElements.at(-1), 'activity:current-last'); assert.equal(focusedElements.at(-1), 'activity:current-last');
assert.ok(!selectorQueries.includes('[data-native-chat-activity]'), 'Actual focus code never falls back to the first historical activity');
entry.timeline = [timelineRow('old-only', 'progress', 'previous-run')];
currentProps = { ...currentProps, requestedSection: { section: 'view-progress', sequence: 11 } };
html = render(); assert.match(html, /当前任务还没有可显示的进展/); assert.match(html, /data-native-chat-activity-item="old-only"/);
runFrames(); assert.equal(scrolledElements.at(-1), 'progress-state'); assert.equal(focusedElements.at(-1), 'progress-state');
entry.projection = { ...entry.projection, activity: {} };
currentProps = { ...currentProps, requestedSection: { section: 'view-progress', sequence: 12 } };
html = render(); assert.match(html, /当前没有正在执行的任务/); runFrames(); assert.equal(focusedElements.at(-1), 'progress-state');
entry.timelineStatus = 'error'; currentProps = { ...currentProps, requestedSection: { section: 'view-progress', sequence: 13 } };
html = render(); assert.match(html, /data-native-chat-progress-state="error"/); assert.match(html, /暂时无法读取当前进展，已有对话保留/);
assert.match(html, /重新读取进展/); assert.ok(!html.includes('data-native-chat-activity-item')); runFrames(); assert.equal(scrolledElements.at(-1), 'progress-state');
let progressRetry; walk(lastTree, node => { if (node.type === 'button' && node.props.onClick === currentProps.onRefresh) progressRetry = node; });
assert.ok(progressRetry); progressRetry.props.onClick(); assert.equal(parentRefresh, 1); assert.equal(retries, 1, 'Progress retry keeps original session refresh instead of diagnostic retry');
entry.timelineStatus = 'ready'; entry.status = 'error'; currentProps = { ...currentProps, requestedSection: { section: 'view-progress', sequence: 14 } };
html = render(); assert.match(html, /data-native-chat-progress-state="error"/); runFrames(); assert.equal(focusedElements.at(-1), 'progress-state');
entry.status = 'loading'; currentProps = { ...currentProps, requestedSection: { section: 'view-progress', sequence: 15 } };
html = render(); assert.match(html, /正在打开/); assert.equal(rafs.size, 0, 'Loading entry does not focus an old section');
entry.status = 'ready'; entry.timeline = []; entry.projection = { ...entry.projection, userState: 'ready', activity: {} };
checks.push('Actual ConversationContent TSX plus actual pure progress resolver/message projector focus the last exact active-Run activity; old-only history focuses named empty state, no-Run shows named absence, timeline/session failures show named original refresh, and loading never jumps to stale rows');

recoveryCallback(originalOp); assert.equal(pendingRecoveryReads.length, 1);
currentProps = { ...currentProps, requestedSection: undefined }; html = render(); assert.equal((html.match(/data-native-chat-operation=/g) ?? []).length, 0);
assert.ok(!html.includes('data-native-chat-requests'), 'returning keeps the business attention view quiet for healthy journal entries');
const pendingOperation = { ...operation('actual-pending'), steps: { ...originalOp.steps, attach: 'pending' } };
diagnostics = { ...diagnostics, diagnostics: { conversationId: 'c', operations: [pendingOperation] } }; html = render(); assert.equal((html.match(/data-native-chat-operation=/g) ?? []).length, 1);
currentProps = { ...currentProps, requestedSection: { section: 'session-diagnostics', sequence: 2 } }; render(); assert.equal(rafs.size, 1);
currentProps = { ...currentProps, conversationId: 'next', requestedSection: { section: 'session-diagnostics', sequence: 3 } };
diagnostics = { ...diagnostics, diagnostics: { conversationId: 'next', operations: [] } }; render(); assert.equal(rafs.size, 1, 'old request RAF was cancelled before new page focus');
ui.unmount(); assert.equal(rafs.size, 0); assert.equal(pendingRecoveryReads[0].input.isCurrent(), false);
pendingRecoveryReads[0].resolve({ operation: originalOp, prepared: true }); await tick();
recoveryCallback(originalOp); assert.equal(pendingRecoveryReads.length, 1, 'a callback held after close cannot begin another read');
assert.equal(parentRefresh, 1, 'Only the explicit original progress retry refreshed; no stale recovery callback refresh'); assert.equal(confirmed, 0);
checks.push('default NeedsAttention semantics preserve actual pending work while quiet attaching history stays quiet; page change/close cancel old focus callbacks and never refresh or prepare another page');
// Execute the actual mounted panel effect/listener with its live original stores.
// No selection setter, window opener, prepare/recover/send or model port is supplied.
const descendants = (node, predicate) => { const rows = []; const visit = value => { if (predicate(value)) rows.push(value); ts.forEachChild(value, visit); }; visit(node); return rows; };
const currentInputEffects = descendants(uiFile, node => ts.isCallExpression(node) && node.expression.getText(uiFile) === 'useEffect'
  && ts.isArrowFunction(node.arguments[0]) && descendants(node.arguments[0], child => ts.isVariableDeclaration(child) && child.name.getText(uiFile) === 'showCurrentInput').length === 1);
assert.equal(currentInputEffects.length, 1, 'one original mounted current-input listener owner');
const journeyFile = parse(await fs.readFile('lcos/huabu/apps/web/src/lcos/composer/composerInputJourney.ts', 'utf8'));
const composerInputKey = new Function(compile(declaration(journeyFile, 'composerInputKey')) + ';return composerInputKey;')();
const originalInput = { nodeId: 'original-input-node', intent: 'continue', workspaceId: 'original-workspace', receiverConversationId: 'c', messageId: 'message-original', continuationOperationId: 'operation-original' };
const shellState = { projectId: 'p', composerOpen: true, composerTarget: originalInput, composerPrompt: '原输入保留' };
const canvasState = { canvasId: 'main' }, currentInputBus = new EventTarget(), inputRoutes = [], inputConversationRequests = [], inputSectionRequests = [], inputLibraryReleases = [];
const taskRouteRef = { current: { page: 'task', runId: 'actual-task' } }, selectedConversation = { id: 'same-selected-owner' };
const inputEnv = { window: currentInputBus, composerInputKey, useLcosShellStore: { getState: () => shellState }, useCanvasStore: { getState: () => canvasState },
  libraryTaskRoute: taskRouteRef, replaceLibraryOrigin: (...args) => inputLibraryReleases.push(args), nativeChatConversationRoute: { page: 'conversation' },
  setRoute: value => inputRoutes.push(value), setConversationRequest: value => inputConversationRequests.push(value), setSectionRequest: value => inputSectionRequests.push(value) };
const actualInputEffect = new Function(...Object.keys(inputEnv), compile('const actualInputEffect = ' + currentInputEffects[0].arguments[0].getText(uiFile) + ';')
  + ';return actualInputEffect;')(...Object.values(inputEnv));
const disposeCurrentInput = actualInputEffect();
const exactInput = { projectId: 'p', canvasId: 'main', inputKey: composerInputKey(originalInput), messageId: originalInput.messageId, continuationOperationId: originalInput.continuationOperationId };
const signalInput = detail => currentInputBus.dispatchEvent(new CustomEvent('lcos-native-show-current-input', { detail }));
const preservedInput = JSON.stringify(shellState), preservedSelection = JSON.stringify(selectedConversation);
for (const patch of [{ projectId: 'another-project' }, { canvasId: 'another-canvas' }, { inputKey: 'old-input' }, { messageId: 'old-message' }, { continuationOperationId: 'old-operation' }]) signalInput({ ...exactInput, ...patch });
assert.equal(inputRoutes.length, 0); assert.equal(inputLibraryReleases.length, 0); assert.equal(taskRouteRef.current.runId, 'actual-task');
shellState.composerOpen = false; signalInput(exactInput); shellState.composerOpen = true; assert.equal(inputRoutes.length, 0);
shellState.composerTarget = { ...originalInput, messageId: 'replacement-message' }; signalInput(exactInput); shellState.composerTarget = originalInput; assert.equal(inputRoutes.length, 0);
canvasState.canvasId = 'third-scene'; signalInput(exactInput); canvasState.canvasId = 'main'; assert.equal(inputRoutes.length, 0);
signalInput(exactInput); assert.deepEqual(inputRoutes, [{ page: 'conversation' }]); assert.deepEqual(inputConversationRequests, [undefined]); assert.deepEqual(inputSectionRequests, [undefined]);
assert.deepEqual(inputLibraryReleases, [[]]); assert.equal(taskRouteRef.current, undefined); assert.equal(JSON.stringify(shellState), preservedInput); assert.equal(JSON.stringify(selectedConversation), preservedSelection);
disposeCurrentInput(); signalInput(exactInput); assert.equal(inputRoutes.length, 1, 'original effect cleanup removes current-input listener');
checks.push('Actual NativeCoreChatPanel mounted listener accepts only the live project/canvas/inputKey/message/operation and open input, returns only the original conversation route, preserves draft/selection, rejects stale/replaced/closed owners, and unregisters on cleanup');

const out = path.join(root, 'output/健康恢复卡与断线续聊_20261023/请求读态专项_20261026.json');
const report = { passed: true, checks, scope: 'Actual lab source bridge, original transformed hook, pure owner/filter functions and actual ConversationContent TSX; controlled promises/effect order and React static rendering. No browser, Core/Host, model, send/recovery action, or full build.', coreWrites: 0, modelCalls: 0 };
await fs.writeFile(out, JSON.stringify(report, null, 2)); console.log(JSON.stringify({ ...report, report: out }, null, 2));


