import { useState } from 'react';

import { nextImageLoadPhase } from './imageLoadPhase';
import './preview-media.css';

import type { ImageLoadPhase } from './imageLoadPhase';
import type { CSSProperties } from 'react';

export interface PreviewMediaProps {
  readonly src?: string;
  readonly label: string;
  /** Supplied presentation metadata. Never infer FIT from title or image dimensions. */
  readonly fit?: 'cover' | 'contain';
  readonly position?: CSSProperties['objectPosition'];
}

/**
 * THIN_ADAPT GEN1 CanvasNodeVisual.ImageObject: load/error/retry + keyed attempt.
 * Native img replaces the donor OCR host; no artifact fetch, store or canvas owner.
 */
function LoadedPreview({ src, label, fit = 'cover', position = '50% 50%' }: PreviewMediaProps & { readonly src: string }): React.JSX.Element {
  const [phase, setPhase] = useState<ImageLoadPhase>('loading');
  const [attempt, setAttempt] = useState(0);
  return <div className="lcos-preview-media" data-image-phase={phase} aria-busy={phase === 'loading' || undefined}>
    {phase === 'error' ? <div className="lcos-preview-media-message" role="status">
      <span>预览读取失败</span>
      <button type="button" aria-label={`重试加载 ${label}`}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          setPhase((current) => nextImageLoadPhase(current, 'retry'));
          setAttempt((current) => current + 1);
        }}>重试</button>
    </div> : <>
      <img key={`${src}#${attempt}`} src={src} alt={label} draggable={false}
        style={{ objectFit: fit, objectPosition: position }}
        onLoad={() => setPhase((current) => nextImageLoadPhase(current, 'load'))}
        onError={() => setPhase((current) => nextImageLoadPhase(current, 'error'))}
        onDragStart={(event) => event.preventDefault()} />
      {phase === 'loading' ? <span className="lcos-preview-media-loading" aria-hidden>读取预览…</span> : null}
    </>}
  </div>;
}

export function PreviewMedia({ src, label, fit, position }: PreviewMediaProps): React.JSX.Element {
  // Identity of media is its supplied source, not title, fabricated revision or timer.
  return src ? <LoadedPreview key={src} src={src} label={label}
      {...(fit === undefined ? {} : { fit })}
      {...(position === undefined ? {} : { position })} />
    : <div className="lcos-preview-media" data-image-phase="unavailable"><span className="lcos-preview-media-message">暂无预览</span></div>;
}
