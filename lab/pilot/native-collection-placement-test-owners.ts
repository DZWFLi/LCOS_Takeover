import { createLcosCoreSession } from '../../lcos/huabu/apps/web/src/lcos/app/lcosCoreClient.ts';
import { useLcosShellStore } from '../../lcos/huabu/apps/web/src/lcos/shell/lcosShellStore.ts';
import { DropCommitRouter } from '../../lcos/huabu/apps/web/src/lcos/drop/dropCommitRouter.ts';
import { captureAssemblyCollectionGeometry, placeAssemblyCollections } from '../../lcos/huabu/apps/web/src/lcos/drop/assemblyCollectionPlacement.ts';
import { createNativeCollectionPlacementHost, commitNativeCollectionGeometry } from './native-collection-placement.ts';
import useCanvasStore from './native-canvas-port.ts';

type TestNode = Record<string, any> & { id: string; position?: { x: number; y: number } };
type PlacementTestApi = {
  getNodes(): readonly TestNode[];
  getEdges(): readonly unknown[];
  getSelection(): { nodeIds: readonly string[]; edgeIds: readonly string[] };
  getViewport(): { x: number; y: number; zoom: number };
  subscribeNative(listener: () => void): () => void;
  flushCanvas(canvasId: string): Promise<'saved' | 'blocked'>;
  synchronizeCollectionCarrier(input: Record<string, any>, options?: { isCurrent?: () => boolean }): Promise<{ ok: boolean; reason?: string }>;
  prepareCollectionGeometryHistory(input: Record<string, any>, options?: { isCurrent?: () => boolean }): { ok: boolean; reason?: string };
  placeCollectionCarrier(input: Record<string, any>, options?: { isCurrent?: () => boolean }): { ok: boolean; reason?: string };
};

declare global {
  interface Window {
    __LCOS_NODE_LAB__?: Record<string, any>;
    __NATIVE_COLLECTION_PLACEMENT_TEST__?: Record<string, any>;
  }
}

let testState: any;
let nativeApi: PlacementTestApi;
let placementHost: ReturnType<typeof createNativeCollectionPlacementHost>;
const router = new DropCommitRouter();

function publishNodes(nodes: readonly TestNode[]): void {
  testState.nodes = nodes.map(node => ({ ...node }));
  for (const listener of [...testState.listeners]) listener();
}

