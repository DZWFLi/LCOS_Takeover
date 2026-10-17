import { useSyncExternalStore } from 'react';

export interface NativeCanvasNode extends Readonly<Record<string, unknown>> {
  readonly id: string;
  readonly type?: string;
  readonly selected?: boolean;
  readonly position?: Readonly<{ x: number; y: number }>;
  readonly data?: Readonly<Record<string, unknown>>;
  readonly measured?: Readonly<{ width?: number; height?: number }>;
  readonly width?: number;
  readonly height?: number;
}

export interface NativeCanvasEdge extends Readonly<Record<string, unknown>> {
  readonly id: string;
  readonly source?: string;
  readonly target?: string;
  readonly selected?: boolean;
}

export interface NativeCanvasViewport {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

interface OriginalNodeApi {
  getNodes(): readonly NativeCanvasNode[];
  getEdges(): readonly NativeCanvasEdge[];
  getSelection(): { readonly nodeIds: readonly string[]; readonly edgeIds: readonly string[] };
  getViewport(): NativeCanvasViewport;
  updateNode?(id: string, changes: Readonly<Record<string, unknown>>, options?: unknown): void;
  updateNodeData?(id: string, patch: Readonly<Record<string, unknown>>, options?: unknown): void;
  subscribeNative?(listener: () => void): () => void;
  getZoom?(): number;
  screenToFlowPosition?(point: { x: number; y: number }): { x: number; y: number };
  flowToScreenPosition?(point: { x: number; y: number }): { x: number; y: number };
  fitView?(options?: unknown): Promise<boolean> | boolean;
  fitBounds?(bounds: unknown, options?: unknown): Promise<boolean> | boolean;
  setCenter?(x: number, y: number, options?: unknown): Promise<boolean> | boolean;
  setViewport?(viewport: NativeCanvasViewport, options?: unknown): Promise<boolean> | boolean;
  zoomIn?(options?: unknown): Promise<boolean> | boolean;
  zoomOut?(options?: unknown): Promise<boolean> | boolean;
  zoomTo?(zoom: number, options?: unknown): Promise<boolean> | boolean;
  getNode?(id: string): NativeCanvasNode | undefined;
  getNodesBounds?(ids: readonly string[]): unknown;
  findMaterialPlacement?(size: { readonly width: number; readonly height: number }): { readonly x: number; readonly y: number } | undefined;
  undo?(): void;
  redo?(): void;
  prepareCollectionGeometryHistory?(input: { readonly projectId: string; readonly canvasId: string; readonly workspaceId: string }, options?: { readonly isCurrent?: () => boolean }): { readonly ok: boolean; readonly reason?: string };
  placeCollectionCarrier?(input: { readonly projectId: string; readonly canvasId: string; readonly workspaceId: string;
    readonly nodeId: string; readonly collectionId: string; readonly position: { readonly x: number; readonly y: number } }, options?: { readonly isCurrent?: () => boolean }): { readonly ok: boolean; readonly reason?: string };
  synchronizeCollectionCarrier?(input: { readonly projectId: string; readonly canvasId: string; readonly workspaceId: string;
    readonly node: unknown }, options?: { readonly isCurrent?: () => boolean }): Promise<{ readonly ok: boolean; readonly reason?: string }>;
  synchronizeMaterialProjection?(input: { readonly projectId: string; readonly canvasId: string; readonly workspaceId: string;
    readonly artifactId: string; readonly artifactViewId: string; readonly revisionId: string; readonly node: unknown },
    options: { readonly isCurrent: () => boolean }): Promise<{ readonly ok: boolean; readonly reason?: string }>;
  toggleCollectionSpace?(input: { readonly projectId: string; readonly canvasId: string; readonly workspaceId: string;
    readonly collectionId: string; readonly nodeId: string }, options?: { readonly isCurrent?: () => boolean }): Promise<{
      readonly ok: boolean; readonly reason?: string; readonly frameId?: string; readonly collapsed?: boolean }>;
  mergeCollectionSpace?(input: { readonly projectId: string; readonly canvasId: string; readonly workspaceId: string;
    readonly collectionId: string; readonly nodeId: string; readonly sourceCollectionId: string; readonly sourceNodeId: string },
    options: { readonly isCurrent: () => boolean }): Promise<{ readonly ok: boolean; readonly reason?: string;
      readonly sourceNodeId?: string; readonly targetNodeId?: string }>;
  arrangeCollectionSpace?(input: { readonly projectId: string; readonly canvasId: string; readonly workspaceId: string;
    readonly collectionId: string; readonly nodeId: string }, options: { readonly isCurrent: () => boolean }): Promise<{
      readonly ok: boolean; readonly reason?: string; readonly frameId?: string; readonly idempotent?: boolean }>;
  backfillNodeReceipt?(input: unknown): { readonly ok: boolean; readonly reason?: string };
  flushCanvas?(canvasId: string, options?: { readonly retry?: boolean }): Promise<'saved' | 'blocked'>;
  synchronizeExecutionProjection?(input: {
    readonly projectId: string;
    readonly canvasId: string;
    readonly workspaceId: string;
  }, options?: { readonly isCurrent?: () => boolean; readonly retryPendingSave?: boolean }): Promise<{ readonly ok: boolean; readonly reason?: string }>;
  synchronizeConversationProjection?(input: {
    readonly projectId: string;
    readonly canvasId: string;
    readonly workspaceId: string;
    readonly connectedConversationId: string;
  }, options?: { readonly isCurrent?: () => boolean; readonly retryPendingSave?: boolean }): Promise<{ readonly ok: boolean; readonly reason?: string }>;
}

interface NativeNodeLab {
  readonly projectId?: unknown;
  readonly canvasId?: unknown;
  readonly currentCanvasId?: unknown;
  readonly api?: OriginalNodeApi | null;
}

declare global {
  interface Window {
    __LCOS_NODE_LAB__?: NativeNodeLab;
  }
}

type UnsupportedCanvasWrite = (...args: readonly unknown[]) => never;

export interface NativeCanvasSnapshot {
  readonly status: 'waiting' | 'ready' | 'unavailable';
  readonly canvasId: string | null;
  readonly nodes: readonly NativeCanvasNode[];
  readonly edges: readonly NativeCanvasEdge[];
  readonly selectedNodeIds: readonly string[];
  readonly selectedEdgeIds: readonly string[];
  /** One-shot editor focus request, scoped to the current original Canvas/API. */
  readonly pendingInlineEditNodeId: string | null;
  readonly viewport: NativeCanvasViewport | null;
  readonly canvasWrapper: Element | null;
  readonly rfInstance: OriginalNodeApi | null;
  readonly undo: () => void;
  readonly redo: () => void;
  readonly setViewport: (viewport: NativeCanvasViewport, options?: unknown) => Promise<boolean>;
  readonly addNode: UnsupportedCanvasWrite;
  readonly addNodes: UnsupportedCanvasWrite;
  readonly copySelectedNodes: UnsupportedCanvasWrite;
  readonly deleteNodes: UnsupportedCanvasWrite;
  readonly disconnectEdges: UnsupportedCanvasWrite;
  readonly executeCommands: UnsupportedCanvasWrite;
  readonly frameSelectedNodes: UnsupportedCanvasWrite;
  readonly pasteNodes: UnsupportedCanvasWrite;
  readonly selectNodes: UnsupportedCanvasWrite;
  readonly sendSelectedToOrder: UnsupportedCanvasWrite;
  readonly tryRename: UnsupportedCanvasWrite;
  readonly updateNodeData: (nodeId: string, patch: Readonly<Record<string, unknown>>, options?: unknown) => void;
  readonly requestInlineEdit: (nodeId: string) => void;
  readonly consumeInlineEditRequest: (nodeId: string) => void;
  readonly setNodeGeometry: UnsupportedCanvasWrite;
  readonly beginNodeDataGesture: UnsupportedCanvasWrite;
  readonly endNodeDataGesture: UnsupportedCanvasWrite;
  readonly _setStateNoAutosave: UnsupportedCanvasWrite;
  readonly flushCanvasEvents: UnsupportedCanvasWrite;
  readonly patchNodeSilent: UnsupportedCanvasWrite;
  readonly saveCanvas: UnsupportedCanvasWrite;
  readonly switchCanvas: UnsupportedCanvasWrite;
  readonly applyDeltasFromAgent: UnsupportedCanvasWrite;
  readonly beginGesture: UnsupportedCanvasWrite;
  readonly moveNodeOutOfFrame: UnsupportedCanvasWrite;
  readonly refreshWorldReferences: UnsupportedCanvasWrite;
  readonly onEdgesChange: UnsupportedCanvasWrite;
  readonly setState: UnsupportedCanvasWrite;
}

export class NativeCanvasWriteUnsupportedError extends Error {
  constructor(method: string) {
    super(`Native Canvas bridge cannot write ${method}; the current TapNow Canvas and existing Core/Huabu producer are not mapped for this operation.`);
    this.name = 'NativeCanvasWriteUnsupportedError';
  }
}

function unsupported(method: string): UnsupportedCanvasWrite {
  return () => { throw new NativeCanvasWriteUnsupportedError(method); };
}

function nodeLab(): NativeNodeLab | undefined {
  return typeof window === 'undefined' ? undefined : window.__LCOS_NODE_LAB__;
}

function canvasIdOf(host: NativeNodeLab | undefined): string | null {
  const value = typeof host?.currentCanvasId === 'string' && host.currentCanvasId.trim()
    ? host.currentCanvasId
    : host?.canvasId;
  return typeof value === 'string' && value.trim() ? value : null;
}

const TEXT_PRESENTATION_FIELDS = new Set([
  'lcosTextViewMode',
  'lcosTextCollapsedIds',
  'lcosTextBeforeMindMapSize',
]);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validateTextPresentationPatch(value: unknown): Record<string, unknown> {
  if (!isPlainRecord(value)) throw new TypeError('Text presentation updates need a plain data object.');
  const keys = Object.keys(value);
  if (keys.length === 0 || keys.some((key) => !TEXT_PRESENTATION_FIELDS.has(key))) {
    throw new NativeCanvasWriteUnsupportedError('updateNodeData fields outside text presentation');
  }
  if (Object.hasOwn(value, 'lcosTextViewMode')
    && !['text', 'outline', 'mindmap'].includes(String(value.lcosTextViewMode))) {
    throw new TypeError('lcosTextViewMode must be text, outline, or mindmap.');
  }
  if (Object.hasOwn(value, 'lcosTextCollapsedIds')
    && (!Array.isArray(value.lcosTextCollapsedIds) || value.lcosTextCollapsedIds.some((id) => typeof id !== 'string'))) {
    throw new TypeError('lcosTextCollapsedIds must be an array of strings.');
  }
  if (Object.hasOwn(value, 'lcosTextBeforeMindMapSize')) {
    const size = value.lcosTextBeforeMindMapSize;
    if (!isPlainRecord(size) || Object.keys(size).sort().join(',') !== 'height,width'
      || !Number.isFinite(size.width) || !Number.isFinite(size.height)
      || Number(size.width) <= 0 || Number(size.height) <= 0) {
      throw new TypeError('lcosTextBeforeMindMapSize must contain only positive finite width and height.');
    }
  }
  return { ...value };
}

function validateNodeDataPatch(value: unknown): Record<string, unknown> {
  if (!isPlainRecord(value)) throw new TypeError('updateNodeData needs a plain data object.');
  const presentation: Record<string, unknown> = {};
  for (const key of TEXT_PRESENTATION_FIELDS) if (Object.hasOwn(value, key)) presentation[key] = value[key];
  if (Object.keys(presentation).length) validateTextPresentationPatch(presentation);
  return { ...value };
}

function assertCurrentCanvasApi(canvasId: string | null, api: OriginalNodeApi | null): asserts api is OriginalNodeApi {
  const host = nodeLab();
  if (!canvasId || !api || host?.api !== api || canvasIdOf(host) !== canvasId) {
    throw new NativeCanvasWriteUnsupportedError('write through a stale or non-current Canvas/API');
  }
}

function liveNode(api: OriginalNodeApi, nodeId: string): NativeCanvasNode | undefined {
  return api.getNode?.(nodeId) ?? api.getNodes().find((node) => node.id === nodeId);
}

interface InlineEditRequest {
  readonly canvasId: string;
  readonly api: OriginalNodeApi;
  readonly nodeId: string;
}

let currentSnapshot: NativeCanvasSnapshot | undefined;
let currentSignature = '';
const listeners = new Set<() => void>();
let releaseNativeSubscription: (() => void) | undefined;
let subscribedApi: OriginalNodeApi | null = null;
let bridgeReadFailed = false;
let inlineEditRequest: InlineEditRequest | null = null;

const EMPTY_SNAPSHOT: NativeCanvasSnapshot = {
  status: 'waiting',
  canvasId: null,
  nodes: [],
  edges: [],
  selectedNodeIds: [],
  selectedEdgeIds: [],
  pendingInlineEditNodeId: null,
  viewport: null,
  canvasWrapper: null,
  rfInstance: null,
  undo: unsupported('undo'),
  redo: unsupported('redo'),
  setViewport: async () => { throw new NativeCanvasWriteUnsupportedError('setViewport'); },
  addNode: unsupported('addNode'),
  addNodes: unsupported('addNodes'),
  copySelectedNodes: unsupported('copySelectedNodes'),
  deleteNodes: unsupported('deleteNodes'),
  disconnectEdges: unsupported('disconnectEdges'),
  executeCommands: unsupported('executeCommands'),
  frameSelectedNodes: unsupported('frameSelectedNodes'),
  pasteNodes: unsupported('pasteNodes'),
  selectNodes: unsupported('selectNodes'),
  sendSelectedToOrder: unsupported('sendSelectedToOrder'),
  tryRename: unsupported('tryRename'),
  updateNodeData: unsupported('updateNodeData'),
  requestInlineEdit: unsupported('requestInlineEdit'),
  consumeInlineEditRequest: unsupported('consumeInlineEditRequest'),
  setNodeGeometry: unsupported('setNodeGeometry'),
  beginNodeDataGesture: unsupported('beginNodeDataGesture'),
  endNodeDataGesture: unsupported('endNodeDataGesture'),
  _setStateNoAutosave: unsupported('_setStateNoAutosave'),
  flushCanvasEvents: unsupported('flushCanvasEvents'),
  patchNodeSilent: unsupported('patchNodeSilent'),
  saveCanvas: unsupported('saveCanvas'),
  switchCanvas: unsupported('switchCanvas'),
  applyDeltasFromAgent: unsupported('applyDeltasFromAgent'),
  beginGesture: unsupported('beginGesture'),
  moveNodeOutOfFrame: unsupported('moveNodeOutOfFrame'),
  refreshWorldReferences: unsupported('refreshWorldReferences'),
  onEdgesChange: unsupported('onEdgesChange'),
  setState: unsupported('setState'),
};

function signatureOf(input: {
  canvasId: string | null;
  api: OriginalNodeApi | null;
  nodes: readonly NativeCanvasNode[];
  edges: readonly NativeCanvasEdge[];
  selectedNodeIds: readonly string[];
  selectedEdgeIds: readonly string[];
  pendingInlineEditNodeId: string | null;
  viewport: NativeCanvasViewport | null;
}): string {
  return JSON.stringify({
    canvasId: input.canvasId,
    nodes: input.nodes,
    edges: input.edges,
    selectedNodeIds: input.selectedNodeIds,
    selectedEdgeIds: input.selectedEdgeIds,
    pendingInlineEditNodeId: input.pendingInlineEditNodeId,
    viewport: input.viewport,
  });
}

function refreshSnapshot(notify: boolean): void {
  const host = nodeLab();
  const api = host?.api ?? null;
  const canvasId = canvasIdOf(host);
  let nodes: readonly NativeCanvasNode[] = [];
  let edges: readonly NativeCanvasEdge[] = [];
  let selectedNodeIds: readonly string[] = [];
  let selectedEdgeIds: readonly string[] = [];
  let viewport: NativeCanvasViewport | null = null;
  bridgeReadFailed = false;

  if (api !== null) {
    try {
      nodes = api.getNodes();
      edges = api.getEdges();
      const selection = api.getSelection();
      selectedNodeIds = selection.nodeIds;
      selectedEdgeIds = selection.edgeIds;
      viewport = api.getViewport();
    } catch {
      // A bridge can be disconnecting while React renders. Keep the state honest.
      bridgeReadFailed = true;
      nodes = [];
      edges = [];
      selectedNodeIds = [];
      selectedEdgeIds = [];
      viewport = null;
    }
  }

  if (inlineEditRequest && (inlineEditRequest.api !== api || inlineEditRequest.canvasId !== canvasId
    || !nodes.some((node) => node.id === inlineEditRequest?.nodeId && (node.type === 'text' || node.type === 'note')))) {
    inlineEditRequest = null;
  }
  const pendingInlineEditNodeId = inlineEditRequest?.api === api && inlineEditRequest.canvasId === canvasId
    ? inlineEditRequest.nodeId : null;

  const signature = signatureOf({ canvasId, api, nodes, edges, selectedNodeIds, selectedEdgeIds, pendingInlineEditNodeId, viewport });
  const canvasWrapper = typeof document === 'undefined' ? null : document.querySelector('.react-flow');
  if (currentSnapshot !== undefined && signature === currentSignature
    && currentSnapshot.rfInstance === api && currentSnapshot.canvasWrapper === canvasWrapper) return;
  const previous = currentSnapshot;
  currentSignature = signature;
  currentSnapshot = {
    status: api === null ? 'waiting' : bridgeReadFailed || canvasId === null ? 'unavailable' : 'ready',
    canvasId: api === null || bridgeReadFailed ? null : canvasId,
    nodes,
    edges,
    selectedNodeIds,
    selectedEdgeIds,
    pendingInlineEditNodeId,
    viewport,
    canvasWrapper,
    rfInstance: api,
    undo: unsupported('undo'),
    redo: unsupported('redo'),
    setViewport: async (next, options) => {
      if (api === null || api.setViewport === undefined) {
        throw new NativeCanvasWriteUnsupportedError('setViewport');
      }
      assertCurrentCanvasApi(canvasId, api);
      const changed = await api.setViewport(next, options);
      syncNativeSubscription();
      refreshSnapshot(true);
      return changed === true;
    },
    addNode: unsupported('addNode'),
    addNodes: unsupported('addNodes'),
    copySelectedNodes: unsupported('copySelectedNodes'),
    deleteNodes: unsupported('deleteNodes'),
    disconnectEdges: unsupported('disconnectEdges'),
    executeCommands: unsupported('executeCommands'),
    frameSelectedNodes: unsupported('frameSelectedNodes'),
    pasteNodes: unsupported('pasteNodes'),
    selectNodes: unsupported('selectNodes'),
    sendSelectedToOrder: unsupported('sendSelectedToOrder'),
    tryRename: unsupported('tryRename'),
    updateNodeData: (nodeId, patch, options) => {
      assertCurrentCanvasApi(canvasId, api);
      if (typeof nodeId !== 'string' || !nodeId.trim()) throw new TypeError('updateNodeData needs a non-empty native NodeID.');
      const node = liveNode(api, nodeId);
      if (!node || node.id !== nodeId) {
        throw new NativeCanvasWriteUnsupportedError('updateNodeData for a missing native node');
      }
      if (typeof api.updateNodeData !== 'function') throw new NativeCanvasWriteUnsupportedError('updateNodeData');
      const safePatch = validateNodeDataPatch(patch);
      assertCurrentCanvasApi(canvasId, api);
      api.updateNodeData(nodeId, safePatch, options);
      syncNativeSubscription();
      refreshSnapshot(true);
    },
    setNodeGeometry: unsupported('setNodeGeometry'),
    beginNodeDataGesture: unsupported('beginNodeDataGesture'),
    endNodeDataGesture: unsupported('endNodeDataGesture'),
    requestInlineEdit: (nodeId) => {
      assertCurrentCanvasApi(canvasId, api);
      if (typeof nodeId !== 'string' || !nodeId.trim()) throw new TypeError('requestInlineEdit needs a non-empty native NodeID.');
      const node = liveNode(api, nodeId);
      if (!node || node.id !== nodeId || (node.type !== 'text' && node.type !== 'note')) {
        throw new NativeCanvasWriteUnsupportedError('inline edit request for a missing or non-text native node');
      }
      assertCurrentCanvasApi(canvasId, api);
      inlineEditRequest = { canvasId: canvasId!, api, nodeId };
      refreshSnapshot(true);
    },
    consumeInlineEditRequest: (nodeId) => {
      assertCurrentCanvasApi(canvasId, api);
      if (inlineEditRequest?.api !== api || inlineEditRequest.canvasId !== canvasId || inlineEditRequest.nodeId !== nodeId) return;
      inlineEditRequest = null;
      refreshSnapshot(true);
    },
    _setStateNoAutosave: unsupported('_setStateNoAutosave'),
    flushCanvasEvents: unsupported('flushCanvasEvents'),
    patchNodeSilent: unsupported('patchNodeSilent'),
    saveCanvas: unsupported('saveCanvas'),
    switchCanvas: unsupported('switchCanvas'),
    applyDeltasFromAgent: unsupported('applyDeltasFromAgent'),
    beginGesture: unsupported('beginGesture'),
    moveNodeOutOfFrame: unsupported('moveNodeOutOfFrame'),
    refreshWorldReferences: unsupported('refreshWorldReferences'),
    onEdgesChange: unsupported('onEdgesChange'),
    setState: unsupported('setState'),
  };

  if (notify && previous !== undefined) for (const listener of listeners) listener();
}

function getSnapshot(): NativeCanvasSnapshot {
  // React may call getSnapshot while rendering. It may refresh its memoized read,
  // but subscribers are only notified from the original-store/event callbacks.
  refreshSnapshot(false);
  return currentSnapshot ?? EMPTY_SNAPSHOT;
}

function getState(): NativeCanvasSnapshot {
  syncNativeSubscription();
  refreshSnapshot(false);
  return getSnapshot();
}

export interface NativeTextPresentationGeometry {
  readonly size: Readonly<{ width: number; height: number }>;
  readonly position: Readonly<{ x: number; y: number }>;
}

/** One original node update for text-face state and optional geometry. */
export function updateNativeTextPresentation(
  nodeId: string,
  patch: Readonly<Record<string, unknown>>,
  geometry?: NativeTextPresentationGeometry,
): void {
  const canvas = getState();
  const api = canvas.rfInstance;
  assertCurrentCanvasApi(canvas.canvasId, api);
  if (typeof nodeId !== 'string' || !nodeId.trim()) throw new TypeError('Text presentation updates need a non-empty native NodeID.');
  const node = liveNode(api, nodeId);
  if (!node || node.id !== nodeId || (node.type !== 'text' && node.type !== 'note')) {
    throw new NativeCanvasWriteUnsupportedError('text presentation update for a missing or non-text native node');
  }
  const safePatch = validateTextPresentationPatch(patch);
  if (!geometry) {
    if (typeof api.updateNodeData !== 'function') throw new NativeCanvasWriteUnsupportedError('updateNodeData');
    assertCurrentCanvasApi(canvas.canvasId, api);
    api.updateNodeData(nodeId, safePatch);
  } else {
    if (typeof api.updateNode !== 'function') throw new NativeCanvasWriteUnsupportedError('updateNode for text presentation geometry');
    const { position, size } = geometry;
    if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)
      || !size || !Number.isFinite(size.width) || !Number.isFinite(size.height)
      || size.width <= 0 || size.height <= 0) {
      throw new TypeError('Text presentation geometry needs a finite position and positive finite size.');
    }
    const style = isPlainRecord(node.style) ? node.style : {};
    assertCurrentCanvasApi(canvas.canvasId, api);
    api.updateNode(nodeId, {
      data: { ...(isPlainRecord(node.data) ? node.data : {}), ...safePatch },
      position: { x: position.x, y: position.y },
      width: size.width,
      height: size.height,
      measured: { ...(isPlainRecord(node.measured) ? node.measured : {}), width: size.width, height: size.height },
      style: { ...style, width: size.width, height: size.height },
    });
  }
  syncNativeSubscription();
  refreshSnapshot(true);
}

