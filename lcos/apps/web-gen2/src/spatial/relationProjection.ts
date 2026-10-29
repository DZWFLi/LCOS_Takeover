// Relation projection — the MOST important special boundary.
// Core Relation is canonical (semantics/business truth); Huabu Edge is ONLY a
// spatial projection of that relation. Creating a semantic relation ALWAYS goes
// through Core first; Huabu Edge is projected afterwards. The real Huabu edgeId
// (server-assigned) is captured and persisted in the relation<->edge binding.

import { HuabuRfsClient } from './huabuRfsClient.js';
import { ProjectionBindingRegistry } from './projectionBinding.js';
import type { AgentRfsEdgeStyle } from './types.js';
import type { RelationEntityType } from '@local-creative-os/domain';

export type RelationKind = 'references' | 'derived-from' | 'revises' | 'depends-on' | 'uses' | 'produced-by';

export interface CoreEntityRef {
  entityType: RelationEntityType;
  entityId: string;
}

export interface SemanticRelation {
  id: string;
  kind: RelationKind;
  from: CoreEntityRef;
  to: CoreEntityRef;
}

export interface CoreRelationWriteInput {
  kind: RelationKind;
  from: CoreEntityRef;
  to: CoreEntityRef;
}

export interface CoreRelationWriter {
  createRelation(input: CoreRelationWriteInput): Promise<{ id: string }>;
  deleteRelation(relationId: string): Promise<void>;
}

export interface NodeBindingResolver {
  (nodeId: string): { entityType: CoreEntityRef['entityType']; entityId: string } | undefined;
}

export class RelationProjection {
  constructor(
    private readonly rfs: HuabuRfsClient,
    private readonly core: CoreRelationWriter,
    private readonly bindings: ProjectionBindingRegistry,
    private readonly projectId: string,
  ) {}

  /**
   * Huabu connect intent -> Core createRelation -> RFS CONNECT_NODES -> capture
   * real edgeId -> persist relation<->edge binding.
   * Core write is definitive: if Core rejects, no Edge is created.
   */
  async onConnectGesture(
    gesture: { sourceNodeId: string; targetNodeId: string; label?: string },
    resolver: NodeBindingResolver,
  ): Promise<{ relationId: string; edgeId: string }> {
    const source = resolver(gesture.sourceNodeId);
    const target = resolver(gesture.targetNodeId);
    if (!source || !target) {
      throw new Error('Cannot resolve a binding for one endpoint of the connect gesture');
    }
    const kind = (gesture.label as RelationKind | undefined) ?? 'references';

    // 1) Core is canonical -> must succeed first.
    const relation = await this.core.createRelation({ kind, from: source, to: target });

    // 2) Project to Huabu Edge; capture the server-assigned edgeId.
    const response = await this.rfs.execute([
      { type: 'CONNECT_NODES', edges: [{ source: gesture.sourceNodeId, target: gesture.targetNodeId, style: this.edgeStyleFor(kind) }] },
    ]);
    const edgeId = HuabuRfsClient.firstCreatedEdgeId(response);
    if (!edgeId) {
      // RFS write failed: Core relation is still canonical -> mark projection
      // missing; a reconciliation pass repairs it.
      throw new Error(`CONNECT_NODES did not return an edge id for relation ${relation.id}`);
    }

    // 3) Persist relation<->edge binding.
    await this.bindings.bind({
      projectId: this.projectId,
      canvasId: this.rfs.config.canvasId,
      spatialKind: 'edge',
      spatialId: edgeId,
      entityType: 'relation',
      entityId: relation.id,
    });

    return { relationId: relation.id, edgeId };
  }

