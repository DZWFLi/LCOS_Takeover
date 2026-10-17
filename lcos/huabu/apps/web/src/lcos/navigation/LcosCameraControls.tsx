// LcosCameraControls — 画布左下相机浮岛（Figma Global HUD：camera 左下 52；P12 动态视觉）。
// 取代隐藏的 Huabu Controls；通过 shell store camera 命令 → 唯一 Huabu camera。
// zoom 百分比读 RF useViewport（purely presentation）。

import { useViewport } from '@xyflow/react';
import { Maximize2, Minus, Plus } from 'lucide-react';

import { useLcosShellStore } from '../shell/lcosShellStore';
import { LcosCameraControlsView } from '../ui/families/LcosCameraControlsView';

export function LcosCameraControls(): React.JSX.Element {
  const requestCamera = useLcosShellStore((s) => s.requestCamera);
  const { zoom } = useViewport();

  return (
    <LcosCameraControlsView zoom={zoom} className="pointer-events-auto"
      style={{ position: 'absolute', left: 24, bottom: 24, zIndex: 30 }}
      onZoomOut={() => requestCamera('zoom-out')}
      onZoomIn={() => requestCamera('zoom-in')}
      onFit={() => requestCamera('fit')}
      zoomOutIcon={<Minus className="h-4 w-4" />}
      zoomInIcon={<Plus className="h-4 w-4" />}
      fitIcon={<Maximize2 className="h-4 w-4" />} />
  );
}
