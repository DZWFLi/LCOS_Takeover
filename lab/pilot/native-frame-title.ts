import { useEffect, useMemo, useState } from 'react';
import { nativeCanvasGuiReferenceFields } from './native-canvas-gui-markers';

type Row = Record<string, any>;
type Reply = { ok: boolean; reason?: string; pending?: boolean; unknown?: boolean };
type Owner = { projectId: string; canvasId: string; api: Row; nodeId: string; parentId: string | null };
export type NativeFrameTitleState = { value: string; dirty: boolean; busy: boolean; unknown: boolean; notice: string; readOnly: boolean };
const record = (value: unknown): value is Row => !!value && typeof value === 'object' && !Array.isArray(value);
const nonempty = (value: unknown): value is string => typeof value === 'string' && !!value.trim();
const host = (): Row | undefined => typeof window === 'undefined' ? undefined : (window as any).__LCOS_NODE_LAB__;
export function nativeOrdinaryFrameTitleNode(node: unknown): node is Row {
  return record(node) && nonempty(node.id) && node.type === 'group' && record(node.data) && node.data.id === node.id
    && node.data.lcos_ordinary_frame_title === true && !nativeCanvasGuiReferenceFields.some(key => Object.hasOwn(node.data, key));
}
function nodes(api: Row): Row[] { const values = api.getNodes?.(); return Array.isArray(values) ? values : []; }
function live(owner: Owner): Row | undefined {
  const h = host();
  if (!h || h.api !== owner.api || h.projectId !== owner.projectId || (h.currentCanvasId || h.canvasId) !== owner.canvasId) return;
  const values = nodes(owner.api), matches = values.filter(node => node.id === owner.nodeId);
  if (matches.length !== 1 || !nativeOrdinaryFrameTitleNode(matches[0]) || (matches[0].parentId ?? null) !== owner.parentId) return;
  return matches[0];
}
function locked(owner: Owner): boolean {
  const values = nodes(owner.api), seen = new Set<string>(); let node = live(owner);
  if (!node || owner.api.getPointerInteraction?.()?.interactivityLocked === true) return true;
  while (node) {
    if (seen.has(node.id) || node.data?.locked === true || node.draggable === false || node.dragging === true) return true;
    seen.add(node.id); if (node.parentId == null) return false;
    const matches = values.filter(value => value.id === node!.parentId);
    if (matches.length !== 1 || matches[0].type !== 'group') return true;
    node = matches[0];
  }
  return true;
}
function ownerOf(node: Row): Owner | undefined {
  const h = host(), canvasId = h?.currentCanvasId || h?.canvasId;
  if (!nonempty(h?.projectId) || !nonempty(canvasId) || !h?.api) return;
  const owner = { projectId: h.projectId, canvasId, api: h.api, nodeId: node.id, parentId: node.parentId ?? null };
  return live(owner) ? owner : undefined;
}
/** A local input draft only. Canonical names and Undo/Redo stay in the original
 * Group input -> original Canvas API -> O8 -> r6 save owner. */
