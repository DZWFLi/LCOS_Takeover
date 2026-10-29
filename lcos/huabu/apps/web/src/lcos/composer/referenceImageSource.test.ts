import { expect, it } from 'vitest';
import { resolveArtifactUrl } from '@/api/artifact';
import { referenceImageSource } from './referenceImageSource';

it('matches the image body source instead of resolving a stale host file', () => {
  expect(referenceImageSource({ presentationMediaSrc: 'https://core.test/revision/image', src: 'old.png' }, 'canvas-a')).toBe('https://core.test/revision/image');
});
it('resolves persisted bare image keys in their canvas and retains blob previews', () => {
  expect(referenceImageSource({ src: 'art_photo.png' }, 'canvas-a')).toBe(resolveArtifactUrl('art_photo.png', 'canvas-a'));
  expect(referenceImageSource({ src: 'blob:pending-image' }, 'canvas-a')).toBe('blob:pending-image');
  expect(referenceImageSource({}, 'canvas-a')).toBeUndefined();
});
