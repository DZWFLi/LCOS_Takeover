import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PresentationViewV0, ProjectGraphSnapshot } from '@local-creative-os/contracts';
import type { Workspace } from '@local-creative-os/domain';
import { HttpClient } from '../src/backend/client.js';
import { CoreProjectClient } from '../src/backend/projects.js';
import { Gen2Host } from '../src/host/projectionFacade.js';
import { HuabuRfsClient } from '../src/spatial/huabuRfsClient.js';
import { MemoryBindingStore, ProjectionBindingRegistry } from '../src/spatial/projectionBinding.js';
import { ReconciliationRunner, viewPresentationByArtifact } from '../src/spatial/reconciliationRunner.js';
import { readWorksitePresentations, worksiteProjectionInput } from '../src/spatial/worksiteProjectionInput.js';
import { ProjectToSpaceProjection, type ArtifactProjectionSource, type SpaceEntityProjectionSource } from '../src/spatial/projectToSpaceProjection.js';
import type { CoreRelationClient } from '../src/backend/relations.js';
import type { CoreConversationClient } from '../src/backend/conversations.js';
import type { RelationProjection } from '../src/spatial/relationProjection.js';

const workspace = { id: 'w', projectId: 'p', scopeId: 'child', canvasId: 'canvas-child', preferredSurface: 'workflow', focusedViewIds: [] } as unknown as Workspace;
const graph = {
  project: { id: 'p' }, scopes: [{ id: 'root', projectId: 'p', kind: 'root' }, { id: 'child', projectId: 'p', kind: 'workflow' }],
  workspaces: [workspace], artifacts: [
    { id: 'a', projectId: 'p', title: '材料', kind: 'image', currentRevisionId: 'new' },
    { id: 'outside', projectId: 'p', title: '别的材料', kind: 'image' },
  ], artifactViews: [
    { id: 'received', artifactId: 'a', scopeId: 'root', revisionId: 'old', referenceKind: 'reference', size: { width: 200, height: 100 }, position: { x: 900, y: 700 } },
    { id: 'local-primary', artifactId: 'a', scopeId: 'child', revisionId: 'new', referenceKind: 'primary', size: { width: 300, height: 150 } },
    { id: 'unrelated', artifactId: 'outside', scopeId: 'root', revisionId: 'new', referenceKind: 'primary', size: { width: 300, height: 150 } },
  ], workspaceMemberships: [], workspaceEntityMemberships: [], notes: [{ id: 'note-received', body: '笔记' }, { id: 'note-other', body: '其它笔记' }],
  artifactRevisions: [{ id: 'old', artifactId: 'a', fileRecordId: 'file-old', status: 'superseded' }, { id: 'new', artifactId: 'a', fileRecordId: 'file-new', status: 'current' }],
  fileRecords: [{ id: 'file-old', projectId: 'p', mimeType: 'image/png', size: 20 }, { id: 'file-new', projectId: 'p', mimeType: 'image/jpeg', size: 20 }],
  relations: [], checkpoints: [],
} as unknown as ProjectGraphSnapshot;
const presentation: PresentationViewV0 = {
  schemaVersion: 0, projectId: 'p', id: 'presentation:workflow:child', scopeId: 'child', capability: 'workflow', renderer: 'workflow',
  state: { memberViewIds: ['received'], memberEntityRefs: [{ type: 'note', id: 'note-received' }], hiddenViewIds: [], positions: { received: { x: 700, y: 400 } },
    hierarchy: { parentByViewId: {}, orderByParent: {} }, presentationEdges: [], pinnedViewIds: [], emphasisByViewId: {} },
  version: 1, updatedBy: 'core', createdAt: 'now', updatedAt: 'now',
};

