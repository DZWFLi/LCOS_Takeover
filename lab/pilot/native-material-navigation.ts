import useCanvasStore from './native-canvas-port';
import { useLcosShellStore } from '../../lcos/huabu/apps/web/src/lcos/shell/lcosShellStore';
import { requestNativeSurfaceSelection } from '../surface-dock-ui.js';
import { verifyNativeMaterialLocation, type NativeMaterialContext, type NativeMaterialLocationRow } from './native-material-context';

type Snapshot = ReturnType<typeof useCanvasStore.getState>;
export type NativeMaterialNavigationStatus = { serial: number; projectId: string; canvasId: string;
  state: 'pending' | 'located' | 'error'; message: string; nodeId: string; arrivalApiRenewed?: boolean } | null;
let serial = 0;
let status: NativeMaterialNavigationStatus = null;
let activeNavigation: { cancel: (reason: Error) => void } | null = null;
const listeners = new Set<() => void>();
export const materialNavigationSnapshot = () => status;
export const subscribeMaterialNavigation = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
function publish(value: NativeMaterialNavigationStatus) { status = value; listeners.forEach(listener => listener()); }

/** Invalidate pending navigation work and clear its transient status. */
export function cancelNativeMaterialNavigation(): void {
  serial += 1;
  activeNavigation?.cancel(new Error('定位已取消。'));
  activeNavigation = null;
  publish(null);
}

type Ports = { getState: () => Snapshot; subscribe: (callback: () => void) => () => void;
  projectId: () => string | null; select: typeof requestNativeSurfaceSelection };
const ports: Ports = { getState: useCanvasStore.getState, subscribe: useCanvasStore.subscribe,
  projectId: () => typeof window !== 'undefined' && window.__LCOS_NODE_LAB__?.projectId === useLcosShellStore.getState().projectId
    ? useLcosShellStore.getState().projectId : null, select: requestNativeSurfaceSelection };

const exactLiveNode = (canvas: Snapshot, location: NativeMaterialLocationRow) => {
  const node = canvas.rfInstance?.getNodes().find(row => row.id === location.nodeId);
  const ref = node?.data?.lcos_ref as Record<string, unknown> | undefined;
  return !!node && ref?.version === 1 && ref.artifactId === location.artifactId
    && ref.artifactViewId === location.artifactViewId && ref.revisionId === location.revisionId
    && ref.entityType === location.bindingEntityType
    && ref.entityId === (location.bindingEntityType === 'view' ? location.artifactViewId : location.artifactId);
};

/** No route, geometry write or fallback is owned here. Original Ke switches;
 * the one existing native API must then present the exact evidenced node. */
