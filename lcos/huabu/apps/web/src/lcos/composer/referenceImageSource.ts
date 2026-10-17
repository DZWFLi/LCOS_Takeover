import { resolveArtifactUrl } from '@/api/artifact';

/** Same source precedence as the bound image body; never changes reference identity. */
export function referenceImageSource(data: Readonly<Record<string, unknown>>, canvasId?: string): string | undefined {
  if (typeof data.presentationMediaSrc === 'string' && data.presentationMediaSrc !== '') return data.presentationMediaSrc;
  return typeof data.src === 'string' && data.src !== '' ? resolveArtifactUrl(data.src, canvasId) : undefined;
}
