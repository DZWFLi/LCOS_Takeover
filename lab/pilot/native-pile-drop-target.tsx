import { useEffect, useMemo } from 'react';
import type { RefObject } from 'react';
import useCanvasStore from './native-canvas-port';
import { useLcosDropStore } from '../../lcos/huabu/apps/web/src/lcos/lcosDropState';
import { useLcosReferenceStore, type LcosNodeEntityRef } from '../../lcos/huabu/apps/web/src/lcos/lcosReferenceState';
import { useLcosShellStore } from '../../lcos/huabu/apps/web/src/lcos/shell/lcosShellStore';
import { nodeMembershipDropSemantic } from '../../lcos/huabu/apps/web/src/lcos/nodes/nodeMembershipDropTarget';
import { isDropPointExposed } from '../../lcos/huabu/apps/web/src/lcos/drop/dropOcclusion';
import { rectFromDomRect } from '../../lcos/huabu/apps/web/src/lcos/drop/dropTargetRegistry';
import type { DropTargetRegistration } from '../../lcos/huabu/apps/web/src/lcos/drop/dropTypes';

interface Props {
  readonly elementRef: RefObject<HTMLElement | null>;
  readonly nodeId: string;
  readonly data: Readonly<Record<string, unknown>>;
  readonly confirmedCollection?: Readonly<Record<string, unknown>>;
}
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && !!value.trim();

/** Loaded from agent-ui, never bundled into the independent pile module.
 * The original pile shell supplies its already-verified Core read/binding. */
export function NativePileDropTarget({ elementRef, nodeId, data, confirmedCollection }: Props): null {
  const canvasId = useCanvasStore(state => state.canvasId);
  const api = useCanvasStore(state => state.rfInstance);
  const projectId = useLcosShellStore(state => state.projectId);
  const workspaceId = useLcosShellStore(state => state.activeWorkspaceId);
  const referenceProjectId = useLcosReferenceStore(state => state.projectId);
  const saved = record(data.lcos_collection_ref) ? data.lcos_collection_ref : undefined;
  const collectionId = saved?.collectionId;
  const confirmed = text(collectionId) && saved?.projectId === projectId && saved.canvasId === canvasId
    && saved.workspaceId === workspaceId && confirmedCollection?.id === collectionId
    && confirmedCollection.projectId === projectId && referenceProjectId === projectId;
  const desired = useMemo<LcosNodeEntityRef | undefined>(() => confirmed
    ? { entityType: 'collection', entityId: collectionId as string } : undefined, [confirmed, collectionId]);

  useEffect(() => {
    const element = elementRef.current?.closest<HTMLElement>('.react-flow__node');
    if (!element?.isConnected || element.dataset.id !== nodeId || !saved || !text(collectionId) || !api) return;
    const current = () => {
      const canvas = useCanvasStore.getState(), shell = useLcosShellStore.getState();
      const node = canvas.nodes.find(value => value.id === nodeId), ref = node?.data?.lcos_collection_ref;
      return confirmed && canvas.status === 'ready' && canvas.rfInstance === api && canvas.canvasId === canvasId
        && shell.projectId === projectId && shell.activeWorkspaceId === workspaceId
        && record(ref) && ref.projectId === projectId && ref.canvasId === canvasId
        && ref.workspaceId === workspaceId && ref.collectionId === collectionId
        && node?.dragging !== true && node?.data?.locked !== true;
    };
    const readRect = () => {
      if (!element.isConnected) return undefined;
      const rect = rectFromDomRect(element.getBoundingClientRect());
      return rect.width > 0 && rect.height > 0 ? rect : undefined;
    };
    const initial = readRect();
    if (!initial) return;
    const semantics = desired ? nodeMembershipDropSemantic(desired) : undefined;
    const registration: DropTargetRegistration = {
      targetId: 'node-membership:' + nodeId, nodeId, kind: semantics?.kind ?? 'drop-exclusion',
      label: text(confirmedCollection?.title) ? confirmedCollection.title : '集合',
      rect: initial, readRect, acceptsPoint: point => isDropPointExposed(element, point), priority: 30,
      get enabled() { return current() && !!semantics; },
      get ineligibleReason() { return current() ? undefined : '集合正在确认原现场，材料保留。'; },
      semantic: semantics ?? { kind: 'drop-exclusion', reason: '集合身份尚未确认，材料保留。' },
    };
    const release = useLcosDropStore.getState().registerTarget(registration);
    const references = useLcosReferenceStore.getState();
    let owned: LcosNodeEntityRef | undefined;
    if (desired && current()) {
      const previous = references.nodeEntityRefs.get(nodeId);
      if (!previous) { owned = desired; references.registerNodeEntity(nodeId, owned); }
    }
    return () => {
      release();
      if (owned && useLcosReferenceStore.getState().nodeEntityRefs.get(nodeId) === owned) {
        useLcosReferenceStore.getState().forgetNode(nodeId);
      }
    };
  }, [elementRef, nodeId, desired, confirmed, api, canvasId, projectId, workspaceId, collectionId, confirmedCollection?.title]);
  return null;
}
