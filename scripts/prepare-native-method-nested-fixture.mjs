import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual as same } from 'node:util';

assert.ok(process.argv.includes('--prepare-fixture'), 'Prepare only the explicitly named local method through original Core APIs.');
const origin = 'http://127.0.0.1:56311', projectId = 'disposable-surface-core-facade', prefix = '/api/lcos/core/projects/' + projectId;
const scopeId = 'scope-workflow-nested-members-20261025', title = '方法嵌套与混合现场联调 · 20261025';
const presentationId = 'presentation:workflow:' + scopeId, output = path.resolve('output/方法嵌套成员与混合现场_20261025');
await fs.mkdir(output, { recursive: true });
const manifestFile = path.join(output, 'fixture.json'), previous = await fs.readFile(manifestFile, 'utf8').then(JSON.parse).catch(error => { if (error.code !== 'ENOENT') throw error; });
const writes = previous?.writes ?? [], save = data => fs.writeFile(manifestFile, JSON.stringify(data, null, 2));
const get = async route => { const r = await fetch(origin + route, { redirect: 'error', signal: AbortSignal.timeout(20000) }); const b = await r.json(); assert.ok(r.ok && b.ok !== false, route); return b.value ?? b.data ?? b; };
const put = async (route, body) => {
  const intent = { route, method: 'PUT', body, at: new Date().toISOString(), confirmed: false }; writes.push(intent);
  await save({ ...previous, preparing: true, projectId, scopeId, writes });
  const r = await fetch(origin + route, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), redirect: 'error' });
  const b = await r.json(); Object.assign(intent, { status: r.status, result: b, confirmed: r.ok && b.ok === true });
  await save({ ...previous, preparing: true, projectId, scopeId, writes }); assert.ok(intent.confirmed, JSON.stringify(b)); return b.value;
};
const health = await get('/health'); assert.equal(health.runtimeLabel, 'isolated-node-carry-20261020'); assert.equal(health.realCoreConnected, true);
const source = JSON.parse(await fs.readFile('output/混合Scope取用_20261022/fixture.json', 'utf8'));
const nested = JSON.parse(await fs.readFile('output/Scope嵌套与跨现场_20261022/fixture.json', 'utf8'));
const method = JSON.parse(await fs.readFile('output/混合方法整份取用_20261025/fixture.json', 'utf8'));
let graph = await get(prefix + '/graph'), presentations = await get(prefix + '/presentations');
const protectedVersions = presentations.map(row => ({ id: row.id, version: row.version }));
assert.ok(graph.collections.some(row => row.id === nested.outer.id));
for (const id of [nested.scopeId, method.scopeId]) assert.ok(graph.scopes.some(row => row.id === id));
const members = [{ type: 'collection', id: nested.outer.id }, { type: 'scope', id: nested.scopeId }, { type: 'scope', id: method.scopeId },
  { type: 'note', id: source.noteId }, { type: 'conversation', id: source.conversationId }, { type: 'run', id: source.runId }];
const actions = [{ id: 'read-nested-members', label: '逐项查看嵌套内容并返回', description: '沿原资料库查看集合和嵌套Scope，保持原输入与原成员身份。', attachedViewIds: [source.textViewId], x: 0, y: 0 }];
const old = graph.scopes.find(row => row.id === scopeId);
if (!old) {
  await put(prefix + '/workflow/methods/' + scopeId, { create: true, name: title, expectedGraphVersion: graph.graphVersion,
    presentations: [{ id: presentationId, expectedVersion: 0, memberViewIds: [source.textViewId], workflowActions: actions, workflowActionEdges: [], workflowOperators: {} }] });
  graph = await get(prefix + '/graph'); presentations = await get(prefix + '/presentations');
} else assert.equal(old.name, title, 'Never overwrite another existing method.');
let presentation = presentations.find(row => row.id === presentationId); assert.ok(presentation?.scopeId === scopeId && presentation.projectId === projectId);
assert.deepEqual(presentation.state.workflowActions, actions); assert.deepEqual(presentation.state.memberViewIds, [source.textViewId]);
if (!same(presentation.state.memberEntityRefs ?? [], members)) {
  assert.deepEqual(presentation.state.memberEntityRefs ?? [], [], 'Never replace existing different members.');
  await put(prefix + '/presentations/' + encodeURIComponent(presentationId), { contract: { ...presentation, state: { ...presentation.state, memberEntityRefs: members } }, expectedVersion: presentation.version });
  presentations = await get(prefix + '/presentations'); presentation = presentations.find(row => row.id === presentationId);
}
assert.deepEqual(presentation.state.memberEntityRefs, members);
for (const row of protectedVersions.filter(row => row.id !== presentationId)) assert.equal(presentations.find(p => p.id === row.id)?.version, row.version);
const liveId = 'connected-conversation-b0b62164-091e-4656-b495-40da78541bf0', connected = await get(prefix + '/connected-conversations');
const live = connected.find(row => row.id === liveId); assert.ok(live);
const liveMessages = await get(prefix + '/conversations/' + live.conversationSessionId + '/messages?limit=1000');
const run = await get('/api/lcos/core/runs/' + source.runId + '/review'); assert.equal(run.run.status, 'created');
const fixture = { prepared: true, projectId, scopeId, title, presentationId, version: presentation.version, workspaceId: 'workspace:' + scopeId,
  source, nested, nestedMethod: { scopeId: method.scopeId, title: method.title }, members, actions, liveConversationId: liveId,
  liveSessionId: live.conversationSessionId, liveMessageCount: liveMessages.length, protectedVersions, writes, preparedAt: new Date().toISOString() };
await save(fixture); console.log(JSON.stringify({ prepared: true, scopeId, title, version: fixture.version, memberCount: members.length,
  writes: writes.length, liveMessageCount: liveMessages.length, fixture: manifestFile }, null, 2));
