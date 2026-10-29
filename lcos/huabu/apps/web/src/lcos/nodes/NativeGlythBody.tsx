import { useLcosNodePresentation } from '@/lcos-seam/nodePresentation';
import useCanvasStore from '@/store/canvasStore';
import { GlythBodyView } from '../ui/glyth/GlythBodyView';
import {
  appearanceKey,
  readGlythAppearance,
} from '../ui/glyth/glythAppearance';
import { glythBodyLayout } from '../ui/glyth/glythBodyLayout';
import './creation/glyth-creation.css';
import type { CanvasNodeBodySlotInput } from '@/lcos-seam/types';

/** Native Question keeps its genuine thread and agent binding; only its body is a Glyth. */
export function NativeGlythBody(input: CanvasNodeBodySlotInput) {
  const canvasId = useCanvasStore((state) => state.canvasId);
  const selected = useCanvasStore(
    (state) =>
      state.nodes.find((node) => node.id === input.nodeId)?.selected === true,
  );
  const pinnedHeight = useCanvasStore(
    (state) =>
      typeof state.nodes.find((node) => node.id === input.nodeId)?.style
        ?.height === 'number',
  );
  const appearance = readGlythAppearance(input.data.lcosGlythAppearance);
  const label =
    typeof input.data.label === 'string' ? input.data.label : 'Glyth';
  const presentation = useLcosNodePresentation();
  // A Question has text-driven auto height. Its hosted visual body instead supplies
  // an intrinsic 121:142 footprint; percent heights would feed a shrinking measured
  // height back into the native wrapper after reload. Explicit native resizing wins.
  const height = pinnedHeight
    ? (presentation?.worldHeight ?? 142)
    : ((presentation?.worldWidth ?? 121) * 142) / 121;
  const body = glythBodyLayout(
    presentation?.worldWidth,
    height,
    presentation?.zoom,
  );
  return (
    <div
      className="lcos-native-glyth"
      data-lcos-native-glyth
      data-lcos-native-glyth-appearance={
        appearance ? appearanceKey(appearance) : undefined
      }
      data-lcos-native-glyth-canvas={canvasId}
      data-lcos-glyth-thread={String(input.data.threadId ?? '')}
      style={{ height }}
      role="button"
      tabIndex={0}
      aria-label={`打开 ${label} 对话`}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.dispatchEvent(
            new MouseEvent('dblclick', { bubbles: true, cancelable: true }),
          );
        }
      }}
    >
      <GlythBodyView
        pose={input.data.status === 'running' ? 'working' : 'idle'}
        selected={selected}
        {...(appearance ? { appearance } : {})}
        size={body.size}
        left={body.left}
        top={body.top}
      />
      <span
        className="lcos-native-glyth-label"
        style={{
          top: body.labelTop,
          fontSize: body.labelSize,
          lineHeight: `${body.labelLeading}px`,
        }}
        title={label}
      >
        {label}
      </span>
    </div>
  );
}
