import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeRoot = path.join(root, '.runtime', 'native-text-response-cache-' + Date.now());
const output = path.join(root, 'output/原流程收口_20261017d');
await fs.mkdir(output, { recursive: true });
const helper = await buildPilotEntry('lab/pilot/native-text-response-cache.ts', path.join(runtimeRoot, 'cache.mjs'));
const { createNativeTextResponseCache } = await import(pathToFileURL(helper).href);
const report = { at: new Date().toISOString(), passed: false, checks: [], modelExecuted: false, scope: 'Cache unit execution + real isolated Core/Huabu handler; native r6 and browser acceptance are separate.' };
const body = text => ({ canvas_id: 'canvas', lcos_expected_revisions: { node: 'before' },
  actions: [{ action: 'update', updates: [{ id: 'node', data: { text } }] }] });
const post = (token, text = 'draft') => ({ method: 'POST', url: 'http://127.0.0.1/api/canvas/v1/canvases/canvas/nodes:batchActions?lcos_text_save_request=' + token, body: body(text) });
const get = (token, canvas = 'canvas') => ({ method: 'GET', pathname: '/api/lcos/canvases/' + canvas + '/text-save-receipts/' + token });
const token = 'surface-native-batch-unit-first';
let facade;
try {
  let release, writes = 0;
  const actualResult = { status: 200, body: { code: 0, data: { core_saved: true, spatial_saved: true } } };
  const cache = createNativeTextResponseCache({ ownsCanvas: id => id === 'canvas', execute: async () => { writes++; return new Promise(resolve => { release = resolve; }); } });
  assert.equal(cache.handle({ ...post(token), url: 'http://127.0.0.1/api/canvas/v1/canvases/canvas/nodes:batchActions' }), null);
  const first = cache.handle(post(token)), duplicate = cache.handle(post(token));
  await Promise.resolve(); assert.equal(writes, 1);
  assert.equal(cache.handle(get(token)).status, 202);
  assert.equal(cache.handle(post(token, 'different')).status, 409);
  assert.equal(cache.handle(get(token, 'foreign')).status, 404);
  assert.equal(cache.handle({ ...get(token), method: 'POST' }).status, 405);
  release(actualResult); assert.deepEqual(await first, actualResult); assert.deepEqual(await duplicate, actualResult);
  const recovered = cache.handle(get(token));
  assert.equal(recovered.status, 200); assert.deepEqual(recovered.body.value, { requestId: token, canvasId: 'canvas', wireBody: body('draft'), ...actualResult });
  recovered.body.value.body.data.core_saved = false;
  assert.equal(cache.handle(get(token)).body.value.body.data.core_saved, true);
  assert.deepEqual(await cache.handle(post(token)), actualResult); assert.equal(writes, 1);
  report.checks.push('Original in-flight Promise is shared; GET waits honestly; changed token body rejects; exact result is isolated from caller mutation; completed duplicate does not execute');

  const rejected = createNativeTextResponseCache({ ownsCanvas: () => true, execute: async () => ({ status: 409, body: { code: 40900, error: { code: 'STALE_REVISION' } } }) });
  await rejected.handle(post(token)); assert.equal(rejected.handle(get(token)).body.value.status, 409);
  assert.equal(rejected.handle(get(token)).body.value.body.error.code, 'STALE_REVISION');
  report.checks.push('An authentic failed write remains a failed original result, never a recovered success');

  const eviction = createNativeTextResponseCache({ maxEntries: 1, maxBytes: 2048, ownsCanvas: () => true, execute: async () => actualResult });
  await eviction.handle(post(token)); await eviction.handle(post(token + '-next'));
  assert.equal(eviction.handle(get(token)).status, 404); assert.equal(eviction.handle(get(token + '-next')).status, 200);
  let unblock, busyWrites = 0;
  const busy = createNativeTextResponseCache({ maxEntries: 1, maxBytes: 2048, ownsCanvas: () => true, execute: async () => { busyWrites++; return new Promise(resolve => { unblock = resolve; }); } });
  const pending = busy.handle(post(token)); await Promise.resolve();
  assert.equal(busy.handle(post(token + '-next')).status, 503); assert.equal(busyWrites, 1);
  unblock(actualResult); await pending; assert.equal(busy.handle(get(token)).status, 200);
  let hugeWrites = 0;
  const huge = createNativeTextResponseCache({ maxEntries: 2, maxBytes: 1024, ownsCanvas: () => true,
    execute: async () => { hugeWrites++; return { status: 200, body: { data: 'x'.repeat(2048) } }; } });
  assert.equal((await huge.handle(post(token))).status, 200);
  assert.equal(huge.handle(get(token)).status, 404); assert.equal(huge.handle(post(token)).status, 409); assert.equal(hugeWrites, 1);
  report.checks.push('Completed cache entries may be evicted; in-flight entries cannot be displaced and replayed; oversized replies retain an honest non-replay tombstone');

  process.env.LCOS_CAPTURE_STAGING_ROOT = path.join(runtimeRoot, 'capture');
  process.env.LCOS_OCR_RUNTIME_DIR = path.join(runtimeRoot, 'ocr');
  process.env.LCOS_RECOVERY_TRANSPORT = 'none'; process.env.LCOS_OLLAMA_URL = 'http://127.0.0.1:1';
  const entry = await buildPilotEntry('lab/pilot/surface-core-facade.ts', path.join(runtimeRoot, 'facade.mjs'));
  const { startSurfaceCoreFacade } = await import(pathToFileURL(entry).href);
  const origin = 'http://127.0.0.1:39823';
  facade = await startSurfaceCoreFacade({ runtimeRoot, publicOrigin: origin, fullIntegration: true });
  const call = (method, route, requestBody) => facade.handle({ method, pathname: new URL(route, origin).pathname, url: origin + route, body: requestBody });
  const canvas = 'surface-core-main', nodeId = 'surface-main-text';
  const canvasRoute = '/api/canvas/v1/canvases/' + canvas;
  const current = await call('GET', canvasRoute), node = current.body.data.nodes.find(row => row.id === nodeId);
  const realBody = { canvas_id: canvas, lcos_expected_revisions: { [nodeId]: node.lcos_revision_id },
    actions: [{ action: 'update', updates: [{ id: nodeId, data: { text: '# Exact lost receipt\n\nOnly synthetic fixture bytes.\n', lcos_ref: node.data.lcos_ref } }] }] };
  const realToken = 'surface-native-batch-integration-committed';
  const batchRoute = canvasRoute + '/nodes:batchActions?lcos_text_save_request=' + realToken;
  const committed = await call('POST', batchRoute, realBody);
  assert.equal(committed.status, 200, JSON.stringify(committed.body));
  assert.equal(committed.body.data.core_saved, true); assert.equal(committed.body.data.spatial_saved, true);
  assert.notEqual(committed.body.data.lcos_expected_revisions[nodeId], node.lcos_revision_id);
  // Drop the browser's delivery of this result; later recovery reads the actual
  // server result, not a fabricated response or a second text producer call.
  const project = '/api/lcos/core/projects/' + facade.core.projectId;
  const beforeReads = { graph: await call('GET', project + '/graph'), canvas: await call('GET', canvasRoute) };
  const receipt = await call('GET', '/api/lcos/canvases/' + canvas + '/text-save-receipts/' + realToken);
  assert.equal(receipt.status, 200); assert.equal(receipt.body.ok, true);
  assert.deepEqual(receipt.body.value, { requestId: realToken, canvasId: canvas, wireBody: realBody,
    status: committed.status, body: committed.body });
  assert.deepEqual(await call('POST', batchRoute, realBody), committed, 'Exact token must share the first actual result instead of rerunning old CAS');
  const changed = structuredClone(realBody); changed.actions[0].updates[0].data.text = '# another draft';
  assert.equal((await call('POST', batchRoute, changed)).status, 409);
  assert.equal((await call('GET', '/api/lcos/canvases/foreign/text-save-receipts/' + realToken)).status, 404);
  assert.equal((await call('POST', '/api/lcos/canvases/' + canvas + '/text-save-receipts/' + realToken)).status, 405);
  const conflictToken = 'surface-native-batch-integration-conflict';
  const conflict = await call('POST', canvasRoute + '/nodes:batchActions?lcos_text_save_request=' + conflictToken, changed);
  assert.equal(conflict.status, 409); assert.equal(conflict.body.error.code, 'STALE_REVISION');
  const conflictRead = await call('GET', '/api/lcos/canvases/' + canvas + '/text-save-receipts/' + conflictToken);
  assert.equal(conflictRead.body.value.status, 409); assert.deepEqual(conflictRead.body.value.body, conflict.body);
  const afterReads = { graph: await call('GET', project + '/graph'), canvas: await call('GET', canvasRoute) };
  assert.deepEqual(afterReads, beforeReads, 'Receipt GETs, token reuse and rejected CAS must not change Core or space');
  report.checks.push('Real Core + Huabu committed once; read-only GET returns original full receipt with unchanged Core/space; wrong identity/reused body/rejected CAS never invent success');
  report.real = { canvasId: canvas, nodeId, originalRevisionId: node.lcos_revision_id,
    savedRevisionId: committed.body.data.lcos_expected_revisions[nodeId], receiptReadStatus: receipt.status, producerReplayed: false };
  report.passed = true;
} catch (error) { report.failure = error.stack ?? String(error); throw error; }
finally {
  await facade?.close();
  await fs.writeFile(path.join(output, '真实文本回执缓存测试.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}
