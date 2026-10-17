import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { MiniMap, useReactFlow, useStore } from '@xyflow/react';
import { motion, useMotionValue, useSpring } from 'motion/react';
import { useShallow } from 'zustand/react/shallow';
import { createAbsolutePositionGetter } from '@huabu/shared/canvas-engine';
import {
  colorPinTargetFromEntityRef,
  colorPinTargetKey,
} from '@local-creative-os/web-gen2';
import { useOptionalLcosColorPins } from '../pin/LcosColorPinProvider';
import { useLcosReferenceStore } from '../lcosReferenceState';
import { createTapnowMiniMap } from '../ui/donor/tapnow-minimap.mjs';
import '../ui/donor/tapnow-minimap.css';
import type { Node } from '@xyflow/react';

function useSelection(
  select: (state: { nodeIds: Set<string> }) => Set<string>,
) {
  const nodes = useStore((state) => state.nodes);
  return React.useMemo(
    () =>
      select({
        nodeIds: new Set(
          nodes.filter((node) => node.selected).map((node) => node.id),
        ),
      }),
    [nodes, select],
  );
}
function usePinGroups() {
  const pins = useOptionalLcosColorPins();
  const nodes = useStore((state) => state.nodes);
  const refs = useLcosReferenceStore((state) => state.nodeEntityRefs);
  return React.useMemo(
    () =>
      pins?.usedDefinitions.map((definition) => ({
        groupId: definition.id,
        group: { hex: definition.color },
        nodeIds: nodes
          .filter((node) => {
            const ref = refs.get(node.id);
            if (!ref) return false;
            const target = colorPinTargetKey(
              colorPinTargetFromEntityRef(pins.projectId, ref),
            );
            return pins.membershipsByTargetKey
              .get(target)
              ?.some((item) => item.colorPinId === definition.id);
          })
          .map((node) => node.id),
      })) ?? [],
    [pins, nodes, refs],
  );
}
const OriginalMiniMap = createTapnowMiniMap({
  React,
  jsxRuntime,
  useReactFlow,
  useStore,
  useShallow,
  useSelection,
  usePinGroups,
  useActivePin: () => useOptionalLcosColorPins()?.activeDefinitionId,
  isSelected: (node: Node, selected: Set<string>) => selected.has(node.id),
  absolutePosition: (node: Node, nodes: Map<string, Node>) =>
    createAbsolutePositionGetter(nodes)(node.id) ?? node.position,
  MiniMap: (props: React.ComponentProps<typeof MiniMap>) => (
    <MiniMap
      {...props}
      ariaLabel="当前画布小地图"
      className={`lcos-tapnow-minimap-native ${props.className ?? ''}`}
    />
  ),
  motion,
  useSpring,
  useMotionValue,
});
/** Original TapNow gestures drive the same native React Flow viewport. */
export function TapnowMiniMap() {
  return (
    <div className="lcos-tapnow-minimap" data-lcos-tapnow-minimap>
      <OriginalMiniMap />
    </div>
  );
}
