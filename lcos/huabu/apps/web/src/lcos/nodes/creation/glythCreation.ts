import { createQuestionNodeAndCompose } from '@/components/Nodes/question/questionCompose';
import useCanvasStore from '@/store/canvasStore';
import { useLcosReferenceStore } from '../../lcosReferenceState';
import { useLcosShellStore } from '../../shell/lcosShellStore';
import {
  appearanceKey,
  DEFAULT_GLYTH_APPEARANCE,
  readGlythAppearance,
  type GlythAppearance,
} from '../../ui/glyth/glythAppearance';

export function occupiedGlythAppearances(): GlythAppearance[] {
  const refs = useLcosReferenceStore.getState().nodeEntityRefs;
  return useCanvasStore
    .getState()
    .nodes.filter(
      (node) =>
        node.type === 'question' ||
        refs.get(node.id)?.entityType === 'conversation',
    )
    .map(
      (node) =>
        readGlythAppearance(node.data.lcosGlythAppearance) ??
        DEFAULT_GLYTH_APPEARANCE,
    );
}
/** The existing Huabu factory owns the new node, fresh thread, binding and compose entry. */
export function createGlythAtPoint(input: {
  projectId: string;
  canvasId: string;
  position: { x: number; y: number };
  appearance: GlythAppearance;
}) {
  const canvas = useCanvasStore.getState();
  if (
    canvas.canvasId !== input.canvasId ||
    useLcosShellStore.getState().projectId !== input.projectId
  )
    throw new Error('现场已切换，请在当前画布重新放置。');
  if (
    occupiedGlythAppearances().some(
      (item) => appearanceKey(item) === appearanceKey(input.appearance),
    )
  )
    throw new Error('这个形象刚被使用了，刷新后再放置。');
  return createQuestionNodeAndCompose({
    canvasId: input.canvasId,
    placementPoint: input.position,
    addNode: (node) =>
      canvas.addNode({
        ...node,
        size: { width: 121, height: 142 },
        selectOnCreate: true,
        data: {
          ...node.data,
          label: 'Glyth',
          lcosGlythAppearance: input.appearance,
        },
      }),
  });
}
