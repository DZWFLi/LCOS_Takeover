import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'output/画布摘录Drop_20261027/后端隔离真实Core', new Date().toISOString().replace(/[:.]/g, '-'));
const runtimeRoot = path.join(root, '.runtime/native-material-excerpt-' + Date.now());
await fs.mkdir(output, { recursive: true }); await fs.mkdir(runtimeRoot, { recursive: true });
process.env.LCOS_CAPTURE_STAGING_ROOT = path.join(runtimeRoot, 'capture');
process.env.LCOS_OCR_RUNTIME_DIR = path.join(runtimeRoot, 'ocr'); process.env.LCOS_RECOVERY_TRANSPORT = 'none';
const report = { passed: false, checks: [], writes: [], receipts: [], runtimeRoot, activeRuntimeTouched: false,
  models: 0, userProjectFilesWritten: false, scope: 'Actual freshText/createTextArtifact + isolated real Core SQLite/Relation API + Huabu disk executor/Undo/Redo with actual original CT ReactDOMServer+linkedom projection and exact Reader text index. No alternate Markdown parser or running project.' };
let facade; const originalFetch = globalThis.fetch; let fault = null;
try {
  const entry = path.join(runtimeRoot, 'entry.ts');
  const spec = name => JSON.stringify(path.join(root, name).replaceAll('\\', '/'));
  await fs.writeFile(entry, [
    `export {startSurfaceCoreFacade} from ${spec('lab/pilot/surface-core-facade.ts')};`,
    `export {createNodeLifecycle,NodeLifecycleError} from ${spec('lab/pilot/node-lifecycle.ts')};`,
    `export {reviseManagedTextArtifact} from ${spec('lcos/apps/local-core/src/text-artifact-service.ts')};`,
    `export {SqliteMetadataRepository} from ${spec('lcos/apps/local-core/src/metadata-repository.ts')};`,
    `export * from ${spec('lab/pilot/native-material-excerpt.ts')};`,
    `export {decodeNativeReaderSourceLocator} from ${spec('lab/pilot/native-text-location-persistence.ts')};`,
    `export {nativeExcerptSourceText} from ${spec('lab/pilot/native-text-source-projection.ts')};`,
    `export {getCanvasStore} from ${spec('lcos/huabu/apps/server/src/modules/storage/index.ts')};`,
  ].join('\n'));
  const built = await buildPilotEntry(path.relative(root, entry), path.join(runtimeRoot, 'entry.mjs'), 'node', { coreWorkspaceMembership: true });
  const m = await import(pathToFileURL(built));
  facade = await m.startSurfaceCoreFacade({ runtimeRoot: path.join(runtimeRoot, 'owned'), publicOrigin: 'http://127.0.0.1:19967', fullIntegration: true });
  const { repository, projectId, origin } = facade.core, prefix = '/projects/' + encodeURIComponent(projectId);
  const workspace = repository.getWorkspaces(projectId).find(row => row.canvasId === 'surface-core-main'); assert.ok(workspace);
  const canvasId = workspace.canvasId, fail = (status, code, message, details) => { throw new m.NodeLifecycleError(status, code, message, details); };
  const projectText = m.nativeExcerptSourceText;
  globalThis.fetch = async (address, init = {}) => {
    const url = new URL(String(address)); assert.equal(url.origin, origin, 'only the owned temporary Core may receive HTTP');
    const method = init.method ?? 'GET';
    if (!['GET','HEAD','OPTIONS'].includes(method)) report.writes.push({ method, path: url.pathname });
    const match = fault && method === fault.method && url.pathname.includes('/relations');
    if (match && !fault.after) { fault = null; throw new TypeError('controlled owned Relation transport unavailable'); }
    const response = await originalFetch(address, init);
    if (match) { fault = null; await response.arrayBuffer(); throw new TypeError('controlled response lost after owned Relation commit'); }
    return response;
  };
  const lifecycle = m.createNodeLifecycle({ repository, projectId, spatial: facade.spatial,
    workspaceForCanvas: id => repository.getWorkspaces(projectId).find(row => row.canvasId === id),
    publicOrigin: 'http://127.0.0.1:19967', coreOrigin: origin, excerptSourceText: projectText });
  const get = async address => { const response = await fetch(origin + address); const body = await response.json(); assert.ok(response.ok && body.ok, address); return body.value; };
  const facts = async () => ({ graph: await get(prefix + '/graph'), canvas: await facade.spatial.read(canvasId), runs: repository.getProjectExecutionProjection(projectId).runs });
  let serial = 0;
  const operation = (phase = 'apply', id = 'excerpt-' + serial) => ({ version: 1, kind: 'create', phase, operationId: id });
  const create = async (body, payload, extra = {}) => lifecycle.applyAction({ canvasId, lcos_operation: operation('apply', 'excerpt-' + ++serial),
    action: { action: 'create', creates: [{ id: 'excerpt-client-' + serial, type: 'text', position: { x: 50 + serial * 20, y: 200 },
      data: { title: '摘录' + serial, text: body, ...(payload === undefined ? {} : { lcos_material_excerpt: payload }), ...extra } }] } });
  const text = '开头 重复🙂 中间 重复🙂 结尾', quote = '重复🙂';
  const parent = (await create(text)).nodes[0];
  const parentRevision = repository.getArtifactRevision(parent.lcos_ref.revisionId); assert.ok(parentRevision);
  const exactSource = { projectId, title: '原确版来源', artifactId: parent.lcos_ref.artifactId, revisionId: parent.lcos_ref.revisionId,
    fileRecordId: String(parentRevision.fileRecordId) };
  const a = { kind: 'selection', label: '第一处', textRange: { start: text.indexOf(quote), end: text.indexOf(quote) + quote.length, quote } };
  const b = { kind: 'selection', label: '第二处', textRange: { start: text.lastIndexOf(quote), end: text.lastIndexOf(quote) + quote.length, quote } };
  const group = { kind: 'selection', locations: [a, { kind: 'lines', start: 0, end: 0 }, b], selected: b };
  const payload = (locator = b, source = exactSource, body = quote) => ({ schemaVersion: 1, kind: 'material-transfer', capturedAt: new Date().toISOString(), source: { ...source, locator: structuredClone(locator) }, content: { kind: 'text', text: body } });
  await m.reviseManagedTextArtifact(repository, projectId, { artifactId: exactSource.artifactId }, '新版正文不能冒充旧位置', { expectedRevisionId: exactSource.revisionId });
  assert.notEqual(repository.getArtifact(exactSource.artifactId).currentRevisionId, exactSource.revisionId);
  const first = await create(quote, payload(group)); const child = first.nodes[0];
  assert.ok(child.lcos_ref); assert.equal(child.data.lcos_material_excerpt, undefined);
  const links = () => repository.getRelations(projectId);
  const relation = links().find(row => row.sourceEntityId === child.lcos_ref.artifactId && row.targetEntityId === exactSource.artifactId);
  assert.ok(relation); const evidence = relation.evidenceRefs.find(row => row.id === exactSource.artifactId);
  assert.equal(evidence.revisionId, exactSource.revisionId); assert.deepEqual(m.decodeNativeReaderSourceLocator(evidence.sourceAnchor), group);
  assert.equal((await facade.spatial.read(canvasId)).state.nodes.find(row => row.id === child.nodeId).data.lcos_material_excerpt, undefined);
  report.receipts.push({ child: child.lcos_ref, source: exactSource, relationId: relation.id, anchor: evidence.sourceAnchor });
  report.checks.push('historical parent revision remains exact after Current changes; selected repeated UTF16 quote creates once via original producer, full mixed group persists and transient metadata is absent from receipt/carrier');

  const childRevision = repository.getArtifactRevision(child.lcos_ref.revisionId);
  const secondSource = { projectId, title: '第一代摘录', artifactId: child.lcos_ref.artifactId, revisionId: child.lcos_ref.revisionId,
    fileRecordId: String(childRevision.fileRecordId), viewId: child.lcos_ref.artifactViewId };
  const childLocation = { kind: 'selection', textRange: { start: 0, end: quote.length, quote } };
  const second = (await create(quote, payload(childLocation, secondSource))).nodes[0];
  const secondRelation = links().find(row => row.sourceEntityId === second.lcos_ref.artifactId); assert.equal(secondRelation.targetEntityId, child.lcos_ref.artifactId);
  assert.equal(secondRelation.evidenceRefs[0].revisionId, child.lcos_ref.revisionId);
  assert.deepEqual(m.decodeNativeReaderSourceLocator(secondRelation.evidenceRefs[0].sourceAnchor), childLocation);
  assert.deepEqual(m.decodeNativeReaderSourceLocator(repository.getRelation(String(relation.id)).evidenceRefs[0].sourceAnchor), group);
  report.checks.push('real second generation links only its immediate parent exact revision; first generation keeps original parent mixed coordinates without flattening');

  const beforeUndo = await facts();
  await lifecycle.applyAction({ canvasId, lcos_operation: operation('undo', 'excerpt-child-original'),
    lcos_refs: { [child.nodeId]: child.lcos_ref }, lcos_snapshots: { [child.nodeId]: { id: child.nodeId, type: child.type, position: child.position, measured: child.measured,
      data: { ...child.data, lcos_ref: child.lcos_ref } } }, action: { action: 'delete', delete_ids: [child.nodeId] } });
  assert.ok(!(await facade.spatial.read(canvasId)).state.nodes.some(row => row.id === child.nodeId));
  assert.ok(repository.getRelation(String(relation.id)));
  const redo = await lifecycle.applyAction({ canvasId, lcos_operation: operation('redo', 'excerpt-child-original'), action: { action: 'create', creates: [{ id: 'redo-same-child', type: 'text', position: child.position,
    measured: child.measured, data: structuredClone(child.data), lcos_ref: child.lcos_ref }] } });
  assert.deepEqual(redo.nodes[0].lcos_ref, child.lcos_ref); assert.equal(redo.nodes[0].nodeId, 'redo-same-child');
  assert.deepEqual((await facts()).graph.artifacts, beforeUndo.graph.artifacts); assert.deepEqual((await facts()).graph.relations, beforeUndo.graph.relations);
  assert.equal(child.data.label, undefined);
  assert.ok(Number.isFinite(Date.parse(redo.nodes[0].data.lcos_workspace_membership.addedAt)));
  assert.deepEqual(redo.nodes[0].data, { ...child.data, id: 'redo-same-child',
    lcos_workspace_membership: { ...child.data.lcos_workspace_membership,
      addedAt: redo.nodes[0].data.lcos_workspace_membership.addedAt } });
  report.checks.push('complete actual freshText receipt data directly restores through original create Undo/Redo, rotates only carrier ID, preserves exact text/native title and child Artifact/Revision/File/View/both source relations; no hand-picked restore fields or second text producer');

  const richMarkdown = '# 富格式🙂\n\n开头 **重复🙂** 与 [内联链接](https://example.invalid) 尾。\n第二行 `code`。\n\n- 列表项 **末尾**';
  const richText = await projectText(richMarkdown), richQuote = '重复🙂 与 内联链接';
  assert.notEqual(richText, richMarkdown); assert.ok(richText.includes(richQuote));
  const richParent = (await create(richMarkdown)).nodes[0], richRevision = repository.getArtifactRevision(richParent.lcos_ref.revisionId);
  const richSource = { projectId, title: '原CT富格式父材料', artifactId: richParent.lcos_ref.artifactId, revisionId: richParent.lcos_ref.revisionId,
    fileRecordId: String(richRevision.fileRecordId), viewId: richParent.lcos_ref.artifactViewId };
  const richRange = { kind: 'selection', textRange: { start: richText.indexOf(richQuote), end: richText.indexOf(richQuote) + richQuote.length, quote: richQuote } };
  const richGroup = { kind: 'selection', locations: [{ kind: 'lines', start: 0, end: 0 }, richRange], selected: richRange };
  const richChild = (await create(richQuote, payload(richGroup, richSource, richQuote))).nodes[0];
  const richRelation = links().find(row => row.sourceEntityId === richChild.lcos_ref.artifactId); assert.ok(richRelation);
  assert.deepEqual(m.decodeNativeReaderSourceLocator(richRelation.evidenceRefs[0].sourceAnchor), richGroup);
  const badRawQuote = '重复🙂', rawStart = richMarkdown.indexOf(badRawQuote), beforeRawOffset = await facts();
  assert.notEqual(rawStart, richText.indexOf(badRawQuote));
  await assert.rejects(create(badRawQuote, payload({ kind: 'selection', textRange: { start: rawStart, end: rawStart + badRawQuote.length, quote: badRawQuote } }, richSource, badRawQuote)), error => error.code === 'EXCERPT_QUOTE_MISMATCH');
  assert.deepEqual(await facts(), beforeRawOffset);
  report.checks.push('rich Markdown heading/strong/link/list uses actual CT visible UTF16 index through real producer; full mixed selected source persists, raw Markdown offsets reject before every write');
  const facadeCreated = await facade.handle({ method: 'POST', url: '/api/canvas/v1/canvases/' + canvasId + '/nodes:batchActions', body: {
    canvas_id: canvasId, lcos_operation: operation('apply', 'excerpt-through-original-facade'), actions: [{ action: 'create', creates: [{ id: 'facade-rich-excerpt',
      type: 'text', position: { x: 430, y: 290 }, data: { text: richQuote, lcos_material_excerpt: payload(richRange, richSource, richQuote) } }] }],
  } });
  assert.equal(facadeCreated.status, 200, JSON.stringify(facadeCreated.body));
  const facadeReceipt = facadeCreated.body.data.lifecycle_results[0].nodes[0]; assert.equal(facadeReceipt.nodeId, 'facade-rich-excerpt');
  assert.ok(links().find(row => row.sourceEntityId === facadeReceipt.lcos_ref.artifactId)?.evidenceRefs?.[0]?.sourceAnchor);
  assert.equal(facadeReceipt.data.lcos_material_excerpt, undefined);
  report.checks.push('original full-integration nodes:batchActions facade reaches its internally injected actual CT projector and original text producer/Relation receipt; no direct test-only projector port needed');

  // Preserve the actual fi/M8/r6 wire discriminator and factory defaults. The
  // earlier facade fixture omitted them and therefore missed the real GUI 501.
  const capturedPath = 'output/画布摘录Drop_20261027/真实原页成功链/2026-10-26T18-06-03-072Z/report.json';
  // Keep the recorded wire self-contained: regression tests must not require
  // an ignored output directory or a prior real-page test to have been run.
  const captured = { canvas_id: 'surface-core-main', actions: [{ action: 'create', creates: [{
    id: 'text-87c688b8-a85a-460c-a2eb-6f48e38f6e30', canvas_id: 'surface-core-main', type: 'text',
    data: { type: 'pure', title: 'Brief · PortaSplit MVP Brief', text: 'Goal: show a local', prompt: '',
      lcos_material_excerpt: { schemaVersion: 1, kind: 'material-transfer', capturedAt: '2026-10-26T18:06:13.197Z',
        source: { projectId: 'disposable-surface-core-facade', artifactId: 'artifact-brief', revisionId: 'revision-brief-initial',
          fileRecordId: 'file-brief', viewId: 'view-brief', title: 'Brief', locator: { kind: 'selection', label: 'PortaSplit MVP Brief',
            textRange: { start: 21, end: 39, quote: 'Goal: show a local' } } }, content: { kind: 'text', text: 'Goal: show a local' } },
      params: { model: 'gemini-3.1-flash-lite', provider: 'google' } }, position: { x: 1485.25, y: 424.1 }, measured: { width: 250, height: 250 },
  }] }], created_by_role: 'user', lcos_operation: { version: 1, operationId: '5e3134d1-4fda-4a53-ae57-509e799b93b1', kind: 'create', phase: 'apply' },
    lcos_refs: {}, lcos_snapshots: {}, lcos_expected_revisions: { 'surface-main-text': 'revision-text-6e4beaf2-02a1-46b0-b58b-0415b511236b' } };
  const wire = structuredClone(captured), wireNode = wire.actions[0].creates[0];
  assert.equal(wireNode.data.type, 'pure');
  assert.deepEqual(wireNode.data.params, { model: 'gemini-3.1-flash-lite', provider: 'google' });
  wireNode.id = 'facade-real-factory-excerpt'; wire.lcos_operation.operationId = 'excerpt-real-factory-wire';
  wire.lcos_expected_revisions = {}; // the recorded foreign test runtime's unrelated node version is not reused
  const sendWire = body => facade.handle({ method: 'POST', url: '/api/canvas/v1/canvases/' + canvasId + '/nodes:batchActions', body });
  const realFactoryCreated = await sendWire(wire);
  assert.equal(realFactoryCreated.status, 200, JSON.stringify(realFactoryCreated.body));
  for (const owner of [realFactoryCreated.body.data, realFactoryCreated.body.data.lifecycle_results[0]]) {
    assert.equal(owner.core_saved, true); assert.equal(owner.spatial_saved, true);
  }
  const realFactoryReceipt = realFactoryCreated.body.data.lifecycle_results[0].nodes[0];
  assert.equal(realFactoryReceipt.data.text, wireNode.data.text);
  assert.equal(realFactoryReceipt.data.lcos_material_excerpt, undefined);
  assert.equal(realFactoryReceipt.data.type, undefined);
  const realFactoryRelation = links().find(row => row.sourceEntityId === realFactoryReceipt.lcos_ref.artifactId);
  assert.ok(realFactoryRelation);
  assert.equal(realFactoryRelation.targetEntityId, wireNode.data.lcos_material_excerpt.source.artifactId);
  assert.equal(realFactoryRelation.evidenceRefs[0].revisionId, wireNode.data.lcos_material_excerpt.source.revisionId);
  assert.deepEqual(m.decodeNativeReaderSourceLocator(realFactoryRelation.evidenceRefs[0].sourceAnchor), wireNode.data.lcos_material_excerpt.source.locator);
  report.factoryWire = { capturedPath, discriminator: wireNode.data.type, params: wireNode.data.params, responseStatus: realFactoryCreated.status };
  report.checks.push('actual captured fi/M8/r6 pure text/default model-provider DTO passes the full facade, exact Brief bytes/quote and original producer; source relation is exact and canonical receipt omits transient/discriminator fields');
  const nativeReceiptData = structuredClone(realFactoryReceipt.data);
  assert.deepEqual(Object.keys(nativeReceiptData).sort(), ['content','id','lcos_workspace_membership','params','prompt','text','title']);
  const huabuCreated = m.getCanvasStore(canvasId).readNode(realFactoryReceipt.nodeId);
  assert.equal(huabuCreated.label, wireNode.data.title, 'Huabu retains its own note label in its original NodeContent sidecar');
  assert.equal(realFactoryReceipt.data.title, repository.getArtifact(realFactoryReceipt.lcos_ref.artifactId).title);
  const beforeFactoryRoundtrip = await facts();
  const originalFactorySnapshot = { id: realFactoryReceipt.nodeId, canvas_id: canvasId, type: realFactoryReceipt.type,
    data: { ...nativeReceiptData, lcos_ref: structuredClone(realFactoryReceipt.lcos_ref) },
    position: realFactoryReceipt.position, measured: realFactoryReceipt.measured };
  const factoryUndone = await sendWire({ canvas_id: canvasId, created_by_role: 'user',
    lcos_operation: operation('undo', 'excerpt-real-factory-wire'),
    lcos_refs: { [realFactoryReceipt.nodeId]: realFactoryReceipt.lcos_ref },
    lcos_snapshots: { [realFactoryReceipt.nodeId]: structuredClone(originalFactorySnapshot) },
    actions: [{ action: 'delete', delete_ids: [realFactoryReceipt.nodeId] }] });
  assert.equal(factoryUndone.status, 200, JSON.stringify(factoryUndone.body));
  for (const owner of [factoryUndone.body.data, factoryUndone.body.data.lifecycle_results[0]]) {
    assert.equal(owner.core_saved, true); assert.equal(owner.spatial_saved, true);
  }
  assert.ok(!(await facade.spatial.read(canvasId)).state.nodes.some(row => row.id === realFactoryReceipt.nodeId));
  const factoryRedone = await sendWire({ canvas_id: canvasId, created_by_role: 'user',
    lcos_operation: operation('redo', 'excerpt-real-factory-wire'),
    actions: [{ action: 'create', creates: [structuredClone(originalFactorySnapshot)] }] });
  assert.equal(factoryRedone.status, 200, JSON.stringify(factoryRedone.body));
  for (const owner of [factoryRedone.body.data, factoryRedone.body.data.lifecycle_results[0]]) {
    assert.equal(owner.core_saved, true); assert.equal(owner.spatial_saved, true);
  }
  const factoryRestoredReceipt = factoryRedone.body.data.lifecycle_results[0].nodes[0];
  assert.deepEqual(factoryRestoredReceipt.lcos_ref, realFactoryReceipt.lcos_ref);
  assert.ok(Number.isFinite(Date.parse(factoryRestoredReceipt.data.lcos_workspace_membership.addedAt)));
  assert.deepEqual(factoryRestoredReceipt.data, { ...nativeReceiptData,
    lcos_workspace_membership: { ...nativeReceiptData.lcos_workspace_membership,
      addedAt: factoryRestoredReceipt.data.lcos_workspace_membership.addedAt } });
  const huabuRestored = m.getCanvasStore(canvasId).readNode(realFactoryReceipt.nodeId);
  assert.equal(huabuRestored.label, huabuCreated.label);
  assert.equal(huabuRestored.content.trimEnd(), wireNode.data.text);
  assert.deepEqual((await facts()).graph.artifacts, beforeFactoryRoundtrip.graph.artifacts);
  assert.deepEqual((await facts()).graph.relations, beforeFactoryRoundtrip.graph.relations);
  report.factoryRoundtrip = { receiptDataKeys: Object.keys(nativeReceiptData).sort(), fullReturnedDataRestored: true,
    nativeTitle: factoryRestoredReceipt.data.title, huabuLabel: huabuRestored.label, canonicalReference: factoryRestoredReceipt.lcos_ref,
    createUndoRedoCoreSaved: true, createUndoRedoSpatialSaved: true };
  report.checks.push('actual captured factory DTO full canonical returned data, without deleting any field, passes facade Undo then Redo with same identity/source relation; Huabu label stays internal, native title remains, no extra renderer/excerpt/executor field leaks');
  for (const change of ['unknown-renderer','missing-metadata','invalid-metadata','wrong-source','nondefault-model','extra-generation-param','existing-ref','redo','duplicate','update']) {
    const bad = structuredClone(wire), node = bad.actions[0].creates[0];
    node.id = 'facade-reject-' + change; bad.lcos_operation.operationId = 'excerpt-reject-' + change;
    if (change === 'unknown-renderer') node.data.type = 'unknown-renderer';
    else if (change === 'missing-metadata') delete node.data.lcos_material_excerpt;
    else if (change === 'invalid-metadata') node.data.lcos_material_excerpt = null;
    else if (change === 'wrong-source') node.data.lcos_material_excerpt.source.projectId = 'foreign-project';
    else if (change === 'nondefault-model') node.data.params.model = 'unconnected-model';
    else if (change === 'extra-generation-param') node.data.params.times = 2;
    else if (change === 'existing-ref') node.lcos_ref = realFactoryReceipt.lcos_ref;
    else if (change === 'redo') bad.lcos_operation.phase = 'redo';
    else if (change === 'duplicate') bad.lcos_operation.kind = 'duplicate';
    else bad.actions = [{ action: 'update', updates: [{ id: realFactoryReceipt.nodeId, type: 'text', data: node.data }] }];
    const before = await facts(), writesBefore = report.writes.length, rejected = await sendWire(bad);
    assert.ok(rejected.status >= 400, change + ' must not create/save');
    assert.deepEqual(await facts(), before, change + ' must preserve every temporary Core/carrier fact');
    assert.equal(report.writes.length, writesBefore, change + ' must reject before any Core API mutation');
    if (['unknown-renderer','missing-metadata','existing-ref','redo','duplicate','update'].includes(change))
      assert.equal(rejected.body.error.code, 'TEXT_RENDERER_KIND_NOT_CONNECTED', JSON.stringify(rejected.body));
    if (['nondefault-model','extra-generation-param'].includes(change))
      assert.equal(rejected.body.error.code, 'NODE_PARAMS_NOT_IMPLEMENTED', JSON.stringify(rejected.body));
  }
  report.checks.push('unknown/pure without metadata, malformed or foreign excerpt, nondefault/extra generation params, existing identity, redo/duplicate and update stay rejected before every Core/carrier mutation');

  for (const change of ['project','artifact','revision','file','view','quote','offset','invalid-group','no-selected','content-mismatch','unsupported-position','split-surrogate']) {
    const bad = payload(), before = await facts();
    if (change === 'project') bad.source.projectId = 'other';
    else if (change === 'artifact') bad.source.artifactId = child.lcos_ref.artifactId;
    else if (change === 'revision') bad.source.revisionId = child.lcos_ref.revisionId;
    else if (change === 'file') bad.source.fileRecordId = secondSource.fileRecordId;
    else if (change === 'view') bad.source.viewId = child.lcos_ref.artifactViewId;
    else if (change === 'quote') { bad.source.locator.textRange.quote = '错误🙂'; bad.source.locator.textRange.end = bad.source.locator.textRange.start + '错误🙂'.length; bad.content.text = '错误🙂'; }
    else if (change === 'offset') { bad.source.locator.textRange.start = a.textRange.start + 1; bad.source.locator.textRange.end = a.textRange.end + 1; }
    else if (change === 'invalid-group') bad.source.locator = { ...group, selected: { ...b, textRange: { start: 100, end: 100 + quote.length, quote } } };
    else if (change === 'no-selected') bad.source.locator = { kind: 'selection', locations: [a, b] };
    else if (change === 'content-mismatch') bad.content.text = '别的文字';
    else if (change === 'split-surrogate') {
      const start = text.indexOf('🙂') + 1, quote = text.slice(start, start + 1);
      bad.source.locator = { kind: 'selection', textRange: { start, end: start + 1, quote } }; bad.content.text = quote;
    } else bad.source.locator = { kind: 'page', pageNumber: 1 };
    await assert.rejects(create(bad.content.text, bad), error => error instanceof m.NodeLifecycleError, change);
    assert.deepEqual(await facts(), before, change + ' must reject before every carrier/Core write');
  }
  const oldFile = repository.getFileRecord(exactSource.fileRecordId), ownedBytes = await fs.readFile(oldFile.observedPath);
  await fs.writeFile(oldFile.observedPath, '被修改的文件'); const beforeBytesReject = await facts();
  await assert.rejects(create(quote, payload()), error => error.code === 'EXCERPT_SOURCE_BYTES_CHANGED'); assert.deepEqual(await facts(), beforeBytesReject);
  await fs.writeFile(oldFile.observedPath, ownedBytes);
  const hiddenSource = oldFile.observedPath + '.test-missing'; await fs.rename(oldFile.observedPath, hiddenSource);
  try {
    const beforeMissing = await facts();
    await assert.rejects(create(quote, payload()), error => error.code === 'EXCERPT_SOURCE_BYTES_UNAVAILABLE' && !/ENOENT|\.creative-os|[A-Z]:\\/.test(error.message));
    assert.deepEqual(await facts(), beforeMissing);
  } finally { await fs.rename(hiddenSource, oldFile.observedPath); }
  const failingRenderer = m.createNodeLifecycle({ repository, projectId, spatial: facade.spatial,
    workspaceForCanvas: id => repository.getWorkspaces(projectId).find(row => row.canvasId === id), publicOrigin: 'http://127.0.0.1:19967', coreOrigin: origin,
    excerptSourceText: async () => { throw new TypeError('controlled internal renderer exception'); } });
  const beforeRenderer = await facts();
  await assert.rejects(failingRenderer.createText(canvasId, { id: 'no-raw-renderer-error', type: 'text', position: { x: 2, y: 3 },
    data: { text: quote, lcos_material_excerpt: payload() } }), error => error.code === 'EXCERPT_TEXT_UNAVAILABLE' && !/TypeError|internal renderer/.test(error.message));
  assert.deepEqual(await facts(), beforeRenderer);
  report.checks.push('12 wrong/foreign/malformed/ambiguous/split-surrogate coordinates, actual parent file byte mutation/missing file and renderer exception produce zero carrier/Artifact/View/File/relation writes; errors are user wording and do not substitute Current');

  for (const method of ['POST','PUT']) {
    const at = report.writes.length; fault = { method, after: true };
    const saved = (await create(quote, payload())).nodes[0];
    assert.equal(fault, null); assert.ok(links().some(row => row.sourceEntityId === saved.lcos_ref.artifactId && row.evidenceRefs?.[0]?.sourceAnchor));
    assert.equal(report.writes.slice(at).filter(row => row.method === method && row.path.includes('/relations')).length, 1);
  }
  report.checks.push('actual Relation POST and PUT commit with lost transport responses are read back through the same repository; each mutation sent once, no text producer retry');

  fault = { method: 'POST', after: false }; const beforePartial = await facts(); let partial;
  await assert.rejects(create(quote, payload()), error => { partial = error; return error.code === 'PARTIAL_LIFECYCLE_COMMIT'; });
  assert.equal(partial.details.completed.length, 1); const partialChild = partial.details.completed[0];
  assert.equal(partial.details.canvas_id, canvasId); assert.equal(partial.details.operation.kind, 'create');
  assert.equal(partial.details.causeDetails.coreBound, true); assert.equal(partial.details.causeDetails.spatialSaved, true);
  assert.equal(partial.details.causeDetails.nodeId, partialChild.nodeId);
  assert.equal(partial.details.causeDetails.sourceFileRecordId, exactSource.fileRecordId);
  assert.deepEqual(m.decodeNativeReaderSourceLocator(partial.details.causeDetails.sourceAnchor), b);
  assert.deepEqual(partial.details.lcos_refs[partialChild.nodeId], partialChild.lcos_ref); assert.equal(partial.details.client_to_spatial_ids[partialChild.clientNodeId], partialChild.nodeId);
  assert.ok(repository.getArtifact(partialChild.lcos_ref.artifactId)); assert.ok((await facade.spatial.read(canvasId)).state.nodes.some(row => row.id === partialChild.nodeId));
  assert.equal(links().some(row => row.sourceEntityId === partialChild.lcos_ref.artifactId), false);
  assert.equal((await facts()).graph.artifacts.length, beforePartial.graph.artifacts.length + 1);
  const source = await m.validateNativeMaterialExcerpt({ repository, projectId, value: payload(), body: quote, read: file => fs.readFile(file), projectText, fail });
  const linkOnly = m.createNativeMaterialExcerptRelations({ repository, projectId, coreOrigin: origin, fail });
  await linkOnly(partialChild.lcos_ref.artifactId, source);
  assert.equal((await facts()).graph.artifacts.length, beforePartial.graph.artifacts.length + 1);
  assert.ok(links().find(row => row.sourceEntityId === partialChild.lcos_ref.artifactId)?.evidenceRefs?.[0]?.sourceAnchor);
  report.partialReceipt = partial.details;
  report.checks.push('source-link failure after real text commit retains exact original completed/ref/client receipt and carrier; explicit link-only recovery uses same child and creates no replacement text');
  assert.equal(repository.getProjectExecutionProjection(projectId).runs.length, 0);
  const databasePath = facade.core.databasePath, savedRelations = structuredClone(links()), savedRefs = [child.lcos_ref, second.lcos_ref, partialChild.lcos_ref];
  await facade.close(); facade = undefined;
  const reopened = new m.SqliteMetadataRepository(databasePath, { disposableOnly: true });
  try {
    assert.deepEqual(reopened.getRelations(projectId), savedRelations);
    for (const ref of savedRefs) {
      assert.equal(String(reopened.getArtifact(ref.artifactId)?.currentRevisionId), ref.revisionId);
      assert.equal(String(reopened.getArtifactView(ref.artifactViewId)?.artifactId), ref.artifactId);
      assert.ok(reopened.getFileRecord(String(reopened.getArtifactRevision(ref.revisionId)?.fileRecordId)));
    }
    assert.equal(reopened.getProjectExecutionProjection(projectId).runs.length, 0);
  } finally { reopened.close(); }
  report.checks.push('closing actual owned Core and reopening SQLite preserves both generation sourceAnchors, recovered source relation and exact child identities; no memory-only lineage claim');
  report.passed = true;
} catch (error) { report.error = { message: error.message, code: error.code, stack: error.stack }; process.exitCode = 1; }
finally { globalThis.fetch = originalFetch; await facade?.close(); await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ passed: report.passed, checks: report.checks, error: report.error, output }, null, 2)); }
