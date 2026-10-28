import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { buildPilotEntry, installedRoot } from '../lab/pilot/build-pilot.mjs';
import { readCurrentGen2Resource } from '../lab/current-gen2-resources.mjs';
import { createNativeUiSourceTransforms } from '../lab/native-ui-source-transforms.mjs';
import { withNativeChatSourceTransforms } from '../lab/native-chat-owner-transform.mjs';
import { nativeMixedScopeComposerTransforms, withNativeMixedScopeComposerTransforms } from '../lab/native-mixed-scope-composer-transform.mjs';

const root = path.resolve(import.meta.dirname, '..'), ts = createRequire(path.join(installedRoot, 'package.json'))('typescript');
const runtimeRoot = path.join(root, '.runtime'); await fs.mkdir(runtimeRoot, { recursive: true });
const temp = await fs.mkdtemp(path.join(runtimeRoot, 'mixed-scope-composer-'));
const report = { passed: false, checks: [], realBrowserVerified: false, modelCalls: 0 };
const before = withNativeChatSourceTransforms(createNativeUiSourceTransforms({ nativeRailPilot: true }));
const transforms = withNativeMixedScopeComposerTransforms(before);
const read = async relative => readCurrentGen2Resource(path.join(root, relative))?.contents ?? await fs.readFile(path.join(root, relative), 'utf8');
const parse = (source, name) => { const file = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX); assert.equal(file.parseDiagnostics.length, 0); return file; };
const nodes = (owner, test) => { const list = []; const visit = node => { if (test(node)) list.push(node); ts.forEachChild(node, visit); }; visit(owner); return list; };
const declaration = (file, name) => nodes(file, node => ts.isVariableDeclaration(node) && node.name.getText(file) === name)[0];
const functionText = (file, name) => nodes(file, node => ts.isFunctionDeclaration(node) && node.name?.text === name)[0].getText(file);
const evaluate = (text, env) => { const code = ts.transpileModule('const evaluated=(' + text + ');', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText; return new Function(...Object.keys(env), code + '\nreturn evaluated;')(...Object.values(env)); };
try {
  const sources = new Map();
  for (const [relative, transform] of Object.entries(nativeMixedScopeComposerTransforms)) {
    const sourcePath = path.join(root, relative), source = await read(relative), original = before[relative]?.(source, { sourcePath }) ?? source;
    const adapted = transform(original, { sourcePath });
    assert.equal(transform(adapted, { sourcePath }), adapted, 'idempotent adaptation');
    assert.throws(() => transform(original, { sourcePath: path.join(root, 'lab/not-an-owner.ts') }), /exact existing sourcePath/);
    parse(adapted, relative); assert.equal(await read(relative), source, 'source resources stay read-only');
    sources.set(relative.split('/').at(-1), { source: parse(original, relative), adapted: parse(adapted, relative) });
  }
  const snapshotFiles = sources.get('referenceSnapshot.ts');
  for (const name of ['snapshotDraftReference', 'draftReferenceForGesture', 'prepareDraftReferences'])
    assert.equal(functionText(snapshotFiles.source, name), functionText(snapshotFiles.adapted, name), name + ' stays original');
  const submissionFiles = sources.get('composerSubmission.ts');
  for (const name of ['canSubmitComposerTarget', 'canSubmitComposerContinuation', 'buildComposerContinuationInput'])
    assert.equal(functionText(submissionFiles.source, name), functionText(submissionFiles.adapted, name), name + ' retains original ownership');
  const hostFiles = sources.get('LcosComposerHost.tsx');
  for (const name of ['submit', 'rememberCaret', 'receiveMaterial', 'displayedReferences'])
    assert.equal(declaration(hostFiles.source, name).getText(hostFiles.source), declaration(hostFiles.adapted, name).getText(hostFiles.adapted), name + ' unchanged');
  const onRemove = file => nodes(file, node => ts.isPropertyAssignment(node) && node.name.getText(file) === 'onRemove')[0].getText(file);
  assert.equal(onRemove(hostFiles.source), onRemove(hostFiles.adapted), 'original reference removal/target relation retained');
  report.checks.push('Exact source transforms compose and are idempotent; original sends, caret, excerpt ingress, dedupe and remove owner unchanged');

  const entry = path.join(temp, 'entry.ts'), bundle = path.join(temp, 'compiled.mjs');
  const modules = ['referenceSnapshot', 'composerSubmission', 'composerInputJourney'].map(name => path.join(root, 'lcos/huabu/apps/web/src/lcos/composer/' + name + '.ts'));
  modules.push(path.join(root, 'lab/pilot/native-scope-reference-port.ts'));
  modules.push(...['collaboration', 'client', 'coreTypes'].map(name => path.join(root, 'lcos/apps/web-gen2/src/backend/' + name + '.ts')));
  await fs.writeFile(entry, modules.map(name => `export * from ${JSON.stringify(name.replaceAll('\\', '/'))};`).join('\n'));
  // This harness executes only the original pure Composer dependency closure.
  // Its web-gen2 bridge exports come from their real referenceController owner;
  // React/Canvas modules are outside this function test, not mocked in product.
  const esbuild = createRequire(path.join(installedRoot, 'package.json'))('esbuild');
  await esbuild.build({ entryPoints: [entry], outfile: bundle, bundle: true, platform: 'node', format: 'esm', target: 'node22', logLevel: 'warning', plugins: [{
    name: 'actual-pure-composer-source-closure', setup(build) {
      build.onResolve({ filter: /^@local-creative-os\/web-gen2$/ }, () => ({ path: path.join(root, 'lcos/apps/web-gen2/src/interaction/referenceController.ts') }));
      build.onLoad({ filter: /\.ts$/ }, async args => {
        const relative = path.relative(root, args.path).replaceAll('\\', '/');
        const source = await read(relative), adapt = transforms[relative];
        return { contents: adapt ? adapt(source, { sourcePath: args.path }) : source, loader: 'ts', resolveDir: path.dirname(args.path) };
      });
    }
  }] });
  const api = await import(pathToFileURL(bundle));
  const scope = { entityType: 'scope', entityId: 'actual-scope', mode: 'full', displayLabel: '混合内容' };
  for (const intent of ['delegate', 'continue']) assert.equal(api.draftReferenceUnavailableReason(scope, intent), undefined);
  assert.equal(api.runReferenceUnavailableReason(scope), undefined);
  for (const field of [{ mode: 'summary' }, { mode: 'structure' }, { revisionId: 'fake-revision' }, { artifactId: 'fake-artifact' }, { artifactViewId: 'fake-view' }, { mimeType: 'text/plain' }])
    for (const intent of ['delegate', 'continue']) assert.match(api.draftReferenceUnavailableReason({ ...scope, ...field }, intent), /范围地址/);
  assert.match(api.draftReferenceUnavailableReason({ ...scope, entityId: '' }, 'continue'), /引用/);
  assert.match(api.draftReferenceUnavailableReason({ entityType: 'note', entityId: 'note' }, 'continue'), /暂不能/);
  assert.match(api.draftReferenceUnavailableReason({ entityType: 'run', entityId: 'run' }, 'delegate'), /暂不能/);
  report.checks.push('Scope remains one typed full-range address in ordinary/continuation paths; fake material and unsupported independent members cannot bypass validation');

  const artifact = { entityType: 'artifact', entityId: 'material', revisionId: 'historical', mode: 'full', mimeType: 'text/markdown' };
  const collection = { entityType: 'collection', entityId: 'real-collection' };
  const refs = [scope, artifact, { ...scope, displayLabel: '相同地址第二个标题' }, collection];
  const originalRefs = JSON.stringify(refs), target = { nodeId: 'same-node', intent: 'delegate', workspaceId: 'workspace', receiverConversationId: 'connected-receiver' };
  const task = api.buildComposerRunInput({ projectId: 'project', instruction: '保持原任务', workspaceId: 'workspace', target, refs });
  assert.deepEqual(task.orderedReferences, [{ ref: { type: 'scope', scopeId: scope.entityId }, order: 0, mode: 'full' },
    { ref: { type: 'artifact', artifactId: 'material', revisionId: 'historical' }, order: 1, mode: 'full' },
    { ref: { type: 'collection', collectionId: 'real-collection' }, order: 2 }]);
  assert.deepEqual(task.contextArtifactIds, ['material']); assert.equal(task.workspaceId, 'workspace');
  assert.deepEqual(task.receiverRef, { connectedConversationId: 'connected-receiver' });
  assert.equal(task.instruction, '保持原任务'); assert.equal(JSON.stringify(refs), originalRefs);
  const foreground = api.buildComposerRunInput({ projectId: 'project', instruction: '前景范围', workspaceId: 'workspace', target: { ...target, targetReferences: [scope] }, refs: [scope] });
  assert.deepEqual(foreground.contextArtifactIds, []); assert.equal(foreground.orderedReferences.length, 1);
  assert.equal(api.canSubmitComposerTarget({ ...target, targetReferences: [scope] }, '文本', 'workspace'), true);
  assert.equal(api.canSubmitComposerTarget(target, '文本', undefined), false);
  assert.equal(api.canSubmitComposerTarget({ ...target, receiverBlockedReason: '真实不可用' }, '文本', 'workspace'), false);
  report.checks.push('Ordinary task preserves scope identity/order/dedupe, exact historical material, real receiver/workspace and avoids Scope-as-Artifact pollution');

  const continuing = { ...target, intent: 'continue', continuationOperationId: 'same-operation', messageId: 'same-message' };
  assert.equal(api.canSubmitComposerContinuation(continuing, '原续聊正文', refs), true);
  for (const missing of ['receiverConversationId', 'continuationOperationId', 'messageId']) assert.equal(api.canSubmitComposerContinuation({ ...continuing, [missing]: undefined }, '原续聊正文', refs), false);
  assert.equal(api.canSubmitComposerContinuation({ ...continuing, receiverBlockedReason: 'blocked' }, '原续聊正文', refs), false);
  const continued = api.buildComposerContinuationInput({ conversationId: 'connected-receiver', continuationOperationId: 'same-operation', messageId: 'same-message', text: ' 原续聊正文 ', refs });
  assert.deepEqual(continued.orderedReferences, task.orderedReferences); assert.equal(continued.messageId, 'same-message');
  assert.equal(continued.continuationOperationId, 'same-operation'); assert.equal(continued.conversationId, 'connected-receiver'); assert.equal(continued.text, '原续聊正文');
  assert.equal(JSON.stringify(refs), originalRefs);
  report.checks.push('Continuation preserves original conversation/message/operation identities and whole Scope, without needing a new task target or clearing drafts');

  assert.equal(api.snapshotDraftReference({ ...artifact, descriptor: { entityType: 'artifact', entityId: 'material', presentedRevisionId: 'new', currentRevisionId: 'new', mimeType: 'image/png' } }).revisionId, 'historical');
  for (const mimeType of ['image/png', 'application/pdf', 'text/plain; charset=gbk']) assert.ok(api.runReferenceUnavailableReason({ ...artifact, mimeType }));
  for (const mimeType of ['text/plain', 'text/markdown', 'text/csv', 'application/json', 'application/yaml', 'application/xml', 'text/html; charset=UTF-8']) assert.equal(api.runReferenceUnavailableReason({ ...artifact, mimeType }), undefined);
  const view = { entityType: 'view', entityId: 'exact-view' };
  const ordinaryView = api.buildComposerRunInput({ projectId: 'project', instruction: '原View', workspaceId: 'workspace', target, refs: [view] });
  assert.deepEqual(ordinaryView.orderedReferences, [{ ref: { type: 'view', viewId: 'exact-view' }, order: 0 }]);
  assert.throws(() => api.buildComposerRunInput({ projectId: 'project', instruction: '不能漏掉坏引用', workspaceId: 'workspace', target, refs: [scope, { ...artifact, mimeType: 'image/png' }] }), /图片/);
  assert.throws(() => api.buildComposerContinuationInput({ conversationId: 'connected-receiver', continuationOperationId: 'same-operation', messageId: 'same-message', text: '不要静默丢弃', refs: [scope, { entityType: 'note', entityId: 'note' }] }), /暂不能/);
  report.checks.push('All seven existing UTF-8 text formats and exact View/Artifact snapshots retain their checks; bad sibling references cannot be hidden by Scope');

  for (const code of ['MIXED_SCOPE_CONTENT_UNSUPPORTED', 'CONFLICT', 'STALE_REVISION']) {
    const requests = [];
    const client = new api.CoreCollaborationClient(new api.HttpClient({ baseUrl: 'http://127.0.0.1:0', fetch: async (url, init) => {
      requests.push({ url, init }); return new Response(JSON.stringify({ ok: false, error: { code, message: 'internal path/reader diagnostic must not be shown as product text', retryable: false, origin: 'runtime' } }), { status: 409, headers: { 'content-type': 'application/json' } });
    } }));
    const result = await client.delegate('project', task);
    assert.equal(requests.length, 1); assert.equal(requests[0].init.method, 'POST'); assert.ok(requests[0].url.endsWith('/projects/project/runs'));
    assert.equal(result.ok, false);
    if (code === 'MIXED_SCOPE_CONTENT_UNSUPPORTED') {
      assert.equal(result.error.code, 'unavailable'); assert.equal(result.error.retryable, false);
      assert.equal(result.error.userMessage, '这份内容包含暂不能完整加入对话的图片、PDF 或其他文件；输入和引用已保留。');
      assert.ok(!result.error.userMessage.includes('internal path')); assert.equal(result.error.diagnosticsRef, code);
    } else { assert.equal(result.error.code, 'needs_recovery'); assert.equal(result.error.userMessage, '状态已变化，需要先刷新或恢复'); }
  }
  report.checks.push('Actual original delegate → HttpClient → CoreApiError maps only structured Scope unsupported-file code to clear retained-input guidance; ordinary version conflicts retain original recovery');
  const routed = [], errors = []; let caretCalls = 0, graphReads = 0, reads = 0;
  let live = { projectId: 'project', composerTarget: target };
  const inspect = declaration(hostFiles.adapted, 'inspectReference').initializer.getText(hostFiles.adapted);
  const inspectFunction = evaluate(inspect, { inputKey: api.composerInputKey(target), projectId: 'project', composerTarget: target,
    rememberCaret: () => caretCalls++, inspectRequest: { current: undefined }, AbortController,
    draftReferenceUnavailableReason: api.draftReferenceUnavailableReason,
    session: { projects: { getProjectGraph: async () => { graphReads++; throw new Error('Scope must use its original Library reader.'); } } },
    useLcosShellStore: { getState: () => live }, composerInputKey: api.composerInputKey,
    requestNativeScopeReferenceView: value => routed.push(value), requestNativeMaterialView: () => reads++, setState() {}, setErrorDetail: value => errors.push(value) });
  await inspectFunction(scope, '混合内容');
  const routedScope = routed.pop(); assert.ok(routedScope.signal instanceof AbortSignal);
  const { signal: inspectionSignal, ...routedAddress } = routedScope;
  assert.deepEqual(routedAddress, { projectId: 'project', scopeId: 'actual-scope', title: '混合内容', composerOriginKey: api.composerInputKey(target) });
  assert.equal(caretCalls, 1); assert.equal(graphReads, 0); assert.equal(reads, 0);
  await inspectFunction({ ...scope, mode: 'summary' }, '拒绝'); assert.equal(routed.length, 0); assert.equal(errors.length, 1);
  live = { projectId: 'other', composerTarget: target }; await inspectFunction(scope, '旧请求'); assert.equal(routed.length, 0);
  live = { projectId: 'project', composerTarget: { ...target, receiverConversationId: 'different' } }; await inspectFunction(scope, '已换输入'); assert.equal(routed.length, 0);
  const rejectOpen = evaluate(inspect, { inputKey: api.composerInputKey(target), projectId: 'project', composerTarget: target,
    rememberCaret() {}, inspectRequest: { current: undefined }, AbortController,
    draftReferenceUnavailableReason: api.draftReferenceUnavailableReason,
    useLcosShellStore: { getState: () => ({ projectId: 'project', composerTarget: target }) }, composerInputKey: api.composerInputKey,
    requestNativeScopeReferenceView: async () => { throw new Error('原库行读取失败，未新建窗口'); },
    setState() {}, setErrorDetail: value => errors.push(value) });
  await rejectOpen(scope, '混合内容'); assert.match(errors.at(-1), /原库行读取失败/);
  const m1 = { ...continuing, messageId: 'message-1', continuationOperationId: 'operation-1' };
  let messageOwner = { projectId: 'project', composerTarget: m1 }; const messageRoutes = [];
  const inspectM1 = evaluate(inspect, { inputKey: api.composerInputKey(m1), projectId: 'project', composerTarget: m1,
    rememberCaret() {}, inspectRequest: { current: undefined }, AbortController,
    draftReferenceUnavailableReason: api.draftReferenceUnavailableReason,
    useLcosShellStore: { getState: () => messageOwner }, composerInputKey: api.composerInputKey,
    requestNativeScopeReferenceView: async value => messageRoutes.push(value), setState() {}, setErrorDetail: value => errors.push(value) });
  await inspectM1(scope, '混合内容'); assert.equal(messageRoutes.length, 1);
  assert.equal(messageRoutes[0].messageId, 'message-1'); assert.equal(messageRoutes[0].continuationOperationId, 'operation-1');
  messageOwner = { projectId: 'project', composerTarget: { ...m1, messageId: 'message-2' } };
  assert.equal(api.composerInputKey(m1), api.composerInputKey(messageOwner.composerTarget));
  await inspectM1(scope, '旧 M1 chip 回调'); assert.equal(messageRoutes.length, 1, 'Same input key with a newer message must reject the old callback.');
  messageOwner = { projectId: 'project', composerTarget: { ...m1, continuationOperationId: 'operation-2' } };
  await inspectM1(scope, '旧操作 chip 回调'); assert.equal(messageRoutes.length, 1, 'Same input key with a newer continuation must reject the old callback.');
  let finishOldOpen; const lateErrors = []; messageOwner = { projectId: 'project', composerTarget: m1 };
  const lateOpen = evaluate(inspect, { inputKey: api.composerInputKey(m1), projectId: 'project', composerTarget: m1,
    rememberCaret() {}, inspectRequest: { current: undefined }, AbortController,
    draftReferenceUnavailableReason: api.draftReferenceUnavailableReason,
    useLcosShellStore: { getState: () => messageOwner }, composerInputKey: api.composerInputKey,
    requestNativeScopeReferenceView: () => new Promise((_resolve, reject) => { finishOldOpen = reject; }),
    setState: value => lateErrors.push(value), setErrorDetail: value => lateErrors.push(value) });
  const oldM1Request = lateOpen(scope, 'M1 读取中');
  messageOwner = { projectId: 'project', composerTarget: { ...m1, messageId: 'message-2' } };
  finishOldOpen(new Error('M1 稍后失败')); await oldM1Request;
  assert.deepEqual(lateErrors, [], 'A late error from M1 cannot write an error state into M2 sharing the same input key.');
  const closeErrors = [];
  const closedScope = evaluate(inspect, { inputKey: api.composerInputKey(m1), projectId: 'project', composerTarget: m1,
    rememberCaret() {}, inspectRequest: { current: undefined }, AbortController,
    draftReferenceUnavailableReason: api.draftReferenceUnavailableReason,
    useLcosShellStore: { getState: () => ({ projectId: 'project', composerTarget: m1 }) }, composerInputKey: api.composerInputKey,
    requestNativeScopeReferenceView: async () => { throw new DOMException('Explicit original Library close', 'AbortError'); },
    setState: value => closeErrors.push(value), setErrorDetail: value => closeErrors.push(value) });
  await closedScope(scope, '显式关闭'); assert.deepEqual(closeErrors, [], 'Closing the original Library cancels inspection without painting an error into the retained input.');
  const caret = { projectId: 'project', targetKey: api.composerInputKey(target), text: '原始草稿不动', start: 2, end: 5 };
  assert.deepEqual(api.restoredComposerCaret(caret, 'project', api.composerInputKey(target), caret.text), { start: 2, end: 5 });
  report.checks.push('Scope chip keeps original inspect/caret and input ownership, routes to original Library address and rejects stale project/receiver; no Reader or Stage window is fabricated');

  const events = []; globalThis.window = { dispatchEvent: event => { events.push(event); return true; } };
  const pendingOpen = api.requestNativeScopeReferenceView({ projectId: 'project', scopeId: 'actual-scope', composerOriginKey: 'input', title: '混合内容' });
  assert.equal(events[0].type, 'lcos-native-open-scope-reference');
  const { resolve, reject, isCurrent, ...address } = events[0].detail; assert.equal(typeof resolve, 'function'); assert.equal(typeof reject, 'function'); assert.equal(isCurrent(), true);
  assert.deepEqual(address, { projectId: 'project', scopeId: 'actual-scope', composerOriginKey: 'input', title: '混合内容' });
  resolve(); await pendingOpen; assert.equal(isCurrent(), false);
  const pendingFailure = api.requestNativeScopeReferenceView({ projectId: 'project', scopeId: 'actual-scope', composerOriginKey: 'input' });
  events[1].detail.reject(new Error('原库读取失败')); await assert.rejects(pendingFailure, /原库读取失败/);
  for (const field of ['projectId', 'scopeId', 'composerOriginKey']) assert.throws(() => api.requestNativeScopeReferenceView({ projectId: 'project', scopeId: 'scope', composerOriginKey: 'input', [field]: ' ' }), /尚未确认/);
  const controller = new AbortController();
  const pendingAborted = api.requestNativeScopeReferenceView({ projectId: 'project', scopeId: 'scope', composerOriginKey: 'input', signal: controller.signal });
  const abortedDetail = events.at(-1).detail; assert.equal(abortedDetail.signal, controller.signal);
  const assertAborted = assert.rejects(pendingAborted, error => error.name === 'AbortError');
  controller.abort(); await assertAborted; assert.equal(abortedDetail.isCurrent(), false); abortedDetail.resolve(); abortedDetail.reject(new Error('Late original row result')); await assertAborted;
  const eventCount = events.length;
  await assert.rejects(api.requestNativeScopeReferenceView({ projectId: 'project', scopeId: 'scope', composerOriginKey: 'input', signal: controller.signal }), error => error.name === 'AbortError');
  assert.equal(events.length, eventCount, 'Already-canceled original inspection cannot even request a late Scope open.');
  const originalTimeout = globalThis.setTimeout, originalClearTimeout = globalThis.clearTimeout;
  let expire, clearCount = 0;
  try {
    globalThis.setTimeout = (callback, duration) => { assert.equal(duration, 15000); expire = callback; return 123; };
    globalThis.clearTimeout = () => clearCount++;
    const pendingTimeout = api.requestNativeScopeReferenceView({ projectId: 'project', scopeId: 'scope', composerOriginKey: 'input' });
    const expiredDetail = events.at(-1).detail; assert.equal(expiredDetail.isCurrent(), true);
    const assertExpired = assert.rejects(pendingTimeout, /原库打开尚未确认/); expire(); await assertExpired;
    assert.equal(expiredDetail.isCurrent(), false); assert.equal(clearCount, 1);
    expiredDetail.resolve(); await assertExpired;
  } finally { globalThis.setTimeout = originalTimeout; globalThis.clearTimeout = originalClearTimeout; }
  for (const field of ['messageId', 'continuationOperationId']) assert.throws(() => api.requestNativeScopeReferenceView({ projectId: 'project', scopeId: 'scope', composerOriginKey: 'input', [field]: ' ' }), /尚未确认/);
  delete globalThis.window;
  report.checks.push('Scope open port is only one validated transient event; no model, canonical data or new window operation');
  report.passed = true;
} catch (error) { report.error = error instanceof Error ? error.stack : String(error); throw error; }
finally {
  const dir = path.join(root, 'output/混合Scope当前对话_20261022'); await fs.mkdir(dir, { recursive: true });
  const evidence = path.join(dir, '原Composer接线独立验证.json'); await fs.writeFile(evidence, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, evidence }));
  if (!path.resolve(temp).startsWith(runtimeRoot + path.sep)) throw new Error('Unexpected local test directory.');
  await fs.rm(temp, { recursive: true, force: true });
}










