import type { ComponentType, ReactNode } from 'react';

/** Browser-local shape of the shipped wa session; no domain data is written here. */
export interface NativeMaterialViewerRuntime {
  open(session: Record<string, unknown>): void;
  close(id: string): boolean;
  getState(): { phase: string; session: { id: string; lcosControlled?: { requestKey?: number } } | null };
  subscribe(listener: (state: ReturnType<NativeMaterialViewerRuntime['getState']>) => void): () => void;
  anchor?(id: string): unknown;
}
export interface NativeMaterialViewerParts {
  ActionBar: ComponentType<{ children?: ReactNode; className?: string }>;
  ActionButton: ComponentType<any>;
  TextBody: ComponentType<{ markdown: string; className?: string; sourceLines?: boolean }>;
  Facts: ComponentType<any>;
  Popover: ComponentType<any>;
}
