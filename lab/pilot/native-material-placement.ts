import type { SqliteMetadataRepository } from '../../lcos/apps/local-core/src/metadata-repository.ts';
import type { Gen2Host } from '../../lcos/apps/web-gen2/src/host/projectionFacade.ts';
import { isNativeFileMaterial } from './native-file-material.ts';

type RecordValue = Record<string, any>;
export function readNativeMaterialVersion({ repository, projectId, input, fail, requireRenderer = true }: {
  repository: SqliteMetadataRepository; projectId: string;
  input: { artifactId: string; revisionId: string; fileRecordId: string; artifactViewId?: string };
  fail(status: number, code: string, message: string): never; requireRenderer?: boolean;
}) {
  const artifact = repository.getArtifact(input.artifactId), revision = repository.getArtifactRevision(input.revisionId);
  const file = repository.getFileRecord(input.fileRecordId);
  if (!artifact || String(artifact.projectId) !== projectId || artifact.archivedAt !== undefined || !revision
    || String(revision.artifactId) !== input.artifactId || String(revision.fileRecordId) !== input.fileRecordId
    || !['current', 'superseded'].includes(revision.status) || !file || String(file.projectId) !== projectId
    || file.availability !== 'current' || typeof revision.contentHash !== 'string' || !revision.contentHash
    || file.observedHash !== revision.contentHash
    || String(artifact.currentRevisionId ?? '') === input.revisionId && artifact.availability !== 'available')
    fail(409, 'MATERIAL_VERSION_UNAVAILABLE', 'The exact selected material version or its FileRecord is unavailable.');
  if (requireRenderer && !['text', 'markdown', 'image'].includes(artifact.kind) && !isNativeFileMaterial(artifact.kind))
    fail(501, 'MATERIAL_RENDERER_NOT_CONNECTED', 'This material has no connected native carrier; it was not converted to text.');
  const originView = input.artifactViewId ? repository.getArtifactView(input.artifactViewId) : undefined;
  // Ownership remains mandatory even when an already-placed exact carrier is
  // being read back after its mutable origin advanced to another revision.
  if (input.artifactViewId && (!originView || String(originView.artifactId) !== input.artifactId
    || !repository.getScopes(projectId).some(scope => String(scope.id) === String(originView.scopeId))))
    fail(409, 'MATERIAL_SOURCE_VIEW_CHANGED', 'The source View does not belong to this exact project and Artifact.');
  return { artifact: artifact!, revision: revision!, file: file!, originView };
}
export function assertNativeMaterialOriginVersion(facts: ReturnType<typeof readNativeMaterialVersion>,
  input: { revisionId: string; artifactViewId?: string }, fail: (status: number, code: string, message: string) => never) {
  if (input.artifactViewId && String(facts.originView?.revisionId ?? facts.artifact.currentRevisionId ?? '') !== input.revisionId)
    fail(409, 'MATERIAL_SOURCE_VIEW_CHANGED', 'The source View no longer denotes the selected exact material version.');
}
export interface NativeMaterialPlacementInput {
  projectId: string; workspaceId: string; artifactId: string; revisionId: string; fileRecordId: string;
  artifactViewId?: string; position?: { x: number; y: number }; size?: { width: number; height: number };
}
/** Existing entity keys form this view's stable ordinary PK. No second ledger. */
export const nativeMaterialPlacementViewId = (workspaceId: string, artifactId: string, revisionId: string) =>
  'view:native-library:' + [workspaceId, artifactId, revisionId].map(encodeURIComponent).join(':');

