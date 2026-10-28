import { createReferencePickRecognizer } from '../../lcos/huabu/apps/web/src/lcos/lcosRecognizers';
import { prepareNativeReferencePick, type NativeReferencePickPreparation } from '../../lcos/huabu/apps/web/src/lcos/composer/prepareNativeReferencePick';
import { snapshotDraftReference } from '../../lcos/huabu/apps/web/src/lcos/composer/referenceSnapshot';
import { useLcosReferenceStore, type LcosNodeEntityRef } from '../../lcos/huabu/apps/web/src/lcos/lcosReferenceState';
import type { PointerRecognizer } from '../../lcos/huabu/apps/web/src/handler/pointerRouter';
import type { CanvasPointerRouterContext } from '../../lcos/huabu/apps/web/src/handler/canvasPointerRouterContext';
import { nativeCarryReference, type NativeNodeCarryWorld } from './native-node-carry';
import { readNativeNodeComposerFacts, resolveNativeNodeComposerReference, type NativeNodeComposerFacts } from './native-node-composer';

type Row = Record<string, any>;
export interface NativeReferencePickRuntime {
  nodeIdAtScreenPoint?(event: PointerEvent): string | undefined;
  captureCurrent?(nodeId: string): () => boolean;
  unavailableReason?(nodeId: string, reference?: LcosNodeEntityRef): string | undefined;
  notice?(message: string, options?: { tone?: string }): void;
  subscribeCurrent?(listener: () => void): () => void;
}
export interface NativeReferencePickPort {
  world(): NativeNodeCarryWorld | null;
  notice(message: string): void;
  readFacts?(projectId: string, signal?: AbortSignal): Promise<NativeNodeComposerFacts>;
  prepareNative?: NativeReferencePickPreparation;
}
const record = (value: unknown): value is Row => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && !!value.trim();
const sameWorld = (a: NativeNodeCarryWorld, b: NativeNodeCarryWorld | null) => !!b && a.api === b.api && a.wrapper === b.wrapper
  && a.projectId === b.projectId && a.canvasId === b.canvasId && a.workspaceId === b.workspaceId;
const nodeIdentity = (node: Row | undefined) => JSON.stringify([node?.id, node?.type, node?.canvas_id, node?.data?.id,
  node?.data?.lcos_ref, node?.data?.lcos_result_ref, node?.data?.lcos_collection_ref, node?.data?.lcos_conversation_ref,
  node?.data?.lcos_execution_ref, node?.data?.lcos_member_ref, node?.data?.contentMissing, node?.data?.artifactMissing,
  node?.data?.content, node?.data?.src]);

/** Hit the actual current Canvas DOM, never a global rectangle behind a menu,
 * another Canvas or a higher-z stale carrier. Read-only nodes remain readable. */
export function nativeReferencePickNodeAtEvent(world: NativeNodeCarryWorld, event: PointerEvent): string | undefined {
  const target = event.target;
  if (!(target instanceof Element) || !world.wrapper.contains(target)) return undefined;
  if (target.closest('button,input,textarea,select,a[href],[contenteditable="true"],[data-lcos-relation-handle],'
    + '.react-flow__handle,.react-flow__resize-control,[data-resize-handle],[data-lcos-node-resize],[data-semantic-drop-handle]')) return undefined;
  const element = target.closest<HTMLElement>('.react-flow__node[data-id]');
  const actual = world.wrapper.ownerDocument.elementFromPoint(event.clientX, event.clientY);
  const hit = actual?.closest<HTMLElement>('.react-flow__node[data-id]');
  if (!element || !actual || !world.wrapper.contains(actual) || hit !== element || !text(element.dataset.id)
    || !element.isConnected || !element.getClientRects().length) return undefined;
  if (actual.closest('button,input,textarea,select,a[href],[contenteditable="true"],[data-lcos-relation-handle],'
    + '.react-flow__handle,.react-flow__resize-control,[data-resize-handle],[data-lcos-node-resize],[data-semantic-drop-handle]')) return undefined;
  const node = world.nodes.find(candidate => candidate.id === element.dataset.id);
  return node && node.hidden !== true ? node.id : undefined;
}

/** A saved occurrence and the original presentation cache must agree exactly.
 * Identity-only/malformed caches are not permission to reference another View. */
export function nativeReferencePickUnavailableReason(world: NativeNodeCarryWorld | null, nodeId: string,
  captured?: LcosNodeEntityRef): string | undefined {
  const node = world?.nodes.find(item => item.id === nodeId), data = node?.data;
  if (!world || !node || node.hidden === true || !data) return '原对象或现场已改变，本次点取已取消。';
  if (data.contentMissing === true || data.artifactMissing === true) return '这份材料暂时无法读取，原输入保留。';
  const cached = world.refs.get(nodeId), visible = cached ? snapshotDraftReference(cached) : undefined;
  if (Object.hasOwn(data, 'lcos_ref')) {
    const raw = data.lcos_ref;
    if (!record(raw)) return '原材料的版本引用尚未确认，已保留当前输入。';
    if (['artifact', 'view'].includes(raw.entityType)) {
      const exact = nativeCarryReference(raw);
      if (!exact) return '原材料的版本引用尚未确认，已保留当前输入。';
      if (visible && !((visible.entityType === 'artifact' && visible.entityId === exact.entityId
        || ['view', 'artifactView'].includes(visible.entityType) && visible.entityId === exact.artifactViewId)
        && visible.artifactViewId === exact.artifactViewId && visible.revisionId === exact.revisionId))
        return '原对象与已读材料的视图或版本不一致，请重新读取后点取；原输入保留。';
    } else if (raw.version !== 1 || !text(raw.entityType) || !text(raw.entityId)
      || !visible || visible.entityType !== raw.entityType || visible.entityId !== raw.entityId)
      return '原对象的材料身份尚未确认，原输入保留。';
  }
  for (const [field, kind, idKey] of [
    ['lcos_collection_ref', 'collection', 'collectionId'], ['lcos_conversation_ref', 'conversation', 'connectedConversationId'],
    ['lcos_execution_ref', 'run', 'entityId'],
  ] as const) {
    if (!Object.hasOwn(data, field)) continue;
    const ref = data[field];
    if (!record(ref) || ref.projectId !== world.projectId || ref.canvasId !== world.canvasId || ref.workspaceId !== world.workspaceId
      || !text(ref[idKey]) || !visible || visible.entityType !== kind || visible.entityId !== ref[idKey])
      return '原对象与当前现场的材料身份不一致，原输入保留。';
  }
  // Preserve the original press-time address when only an unsaved projection
  // descriptor refreshes. A saved occurrence's explicit address was checked
  // above; it may not silently become the cache's newer View or Revision.
  if (captured && (!visible || captured.entityType !== visible.entityType || captured.entityId !== visible.entityId))
    return '点取期间材料的身份已改变，原输入保留。';
  return undefined;
}

