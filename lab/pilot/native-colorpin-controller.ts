import type { ColorPinSnapshotV0, SpatialMarkerTargetRefV0 } from '../../lcos/packages/contracts/src/index';
import type { CoreColorPinClient } from '../../lcos/apps/web-gen2/src/backend/colorPins';
import { projectNativePins, nativePinNodeIdentity, nativePinColorKey, type NativePinFacts, type NativePinScene } from './native-colorpin-model';

type Scene = NativePinScene;
export type NativePinActionResult = { status: 'confirmed' | 'unknown' | 'rejected'; message?: string };
type Attempt = { scene: Scene; nodeId?: string; target?: SpatialMarkerTargetRefV0; color?: string; membershipId?: string;
  definitionId?: string; label?: string; kind: 'assign' | 'remove' | 'rename' };
export interface NativePinClient extends Pick<CoreColorPinClient, 'assign' | 'removeMembership'> {
  renameDefinition(projectId: string, definitionId: string, input: { label: string; expectedUpdatedAt: string; expectedLabel: string | null }): Promise<any>;
}
export interface NativePinControllerPorts {
  scene(): Scene | null;
  facts(scene: Scene): Promise<NativePinFacts>;
  client: NativePinClient;
  log?(error: unknown): void;
}
const samePlace = (a: Scene | null, b: Scene | null) => !!a && !!b && a.projectId === b.projectId && a.canvasId === b.canvasId
  && a.workspaceId === b.workspaceId;
const sameScene = (a: Scene | null, b: Scene | null) => samePlace(a, b) && a!.api === b!.api;
const sameTarget = (a?: SpatialMarkerTargetRefV0, b?: SpatialMarkerTargetRefV0) => !!a && !!b && a.projectId === b.projectId && a.kind === b.kind && a.id === b.id;
const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every(value => b.includes(value));

/** One transient Core read projection and pending HTTP outcomes for the native
 * UI. It never owns a Pin/membership writer, Canvas data or a second history. */
