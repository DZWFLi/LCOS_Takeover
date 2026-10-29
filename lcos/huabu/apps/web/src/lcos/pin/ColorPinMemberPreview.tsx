import { FileText, Layers, MapPin, MessageCircle } from 'lucide-react';
import { useState } from 'react';
import { resolveArtifactUrl } from '@/api/artifact';
import useCanvasStore from '@/store/canvasStore';
import { useLcosReferenceStore } from '../lcosReferenceState';
import type { ColorPinTargetIdentityV1 } from './LcosColorPinProvider';
import type { SpatialMarkerTargetRefV0 } from '@local-creative-os/contracts';

export function pinMemberImage(target: SpatialMarkerTargetRefV0, identity: ColorPinTargetIdentityV1 | undefined,
  nodes: readonly { id: string; type?: string; hidden?: boolean; data: Record<string, unknown> }[],
  refs: ReadonlyMap<string, { entityType: string; entityId: string }>): string | undefined {
  const expected = target.kind === 'view' ? { entityType: 'view', entityId: target.id }
    : target.kind === 'entity' ? identity : undefined;
  if (!expected) return undefined;
  const node = nodes.find((candidate) => {
    const ref = refs.get(candidate.id);
    return !candidate.hidden && candidate.type === 'image' && ref?.entityType === expected.entityType
      && ref.entityId === expected.entityId && typeof candidate.data.src === 'string' && candidate.data.src.trim() !== '';
  });
  return typeof node?.data.src === 'string' ? node.data.src : undefined;
}

/** A thumbnail is available only through an exact live image projection; no inferred URL or view-to-entity substitution. */
export function ColorPinMemberPreview({ target, identity }: {
  readonly target: SpatialMarkerTargetRefV0; readonly identity?: ColorPinTargetIdentityV1;
}): React.JSX.Element {
  const nodes = useCanvasStore((state) => state.nodes);
  const canvasId = useCanvasStore((state) => state.canvasId);
  const refs = useLcosReferenceStore((state) => state.nodeEntityRefs);
  const src = pinMemberImage(target, identity, nodes, refs);
  const [failedSrc, setFailedSrc] = useState<string>();
  const Icon = target.kind === 'view' ? Layers : identity?.entityType === 'conversation' ? MessageCircle
    : identity?.entityType === 'workspace' || identity?.entityType === 'scope' ? MapPin : FileText;
  return <span data-lcos-color-pin-preview data-target-kind={target.kind} data-target-id={target.id}
    className="grid h-11 w-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-black/[.035]">
    {src && src !== failedSrc ? <img src={resolveArtifactUrl(src, canvasId ?? undefined)} alt="" draggable={false}
      className="h-full w-full object-cover" onError={() => setFailedSrc(src)} /> : <Icon size={20} aria-hidden />}
  </span>;
}
