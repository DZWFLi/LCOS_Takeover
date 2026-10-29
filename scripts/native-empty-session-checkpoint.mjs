import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Readable, Writable } from 'node:stream';
import { createRequire } from 'node:module';
import { installedRoot } from '../lab/pilot/build-pilot.mjs';

const argument = process.argv.find(value => value.startsWith('--repair-created-report='));
assert.ok(argument, 'Use only an explicitly identified successful isolated creation report.');
const created = JSON.parse(await fs.readFile(argument.slice('--repair-created-report='.length), 'utf8'));
assert.equal(created.passed, true); assert.equal(created.phase, 'keyboard');
const projectId = 'disposable-surface-core-facade', origin = 'http://127.0.0.1:56311', hostOrigin = 'http://127.0.0.1:56321';
const root = process.cwd(), runtime = await fs.realpath('.runtime/isolated-node-carry-20261020');
assert.equal(path.dirname(runtime), await fs.realpath('.runtime'));
const cwd = await fs.realpath(path.join(runtime, 'agent-verification-project')); assert.ok(cwd.startsWith(runtime + path.sep));
const output = path.resolve('output/智能体空会话恢复_20261023/原空会话元数据修复', new Date().toISOString().replaceAll(':', '-'));
await fs.mkdir(output, { recursive: true });
const report = { passed: false, output, kind: 'Explicit repair of one proven zero-message, disconnected test session through the provider original new-session API with its existing UUID; not recovery of missing chat history.',
  modelPrompts: 0, providerNewCalls: 0, coreMutations: 0, manualTranscriptWrites: 0 };
const get = async route => { const r = await fetch(origin + route, { redirect: 'error', signal: AbortSignal.timeout(15000) });
  const b = await r.json(); assert.ok(r.ok); return b.value ?? b.data ?? b; };
const prefix = '/api/lcos/core/projects/' + projectId;
let child, exited, sdkConnection;
try {
  const beforeConversations = await get(prefix + '/connected-conversations');
  const connected = beforeConversations.find(row => row.id === created.conversationId); assert.ok(connected);
  const session = (await get(prefix + '/conversations')).find(row => row.id === connected.conversationSessionId); assert.ok(session);
  const messagesPath = prefix + '/conversations/' + session.id + '/messages?limit=1000';
  assert.deepEqual(await get(messagesPath), []);
  const creation = await get(prefix + '/conversation-continuations/' + created.operationId);
  assert.equal(creation.mode, 'blank_new'); assert.equal(creation.requestConnectedConversationId, null);
  assert.equal(creation.connectedConversationId, connected.id); assert.equal(creation.steps.core_bind, 'confirmed');
  const nativeId = session.originMeta.continuationExternalSessionId;
  assert.match(nativeId, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.equal(nativeId, creation.externalEvidence.externalSessionId); assert.equal(nativeId, connected.conversationRef);
  const beforeCanvas = await get('/api/canvas/v1/canvases/surface-core-main');
  const node = beforeCanvas.nodes.find(row => row.id === created.node.id); assert.ok(node);
  assert.equal(node.data.lcos_conversation_ref.connectedConversationId, connected.id);
  assert.deepEqual(node.data.lcosGlythAppearance, created.chosenAppearance);
  const token = JSON.parse(await fs.readFile('.runtime/isolated-live-continuation-host-20261023/connection-token.json', 'utf8')).connectionToken;
  const hostResponse = await fetch(hostOrigin + '/api/acp/continuation/agentlets/' + encodeURIComponent(session.originMeta.continuationAgentletId)
    + '/sessions/' + encodeURIComponent(session.originMeta.continuationTransportSessionId), { headers: { Authorization: 'Bearer ' + token }, redirect: 'error' });
  const observed = await hostResponse.json(); assert.equal(hostResponse.status, 200); assert.equal(observed.status, 'disconnected');
  if (observed.pid) assert.throws(() => process.kill(observed.pid, 0), undefined, 'A live old provider must not be replaced.');
  const transcript = path.join(runtime, 'live-provider-profile/.qwen/projects/e--codex----lcos-----20261013--runtime-isolated-node-carry-20261020-agent-verification-project/chats', nativeId + '.jsonl');
  await assert.rejects(fs.stat(transcript), { code: 'ENOENT' });
  Object.assign(report, { conversationId: connected.id, nativeId, canonicalSessionId: session.id, oldProcessAbsent: true,
    priorMessages: 0, beforeTranscriptExists: false, providerPidBefore: observed.pid });
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));

  const sdk = createRequire(path.join(installedRoot, 'huabu/apps/server/package.json'))('@agentclientprotocol/sdk');
  child = spawn(process.execPath, [path.join(root, 'scripts/launch-live-qwen-acp.mjs')], { cwd, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
  let stderrBytes = 0; child.stderr.on('data', chunk => { stderrBytes += chunk.length; });
  sdkConnection = new sdk.ClientSideConnection(() => ({ sessionUpdate: async () => {}, requestPermission: async () => ({ outcome: { outcome: 'cancelled' } }) }),
    sdk.ndJsonStream(Writable.toWeb(child.stdin), Readable.toWeb(child.stdout)));
  await sdkConnection.initialize({ protocolVersion: sdk.PROTOCOL_VERSION, clientInfo: { name: 'LCOS original empty-session repair', version: '1' },
    clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false } });
  report.providerNewCalls++;
  const response = await sdkConnection.newSession({ cwd, mcpServers: [], _meta: { 'qwen-code/sessionId': nativeId } });
  assert.equal(response.sessionId, nativeId); report.confirmedSameNativeId = true;
  const records = (await fs.readFile(transcript, 'utf8')).trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  assert.ok(records.length > 0); assert.ok(records.every(row => row.type === 'system'));
  assert.ok(records.some(row => row.subtype === 'session_approval_mode' && row.systemPayload?.mode === 'default'));
  assert.ok(records.every(row => row.sessionId === nativeId));
  report.records = records.map(row => ({ type: row.type, subtype: row.subtype }));
  child.stdin.end();
  let stopped = await Promise.race([exited, new Promise(resolve => setTimeout(() => resolve(null), 10000))]);
  if (!stopped) { child.kill('SIGTERM'); stopped = await Promise.race([exited, new Promise(resolve => setTimeout(() => resolve(null), 10000))]); }
  assert.ok(stopped, 'Owned repair process must finish before original recovery.'); report.repairProcessExit = stopped; report.stderrBytes = stderrBytes;
  assert.deepEqual(await get(messagesPath), []); assert.deepEqual(await get(prefix + '/connected-conversations'), beforeConversations);
  assert.deepEqual(await get('/api/canvas/v1/canvases/surface-core-main'), beforeCanvas);
  report.passed = true;
} catch (error) { report.error = String(error.message).replace(/\bsk-[A-Za-z0-9_-]+/g, '[REDACTED]'); process.exitCode = 1; }
finally {
  if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
}
console.log(JSON.stringify({ passed: report.passed, output, nativeId: report.nativeId, providerNewCalls: report.providerNewCalls,
  modelPrompts: report.modelPrompts, records: report.records, error: report.error }, null, 2));
