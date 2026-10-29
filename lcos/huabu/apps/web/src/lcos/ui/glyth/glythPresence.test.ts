import { expect, it } from 'vitest';

import { donorPoseFor, motionCadenceFor } from './glythPresence';

import type { GlythVisualInput } from './glythPresence';

const idle: GlythVisualInput = { pose: 'idle', selected: false, hovered: false, mark: false, reducedMotion: false };
it('uses only owner-provided user state to select the donor pose', () => {
  expect(donorPoseFor(idle)).toBe('idle');
  expect(donorPoseFor({ ...idle, pose: 'working', userState: 'thinking' })).toBe('thinking');
  expect(donorPoseFor({ ...idle, userState: 'unavailable' })).toBe('confused');
  expect(donorPoseFor({ ...idle, userState: 'done' })).toBe('idle');
});
it('idle stays on the shared low cadence and active attention uses the active lane', () => {
  expect(motionCadenceFor(idle)).toBe('idle');
  expect(motionCadenceFor({ ...idle, hovered: true })).toBe('active');
  expect(motionCadenceFor({ ...idle, selected: true })).toBe('active');
  expect(motionCadenceFor({ ...idle, pose: 'working' })).toBe('active');
});
