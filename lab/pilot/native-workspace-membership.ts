import type { SqliteMetadataRepository } from '../../lcos/apps/local-core/src/metadata-repository.ts'
import { HttpClient } from '../../lcos/apps/web-gen2/src/backend/client.ts'

export interface NativeWorkspaceMembershipSnapshot {
  readonly workspaceId: string
  readonly viewId: string
  readonly addedAt: string
  readonly addedBy: 'user' | 'agent' | 'run' | 'import'
}
type Address = { canvasId: string; artifactId: string; artifactViewId: string; revisionId: string }
type Failure = (status: number, code: string, message: string, details?: unknown) => never
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const nonEmpty = (value: unknown): value is string => typeof value === 'string' && !!value.trim()

/** A projection of the existing Core row, not authorization or a new member owner. */
export function nativeWorkspaceMembershipSnapshot(row: { workspaceId: unknown; artifactViewId: unknown; addedAt: string; addedBy: string } | undefined): NativeWorkspaceMembershipSnapshot | undefined {
  return row ? { workspaceId: String(row.workspaceId), viewId: String(row.artifactViewId), addedAt: row.addedAt,
    addedBy: row.addedBy as NativeWorkspaceMembershipSnapshot['addedBy'] } : undefined
}

export function createNativeWorkspaceMembership({ repository, projectId, coreOrigin, fail }: {
  repository: SqliteMetadataRepository; projectId: string; coreOrigin: string; fail: Failure
}) {
  const http = new HttpClient({ baseUrl: coreOrigin })
  function owner(address: Address) {
    const workspaces = repository.getWorkspaces(projectId).filter(workspace => workspace.canvasId === address.canvasId)
    const workspace = workspaces[0], view = repository.getArtifactView(address.artifactViewId)
    const artifact = repository.getArtifact(address.artifactId), revision = repository.getArtifactRevision(address.revisionId)
    if (workspaces.length !== 1 || !workspace || String(workspace.projectId) !== projectId || !view
      || String(view.scopeId) !== String(workspace.scopeId) || String(view.artifactId) !== address.artifactId
      || !artifact || String(artifact.projectId) !== projectId || artifact.archivedAt !== undefined
      || !revision || String(revision.artifactId) !== address.artifactId || revision.status === 'draft'
      || String(view.revisionId ?? artifact.currentRevisionId ?? '') !== address.revisionId)
      fail(409, 'WORKSPACE_MEMBERSHIP_OWNER_CHANGED', 'The exact material and Workspace no longer match this history action.')
    return workspace
  }
  function current(address: Address) {
    const workspace = owner(address)
    return nativeWorkspaceMembershipSnapshot(repository.listWorkspaceMembers(workspace.id)
      .find(row => String(row.artifactViewId) === address.artifactViewId))
  }
  function parse(address: Address, value: unknown): NativeWorkspaceMembershipSnapshot | undefined {
    if (value === undefined) return undefined
    const workspace = owner(address)
    if (!object(value) || Object.keys(value).sort().join(',') !== 'addedAt,addedBy,viewId,workspaceId'
      || ![value.workspaceId, value.viewId, value.addedAt].every(nonEmpty)
      || !['user', 'agent', 'run', 'import'].includes(String(value.addedBy))
      || value.workspaceId !== String(workspace.id) || value.viewId !== address.artifactViewId)
      fail(409, 'WORKSPACE_MEMBERSHIP_SNAPSHOT_INVALID', 'The saved member does not belong to this exact material and Workspace.')
    return { workspaceId: value.workspaceId as string, viewId: value.viewId as string,
      addedAt: value.addedAt as string, addedBy: value.addedBy as NativeWorkspaceMembershipSnapshot['addedBy'] }
  }
  const same = (a: NativeWorkspaceMembershipSnapshot | undefined, b: NativeWorkspaceMembershipSnapshot | undefined) =>
    !!a && !!b && ['workspaceId', 'viewId', 'addedAt', 'addedBy'].every(key => a[key as keyof typeof a] === b[key as keyof typeof b])
  function check(address: Address, snapshot: NativeWorkspaceMembershipSnapshot | undefined, allowAbsent: boolean) {
    const row = current(address)
    if (row && (!snapshot || !same(row, snapshot))) fail(409, 'WORKSPACE_MEMBERSHIP_CHANGED', 'This member changed after the saved action; the newer work was kept.')
    if (!row && snapshot && !allowAbsent) fail(409, 'WORKSPACE_MEMBERSHIP_CHANGED', 'The saved member is no longer present.')
    return row
  }
  function header(expected: Record<string, unknown>) {
    return { 'x-lcos-expected-workspace-member': encodeURIComponent(JSON.stringify(expected)) }
  }
  async function remove(address: Address, snapshot: NativeWorkspaceMembershipSnapshot | undefined) {
    const row = check(address, snapshot, true)
    if (!row) return { changed: false }
    let error: unknown
    try { await http.deleteJson(`/workspaces/${encodeURIComponent(row.workspaceId)}/members/${encodeURIComponent(row.viewId)}`, undefined, header(row)) }
    catch (cause) { error = cause }
    const after = current(address)
    if (after || Number((error as { status?: number })?.status) >= 400) fail(409, 'WORKSPACE_MEMBERSHIP_REMOVE_UNCONFIRMED', 'The member removal was not confirmed; no second removal was sent.',
      { current: after, expected: snapshot, cause: error instanceof Error ? error.message : undefined })
    return { changed: true }
  }
  async function restore(address: Address, snapshot: NativeWorkspaceMembershipSnapshot | undefined) {
    if (!snapshot) return undefined
    const row = check(address, snapshot, true)
    if (row) return row
    let error: unknown
    try { await http.postJson(`/workspaces/${encodeURIComponent(snapshot.workspaceId)}/members`, { viewIds: [snapshot.viewId], addedBy: snapshot.addedBy },
      undefined, header({ workspaceId: snapshot.workspaceId, viewId: snapshot.viewId, absent: true })) }
    catch (cause) { error = cause }
    const after = current(address)
    if (!after || after.addedBy !== snapshot.addedBy || Number((error as { status?: number })?.status) >= 400)
      fail(409, 'WORKSPACE_MEMBERSHIP_RESTORE_UNCONFIRMED', 'The saved member was not confirmed; no second add was sent.',
      { current: after, expected: snapshot, cause: error instanceof Error ? error.message : undefined })
    return after
  }
  return { current, parse, same, check, remove, restore }
}
