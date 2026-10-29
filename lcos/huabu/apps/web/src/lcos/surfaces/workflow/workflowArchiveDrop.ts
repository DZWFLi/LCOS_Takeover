import type {
  Gen2Host,
  WorkflowImportReceiptV1,
} from '@local-creative-os/web-gen2';

export const LCOS_WORKFLOW_ARCHIVE_SUFFIX = '.lcos-workflow.zip';

export type WorkflowArchiveDropResolution =
  | { readonly status: 'ignored' }
  | { readonly status: 'rejected'; readonly reason: string }
  | { readonly status: 'ready'; readonly file: File };

export type WorkflowArchiveDropOutcome =
  | { readonly status: 'imported'; readonly receipt: WorkflowImportReceiptV1 }
  | { readonly status: 'failed'; readonly reason: string };

export type WorkflowArchiveImporter = Pick<Gen2Host, 'importWorkflowDefinition'>;

/**
 * Recognise the one portable Workflow archive gesture that LCOS owns.
 * Generic files remain Huabu's existing concern. Once a Workflow archive is
 * present, a mixed/multi-file drop fails closed instead of importing some
 * files as Workflow truth and projecting the rest as unrelated canvas nodes.
 */
export function resolveWorkflowArchiveDrop(
  files: FileList | readonly File[],
): WorkflowArchiveDropResolution {
  const all = Array.from(files);
  const workflowArchives = all.filter((file) =>
    file.name.toLowerCase().endsWith(LCOS_WORKFLOW_ARCHIVE_SUFFIX),
  );

  if (workflowArchives.length === 0) return { status: 'ignored' };
  if (all.length !== 1 || workflowArchives.length !== 1) {
    return {
      status: 'rejected',
      reason: '一次只能导入一个 .lcos-workflow.zip，且不能与普通文件混合投放。',
    };
  }
  const file = workflowArchives[0];
  return file === undefined ? { status: 'ignored' } : { status: 'ready', file };
}

/**
 * Thin caller only: Core owns the import and the host owns reconciliation.
 * Returning a failure outcome (instead of falling through to Huabu's generic
 * upload path) is what keeps the current canvas scene unchanged on failure.
 */
export async function importWorkflowArchiveDrop(
  resolution: Extract<WorkflowArchiveDropResolution, { readonly status: 'ready' }>,
  importer: WorkflowArchiveImporter,
): Promise<WorkflowArchiveDropOutcome> {
  try {
    const receipt = await importer.importWorkflowDefinition(
      resolution.file,
      resolution.file.name,
    );
    return { status: 'imported', receipt };
  } catch (error) {
    return {
      status: 'failed',
      reason: error instanceof Error ? error.message : '工作流归档导入失败',
    };
  }
}
