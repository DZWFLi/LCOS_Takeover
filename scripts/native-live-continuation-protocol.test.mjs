import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';

const root = process.cwd(), runtimeBase = path.join(root, '.runtime');
await fs.mkdir(runtimeBase, { recursive: true });
const runtimeRoot = await fs.mkdtemp(path.join(runtimeBase, 'isolated-live-continuation-protocol-'));
const output = path.join(root, 'output/混合Scope取用_20261022/真实续聊协议代理', new Date().toISOString().replaceAll(':', '-'));
await fs.mkdir(output, { recursive: true });
for (const key of Object.keys(process.env)) if (/^(?:HUABU_|LCOS_|LOCAL_CORE_)/.test(key)) delete process.env[key];
process.env.LCOS_RECOVERY_TRANSPORT = 'none';
process.env.LCOS_CAPTURE_STAGING_ROOT = path.join(runtimeRoot, 'capture');
process.env.LCOS_OCR_RUNTIME_DIR = path.join(runtimeRoot, 'ocr');
const report = { passed: false, runtimeRoot, realBrowserVerified: false, modelRequests: 0, realHostStarted: false,
  originalUserDatabaseOpened: false, cases: [], forwards: [], delayObservations: [] };
const originalFetch = globalThis.fetch.bind(globalThis);
const allowedOrigins = new Set();
let repository, coreServer, delayedServer, coreOrigin;
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (!allowedOrigins.has(url.origin)) { report.modelRequests++; throw new Error('External/provider fetch is forbidden in this protocol regression.'); }
  report.forwards.push({ origin: url.origin, path: url.pathname, method: init?.method ?? 'GET' });
  return originalFetch(input, init);
};
const call = (router, method, pathname, body) => router.handle({ method, pathname, url: 'http://127.0.0.1' + pathname, body });
async function direct(method, pathname, body) {
  const response = await originalFetch(coreOrigin + pathname, { method, headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(8000) });
  return { status: response.status, body: await response.json() };
}
try {
  const coreFile = path.join(runtimeRoot, 'core.mjs'), routerFile = path.join(runtimeRoot, 'router.mjs');
  await buildPilotEntry('lcos/apps/local-core/src/index.ts', coreFile, 'node', { coreLiveContinuation: true, coreMixedScopeContext: true });
  await buildPilotEntry('lab/pilot/core-protocol-router.ts', routerFile, 'node');
  const core = await import(pathToFileURL(coreFile));
  const { createCoreProtocolRouter } = await import(pathToFileURL(routerFile));
  repository = new core.SqliteMetadataRepository(path.join(runtimeRoot, 'core.sqlite'), { disposableOnly: true });
  const projectRoot = path.join(runtimeRoot, 'synthetic-project'); await fs.mkdir(projectRoot, { recursive: true });
  const snapshot = core.createMvpSampleSnapshot(projectRoot); repository.save(snapshot);
  const projectId = String(snapshot.project.id);
  coreServer = core.createLocalCoreServer({ metadataRepository: repository, port: 0, allowedOrigins: [],
    previewCacheRoot: path.join(runtimeRoot, 'preview-cache'), agentletsRoot: path.join(runtimeRoot, 'agentlets') });
  const address = await coreServer.start(); coreOrigin = `http://${address.host}:${address.port}`; allowedOrigins.add(coreOrigin);
  const router = createCoreProtocolRouter({ coreOrigin, projectId });
  const prefix = '/api/lcos/core/projects/' + encodeURIComponent(projectId);
  const operationId = 'protocol-operation-中文 space';
  const submit = await call(router, 'POST', prefix + '/conversation-continuations', { operationId,
    mode: 'blank_new', contextInheritance: 'none', checkout: 'shared', provider: 'codex' });
  assert.equal(submit.status, 201, JSON.stringify(submit)); assert.equal(submit.body.ok, true);
  const operationPath = `/projects/${encodeURIComponent(projectId)}/conversation-continuations/${encodeURIComponent(operationId)}`;
  const directOperation = await direct('GET', operationPath);
  assert.equal(directOperation.status, 200, JSON.stringify(directOperation));
  const routedOperation = await call(router, 'GET', '/api/lcos/core' + operationPath);
  assert.deepEqual(routedOperation, directOperation);
  assert.equal(routedOperation.body.value.operationId, operationId);
  const missing = await call(router, 'GET', prefix + '/conversation-continuations/missing-exact-operation');
  assert.equal(missing.status, 404); assert.equal(missing.body.error.code, 'NOT_FOUND');
  report.cases.push('Real disposable Core creates one unsent journal; exact GET operation preserves its Unicode/space opaque ID and original envelope, and missing exact ID returns original 404.');

  const send = await call(router, 'POST', prefix + '/connected-conversations/not-started-receiver/collaboration-send',
    { operationId, messageId: 'never-sent-message', text: 'Protocol owner check only; no provider is configured.' });
  const directSend = await direct('POST', `/projects/${encodeURIComponent(projectId)}/connected-conversations/not-started-receiver/collaboration-send`,
    { operationId, messageId: 'never-sent-message', text: 'Protocol owner check only; no provider is configured.' });
  assert.equal(send.status, 503, JSON.stringify(send)); assert.equal(send.body.error.code, 'UNAVAILABLE'); assert.deepEqual(send, directSend);
  assert.notEqual(send.body.error.code, 'CORE_OPERATION_NOT_CONNECTED');
  const recovery = await call(router, 'POST', '/api/lcos/core' + operationPath + '/recovery-actions', { kind: 'recover_external', expectedRevision: routedOperation.body.value.revision });
  assert.equal(recovery.status, 503, JSON.stringify(recovery)); assert.equal(recovery.body.error.code, 'UNAVAILABLE');
  assert.deepEqual((await direct('GET', operationPath)).body, directOperation.body);
  report.cases.push('POST collaboration-send and recovery reach the original Core producer and return exact provider-unconfigured 503, rather than facade 501; the journal remains unchanged and no provider starts.');

  const imported = await call(router, 'POST', prefix + '/conversations/import-manual', {
    title: '原消息分页与维护验证', scopeId: String(snapshot.scopes[0].id),
    entries: [
      { role: 'user', contentText: '第一条原问题，中文与换行\n逐字保留。', createdAt: '2026-10-23T01:00:00.000Z' },
      { role: 'assistant', contentText: '第二条原回复。', createdAt: '2026-10-23T01:00:01.000Z' },
      { role: 'tool', toolName: 'original-test-tool', contentText: '第三条原工具结果。', createdAt: '2026-10-23T01:00:02.000Z' },
      { role: 'assistant', contentText: '第四条原回复。', createdAt: '2026-10-23T01:00:03.000Z' },
      { role: 'user', contentText: '第五条原后续问题。', createdAt: '2026-10-23T01:00:04.000Z' },
    ],
  });
  assert.equal(imported.status, 201, JSON.stringify(imported));
  const conversationId = imported.body.value.session.id;
  const conversationPath = `/projects/${encodeURIComponent(projectId)}/conversations/${encodeURIComponent(conversationId)}`;
  const allMessages = await direct('GET', conversationPath + '/messages?offset=0&limit=100');
  assert.equal(allMessages.status, 200); assert.equal(allMessages.body.value.length, 5);
  const paged = [];
  for (const [offset, limit] of [[0, 2], [2, 2], [4, 2], [5, 2]]) {
    const query = `?offset=${offset}&limit=${limit}`;
    const pathname = '/api/lcos/core' + conversationPath + '/messages';
    const result = await router.handle({ method: 'GET', pathname, url: 'http://127.0.0.1' + pathname + query });
    const original = await direct('GET', conversationPath + '/messages' + query);
    assert.deepEqual(result, original, 'Original message envelope and pagination must remain unchanged.');
    assert.deepEqual(result.body.value, allMessages.body.value.slice(offset, offset + limit));
    paged.push(...result.body.value);
  }
  assert.deepEqual(paged, allMessages.body.value);
  const missingMessages = await call(router, 'GET', prefix + '/conversations/missing-original-session/messages');
  assert.deepEqual(missingMessages, await direct('GET', `/projects/${encodeURIComponent(projectId)}/conversations/missing-original-session/messages`));
  assert.equal(missingMessages.status, 404);
  report.cases.push('Original importManual creates a real five-message archive; exact conversation messages GET preserves every original paged envelope, ID, sequence, role, sourceEventId, body and fileRefs, including final partial and empty pages. Missing session remains the original 404.');

  const refresh = await call(router, 'POST', '/api/lcos/core' + conversationPath + '/sections/refresh', {});
  assert.equal(refresh.status, 200, JSON.stringify(refresh)); assert.equal(refresh.body.ok, true);
  const persistedSections = await direct('GET', conversationPath + '/sections');
  assert.deepEqual(refresh, persistedSections, 'The same original refresh call must return exactly the sections that its service persisted.');
  assert.deepEqual(await call(router, 'GET', '/api/lcos/core' + conversationPath + '/sections'), persistedSections);
  assert.deepEqual(await direct('GET', conversationPath + '/messages?offset=0&limit=100'), allMessages);
  const missingRefresh = await call(router, 'POST', prefix + '/conversations/missing-original-session/sections/refresh', {});
  assert.equal(missingRefresh.status, 409); assert.equal(missingRefresh.body.error.code, 'CONFLICT');
  report.cases.push('Exact existing sections/refresh POST reaches the original archive/section service: its response exactly matches the same committed sections read directly from Core, messages remain unchanged, and missing session keeps the original conflict.');

  const forwardsBeforeRejects = report.forwards.length;
  for (const [method, pathname, body, status, code] of [
    ['GET', '/api/lcos/core/projects/foreign/conversation-continuations/' + encodeURIComponent(operationId), undefined, 404, 'PROJECT_NOT_FOUND'],
    ['POST', '/api/lcos/core/projects/foreign/connected-conversations/c/collaboration-send', {}, 404, 'PROJECT_NOT_FOUND'],
    ['GET', prefix + '/conversation-continuations/op%2Fextra', undefined, 400, 'INVALID_CORE_ADDRESS'],
    ['GET', prefix + '/conversation-continuations/op%5cextra', undefined, 400, 'INVALID_CORE_ADDRESS'],
    ['GET', prefix + '/conversation-continuations/%2e%2e', undefined, 400, 'INVALID_CORE_ADDRESS'],
    ['GET', prefix + '/conversation-continuations/op%ZZ', undefined, 400, 'INVALID_CORE_ADDRESS'],
    ['POST', prefix + '/connected-conversations/c/collaboration-send', { projectId: 'foreign' }, 400, 'PROJECT_ID_MISMATCH'],
    ['GET', prefix + '/conversation-continuations/op/not-a-real-action', undefined, 501, 'CORE_OPERATION_NOT_CONNECTED'],
    ['POST', prefix + '/connected-conversations/c/collaboration-send/extra', {}, 501, 'CORE_OPERATION_NOT_CONNECTED'],
    ['DELETE', prefix + '/conversation-continuations/op', undefined, 501, 'CORE_OPERATION_NOT_CONNECTED'],
    ['GET', '/api/lcos/core/projects/foreign/conversations/' + encodeURIComponent(conversationId) + '/messages', undefined, 404, 'PROJECT_NOT_FOUND'],
    ['GET', '/api/lcos/core/projects/foreign/conversations/' + encodeURIComponent(conversationId) + '/sections', undefined, 404, 'PROJECT_NOT_FOUND'],
    ['POST', '/api/lcos/core/projects/foreign/conversations/' + encodeURIComponent(conversationId) + '/sections/refresh', {}, 404, 'PROJECT_NOT_FOUND'],
    ['GET', prefix + '/conversations/session%2Fextra/messages', undefined, 400, 'INVALID_CORE_ADDRESS'],
    ['GET', prefix + '/conversations/session%5cextra/messages', undefined, 400, 'INVALID_CORE_ADDRESS'],
    ['POST', prefix + '/conversations/session%2Fextra/sections/refresh', {}, 400, 'INVALID_CORE_ADDRESS'],
    ['POST', prefix + '/conversations/session%5cextra/sections/refresh', {}, 400, 'INVALID_CORE_ADDRESS'],
    ['GET', prefix + '/conversations/session%ZZ/messages', undefined, 400, 'INVALID_CORE_ADDRESS'],
    ['POST', '/api/lcos/core' + conversationPath + '/sections/refresh', { projectId: 'foreign' }, 400, 'PROJECT_ID_MISMATCH'],
    ['POST', '/api/lcos/core' + conversationPath + '/messages', {}, 501, 'CORE_OPERATION_NOT_CONNECTED'],
    ['DELETE', '/api/lcos/core' + conversationPath + '/messages', undefined, 501, 'CORE_OPERATION_NOT_CONNECTED'],
    ['GET', '/api/lcos/core' + conversationPath + '/sections/refresh', undefined, 501, 'CORE_OPERATION_NOT_CONNECTED'],
    ['PUT', '/api/lcos/core' + conversationPath + '/sections/refresh', {}, 501, 'CORE_OPERATION_NOT_CONNECTED'],
    ['GET', '/api/lcos/core' + conversationPath + '/messages/extra', undefined, 501, 'CORE_OPERATION_NOT_CONNECTED'],
    ['GET', '/api/lcos/core' + conversationPath + '/sections/extra', undefined, 501, 'CORE_OPERATION_NOT_CONNECTED'],
    ['POST', '/api/lcos/core' + conversationPath + '/sections/refresh/extra', {}, 501, 'CORE_OPERATION_NOT_CONNECTED'],
  ]) {
    const result = await call(router, method, pathname, body); assert.equal(result.status, status, JSON.stringify(result)); assert.equal(result.body.error.code, code);
  }
  assert.equal(report.forwards.length, forwardsBeforeRejects);
  report.cases.push('Foreign projects/bodies, encoded separators/traversal, malformed encoding and unknown route/method suffixes are rejected before any upstream forwarding.');

  const controlledRequests = [];
  delayedServer = http.createServer(async (request, response) => {
    if (request.url === '/warmup') { response.setHeader('content-type', 'application/json'); response.end(JSON.stringify({ ok: true, value: {} })); return; }
    const started = performance.now();
    const item = { method: request.method, path: request.url, responded: false }; controlledRequests.push(item);
    request.resume();
    await new Promise(resolve => setTimeout(resolve, 80));
    item.elapsedMs = performance.now() - started;
    if (!response.destroyed) { item.responded = true; response.setHeader('content-type', 'application/json'); response.end(JSON.stringify({ ok: true, value: { method: request.method, path: request.url, delayMs: 80 } })); }
  });
  await new Promise((resolve, reject) => { delayedServer.once('error', reject); delayedServer.listen(0, '127.0.0.1', resolve); });
  const delayedOrigin = `http://127.0.0.1:${delayedServer.address().port}`; allowedOrigins.add(delayedOrigin);
  await originalFetch(delayedOrigin + '/warmup');
  const bounded = createCoreProtocolRouter({ coreOrigin: delayedOrigin, projectId, timeoutMs: 20 });
  const ordinary = await call(bounded, 'GET', prefix + '/graph');
  assert.equal(ordinary.status, 503); assert.equal(ordinary.body.error.code, 'CORE_TRANSPORT_UNAVAILABLE');
  for (const pathname of [prefix + '/connected-conversations/c/collaboration-send', prefix + '/conversation-continuations/op/recovery-actions']) {
    const started = performance.now(); const result = await call(bounded, 'POST', pathname, {});
    const elapsedMs = performance.now() - started;
    assert.equal(result.status, 200, JSON.stringify(result)); assert.equal(result.body.ok, true); assert.equal(result.body.value.delayMs, 80);
    assert.ok(elapsedMs >= 65, `The controlled 80ms upstream must really be awaited, observed ${elapsedMs}ms.`);
    report.delayObservations.push({ pathname, elapsedMs, status: result.status });
  }
  // Ordinary exact-op reads still use the caller's small read budget, despite
  // belonging to the same continuation domain as the two longer POST actions.
  const ordinaryOperation = await call(bounded, 'GET', prefix + '/conversation-continuations/op');
  assert.equal(ordinaryOperation.status, 503); assert.equal(ordinaryOperation.body.error.code, 'CORE_TRANSPORT_UNAVAILABLE');
  report.cases.push('Controlled real loopback upstream delays 80ms: send and recovery POST await the response past a 20ms base timeout; graph and exact-op GET still time out under that same 20ms read budget.');
  report.controlledUpstream = controlledRequests;
  assert.equal(report.modelRequests, 0);
  report.passed = true;
} catch (error) { report.error = { message: error.message, stack: error.stack }; process.exitCode = 1; }
finally {
  globalThis.fetch = originalFetch;
  if (delayedServer) { delayedServer.closeAllConnections(); await new Promise(resolve => delayedServer.close(resolve)); }
  await coreServer?.close(); repository?.close();
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
}
console.log(JSON.stringify({ passed: report.passed, cases: report.cases, error: report.error, report: path.join(output, 'report.json') }, null, 2));
