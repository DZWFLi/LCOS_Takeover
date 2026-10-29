import { useEffect, useLayoutEffect, useRef, useState, type ComponentType, type JSX, type ReactNode } from 'react';
import type { NativeTextSavePending, NativeTextSavePort } from './native-text-save';
import './native-tiptap-autosave-status.css';

interface OriginalActionButtonProps {
  readonly label: string;
  readonly busy?: boolean;
  readonly disabled?: boolean;
  readonly onClick: () => void;
  readonly children?: ReactNode;
}

const recoveryStates = new Set([
  'response-lost', 'no-receipt-yet', 'response-processing-late', 'partial-commit',
  'incomplete-receipt', 'readback-failed', 'readback-matched-unconfirmed',
  'readback-not-matched', 'partial-commit-readback-matched', 'history-receipt-rejected',
]);

function savingLabel(status: string, historyPhase?: 'undo' | 'redo'): string {
  if (historyPhase) {
    const action = historyPhase === 'undo' ? '撤销' : '重做';
    if (['core-preflight', 'waiting-batch', 'waiting-response', 'sending'].includes(status)) return '正在' + action;
    if (status === 'context-changed') return '原页面的' + action + '尚待核对';
    if (status === 'conflict') return '原文已有新版本，' + action + '尚未完成';
    return action + '结果待确认';
  }
  if (['core-preflight', 'waiting-batch', 'waiting-response', 'sending'].includes(status)) return '正在保存';
  if (status === 'response-processing-late') return '正在确认保存';
  if (status === 'conflict') return '已有新版本，草稿已保留';
  if (status === 'context-changed') return '原页面草稿已保留';
  // A terminal receipt can briefly remain while the original queue is busy.
  // It does not mean a later draft in that queue has also been saved.
  if (status === 'confirmed' || status === 'unchanged') return '正在确认保存';
  return '草稿已保留，保存待确认';
}

function autosavePending(port: NativeTextSavePort | undefined, nodeId: string): NativeTextSavePending | null {
  const context = port?.getAutosaveContext(nodeId);
  if (!context) return null;
  const pending = port?.getPending({ canvasId: context.canvasId, nodeId });
  return pending?.source === 'native-autosave' || pending?.source === 'native-history' ? pending : null;
}

/** Feedback belongs to the original vZ/UX action bar, never a second viewer. */
export function NativeTiptapAutosaveStatus({ nodeId, parts }: {
  readonly nodeId: string;
  readonly editable?: boolean;
  readonly parts: { readonly Button: ComponentType<OriginalActionButtonProps> };
}): JSX.Element | null {
  const port = typeof window === 'undefined' ? undefined : window.__LCOS_NATIVE_TEXT_SAVE_PORT__;
  const [, changed] = useState(0);
  const [checking, setChecking] = useState(false);
  const [resuming, setResuming] = useState(false);
  const instance = useRef(0);
  const statusElement = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const generation = ++instance.current;
    setChecking(false);
    setResuming(false);
    const unsubscribe = port?.subscribe(() => changed(value => value + 1));
    // The callback may have registered before this viewer's effects mounted.
    changed(value => value + 1);
    return () => { if (instance.current === generation) instance.current++; unsubscribe?.(); };
  }, [nodeId, port]);

  const pending = autosavePending(port, nodeId);
  const context = port?.getAutosaveContext(nodeId);
  const queued = port?.readQueuedAutosave(nodeId);
  const queuedHere = !!context && queued?.projectId === context.projectId
    && queued.canvasId === context.canvasId && queued.nodeId === nodeId && queued.count > 0;
  useEffect(() => {
    if (pending || !queuedHere || queued?.canResume) setResuming(false);
  }, [pending?.operationId, queuedHere, queued?.canResume]);
  const visible = !!pending || (queuedHere && (queued?.canResume || resuming));
  useLayoutEffect(() => {
    const bar = statusElement.current?.closest<HTMLElement>('.media-viewer__text-actions');
    const viewer = bar?.closest<HTMLElement>('[data-media-viewer]');
    if (!bar || !viewer) return;
    // Measure the existing toolbar, including native formatting groups when
    // they wrap. The original editor keeps enough scroll space below its end.
    const variable = '--native-tiptap-action-height';
    const previous = viewer.style.getPropertyValue(variable);
    let assigned = '';
    const measure = () => {
      assigned = bar.offsetHeight + 'px';
      viewer.style.setProperty(variable, assigned);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    return () => {
      observer.disconnect();
      if (viewer.style.getPropertyValue(variable) === assigned) {
        if (previous) viewer.style.setProperty(variable, previous);
        else viewer.style.removeProperty(variable);
      }
    };
  }, [visible, nodeId, port]);
  if (!visible) return <span ref={statusElement} hidden data-native-tiptap-save-anchor />;
  const Button = parts.Button;
  const verify = async () => {
    if (!port || !pending || checking || !recoveryStates.has(pending.status)) return;
    const generation = instance.current;
    const operationId = pending.operationId;
    const context = port.getAutosaveContext(nodeId);
    setChecking(true);
    try {
      const result = await port.verify(operationId);
      // No state is applied to a different original scene or replacement viewer.
      const current = port.getAutosaveContext(nodeId);
      if (generation !== instance.current || !context || !current
        || current.canvasId !== context.canvasId || current.projectId !== context.projectId) return;
      if (result.status === 'confirmed' || result.status === 'unchanged') port.acknowledge(operationId);
    } catch {
      // The draft/operation stays with its existing owner. A failed read can
      // be checked again here; this UI never clears or retries the write.
    } finally {
      if (generation === instance.current) setChecking(false);
    }
  };
  const resume = () => {
    if (!port || resuming || pending) return;
    const latest = port.readQueuedAutosave(nodeId);
    const current = port.getAutosaveContext(nodeId);
    if (!latest?.canResume || !current || latest.projectId !== current.projectId
      || latest.canvasId !== current.canvasId || latest.nodeId !== nodeId) return;
    // A separate user action schedules the later draft in the original r6/g.
    // Verifying an older result above never submits that later text implicitly.
    if (port.resumeAutosave(nodeId)) setResuming(true);
  };

  return <span ref={statusElement} className="native-tiptap-autosave-status" data-native-tiptap-save-anchor
    data-native-tiptap-save-status={pending?.status ?? 'queued-draft'}>
    <span role="status" aria-live="polite">{checking ? '正在核对保存' : resuming ? '正在保存'
      : pending ? savingLabel(pending.status, pending.source === 'native-history' ? pending.historyPhase : undefined) : '有待保存的修改'}</span>
    {pending && recoveryStates.has(pending.status) && <Button label={pending.historyPhase === 'undo' ? '核对撤销'
      : pending.historyPhase === 'redo' ? '核对重做' : '核对保存'} busy={checking} disabled={checking}
      onClick={() => { void verify(); }}>
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 7v5h-5M4 17v-5h5" />
        <path d="M6.1 7a7 7 0 0 1 11.6-1.1L20 9M4 15l2.3 3.1A7 7 0 0 0 17.9 17" />
      </svg>
    </Button>}
    {!pending && queuedHere && queued?.canResume && <Button label="继续保存" busy={resuming} disabled={resuming} onClick={resume}>
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 4v12m-5-5 5 5 5-5M5 20h14" />
      </svg>
    </Button>}
  </span>;
}
