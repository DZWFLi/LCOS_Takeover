import type { OutlineNode, OutlineSourceSession } from './native-outline-source';

/** Unsaved editor presentation only. Core Markdown remains the document owner. */
export interface NativeMindMapDraftState {
  readonly outlineSession: OutlineSourceSession;
  readonly titleText: string;
  readonly roots: readonly OutlineNode[];
  readonly selected: string | null;
  readonly editing: string | null;
  readonly draft: string;
  readonly clipboard: readonly OutlineNode[] | null;
}

export interface NativeMindMapControls {
  readonly busy: boolean;
  readonly disabled: boolean;
  readonly branchSelected: boolean;
  readonly canPaste: boolean;
  readonly branchCount: number;
  readonly error: string;
  copy(): void;
  cut(): void;
  remove(): void;
  paste(): void;
  cancel(): void;
  save(): void;
}
