import { afterEach, expect, it, vi } from 'vitest';

import { initializeRailwayWorksiteFromDrop } from './initializeRailwayWorksiteFromDrop';
import { navigationGraph } from './navigationFixtures';

import type { RailwayWorksiteNativeCapture } from './initializeRailwayWorksiteFromDrop';
import type { GetCanvasResponse, PutCanvasRequest } from '@huabu/shared';
import type { AgentCanvasCommand, Gen2Host, ProjectionBinding } from '@local-creative-os/web-gen2';
import type * as WebGen2 from '@local-creative-os/web-gen2';

const mocks = vi.hoisted(() => ({
  getCanvas: vi.fn<(id: string) => Promise<GetCanvasResponse>>(),
  putCanvas: vi.fn<(id: string, request: PutCanvasRequest) => Promise<{ canvasId: string; version: number }>>(),
  projection: vi.fn<(canvasId: string) => Promise<void>>(),
  geometry: vi.fn(), outline: vi.fn(), sourceCanvasId: 'source-canvas',
}));

vi.mock('@/api/canvas', () => ({ getCanvas: mocks.getCanvas, putCanvas: mocks.putCanvas }));
vi.mock('@/store/canvasStore', () => ({ default: { getState: () => ({ canvasId: mocks.sourceCanvasId, isLoading: false,
  canvasWrapper: { clientWidth: 1000, clientHeight: 700 } }) } }));
vi.mock('@local-creative-os/web-gen2', async () => {
  const actual = await vi.importActual<typeof WebGen2>('@local-creative-os/web-gen2');
  return { ...actual,
    HuabuRfsClient: class {
      constructor(readonly config: { canvasId: string }) {}
      execute(commands: AgentCanvasCommand[]) { return mocks.geometry(this.config.canvasId, commands); }
      outline() { return mocks.outline(this.config.canvasId); }
    },
    ProjectToSpaceProjection: class {}, RelationProjection: class {},
    ReconciliationRunner: class {
      constructor(readonly deps: { canvasId: string }) {}
      runOnce() { return mocks.projection(this.deps.canvasId); }
    },
  };
});

const created = { workspaceId: 'created-workspace', canvasId: 'new-canvas' };
const capture: RailwayWorksiteNativeCapture = { viewport: { x: 550, y: 310, zoom: 0.8 },
  nodes: [
    { reference: { entityType: 'artifact', entityId: 'artifact', artifactViewId: 'v-primary', revisionId: 'old' },
      absolutePosition: { x: -280, y: 80 }, size: { width: 320, height: 180 } },
    { reference: { entityType: 'artifact', entityId: 'artifact', artifactViewId: 'v-z-extra', revisionId: 'new' },
      absolutePosition: { x: 200, y: 80 }, size: { width: 260, height: 170 } },
  ] };
type TestNode = { id: string; type: 'image' | 'note'; position: { x: number; y: number }; width: number; height: number; data: { untouched: string } };

