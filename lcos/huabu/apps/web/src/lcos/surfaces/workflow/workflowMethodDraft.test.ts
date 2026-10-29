import { expect, it } from 'vitest';

import { buildWorkflowMethodDraft, WORKFLOW_METHOD_UNAVAILABLE } from './workflowMethodDraft';

import type { PresentationViewV0, ProjectGraphSnapshot } from '@local-creative-os/contracts';

const graph = {
  project: { id: 'p' }, scopes: [{ id: 'wf', name: '已保存方法', kind: 'workflow' }],
  artifactViews: [{ id: 'view-a', artifactId: 'artifact-a', revisionId: 'historical' }],
  artifacts: [{ id: 'artifact-a', title: '已有材料', currentRevisionId: 'current' }],
  artifactRevisions: [{ id: 'historical', artifactId: 'artifact-a', fileRecordId: 'old-file' }, { id: 'current', artifactId: 'artifact-a', fileRecordId: 'current-file' }],
  fileRecords: [{ id: 'old-file', mimeType: 'text/markdown' }, { id: 'current-file', mimeType: 'text/plain' }],
} as unknown as ProjectGraphSnapshot;
const presentation = { id: 'presentation:workflow:wf', projectId: 'p', scopeId: 'wf', capability: 'workflow', version: 3,
  state: { memberViewIds: ['view-a'], workflowActions: [{ id: 'step-a', label: '对照检查', description: '阅读原始指标，逐项校验', attachedViewIds: ['view-a'], x: 0, y: 0 }],
    workflowOperators: { 'condition-a': { kind: 'condition', label: '检查分支', branches: [{ id: 'branch-a', label: '需要修正', predicateText: '指标不一致' }] } },
  } } as unknown as PresentationViewV0;

it('builds method text only from authored actions/operators and references the exact historical View revision', () => {
  const result = buildWorkflowMethodDraft('p', 'wf', graph, [presentation]);
  expect(result).toMatchObject({ status: 'ready', references: [{ entityType: 'artifact', entityId: 'artifact-a',
    artifactViewId: 'view-a', revisionId: 'historical', mimeType: 'text/markdown' }] });
  if (result.status !== 'ready') throw new Error(result.reason);
  expect(result.prompt).toContain('来源 Scope：wf');
  expect(result.prompt).toContain('version 3');
  expect(result.prompt).toContain('阅读原始指标，逐项校验');
  expect(result.prompt).toContain('条件说明：指标不一致');
  expect(result.references).toHaveLength(1);
});

it('does not replace a missing historical revision with Current or manufacture a method for an empty Workflow', () => {
  expect(buildWorkflowMethodDraft('p', 'wf', { ...graph, artifactRevisions: graph.artifactRevisions.filter((item) => String(item.id) !== 'historical') }, [presentation]))
    .toMatchObject({ status: 'unavailable', reason: expect.stringContaining('view-a') });
  expect(buildWorkflowMethodDraft('p', 'wf', graph, [{ ...presentation, state: { ...presentation.state, workflowActions: [], workflowOperators: {} } }]))
    .toEqual({ status: 'unavailable', reason: WORKFLOW_METHOD_UNAVAILABLE });
});
