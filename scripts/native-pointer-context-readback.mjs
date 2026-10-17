/** @typedef {{ entityRef: unknown, title: unknown }} CoreBoundContextFingerprintRow */
/** @typedef {{ coreBoundContextFingerprint: CoreBoundContextFingerprintRow[] }} WorkViewCoreReadback */

/**
 * Preserve full Core entity references and titles, not only view IDs or labels.
 * @param {unknown} projection
 * @returns {CoreBoundContextFingerprintRow[]}
 */
export function coreBoundContextFingerprint(projection) {
  const rows = projection && typeof projection === 'object'
    ? projection.relation?.boundContext
    : null;
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    entityRef: row?.entityRef ?? null,
    title: row?.title ?? null,
  })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

/**
 * Stable interface returned by original Work View readback for exact Core comparison.
 * @param {unknown} projection
 * @returns {WorkViewCoreReadback}
 */
export function workViewCoreReadback(projection) {
  return { coreBoundContextFingerprint: coreBoundContextFingerprint(projection) };
}
