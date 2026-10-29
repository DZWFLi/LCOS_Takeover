import { useId, useRef, useState } from 'react';
import { DropdownMenu } from '@/components/Common/DropdownMenu';
import { getDragActivationDistance } from '@/handler/canvasGestureSession';

import moreIcon from '../nearfield/assets/more.svg';
import { LcosButton } from '../primitives/LcosButton';
import './professional-assembly.css';
import { TapnowInlineHighlight } from './donor/TapnowPresentationParts';

import type { HTMLAttributes, ReactNode } from 'react';

export interface AssemblyItemViewProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title' | 'children'> {
  readonly title: string;
  readonly identity?: ReactNode;
  readonly subtitle?: ReactNode;
  readonly children: ReactNode;
  readonly actions: ReactNode;
  readonly primaryAction?: ReactNode;
  /** Explicit primary-button fallback for the shared Semantic Drop controller. */
  readonly carryHandle?: ReactNode;
  readonly referenced?: boolean;
  readonly selected?: boolean;
  readonly onSelect?: () => void;
  readonly hideCaption?: boolean;
  readonly onPreview?: () => void;
  readonly highlightQuery?: string;
}
/** GEN1 identity/reference separation; the primary action stays beside the item metadata. */
export function AssemblyItemView({ title, identity, subtitle, children, actions, primaryAction, carryHandle, referenced = false,
  selected = false, onSelect, onPreview, hideCaption = false, className, highlightQuery, ...rest }: AssemblyItemViewProps): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const tap = useRef<{ pointerId: number; x: number; y: number; threshold: number; moved: boolean } | null>(null);
  const observeTapMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const start = tap.current;
    if (start?.pointerId === event.pointerId
      && Math.hypot(event.clientX - start.x, event.clientY - start.y) >= start.threshold) start.moved = true;
  };
  return <div {...rest} className={`lcos-assembly-item group/assembly ${className ?? ''}`} data-selected={selected}
    data-referenced={referenced} data-visual-active={expanded} data-object-only={hideCaption} data-selectable={!!onSelect}
    tabIndex={rest.tabIndex ?? (onPreview ? 0 : undefined)}
    onDoubleClick={(event) => {
      rest.onDoubleClick?.(event);
      if (event.defaultPrevented || !onPreview
        || (event.target as HTMLElement).closest('button,input,label,a,textarea,select,[contenteditable="true"],[data-semantic-drop-handle]')) return;
      // Native double-click selects words in titles/previews before dblclick fires.
      // That local selection must not swallow the material-opening gesture.
      const selection = window.getSelection();
      if (selection?.toString().trim() && selection.anchorNode && !event.currentTarget.contains(selection.anchorNode)) return;
      const start = tap.current;
      if (event.detail !== 0 && start !== null && (start.moved
        || Math.hypot(event.clientX - start.x, event.clientY - start.y) >= start.threshold)) return;
      event.stopPropagation();
      event.currentTarget.focus({ preventScroll: true });
      onPreview();
    }}
    onPointerDownCapture={(event) => {
      tap.current = event.button === 0 && !event.altKey
        && !(event.target instanceof Element && event.target.closest('button,input,a,textarea,select,[contenteditable="true"],[data-semantic-drop-handle]'))
        ? { pointerId: event.pointerId, x: event.clientX, y: event.clientY,
            threshold: getDragActivationDistance(event.pointerType || 'mouse'), moved: false } : null;
      rest.onPointerDownCapture?.(event);
    }}
    onPointerMoveCapture={(event) => { observeTapMove(event); rest.onPointerMoveCapture?.(event); }}
    onPointerLeave={(event) => { observeTapMove(event); rest.onPointerLeave?.(event); }}
    onPointerUpCapture={(event) => { observeTapMove(event); rest.onPointerUpCapture?.(event); }}
    onPointerCancelCapture={(event) => { if (tap.current) tap.current.moved = true; rest.onPointerCancelCapture?.(event); }}
    onKeyDownCapture={(event) => {
      rest.onKeyDownCapture?.(event);
      if (!event.defaultPrevented && event.key === 'Escape' && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229 && expanded) {
        event.preventDefault(); event.stopPropagation(); setExpanded(false);
        event.currentTarget.querySelector<HTMLButtonElement>('[data-lcos-assembly-more]')?.focus();
      }
      if (!event.defaultPrevented && event.key === 'Enter' && !event.nativeEvent.isComposing
        && event.nativeEvent.keyCode !== 229 && event.target === event.currentTarget && onPreview) {
        event.preventDefault(); event.stopPropagation(); onPreview();
      }
    }}>
    <div className="lcos-assembly-item-object">{children}</div>
    {onPreview ? <LcosButton appearance="oreo" variant="ghost" className="lcos-assembly-preview-trigger" aria-label={`预览 ${title}`}
      data-lcos-assembly-quick-preview onClick={onPreview}>预览</LcosButton> : null}
    {onSelect ? <label className="lcos-assembly-select" title={`选择 ${title}`} onPointerDown={(event) => event.stopPropagation()}>
      <input type="checkbox" aria-label={`选择 ${title}`} checked={selected} onChange={onSelect} />
    </label> : null}
    {carryHandle ? <div className="absolute top-2 left-10 z-10 opacity-0 group-hover/assembly:opacity-100 group-focus-within/assembly:opacity-100 [@media(hover:none)]:opacity-100" data-lcos-assembly-carry>{carryHandle}</div> : null}
    {!hideCaption ? <div className="lcos-assembly-item-caption"><strong title={title} className="lcos-library-title-highlight"><TapnowInlineHighlight text={title} keyword={highlightQuery} /></strong>
      <span>{identity}{subtitle ? <>{identity ? ' · ' : ''}{subtitle}</> : null}</span></div> : null}
    {primaryAction ? <div data-lcos-assembly-primary-action className="lcos-assembly-primary-action">{primaryAction}</div> : null}
    {referenced ? <span className="lcos-assembly-draft-mark">已在草稿</span> : null}
    <div className="lcos-assembly-menu-anchor"><DropdownMenu open={expanded} onOpenChange={setExpanded} align="bottom-right"
      className="lcos-library-item-menu" trigger={<LcosButton variant="ghost" data-lcos-assembly-more aria-label={`更多操作 ${title}`} aria-expanded={expanded}
      aria-controls={id} className="lcos-assembly-more">
      <img src={moreIcon} alt="" width={18} height={18} /><span>更多</span>
    </LcosButton>}>
      <div id={id} data-lcos-assembly-actions className="lcos-library-item-menu-actions" onClick={(event) => {
        if ((event.target as HTMLElement).closest('button:not(:disabled),a')) setExpanded(false);
      }}>{actions}</div>
    </DropdownMenu></div>
  </div>;
}
