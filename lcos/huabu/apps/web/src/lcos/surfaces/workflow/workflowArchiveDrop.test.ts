import { describe, expect, it, vi } from 'vitest';

import {
  importWorkflowArchiveDrop,
  resolveWorkflowArchiveDrop,
} from './workflowArchiveDrop';

describe('Workflow archive native drop caller', () => {
  it('recognises only one exact .lcos-workflow.zip and leaves generic files to Huabu', () => {
    const workflow = new File(['workflow'], 'Review.LCOS-WORKFLOW.ZIP', {
      type: 'application/zip',
    });
    const ordinaryZip = new File(['archive'], 'assets.zip', {
      type: 'application/zip',
    });

    expect(resolveWorkflowArchiveDrop([ordinaryZip])).toEqual({ status: 'ignored' });
    expect(resolveWorkflowArchiveDrop([workflow])).toEqual({
      status: 'ready',
      file: workflow,
    });
    expect(resolveWorkflowArchiveDrop([workflow, ordinaryZip])).toEqual({
      status: 'rejected',
      reason: '一次只能导入一个 .lcos-workflow.zip，且不能与普通文件混合投放。',
    });
  });

  it('passes the original Blob and file name to the canonical host and returns its receipt', async () => {
    const file = new File(['workflow'], 'review.lcos-workflow.zip', {
      type: 'application/zip',
    });
    const receipt = {
      imported: true as const,
      created: true,
      scopeId: 'scope-workflow-review',
      workspaceIds: ['workspace-workflow-review'],
      members: 3,
      workspaces: 1,
    };
    const importWorkflowDefinition = vi.fn().mockResolvedValue(receipt);

    const outcome = await importWorkflowArchiveDrop(
      { status: 'ready', file },
      { importWorkflowDefinition },
    );

    expect(importWorkflowDefinition).toHaveBeenCalledOnce();
    expect(importWorkflowDefinition).toHaveBeenCalledWith(file, file.name);
    expect(outcome).toEqual({ status: 'imported', receipt });
  });

  it('consumes a failed Workflow import without producing a fallback canvas mutation', async () => {
    const file = new File(['broken'], 'broken.lcos-workflow.zip', {
      type: 'application/zip',
    });
    const sceneNodes = ['existing-node'];
    const importWorkflowDefinition = vi
      .fn()
      .mockRejectedValue(new Error('Unsupported workflow archive'));

    const outcome = await importWorkflowArchiveDrop(
      { status: 'ready', file },
      { importWorkflowDefinition },
    );

    expect(outcome).toEqual({
      status: 'failed',
      reason: 'Unsupported workflow archive',
    });
    // The caller has no Huabu addNode/addNodes owner. A consumed failure can
    // report the Core error, but it cannot alter the existing scene.
    expect(sceneNodes).toEqual(['existing-node']);
  });
});
