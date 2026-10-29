import { getAbsolutePosition } from '@huabu/shared/canvas-engine';

import { draftReferenceForGesture, type PresentedReference } from '../composer/referenceSnapshot';

import type { DropCollectionMembershipIntent, DropCommitReceipt, DropPayload } from './dropTypes';
import type { CanvasDropNode, NativeCanvasDropSource, CanvasDropScope } from './nativeCanvasDrop';
import type { Node } from '@xyflow/react';

export interface NativeDropRef extends PresentedReference {
  readonly descriptor?: NonNullable<PresentedReference['descriptor']> & { readonly sourceKind?: string };
}

/** Snapshot from native geometry + the EXISTING authoritative-binding cache. */
export function snapshotCanvasDropNodes(
  ids: readonly string[], nodes: readonly Node[], refs: ReadonlyMap<string, NativeDropRef>, sourceCanvasId?: string,
): CanvasDropNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return ids.flatMap((nodeId) => {
    const node = byId.get(nodeId);
    const absolutePosition = getAbsolutePosition(nodes as Node[], nodeId);
    if (!node || !absolutePosition) return [];
    const ref = refs.get(nodeId);
    const nativeText: NonNullable<CanvasDropNode['reference']>['nativeText'] = !ref && (node.type === 'note' || node.type === 'text') && node.data.contentMissing !== true
      && typeof node.data.content === 'string' ? { nodeType: node.type, body: node.data.content } : undefined;
    const nativeImage = !ref && node.type === 'image' && node.data.contentMissing !== true && typeof node.data.src === 'string'
      && node.data.src.trim() && sourceCanvasId
      ? { src: node.data.src, canvasId: sourceCanvasId } : undefined;
    const descriptor = ref?.descriptor;
    const sourceKind = descriptor?.sourceKind;
    // Scope kind is already read from Core by the projection owner. Capture it
    // before the ordinary draft serializer strips presentation-only facts.
    const sourceRef = ref?.entityType === 'scope' && descriptor?.entityType === 'scope'
      && descriptor.entityId === ref.entityId && (sourceKind === 'context' || sourceKind === 'workflow')
      ? Object.freeze({ kind: sourceKind, id: ref.entityId }) : undefined;
    return [{ nodeId, position: { ...node.position }, absolutePosition: { ...absolutePosition },
      ...(node.parentId === undefined ? {} : { parentId: node.parentId }),
      ...(ref === undefined ? nativeText ? { reference: { entityType: 'native-text', entityId: nodeId, nativeText } }
        : nativeImage ? { reference: { entityType: 'native-image', entityId: nodeId, nativeImage } } : {}
        : { reference: { ...draftReferenceForGesture(ref), ...(sourceRef ? { sourceRef } : {}) } }),
    }];
  });
}

export function sameCanvasDropNode(a: CanvasDropNode, b: CanvasDropNode | undefined): boolean {
  return b !== undefined && a.nodeId === b.nodeId && a.parentId === b.parentId
    && a.reference?.entityType === b.reference?.entityType && a.reference?.entityId === b.reference?.entityId
    && a.reference?.artifactViewId === b.reference?.artifactViewId
    && a.reference?.revisionId === b.reference?.revisionId
    && a.reference?.mode === b.reference?.mode
    && a.reference?.sourceRef?.kind === b.reference?.sourceRef?.kind
    && a.reference?.sourceRef?.id === b.reference?.sourceRef?.id
    && a.reference?.nativeText?.nodeType === b.reference?.nativeText?.nodeType
    && a.reference?.nativeText?.body === b.reference?.nativeText?.body
    && a.reference?.nativeImage?.src === b.reference?.nativeImage?.src
    && a.reference?.nativeImage?.canvasId === b.reference?.nativeImage?.canvasId
    && a.position.x === b.position.x && a.position.y === b.position.y
    && a.absolutePosition.x === b.absolutePosition.x && a.absolutePosition.y === b.absolutePosition.y;
}

