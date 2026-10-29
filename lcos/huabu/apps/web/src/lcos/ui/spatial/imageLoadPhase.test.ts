import { describe, expect, it } from 'vitest';

import { nextImageLoadPhase } from './imageLoadPhase';

import type { ImageLoadPhase } from './imageLoadPhase';

describe('GEN1 image phase donor', () => {
  for (const phase of ['loading', 'ready', 'error'] satisfies ImageLoadPhase[]) {
    it(`preserves load/error/retry/reset from ${phase}`, () => {
      expect(nextImageLoadPhase(phase, 'load')).toBe('ready');
      expect(nextImageLoadPhase(phase, 'error')).toBe('error');
      expect(nextImageLoadPhase(phase, 'retry')).toBe('loading');
      expect(nextImageLoadPhase(phase, 'reset')).toBe('loading');
    });
  }
});
