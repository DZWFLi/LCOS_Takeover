import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { LcosWindow } from '../../lcos/huabu/apps/web/src/lcos/shell/lcosShellStore';
import type { WindowRegionInput } from '../../lcos/huabu/apps/web/src/lcos/shell/windowRegionTopology';
import { useLcosShellStore } from '../../lcos/huabu/apps/web/src/lcos/shell/lcosShellStore';
import { composerInputKey } from '../../lcos/huabu/apps/web/src/lcos/composer/composerInputJourney';
import useCanvasStore from './native-canvas-port';
import { hasNativeMindMapDraft } from './native-mindmap-editing';
import { requestNativeMaterialView, type NativeMaterialViewRequest } from './native-material-viewer-port';
import type { NativeMaterialViewerRuntime } from './native-material-viewer-types';
import { isNativeReaderRestoreCandidate, nativeReaderRecoveryLayout, nativeReaderRecoveryRequest,
  nativeReaderRecoveryIsOpen, type NativeReaderRecoveryLease, type RecoveryState } from './native-reader-recovery-state';

export interface NativeReaderRecoveryPorts {
  shell: typeof useLcosShellStore.getState;
  canvas: typeof useCanvasStore.getState;
  request(target: NativeMaterialViewRequest): void;
  hasLocalDraft(projectId: string, canvasId: string, nodeId: string, artifactId: string, viewId: string): boolean;
  hasPending(canvasId: string, nodeId: string): boolean;
}
const ports: NativeReaderRecoveryPorts = {
  shell: useLcosShellStore.getState, canvas: useCanvasStore.getState, request: requestNativeMaterialView,
  hasLocalDraft: hasNativeMindMapDraft,
  hasPending: (canvasId, nodeId) => {
    const port = window.__LCOS_NATIVE_TEXT_SAVE_PORT__, queued = port?.readQueuedAutosave(nodeId);
    return !!port?.getPending({ canvasId, nodeId }) || !!(queued && queued.canvasId === canvasId && queued.nodeId === nodeId && queued.count > 0);
  },
};
type Context = { runtime: NativeMaterialViewerRuntime; ports: NativeReaderRecoveryPorts };
const RecoveryContext = createContext<Context | null>(null);
const emptyState: RecoveryState = { phase: 'closed', session: null };
const emptySnapshot = () => emptyState, noSubscribe = () => () => {};

/** Pass the existing wa runtime through the existing React tree, no new store. */
export function NativeReaderRecoveryProvider({ runtime, children, adapter = ports }: {
  runtime: NativeMaterialViewerRuntime; children?: ReactNode; adapter?: NativeReaderRecoveryPorts;
}) {
  return <RecoveryContext.Provider value={{ runtime, ports: adapter }}>{children}</RecoveryContext.Provider>;
}
export function useNativeReaderRecoveryLayout(projectId: string, windows: readonly LcosWindow[], regions: readonly WindowRegionInput[]) {
  const context = useContext(RecoveryContext), runtime = context?.runtime;
  const state = useSyncExternalStore(runtime?.subscribe ?? noSubscribe, runtime?.getState ?? emptySnapshot, emptySnapshot);
  return nativeReaderRecoveryLayout(projectId, windows, regions, state);
}

type SourceEligibility = 'waiting' | 'eligible' | 'protected';
function sourceEligibility(projectId: string, source: LcosWindow, adapter: NativeReaderRecoveryPorts): SourceEligibility {
  const shell = adapter.shell(), canvas = adapter.canvas();
  if (!isNativeReaderRestoreCandidate(source) || !source.target || shell.projectId !== projectId
    || shell.windows.find((row: LcosWindow) => row.id === source.id) !== source
    || canvas.status !== 'ready' || !canvas.canvasId || !canvas.rfInstance) return 'waiting';
  if (source.composerOriginKey !== undefined && source.composerOriginKey !== composerInputKey(shell.composerTarget)) return 'protected';
  if (source.readerSource) {
    const sourceCanvas = shell.surfaceCanvasId[source.readerSource.surface];
    // The host establishes this map asynchronously after the native API becomes
    // ready. Missing mapping is not evidence of a foreign scene or local draft.
    if (!sourceCanvas) return 'waiting';
    // A cross-scene draft cannot be proved from a different current node API.
    if (sourceCanvas !== canvas.canvasId || adapter.hasPending(sourceCanvas, source.readerSource.nodeId)) return 'protected';
    const node = canvas.rfInstance.getNodes().find(row => row.id === source.readerSource!.nodeId);
    const ref = node?.data?.lcos_ref as Record<string, unknown> | undefined;
    if (ref && typeof ref.artifactViewId === 'string'
      && adapter.hasLocalDraft(projectId, sourceCanvas, source.readerSource.nodeId, source.target, ref.artifactViewId)) return 'protected';
  }
  return 'eligible';
}

/** Replaces only a restored Reader's body. Ordinary/new legacy Reader paths
 * and local pending/drafts retain their existing body until explicitly bridged. */
