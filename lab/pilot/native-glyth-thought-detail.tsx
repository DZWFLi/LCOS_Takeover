import { useEffect, useLayoutEffect, useRef, useState, type ComponentType } from 'react';
import type { GlythThought } from '../../lcos/huabu/apps/web/src/lcos/collaboration/glythThought';
import './native-glyth-thought-detail.css';

export interface NativeGlythThoughtDetailIdentity {
  readonly projectId: string;
  readonly conversationId: string;
  readonly canvasId: string;
  readonly nodeId: string;
}
export interface NativeGlythThoughtDetailProps {
  readonly thought?: GlythThought;
  readonly identity: NativeGlythThoughtDetailIdentity;
  readonly NativePopover: ComponentType<any>;
  readonly NativeButton: ComponentType<any>;
  readonly onOpenProcess: (thought?: GlythThought) => void;
  readonly suppressed?: boolean;
}
export interface NativeGlythThoughtDetailState {
  readonly identity: string;
  readonly scope?: string;
  readonly seenKey?: string;
  readonly current?: GlythThought;
  readonly pending?: GlythThought;
  readonly history: readonly GlythThought[];
  readonly shownAt: number;
}
const CHANGE_GAP = 1300;
const MAX_TIMEOUT = 2_147_483_647;
const toneLabels = { thinking: '正在梳理', working: '正在推进', attention: '需要你', done: '已带回结果', error: '暂时中断' } as const;
export const nativeGlythThoughtDetailIdentityKey = (identity: NativeGlythThoughtDetailIdentity): string =>
  JSON.stringify([identity.projectId, identity.conversationId, identity.canvasId, identity.nodeId]);
export function emptyNativeGlythThoughtDetail(identity: string): NativeGlythThoughtDetailState {
  return { identity, history: [], shownAt: 0 };
}

/** Display-only extraction of the original ThoughtView's CHANGE_GAP, pending
 * and bounded rows. No session, event bus, transport or domain state is owned.
 * The original 6200/4400 automatic popup is intentionally not used here. */
export function updateNativeGlythThoughtDetail(
  previous: NativeGlythThoughtDetailState,
  input: { readonly identity: string; readonly thought?: GlythThought; readonly engaged: boolean; readonly acceptPending?: boolean },
  now: number,
): NativeGlythThoughtDetailState {
  const thought = input.thought;
  let state = previous.identity === input.identity && previous.scope === thought?.scope
    ? previous : emptyNativeGlythThoughtDetail(input.identity);
  if (!thought) return state.current || state.pending || state.history.length ? emptyNativeGlythThoughtDetail(input.identity) : state;
  if (state.seenKey !== thought.key) {
    const history = state.history.some(row => row.key === thought.key) ? state.history : [...state.history, thought].slice(-4);
    state = { ...state, scope: thought.scope, seenKey: thought.key, history,
      ...(state.current ? { pending: state.current.key === thought.key ? undefined : thought }
        : { current: thought, pending: undefined, shownAt: now }) };
  }
  if (state.pending && (input.acceptPending || !input.engaged && now - state.shownAt >= CHANGE_GAP))
    return { ...state, current: state.pending, pending: undefined, shownAt: now };
  return state;
}
export function nativeGlythThoughtDetailDelay(state: NativeGlythThoughtDetailState, engaged: boolean, now: number): number | undefined {
  return state.pending && !engaged ? Math.min(MAX_TIMEOUT, Math.max(0, CHANGE_GAP - (now - state.shownAt))) : undefined;
}
const isStale = (thought: GlythThought | undefined, now: number): boolean => {
  const timestamp = thought?.occurredAt ? Date.parse(thought.occurredAt) : NaN;
  return thought?.source === 'progress' && Number.isFinite(timestamp) && now - timestamp > 60_000;
};
const thoughtLabel = (thought: GlythThought | undefined, now: number) => !thought ? '当前进展'
  : thought.source === 'task' ? '当前任务' : isStale(thought, now) ? '上次进展' : toneLabels[thought.tone];
const validIdentity = (identity: NativeGlythThoughtDetailIdentity) =>
  [identity.projectId, identity.conversationId, identity.canvasId, identity.nodeId].every(value => typeof value === 'string' && !!value.trim());
const THOUGHT_CHROME = '.canvas-header-chrome,[data-lcos-surface-dock],[data-pile-gallery-chrome="bottom-left"],'
  + '[data-sonner-toaster] [data-sonner-toast]';
const EMPTY_PADDING = { top: 12, right: 12, bottom: 12, left: 12 };
type ThoughtCollisionPadding = typeof EMPTY_PADDING;
/** Reserve only the actual native edge chrome. The original Popover still
 * owns placement/flip/shift; this is not another collision or camera engine. */