export function createNativeMaterialPlacement({ repository, projectId, projectionHost, spatial, projectNativeNodes, fail }: {
  repository: SqliteMetadataRepository; projectId: string;
  projectionHost(canvasId: string): Gen2Host;
  spatial: { read(canvasId: string): Promise<any> };
  projectNativeNodes(canvasId: string, snapshot: RecordValue): Promise<RecordValue[]>;
  fail(status: number, code: string, message: string): never;
}) {
  const nonEmpty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
  function source(canvasId: string, input: NativeMaterialPlacementInput, admitOrigin = false) {
    if (!input || ![input.projectId, input.workspaceId, input.artifactId, input.revisionId, input.fileRecordId, canvasId].every(nonEmpty)
      || input.projectId !== projectId || input.artifactViewId !== undefined && !nonEmpty(input.artifactViewId))
      fail(400, 'MATERIAL_SOURCE_INVALID', 'An exact project, Workspace and selected material version are required.');
    if (Object.keys(input).some(key => !['projectId', 'workspaceId', 'artifactId', 'revisionId', 'fileRecordId', 'artifactViewId', 'position', 'size'].includes(key)))
      fail(400, 'MATERIAL_SOURCE_INVALID', 'Unsupported material placement fields.');
    if (input.position !== undefined && (!input.position || typeof input.position !== 'object' || Array.isArray(input.position)
      || !Number.isFinite(input.position.x) || !Number.isFinite(input.position.y)
      || Object.keys(input.position).some(key => !['x', 'y'].includes(key)))) fail(400, 'MATERIAL_POSITION_INVALID', 'Initial placement must be a finite point.');
    if (input.size !== undefined && (!input.size || typeof input.size !== 'object' || Array.isArray(input.size)
      || !Number.isFinite(input.size.width) || !Number.isFinite(input.size.height) || input.size.width <= 0 || input.size.height <= 0
      || Object.keys(input.size).some(key => !['width', 'height'].includes(key))))
      fail(400, 'MATERIAL_SIZE_INVALID', 'Initial carrier size must contain positive finite dimensions.');
    const workspaces = repository.getWorkspaces(projectId).filter(row => String(row.id) === input.workspaceId && row.canvasId === canvasId);
    if (workspaces.length !== 1 || String(workspaces[0]!.projectId) !== projectId)
      fail(409, 'MATERIAL_WORKSPACE_CHANGED', 'The requested Workspace does not own this Canvas.');
    const workspace = workspaces[0]!;
    if (!repository.getScopes(projectId).some(scope => String(scope.id) === String(workspace.scopeId)))
      fail(409, 'MATERIAL_SCOPE_UNAVAILABLE', 'The destination scope is unavailable.');
    const version = readNativeMaterialVersion({ repository, projectId, input, fail });
    if (admitOrigin) assertNativeMaterialOriginVersion(version, input, fail);
    const { artifact, revision, file } = version;
    const viewId = nativeMaterialPlacementViewId(input.workspaceId, input.artifactId, input.revisionId);
    const existing = repository.getArtifactView(viewId);
    if (existing && (String(existing.artifactId) !== input.artifactId || String(existing.scopeId) !== String(workspace.scopeId)
      || String(existing.revisionId) !== input.revisionId || existing.referenceKind !== 'explicit_additional'))
      fail(409, 'MATERIAL_VIEW_ID_CONFLICT', 'The existing placement View has a different canonical identity.');
    return { workspace, ...version, viewId, existing };
  }
  function matchingBindings(canvasId: string, input: NativeMaterialPlacementInput, facts: ReturnType<typeof source>) {
    return repository.getProjectionBindings(projectId).filter(binding => {
      if (binding.canvasId !== canvasId || binding.spatialKind !== 'node') return false;
      if (binding.entityType === 'artifact') {
        if (binding.entityId !== input.artifactId || String(facts.artifact.currentRevisionId ?? '') !== input.revisionId) return false;
        const primary = repository.getArtifactViews(input.artifactId).filter(view => view.referenceKind === 'primary' && String(view.scopeId) === String(facts.workspace.scopeId));
        return primary.length === 1;
      }
      if (binding.entityType !== 'view') return false;
      const view = repository.getArtifactView(binding.entityId);
      return !!view && String(view.artifactId) === input.artifactId && String(view.scopeId) === String(facts.workspace.scopeId)
        && String(view.revisionId ?? '') === input.revisionId;
    });
  }
  const base = (canvasId: string, input: NativeMaterialPlacementInput) => ({ project_id: projectId, canvas_id: canvasId,
    workspace_id: input.workspaceId, artifact_id: input.artifactId, revision_id: input.revisionId,
    file_record_id: input.fileRecordId, provider_execution_started: false });
  async function inspect(canvasId: string, input: NativeMaterialPlacementInput) {
    const facts = source(canvasId, input);
    let candidates = matchingBindings(canvasId, input, facts);
    const owned = candidates.filter(binding => binding.entityType === 'view' && binding.entityId === facts.viewId);
    if (owned.length) candidates = owned;
    else if (input.artifactViewId) {
      const selected = candidates.filter(binding => binding.entityType === 'view' && binding.entityId === input.artifactViewId);
      if (selected.length) candidates = selected;
    }
    if (candidates.length > 1) fail(409, 'MATERIAL_PROJECTION_AMBIGUOUS', 'Several exact carriers already exist; no arbitrary carrier was selected.');
    if (!candidates.length) {
      if (!facts.existing) assertNativeMaterialOriginVersion(facts, input, fail);
      return { ...base(canvasId, input), state: facts.existing ? 'partial' as const : 'absent' as const,
        ...(facts.existing ? { artifact_view_id: facts.viewId } : {}) };
    }
    const binding = candidates[0]!;
    const saved = await spatial.read(canvasId);
    if (!saved || !Array.isArray(saved.state?.nodes)) fail(503, 'MATERIAL_CANVAS_UNAVAILABLE', 'The original saved Canvas is unavailable.');
    if (!saved.state.nodes.some((node: RecordValue) => String(node.id) === binding.spatialId))
      return { ...base(canvasId, input), state: 'partial' as const, artifact_view_id: facts.viewId };
    const projected = await projectNativeNodes(canvasId, saved);
    source(canvasId, input);
    if (!repository.getProjectionBindings(projectId).some(current => current.canvasId === canvasId
      && current.spatialKind === 'node' && current.spatialId === binding.spatialId
      && current.entityType === binding.entityType && current.entityId === binding.entityId))
      fail(409, 'MATERIAL_PROJECTION_CHANGED', 'The original exact binding changed during readback.');
    const nodes = projected.filter(node => node.id === binding.spatialId);
    const node = nodes[0], ref = node?.data?.lcos_ref;
    if (nodes.length !== 1 || !['text', 'image'].includes(node?.type) || node.data?.id !== node.id
      || ref?.version !== 1 || ref.artifactId !== input.artifactId || ref.revisionId !== input.revisionId
      || ref.entityType !== binding.entityType || ref.entityId !== binding.entityId || !nonEmpty(ref.artifactViewId))
      fail(409, 'MATERIAL_PROJECTION_CHANGED', 'The saved carrier does not expose the selected exact version. No Current fallback was used.');
    return { ...base(canvasId, input), state: 'present' as const, artifact_view_id: ref.artifactViewId as string, binding, node };
  }
  async function place(canvasId: string, input: NativeMaterialPlacementInput) {
    const existing = await inspect(canvasId, input);
    if (existing.state === 'present') return { ...existing, already_present: true };
    if (existing.state === 'partial') fail(409, 'MATERIAL_PLACEMENT_UNCONFIRMED', 'A previous placement is partially recorded. Inspect it instead of automatically repeating the write.');
    const facts = source(canvasId, input, true), host = projectionHost(canvasId);
    // Read through the existing contained FileRecord owner before creating a
    // View/membership. Missing source bytes must not leave a partial placement.
    await host.artifacts.getFileRecordContent(projectId, input.fileRecordId);
    source(canvasId, input, true);
    // Always pin a new carrier to its selected revision. A primary Current may
    // advance while the asynchronous projection is running.
    const view = await host.artifacts.putArtifactView(projectId, {
      id: facts.viewId as never, artifactId: facts.artifact.id, scopeId: facts.workspace.scopeId,
      revisionId: facts.revision.id, referenceKind: 'explicit_additional', position: input.position ?? { x: 0, y: 0 },
      size: input.size ?? (facts.artifact.kind === 'image' ? { width: 360, height: 240 } : { width: 360, height: 280 }),
      displayMode: facts.artifact.kind === 'image' ? 'thumbnail' : 'card', collapsed: false,
    });
    const confirmed = source(canvasId, input, true);
    if (String(view.id) !== facts.viewId || !confirmed.existing) fail(409, 'MATERIAL_VIEW_UNCONFIRMED', 'The exact additional View was not confirmed.');
    const membership = await host.assembly.apply(projectId, { schemaVersion: 1, projectId,
      sourceRefs: [{ kind: 'artifactView', id: facts.viewId }], targetRef: { kind: 'workspace', id: input.workspaceId } });
    if (membership.projectId !== projectId || membership.results.length !== 1 || membership.results[0]?.sourceRef.kind !== 'artifactView'
      || membership.results[0].sourceRef.id !== facts.viewId || !['workspace-membership', 'already-member'].includes(membership.results[0].channel)
      || !['applied', 'skipped'].includes(membership.results[0].status))
      fail(409, 'MATERIAL_MEMBERSHIP_UNCONFIRMED', 'The exact Workspace membership was not confirmed.');
    source(canvasId, input);
    await host.nodeProjector.projectEntity({ projectId, entityType: 'view', entityId: facts.viewId,
      kind: facts.artifact.kind, title: facts.artifact.title, mimeType: facts.file.mimeType,
      currentRevisionId: input.revisionId, fileRecordId: input.fileRecordId, position: input.position,
      size: view.size, displayMode: view.displayMode, revisionStatus: facts.revision.status });
    const result = await inspect(canvasId, input);
    if (result.state !== 'present') fail(409, 'MATERIAL_SPATIAL_UNCONFIRMED', 'The real projection was not read back. No placement success was reported.');
    return { ...result, already_present: false, change_set_id: membership.results[0].changeSetId };
  }
  return { inspect, place };
}
