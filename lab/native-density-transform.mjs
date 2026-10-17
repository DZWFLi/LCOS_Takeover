// Only change the dependency address of the mature density resolver. Its
// thresholds, hysteresis, population cap and editor priority remain untouched.
export function transformNativeDensityHook(source) {
  const original = "import { useStore, useViewport } from '@xyflow/react';";
  const native = "import { useStore, useViewport } from '/lcos/native-flow.js';";
  if (source.includes(native) && !source.includes(original)) return source;
  if (source.split(original).length !== 2 || source.includes(native)) {
    throw new Error('Native density seam changed: expected one original Flow query-hook import.');
  }
  return source.replace(original, native);
}
