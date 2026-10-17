// Installed page-Da_DfwiK.js: private DC(point, digits=2), used by PC's
// persistence serializer. It is not exported. Readback stays authoritative;
// accept only the requested value or the donor's exact persisted rounding.
export function nativeCollectionSavedPlacementMatches(actual, desired) {
  if (!actual || !desired || ![actual.x, actual.y, desired.x, desired.y].every(Number.isFinite)) return false;
  const exact = (left, right) => Math.abs(left.x - right.x) <= 0.000001 && Math.abs(left.y - right.y) <= 0.000001;
  const persisted = { x: Math.round(desired.x * 100) / 100, y: Math.round(desired.y * 100) / 100 };
  return exact(actual, desired) || exact(actual, persisted);
}
