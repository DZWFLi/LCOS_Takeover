import type { LcosWindow } from '../shell/lcosShellStore';

/**
 * A Reader opened from a Collection or source Reader returns to that live window, not an
 * unrelated canvas locator. The window id is transient UI navigation context,
 * never a Core entity or a saved worksite/camera identity.
 */
export function readerReturnWindowId(
  reader: Pick<LcosWindow, 'id' | 'bodyKey' | 'returnToWindowId'>,
  windows: readonly Pick<LcosWindow, 'id' | 'bodyKey'>[],
): string | undefined {
  if (reader.bodyKey !== 'reader' || !reader.returnToWindowId || reader.returnToWindowId === reader.id) {
    return undefined;
  }
  return windows.find((window) => window.id === reader.returnToWindowId
    && (window.bodyKey === 'collection' || window.bodyKey === 'reader'
      || window.bodyKey === 'conversation' || window.bodyKey === 'run-review'))?.id;
}

/** Reusing an existing Reader must not inherit the previous caller's origin. */
export function withoutReaderOpenOrigin<T extends {
  readonly readerSource?: unknown;
  readonly sourceLocator?: unknown;
  readonly returnToWindowId?: string;
}>(window: T): Omit<T, 'readerSource' | 'sourceLocator' | 'returnToWindowId'> {
  const { readerSource: _staleNode, sourceLocator: _staleLocator, returnToWindowId: _staleWindow, ...remaining } = window;
  return remaining;
}
