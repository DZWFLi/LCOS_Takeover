import { MessageSquare } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { agentApi } from '@/api/agent';
import { Button } from '@/components/Common/Button';
import { Popover } from '@/components/Common/Popover';
import useCanvasStore from '@/store/canvasStore';
import { selectThreadIsLoading, useChatStore } from '@/store/chatStore';
import { usePreviewWorkspaceStore } from '@/store/previewWorkspace/store';

import { createLcosCoreSession } from '../app/lcosCoreClient';
import { useLcosReferenceStore } from '../lcosReferenceState';
import { useCollaborationSessionStore } from './collaborationSessionStore';
import { activeNativeConversation, archiveNativeConversation, savedNativeConversationHistories } from './nativeConversationArchive';
import { useLcosShellStore } from '../shell/lcosShellStore';

import type { NativeConversationAddress } from './nativeConversationArchive';
import type { AgentBinding } from '@huabu/shared';
import type { ConnectedConversationV1, ConversationIdentityChainV1, ConversationSessionV1 } from '@local-creative-os/contracts';
import type { Workspace } from '@local-creative-os/domain';

/** Native thread ownership stays native. This entry reads an immutable history
 * snapshot, imports through Core and explicitly links an existing real Glyth. */
export function NativeConversationProjectEntry(): React.JSX.Element | null {
  const projectId = useLcosShellStore((state) => state.projectId);
  const workspace = usePreviewWorkspaceStore((state) => state.workspace);
  const addressKey = useCanvasStore((state) => {
    if (!state.canvasId) return '';
    const address = activeNativeConversation(workspace, state.canvasId, state.nodes, state.worldReferences);
    return address ? JSON.stringify([address.threadId, address.ownerCanvasId]) : '';
  });
  const address = useMemo(() => {
    if (!addressKey) return undefined;
    const [threadId, ownerCanvasId] = JSON.parse(addressKey) as [string, string];
    return { threadId, ownerCanvasId };
  }, [addressKey]);
  if (!projectId || !address) return null;
  return <NativeProjectSessionEntry key={JSON.stringify([projectId, addressKey])} projectId={projectId} address={address} />;
}

