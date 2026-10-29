import { motion, useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { temporalEpisodeFocusFace, temporalFocusTick } from './temporalFocusProfile';
import {
  nextEnabledTemporalIndex,
  temporalRatioToY,
  temporalTickCount,
  TEMPORAL_BOTTOM_PADDING,
  TEMPORAL_MAX_RAIL_HEIGHT,
  TEMPORAL_TICK_STEP,
  TEMPORAL_TOP_PADDING,
} from './temporalNavigation';
import { bindTemporalWheel } from './temporalWheel';
import { PRESENTATION_SPRING } from '../spatial/presentationMotion';

import type { TemporalLengthTier } from './temporalLength';
import './context-spatial.css';

export interface TemporalRailItemView {
  readonly id: string;
  readonly label: string;
  /** Position inside the current producer-owned time window, not a timestamp. */
  readonly ratio: number;
  readonly lengthTier: TemporalLengthTier;
  readonly staticWidth: number;
  readonly disabled?: boolean;
}

export interface TemporalRailWindowView {
  readonly startIndex: number;
  readonly endIndex: number;
  readonly totalCount: number;
  readonly positionRatio: number;
  readonly spanRatio: number;
  readonly label: string;
}

/** Presentation states only. This is not a Core event or episode schema. */
export type TemporalRailVisualState = 'ready' | 'loading' | 'empty' | 'error' | 'recovery';

export interface TemporalRailViewProps {
  readonly items: readonly TemporalRailItemView[];
  readonly activeId?: string;
  readonly reason?: string;
  readonly state?: TemporalRailVisualState;
  readonly window?: TemporalRailWindowView;
  /** Change this when the existing owner replaces the worksite or time window. */
  readonly scopeKey?: string;
  readonly onActivate?: (item: TemporalRailItemView) => void;
  readonly onWindowShift?: (direction: -1 | 1) => void;
  readonly onPreviewChange?: (item: TemporalRailItemView | null) => void;
  readonly onRetry?: () => void;
}

const STATE_COPY: Readonly<Record<TemporalRailVisualState, string>> = {
  ready: '', loading: '正在读取时间记录…', empty: '暂无时间记录',
  error: '时间记录读取失败', recovery: '部分目标尚未恢复',
};

export function TemporalRailView({
  items, activeId, reason, state, window, scopeKey, onActivate, onWindowShift, onPreviewChange, onRetry,
}: TemporalRailViewProps): React.JSX.Element {
  const reducedMotion = useReducedMotion();
  const railRef = useRef<HTMLElement>(null);
  const setRailRef = (node: HTMLElement | null): void => { railRef.current = node; };
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const [railHeight, setRailHeight] = useState(TEMPORAL_MAX_RAIL_HEIGHT);
  const [focusY, setFocusY] = useState<number | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const previewRef = useRef<string | null>(null);
  const previewValue = useRef<TemporalRailItemView | null>(null);
  const previewNotifier = useRef<typeof onPreviewChange>(undefined);
  const [rovingId, setRovingId] = useState<string | null>(null);
  const callbacks = useRef({ onPreviewChange, onWindowShift });
  useLayoutEffect(() => { callbacks.current = { onPreviewChange, onWindowShift }; });
  const sorted = useMemo(
    () => items.filter((item) => Number.isFinite(item.ratio)).slice().sort((a, b) => a.ratio - b.ratio),
    [items],
  );
  const unavailablePositions = items.length - sorted.length;
  const isEmpty = sorted.length === 0;
  const visualState = state ?? (sorted.length > 0 ? 'ready' : 'empty');
  const enabled = sorted.filter((item) => item.disabled !== true);
  const tabId = enabled.find((item) => item.id === rovingId)?.id
    ?? enabled.find((item) => item.id === activeId)?.id ?? enabled[0]?.id;
  const previewItem = sorted.find((item) => item.id === previewId && item.disabled !== true) ?? null;
  const usableRailHeight = Math.max(0, railHeight - TEMPORAL_TOP_PADDING - TEMPORAL_BOTTOM_PADDING);
  const bandHeight = window === undefined ? 0 : Math.max(18, Math.min(usableRailHeight, usableRailHeight * window.spanRatio));
  const bandTop = window === undefined
    ? TEMPORAL_TOP_PADDING
    : TEMPORAL_TOP_PADDING + Math.max(0, usableRailHeight - bandHeight) * window.positionRatio;

  const setPreview = useCallback((item: TemporalRailItemView | null): void => {
    const id = item?.id ?? null;
    if (previewRef.current === id) return;
    previewRef.current = id;
    previewValue.current = item;
    setPreviewId(id);
    const notify = item === null ? previewNotifier.current : callbacks.current.onPreviewChange;
    previewNotifier.current = item === null ? undefined : notify;
    notify?.(item);
  }, []);

  useEffect(() => {
    const clearOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || previewRef.current === null) return;
      event.preventDefault();
      event.stopPropagation();
      setFocusY(null);
      setPreview(null);
    };
    document.addEventListener('keydown', clearOnEscape, true);
    return () => document.removeEventListener('keydown', clearOnEscape, true);
  }, [setPreview]);

  useLayoutEffect(() => {
    const rail = railRef.current;
    if (rail === null) return;
    const publish = (): void => {
      const measured = Math.max(rail.clientHeight, rail.getBoundingClientRect().height);
      // CSS can arrive after the first layout effect. Keep the 555px design
      // default until a non-zero measurement exists, otherwise fisheye clamps
      // permanently to the first tick in browsers without ResizeObserver.
      if (!Number.isFinite(measured) || measured <= 0) return;
      setRailHeight(Math.min(TEMPORAL_MAX_RAIL_HEIGHT, measured));
    };
    publish();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(publish) : null;
    observer?.observe(rail);
    return () => observer?.disconnect();
  }, [isEmpty]);

  useEffect(() => {
    const rail = railRef.current;
    if (rail === null) return;
    // Keep wheel local even while the producer is unavailable. Never zoom the host.
    return bindTemporalWheel(rail, (direction) => callbacks.current.onWindowShift?.(direction));
  }, [isEmpty]);

  useEffect(() => {
    if (previewRef.current === null) return;
    const current = sorted.find((item) => item.id === previewRef.current && item.disabled !== true);
    // The group id can survive a binding refresh while its real nodes change.
    // Retire that stale preview; a new hover reads the current producer value.
    if (current !== undefined && current === previewValue.current) return;
    setFocusY(null);
    setPreview(null);
  }, [sorted, setPreview]);

  useEffect(() => {
    setRovingId(null);
    setFocusY(null);
    setPreviewId(null);
    previewRef.current = null;
    previewValue.current = null;
    return () => {
      if (previewRef.current !== null) previewNotifier.current?.(null);
      previewNotifier.current = undefined;
      previewRef.current = null;
      previewValue.current = null;
    };
  }, [scopeKey]);

  const message = reason ?? STATE_COPY[visualState];
  if (sorted.length === 0) {
    return (
      <aside
        ref={setRailRef}
        data-lcos-temporal-rail
        data-temporal-state={visualState}
        className="lcos-temporal-rail"
        aria-label="局部时间轨"
        aria-busy={visualState === 'loading' || undefined}
      >
        {message || unavailablePositions > 0 ? <div className="lcos-temporal-feedback" role="status">
          {message ? <span>{message}</span> : null}
          {unavailablePositions > 0 ? <span>{unavailablePositions} 组时间位置不可用</span> : null}
          {(visualState === 'error' || visualState === 'recovery') && onRetry
            ? <button type="button" onClick={onRetry}>重试</button> : null}
        </div> : null}
      </aside>
    );
  }
  return (
    <div
      role="slider"
      ref={setRailRef}
      data-lcos-temporal-rail
      data-temporal-state={visualState}
      className="lcos-temporal-rail"
      aria-label="局部时间轨"
      aria-busy={visualState === 'loading' || undefined}
      aria-orientation="vertical"
      aria-valuemin={0}
      aria-valuemax={railHeight}
      aria-valuenow={focusY ?? 0}
      aria-valuetext={window?.label}
      tabIndex={enabled.length === 0 ? 0 : -1}
      onPointerMove={(event) => {
        if (reducedMotion || sorted.length === 0) return;
        const rect = event.currentTarget.getBoundingClientRect();
        setFocusY(Math.max(TEMPORAL_TOP_PADDING, Math.min(railHeight - TEMPORAL_BOTTOM_PADDING, event.clientY - rect.top)));
      }}
      onPointerLeave={() => {
        setFocusY(null);
        setPreview(null);
      }}
      onBlurCapture={(event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return;
        setFocusY(null);
        setPreview(null);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          // Consume only our local preview; a second Esc can reach the existing owner.
          if (previewRef.current === null && focusY === null) return;
          event.preventDefault();
          event.stopPropagation();
          setFocusY(null);
          setPreview(null);
          return;
        }
        // Native button Enter/Space is the only activation path. Do not replay it here.
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        if (enabled.length === 0) return;
        event.preventDefault();
        event.stopPropagation();
        const current = previewRef.current ?? rovingId ?? activeId;
        const index = sorted.findIndex((item) => item.id === current);
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        const next = nextEnabledTemporalIndex(sorted, index >= 0 ? index : direction === 1 ? -1 : 0, direction);
        const item = sorted[next];
        if (item === undefined) return;
        setRovingId(item.id);
        setPreview(item);
        if (!reducedMotion) setFocusY(temporalRatioToY(item.ratio, railHeight));
        buttons.current.get(item.id)?.focus({ preventScroll: true });
      }}
    >
      {window !== undefined && window.totalCount > 0 ? <>
        <div
          className="lcos-temporal-window-band"
          data-temporal-window-band
          data-window-start={window.startIndex}
          data-window-end={window.endIndex}
          style={{ top: bandTop, height: bandHeight }}
          aria-hidden
        />
        <output className="lcos-temporal-window-range" title={window.label}>
          {window.startIndex + 1}–{window.endIndex + 1} / {window.totalCount}
        </output>
      </> : null}
      {sorted.length > 0 ? <div className="lcos-temporal-ticks" aria-hidden>
        {Array.from({ length: temporalTickCount(railHeight) }, (_, index) => {
          const baseY = TEMPORAL_TOP_PADDING + index * TEMPORAL_TICK_STEP;
          const face = temporalFocusTick(index, focusY, reducedMotion === true);
          return <motion.i key={index} initial={false} data-temporal-tick={index}
            style={{ top: baseY }} animate={face}
            transition={reducedMotion ? { duration: 0 } : PRESENTATION_SPRING} />;
        })}
      </div> : null}
      {sorted.map((item) => {
        const baseY = temporalRatioToY(item.ratio, railHeight);
        const preview = previewItem?.id === item.id;
        return <motion.button
          key={item.id}
          ref={(node) => { if (node) buttons.current.set(item.id, node); else buttons.current.delete(item.id); }}
          type="button"
          data-temporal-item={item.id}
          data-length-tier={item.lengthTier}
          data-active={activeId === item.id ? 'true' : undefined}
          data-preview={preview ? 'true' : undefined}
          disabled={item.disabled}
          tabIndex={item.id === tabId ? 0 : -1}
          className="lcos-temporal-item"
          style={{ top: baseY - 12, '--lcos-temporal-item-width': `${item.staticWidth}px` } as React.CSSProperties}
          initial={false}
          animate={{ x: 0, scale: 1 }}
          transition={reducedMotion ? { duration: 0 } : PRESENTATION_SPRING}
          onPointerEnter={() => { if (item.disabled !== true) setPreview(item); }}
          onFocus={() => {
            setRovingId(item.id);
            setPreview(item);
            if (!reducedMotion) setFocusY(baseY);
          }}
          onClick={() => {
            if (item.disabled === true) return;
            setPreview(null);
            onActivate?.(item);
          }}
          aria-label={item.label}
          aria-current={activeId === item.id ? 'true' : undefined}
        ><motion.i
          aria-hidden
          initial={false}
          animate={temporalEpisodeFocusFace({
            staticWidth: item.staticWidth,
            y: baseY,
            focusY,
            reducedMotion: reducedMotion === true,
          })}
          transition={reducedMotion ? { duration: 0 } : PRESENTATION_SPRING}
        /><span>{item.label}</span></motion.button>;
      })}
      {message || unavailablePositions > 0 ? <div className="lcos-temporal-feedback" role="status">
        {message ? <span>{message}</span> : null}
        {unavailablePositions > 0 ? <span>{unavailablePositions} 组时间位置不可用</span> : null}
        {(visualState === 'error' || visualState === 'recovery') && onRetry
          ? <button type="button" onClick={onRetry}>重试</button> : null}
      </div> : null}
    </div>
  );
}