/** After a MATCHING positive canonical receipt, place only the successful,
 * still-unmodified sources. No Core undo/retry, no stale geometry overwrite.
 */
export function planNativeCanvasLanding(
  source: NativeCanvasDropSource,
  intent: DropCollectionMembershipIntent,
  receipt: DropCommitReceipt,
  scope: CanvasDropScope,
  nodes: readonly Node[],
  refs: ReadonlyMap<string, NativeDropRef>,
  collapsed: ReadonlySet<string>,
  preparedMaterials?: ReadonlyMap<string, Extract<DropPayload, {kind:'objects'}>['objects'][number]>,
) {
  const landing = source.landing;
  const empty = { items: [] as { nodeId: string; position: { x: number; y: number } }[], skipped: true };
  if (!landing || source.scope.projectId !== scope.projectId || source.scope.canvasId !== scope.canvasId
    || intent.targetId !== receipt.targetId || intent.collectionId !== landing.collectionId) return empty;
  const frame = nodes.find((node) => node.id === landing.frameId && node.type === 'frame'
    && node.data?.lcosCollectionId === landing.collectionId);
  const frameAbs = frame && getAbsolutePosition(nodes as Node[], frame.id);
  if (!frame || frame.hidden || frame.data.locked || collapsed.has(frame.id) || !frameAbs
    || frameAbs.x !== landing.framePosition.x || frameAbs.y !== landing.framePosition.y) return empty;
  const live = new Map(snapshotCanvasDropNodes(source.nodes.map((node) => node.nodeId), nodes, refs, scope.canvasId).map((node) => [node.nodeId, node]));
  const results = receipt.collectionItems ?? [{ memberRef: intent.memberRef, status: receipt.status, canonicalReceipt: receipt.canonicalReceipt }];
  const successKeys = new Set(results.flatMap((item) => {
    const canonical = item.canonicalReceipt as { collectionId?: string; memberRef?: { type?: string; id?: string }; status?: string } | undefined;
    return item.status === 'success' && canonical?.collectionId === landing.collectionId
      && canonical.memberRef?.type === item.memberRef.type && canonical.memberRef?.id === item.memberRef.id
      && (canonical.status === 'applied' || canonical.status === 'already-member')
      ? [`${item.memberRef.type}:${item.memberRef.id}`] : [];
  }));
  let skipped = false;
  const items = source.nodes.flatMap((original) => {
    const prepared = preparedMaterials?.get(original.nodeId);
    const member = prepared ?? original.reference;
    if (!member || !successKeys.has(`${member.entityType}:${member.entityId}`)) return [];
    const current = live.get(original.nodeId);
    const released = landing.nodes.find((node) => node.nodeId === original.nodeId);
    const currentNode = nodes.find((node) => node.id === original.nodeId);
    // An atomic text claim may replace the Native identity during this release.
    // Permit only our exact claim with unchanged content and geometry; an image
    // registration keeps the Native identity and must pass the ordinary check.
    const ownTextClaim = original.reference?.entityType === 'native-text' && prepared
      && current?.reference?.entityType === prepared.entityType && current.reference.entityId === prepared.entityId
      && current.reference.artifactViewId === prepared.artifactViewId && current.reference.revisionId === prepared.revisionId
      && currentNode?.data.content === original.reference.nativeText?.body
      && sameCanvasDropNode({...original,reference:current.reference},current);
    if (!released || !(sameCanvasDropNode(original, current) || ownTextClaim) || currentNode?.dragging || currentNode?.data.locked) {
      skipped = true; return [];
    }
    // The native SET_NODE_PARENT command preserves world-space position. Its
    // preceding geometry write is in the CURRENT parent's coordinates.
    return [{ nodeId: original.nodeId, position: {
      x: original.position.x + released.absolutePosition.x - original.absolutePosition.x,
      y: original.position.y + released.absolutePosition.y - original.absolutePosition.y,
    } }];
  });
  return { items, skipped };
}
