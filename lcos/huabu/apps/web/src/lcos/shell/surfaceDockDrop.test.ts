import { describe, expect, it } from 'vitest';

import { surfaceDockDropSemantic } from './surfaceDockDrop';

import type { PortalDropWorkspaceContextValue } from '../drop/PortalDropWorkspaceContext';

const context: PortalDropWorkspaceContextValue = { projectId: 'project', workspaces: [
  { id: 'main-workspace', scopeId: 'root-scope', name: '随便改名字', preferredSurface: 'main', canvasId: 'main-canvas' },
  { id: 'context-workspace', scopeId: 'root-scope', name: '并不是Context', preferredSurface: 'context', canvasId: 'context-canvas' },
  { id: 'workflow-workspace', scopeId: 'root-scope', name: 'Context', preferredSurface: 'workflow', canvasId: 'workflow-canvas' },
] };

describe('SurfaceDock canonical receivers', () => {
  it('preserves Main semantics and exact scope kind even when the roots share one scope', () => {
    expect(surfaceDockDropSemantic('project', 'main', 'main-canvas', context))
      .toEqual({ kind: 'spatial-membership', targetRef: { kind: 'main' } });
    expect(surfaceDockDropSemantic('project', 'context', 'context-canvas', context))
      .toEqual({ kind: 'spatial-membership', targetRef: { kind: 'context', id: 'root-scope' } });
    expect(surfaceDockDropSemantic('project', 'workflow', 'workflow-canvas', context))
      .toEqual({ kind: 'spatial-membership', targetRef: { kind: 'workflow', id: 'root-scope' } });
  });

  it('keeps missing, wrong-project, ambiguous, mismatched and incomplete addresses as visible exclusions', () => {
    const cases = [
      surfaceDockDropSemantic('project', 'context', undefined, context),
      surfaceDockDropSemantic('another', 'context', 'context-canvas', context),
      surfaceDockDropSemantic('project', 'context', 'context-canvas', { ...context,
        workspaces: [...context.workspaces, { id: 'duplicate', name: '重复现场', canvasId: 'context-canvas', preferredSurface: 'context' }] }),
      surfaceDockDropSemantic('project', 'context', 'workflow-canvas', context),
      surfaceDockDropSemantic('project', 'context', 'context-canvas', { ...context,
        workspaces: context.workspaces.map(workspace => ({ ...workspace, scopeId: undefined })) }),
    ];
    expect(cases.every(semantic => semantic.kind === 'drop-exclusion' && semantic.reason.length > 0)).toBe(true);
  });
});
