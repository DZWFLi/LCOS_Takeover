import useCanvasStore from '@/store/canvasStore';
import { useToolStore } from '@/store/toolStore';

import { composerNodeAnchor } from './composerAnchor';
import { snapshotDraftReference } from './referenceSnapshot';
import { useLcosDropStore } from '../lcosDropState';
import { useLcosReferenceStore } from '../lcosReferenceState';
import { isNodePresentationHidden } from '../nodes/nodePresentationVisibility';
import { useLcosShellStore } from '../shell/lcosShellStore';

import type { LcosNodeEntityRef } from '../lcosReferenceState';
import type { Node } from '@xyflow/react';

/** Gen1 3e99769 ProjectCanvas.projectNodeSupportsInlineComposer, mapped to live facts. */
export function nodeSupportsNearfieldInput(node: Node, ref?: LcosNodeEntityRef): boolean {
  if (ref?.entityType === 'conversation') return true;
  const kind = ref?.descriptor?.artifactKind ?? ref?.descriptor?.sourceKind;
  if (['collection', 'context', 'workflow'].includes(String(kind))
    || ['scope', 'workspace', 'collection', 'run', 'result-slot'].includes(ref?.entityType ?? '')) return false;
  if (['frame', 'canvasRef', 'spacePreview', 'frameRef', 'nodeRef', 'sketch', 'question'].includes(node.type ?? '')) return false;
  return ref?.entityType === 'artifact' || ref?.entityType === 'note'
    || ['note', 'text', 'image', 'pdf', 'office', 'video', 'audio', 'web'].includes(node.type ?? '');
}

export function isContentComposeClick(event: MouseEvent, node: Node, selection: readonly Node[]): boolean {
  if (event.defaultPrevented || event.button !== 0 || event.detail > 1 || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey
    || node.dragging || node.resizing || selection.length > 1) return false;
  const target = event.target instanceof Element ? event.target : null;
  return !!target && !target.closest('button,input,textarea,select,a[href],[role="button"],[contenteditable="true"],.ProseMirror,.react-flow__resize-control,.react-flow__handle,[data-lcos-floating-chrome],[data-lcos-reference-drop]');
}

/** Both explicit Arc/C and settled object click use one existing input owner. */
export function openNodeComposer(nodeId: string, focusInput: boolean): boolean {
  const canvas = useCanvasStore.getState(); const shell = useLcosShellStore.getState();
  const refs = useLcosReferenceStore.getState();
  const node = canvas.nodes.find(candidate => candidate.id === nodeId);
  const ref = refs.nodeEntityRefs.get(nodeId);
  const resultSlotId = focusInput && ref?.entityType === 'result-slot' ? ref.entityId : undefined;
  if (!shell.projectId || !node || isNodePresentationHidden(node, new Map(canvas.nodes.map(n => [n.id, n])))
    || (!resultSlotId && !nodeSupportsNearfieldInput(node, ref))) return false;
  const anchor = composerNodeAnchor(canvas.nodes, nodeId); if (!anchor) return false;
  const title = ref?.descriptor?.title ?? (typeof node.data.label === 'string' ? node.data.label : undefined) ?? '当前内容';
  shell.openComposer({ nodeId, title, anchor, focusInput,
    ...(resultSlotId ? { resultSlotId } : {}),
    ...(ref?.entityType === 'conversation' ? { intent: 'continue', receiverConversationId: ref.entityId }
      : { intent: 'delegate', targetReferences: ref && !resultSlotId ? [snapshotDraftReference(ref)] : [],
        ...(!ref ? { receiverBlockedReason: '这份内容尚未保存为项目材料，可先编辑并保存。' } : {}) }),
    ...(shell.activeWorkspaceId ? { workspaceId: shell.activeWorkspaceId } : {}) });
  return true;
}

export function onContentNodeClick(event: MouseEvent, nodeId: string): void {
  const canvas = useCanvasStore.getState(); const refs = useLcosReferenceStore.getState();
  const tools = useToolStore.getState(); const drop = useLcosDropStore.getState();
  const node = canvas.nodes.find(candidate => candidate.id === nodeId);
  if (!node || !isContentComposeClick(event, node, canvas.nodes.filter(n => n.selected))
    || refs.referencePickOwner !== null || ['tracking', 'dwell', 'preview', 'committing'].includes(drop.state.status)
    || tools.pendingNodeType) return;
  openNodeComposer(nodeId, false);
}