export function createNativeColorPinController(ports: NativePinControllerPorts) {
  let state = { scene: null as Scene | null, facts: null as NativePinFacts | null, status: 'loading' as 'loading' | 'ready' | 'error', message: '' };
  let generation = 0, revision = 0;
  let checkingScene: Scene | null = null;
  const listeners = new Set<() => void>(), active: Attempt[] = [], pending: Attempt[] = [];
  const emit = () => { revision++; for (const listener of listeners) listener(); };
  const current = (scene: Scene) => sameScene(scene, ports.scene());
  const held = (scene: Scene) => pending.filter(attempt => samePlace(attempt.scene, scene));
  const working = (scene: Scene) => active.some(attempt => samePlace(attempt.scene, scene));
  const result = (status: NativePinActionResult['status'], message?: string): NativePinActionResult => ({ status, ...(message ? { message } : {}) });
  function message(scene: Scene, value: string) { if (current(scene)) { state = { ...state, message: value }; emit(); } }
  async function read(scene: Scene) {
    const facts = await ports.facts(scene);
    if (!current(scene)) throw new Error('Pin scene changed during read');
    projectNativePins(ports.scene()!, facts); // validate all canonical identities before adoption
    return facts;
  }
  const adopt = (scene: Scene, facts: NativePinFacts) => { if (current(scene)) { state = { ...state, scene: ports.scene(), facts, status: 'ready' }; emit(); } };
  async function refresh(): Promise<void> {
    const scene = ports.scene();
    if (scene && (working(scene) || sameScene(checkingScene, scene))) return;
    const turn = ++generation;
    if (!scene) { state = { scene: null, facts: null, status: 'loading', message: '' }; emit(); return; }
    if (!sameScene(state.scene, scene)) state = { scene, facts: null, status: 'loading', message: '' };
    emit();
    try { const facts = await read(scene); if (turn === generation && current(scene)) adopt(scene, facts); }
    catch (error) { ports.log?.(error); if (turn === generation && current(scene)) { state = { ...state, status: 'error', message: '颜色标记暂时无法读取，请重新核对。' }; emit(); } }
  }
  function observable() {
    const scene = ports.scene(), owned = sameScene(state.scene, scene), facts = owned ? state.facts : null;
    const projection = scene && facts ? projectNativePins(scene, facts) : null;
    return { revision, scene, facts, projection, status: owned ? state.status : 'loading' as const,
      busy: !!scene && (working(scene) || sameScene(checkingScene, scene)), needsCheck: !!scene && held(scene).length > 0,
      message: owned ? state.message : '', enabled: !!scene && state.status === 'ready' && !!projection };
  }
  function targetStill(scene: Scene, nodeId: string, target: SpatialMarkerTargetRefV0, facts: NativePinFacts) {
    const live = ports.scene(), node = live?.nodes.find(node => node.id === nodeId);
    return current(scene) && !!live && !!node && !node.dragging && !node.data?.locked
      && sameTarget(nativePinNodeIdentity(node, live, facts).target, target);
  }
  async function confirmed(attempt: Attempt, facts: NativePinFacts): Promise<boolean> {
    const snapshot = facts.snapshot;
    if (attempt.kind === 'assign') return snapshot.memberships.some(member => sameTarget(member.targetRef, attempt.target)
      && snapshot.definitions.some(definition => definition.id === member.colorPinId && nativePinColorKey(definition.color) === attempt.color));
    if (attempt.kind === 'remove') return !snapshot.memberships.some(member => member.id === attempt.membershipId);
    return snapshot.definitions.some(definition => definition.id === attempt.definitionId && definition.label === attempt.label);
  }
  async function perform(attempt: Attempt, mutate: () => Promise<unknown>): Promise<NativePinActionResult> {
    if (!current(attempt.scene)) return result('rejected', '现场已切换，没有修改其他画布的标记。');
    if (working(attempt.scene) || sameScene(checkingScene, attempt.scene) || held(attempt.scene).length) return result('rejected', '上一笔标记还在确认，请先核对结果。');
    generation += 1; // a read begun before this write cannot replace its readback
    active.push(attempt); message(attempt.scene, '');
    let sent = false, mutationAccepted = false;
    try {
      if (!current(attempt.scene)) return result('rejected', '现场已切换，没有修改标记。');
      sent = true; await mutate(); mutationAccepted = true;
      const facts = await read(attempt.scene);
      if (!await confirmed(attempt, facts)) throw new Error('Pin mutation postcondition not yet confirmed');
      adopt(attempt.scene, facts); message(attempt.scene, attempt.kind === 'remove' ? '已移除颜色标记' : attempt.kind === 'rename' ? '颜色组名称已保存' : '已添加颜色标记');
      return result('confirmed');
    } catch (error) {
      ports.log?.(error);
      // The original transactional Core explicitly rejected these requests.
      // A stale CAS is not an unknown commit and must not hold the UI forever.
      const status = typeof error === 'object' && error !== null ? (error as { status?: unknown }).status : undefined;
      if (sent && !mutationAccepted && typeof status === 'number' && [400, 401, 403, 404, 409, 422].includes(status)) {
        try { adopt(attempt.scene, await read(attempt.scene)); } catch (readError) { ports.log?.(readError); }
        const notice = status === 409 ? '标记刚有变化，请按最新结果再选择。' : '这次标记修改未被接收，原记录保留，请重新核对。';
        message(attempt.scene, notice); return result('rejected', notice);
      }
      if (sent && !pending.includes(attempt)) pending.push(attempt);
      message(attempt.scene, '标记结果尚未确认，请核对；不会自动重复修改。');
      return result(sent ? 'unknown' : 'rejected', '标记结果尚未确认，请核对；不会自动重复修改。');
    } finally { const index = active.indexOf(attempt); if (index >= 0) active.splice(index, 1); emit(); }
  }
  async function toggleNode(nodeId: string, color: string): Promise<NativePinActionResult> {
    const initial = observable(), scene = initial.scene;
    if (!scene || !initial.enabled || initial.busy || initial.needsCheck || !/^[0-9A-F]{6}$/.test(color)) return result('rejected', '当前标记暂不可修改，请先核对。');
    const target = initial.projection?.byNode.get(nodeId)?.target;
    if (!target) return result('rejected', '这张材料的原位置尚未确认，没有修改标记。');
    try {
      const facts = await read(scene);
      if (!targetStill(scene, nodeId, target, facts)) return result('rejected', '材料或现场已变化，没有修改标记。');
      const live = ports.scene()!, next = projectNativePins(live, facts).byNode.get(nodeId);
      // Entity Pins are read echoes, never converted/deleted by the View toggle.
      const membership = next?.memberships.find(member => sameTarget(member.targetRef, target)
        && facts.snapshot.definitions.some(definition => definition.id === member.colorPinId && nativePinColorKey(definition.color) === color));
      const before = initial.projection?.byNode.get(nodeId)?.memberships.filter(member => sameTarget(member.targetRef, target)).map(member => member.id) ?? [];
      const now = next?.memberships.filter(member => sameTarget(member.targetRef, target)).map(member => member.id) ?? [];
      if (!sameSet(before, now)) { adopt(scene, facts); return result('rejected', '标记刚有变化，请按最新色点再选择。'); }
      const attempt: Attempt = { scene, nodeId, target, color, ...(membership ? { kind: 'remove', membershipId: membership.id } : { kind: 'assign' }) };
      const definition = facts.snapshot.definitions.find(value => nativePinColorKey(value.color) === color);
      return perform(attempt, () => {
        if (!targetStill(scene, nodeId, target, facts)) throw new Error('Pin target owner changed before dispatch');
        return membership ? ports.client.removeMembership(scene.projectId, membership.id)
          : ports.client.assign(scene.projectId, { targetRef: target, ...(definition ? { colorPinId: definition.id } : { color: '#' + color }) });
      });
    } catch (error) { ports.log?.(error); message(scene, '材料标记暂时无法核对，没有提交修改。'); return result('rejected', '材料标记暂时无法核对，没有提交修改。'); }
  }
  async function verifyPending(): Promise<NativePinActionResult> {
    const scene = ports.scene();
    if (!scene || working(scene) || sameScene(checkingScene, scene)) return result('rejected', '请等待当前标记操作完成。');
    checkingScene = scene; generation += 1; emit();
    const attempts = held(scene);
    try {
      const facts = await read(scene);
      for (const attempt of attempts) if (await confirmed(attempt, facts)) { const index = pending.indexOf(attempt); if (index >= 0) pending.splice(index, 1); }
      adopt(scene, facts);
      if (held(scene).length) { message(scene, '标记结果还没确认，本次只读取记录，没有重复修改。'); return result('unknown'); }
      message(scene, attempts.length ? '标记结果已核对' : '颜色标记已更新'); return result('confirmed');
    } catch (error) { ports.log?.(error); message(scene, '暂时无法核对标记，原记录保留，请稍后再试。'); return result('unknown'); }
    finally { if (checkingScene === scene) checkingScene = null; emit(); }
  }
  async function renameDefinition(input: { definitionId: string; label: string; expectedUpdatedAt: string; expectedLabel: string | null }): Promise<NativePinActionResult> {
    const scene = ports.scene();
    if (!scene || working(scene) || held(scene).length) return result('rejected', '请先核对当前标记操作。');
    const label = input.label.trim(); if (!label || label.length > 500) return result('rejected', '名称请填写 1–500 个字。');
    try {
      const facts = await read(scene), definition = facts.snapshot.definitions.find(value => value.id === input.definitionId);
      if (!definition || definition.updatedAt !== input.expectedUpdatedAt || (definition.label ?? null) !== input.expectedLabel)
        return result('rejected', '颜色组名称已更新，请重新读取后再改。');
      return perform({ scene, kind: 'rename', definitionId: input.definitionId, label }, () => ports.client.renameDefinition(scene.projectId, input.definitionId,
        { label, expectedUpdatedAt: input.expectedUpdatedAt, expectedLabel: input.expectedLabel }));
    } catch (error) { ports.log?.(error); return result('rejected', '颜色组暂时无法核对，没有改名。'); }
  }
  async function clearCurrentGroup(definitionId: string, options: { expectedMembershipIds?: readonly string[]; expectedCanvasId?: string; expectedApi?: object } = {}): Promise<NativePinActionResult> {
    const scene = ports.scene(), initial = observable();
    if (!scene || working(scene) || held(scene).length || options.expectedCanvasId !== undefined && options.expectedCanvasId !== scene.canvasId
      || options.expectedApi !== undefined && options.expectedApi !== scene.api) return result('rejected', '原确认现场已变化，没有移除标记。');
    try {
      const facts = await read(scene), group = projectNativePins(ports.scene()!, facts).groups.find(group => group.definitionId === definitionId);
      const expected = options.expectedMembershipIds ?? initial.projection?.groups.find(group => group.definitionId === definitionId)?.membershipIds ?? [];
      if (!group || !sameSet(expected, group.membershipIds)) return result('rejected', '组内标记已变化，请重新确认要移除的范围。');
      for (const membershipId of expected) {
        if (!current(scene)) return result('rejected', '现场已切换，未继续移除其他标记。');
        const latest = await read(scene), currentGroup = projectNativePins(ports.scene()!, latest).groups.find(group => group.definitionId === definitionId);
        const remaining = expected.filter(id => latest.snapshot.memberships.some(member => member.id === id));
        if (!sameSet(remaining, currentGroup?.membershipIds ?? [])) return result('rejected', '组内标记已变化，已移除结果保留；请重新确认余下范围。');
        if (!remaining.includes(membershipId)) continue;
        const membership = latest.snapshot.memberships.find(member => member.id === membershipId)!;
        const outcome = await perform({ scene, kind: 'remove', membershipId, target: membership.targetRef }, () => ports.client.removeMembership(scene.projectId, membershipId));
        if (outcome.status !== 'confirmed') return outcome;
      }
      return result('confirmed');
    } catch (error) { ports.log?.(error); return result('rejected', '组内标记暂时无法核对，没有继续移除。'); }
  }
  const reportAction = <Args extends any[]>(method: (...args: Args) => Promise<NativePinActionResult>) => async (...args: Args) => {
    const scene = ports.scene(), outcome = await method(...args);
    if (scene && outcome.message && current(scene)) message(scene, outcome.message);
    return outcome;
  };
  return { read: observable, refresh, toggleNode: reportAction(toggleNode), verifyPending,
    renameDefinition: reportAction(renameDefinition), clearCurrentGroup: reportAction(clearCurrentGroup),
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    sceneChanged() { emit(); }, isCurrent: () => sameScene(state.scene, ports.scene()) };
}
