import { createContext, useContext, type ReactNode } from 'react';
import type { PresentationDensity } from '../../lcos/apps/web-gen2/src/presentation/nodePresentation.ts';

export type NativeTextViewMenuItem = { key: string; label: string; disabled?: boolean; handle: () => void };
export interface NativeTextNodeState {
  nodeId: string; eligible: boolean; editable: boolean; mode: 'text' | 'mindmap';
  body: string; title: string; density: PresentationDensity;
  ready: boolean; readError?: string; notice: string; pending: boolean; hasUnsavedDraft: boolean; zoom: number; worldWidth: number;
  collapsed: readonly string[]; onToggle(id: string): void; reread(): void;
  menuItems: readonly NativeTextViewMenuItem[];
}

/** One original r4/s4 occurrence owns this context. It has no DOM, global
 * registry, persistence, history, queue or independently fetched text. */
export const NativeTextNodeContext = createContext<NativeTextNodeState | null>(null);

/** Extend rBe's original iBe groups before xl/zde/JT own the one toolbar.
 * All original groups and handles retain their identities and ordering. */
export function LCOSUseNativeTextTools(nodeId: string, original: readonly (readonly any[])[], nativeIcon: ReactNode) {
  const state = useContext(NativeTextNodeContext);
  if (!state || state.nodeId !== nodeId || !state.eligible || !state.editable) return original;
  return [...original, [{ key: 'native-first-view', buttonType: 'more', node: nativeIcon,
    tooltip: `查看方式 · ${state.mode === 'mindmap' ? '导图' : '正文'}`,
    dataTestId: 'lcos-native-text-view-menu', showBadge: state.pending || state.hasUnsavedDraft,
    menuItems: state.menuItems }]];
}
