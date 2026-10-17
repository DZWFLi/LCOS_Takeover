import { createContext, useContext, useEffect, useRef, type JSX, type ReactNode } from 'react';
import { useLcosDropStore, type LcosDropFeedback } from '../../lcos/huabu/apps/web/src/lcos/lcosDropState';
import type { DropCommitReceipt, DropIntent } from '../../lcos/huabu/apps/web/src/lcos/drop/dropTypes';
import type { SemanticDropState } from '../../lcos/apps/web-gen2/src/interaction/semanticDropMachine';
import useCanvasStore from '../../lcos/huabu/apps/web/src/store/canvasStore';
import { useLcosShellStore } from '../../lcos/huabu/apps/web/src/lcos/shell/lcosShellStore';
import { readNativeLibraryDropCapture, type NativeLibraryDropCapture } from './native-library-drop';
import { canCheckNativeLibraryDropReceipt, checkNativeLibraryDropReceipt } from './native-library-material-owner';

type ToastId = string | number;
interface ToastActionEvent { preventDefault(): void }
export interface NativeDropNoticeOptions {
  id?: ToastId; title: string; duration?: number; dismissible?: boolean;
  action?: { label: string; onClick(event?: ToastActionEvent): void };
}
/** Exact shipped Rt object signature, including its real dismiss alias. */
export interface NativeDropNotice {
  (options: NativeDropNoticeOptions): ToastId;
  dismiss(id: ToastId): unknown;
}
const NoticeContext = createContext<NativeDropNotice | null>(null);
export function NativeDropNoticeProvider({ notice, children }: { notice?: NativeDropNotice; children: ReactNode }): JSX.Element {
  return <NoticeContext.Provider value={notice ?? null}>{children}</NoticeContext.Provider>;
}

interface FeedbackSnapshot {
  state: SemanticDropState;
  feedback: LcosDropFeedback | null;
  confirmNativeLibraryPlacementReceipt(transactionId: string, receipt: DropCommitReceipt): boolean;
}
interface FeedbackPort {
  read(): FeedbackSnapshot;
  isCurrent(capture: NativeLibraryDropCapture): boolean;
  canCheck(feedback: LcosDropFeedback): boolean;
  check(feedback: LcosDropFeedback, signal: AbortSignal): Promise<DropCommitReceipt>;
}
interface Model {
  transactionId: string; payload: unknown; capture: NativeLibraryDropCapture;
  busy: boolean; feedback: LcosDropFeedback | null;
}
interface ActiveNotice { model: Model; id?: ToastId; checking?: AbortController; lastKey?: string; lastReceipt?: DropCommitReceipt; message?: string }
function readModel(port: FeedbackPort): Model | null {
  const { state, feedback } = port.read(), busy = state.status === 'committing';
  const attempt = busy ? state : feedback?.attempt;
  if (!attempt || !busy && feedback?.hidden) return null;
  const capture = readNativeLibraryDropCapture(attempt.payload);
  return capture && port.isCurrent(capture) ? { transactionId: attempt.transactionId, payload: attempt.payload,
    capture, busy, feedback: busy ? null : feedback } : null;
}
function successTitle(intent: DropIntent): string {
  if (intent.kind === 'composer-reference') return '已加入本次引用，尚未发送。';
  if (intent.kind === 'collection-membership') return '已加入集合。';
  if (intent.kind === 'assembly-apply') {
    if (intent.targetRef.kind === 'conversation') return '已加入会话上下文。';
    if (intent.targetRef.kind === 'context') return '已放到上下文。';
    if (intent.targetRef.kind === 'workflow') return '已放到工作流。';
  }
  return '已放到画布。';
}

/** Only a lifecycle adapter to the original toast and original store. There
 * is no rendering portal, receipt cache, retry queue or second Drop owner. */
