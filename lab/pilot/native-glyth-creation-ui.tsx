import { useEffect, useSyncExternalStore, type ComponentType, type DragEvent } from 'react';
import { RefreshCw } from 'lucide-react';
import { CoreContinuationClient } from '../../lcos/apps/web-gen2/src/backend/continuation';
import { createLcosCoreSession } from '../../lcos/huabu/apps/web/src/lcos/app/lcosCoreClient';
import { createContinuationOperationId } from '../../lcos/huabu/apps/web/src/lcos/professional/conversationContinuationActions';
import { useLcosShellStore } from '../../lcos/huabu/apps/web/src/lcos/shell/lcosShellStore';
import { GlythBodyView } from '../../lcos/huabu/apps/web/src/lcos/ui/glyth/GlythBodyView';
import { appearanceKey, DEFAULT_GLYTH_APPEARANCE, nextGlythAppearance, readGlythAppearance, type GlythAppearance } from '../../lcos/huabu/apps/web/src/lcos/ui/glyth/glythAppearance';
import useCanvasStore from './native-canvas-port';
import { requestNativeConversationView } from './native-task-route';
import { nativeMaterialPlacementPoint, visibleCanvas } from './native-material-placement-client';
import { advanceNativeGlythCreation, type NativeGlythCreation, type NativeGlythCreationResult } from './native-glyth-create';
import './native-glyth-creation.css';

const MIME = 'application/x-lcos-glyth-template';
type State = { candidate?: GlythAppearance; ticket?: NativeGlythCreation; busy?: boolean; dragging?: boolean; result?: NativeGlythCreationResult; notice?: string };
const states = new Map<string, State>(), listeners = new Set<() => void>();
let drag: { key: string; projectId: string; canvasId: string; workspaceId: string; appearance: GlythAppearance; api: any } | undefined;
const keyOf = (projectId: string, canvasId: string) => projectId + ':' + canvasId;
const occupied = () => useCanvasStore.getState().nodes.filter(node => node.type === 'lcos-conversation' || node.data?.lcos_conversation_ref)
  .map(node => readGlythAppearance(node.data?.lcosGlythAppearance) ?? DEFAULT_GLYTH_APPEARANCE);
