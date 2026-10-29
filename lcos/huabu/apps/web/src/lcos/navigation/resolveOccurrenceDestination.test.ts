import { expect, it } from 'vitest';
import { resolveOccurrenceDestination } from './resolveOccurrenceDestination';
it('preserves a child even when it prefers the same surface as the root', () => {
  expect(resolveOccurrenceDestination('child-c', [{ id: 'child', canvasId: 'child-c', name: 'Child', preferredSurface: 'context' }], { context: 'root-c' }))
    .toEqual({ canvasId: 'child-c', workspaceId: 'child', surface: 'context', label: 'Child' });
});
it('does not guess a workspace for ambiguous canvas bindings or missing preferred surface', () => {
  const a = { id: 'a', canvasId: 'c', name: 'A', preferredSurface: 'main' };
  expect(resolveOccurrenceDestination('c', [a, { ...a, id: 'b' }], {})).toBeUndefined();
  expect(resolveOccurrenceDestination('c', [{ ...a, preferredSurface: 'unknown' }], {})).toBeUndefined();
});
it('locates a known Surface root even when multiple Workspace aliases share its canvas', () => {
  expect(resolveOccurrenceDestination('root', [
    { id: 'a', canvasId: 'root', name: 'Alias A', preferredSurface: 'main' },
    { id: 'b', canvasId: 'root', name: 'Alias B', preferredSurface: 'context' },
  ], { main: 'root' })).toEqual({ canvasId: 'root', surface: 'main', label: '主画布' });
});