export function readNativeGlythThoughtChrome(documentRef: Document): { padding: ThoughtCollisionPadding; elements: Element[] } {
  const view = documentRef.defaultView, padding = { ...EMPTY_PADDING }, elements = [...documentRef.querySelectorAll(THOUGHT_CHROME)];
  if (!view) return { padding, elements: [] };
  for (const element of elements) {
    if (!element.isConnected || !element.getClientRects().length || element.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true }) === false) continue;
    if (element.closest('[hidden],[aria-hidden="true"]')) continue;
    const style = view.getComputedStyle(element), rect = element.getBoundingClientRect();
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0
      || rect.width <= 0 || rect.height <= 0 || rect.bottom <= 0 || rect.top >= view.innerHeight || rect.right <= 0 || rect.left >= view.innerWidth) continue;
    if (element.matches('.canvas-header-chrome')) padding.top = Math.max(padding.top, Math.min(view.innerHeight, rect.bottom) + 8);
    else if (element.matches('[data-sonner-toast]')) {
      const edge = element.closest('[data-sonner-toaster]')?.getAttribute('data-y-position');
      if (edge === 'top' || edge !== 'bottom' && (rect.top + rect.bottom) / 2 < view.innerHeight / 2)
        padding.top = Math.max(padding.top, Math.min(view.innerHeight, rect.bottom) + 8);
      else padding.bottom = Math.max(padding.bottom, view.innerHeight - Math.max(0, rect.top) + 8);
    } else padding.bottom = Math.max(padding.bottom, view.innerHeight - Math.max(0, rect.top) + 8);
  }
  return { padding, elements };
}

/** One disclosure in the existing node status row. Original pr owns the only
 * Popover. The node-local model survives pr's content unmount/reopen, without
 * retaining hidden content or moving DOM across portals. */
