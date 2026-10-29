// Figma 5386:274 定义52×48收起态；展开态保留现有生产命令，不重新裁决相机。
import { FigmaShellGlyph } from '../FigmaShellGlyph';
import { LcosIconButton } from '../primitives/LcosIconButton';

import type { CSSProperties, ReactNode } from 'react';

export interface LcosCameraControlsViewProps {
  readonly zoom: number;
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly onZoomOut: () => void;
  readonly onZoomIn: () => void;
  readonly onFit: () => void;
  /** 原有图标 primitive 由现有 container 注入，不自行重画。 */
  readonly zoomOutIcon: ReactNode;
  readonly zoomInIcon: ReactNode;
  readonly fitIcon: ReactNode;
  readonly compact?: { readonly expanded: boolean; readonly onToggle: () => void };
  readonly disabled?: boolean;
}
export function LcosCameraControlsView({ zoom, onZoomOut, onZoomIn, onFit,
  zoomOutIcon, zoomInIcon, fitIcon, compact, disabled = false, className, style,
}: LcosCameraControlsViewProps): React.JSX.Element {
  const collapsed = compact !== undefined && !compact.expanded;
  return <div data-lcos-camera-controls data-lcos-family="camera-controls"
    data-lcos-camera-collapsed={collapsed ? 'true' : 'false'} className={className} style={style}>
    {collapsed ? <LcosIconButton type="button" aria-label="展开相机控件" aria-expanded={false}
      disabled={disabled} onClick={compact.onToggle}><FigmaShellGlyph name="grid" size={17} /></LcosIconButton> : <>
      <LcosIconButton type="button" aria-label="缩小" title="缩小" disabled={disabled} onClick={onZoomOut}>{zoomOutIcon}</LcosIconButton>
      <span data-lcos-camera-zoom>{Math.round(zoom * 100)}%</span>
      <LcosIconButton type="button" aria-label="放大" title="放大" disabled={disabled} onClick={onZoomIn}>{zoomInIcon}</LcosIconButton>
      <span data-lcos-camera-separator aria-hidden />
      <LcosIconButton type="button" aria-label="适合画面" title="适合画面" disabled={disabled} onClick={onFit}>{fitIcon}</LcosIconButton>
      {compact && <LcosIconButton type="button" aria-label="收起相机控件" aria-expanded onClick={compact.onToggle}>
        <FigmaShellGlyph name="grid" size={17} />
      </LcosIconButton>}
    </>}
  </div>;
}