  /** Project an already-existing Core Relation into a Huabu Edge (Core -> Huabu). */
  async projectRelation(relation: SemanticRelation, fromNodeId: string, toNodeId: string): Promise<void> {
    const response = await this.rfs.execute([
      { type: 'CONNECT_NODES', edges: [{ source: fromNodeId, target: toNodeId, style: this.edgeStyleFor(relation.kind) }] },
    ]);
    const edgeId = HuabuRfsClient.firstCreatedEdgeId(response);
    if (!edgeId) return;
    await this.bindings.bind({
      projectId: this.projectId,
      canvasId: this.rfs.config.canvasId,
      spatialKind: 'edge',
      spatialId: edgeId,
      entityType: 'relation',
      entityId: relation.id,
    });
  }

  /**
   * Reconciliation: make the Huabu Edge for an existing Core Relation match core.
   * - No edge binding -> project the edge (CONNECT) + bind it.
   * - Binding exists but the Huabu edge was deleted -> disconnect stale, re-CONNECT, rebind.
   * - Binding exists and edge present -> no-op.
   */
  async reconcileRelationEdge(
    relation: SemanticRelation,
    fromNodeId: string,
    toNodeId: string,
  ): Promise<void> {
    const edgeBinding = await this.bindings.findEdge(this.projectId, this.rfs.config.canvasId, relation.id);
    if (!edgeBinding) {
      await this.projectRelation(relation, fromNodeId, toNodeId);
      return;
    }
    const res = await this.rfs.query({ type: 'INSPECT_EDGES', ids: [edgeBinding.spatialId] });
    const edge = res.type === 'INSPECT_EDGES' ? res.result.edges.find((item) => item.id === edgeBinding.spatialId) : undefined;
    if (edge?.source === fromNodeId && edge.target === toNodeId) return;
    if (edge) {
      // A canonical reconnect changes endpoints while retaining the Relation.
      // Release its old projection before creating the new one, or the old
      // native edge would remain as an unbound duplicate after reconciliation.
      await this.releaseRelationEdge(relation.id, edgeBinding.spatialId);
      await this.projectRelation(relation, fromNodeId, toNodeId);
      return;
    }
    // Stale edge: 边在 Huabu 侧已经不存在（上面刚查过），**不要去 DISCONNECT 它** ——
    // 断开一条不存在的边会让整批命令以 `not-found` 失败（实测重载画布时 reconcile 整体失败）。
    // 直接解绑 + 重投影 + 重绑即可。
    await this.bindings.unbindByEntity(this.projectId, this.rfs.config.canvasId, 'edge', 'relation', relation.id);
    await this.projectRelation(relation, fromNodeId, toNodeId);
  }

