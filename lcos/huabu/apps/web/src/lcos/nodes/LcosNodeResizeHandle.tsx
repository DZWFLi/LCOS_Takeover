import { NodeResizeControl, ResizeControlVariant } from '@xyflow/react';

import type { ComponentProps, CSSProperties } from 'react';
import './node-resize-handle.css';

type ResizeProps = Pick<ComponentProps<typeof NodeResizeControl>,
  'minWidth' | 'minHeight' | 'keepAspectRatio' | 'onResizeStart' | 'onResize' | 'onResizeEnd'>;

const corners = ['top-left', 'top-right', 'bottom-right', 'bottom-left'] as const;
const sides = ['top', 'right', 'bottom', 'left'] as const;

/** Lovart's 2026-09-04 canvas demo: thin outline, four small visible corners,
 * larger invisible hit regions and width-only text handles. React Flow keeps
 * the existing Huabu resize lifecycle; no tldraw state/geometry is imported. */
export function LcosNodeResizeHandle({ nodeId, zoom, nodeType, touch, ...props }: ResizeProps & {
  readonly nodeId: string;
  readonly zoom: number;
  readonly nodeType: string;
  readonly touch: boolean;
}): React.JSX.Element {
  const scale = 1 / Math.max(0.1, zoom);
  const text = nodeType === 'text';
  const hit = (touch ? 36 : 18) * scale;
  const style = {
    '--lcos-resize-border': `${1.5 * scale}px`, '--lcos-resize-size': `${7 * scale}px`,
    '--lcos-text-resize-height': `${16 * scale}px`,
  } as CSSProperties;
  return <>{!text && corners.map(position => <NodeResizeControl {...props} key={position}
    nodeId={nodeId} position={position} autoScale={false}
    className="lcos-node-resize-control lcos-node-resize-corner nodrag nopan"
    style={{ ...style, width: hit, height: hit }}>
    <span data-lcos-node-resize={nodeId} aria-label="拖动调整节点大小" />
  </NodeResizeControl>)}
    {(text ? ['left', 'right'] as const : sides).map(position => <NodeResizeControl {...props} key={position}
      nodeId={nodeId} position={position} variant={ResizeControlVariant.Line} autoScale={false}
      {...(text ? { resizeDirection: 'horizontal' as const } : {})}
      className={`lcos-node-resize-control lcos-node-resize-side ${text ? 'lcos-node-resize-text' : ''} nodrag nopan`}
      style={{ ...style, [position === 'left' || position === 'right' ? 'width' : 'height']: (touch ? 20 : 10) * scale }}>
      {text && <span data-lcos-node-resize={nodeId} aria-label="拖动调整文本宽度" />}
    </NodeResizeControl>)}
  </>;
}