export function NativeGlythThoughtDetail(props: NativeGlythThoughtDetailProps) {
  const identity = nativeGlythThoughtDetailIdentityKey(props.identity);
  const latest = useRef(props); latest.current = props;
  const [state, setState] = useState(() => updateNativeGlythThoughtDetail(emptyNativeGlythThoughtDetail(identity),
    { identity, thought: props.thought, engaged: false }, Date.now()));
  const [open, setOpen] = useState(false), [hovered, setHovered] = useState(false), [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(() => typeof document !== 'undefined' && document.hidden);
  const [clock, setClock] = useState(Date.now);
  const [collisionPadding, setCollisionPadding] = useState<ThoughtCollisionPadding>(EMPTY_PADDING);
  const triggerRef = useRef<HTMLSpanElement>(null), buttonRef = useRef<HTMLButtonElement | null>(null), contentRef = useRef<HTMLDivElement>(null);
  const focusRequest = useRef(false), outsideIntent = useRef(false), focusFrame = useRef<number | undefined>(undefined);
  const ownsContent = (target: Node | null) => !!target
    && !!(contentRef.current?.closest('[role="dialog"]') ?? contentRef.current)?.contains(target);
  const suppressed = props.suppressed === true || !validIdentity(props.identity);
  const matching = state.identity === identity && state.scope === props.thought?.scope;
  const displayed = matching ? state : emptyNativeGlythThoughtDetail(identity);
  const shown = open && !suppressed && !hidden && matching;
  const engaged = shown || hovered || focused || hidden || suppressed;

  useLayoutEffect(() => {
    const now = Date.now();
    setState(previous => updateNativeGlythThoughtDetail(previous, { identity, thought: props.thought, engaged }, now));
    setClock(now);
  }, [identity, props.thought?.key, props.thought?.scope, engaged]);
  useEffect(() => {
    const changed = () => { setHidden(document.hidden); if (document.hidden) { focusRequest.current = false; setOpen(false); setHovered(false); setFocused(false); } };
    document.addEventListener('visibilitychange', changed);
    return () => document.removeEventListener('visibilitychange', changed);
  }, []);
  useEffect(() => {
    if (!matching || suppressed || hidden) { focusRequest.current = false; setOpen(false); setHovered(false); setFocused(false); }
  }, [identity, props.thought?.scope, matching, suppressed, hidden]);
  useEffect(() => {
    if (suppressed || hidden) return;
    const now = Date.now(), pendingDelay = nativeGlythThoughtDetailDelay(displayed, engaged, now);
    const stamp = displayed.current?.occurredAt ? Date.parse(displayed.current.occurredAt) : NaN;
    const expiry = shown && displayed.current?.source === 'progress' && Number.isFinite(stamp) && !isStale(displayed.current, now)
      ? Math.max(1, stamp + 60_001 - now) : undefined;
    const delays = [pendingDelay, expiry].filter((value): value is number => value !== undefined);
    if (!delays.length) return;
    const timer = window.setTimeout(() => {
      const nextNow = Date.now(); setClock(nextNow);
      setState(previous => updateNativeGlythThoughtDetail(previous,
        { identity, thought: latest.current.thought, engaged }, nextNow));
    }, Math.min(MAX_TIMEOUT, ...delays));
    return () => window.clearTimeout(timer);
  }, [displayed, engaged, hidden, identity, shown, suppressed]);

  useLayoutEffect(() => {
    if (!shown) return;
    const doc = triggerRef.current?.ownerDocument ?? document, view = doc.defaultView!;
    let active = true, frame: number | undefined;
    const observed = new Set<Element>();
    const schedule = () => { if (active && frame === undefined) frame = view.requestAnimationFrame(measure); };
    const resize = typeof view.ResizeObserver === 'function' ? new view.ResizeObserver(schedule) : null;
    function measure() {
      frame = undefined; if (!active) return;
      const next = readNativeGlythThoughtChrome(doc), owners = new Set(next.elements);
      for (const element of observed) if (!owners.has(element)) { resize?.unobserve(element); observed.delete(element); }
      for (const element of owners) if (!observed.has(element)) { resize?.observe(element); observed.add(element); }
      setCollisionPadding(previous => ['top', 'right', 'bottom', 'left'].every(edge => previous[edge as keyof ThoughtCollisionPadding] === next.padding[edge as keyof ThoughtCollisionPadding]) ? previous : next.padding);
      // Follow finite native toast/chrome entry transitions at their real
      // boxes. Ignore infinite decorative animations and stop when settled.
      if (next.elements.some(element => element.getAnimations?.().some(animation => animation.playState === 'running'
        && animation.effect?.getTiming().iterations !== Infinity))) schedule();
    }
    const relevant = (target: Node | null) => target instanceof Element
      && (!!target.closest(THOUGHT_CHROME) || !!target.querySelector(THOUGHT_CHROME)
        || !!target.closest('[data-sonner-toaster],[data-sonner-toast]'));
    const mutation = new view.MutationObserver(records => {
      if (records.some(record => relevant(record.target) || [...record.addedNodes, ...record.removedNodes].some(relevant))) schedule();
    });
    mutation.observe(doc.body, { subtree: true, childList: true, attributes: true,
      attributeFilter: ['style', 'class', 'hidden', 'aria-hidden', 'data-visible', 'data-mounted', 'data-y-position'] });
    const transition = (event: Event) => { if (relevant(event.target as Node | null)) schedule(); };
    view.addEventListener('resize', schedule); doc.addEventListener('scroll', schedule, true);
    doc.addEventListener('transitionend', transition, true); doc.addEventListener('animationend', transition, true);
    measure();
    return () => {
      active = false; if (frame !== undefined) view.cancelAnimationFrame(frame);
      resize?.disconnect(); observed.clear(); mutation.disconnect();
      view.removeEventListener('resize', schedule); doc.removeEventListener('scroll', schedule, true);
      doc.removeEventListener('transitionend', transition, true); doc.removeEventListener('animationend', transition, true);
    };
  }, [shown, identity]);

  // Original gs deliberately supports finite props. Apply semantics to its
  // one actual BUTTON instead of assuming it forwards data/aria/ref/title.
  useLayoutEffect(() => {
    const buttons = triggerRef.current?.querySelectorAll('button');
    const button = buttons?.length === 1 ? buttons[0] : null;
    buttonRef.current = button;
    if (!button) return;
    const values: Record<string, string> = {
      'data-native-glyth-thought-trigger': props.identity.nodeId,
      'aria-label': '查看进展详情', 'aria-haspopup': 'dialog', 'aria-expanded': String(shown), title: '查看进展详情',
    };
    const prior = new Map(Object.keys(values).map(key => [key, button.getAttribute(key)]));
    for (const [key, value] of Object.entries(values)) button.setAttribute(key, value);
    return () => {
      for (const [key, value] of Object.entries(values)) if (button.getAttribute(key) === value) {
        const old = prior.get(key); if (old === null || old === undefined) button.removeAttribute(key); else button.setAttribute(key, old);
      }
      if (buttonRef.current === button) buttonRef.current = null;
    };
  }, [props.NativeButton, props.identity.nodeId, shown]);

  useEffect(() => {
    if (!shown) return;
    outsideIntent.current = false;
    const outside = (event: Event) => {
      const target = event.target;
      if (event.type === 'focusin' && (target === document.body || target === document.documentElement)) return;
      if (target instanceof Node && !ownsContent(target) && !triggerRef.current?.contains(target)) outsideIntent.current = true;
    };
    document.addEventListener('pointerdown', outside, true); document.addEventListener('focusin', outside, true);
    const frame = requestAnimationFrame(() => {
      if (!outsideIntent.current && contentRef.current?.isConnected) contentRef.current.focus({ preventScroll: true });
    });
    return () => { cancelAnimationFrame(frame); document.removeEventListener('pointerdown', outside, true); document.removeEventListener('focusin', outside, true); };
  }, [shown]);
  useEffect(() => {
    if (shown || !focusRequest.current) return;
    focusRequest.current = false;
    const owner = identity;
    focusFrame.current = requestAnimationFrame(() => {
      focusFrame.current = undefined;
      const button = buttonRef.current;
      if (owner === nativeGlythThoughtDetailIdentityKey(latest.current.identity) && !latest.current.suppressed && !document.hidden
        && !outsideIntent.current && button?.isConnected && !button.disabled
        && (document.activeElement === document.body || document.activeElement === document.documentElement
          || contentRef.current?.contains(document.activeElement)
          || triggerRef.current?.parentElement?.contains(document.activeElement))) button.focus({ preventScroll: true });
    });
    return () => { if (focusFrame.current !== undefined) cancelAnimationFrame(focusFrame.current); focusFrame.current = undefined; };
  }, [identity, shown]);
  useEffect(() => () => { if (focusFrame.current !== undefined) cancelAnimationFrame(focusFrame.current); }, []);

  const changeOpen = (value: boolean) => {
    if (value && (suppressed || hidden || !matching)) return;
    if (!value) focusRequest.current = !outsideIntent.current && ownsContent(document.activeElement);
    setOpen(value);
  };
  const current = displayed.current, pending = displayed.pending;
  const previous = displayed.history.filter(row => row.key !== current?.key && row.key !== pending?.key).slice(-2).reverse();
  const NativePopover = props.NativePopover, NativeButton = props.NativeButton;
  return <NativePopover trigger="click" open={shown} onOpenChange={changeOpen} side="bottom" align="start" sideOffset={8}
    className="native-glyth-thought-anchor"
    collisionPadding={collisionPadding} contentClassName="p-0 native-glyth-thought-popover"
    content={<div ref={contentRef} className="native-glyth-thought-detail" data-native-glyth-thought-detail={props.identity.nodeId}
      data-thought-tone={current?.tone ?? 'quiet'} data-thought-source={current?.source ?? 'empty'} tabIndex={-1}
      role="group" aria-label="进展详情" onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
      <div className="native-glyth-thought-detail-heading">{thoughtLabel(current, clock)}</div>
      {current ? <p className="native-glyth-thought-detail-copy" data-native-glyth-thought-current={current.key}>{current.detail ?? current.text}</p>
        : <p className="native-glyth-thought-detail-empty">还没有可显示的进展。可以从协作者标题查看已有对话。</p>}
      {pending && <button type="button" className="native-glyth-thought-pending" data-native-glyth-thought-pending
        onClick={() => { const now = Date.now(); setClock(now); setState(value => updateNativeGlythThoughtDetail(value,
          { identity, thought: latest.current.thought, engaged: true, acceptPending: true }, now)); }}>有新进展，点击查看</button>}
      {previous.length > 0 && <ol className="native-glyth-thought-history" aria-label="最近进展" data-native-glyth-thought-history>
        {previous.map(row => <li key={row.key}>{row.text}</li>)}
      </ol>}
      {current?.source === 'task' && <p className="native-glyth-thought-detail-hint">这是当前任务说明，尚无新的进展摘要。</p>}
      <button type="button" className="native-glyth-thought-process" data-native-glyth-thought-process
        onClick={() => { focusRequest.current = false; outsideIntent.current = true; setOpen(false); latest.current.onOpenProcess(current); }}>{current ? '查看过程' : '查看对话'} <span aria-hidden="true">↗</span></button>
      <span className="native-glyth-thought-detail-live" role="status" aria-live="polite" aria-atomic="true">{current?.text ?? '还没有可显示的进展。'}</span>
    </div>}>
    <span ref={triggerRef} className="native-glyth-thought-disclosure nodrag" data-native-glyth-thought-disclosure={props.identity.nodeId}
      onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}
      onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}>
      <NativeButton className="native-glyth-thought-disclosure-button" disabled={suppressed || hidden}
        onClick={(event: { stopPropagation(): void }) => { event.stopPropagation(); if (!suppressed && !hidden) changeOpen(!shown); }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M8 10l4 4 4-4" /><circle cx="12" cy="12" r="9" />
        </svg>
      </NativeButton>
    </span>
  </NativePopover>;
}
