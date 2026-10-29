// Canonical Workflow import boundary. The archive becomes one Core workflow
// scope plus its Core worksite(s); the GUI never invents a parallel card store.

import type { WorkflowImportReceiptV1 } from '@local-creative-os/contracts';

import { HttpClient } from './client.js';
import { toCoreApiError, unwrapCoreValue, type CoreEnvelope } from './coreTypes.js';

export type { WorkflowImportReceiptV1 } from '@local-creative-os/contracts';

export class CoreWorkflowClient {
  constructor(private readonly http: HttpClient) {}

  /** Import `.lcos-workflow.zip` as canonical scope/worksite identities. */
  async importAsWorkflow(
    projectId: string,
    file: Blob,
    fileName: string,
    name?: string,
    signal?: AbortSignal,
  ): Promise<WorkflowImportReceiptV1> {
    const form = new FormData();
    form.set('file', file, fileName);
    if (name?.trim()) form.set('name', name.trim());
    try {
      const envelope = await this.http.postForm<CoreEnvelope<WorkflowImportReceiptV1>>(
        `/projects/${encodeURIComponent(projectId)}/workflow/import-as-workflow`,
        form,
        signal,
      );
      return unwrapCoreValue(envelope);
    } catch (error) {
      throw toCoreApiError(error);
    }
  }
}
