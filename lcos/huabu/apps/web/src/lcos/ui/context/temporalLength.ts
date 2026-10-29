export type TemporalLengthTier = 'L0' | 'L1' | 'L2' | 'L3' | 'L4';

export interface TemporalLengthPresentation {
  readonly score: number;
  readonly tier: TemporalLengthTier;
  readonly width: 8 | 11 | 16 | 23 | 34;
}

const WIDTH_BY_TIER: Readonly<Record<TemporalLengthTier, TemporalLengthPresentation['width']>> = {
  L0: 8,
  L1: 11,
  L2: 16,
  L3: 23,
  L4: 34,
};

/**
 * One presentation owner for T5 §8.6. Inputs are counts already projected from
 * canonical durable facts. The log curve keeps one unusually busy episode from
 * flattening every other episode into the shortest tier.
 */
export function temporalLengthPresentation(input: {
  readonly eventCount: number;
  readonly targetCount: number;
}): TemporalLengthPresentation {
  const eventCount = Math.max(0, Number.isFinite(input.eventCount) ? input.eventCount : 0);
  const targetCount = Math.max(0, Number.isFinite(input.targetCount) ? input.targetCount : 0);
  const score = Math.log2(1 + eventCount) + 0.6 * Math.log2(1 + targetCount);
  const tier: TemporalLengthTier = score < 2
    ? 'L0'
    : score < 3
      ? 'L1'
      : score < 4
        ? 'L2'
        : score < 5
          ? 'L3'
          : 'L4';
  return { score, tier, width: WIDTH_BY_TIER[tier] };
}
