import { useReactFlow } from '@xyflow/react';
import { RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import useCanvasStore from '@/store/canvasStore';
import { createGlythAtPoint, occupiedGlythAppearances } from './glythCreation';
import { useLcosShellStore } from '../../shell/lcosShellStore';
import { GlythBodyView } from '../../ui/glyth/GlythBodyView';
import {
  appearanceKey,
  nextGlythAppearance,
  type GlythAppearance,
} from '../../ui/glyth/glythAppearance';
import { SpectralMaterial } from '../../ui/materials/SpectralMaterial';
import './glyth-creation.css';
const MIME = 'application/x-lcos-glyth-template';
interface PendingDrag {
  projectId: string;
  canvasId: string;
  appearance: GlythAppearance;
}

export function GlythCreationSlot({
  canvasElement,
  disabled,
  onCreated,
}: {
  readonly canvasElement: () => HTMLElement | null;
  readonly disabled: boolean;
  readonly onCreated: () => void;
}) {
  const rf = useReactFlow();
  const [candidate, setCandidate] = useState(() =>
    nextGlythAppearance(occupiedGlythAppearances()),
  );
  const [notice, setNotice] = useState('');
  const [dragging, setDragging] = useState(false);
  const ticket = useRef<PendingDrag | null>(null);
  const live = useRef({ rf, disabled, onCreated, canvasElement });
  live.current = { rf, disabled, onCreated, canvasElement };
  const nodes = useCanvasStore((state) => state.nodes);
  const refresh = () => {
    setCandidate((current) =>
      nextGlythAppearance(occupiedGlythAppearances(), current),
    );
    setNotice('');
  };
  useEffect(() => {
    if (ticket.current || !candidate) return;
    if (
      occupiedGlythAppearances().some(
        (item) => appearanceKey(item) === appearanceKey(candidate),
      )
    )
      refresh();
  }, [nodes, candidate]);
  useEffect(() => {
    const validTarget = (target: EventTarget | null) => {
      const canvas = live.current.canvasElement();
      return (
        canvas &&
        target instanceof Element &&
        canvas.contains(target) &&
        !target.closest(
          '.react-flow__node,.react-flow__panel,[data-floating-chrome],[data-lcos-canvas-creation]',
        )
      );
    };
    const over = (event: DragEvent) => {
      if (
        ticket.current &&
        !live.current.disabled &&
        validTarget(event.target)
      ) {
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
      }
    };
    const drop = (event: DragEvent) => {
      const drag = ticket.current;
      if (!drag) return;
      ticket.current = null;
      setDragging(false);
      if (
        live.current.disabled ||
        !validTarget(event.target) ||
        !event.dataTransfer?.types.includes(MIME)
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (
        occupiedGlythAppearances().some(
          (item) => appearanceKey(item) === appearanceKey(drag.appearance),
        )
      ) {
        setNotice('这个形象刚被使用了，刷新后再放置。');
        return;
      }
      try {
        createGlythAtPoint({
          ...drag,
          position: live.current.rf.screenToFlowPosition({
            x: event.clientX,
            y: event.clientY,
          }),
        });
        live.current.onCreated();
      } catch (error) {
        setNotice(
          error instanceof Error ? error.message : '未能放置，请重试。',
        );
      }
    };
    document.addEventListener('dragover', over, true);
    document.addEventListener('drop', drop, true);
    return () => {
      ticket.current = null;
      document.removeEventListener('dragover', over, true);
      document.removeEventListener('drop', drop, true);
    };
  }, []);
  const placeFromKeyboard = () => {
    const canvas = canvasElement(),
      state = useCanvasStore.getState(),
      projectId = useLcosShellStore.getState().projectId;
    if (disabled || !candidate || !canvas || !state.canvasId || !projectId)
      return;
    const rect = canvas.getBoundingClientRect();
    try {
      createGlythAtPoint({
        projectId,
        canvasId: state.canvasId,
        appearance: candidate,
        position: rf.screenToFlowPosition({
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        }),
      });
      onCreated();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '未能放置，请重试。');
    }
  };
  return (
    <section aria-label="添加智能体" data-lcos-glyth-staging>
      <SpectralMaterial className="lcos-glyth-staging">
        <div className="lcos-soft-underlight-surface">
          <div className="lcos-glyth-staging-heading">
            <strong>添加智能体</strong>
            <button
              type="button"
              aria-label="刷新智能体形象"
              title="换一个形象"
              disabled={disabled || dragging}
              onClick={refresh}
            >
              <RefreshCw size={14} />
            </button>
          </div>
          {candidate ? (
            <button
              type="button"
              className="lcos-glyth-staging-body"
              aria-label="拖动 Glyth 到画布，或按 Enter 在画布中央创建"
              data-lcos-glyth-candidate={appearanceKey(candidate)}
              disabled={disabled}
              draggable={!disabled}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  event.stopPropagation();
                  placeFromKeyboard();
                }
              }}
              onDragStart={(event) => {
                const canvas = useCanvasStore.getState(),
                  projectId = useLcosShellStore.getState().projectId;
                if (disabled || !canvas.canvasId || !projectId) {
                  event.preventDefault();
                  return;
                }
                ticket.current = {
                  projectId,
                  canvasId: canvas.canvasId,
                  appearance: candidate,
                };
                setDragging(true);
                event.dataTransfer.effectAllowed = 'copy';
                event.dataTransfer.setData(MIME, 'pending-agent');
                const svg = event.currentTarget.querySelector('svg');
                if (svg) event.dataTransfer.setDragImage(svg, 42, 42);
              }}
              onDragEnd={() => {
                ticket.current = null;
                setDragging(false);
              }}
            >
              <GlythBodyView
                pose="idle"
                appearance={candidate}
                size={84}
                left={0}
                top={0}
              />
            </button>
          ) : (
            <p role="status">当前形象组合已用完。</p>
          )}
          <span className="lcos-glyth-staging-caption">选好形象，拖入画布</span>
          {notice && (
            <p role="status" className="lcos-glyth-staging-notice">
              {notice}
            </p>
          )}
        </div>
      </SpectralMaterial>
    </section>
  );
}
