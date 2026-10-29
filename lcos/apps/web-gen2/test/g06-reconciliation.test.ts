import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ProjectionBindingRegistry, MemoryBindingStore, type ProjectionBinding } from '../src/spatial/projectionBinding.js';
import { HuabuRfsClient } from '../src/spatial/huabuRfsClient.js';
import { ProjectToSpaceProjection } from '../src/spatial/projectToSpaceProjection.js';
import { RelationProjection, type CoreRelationWriter, type NodeBindingResolver } from '../src/spatial/relationProjection.js';
import type { RfsExecuteResponse } from '../src/spatial/types.js';

const BASE = 'http://huabu.test';
const CANVAS = 'c1';

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

interface Captured {
  url: string;
  body?: unknown;
}

function makeRfs(router: (req: Captured) => Response) {
  const captured: Captured[] = [];
  const fetchMock = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.url;
    const text = init?.body?.toString() ?? '';
    const body = text ? JSON.parse(text) : undefined;
    captured.push({ url, body });
    return router({ url, body });
  };
  const client = new HuabuRfsClient({ canvasId: CANVAS, baseUrl: BASE, bearerToken: 'tok', fetch: fetchMock });
  return { client, captured };
}

/** RFS execute body is { commands:[...] }; query body is the raw query object. */
function cmdType(body: unknown): string | undefined {
  const b = body as { commands?: { type?: string }[] };
  return b.commands?.[0]?.type;
}

function createdResponse(nodes?: { nodeId: string }[], edges?: { edgeId: string }[]): RfsExecuteResponse {
  return {
    canvasId: CANVAS,
    runId: 'run-1',
    fromVersion: 0,
    toVersion: 1,
    commands: [],
    results: [{ index: 0, type: 'CREATE_NODES', applied: true, nodes, edges }],
    revisions: [],
    affected: { nodeIds: nodes?.map((n) => n.nodeId) ?? [], edgeIds: edges?.map((e) => e.edgeId) ?? [], deletedNodeIds: [], deletedEdgeIds: [] },
  };
}

function inspectNodesFound(found: string[]): Response {
  return jsonResponse({
    type: 'INSPECT_NODES',
    result: { count: found.length, total: found.length, truncated: false, nodes: found.map((id) => ({ id, type: 'note', filename: `${id}.md`, position: { x: 0, y: 0 }, absolutePosition: { x: 0, y: 0 }, size: { width: 280, height: 220 } })) },
  });
}

function inspectEdgesFound(found: string[], source = 'a', target = 'b'): Response {
  return jsonResponse({
    type: 'INSPECT_EDGES',
    result: { count: found.length, total: found.length, truncated: false, edges: found.map((id) => ({ id, source, target })) },
  });
}

function edgeBinding(edgeId: string, entityId = 'rel-1'): ProjectionBinding {
  return { projectId: 'p1', canvasId: CANVAS, spatialKind: 'edge', spatialId: edgeId, entityType: 'relation', entityId };
}

const noopWriter: CoreRelationWriter = { async createRelation() { return { id: 'rel-1' }; }, async deleteRelation() {} };
const resolver: NodeBindingResolver = () => ({ entityType: 'artifact', entityId: 'a1' });

// ---- G0.6: artifact stale-binding repair ----

test('project: existing binding reuses node when the Huabu node still exists', async () => {
  const reg = new ProjectionBindingRegistry(new MemoryBindingStore());
  await reg.bind({ projectId: 'p1', canvasId: CANVAS, spatialKind: 'node', spatialId: 'node-A1', entityType: 'artifact', entityId: 'a1' });
  const { client } = makeRfs((req) => {
    if (req.body?.type === 'INSPECT_NODES') return inspectNodesFound((req.body as { ids: string[] }).ids);
    assert.fail(`unexpected ${req.url}`);
  });
  const proj = new ProjectToSpaceProjection(client, reg);
  const out = await proj.projectArtifacts([{ projectId: 'p1', artifactId: 'a1', kind: 'text', title: 'Doc' }]);
  assert.equal(out[0]?.spatialId, 'node-A1');
});

