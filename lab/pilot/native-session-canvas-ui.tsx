import { useCallback, useEffect, useRef, useState } from 'react';
import { useLcosShellStore } from '../../lcos/huabu/apps/web/src/lcos/shell/lcosShellStore';
import { PermissionTray } from '../../lcos/huabu/apps/web/src/components/Messages/AIMessage/PermissionCard';
import { readNativeConversationSelection } from './native-conversation-selection';
import useCanvasStore from './native-canvas-port';

export function captureNativeCanvasSendAddress(projectId: string, input: { conversationId: string }) {
  const shell = useLcosShellStore.getState(), canvas = useCanvasStore.getState(), selected = readNativeConversationSelection();
  if (shell.projectId !== projectId || selected?.projectId !== projectId || selected.connectedConversationId !== input.conversationId
    || !canvas.canvasId || !shell.activeWorkspaceId || selected.canvasId !== canvas.canvasId || selected.workspaceId !== shell.activeWorkspaceId) return undefined;
  return { canvasId: canvas.canvasId, workspaceId: shell.activeWorkspaceId };
}

function canvasPermissionPresentation(request: any) {
  const names = request.options.map((option: any) => option.name).join('\n');
  const nodeTitle = (id: string) => useCanvasStore.getState().nodes?.find((node: any) => node.id === id)?.data?.title;
  let title: string | undefined, preview: string | undefined;
  if (/:\s*inspect_nodes(?:\n|$)/.test(names) && Array.isArray(request.toolCall.rawInput?.ids)) {
    const ids = request.toolCall.rawInput.ids;
    const label = ids.length === 1 ? nodeTitle(ids[0]) : undefined;
    title = label ? '允许查看「' + label + '」？' : '允许查看画布节点？';
    preview = '读取节点的标题、位置和关系。';
  } else if (/:\s*set_node_emphasis(?:\n|$)/.test(names) && Array.isArray(request.toolCall.rawInput?.patches)) {
    const patches = request.toolCall.rawInput.patches, label = patches.length === 1 ? nodeTitle(patches[0]?.nodeId) : undefined;
    const clear = patches.length === 1 && patches[0]?.patch?.lcos_gui_emphasis === false;
    title = label ? `允许${clear ? '取消' : ''}强调「${label}」？` : '允许调整画布强调显示？';
    preview = '只保存节点的视觉强调，不改正文、位置或任务。';
  } else if (/:\s*set_node_pinned(?:\n|$)/.test(names)) {
    const input = request.toolCall.rawInput, label = nodeTitle(input?.nodeId), clear = input?.pinned === false;
    title = label ? `允许${clear ? '取消固定' : '固定'}「${label}」？` : `允许${clear ? '取消固定' : '固定'}画布节点？`;
    preview = clear ? '从导航中取消固定，材料内容保持不变。' : input?.scope === 'cross-surface'
      ? '将这个节点加入可从其他现场查找的固定导航，材料内容保持不变。' : '将这个节点加入当前现场的固定导航，随时可以取消。';
  } else if (/:\s*set_node_color_pin(?:\n|$)/.test(names)) {
    const input = request.toolCall.rawInput, label = nodeTitle(input?.nodeId), clear = input?.present === false;
    const color = typeof input?.color === 'string' ? input.color.toUpperCase() : '';
    const colors: Record<string, string> = { '#F0606B': '红色', '#F4A14B': '橙色', '#EDC63D': '黄色', '#4FC978': '绿色', '#4EA8FF': '蓝色', '#A55CF0': '紫色' };
    const colorLabel = colors[color] ?? '这项颜色';
    title = label ? `允许${clear ? '移除' : '添加'}「${label}」的颜色标记？` : `允许${clear ? '移除' : '添加'}颜色标记？`;
    preview = `${clear ? '移除' : '添加'}${colorLabel}标记，保留其他颜色；材料内容与任务保持不变。`;
  } else if (/:\s*rename_color_pin(?:\n|$)/.test(names)) {
    const input = request.toolCall.rawInput, label = typeof input?.label === 'string' ? input.label.trim() : '';
    title = label ? `允许将颜色组改名为「${label}」？` : '允许修改颜色组名称？';
    preview = '会更新本项目里使用这个颜色组的位置，材料内容保持不变。';
  } else if (/:\s*set_node_geometry(?:\n|$)/.test(names) && Array.isArray(request.toolCall.rawInput?.items)) {
    const items = request.toolCall.rawInput.items, label = items.length === 1 ? nodeTitle(items[0].nodeId) : undefined;
    title = label ? '允许调整「' + label + '」的位置？' : '允许调整画布位置？';
    if (items.length === 1 && Number.isFinite(items[0].position?.x) && Number.isFinite(items[0].position?.y))
      preview = '移动到 x ' + items[0].position.x + '，y ' + items[0].position.y + '。';
  }
  if (!title) return { part: { kind: 'permission', ...request } };
  const rank = (kind: string) => kind === 'allow_once' ? 0 : kind === 'reject_once' ? 1 : 2;
  const options = request.options.map((option: any) => ({ ...option, name: option.kind === 'allow_once' ? '允许这次'
    : option.kind === 'reject_once' ? '拒绝' : option.kind === 'allow_always' && option.optionId.endsWith('_project') ? '本项目总是允许'
      : option.kind === 'allow_always' && option.optionId.endsWith('_user') ? '所有项目总是允许' : option.name }))
    .sort((a: any, b: any) => rank(a.kind) - rank(b.kind));
  return { displayTitle: title, displayPreview: preview, part: { kind: 'permission', ...request, options } };
}

