import { colorPinTargetFromEntityRef, colorPinTargetKey } from '@local-creative-os/web-gen2';
import type { LcosNodeEntityRef } from '../lcosReferenceState';
import type { LcosColorPinProjectionV1 } from './LcosColorPinProvider';
export interface ProjectedPinTarget {
  readonly nodeId: string;
  readonly label: string;
  readonly colors: readonly string[];
}
/** Read projection only. Hidden/missing nodes and stale bindings never become Locator targets. */
export function projectedPinTargets(
  nodes: readonly { readonly id: string; readonly hidden?: boolean }[],
  references: ReadonlyMap<string, LcosNodeEntityRef>,
  projection: Pick<LcosColorPinProjectionV1, 'projectId' | 'membershipsByTargetKey' | 'snapshot'>,
): readonly ProjectedPinTarget[] {
  const definitions = new Map(projection.snapshot.definitions.map((definition) => [definition.id, definition]));
  return nodes.flatMap((node): ProjectedPinTarget[] => {
    const ref = references.get(node.id);
    if (node.hidden || !ref) return [];
    const key = colorPinTargetKey(colorPinTargetFromEntityRef(projection.projectId, ref));
    const memberships = projection.membershipsByTargetKey.get(key) ?? [];
    const colors = [...new Set(memberships.flatMap((membership) => {
      const definition = definitions.get(membership.colorPinId);
      return definition ? [definition.color] : [];
    }))];
    return colors.length === 0 ? [] : [{ nodeId: node.id, colors,
      label: ref.descriptor?.title ?? ref.displayLabel ?? '已标记对象' }];
  });
}
