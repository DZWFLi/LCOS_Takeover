import { nativeManagedPinNode, nativePinChoice, nativePinColorKey, type NativePinGroup, type NativePinChoice } from './native-colorpin-model';
import type { ColorPinDefinitionV0 } from '../../lcos/packages/contracts/src/index';

export type NativeColorPinGroup = Omit<NativePinGroup, 'definitionId' | 'updatedAt'> & {
  definitionId?: string; updatedAt?: string; readonly rawNodeIds: readonly string[];
};
type Node = { id: string; data?: Readonly<Record<string, unknown>> };
export const nativeOrdinaryPinNode = (node: Node | undefined): boolean => !!node && node.data?.id === node.id
  && typeof node.data?.lcos_gui_navigation_pin === 'boolean' && !nativeManagedPinNode(node);
/** The original spatial field stores unprefixed six-digit colors. */
export function nativeOrdinaryPinColors(value: unknown): readonly string[] {
  return Array.isArray(value) ? [...new Set(value.flatMap(color => typeof color === 'string'
    && /^[0-9a-f]{6}$/i.test(color) ? [color.toUpperCase()] : []))] : [];
}
/** One original header group per color. A managed carrier's obsolete raw
 * field is never a second membership or a second group. */
export function mergeNativeColorPinGroups(core: readonly NativePinGroup[], nodes: readonly Node[],
  definitions: readonly ColorPinDefinitionV0[], choices: readonly NativePinChoice[]): readonly NativeColorPinGroup[] {
  const groups = new Map<string, NativeColorPinGroup>(core.map(group => [group.groupId, { ...group, rawNodeIds: [] }]));
  for (const node of nodes) {
    if (!nativeOrdinaryPinNode(node)) continue;
    for (const color of nativeOrdinaryPinColors(node.data?.color_pins)) {
      const definition = definitions.find(row => nativePinColorKey(row.color) === color);
      const old = groups.get(color), rawNodeIds = [...(old?.rawNodeIds ?? []), node.id];
      const nodeIds = [...new Set([...(old?.nodeIds ?? []), node.id])];
      groups.set(color, { ...(old ?? { groupId: color, color: '#' + color,
        group: choices.find(row => row.id === color) ?? nativePinChoice(color)!, membershipIds: [],
        sharedMembershipCount: 0, surfaceMembershipCount: 0 }),
        ...(definition ? { definitionId: definition.id, updatedAt: definition.updatedAt,
          ...(definition.label ? { label: definition.label } : {}) } : {}), rawNodeIds, nodeIds, count: nodeIds.length });
    }
  }
  const order = [...choices.map(choice => choice.id), ...groups.keys()];
  return [...groups.values()].sort((a, b) => order.indexOf(a.groupId) - order.indexOf(b.groupId));
}
