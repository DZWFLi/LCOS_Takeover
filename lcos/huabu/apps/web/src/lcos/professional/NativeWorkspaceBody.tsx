import { PreviewWorkspacePanel } from '@/components/Panels/PreviewWorkspace/PreviewWorkspacePanel';
import { PreviewEditingPolicyProvider } from '@/lcos-seam/previewEditingPolicy';
import { usePanelStore } from '@/store/panelStore';

import { useNativePreviewEditingPolicy } from './useNativePreviewEditingPolicy';
import { NativeConversationProjectEntry } from '../collaboration/NativeConversationProjectEntry';
import '../ui/nearfield/tapnow-assistant.css';

/** Keep Huabu's tabs, ChatSession, Agent selectors, permissions and transport.
 * ProfessionalWindowStage remains the sole outer window/geometry owner. */
export function NativeWorkspaceBody({ onClose }: { readonly onClose: () => void }): React.JSX.Element {
  const canEdit = useNativePreviewEditingPolicy();
  return <div data-lcos-native-workspace className="flex h-full min-h-0 flex-col">
    <NativeConversationProjectEntry />
    <div className="min-h-0 flex-1">
    <PreviewEditingPolicyProvider value={canEdit}>
      <PreviewWorkspacePanel onToggle={() => { usePanelStore.getState().setRightCollapsed(true); onClose(); }} />
    </PreviewEditingPolicyProvider>
    </div>
  </div>;
}
