// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';

import { fitComposerTextarea } from './fitComposerTextarea';

describe('GEN1 bounded Composer editor sizing', () => {
  it.each([[0, '60px', 'hidden'], [60, '60px', 'hidden'], [72, '72px', 'hidden'], [80, '80px', 'hidden'], [300, '80px', 'auto']])(
    'measures content height %s without unbounded growth', (height, expected, overflow) => {
      const editor = document.createElement('textarea');
      Object.defineProperty(editor, 'scrollHeight', { value: height, configurable: true });
      editor.value = 'Current real draft';
      fitComposerTextarea(editor);
      expect(editor.style.height).toBe(expected);
      expect(editor.style.overflowY).toBe(overflow);
      expect(editor.value).toBe('Current real draft');
    },
  );
  it('allows the same editor to shrink without clearing its draft', () => {
    const editor = document.createElement('textarea');
    Object.defineProperty(editor, 'scrollHeight', { value: 500, configurable: true });
    fitComposerTextarea(editor);
    Object.defineProperty(editor, 'scrollHeight', { value: 20, configurable: true });
    fitComposerTextarea(editor);
    expect(editor.style.height).toBe('60px');
    expect(editor.style.overflowY).toBe('hidden');
  });
});