test('received Presentation material selects its exact cross-scope View/revision ahead of local primary without importing unrelated views', () => {
  const input = worksiteProjectionInput(graph, workspace, [presentation, { ...presentation, id: 'presentation:context:child', capability: 'context', state: { ...presentation.state, memberViewIds: ['unrelated'] } }]);
  assert.deepEqual([...input.artifactIds ?? []], ['a']);
  assert.deepEqual(input.notes.map(note => String(note.id)), ['note-received']);
  const selected = viewPresentationByArtifact(input.views, { focusedViewIds: input.preferredViews, receivedViewIds: input.receivedViewIds });
  assert.equal(selected.get('a')?.viewId, 'received');
  assert.equal(selected.get('a')?.revisionId, 'old');
  assert.equal(worksiteProjectionInput(graph, workspace, [{ ...presentation, projectId: 'other' }]).receivedViewIds.size, 0);
});

test('roots sharing one scope keep Context and Workflow capabilities separate and retain exact workspace working sets', () => {
  const rootWorkspace = { ...workspace, scopeId: 'root' as Workspace['scopeId'] };
  const workingGraph = { ...graph, workspaceMemberships: [{ workspaceId: workspace.id, artifactViewId: 'local-primary' }] } as unknown as ProjectGraphSnapshot;
  const workflow = { ...presentation, scopeId: 'root', id: 'presentation:workflow:root' };
  const context = { ...workflow, id: 'presentation:context:root', capability: 'context' as const, state: { ...presentation.state, memberViewIds: ['unrelated'] } };
  const input = worksiteProjectionInput(workingGraph, rootWorkspace, [workflow, context]);
  assert.deepEqual(input.views.map(view => String(view.id)), ['received', 'local-primary']);
  assert.equal(input.root, false);
  assert.deepEqual([...input.artifactIds ?? []], ['a']);
});

test('existing list endpoint uses GET and fresh calls after receive; ambiguous worksite mapping never reads or falls back to a project-wide membership', async () => {
  let reads = 0;
  const http = new HttpClient({ baseUrl: 'http://core.test', fetch: async (input, init) => {
    reads += 1; assert.equal(init?.method, 'GET'); assert.match(String(input), /projects\/p%20%2F\/presentations$/);
    return new Response(JSON.stringify({ ok: true, value: [presentation] }), { headers: { 'Content-Type': 'application/json' } });
  } });
  const client = new CoreProjectClient(http);
  await client.listPresentations('p /'); await client.listPresentations('p /'); assert.equal(reads, 2);
  await assert.rejects(() => readWorksitePresentations(client, 'p', { ...graph, workspaces: [workspace, { ...workspace, id: 'duplicate' as Workspace['id'] }] }, 'canvas-child'));
  assert.equal(reads, 2);
});

test('legacy worksite infers only an authoritative Context/Workflow scope kind and never guesses a root capability', async () => {
  let reads = 0;
  const legacy = { ...workspace, preferredSurface: undefined };
  const port = { listPresentations: async () => { reads += 1; return [presentation]; } };
  const read = await readWorksitePresentations(port, 'p', { ...graph, workspaces: [legacy] }, 'canvas-child');
  assert.equal(read?.[0]?.id, presentation.id); assert.equal(reads, 1);
  const root = { ...legacy, scopeId: 'root' as Workspace['scopeId'] };
  assert.equal(await readWorksitePresentations(port, 'p', { ...graph, workspaces: [root] }, 'canvas-child'), undefined);
  assert.equal(reads, 1, 'Ambiguous root must not guess or consume Context/Workflow Presentation');
});