/** The original recognizer remains the gesture/ordered-draft owner. Saved
 * native occurrences only read existing Core facts and fill one original
 * presentation-cache entry; unbound native sources keep their old producer. */
export function createNativeReferencePickAdapter(port: NativeReferencePickPort) {
  let active = true;
  const listeners = new Set<() => void>();
  const currentWorld = () => active ? port.world() : null;
  const captureCurrent = (nodeId: string) => {
    const world = currentWorld(), identity = nodeIdentity(world?.nodes.find(node => node.id === nodeId));
    return () => !!world && sameWorld(world, currentWorld())
      && currentWorld()?.interaction?.explicitToolActive === false && currentWorld()?.interaction?.interactivityLocked === false
      && identity === nodeIdentity(currentWorld()?.nodes.find(node => node.id === nodeId));
  };
  const prepare: NativeReferencePickPreparation = async request => {
    const world = currentWorld(), nodeId = request.source.entityId, current = captureCurrent(nodeId);
    const valid = () => !request.signal.aborted && request.isCurrent() && current();
    if (!world || !valid() || request.projectId !== world.projectId || request.canvasId !== world.canvasId)
      throw new Error('输入或现场已改变，本次点取已取消。');
    const node = world.nodes.find(item => item.id === nodeId);
    if (!node) throw new Error('原对象已不在当前现场，原输入保留。');
    if (!Object.hasOwn(node.data ?? {}, 'lcos_ref')) {
      try { return await (port.prepareNative ?? prepareNativeReferencePick)(request); }
      catch (cause) {
        if (request.signal.aborted || (cause as { name?: string })?.name === 'AbortError') throw cause;
        if (cause instanceof SyntaxError || cause instanceof TypeError
          && /failed to fetch|fetch failed|networkerror|load failed/i.test(cause.message))
          throw new Error('材料暂时无法读取，原输入保留；可以重试点取。', { cause });
        throw cause;
      }
    }
    const issue = nativeReferencePickUnavailableReason(world, nodeId);
    if (issue) throw new Error(issue);
    if (!text(world.workspaceId)) throw new Error('当前现场归属尚未就绪，原输入保留。');
    const facts = await (port.readFacts ?? readNativeNodeComposerFacts)(world.projectId, request.signal);
    if (!valid()) throw new Error('输入或现场已改变，本次点取已取消。');
    const liveWorld = currentWorld()!, liveNode = liveWorld.nodes.find(item => item.id === nodeId)!;
    const reference = resolveNativeNodeComposerReference(liveNode, { projectId: world.projectId,
      canvasId: world.canvasId, workspaceId: world.workspaceId }, facts) as LcosNodeEntityRef;
    const references = useLcosReferenceStore.getState();
    const changed = nativeReferencePickUnavailableReason(liveWorld, nodeId);
    if (!valid() || references.projectId !== world.projectId || references.bindingCanvasId !== null
      && references.bindingCanvasId !== world.canvasId) throw new Error('输入或现场已改变，本次点取已取消。');
    if (changed) throw new Error(changed);
    // registerNodeEntity changes the existing projection cache only. Keep the
    // rest of the typed Collection/Run/conversation entries and all Core facts.
    references.registerNodeEntity(nodeId, reference);
    return reference;
  };
  const runtime: NativeReferencePickRuntime = {
    nodeIdAtScreenPoint: event => { const world = currentWorld(); return world ? nativeReferencePickNodeAtEvent(world, event) : undefined; },
    captureCurrent, unavailableReason: (nodeId, reference) => nativeReferencePickUnavailableReason(currentWorld(), nodeId, reference),
    notice: message => { if (active) port.notice(message); },
    subscribeCurrent: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
  const create = createReferencePickRecognizer as unknown as (prepare: NativeReferencePickPreparation, runtime: NativeReferencePickRuntime)
    => PointerRecognizer<PointerEvent, CanvasPointerRouterContext>;
  const original = create(prepare, runtime);
  const recognizer = { ...original, canClaim(event: PointerEvent, context: CanvasPointerRouterContext) {
    const world = currentWorld();
    // A missing original input-owner snapshot is not evidence that a tool is
    // inactive. Only reference picking fails closed; right carry is unchanged.
    return world?.interaction?.explicitToolActive === false && world.interaction.interactivityLocked === false
      && original.canClaim(event, context);
  } };
  return { recognizer, invalidate() { for (const listener of [...listeners]) listener(); },
    dispose() { active = false; for (const listener of [...listeners]) listener(); listeners.clear(); } };
}