export async function navigateNativeMaterialLocation(input: {
  projectId: string; location: NativeMaterialLocationRow;
  read: (signal?: AbortSignal) => Promise<{ context: NativeMaterialContext }>;
  isSourceCurrent?: () => boolean;
}, adapter: Ports = ports): Promise<{ ok: boolean; reason?: string }> {
  const operation = ++serial;
  activeNavigation?.cancel(new Error('定位请求已被新的请求替代。'));
  const controller = new AbortController();
  let rejectInterrupted!: (reason: Error) => void;
  const interrupted = new Promise<never>((_, reject) => { rejectInterrupted = reject; });
  void interrupted.catch(() => {});
  let interruptedFlag = false;
  const interrupt = (reason: Error) => {
    if (interruptedFlag) return;
    interruptedFlag = true;
    controller.abort(reason);
    rejectInterrupted(reason);
  };
  const deadline = setTimeout(() => interrupt(new Error('定位流程超时（12 秒），未追加相机操作。')), 12000);
  activeNavigation = { cancel: interrupt };
  const race = <T>(promise: Promise<T>): Promise<T> => Promise.race([promise, interrupted]);
  const { projectId, location } = input;
  const active = () => operation === serial && adapter.projectId() === projectId;
  const canContinue = () => active() && !interruptedFlag;
  const requireActive = () => {
    if (!canContinue()) throw controller.signal.reason instanceof Error ? controller.signal.reason : new Error('定位请求已失效。');
  };
  const run = <T>(task: () => T | Promise<T>): Promise<T> => race(Promise.resolve().then(() => {
    requireActive();
    return task();
  }));
  const setStatus = (state: 'pending' | 'located' | 'error', message: string) => {
    if (active()) publish({ serial: operation, projectId, canvasId: location.canvasId, nodeId: location.nodeId, state, message });
  };
  let stopWaiting: (() => void) | undefined;
  try {
    const before = adapter.getState();
    if (!canContinue() || before.status !== 'ready' || !before.canvasId || !before.rfInstance) throw new Error('当前原画布尚未就绪。');
    setStatus('pending', '核对准确位置，沿原画布切换入口定位…');
    const first = await run(() => input.read(controller.signal));
    const source = adapter.getState();
    if (!canContinue() || input.isSourceCurrent?.() === false || source.canvasId !== before.canvasId || source.rfInstance !== before.rfInstance) throw new Error('核对期间原现场或材料选择已变化，未操作其他相机。');
    const sameIdentity = (row: NativeMaterialLocationRow) => ['projectId', 'workspaceId', 'scopeId', 'canvasId', 'nodeId', 'artifactId', 'artifactViewId', 'revisionId', 'fileRecordId', 'bindingEntityType']
      .every(key => row[key as keyof NativeMaterialLocationRow] === location[key as keyof NativeMaterialLocationRow]);
    const latestLocation = first.context.locations.find(sameIdentity);
    const checked = latestLocation ? verifyNativeMaterialLocation(first.context, latestLocation) : { canNavigate: false, reason: '准确位置已不可用。' };
    if (!checked.canNavigate) throw new Error(checked.reason);
    const arrival = new Promise<Snapshot>((resolve, reject) => {
      let release = () => {};
      let done = false;
      const finish = (error?: Error, canvas?: Snapshot) => {
        if (done) return; done = true; release(); controller.signal.removeEventListener('abort', onAbort);
        if (error) reject(error); else resolve(canvas!);
      };
      const onAbort = () => finish(controller.signal.reason instanceof Error ? controller.signal.reason : new Error('定位已取消。'));
      const check = () => {
        const canvas = adapter.getState();
        if (!canContinue()) return finish(controller.signal.reason instanceof Error ? controller.signal.reason : new Error('定位请求已被新的项目或定位替代。'));
        if (canvas.status === 'ready' && canvas.canvasId !== before.canvasId && canvas.canvasId !== location.canvasId) {
          return finish(new Error('用户已切往其他现场，未拉回旧目标。'));
        }
        if (canvas.status === 'ready' && canvas.canvasId === location.canvasId && exactLiveNode(canvas, location)) finish(undefined, canvas);
      };
      release = adapter.subscribe(check);
      controller.signal.addEventListener('abort', onAbort, { once: true });
      stopWaiting = () => finish(new Error('原切换未完成，未重放定位。'));
      check();
      if (done) release();
    });
    // Attach a rejection handler before awaiting the original preflight.
    void arrival.catch(() => {});
    if (location.canvasId !== before.canvasId) {
      await run(() => adapter.select({ projectId, sourceCanvasId: before.canvasId, targetCanvasId: location.canvasId }));
    }
    const arrived = await race(arrival);
    const fresh = await run(() => input.read(controller.signal));
    const current = adapter.getState();
    const freshLocation = fresh.context.locations.find(sameIdentity);
    const finalCheck = freshLocation ? verifyNativeMaterialLocation(fresh.context, freshLocation) : { canNavigate: false, reason: '目标位置已变化。' };
    if (!canContinue()) throw new Error('定位请求已被新项目或请求替代。');
    if (current.canvasId !== location.canvasId) throw new Error('当前现场不再是明确选择的目标。');
    if (location.canvasId === before.canvasId && input.isSourceCurrent?.() === false) throw new Error('核对期间原材料选择已变化。');
    if (!exactLiveNode(current, location)) throw new Error('当前原 API 没有呈现目标的准确节点引用。');
    if (!finalCheck.canNavigate) throw new Error(finalCheck.reason);
    if (!current.rfInstance?.fitView) throw new Error('原画布没有可用定位接口。');
    // The native page may renew its API while the target mounts. Use only its
    // current exact node/API after the second read, never the arrival handle.
    let fitApi: NonNullable<typeof current.rfInstance>;
    const fitResult = await run(() => {
      const atCall = adapter.getState();
      const atCallLocation = fresh.context.locations.find(sameIdentity);
      const atCallCheck = atCallLocation
        ? verifyNativeMaterialLocation(fresh.context, atCallLocation)
        : { canNavigate: false, reason: '目标位置已变化。' };
      if (!canContinue() || atCall.canvasId !== location.canvasId || !exactLiveNode(atCall, location)
        || !atCallCheck.canNavigate || (location.canvasId === before.canvasId && input.isSourceCurrent?.() === false)) {
        throw new Error(atCallCheck.reason ?? '定位现场或准确节点已变化。');
      }
      if (!atCall.rfInstance?.fitView) throw new Error('原画布没有可用定位接口。');
      fitApi = atCall.rfInstance;
      return atCall.rfInstance.fitView({ nodes: [{ id: location.nodeId }], padding: .3, maxZoom: 1.3, duration: 180 });
    });
    if (fitResult === false) throw new Error('原画布没有确认相机定位完成。');
    if (canContinue()) publish({ serial: operation, projectId, canvasId: location.canvasId, nodeId: location.nodeId,
      state: 'located', message: '已到达准确版本；原材料、节点和布局未改写。', arrivalApiRenewed: fitApi! !== arrived.rfInstance });
    return { ok: canContinue() };
  } catch (error) {
    stopWaiting?.();
    const reason = error instanceof Error ? error.message : '原位置尚未确认。';
    setStatus('error', reason);
    return { ok: false, reason };
  } finally {
    clearTimeout(deadline);
    if (activeNavigation?.cancel === interrupt) activeNavigation = null;
  }
}
