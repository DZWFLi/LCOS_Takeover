/** Match browser hit-test evidence against one screen-space pointer destination. */
export function pointerHitEvidence(records, nodeId, x, y) {
  return records.filter((record) => Math.abs(record.x - x) <= 1 && Math.abs(record.y - y) <= 1
    && record.exposedTargetIds?.includes(nodeId)).at(-1) ?? null;
}