test('project: stale binding (node gone in Huabu) is dropped and the artifact re-created', async () => {
  const reg = new ProjectionBindingRegistry(new MemoryBindingStore());
  await reg.bind({ projectId: 'p1', canvasId: CANVAS, spatialKind: 'node', spatialId: 'node-GONE', entityType: 'artifact', entityId: 'a1' });
  const creates: Record<string, unknown>[] = [];
  const { client } = makeRfs((req) => {
    if (req.body?.type === 'INSPECT_NODES') return inspectNodesFound([]);
    if (cmdType(req.body) === 'CREATE_NODES') {
      creates.push(req.body as Record<string, unknown>);
      return jsonResponse(createdResponse([{ nodeId: 'node-NEW' }]));
    }
    return jsonResponse({});
  });
  const proj = new ProjectToSpaceProjection(client, reg);
  const out = await proj.projectArtifacts([{ projectId: 'p1', artifactId: 'a1', kind: 'text', title: 'Doc' }]);
  assert.equal(out[0]?.spatialId, 'node-NEW');
  assert.equal(creates.length, 1);
  assert.equal(await reg.findNode('p1', CANVAS, 'artifact', 'a1').then((b) => b?.spatialId), 'node-NEW');
});

// ---- G0.6: relation↔edge reconciliation ----

test('reconcileRelationEdge: no binding -> projects edge and binds it', async () => {
  const reg = new ProjectionBindingRegistry(new MemoryBindingStore());
  const { client } = makeRfs((req) => {
    assert.equal(cmdType(req.body), 'CONNECT_NODES');
    return jsonResponse(createdResponse(undefined, [{ edgeId: 'edge-1' }]));
  });
  const proj = new RelationProjection(client, noopWriter, reg, 'p1');
  await proj.reconcileRelationEdge({ id: 'rel-1', kind: 'references', from: { entityType: 'artifact', entityId: 'a1' }, to: { entityType: 'artifact', entityId: 'a2' } }, 'nA', 'nB');
  assert.equal((await reg.findEdge('p1', CANVAS, 'rel-1'))?.spatialId, 'edge-1');
});

test('reconcileRelationEdge: binding + edge present -> no-op (no CONNECT)', async () => {
  const reg = new ProjectionBindingRegistry(new MemoryBindingStore());
  await reg.bind(edgeBinding('edge-1'));
  const connects: unknown[] = [];
  const { client } = makeRfs((req) => {
    if (req.body?.type === 'INSPECT_EDGES') return inspectEdgesFound((req.body as { ids: string[] }).ids, 'nA', 'nB');
    if (cmdType(req.body) === 'CONNECT_NODES') { connects.push(req.body); return jsonResponse(createdResponse(undefined, [{ edgeId: 'edge-X' }])); }
    return jsonResponse({});
  });
  const proj = new RelationProjection(client, noopWriter, reg, 'p1');
  await proj.reconcileRelationEdge({ id: 'rel-1', kind: 'references', from: { entityType: 'artifact', entityId: 'a1' }, to: { entityType: 'artifact', entityId: 'a2' } }, 'nA', 'nB');
  assert.equal(connects.length, 0);
  assert.equal((await reg.findEdge('p1', CANVAS, 'rel-1'))?.spatialId, 'edge-1');
});

test('reconcileRelationEdge: binding + edge gone -> unbind stale, re-CONNECT, rebind', async () => {
  const reg = new ProjectionBindingRegistry(new MemoryBindingStore());
  await reg.bind(edgeBinding('edge-DEAD'));
  const calls: unknown[] = [];
  const { client } = makeRfs((req) => {
    if (req.body?.type === 'INSPECT_EDGES') return inspectEdgesFound([]);
    const type = cmdType(req.body);
    if (type === 'DISCONNECT_EDGES') { calls.push(['disconnect']); return jsonResponse(createdResponse()); }
    if (type === 'CONNECT_NODES') { calls.push(['connect']); return jsonResponse(createdResponse(undefined, [{ edgeId: 'edge-NEW' }])); }
    return jsonResponse({});
  });
  const proj = new RelationProjection(client, noopWriter, reg, 'p1');
  await proj.reconcileRelationEdge({ id: 'rel-1', kind: 'references', from: { entityType: 'artifact', entityId: 'a1' }, to: { entityType: 'artifact', entityId: 'a2' } }, 'nA', 'nB');
  // 边已经不在了 → 不去 DISCONNECT（那会让整批 `not-found` 失败），直接解绑 + 重连。
  assert.equal(calls.some((c) => (c as unknown[])[0] === 'disconnect'), false);
  assert.ok(calls.some((c) => (c as unknown[])[0] === 'connect'));
  assert.equal((await reg.findEdge('p1', CANVAS, 'rel-1'))?.spatialId, 'edge-NEW');
});

