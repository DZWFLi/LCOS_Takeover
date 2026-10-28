import { useSyncExternalStore } from 'react';
import { useLcosShellStore } from '../../lcos/huabu/apps/web/src/lcos/shell/lcosShellStore';
import useCanvasStore from './native-canvas-port';
import type { LcosConversationReference } from './native-agent-ui';

// The existing selected-conversation UI address, shared without importing the
// entire chat renderer. No session, message, or draft data lives here.
let selected: LcosConversationReference | null = null;
const listeners = new Set<() => void>();
export function selectNativeConversation(reference: LcosConversationReference | null) {
  if (selected?.projectId !== reference?.projectId || selected?.connectedConversationId !== reference?.connectedConversationId) {
    const shell = useLcosShellStore.getState();
    if (!reference || shell.projectId !== reference.projectId || shell.composerTarget?.receiverConversationId !== reference.connectedConversationId) shell.closeComposer();
  }
  selected = reference; listeners.forEach(listener => listener());
}
export function useNativeConversationSelection() {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => selected);
}
export function readNativeConversationSelection() { return selected; }
export function restoreNativeConversationSelection(reference: LcosConversationReference | null, projectId: string, canvasId: string): boolean {
  const live = useCanvasStore.getState();
  if (useLcosShellStore.getState().projectId !== projectId || live.canvasId !== canvasId
    || reference && (reference.projectId !== projectId || reference.canvasId !== canvasId)) return false;
  selectNativeConversation(reference); return true;
}
