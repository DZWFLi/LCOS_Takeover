import type { ComponentType, ReactNode } from 'react';
import type * as runtime from 'react/jsx-runtime';
import type { clsx } from 'clsx';
type Dependencies = { jsxRuntime: typeof runtime; classNames: typeof clsx };
export function createTapnowPresentationParts(dependencies: Dependencies): {
  MediaBackdrop: ComponentType;
  VideoBackdrop: ComponentType;
  StructuredFields: ComponentType<{ fields: readonly { name: string; value: ReactNode }[] }>;
  fileBasename: (path: string) => string;
  InlineHighlight: ComponentType<{ text: string; keyword?: string }>;
  FieldLabel: ComponentType<{ label: string; labelSuffix?: string; required?: boolean; fill?: boolean; children: ReactNode; className?: string }>;
  SuccessStatus: ComponentType<{ label: string }>;
  formatMediaTime: (seconds: number) => string;
};
export function createTapnowIcons(dependencies: Dependencies): {
  MicrophoneSolid: ComponentType<{ size?: number; className?: string }>;
  MicrophoneOutline: ComponentType<{ size?: number; className?: string }>;
  InsertFromCanvasIcon: ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
};
