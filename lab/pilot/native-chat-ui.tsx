import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ComponentType, type ReactNode } from 'react';
import { ArrowLeft, MapPin, RefreshCw, Square } from 'lucide-react';
import { CoreCollaborationClient } from '../../lcos/apps/web-gen2/src/backend/collaboration';
import { createLcosCoreSession } from '../../lcos/huabu/apps/web/src/lcos/app/lcosCoreClient';
import { useCollaborationSession } from '../../lcos/huabu/apps/web/src/lcos/collaboration/useCollaborationSession';
import { useCollaborationSessionStore } from '../../lcos/huabu/apps/web/src/lcos/collaboration/collaborationSessionStore';
import { cancelConversationRun } from '../../lcos/huabu/apps/web/src/lcos/collaboration/conversationCommands';
import { useLcosShellStore } from '../../lcos/huabu/apps/web/src/lcos/shell/lcosShellStore';
import { LcosComposerHost } from '../../lcos/huabu/apps/web/src/lcos/composer/LcosComposerHost';
import { useComposerContinuation } from '../../lcos/huabu/apps/web/src/lcos/composer/useComposerContinuation';
import { WaitingInputSection } from '../../lcos/huabu/apps/web/src/lcos/professional/WaitingInputSection';
import { ArtifactReturnSection } from '../../lcos/huabu/apps/web/src/lcos/professional/ArtifactReturnSection';
import { RecoverySection } from '../../lcos/huabu/apps/web/src/lcos/professional/RecoverySection';
import { NativeComposerProvider, useNativeComposerParts, type NativeComposerParts } from './native-composer-view';
import { projectNativeChatMessages } from './native-chat-messages';
import { NativeRunList } from './native-run-list';
import type { NativeChatFrameView } from './native-chat-view';
import { NativeTaskDetail } from './native-task-detail';
import { isNativeChatConversationSection, nativeChatBackRoute, nativeChatConversationRoute, nativeChatTaskRoute,
  requestNativeConversationView, type NativeChatRoute, type NativeChatConversationSection, type NativeConversationViewRequest } from './native-task-route';
import { requestNativeMaterialView } from './native-material-viewer-port';
import useCanvasStore from './native-canvas-port';
import { loadConnectedPanel, placeConnectedConversation, type ConnectedPanelState, type LcosConversationReference } from './native-agent-ui';
import './native-chat-ui.css';

// Selected conversation is a UI address, never a second session/message store.
let selected: LcosConversationReference | null = null;
const selectionListeners = new Set<() => void>();
function select(reference: LcosConversationReference | null) {
  if (selected?.projectId !== reference?.projectId || selected?.connectedConversationId !== reference?.connectedConversationId) {
    const shell = useLcosShellStore.getState();
    // Inspecting the current input's history must keep its exact message and
    // continuation owner. Selecting a different receiver remains explicit.
    if (!reference || shell.projectId !== reference.projectId
      || shell.composerTarget?.receiverConversationId !== reference.connectedConversationId) shell.closeComposer();
  }
  selected = reference; selectionListeners.forEach(listener => listener());
}
export function requestNativeConversation(reference: LcosConversationReference): void {
  select(reference);
  window.dispatchEvent(new CustomEvent('lcos-native-open-conversation'));
}
export function useNativeConversationSelection() {
  return useSyncExternalStore(listener => { selectionListeners.add(listener); return () => selectionListeners.delete(listener); }, () => selected);
}
export interface NativeCoreChatPanelProps {
  isOpen: boolean;
  onClose(): void;
  NativeFrame: NativeChatFrameView;
  NativeMessages: ComponentType<any>;
  NativeComposerParts: NativeComposerParts;
}

type ConversationSectionRequest = Pick<NativeConversationViewRequest, 'continuationOperationId' | 'messageId'>
  & { section: NativeChatConversationSection; sequence: number };