function install(input: { projectId: string; canvasId: string; workspaceId: string; nodes: readonly TestNode[] }) {
  testState = { ...input, nodes: input.nodes.map(node => ({ ...node })), listeners: new Set<() => void>(),
    events: [], pendingNodeId: null, flushBlocked: 0, syncDelayMs: 0, syncEntered: false, targetCurrent: true,
    holdSynchronization: false, releaseSynchronization: null, mismatchReadback: 0, assemblyApplyCalls: 0 };
  nativeApi = {
    getNodes: () => testState.nodes,
    getEdges: () => [],
    getSelection: () => ({ nodeIds: [], edgeIds: [] }),
    getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
    subscribeNative(listener) { testState.listeners.add(listener); return () => testState.listeners.delete(listener); },
    async flushCanvas(canvasId) {
      testState.events.push({ method: 'flushCanvas', canvasId });
      if (canvasId !== testState.canvasId) return 'blocked';
      if (testState.flushBlocked > 0) { testState.flushBlocked -= 1; return 'blocked'; }
      const nodeId = testState.pendingNodeId;
      if (!nodeId) return 'saved';
      const node = testState.nodes.find(item => item.id === nodeId);
      if (!node) return 'blocked';
      const response = await fetch(`/api/canvas/v1/canvases/${encodeURIComponent(canvasId)}/nodes:batchActions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canvas_id: canvasId, actions: [{ action: 'update', updates: [{
          id: node.id, type: node.type, position: node.position, measured: node.measured, data: node.data,
        }] }] }),
      });
      const result = await response.json();
      if (!response.ok || result?.code !== 0 || result.data?.spatial_saved !== true) return 'blocked';
      testState.pendingNodeId = null;
      return 'saved';
    },
    async synchronizeCollectionCarrier(input, options) {
      testState.syncEntered = true;
      testState.events.push({ method: 'synchronizeCollectionCarrier', projectId: input.projectId,
        canvasId: input.canvasId, workspaceId: input.workspaceId, nodeId: input.node?.id });
      if (testState.holdSynchronization) await new Promise<void>(resolve => { testState.releaseSynchronization = resolve; });
      if (testState.syncDelayMs) await new Promise(resolve => setTimeout(resolve, testState.syncDelayMs));
      if (options?.isCurrent && !options.isCurrent()) return { ok: false, reason: 'recording adapter observed stale host' };
      const node = input.node as TestNode;
      publishNodes(testState.nodes.some(current => current.id === node.id)
        ? testState.nodes.map(current => current.id === node.id ? node : current) : [...testState.nodes, node]);
      return { ok: true };
    },
    prepareCollectionGeometryHistory(input, options) {
      testState.events.push({ method: 'prepareCollectionGeometryHistory', ...input });
      if (options?.isCurrent && !options.isCurrent()) return { ok: false, reason: 'stale before history prepare' };
      return { ok: true };
    },
    placeCollectionCarrier(input, options) {
      testState.events.push({ method: 'placeCollectionCarrier', ...input });
      if (options?.isCurrent && !options.isCurrent()) return { ok: false, reason: 'stale before native geometry' };
      const current = testState.nodes.find((node: TestNode) => node.id === input.nodeId);
      if (!current || current.data?.lcos_collection_ref?.collectionId !== input.collectionId) return { ok: false, reason: 'identity mismatch' };
      publishNodes(testState.nodes.map((node: TestNode) => node.id === input.nodeId
        ? { ...node, position: { ...input.position } } : node));
      testState.pendingNodeId = input.nodeId;
      return { ok: true };
    },
  };
  useLcosShellStore.setState({ projectId: input.projectId, activeSurface: 'main', activeWorkspaceId: input.workspaceId,
    surfaceCanvasId: { main: input.canvasId, context: 'unselected-context', workflow: 'unselected-workflow' } });
  window.__LCOS_NODE_LAB__ = { projectId: input.projectId, canvasId: input.canvasId, currentCanvasId: input.canvasId, api: nativeApi };
  window.dispatchEvent(new Event('lcos-native-bridge-changed'));
  placementHost = createNativeCollectionPlacementHost(input.projectId, input.canvasId);
  if (!placementHost) throw new Error('recording native API did not become the selected original Canvas port');
  return { hostCurrent: placementHost.isCurrent(), apiIdentity: useCanvasStore.getState().rfInstance === nativeApi };
}

function setFaults(input: Record<string, unknown>) { Object.assign(testState, input); }
function setTargetCurrent(value: boolean) { testState.targetCurrent = value; }
function setWorkspace(workspaceId: string) { useLcosShellStore.setState({ activeWorkspaceId: workspaceId }); }
function setSurface(surface: 'main' | 'context' | 'workflow') { useLcosShellStore.setState({ activeSurface: surface }); }
function releaseSynchronization() { testState.holdSynchronization = false; testState.releaseSynchronization?.(); testState.releaseSynchronization = null; }
function replaceApi() {
  window.__LCOS_NODE_LAB__ = { ...window.__LCOS_NODE_LAB__, api: { ...nativeApi } };
  window.dispatchEvent(new Event('lcos-native-bridge-changed'));
}
function currentState() { const shell = useLcosShellStore.getState(); return {
  projectId: testState.projectId, canvasId: testState.canvasId, workspaceId: shell.activeWorkspaceId,
  activeSurface: shell.activeSurface, hostCurrent: placementHost?.isCurrent() === true,
  nodes: testState.nodes.map((node: TestNode) => ({ ...node })), events: [...testState.events],
  assemblyApplyCalls: testState.assemblyApplyCalls,
}; }
function nativeCanvasState() { return useCanvasStore.getState(); }
function makePlacementHost(projectId: string, canvasId: string) { return createNativeCollectionPlacementHost(projectId, canvasId); }

async function commitAssembly(input: { transactionId: string; projectId: string; canvasId: string; collectionId: string;
  workspaceId: string; point: { x: number; y: number }; targetRef?: Record<string, unknown> }) {
  if (!placementHost) throw new Error('placement host is not installed');
  const intent = { kind: 'assembly-apply' as const, targetId: `canvas:${input.canvasId}`,
    targetRef: input.targetRef ?? { kind: 'main' }, sourceRefs: [{ kind: 'collection' as const, id: input.collectionId }],
    placementPoint: input.point };
  const snapshot = captureAssemblyCollectionGeometry(useCanvasStore.getState().nodes as any);
  const isCurrent = () => testState.targetCurrent && placementHost?.isCurrent() === true
    && useLcosShellStore.getState().activeWorkspaceId === input.workspaceId;
  return router.commit(intent, input.transactionId, {
    projectId: input.projectId,
    async applyAssembly(receiveIntent) {
      testState.assemblyApplyCalls += 1;
      const session = createLcosCoreSession();
      return session.assembly.apply(input.projectId, {
        schemaVersion: 1,
        projectId: input.projectId,
        sourceRefs: receiveIntent.sourceRefs,
        targetRef: receiveIntent.targetRef,
      });
    },
    async onAssemblyApplied(receiveIntent, receipt, signal) {
      await placeAssemblyCollections({ projectId: input.projectId, canvasId: input.canvasId,
        host: placementHost as any, intent: receiveIntent, receipt, geometryAtRelease: snapshot,
        isCurrent, signal });
    },
    addComposerReference() {},
  });
}

window.__NATIVE_COLLECTION_PLACEMENT_TEST__ = {
  install, setFaults, setTargetCurrent, setWorkspace, setSurface, releaseSynchronization, replaceApi, currentState, nativeCanvasState, makePlacementHost, commitAssembly,
};