test('reconcileRelationEdges: N relations -> ONE CONNECT_NODES execute (no write trickle)', async () => {
  const reg = new ProjectionBindingRegistry(new MemoryBindingStore());
  const executes: unknown[] = [];
  const liveEdges = new Map<string, { id: string; source: string; target: string }>();
  const { client } = makeRfs((req) => {
    if (req.body?.type === 'INSPECT_EDGES') {
      const query = req.body as { ids?: string[]; bySource?: string };
      const found = [...liveEdges.values()].filter((edge) =>
        query.ids ? query.ids.includes(edge.id) : edge.source === query.bySource);
      return jsonResponse({ type: 'INSPECT_EDGES', result: { count: found.length, total: found.length, truncated: false, edges: found } });
    }
    if (cmdType(req.body) === 'CONNECT_NODES') {
      executes.push(req.body);
      const edges = (req.body as { commands: { edges: { source: string; target: string }[] }[] }).commands[0].edges;
      const created = edges.map((edge, index) => ({ edgeId: `edge-${index + 1}`, ...edge }));
      created.forEach((edge) => liveEdges.set(edge.edgeId, { id: edge.edgeId, source: edge.source, target: edge.target }));
      return jsonResponse(
        createdResponse(undefined, created),
      );
    }
    return jsonResponse({});
  });
  const proj = new RelationProjection(client, noopWriter, reg, 'p1');
  const entries = [
    { relation: { id: 'rel-1', kind: 'references' as const, from: { entityType: 'artifact' as const, entityId: 'a1' }, to: { entityType: 'artifact' as const, entityId: 'a2' } }, fromNodeId: 'nA', toNodeId: 'nB' },
    { relation: { id: 'rel-2', kind: 'references' as const, from: { entityType: 'artifact' as const, entityId: 'a1' }, to: { entityType: 'artifact' as const, entityId: 'a3' } }, fromNodeId: 'nA', toNodeId: 'nC' },
    { relation: { id: 'rel-3', kind: 'references' as const, from: { entityType: 'artifact' as const, entityId: 'a4' }, to: { entityType: 'artifact' as const, entityId: 'a2' } }, fromNodeId: 'nD', toNodeId: 'nB' },
  ];
  const out = await proj.reconcileRelationEdges(entries);
  assert.deepEqual(out, { projected: 3, skipped: 0 });
  // 一次画布写入 = 一个版本 = 一次 broadcast —— 撤销栈不再被逐条投影污染。
  assert.equal(executes.length, 1, 'N 条关系必须合并为一次 execute');
  assert.equal((await reg.findEdge('p1', CANVAS, 'rel-1'))?.spatialId, 'edge-1');
  assert.equal((await reg.findEdge('p1', CANVAS, 'rel-3'))?.spatialId, 'edge-3');
});

test('reconcileRelationEdges: same endpoints project one relation and never share an edge binding', async () => {
  const reg = new ProjectionBindingRegistry(new MemoryBindingStore());
  const liveEdges = new Map<string, { id: string; source: string; target: string }>();
  let requestedEdges = 0;
  const { client } = makeRfs((req) => {
    if (req.body?.type === 'INSPECT_EDGES') {
      const query = req.body as { ids?: string[]; bySource?: string };
      const found = [...liveEdges.values()].filter((edge) =>
        query.ids ? query.ids.includes(edge.id) : edge.source === query.bySource);
      return jsonResponse({ type: 'INSPECT_EDGES', result: { count: found.length, total: found.length, truncated: false, edges: found } });
    }
    if (cmdType(req.body) === 'CONNECT_NODES') {
      const requested = (req.body as { commands: { edges: { source: string; target: string }[] }[] }).commands[0].edges;
      requestedEdges += requested.length;
      const edge = { edgeId: 'edge-only', source: requested[0]?.source ?? '', target: requested[0]?.target ?? '' };
      liveEdges.set(edge.edgeId, { id: edge.edgeId, source: edge.source, target: edge.target });
      return jsonResponse(createdResponse(undefined, [edge]));
    }
    return jsonResponse({});
  });
  const proj = new RelationProjection(client, noopWriter, reg, 'p1');
  const entries = ['rel-1', 'rel-2', 'rel-3'].map((id) => ({
    relation: { id, kind: 'references' as const, from: { entityType: 'artifact' as const, entityId: 'a1' }, to: { entityType: 'artifact' as const, entityId: 'a2' } },
    fromNodeId: 'nA',
    toNodeId: 'nB',
  }));

  const out = await proj.reconcileRelationEdges(entries);

  assert.deepEqual(out, { projected: 1, skipped: 2 });
  assert.equal(requestedEdges, 1, 'Huabu endpoint de-duplication must be mirrored before execute');
  assert.equal((await reg.findEdge('p1', CANVAS, 'rel-1'))?.spatialId, 'edge-only');
  assert.equal(await reg.findEdge('p1', CANVAS, 'rel-2'), undefined);
  assert.equal(await reg.findEdge('p1', CANVAS, 'rel-3'), undefined);
  assert.equal((await reg.list()).filter((binding) => binding.spatialKind === 'edge').length, 1);
});

