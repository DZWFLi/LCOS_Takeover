import type { SqliteMetadataRepository } from '../../lcos/apps/local-core/src/metadata-repository.ts';
import type { CoreUploadHandler } from './core-upload.ts';
import type { LifecycleCreateNode, LifecycleNodeResult } from './node-lifecycle.ts';
import { sameNativeFileMaterialMetadata, type NativeFileMaterialMetadata } from './native-file-material.ts';

type Row = Record<string, any>;
type Failure = (status: number, code: string, message: string) => never;

/** Adapter from an original upload create intent to the existing exact
 * material placement owner. It neither imports again nor owns a new queue. */
export function createNativeUploadPlacement({ repository, projectId, upload, placement, fail }: {
  repository: SqliteMetadataRepository;
  projectId: string;
  upload: CoreUploadHandler;
  placement: { place(canvasId: string, input: any): Promise<any> };
  fail: Failure;
}) {
  return async (canvasId: string, input: LifecycleCreateNode): Promise<LifecycleNodeResult> => {
    if (!input || input.type !== 'text' || !input.data || typeof input.data !== 'object' || Array.isArray(input.data))
      fail(400, 'UPLOAD_CARRIER_INVALID', 'The original file upload needs its declared native carrier.');
    if (Object.keys(input).some(key => !['id', 'type', 'position', 'measured', 'data', 'lcos_ref'].includes(key)))
      fail(400, 'UPLOAD_CARRIER_INVALID', 'The uploaded carrier has unsupported fields.');
    const data = input.data, url = data.lcos_upload_url;
    const receipt = typeof url === 'string' ? upload.resolveReceiptByUrl(url) : undefined;
    if (!receipt) fail(409, 'CORE_UPLOAD_RECEIPT_REQUIRED', 'The exact completed local upload is required.');
    if (Object.keys(data).some(key => !['id', 'title', 'type', 'text', 'content', 'prompt', 'params', 'lcos_upload_url', 'lcos_file_ref'].includes(key)))
      fail(400, 'UPLOAD_CARRIER_INVALID', 'The uploaded carrier has unsupported content.');
    if (['text', 'content', 'prompt'].some(key => data[key] !== undefined && data[key] !== ''))
      fail(409, 'UPLOAD_IS_NOT_AUTHORED_TEXT', 'Uploaded file bytes cannot be replaced by Canvas text or a generation prompt.');
    if (data.params !== undefined) {
      const params = data.params as Row;
      if (!params || typeof params !== 'object' || Array.isArray(params)
        || Object.keys(params).length !== 0 && !(Object.keys(params).sort().join(',') === 'model,provider'
          && params.model === 'gemini-3.1-flash-lite' && params.provider === 'google'))
        fail(400, 'UPLOAD_CARRIER_INVALID', 'Generation settings are not part of this file placement.');
    }
    if (typeof input.id !== 'string' || !input.id.trim() || input.id.length > 200
      || !input.position || !Number.isFinite(input.position.x) || !Number.isFinite(input.position.y))
      fail(400, 'UPLOAD_CARRIER_INVALID', 'The original carrier ID and release position are required.');
    if (input.measured !== undefined && (!input.measured || !Number.isFinite(input.measured.width)
      || !Number.isFinite(input.measured.height) || input.measured.width <= 0 || input.measured.height <= 0
      || Object.keys(input.measured).some(key => !['width', 'height'].includes(key))))
      fail(400, 'UPLOAD_CARRIER_INVALID', 'The original carrier size is invalid.');
    const workspaces = repository.getWorkspaces(projectId).filter(row => row.canvasId === canvasId);
    if (workspaces.length !== 1 || String(workspaces[0]!.projectId) !== projectId)
      fail(409, 'UPLOAD_WORKSPACE_CHANGED', 'The upload target no longer has one owning Workspace.');
    const ref = receipt.lcos_ref, artifact = repository.getArtifact(ref.artifactId);
    const view = repository.getArtifactView(ref.artifactViewId), revision = repository.getArtifactRevision(ref.revisionId);
    const file = repository.getFileRecord(receipt.fileRecordId);
    if (!artifact || String(artifact.projectId) !== projectId || artifact.kind === 'image'
      || !view || String(view.artifactId) !== String(artifact.id) || String(view.revisionId) !== ref.revisionId
      || !revision || String(revision.artifactId) !== String(artifact.id) || String(revision.fileRecordId) !== receipt.fileRecordId
      || !file || String(file.projectId) !== projectId || file.mimeType !== receipt.mime_type || file.size !== receipt.file_size
      || receipt.artifact_kind !== artifact.kind)
      fail(409, 'UPLOAD_RECEIPT_CORE_MISMATCH', 'The exact uploaded Artifact, View, Revision and FileRecord could not be confirmed.');
    if (input.lcos_ref !== undefined && JSON.stringify(input.lcos_ref) !== JSON.stringify(ref))
      fail(409, 'UPLOAD_RECEIPT_CORE_MISMATCH', 'The initial upload reference does not identify its source receipt.');
    // ImportCopy may reuse an existing Artifact for identical bytes under a
    // different selected filename. Accept only that exact receipt's pending
    // name; the placement response still supplies Core's canonical title.
    if (data.title !== undefined && data.title !== artifact.title && data.title !== receipt.file_name)
      fail(409, 'CORE_TITLE_MISMATCH', 'The file title must come from its imported Artifact.');
    const expected: NativeFileMaterialMetadata = { artifactId: ref.artifactId, artifactViewId: ref.artifactViewId,
      revisionId: ref.revisionId, fileRecordId: receipt.fileRecordId, mimeType: receipt.mime_type,
      kind: artifact.kind, size: receipt.file_size };
    if (data.lcos_file_ref !== undefined && !sameNativeFileMaterialMetadata(data.lcos_file_ref, expected))
      fail(409, 'UPLOAD_RECEIPT_CORE_MISMATCH', 'File presentation cannot substitute another source version.');
    const result = await placement.place(canvasId, { projectId, workspaceId: String(workspaces[0]!.id),
      artifactId: ref.artifactId, revisionId: ref.revisionId, fileRecordId: receipt.fileRecordId,
      artifactViewId: ref.artifactViewId, position: input.position, size: input.measured ?? { width: 250, height: 250 } });
    const node = result.node, actual = node?.data?.lcos_ref;
    if (result.state !== 'present' || !node || !actual || actual.artifactId !== ref.artifactId
      || actual.revisionId !== ref.revisionId || actual.artifactViewId !== result.artifact_view_id
      || result.binding?.spatialId !== node.id || !['text', 'image'].includes(node.type))
      fail(409, 'UPLOAD_CARRIER_UNCONFIRMED', 'The original Canvas did not confirm this exact uploaded file.');
    return { clientNodeId: input.id, nodeId: node.id, type: node.type,
      position: node.position, measured: node.measured, data: node.data, lcos_ref: actual };
  };
}