export function createNativeLibraryDropFeedbackController(notice: NativeDropNotice, port: FeedbackPort) {
  let active: ActiveNotice | null = null, disposed = false;
  const remove = () => {
    if (!active) return;
    active.checking?.abort();
    if (active.id !== undefined) notice.dismiss(active.id);
    active = null;
  };
  const isCurrent = (held: ActiveNotice, feedback: LcosDropFeedback) => !disposed && active === held
    && port.read().feedback === feedback && readModel(port)?.payload === held.model.payload;
  const publish = (held: ActiveNotice) => {
    if (disposed || active !== held) return;
    const { model } = held, receipt = model.feedback?.receipt;
    const checkable = !!model.feedback && receipt?.status !== 'success' && port.canCheck(model.feedback);
    const title = model.busy ? '正在放置材料…' : held.checking ? '正在核对放置结果…'
      : held.message ?? (receipt?.status === 'success' ? successTitle(model.feedback!.originalIntent.intent)
        : checkable ? '放置结果尚未确认，原材料保留。' : '本次放置未完成，原材料保留。');
    const persistent = model.busy || checkable;
    const key = JSON.stringify([title, persistent, checkable]);
    if (key === held.lastKey && receipt === held.lastReceipt) return;
    held.lastKey = key; held.lastReceipt = receipt;
    held.id = notice({ id: held.id, title, duration: persistent ? 0 : undefined, dismissible: !persistent,
      action: checkable ? { label: '核对放置结果', onClick: event => {
        // The shipped action auto-dismisses unless its real event is prevented.
        event?.preventDefault(); void check(held);
      } } : undefined });
  };
  const sync = () => {
    if (disposed) return;
    const model = readModel(port);
    if (!model) { remove(); return; }
    if (!active || active.model.transactionId !== model.transactionId || active.model.payload !== model.payload) {
      remove(); active = { model };
    } else {
      if (active.model.feedback !== model.feedback) { active.checking?.abort(); active.checking = undefined; active.message = undefined; }
      active.model = model;
    }
    publish(active);
  };
  const check = async (held: ActiveNotice): Promise<void> => {
    const feedback = held.model.feedback;
    if (!feedback || held.checking || !isCurrent(held, feedback) || !port.canCheck(feedback)) return;
    const controller = new AbortController(); held.checking = controller; held.message = undefined; publish(held);
    try {
      const result = await port.check(feedback, controller.signal);
      if (controller.signal.aborted || !isCurrent(held, feedback)) return;
      if (port.read().confirmNativeLibraryPlacementReceipt(held.model.transactionId, result)) sync();
      else { held.message = '投放记录已变化，未改动当前显示。'; }
    } catch (error) {
      if (!controller.signal.aborted && isCurrent(held, feedback)) {
        console.error('[NativeLibraryDropFeedback] Read-only placement check failed.', error);
        held.message = '暂时无法核对，原材料和记录保留。';
      }
    } finally {
      if (active === held && held.checking === controller) {
        held.checking = undefined;
        if (!controller.signal.aborted) publish(held);
      }
    }
  };
  return { sync, dispose() { if (disposed) return; remove(); disposed = true; } };
}

export function NativeLibraryDropFeedback({ children }: { children: ReactNode }): JSX.Element | null {
  const notice = useContext(NoticeContext);
  const state = useLcosDropStore(value => value.state), feedback = useLcosDropStore(value => value.feedback);
  const projectId = useLcosShellStore(value => value.projectId);
  const canvasId = useCanvasStore(value => value.canvasId), api = useCanvasStore(value => value.rfInstance);
  const controller = useRef<ReturnType<typeof createNativeLibraryDropFeedbackController> | null>(null);
  useEffect(() => {
    if (!notice) return;
    const current = createNativeLibraryDropFeedbackController(notice, {
      read: () => useLcosDropStore.getState(), canCheck: canCheckNativeLibraryDropReceipt, check: checkNativeLibraryDropReceipt,
      isCurrent: capture => {
        const host = window.__LCOS_NODE_LAB__;
        return host?.projectId === capture.projectId && (host.currentCanvasId ?? host.canvasId) === capture.canvasId && host.api === capture.api;
      },
    });
    controller.current = current; current.sync();
    return () => { current.dispose(); if (controller.current === current) controller.current = null; };
  }, [notice]);
  useEffect(() => { controller.current?.sync(); }, [notice, state, feedback, projectId, canvasId, api]);
  const attempt = state.status === 'committing' ? state : feedback?.attempt;
  // Until the original notice is supplied, keep the existing receipt usable.
  return notice && readNativeLibraryDropCapture(attempt?.payload) ? null : <>{children}</>;
}
