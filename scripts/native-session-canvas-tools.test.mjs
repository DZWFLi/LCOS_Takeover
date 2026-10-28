import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { buildPilotEntry, installedRoot } from '../lab/pilot/build-pilot.mjs';
const root = process.cwd(), output = path.join(root, 'output/原会话画布工具_20261023/定向验证', new Date().toISOString().replaceAll(':', '-'));
await fs.mkdir(output, { recursive: true });
const report = { passed: false, checks: [], modelCalls: 0, liveWrites: 0,
  scope: 'Actual installed ACP SDK, original client permission Map and original prompt helper; explicit controlled AgentConnection and facade read/HTTP ports. No real provider claim.' };
const exports = [
  ['AcpAgentClient', 'lcos/huabu/external/agenetes/packages/acp-driver/src/client.ts'],
  ['promptExistingAcpSession', 'lcos/huabu/external/agenetes/packages/acp-driver/src/continuation-prompt.ts'],
  ['installNativeSessionCanvasTools', 'lab/pilot/native-session-canvas-host.ts'],
  ['createNativeSessionCanvasFacade', 'lab/pilot/native-session-canvas-facade.ts'],
  ['createNativeSpaceKernel', 'lab/pilot/native-space-kernel.ts'],
];
const entry = path.join(output, 'actual-owners.ts');
await fs.writeFile(entry, exports.map(([names, file]) => 'export {' + names + '} from ' + JSON.stringify(path.relative(output, path.join(root, file)).replaceAll('\\', '/')) + ';').join('\n'));
const bundle = path.join(output, 'actual-owners.mjs');
await buildPilotEntry(path.relative(root, entry), bundle, 'node', { coreLiveContinuation: true, coreMixedScopeContext: true });
process.env.HUABU_CONNECTION_TOKEN = '0'.repeat(64);
const fixtureRoot = path.join(output, 'controlled-kernel-workspace'), runtime = path.join(fixtureRoot, '.runtime/isolated-test');
await fs.mkdir(path.join(fixtureRoot, 'scripts'), { recursive: true }); await fs.mkdir(runtime, { recursive: true });
const connectionFile = path.join(runtime, 'kernel-connection.json');
process.env.LCOS_NATIVE_CANVAS_TOOLS = JSON.stringify({ projectId: 'project', python: 'C:/test/python.exe', script: path.join(fixtureRoot, 'scripts/mcp.py'), runtimeLabel: 'isolated-test', canvases: { main: true, context: true } });
const { AcpAgentClient, promptExistingAcpSession, installNativeSessionCanvasTools, createNativeSessionCanvasFacade, createNativeSpaceKernel } = await import(pathToFileURL(bundle));
const require = createRequire(path.join(installedRoot, 'huabu/apps/server/package.json'));
const fastify = require('fastify');
const app = fastify({ logger: false });
const until = async predicate => { const end = Date.now() + 2000; while (!predicate()) { if (Date.now() > end) throw new Error('Expected original state not observed.'); await new Promise(resolve => setTimeout(resolve, 5)); } };
let client, kernelServer;
try {
  const sent = [], handlers = new Set(); let activePrompt, discoveredToolCount = 8;
  const emit = message => { for (const handler of handlers) handler(message); };
  const connection = { agentletId: 'agent', sessionId: 'transport', status: 'connected', onMessage(fn) { handlers.add(fn); }, onLifecycle() {},
    send(message) {
      sent.push(structuredClone(message));
      if (message.method?.endsWith('/runtime-add')) queueMicrotask(() => emit({ jsonrpc: '2.0', id: message.id, result: { name: message.params.name, toolCount: discoveredToolCount, replaced: false, shadowedSettings: false } }));
      else if (message.method?.endsWith('/runtime-remove')) queueMicrotask(() => emit({ jsonrpc: '2.0', id: message.id, result: { name: message.params.name, skipped: false } }));
      else if (message.method === 'qwen/status/session/context_usage') queueMicrotask(() => emit({ jsonrpc: '2.0', id: message.id, result: { sessionId: 'native', usage: { mcpTools: ['get_space_outline', 'inspect_nodes', 'inspect_edges', 'set_node_geometry', 'set_node_emphasis', 'set_node_pinned', 'set_node_color_pin', 'rename_color_pin'] } } }));
      else if (message.method === 'session/prompt') {
        activePrompt = message;
        queueMicrotask(() => emit({ jsonrpc: '2.0', id: 'permission-remote', method: 'session/request_permission', params: {
          sessionId: 'native', toolCall: { toolCallId: 'move1', title: 'Move a canvas node', kind: 'edit', status: 'pending', rawInput: { node: 'one' } },
          options: [{ optionId: 'allow-once', name: 'Allow once', kind: 'allow_once' }, { optionId: 'deny', name: 'Deny', kind: 'reject_once' }],
        } }));
      } else if (message.id === 'permission-remote' && message.result) {
        queueMicrotask(() => {
          emit({ jsonrpc: '2.0', method: 'session/update', params: { sessionId: 'native', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Confirmed through original permission.' } } } });
          emit({ jsonrpc: '2.0', id: activePrompt.id, result: { stopReason: 'end_turn' } });
        });
      }
    } };
  let currentConnection = connection;
  client = new AcpAgentClient(connection, { scopeName: 'project' });
  const owner = { client, agentletId: 'agent', threadId: 'thread', sessionId: 'native', namespace: { name: 'project' }, selectionsReplay: null, persistedToDisk: true };
  const bridge = installNativeSessionCanvasTools(app, { getGateway: () => ({ getSession: () => currentConnection }), registry: { get: () => owner } });
  await app.ready();
  const prefix = '/continuation/agentlets/agent/sessions/transport';
  const identity = { projectId: 'project', conversationId: 'conversation', threadId: 'thread', externalSessionId: 'native' };
  const headers = { authorization: 'Bearer ' + process.env.HUABU_CONNECTION_TOKEN };
  const prepare = { ...identity, messageId: 'message', canvasId: 'main', text: 'Move the original node.' };
  const post = (suffix, payload, authorization = headers) => app.inject({ method: 'POST', url: prefix + suffix, headers: authorization, payload });
  const get = suffix => app.inject({ method: 'GET', url: prefix + suffix + '?' + new URLSearchParams(identity), headers });
  const worksite = (projectId, workspaceId) => 'worksite-' + Buffer.from(JSON.stringify([projectId, workspaceId])).toString('base64url');
  const child = worksite('project', 'workspace:method-one');
  let kernelMode = 'normal', kernelToken = '1'.repeat(64), releaseCapabilities;
  const reads = [];
  const kernel = createNativeSpaceKernel({
    resolveCanvas: canvasId => canvasId === child ? { projectId: 'project', workspaceId: 'workspace:method-one', canvasId } : undefined,
    readCanvas: () => { throw new Error('No canvas content is needed to check original capabilities.'); },
    commitGeometry: () => { throw new Error('Capability confirmation cannot change geometry.'); },
    commitPresentation: () => { throw new Error('Capability confirmation cannot change presentation.'); },
  });
  kernelServer = createServer(async (request, response) => {
    reads.push({ url: request.url, authorized: request.headers.authorization === 'Bearer ' + kernelToken });
    response.setHeader('Content-Type', 'application/json');
    if (request.headers.authorization !== 'Bearer ' + kernelToken) { response.writeHead(401); response.end('{}'); return; }
    if (kernelMode === 'redirect') { response.writeHead(302, { Location: '/must-not-follow' }); response.end('{}'); return; }
    if (kernelMode === 'wait') await new Promise(resolve => { releaseCapabilities = resolve; });
    const match = /^\/api\/rfs\/([^/]+)\/capabilities$/.exec(request.url);
    try {
      if (!match) throw { status: 404 };
      const capabilities = await kernel.capabilities(decodeURIComponent(match[1]));
      // This test controls the HTTP capability leaf, not GUI persistence. The
      // actual backend GUI producers have their own real-Core integration.
      capabilities.guiTypes = ['SET_NAVIGATION_PIN', 'SET_COLOR_PIN', 'RENAME_COLOR_PIN'];
      if (kernelMode === 'expanded') capabilities.commandTypes.push('CREATE_NODES');
      if (kernelMode === 'missing-gui') capabilities.guiTypes.pop();
      if (kernelMode === 'expanded-gui') capabilities.guiTypes.push('DELETE_NODES');
      response.end(JSON.stringify(capabilities));
    } catch (error) { response.writeHead(error.status ?? 503); response.end('{}'); }
  });
  await new Promise(resolve => kernelServer.listen(0, '127.0.0.1', resolve));
  const kernelOrigin = 'http://127.0.0.1:' + kernelServer.address().port;
  const writeConnection = value => fs.writeFile(connectionFile, JSON.stringify({ projectId: 'project', origin: kernelOrigin, connectionToken: kernelToken, ...value }));
  await writeConnection({});
  assert.equal((await post('/canvas-tools', prepare, {})).statusCode, 401);
  assert.equal((await post('/canvas-tools', { ...prepare, command: 'untrusted' })).statusCode, 400);
  assert.equal((await post('/canvas-tools', { ...prepare, projectId: 'foreign' })).statusCode, 400);
  assert.equal(sent.length, 0);
  assert.equal((await post('/canvas-tools', prepare)).json().prepared, true);
  assert.equal(sent[0].method, 'qwen/control/session/mcp/runtime-add');
  assert.deepEqual(sent[0].params.config.args.slice(-2), ['--canvas', 'main']);
  assert.equal(sent[0].params.config.alwaysLoadTools, true, 'Own eight tools must not be hidden when the provider has no tool_search.');
  assert.ok(('mcp__' + sent[0].params.name + '__set_node_geometry').length <= 64, 'Model-facing operation suffix remains visible.');
  assert.equal((await get('/canvas-tools')).json().tools.length, 8);
  assert.ok(('mcp__' + sent[0].params.name + '__set_node_emphasis').length <= 64, 'Visual emphasis keeps its readable model-facing suffix.');
  for(const name of ['set_node_pinned','set_node_color_pin','rename_color_pin']){
    assert.ok(('mcp__'+sent[0].params.name+'__'+name).length<=64,'GUI tool suffix stays intact: '+name);
    assert.ok(('mcp__lcos_'+'a'.repeat(32)+'__'+name).length<=64,'Longest permitted original server name retains GUI suffix: '+name);
  }
  report.checks.push('Actual SDK method is session runtime-add; original Bearer, foreign project and caller command are rejected before any SDK mutation; same-session tools are read back.');
  const badPrompt = bridge.beginPrompt(owner, connection, { ...identity, runtimeScope: 'project', text: 'Different text.' }, headers.authorization);
  assert.equal(badPrompt.ok, false);
  const operation = bridge.beginPrompt(owner, connection, { ...identity, runtimeScope: 'project', text: prepare.text }, headers.authorization);
  assert.equal(operation.ok, true);
  const prompt = promptExistingAcpSession(owner, prepare.text, undefined, undefined, operation.onPermissionRequest);
  await until(() => client.readNativePermissions('native').length === 1);
  assert.equal((await post('/canvas-tools', { ...prepare, canvasId: 'context' })).statusCode, 409);
  const waiting = (await get('/canvas-permissions')).json();
  assert.equal(waiting.messageId, 'message'); assert.equal(waiting.requests.length, 1);
  const answer = { ...identity, messageId: 'message', requestId: waiting.requests[0].requestId, decision: { optionId: 'allow-once' } };
  assert.equal((await post('/canvas-permissions', { ...answer, decision: { optionId: 'invented' } })).statusCode, 409);
  assert.equal((await post('/canvas-permissions', { ...answer, messageId: 'other-message' })).statusCode, 409);
  assert.equal(client.readNativePermissions('native').length, 1);
  assert.equal((await post('/canvas-permissions', answer)).json().handled, true);
  const result = await prompt; bridge.endPrompt(operation);
  assert.equal(result.text, 'Confirmed through original permission.');
  assert.equal(client.readNativePermissions('native').length, 0);
  assert.equal((await post('/canvas-permissions', answer)).statusCode, 409);
  assert.equal(sent.filter(item => item.method === 'session/prompt').length, 1);
  report.checks.push('Original prompt actually suspends in its existing permission Map; wrong message/option cannot resolve it, one explicit answer resumes once, and a second answer cannot replay. Busy session cannot switch canvas.');
  assert.equal((await post('/canvas-tools', { ...prepare, messageId: 'message2', canvasId: 'context' })).json().prepared, true);
  const adds = sent.filter(row => row.method?.endsWith('/runtime-add'));
  assert.equal(adds[0].params.name, adds[1].params.name); assert.deepEqual(adds[1].params.config.args.slice(-2), ['--canvas', 'context']);
  currentConnection = { ...connection };
  assert.equal((await get('/canvas-permissions')).statusCode, 409);
  currentConnection = connection;
  let beforeSdk = sent.length;
  for (const canvasId of ['unknown', 'worksite-not-json', child + '=', worksite('foreign', 'workspace:method-one')])
    assert.equal((await post('/canvas-tools', { ...prepare, canvasId })).statusCode, 400);
  assert.equal(sent.length, beforeSdk); assert.equal(reads.length, 0);
  assert.equal((await post('/canvas-tools', { ...prepare, canvasId: worksite('project', 'workspace:unopened') })).statusCode, 409);
  assert.equal(sent.length, beforeSdk);
  report.checks.push('Dynamic worksite decoding is canonical and project-bound; malformed, foreign and arbitrary canvas names never reach MCP, and a correctly encoded unopened Workspace is refused by the original kernel owner check.');

  await writeConnection({ projectId: 'foreign' });
  assert.equal((await post('/canvas-tools', { ...prepare, canvasId: child })).statusCode, 503);
  await writeConnection({ origin: 'https://unrelated.invalid' });
  const beforeRemote = reads.length;
  const unavailableTarget = await post('/canvas-tools', { ...prepare, canvasId: child });
  assert.equal(unavailableTarget.statusCode, 503);
  for (const hidden of [kernelToken, process.env.HUABU_CONNECTION_TOKEN, kernelOrigin, connectionFile, 'unrelated.invalid'])
    assert.equal(unavailableTarget.body.includes(hidden), false);
  assert.equal(reads.length, beforeRemote);
  await writeConnection({}); kernelMode = 'redirect';
  const beforeRedirect = reads.length;
  assert.equal((await post('/canvas-tools', { ...prepare, canvasId: child })).statusCode, 503);
  assert.equal(reads.length, beforeRedirect + 1, 'The fixed connection must not follow a credential-bearing redirect.');
  kernelMode = 'expanded';
  assert.equal((await post('/canvas-tools', { ...prepare, canvasId: child })).statusCode, 503);
  for(const mode of ['missing-gui','expanded-gui']){kernelMode=mode;assert.equal((await post('/canvas-tools',{...prepare,canvasId:child})).statusCode,503);}
  kernelMode = 'normal';
  await writeConnection({ connectionToken: '2'.repeat(64) });
  assert.equal((await post('/canvas-tools', { ...prepare, canvasId: child })).statusCode, 503);
  assert.equal(sent.length, beforeSdk);
  const retainedPreparation = (await get('/canvas-tools')).json();
  assert.equal(retainedPreparation.canvasId, 'context'); assert.equal(retainedPreparation.messageId, 'message2');
  assert.equal(retainedPreparation.phase, 'ready', 'A read-only failed candidate check must retain the prior original preparation.');
  beforeSdk = sent.length; // The original readback itself emits context_usage.
  report.checks.push('Wrong connection project, non-loopback origin, redirects, wrong token, expanded command sets, missing or expanded GUI capabilities all fail before actual SDK runtime-add; errors retain no raw connection or credential.');

  kernelToken = '3'.repeat(64); await writeConnection({}); kernelMode = 'wait';
  const preparingChild = post('/canvas-tools', { ...prepare, canvasId: child });
  await until(() => typeof releaseCapabilities === 'function');
  assert.equal((await post('/canvas-tools', { ...prepare, canvasId: 'main' })).statusCode, 409);
  currentConnection = { ...connection }; releaseCapabilities();
  assert.equal((await preparingChild).statusCode, 409); assert.equal(sent.length, beforeSdk);
  currentConnection = connection; kernelMode = 'normal';
  const dynamicPrepared = await post('/canvas-tools', { ...prepare, messageId: 'child-message', canvasId: child });
  assert.equal(dynamicPrepared.statusCode, 200, dynamicPrepared.body); assert.equal(dynamicPrepared.json().prepared, true);
  assert.deepEqual(sent.at(-1).params.config.args.slice(-2), ['--canvas', child]);
  assert.equal(sent.at(-1).params.config.alwaysLoadTools, true);
  assert.equal((await get('/canvas-tools')).json().canvasId, child);
  report.checks.push('The original Host/installed SDK attach the eight-tool subset to the exact child address using original structural capabilities plus controlled GUI capability HTTP leaf; connection rotation works, concurrent preparation is excluded, and a replaced owner cannot mutate provider tools.');
  discoveredToolCount=5;
  const obsolete=await post('/canvas-tools',{...prepare,messageId:'obsolete-five',canvasId:child});assert.equal(obsolete.statusCode,503,obsolete.body);
  assert.equal(bridge.beginPrompt(owner,connection,{...identity,runtimeScope:'project',text:prepare.text},headers.authorization).ok,false);
  discoveredToolCount=8;assert.equal((await post('/canvas-tools',{...prepare,messageId:'eight-restored',canvasId:child})).json().toolCount,8);
  report.checks.push('An old five-tool provider add receipt remains unconfirmed and cannot start a prompt; a later explicit same-owner eight-tool preparation succeeds without inventing execution.');
  assert.equal((await post('/canvas-tools', { ...prepare, messageId: 'message3', canvasId: null })).json().toolCount, 0);
  assert.equal(sent.at(-1).method, 'qwen/control/session/mcp/runtime-remove');
  report.checks.push('Next idle send replaces its own server target; a same-ID replacement connection fails ownership; a plain send removes only this own canvas service.');

  const canonical = { projectId: 'project', conversationSessionId: 'session', provider: 'provider', conversationRef: 'native' };
  const originMeta = { continuationProvider: 'provider', continuationExternalSessionId: 'native', continuationTransportSessionId: 'transport', continuationThreadId: 'thread', continuationAgentletId: 'agent', continuationRuntimeScope: 'project' };
  const evidence = { externalSessionId: 'native', transportSessionId: 'transport', threadId: 'thread', agentletId: 'agent', runtimeScope: 'project' };
  let existingTurn, finishSend; const nextInputs = [], prepares = [];
  const facade = createNativeSessionCanvasFacade({ enabled: true, projectId: 'project', hostOrigin: 'http://127.0.0.1:1', hostToken: 'test-only',
    repository: { getConnectedConversation: () => canonical, getConversationSessionRuntimeIdentity: () => ({ projectId: 'project', provider: 'provider', originMeta }),
      getContinuationOperationJournal: () => ({ connectedConversationId: 'conversation', cancel: 'none', status: 'established', externalEvidence: evidence }) },
    readTurn: () => existingTurn, resolveCanvas: canvasId => canvasId === child
      ? { projectId: 'project', workspaceId: 'workspace:method-one', canvasId }
      : ['main', 'context'].includes(canvasId) ? { projectId: 'project', workspaceId: 'workspace-' + canvasId, canvasId } : undefined,
    next: async input => { nextInputs.push(input); if (finishSend) await new Promise(resolve => { finishSend = resolve; }); return { status: 200, body: { ok: true } }; },
    request: async (url, options) => { const body = JSON.parse(options.body); if (url.pathname.endsWith('/abandon')) return { ok: true, json: async () => ({ handled: true }) };
      prepares.push(body); return { ok: true, json: async () => ({ prepared: true, ...body, transportSessionId: 'transport', toolCount: 8 }) }; },
  });
  const input = { method: 'POST', pathname: '/api/lcos/core/projects/project/connected-conversations/conversation/collaboration-send',
    body: { conversationId: 'conversation', messageId: 'first', continuationOperationId: 'op', text: 'same original text', orderedReferences: [{ ref: { type: 'scope', scopeId: 'scope' }, mode: 'full' }] },
    canvasAddress: { canvasId: 'main', workspaceId: 'workspace-main' } };
  assert.equal((await facade.handle({ ...input, canvasAddress: { canvasId: 'main', workspaceId: 'foreign' } })).status, 409);
  assert.equal(prepares.length, 0);
  for (const status of ['complete', 'pending']) { existingTurn = { status }; assert.equal((await facade.handle(input)).status, 200); }
  assert.equal(prepares.length, 0); existingTurn = undefined;
  finishSend = true; const running = facade.handle(input); await until(() => typeof finishSend === 'function');
  const concurrent = await facade.handle({ ...input, body: { ...input.body, messageId: 'second' }, canvasAddress: { canvasId: 'context', workspaceId: 'workspace-context' } });
  assert.equal(concurrent.status, 409); assert.equal(prepares.length, 1); finishSend(); await running; finishSend = undefined;
  assert.equal(nextInputs.at(-1), input); assert.deepEqual(nextInputs.at(-1).body.orderedReferences, input.body.orderedReferences);
  report.checks.push('Facade uses original complete/pending turn fast paths before MCP; invalid workspace never prepares; preparation plus original send excludes a concurrent scene switch, preserving exact Scope and body.');
  const dynamicInput = { ...input, body: { ...input.body, messageId: 'child-turn' }, canvasAddress: { canvasId: child, workspaceId: 'workspace:method-one' } };
  assert.equal((await facade.handle(dynamicInput)).status, 200);
  assert.equal(prepares.at(-1).canvasId, child); assert.equal(nextInputs.at(-1), dynamicInput);
  assert.equal((await facade.handle({ ...dynamicInput, canvasAddress: { canvasId: child, workspaceId: 'workspace:foreign' } })).status, 409);
  report.checks.push('Original continuation facade carries the exact dynamic child canvas through preparation and original turn input, while a mismatched child Workspace remains rejected.');
  report.passed = true;
} catch (error) { report.error = { message: error.message, stack: error.stack }; process.exitCode = 1; }
finally { client?.shutdown('test-end'); await app.close(); if (kernelServer) await new Promise(resolve => kernelServer.close(resolve)); await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); }
console.log(JSON.stringify({ ...report, output }, null, 2));
