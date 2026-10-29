/** Typed boundary around the uploaded JS donor; implementation remains in its original JS. */
export type DonorPose = 'idle' | 'listening' | 'thinking' | 'working' | 'curious' | 'confused';
export interface DonorRendererOptions {
  readonly shape?: string;
  readonly color?: string;
  readonly state: DonorPose;
  readonly now: () => number;
  readonly clipId: string;
  readonly reduceMotion: boolean;
  readonly inkFlat: string;
  readonly eyeColor: string;
}
export interface DonorSnapshot {
  readonly state: DonorPose;
  readonly shape: string;
  readonly eyeFrom: number;
  readonly eyeTo: number;
  readonly spin: number;
  readonly tx: number;
  readonly ty: number;
  readonly squash: number;
  readonly blink: number;
  readonly reactionActive: boolean;
  readonly particlesAlive: boolean;
}
export interface DonorRenderer {
  reduceMotion: boolean;
  setShape(shape: string): void;
  setColor(color: string, scheme?: string): void;
  setState(pose: DonorPose, options?: { readonly resetEyes?: boolean }): void;
  setPointer(point: { readonly x: number; readonly y: number } | null): void;
  setFollowPointer(value: boolean): void;
  setInk(color: string): void;
  setEyeColor(color: string): void;
  advance(now: number): void;
  renderStatic(): void;
  spinOnce(turns?: number): void;
  bounceOnce(): void;
  burstOnce(): void;
  snapshot(): DonorSnapshot;
  destroy(): void;
}
export function createGlythRenderer(svg: SVGSVGElement, options: DonorRendererOptions): DonorRenderer;

export const GLYTH_SHAPES: readonly string[];
export const GLYTH_COLORS: readonly string[];