  /**
   * Batch form of {@link reconcileRelationEdge}: reconcile a whole reconcile-pass
   * worth of relations in **one** `CONNECT_NODES` execute instead of one execute
   * per relation.
   *
   * Why this is not just an optimization: every `rfs.execute` persists a canvas
   * version and broadcasts a sync `update`, and each broadcast re-enters the live
   * client's undo history (`canvasStore.applyDeltasFromAgent` → `takeSnapshot`,
   * which also clears the redo stack). Projecting one relation per execute made a
   * seconds-long write trickle (`CREATE_NODES`/`CONNECT_NODES` at ~1 write/s) that
   * interleaved with the user's own gestures — the user's next `Ctrl+Z` then undid
   * a remote projection instead of their own move, and the following projection
   * wiped their redo stack. One batched write is atomic from the client's point of
   * view, so a reconcile pass no longer straddles a user gesture.
   *
   * Huabu can only keep one directed edge for a source/target pair, while Core may
   * contain more than one semantic relation for that pair. The server also assigns
   * ids before execution and echoes those ids even when CONNECT_NODES de-duplicates
   * the edge. Therefore an echoed id is only a candidate: it is bound after an
   * INSPECT_EDGES query proves that exact id and endpoints exist.
   *
   * At most one unbound relation per endpoint pair is projected. Additional Core
   * relations stay canonical but are reported as skipped; sharing one Huabu edge
   * would make deleting either relation incorrectly delete the other's projection.
   */
  async reconcileRelationEdges(
    entries: { relation: SemanticRelation; fromNodeId: string; toNodeId: string }[],
  ): Promise<{ projected: number; skipped: number }> {
    if (entries.length === 0) return { projected: 0, skipped: 0 };

    type Entry = (typeof entries)[number];
    const endpointKey = (entry: Entry): string => JSON.stringify([entry.fromNodeId, entry.toNodeId]);
    const groups = new Map<string, Entry[]>();
    for (const entry of entries) {
      const key = endpointKey(entry);
      const group = groups.get(key);
      if (group) group.push(entry);
      else groups.set(key, [entry]);
    }

    // 1) Keep exact, present bindings. For an endpoint pair without a present
    //    owner, choose one deterministic Core relation as the projection owner.
    const pending: Entry[] = [];
    let skipped = 0;
    for (const group of groups.values()) {
      let hasPresentProjection = false;
      const unbound: Entry[] = [];
      const seenSpatialIds = new Set<string>();
      for (const entry of group) {
        const binding = await this.bindings.findEdge(
          this.projectId,
          this.rfs.config.canvasId,
          entry.relation.id,
        );
        if (!binding) {
          unbound.push(entry);
          continue;
        }
        const res = await this.rfs.query({ type: 'INSPECT_EDGES', ids: [binding.spatialId] });
        const edge =
          res.type === 'INSPECT_EDGES'
            ? res.result.edges.find((candidate) => candidate.id === binding.spatialId)
            : undefined;
        const exact = edge?.source === entry.fromNodeId && edge.target === entry.toNodeId;
        if (!exact || seenSpatialIds.has(binding.spatialId)) {
          // Missing/wrong edges and legacy shared bindings are not safe owners.
          await this.releaseRelationEdge(entry.relation.id, binding.spatialId);
          unbound.push(entry);
          continue;
        }
        seenSpatialIds.add(binding.spatialId);
        hasPresentProjection = true;
      }

      if (hasPresentProjection) {
        skipped += unbound.length;
        continue;
      }
      const owner = unbound[0];
      if (owner) pending.push(owner);
      skipped += Math.max(0, unbound.length - 1);
    }
    if (pending.length === 0) return { projected: 0, skipped };

    // 2) ONE write for the whole batch (`executeRelaxed` so a partially
    //    committed batch still hands back the edges it did create).
    const response = await this.rfs.executeRelaxed([
      {
        type: 'CONNECT_NODES',
        edges: pending.map((entry) => ({
          source: entry.fromNodeId,
          target: entry.toNodeId,
          style: this.edgeStyleFor(entry.relation.kind),
        })),
      },
    ]);
    const echoed = response.results?.[0]?.edges ?? [];
    const echoedIds = [...new Set(echoed.map((edge) => edge.edgeId).filter(Boolean))];
    const inspected = echoedIds.length > 0
      ? await this.rfs.query({ type: 'INSPECT_EDGES', ids: echoedIds })
      : undefined;
    const verifiedById = new Map(
      inspected?.type === 'INSPECT_EDGES'
        ? inspected.result.edges.flatMap((edge) => edge.id ? [[edge.id, edge] as const] : [])
        : [],
    );
    const claimedSpatialIds = new Set(
      (await this.bindings.list())
        .filter((binding) =>
          binding.projectId === this.projectId &&
          binding.canvasId === this.rfs.config.canvasId &&
          binding.spatialKind === 'edge' &&
          binding.entityType === 'relation')
        .map((binding) => binding.spatialId),
    );
    let projected = 0;
    for (const entry of pending) {
      const echoedEdge = echoed.find(
        (candidate) => candidate.source === entry.fromNodeId && candidate.target === entry.toNodeId,
      );
      const verifiedEcho = echoedEdge ? verifiedById.get(echoedEdge.edgeId) : undefined;
      let edgeId =
        verifiedEcho?.source === entry.fromNodeId && verifiedEcho.target === entry.toNodeId
          ? verifiedEcho.id
          : undefined;

      // A missing echoed id commonly means Huabu de-duplicated against an edge
      // that already existed before this pass. Adopt only one exact, unclaimed
      // edge; ambiguity is a GAP, not permission to guess.
      if (!edgeId) {
        const bySource = await this.rfs.query({ type: 'INSPECT_EDGES', bySource: entry.fromNodeId });
        const adoptable = bySource.type === 'INSPECT_EDGES'
          ? bySource.result.edges.filter((candidate) =>
            candidate.id &&
            candidate.target === entry.toNodeId &&
            !claimedSpatialIds.has(candidate.id))
          : [];
        if (adoptable.length === 1) edgeId = adoptable[0]?.id;
      }

      if (!edgeId) {
        skipped += 1;
        console.warn('[lcos] 关系投影未获得可验证的 Huabu edge，本轮保留 Core relation 并跳过绑定', {
          relationId: entry.relation.id,
          fromNodeId: entry.fromNodeId,
          toNodeId: entry.toNodeId,
        });
        continue;
      }
      await this.bindings.bind({
        projectId: this.projectId,
        canvasId: this.rfs.config.canvasId,
        spatialKind: 'edge',
        spatialId: edgeId,
        entityType: 'relation',
        entityId: entry.relation.id,
      });
      claimedSpatialIds.add(edgeId);
      projected += 1;
    }
    return { projected, skipped };
  }