test('reconcileRelationEdges: verifies echoed ids and adopts the real edge after Huabu de-duplicates', async () => {
  const reg = new ProjectionBindingRegistry(new MemoryBindingStore());
  const liveEdges = new Map<string, { id: string; source: string; target: string }>([
    ['edge-existing', { id: 'edge-existing', source: 'nA', target: 'nB' }],
  ]);
  const { client } = makeRfs((req) => {
    if (req.body?.type === 'INSPECT_EDGES') {
      const query = req.body as { ids?: string[]; bySource?: string };
      const found = [...liveEdges.values()].filter((edge) =>
        query.ids ? query.ids.includes(edge.id) : edge.source === query.bySource);
      return jsonResponse({ type: 'INSPECT_EDGES', result: { count: found.length, total: found.length, truncated: false, edges: found } });
    }
    if (cmdType(req.body) === 'CONNECT_NODES') {
      // Real executor pre-assigns and echoes this id, but CONNECT_NODES drops it
      // because edge-existing already owns nA -> nB.
      return jsonResponse(createdResponse(undefined, [{ edgeId: 'edge-ghost', source: 'nA', target: 'nB' }]));
    }
    return jsonResponse({});
  });
  const proj = new RelationProjection(client, noopWriter, reg, 'p1');

  const out = await proj.reconcileRelationEdges([
    { relation: { id: 'rel-1', kind: 'references', from: { entityType: 'artifact', entityId: 'a1' }, to: { entityType: 'artifact', entityId: 'a2' } }, fromNodeId: 'nA', toNodeId: 'nB' },
  ]);

  assert.deepEqual(out, { projected: 1, skipped: 0 });
  assert.equal((await reg.findEdge('p1', CANVAS, 'rel-1'))?.spatialId, 'edge-existing');
  assert.equal((await reg.list()).some((binding) => binding.spatialId === 'edge-ghost'), false);
});

test('reconcileRelationEdges: all bound and present -> zero writes', async () => {
  const reg = new ProjectionBindingRegistry(new MemoryBindingStore());
  await reg.bind(edgeBinding('edge-1'));
  let executes = 0;
  const { client } = makeRfs((req) => {
    if (req.body?.type === 'INSPECT_EDGES') {
      const ids = (req.body as { ids: string[] }).ids;
      return jsonResponse({
        type: 'INSPECT_EDGES',
        result: {
          count: ids.length,
          total: ids.length,
          truncated: false,
          edges: ids.map((id) => ({ id, source: 'nA', target: 'nB' })),
        },
      });
    }
    if (cmdType(req.body) === 'CONNECT_NODES') { executes += 1; return jsonResponse(createdResponse()); }
    return jsonResponse({});
  });
  const proj = new RelationProjection(client, noopWriter, reg, 'p1');
  const out = await proj.reconcileRelationEdges([
    { relation: { id: 'rel-1', kind: 'references' as const, from: { entityType: 'artifact' as const, entityId: 'a1' }, to: { entityType: 'artifact' as const, entityId: 'a2' } }, fromNodeId: 'nA', toNodeId: 'nB' },
  ]);
  assert.deepEqual(out, { projected: 0, skipped: 0 });
  assert.equal(executes, 0);
});

test('reconcileRelationEdges: repairs a legacy shared binding without deleting or duplicating its edge', async () => {
  const reg = new ProjectionBindingRegistry(new MemoryBindingStore());
  await reg.bind(edgeBinding('edge-shared', 'rel-1'));
  await reg.bind(edgeBinding('edge-shared', 'rel-2'));
  let executes = 0;
  const { client } = makeRfs((req) => {
    if (req.body?.type === 'INSPECT_EDGES') {
      return jsonResponse({
        type: 'INSPECT_EDGES',
        result: {
          count: 1,
          total: 1,
          truncated: false,
          edges: [{ id: 'edge-shared', source: 'nA', target: 'nB' }],
        },
      });
    }
    executes += 1;
    return jsonResponse(createdResponse());
  });
  const proj = new RelationProjection(client, noopWriter, reg, 'p1');
  const entries = ['rel-1', 'rel-2'].map((id) => ({
    relation: { id, kind: 'references' as const, from: { entityType: 'artifact' as const, entityId: 'a1' }, to: { entityType: 'artifact' as const, entityId: 'a2' } },
    fromNodeId: 'nA',
    toNodeId: 'nB',
  }));

  const out = await proj.reconcileRelationEdges(entries);

  assert.deepEqual(out, { projected: 0, skipped: 1 });
  assert.equal(executes, 0);
  assert.equal((await reg.findEdge('p1', CANVAS, 'rel-1'))?.spatialId, 'edge-shared');
  assert.equal(await reg.findEdge('p1', CANVAS, 'rel-2'), undefined);
});