test('Reconciliation production consumer reads canonical members, uses exact old bytes, and leaves an unrelated existing node intact', async () => {
  const bindings = new ProjectionBindingRegistry(new MemoryBindingStore());
  await bindings.bind({ projectId: 'p', canvasId: 'canvas-child', entityType: 'artifact', entityId: 'outside', spatialKind: 'node', spatialId: 'keep-existing' });
  let scans: readonly ArtifactProjectionSource[] = [], removed = 0, reads = 0;
  const projector = { projectArtifactsWithReport: async (sources: readonly ArtifactProjectionSource[]) => { scans = sources; return { bindings: [], failures: [] }; },
    projectBatchWithReport: async () => ({ bindings: [], failures: [] }), removeOrphanNode: async () => { removed += 1; } } as unknown as ProjectToSpaceProjection;
  const runner = new ReconciliationRunner({ projectId: 'p', canvasId: 'canvas-child',
    projects: { getProjectGraph: async () => graph, listPresentations: async () => { reads += 1; return [presentation]; } } as unknown as CoreProjectClient,
    relations: { listRelations: async () => [] } as unknown as CoreRelationClient,
    nodeProjector: projector, relationProjector: {} as RelationProjection, bindings });
  const result = await runner.runOnce();
  assert.equal(reads, 1); assert.equal(result.degraded, false); assert.equal(scans.length, 1);
  assert.equal(scans[0]?.artifactId, 'a'); assert.equal(scans[0]?.currentRevisionId, 'old'); assert.equal(scans[0]?.fileRecordId, 'file-old');
  assert.equal(scans[0]?.position, undefined, 'Source/Core coordinates must not move another worksite');
  assert.equal(removed, 0); assert.equal((await bindings.findNode('p', 'canvas-child', 'artifact', 'outside'))?.spatialId, 'keep-existing');
});

test('Presentation read failure returns degraded before any projection or orphan cleanup and preserves binding', async () => {
  const bindings = new ProjectionBindingRegistry(new MemoryBindingStore());
  await bindings.bind({ projectId: 'p', canvasId: 'canvas-child', entityType: 'artifact', entityId: 'a', spatialKind: 'node', spatialId: 'keep' });
  const runner = new ReconciliationRunner({ projectId: 'p', canvasId: 'canvas-child',
    projects: { getProjectGraph: async () => graph, listPresentations: async () => { throw new Error('offline'); } } as unknown as CoreProjectClient,
    relations: {} as CoreRelationClient, nodeProjector: {} as ProjectToSpaceProjection, relationProjector: {} as RelationProjection, bindings });
  const result = await runner.runOnce();
  assert.equal(result.degraded, true); assert.equal(result.removedOrphanNodes, 0);
  assert.equal((await bindings.findNode('p', 'canvas-child', 'artifact', 'a'))?.spatialId, 'keep');
});

test('Host facts production consumer describes the same received exact View/revision and real Workspace Portal identity, then falls back honestly when membership read fails', async () => {
  let offline = false, reads = 0;
  const http = new HttpClient({ baseUrl: 'http://core.test', fetch: async (input) => {
    const url = String(input);
    if (url.includes('/spatial/bindings')) return response([
      { projectId: 'p', canvasId: 'canvas-child', entityType: 'artifact', entityId: 'a', spatialKind: 'node', spatialId: 'a-node' },
      { projectId: 'p', canvasId: 'canvas-child', entityType: 'workspace', entityId: 'scene-source', spatialKind: 'node', spatialId: 'scene-node' },
    ]);
    if (url.endsWith('/graph')) return response({ ...graph, workspaces: [...graph.workspaces,
      { ...workspace, id: 'scene-source', name: '真实原现场', canvasId: 'source-canvas' }] });
    if (url.endsWith('/presentations')) { reads += 1; if (offline) return new Response('offline', { status: 503 }); return response([presentation]); }
    return response([]);
  } });
  const rfs = new HuabuRfsClient({ canvasId: 'canvas-child', baseUrl: 'http://huabu.test', fetch: async () => response({}) });
  const host = new Gen2Host({ http, rfs, projectId: 'p' });
  const first = await host.listNodeBindings();
  assert.equal(first[0]?.descriptor?.artifactViewId, 'received');
  assert.equal(first[0]?.descriptor?.presentedRevisionId, 'old');
  assert.equal(first[1]?.descriptor?.entityId, 'scene-source');
  assert.equal(first[1]?.descriptor?.species, 'portal');
  assert.equal(first[1]?.descriptor?.title, '真实原现场');
  offline = true;
  const next = await host.listNodeBindings();
  assert.equal(next[0]?.spatialId, 'a-node'); assert.equal(next[0]?.descriptor, undefined); assert.equal(reads, 2);
});

