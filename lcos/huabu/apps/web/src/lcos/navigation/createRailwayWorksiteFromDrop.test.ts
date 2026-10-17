import { CoreAssemblyClient, CoreProjectClient, CoreRailwayClient, HttpClient } from '@local-creative-os/web-gen2';
import { expect, it, vi } from 'vitest';

import { createRailwayWorksiteFromDrop } from './createRailwayWorksiteFromDrop';
import { navigationGraph } from './navigationFixtures';
import { worksiteProjectionInput } from '../../../../../../apps/web-gen2/src/spatial/worksiteProjectionInput';
import { buildSurfaceCanvasMap } from '../app/useLcosWorksite';

import type { CreateRailwayWorksiteDropInput } from './createRailwayWorksiteFromDrop';
import type { AssemblyApplyRequestV1, AssemblyApplyResultV1, MutationBatch, ProjectGraphSnapshot, RailwaySnapshotV1, RailwayStoredRefV1 } from '@local-creative-os/contracts';

const input: CreateRailwayWorksiteDropInput = { projectId: 'p', operationId: 'drop-one', surface: 'main',
  sourceRefs: [{ kind: 'artifactView', id: 'historic-view' }, { kind: 'note', id: 'note' }],
  capturedRevisionIdsBySource: { 'historic-view': 'old' } };

