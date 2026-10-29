export type PortalPreviewVisualState = '可预览' | '加载中' | '旧缓存' | '部分预览' | '预览失败' | '目标缺失';

export interface PortalPreviewPresentation {
  readonly footer: string;
  readonly stageTitle?: string;
  readonly stageDetail?: string;
  readonly showsScene: boolean;
  readonly showsZoom: boolean;
  readonly showsRetry: boolean;
  readonly openDisabled: boolean;
}

export function portalPreviewPresentation(state: PortalPreviewVisualState): PortalPreviewPresentation {
  switch (state) {
    case '加载中':
      return { footer: '读取中', stageTitle: '加载中', stageDetail: '正在读取目标预览…', showsScene: false, showsZoom: false, showsRetry: false, openDisabled: false };
    case '旧缓存':
      return { footer: '显示上次预览', showsScene: true, showsZoom: true, showsRetry: true, openDisabled: false };
    case '部分预览':
      return { footer: '只展示部分内容', showsScene: true, showsZoom: true, showsRetry: false, openDisabled: false };
    case '预览失败':
      return { footer: '读取失败', stageTitle: '预览失败', stageDetail: '目标身份仍在，可以重新读取。', showsScene: false, showsZoom: false, showsRetry: true, openDisabled: false };
    case '目标缺失':
      return { footer: '目标不可用', stageTitle: '目标缺失', stageDetail: '保留此入口，请检查目标。', showsScene: false, showsZoom: false, showsRetry: true, openDisabled: true };
    case '可预览':
    default:
      return { footer: '只读预览', showsScene: true, showsZoom: true, showsRetry: false, openDisabled: false };
  }
}
