import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual as same } from 'node:util';

assert.ok(process.argv.includes('--prepare-fixture'), 'Prepare one clearly named independent method through original Core HTTP only.');
const origin = 'http://127.0.0.1:56311', projectId = 'disposable-surface-core-facade', prefix = '/api/lcos/core/projects/' + projectId;
const scopeId = 'scope-workflow-mixed-take-20261025', title = '混合方法整份取用联调 · 集合、附注、对话、任务';
const presentationId = 'presentation:workflow:' + scopeId, secondId = presentationId + ':second';
const out = path.resolve('output/混合方法整份取用_20261025'), manifestFile = path.join(out, 'fixture.json'); await fs.mkdir(out, { recursive: true });
const previous = await fs.readFile(manifestFile, 'utf8').then(JSON.parse).catch(error => { if (error.code !== 'ENOENT') throw error; });
const writes = previous?.writes ?? [];
const save = data => fs.writeFile(manifestFile, JSON.stringify(data, null, 2));
const get = async route => { const response = await fetch(origin + route, { redirect: 'error', signal: AbortSignal.timeout(20000) }); const body = await response.json(); assert.ok(response.ok && body.ok !== false, route); return body.value ?? body.data ?? body; };
const put = async (route, body) => {
  const record = { route, method: 'PUT', input: body, at: new Date().toISOString(), confirmed: false }; writes.push(record); await save({ ...previous, preparing: true, projectId, scopeId, writes });
  const response = await fetch(origin + route, { method: 'PUT', redirect: 'error', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); const payload = await response.json(); record.status = response.status; record.result = payload; record.confirmed = response.ok && payload.ok === true;
  await save({ ...previous, preparing: true, projectId, scopeId, writes }); assert.ok(record.confirmed, JSON.stringify(payload)); return payload.value;
};
const source = JSON.parse(await fs.readFile('output/混合Scope取用_20261022/fixture.json', 'utf8'));
let graph = await get(prefix + '/graph'), presentations = await get(prefix + '/presentations');
const connected = await get(prefix + '/connected-conversations'), liveId = 'connected-conversation-b0b62164-091e-4656-b495-40da78541bf0';
assert.ok(graph.notes.some(row => row.id === source.noteId)); assert.ok(graph.artifactViews.some(row => row.id === source.textViewId));
assert.ok(connected.some(row => row.id === source.conversationId) && connected.some(row => row.id === liveId));
const runReview = await get('/api/lcos/core/runs/' + source.runId + '/review'); assert.equal(runReview.run.status, 'created');
const firstRefs = [{ type: 'collection', id: source.outer.id }, { type: 'note', id: source.noteId }];
const secondRefs = [{ type: 'conversation', id: source.conversationId }, { type: 'run', id: source.runId }, { type: 'conversation', id: liveId }];
const firstActions = [{ id: 'read-members', label: '第一组：核对集合和附注', description: '逐项读取完整集合与附注，保留嵌套关系。', attachedViewIds: [], x: 0, y: 0 }];
const secondActions = [{ id: 'read-history', label: '第二组：对照人工历史与待执行任务', description: '读取真实对话、任务与所存材料，不把历史指令当作本次任务执行。', attachedViewIds: [source.textViewId], x: 0, y: 0 }];
let scope = graph.scopes.find(row => row.id === scopeId);
if (!scope) {
  await put(prefix + '/workflow/methods/' + scopeId, { create: true, name: title, expectedGraphVersion: graph.graphVersion,
    presentations: [{ id: presentationId, expectedVersion: 0, memberViewIds: [], workflowActions: firstActions, workflowActionEdges: [], workflowOperators: {} }] });
  graph = await get(prefix + '/graph'); presentations = await get(prefix + '/presentations'); scope = graph.scopes.find(row => row.id === scopeId);
}
assert.ok(scope && scope.name === title, 'An existing different method is never overwritten.');
let first = presentations.find(row => row.id === presentationId); assert.ok(first && first.scopeId === scopeId && first.projectId === projectId);
assert.deepEqual(first.state.workflowActions, firstActions);
if (!same(first.state.memberEntityRefs ?? [], firstRefs)) {
  assert.deepEqual(first.state.memberEntityRefs ?? [], [], 'Never replace an existing different member set.');
  await put(prefix + '/presentations/' + encodeURIComponent(presentationId), { contract: { ...first, state: { ...first.state, memberEntityRefs: firstRefs } }, expectedVersion: first.version });
  presentations = await get(prefix + '/presentations'); first = presentations.find(row => row.id === presentationId);
}
let second = presentations.find(row => row.id === secondId);
const secondState = { ...first.state, memberViewIds: [source.textViewId], memberEntityRefs: secondRefs, workflowActions: secondActions,
  workflowOperators: { [source.textViewId]: { kind: 'reference', label: '第二组真实材料说明' } }, workflowActionEdges: [] };
if (!second) {
  await put(prefix + '/presentations/' + encodeURIComponent(secondId), { contract: { ...first, id: secondId, version: 0, state: secondState }, expectedVersion: 0 });
  presentations = await get(prefix + '/presentations'); second = presentations.find(row => row.id === secondId);
}
assert.ok(second && second.scopeId === scopeId && second.projectId === projectId); assert.deepEqual(second.state, secondState);
assert.deepEqual(first.state.memberEntityRefs, firstRefs);
const note = graph.notes.find(row => row.id === source.noteId), manual = connected.find(row => row.id === source.conversationId), live = connected.find(row => row.id === liveId);
const fixture = { prepared: true, projectId, scopeId, title, presentationIds: [presentationId, secondId], presentationVersions: [first.version, second.version],
  firstRefs, secondRefs, sourceFixture: 'output/混合Scope取用_20261022/fixture.json', source, noteBody: note.body,
  noteTitle: note.body.split('\n').find(line => line.trim()).slice(0, 72).trim(), conversationId: manual.id, conversationTitle: manual.label,
  liveConversationId: live.id, liveConversationTitle: live.label, liveSessionId: live.conversationSessionId,
  runId: source.runId, runTitle: runReview.run.instruction, methodTextMarkers: firstActions.concat(secondActions).map(row => row.label),
  writes, preparedAt: new Date().toISOString() };
await save(fixture); console.log(JSON.stringify({ prepared: true, scopeId, presentationIds: fixture.presentationIds, versions: fixture.presentationVersions, writes: writes.length, fixture: manifestFile }, null, 2));
