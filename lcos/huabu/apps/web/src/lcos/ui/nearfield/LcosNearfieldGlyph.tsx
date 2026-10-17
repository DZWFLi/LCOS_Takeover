import at from './assets/at.svg';
import attach from './assets/attach.svg';
import close from './assets/close.svg';
import document from './assets/document.svg';
import more from './assets/more.svg';
import send from './assets/send.svg';
import { TapnowMicrophone, TapnowInsertFromCanvasIcon } from '../professional/donor/TapnowPresentationParts';

import type { CSSProperties, JSX } from 'react';

const GLYPHS = { attach, at, close, document, more, send } as const;
export type LcosNearfieldGlyphName = keyof typeof GLYPHS | 'microphone' | 'insert-canvas';

/** Exact Figma exports; monochrome masks follow the host's existing theme. */
export function LcosNearfieldGlyph({
  name,
  size = 20,
}: {
  readonly name: LcosNearfieldGlyphName;
  readonly size?: number;
}): JSX.Element {
  if (name === 'microphone') return <span aria-hidden="true"><TapnowMicrophone size={size} /></span>;
  if (name === 'insert-canvas') return <TapnowInsertFromCanvasIcon size={size} />;
  const style: CSSProperties = {
    width: size,
    height: size,
    display: 'inline-block',
    flexShrink: 0,
    backgroundColor: 'currentColor',
    maskImage: `url("${GLYPHS[name]}")`,
    WebkitMaskImage: `url("${GLYPHS[name]}")`,
    maskSize: '100% 100%',
    WebkitMaskSize: '100% 100%',
    maskRepeat: 'no-repeat',
    WebkitMaskRepeat: 'no-repeat',
  };
  return <span data-lcos-nearfield-glyph={name} style={style} aria-hidden="true" />;
}
