import { useEffect, useState } from 'react';

import { Button } from '@/components/Common/Button';
import { Popover } from '@/components/Common/Popover';
import { toast } from '@/components/Common/Toast';
import useCanvasStore from '@/store/canvasStore';
import { useAnyGlobalModalOpen } from '@/store/globalModalUi';

import { useLcosReferenceStore } from '../lcosReferenceState';
import { isNodePresentationHidden } from './nodePresentationVisibility';
import { canvasNodeRenameShortcut, renameCanvasNode, RENAME_CANVAS_NODE_EVENT } from './nodeRename';

export function CanvasNodeRenameEntry({ disabled = false }: { readonly disabled?: boolean }): React.JSX.Element | null {
  const modal = useAnyGlobalModalOpen();
  const [target, setTarget] = useState<{ nodeId: string; canvasId: string; projectId: string | null; bindingKey: string; position: { x: number; y: number } }>();
  const [title, setTitle] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  useEffect(() => {
    const begin = (nodeId: string) => {
      if (disabled || modal || busy) return;
      const canvas = useCanvasStore.getState(), refs = useLcosReferenceStore.getState();
      const node = canvas.nodes.find((item) => item.id === nodeId);
      const element = document.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(nodeId)}"]`);
      if (!node || !canvas.canvasId || !element) return;
      const rect = element.getBoundingClientRect();
      setTitle(refs.nodeEntityRefs.get(nodeId)?.descriptor?.title ?? String(node.data.label ?? ''));
      const binding = refs.nodeEntityRefs.get(nodeId);
      setTarget({ nodeId, canvasId: canvas.canvasId, projectId: refs.projectId, bindingKey: JSON.stringify(binding ? [binding.entityType, binding.entityId] : null), position: { x: rect.left, y: rect.top } }); setError('');
    };
    const named = (event: Event) => { const id = (event as CustomEvent<{ nodeId?: unknown }>).detail?.nodeId; if (typeof id === 'string') begin(id); };
    const keyboard = (event: KeyboardEvent) => {
      if (!canvasNodeRenameShortcut(event) || target) return;
      const nodes = useCanvasStore.getState().nodes, byId = new Map(nodes.map((node) => [node.id, node]));
      const selected = nodes.filter((node) => node.selected && !isNodePresentationHidden(node, byId));
      if (selected.length === 1) { event.preventDefault(); begin(selected[0].id); }
    };
    window.addEventListener(RENAME_CANVAS_NODE_EVENT, named); window.addEventListener('keydown', keyboard);
    return () => { window.removeEventListener(RENAME_CANVAS_NODE_EVENT, named); window.removeEventListener('keydown', keyboard); };
  }, [disabled, modal, target, busy]);
  if (!target) return null;
  return <Popover position={target.position} onDismiss={() => { if (!busy) setTarget(undefined); }}>
    <form className="flex flex-col gap-2 p-2" onSubmit={(event) => {
      event.preventDefault(); if (busy) return;
      if (useCanvasStore.getState().canvasId !== target.canvasId || useLcosReferenceStore.getState().projectId !== target.projectId) { setTarget(undefined); return; }
      const binding = useLcosReferenceStore.getState().nodeEntityRefs.get(target.nodeId);
      if (JSON.stringify(binding ? [binding.entityType, binding.entityId] : null) !== target.bindingKey) { setError('对象身份已变化，请重新打开改名。'); return; }
      setBusy(true); setError('');
      void renameCanvasNode(target.nodeId, title).then(() => { setTarget(undefined); toast('名称已更新'); }).catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : '改名未确认。');
      }).finally(() => setBusy(false));
    }}>
      <label className="text-xs">名称<input ref={(input) => input?.focus()} aria-label="节点名称" value={title} disabled={busy}
        className="mt-1 block rounded border bg-transparent p-2" onChange={(event) => setTitle(event.target.value)} /></label>
      {error && <span role="status" className="text-xs">{error}</span>}
      <Button size="sm" disabled={busy || !title.trim()} type="submit">{busy ? '保存中…' : '保存名称'}</Button>
    </form>
  </Popover>;
}
