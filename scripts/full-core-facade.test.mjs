import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeRoot = path.join(root, '.runtime', 'full-core-test-' + Date.now());
const evidencePath = process.env.LCOS_FULL_CORE_TEST_EVIDENCE_PATH
  ? path.resolve(process.env.LCOS_FULL_CORE_TEST_EVIDENCE_PATH)
  : path.join(root, 'evidence', 'full-core-facade.json');
await mkdir(runtimeRoot, { recursive: true });
process.env.LCOS_CAPTURE_STAGING_ROOT = path.join(runtimeRoot, 'capture');
process.env.LCOS_OCR_RUNTIME_DIR = path.join(runtimeRoot, 'ocr');
process.env.LCOS_RECOVERY_TRANSPORT = 'none';
const entry = await buildPilotEntry('lab/pilot/surface-core-facade.ts', path.join(runtimeRoot, 'full-facade.mjs'));
const { startSurfaceCoreFacade } = await import(pathToFileURL(entry).href);
const origin = 'http://127.0.0.1:17881';
let facade;
const report = { implementation: 'full-mode facade with real Core SQLite + Huabu disk storage', originalUserDatabaseOpened: false,
  nativeUiClaimed: false, externalAgentExecutionClaimed: false, fullScopeComplete: false, runtimeRoot, cases: [] };
