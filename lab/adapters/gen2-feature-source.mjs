const DEFAULT_MAX_PREVIEW_BYTES = 8 * 1024 * 1024;
const PREVIEW_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp', 'text/plain', 'text/markdown']);

export class Gen2FeatureSourceError extends Error {
  constructor(code, message, status) {
    super(message);
    this.name = 'Gen2FeatureSourceError';
    this.code = code;
    if (status !== undefined) this.status = status;
  }
}

const fail = (code, message, status) => { throw new Gen2FeatureSourceError(code, message, status); };
const hasMethod = (owner, method) => typeof owner?.[method] === 'function';
function requireMethod(owner, method) {
  if (!hasMethod(owner, method)) fail('SOURCE_UNAVAILABLE', 'Injected Gen2 client method is unavailable: ' + method);
}
function requireId(value, code, label) {
  if (typeof value !== 'string' || value.trim() === '') fail(code, label + ' must be a non-empty string.');
  return value;
}
function requireRows(value, code, label) {
  if (!Array.isArray(value)) fail(code, label + ' response must be an array.');
  return value;
}

// Read-only adapter. It owns no HTTP client, credentials, fixture fallback, cache, or Core state.
export function createGen2FeatureSource({ projectClient, artifactClient, maxPreviewBytes = DEFAULT_MAX_PREVIEW_BYTES } = {}) {
  if (!Number.isSafeInteger(maxPreviewBytes) || maxPreviewBytes <= 0) throw new TypeError('maxPreviewBytes must be a positive safe integer.');
  const availableMethods = Object.freeze({
    listProjects: hasMethod(projectClient, 'listProjects'),
    listArtifacts: hasMethod(artifactClient, 'listArtifacts'),
    listArtifactRevisions: hasMethod(artifactClient, 'listArtifactRevisions'),
    getFileRecordContent: hasMethod(artifactClient, 'getFileRecordContent'),
  });
  const isInjected = Object.values(availableMethods).some(Boolean);
  const metadata = Object.freeze({
    mode: isInjected ? 'injected-gen2-clients' : 'unconfigured',
    source: isInjected ? 'injected-gen2-clients' : 'unconfigured',
    readOnly: true, runtimeStatus: 'not-probed', availableMethods, maxPreviewBytes,
  });
  async function listProjects() {
    requireMethod(projectClient, 'listProjects');
    const rows = requireRows(await projectClient.listProjects(), 'INVALID_PROJECT_RESPONSE', 'Project list');
    return rows.map((project) => {
      if (!project || typeof project !== 'object') fail('INVALID_PROJECT_RESPONSE', 'Project list contains an invalid record.');
      const projectId = requireId(project.id, 'INVALID_PROJECT_RESPONSE', 'Project id');
      if (typeof project.name !== 'string') fail('INVALID_PROJECT_RESPONSE', 'Project name must be a string.');
      return { projectId, name: project.name };
    });
  }

  async function requireProject(projectId) {
    requireId(projectId, 'INVALID_ARGUMENT', 'projectId');
    if (!(await listProjects()).some((project) => project.projectId === projectId)) {
      fail('PROJECT_NOT_FOUND', 'Project was not found in the injected Gen2 project list.');
    }
  }

  async function listAssets(projectId) {
    await requireProject(projectId);
    requireMethod(artifactClient, 'listArtifacts');
    requireMethod(artifactClient, 'listArtifactRevisions');
    const artifacts = requireRows(await artifactClient.listArtifacts(projectId, 'active'), 'INVALID_ARTIFACT_RESPONSE', 'Artifact list');
    return Promise.all(artifacts.map(async (artifact) => {
      if (!artifact || typeof artifact !== 'object') fail('INVALID_ARTIFACT_RESPONSE', 'Artifact list contains an invalid record.');
      const artifactId = requireId(artifact.id, 'INVALID_ARTIFACT_RESPONSE', 'Artifact id');
      if (artifact.projectId !== projectId) fail('CROSS_PROJECT_ARTIFACT', 'Artifact does not belong to the requested project.');
      if (typeof artifact.title !== 'string' || typeof artifact.kind !== 'string' || typeof artifact.availability !== 'string') {
        fail('INVALID_ARTIFACT_RESPONSE', 'Artifact is missing title, kind, or availability.');
      }
      const rows = requireRows(await artifactClient.listArtifactRevisions(artifactId), 'INVALID_REVISION_RESPONSE', 'Revision list');
      const revisions = rows.map((revision) => {
        if (!revision || typeof revision !== 'object') fail('INVALID_REVISION_RESPONSE', 'Revision list contains an invalid record.');
        const revisionId = requireId(revision.id, 'INVALID_REVISION_RESPONSE', 'Revision id');
        if (revision.artifactId !== artifactId) fail('WRONG_ARTIFACT_REVISION', 'Revision does not belong to the requested artifact.');
        const fileRecordId = requireId(revision.fileRecordId, 'INVALID_REVISION_RESPONSE', 'Revision fileRecordId');
        return {
          artifactId, revisionId, fileRecordId,
          ...(typeof revision.status === 'string' ? { status: revision.status } : {}),
          ...(typeof revision.source === 'string' ? { source: revision.source } : {}),
          ...(typeof revision.createdAt === 'string' ? { createdAt: revision.createdAt } : {}),
        };
      });
      const currentRevisionId = artifact.currentRevisionId == null
        ? null : requireId(artifact.currentRevisionId, 'INVALID_ARTIFACT_RESPONSE', 'currentRevisionId');
      const current = currentRevisionId === null ? undefined : revisions.find((item) => item.revisionId === currentRevisionId);
      return {
        projectId, artifactId, title: artifact.title, kind: artifact.kind, availability: artifact.availability,
        currentRevisionId, currentRevisionAvailable: current !== undefined,
        currentFileRecordId: current?.fileRecordId ?? null,
        ...(artifact.archivedAt === undefined ? {} : { archivedAt: artifact.archivedAt }),
        revisions,
      };
    }));
  }

  async function loadPreview({ projectId, artifactId, revisionId } = {}) {
    requireId(artifactId, 'INVALID_ARGUMENT', 'artifactId');
    const asset = (await listAssets(projectId)).find((item) => item.artifactId === artifactId);
    if (!asset) fail('ARTIFACT_NOT_FOUND_IN_PROJECT', 'Artifact was not found in the requested project.');
    const selectedId = revisionId == null ? asset.currentRevisionId : requireId(revisionId, 'INVALID_ARGUMENT', 'revisionId');
    if (selectedId === null) fail('CURRENT_REVISION_UNAVAILABLE', 'Artifact has no current revision to preview.');
    const revision = asset.revisions.find((item) => item.revisionId === selectedId);
    if (!revision) {
      fail(revisionId == null ? 'CURRENT_REVISION_UNAVAILABLE' : 'REVISION_NOT_FOUND_FOR_ARTIFACT',
        'Selected revision is not available for this artifact.');
    }
    requireMethod(artifactClient, 'getFileRecordContent');
    const blob = await artifactClient.getFileRecordContent(projectId, revision.fileRecordId);
    if (blob == null) fail('PREVIEW_CONTENT_UNAVAILABLE', 'Gen2 returned no preview bytes for this FileRecord.');
    if (typeof Blob === 'undefined' || !(blob instanceof Blob)) fail('INVALID_PREVIEW_CONTENT', 'Gen2 preview content must be a Blob.');
    if (blob.size > maxPreviewBytes) fail('PREVIEW_TOO_LARGE', 'Preview exceeds the configured byte limit.');
    const mimeType = typeof blob.type === 'string' ? (blob.type.toLowerCase().split(';', 1)[0] ?? '').trim() : '';
    if (!PREVIEW_MIMES.has(mimeType)) fail('UNSUPPORTED_PREVIEW_MIME', 'Preview MIME type is not supported: ' + (mimeType || 'unknown'));
    const kind = mimeType.startsWith('image/') ? 'image' : 'text';
    return {
      sourceIdentity: { projectId, artifactId, revisionId: revision.revisionId, fileRecordId: revision.fileRecordId },
      title: asset.title, mimeType, byteLength: blob.size, kind, blob,
      ...(kind === 'text' ? { text: await blob.text() } : {}),
    };
  }

  async function applyAdjustment() {
    fail('ACTION_NOT_IMPLEMENTED', 'Adjustment writes are not connected to Local Core.', 501);
  }

  return Object.freeze({ metadata, listProjects, listAssets, loadPreview, applyAdjustment });
}