  /**
   * Reconciliation: remove a leftover Huabu Edge whose Core Relation no longer
   * exists (orphan projection). Disconnects + unbinds. Destructive RFS only.
   *
   * 边若已经不在，视为**已收敛**：先查存在性再断，不让 `not-found` 打断整批。
   */
  async removeOrphanRelationEdge(relationId: string): Promise<void> {
    const edgeBinding = await this.bindings.findEdge(this.projectId, this.rfs.config.canvasId, relationId);
    if (!edgeBinding) return;
    await this.releaseRelationEdge(relationId, edgeBinding.spatialId);
  }

  /** Delete relation from Core AND its Edge projection; repair both sides. */
  async deleteRelation(relationId: string): Promise<void> {
    const edgeBinding = await this.bindings.findEdge(this.projectId, this.rfs.config.canvasId, relationId);
    await this.core.deleteRelation(relationId);
    if (edgeBinding) {
      await this.releaseRelationEdge(relationId, edgeBinding.spatialId);
    }
  }

  /**
   * Release one relation binding without deleting an edge still referenced by a
   * legacy shared binding. New reconciliation never creates shared bindings, but
   * old data can contain them and deleting either relation must not break the
   * surviving relation's projection.
   */
  private async releaseRelationEdge(relationId: string, edgeId: string): Promise<void> {
    const shared = (await this.bindings.list()).some((binding) =>
      binding.projectId === this.projectId &&
      binding.canvasId === this.rfs.config.canvasId &&
      binding.spatialKind === 'edge' &&
      binding.entityType === 'relation' &&
      binding.spatialId === edgeId &&
      binding.entityId !== relationId);
    if (!shared) await this.disconnectIfPresent(edgeId);
    await this.bindings.unbindByEntity(
      this.projectId,
      this.rfs.config.canvasId,
      'edge',
      'relation',
      relationId,
    );
  }

  /** 断开一条**确实存在**的边；已不存在则视为已收敛，不发命令（避免 `not-found` 打断整批）。 */
  private async disconnectIfPresent(edgeId: string): Promise<void> {
    const res = await this.rfs.query({ type: 'INSPECT_EDGES', ids: [edgeId] });
    const present = res.type === 'INSPECT_EDGES' && res.result.edges.some((edge) => edge.id === edgeId);
    if (!present) return;
    await this.rfs.execute([{ type: 'DISCONNECT_EDGES', edges: [edgeId] }]);
  }

  private edgeStyleFor(kind: RelationKind): AgentRfsEdgeStyle {
    return { lineType: 'bezier', direction: 'forward', label: kind };
  }
}
