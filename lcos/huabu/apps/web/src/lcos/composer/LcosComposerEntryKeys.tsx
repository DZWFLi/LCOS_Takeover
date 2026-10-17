import { useEffect } from 'react';

import { isEditableTarget } from '@/hooks/shortcuts';
import { useCanvasAttentionStore } from '@/store/canvasAttentionStore';
import useCanvasStore from '@/store/canvasStore';
import { useAnyGlobalModalOpen } from '@/store/globalModalUi';
import { useToolStore } from '@/store/toolStore';

import { composerNodeAnchor } from './composerAnchor';
import { openNodeComposer } from './nodeComposerEntry';
import { snapshotDraftReference } from './referenceSnapshot';
import { useLcosReferenceStore } from '../lcosReferenceState';
import { isNodePresentationHidden } from '../nodes/nodePresentationVisibility';
import { useLcosShellStore } from '../shell/lcosShellStore';

export function isComposerEntryKey(event: KeyboardEvent): boolean {
  return event.key.toLowerCase() === 'c' && !event.defaultPrevented && !event.repeat && !event.isComposing
    && event.keyCode !== 229 && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey
    && !isEditableTarget(event.target);
}

/** Gen1's explicit C action; uses the existing input and native viewport. */
export function LcosComposerEntryKeys(): null {
  const modalOpen = useAnyGlobalModalOpen();
  useEffect(() => {
    if (modalOpen) return;
    const key = (event: KeyboardEvent): void => {
      if (!isComposerEntryKey(event) || !useCanvasAttentionStore.getState().isCanvasEngaged || useToolStore.getState().pendingNodeType) return;
      const canvas = useCanvasStore.getState(); const shell = useLcosShellStore.getState();
      if (!canvas.canvasId || !shell.projectId || canvas.isLoading) return;
      const byId = new Map(canvas.nodes.map(node => [node.id, node]));
      const selected = canvas.nodes.filter(node => node.selected && !isNodePresentationHidden(node, byId));
      event.preventDefault();
      const single = selected.length === 1 ? selected[0] : undefined;
      if (single && openNodeComposer(single.id, true)) return;
      const refs = useLcosReferenceStore.getState().nodeEntityRefs;
      const boxes = selected.flatMap(node => { const box = composerNodeAnchor(canvas.nodes, node.id); return box ? [box] : []; });
      const rect = shell.windowEnvironment?.safeRect ?? { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };
      const point = canvas.rfInstance?.screenToFlowPosition({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
      if (!point) return;
      const anchor = boxes.length ? {
        x: Math.min(...boxes.map(box => box.x)), y: Math.min(...boxes.map(box => box.y)),
        width: Math.max(...boxes.map(box => box.x + box.width)) - Math.min(...boxes.map(box => box.x)),
        height: Math.max(...boxes.map(box => box.y + box.height)) - Math.min(...boxes.map(box => box.y)),
      } : { ...point, width: 0, height: 0 };
      shell.openComposer({ nodeId: selected[0]?.id ?? `scene:${canvas.canvasId}`, focusInput: true, title: selected.length ? `${selected.length} 个所选对象` : '当前现场',
        anchor, intent: 'delegate', targetNodeIds: selected.map(node => node.id),
        targetReferences: selected.flatMap(node => { const ref = refs.get(node.id); return ref ? [snapshotDraftReference(ref)] : []; }),
        ...(shell.activeWorkspaceId ? { workspaceId: shell.activeWorkspaceId } : {}) });
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [modalOpen]);
  return null;
}