function syncNativeSubscription(): void {
  const api = nodeLab()?.api ?? null;
  if (api === subscribedApi) return;
  releaseNativeSubscription?.();
  releaseNativeSubscription = undefined;
  subscribedApi = api;
  if (api !== null && typeof api.subscribeNative === 'function') {
    releaseNativeSubscription = api.subscribeNative(() => {
      syncNativeSubscription();
      refreshSnapshot(true);
    });
  }
}

function onNativeBridgeChanged(): void {
  syncNativeSubscription();
  refreshSnapshot(true);
}

function subscribe(listener: () => void): () => void {
  const wasEmpty = listeners.size === 0;
  listeners.add(listener);
  if (wasEmpty && typeof window !== 'undefined') {
    window.addEventListener('lcos-native-bridge-changed', onNativeBridgeChanged);
  }
  syncNativeSubscription();
  refreshSnapshot(false);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      if (typeof window !== 'undefined') {
        window.removeEventListener('lcos-native-bridge-changed', onNativeBridgeChanged);
      }
      releaseNativeSubscription?.();
      releaseNativeSubscription = undefined;
      subscribedApi = null;
    }
  };
}

export interface NativeCanvasStoreHook {
  <T>(selector: (state: NativeCanvasSnapshot) => T): T;
  getState(): NativeCanvasSnapshot;
  subscribe(listener: () => void): () => void;
  setState: UnsupportedCanvasWrite;
}

const useCanvasStore = ((selector: (state: NativeCanvasSnapshot) => unknown) => {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return selector(state);
}) as NativeCanvasStoreHook;

useCanvasStore.getState = getState;
useCanvasStore.subscribe = subscribe;
useCanvasStore.setState = unsupported('setState');

/** The exact legacy NativeWorkspaceBody import override never mounts its Canvas. */
export function settleNodePreprocess(): never {
  throw new NativeCanvasWriteUnsupportedError('settleNodePreprocess');
}

export default useCanvasStore;
