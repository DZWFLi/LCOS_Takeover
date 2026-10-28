import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { Server } from 'node:net';
import { pathToFileURL } from 'node:url';
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';

const root = process.cwd(), runtimeBase = path.join(root, '.runtime');
await fs.mkdir(runtimeBase, { recursive: true });
const temp = await fs.mkdtemp(path.join(runtimeBase, 'isolated-native-space-facade-'));
const output = path.join(root, 'output/原画布内核薄接入_20261023/真实Facade', new Date().toISOString().replaceAll(':', '-'));
await fs.mkdir(output, { recursive: true });
const report = { passed: false, cases: [], isolatedRuntime: temp, originalUserDataTouched: false, modelsExecuted: false, remoteRequests: 0, blockedUnownedRequests: [], authBoundary: 'Facade is an internal producer; lab/server owns Bearer authentication. This test never reads a token.' };
const originalFetch = globalThis.fetch;
const environmentKeys = ['LCOS_RECOVERY_TRANSPORT', 'LCOS_CAPTURE_STAGING_ROOT', 'LCOS_OCR_RUNTIME_DIR'];
const previous = Object.fromEntries(environmentKeys.map(key => [key, process.env[key]]));
process.env.LCOS_RECOVERY_TRANSPORT = 'none'; process.env.LCOS_CAPTURE_STAGING_ROOT = path.join(temp, 'capture'); process.env.LCOS_OCR_RUNTIME_DIR = path.join(temp, 'ocr');
let facade, server, request, response, mutationHook;
const ownedOrigins = () => new Set(process._getActiveHandles().filter(value => value instanceof Server && value.listening).flatMap(value => {
  const address = value.address(); return address && typeof address !== 'string' && ['127.0.0.1', '::1'].includes(address.address)
    ? [`http://${address.address === '::1' ? '[::1]' : address.address}:${address.port}`] : [];
}));
globalThis.fetch = async (address, options) => {
  const url = new URL(address instanceof Request ? address.url : String(address));
  if (!ownedOrigins().has(url.origin) || url.port === '56311' || url.port === '56321') { report.blockedUnownedRequests.push({ origin: url.origin, pathname: url.pathname }); throw new Error('Unowned endpoint refused by isolated test.'); }
  return mutationHook ? mutationHook(address, options, originalFetch) : originalFetch(address, options);
};
const waitFor = async predicate => { const deadline = Date.now() + 6000; while (!predicate()) { if (Date.now() > deadline) throw new Error('Local stream evidence timed out.'); await new Promise(resolve => setTimeout(resolve, 5)); } };
try {
  const entry = await buildPilotEntry('lab/pilot/surface-core-facade.ts', path.join(temp, 'facade.mjs'), 'node',
    { coreCollectionTitle: true, coreColorPin: true, coreWorkspaceMembership: true, coreWorkflowCollectionMembers: true, coreMixedScopeContext: true, coreLiveContinuation: true });
  const { startSurfaceCoreFacade } = await import(pathToFileURL(entry));
  facade = await startSurfaceCoreFacade({ runtimeRoot: path.join(temp, 'owned'), publicOrigin: 'http://127.0.0.1:19937',
    fullIntegration: true, nativeCollectionPilot: true, nativeTextPilot: true, nativeAssemblyPilot: true, nativeRailPilot: true });
  const { projectId, repository, origin: coreOrigin } = facade.core;
  const call = (method, url, body) => facade.handle({ method, url, body });
  const canvas = async id => { const result = await call('GET', '/api/canvas/v1/canvases/' + encodeURIComponent(id)); assert.equal(result.status, 200, JSON.stringify(result.body)); return result.body.data; };
  const main = await canvas('surface-core-main'), other = await canvas('surface-core-workflow');
  const text = main.nodes.find(node => node.id === 'surface-main-text'), sourceRef = text.data.lcos_ref;
  const artifactBefore = structuredClone(repository.getArtifact(sourceRef.artifactId));
  const revisionBefore = structuredClone(repository.getArtifactRevision(sourceRef.revisionId));
  const fileBefore = structuredClone(repository.getFileRecord(String(revisionBefore.fileRecordId)));
  const projectRoot = path.resolve(repository.getProject(projectId).rootPath), bodyPath = path.resolve(projectRoot, fileBefore.observedPath);
  assert.ok(bodyPath.startsWith(projectRoot + path.sep), 'Only original synthetic project bytes may be read.');
  const bodyBefore = await fs.readFile(bodyPath);
  const received = await call('POST', '/api/lcos/canvases/' + main.id + '/materials:receive', { projectId,
    artifactId: sourceRef.artifactId, revisionId: sourceRef.revisionId, fileRecordId: String(revisionBefore.fileRecordId),
    targetRef: { kind: 'main' }, position: { x: 500, y: 300 } });
  assert.equal(received.status, 200, JSON.stringify(received.body)); const material = received.body.data;
  assert.ok(material.presentation.id); assert.ok(material.artifact_view_id); assert.ok(material.node.id);
  const nodeId = material.node.id, presentationId = material.presentation.id, viewId = material.artifact_view_id;
  const base = '/api/rfs/' + encodeURIComponent(main.id);
  const capabilities = await call('GET', base + '/capabilities'); assert.equal(capabilities.status, 200, JSON.stringify(capabilities.body));
  assert.deepEqual(capabilities.body.queryTypes, ['GET_SPACE_OUTLINE', 'INSPECT_NODES', 'INSPECT_EDGES']); assert.deepEqual(capabilities.body.commandTypes, ['SET_NODE_GEOMETRY', 'MERGE_NODE_DATA']);
  for (const query of [{ type: 'GET_SPACE_OUTLINE' }, { type: 'INSPECT_NODES', ids: [nodeId] }, { type: 'INSPECT_EDGES' }]) {
    const result = await call('POST', base + '/query', query); assert.equal(result.status, 200, JSON.stringify(result.body)); assert.equal(result.body.type, query.type);
    assert.equal(JSON.stringify(result.body).includes(bodyBefore.toString('utf8')), false);
    const inspect = value => { if (!value || typeof value !== 'object') return; for (const [key, child] of Object.entries(value)) { assert.ok(!['preview', 'summary', 'content'].includes(key), 'No sidecar content in structural output.'); inspect(child); } }; inspect(result.body);
    if (query.type === 'INSPECT_NODES') assert.equal(result.body.result.nodes[0].id, nodeId);
  }
  const outlineSchema = await call('GET', base + '/capabilities/queries/GET_SPACE_OUTLINE'); assert.equal(outlineSchema.status, 200); assert.equal(outlineSchema.body.schema.properties.includePreviews.const, false);
  const commandSchema = await call('GET', base + '/capabilities/commands/SET_NODE_GEOMETRY'); assert.equal(commandSchema.status, 200); assert.equal(commandSchema.body.type, 'SET_NODE_GEOMETRY');
  assert.equal(facade.authorizeKernel(undefined), false); assert.equal(facade.authorizeKernel('Bearer incorrect-synthetic-token'), false);
  report.cases.push('Latest adopted full build starts a real isolated Core and Huabu Space. The actual RFS routes expose exactly three original structural queries and their constrained original schemas; no body/summary/preview or credential is read from the tool boundary.');

  const beforeInvalid = await facade.spatial.read(main.id);
  for (const [method, route, body, expected] of [
    ['GET', '/api/rfs/foreign/capabilities', undefined, 404],
    ['POST', '/api/rfs/foreign/execute', { commands: [] }, 404],
    ['GET', '/api/rfs/x%2Fy/capabilities', undefined, 400],
    ['GET', base + '/capabilities?projectId=foreign', undefined, 404],
    ['GET', base + '/query', undefined, 405],
    ['POST', base + '/capabilities', {}, 405],
    ['GET', base + '/capabilities/suffix', undefined, 404],
    ['GET', base + '/capabilities/commands/CREATE_NODES', undefined, 404],
    ['POST', base + '/query', { type: 'GET_SPACE_OUTLINE', includePreviews: true }, 400],
    ['POST', base + '/execute', { commands: [{ type: 'MERGE_NODE_DATA', patches: [{ nodeId, patch: { content: 'DO_NOT_WRITE_CONTENT' } }] }] }, 400],
    ['POST', base + '/execute', { commands: [{ type: 'DELETE_NODES', nodeIds: [nodeId] }] }, 400],
    ['POST', base + '/execute', { commands: [{ type: 'SET_NODE_GEOMETRY', items: [{ nodeId: 'unknown', position: { x: 1, y: 2 } }] }] }, 404],
  ]) {
    const value = await call(method, route, body); assert.equal(value.status, expected, JSON.stringify({ route, value }));
  }
  const originalWorkspaces = repository.getWorkspaces;
  let internalFailure;
  try {
    repository.getWorkspaces = () => { throw new Error('SYNTHETIC_PRIVATE_RUNTIME_PATH_MUST_NOT_LEAK'); };
    internalFailure = await call('GET', base + '/capabilities');
  } finally { repository.getWorkspaces = originalWorkspaces; }
  assert.equal(internalFailure.status, 503, JSON.stringify(internalFailure.body));
  assert.equal(internalFailure.body.error.code, 'SPACE_OPERATION_UNAVAILABLE');
  assert.equal(JSON.stringify(internalFailure.body).includes('SYNTHETIC_PRIVATE_RUNTIME_PATH_MUST_NOT_LEAK'), false);
  assert.deepEqual(await facade.spatial.read(main.id), beforeInvalid);
  report.cases.push('Actual foreign IDs, encoded separators, unknown/suffixed routes, wrong methods, content previews, material rewrites/deletion and unknown nodes refuse; the entire original persisted Canvas remains unchanged.');

  server = http.createServer(async (req, res) => { try { if (!(await facade.handleCanvasSyncStream(req, res, new URL(req.url, 'http://localhost')))) { res.statusCode = 404; res.end(); } } catch { res.statusCode = 500; res.end(); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let stream = ''; const connected = new Promise((resolve, reject) => {
    request = http.get(`http://127.0.0.1:${server.address().port}/api/canvas/${main.id}/sync/stream`, res => { response = res; res.setEncoding('utf8'); res.on('data', chunk => { stream += chunk; }); resolve(); }); request.on('error', reject);
  });
  await connected; await waitFor(() => stream.includes('event: snapshot'));
  const records = () => stream.split('\n\n').filter(value => value.startsWith('event:')).map(value => ({ type: value.split('\n')[0].slice(7), data: JSON.parse(value.split('\ndata: ')[1]) }));
  const moved = { x: 1020.25, y: 390.5 }, oldVersion = (await facade.spatial.read(main.id)).version;
  const execute = position => call('POST', base + '/execute', { commands: [{ type: 'SET_NODE_GEOMETRY', items: [{ nodeId, position }] }] });
  const movedResult = await execute(moved); assert.equal(movedResult.status, 200, JSON.stringify(movedResult.body));
  assert.equal(movedResult.body.canvasId, main.id); assert.equal(movedResult.body.fromVersion, oldVersion); assert.equal(movedResult.body.toVersion, oldVersion + 1);
  assert.equal(movedResult.body.spatialSaved, true); assert.equal(movedResult.body.coreSaved, true); assert.deepEqual(movedResult.body.changedNodeIds, [nodeId]);
  assert.deepEqual(repository.getPresentationView(projectId, presentationId).state.positions[viewId], moved);
  assert.deepEqual((await facade.spatial.read(main.id)).state.nodes.find(node => node.id === nodeId).position, moved);
  await waitFor(() => records().some(value => value.type === 'update' && value.data.toVersion === movedResult.body.toVersion));
  const movedEvent = records().find(value => value.type === 'update' && value.data.toVersion === movedResult.body.toVersion);
  assert.equal(movedEvent.data.fromVersion, oldVersion); assert.ok(movedEvent.data.deltas.length > 0);
  assert.deepEqual(movedEvent.data.deltas.find(delta => delta.type === 'REPLACE_NODE' && delta.next.id === nodeId).next.position, moved);
  assert.equal(Object.hasOwn(movedResult.body, 'nodes'), false); assert.equal(Object.hasOwn(movedResult.body, 'connections'), false);
  report.cases.push('RFS geometry traverses the original serialized nodes:batchActions, saves both actual Space geometry and original Core Presentation positions, and returns only its real versions/geometry receipts. Real HTTP SSE receives the exact persisted update from the original publisher.');

  const noOpStreamCount = records().filter(value => value.type === 'update').length;
  const noOp = await execute(moved); assert.equal(noOp.status, 200, JSON.stringify(noOp.body)); assert.equal(noOp.body.fromVersion, noOp.body.toVersion); assert.equal(noOp.body.spatialSaved, false); assert.deepEqual(noOp.body.changedNodeIds, []);
  await new Promise(resolve => setTimeout(resolve, 20)); assert.equal(records().filter(value => value.type === 'update').length, noOpStreamCount);
  report.noOpReceipt = noOp.body;
  report.cases.push('Identical original geometry retry is measured: no version increment, no duplicate SSE event, spatialSaved=false and changedNodeIds=[] in the true public receipt.');

  let intercepted = false; const concurrent = { x: 1777, y: 1888 }, partialPosition = { x: 2220.25, y: 890.5 };
  mutationHook = async (address, options, upstream) => {
    const url = new URL(String(address));
    if (!intercepted && options?.method === 'PUT' && url.pathname.endsWith('/presentations/' + encodeURIComponent(presentationId))) {
      intercepted = true; const original = JSON.parse(options.body);
      const changed = { ...original.contract, state: { ...original.contract.state, positions: { ...original.contract.state.positions, [viewId]: concurrent } } };
      const winner = await upstream(address, { ...options, body: JSON.stringify({ contract: changed, expectedVersion: original.expectedVersion }) });
      assert.equal(winner.status, 200, await winner.clone().text());
    }
    return upstream(address, options);
  };
  const beforePartial = (await facade.spatial.read(main.id)).version;
  const partial = await execute(partialPosition); mutationHook = undefined;
  assert.equal(intercepted, true); assert.equal(partial.status, 409, JSON.stringify(partial.body)); assert.equal(partial.body.error.code, 'PARTIAL_COMMIT');
  assert.equal(partial.body.error.details.spatialSaved, true); assert.equal(Object.hasOwn(partial.body.error.details, 'presentationFailure'), false); assert.deepEqual(partial.body.error.details.corePresentationSavedIds, []);
  assert.deepEqual(repository.getPresentationView(projectId, presentationId).state.positions[viewId], concurrent);
  const realPartialSpace = await facade.spatial.read(main.id); assert.equal(realPartialSpace.version, beforePartial + 1); assert.deepEqual(realPartialSpace.state.nodes.find(node => node.id === nodeId).position, partialPosition);
  await waitFor(() => records().some(value => value.type === 'update' && value.data.toVersion === realPartialSpace.version));
  const partialEvent = records().find(value => value.type === 'update' && value.data.toVersion === realPartialSpace.version);
  assert.deepEqual(partialEvent.data.deltas.find(delta => delta.type === 'REPLACE_NODE' && delta.next.id === nodeId).next.position, partialPosition);
  report.partialReceipt = { status: partial.status, code: partial.body.error.code, details: partial.body.error.details };
  report.cases.push('A real competing original Core Presentation PUT wins its CAS: RFS returns truthful PARTIAL_COMMIT/spatialSaved, retains the competing Core layout and already-saved spatial point, and publishes that real spatial update instead of suppressing or inventing success.');

  assert.deepEqual(repository.getArtifact(sourceRef.artifactId), artifactBefore); assert.deepEqual(repository.getArtifactRevision(sourceRef.revisionId), revisionBefore); assert.deepEqual(repository.getFileRecord(String(revisionBefore.fileRecordId)), fileBefore); assert.deepEqual(await fs.readFile(bodyPath), bodyBefore);
  assert.deepEqual(await canvas(other.id), other);
  assert.equal(repository.getProjectExecutionProjection(projectId).runs.length, 0);
  report.cases.push('After success, retry and partial commit, the exact original Artifact, immutable revision, FileRecord and complete body bytes remain unchanged; another Canvas is unchanged and no Run/model was created.');

  const collectionCreated = await call('POST', '/api/lcos/core/projects/' + projectId + '/collections', {
    title: 'Original Collection geometry must keep its own owner', members: [{ type: 'artifact', id: sourceRef.artifactId }],
  });
  assert.equal(collectionCreated.status, 201, JSON.stringify(collectionCreated.body));
  const collectionId = collectionCreated.body.value.id;
  const projected = await call('POST', '/api/lcos/canvases/' + main.id + '/collections:project', { collectionId, position: { x: 3000, y: 1400 } });
  assert.equal(projected.status, 200, JSON.stringify(projected.body));
  const pile = projected.body.data.node;
  assert.equal(pile.type, 'pile'); assert.equal(pile.data.lcos_native_collection, true);
  const rawPile = (await facade.spatial.read(main.id)).state.nodes.find(node => node.id === pile.id);
  assert.equal(rawPile.type, 'note', 'The guard must inspect canonical Collection binding, not trust an input/render type.');
  assert.ok(repository.getProjectionBindings(projectId).some(binding => binding.canvasId === main.id && binding.spatialId === pile.id && binding.entityType === 'collection'));
  const rejectCollectionGeometry = async (items, expectedCode = 'SPACE_COLLECTION_GEOMETRY_NOT_CONNECTED') => {
    const before = await facade.spatial.read(main.id);
    const presentation = structuredClone(repository.getPresentationView(projectId, presentationId));
    const membership = structuredClone(repository.listCollectionMemberships(projectId, collectionId));
    const bindings = structuredClone(repository.getProjectionBindings(projectId));
    const eventCount = records().filter(value => value.type === 'update').length;
    const refused = await call('POST', base + '/execute', { commands: [{ type: 'SET_NODE_GEOMETRY', items }] });
    assert.equal(refused.status, 501, JSON.stringify(refused.body)); assert.equal(refused.body.error.code, expectedCode);
    assert.deepEqual(await facade.spatial.read(main.id), before, 'Every item must be rejected before any original Space write.');
    assert.deepEqual(repository.getPresentationView(projectId, presentationId), presentation);
    assert.deepEqual(repository.listCollectionMemberships(projectId, collectionId), membership);
    assert.deepEqual(repository.getProjectionBindings(projectId), bindings);
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(records().filter(value => value.type === 'update').length, eventCount, 'A rejected mixed batch must not publish a fake/partial geometry update.');
  };
  await rejectCollectionGeometry([{ nodeId: pile.id, position: { x: 3333, y: 1444 } }]);
  await rejectCollectionGeometry([{ nodeId, position: { x: 8888, y: 9999 } }, { nodeId: pile.id, position: { x: 3333, y: 1444 } }]);
  report.cases.push('An actual Core Collection projects to TapNow pile over the original saved note carrier. Canonical binding rejects its external geometry before writing; a mixed normal-text + pile batch preserves the entire Space, Presentation, members, bindings and SSE count.');

  const collectionPath = '/api/lcos/canvases/' + main.id + '/collections/' + encodeURIComponent(collectionId) + '/space';
  const firstOpen = await call('GET', collectionPath); assert.equal(firstOpen.status, 200, JSON.stringify(firstOpen.body));
  const opened = await call('POST', collectionPath, { collectionNodeId: pile.id, expectedVersion: firstOpen.body.data.version });
  assert.equal(opened.status, 200, JSON.stringify(opened.body));
  const frameId = opened.body.data.frame_id; assert.ok(frameId);
  const grouped = await canvas(main.id), group = grouped.nodes.find(node => node.id === frameId);
  assert.equal(group.type, 'group'); assert.equal(group.data.lcosCollectionId, collectionId);
  const children = (await facade.spatial.read(main.id)).state.nodes.filter(node => node.parentId === frameId);
  assert.ok(children.length > 0);
  await rejectCollectionGeometry([{ nodeId: frameId, position: { x: 4444, y: 1555 } }]);
  await rejectCollectionGeometry([{ nodeId: children[0].id, position: { x: 123, y: 234 } }]);
  await rejectCollectionGeometry([{ nodeId: 'surface-main-image', position: { x: 8888, y: 9999 } }, { nodeId: children[0].id, position: { x: 123, y: 234 } }]);
  const reopen = await call('POST', collectionPath, { collectionNodeId: pile.id, expectedVersion: (await facade.spatial.read(main.id)).version });
  assert.equal(reopen.status, 200, JSON.stringify(reopen.body)); assert.equal(reopen.body.data.frame_id, frameId); assert.equal(reopen.body.data.created, false);
  report.cases.push('The original Collection first-open still creates its real Huabu frame and native TapNow group. External frame/member/mixed-item geometry refuses before writing, while the original Collection open/reopen owner remains functional.');

  const context = await canvas('surface-core-context'), normalText = context.nodes.find(node => node.id === 'surface-context-text');
  const normalPosition = { x: normalText.position.x + 17, y: normalText.position.y + 19 };
  const normal = await call('POST', '/api/rfs/' + context.id + '/execute', { commands: [{ type: 'SET_NODE_GEOMETRY', items: [{ nodeId: normalText.id, position: normalPosition }] }] });
  assert.equal(normal.status, 200, JSON.stringify(normal.body)); assert.equal(normal.body.spatialSaved, true);
  assert.deepEqual((await facade.spatial.read(context.id)).state.nodes.find(node => node.id === normalText.id).position, normalPosition);
  const ordinaryId = 'node-native-kernel-ordinary-frame';
  const ordinary = await facade.spatial.execute(main.id, [{ type: 'CREATE_NODES', nodes: [{ id: ordinaryId, nodeType: 'frame', position: { x: 4500, y: 1600 }, size: { width: 500, height: 300 }, data: { label: '原普通分组', sizing: 'manual' } }] }]);
  assert.ok(ordinary.results.every(result => result.applied === true));
  const beforeOrdinary = await facade.spatial.read(main.id);
  const ordinaryMove = await call('POST', base + '/execute', { commands: [{ type: 'SET_NODE_GEOMETRY', items: [{ nodeId: ordinaryId, position: { x: 4600, y: 1700 } }] }] });
  assert.equal(ordinaryMove.status, 200, JSON.stringify(ordinaryMove.body)); assert.equal(ordinaryMove.body.spatialSaved, true);
  const afterOrdinary = await facade.spatial.read(main.id),expectedOrdinary=structuredClone(beforeOrdinary);
  expectedOrdinary.state.nodes.find(node=>node.id===ordinaryId).position={x:4600,y:1700};
  assert.deepEqual(afterOrdinary.state,expectedOrdinary.state);assert.equal(afterOrdinary.version,beforeOrdinary.version+1);
  const ordinaryDto=await canvas(main.id),ordinaryGroup=ordinaryDto.nodes.find(node=>node.id===ordinaryId);
  assert.equal(ordinaryGroup.type,'group');assert.equal(ordinaryGroup.data.createdBy,'client');assert.equal(ordinaryGroup.data.layoutType,'none');
  assert.equal(ordinaryGroup.data.lcosCollectionId,undefined);assert.equal(ordinaryGroup.data.lcos_gui_navigation_pin,false);
  assert.deepEqual(repository.getArtifact(sourceRef.artifactId), artifactBefore); assert.deepEqual(repository.getArtifactRevision(sourceRef.revisionId), revisionBefore); assert.deepEqual(await fs.readFile(bodyPath), bodyBefore);
  report.cases.push('A normal unparented canonical text node still moves through RFS. A genuine ordinary Frame now projects to the same-ID original client Group without fabricated Collection and moves through the original geometry owner; exact other state/body/revision remain unchanged. Canonical Collection/member geometry refusals above remain intact.');
  assert.equal(report.remoteRequests, 0); report.passed = true;
} catch (error) { report.error = { message: error.message, stack: error.stack }; process.exitCode = 1; }
finally {
  mutationHook = undefined; response?.destroy(); request?.destroy();
  if (server) { server.closeAllConnections?.(); await new Promise(resolve => server.close(resolve)); }
  await facade?.close(); globalThis.fetch = originalFetch;
  for (const key of environmentKeys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  await fs.writeFile(path.join(output, 'report.md'), '# 原画布内核真实 Facade 验证\n\n' + (report.passed ? 'PASS' : 'FAIL') + '\n\n范围：RFS 通过实际 facade 内部接口验证，未穿过 lab/server HTTP 鉴权；不据此声称 401、Token 或同源门禁已通过。SSE 使用测试自有 loopback HTTP，连接实际同一原 publisher。\n\n模型请求：0 次实际发出。原 Core 后台曾尝试本机 11434/api/embed，已在发出前阻断并单列在 JSON。\n\n' + report.cases.map((value, index) => `${index + 1}. ${value}`).join('\n') + '\n');
}
console.log(JSON.stringify({ passed: report.passed, cases: report.cases.length, error: report.error, noOpReceipt: report.noOpReceipt, blockedUnownedRequests: report.blockedUnownedRequests, report: path.join(output, 'report.json') }, null, 2));
