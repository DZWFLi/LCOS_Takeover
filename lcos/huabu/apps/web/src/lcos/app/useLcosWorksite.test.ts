import { describe, expect, it } from 'vitest';

import { buildSurfaceCanvasMap } from './useLcosWorksite';

import type { Workspace } from '@local-creative-os/domain';

function workspace(
  id: string,
  scopeId: string,
  preferredSurface: Workspace['preferredSurface'],
  canvasId?: string,
): Workspace {
  return {
    id: id as Workspace['id'],
    projectId: 'project-1' as Workspace['projectId'],
    scopeId: scopeId as Workspace['scopeId'],
    name: id,
    intent: 'build',
    viewport: { x: 0, y: 0, zoom: 1 },
    focusedViewIds: [],
    visibleLayers: ['core'],
    contextPolicy: 'workspace-related',
    preferredSurface,
    ...(canvasId === undefined ? {} : { canvasId }),
    updatedAt: '2026-09-20T00:00:00.000Z',
  };
}

describe('root surface workspace selection', () => {
  it('keeps imported workflow child workspaces out of the root SurfaceDock map', () => {
    const map = buildSurfaceCanvasMap([
      workspace('workflow-root', 'scope-root', 'workflow', 'canvas-root'),
      workspace('workflow-child-a', 'scope-workflow-a', 'workflow', 'canvas-child-a'),
      workspace('workflow-child-b', 'scope-workflow-a', 'workflow', 'canvas-child-b'),
    ], 'scope-root');

    expect(map).toEqual({ workflow: 'canvas-root' });
  });

  it('fails closed when the root surface itself is ambiguous', () => {
    const map = buildSurfaceCanvasMap([
      workspace('workflow-root-a', 'scope-root', 'workflow', 'canvas-root-a'),
      workspace('workflow-root-b', 'scope-root', 'workflow', 'canvas-root-b'),
      workspace('workflow-child', 'scope-workflow-a', 'workflow', 'canvas-child'),
    ], 'scope-root');

    expect(map).toEqual({});
  });
});
