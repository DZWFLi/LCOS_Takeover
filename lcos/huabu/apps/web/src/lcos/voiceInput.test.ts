import { describe, expect, it } from 'vitest';

import { mergeVoiceText } from './voiceInput';

describe('mergeVoiceText', () => {
  it('replaces the selected text and returns the new caret', () => {
    expect(mergeVoiceText('用旧词继续', '新词', { start: 1, end: 3 })).toEqual({
      text: '用新词继续',
      caret: 3,
    });
  });

  it('inserts at a collapsed caret without losing the surrounding draft', () => {
    expect(mergeVoiceText('甲乙', '丙', { start: 1, end: 1 })).toEqual({
      text: '甲丙乙',
      caret: 2,
    });
  });

  it('appends with a separating space when the editor was already blurred', () => {
    expect(mergeVoiceText('已有草稿', '补充内容')).toEqual({
      text: '已有草稿 补充内容',
      caret: 9,
    });
  });

  it('does not add an extra space after a trailing newline', () => {
    expect(mergeVoiceText('已有草稿\n', '补充内容')).toEqual({
      text: '已有草稿\n补充内容',
      caret: 9,
    });
  });
});
