import { colorPinTargetFromEntityRef, colorPinTargetKey } from '@local-creative-os/web-gen2';

import { useLcosNodePresentation } from '@/lcos-seam/nodePresentation';

import { useLcosReferenceStore } from '../lcosReferenceState';
import { useOptionalLcosColorPins } from '../pin/LcosColorPinProvider';
import { TapnowMultiPin } from '../pin/TapnowPinPresentation';
import './node-color-pin.css';

import type { JSX } from 'react';

/** Shared by material/collection/Portal/Glyth bodies. Canonical Pin state stays in its provider. */
export function NodeColorPinMarkers({ nodeId }: { readonly nodeId: string }): JSX.Element | null {
  const pins = useOptionalLcosColorPins();
  const ref = useLcosReferenceStore((state) => state.nodeEntityRefs.get(nodeId));
  const projectId = useLcosReferenceStore((state) => state.projectId);
  const presentation = useLcosNodePresentation();
  if (pins === null || ref === undefined || projectId === null || pins.projectId !== projectId) return null;

  const targetRef = colorPinTargetFromEntityRef(projectId, ref);
  const memberships = pins.membershipsByTargetKey.get(colorPinTargetKey(targetRef)) ?? [];
  const memberIds = new Set(memberships.map((membership) => membership.colorPinId));
  const definitions = pins.snapshot.definitions.filter((definition) => memberIds.has(definition.id));
  if (definitions.length === 0) return null;
  const zoom = presentation?.zoom !== undefined && presentation.zoom > 0 ? presentation.zoom : 1;
  const label = ref.descriptor?.title ?? ref.displayLabel ?? '当前对象';
  return <div className="lcos-node-color-pins nodrag nopan" data-lcos-node-color-pins
    style={{ right: -12 / zoom, top: -12 / zoom, transform: `scale(${1 / zoom})` }}>
    <button
      type="button" className="group/pin-trigger" data-lcos-node-color-pin={definitions[0]?.id} data-lcos-pin-target-kind={targetRef.kind}
      title={`${definitions.map(definition=>definition.label||definition.color).join('、')} · 管理彩色标`}
      aria-label={`管理 ${label} 的彩色标：${definitions.map(definition=>definition.label||definition.color).join('、')}`}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        pins.openAuthoring({ targetRef, label });
      }}>
      <TapnowMultiPin colors={definitions.map(definition=>definition.color)} />
    </button>
  </div>;
}
