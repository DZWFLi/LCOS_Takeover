import { composerInputKey } from './composerInputJourney';
import type { LcosComposerTarget, LcosWindow } from '../shell/lcosShellStore';

/** Presentation only. Match visible window bodies using their existing ownership rules. */
export function composerHasVisibleWindowOwner(
  target: LcosComposerTarget | null,
  windows: readonly LcosWindow[],
  visibleWindowIds: readonly string[],
): boolean {
  if (target === null) return false;
  const assemblyIntent = target.nodeId.startsWith('assembly:');
  return visibleWindowIds.some((windowId) => {
    const activeWindow = windows.find((window) => window.id === windowId);
    if (activeWindow === undefined) return false;
    if (assemblyIntent) return false;
    return activeWindow.bodyKey === 'conversation'
      && target.receiverConversationId !== undefined
      && activeWindow.target === target.receiverConversationId;
  });
}

/** Assembly is a source bay. It never takes the input away from its object. */
export function assemblyBorrowsComposer(_target: LcosComposerTarget | null, _windows: readonly LcosWindow[], _visibleIds: readonly string[]): boolean {
  return false;
}

/** Collecting materials keeps the original input available as a live drop receiver. */
export function composerHasAssemblyJourney(target: LcosComposerTarget | null, windows: readonly LcosWindow[], visibleIds: readonly string[]): boolean {
  const key = composerInputKey(target);
  return key !== undefined && windows.some((window) => window.bodyKey === 'assembly'
    && window.composerOriginKey === key && visibleIds.includes(window.id));
}
