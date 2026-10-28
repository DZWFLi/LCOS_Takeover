import { createContext, useContext, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { createLcosCoreSession } from '../../lcos/huabu/apps/web/src/lcos/app/lcosCoreClient';
import { useLcosShellStore } from '../../lcos/huabu/apps/web/src/lcos/shell/lcosShellStore';
import { useCollaborationSessionStore } from '../../lcos/huabu/apps/web/src/lcos/collaboration/collaborationSessionStore';
import { SqliteBindingStore } from '../../lcos/apps/web-gen2/src/backend/sqliteBindingStore';
import useCanvasStore from './native-canvas-port';
import { createNativeColorPinController, type NativePinActionResult } from './native-colorpin-controller';
import { nativeManagedPinNode, nativePinChoice, nativePinColorKey, nativePinDefaults, type NativePinChoice, type NativePinGroup, type NativePinNode, type NativePinScene } from './native-colorpin-model';
import type { ColorPinDefinitionV0, ColorPinSnapshotV0, SpatialMarkerTargetRefV0 } from '../../lcos/packages/contracts/src/index';
import { mergeNativeColorPinGroups, nativeOrdinaryPinColors, nativeOrdinaryPinNode, type NativeColorPinGroup } from './native-colorpin-groups';
import './native-colorpin-ui.css';

type Controller = ReturnType<typeof createNativeColorPinController>;
export interface NativeColorPinProjection {
  readonly enabled: boolean; readonly projectId: string | null; readonly canvasId: string | null; readonly api: object | null;
  readonly status: 'loading' | 'ready' | 'error'; readonly busy: boolean; readonly needsCheck: boolean; readonly message: string;
  readonly definitions: readonly ColorPinDefinitionV0[]; readonly snapshot: ColorPinSnapshotV0;
  readonly groups: readonly NativeColorPinGroup[]; readonly choices: readonly NativePinChoice[];
  pinsForNode(nodeId: string): NativePinNode | undefined;
  targetForNode(nodeId: string): SpatialMarkerTargetRefV0 | undefined;
  toggleNode(nodeId: string, colorKey: string): Promise<NativePinActionResult>;
  renameDefinition(input: { definitionId: string; label: string; expectedUpdatedAt: string; expectedLabel: string | null }): Promise<NativePinActionResult>;
  createDefinition(input: { color: string; label: string; expectedDefinitionId: null }): Promise<NativePinActionResult>;
  clearCurrentGroup(definitionId: string, options?: { expectedMembershipIds?: readonly string[]; expectedCanvasId?: string; expectedApi?: object }): Promise<NativePinActionResult>;
  clearGroup(group: NativeColorPinGroup): Promise<NativePinActionResult>;
  refresh(): Promise<void>; verifyPending(): Promise<NativePinActionResult>; isCurrent(): boolean;
}
const reject = async (): Promise<NativePinActionResult> => ({ status: 'rejected', message: '当前颜色标记尚未接通。' });
const empty: NativeColorPinProjection = { enabled: false, projectId: null, canvasId: null, api: null, status: 'loading', busy: false, needsCheck: false, message: '',
  definitions: [], snapshot: { definitions: [], memberships: [] }, groups: [], choices: nativePinDefaults,
  pinsForNode: () => undefined, targetForNode: () => undefined, toggleNode: reject, renameDefinition: reject, createDefinition: reject, clearCurrentGroup: reject, clearGroup: reject,
  refresh: async () => {}, verifyPending: reject, isCurrent: () => false };
const Context = createContext<NativeColorPinProjection | null>(null);
function currentScene(): NativePinScene | null {
  const canvas = useCanvasStore.getState(), shell = useLcosShellStore.getState(), api = canvas.rfInstance, host = window.__LCOS_NODE_LAB__;
  if (canvas.status !== 'ready' || !canvas.canvasId || !api || !shell.projectId || !shell.activeWorkspaceId
    || host?.api !== api || host.projectId !== shell.projectId
    || (host.currentCanvasId ?? host.canvasId) !== canvas.canvasId) return null;
  return { projectId: shell.projectId, canvasId: canvas.canvasId, workspaceId: shell.activeWorkspaceId, api, nodes: canvas.nodes,
    surfaceRef: shell.surfaceCanvasId.main === canvas.canvasId ? 'main' : 'workspace:' + shell.activeWorkspaceId };
}

/** Mount once around the original Canvas subtree, not inside every node or a
 * new HUD. The actual typed Core client remains the sole mutation endpoint. */
export function NativeColorPinProvider({ children }: { children: ReactNode }) {
  const canvas = useCanvasStore(state => state);
  const projectId = useLcosShellStore(state => state.projectId), workspaceId = useLcosShellStore(state => state.activeWorkspaceId);
  const session = useMemo(() => createLcosCoreSession(), []);
  const owner = useRef<Controller | null>(null);
  if (!owner.current) owner.current = createNativeColorPinController({ scene: currentScene,
    facts: async scene => {
      const [snapshot, graph, bindings] = await Promise.all([session.colorPins.snapshot(scene.projectId),
        session.projects.getProjectGraph(scene.projectId), new SqliteBindingStore(session.http, scene.projectId).list()]);
      // These are existing project read models. A failed read leaves just its
      // typed species unavailable, rather than inventing an empty identity set
      // or disabling an unrelated material/ordinary-node palette.
      const [conversations, execution] = await Promise.allSettled([
        Promise.resolve().then(() => session.conversations.listConnectedConversations(scene.projectId)),
        Promise.resolve().then(() => session.runs.readExecutionProjection(scene.projectId)),
      ]);
      if (graph?.project.id !== scene.projectId || !Array.isArray(graph.workspaces) || !Array.isArray(graph.scopes))
        throw new Error('Pin project graph unavailable');
      // A child Canvas is a real Core Workspace, not one of the three root
      // surface shortcuts. Adopt its original owner only after exact facts;
      // stale shell Workspace IDs and unknown/foreign canvases stay disabled.
      const owners = graph.workspaces.filter(workspace => workspace.canvasId === scene.canvasId);
      const workspace = owners[0];
      const scopes = workspace ? graph.scopes.filter(scope => scope.id === workspace.scopeId) : [];
      const archived = (value: object | undefined) => value !== undefined && 'archivedAt' in value && !!value.archivedAt;
      if (owners.length !== 1 || workspace?.id !== scene.workspaceId || workspace.projectId !== scene.projectId || archived(workspace)
        || scopes.length !== 1 || scopes[0]?.projectId !== scene.projectId || archived(scopes[0]))
        throw new Error('Pin Workspace owner unavailable');
      const connected = conversations.status === 'fulfilled' && Array.isArray(conversations.value)
        && conversations.value.every(row => row.projectId === scene.projectId) ? conversations.value : undefined;
      const projection = execution.status === 'fulfilled' && execution.value?.projectId === scene.projectId ? execution.value : undefined;
      return { snapshot, graph, bindings, ...(connected ? { connectedConversations: connected } : {}),
        ...(Array.isArray(projection?.runs) ? { runs: projection.runs } : {}),
        ...(Array.isArray(projection?.resultSlots) ? { resultSlots: projection.resultSlots } : {}) };
    }, client: {
      assign: (...args) => session.colorPins.assign(...args), removeMembership: (...args) => session.colorPins.removeMembership(...args),
      ...typeof (session.colorPins as { createDefinition?: unknown }).createDefinition === 'function' ? {
        createDefinition: (project: string, input: { color: string; label: string; expectedDefinitionId: null }) =>
          (session.colorPins as typeof session.colorPins & { createDefinition: (project: string, input: { color: string; label: string; expectedDefinitionId: null }) => Promise<any> }).createDefinition(project, input),
      } : {},
      renameDefinition: async (project, id, input) => {
        const result = await (session.colorPins as typeof session.colorPins & { renameDefinition: (...args: any[]) => Promise<any> }).renameDefinition(project, id, input);
        if (result.definition?.id !== id || result.definition.projectId !== project) throw new Error('Pin rename receipt identity mismatch');
        return result;
      },
    }, ordinary: {
      read: async (scene, nodeId) => {
        const [response, bindings] = await Promise.all([fetch('/api/canvas/v1/canvases/' + encodeURIComponent(scene.canvasId),
          { cache: 'no-store', redirect: 'error' }), new SqliteBindingStore(session.http, scene.projectId).list()]);
        const value = await response.json(), nodes = value?.data?.nodes;
        const found = Array.isArray(nodes) ? nodes.filter(node => node.id === nodeId) : [];
        const node = found[0];
        if (!response.ok || value?.code !== 0 || found.length !== 1 || !nativeOrdinaryPinNode(node)
          || bindings.some(row => row.projectId === scene.projectId && row.canvasId === scene.canvasId && row.spatialKind === 'node' && row.spatialId === nodeId)
          || !Array.isArray(node.data?.color_pins) || nativeOrdinaryPinColors(node.data.color_pins).length !== node.data.color_pins.length)
          throw new Error('Original spatial color identity unavailable');
        return nativeOrdinaryPinColors(node.data.color_pins);
      },
      set: async (scene, nodeId, color, present) => {
        const response = await fetch('/api/lcos/canvases/' + encodeURIComponent(scene.canvasId) + '/gui', { method: 'POST', redirect: 'error',
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'SET_COLOR_PIN', nodeId, color: '#' + color, present }) });
        const value = await response.json();
        if (!response.ok || value?.code !== 0 || value?.data?.status === 'rejected')
          throw Object.assign(new Error('Original spatial color request rejected'), { status: response.ok ? 409 : response.status });
        return value.data;
      },
    }, log: error => console.debug('[native-color-pin]', error) });
  const controller = owner.current;
  const revision = useSyncExternalStore(controller.subscribe, () => controller.read().revision, () => 0);
  useEffect(() => { void controller.refresh(); }, [controller, projectId, canvas.canvasId, canvas.rfInstance, canvas.status, workspaceId]);
  // Local geometry/selection changes only reproject existing facts. Saved GUI
  // fields or exact carrier identity changes may request a quiet readback.
  const guiFields = JSON.stringify(canvas.nodes.map(node => [node.id, node.type, node.data?.id,
    typeof node.data?.lcos_gui_navigation_pin, node.data?.color_pins,
    node.data?.lcos_ref, node.data?.lcos_collection_ref, node.data?.lcos_conversation_ref,
    node.data?.lcos_execution_ref, node.data?.lcos_run_ref, node.data?.lcos_member_ref, node.data?.lcos_result_ref])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
  useEffect(() => { controller.sceneChanged(); }, [controller, canvas.nodes]);
  useEffect(() => { void controller.refresh(); }, [controller, guiFields]);
  useEffect(() => projectId ? useCollaborationSessionStore.getState().watchProjectChanges(projectId,
    () => { void controller.refresh(); }) : undefined, [controller, projectId]);
  const value = useMemo<NativeColorPinProjection>(() => {
    const state = controller.read(), scene = state.scene, snapshot = state.facts?.snapshot ?? empty.snapshot;
    const choices = [...(state.projection?.choices ?? nativePinDefaults)];
    for (const node of scene?.nodes ?? []) if (nativeOrdinaryPinNode(node)) for (const key of nativeOrdinaryPinColors(node.data?.color_pins))
      if (!choices.some(choice => choice.id === key)) choices.push(nativePinChoice(key)!);
    const groups = mergeNativeColorPinGroups(state.projection?.groups ?? [], scene?.nodes ?? [], snapshot.definitions, choices);
    return { enabled: state.enabled, projectId: scene?.projectId ?? null, canvasId: scene?.canvasId ?? null, api: scene?.api ?? null,
      status: state.status, busy: state.busy, needsCheck: state.needsCheck, message: state.message, definitions: snapshot.definitions, snapshot,
      groups, choices,
      pinsForNode: id => state.projection?.byNode.get(id), targetForNode: id => state.projection?.byNode.get(id)?.target,
      toggleNode: controller.toggleNode, renameDefinition: controller.renameDefinition, createDefinition: controller.createDefinition, clearCurrentGroup: controller.clearCurrentGroup,
      clearGroup: async group => {
        const latest = currentScene();
        if (!scene || !latest || latest.api !== scene.api || latest.canvasId !== scene.canvasId || latest.projectId !== scene.projectId)
          return { status: 'rejected', message: '原确认现场已变化，没有移除标记。' };
        const now = mergeNativeColorPinGroups(controller.read().projection?.groups ?? [], latest.nodes,
          controller.read().facts?.snapshot.definitions ?? [], controller.read().projection?.choices ?? nativePinDefaults).find(row => row.groupId === group.groupId);
        const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every(id => b.includes(id));
        if (!now || !same(now.nodeIds, group.nodeIds) || !same(now.membershipIds, group.membershipIds) || !same(now.rawNodeIds, group.rawNodeIds))
          return { status: 'rejected', message: '组内标记已变化，请重新确认范围。' };
        if (group.definitionId && group.membershipIds.length) {
          const result = await controller.clearCurrentGroup(group.definitionId, { expectedCanvasId: scene.canvasId, expectedApi: scene.api, expectedMembershipIds: group.membershipIds });
          if (result.status !== 'confirmed') return result;
        }
        for (const nodeId of group.rawNodeIds) {
          const result = await controller.setOrdinaryNode(nodeId, group.groupId, false);
          if (result.status !== 'confirmed') return result;
        }
        return { status: 'confirmed' };
      },
      refresh: controller.refresh, verifyPending: controller.verifyPending, isCurrent: controller.isCurrent };
  }, [controller, revision, canvas.nodes]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export const useNativeColorPins = (): NativeColorPinProjection => useContext(Context) ?? empty;
export const useOptionalNativeColorPins = (): NativeColorPinProjection | null => useContext(Context);
export const LCOSUseNativeColorPinChoices = (fallback: readonly NativePinChoice[] = nativePinDefaults) => useContext(Context)?.choices ?? fallback;
export const LCOSNativeColorPinChoice = nativePinChoice;
export function LCOSUseNativeColorPinNode(nodeId: string) {
  const controlled = useOptionalNativeColorPins(), port = controlled ?? empty, canvas = useCanvasStore(state => state);
  const node = canvas.nodes.find(node => node.id === nodeId), projected = port.pinsForNode(nodeId);
  const target = projected?.target, managed = nativeManagedPinNode(node), rawPins = nativeOrdinaryPinColors(node?.data?.color_pins);
  const ownPins = projected?.memberships.filter(member => !!target && member.targetRef.projectId === target.projectId
    && member.targetRef.kind === target.kind && member.targetRef.id === target.id)
    .map(member => nativePinColorKey(port.definitions.find(definition => definition.id === member.colorPinId)!.color)!) ?? [];
  const shared = projected?.target?.kind === 'view' && projected.memberships.some(member => member.targetRef.kind === 'entity');
  const scopeNotice = projected?.target?.kind === 'entity' ? '同一对象的其他位置会同步。'
    : shared ? '有共享标记；这里仅修改当前位置。' : '';
  const available = !!node && (managed ? !!target : nativeOrdinaryPinNode(node)) && (port.enabled || port.needsCheck);
  return { managed, controlled: !!controlled, enabled: available,
    pinState: managed ? { pins: projected?.pins ?? [], isPinned: !!projected?.pins.length, primaryGroup: projected?.primaryGroup }
      : { pins: rawPins, isPinned: !!rawPins.length, primaryGroup: nativePinChoice(rawPins.at(-1) ?? '', port.choices) },
    authoringPins: managed ? ownPins : rawPins,
    disabled: port.busy || port.needsCheck || !available || !!node?.dragging || !!node?.data?.locked,
    triggerDisabled: port.busy || !available || !!node?.dragging || !!node?.data?.locked,
    notice: [port.message, scopeNotice].filter(Boolean).join(' '), needsCheck: port.needsCheck, check: port.verifyPending };
}
export function LCOSUseNativeColorPinEnabled(nodeId: string, original: boolean) { return LCOSUseNativeColorPinNode(nodeId).enabled || original; }
export function LCOSUseNativeColorPinCommands() {
  const controlled = useOptionalNativeColorPins(), port = controlled ?? empty;
  return useMemo(() => ({
    toggle(nodeId: string, colorKey: string): boolean {
      if (!port.enabled && !port.needsCheck) return !!controlled || nativeManagedPinNode(useCanvasStore.getState().nodes.find(node => node.id === nodeId));
      void port.toggleNode(nodeId, colorKey); return true;
    },
    clear(groupId: string): boolean {
      const group = port.groups.find(group => group.groupId === groupId);
      if (!port.enabled || !group) return !!controlled || useCanvasStore.getState().nodes.some(nativeManagedPinNode);
      void port.clearGroup(group); return true;
    },
  }), [port, controlled]);
}
export function LCOSUseNativeColorPinGroups(original: readonly any[]) {
  const port = useOptionalNativeColorPins();
  return port ? port.groups : original;
}
/** Reuse the original Popover action area. No extra portal/window or raw IDs. */
export function NativeColorPinNodeStatus({ state }: { state?: ReturnType<typeof LCOSUseNativeColorPinNode> }) {
  if (!state?.controlled || !state.notice && !state.needsCheck) return null;
  return <span className="native-colorpin-node-status flex items-center gap-2 px-1 text-xs leading-5" role="status">
    {state.notice && <span>{state.notice}</span>}
    {state.needsCheck && <button type="button" className="shrink-0 underline underline-offset-2" onClick={() => { void state.check(); }}>核对标记结果</button>}
  </span>;
}
