import { iOS9Curve } from './vendor/siriwave/ios9-curve';
import type SiriWave from './vendor/siriwave/types';

export type RipplePhase = 'quiet' | 'listening' | 'thinking' | 'working' | 'transcribing' | 'attention' | 'done' | 'error';
export interface RippleInput {
  readonly phase: RipplePhase;
  readonly active: boolean;
  /** Null = no measured audio. Only listening consumes energy. No synthetic progress. */
  readonly energy?: number | null;
}
export interface RippleOptions {
  /** Higher softness blends the same contours, never substitutes a static glow. */
  readonly softness?: number;
  readonly reducedMotion?: boolean;
}
const colorTokens = ['--lcos-ripple-violet', '--lcos-ripple-blue', '--lcos-ripple-pink', '--lcos-ripple-coral', '--lcos-ripple-warm'];
const clamp = (n: number): number => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));
export function rippleTarget(input: RippleInput): { amplitude: number; speed: number; flowing: boolean } {
  switch (input.phase) {
    case 'listening': return { amplitude: 0.28 + 2.0 * clamp(input.energy ?? 0), speed: 0.038 + 0.035 * clamp(input.energy ?? 0), flowing: input.active };
    case 'thinking': return { amplitude: 1.25, speed: 0.063, flowing: input.active };
    case 'working': return { amplitude: 0.72, speed: 0.040, flowing: input.active };
    case 'transcribing': return { amplitude: 0.8, speed: 0.05, flowing: input.active };
    default: return { amplitude: input.phase === 'attention' ? 0.42 : 0.20, speed: 0, flowing: false };
  }
}

/** Shared visual adapter, not a recorder, hover manager, task runner or window owner.
 * SiriWave owns the independent lobes. LCOS crops to the lower edge and supplies
 * palette, lifecycle and measured voice energy. The contours are a visual metaphor,
 * not a raw PCM oscilloscope or a claim about reasoning progress.
 */