/** Original Huabu permission tray placed in the existing TapNow message slot.
 * Reads the existing client request; no optimistic assistant or Run is made. */
export function NativeSessionCanvasPermissions({ projectId, conversationId, onRefresh }: {
  projectId: string; conversationId: string; onRefresh: () => void;
}) {
  const [snapshot, setSnapshot] = useState<any>();
  const [notice, setNotice] = useState('');
  const live = useRef(''); live.current = projectId + ':' + conversationId;
  const pending = useRef<AbortController>();
  const path = '/api/lcos/core/projects/' + encodeURIComponent(projectId) + '/connected-conversations/'
    + encodeURIComponent(conversationId) + '/canvas-permissions';
  const read = useCallback(async () => {
    pending.current?.abort(); const controller = new AbortController(); pending.current = controller;
    const expected = projectId + ':' + conversationId;
    try {
      const response = await fetch(path, { signal: controller.signal, cache: 'no-store', redirect: 'error' });
      const body = await response.json();
      if (controller.signal.aborted || live.current !== expected) return;
      if (!response.ok || body.ok !== true || body.value?.projectId !== projectId || body.value?.conversationId !== conversationId
        || !Array.isArray(body.value.requests)) throw new Error('Original permission read unavailable.');
      setSnapshot(body.value); setNotice('');
    } catch {
      if (!controller.signal.aborted && live.current === expected) setNotice('暂时无法核对这次确认，请重新读取。');
    }
  }, [path, projectId, conversationId]);
  useEffect(() => {
    setSnapshot(undefined); setNotice(''); void read();
    const timer = setInterval(() => { if (document.visibilityState !== 'hidden') void read(); }, 1500);
    return () => { clearInterval(timer); pending.current?.abort(); };
  }, [read]);
  if (!snapshot?.requests.length) return null;
  const expected = projectId + ':' + conversationId;
  return <div data-native-session-permissions>
    {snapshot.requests.map((request: any) => <PermissionTray key={snapshot.messageId + ':' + request.requestId}
      threadId={conversationId} messageId={snapshot.messageId} {...canvasPermissionPresentation(request)}
      onRespond={async (decision: any) => {
        if (live.current !== expected) throw new Error('Conversation changed.');
        const response = await fetch(path, { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messageId: snapshot.messageId, requestId: request.requestId, decision }) });
        const body = await response.json();
        if (!response.ok || body.ok !== true || body.value?.handled !== true || body.value.requestId !== request.requestId)
          throw new Error('Permission result unconfirmed.');
      }}
      onSettled={() => { if (live.current === expected) { void read(); onRefresh(); } }}
      onError={() => { if (live.current === expected) setNotice('回答结果暂未确认，请重新读取；不会自动重发。'); }} />)}
    {notice && <p role="status" className="native-chat-notice">{notice} <button type="button" onClick={() => void read()}>重新读取</button></p>}
  </div>;
}
