import type { LcosNodeEntityRef } from '../../lcosReferenceState';
import type { LcosLocateRequest } from '../../shell/lcosShellStore';
import type { TemporalGroupV1, TemporalTargetRefV1 } from '@local-creative-os/contracts';

export interface TemporalTargetProjection {
  readonly nodeIds: readonly string[];
  readonly projectedTargetCount: number;
  readonly missingTargets: readonly TemporalTargetRefV1[];
}

function entityKey(type: string, id: string): string {
  return `${type}:${id}`;
}

/** Resolve canonical temporal targets only through current canvas bindings. */
export function projectTemporalGroupTargets(
  group: TemporalGroupV1,
  refs: ReadonlyMap<string, LcosNodeEntityRef>,
): TemporalTargetProjection {
  const nodesByEntity = new Map<string, string[]>();
  for (const [nodeId, ref] of refs) {
    const key = entityKey(ref.entityType, ref.entityId);
    const nodeIds = nodesByEntity.get(key) ?? [];
    nodeIds.push(nodeId);
    nodesByEntity.set(key, nodeIds);
  }

  const nodeIds = new Set<string>();
  const missingTargets: TemporalTargetRefV1[] = [];
  let projectedTargetCount = 0;
  for (const target of group.targets) {
    const matches = nodesByEntity.get(entityKey(target.type, target.id));
    if (matches === undefined || matches.length === 0) {
      missingTargets.push(target);
      continue;
    }
    projectedTargetCount += 1;
    for (const nodeId of matches) nodeIds.add(nodeId);
  }

  return { nodeIds: [...nodeIds], projectedTargetCount, missingTargets };
}

export function temporalPartialReason(
  projection: TemporalTargetProjection,
  totalTargetCount: number,
): string | undefined {
  if (projection.missingTargets.length === 0) return undefined;
  return `已定位 ${projection.projectedTargetCount}/${totalTargetCount} 个时间目标；${projection.missingTargets.length} 个尚未投影到当前 Context`;
}

export function createTemporalLocateRequest(input: {
  readonly reqId: string;
  readonly canvasId?: string;
  readonly projection: TemporalTargetProjection;
}): LcosLocateRequest | undefined {
  const [nodeId] = input.projection.nodeIds;
  if (nodeId === undefined) return undefined;
  return {
    reqId: input.reqId,
    surface: 'context',
    ...(input.canvasId === undefined ? {} : { canvasId: input.canvasId }),
    nodeId,
    nodeIds: input.projection.nodeIds,
    status: 'projected',
  };
}
