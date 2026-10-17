import { createContext, useContext, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { createLcosCoreSession } from '../../lcos/huabu/apps/web/src/lcos/app/lcosCoreClient';
import { useLcosShellStore } from '../../lcos/huabu/apps/web/src/lcos/shell/lcosShellStore';
import { useCollaborationSessionStore } from '../../lcos/huabu/apps/web/src/lcos/collaboration/collaborationSessionStore';
import { SqliteBindingStore } from '../../lcos/apps/web-gen2/src/backend/sqliteBindingStore';
import useCanvasStore from './native-canvas-port';
import { createNativeColorPinController, type NativePinActionResult } from './native-colorpin-controller';
import { nativeManagedPinNode, nativePinChoice, nativePinColorKey, nativePinDefaults, type NativePinChoice, type NativePinGroup, type NativePinNode, type NativePinScene } from './native-colorpin-model';
import type { ColorPinDefinitionV0, ColorPinSnapshotV0, SpatialMarkerTargetRefV0 } from '../../lcos/packages/contracts/src/index';
import './native-colorpin-ui.css';

type Controller = ReturnType<typeof createNativeColorPinController>;
export interface NativeColorPinProjection {
  readonly enabled: boolean; readonly projectId: string | null; readonly canvasId: string | null; readonly api: object | null;
  readonly status: 'loading' | 'ready' | 'error'; readonly busy: boolean; readonly needsCheck: boolean; readonly message: string;
  readonly definitions: readonly ColorPinDefinitionV0[]; readonly snapshot: ColorPinSnapshotV0;
  readonly groups: readonly NativePinGroup[]; readonly choices: readonly NativePinChoice[];
  pinsForNode(nodeId: string): NativePinNode | undefined;
  targetForNode(nodeId: string): SpatialMarkerTargetRefV0 | undefined;
  toggleNode(nodeId: string, colorKey: string): Promise<NativePinActionResult>;
  renameDefinition(input: { definitionId: string; label: string; expectedUpdatedAt: string; expectedLabel: string | null }): Promise<NativePinActionResult>;
  clearCurrentGroup(definitionId: string, options?: { expectedMembershipIds?: readonly string[]; expectedCanvasId?: string; expectedApi?: object }): Promise<NativePinActionResult>;
  refresh(): Promise<void>; verifyPending(): Promise<NativePinActionResult>; isCurrent(): boolean;
}
const reject = async (): Promise<NativePinActionResult> => ({ status: 'rejected', message: '当前颜色标记尚未接通。' });
const empty: NativeColorPinProjection = { enabled: false, projectId: null, canvasId: null, api: null, status: 'loading', busy: false, needsCheck: false, message: '',
  definitions: [], snapshot: { definitions: [], memberships: [] }, groups: [], choices: nativePinDefaults,
  pinsForNode: () => undefined, targetForNode: () => undefined, toggleNode: reject, renameDefinition: reject, clearCurrentGroup: reject,
  refresh: async () => {}, verifyPending: reject, isCurrent: () => false };
const Context = createContext<NativeColorPinProjection | null>(null);
function currentScene(): NativePinScene | null {
  const canvas = useCanvasStore.getState(), shell = useLcosShellStore.getState(), api = canvas.rfInstance;
  if (canvas.status !== 'ready' || !canvas.canvasId || !api || !shell.projectId || !shell.activeWorkspaceId
    || shell.surfaceCanvasId[shell.activeSurface] !== canvas.canvasId || window.__LCOS_NODE_LAB__?.api !== api) return null;
  return { projectId: shell.projectId, canvasId: canvas.canvasId, workspaceId: shell.activeWorkspaceId, api, nodes: canvas.nodes,
    surfaceRef: shell.activeSurface === 'main' ? 'main' : 'workspace:' + shell.activeWorkspaceId };
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
      if (!graph) throw new Error('Pin project graph unavailable');
      return { snapshot, graph, bindings };
    }, client: {
      assign: (...args) => session.colorPins.assign(...args), removeMembership: (...args) => session.colorPins.removeMembership(...args),
      renameDefinition: async (project, id, input) => {
        const result = await (session.colorPins as typeof session.colorPins & { renameDefinition: (...args: any[]) => Promise<any> }).renameDefinition(project, id, input);
        if (result.definition?.id !== id || result.definition.projectId !== project) throw new Error('Pin rename receipt identity mismatch');
        return result;
      },
    }, log: error => console.debug('[native-color-pin]', error) });
  const controller = owner.current;
  const revision = useSyncExternalStore(controller.subscribe, () => controller.read().revision, () => 0);
  useEffect(() => { void controller.refresh(); }, [controller, projectId, canvas.canvasId, canvas.rfInstance, workspaceId]);
  useEffect(() => { controller.sceneChanged(); }, [controller, canvas.nodes]);
  useEffect(() => projectId ? useCollaborationSessionStore.getState().watchProjectChanges(projectId,
    () => { void controller.refresh(); }) : undefined, [controller, projectId]);
  const value = useMemo<NativeColorPinProjection>(() => {
    const state = controller.read(), scene = state.scene, snapshot = state.facts?.snapshot ?? empty.snapshot;
    return { enabled: state.enabled, projectId: scene?.projectId ?? null, canvasId: scene?.canvasId ?? null, api: scene?.api ?? null,
      status: state.status, busy: state.busy, needsCheck: state.needsCheck, message: state.message, definitions: snapshot.definitions, snapshot,
      groups: state.projection?.groups ?? [], choices: state.projection?.choices ?? nativePinDefaults,
      pinsForNode: id => state.projection?.byNode.get(id), targetForNode: id => state.projection?.byNode.get(id)?.target,
      toggleNode: controller.toggleNode, renameDefinition: controller.renameDefinition, clearCurrentGroup: controller.clearCurrentGroup,
      refresh: controller.refresh, verifyPending: controller.verifyPending, isCurrent: controller.isCurrent };
  }, [controller, revision, canvas.nodes]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export const useNativeColorPins = (): NativeColorPinProjection => useContext(Context) ?? empty;
export const useOptionalNativeColorPins = (): NativeColorPinProjection | null => useContext(Context);
export const LCOSUseNativeColorPinChoices = (fallback: readonly NativePinChoice[] = nativePinDefaults) => useContext(Context)?.choices ?? fallback;
export const LCOSNativeColorPinChoice = nativePinChoice;
export function LCOSUseNativeColorPinNode(nodeId: string) {
  const port = useNativeColorPins(), canvas = useCanvasStore(state => state);
  const node = canvas.nodes.find(node => node.id === nodeId), projected = port.pinsForNode(nodeId);
  const ownPins = projected?.memberships.filter(member => member.targetRef.kind === 'view' && member.targetRef.id === projected.target?.id)
    .map(member => nativePinColorKey(port.definitions.find(definition => definition.id === member.colorPinId)!.color)!) ?? [];
  const shared = projected?.memberships.some(member => member.targetRef.kind === 'entity');
  return { managed: nativeManagedPinNode(node), enabled: !!projected?.target && (port.enabled || port.needsCheck),
    pinState: { pins: projected?.pins ?? [], isPinned: !!projected?.pins.length, primaryGroup: projected?.primaryGroup },
    authoringPins: ownPins,
    disabled: port.busy || port.needsCheck || !projected?.target || !!node?.dragging || !!node?.data?.locked,
    triggerDisabled: port.busy || !projected?.target || !!node?.dragging || !!node?.data?.locked,
    notice: port.message || (shared ? '有共享标记；这里仅修改当前位置。' : ''), needsCheck: port.needsCheck, check: port.verifyPending };
}
export function LCOSUseNativeColorPinEnabled(nodeId: string, original: boolean) { return LCOSUseNativeColorPinNode(nodeId).enabled || original; }
export function LCOSUseNativeColorPinCommands() {
  const port = useNativeColorPins();
  return useMemo(() => ({
    toggle(nodeId: string, colorKey: string): boolean {
      if (!nativeManagedPinNode(useCanvasStore.getState().nodes.find(node => node.id === nodeId))) return false;
      void port.toggleNode(nodeId, colorKey); return true;
    },
    clear(groupId: string): boolean {
      const group = port.groups.find(group => group.groupId === groupId);
      if (!port.enabled || !group) return useCanvasStore.getState().nodes.some(nativeManagedPinNode);
      void port.clearCurrentGroup(group.definitionId, { expectedCanvasId: port.canvasId ?? undefined, expectedApi: port.api ?? undefined,
        expectedMembershipIds: group.membershipIds }); return true;
    },
  }), [port]);
}
export function LCOSUseNativeColorPinGroups(original: readonly any[]) {
  const port = useOptionalNativeColorPins();
  return port ? port.groups : original;
}
/** Reuse the original Popover action area. No extra portal/window or raw IDs. */
export function NativeColorPinNodeStatus({ state }: { state?: ReturnType<typeof LCOSUseNativeColorPinNode> }) {
  if (!state?.managed || !state.notice && !state.needsCheck) return null;
  return <span className="native-colorpin-node-status flex items-center gap-2 px-1 text-xs leading-5" role="status">
    {state.notice && <span>{state.notice}</span>}
    {state.needsCheck && <button type="button" className="shrink-0 underline underline-offset-2" onClick={() => { void state.check(); }}>核对标记结果</button>}
  </span>;
}
