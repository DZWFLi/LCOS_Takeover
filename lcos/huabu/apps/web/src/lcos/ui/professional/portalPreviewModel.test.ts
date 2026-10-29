import { describe, expect, it } from 'vitest';

import { portalPreviewPresentation } from './portalPreviewModel';

describe('portal Figma six-state matrix', () => {
  it('does not invent retry on partial preview', () => {
    expect(portalPreviewPresentation('部分预览')).toMatchObject({ footer: '只展示部分内容', showsScene: true, showsZoom: true, showsRetry: false });
  });

  it('keeps stale preview visible while exposing retry', () => {
    expect(portalPreviewPresentation('旧缓存')).toMatchObject({ footer: '显示上次预览', showsScene: true, showsRetry: true });
  });

  it('keeps missing target identity but disables open', () => {
    expect(portalPreviewPresentation('目标缺失')).toMatchObject({ footer: '目标不可用', stageTitle: '目标缺失', openDisabled: true, showsRetry: true });
  });
});
