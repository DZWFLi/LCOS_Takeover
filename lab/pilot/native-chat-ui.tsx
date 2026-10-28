import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { ArrowLeft, MapPin, RefreshCw, Square } from 'lucide-react';
import { CoreCollaborationClient } from '../../lcos/apps/web-gen2/src/backend/collaboration';
import { CoreContinuationClient } from '../../lcos/apps/web-gen2/src/backend/continuation';
import { nativeConversationRecoveryOperations, nativeConversationRecoveryExecutionTarget } from './native-conversation-recovery-visibility';
import { connectNativeLiveContinuation, nativeLiveContinuationEvent, type NativeLiveContinuationRequest, type NativeLiveContinuationResult } from './native-live-continuation';
import { createLcosCoreSession } from '../../lcos/huabu/apps/web/src/lcos/app/lcosCoreClient';
import { useCollaborationSession } from '../../lcos/huabu/apps/web/src/lcos/collaboration/useCollaborationSession';
import { useCollaborationSessionStore } from '../../lcos/huabu/apps/web/src/lcos/collaboration/collaborationSessionStore';
import { cancelConversationRun } from '../../lcos/huabu/apps/web/src/lcos/collaboration/conversationCommands';
import { useLcosShellStore } from '../../lcos/huabu/apps/web/src/lcos/shell/lcosShellStore';
import { composerInputKey } from '../../lcos/huabu/apps/web/src/lcos/composer/composerInputJourney';
import { LcosComposerHost } from '../../lcos/huabu/apps/web/src/lcos/composer/LcosComposerHost';
import { useComposerContinuation } from '../../lcos/huabu/apps/web/src/lcos/composer/useComposerContinuation';
import { WaitingInputSection } from '../../lcos/huabu/apps/web/src/lcos/professional/WaitingInputSection';
import { NativeSessionCanvasPermissions } from './native-session-canvas-ui';
import { refreshNativeRecoveredComposer } from './native-recovered-composer';
import { ArtifactReturnSection } from '../../lcos/huabu/apps/web/src/lcos/professional/ArtifactReturnSection';
import { RecoverySection } from '../../lcos/huabu/apps/web/src/lcos/professional/RecoverySection';
import { NativeComposerProvider, useNativeComposerParts, type NativeComposerParts } from './native-composer-view';
import { projectNativeChatMessages } from './native-chat-messages';
import { resolveNativeGlythProgressItemId } from './native-glyth-actions';
import { NativeRunList } from './native-run-list';
import type { NativeChatFrameView } from './native-chat-view';
import { NativeTaskDetail } from './native-task-detail';
import { isNativeChatConversationSection, nativeChatBackRoute, nativeChatConversationRoute, nativeChatTaskRoute,
  requestNativeConversationView, type NativeChatRoute, type NativeChatConversationSection, type NativeConversationViewRequest, type NativeTaskViewRequest } from './native-task-route';
import { requestNativeMaterialView } from './native-material-viewer-port';
import useCanvasStore from './native-canvas-port';
import { loadConnectedPanel, placeConnectedConversation, type ConnectedPanelState, type LcosConversationReference } from './native-agent-ui';
import './native-chat-ui.css';
import { useNativeChatNoticeAvoidance } from './native-chat-notice-avoidance';
import { hasNativeLibraryReadingReturn, nativeLibraryReadingReturnCurrent, releaseNativeLibraryReadingReturn, sameNativeLibraryReadingReturn } from './native-library-reading-return';

import { selectNativeConversation as select, readNativeConversationSelection, useNativeConversationSelection } from './native-conversation-selection';
export { useNativeConversationSelection, readNativeConversationSelection, restoreNativeConversationSelection } from './native-conversation-selection';
export function requestNativeConversation(reference: LcosConversationReference): void {
  select(reference);
  window.dispatchEvent(new CustomEvent('lcos-native-open-conversation'));
}
export interface NativeCoreChatPanelProps {
  isOpen: boolean;
  onClose(): void;
  NativeFrame: NativeChatFrameView;
  NativeMessages: ComponentType<any>;
  NativeComposerParts: NativeComposerParts;
}

// native-chat-owner-transform bridges the same original hook at build time.
// This typed alias adds no reader/store; the optional owner is diagnostic-only.
type NativeConversationDiagnosticsHook = (projectId: string, target: Parameters<typeof useComposerContinuation>[1],
  open: boolean, diagnosticsConversationId: string) => ReturnType<typeof useComposerContinuation> & {
    readonly diagnosticsStatus: 'loading' | 'ready' | 'error';
  };
const useNativeConversationDiagnostics = useComposerContinuation as NativeConversationDiagnosticsHook;
type ConversationSectionRequest = Pick<NativeConversationViewRequest, 'continuationOperationId' | 'messageId' | 'progressItemId' | 'progressRunId'>
  & { section: NativeChatConversationSection; sequence: number };
