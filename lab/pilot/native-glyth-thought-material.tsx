import { useLayoutEffect, useRef } from 'react';
import type { GlythThought } from '../../lcos/huabu/apps/web/src/lcos/collaboration/glythThought';
import { mountSpectralRipple, type RippleInput } from '../../lcos/huabu/apps/web/src/lcos/ui/materials/spectralRipple';
import '../../lcos/huabu/apps/web/src/lcos/ui/materials/soft-underlight.css';
import '../../lcos/huabu/apps/web/src/lcos/ui/materials/spectral-ripple.css';
import './native-glyth-thought-material.css';

export interface NativeGlythThoughtMaterialProps {
  readonly thought?: GlythThought;
  readonly selected?: boolean;
  readonly suppressed?: boolean;
  readonly layout?: 'object' | 'row';
}

/** The original ThoughtView's source/freshness rule, without its card, history,
 * floating host or narration. GUI engagement never manufactures work. */
export function nativeGlythThoughtRippleInput(
  props: NativeGlythThoughtMaterialProps,
  environment: { readonly engaged: boolean; readonly inView: boolean; readonly hidden: boolean; readonly now: number },
): RippleInput & { readonly stale: boolean } {
  const stamp = props.thought?.occurredAt ? Date.parse(props.thought.occurredAt) : NaN;
  const stale = props.thought?.source === 'progress' && Number.isFinite(stamp) && environment.now - stamp > 60_000;
  const phase = props.thought?.source === 'task' || stale ? 'quiet' : props.thought?.tone ?? 'quiet';
  return { phase, active: !props.suppressed && environment.inView && !environment.hidden
    && (!!props.thought || environment.engaged || props.selected === true), stale };
}

/** One inert sibling of the existing Body/label. The original renderer owns
 * curves, palette, canvas fallback, RAF, visibility and media lifecycles.
 * This adapter supplies only real facts, passive GUI engagement and placement. */
export function NativeGlythThoughtMaterial(props: NativeGlythThoughtMaterialProps) {
  const rootRef = useRef<HTMLSpanElement>(null), fieldRef = useRef<HTMLSpanElement>(null);
  const latest = useRef(props); latest.current = props;
  const synchronize = useRef<(() => void) | null>(null);

  useLayoutEffect(() => {
    const root = rootRef.current, field = fieldRef.current;
    const owner = root?.parentElement;
    if (!root || !field || !owner?.matches('.lcos-conversation-node-shell')) return;
    const doc = root.ownerDocument, win = doc.defaultView!;
    const motion = win.matchMedia('(prefers-reduced-motion: reduce)');
    const renderer = mountSpectralRipple(field);
    let hovered = owner.matches(':hover'), focused = owner.contains(doc.activeElement), inView = true;
    let expiry: number | undefined, disposed = false;
    const sync = () => {
      if (disposed) return;
      win.clearTimeout(expiry); expiry = undefined;
      const next = nativeGlythThoughtRippleInput(latest.current, { engaged: hovered || focused,
        inView, hidden: doc.hidden, now: Date.now() });
      root.dataset.tone = latest.current.thought?.tone ?? 'quiet';
      root.dataset.source = latest.current.thought?.source ?? 'gui';
      root.dataset.stale = String(next.stale);
      root.dataset.open = String(next.active);
      root.dataset.reduced = String(motion.matches);
      root.dataset.documentHidden = String(doc.hidden);
      root.dataset.rippleActive = String(next.active);
      root.dataset.ripplePhase = next.phase;
      renderer.update({ phase: next.phase, active: next.active });
      // Real progress expires visually even if there is no new business event.
      // This never changes the original status text or session projection.
      const stamp = latest.current.thought?.occurredAt ? Date.parse(latest.current.thought.occurredAt) : NaN;
      if (latest.current.thought?.source === 'progress' && Number.isFinite(stamp) && !next.stale) {
        const remaining = stamp + 60_001 - Date.now();
        if (remaining > 0) expiry = win.setTimeout(sync, Math.min(remaining, 2_147_483_647));
      }
    };
    const enter = (event: PointerEvent) => { if (!event.buttons && event.pointerType !== 'touch') { hovered = true; sync(); } };
    const leave = () => { hovered = false; sync(); };
    const move = (event: PointerEvent) => { if (event.buttons && hovered) leave(); };
    const focusIn = () => { focused = true; sync(); };
    const focusOut = (event: FocusEvent) => {
      if (event.relatedTarget instanceof win.Node && owner.contains(event.relatedTarget as Node)) return;
      focused = false; sync();
    };
    const visibility = () => sync(), preference = () => sync();
    const intersection = typeof win.IntersectionObserver === 'function' ? new win.IntersectionObserver(entries => {
      inView = entries[0]?.isIntersecting ?? true; sync();
    }) : null;
    intersection?.observe(root);
    owner.addEventListener('pointerenter', enter, { passive: true });
    owner.addEventListener('pointerleave', leave, { passive: true });
    owner.addEventListener('pointermove', move, { passive: true });
    owner.addEventListener('focusin', focusIn); owner.addEventListener('focusout', focusOut);
    doc.addEventListener('visibilitychange', visibility); motion.addEventListener('change', preference);
    synchronize.current = sync; sync();
    return () => {
      disposed = true; synchronize.current = null; win.clearTimeout(expiry);
      intersection?.disconnect(); renderer.destroy();
      owner.removeEventListener('pointerenter', enter); owner.removeEventListener('pointerleave', leave);
      owner.removeEventListener('pointermove', move); owner.removeEventListener('focusin', focusIn); owner.removeEventListener('focusout', focusOut);
      doc.removeEventListener('visibilitychange', visibility); motion.removeEventListener('change', preference);
    };
  }, []);
  useLayoutEffect(() => { synchronize.current?.(); });

  return <span ref={rootRef} className="native-glyth-thought-material lcos-soft-underlight"
    data-native-glyth-thought-material data-layout={props.layout ?? 'row'} aria-hidden="true">
    <span ref={fieldRef} className="lcos-soft-underlight-field" />
  </span>;
}
