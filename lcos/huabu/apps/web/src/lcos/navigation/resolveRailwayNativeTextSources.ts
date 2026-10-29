import { canvasTextReplyMatches } from '../nodes/canvasTextSave';

import type { AssemblySourceRefV1 } from '@local-creative-os/contracts';
import type { CanvasTextSnapshot, EntityRefLike, ProjectionBinding } from '@local-creative-os/web-gen2';
import type { Node } from '@xyflow/react';

export interface RailwayNativeTextSource {
  readonly nodeId: string;
  readonly nodeType: 'note' | 'text';
  readonly body: string;
}

export interface RailwayNativeTextSourcePorts {
  readonly readCurrent: () => {
    readonly projectId: string | null;
    readonly canvasId: string | null | undefined;
    readonly nodes: readonly Node[];
    readonly refs: ReadonlyMap<string, EntityRefLike>;
  };
  readonly readBindings: () => Promise<readonly ProjectionBinding[]>;
  /** Existing claimProjectText producer; registers this carrier, never creates another node. */
  readonly claimProducer: (input: { readonly projectId: string; readonly canvasId: string; readonly nodeId: string;
    readonly body: string; readonly focus: false }) => Promise<CanvasTextSnapshot>;
}

export interface ResolvedRailwayNativeTextSource {
  readonly sourceRef: Extract<AssemblySourceRefV1, { kind: 'artifactView' }>;
  readonly reference: { readonly entityType: 'artifact'; readonly entityId: string; readonly artifactViewId: string; readonly revisionId: string };
}

/** Explicit New View use adopts only the selected native text's real body at
 * its original address. Labels are not identity; no create-carrier call, body
 * rewrite, title search, automatic replay or extra materialization owner. */
export async function resolveRailwayNativeTextSources(input: {
  readonly projectId: string; readonly canvasId: string;
  readonly sourceRefs: readonly AssemblySourceRefV1[];
  readonly nativeTextSources: readonly RailwayNativeTextSource[];
}, ports: RailwayNativeTextSourcePorts, signal?: AbortSignal, isCurrent?: () => boolean): Promise<{
  readonly sourceRefs: readonly AssemblySourceRefV1[];
  readonly capturedRevisionIdsBySource: Readonly<Record<string, string>>;
  readonly byNodeId: ReadonlyMap<string, ResolvedRailwayNativeTextSource>;
}> {
  const current = () => {
    const snapshot = ports.readCurrent();
    if (signal?.aborted || isCurrent?.() === false || !input.projectId.trim() || !input.canvasId.trim()
      || snapshot.projectId !== input.projectId || snapshot.canvasId !== input.canvasId)
      throw new Error('原取用现场已变化，未登记到其他项目或画布。');
    return snapshot;
  };
  const unbound = (source: RailwayNativeTextSource) => {
    const snapshot = current();
    const matches = snapshot.nodes.filter(node => node.id === source.nodeId);
    const node = matches.length === 1 ? matches[0] : undefined;
    if (!node || !['note', 'text'].includes(source.nodeType) || node.type !== source.nodeType
      || typeof source.body !== 'string' || typeof node.data.content !== 'string'
      || node.data.content !== source.body || node.data.contentMissing === true)
      throw new Error('整组未登记：原生文本类型、真实正文或原节点已改变。');
    if (snapshot.refs.has(source.nodeId)) throw new Error('原节点已有材料身份，未把它重新登记为其他材料。');
  };
  const noPersistedBinding = (source: RailwayNativeTextSource, bindings: readonly ProjectionBinding[]) => {
    if (bindings.some(binding => binding.projectId === input.projectId && binding.canvasId === input.canvasId
      && binding.spatialKind === 'node' && binding.spatialId === source.nodeId))
      throw new Error('原节点已存在正式材料绑定，请刷新原引用后取用；未重新登记。');
  };
  current();
  if (input.sourceRefs.some(source => !['artifactView', 'note'].includes(source.kind) || !source.id.trim()))
    throw new Error('整组包含暂不能创建工作现场的来源，未登记任何原生文本。');
  if (new Set(input.nativeTextSources.map(source => source.nodeId)).size !== input.nativeTextSources.length)
    throw new Error('原生文本节点重复，未重复登记。');
  // Validate the complete batch before the first producer call.
  input.nativeTextSources.forEach(unbound);
  const bindings = input.nativeTextSources.length ? await ports.readBindings() : [];
  current();
  for (const source of input.nativeTextSources) { unbound(source); noPersistedBinding(source, bindings); }
  const sourceRefs: AssemblySourceRefV1[] = input.sourceRefs.map(source => ({ ...source }));
  const capturedRevisionIdsBySource: Record<string, string> = {};
  const byNodeId = new Map<string, ResolvedRailwayNativeTextSource>();
  for (const source of input.nativeTextSources) {
    unbound(source);
    const latestBindings = await ports.readBindings();
    unbound(source); noPersistedBinding(source, latestBindings);
    const reply = await ports.claimProducer({ projectId: input.projectId, canvasId: input.canvasId,
      nodeId: source.nodeId, body: source.body, focus: false });
    const snapshot = current();
    const node = snapshot.nodes.find(candidate => candidate.id === source.nodeId);
    const reference = snapshot.refs.get(source.nodeId);
    if (!canvasTextReplyMatches(input.projectId, { canvasId: input.canvasId, spatialId: source.nodeId,
      body: source.body, expectedRevisionId: null }, reply) || node?.type !== source.nodeType || node.data.content !== source.body
      || reference && (reference.entityType !== 'artifact' || reference.entityId !== reply.artifactId))
      throw new Error('原文本登记回执或节点身份未确认，未猜测替代材料，也未自动重试。');
    const sourceRef = { kind: 'artifactView' as const, id: reply.viewId };
    sourceRefs.push(sourceRef);
    capturedRevisionIdsBySource[reply.viewId] = reply.revisionId;
    byNodeId.set(source.nodeId, { sourceRef, reference: { entityType: 'artifact', entityId: reply.artifactId,
      artifactViewId: reply.viewId, revisionId: reply.revisionId } });
  }
  return { sourceRefs, capturedRevisionIdsBySource, byNodeId };
}