function fixture() {
  let graph = navigationGraph({
    scopes: [{ id: 'root', projectId: 'p', kind: 'root', parentScopeId: null, containerViewId: null, name: 'Project' }],
    workspaces: [{ id: 'main-root', projectId: 'p', scopeId: 'root', preferredSurface: 'main', name: 'Main', canvasId: 'source-canvas' }],
    artifacts: [{ id: 'artifact', projectId: 'p', currentRevisionId: 'current' }, { id: 'unselected', projectId: 'p', currentRevisionId: 'other' }],
    artifactViews: [{ id: 'historic-view', artifactId: 'artifact', revisionId: 'old', scopeId: 'root', position: { x: 9999, y: 9999 } },
      { id: 'other-view', artifactId: 'unselected', revisionId: 'other', scopeId: 'root' }],
    artifactRevisions: [{ id: 'old', artifactId: 'artifact' }, { id: 'current', artifactId: 'artifact' }, { id: 'other', artifactId: 'unselected' }],
    notes: [{ id: 'note', projectId: 'p' }],
  });
  let order: readonly RailwayStoredRefV1[] = [{ kind: 'worksite', projectId: 'p', worksiteId: 'already-pinned' }];
  let orderVersion = 3;
  const batches: MutationBatch[] = [], applies: AssemblyApplyRequestV1[] = [], events: string[] = [];
  let mutationResponseLost = false, canvasFails = false, railFails = false;
  let applyResult: ((request: AssemblyApplyRequestV1) => AssemblyApplyResultV1) | undefined;
  const snapshot = (): RailwaySnapshotV1 => ({ schemaVersion: 1, projectId: 'p', order: {
    schemaVersion: 1, projectId: 'p', orderedRefs: order, version: orderVersion, updatedAt: '',
  }, destinations: [], candidates: [], migrationRequired: false });
  const fetcher = vi.fn<typeof fetch>(async (url, options) => {
    const path = new URL(String(url)).pathname;
    const method = options?.method ?? 'GET';
    let value: unknown;
    if (path.endsWith('/graph') && method === 'GET') value = graph;
    else if (path.endsWith('/graph') && method === 'POST') {
      events.push('create');
      const batch = JSON.parse(String(options?.body)) as MutationBatch;
      batches.push(batch);
      if (batch.baseVersion !== graph.graphVersion) throw new Error('STALE_GRAPH_VERSION');
      for (const op of batch.ops) {
        if (op.type === 'upsert_scope') graph = { ...graph, scopes: [...graph.scopes, op.scope] };
        if (op.type === 'upsert_workspace') graph = { ...graph, workspaces: [...graph.workspaces, op.workspace] };
      }
      graph = { ...graph, graphVersion: (Number(graph.graphVersion) + 1) as ProjectGraphSnapshot['graphVersion'] };
      if (mutationResponseLost) { mutationResponseLost = false; throw new Error('Creation response lost'); }
      value = { graphVersion: graph.graphVersion, appliedOps: batch.ops.length };
    } else if (path.endsWith('/assembly/apply') && method === 'POST') {
      events.push('apply');
      const request = JSON.parse(String(options?.body)) as AssemblyApplyRequestV1;
      applies.push(request);
      const result: AssemblyApplyResultV1 = applyResult?.(request) ?? { schemaVersion: 1, projectId: 'p', allApplied: true,
        results: request.sourceRefs.map(sourceRef => ({ sourceRef, status: 'applied', channel: 'workspace-membership' })) };
      if (request.targetRef.kind !== 'workspace') throw new Error('Expected a workspace target');
      const workspaceId = request.targetRef.id;
      for (const line of result.results) {
        if (line.status !== 'applied' && !(line.status === 'skipped' && line.channel === 'already-member')) continue;
        const source = line.sourceRef;
        if (source.kind === 'artifactView' && !graph.workspaceMemberships?.some(member => String(member.workspaceId) === workspaceId && String(member.artifactViewId) === source.id))
          graph = { ...graph, workspaceMemberships: [...(graph.workspaceMemberships ?? []), {
            workspaceId: workspaceId as NonNullable<ProjectGraphSnapshot['workspaceMemberships']>[number]['workspaceId'],
            artifactViewId: source.id as NonNullable<ProjectGraphSnapshot['workspaceMemberships']>[number]['artifactViewId'], addedAt: '', addedBy: 'user',
          }] };
        if (source.kind === 'note' && !graph.workspaceEntityMemberships?.some(member => String(member.workspaceId) === workspaceId && member.entityId === source.id))
          graph = { ...graph, workspaceEntityMemberships: [...(graph.workspaceEntityMemberships ?? []), {
            workspaceId: workspaceId as NonNullable<ProjectGraphSnapshot['workspaceEntityMemberships']>[number]['workspaceId'],
            entityType: 'note', entityId: source.id, addedAt: '', addedBy: 'user',
          }] };
      }
      value = result;
    } else if (path.endsWith('/railway') && method === 'GET') value = snapshot();
    else if (path.endsWith('/railway') && method === 'PUT') {
      events.push('rail-save');
      if (railFails) throw new Error('Rail save failed');
      const request = JSON.parse(String(options?.body)) as { expectedVersion: number; orderedRefs: RailwayStoredRefV1[] };
      expect(request.expectedVersion).toBe(orderVersion);
      order = request.orderedRefs; orderVersion += 1; value = snapshot();
    } else throw new Error(`Unexpected owner ${method} ${path}`);
    return new Response(JSON.stringify({ ok: true, value }), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  const http = new HttpClient({ baseUrl: 'http://127.0.0.1:0', fetch: fetcher });
  const session = { projects: new CoreProjectClient(http), assembly: new CoreAssemblyClient(http), railway: new CoreRailwayClient(http) };
  const ensureCanvas = vi.fn(async (workspaceId: string) => {
    events.push('canvas');
    if (canvasFails) return undefined;
    const workspace = graph.workspaces.find(item => String(item.id) === workspaceId);
    if (!workspace) throw new Error('Workspace must already exist in Core');
    const canvasId = workspace.canvasId ?? 'new-canvas';
    graph = { ...graph, workspaces: graph.workspaces.map(item => item.id === workspace.id ? { ...item, canvasId } : item) };
    return canvasId;
  });
  return { session, ensureCanvas, fetcher, events, batches, applies, graph: () => graph, order: () => order,
    setGraph: (next: ProjectGraphSnapshot) => { graph = next; },
    fail: (phase: 'creation-response' | 'canvas' | 'rail') => { if (phase === 'creation-response') mutationResponseLost = true;
      if (phase === 'canvas') canvasFails = true; if (phase === 'rail') railFails = true; },
    recover: () => { canvasFails = false; railFails = false; },
    returnApply: (build: (request: AssemblyApplyRequestV1) => AssemblyApplyResultV1) => { applyResult = build; },
  };
}

it('only the explicit + action can create a blank View without an empty material Apply', async () => {
  const f = fixture();
  await expect(createRailwayWorksiteFromDrop(f.session, { ...input, sourceRefs: [] }, f.ensureCanvas)).rejects.toThrow('没有可放入');
  expect(f.batches).toHaveLength(0);
  const result = await createRailwayWorksiteFromDrop(f.session, { ...input, sourceRefs: [], createBlank: true }, f.ensureCanvas);
  expect(result).toMatchObject({ status: 'created', canvasId: 'new-canvas' });
  expect(f.applies).toHaveLength(0);
  expect(f.events).toEqual(['create', 'canvas', 'rail-save']);
  expect(f.graph().workspaceMemberships ?? []).toHaveLength(0);
});

it('creates one independent lasting Main worksite containing the selected historical View and note through existing owners', async () => {
  const f = fixture(); const originalViews = f.graph().artifactViews;
  const result = await createRailwayWorksiteFromDrop(f.session, input, f.ensureCanvas);
  expect(result).toMatchObject({ status: 'created', name: '现场 1', canvasId: 'new-canvas',
    workspaceId: 'workspace:rail-drop:p:drop-one', scopeId: 'scope:rail-drop:p:drop-one', applyReceipt: { allApplied: true } });
  expect(f.events).toEqual(['create', 'apply', 'canvas', 'rail-save']);
  expect(f.batches[0]).toMatchObject({ baseVersion: 2, actorKind: 'user', ops: [
    { type: 'upsert_scope', scope: { kind: 'delivery', parentScopeId: 'root', containerViewId: null } },
    { type: 'upsert_workspace', workspace: { scopeId: result.scopeId, preferredSurface: 'main', focusedViewIds: [], intent: null } },
  ] });
  expect(f.applies[0]?.sourceRefs).toEqual(input.sourceRefs);
  expect(f.applies[0]?.placementBySource).toBeUndefined();
  expect(f.graph().artifactViews).toEqual(originalViews);
  const workspace = f.graph().workspaces.find(item => String(item.id) === result.workspaceId);
  const projected = worksiteProjectionInput(f.graph(), workspace);
  expect(projected.root).toBe(false);
  expect(projected.views.map(view => [view.id, view.revisionId])).toEqual([['historic-view', 'old']]);
  expect(projected.notes.map(note => note.id)).toEqual(['note']);
  expect(buildSurfaceCanvasMap(f.graph().workspaces, 'root')).toEqual({ main: 'source-canvas' });
  expect(f.order()).toEqual([{ kind: 'worksite', projectId: 'p', worksiteId: 'already-pinned' },
    { kind: 'worksite', projectId: 'p', worksiteId: result.workspaceId }]);
});

for (const surface of ['context', 'workflow'] as const) it(`creates a ${surface} worksite using its existing scope kind without adding a second Surface root`, async () => {
  const f = fixture();
  const result = await createRailwayWorksiteFromDrop(f.session, { ...input, surface }, f.ensureCanvas);
  expect(result.status).toBe('created');
  expect(f.graph().scopes.find(scope => String(scope.id) === result.scopeId)?.kind).toBe(surface);
  expect(f.graph().scopes.filter(scope => scope.kind === 'root')).toHaveLength(1);
  expect(buildSurfaceCanvasMap(f.graph().workspaces, 'root')).toEqual({ main: 'source-canvas' });
});

it('recovers the same operation from Core after a lost creation response without creating a duplicate Workspace or Scope', async () => {
  const f = fixture(); f.fail('creation-response');
  const first = await createRailwayWorksiteFromDrop(f.session, input, f.ensureCanvas);
  expect(first.status).toBe('partial'); expect(f.applies).toHaveLength(0);
  const recovered = await createRailwayWorksiteFromDrop(f.session, input, f.ensureCanvas);
  expect(recovered).toMatchObject({ status: 'created', workspaceId: first.workspaceId, scopeId: first.scopeId });
  expect(f.batches).toHaveLength(1);
  expect(f.graph().workspaces.filter(item => String(item.id) === first.workspaceId)).toHaveLength(1);
  expect(f.graph().scopes.filter(item => String(item.id) === first.scopeId)).toHaveLength(1);
});

it('returns a recoverable partial when Canvas or Rail fails and keeps the original members and source View', async () => {
  for (const phase of ['canvas', 'rail'] as const) {
    const f = fixture(); f.fail(phase);
    const partial = await createRailwayWorksiteFromDrop(f.session, input, f.ensureCanvas);
    expect(partial).toMatchObject({ status: 'partial', applyReceipt: { allApplied: true } });
    expect(f.graph().artifactViews[0]?.revisionId).toBe('old');
    f.recover();
    const recovered = await createRailwayWorksiteFromDrop(f.session, input, f.ensureCanvas);
    expect(recovered).toMatchObject({ status: 'created', workspaceId: partial.workspaceId });
    expect(f.batches).toHaveLength(1);
    expect(f.graph().workspaceMemberships).toHaveLength(1);
    expect(f.graph().workspaceEntityMemberships).toHaveLength(1);
    const repeated = await createRailwayWorksiteFromDrop(f.session, input, f.ensureCanvas);
    expect(repeated.workspaceId).toBe(partial.workspaceId);
    expect(f.order()).toHaveLength(2);
  }
});

it('rejects unsupported, foreign, missing or changed sources before any creation mutation, including real Collection IDs', async () => {
  for (const refs of [[...input.sourceRefs, { kind: 'collection' as const, id: 'canonical-collection' }],
    [{ kind: 'workflow' as const, id: 'workflow' }], [{ kind: 'resource' as const, id: 'ambiguous-resource' }],
    [{ kind: 'artifactView' as const, id: 'missing' }], [{ kind: 'note' as const, id: 'foreign' }], []]) {
    const f = fixture();
    await expect(createRailwayWorksiteFromDrop(f.session, { ...input, sourceRefs: refs }, f.ensureCanvas)).rejects.toThrow();
    expect(f.events).toEqual([]);
  }
  const f = fixture();
  await expect(createRailwayWorksiteFromDrop(f.session, { ...input, capturedRevisionIdsBySource: { 'historic-view': 'current' } }, f.ensureCanvas))
    .rejects.toThrow('未改用最新版');
  expect(f.batches).toHaveLength(0);
});

it('does not trust allApplied=true with unsupported item receipts or continue to Canvas/Rail', async () => {
  const f = fixture();
  f.returnApply(request => ({ schemaVersion: 1, projectId: 'p', allApplied: true,
    results: request.sourceRefs.map(sourceRef => ({ sourceRef, status: 'skipped', channel: 'unsupported' })) }));
  const partial = await createRailwayWorksiteFromDrop(f.session, input, f.ensureCanvas);
  expect(partial.status).toBe('partial'); expect(f.events).toEqual(['create', 'apply']);
  expect(f.ensureCanvas).not.toHaveBeenCalled();
  expect(f.graph().workspaces.find(item => String(item.id) === partial.workspaceId)?.focusedViewIds).toEqual([]);
});

it('keeps a changed historical View as an explicit partial instead of announcing a new scene with Current silently substituted', async () => {
  const f = fixture();
  f.returnApply(request => {
    const graph = f.graph();
    f.setGraph({ ...graph, artifactViews: graph.artifactViews.map(view => view.id === 'historic-view'
      ? { ...view, revisionId: 'current' as typeof view.revisionId } : view) });
    return { schemaVersion: 1, projectId: 'p', allApplied: true,
      results: request.sourceRefs.map(sourceRef => ({ sourceRef, status: 'applied', channel: 'workspace-membership' })) };
  });
  const partial = await createRailwayWorksiteFromDrop(f.session, input, f.ensureCanvas);
  expect(partial).toMatchObject({ status: 'partial', message: expect.stringContaining('未改用最新版') });
  expect(f.ensureCanvas).not.toHaveBeenCalled();
  expect(f.events).toEqual(['create', 'apply']);
});

it('does not navigate or continue writes after the original project/gesture stops being current', async () => {
  const f = fixture();
  const result = await createRailwayWorksiteFromDrop(f.session, input, f.ensureCanvas, undefined,
    () => !f.events.includes('create'));
  expect(result.status).toBe('partial'); expect(f.events).toEqual(['create']);
  expect(f.ensureCanvas).not.toHaveBeenCalled(); expect(f.applies).toHaveLength(0);
});

it('passes only the callers explicit native placement and never copies legacy View positions', async () => {
  const f = fixture(); const placementBySource = { 'historic-view': { x: 12, y: 34 }, note: { x: 80, y: 10 } };
  expect((await createRailwayWorksiteFromDrop(f.session, { ...input, placementBySource }, f.ensureCanvas)).status).toBe('created');
  expect(f.applies[0]?.placementBySource).toEqual(placementBySource);
  expect(f.graph().artifactViews[0]?.position).toEqual({ x: 9999, y: 9999 });
});
