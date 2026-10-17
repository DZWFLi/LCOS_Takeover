// Host binding only. Compiled donor bodies are copied verbatim in the .mjs file.
import * as jsxRuntime from 'react/jsx-runtime';
import { clsx as classNames } from 'clsx';
import { createTapnowIcons, createTapnowPresentationParts } from './tapnow-presentation-parts.mjs';
export const { MediaBackdrop: TapnowMediaBackdrop, StructuredFields: TapnowStructuredFields,
  InlineHighlight: TapnowInlineHighlight, fileBasename: tapnowFileBasename,
  FieldLabel: TapnowFieldLabel,
  SuccessStatus: TapnowSuccessStatus, formatMediaTime: tapnowFormatMediaTime } = createTapnowPresentationParts({ jsxRuntime, classNames });
export const { MicrophoneOutline: TapnowMicrophone, InsertFromCanvasIcon: TapnowInsertFromCanvasIcon } = createTapnowIcons({ jsxRuntime, classNames });