function fixture() {
  let nodes: TestNode[] = [], version = 0;
  let viewport = { x: 0, y: 0, zoom: 1 };
  const receiver: TestNode = { id: 'receiver', type: 'note', position: { x: 700, y: 300 }, width: 66, height: 100, data: { untouched: 'receiver' } };
  let bindings: ProjectionBinding[] = [
    { projectId: 'p', canvasId: 'new-canvas', spatialKind: 'node', spatialId: 'primary-node', entityType: 'artifact', entityId: 'artifact' },
    { projectId: 'p', canvasId: 'new-canvas', spatialKind: 'node', spatialId: 'extra-node', entityType: 'view', entityId: 'v-z-extra' },
    { projectId: 'p', canvasId: 'new-canvas', spatialKind: 'node', spatialId: 'receiver', entityType: 'conversation', entityId: 'real-receiver' },
  ];
  const graph = navigationGraph({
    scopes: [{ id: 'root', kind: 'root' }, { id: 'scope-created', kind: 'delivery' }],
    workspaces: [{ id: 'created-workspace', projectId: 'p', canvasId: 'new-canvas', scopeId: 'scope-created', focusedViewIds: [] }],
    artifacts: [{ id: 'artifact', projectId: 'p', currentRevisionId: 'new' }],
    artifactViews: [
      { id: 'v-primary', artifactId: 'artifact', scopeId: 'root', revisionId: 'old', referenceKind: 'primary', size: { width: 270, height: 180 }, position: { x: 9999, y: 9999 } },
      { id: 'v-z-extra', artifactId: 'artifact', scopeId: 'root', revisionId: 'new', referenceKind: 'explicit_additional', size: { width: 270, height: 180 }, position: { x: 8888, y: 8888 } },
    ],
    workspaceMemberships: [{ workspaceId: 'created-workspace', artifactViewId: 'v-primary' },
      { workspaceId: 'created-workspace', artifactViewId: 'v-z-extra' }],
  });
  mocks.getCanvas.mockImplementation(async id => ({ canvasId: id, title: 'new scene', version,
    state: structuredClone({ nodes, edges: [], viewport, retained: 'native-field' }) }));
  mocks.putCanvas.mockImplementation(async (id, request) => {
    expect(request.version).toBe(version);
    const state = request.state as { nodes: TestNode[]; viewport: typeof viewport; retained: string };
    expect(state.retained).toBe('native-field');
    nodes = structuredClone(state.nodes); viewport = { ...state.viewport }; version += 1;
    return { canvasId: id, version };
  });
  mocks.projection.mockImplementation(async targetId => {
    expect(targetId).toBe('new-canvas');
    nodes = [{ id: 'primary-node', type: 'image', position: { x: 0, y: 0 }, width: 270, height: 180, data: { untouched: 'primary' } },
      { id: 'extra-node', type: 'image', position: { x: 300, y: 0 }, width: 270, height: 180, data: { untouched: 'extra' } }, receiver];
    version += 1;
  });
  mocks.geometry.mockImplementation(async (id: string, commands: AgentCanvasCommand[]) => {
    const fromVersion = version;
    expect(id).toBe('new-canvas'); expect(commands).toHaveLength(1);
    const command = commands[0];
    if (command?.type !== 'SET_NODE_GEOMETRY') throw new Error('Only native geometry is allowed');
    nodes = nodes.map(node => {
      const item = command.items.find(update => update.nodeId === node.id);
      return item ? { ...node, ...(item.position ? { position: { ...item.position } } : {}),
        ...(item.size ? { width: item.size.width, ...(typeof item.size.height === 'number' ? { height: item.size.height } : {}) } : {}) } : node;
    });
    version += 1;
    return { canvasId: id, fromVersion, toVersion: version, results: [{ index: 0, type: command.type, applied: true }] };
  });
  mocks.outline.mockImplementation(async id => {
    expect(id).toBe('new-canvas');
    return { type: 'GET_SPACE_OUTLINE', result: { version, nodes: nodes.map(node => ({ id: node.id, type: node.type,
      position: node.position, absolutePosition: node.position, size: { width: node.width, height: node.height } })) } };
  });
  const host = { projectId: 'p', projects: { getProjectGraph: vi.fn(async () => graph) },
    bindings: { list: vi.fn(async () => bindings) }, relations: { createRelation: vi.fn(), deleteRelation: vi.fn() },
  } as unknown as Gen2Host;
  return { host, graph, nodes: () => nodes, viewport: () => viewport, receiver,
    removeExtraBinding: () => { bindings = bindings.filter(binding => binding.entityType !== 'view'); },
    editBefore: () => { nodes = [receiver]; viewport = { x: 34, y: 45, zoom: 1 }; },
    editDuring: () => {
      const original = mocks.projection.getMockImplementation();
      mocks.projection.mockImplementation(async id => { await original?.(id); nodes.push({ ...receiver, id: 'user-added' }); });
    },
  };
}

afterEach(() => { vi.clearAllMocks(); mocks.sourceCanvasId = 'source-canvas'; });

it('formally warms only the target scene, restores exact primary/extra View geometry once and saves captured native camera with version', async () => {
  const f = fixture();
  expect(await initializeRailwayWorksiteFromDrop(f.host, created, capture)).toMatchObject({ status: 'initialized',
    initializedNodeIds: ['primary-node', 'extra-node'] });
  expect(mocks.geometry).toHaveBeenCalledTimes(1); expect(mocks.putCanvas).toHaveBeenCalledTimes(1);
  expect(f.nodes().find(node => node.id === 'primary-node')).toMatchObject({ position: { x: -280, y: 80 }, width: 320, height: 180 });
  expect(f.nodes().find(node => node.id === 'extra-node')).toMatchObject({ position: { x: 200, y: 80 }, width: 260, height: 170 });
  expect(f.nodes().find(node => node.id === 'receiver')).toEqual(f.receiver);
  expect(f.viewport()).toEqual(capture.viewport);
  expect(mocks.sourceCanvasId).toBe('source-canvas');
  expect(mocks.getCanvas.mock.calls.every(([id]) => id === 'new-canvas')).toBe(true);
  expect(f.graph.artifactViews[0]?.position).toEqual({ x: 9999, y: 9999 });
});