function NativeProjectSessionEntry({ projectId, address }: { readonly projectId: string; readonly address: NativeConversationAddress }): React.JSX.Element {
  const session = useMemo(() => createLcosCoreSession(), []);
  const activeWorkspaceId = useLcosShellStore((state) => state.activeWorkspaceId);
  const binding = useChatStore((state) => state.threadsById[address.threadId]?.binding ?? state.bindingByThread[address.threadId]);
  const streaming = useChatStore((state) => selectThreadIsLoading(state, address.threadId));
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [targets, setTargets] = useState<ConnectedConversationV1[]>([]);
  const [workspaces, setWorkspaces] = useState<readonly Workspace[]>([]);
  const [targetId, setTargetId] = useState('');
  const [identity, setIdentity] = useState<ConversationIdentityChainV1>();
  const [archive, setArchive] = useState<ConversationSessionV1>();
  const [savedHistories, setSavedHistories] = useState<ConversationSessionV1[]>([]);
  const [savedHistoryId, setSavedHistoryId] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [readError, setReadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [readAttempt, setReadAttempt] = useState(0);
  const request = useRef<AbortController | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; request.current?.abort(); }; }, []);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController(); setLoading(true); setReadError(false); setNotice('');
    void Promise.all([session.conversations.listConnectedConversations(projectId, controller.signal), session.projects.getWorkspaces(projectId, controller.signal),
      session.conversations.listSessions(projectId, controller.signal)])
      .then(([conversations, scenes, histories]) => {
        if (controller.signal.aborted) return;
        setTargets(conversations.filter((item) => item.projectId === projectId));
        setWorkspaces(scenes.filter((item) => String(item.projectId) === projectId)); setLoading(false);
        setSavedHistories(savedNativeConversationHistories(projectId, address, histories, conversations));
      }).catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setLoading(false); setReadError(true); setNotice(reason instanceof Error ? reason.message : '项目会话未能读取。');
      });
    return () => controller.abort();
  }, [open, projectId, session, readAttempt, address]);
  useEffect(() => {
    setIdentity(undefined);
    if (!targetId) return;
    const controller = new AbortController();
    void session.conversations.getIdentity(projectId, targetId, controller.signal).then((value) => {
      if (!controller.signal.aborted) {
        if (value?.projectId === projectId && value.connectedConversation.id === targetId) setIdentity(value);
        else { setReadError(true); setNotice('所选会话暂时无法访问，请重新加载后选择。'); }
      }
    }).catch((reason: unknown) => { if (!controller.signal.aborted) { setReadError(true); setNotice(reason instanceof Error ? reason.message : '会话暂时无法访问。'); } });
    return () => controller.abort();
  }, [projectId, targetId, session, readAttempt]);
  const saveHistory = async () => {
    if (request.current || streaming) return;
    const workspace = workspaces.find((item) => String(item.id) === activeWorkspaceId);
    if (!workspace) { setReadError(true); setNotice('当前项目暂时无法读取，重新加载后再保存。'); return; }
    const destinationId = targetId;
    if (destinationId && (!identity || identity.projectId !== projectId || identity.connectedConversation.id !== destinationId)) return;
    const controller = new AbortController(); request.current = controller; setBusy(true); setNotice('');
    const sourceBinding: AgentBinding | undefined = binding ? { ...binding } : undefined;
    const assertCurrent = (): void => {
      if (controller.signal.aborted || !mounted.current) throw new DOMException('Save cancelled', 'AbortError');
      const shell = useLcosShellStore.getState(), canvas = useCanvasStore.getState();
      const current = canvas.canvasId ? activeNativeConversation(usePreviewWorkspaceStore.getState().workspace,
        canvas.canvasId, canvas.nodes, canvas.worldReferences) : undefined;
      if (shell.projectId !== projectId || shell.activeWorkspaceId !== String(workspace.id)
        || current?.threadId !== address.threadId || current.ownerCanvasId !== address.ownerCanvasId) {
        throw new Error('当前会话或现场已切换，已停止后续操作，可回到原会话重试。');
      }
    };
    try {
      assertCurrent();
      let saved = destinationId ? archive ?? savedHistories.find((item) => item.id === savedHistoryId) : undefined;
      if (destinationId && savedHistoryId && !saved) throw new Error('所选历史已无法访问，请重新加载后选择。');
      if (!saved) {
        const history = await agentApi.fetchHistory(address.threadId, address.ownerCanvasId);
        assertCurrent();
        if (selectThreadIsLoading(useChatStore.getState(), address.threadId)) throw new Error('当前会话正在回复，结束后再保存完整历史。');
        const completed = await archiveNativeConversation(session.conversations, { projectId, address, binding: sourceBinding, history,
          scopeId: String(workspace.scopeId), workspaceId: String(workspace.id),
          title: `${sourceBinding?.kind === 'external' ? sourceBinding.alias : '画布助手'} · 历史` }, controller.signal);
        if (controller.signal.aborted || !mounted.current) return;
        saved = completed.session;
        useLcosReferenceStore.getState().requestNodeBindingRefresh();
      }
      setArchive(saved);
      assertCurrent();
      if (!destinationId) { setNotice(`已保存 ${saved.messageCount} 条历史到项目。`); return; }
      const currentIdentity = await session.conversations.getIdentity(projectId, destinationId, controller.signal);
      assertCurrent();
      if (currentIdentity?.projectId !== projectId || currentIdentity.connectedConversation.id !== destinationId) {
        throw new Error('所选项目会话已无法访问。已保存的历史保留，请重新选择会话。');
      }
      const linked = await session.conversations.linkSession(projectId, destinationId, saved.id, controller.signal);
      if (controller.signal.aborted || !mounted.current) return;
      if (linked.projectId !== projectId || linked.connectedConversation.id !== destinationId || linked.conversationSession?.id !== saved.id) {
        throw new Error('关联回执与选择的会话或历史不一致。');
      }
      assertCurrent();
      setIdentity(linked); setArchive(undefined); setSavedHistoryId('');
      setSavedHistories((items) => items.filter((item) => item.id !== saved.id)); setNotice('已保存到所选会话。');
      void useCollaborationSessionStore.getState().refresh(projectId, destinationId);
      useLcosReferenceStore.getState().requestNodeBindingRefresh();
      useLcosShellStore.getState().openWindow('conversation', linked.connectedConversation.label, destinationId);
      setOpen(false);
    } catch (reason: unknown) {
      if (!controller.signal.aborted && mounted.current) setNotice(reason instanceof Error ? reason.message : '保存未完成，已保存的历史保留，可重试。');
    } finally {
      if (request.current === controller) request.current = null;
      if (mounted.current) setBusy(false);
    }
  };
  return <div data-lcos-native-project-conversation className="flex shrink-0 items-center justify-end border-b px-2 py-1" data-floating-chrome>
    <Button ref={buttonRef} variant="ghost" size="sm" aria-expanded={open} aria-label="项目会话与产出"
      onClick={() => {
        const rect = buttonRef.current?.getBoundingClientRect(); if (rect) setPosition({ x: rect.right, y: rect.bottom + 4 });
        setOpen((value) => !value);
      }}><MessageSquare size={14} />项目会话与产出</Button>
    {open && <Popover position={position} anchor="top-right" onDismiss={() => setOpen(false)} className="w-80 p-3">
      <div className="flex flex-col gap-2">
        <span className="text-sm">{binding?.kind === 'external' ? binding.alias : '画布助手'} · 当前历史</span>
        <span className="text-xs opacity-65">保存当前历史；选择会话后会直接打开，继续处理项目产出。</span>
        <label className="text-xs">保存到
          <select aria-label="关联的项目会话" className="mt-1 w-full rounded border bg-transparent p-2" value={targetId} disabled={loading || busy}
            onChange={(event) => { setTargetId(event.target.value); setNotice(''); }}>
            <option value="">项目历史（不关联会话）</option>
            {targets.map((target) => <option key={target.id} value={target.id}>{target.label}</option>)}
          </select>
        </label>
        {targetId && !archive && savedHistories.length > 0 && <label className="text-xs">使用的历史
          <select aria-label="使用已保存的历史" className="mt-1 w-full rounded border bg-transparent p-2" value={savedHistoryId}
            disabled={busy || loading} onChange={(event) => setSavedHistoryId(event.target.value)}>
            <option value="">保存当前最新历史</option>
            {savedHistories.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.messageCount} 条 · {new Date(item.createdAt).toLocaleString()}</option>)}
          </select>
        </label>}
        {!loading && !readError && targets.length === 0 && <span className="text-xs">当前可保存到项目历史，项目会话尚未可用。</span>}
        {identity?.conversationSession && <span className="text-xs">将更新：{identity.conversationSession.title}</span>}
        {archive && <span className="text-xs">已保存 {archive.messageCount} 条记录，重试时继续使用这份历史。</span>}
        <Button variant="outline" size="sm" disabled={busy || loading || streaming || Boolean(targetId && !identity)} onClick={() => void saveHistory()}>
          {busy ? '保存中…' : streaming ? '当前正在回复' : targetId ? archive ? '继续保存并打开会话' : savedHistoryId ? '关联已保存历史并打开'
            : identity?.conversationSession ? '更新历史并打开会话' : '保存并打开会话' : archive ? '更新保存的历史' : '保存到项目'}</Button>
        {targets.some((target) => target.id === targetId) && <Button variant="ghost" size="sm" disabled={busy}
          onClick={() => { useLcosShellStore.getState().openWindow('conversation', targets.find((target) => target.id === targetId)?.label ?? '项目会话', targetId); setOpen(false); }}>打开会话与产出</Button>}
        {notice && <span role="status" className="text-xs">{notice}</span>}
        {readError && <Button variant="ghost" size="sm" disabled={busy} onClick={() => setReadAttempt((value) => value + 1)}>重新加载会话</Button>}
      </div>
    </Popover>}
  </div>;
}