const call = (method, address, body) => facade.handle({ method, pathname: new URL(address, origin).pathname, url: origin + address, body });
const callPath = (method, pathname, body) => facade.handle({ method, pathname, url: origin + pathname, body });
const mainPath = '/api/canvas/v1/canvases/surface-core-main';
const op = (kind, phase = 'apply') => ({ version: 1, operationId: 'explicit-' + kind, kind, phase });
const batch = (action, operation, extra = {}) => call('POST', mainPath + '/nodes:batchActions', { canvas_id: 'surface-core-main', actions: [action], lcos_operation: operation, ...extra });
try {
  facade = await startSurfaceCoreFacade({ runtimeRoot, publicOrigin: origin, fullIntegration: true });
  let main = (await call('GET', mainPath)).body.data;
  assert.ok(main.nodes.every(node => node.data.lcos_ref?.artifactId && node.data.lcos_ref?.revisionId));
  report.cases.push('detail carries real Artifact/View/Revision identities for both native node types');
  const registry = await call('GET', '/api/lcos/translation');
  assert.equal(registry.body.data.fullScopeComplete, false);
  assert.ok(registry.body.data.operations.every(row => row.envelope === 'original-core' && row.uiVerified === false));
  assert.ok(registry.body.data.operations.some(row => row.id === 'canvas-text-write' && row.method === 'PUT'));
  assert.ok(registry.body.data.operations.some(row => row.id === 'artifact-title-write' && row.method === 'POST'));
  report.cases.push('translation registry distinguishes connected producer from unverified native UI');
  const projectRoute = '/api/lcos/core/projects/' + facade.core.projectId;
  const graph = await call('GET', projectRoute + '/graph');
  assert.equal(graph.status, 200); assert.equal(graph.body.ok, true);
  assert.equal((await call('GET', '/api/lcos/core/projects/foreign/graph')).status, 404);
  for (const malformed of [
    '/api/lcos/core/projects/%ZZ/graph',
    projectRoute + '/file-records/%E0%A4%A/content',
    '/api/lcos/core/entities/artifact/%GG/title',
  ]) {
    const result = await call('GET', malformed);
    assert.equal(result.status, 400, malformed);
    assert.equal(result.body.error.code, 'INVALID_CORE_ADDRESS', malformed);
  }
  assert.equal((await callPath('GET', '/api/lcos/core/projects/%2e%2e/graph')).status, 400,
    'existing encoded traversal rejection remains in place');
  assert.equal((await callPath('GET', '/api/lcos/core/projects/surface%2Fcore/graph')).status, 400,
    'existing encoded separator rejection remains in place');
  assert.equal((await call('POST', '/api/lcos/core/entities/workspace/not-an-artifact/title', { title: 'must not route', mode: 'manual' })).status, 501,
    'the title producer is not exposed for other entity types');
  assert.equal((await call('POST', '/api/lcos/core/executor/tasks', { prompt: 'must not dispatch' })).status, 501);
  assert.equal((await call('POST', projectRoute + '/assembly/apply', { projectId: 'foreign' })).status, 400);
  const rejected = await call('POST', projectRoute + '/assembly/apply', { schemaVersion: 2, projectId: facade.core.projectId, sourceRefs: [], targetRef: { kind: 'context', id: 'missing-context' } });
  assert.notEqual(rejected.status, 200); assert.equal(rejected.body.ok, false);
  report.cases.push('same-project Core reader preserves real envelope/errors; foreign project and unregistered executor rejected');
  const providerStatus = await call('GET', '/api/lcos/core/runtime/providers');
  assert.equal(providerStatus.status, 200, JSON.stringify(providerStatus.body));
  assert.ok(providerStatus.body.value.every(row => row.availability === 'offline'));
  const plannedRun = await call('POST', projectRoute + '/runs', { instruction: '合成任务登记 · 不执行模型', outputIntent: 'analyze', requestedProvider: 'codex' });
  assert.equal(plannedRun.status, 201, JSON.stringify(plannedRun.body));
  const runId = String(plannedRun.body.value.review.run.id);
  assert.equal(plannedRun.body.value.review.run.status, 'created');
  assert.equal(plannedRun.body.value.review.dispatch.status, 'planned');
  assert.equal(facade.core.repository.getRuntimeBinding(runId), undefined);
  assert.equal((await call('GET', projectRoute + '/runs')).body.value[0].run.id, runId);
  assert.equal((await call('GET', '/api/lcos/core/runs/' + encodeURIComponent(runId) + '/review')).body.value.run.status, 'created');
  assert.equal((await call('GET', '/api/lcos/core/runs/foreign/review')).status, 404);
  assert.equal((await call('POST', '/api/lcos/core/runs/' + encodeURIComponent(runId) + '/dispatch', {})).status, 501);
  report.cases.push('real Runtime composition reports offline and creates only a local Run journal; same-project Review readable and external dispatch not exposed');
  const folder = (await call('GET', '/api/library/v1/spaces/SPACE_TYPE_PRIVATE/folders')).body.data.folders[0];
  const assets = (await call('GET', '/api/library/v1/folders/' + encodeURIComponent(folder.id) + '/assets')).body.data.assets;
  const imageAsset = assets.find(row => row.asset_type === 1 && row.source_url);
  assert.ok(imageAsset?.lcos_projection.content_available);
  const bytes = await call('GET', new URL(imageAsset.source_url).pathname);
  assert.equal(bytes.status, 200); assert.ok(Buffer.isBuffer(bytes.body));
  assert.equal(bytes.body.toString('hex', 0, 8), '89504e470d0a1a0a');
  assert.equal((await call('GET', '/api/library/v1/folders/foreign/assets')).status, 404);
  assert.equal((await call('DELETE', '/api/library/v1/assets/' + imageAsset.id)).status, 501);
  report.cases.push('native Library DTOs read actual local artifacts and valid FileRecord image bytes, not metadata mocks');
  const imageDetail = await call('GET', '/api/lcos/core/artifacts/' + encodeURIComponent(imageAsset.id));
  assert.equal(imageDetail.status, 200, JSON.stringify(imageDetail.body));
  assert.equal(imageDetail.body.value.artifact.projectId, facade.core.projectId);
  const imageRevisions = await call('GET', '/api/lcos/core/artifacts/' + encodeURIComponent(imageAsset.id) + '/revisions');
  assert.equal(imageRevisions.status, 200);
  const imageRevision = imageRevisions.body.value.find(revision => revision.id === imageDetail.body.value.currentRevisionId);
  assert.ok(imageRevision);
  const coreBytes = await call('GET', projectRoute + '/file-records/' + encodeURIComponent(imageRevision.fileRecordId) + '/content');
  assert.equal(coreBytes.status, 200, JSON.stringify(coreBytes.body));
  assert.ok(Buffer.isBuffer(coreBytes.body)); assert.deepEqual(coreBytes.body, bytes.body);
  assert.equal(coreBytes.contentType, 'image/png');
  assert.equal((await call('GET', '/api/lcos/core/artifacts/foreign/revisions')).status, 404);
  assert.equal((await call('GET', projectRoute + '/file-records/foreign/content')).status, 404);
  const sameRevision = await call('GET', projectRoute + '/revisions/compare?base=' + encodeURIComponent(imageRevision.id) + '&head=' + encodeURIComponent(imageRevision.id));
  assert.equal(sameRevision.status, 200); assert.equal(sameRevision.body.value.changed, false);
  assert.equal((await call('GET', projectRoute + '/revisions/compare?base=foreign&head=' + encodeURIComponent(imageRevision.id))).status, 404);
  assert.equal((await call('POST', '/api/lcos/core/artifacts/' + encodeURIComponent(imageAsset.id) + '/open', { path: 'C:/unrelated.exe' })).status, 400,
    'source actions reject caller supplied paths before any actual OS launch');
  for (const route of [projectRoute + '/resources', projectRoute + '/skills', '/api/lcos/core/runtime/capture-space']) {
    const read = await call('GET', route);
    assert.equal(read.status, 200, JSON.stringify({ route, result: read.body })); assert.equal(read.body.ok, true);
  }
  report.cases.push('mature Assembly reads exact existing Artifact detail/revisions/real file bytes, isolated Capture/Resource/Skill owners; foreign IDs, compare and OS actions remain guarded');
  const blankText = await batch({ action: 'create', creates: [{ id: 'native-empty-menu-text', type: 'text',
    position: { x: 100, y: 600 }, measured: { width: 250, height: 250 },
    data: { type: 'generate', title: 'Text', text: '', prompt: '', params: { model: 'gemini-3.1-flash-lite', provider: 'google' } } }] }, op('create'));
  assert.equal(blankText.status, 200, JSON.stringify(blankText.body));
  assert.equal((await call('GET', mainPath)).body.data.nodes.find(node => node.id === 'native-empty-menu-text').data.text, '');
  const countBefore = facade.core.repository.getArtifacts(facade.core.projectId).length;
  const creation = { action: 'create', creates: [{ id: 'native-created-text', type: 'text', position: { x: 45, y: 65 }, measured: { width: 300, height: 200 }, data: { type: 'generate', title: '真实新增', text: 'new canonical body' } }] };
  assert.equal((await batch(creation)).status, 409);
  assert.equal(facade.core.repository.getArtifacts(facade.core.projectId).length, countBefore);
  const created = await batch(creation, op('create'));
  assert.equal(created.status, 200, JSON.stringify(created.body));
  const newRef = created.body.data.lcos_refs['native-created-text'];
  assert.ok(newRef); assert.equal(created.body.data.client_to_spatial_ids['native-created-text'], 'native-created-text');
  main = (await call('GET', mainPath)).body.data;
  const text = main.nodes.find(node => node.id === 'native-created-text');
  assert.equal(text.data.text, 'new canonical body'); assert.equal(text.data.lcos_ref.artifactId, newRef.artifactId);
  report.cases.push('explicit native create commits one real Core text and preserves native ID; missing intent writes nothing');
  const edited = await batch({ action: 'update', updates: [{ id: text.id, data: { ...text.data, type: 'generate', label: '真实新增', text: 'edited body' } }] }, undefined,
    { lcos_expected_revisions: { [text.id]: text.lcos_revision_id } });
  assert.equal(edited.status, 200, JSON.stringify(edited.body));
  const editedText = (await call('GET', mainPath)).body.data.nodes.find(node => node.id === text.id);
  assert.equal(editedText.data.text, 'edited body');
  assert.notEqual(editedText.lcos_revision_id, text.lcos_revision_id);
  assert.deepEqual(edited.body.data.lcos_text_receipts, [{ projectId: facade.core.projectId,
    canvasId: 'surface-core-main', nodeId: text.id, ref: editedText.data.lcos_ref, body: 'edited body' }],
  'plain body updates return the actual Core reference and bytes for the original history receipt port');
  assert.equal((await batch({ action: 'update', updates: [{ id: text.id, data: { label: 'not-the-current-spatial-label' } }] })).status, 501);
  const copied = await batch({ action: 'create', creates: [{ id: 'native-duplicate-text', type: 'text', position: { x: 400, y: 400 }, measured: { width: 300, height: 200 },
    lcos_ref: editedText.data.lcos_ref, data: { title: editedText.data.title, text: editedText.data.text } }] }, op('duplicate-view'));
  assert.equal(copied.status, 200, JSON.stringify(copied.body));
  assert.equal(facade.core.repository.getArtifacts(facade.core.projectId).length, countBefore + 1);
  const copiedText = (await call('GET', mainPath)).body.data.nodes.find(node => node.id === 'native-duplicate-text');
  assert.equal(copiedText.data.text, 'edited body'); assert.equal(copiedText.data.lcos_ref.entityType, 'view');
  assert.equal(copiedText.data.lcos_ref.artifactId, newRef.artifactId);
  report.cases.push('additional text view resolves canonical revision and does not duplicate Artifact or FileRecord');
  const badRef = await batch({ action: 'update', updates: [{ id: text.id, data: { lcos_ref: { ...editedText.data.lcos_ref, artifactId: 'foreign' } } }] });
  assert.equal(badRef.status, 409);
  const viewWrite = await batch({ action: 'update', updates: [{ id: copiedText.id, data: { text: 'must not bypass binding CAS' } }] }, undefined,
    { lcos_expected_revisions: { [copiedText.id]: copiedText.lcos_revision_id } });
  assert.equal(viewWrite.status, 501);
  assert.equal(viewWrite.body.data, null, 'rejected view writes expose no committed text receipt');
  report.cases.push('renderer identity forgery and not-yet-connected view body mutation fail without bypassing Core binding protection');

  const canvasTextPath = projectRoute + '/curation/canvas-text';
  const coreCanvasTextPath = canvasTextPath.slice('/api/lcos/core'.length);
  const primaryAddress = { canvasId: 'surface-core-main', spatialId: 'native-created-text' };
  const encodeCanvasTextQuery = address => '?canvasId=' + encodeURIComponent(address.canvasId) + '&spatialId=' + encodeURIComponent(address.spatialId);
  const directCore = async (method, address, body) => {
    const response = await fetch(new URL(address, facade.core.origin), {
      method, headers: body === undefined ? { accept: 'application/json' } : { accept: 'application/json', 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() };
  };
  const beforeCanvasText = await call('GET', canvasTextPath + encodeCanvasTextQuery(primaryAddress));
  const beforeCanvasTextDirect = await directCore('GET', coreCanvasTextPath + encodeCanvasTextQuery(primaryAddress));
  assert.equal(beforeCanvasText.status, beforeCanvasTextDirect.status);
  assert.deepEqual(beforeCanvasText.body, beforeCanvasTextDirect.body,
    'canvas-text GET returns the original Core status and envelope');
  assert.equal(beforeCanvasText.body.value.body, 'edited body');

  const nextBody = '# Router write\n\n真实 Core 字节 · CAS 保留。\n';
  const canvasTextWrite = {
    ...primaryAddress,
    artifactId: beforeCanvasText.body.value.artifactId,
    expectedRevisionId: beforeCanvasText.body.value.revisionId,
    body: nextBody,
  };
  const savedCanvasText = await call('PUT', canvasTextPath, canvasTextWrite);
  assert.equal(savedCanvasText.status, 200, JSON.stringify(savedCanvasText.body));
  assert.equal(savedCanvasText.body.ok, true);
  assert.equal(savedCanvasText.body.value.body, nextBody);
  assert.notEqual(savedCanvasText.body.value.revisionId, beforeCanvasText.body.value.revisionId);
  const savedRevisionFile = facade.core.repository.getArtifactRevision(savedCanvasText.body.value.revisionId);
  assert.ok(savedRevisionFile);
  const savedFileResponse = await call('GET', projectRoute + '/file-records/' + encodeURIComponent(String(savedRevisionFile.fileRecordId)) + '/content');
  assert.equal(savedFileResponse.status, 200, JSON.stringify(savedFileResponse.body));
  assert.deepEqual(savedFileResponse.body, Buffer.from(nextBody, 'utf8'), 'the new immutable Core FileRecord contains the exact UTF-8 body bytes');
  const afterCanvasText = await call('GET', canvasTextPath + encodeCanvasTextQuery(primaryAddress));
  assert.equal(afterCanvasText.body.value.body, nextBody);
  assert.equal(afterCanvasText.body.value.revisionId, savedCanvasText.body.value.revisionId);

  const staleWrite = { ...canvasTextWrite, body: 'stale body' };
  const staleDirect = await directCore('PUT', coreCanvasTextPath, staleWrite);
  const staleViaRouter = await call('PUT', canvasTextPath, staleWrite);
  assert.equal(staleViaRouter.status, 409);
  assert.equal(staleViaRouter.status, staleDirect.status);
  assert.deepEqual(staleViaRouter.body, staleDirect.body,
    'the router preserves the original Core CAS conflict envelope and status');
  assert.equal((await call('GET', canvasTextPath + encodeCanvasTextQuery(primaryAddress))).body.value.body, nextBody,
    'the stale request does not overwrite the current Core revision');

  const viewAddress = { canvasId: 'surface-core-main', spatialId: 'native-duplicate-text' };
  const viewWriteInput = { ...viewAddress, artifactId: copiedText.data.lcos_ref.artifactId,
    expectedRevisionId: copiedText.lcos_revision_id, body: 'view writes must not select the Artifact primary' };
  const viewWriteDirect = await directCore('PUT', coreCanvasTextPath, viewWriteInput);
  const viewWriteViaRouter = await call('PUT', canvasTextPath, viewWriteInput);
  assert.equal(viewWriteViaRouter.status, 409);
  assert.equal(viewWriteViaRouter.status, viewWriteDirect.status);
  assert.deepEqual(viewWriteViaRouter.body, viewWriteDirect.body,
    'the view-only binding error is the original Core response, not a guessed-primary write');
  assert.equal((await call('GET', canvasTextPath + encodeCanvasTextQuery(primaryAddress))).body.value.body, nextBody);
  assert.equal(facade.core.repository.getArtifacts(facade.core.projectId).length, countBefore + 1);
  report.cases.push('Core canvas-text PUT produces exact UTF-8 bytes and a new immutable Revision; stale CAS and view-only binding errors preserve Core status/envelope without guessing a primary');

  const allIds = (await call('GET', mainPath)).body.data.nodes.map(node => node.id);
  const artifactCount = facade.core.repository.getArtifacts(facade.core.projectId).length;
  const removed = await batch({ action: 'delete', delete_ids: allIds }, op('delete'));
  assert.equal(removed.status, 200, JSON.stringify(removed.body));
  assert.equal(facade.core.repository.getArtifacts(facade.core.projectId).length, artifactCount);
  assert.equal((await call('GET', mainPath)).body.data.nodes.length, 0);
  await facade.close(); facade = await startSurfaceCoreFacade({ runtimeRoot, publicOrigin: origin, fullIntegration: true });
  assert.equal((await call('GET', mainPath)).body.data.nodes.length, 0);
  const restored = await batch({ action: 'create', creates: [{ id: 'native-restored-text', type: 'text', position: { x: 100, y: 100 }, measured: { width: 300, height: 200 },
    data: { title: editedText.data.title, text: editedText.data.text }, lcos_ref: removed.body.data.lcos_refs[text.id] }] }, op('delete', 'undo'));
  assert.equal(restored.status, 200, JSON.stringify(restored.body));
  assert.equal(restored.body.data.lcos_refs['native-restored-text'].artifactId, newRef.artifactId);
  report.cases.push('deleting every sample carrier leaves all materials, empty canvas reopens, explicit undo restores same Artifact under new native ID');
  const contextScope = facade.core.repository.getScopes(facade.core.projectId).find(scope => scope.kind === 'context');
  assert.ok(contextScope);
  const assemblyInput = { schemaVersion: 1, projectId: facade.core.projectId, sourceRefs: [{ kind: 'artifactView', id: newRef.artifactViewId }],
    targetRef: { kind: 'context', id: contextScope.id } };
  const assembly = await call('POST', projectRoute + '/assembly/apply', assemblyInput);
  assert.equal(assembly.status, 200, JSON.stringify(assembly.body));
  assert.equal(assembly.body.value.results[0].status, 'applied');
  assert.equal(assembly.body.value.results[0].channel, 'presentation-membership');
  const presentation = facade.core.repository.listPresentationViews(facade.core.projectId).find(row => row.scopeId === contextScope.id && row.capability === 'context');
  assert.ok(presentation.state.memberViewIds.includes(newRef.artifactViewId));
  const replayAssembly = await call('POST', projectRoute + '/assembly/apply', assemblyInput);
  assert.equal(replayAssembly.body.value.results[0].channel, 'already-member');
  report.cases.push('Saved Context receives exact ArtifactView via real Assembly producer and existing Presentation/ChangeSet owner; replay does not copy material');
  const confirmed = await call('POST', projectRoute + '/connected-conversations', { action: 'connect', provider: 'codex', executorId: 'synthetic-test-executor',
    conversationRef: 'synthetic-explicit-existing-session', label: '合成会话引用 · 未启动执行器' });
  assert.equal(confirmed.status, 201, JSON.stringify(confirmed.body));
  const importedConversation = await call('POST', projectRoute + '/conversations/import-manual', { title: '合成手工历史 · 非实时执行', scopeId: contextScope.id,
    entries: [{ role: 'user', contentText: '这是人工输入的测试材料。' }, { role: 'assistant', contentText: '这是导入的合成历史，不表示运行了模型。' }] });
  assert.equal(importedConversation.status, 201, JSON.stringify(importedConversation.body));
  const linked = await call('POST', projectRoute + '/connected-conversations/' + confirmed.body.value.id + '/link-session', {
    conversationSessionId: importedConversation.body.value.session.id });
  assert.equal(linked.status, 200, JSON.stringify(linked.body));
  const timeline = await call('GET', projectRoute + '/connected-conversations/' + confirmed.body.value.id + '/collaboration-timeline');
  assert.equal(timeline.status, 200, JSON.stringify(timeline.body)); assert.equal(timeline.body.ok, true);
  assert.ok(JSON.stringify(timeline.body.value).includes('导入的合成历史'));
  for (const suffix of ['identity', 'reach', 'work-view']) {
    const projectedRead = await call('GET', projectRoute + '/connected-conversations/' + confirmed.body.value.id + '/' + suffix);
    assert.equal(projectedRead.status, 200, JSON.stringify(projectedRead.body));
    assert.equal(projectedRead.body.ok, true);
  }
  assert.equal((await call('GET', projectRoute + '/conversations')).body.value.length, 1);
  assert.equal((await call('GET', projectRoute + '/conversation-continuations')).body.ok, true);
  const conversationContext = await call('POST', projectRoute + '/assembly/apply', { ...assemblyInput,
    targetRef: { kind: 'conversation', id: confirmed.body.value.id } });
  assert.equal(conversationContext.status, 200, JSON.stringify(conversationContext.body));
  assert.equal(conversationContext.body.value.results[0].channel, 'relation');
  assert.ok(facade.core.repository.getRelations(facade.core.projectId).some(row => row.kind === 'conversation_context'));
  report.cases.push('manual transcript imports and explicitly links to canonical ConversationSession; actual Collaboration timeline and Assembly conversation_context relation are readable without provider execution');
  const pending = await call('POST', projectRoute + '/connected-conversations', { action: 'create', provider: 'codex', executorId: 'synthetic-test-executor', label: 'pending不能画成Agent' });
  assert.equal(pending.status, 201);
  const reconcileRoute = '/api/lcos/canvases/surface-core-main/conversations:reconcile';
  const projected = await call('POST', reconcileRoute, {});
  assert.equal(projected.status, 200, JSON.stringify(projected.body));
  assert.equal(projected.body.data.provider_execution_started, false);
  assert.equal(projected.body.data.bindings.length, 1);
  const agentBinding = projected.body.data.bindings[0];
  assert.equal(agentBinding.entityId, confirmed.body.value.id); assert.equal(agentBinding.entityType, 'conversation');
  const replayed = await call('POST', reconcileRoute, {});
  assert.equal(replayed.body.data.bindings[0].spatialId, agentBinding.spatialId);
  const agentNode = (await call('GET', mainPath)).body.data.nodes.find(node => node.type === 'lcos-conversation');
  assert.equal(agentNode.data.lcos_conversation_ref.connectedConversationId, confirmed.body.value.id);
  assert.equal(agentNode.data.lcos_conversation_state.isRunning, false);
  const moved = await batch({ action: 'update', updates: [{ id: agentNode.id, type: agentNode.type, data: agentNode.data, position: { x: 700, y: 320 } }] });
  assert.equal(moved.status, 200, JSON.stringify(moved.body));
  const falseRunning = await batch({ action: 'update', updates: [{ id: agentNode.id, data: { lcos_conversation_state: { ...agentNode.data.lcos_conversation_state, isRunning: true } } }] });
  assert.equal(falseRunning.status, 409);
  report.cases.push('existing Gen2Host projector places confirmed conversation through real Huabu queries/executor and Core binding; pending skipped, idempotent replay, native geometry allowed, fake running rejected');
  await facade.close(); facade = await startSurfaceCoreFacade({ runtimeRoot, publicOrigin: origin, fullIntegration: true });
  const reopenedAgent = (await call('GET', mainPath)).body.data.nodes.find(node => node.type === 'lcos-conversation');
  assert.equal(reopenedAgent.id, agentNode.id); assert.deepEqual(reopenedAgent.position, { x: 700, y: 320 });
  report.cases.push('conversation carrier binding and geometry persist after reopening both actual stores');

  const titlePath = '/api/lcos/core/entities/artifact/' + encodeURIComponent(newRef.artifactId) + '/title';
  const invalidTitleInput = { title: '标题请求字段校验', mode: 'manual', extra: 'not accepted by Core' };
  const invalidTitleDirect = await directCore('POST', titlePath.slice('/api/lcos/core'.length), invalidTitleInput);
  const invalidTitleViaRouter = await call('POST', titlePath, invalidTitleInput);
  assert.equal(invalidTitleViaRouter.status, invalidTitleDirect.status);
  assert.deepEqual(invalidTitleViaRouter.body, invalidTitleDirect.body,
    'artifact title validation keeps the original Core response envelope/status');
  const titleUpdate = { title: '真实 Artifact 标题回读', mode: 'manual', generatedBy: 'user' };
  const renamed = await call('POST', titlePath, titleUpdate);
  assert.equal(renamed.status, 200, JSON.stringify(renamed.body));
  assert.deepEqual(renamed.body.value, { id: newRef.artifactId, entity: 'artifact', title: titleUpdate.title, mode: 'manual' });
  const renamedArtifact = await call('GET', '/api/lcos/core/artifacts/' + encodeURIComponent(newRef.artifactId));
  assert.equal(renamedArtifact.status, 200);
  assert.equal(renamedArtifact.body.value.artifact.title, titleUpdate.title);
  const foreignRename = await call('POST', '/api/lcos/core/entities/artifact/foreign/title', { title: '不应触达', mode: 'manual' });
  assert.equal(foreignRename.status, 404);
  assert.equal(foreignRename.body.error.code, 'ARTIFACT_NOT_FOUND');
  assert.equal((await call('GET', '/api/lcos/core/entities/artifact/foreign/title')).status, 501,
    'only the exact registered POST artifact-title route is forwarded');
  assert.equal((await call('GET', '/api/lcos/core/entities/workspace/foreign/title')).status, 501);
  report.cases.push('artifact title route forwards Core validation and valid manual title, reads back from the real Artifact, and rejects foreign/non-artifact/unregistered routes');
  const archivePath = projectRoute + '/artifacts/' + encodeURIComponent(newRef.artifactId) + '/archive';
  const archived = await call('POST', archivePath, { operationId: 'explicit-reader-archive' });
  assert.equal(archived.status, 200, JSON.stringify(archived.body));
  assert.ok(archived.body.value.archivedAt);
  const archiveReplay = await call('POST', archivePath, { operationId: 'explicit-reader-archive' });
  assert.equal(archiveReplay.status, 200, JSON.stringify(archiveReplay.body));
  assert.equal(archiveReplay.body.value.archivedAt, archived.body.value.archivedAt);
  const archivedDetail = await call('GET', '/api/lcos/core/artifacts/' + encodeURIComponent(newRef.artifactId));
  assert.equal(archivedDetail.body.value.artifact.archivedAt, archived.body.value.archivedAt);
  const readerRestored = await call('POST', projectRoute + '/artifacts/' + encodeURIComponent(newRef.artifactId) + '/restore', { operationId: 'explicit-reader-restore' });
  assert.equal(readerRestored.status, 200, JSON.stringify(readerRestored.body));
  assert.equal(readerRestored.body.value.archivedAt, undefined);
  assert.equal((await call('POST', projectRoute + '/artifacts/foreign/archive', { operationId: 'foreign' })).status, 404);
  report.cases.push('reader lifecycle actions reach real Core MutationSafetyService; archive/replay/readback/restore preserve exact artifact identity and reject foreign artifact');
  report.passed = true;
} catch (error) { report.passed = false; report.failure = error.stack; throw error; }
finally { await facade?.close(); await mkdir(path.dirname(evidencePath), { recursive: true }); await writeFile(evidencePath, JSON.stringify(report, null, 2) + '\n'); }
console.log(JSON.stringify(report, null, 2));
