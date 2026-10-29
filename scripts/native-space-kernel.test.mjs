import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { EventEmitter } from 'node:events';
import http from 'node:http';
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';

const root = process.cwd(), runtimeBase = path.join(root, '.runtime');
await fs.mkdir(runtimeBase, { recursive: true });
const temp = await fs.mkdtemp(path.join(runtimeBase, 'isolated-native-space-kernel-'));
const output = path.join(root, 'output/原画布内核薄接入_20261023', new Date().toISOString().replaceAll(':', '-'));
await fs.mkdir(output, { recursive: true });
const report = { passed: false, cases: [], modelsExecuted: false, originalUserDataTouched: false, newEventBus: false, originalStorage: true };
const keys = ['HUABU_DATA_DIR', 'HUABU_WORKSPACE', 'LCOS_RECOVERY_TRANSPORT'];
const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
process.env.HUABU_DATA_DIR = path.join(temp, 'private'); process.env.HUABU_WORKSPACE = path.join(temp, 'project'); process.env.LCOS_RECOVERY_TRANSPORT = 'none';
const services = new Set(), servers = new Set();
let mod;
const waitFor = async predicate => { const until = Date.now() + 3000; while (!predicate()) { if (Date.now() > until) throw new Error('Timed out waiting for local test evidence.'); await new Promise(resolve => setTimeout(resolve, 5)); } };
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const update = version => ({ type: 'update', data: { fromVersion: version - 1, toVersion: version, deltas: [], pendingEffects: { mutatedNodes: [], deletedNodeIds: [], contentEditedNodeIds: [], deferredFitFrameIds: [] } } });
const main = 'canvas-native-kernel-one', foreign = 'canvas-native-kernel-foreign';
let owner = { projectId: 'test-project', workspaceId: 'test-workspace', canvasId: main };
const resolveCanvas = id => id === main ? owner : undefined;
function fakeResponse(block = false) {
  const res = new EventEmitter(); res.statusCode = 0; res.headersSent = false; res.destroyed = false; res.writableEnded = false; res.writableLength = 0; res.frames = [];
  res.writeHead = (code, headers) => { res.statusCode = code; res.headersSent = true; res.headers = headers; return res; };
  res.flushHeaders = () => {};
  res.write = frame => { res.frames.push(String(frame)); return !block; };
  res.end = frame => { if (frame) res.frames.push(String(frame)); res.writableEnded = true; res.emit('close'); };
  return res;
}
function fakeRequest(method = 'GET') { const req = new EventEmitter(); req.method = method; req.aborted = false; return req; }
const streamUrl = new URL('http://127.0.0.1/api/canvas/' + main + '/sync/stream');
try {
  const source = [
    `export {createNativeSpaceKernel} from ${JSON.stringify(path.join(root, 'lab/pilot/native-space-kernel.ts').replaceAll('\\', '/'))};`,
    `export {NativeCanvasGuiMarkerError} from ${JSON.stringify(path.join(root, 'lab/pilot/native-canvas-gui-markers.ts').replaceAll('\\', '/'))};`,
    `export {createNativeCanvasSyncStream} from ${JSON.stringify(path.join(root, 'lab/pilot/native-canvas-sync-stream.ts').replaceAll('\\', '/'))};`,
    `export {publishCanvasUpdate,subscribeCanvasUpdates} from ${JSON.stringify(path.join(root, 'lcos/huabu/apps/server/src/modules/canvas/canvas-sync.ts').replaceAll('\\', '/'))};`,
    `export {setWorkspacePath} from ${JSON.stringify(path.join(root, 'lcos/huabu/apps/server/src/modules/workspace.ts').replaceAll('\\', '/'))};`,
    `export {space,createSpace,initStorage,closeStorage} from ${JSON.stringify(path.join(root, 'lcos/huabu/apps/server/src/modules/storage/index.ts').replaceAll('\\', '/'))};`,
    `export {executeOnServer} from ${JSON.stringify(path.join(root, 'lcos/huabu/apps/server/src/modules/canvas/canvas-executor.ts').replaceAll('\\', '/'))};`,
  ].join('\n');
  const entry = path.join(temp, 'entry.ts'); await fs.writeFile(entry, source);
  const bundle = await buildPilotEntry(path.relative(root, entry), path.join(temp, 'entry.mjs'));
  mod = await import(pathToFileURL(bundle));
  await fs.mkdir(process.env.HUABU_WORKSPACE, { recursive: true }); mod.setWorkspacePath(process.env.HUABU_WORKSPACE);
  await mod.initStorage({ structured: { kind: 'disk' }, blobs: { kind: 'disk' } });
  await mod.createSpace(main, 'Native kernel structural test'); await mod.createSpace(foreign, 'Foreign space');
  const created = await mod.executeOnServer({ canvasId: main, originator: { source: 'user' }, commands: [{ type: 'CREATE_NODES', nodes: [
    { nodeType: 'note', position: { x: 10, y: 20 }, data: { label: 'A', content: 'PRIVATE_BODY_NOT_A_STRUCTURAL_RESULT' } },
    { nodeType: 'note', position: { x: 250, y: 20 }, data: { label: 'B', content: 'SECOND_BODY_NOT_A_STRUCTURAL_RESULT' } },
  ] }] });
  assert.equal(created.results[0].applied, true); const nodes = created.results[0].nodes, id = nodes[0].nodeId;
  let commits = 0, nextReceipt;
  const kernel = mod.createNativeSpaceKernel({ resolveCanvas, readCanvas: id => mod.space(id).read(), commitGeometry: async (canvasId, items) => {
    commits++; if (nextReceipt) return nextReceipt;
    return mod.executeOnServer({ canvasId, commands: [{ type: 'SET_NODE_GEOMETRY', items }], originator: { source: 'user' } });
  } });
  const caps = await kernel.capabilities(main);
  assert.deepEqual(caps.queryTypes, ['GET_SPACE_OUTLINE', 'INSPECT_NODES', 'INSPECT_EDGES']); assert.deepEqual(caps.commandTypes, ['SET_NODE_GEOMETRY']); assert.equal(caps.limits.executeMaxCommands, 1);
  assert.equal((await kernel.queryCapability(main, 'GET_SPACE_OUTLINE')).schema.properties.includePreviews.const, false);
  const geometrySchema = await kernel.commandCapability(main, 'SET_NODE_GEOMETRY'); assert.ok(!JSON.stringify(geometrySchema.schema).includes('"size":'));
  for (const query of [{ type: 'GET_SPACE_OUTLINE' }, { type: 'INSPECT_NODES', ids: [id] }, { type: 'INSPECT_EDGES' }]) {
    const value = await kernel.query(main, query); assert.equal(value.type, query.type); assert.equal(JSON.stringify(value).includes('NOT_A_STRUCTURAL_RESULT'), false);
    if (query.type === 'INSPECT_NODES') { assert.equal(value.result.nodes[0].id, id); assert.deepEqual(value.result.nodes[0].position, { x: 10, y: 20 }); }
  }
  report.cases.push('Original disk Space + real executor nodes are read by all three original executeSpaceQuery structural producers; no authored body/preview is exposed. Capabilities and operation schemas advertise only the connected subset.');
  let guiFailure = 'GUI_NODES_UNAVAILABLE', changedOwner = false;
  const unavailableGui = mod.createNativeSpaceKernel({ resolveCanvas: () => changedOwner ? { ...owner, workspaceId: 'changed' } : owner,
    readCanvas: id => mod.space(id).read(), commitGeometry: () => { throw Error('Read must not write'); },
    gui: { read: async () => { if (guiFailure === 'OWNER') { changedOwner = true; throw new mod.NativeCanvasGuiMarkerError(503, 'GUI_NODES_UNAVAILABLE', 'Synthetic unavailable GUI'); }
      throw new mod.NativeCanvasGuiMarkerError(503, guiFailure, 'Synthetic unavailable GUI'); } } });
  const unavailable = await unavailableGui.query(main, { type: 'INSPECT_NODES', ids: [id] });
  assert.equal(unavailable.result.nodes[0].id, id); assert.equal(unavailable.result.nodes[0].gui.available, false);
  assert.equal(unavailable.result.nodes[0].gui.navigation.available, false); assert.equal(Object.hasOwn(unavailable.result.nodes[0].gui.navigation, 'markers'), false);
  guiFailure = 'GUI_CANVAS_OWNER_CHANGED'; await assert.rejects(unavailableGui.query(main, { type: 'INSPECT_NODES', ids: [id] }), e => e.code === 'GUI_CANVAS_OWNER_CHANGED');
  guiFailure = 'OWNER'; await assert.rejects(unavailableGui.query(main, { type: 'INSPECT_NODES', ids: [id] }), e => e.code === 'CANVAS_OWNER_CHANGED'); changedOwner = false;
  report.cases.push('An unavailable canonical GUI projection preserves the actual original structural inspect with explicit unavailable facts, while owner/scene failures still refuse instead of becoming empty or false marker state.');
  for (const input of [{ type: 'SEARCH', query: 'a' }, { type: 'SNAPSHOT_NODES', nodeIds: [id] }, { type: 'GET_SPACE_OUTLINE', includePreviews: true }, { type: 'GET_SPACE_OUTLINE', content: 'x' }]) await assert.rejects(kernel.query(main, input));
  await assert.rejects(kernel.query(foreign, { type: 'GET_SPACE_OUTLINE' }), error => error.status === 404);
  await assert.rejects(kernel.commandCapability(main, 'CREATE_NODES'), error => error.status === 404);
  const changed = mod.createNativeSpaceKernel({ resolveCanvas: (() => { let reads = 0; return () => ++reads === 1 ? owner : { ...owner, workspaceId: 'different' }; })(), readCanvas: id => mod.space(id).read(), commitGeometry: () => { throw new Error('Must not commit changed owner.'); } });
  await assert.rejects(changed.query(main, { type: 'GET_SPACE_OUTLINE' }), error => error.code === 'CANVAS_OWNER_CHANGED');
  report.cases.push('Foreign Space, unconnected search/snapshot/content, unknown schema fields and changed workspace ownership refuse without invoking a write.');
  const receipt = await kernel.execute(main, { commands: [{ type: 'SET_NODE_GEOMETRY', items: [{ nodeId: id, position: { x: 90, y: 80 } }] }] });
  assert.equal(receipt.results[0].applied, true); assert.deepEqual((await mod.space(main).read()).state.nodes.find(node => node.id === id).position, { x: 90, y: 80 });
  nextReceipt = { status: 409, body: { success: false, error: { code: 'PARTIAL_COMMIT', details: { spatialSaved: true } } } };
  assert.equal(await kernel.execute(main, { commands: [{ type: 'SET_NODE_GEOMETRY', items: [{ nodeId: id, position: { x: 91, y: 81 } }] }] }), nextReceipt);
  const count = commits;
  for (const input of [
    { runId: 'do-not-pretend-a-run', commands: [{ type: 'SET_NODE_GEOMETRY', items: [{ nodeId: id, position: { x: 1, y: 1 } }] }] },
    { commands: [{ type: 'SET_NODE_GEOMETRY', items: [{ nodeId: 'missing', position: { x: 1, y: 1 } }] }] },
    { commands: [{ type: 'SET_NODE_GEOMETRY', items: [{ nodeId: id, size: { width: 300, height: 'auto' } }] }] },
    { commands: [{ type: 'SET_NODE_GEOMETRY', items: [{ nodeId: id, size: { width: 300, height: 200 } }] }] },
    { commands: [{ type: 'SET_NODE_GEOMETRY', items: [{ nodeId: id, position: { x: Infinity, y: 1 } }] }] },
    { commands: [{ type: 'DELETE_NODES', nodeIds: [id] }] },
  ]) await assert.rejects(kernel.execute(main, input));
  assert.equal(commits, count);
  report.cases.push('Geometry delegates the validated existing node batch unchanged and returns its real receipt; failure/PARTIAL_COMMIT object identity is preserved. Unknown nodes/content commands/runId/auto-size/nonfinite positions never reach commitGeometry.');

  const race = deferred(); const svc = mod.createNativeCanvasSyncStream({ resolveCanvas, readSnapshot: () => race.promise, heartbeatMs: 100_000 }); services.add(svc);
  const req = fakeRequest(), res = fakeResponse(); const pending = svc.handle(req, res, streamUrl);
  await new Promise(resolve => setImmediate(resolve)); mod.publishCanvasUpdate(main, update(45)); mod.publishCanvasUpdate(foreign, update(900)); race.resolve({ version: 44 }); await pending;
  assert.equal(res.statusCode, 200); assert.ok(res.frames[0].startsWith('event: snapshot\n')); assert.equal(res.frames.length, 2); assert.ok(res.frames[1].includes('"toVersion":45'));
  const before = res.frames.length; res.emit('close'); mod.publishCanvasUpdate(main, update(46)); assert.equal(res.frames.length, before); assert.equal(res.writableEnded, true);
  report.cases.push('Original publisher handshake race is measured: subscribe precedes asynchronous snapshot, snapshot is first, same-Space queued update follows once, foreign Space never appears, close releases subscription.');

  const late = deferred(); const lateSvc = mod.createNativeCanvasSyncStream({ resolveCanvas, readSnapshot: () => late.promise, heartbeatMs: 100_000 }); services.add(lateSvc);
  const lateReq = fakeRequest(), lateRes = fakeResponse(); const lateCall = lateSvc.handle(lateReq, lateRes, streamUrl); await new Promise(resolve => setImmediate(resolve)); lateSvc.dispose(); late.resolve({ version: 44 }); await lateCall;
  assert.equal(lateRes.frames.length, 0); assert.equal(lateRes.writableEnded, true);
  const failedSvc = mod.createNativeCanvasSyncStream({ resolveCanvas, readSnapshot: async () => { throw new Error('synthetic private error must not leak'); } }); services.add(failedSvc);
  const failedRes = fakeResponse(); await failedSvc.handle(fakeRequest(), failedRes, streamUrl); assert.equal(failedRes.statusCode, 503); assert.equal(failedRes.frames.join('').includes('private'), false);
  const foreignRes = fakeResponse(); await svc.handle(fakeRequest(), foreignRes, new URL('http://localhost/api/canvas/' + foreign + '/sync/stream')); assert.equal(foreignRes.statusCode, 404);
  const separatorRes = fakeResponse(); await svc.handle(fakeRequest(), separatorRes, new URL('http://localhost/api/canvas/x%2Fy/sync/stream')); assert.equal(separatorRes.statusCode, 400);
  const methodRes = fakeResponse(); await svc.handle(fakeRequest('POST'), methodRes, streamUrl); assert.equal(methodRes.statusCode, 405);
  const unknownRes = fakeResponse(); assert.equal(await svc.handle(fakeRequest(), unknownRes, new URL(streamUrl + '/extra')), false);
  const resolving = deferred(); const resolvingSvc = mod.createNativeCanvasSyncStream({ resolveCanvas: () => resolving.promise, readSnapshot: async () => { throw new Error('Disposed owner must not start snapshot'); } }); services.add(resolvingSvc);
  const resolvingRes = fakeResponse(); const resolvingCall = resolvingSvc.handle(fakeRequest(), resolvingRes, streamUrl); resolvingSvc.dispose(); resolving.resolve(owner); await resolvingCall;
  assert.equal(resolvingRes.statusCode, 503); assert.equal(resolvingRes.writableEnded, true);
  report.cases.push('Dispose during snapshot prevents late output; failed snapshot releases and returns a generic error. Unknown owner, encoded separators, wrong method and route suffix cannot open an event stream.');

  const blockedSvc = mod.createNativeCanvasSyncStream({ resolveCanvas, readSnapshot: async () => ({ version: 44 }), heartbeatMs: 100_000, maxBufferedBytes: 512 }); services.add(blockedSvc);
  const blockedRes = fakeResponse(true); await blockedSvc.handle(fakeRequest(), blockedRes, streamUrl);
  mod.publishCanvasUpdate(main, update(45)); assert.equal(blockedRes.frames.length, 1); blockedRes.emit('drain'); assert.equal(blockedRes.frames.length, 2);
  for (let version = 46; version < 65; version++) mod.publishCanvasUpdate(main, update(version));
  assert.equal(blockedRes.writableEnded, true); const ended = blockedRes.frames.length; mod.publishCanvasUpdate(main, update(100)); assert.equal(blockedRes.frames.length, ended);
  report.cases.push('Measured false write/drain resumes original event order. A persistently blocked response closes at its byte budget and unsubscribes instead of dropping selected deltas or buffering without bound.');

  const realSvc = mod.createNativeCanvasSyncStream({ resolveCanvas, readSnapshot: async canvasId => ({ version: (await mod.space(canvasId).read()).version }), heartbeatMs: 100_000 }); services.add(realSvc);
  const server = http.createServer(async (req, res) => { try { if (!(await realSvc.handle(req, res, new URL(req.url, 'http://localhost')))) { res.statusCode = 404; res.end(); } } catch { res.statusCode = 500; res.end(); } }); servers.add(server);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const request = http.get(`http://127.0.0.1:${server.address().port}${streamUrl.pathname}`); const connected = deferred(); let text = '', response;
  request.on('response', res => { response = res; res.setEncoding('utf8'); res.on('data', chunk => { text += chunk; }); connected.resolve(); });
  request.on('error', error => connected.reject(error)); await connected.promise; await waitFor(() => text.includes('event: snapshot'));
  const realWrite = await mod.executeOnServer({ canvasId: main, commands: [{ type: 'SET_NODE_GEOMETRY', items: [{ nodeId: id, position: { x: 222, y: 333 } }] }], originator: { source: 'user' } });
  await waitFor(() => text.includes('"toVersion":' + realWrite.toVersion)); assert.equal(response.statusCode, 200); assert.match(response.headers['content-type'], /text\/event-stream/);
  const records = text.split('\n\n').filter(value => value.startsWith('event:')).map(value => ({ event: value.split('\n')[0], data: JSON.parse(value.split('\ndata: ')[1]) }));
  assert.equal(records[0].event, 'event: snapshot'); assert.equal(records[1].event, 'event: update'); assert.equal(records[1].data.toVersion, realWrite.toVersion); assert.deepEqual(records[1].data.deltas, realWrite.deltas);
  response.destroy(); request.destroy(); await new Promise(resolve => setTimeout(resolve, 10));
  realSvc.dispose(); await new Promise(resolve => server.close(resolve)); servers.delete(server);
  report.cases.push('Real loopback HTTP SSE consumes the same original in-process publisher: persisted executeOnServer geometry broadcasts its exact version and deltas to the stream; disconnect and shutdown finish cleanly. No model/Host/remote provider ran.');
  report.passed = true;
} catch (error) { report.error = { name: error.name, message: error.message, stack: error.stack }; process.exitCode = 1; }
finally {
  for (const service of services) service.dispose();
  for (const server of servers) { server.closeAllConnections?.(); await new Promise(resolve => server.close(resolve)); }
  await mod?.closeStorage();
  for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  await fs.writeFile(path.join(output, 'report.md'), '# 原画布内核薄接入定向验证\n\n' + (report.passed ? 'PASS' : 'FAIL') + '\n\n' + report.cases.map((value, index) => `${index + 1}. ${value}`).join('\n') + '\n');
}
console.log(JSON.stringify({ passed: report.passed, cases: report.cases.length, error: report.error, report: path.join(output, 'report.json') }, null, 2));