function ConversationContent({ projectId, conversationId, NativeMessages, onRefresh, requestedSection }: {
  projectId: string; conversationId: string; NativeMessages: ComponentType<any>; onRefresh(): void;
  requestedSection?: ConversationSectionRequest;
}) {
  const entry = useCollaborationSession(projectId, conversationId);
  const target = useLcosShellStore(state => state.composerTarget);
  const continuation = useComposerContinuation(projectId, target, true);
  const session = useMemo(() => createLcosCoreSession(), []);
  const client = useMemo(() => new CoreCollaborationClient(session.http), [session]);
  const [notice, setNotice] = useState('');
  const [stopping, setStopping] = useState(false);
  const [stopTarget, setStopTarget] = useState<string>();
  const [stopUnconfirmed, setStopUnconfirmed] = useState<string>();
  const stopBusy = useRef(false), confirmation = useRef<HTMLElement>(null);
  const Button = useNativeComposerParts()?.Button ?? 'button';
  const scope = useRef(''); scope.current = `${projectId}:${conversationId}`;
  const projection = entry?.status === 'ready' ? entry.projection : undefined;
  const timeline = useMemo(() => projectNativeChatMessages(entry?.timeline ?? []), [entry?.timeline]);
  const requestedOperation = requestedSection?.continuationOperationId;
  const recovery = continuation.diagnostics?.operations.filter(operation => operation.projectId === projectId
    && operation.connectedConversationId === conversationId && (operation.allowedActions.length > 0 || operation.operationId === requestedOperation)) ?? [];
  useEffect(() => { setStopTarget(undefined); setStopUnconfirmed(value => value === projection?.activity.activeRunId ? value : undefined); }, [projection?.activity.activeRunId]);
  useEffect(() => { if (stopTarget) confirmation.current?.querySelector<HTMLButtonElement>('button')?.focus(); }, [stopTarget]);
  useEffect(() => {
    if (!requestedSection || entry?.status !== 'ready') return;
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
      const element = requested ?? document.querySelector<HTMLElement>(`[data-lcos-native-chat-frame] ${selectors[requestedSection.section]}`);
      if (!element) return;
      if (requestedSection.section === 'session-options') {
        const toggle = element.querySelector<HTMLElement>('[aria-expanded="false"]'); toggle?.click();
      }
      element.scrollIntoView({ block: 'nearest' });
      (element.matches('button,input,textarea') ? element : element.querySelector<HTMLElement>('button,input,textarea,summary'))?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [projectId, conversationId, requestedSection, entry, continuation.diagnostics]);
  const activity = (item: any) => <div key={item.itemId} className="native-chat-activity" data-native-chat-activity={item.kind}
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
  if (entry?.status === 'error' || entry?.timelineStatus === 'error' || !timeline.ok) return <div className="native-chat-empty" role="alert">
    <p>暂时无法读取对话，已有记录保留。</p><button onClick={onRefresh}>重试</button>
  </div>;
  if (!entry || entry.status === 'loading') return <div className="native-chat-empty" role="status">正在打开…</div>;
  return <>
    <NativeMessages canvasId={useCanvasStore.getState().canvasId} messages={timeline.messages} streamState="idle"
      scrollToMessageId={requestedSection?.messageId}
      hasMoreOlder={false} isLoadingOlder={false} renderBeforeMessage={(id: string) => before.get(id)}
      renderAfterMessages={() => <>{pending}
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
          <RecoverySection collaboration={client} projectId={projectId} conversationId={conversationId}
            operations={[operation]} onRefreshed={onRefresh} />
        </section>)}
        {(requestedOperation || requestedSection?.section === 'session-diagnostics') && <section data-native-chat-requests className="native-chat-notice">
          {requestedOperation && !recovery.some(operation => operation.operationId === requestedOperation)
            ? <p role="status">暂时没有读到这次请求，请重新读取；原输入和请求保留。</p>
            : !recovery.length && <p role="status">当前没有需要处理的会话恢复操作。</p>}
          <Button onClick={onRefresh}>更新会话状态</Button>
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
  const [sectionRequest, setSectionRequest] = useState<ConversationSectionRequest & { projectId: string; conversationId: string }>();
  const sectionSequence = useRef(0);
  const [notice, setNotice] = useState('');
  const [placing, setPlacing] = useState(false);
  const selection = useNativeConversationSelection();
  const canvas = useCanvasStore(state => state);
  const workspaceId = useLcosShellStore(state => state.activeWorkspaceId);
  const composerTarget = useLcosShellStore(state => state.composerTarget);
  const composerOpen = useLcosShellStore(state => state.composerOpen);
  const shellProjectId = useLcosShellStore(state => state.projectId);
  const projectId = snapshot.status === 'pending' ? undefined : snapshot.projectId;
  const conversations = snapshot.status === 'ready' || snapshot.status === 'partial' ? snapshot.conversations : [];
  const current = conversations.find(row => row.id === selection?.connectedConversationId && row.projectId === selection.projectId);
  const refresh = () => {
    setAttempt(value => value + 1);
    if (projectId && current) void useCollaborationSessionStore.getState().refresh(projectId, current.id);
  };
  useEffect(() => {
    const openTask = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.projectId !== useLcosShellStore.getState().projectId || typeof detail.runId !== 'string' || !detail.runId.trim()) return;
      if (detail.sourceRunId !== undefined && (typeof detail.sourceRunId !== 'string' || !detail.sourceRunId.trim())) return;
      setRoute(current => nativeChatTaskRoute(current, detail.runId, detail.sourceRunId)); setConversationRequest(undefined); setSectionRequest(undefined);
      window.dispatchEvent(new CustomEvent('lcos-native-open-conversation'));
    };
    const openConversation = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.projectId !== useLcosShellStore.getState().projectId || typeof detail.conversationId !== 'string' || !detail.conversationId.trim()) return;
      setConversationRequest({ projectId: detail.projectId, conversationId: detail.conversationId, status: 'pending' });
      setSectionRequest(isNativeChatConversationSection(detail.section)
        ? { projectId: detail.projectId, conversationId: detail.conversationId, section: detail.section, sequence: ++sectionSequence.current,
          ...(typeof detail.continuationOperationId === 'string' && detail.continuationOperationId.trim() ? { continuationOperationId: detail.continuationOperationId } : {}),
          ...(typeof detail.messageId === 'string' && detail.messageId.trim() ? { messageId: detail.messageId } : {}) } : undefined);
      setRoute(nativeChatConversationRoute); setSnapshot({ status: 'pending' }); setAttempt(value => value + 1);
      window.dispatchEvent(new CustomEvent('lcos-native-open-conversation'));
    };
    window.addEventListener('lcos-native-open-task', openTask);
    window.addEventListener('lcos-native-select-conversation', openConversation);
    return () => { window.removeEventListener('lcos-native-open-task', openTask);
      window.removeEventListener('lcos-native-select-conversation', openConversation); };
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
    // An Arc/Drop caller may already have prepared a precise receiver and
    // references. Opening the right rail must not replace that input intent.
    if (shell.composerOpen) return;
    shell.openComposer({ nodeId, title: current?.label ?? '画布助手', focusInput: false,
      anchor: { x: 0, y: 0, width: 0, height: 0 }, workspaceId,
      intent: current ? 'continue' : 'delegate', ...(current ? { receiverConversationId: current.id } : {}) });
  }, [isOpen, projectId, current?.id, selection, conversationRequest, route.page, canvas.status, canvas.canvasId, workspaceId]);
  const choose = (id: string) => {
    const conversation = conversations.find(row => row.id === id);
    if (!conversation || !projectId || !canvas.canvasId || !workspaceId) return;
    select({ projectId, connectedConversationId: conversation.id, canvasId: canvas.canvasId, workspaceId });
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
  const close = () => { useLcosShellStore.getState().closeComposer(); onClose(); };
  const backRoute = nativeChatBackRoute(route);
  const backLabel = backRoute.page === 'tasks' ? '返回任务列表' : backRoute.page === 'task' ? '返回上个任务' : '返回对话';
  const title = conversationRequest
    ? conversationRequest.status === 'pending' ? '打开对话…' : '对话暂不可用' : current?.label ?? '画布助手';
  const Header = NativeFrame.Header;
  const header = <Header title={title} activeSessionId={current?.id}
    entries={conversations.map(row => ({ id: row.id, title: row.label, updatedAt: row.lastActiveAt }))}
    historyState={snapshot.status === 'pending' ? 'loading' : snapshot.status === 'unavailable' ? 'error' : 'ready'}
    onSelectConversation={choose} onClose={close} onCanvasAssistant={() => {
      select(null); setRoute(nativeChatConversationRoute); setConversationRequest(undefined); setSectionRequest(undefined);
    }}
    onNewConversation={current && projectId ? () => {
      // The existing continuation owner prepares an honest new-session intent;
      // selecting the blank Canvas task input does not create a conversation.
      setRoute(nativeChatConversationRoute);
      requestNativeConversationView({
        projectId, conversationId: current.id, section: 'session-options',
      });
    } : undefined} newConversationLabel="新建对话…"
    artifactPanelOpen={route.page !== 'conversation'} panelLabel={route.page === 'conversation' ? '查看任务' : backLabel}
    panelIcon={route.page === 'conversation' ? undefined : <ArrowLeft size={18} strokeWidth={1.5} />}
    onToggleArtifactPanel={() => setRoute(value => value.page === 'conversation'
      ? { page: 'tasks', returnTo: value } : nativeChatBackRoute(value))}
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
          NativeMessages={NativeMessages} onRefresh={refresh}
          requestedSection={sectionRequest?.projectId === projectId && sectionRequest.conversationId === current.id ? sectionRequest : undefined} />
          : <div className="native-chat-empty"><p>想一起完成什么？</p><span>输入想法，或拖入材料。</span></div>;
  const composer = projectId && !conversationRequest && (!selection || current) && canvas.status === 'ready' && workspaceId && composerOpen && composerTarget && route.page === 'conversation' && isOpen
    ? <LcosComposerHost projectId={projectId} workspaceId={workspaceId} anchor={null} open inline onClose={close} /> : null;
  return <NativeComposerProvider parts={NativeComposerParts}><NativeFrame isOpen={isOpen} header={header}
    composer={<>{notice && <p className="native-chat-notice" role="status">{notice}</p>}{composer}</>}>
    {isOpen ? content : null}
  </NativeFrame></NativeComposerProvider>;
}
