import type { ProjectGraphSnapshot, PresentationViewV0 } from '@local-creative-os/contracts';

/** Serialized Core read fixtures: the one assertion supplies Domain brands,
 * which the HTTP response also supplies as plain JSON strings. */
export function navigationGraph(overrides: object = {}): ProjectGraphSnapshot {
  return { schemaVersion: 1, graphVersion: 2, project: { id: 'p', name: '项目', rootPath: '', createdAt: '', updatedAt: '' },
    scopes: [], workspaces: [], collections: [], collectionMemberships: [], workspaceMemberships: [], workspaceEntityMemberships: [],
    artifacts: [], artifactViews: [], relations: [], notes: [], artifactRevisions: [], fileRecords: [], checkpoints: [], ...overrides,
  } as unknown as ProjectGraphSnapshot;
}
export function navigationPresentation(scopeId: string, memberViewIds: string[], overrides: object = {}): PresentationViewV0 {
  return { schemaVersion: 0, id: `presentation:${scopeId}`, projectId: 'p', scopeId, capability: 'context', renderer: 'context-space', version: 1,
    updatedBy: 'core', createdAt: '', updatedAt: '', state: { memberViewIds, memberEntityRefs: [], hiddenViewIds: [], positions: {},
      hierarchy: { parentByViewId: {}, orderByParent: {} }, presentationEdges: [], pinnedViewIds: [], emphasisByViewId: {}, ...overrides } };
}
