import { useReactFlow, useStore } from '@xyflow/react';
import { Hand, Lasso, MousePointer2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { createPortal } from 'react-dom';
import { CREATION_HOST_CHANGED, CREATION_FINISHED } from './creationPresentationHost';
import { Button } from '@/components/Common/Button';
import { NODE_ICON } from '@/config/nodeIcons';
import { CANVAS_CREATION_TOOLS, useCanvasCreationTools, type CanvasTool } from '@/hooks/useCanvasCreationTools';
import useCanvasStore from '@/store/canvasStore';

import { GlythCreationSlot } from './GlythCreationSlot';
import { createProjectResultSlot } from './projectResultSlot';
import { useLcosShellStore } from '../../shell/lcosShellStore';
import { CanvasNodeRenameEntry } from '../CanvasNodeRenameEntry';
import { isOwnPresentationHidden, setNodePresentationsHidden } from '../nodePresentationVisibility';
import './canvas-creation.css';

/** Product entry into Huabu's existing click/draw-to-place mechanics. */
export function LcosCanvasCreationMenu({ activeTool, onToolChange, disabled = false }: {
  readonly activeTool: CanvasTool;
  readonly onToolChange: (tool: CanvasTool) => void;
  readonly disabled?: boolean;
}): React.JSX.Element {
  const { pendingNodeType, chooseCreation, chooseTool, blocked } = useCanvasCreationTools({ onToolChange, disabled });
  const [open, setOpen] = useState(false);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const canvasElement = useStore(state => state.domNode);
  useEffect(() => {
    const set = (element: HTMLElement | null) => { setHost(element); if (element) setOpen(true); };
    set(document.querySelector<HTMLElement>('[data-lcos-creation-tools-host]'));
    const changed = (event: Event) => set((event as CustomEvent<HTMLElement | null>).detail);
    document.addEventListener(CREATION_HOST_CHANGED, changed);
    return () => document.removeEventListener(CREATION_HOST_CHANGED, changed);
  }, []);
  const close = () => { setOpen(false); host?.dispatchEvent(new Event(CREATION_FINISHED)); };
  const hiddenCount = useCanvasStore((state) => state.nodes.filter(isOwnPresentationHidden).length);
  const rf = useReactFlow();
  const [slotBusy, setSlotBusy] = useState(false);
  const [slotNotice, setSlotNotice] = useState('');
  return <><CanvasNodeRenameEntry disabled={blocked} />
    {host && open && !blocked && createPortal(<div className="lcos-canvas-creation-popover" data-lcos-canvas-creation data-floating-chrome>
      <GlythCreationSlot disabled={blocked} canvasElement={() => canvasElement} onCreated={close} />
      <div role="menu" aria-label="创建节点">
        {CANVAS_CREATION_TOOLS.map(({ type, label, shortcut }) => {
          const NodeIcon = NODE_ICON[type];
          return <Button key={type} role="menuitemradio" variant="ghost" aria-label={`创建${label}`}
            data-lcos-create-type={type} aria-checked={pendingNodeType === type}
            onClick={() => { chooseCreation(type); close(); }}><NodeIcon /><span>{label}</span><kbd>{shortcut}</kbd></Button>;
        })}
        <div className="lcos-canvas-creation-divider" />
        <Button role="menuitem" variant="ghost" disabled={slotBusy} data-lcos-create-result-slot onClick={() => {
          if (slotBusy) return;
          const shell = useLcosShellStore.getState(), canvas = useCanvasStore.getState();
          const projectId = shell.projectId, canvasId = canvas.canvasId;
          if (!projectId || !canvasId || !shell.activeWorkspaceId) { setSlotNotice('当前项目现场尚未就绪。'); return; }
          const workspaceId = shell.activeWorkspaceId;
          const rect = canvasElement?.getBoundingClientRect();
          if (!rect) return;
          const position = rf.screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
          setSlotBusy(true); setSlotNotice('');
          void createProjectResultSlot({projectId,canvasId,workspaceId,position}).then(({nodeId}) => {
            if (nodeId) close(); else setSlotNotice('空白结果已保存，等待原画布投影。');
          }).catch((error: unknown) => setSlotNotice(error instanceof Error ? error.message : '创建尚未确认，请先核对已有结果位。'))
            .finally(() => setSlotBusy(false));
        }}>空白结果位</Button>
        {slotNotice && <span role="status" className="text-xs">{slotNotice}</span>}
        {([{ type: 'select', label: '选择', key: 'S', Icon: MousePointer2 },
          { type: 'pan', label: '平移', key: 'P', Icon: Hand },
          { type: 'lasso', label: '套索', key: 'L', Icon: Lasso }] as const).map(({ type, label, key, Icon: ToolIcon }) =>
          <Button key={type} role="menuitemradio" variant="ghost" aria-label={label} aria-checked={!pendingNodeType && activeTool === type}
            onClick={() => { chooseTool(type); close(); }}><ToolIcon /><span>{label}</span><kbd>{key}</kbd></Button>)}
        {hiddenCount > 0 && <>
          <div className="lcos-canvas-creation-divider" />
          <Button role="menuitem" variant="ghost" data-lcos-restore-presentations
            onClick={() => {
              const state = useCanvasStore.getState();
              setNodePresentationsHidden(state, state.nodes.filter(isOwnPresentationHidden).map((node) => node.id), false);
              close();
            }}>恢复隐藏的表征 · {hiddenCount}</Button>
        </>}
      </div>
    </div>, host)}
  </>;
}
