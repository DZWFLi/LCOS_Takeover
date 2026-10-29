/**
 * Lifted from GEN1 features/spatial/visual/glythMotion.ts.
 * Retained: shared subscriber clock, shared pointer, first/last subscriber lifecycle.
 * Thin adaptation: idle cadence, document suspension, injectable clock for ordinary tests.
 * No legacy state enum is imported; this is rendering infrastructure, not product truth.
 */
type ClockSubscriber = (seconds: number) => void;
export type MotionCadence = 'active' | 'idle';
export interface MotionClockDriver {
  readonly now: () => number;
  readonly requestFrame: (callback: (now: number) => void) => number;
  readonly cancelFrame: (id: number) => void;
  readonly setTimer: (callback: () => void, milliseconds: number) => number;
  readonly clearTimer: (id: number) => void;
  readonly visible: () => boolean;
  readonly onVisibilityChange: (callback: () => void) => () => void;
}

export function createGlythClock(driver: MotionClockDriver) {
  const subscribers = new Map<ClockSubscriber, { cadence: MotionCadence; last: number }>();
  let frame: number | undefined;
  let timer: number | undefined;
  let unsubscribeVisibility: (() => void) | undefined;
  let calls = 0;
  let throttledPasses = 0;
  const stop = (): void => {
    if (frame !== undefined) driver.cancelFrame(frame);
    if (timer !== undefined) driver.clearTimer(timer);
    frame = undefined;
    timer = undefined;
  };
  const schedule = (): void => {
    if (frame !== undefined || timer !== undefined || subscribers.size === 0 || !driver.visible()) return;
    if ([...subscribers.values()].some((entry) => entry.cadence === 'active')) {
      frame = driver.requestFrame(tick);
    } else {
      const now = driver.now();
      const nextDue = Math.min(...[...subscribers.values()].map((entry) => entry.last + 80 - now));
      timer = driver.setTimer(() => tick(driver.now()), Math.max(16, Math.min(80, nextDue)));
    }
  };
  const tick = (now: number): void => {
    frame = undefined;
    timer = undefined;
    if (!driver.visible()) return;
    // GEN1 shared clock: no per-character requestAnimationFrame.
    const started = driver.now();
    // Measured 300 idle bodies produced a 104ms burst. Bound each render pass,
    // rotate serviced entries for fairness, and leave the remaining work for the shared clock.
    // This changes rendering cadence only, never the owner's visibility or LOD state.
    const due = [...subscribers].sort((a, b) =>
      Number(b[1].cadence === 'active') - Number(a[1].cadence === 'active'));
    for (const [subscriber, entry] of due) {
      const interval = entry.cadence === 'active' ? 32 : 80;
      if (now - entry.last < interval) continue;
      entry.last = now;
      calls += 1;
      subscriber(now / 1000);
      // The callback may have unsubscribed itself during teardown.
      if (subscribers.has(subscriber)) {
        subscribers.delete(subscriber);
        subscribers.set(subscriber, entry);
      }
      if (driver.now() - started >= 4) { throttledPasses += 1; break; }
    }
    schedule();
  };
  const subscribe = (subscriber: ClockSubscriber, cadence: MotionCadence): (() => void) => {
    subscribers.set(subscriber, { cadence, last: -Infinity });
    if (subscribers.size === 1) {
      unsubscribeVisibility = driver.onVisibilityChange(() => { stop(); schedule(); });
    }
    stop();
    schedule();
    return () => {
      subscribers.delete(subscriber);
      stop();
      if (subscribers.size === 0) { unsubscribeVisibility?.(); unsubscribeVisibility = undefined; }
      schedule();
    };
  };
  return {
    subscribe,
    inspect: () => ({ subscribers: subscribers.size, framesPending: frame === undefined ? 0 : 1,
      timersPending: timer === undefined ? 0 : 1, visibilityListeners: unsubscribeVisibility === undefined ? 0 : 1, calls, throttledPasses }),
  };
}

let clock: ReturnType<typeof createGlythClock> | undefined;
function browserClock() {
  clock ??= createGlythClock({
    now: () => performance.now(),
    requestFrame: (callback) => window.requestAnimationFrame(callback),
    cancelFrame: (id) => window.cancelAnimationFrame(id),
    setTimer: (callback, milliseconds) => window.setTimeout(callback, milliseconds),
    clearTimer: (id) => window.clearTimeout(id),
    visible: () => document.visibilityState === 'visible',
    onVisibilityChange: (callback) => {
      document.addEventListener('visibilitychange', callback);
      return () => document.removeEventListener('visibilitychange', callback);
    },
  });
  return clock;
}
export function subscribeGlythClock(subscriber: ClockSubscriber, cadence: MotionCadence = 'active'): () => void {
  return browserClock().subscribe(subscriber, cadence);
}

/** GEN1 shared pointer tracker. Null until a real pointer event, never an invented gaze target. */
export interface PointerPosition { readonly x: number; readonly y: number }
const pointerListeners = new Set<(position: PointerPosition | null) => void>();
let pointerPosition: PointerPosition | null = null;
let pointerListenerAttached = false;
function handlePointerMove(event: PointerEvent): void {
  pointerPosition = { x: event.clientX, y: event.clientY };
  pointerListeners.forEach((listener) => listener(pointerPosition));
}
function handlePointerLeave(): void {
  pointerPosition = null;
  pointerListeners.forEach((listener) => listener(null));
}
export function subscribePointerPosition(listener: (position: PointerPosition | null) => void): () => void {
  if (!pointerListenerAttached) {
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', handlePointerLeave);
    pointerListenerAttached = true;
  }
  pointerListeners.add(listener);
  return () => {
    pointerListeners.delete(listener);
    if (pointerListeners.size === 0 && pointerListenerAttached) {
      window.removeEventListener('pointermove', handlePointerMove);
      document.documentElement.removeEventListener('pointerleave', handlePointerLeave);
      pointerListenerAttached = false;
      pointerPosition = null;
    }
  };
}
export function getPointerPosition(): PointerPosition | null { return pointerPosition; }

// Read-only diagnostics for measured tests. Not exposed on window or used as functional truth.
export function inspectGlythMotion() {
  return { ...(clock?.inspect() ?? { subscribers: 0, framesPending: 0, timersPending: 0, visibilityListeners: 0, calls: 0, throttledPasses: 0 }),
    pointerSubscribers: pointerListeners.size, pointerListeners: pointerListenerAttached ? 1 : 0 };
}
