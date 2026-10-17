import { observeGlythVisibility } from './glythVisibility';
import { getPointerPosition, subscribeGlythClock, subscribePointerPosition } from '../motion/glythMotion';
import { createGlythRenderer } from './vendor/grok-replica/renderer.js';

import type { GlythAppearance } from './glythAppearance';
import type { MotionCadence } from '../motion/glythMotion';
import type { DonorPose } from './vendor/grok-replica/renderer.js';

export interface GlythVisualInput {
  readonly appearance?: GlythAppearance;
  /** Already resolved by the existing LCOS presentation owner. */
  readonly pose: 'idle' | 'listening' | 'working' | 'curious';
  readonly userState?: 'ready' | 'thinking' | 'working' | 'needs_user' | 'done' | 'unavailable';
  readonly selected: boolean;
  readonly hovered: boolean;
  readonly reducedMotion: boolean;
  /** Owner-provided density/interaction hints; no camera or LOD calculation here. */
  readonly mark: boolean;
  readonly paused?: boolean;
  /** Optional real receipt/event identity. Never trigger a celebration on a mere drop release. */
  readonly reaction?: { readonly id: string; readonly kind: 'spin' | 'bounce' | 'burst' };
}
export function donorPoseFor(input: GlythVisualInput): DonorPose {
  if (input.userState === 'unavailable') return 'confused';
  if (input.userState === 'thinking') return 'thinking';
  return input.pose === 'idle' && (input.userState === undefined || input.userState === 'ready')
    ? input.appearance?.motion ?? 'idle' : input.pose;
}
export function motionCadenceFor(input: GlythVisualInput): MotionCadence {
  return input.hovered || input.selected || input.pose === 'working' || input.userState === 'thinking'
    ? 'active' : 'idle';
}

export interface PresenceDependencies {
  readonly subscribeClock: typeof subscribeGlythClock;
  readonly observeVisibility: typeof observeGlythVisibility;
}
const browserDependencies: PresenceDependencies = {
  subscribeClock: subscribeGlythClock,
  observeVisibility: observeGlythVisibility,
};

/**
 * Lifecycle adapter only. Body, eyes, gaze, springs and finite reactions are donor code.
 * This controller never reads/writes Core, Selection, navigation, bindings or geometry.
 */
export function mountGlythPresence(
  svg: SVGSVGElement,
  initial: GlythVisualInput,
  clipId: string,
  dependencies: PresenceDependencies = browserDependencies,
) {
  let input = initial;
  let localTime = 0;
  let lastTime: number | undefined;
  let visible = false;
  let destroyed = false;
  let unsubscribeClock: (() => void) | undefined;
  let unsubscribePointer: (() => void) | undefined;
  let subscribedCadence: MotionCadence | undefined;
  let updates = 0;
  // Initial snapshots and remounts must not replay old completion reactions.
  let consumedReactionId = initial.reaction?.id;
  const renderer = createGlythRenderer(svg, {
    state: donorPoseFor(initial),
    ...(initial.appearance ? { shape: initial.appearance.shape, color: initial.appearance.color } : {}),
    now: () => localTime,
    clipId,
    reduceMotion: initial.reducedMotion,
    inkFlat: initial.appearance ? '' : 'var(--gen2-text, #242625)',
    eyeColor: 'var(--lcos-color-text-on-inverse, #ffffff)',
  });
  renderer.renderStatic();

  const frame = (seconds: number): void => {
    if (destroyed) return;
    const milliseconds = seconds * 1000;
    const dt = lastTime === undefined ? 0 : Math.min(96, Math.max(0, milliseconds - lastTime));
    lastTime = milliseconds;
    localTime += dt;
    renderer.advance(localTime);
    updates += 1;
  };
  const sync = (): void => {
    const moving = visible && !input.reducedMotion && !input.mark && !input.paused && input.userState !== 'unavailable';
    const cadence = motionCadenceFor(input);
    if (!moving || subscribedCadence !== cadence) {
      unsubscribeClock?.(); unsubscribeClock = undefined; subscribedCadence = undefined;
      lastTime = undefined;
    }
    if (moving && unsubscribeClock === undefined) {
      subscribedCadence = cadence;
      unsubscribeClock = dependencies.subscribeClock(frame, cadence);
    }
    const follow = moving && input.hovered;
    renderer.setFollowPointer(follow);
    if (follow && unsubscribePointer === undefined) {
      renderer.setPointer(getPointerPosition());
      unsubscribePointer = subscribePointerPosition((point) => renderer.setPointer(point));
    } else if (!follow && unsubscribePointer !== undefined) {
      unsubscribePointer(); unsubscribePointer = undefined;
    }
    if (input.reducedMotion || input.mark || input.userState === 'unavailable') renderer.renderStatic();
  };
  const unobserve = dependencies.observeVisibility(svg, (value) => {
    if (destroyed) return;
    visible = value;
    sync();
  });

  const update = (next: GlythVisualInput): void => {
    if (destroyed) return;
    const previousPose = donorPoseFor(input);
    const previousReduced = input.reducedMotion;
    const previousAppearance = input.appearance;
    input = next;
    renderer.reduceMotion = next.reducedMotion;
    if (next.appearance?.shape !== previousAppearance?.shape) renderer.setShape(next.appearance?.shape ?? 'blob');
    if (next.appearance?.color !== previousAppearance?.color) renderer.setColor(next.appearance?.color ?? 'black');
    if (Boolean(next.appearance) !== Boolean(previousAppearance)) renderer.setInk(next.appearance ? '' : 'var(--gen2-text, #242625)');
    if (previousPose !== donorPoseFor(next)) renderer.setState(donorPoseFor(next));
    if (previousReduced && !next.reducedMotion) lastTime = undefined;
    sync();
    const reaction = next.reaction;
    if (reaction !== undefined && reaction.id !== consumedReactionId) {
      consumedReactionId = reaction.id;
      // Unseen/paused/reduced reactions are consumed, not queued for an out-of-context replay.
      if (visible && !next.reducedMotion && !next.mark && !next.paused && next.userState !== 'unavailable') {
        if (reaction.kind === 'spin') renderer.spinOnce();
        else if (reaction.kind === 'bounce') renderer.bounceOnce();
        else renderer.burstOnce();
      }
    }
  };
  const destroy = (): void => {
    if (destroyed) return;
    destroyed = true;
    unsubscribeClock?.(); unsubscribePointer?.(); unobserve();
    unsubscribeClock = undefined; unsubscribePointer = undefined;
    renderer.destroy();
    svg.replaceChildren();
  };
  return {
    update,
    destroy,
    inspect: () => ({ ...renderer.snapshot(), updates, localTime, visible, destroyed,
      subscribed: unsubscribeClock !== undefined, consumedReactionId }),
  };
}