test('removeOrphanRelationEdge: disconnects + unbinds a leftover edge with no Core relation', async () => {
  const reg = new ProjectionBindingRegistry(new MemoryBindingStore());
  await reg.bind(edgeBinding('edge-ORPHAN'));
  const disconnect: unknown[] = [];
  const { client } = makeRfs((req) => {
    if (req.body?.type === 'INSPECT_EDGES') return inspectEdgesFound((req.body as { ids: string[] }).ids);
    assert.equal(cmdType(req.body), 'DISCONNECT_EDGES');
    disconnect.push((req.body as { commands: { edges: unknown[] }[] }).commands[0].edges);
    return jsonResponse(createdResponse());
  });
  const proj = new RelationProjection(client, noopWriter, reg, 'p1');
  await proj.removeOrphanRelationEdge('rel-1');
  assert.equal(disconnect[0]?.[0], 'edge-ORPHAN');
  assert.equal(await reg.findEdge('p1', CANVAS, 'rel-1'), undefined);
});

test('removeOrphanRelationEdge: 边已不在时视为已收敛，不发 DISCONNECT', async () => {
  const reg = new ProjectionBindingRegistry(new MemoryBindingStore());
  await reg.bind(edgeBinding('edge-ALREADY-GONE'));
  let executed = 0;
  const { client } = makeRfs((req) => {
    if (req.body?.type === 'INSPECT_EDGES') return inspectEdgesFound([]);
    executed += 1;
    return jsonResponse(createdResponse());
  });
  const proj = new RelationProjection(client, noopWriter, reg, 'p1');
  await proj.removeOrphanRelationEdge('rel-1');
  assert.equal(executed, 0, '已不存在的边不应再发 DISCONNECT_EDGES');
  assert.equal(await reg.findEdge('p1', CANVAS, 'rel-1'), undefined);
});

test('removeOrphanRelationEdge: legacy shared edge remains while another relation still owns it', async () => {
  const reg = new ProjectionBindingRegistry(new MemoryBindingStore());
  await reg.bind(edgeBinding('edge-shared', 'rel-orphan'));
  await reg.bind(edgeBinding('edge-shared', 'rel-live'));
  let disconnects = 0;
  const { client } = makeRfs((req) => {
    if (cmdType(req.body) === 'DISCONNECT_EDGES') disconnects += 1;
    return req.body?.type === 'INSPECT_EDGES'
      ? inspectEdgesFound(['edge-shared'])
      : jsonResponse(createdResponse());
  });
  const proj = new RelationProjection(client, noopWriter, reg, 'p1');

  await proj.removeOrphanRelationEdge('rel-orphan');

  assert.equal(disconnects, 0);
  assert.equal(await reg.findEdge('p1', CANVAS, 'rel-orphan'), undefined);
  assert.equal((await reg.findEdge('p1', CANVAS, 'rel-live'))?.spatialId, 'edge-shared');
});

// ---- G0.6: createRelation client (minimal POST) ----

test('relations.createRelation: POSTs minimal input and returns Core-generated relation + changeSetId', async () => {
  const { CoreRelationClient } = await import('../src/backend/relations.js');
  const { HttpClient } = await import('../src/backend/client.js');
  const http = new HttpClient({
    baseUrl: 'http://core.test',
    fetch: async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === 'string' ? input : input.url;
      const body = JSON.parse((init?.body?.toString() ?? '{}'));
      assert.equal(url, 'http://core.test/projects/p1/relations');
      assert.equal(body.sourceEntityType, 'artifact');
      assert.equal(body.kind, 'references');
      assert.equal('createdAt' in body, false);
      return jsonResponse({ ok: true, value: { id: 'relation-gen', projectId: 'p1', sourceEntityType: 'artifact', sourceEntityId: 'a1', targetEntityType: 'artifact', targetEntityId: 'a2', kind: 'references', createdAt: '2026', updatedAt: '2026' }, meta: { changeSetId: 'cs-1' } });
    },
  });
  const client = new CoreRelationClient(http);
  const result = await client.createRelation('p1', { sourceEntityType: 'artifact', sourceEntityId: 'a1', targetEntityType: 'artifact', targetEntityId: 'a2', kind: 'references' });
  assert.equal(result.relation.id, 'relation-gen');
  assert.equal(result.changeSetId, 'cs-1');
});
