import { ExpandedNodePanel } from '@/components/Panels/ExpandedNodePanel/ExpandedNodePanel';
import { PreviewEditingPolicyProvider } from '@/lcos-seam/previewEditingPolicy';
import { CanvasChromeModeProvider } from '@/lcos-seam/chromeModeSlot';
import useCanvasStore from '@/store/canvasStore';

import { useNativePreviewEditingPolicy } from './useNativePreviewEditingPolicy';
import { lcosTokens } from '../ui/lcosTokens';

/**
 * Visible host for Huabu's mature native large-view editor inside the Gen2
 * Professional Window. It reuses the live canvas store and never revives the
 * retired PreviewWorkspace product shell.
 */
export function NativeNodePreviewBody({
  nodeId,
  onClose,
}: {
  readonly nodeId?: string;
  readonly onClose: () => void;
}): React.JSX.Element {
  const canEdit = useNativePreviewEditingPolicy();
  const exists = useCanvasStore((state) =>
    nodeId !== undefined && state.nodes.some((node) => node.id === nodeId));

  if (!nodeId || !exists) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm"
        style={{ color: lcosTokens.color.muted }}>
        这个画布对象已经离开当前现场。
      </div>
    );
  }

  return (
    <div data-lcos-native-preview={nodeId} className="h-full min-h-0">
      <PreviewEditingPolicyProvider value={canEdit}>
        <CanvasChromeModeProvider value="lcos">
        <ExpandedNodePanel nodeId={nodeId} embedded hasFocusPriority onClose={onClose} />
        </CanvasChromeModeProvider>
      </PreviewEditingPolicyProvider>
    </div>
  );
}
