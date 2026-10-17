import { BookmarkCheck } from 'lucide-react';
import { useLcosNodePresentation } from '@/lcos-seam/nodePresentation';
import { useLcosReferenceStore } from '../lcosReferenceState';
import './node-color-pin.css';

/** Reference membership is independent from selection and Color Pin membership. */
export function NodeReferenceMarker({ nodeId }: { readonly nodeId: string }): React.JSX.Element | null {
  const referenced = useLcosReferenceStore((state) => state.isNodeReferenced(nodeId));
  const label = useLcosReferenceStore((state) => state.nodeEntityRefs.get(nodeId)?.displayLabel ?? '当前对象');
  const presentation = useLcosNodePresentation();
  if (!referenced) return null;
  const zoom = presentation?.zoom && presentation.zoom > 0 ? presentation.zoom : 1;
  return <button type="button" className="lcos-node-reference-marker nodrag nopan" data-lcos-node-reference
    style={{ left: -10 / zoom, bottom: -10 / zoom, transform: `scale(${1 / zoom})` }}
    title="已加入引用 · 点击移除引用" aria-label={`移除 ${label} 的引用`}
    onPointerDown={(event) => event.stopPropagation()} onDoubleClick={(event) => event.stopPropagation()}
    onKeyDown={(event) => event.stopPropagation()} onClick={(event) => {
      event.stopPropagation();
      const state = useLcosReferenceStore.getState();
      const ref = state.nodeEntityRefs.get(nodeId);
      if (ref) state.removeEntityFromDraft(ref);
    }}><BookmarkCheck size={12} aria-hidden /></button>;
}