for (const kind of ['context', 'workflow'] as const) test(`received ${kind} Scope projects only its exact aggregate ID through the existing batch without copying members or geometry`, async () => {
  const receivedGraph = { ...graph, artifacts: [], artifactViews: [], notes: [],
    scopes: [...graph.scopes, { id: 'received-scope', projectId: 'p', kind, name: '名字叫Collection也不猜类型' },
      { id: 'unrelated-scope', projectId: 'p', kind, name: '其它聚合' }] } as unknown as ProjectGraphSnapshot;
  const receivedPresentation = { ...presentation, state: { ...presentation.state, memberViewIds: [], memberEntityRefs: [{ type: 'scope', id: 'received-scope' }] } } as PresentationViewV0;
  const calls: SpaceEntityProjectionSource[] = [];
  const bindings = new ProjectionBindingRegistry(new MemoryBindingStore());
  await bindings.bind({ projectId: 'p', canvasId: 'canvas-child', spatialKind: 'node', spatialId: 'stable-unrelated', entityType: 'scope', entityId: 'unrelated-scope' });
  const projector = { projectArtifactsWithReport: async () => ({ bindings: [], failures: [] }),
    projectBatchWithReport: async (sources: readonly SpaceEntityProjectionSource[]) => { calls.push(...sources); return { bindings: [], failures: [] }; },
    removeOrphanNode: async () => assert.fail('Received aggregate filtering must not delete an existing unrelated projection'),
  } as unknown as ProjectToSpaceProjection;
  await new ReconciliationRunner({ projectId: 'p', canvasId: 'canvas-child',
    projects: { getProjectGraph: async () => receivedGraph, listPresentations: async () => [receivedPresentation] } as unknown as CoreProjectClient,
    relations: { listRelations: async () => [] } as unknown as CoreRelationClient,
    bindings, nodeProjector: projector, relationProjector: {} as RelationProjection }).runOnce();
  assert.deepEqual(calls.map(source => [source.entityType, source.entityId, source.sourceKind]), [['scope', 'received-scope', kind]]);
  assert.equal(calls[0]?.position, undefined);
  assert.equal((await bindings.findNode('p', 'canvas-child', 'scope', 'unrelated-scope'))?.spatialId, 'stable-unrelated');
});

test('received Scene projects only the real Workspace reference on the existing carrier without copying its child nodes or viewport', async () => {
  const sceneGraph = { ...graph, artifacts: [], artifactViews: [], notes: [], workspaces: [...graph.workspaces,
    { ...workspace, id: 'scene-source', name: '原现场', canvasId: 'source-canvas', viewport: { x: 6000, y: 7000, zoom: 0.2 } },
    { ...workspace, id: 'unrelated-scene', name: '其它现场', canvasId: 'other-canvas' }] } as unknown as ProjectGraphSnapshot;
  const received = { ...presentation, state: { ...presentation.state, memberViewIds: [], memberEntityRefs: [{ type: 'workspace', id: 'scene-source' }] } } as PresentationViewV0;
  const calls: SpaceEntityProjectionSource[] = [];
  const projector = { projectArtifactsWithReport: async () => ({ bindings: [], failures: [] }),
    projectBatchWithReport: async (sources: readonly SpaceEntityProjectionSource[]) => { calls.push(...sources); return { bindings: [], failures: [] }; },
  } as unknown as ProjectToSpaceProjection;
  await new ReconciliationRunner({ projectId: 'p', canvasId: 'canvas-child',
    projects: { getProjectGraph: async () => sceneGraph, listPresentations: async () => [received] } as unknown as CoreProjectClient,
    relations: { listRelations: async () => [] } as unknown as CoreRelationClient,
    bindings: new ProjectionBindingRegistry(new MemoryBindingStore()), nodeProjector: projector, relationProjector: {} as RelationProjection }).runOnce();
  assert.deepEqual(calls.map(source => [source.entityType, source.entityId, source.sourceKind]), [['workspace', 'scene-source', 'scene']]);
  assert.equal(calls[0]?.position, undefined);
});