export function mountSpectralRipple(host: HTMLElement, options: RippleOptions = {}) {
  const doc = host.ownerDocument, win = doc.defaultView!;
  const root = host.closest<HTMLElement>('.lcos-soft-underlight');
  const canvas = doc.createElement('canvas');
  canvas.className = 'lcos-spectral-ripple-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.pointerEvents = 'none';
  host.append(canvas); host.dataset.lcosRipple = 'true';
  root?.classList.add('lcos-ripple-enabled');
  const materialStyle = win.getComputedStyle(host);
  const palette = colorTokens.map(token => materialStyle.getPropertyValue(token).trim())
    .filter(value => /^\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}$/.test(value));
  const source = doc.createElement('canvas');
  const context = canvas.getContext('2d'), sourceContext = source.getContext('2d');
  const media = win.matchMedia('(prefers-reduced-motion: reduce)');
  const contrast = win.matchMedia('(forced-colors: active)');
  let reduced = options.reducedMotion ?? media.matches;
  let input: RippleInput = { phase: 'quiet', active: false };
  let destroyed = false, inView = true, frame = 0, lastAt = 0, renders = 0, pausedAt = 0, settlingUntil = 0;
  let softness = clamp(options.softness ?? 0.44), alpha = 0.78, gain = 0.20;
  let cssWidth = 300, cssHeight = 84, ratio = 1;
  const ctrl: SiriWave | null = sourceContext ? {
    ctx: sourceContext, width: 450, heightMax: 168, amplitude: 0.4, speed: 0.05,
    opt: { pixelDepth: 0.22, globalCompositeOperation: 'screen',
      ranges: { noOfCurves: [2, 4], amplitude: [0.65, 1], offset: [-3.4, 3.4], width: [2.8, 5.4],
        speed: [0.55, 1.25], despawnTimeout: [3000, 6500] } },
  } : null;
  const curves = ctrl ? palette.map(color => new iOS9Curve(ctrl, { color })) : [];
  const available = Boolean(context && sourceContext && ctrl && palette.length === colorTokens.length);
  host.dataset.rippleRenderer = available ? 'siriwave-canvas' : 'css-fallback';
  if (!available) root?.classList.remove('lcos-ripple-enabled');

  const resize = () => {
    if (destroyed || !available || !ctrl) return;
    const box = host.getBoundingClientRect();
    cssWidth = Math.max(1, box.width || 300); cssHeight = Math.max(1, box.height || 84);
    ratio = Math.min(1.5, win.devicePixelRatio || 1, 960 / cssWidth);
    canvas.width = Math.round(cssWidth * ratio); canvas.height = Math.round(cssHeight * ratio);
    source.width = canvas.width; source.height = Math.round(224 * ratio);
    ctrl.width = source.width; ctrl.heightMax = source.height / 2;
  };
  const paint = (advance: boolean) => {
    if (!available || !ctrl || !context || !sourceContext || destroyed) return;
    const target = rippleTarget(input);
    gain += (target.amplitude - gain) * 0.13;
    ctrl.amplitude = reduced ? 0.55 : gain;
    ctrl.speed = advance ? target.speed : 0;
    sourceContext.clearRect(0, 0, source.width, source.height);
    for (const curve of curves) curve.draw();
    context.clearRect(0, 0, canvas.width, canvas.height);
    const w = canvas.width, h = canvas.height, baseline = h * 0.84;
    // Glow is copied from the current contour. It cannot continue moving on its own.
    context.globalAlpha = alpha * (0.35 + softness * 0.2);
    context.filter = `blur(${(5 + softness * 6) * ratio}px)`;
    context.drawImage(source, 0, 0, source.width, ctrl.heightMax, 0, 1 * ratio, w, baseline);
    context.globalAlpha = alpha;
    context.filter = `blur(${(0.35 + softness * 1.35) * ratio}px)`;
    context.drawImage(source, 0, 0, source.width, ctrl.heightMax, 0, 0, w, baseline);
    // Only a short reflected foot, not the symmetric classic voice wave.
    context.globalAlpha = alpha * 0.45; context.filter = `blur(${3 * ratio}px)`;
    context.drawImage(source, 0, ctrl.heightMax, source.width, ctrl.heightMax, 0, baseline, w, h - baseline);
    context.filter = 'none'; context.globalAlpha = 1;
    context.globalCompositeOperation = 'destination-in';
    const mask = context.createLinearGradient(0, 0, 0, h);
    mask.addColorStop(0, 'rgba(0,0,0,0)'); mask.addColorStop(0.22, 'rgba(0,0,0,1)');
    mask.addColorStop(0.84, 'rgba(0,0,0,1)'); mask.addColorStop(1, 'rgba(0,0,0,0)');
    context.fillStyle = mask; context.fillRect(0, 0, w, h);
    context.globalCompositeOperation = 'source-over';
    renders++;
  };
  const canRun = () => available && !destroyed && !doc.hidden && !reduced && !contrast.matches && inView && (rippleTarget(input).flowing || Date.now() < settlingUntil);
  const stop = () => { win.cancelAnimationFrame(frame); frame = 0; if (!pausedAt) pausedAt = Date.now(); };
  const tick = (time: number) => {
    frame = 0; if (!canRun()) { stop(); return; }
    if (time - lastAt >= 30) { lastAt = time; paint(rippleTarget(input).flowing); }
    frame = win.requestAnimationFrame(tick);
  };
  const sync = () => {
    if (!canRun()) { stop(); return; }
    if (frame) return;
    if (pausedAt) { const delay = Date.now() - pausedAt; curves.forEach(curve => { if (curve.spawnAt) curve.spawnAt += delay; }); pausedAt = 0; }
    lastAt = 0; frame = win.requestAnimationFrame(tick);
  };
  const update = (next: RippleInput) => {
    if (destroyed) return;
    const changed = next.phase !== input.phase || next.active !== input.active;
    if (next.phase !== input.phase && next.active && !rippleTarget(next).flowing) settlingUntil = reduced ? 0 : Date.now() + 280;
    if (!next.active) settlingUntil = 0;
    input = { ...next, energy: next.energy == null ? null : clamp(next.energy) };
    host.dataset.ripplePhase = next.phase;
    host.dataset.measuredAudio = String(next.phase === 'listening' && next.energy != null);
    // Do not recreate the curves on hover or amplitude updates.
    if (changed && !canRun() && !doc.hidden && inView && next.active) { gain = rippleTarget(input).amplitude; paint(false); }
    sync();
  };
  const visibility = () => sync();
  const preference = () => { reduced = options.reducedMotion ?? media.matches; if (reduced && input.active) paint(false); sync(); };
  const observer = typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(() => { resize(); if (input.active && !doc.hidden && inView) paint(false); }) : null;
  observer?.observe(host);
  const intersection = typeof win.IntersectionObserver === 'function' ? new win.IntersectionObserver(entries => {
    inView = entries[0]?.isIntersecting ?? true; sync();
  }) : null;
  intersection?.observe(host);
  doc.addEventListener('visibilitychange', visibility);
  media.addEventListener('change', preference); contrast.addEventListener('change', preference);
  resize();
  // Warm the dormant curves once so reduced-motion users get a stable, readable state.
  if (ctrl) { for (let i = 0; i < 26; i++) { sourceContext!.clearRect(0, 0, source.width, source.height); curves.forEach(curve => curve.draw()); } }
  return {
    update,
    setEnergy(energy: number | null) { update({ ...input, energy }); },
    setSoftness(value: number) { softness = clamp(value); if (!canRun() && input.active) paint(false); },
    inspect: () => ({ renders, running: frame !== 0, reduced, inView, destroyed, phase: input.phase, gain,
      width: cssWidth, height: cssHeight, available,
      layers: curves.map(curve => ({ phase: curve.phases.slice(), peaks: curve.amplitudes.slice(), speed: curve.speeds.slice() })) }),
    destroy() {
      if (destroyed) return; destroyed = true; stop(); observer?.disconnect(); intersection?.disconnect();
      doc.removeEventListener('visibilitychange', visibility); media.removeEventListener('change', preference); contrast.removeEventListener('change', preference);
      canvas.remove(); delete host.dataset.lcosRipple; delete host.dataset.rippleRenderer;
      root?.classList.remove('lcos-ripple-enabled');
      source.width = source.height = 0;
    },
  };
}