function ConversationContent({ projectId, conversationId, NativeMessages, onRefresh, requestedSection, onDismissRequest, onRecoveryConfirmed }: {
  projectId: string; conversationId: string; NativeMessages: ComponentType<any>; onRefresh(): void;
  requestedSection?: ConversationSectionRequest; onDismissRequest?(): void;
  onRecoveryConfirmed?(operation: any, prepared: boolean): void;
}) {
  const entry = useCollaborationSession(projectId, conversationId);
  const target = useLcosShellStore(state => state.composerTarget);
  const continuation = useNativeConversationDiagnostics(projectId, target, true, conversationId);
  const session = useMemo(() => createLcosCoreSession(), []);
  const client = useMemo(() => new CoreCollaborationClient(session.http), [session]);
  const [notice, setNotice] = useState('');
  const [stopping, setStopping] = useState(false);
  const [stopTarget, setStopTarget] = useState<string>();
  const [stopUnconfirmed, setStopUnconfirmed] = useState<string>();
  const stopBusy = useRef(false), confirmation = useRef<HTMLElement>(null);
  const Button = useNativeComposerParts()?.Button ?? 'button';
  const scope = useRef(''); scope.current = `${projectId}:${conversationId}`;
  const focusedRequest = useRef('');
  useEffect(() => {
    const owner = `${projectId}:${conversationId}`; scope.current = owner;
    return () => { if (scope.current === owner) scope.current = ''; };
  }, [projectId, conversationId]);
  const recoveryFinished = (operation: any) => {
    const owner = scope.current; if (!owner) return;
    void refreshNativeRecoveredComposer({ projectId, conversationId, receiptOperation: operation, client,
      readShell: () => useLcosShellStore.getState(), isCurrent: () => scope.current === owner,
    }).then(result => {
      if (scope.current === owner && result) onRecoveryConfirmed?.(result.operation, result.prepared);
    }).catch(() => { /* Original refresh retains the unavailable/unknown state. */ }).finally(() => { if (scope.current === owner) onRefresh(); });
  };
  const projection = entry?.status === 'ready' ? entry.projection : undefined;
  const timeline = useMemo(() => projectNativeChatMessages(entry?.timeline ?? []), [entry?.timeline]);
  const requestedOperation = requestedSection?.continuationOperationId;
  const exactProgress = requestedSection?.section === 'view-progress' && requestedSection.progressItemId && requestedSection.progressRunId
    ? { itemId: requestedSection.progressItemId, runId: requestedSection.progressRunId } : undefined;
  const progressItemId=resolveNativeGlythProgressItemId({projectId,conversationId,entry},exactProgress);
  const diagnosticsReady = continuation.diagnosticsStatus === 'ready' && continuation.diagnostics?.conversationId === conversationId;
  const recovery = nativeConversationRecoveryOperations(diagnosticsReady ? continuation.diagnostics?.operations : undefined, { projectId, conversationId,
    requestedOperationId: requestedOperation, showAllRequests: requestedSection?.section === 'session-diagnostics' });
  useEffect(() => { setStopTarget(undefined); setStopUnconfirmed(value => value === projection?.activity.activeRunId ? value : undefined); }, [projection?.activity.activeRunId]);
  useEffect(() => { if (stopTarget) confirmation.current?.querySelector<HTMLButtonElement>('button')?.focus(); }, [stopTarget]);
  useEffect(() => {
    if (!requestedSection || !entry || entry.status === 'loading') return;
    const requestKey = JSON.stringify([projectId, conversationId, requestedSection.sequence, requestedSection.section,
      requestedOperation, requestedSection.messageId, requestedSection.progressItemId, requestedSection.progressRunId]);
    if (focusedRequest.current === requestKey) return;
    const selectors: Record<NativeChatConversationSection, string> = {
      'answer-input': '[data-lcos-waiting-input]', 'review-result': '[data-lcos-artifact-return]',
      'view-progress': '[data-native-chat-activity]', 'recover-session': '[data-lcos-recovery-section]',
      'session-diagnostics': '[data-native-chat-requests]', 'session-options': '[data-lcos-conversation-continuation]',
      'cancel-work': '.native-chat-stop',
    };
    const frame = requestAnimationFrame(() => {
      if (scope.current !== `${projectId}:${conversationId}`) return;
      const requested = requestedOperation ? [...document.querySelectorAll<HTMLElement>('[data-native-chat-operation]')]
        .find(element => element.dataset.nativeChatOperation === requestedOperation) : undefined;
      const frameRoot=document.querySelector<HTMLElement>('[data-lcos-native-chat-frame]');
      const progress=requestedSection.section==='view-progress'&&progressItemId
        ?[...(frameRoot?.querySelectorAll<HTMLElement>('[data-native-chat-activity-item]')??[])].find(element=>element.dataset.nativeChatActivityItem===progressItemId):undefined;
      const element = requested ?? (requestedSection.section==='view-progress'
        ?progress??frameRoot?.querySelector<HTMLElement>('[data-native-chat-progress-state]')
        :frameRoot?.querySelector<HTMLElement>(selectors[requestedSection.section]));
      if (!element?.isConnected) return;
      focusedRequest.current = requestKey;
      if (requestedSection.section === 'session-options') {
        const toggle = element.querySelector<HTMLElement>('[aria-expanded="false"]'); toggle?.click();
      }
      element.scrollIntoView({ block: 'nearest' });
      (element.matches('button,input,textarea') ? element : element.querySelector<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),summary') ?? element)?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [projectId, conversationId, requestedSection, entry, progressItemId, continuation.diagnosticsStatus, continuation.diagnostics]);
  const activity = (item: any) => <div key={item.itemId} className="native-chat-activity" data-native-chat-activity={item.kind}
    data-native-chat-activity-item={item.itemId} data-native-chat-activity-run={item.refs?.runId} tabIndex={-1}
    role={item.kind === 'error' ? 'alert' : 'status'}>
    <span>{item.title}</span>{item.body && item.body !== item.title && <details><summary>详情</summary><p>{item.body}</p></details>}
  </div>;
  const before = new Map<string, ReactNode[]>();
  let pending: ReactNode[] = [];
  if (timeline.ok) for (const row of timeline.order) {
    if (row.kind === 'activity') pending.push(activity(timeline.activities[row.activityIndex]));
    else { before.set(row.messageId, pending); pending = []; }
  }
  const stop = async () => {
    if (!stopTarget || stopTarget !== projection?.activity.activeRunId || projection.capabilities.canCancel !== true
      || stopBusy.current || stopUnconfirmed) return;
    const runId = stopTarget, owner = scope.current;
    stopBusy.current = true; setStopping(true); setStopTarget(undefined); setNotice('');
    try {
      await cancelConversationRun(client, projectId, conversationId, runId);
      if (scope.current === owner) { setNotice('已请求停止，已有内容保留。'); onRefresh(); }
    } catch { if (scope.current === owner) { setStopUnconfirmed(runId); setNotice('停止结果暂未确认，请先核对；不会重复停止。'); } }
    finally { stopBusy.current = false; if (scope.current === owner) setStopping(false); }
  };
  const verifyStop = async () => {
    if (!stopUnconfirmed || stopBusy.current) return;
    const runId = stopUnconfirmed, owner = scope.current;
    stopBusy.current = true; setStopping(true);
    try {
      const fresh = await client.readSession(projectId, conversationId);
      if (scope.current !== owner) return;
      if (fresh.projectId !== projectId || fresh.conversationId !== conversationId) throw new Error('Stop owner changed.');
      if (fresh.activity.activeRunId !== runId || fresh.capabilities.canCancel !== true) {
        setStopUnconfirmed(undefined); setNotice('已更新，原任务已不在执行中。');
      } else setNotice('任务仍在进行中，停止结果尚未确认；可以稍后再核对。');
      onRefresh();
    } catch { if (scope.current === owner) setNotice('暂时无法核对停止结果，已有内容保留。'); }
    finally { stopBusy.current = false; if (scope.current === owner) setStopping(false); }
  };
  if (entry?.status === 'error' || entry?.timelineStatus === 'error' || !timeline.ok) return <div className="native-chat-empty" role="alert"
    data-native-chat-progress-state={requestedSection?.section==='view-progress'?'error':undefined} tabIndex={-1}>
    <p>{requestedSection?.section==='view-progress'?'暂时无法读取当前进展，已有对话保留。':'暂时无法读取对话，已有记录保留。'}</p>
    <button onClick={onRefresh}>{requestedSection?.section==='view-progress'?'重新读取进展':'重试'}</button>
  </div>;
  if (!entry || entry.status === 'loading') return <div className="native-chat-empty" role="status">正在打开…</div>;
  return <>
    <NativeMessages canvasId={useCanvasStore.getState().canvasId} messages={timeline.messages} streamState="idle"
      scrollToMessageId={requestedSection?.messageId}
      hasMoreOlder={false} isLoadingOlder={false} renderBeforeMessage={(id: string) => before.get(id)}
      renderAfterMessages={() => <>{pending}
        {requestedSection?.section==='view-progress'&&!progressItemId&&<section className="native-chat-notice" data-native-chat-progress-state role="status" tabIndex={-1}>
          {exactProgress ? '暂时没有找到这条进展，原对话和记录保留。'
            : projection?.activity.activeRunId?'当前任务还没有可显示的进展。':'当前没有正在执行的任务。'}
          {onDismissRequest&&<Button onClick={onDismissRequest}>返回对话</Button>}
        </section>}
        {(import.meta.env as Record<string, unknown>).LCOS_NATIVE_CANVAS_TOOLS === true && <NativeSessionCanvasPermissions
          projectId={projectId} conversationId={conversationId} onRefresh={onRefresh} />}
        {projection?.activity.pendingInputId && <WaitingInputSection collaboration={client} projectId={projectId}
          conversationId={conversationId} enabled={projection.capabilities.canAnswerInput} />}
        {projection?.recentReturns.some(row => row.status === 'pending_review') && <ArtifactReturnSection
          collaboration={client} projectId={projectId} conversationId={conversationId}
          refreshKey={projection.recentReturns.map(row => `${row.returnId}:${row.status}`).join('|')} />}
        {recovery.map(operation => <section key={operation.operationId} data-native-chat-operation={operation.operationId}>
          {operation.operationId === requestedOperation && <p className="native-chat-notice" role="status">
            {operation.status === 'outcome_unknown' ? '这次请求的结果尚未确认，请核对原操作。'
              : ['projected', 'resolved', 'established'].includes(operation.status) ? '已找到原请求，记录已保留。'
                : operation.status === 'cancelled' ? '这次请求已取消，已有内容保留。' : '原请求仍在处理中。'}</p>}
          <RecoverySection collaboration={client} projectId={projectId}
            conversationId={nativeConversationRecoveryExecutionTarget(operation, projectId, conversationId)}
            title={requestedSection?.section === 'session-diagnostics' ? '会话请求' : undefined}
            operations={[operation]} onRefreshed={recoveryFinished} />
        </section>)}
        {(requestedOperation || requestedSection?.section === 'session-diagnostics') && <section data-native-chat-requests
          data-native-chat-requests-state={continuation.diagnosticsStatus} data-native-chat-requests-conversation={conversationId}
          className="native-chat-notice" aria-label="会话请求" aria-busy={continuation.diagnosticsStatus === 'loading'} tabIndex={-1}>
          {continuation.diagnosticsStatus === 'loading' ? <p role="status">正在读取会话请求…</p>
            : continuation.diagnosticsStatus === 'error' ? <p role="alert">暂时无法读取会话请求，原记录和输入保留。</p>
              : requestedOperation && !recovery.some(operation => operation.operationId === requestedOperation)
                ? <p role="status">暂时没有读到这次请求，请重新读取；原输入和请求保留。</p>
                : !recovery.length && <p role="status">{requestedSection?.section === 'session-diagnostics' ? '这段会话还没有请求记录。' : '当前没有需要处理的会话恢复操作。'}</p>}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            <Button disabled={continuation.diagnosticsStatus === 'loading'} onClick={continuation.retry}
              style={{ width: 'auto', height: 'auto', padding: '6px 8px', whiteSpace: 'nowrap' }}>
              {continuation.diagnosticsStatus === 'loading' ? '正在读取…' : continuation.diagnosticsStatus === 'error' ? '重新读取请求' : '更新会话状态'}</Button>
            {onDismissRequest && <Button onClick={onDismissRequest} style={{ width: 'auto', height: 'auto', padding: '6px 8px', whiteSpace: 'nowrap' }}>返回对话</Button>}
          </div>
        </section>}
        {projection?.capabilities.canCancel && projection.activity.activeRunId && <button className="native-chat-stop"
          disabled={stopping || !!stopUnconfirmed} onClick={() => setStopTarget(projection.activity.activeRunId)}><Square size={12} />停止当前任务</button>}
        {stopTarget && <section ref={confirmation} className="native-chat-stop-confirm" role="group" aria-label="确认停止当前任务"
          onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setStopTarget(undefined); } }}>
          <p>停止当前任务？会话和已有内容保留。</p>
          <div><Button disabled={stopping} onClick={() => void stop()}>确认停止</Button>
            <Button disabled={stopping} onClick={() => setStopTarget(undefined)}>继续任务</Button></div>
        </section>}
        {stopUnconfirmed && <Button disabled={stopping} onClick={() => void verifyStop()}>核对停止状态</Button>}
        {notice && <p role="status">{notice}</p>}
      </>} />
  </>;
}

export function NativeCoreChatPanel({ isOpen, onClose, NativeFrame, NativeMessages, NativeComposerParts }: NativeCoreChatPanelProps) {
  const [snapshot, setSnapshot] = useState<ConnectedPanelState>({ status: 'pending' });
  const [attempt, setAttempt] = useState(0);
  const [route, setRoute] = useState<NativeChatRoute>(nativeChatConversationRoute);
  const [conversationRequest, setConversationRequest] = useState<{ projectId: string; conversationId: string; status: 'pending' | 'unavailable' }>();
  const [libraryOrigin, setLibraryOrigin] = useState<NativeConversationViewRequest | NativeTaskViewRequest>();
  const libraryOriginRef = useRef<NativeConversationViewRequest | NativeTaskViewRequest>();
  // Native event listeners keep one current address. Release outside React's
  // state updater: cleanup can resume the original Library component.
  const replaceLibraryOrigin = (next?: NativeConversationViewRequest | NativeTaskViewRequest, returning = false) => {
    const previous = libraryOriginRef.current;
    if (previous && (!next || !sameNativeLibraryReadingReturn(previous, next))) releaseNativeLibraryReadingReturn(previous, returning);
    libraryOriginRef.current = next; setLibraryOrigin(next);
  };
  const libraryTaskRoute = useRef<NativeChatRoute>();
  const [sectionRequest, setSectionRequest] = useState<ConversationSectionRequest & { projectId: string; conversationId: string }>();
  const sectionSequence = useRef(0);
  const [notice, setNotice] = useState('');
  const [placing, setPlacing] = useState(false);
  const [connection, setConnection] = useState<{ request: NativeLiveContinuationRequest; busy: boolean;
    status: NativeLiveContinuationResult['status']; message: string }>();
  const connectionSession = useMemo(() => createLcosCoreSession(), []);
  const connectionClient = useMemo(() => new CoreContinuationClient(connectionSession.http), [connectionSession]);
  const connectionCollaboration = useMemo(() => new CoreCollaborationClient(connectionSession.http), [connectionSession]);
  const connectionOwner = useRef<{ request: NativeLiveContinuationRequest; canvasId: string; workspaceId: string; controller: AbortController }>();
  const openOwner = useRef(isOpen); openOwner.current = isOpen;
  const connectAccepted = (request: NativeLiveContinuationRequest, verifyOnly = false) => {
    const shell = useLcosShellStore.getState(), selected = readNativeConversationSelection(), live = useCanvasStore.getState();
    if (!openOwner.current || shell.projectId !== request.projectId || selected?.projectId !== request.projectId
      || selected.connectedConversationId !== request.sourceConversationId || !live.canvasId || !shell.activeWorkspaceId
      || !['blank_new', 'selected_context', 'continue_existing'].includes(request.action)) return;
    const previous = connectionOwner.current;
    if (previous?.request.operationId === request.operationId && !previous.controller.signal.aborted) return;
    previous?.controller.abort();
    const owner = { request, canvasId: live.canvasId, workspaceId: shell.activeWorkspaceId, controller: new AbortController() };
    connectionOwner.current = owner;
    const isCurrent = () => {
      const selected = readNativeConversationSelection(), shell = useLcosShellStore.getState();
      return connectionOwner.current === owner && openOwner.current && !owner.controller.signal.aborted
        && shell.projectId === request.projectId && shell.activeWorkspaceId === owner.workspaceId
        && useCanvasStore.getState().canvasId === owner.canvasId && selected?.projectId === request.projectId
        && selected.connectedConversationId === request.sourceConversationId;
    };
    setConnection({ request, busy: true, status: 'pending', message: verifyOnly ? '正在核对连接…' : request.action === 'continue_existing' ? '正在恢复会话…' : '正在连接新会话…' });
    void connectNativeLiveContinuation(request, { client: connectionClient, signal: owner.controller.signal, isCurrent,
      onProgress: phase => { if (isCurrent()) setConnection({ request, busy: true, status: 'pending',
        message: phase === 'binding' ? '正在打开新会话…' : phase === 'checking' ? '正在核对连接…' : request.action === 'continue_existing' ? '正在恢复会话…' : '正在连接新会话…' }); },
    }, { verifyOnly }).then(async result => {
      if (!isCurrent()) return;
      if (result.status === 'ready') {
        const projection = await connectionCollaboration.readSession(request.projectId, result.conversationId, owner.controller.signal);
        if (!isCurrent()) return;
        if (projection?.projectId !== request.projectId || projection.conversationId !== result.conversationId || projection.capabilities.canSend !== true) {
          setConnection({ request, busy: false, status: 'unavailable', message: '会话尚未准备好，原请求和输入保留，请核对连接。' }); return;
        }
        if (request.action === 'continue_existing') {
          const shell = useLcosShellStore.getState(), expected = shell.composerTarget;
          if (!expected || expected.intent !== 'continue' || expected.receiverConversationId !== result.conversationId) return;
          // The original action owns this same input; no raw target setter or alternate Composer is introduced.
          shell.prepareComposerContinuation(request.projectId, expected, request.operationId);
        }
        setConnection(undefined); setNotice(request.action === 'continue_existing' ? '已恢复当前会话。' : '已连接新会话，原对话仍在历史中。');
        requestNativeConversationView({ projectId: request.projectId, conversationId: result.conversationId,
          continuationOperationId: request.operationId });
      } else setConnection({ request, busy: false, ...result });
    }).catch(error => {
      if (isCurrent() && !(error instanceof Error && error.name === 'AbortError'))
        setConnection({ request, busy: false, status: 'unconfirmed', message: '连接结果尚未确认，请核对连接；不会重复创建。' });
    }).finally(() => {
      if (connectionOwner.current === owner) {
        if (isCurrent()) void useCollaborationSessionStore.getState().refresh(request.projectId, request.sourceConversationId);
        owner.controller.abort();
      }
    });
  };
  useEffect(() => {
    const connect = (event: Event) => {
      const request = (event as CustomEvent<NativeLiveContinuationRequest>).detail;
      if (request && typeof request.operationId === 'string' && request.operationId.trim()) connectAccepted(request);
    };
    window.addEventListener(nativeLiveContinuationEvent, connect);
    return () => { window.removeEventListener(nativeLiveContinuationEvent, connect); connectionOwner.current?.controller.abort(); };
  }, []);
  const selection = useNativeConversationSelection();
  const canvas = useCanvasStore(state => state);
  const workspaceId = useLcosShellStore(state => state.activeWorkspaceId);
  const composerTarget = useLcosShellStore(state => state.composerTarget);
  const composerOpen = useLcosShellStore(state => state.composerOpen);
  const shellProjectId = useLcosShellStore(state => state.projectId);
  useNativeChatNoticeAvoidance(isOpen, { projectId: shellProjectId, canvasId: canvas.canvasId, api: canvas.rfInstance });
  const projectId = snapshot.status === 'pending' ? undefined : snapshot.projectId;
  const conversations = snapshot.status === 'ready' || snapshot.status === 'partial' ? snapshot.conversations : [];
  const current = conversations.find(row => row.id === selection?.connectedConversationId && row.projectId === selection.projectId);
  useEffect(() => {
    const owner = connectionOwner.current;
    if (owner && (!isOpen || shellProjectId !== owner.request.projectId || canvas.canvasId !== owner.canvasId
      || workspaceId !== owner.workspaceId || selection?.projectId !== owner.request.projectId
      || selection.connectedConversationId !== owner.request.sourceConversationId)) {
      owner.controller.abort(); connectionOwner.current = undefined; setConnection(undefined);
    }
  }, [isOpen, shellProjectId, canvas.canvasId, workspaceId, selection?.projectId, selection?.connectedConversationId]);
  const refresh = () => {
    setAttempt(value => value + 1);
    if (projectId && current) void useCollaborationSessionStore.getState().refresh(projectId, current.id);
  };
  useEffect(() => {
    const openTask = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.projectId !== useLcosShellStore.getState().projectId || typeof detail.runId !== 'string' || !detail.runId.trim()) return;
      if (detail.sourceRunId !== undefined && (typeof detail.sourceRunId !== 'string' || !detail.sourceRunId.trim())) return;
      const fromLibrary = hasNativeLibraryReadingReturn(detail) && nativeLibraryReadingReturnCurrent(detail);
      replaceLibraryOrigin(fromLibrary ? detail : undefined);
      if (fromLibrary) {
        // Anchor the existing route object. Descendant tasks retain the normal
        // task back stack, and only this entry layer returns to the Library.
        const entry = nativeChatTaskRoute(nativeChatConversationRoute, detail.runId);
        libraryTaskRoute.current = entry; setRoute(entry);
      } else { libraryTaskRoute.current = undefined; setRoute(current => nativeChatTaskRoute(current, detail.runId, detail.sourceRunId)); }
      setConversationRequest(undefined); setSectionRequest(undefined);
      window.dispatchEvent(new CustomEvent('lcos-native-open-conversation'));
    };
    const openConversation = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.projectId !== useLcosShellStore.getState().projectId || typeof detail.conversationId !== 'string' || !detail.conversationId.trim()) return;
      if ((detail.progressItemId !== undefined || detail.progressRunId !== undefined)
        && (detail.section !== 'view-progress' || typeof detail.progressItemId !== 'string' || !detail.progressItemId.trim()
          || typeof detail.progressRunId !== 'string' || !detail.progressRunId.trim())) return;
      libraryTaskRoute.current = undefined;
      replaceLibraryOrigin(hasNativeLibraryReadingReturn(detail) && nativeLibraryReadingReturnCurrent(detail) ? detail : undefined);
      setConversationRequest({ projectId: detail.projectId, conversationId: detail.conversationId, status: 'pending' });
      setSectionRequest(isNativeChatConversationSection(detail.section)
        ? { projectId: detail.projectId, conversationId: detail.conversationId, section: detail.section, sequence: ++sectionSequence.current,
          ...(typeof detail.continuationOperationId === 'string' && detail.continuationOperationId.trim() ? { continuationOperationId: detail.continuationOperationId } : {}),
          ...(typeof detail.messageId === 'string' && detail.messageId.trim() ? { messageId: detail.messageId } : {}),
          ...(detail.progressItemId ? { progressItemId: detail.progressItemId, progressRunId: detail.progressRunId } : {}) } : undefined);
      setRoute(nativeChatConversationRoute); setSnapshot({ status: 'pending' }); setAttempt(value => value + 1);
      window.dispatchEvent(new CustomEvent('lcos-native-open-conversation'));
    };
    const showCurrentInput = (event:Event) => {
      const detail=(event as CustomEvent).detail,shell=useLcosShellStore.getState(),canvas=useCanvasStore.getState(),target=shell.composerTarget;
      if(!detail||!target||detail.projectId!==shell.projectId||detail.canvasId!==canvas.canvasId||!shell.composerOpen
        ||detail.inputKey!==composerInputKey(target)||detail.messageId!==target.messageId
        ||detail.continuationOperationId!==target.continuationOperationId)return;
      // This is an explicit return to the same input. Keep the selected
      // conversation and every draft address; only leave the task subpage.
      libraryTaskRoute.current=undefined;replaceLibraryOrigin();
      setRoute(nativeChatConversationRoute);setConversationRequest(undefined);setSectionRequest(undefined);
    };
    window.addEventListener('lcos-native-open-task', openTask);
    window.addEventListener('lcos-native-select-conversation', openConversation);
    window.addEventListener('lcos-native-show-current-input',showCurrentInput);
    return () => { window.removeEventListener('lcos-native-open-task', openTask);
      window.removeEventListener('lcos-native-select-conversation', openConversation);
      window.removeEventListener('lcos-native-show-current-input',showCurrentInput); };
  }, []);
  useEffect(() => { setRoute(nativeChatConversationRoute); setConversationRequest(undefined); setSectionRequest(undefined); }, [shellProjectId]);
  useEffect(() => {
    if (composerOpen && !isOpen) window.dispatchEvent(new CustomEvent('lcos-native-open-conversation'));
  }, [composerOpen, composerTarget?.nodeId, isOpen]);
  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    void loadConnectedPanel(controller.signal).then(value => { if (!controller.signal.aborted) setSnapshot(value); });
    return () => controller.abort();
  }, [isOpen, attempt, canvas.canvasId]);
  useEffect(() => {
    if (!conversationRequest || conversationRequest.status !== 'pending' || snapshot.status === 'pending'
      || canvas.status !== 'ready' || !canvas.canvasId || !workspaceId) return;
    const target = conversations.find(row => row.id === conversationRequest.conversationId && row.projectId === conversationRequest.projectId);
    if (projectId !== conversationRequest.projectId || shellProjectId !== conversationRequest.projectId || !target) {
      setConversationRequest(value => value ? { ...value, status: 'unavailable' } : value); return;
    }
    select({ projectId, connectedConversationId: target.id, canvasId: canvas.canvasId, workspaceId });
    setConversationRequest(undefined);
  }, [conversationRequest, snapshot, projectId, shellProjectId, canvas.status, canvas.canvasId, workspaceId]);
  useEffect(() => {
    if (!isOpen || !projectId || canvas.status !== 'ready' || !workspaceId) return;
    if (conversationRequest || route.page !== 'conversation' || selection && !current) return;
    const shell = useLcosShellStore.getState();
    if (shell.projectId !== projectId) return;
    const nodeId = current ? `conversation:${current.id}` : `canvas:${canvas.canvasId}`;
    const target=shell.composerTarget;
    const defaultCanvas=target?.nodeId.startsWith('canvas:')&&(!target.intent||target.intent==='delegate')
      &&!target.receiverConversationId&&!target.resultSlotId&&!target.targetReferences?.length&&!target.targetNodeIds?.length;
    if(current&&selection&&(selection.canvasId!==canvas.canvasId||selection.workspaceId!==workspaceId))
      select({...selection,canvasId:canvas.canvasId,workspaceId});
    if(shell.composerOpen){
      // Explicit Arc/Drop receivers keep their own task address. A selected
      // real conversation keeps its identity/draft while its visible scene moves.
      if(current&&target?.intent==='continue'&&target.receiverConversationId===current.id){
        if(target.workspaceId!==workspaceId)shell.openComposer({...target,workspaceId,focusInput:false});
        return;
      }
      if(current||!defaultCanvas||target?.nodeId===nodeId&&target?.workspaceId===workspaceId)return;
    }
    shell.openComposer({ nodeId, title: current?.label ?? '画布助手', focusInput: false,
      anchor: { x: 0, y: 0, width: 0, height: 0 }, workspaceId,
      intent: current ? 'continue' : 'delegate', ...(current ? { receiverConversationId: current.id } : {}) });
  }, [isOpen, projectId, current?.id, selection, conversationRequest, route.page, canvas.status, canvas.canvasId, workspaceId,composerOpen]);
  const leaveLibrary = () => {
    replaceLibraryOrigin();
    libraryTaskRoute.current = undefined;
  };
  useEffect(() => {
    if (!isOpen || libraryOrigin && !nativeLibraryReadingReturnCurrent(libraryOrigin)) leaveLibrary();
  }, [isOpen, shellProjectId, canvas.canvasId]);
  const choose = (id: string) => {
    const conversation = conversations.find(row => row.id === id);
    if (!conversation || !projectId || !canvas.canvasId || !workspaceId) return;
    leaveLibrary(); select({ projectId, connectedConversationId: conversation.id, canvasId: canvas.canvasId, workspaceId });
    setRoute(nativeChatConversationRoute); setConversationRequest(undefined); setSectionRequest(undefined); setNotice('');
  };
  const place = async () => {
    if (!current || !projectId || !canvas.canvasId || placing) return;
    const api = canvas.rfInstance, canvasId = canvas.canvasId;
    setPlacing(true); setNotice('');
    try {
      await placeConnectedConversation(projectId, canvasId, current);
      const live = useCanvasStore.getState();
      if (live.canvasId !== canvasId || live.rfInstance !== api) return;
      if (!api?.synchronizeConversationProjection || !workspaceId) throw new Error('projection-unavailable');
      const result = await api.synchronizeConversationProjection({ projectId, canvasId, workspaceId, connectedConversationId: current.id },
        { isCurrent: () => {
          const live = useCanvasStore.getState();
          return live.canvasId === canvasId && live.rfInstance === api && useLcosShellStore.getState().projectId === projectId;
        } });
      if (!result.ok) throw new Error('projection-pending');
      if (!api.getNodes().some(node => (node.data?.lcos_conversation_ref as any)?.connectedConversationId === current.id)) {
        throw new Error('projection-not-visible');
      }
      setNotice('已放到画布。');
    } catch { setNotice('画布状态暂未确认，请刷新后核对，勿重复放置。'); }
    finally { setPlacing(false); }
  };
  const close = () => { leaveLibrary();
    useLcosShellStore.getState().closeComposer(); onClose(); };
  const libraryBack = !!libraryOrigin && nativeLibraryReadingReturnCurrent(libraryOrigin)
    && ('runId' in libraryOrigin ? route === libraryTaskRoute.current : route.page === 'conversation');
  const backRoute = nativeChatBackRoute(route);
  const backLabel = backRoute.page === 'tasks' ? '返回任务列表' : backRoute.page === 'task' ? '返回上个任务' : '返回对话';
  const title = route.page === 'task' ? '任务' : route.page === 'tasks' ? '任务列表' : conversationRequest
    ? conversationRequest.status === 'pending' ? '打开对话…' : '对话暂不可用' : current?.label ?? '画布助手';
  const Header = NativeFrame.Header;
  const header = <Header title={title} activeSessionId={current?.id}
    entries={conversations.map(row => ({ id: row.id, title: row.label, updatedAt: row.lastActiveAt }))}
    historyState={snapshot.status === 'pending' ? 'loading' : snapshot.status === 'unavailable' ? 'error' : 'ready'}
    onSelectConversation={choose} onClose={close} onCanvasAssistant={() => {
      leaveLibrary(); useLcosShellStore.getState().closeComposer(); select(null); setRoute(nativeChatConversationRoute); setConversationRequest(undefined); setSectionRequest(undefined);
    }}
    onNewConversation={current && projectId ? () => {
      // The existing continuation owner prepares an honest new-session intent;
      // selecting the blank Canvas task input does not create a conversation.
      setRoute(nativeChatConversationRoute);
      requestNativeConversationView({
        projectId, conversationId: current.id, section: 'session-options',
      });
    } : undefined} newConversationLabel="新建对话…"
    artifactPanelOpen={route.page !== 'conversation' || libraryBack} panelLabel={libraryBack ? '返回库内预览' : route.page === 'conversation' ? '查看任务' : backLabel}
    panelIcon={route.page === 'conversation' && !libraryBack ? undefined : <ArrowLeft size={18} strokeWidth={1.5} />}
    onToggleArtifactPanel={() => { if (libraryBack && libraryOrigin) { replaceLibraryOrigin(undefined, true); libraryTaskRoute.current = undefined; setRoute(nativeChatConversationRoute); }
      else setRoute(value => value.page === 'conversation' ? { page: 'tasks', returnTo: value } : nativeChatBackRoute(value)); }}
    actions={[{ id: 'refresh', label: '重新读取对话', icon: <RefreshCw size={16} />, onSelect: refresh },
      ...(current ? [{ id: 'place', label: '放到画布', icon: <MapPin size={16} />, disabled: placing, onSelect: () => { void place(); } }] : [])]} />;
  const content = route.page === 'task' && projectId ? <NativeTaskDetail projectId={projectId} runId={route.runId}
      onOpenMaterial={requestNativeMaterialView} onOpenRun={runId => setRoute(value => nativeChatTaskRoute(value, runId))} />
    : route.page === 'tasks' && projectId && canvas.canvasId ? <NativeRunList projectId={projectId} canvasId={canvas.canvasId}
      View={NativeFrame.List} onOpen={runId => setRoute(value => nativeChatTaskRoute(value, runId))} />
    : conversationRequest ? <div className="native-chat-empty" role={conversationRequest.status === 'pending' ? 'status' : 'alert'}>
      <p>{conversationRequest.status === 'pending' ? '正在打开原会话…' : '这段会话暂时无法打开，原输入保留。'}</p>
      {conversationRequest.status === 'unavailable' && <button onClick={() => {
        setConversationRequest(value => value ? { ...value, status: 'pending' } : value); setSnapshot({ status: 'pending' }); refresh();
      }}>重试读取</button>}</div>
    : snapshot.status === 'unavailable' ? <div className="native-chat-empty" role="alert"><p>对话暂时无法打开。</p><button onClick={refresh}>重试</button></div>
        : selection && !current && snapshot.status !== 'pending' ? <div className="native-chat-empty" role="alert"><p>这段对话暂时无法打开。</p><button onClick={refresh}>重试</button></div>
        : current && projectId ? <ConversationContent key={`${projectId}:${current.id}`} projectId={projectId} conversationId={current.id}
          NativeMessages={NativeMessages} onRefresh={refresh} onDismissRequest={() => setSectionRequest(undefined)}
          onRecoveryConfirmed={(operation, prepared) => {
            if (useLcosShellStore.getState().projectId !== operation.projectId || readNativeConversationSelection()?.connectedConversationId !== operation.connectedConversationId) return;
            if (connectionOwner.current?.request.operationId === operation.operationId) { connectionOwner.current.controller.abort(); connectionOwner.current = undefined; }
            setConnection(value => value?.request.operationId === operation.operationId ? undefined : value);
            setNotice(prepared ? '已恢复当前会话。' : '已恢复连接，原输入和待核对消息保留。');
          }}
          requestedSection={sectionRequest?.projectId === projectId && sectionRequest.conversationId === current.id ? sectionRequest : undefined} />
          : <div className="native-chat-empty" aria-hidden="true" />;
  const composer = projectId && !conversationRequest && (!selection || current) && canvas.status === 'ready' && workspaceId && composerOpen && composerTarget && route.page === 'conversation' && isOpen
    ? <LcosComposerHost projectId={projectId} workspaceId={composerTarget.workspaceId??workspaceId} anchor={null} open inline onClose={close} /> : null;
  return <NativeComposerProvider parts={NativeComposerParts}><NativeFrame isOpen={isOpen} header={header}
    composer={<>{notice && <p className="native-chat-notice" role="status">{notice}</p>}
      {connection && <section className="native-chat-notice" data-native-chat-connection={connection.request.operationId} role="status">
        <p>{connection.message}</p>{!connection.busy && <button onClick={() => connectAccepted(connection.request, connection.status !== 'recoverable')}>
          {connection.status === 'recoverable' ? '重试连接' : '核对连接'}</button>}
      </section>}{composer}</>}>
    {isOpen ? content : null}
  </NativeFrame></NativeComposerProvider>;
}