test('non-Main only creates received Conversations while retaining the complete Core census for existing Glyth orphan checks', async () => {
  const conversationGraph = { ...graph, artifacts: [], artifactViews: [], notes: [] };
  const received = { ...presentation, state: { ...presentation.state, memberViewIds: [], memberEntityRefs: [{ type: 'conversation', id: 'wanted' }] } } as PresentationViewV0;
  const calls: SpaceEntityProjectionSource[] = [];
  const bindings = new ProjectionBindingRegistry(new MemoryBindingStore());
  await bindings.bind({ projectId: 'p', canvasId: 'canvas-child', spatialKind: 'node', spatialId: 'existing-glyth', entityType: 'conversation', entityId: 'unrelated' });
  const projector = { projectArtifactsWithReport: async () => ({ bindings: [], failures: [] }),
    projectBatchWithReport: async (sources: readonly SpaceEntityProjectionSource[]) => { calls.push(...sources); return { bindings: [], failures: [] }; },
    removeOrphanNode: async () => assert.fail('Unrelated existing Glyth must retain its stable geometry and binding'),
  } as unknown as ProjectToSpaceProjection;
  await new ReconciliationRunner({ projectId: 'p', canvasId: 'canvas-child',
    projects: { getProjectGraph: async () => conversationGraph, listPresentations: async () => [received] } as unknown as CoreProjectClient,
    conversations: { listConnectedConversations: async () => [{ id: 'wanted', conversationRef: 'real-wanted', label: '收到的会话' }, { id: 'unrelated', conversationRef: 'real-unrelated' }] } as unknown as CoreConversationClient,
    relations: { listRelations: async () => [] } as unknown as CoreRelationClient,
    bindings, nodeProjector: projector, relationProjector: {} as RelationProjection }).runOnce();
  assert.deepEqual(calls.map(source => [source.entityType, source.entityId]), [['conversation', 'wanted']]);
  assert.equal((await bindings.findNode('p', 'canvas-child', 'conversation', 'unrelated'))?.spatialId, 'existing-glyth');
});

test('the real shared batch projector reuses Scope and Workspace target anchors and leaves their original-canvas bindings intact', async () => {
  const bindings = new ProjectionBindingRegistry(new MemoryBindingStore());
  for (const entityType of ['scope', 'workspace'] as const) for (const canvasId of ['canvas-child', 'canvas-original'])
    await bindings.bind({ projectId: 'p', canvasId, spatialKind: 'node', entityType, entityId: entityType,
      spatialId: `${canvasId}-${entityType}` });
  const queries: string[] = [];
  const rfs = new HuabuRfsClient({ canvasId: 'canvas-child', baseUrl: 'http://huabu.test', fetch: async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { type?: string; ids?: string[] };
    assert.equal(body.type, 'INSPECT_NODES', 'Existing references must never issue a geometry/create/write command');
    const ids = body.ids ?? []; queries.push(...ids);
    return new Response(JSON.stringify({ type: 'INSPECT_NODES', result: { count: ids.length, total: ids.length, truncated: false,
      nodes: ids.map(id => ({ id, type: 'note', position: { x: 900, y: 800 }, absolutePosition: { x: 900, y: 800 }, size: { width: 240, height: 180 } })) } }),
      { headers: { 'Content-Type': 'application/json' } });
  } });
  const report = await new ProjectToSpaceProjection(rfs, bindings).projectBatchWithReport([
    { projectId: 'p', entityType: 'scope', entityId: 'scope', kind: 'file', sourceKind: 'workflow', title: '新标题', position: { x: 0, y: 0 } },
    { projectId: 'p', entityType: 'workspace', entityId: 'workspace', kind: 'file', sourceKind: 'scene', title: '新标题', position: { x: 0, y: 0 } },
  ]);
  assert.equal(report.failures.length, 0); assert.equal(report.bindings.length, 2);
  assert.equal(queries.length, 2);
  assert.equal((await bindings.findNode('p', 'canvas-original', 'workspace', 'workspace'))?.spatialId, 'canvas-original-workspace');
  assert.equal((await bindings.findNode('p', 'canvas-child', 'scope', 'scope'))?.spatialId, 'canvas-child-scope');
});

function response(value: unknown) { return new Response(JSON.stringify({ ok: true, value }), { headers: { 'Content-Type': 'application/json' } }); }
