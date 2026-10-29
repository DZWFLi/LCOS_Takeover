// Adopted from Microsoft Huabu CanvasToolbar.tsx (MIT): placement/tool
// shortcuts remain available when product chrome replaces the native toolbar.
import { useCallback, useEffect } from 'react';

import { resolveCanvasToolShortcut } from '@/components/Panels/Canvas/canvasInputPolicy';
import { matchesShortcut } from '@/config/shortcuts';
import { isEditableTarget } from '@/hooks/shortcuts';
import { useIsNotMouse } from '@/hooks/useInputMode';
import { useAnyGlobalModalOpen } from '@/store/globalModalUi';
import { useToolStore } from '@/store/toolStore';

export type CanvasTool = 'select' | 'pan' | 'lasso';
export type CanvasCreationType = 'note' | 'text' | 'frame' | 'sketch' | 'question';
export const CANVAS_CREATION_TOOLS = [
  { type: 'note', shortcut: '1', label: '笔记' },
  { type: 'text', shortcut: '2', label: '文本' },
  { type: 'frame', shortcut: '3', label: '分组框' },
  { type: 'sketch', shortcut: '4', label: '绘制' },
  { type: 'question', shortcut: 'A', label: '提问' },
] as const;

/** Shared native mechanics, with no canvas data or layout owner. */
export function useCanvasCreationTools({ onToolChange, disabled = false }: {
  readonly onToolChange: (tool: CanvasTool) => void;
  readonly disabled?: boolean;
}) {
  const pendingNodeType = useToolStore((state) => state.pendingNodeType);
  const setPendingNodeType = useToolStore((state) => state.setPendingNodeType);
  const setSketchDraft = useToolStore((state) => state.setSketchDraft);
  const isNotMouse = useIsNotMouse();
  const modalOpen = useAnyGlobalModalOpen();
  const blocked = disabled || modalOpen;
  const chooseTool = useCallback((tool: CanvasTool) => {
    if (blocked) return;
    setPendingNodeType(null);
    onToolChange(tool);
  }, [blocked, onToolChange, setPendingNodeType]);
  const chooseCreation = useCallback((type: CanvasCreationType) => {
    if (blocked) return;
    if (type === 'sketch') setSketchDraft({ mode: 'draw' });
    onToolChange('select');
    setPendingNodeType(pendingNodeType === type ? null : type);
  }, [blocked, onToolChange, pendingNodeType, setPendingNodeType, setSketchDraft]);

  useEffect(() => {
    if (blocked) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.keyCode === 229
        || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey
        || isEditableTarget(event.target)) return;
      const tool = matchesShortcut(event, 'tool.select') ? 'select'
        : matchesShortcut(event, 'tool.pan') ? resolveCanvasToolShortcut('pan', isNotMouse)
        : matchesShortcut(event, 'tool.lasso') ? 'lasso' : undefined;
      if (tool) { event.preventDefault(); chooseTool(tool); return; }
      const creation = CANVAS_CREATION_TOOLS.find(({ type }) => matchesShortcut(event, `mode.${type}`));
      if (creation) { event.preventDefault(); chooseCreation(creation.type); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [blocked, chooseCreation, chooseTool, isNotMouse]);
  return { pendingNodeType, chooseCreation, chooseTool, blocked };
}
