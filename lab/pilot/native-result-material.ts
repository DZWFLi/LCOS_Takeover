import type { ResultSlotV0 } from '@local-creative-os/contracts'
import type { Artifact, ArtifactRevision, ArtifactView, FileRecord } from '@local-creative-os/domain'
import type { SqliteMetadataRepository } from '../../lcos/apps/local-core/src/metadata-repository.ts'

export interface NativeResultMaterial {
  readonly artifact: Artifact
  readonly view: ArtifactView
  readonly revision: ArtifactRevision
  readonly file: FileRecord
  readonly slot: ResultSlotV0
}

/** A result carrier had enough identity to be considered, but its Core facts disagree. */
export class NativeResultMaterialConflictError extends Error {
  readonly status = 409
  readonly code = 'NATIVE_RESULT_MATERIAL_CONFLICT'

  constructor(message: string) {
    super(message)
    this.name = 'NativeResultMaterialConflictError'
  }
}

/**
 * Resolve only a promoted ResultSlot carrier to the exact ArtifactView revision
 * selected by its Core workspace. This is a read-only projection; geometry and
 * Huabu node data remain owned by the native canvas.
 */
export function resolveNativeResultMaterial(input: {
  readonly repository: SqliteMetadataRepository
  readonly projectId: string
  readonly canvasId: string
  readonly spatialId: string
}): NativeResultMaterial | undefined {
  const { repository, projectId, canvasId, spatialId } = input
  const spatialBindings = repository.getProjectionBindings(projectId).filter((binding) =>
    String(binding.projectId) === projectId
    && binding.canvasId === canvasId
    && binding.spatialKind === 'node'
    && binding.spatialId === spatialId)
  const artifactBindings = spatialBindings.filter((binding) => binding.entityType === 'artifact')
  if (artifactBindings.length === 0) return undefined
  if (artifactBindings.length !== 1 || spatialBindings.length !== 1) {
    throw new NativeResultMaterialConflictError('The native spatial carrier has multiple or conflicting Core bindings.')
  }

  const binding = artifactBindings[0]!
  if (binding.entityId.trim() === '') throw new NativeResultMaterialConflictError('The Artifact binding has no entity identity.')
  const artifact = repository.getArtifact(binding.entityId)
  if (artifact === undefined || String(artifact.projectId) !== projectId) {
    throw new NativeResultMaterialConflictError('The Artifact binding is missing or belongs to another project.')
  }

  const workspaces = repository.getWorkspaces(projectId).filter((workspace) => workspace.canvasId === canvasId)
  if (workspaces.length === 0) return undefined
  if (workspaces.length !== 1) {
    throw new NativeResultMaterialConflictError('The canvas does not resolve to one unique Core workspace.')
  }
  const workspace = workspaces[0]!
  if (String(workspace.projectId) !== projectId) {
    throw new NativeResultMaterialConflictError('The canvas workspace belongs to another project.')
  }

  const primaryViews = repository.getArtifactViews(String(artifact.id)).filter((candidate) =>
    String(candidate.scopeId) === String(workspace.scopeId) && candidate.referenceKind === 'primary')
  if (primaryViews.length > 1) {
    throw new NativeResultMaterialConflictError('The Artifact has multiple primary views in the current scope.')
  }

  const resultSlots = repository.listResultSlots(projectId)
  const candidateSlots = resultSlots.filter((slot) => {
    if (String(slot.projectId) !== projectId || String(slot.artifactId ?? '') !== String(artifact.id)) return false
    if (slot.workspaceId !== undefined) {
      if (String(slot.workspaceId) !== String(workspace.id)) return false
      if (String(slot.scopeId) !== String(workspace.scopeId)) {
        throw new NativeResultMaterialConflictError('The ResultSlot workspace and scope do not match.')
      }
      return true
    }

    if (String(slot.scopeId) !== String(workspace.scopeId) || workspace.preferredSurface !== 'main') return false
    const mainWorkspacesInScope = repository.getWorkspaces(projectId).filter((candidate) =>
      String(candidate.scopeId) === String(slot.scopeId) && candidate.preferredSurface === 'main')
    if (mainWorkspacesInScope.length !== 1) {
      throw new NativeResultMaterialConflictError('An unassigned ResultSlot requires one unique Main workspace in its scope.')
    }
    return String(mainWorkspacesInScope[0]!.id) === String(workspace.id)
  })
  if (candidateSlots.length === 0) return undefined
  if (candidateSlots.length !== 1) {
    throw new NativeResultMaterialConflictError('Multiple materialized ResultSlots match this Artifact carrier and workspace.')
  }

  const slot = candidateSlots[0]!
  if (slot.status !== 'materialized' || !slot.artifactId || !slot.artifactViewId) {
    throw new NativeResultMaterialConflictError('The matching ResultSlot is not fully materialized.')
  }
  if (String(slot.artifactId) !== String(artifact.id) || String(slot.projectId) !== projectId) {
    throw new NativeResultMaterialConflictError('The ResultSlot Artifact identity does not match the native binding.')
  }
  if (String(slot.scopeId) !== String(workspace.scopeId)) {
    throw new NativeResultMaterialConflictError('The ResultSlot scope does not match the workspace scope.')
  }
  if (slot.workspaceId !== undefined && String(slot.workspaceId) !== String(workspace.id)) {
    throw new NativeResultMaterialConflictError('The ResultSlot belongs to another workspace.')
  }

  // Existing-artifact receipts keep the ResultSlot's own spatial carrier and
  // leave the pre-existing Artifact carrier untouched. Scope-level Primary
  // views alone cannot tell that case apart from a newly promoted ResultSlot:
  // a valid accepted additional view may coexist with the Primary in one scope.
  // Use the actual binding left by materializeResultSlotBinding as the owner
  // fact. A binding on this worksite means the Artifact node is not the slot's
  // carrier; a binding on another Canvas contradicts the workspace assignment.
  const retainedSlotBindings = repository.getProjectionBindings(projectId).filter((candidate) =>
    String(candidate.projectId) === projectId
    && candidate.spatialKind === 'node'
    && candidate.entityType === 'result-slot'
    && candidate.entityId === String(slot.id))
  if (retainedSlotBindings.length > 1) {
    throw new NativeResultMaterialConflictError('The ResultSlot has multiple retained native carriers.')
  }
  const retainedSlotBinding = retainedSlotBindings[0]
  if (retainedSlotBinding !== undefined) {
    if (retainedSlotBinding.canvasId !== canvasId) {
      throw new NativeResultMaterialConflictError('The ResultSlot carrier is bound to a different Canvas than its workspace.')
    }
    return undefined
  }

  const view = repository.getArtifactView(String(slot.artifactViewId))
  if (view === undefined
    || String(view.artifactId) !== String(artifact.id)
    || String(view.scopeId) !== String(slot.scopeId)
    || !repository.getScopes(projectId).some((scope) => String(scope.id) === String(view.scopeId))
    || view.revisionId === undefined) {
    throw new NativeResultMaterialConflictError('The ResultSlot ArtifactView identity is missing or contradictory.')
  }

  const revision = repository.getArtifactRevision(String(view.revisionId))
  if (revision === undefined
    || String(revision.artifactId) !== String(artifact.id)
    || String(revision.id) !== String(view.revisionId)
    || revision.status === 'draft') {
    throw new NativeResultMaterialConflictError('The selected ArtifactView revision is missing, foreign, or still a draft.')
  }

  const file = repository.getFileRecord(String(revision.fileRecordId))
  if (file === undefined || String(file.projectId) !== projectId) {
    throw new NativeResultMaterialConflictError('The selected revision FileRecord is missing or belongs to another project.')
  }

  if (!workspace.focusedViewIds.some((viewId) => String(viewId) === String(view.id))) {
    // Preserve the primary Current path only when Core explicitly selects that
    // unique Primary. An unselected Primary is not permission to guess Current;
    // without focus on either the accepted slot view or its Primary, identity
    // remains ambiguous and must not fall through.
    if (primaryViews.length === 1
      && workspace.focusedViewIds.some((viewId) => String(viewId) === String(primaryViews[0]!.id))) return undefined
    throw new NativeResultMaterialConflictError('The workspace does not explicitly select the ResultSlot ArtifactView.')
  }

  return { artifact, view, revision, file, slot }
}