export function NativeRestoredReaderBody({ projectId, source, onClose, fallback }: {
  projectId: string; source?: LcosWindow; onClose(): void; fallback: ReactNode;
}) {
  const context = useContext(RecoveryContext), runtime = context?.runtime, adapter = context?.ports;
  const shellCanvas = useCanvasStore(state => state.canvasId), shellApi = useCanvasStore(state => state.rfInstance);
  const shellCanvasStatus = useCanvasStore(state => state.status);
  // This may arrive after the Canvas/API. Subscribe to that actual owner rather
  // than waiting for an unrelated window or text-port notification to rerender.
  useLcosShellStore((state: ReturnType<typeof useLcosShellStore.getState>) => state.surfaceCanvasId);
  const viewerState = useSyncExternalStore(runtime?.subscribe ?? noSubscribe, runtime?.getState ?? emptySnapshot, emptySnapshot);
  const textPort = typeof window === 'undefined' ? undefined : window.__LCOS_NATIVE_TEXT_SAVE_PORT__;
  const [, changed] = useState(0);
  useEffect(() => textPort?.subscribe(() => changed(value => value + 1)), [textPort]);
  const [retry, setRetry] = useState(0), [feedback, setFeedback] = useState({ error: false, message: '正在把所选版本交给阅读器…' });
  const closed = useRef(onClose); closed.current = onClose;
  const leaseRef = useRef<NativeReaderRecoveryLease | null>(null);
  const attempted = useRef<LcosWindow | null>(null);
  const retainedLegacy = useRef<LcosWindow | null>(null);
  const occupied = !!viewerState.session && (viewerState.session as any).lcosControlled?.readerRecovery?.source !== source;
  const eligibility = adapter && source ? sourceEligibility(projectId, source, adapter) : 'waiting';
  const sourceReady = eligibility === 'eligible';
  // Once a restored body had to retain local recovery, do not unmount it merely
  // because a later port notification cleared. A fresh explicit source wins.
  if (context && source && isNativeReaderRestoreCandidate(source) && eligibility === 'protected')
    retainedLegacy.current = source;
  const eligible = sourceReady && retainedLegacy.current !== source;
  useEffect(() => {
    if (!runtime || !adapter || !source || !source.active || !eligible) return;
    if (runtime.getState().session || attempted.current === source && retry === 0) return;
    attempted.current = source;
    const canvas = adapter.canvas();
    let live = true;
    const current = () => adapter.shell().projectId === projectId && adapter.shell().windows.find((row: LcosWindow) => row.id === source.id) === source
      && adapter.canvas().canvasId === canvas.canvasId && adapter.canvas().rfInstance === canvas.rfInstance
      && sourceEligibility(projectId, source, adapter) === 'eligible';
    const lease: NativeReaderRecoveryLease = { projectId, source, canvasId: canvas.canvasId!, api: canvas.rfInstance,
      cancelled: false, accepted: false, closed: false, isCurrent: current,
      onClosed: () => { if (current()) closed.current(); },
      onStatus: (status, message) => { if (live) setFeedback({ error: status === 'error', message: message ?? '正在把所选版本交给阅读器…' }); } };
    leaseRef.current = lease;
    setFeedback({ error: false, message: '正在把所选版本交给阅读器…' });
    const shell = adapter.shell();
    try { adapter.request(nativeReaderRecoveryRequest({ projectId, artifactId: source.target!, title: source.title,
      revisionId: source.readerRevisionId, sourceLocator: source.sourceLocator, composerOriginKey: source.composerOriginKey,
      nodeId: source.readerSource?.nodeId,
      sourceCanvasId: source.readerSource ? shell.surfaceCanvasId[source.readerSource.surface] : undefined,
      legacyReturnWindowId: source.returnToWindowId }, lease)); }
    catch { lease.onStatus('error', '这份材料暂未打开，原阅读地址仍保留。'); }
    return () => {
      live = false;
      if (nativeReaderRecoveryIsOpen(runtime.getState(), lease)) lease.accepted = true;
      if (!lease.accepted) {
        lease.cancelled = true;
        const state = runtime.getState();
        if ((state.session as any)?.lcosControlled?.readerRecovery === lease) runtime.close(state.session!.id);
      }
    };
  }, [runtime, adapter, source, projectId, eligible, shellCanvas, shellApi, shellCanvasStatus, retry]);
  if (!context || !source || !isNativeReaderRestoreCandidate(source) || retainedLegacy.current === source) return <>{fallback}</>;
  return <div role={feedback.error ? 'alert' : 'status'} data-native-reader-recovery={feedback.error ? 'error' : 'loading'}
    className="flex h-full min-h-0 items-center justify-center gap-2 p-4 text-sm text-muted-foreground">
    <span>{!eligible ? '正在等待原阅读现场…' : !source.active ? '选择这份材料后继续阅读。' : occupied ? '当前阅读仍保留；返回后可继续这份材料。' : feedback.message}</span>{feedback.error && eligible && !occupied && <button onClick={() => { attempted.current = null; setRetry(value => value + 1); }}>重读同一版本</button>}
  </div>;
}
