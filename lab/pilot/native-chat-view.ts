import type { ComponentType, ReactNode } from 'react';

export interface NativeChatViewAction {
  readonly id: string; readonly label: string; readonly icon?: ReactNode;
  readonly disabled?: boolean; readonly destructive?: boolean; onSelect(): void;
}
export interface NativeChatHeaderViewProps {
  title: string; activeSessionId?: string;
  entries: readonly { id: string; title: string; updatedAt: string }[];
  historyState: 'loading' | 'ready' | 'error'; actions: readonly NativeChatViewAction[];
  onSelectConversation(id: string): void; onNewConversation?: () => void; newConversationLabel?: string;
  onCanvasAssistant(): void; onClose(): void; onToggleArtifactPanel(): void;
  artifactPanelOpen: boolean; panelLabel: string; panelIcon?: ReactNode;
}
export interface NativeTaskListViewProps {
  title: string; state: 'waiting' | 'loading' | 'ready' | 'error'; message?: string;
  items: readonly { id: string; title: string; secondary: string; runStatus: string; dispatchStatus: string }[];
  actions: readonly NativeChatViewAction[]; onSelect(id: string): void;
}
export type NativeChatFrameView = ComponentType<{ isOpen: boolean; header: ReactNode; children: ReactNode; composer: ReactNode }> & {
  Header: ComponentType<NativeChatHeaderViewProps>; List: ComponentType<NativeTaskListViewProps>;
};