export function createNativeFrameTitleEditor(owner: Owner | undefined, initialTitle: string,
  changed: (state: NativeFrameTitleState) => void) {
  let active = true, serial = 0, lifetime = 0, expectedTitle = initialTitle, attemptedTitle: string | undefined;
  let expectedLabel: string | null = owner ? live(owner)?.data.label ?? null : null;
  let state: NativeFrameTitleState = { value: initialTitle, dirty: false, busy: false, unknown: false,
    notice: '', readOnly: false };
  const current = () => active && !!owner && !!live(owner);
  const emit = () => { if (active) changed({ ...state }); };
  const protection = () => !current() ? '当前画布已切换，名称未继续保存。'
    : locked(owner!) ? '此框或父框已锁定，当前名称不能修改。' : '';
  function sync(title: string) {
    if (!active) return;
    const reason = protection(); state.readOnly = !!reason || state.busy;
    if (reason) { state.notice = reason; emit(); return; }
    if (state.busy || state.unknown) { emit(); return; }
    if (!state.dirty) { state.value = title; expectedTitle = title; expectedLabel = live(owner!)?.data.label ?? null; state.notice = ''; }
    else if (title !== expectedTitle || (live(owner!)?.data.label ?? null) !== expectedLabel) state.notice = '名称已在别处更新，草稿已保留；Esc 取消后可重新编辑。';
    emit();
  }
  function change(value: string) {
    if (protection() || state.busy) return;
    state.value = value; state.dirty = value !== expectedTitle;
    state.notice = state.unknown ? '保存结果尚未确认，草稿已保留；请先核对画布。'
      : state.dirty ? 'Enter 保存 · Esc 取消' : '';
    emit();
  }
  function cancel() {
    if (!current() || state.busy || state.unknown) return;
    const node = live(owner!); expectedTitle = String(node!.data.title ?? node!.data.label ?? initialTitle);
    expectedLabel = node!.data.label ?? null; state.value = expectedTitle; state.dirty = false; state.notice = ''; emit();
  }
  async function save(): Promise<Reply> {
    const reason = protection();
    if (reason) { if (active) { state.notice = reason; state.readOnly = true; emit(); } return { ok: false, reason }; }
    if (state.busy || state.unknown) return { ok: false, pending: true, unknown: state.unknown, reason: state.notice };
    const value = state.value.trim();
    if (!state.dirty) return { ok: true };
    if (!value || value.length > 500) { state.notice = '框名称需要 1–500 个字，草稿已保留。'; emit(); return { ok: false, reason: state.notice }; }
    if (typeof owner!.api.commitFrameTitle !== 'function') {
      state.notice = '名称保存尚未就绪，草稿已保留。'; emit(); return { ok: false, reason: state.notice };
    }
    const token = ++serial, epoch = lifetime, desired = value, before = expectedTitle;
    attemptedTitle = desired; state.busy = true; state.readOnly = true; state.notice = '正在保存名称…'; emit();
    let result: Reply;
    try {
      result = await owner!.api.commitFrameTitle({ nodeId: owner!.nodeId, title: desired, expectedTitle: before, expectedLabel },
        { isCurrent: () => current() && lifetime === epoch });
    } catch { result = { ok: false, unknown: true, reason: '保存结果尚未确认，草稿已保留；请先核对画布。' }; }
    if (!current() || serial !== token) return { ok: false, reason: '画布已切换，请在原现场核对名称。' };
    state.busy = false; state.readOnly = locked(owner!);
    if (result?.ok === true) {
      expectedTitle = desired; expectedLabel = desired; state.value = desired; state.dirty = false; state.notice = '已保存';
    } else {
      state.unknown = result?.unknown === true || result?.pending === true;
      state.notice = result?.reason || (state.unknown ? '保存结果尚未确认，草稿已保留；请先核对画布。' : '名称未保存，草稿已保留。');
    }
    emit(); return result;
  }
  async function verify(): Promise<Reply> {
    const reason = protection();
    if (reason || !state.unknown || state.busy || typeof owner?.api.verifyFrameTitle !== 'function')
      return { ok: false, reason: reason || '当前没有可核对的名称保存结果。' };
    const token = ++serial, epoch = lifetime; state.busy = true; state.readOnly = true; state.notice = '正在核对名称…'; emit();
    let result: Reply;
    try { result = await owner.api.verifyFrameTitle({ nodeId: owner.nodeId }, { isCurrent: () => current() && lifetime === epoch }); }
    catch { result = { ok: false, unknown: true, reason: '名称结果暂时无法核对，草稿已保留。' }; }
    if (!current() || token !== serial) return { ok: false, reason: '画布已切换，未采用旧核对结果。' };
    state.busy = false; state.readOnly = locked(owner);
    state.unknown = result?.pending === true || result?.unknown === true;
    if (result?.ok === true && attemptedTitle !== undefined && live(owner)?.data.title === attemptedTitle) {
      expectedTitle = attemptedTitle; expectedLabel = live(owner)?.data.label ?? null;
      state.dirty = state.value !== attemptedTitle; state.unknown = false;
      state.notice = state.dirty ? '上一名称已保存，当前草稿尚未保存；Enter 保存 · Esc 取消' : '已保存';
    } else state.notice = result?.reason || '名称状态已有变化，草稿已保留；请核对当前名称。';
    emit(); return result;
  }
  return { getState: () => ({ ...state }), sync, change, cancel, save, verify,
    activate() { if (!active) { active = true; sync(String(owner ? live(owner)?.data.title ?? state.value : state.value)); } },
    dispose() { active = false; ++serial; ++lifetime; if (state.busy) {
      state.busy = false; state.readOnly = false; state.unknown = true;
      state.notice = '保存结果尚未确认，草稿已保留；请先核对画布。';
    } } };
}

/** Always called by the original persistent Aie/h5; returns undefined for every non-Frame
 * so their shipped hl debounce, Collection route and input behavior are intact. */
export function LCOSUseNativeFrameTitleEditor(node: unknown, title: string) {
  const candidate = nativeOrdinaryFrameTitleNode(node), h = host();
  const projectId = h?.projectId, canvasId = h?.currentCanvasId || h?.canvasId, api = h?.api;
  const nodeId = candidate ? node.id : '', parentId = candidate ? node.parentId ?? null : null;
  const [snapshot, setSnapshot] = useState<{ controller: unknown; state: NativeFrameTitleState } | null>(null);
  const controller = useMemo(() => candidate ? createNativeFrameTitleEditor(ownerOf(node), String(title ?? ''), state =>
    setSnapshot({ controller, state })) : undefined, [candidate, nodeId, parentId, projectId, canvasId, api]);
  useEffect(() => { controller?.activate(); return () => controller?.dispose(); }, [controller]);
  useEffect(() => { controller?.sync(String(title ?? '')); }, [controller, title, node]);
  if (!controller) return;
  const state = snapshot?.controller === controller ? snapshot.state : controller.getState();
  return { ...state, onVerify: () => { void controller.verify(); }, onChange: (event: { target: { value: string } }) => controller.change(event.target.value),
    onBlur: () => { void controller.save(); },
    onKeyDown: (event: { key: string; isComposing?: boolean; nativeEvent?: { isComposing?: boolean }; preventDefault(): void; stopPropagation(): void }) => {
      if (event.isComposing || event.nativeEvent?.isComposing) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); controller.cancel(); }
      else if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); void controller.save(); }
    } };
}
