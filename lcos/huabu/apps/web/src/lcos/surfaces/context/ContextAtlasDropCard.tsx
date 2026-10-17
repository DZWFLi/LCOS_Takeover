import { useLayoutEffect, useMemo, useRef } from 'react';

import { contextAtlasDropSemantic } from './contextAtlasDrop';
import { isDropPointExposed } from '../../drop/dropOcclusion';
import { rectFromDomRect } from '../../drop/dropTargetRegistry';
import { useLcosDropStore } from '../../lcosDropState';

import type { WarehouseItemV1 } from '@local-creative-os/contracts';
import type { PointerEvent, ReactNode } from 'react';

/** Only the exposed card is a receiver; scrolling and motion are read live. */
export function ContextAtlasDropCard({ projectId, item, present, children, onPointerDown }: {
  readonly projectId: string;
  readonly item: WarehouseItemV1;
  readonly present: boolean;
  readonly children: ReactNode;
  readonly onPointerDown: (event: PointerEvent<HTMLElement>) => void;
}): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null);
  const register = useLcosDropStore((state) => state.registerTarget);
  const semantic = useMemo(() => contextAtlasDropSemantic(item), [item]);
  const targetId = `atlas:${projectId}:${item.entityRef.type}:${item.entityRef.id}`;
  useLayoutEffect(() => {
    const element = host.current;
    if (!element || !present || !semantic) return;
    const readRect = () => {
      if (!element.isConnected || element.closest('[inert],[aria-hidden="true"]')) return undefined;
      const visual = element.querySelector<HTMLElement>('[data-lcos-canonical-collection],[data-lcos-context-collection]') ?? element;
      const style = element.ownerDocument.defaultView?.getComputedStyle(visual);
      if (style?.display === 'none' || style?.visibility === 'hidden' || style?.opacity === '0') return undefined;
      return rectFromDomRect(visual.getBoundingClientRect());
    };
    return register({ targetId, kind: semantic.kind, semantic, label: item.title || '未命名', priority: 60,
      enabled: true, rect: rectFromDomRect(element.getBoundingClientRect()), readRect,
      acceptsPoint: (point) => isDropPointExposed(element, point) });
  }, [register, item.title, present, targetId, semantic]);

  return <div ref={host} data-lcos-atlas-drop-card={item.entityRef.id}
    onPointerDownCapture={onPointerDown} style={{ position: 'relative', pointerEvents: 'auto' }}>
    {children}
  </div>;
}
