import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const root = process.cwd(), origin = 'http://127.0.0.1:56311', hostOrigin = 'http://127.0.0.1:56321';
const projectId = 'disposable-surface-core-facade', conversationId = 'connected-conversation-b0b62164-091e-4656-b495-40da78541bf0';
const prefix = '/api/lcos/core/projects/' + projectId;
const output = path.join(root, 'output/原会话画布工具_20261023/真实会话挂载', new Date().toISOString().replaceAll(':', '-'));
await fs.mkdir(output, { recursive: true });
const report = { passed: false, output, checks: [], modelCalls: 0, geometryWrites: 0, operations: [] };
const parse = text => JSON.parse(text.replace(/^\uFEFF/, ''));
const read = async route => { const response = await fetch(origin + route, { redirect: 'error', signal: AbortSignal.timeout(20_000) });
  const body = await response.json(); assert.ok(response.ok && body.ok === true); return body.value; };
let token, owner, hostPath;
const host = async (suffix, method = 'GET', extra = {}, authorized = true) => {
  const body = { ...owner, ...extra }, url = new URL(hostPath + suffix, hostOrigin);
  if (method === 'GET') url.search = new URLSearchParams(body).toString();
  const response = await fetch(url, { method, redirect: 'error', signal: AbortSignal.timeout(50_000),
    headers: { 'Content-Type': 'application/json', ...(authorized ? { Authorization: 'Bearer ' + token } : {}) },
    ...(method === 'GET' ? {} : { body: JSON.stringify(body) }) });
  const value = await response.json(); return { status: response.status, value };
};
try {
  const health = await (await fetch(origin + '/health')).json(); assert.equal(health.realCoreConnected, true); report.pid = health.pid;
  const connected = (await read(prefix + '/connected-conversations')).find(row => row.id === conversationId);
  const session = (await read(prefix + '/conversations')).find(row => row.id === connected?.conversationSessionId);
  assert.ok(session); const native = session.originMeta;
  owner = { projectId, conversationId, threadId: native.continuationThreadId, externalSessionId: native.continuationExternalSessionId };
  report.owner = { ...owner, sessionId: session.id, transportSessionId: native.continuationTransportSessionId };
  hostPath = '/api/acp/continuation/agentlets/' + encodeURIComponent(native.continuationAgentletId)
    + '/sessions/' + encodeURIComponent(native.continuationTransportSessionId);
  token = parse(await fs.readFile(path.join(root, '.runtime/isolated-live-continuation-host-20261023/connection-token.json'), 'utf8')).connectionToken;
  const messagesPath = prefix + '/conversations/' + session.id + '/messages?limit=1000';
  const before = await read(messagesPath);
  if(process.argv.includes('--inspect-only')) {
    const expected=Number(process.argv.find(arg=>arg.startsWith('--expected-pid='))?.slice(15));
    assert.ok(Number.isSafeInteger(expected)&&expected>0);assert.equal(health.pid,expected);
    const file=path.join(output,'mcp-discovery.json'),python=process.argv.find(arg=>arg.startsWith('--python='))?.slice(9)??'C:/Users/1/AppData/Local/Programs/Python/Python312/python.exe';
    await promisify(execFile)(python,['-X','utf8','scripts/native-space-kernel-mcp-client.py','--runtime-label=isolated-node-carry-20261020','--canvas=surface-core-main','--output='+file],{cwd:root,windowsHide:true,timeout:60000,maxBuffer:1000000});
    const discovery=parse(await fs.readFile(file,'utf8'));assert.equal(discovery.calls,0);
    assert.deepEqual(discovery.tools.map(tool=>tool.name),['get_space_outline','inspect_nodes','inspect_edges','set_node_geometry','set_node_emphasis','set_node_pinned','set_node_color_pin','rename_color_pin']);
    const status=await host('/canvas-tools');report.hostRead={status:status.status,phase:status.value.phase,errorCode:status.value.error?.code,canvasId:status.value.canvasId,
      promptVisibleToolCount:status.value.tools?.length,fullMcpRegistryClaimed:false};
    assert.ok([200,409,503].includes(status.status));assert.deepEqual(await read(messagesPath),before);
    report.checks.push('Inspect-only: real MCP list_tools discovers eight tools with calls=0; Host GET only, no runtime-add/remove/abandon/resume/prompt. Disconnected old transport is honestly unavailable, not remounted.');
    report.actualSessionMountClaimed=false;report.passed=true;
  } else {
  const baselineReport = process.argv.find(arg => arg.startsWith('--baseline-report='))?.slice('--baseline-report='.length);
  const saved = parse(await fs.readFile(baselineReport ?? path.join(root, 'output/原会话画布工具_20261023/施工前原消息.json'), 'utf8'));
  // PowerShell's initial JSON capture materialized ISO dates and shortened
  // trailing millisecond zeros. Compare that timestamp by its exact instant;
  // every other original message field still has to match byte-for-byte text.
  const normalizedDates = rows => rows.map(row => ({ ...row, createdAt: new Date(row.createdAt).toISOString() }));
  assert.deepEqual(normalizedDates(before), normalizedDates(baselineReport ? saved.afterMessages : saved.value ?? saved.data)); report.originalMessages = before.length;
  report.baselineReport = baselineReport;
  report.beforeCaptureDateNormalization = 'Only createdAt ISO spelling is normalized; all IDs, roles, bodies, refs and original hashes remain exact.';
  const denied = await host('/canvas-tools', 'POST', { messageId: 'canvas-tools-read-only-diagnostic', text: 'No prompt is sent in this diagnostic.', canvasId: 'surface-core-main' }, false);
  assert.equal(denied.status, 401); report.checks.push('Actual Host requires its original Bearer for the new tool preparation entry.');
  for (const canvasId of ['surface-core-main', 'surface-core-context', null]) {
    const messageId = 'canvas-tools-read-only-diagnostic-' + (canvasId ?? 'none');
    const result = await host('/canvas-tools', 'POST', { messageId, text: 'No prompt is sent in this diagnostic.', canvasId });
    report.operations.push({ canvasId, result });
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    assert.equal(result.status, 200); assert.equal(result.value.prepared, true); assert.equal(result.value.canvasId, canvasId);
    assert.equal(result.value.externalSessionId, owner.externalSessionId); assert.equal(result.value.toolCount, canvasId === null ? 0 : 8);
    const status = await host('/canvas-tools'); report.operations.at(-1).readBack = status;
    assert.equal(status.status, 200); assert.equal(status.value.canvasId, canvasId); assert.ok(Array.isArray(status.value.tools));
    const state = JSON.stringify(status.value.tools);
    // Qwen's collectContextData omits deferred/hidden tools. This is the
    // prompt-visible subset, not its full MCP registry. The real session add
    // receipt above confirms eight discovered tools; actual use is a separate
    // original-Composer test, never inferred from this status list.
    report.operations.at(-1).promptVisibleToolCount = status.value.tools.length;
    if (canvasId !== null && process.argv.includes('--require-visible-tools'))
      for (const name of ['get_space_outline', 'inspect_nodes', 'inspect_edges', 'set_node_geometry', 'set_node_emphasis','set_node_pinned','set_node_color_pin','rename_color_pin']) assert.ok(state.includes(name), 'Own tool is declared to this actual session: ' + name);
    if (canvasId === null) assert.ok(!state.includes(status.value.serverName));
    await host('/canvas-tools/abandon', 'POST', { messageId });
  }
  assert.deepEqual(await read(messagesPath), before);
  report.checks.push('The real existing native session runtime-add confirms eight discovered tools on Main and Context, then removes this own service for a plain send. Context usage lists only prompt-visible tools and excludes deferred tools; actual model use is not claimed here. Original messages stay exact, zero prompt/model/geometry command.');
  report.passed = true;
  }
} catch (error) { report.error = { message: error.message, stack: error.stack }; process.exitCode = 1; }
finally { await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); }
console.log(JSON.stringify({ passed: report.passed, output, checks: report.checks, error: report.error?.message, modelCalls: 0 }, null, 2));