it('warm-projects Assembly inputs without captured spatial nodes and fits material bounds through existing Native viewport math', async () => {
  const f = fixture();
  expect((await initializeRailwayWorksiteFromDrop(f.host, created, { viewport: capture.viewport, nodes: [],
    viewportSize: { width: 1000, height: 700 } })).status).toBe('initialized');
  expect(mocks.geometry).not.toHaveBeenCalled(); expect(mocks.projection).toHaveBeenCalledTimes(1);
  const camera = f.viewport();
  expect(camera.x + 285 * camera.zoom).toBeCloseTo(500);
  expect(camera.y + 90 * camera.zoom).toBeCloseTo(350);
  expect(camera.x).not.toBe(0);
});

it('still saves the captured camera when projected native geometry already matches and RFS would only return no-op', async () => {
  const f = fixture();
  const already: RailwayWorksiteNativeCapture = { ...capture, nodes: capture.nodes.map((node, index) => ({ ...node,
    absolutePosition: { x: index * 300, y: 0 }, size: { width: 270, height: 180 } })) };
  expect((await initializeRailwayWorksiteFromDrop(f.host, created, already)).status).toBe('initialized');
  expect(mocks.geometry).not.toHaveBeenCalled(); expect(f.viewport()).toEqual(capture.viewport);
});

it('does not overwrite an already edited or populated target even for the same operation retry', async () => {
  const f = fixture(); f.editBefore();
  expect(await initializeRailwayWorksiteFromDrop(f.host, created, capture)).toMatchObject({ status: 'skipped', message: expect.stringContaining('未覆盖') });
  expect(mocks.projection).not.toHaveBeenCalled(); expect(mocks.geometry).not.toHaveBeenCalled(); expect(mocks.putCanvas).not.toHaveBeenCalled();
});

it('refuses newly added unbound nodes after projection and preserves them', async () => {
  const f = fixture(); f.editDuring();
  expect((await initializeRailwayWorksiteFromDrop(f.host, created, capture)).status).toBe('skipped');
  expect(f.nodes().some(node => node.id === 'user-added')).toBe(true);
  expect(mocks.geometry).not.toHaveBeenCalled(); expect(mocks.putCanvas).not.toHaveBeenCalled();
});

it('never aliases an absent historical extra View binding to the primary artifact node', async () => {
  const f = fixture(); f.removeExtraBinding();
  expect(await initializeRailwayWorksiteFromDrop(f.host, created, capture)).toMatchObject({ status: 'skipped',
    message: expect.stringContaining('未把两份历史引用写到同一节点') });
  expect(mocks.geometry).not.toHaveBeenCalled(); expect(mocks.putCanvas).not.toHaveBeenCalled();
});

it('rejects a different displayed revision before touching native projection or geometry', async () => {
  const f = fixture();
  const first = capture.nodes[0];
  if (!first) throw new Error('Missing source fixture');
  const wrong: RailwayWorksiteNativeCapture = { ...capture, nodes: [{ ...first,
    reference: { ...first.reference, revisionId: 'new' } }] };
  expect((await initializeRailwayWorksiteFromDrop(f.host, created, wrong)).status).toBe('skipped');
  expect(mocks.projection).not.toHaveBeenCalled(); expect(mocks.geometry).not.toHaveBeenCalled();
});

it('stops before geometry if the user navigates away while projection warms', async () => {
  const f = fixture();
  const original = mocks.projection.getMockImplementation();
  mocks.projection.mockImplementation(async id => { await original?.(id); mocks.sourceCanvasId = 'another-source'; });
  expect((await initializeRailwayWorksiteFromDrop(f.host, created, capture)).status).toBe('skipped');
  expect(mocks.geometry).not.toHaveBeenCalled(); expect(mocks.putCanvas).not.toHaveBeenCalled();
});

it('keeps geometry honest but reports camera conflict instead of overwriting a newer native save', async () => {
  const f = fixture();
  mocks.putCanvas.mockRejectedValue(new Error('CANVAS_VERSION_CONFLICT'));
  expect(await initializeRailwayWorksiteFromDrop(f.host, created, capture)).toMatchObject({ status: 'skipped',
    initializedNodeIds: ['primary-node', 'extra-node'], message: 'CANVAS_VERSION_CONFLICT' });
  expect(f.viewport()).toEqual({ x: 0, y: 0, zoom: 1 });
});
