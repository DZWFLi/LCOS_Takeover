import { beforeEach, expect, it } from 'vitest';
import { useLcosReferenceStore } from '../lcosReferenceState';
import { createLcosNodePresentationSeam } from './createLcosNodePresentationSeam';
import { NativeGlythBody } from './NativeGlythBody';

beforeEach(() => useLcosReferenceStore.getState().reset());

it('hosts an actual staged Question as a Glyth without a Core conversation binding', () => {
  const seam = createLcosNodePresentationSeam();
  const input = {
    nodeId: 'native-agent',
    nodeType: 'question',
    data: {
      threadId: 'thread-existing',
      lcosGlythAppearance: { shape: 'cloud', color: 'cyan', motion: 'curious' },
    },
  };
  expect(seam.resolve(input)).toBe(NativeGlythBody);
  expect(seam.resolveHostPresentation?.(input)).toMatchObject({
    surface: 'transparent',
    selectionFeedback: 'body',
    allowOverflow: true,
    intrinsicHeight: true,
  });
});

it('keeps the original Question body for old nodes or an unsupported appearance', () => {
  const seam = createLcosNodePresentationSeam();
  for (const data of [
    { threadId: 'old-thread' },
    {
      lcosGlythAppearance: { shape: 'unknown', color: 'cyan', motion: 'idle' },
    },
  ]) {
    const input = { nodeId: 'native-question', nodeType: 'question', data };
    expect(seam.resolve(input)).not.toBe(NativeGlythBody);
    expect(seam.resolveHostPresentation?.(input)).toBeUndefined();
  }
});