const storageKey = (key: string) => 'lcos-native-glyth-placement:' + key;
function stateFor(key: string): State {
  let state = states.get(key); if (state) return state;
  let ticket: NativeGlythCreation | undefined;
  try { const saved = JSON.parse(sessionStorage.getItem(storageKey(key)) ?? 'null');
    if (saved && keyOf(saved.projectId, saved.canvasId) === key && typeof saved.workspaceId === 'string'
      && typeof saved.operationId === 'string' && ['codex', 'workbuddy'].includes(saved.provider) && readGlythAppearance(saved.appearance)
      && Number.isFinite(saved.position?.x) && Number.isFinite(saved.position?.y)) ticket = saved;
  } catch { /* An invalid local UI draft is not a Core operation. */ }
  state = { candidate: ticket?.appearance ?? nextGlythAppearance(occupied()), ...(ticket ? { ticket,
    result: { status: 'unconfirmed' as const, message: '上次放置结果待核对，原请求已保留。' } } : {}) };
  states.set(key, state); return state;
}
function update(key: string, patch: Partial<State>) {
  const next = { ...stateFor(key), ...patch }; states.set(key, next);
  try { if (next.ticket) sessionStorage.setItem(storageKey(key), JSON.stringify(next.ticket)); else sessionStorage.removeItem(storageKey(key)); } catch {}
  listeners.forEach(listener => listener());
}
const current = (owner: { projectId: string; canvasId: string; workspaceId: string; api: any }) => {
  const canvas = useCanvasStore.getState(), shell = useLcosShellStore.getState();
  return shell.projectId === owner.projectId && shell.activeWorkspaceId === owner.workspaceId && canvas.canvasId === owner.canvasId && canvas.rfInstance === owner.api;
};
async function json(url: string, body?: unknown) {
  const response = await fetch(url, { method: body === undefined ? 'GET' : 'POST', redirect: 'error',
    headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const data = await response.json();
  if (!response.ok || data.ok === false || typeof data.code === 'number' && data.code !== 0) {
    const error: any = new Error('Original request failed.'); error.code = data.error?.code; throw error;
  }
  return data.value ?? data.data ?? data;
}
async function advance(key: string, owner: { projectId: string; canvasId: string; workspaceId: string; api: any },
  position?: { x: number; y: number }, verifyOnly = false) {
  const state = stateFor(key); if (state.busy || !current(owner)) return;
  update(key, { busy: true, notice: '', result: undefined });
  try {
    let ticket = state.ticket;
    if (!ticket) {
      if (!state.candidate || !position) return;
      const creation = await json('/api/lcos/canvases/' + encodeURIComponent(owner.canvasId) + '/conversation-creation');
      if (!current(owner)) return;
      if (creation.canCreate !== true || !['codex', 'workbuddy'].includes(creation.provider)) { update(key, { notice: '当前没有可用的对话连接，请先检查原对话连接。' }); return; }
      ticket = { projectId: owner.projectId, canvasId: owner.canvasId, workspaceId: owner.workspaceId, provider: creation.provider,
        operationId: createContinuationOperationId('blank_new'), position, appearance: state.candidate };
      update(key, { ticket });
    }
    const target = ticket, prefix = '/api/lcos/canvases/' + encodeURIComponent(ticket.canvasId);
    const session = createLcosCoreSession(), client = new CoreContinuationClient(session.http);
    const result = await advanceNativeGlythCreation(ticket, { client, isCurrent: () => current(owner), changed: () => update(key, { ticket: target }),
      inspect: async conversationId => {
        const canvas = await json('/api/canvas/v1/canvases/' + encodeURIComponent(target.canvasId));
        const matches = canvas.nodes.filter((node: any) => node.data?.lcos_conversation_ref?.connectedConversationId === conversationId);
        if (matches.length > 1) throw new Error('Original binding is ambiguous.');
        const node = matches[0]; if (node && appearanceKey(readGlythAppearance(node.data?.lcosGlythAppearance) ?? DEFAULT_GLYTH_APPEARANCE) !== appearanceKey(target.appearance))
          throw new Error('Original appearance changed.');
        return node;
      },
      place: async conversationId => { await json(prefix + '/conversations:reconcile', { connectedConversationId: conversationId,
        initialPlacement: { position: target.position, appearance: target.appearance } }); },
    }, { verifyOnly });
    if (!current(owner)) return;
    if (result.status === 'placed') {
      const projected = await owner.api.synchronizeConversationProjection({ projectId: target.projectId, canvasId: target.canvasId,
        workspaceId: target.workspaceId, connectedConversationId: result.conversationId,
        operation: { version: 1, operationId: target.operationId, kind: 'create', phase: 'apply' } }, { isCurrent: () => current(owner) });
      if (!projected.ok || !current(owner)) throw new Error('Projection pending.');
      update(key, { ticket: undefined, result: undefined, candidate: nextGlythAppearance(occupied(), target.appearance), notice: '' });
      requestNativeConversationView({ projectId: target.projectId, conversationId: result.conversationId, continuationOperationId: target.operationId });
      window.dispatchEvent(new CustomEvent('lcos-native-glyth-placed', { detail: { canvasId: target.canvasId } }));
    } else update(key, { result });
  } catch (error: any) {
    update(key, { result: { status: 'unconfirmed', message: error?.name === 'AbortError'
      ? '现场已切换，原放置请求保留；回原现场后可核对。' : '放置结果尚未确认，请核对原请求。' } });
  } finally { update(key, { busy: false }); }
}
function ownerFor(canvasId: string) {
  const shell = useLcosShellStore.getState(), canvas = useCanvasStore.getState();
  return canvas.canvasId === canvasId && canvas.status === 'ready' && shell.projectId && shell.activeWorkspaceId && canvas.rfInstance
    ? { projectId: shell.projectId, canvasId, workspaceId: shell.activeWorkspaceId, api: canvas.rfInstance } : undefined;
}
export function NativeGlythCreationHost() {
  useEffect(() => {
    const valid = (event: globalThis.DragEvent) => event.target instanceof Element && !!event.target.closest('.react-flow__pane')
      && !event.target.closest('.react-flow__node,[data-add-node-menu],[data-lcos-native-chat-frame]');
    const over = (event: globalThis.DragEvent) => {
      // The native file receiver also handles pane dragover and can replace
      // dropEffect. Claim only our own live template gesture, as for drop.
      if (drag && current(drag) && valid(event)) { event.preventDefault(); event.stopImmediatePropagation(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'; }
    };
    const drop = (event: globalThis.DragEvent) => {
      const held = drag; drag = undefined;
      if (held) update(held.key, { dragging: false });
      if (!held || !event.dataTransfer?.types.includes(MIME) || !current(held) || !valid(event)) return;
      event.preventDefault(); event.stopImmediatePropagation();
      const position = held.api.screenToFlowPosition?.({ x: event.clientX, y: event.clientY });
      if (position) { update(held.key, { candidate: held.appearance }); void advance(held.key, held, position); }
    };
    const end = () => { if (drag) update(drag.key, { dragging: false }); drag = undefined; };
    document.addEventListener('dragover', over, true); document.addEventListener('drop', drop, true); document.addEventListener('dragend', end, true);
    return () => { end(); document.removeEventListener('dragover', over, true); document.removeEventListener('drop', drop, true); document.removeEventListener('dragend', end, true); };
  }, []); return null;
}
export function LCOSNativeGlythCreationSlot({ canvasId, disabled, onClose, NativeGroup }: {
  canvasId: string; disabled: boolean; onClose(): void; NativeGroup: ComponentType<any>;
}) {
  const projectId = useLcosShellStore(state => state.projectId), canvas = useCanvasStore(state => state);
  const key = keyOf(projectId ?? '', canvasId), state = useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => stateFor(key));
  const occupiedKeys = occupied().map(appearanceKey).join(',');
  useEffect(() => { if (!state.ticket && !state.busy && !state.dragging && state.candidate && occupied().some(item => appearanceKey(item) === appearanceKey(state.candidate!)))
    update(key, { candidate: nextGlythAppearance(occupied(), state.candidate) }); }, [key, occupiedKeys, state.candidate, state.ticket, state.busy, state.dragging]);
  useEffect(() => { const close = (event: Event) => { if ((event as CustomEvent).detail?.canvasId === canvasId) onClose(); };
    window.addEventListener('lcos-native-glyth-placed', close); return () => window.removeEventListener('lcos-native-glyth-placed', close); }, [canvasId, onClose]);
  const blocked = disabled || state.busy || !projectId || canvas.canvasId !== canvasId || !state.candidate;
  const refresh = () => { const candidate = nextGlythAppearance(occupied(), state.candidate);
    if (state.ticket && candidate) state.ticket.appearance = candidate;
    update(key, { candidate, notice: '', ...(state.ticket ? { result: { status: 'recoverable' as const, message: '已换形象，继续放置同一会话。' } } : {}) }); };
  const startDrag = (event: DragEvent) => { const owner = ownerFor(canvasId);
    if (!owner || blocked || state.ticket || !state.candidate) { event.preventDefault(); return; }
    drag = { ...owner, key, appearance: state.candidate }; update(key, { dragging: true }); event.dataTransfer.effectAllowed = 'copy'; event.dataTransfer.setData(MIME, appearanceKey(state.candidate)); };
  const place = () => { const owner = ownerFor(canvasId); if (!owner || blocked || state.ticket) return;
    const bounds = visibleCanvas(), zoom = owner.api.getViewport().zoom;
    const obstacles = [...document.querySelectorAll('.react-flow__node,[data-add-node-menu],.canvas-header-chrome,[data-lcos-surface-dock],[data-library-view="library"],[data-lcos-native-chat-frame]')]
      .map(element => element.getBoundingClientRect()).filter(box => box.width > 0 && box.height > 0);
    const point = bounds && Number.isFinite(zoom) && zoom > 0 ? nativeMaterialPlacementPoint(bounds, { width: 121 * zoom, height: 142 * zoom }, obstacles) : undefined;
    if (point && owner.api.screenToFlowPosition) void advance(key, owner, owner.api.screenToFlowPosition(point));
    else update(key, { notice: '可见画布暂时没有合适空位，可以拖动形象自行选择落点。' }); };
  return <NativeGroup heading={<div className="text-xs">智能体</div>}>
    <div className="native-glyth-staging" data-native-glyth-staging>
      <button type="button" className="native-glyth-candidate" aria-label="添加智能体：拖到画布或点击放置"
        data-native-glyth-candidate={state.candidate ? appearanceKey(state.candidate) : undefined}
        draggable={!blocked && !state.ticket} disabled={!!blocked || !!state.ticket} onDragStart={startDrag} onClick={place}
        onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); if (!event.repeat) place(); } }}>
        {state.candidate && <GlythBodyView appearance={state.candidate} pose="idle" size={54} left={0} top={0} />}
        <span><strong>添加智能体</strong><small>{state.busy ? '正在连接…' : '拖到画布，开始新对话'}</small></span>
      </button>
      <button type="button" className="native-glyth-refresh" aria-label="刷新智能体形象" title="换个形象"
        disabled={!!blocked || state.dragging || !!state.ticket && state.result?.status !== 'recoverable'} onClick={refresh}
        onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); if (!event.repeat) refresh(); } }}><RefreshCw size={15} /></button>
    </div>
    {(state.notice || state.result && state.result.status !== 'placed') && <div className="native-glyth-notice" role="status">
      {state.notice || (state.result as any)?.message}
      {state.ticket && <button type="button" disabled={state.busy} onClick={() => { const owner = ownerFor(canvasId);
        if (owner) void advance(key, owner, undefined, state.result?.status !== 'recoverable'); }}>{state.result?.status === 'recoverable' ? '继续放置' : '核对结果'}</button>}
    </div>}
  </NativeGroup>;
}
