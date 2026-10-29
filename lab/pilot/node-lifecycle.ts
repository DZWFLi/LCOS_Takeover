import { randomUUID } from 'node:crypto'
import { readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'

import type { Artifact, ArtifactRevision, ArtifactView, ProjectId, Workspace } from '../../lcos/packages/domain/src/index.ts'
import { createTextArtifact } from '../../lcos/apps/local-core/src/text-artifact-service.ts'
import type { ProjectionBindingRecord, SqliteMetadataRepository } from '../../lcos/apps/local-core/src/metadata-repository.ts'
import { huabuNodeTypeForFamily, resolveVisualFamily } from '../../lcos/apps/web-gen2/src/presentation/visualFamily.ts'
import { isNativeFileMaterial, nativeFileMaterialMetadata, sameNativeFileMaterialMetadata, type NativeFileMaterialMetadata } from './native-file-material.ts'
import { createNativeWorkspaceMembership, type NativeWorkspaceMembershipSnapshot } from './native-workspace-membership.ts'
import { createNativeMaterialExcerptRelations, nativeMaterialExcerptKey, validateNativeMaterialExcerpt } from './native-material-excerpt.ts'

type JsonRecord = Record<string, unknown>
type SpatialNode = JsonRecord & { id: string; type: string; position?: unknown; style?: unknown; width?: unknown; height?: unknown; measured?: unknown; data?: unknown }

export interface LcosOperationV1 {
  readonly version: 1
  readonly operationId: string
  readonly kind: 'create' | 'delete' | 'duplicate-view'
  readonly phase: 'apply' | 'undo' | 'redo'
}

/**
 * Persistent Core identity carried with a node DTO / Native history intent.
 * `entityId` is an ArtifactId for `artifact`, and an ArtifactViewId for `view`.
 * Node IDs are deliberately absent: Huabu may assign a replacement NodeID on restore.
 */
export interface LcosNodeRefV1 {
  readonly version: 1
  readonly entityType: 'artifact' | 'view'
  readonly entityId: string
  readonly artifactId: string
  readonly artifactViewId: string
  readonly revisionId: string
}

export interface LifecycleCreateNode {
  readonly id?: string
  readonly type: 'text' | 'image'
  readonly position: { readonly x: number; readonly y: number }
  readonly measured?: { readonly width: number; readonly height: number }
  readonly data: JsonRecord
  /** Source identity for duplicate-view, or the saved identity for history restore. */
  readonly lcos_ref?: LcosNodeRefV1
}

/** Receipt produced by Core Import Copy behind one exact TapNow upload URL. */
export interface LifecycleImportedImageReceipt {
  readonly url: string
  readonly fileRecordId: string
  readonly lcos_ref: LcosNodeRefV1
}

export type LifecycleBatchAction =
  | { readonly action: 'create'; readonly creates: readonly LifecycleCreateNode[] }
  | { readonly action: 'delete'; readonly delete_ids: readonly string[] }
  | { readonly action: string; readonly [key: string]: unknown }

export interface NodeLifecycleOptions {
  readonly repository: SqliteMetadataRepository
  readonly projectId: string
  readonly spatial: {
    read(canvasId: string): Promise<any>
    execute(canvasId: string, commands: unknown[]): Promise<any>
  }
  readonly workspaceForCanvas: (canvasId: string) => Workspace | undefined
  readonly publicOrigin: string
  /** Kept in the seam so the facade can supply its actual Core endpoint. */
  readonly coreOrigin: string
  /** Same rendered-text projection as the original Reader, supplied by the facade. */
  readonly excerptSourceText?: (markdown: string) => Promise<string>
}

export interface LifecycleNodeResult {
  /** ID supplied by the TapNow/Native callback before Huabu accepts the command. */
  readonly clientNodeId: string
  readonly nodeId: string
  readonly type: 'text' | 'image'
  readonly position: { readonly x: number; readonly y: number }
  readonly measured: { readonly width: number; readonly height: number }
  readonly data: JsonRecord
  readonly lcos_ref: LcosNodeRefV1
  /** Exact upload source proof; text carriers keep their normal text data. */
  readonly imported_file_ref?: NativeFileMaterialMetadata
}

export interface NodeLifecycleResult {
  readonly canvas_id: string
  readonly operation: LcosOperationV1
  readonly nodes: readonly LifecycleNodeResult[]
  readonly deleted_node_ids: readonly string[]
  /** Map from the old Huabu NodeID to its durable Core reference for Native history. */
  readonly lcos_refs: Readonly<Record<string, LcosNodeRefV1>>
  /** Correlates Native's requested ID with the actual Huabu ID from the executor receipt. */
  readonly client_to_spatial_ids: Readonly<Record<string, string>>
  readonly core_saved: boolean
  readonly spatial_saved: boolean
}

export class NodeLifecycleError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly details?: unknown) {
    super(message)
    this.name = 'NodeLifecycleError'
  }
}

const DEFAULT_TEXT_PARAMS = Object.freeze({ model: 'gemini-3.1-flash-lite', provider: 'google' })
const fail = (status: number, code: string, message: string, details?: unknown): never => {
  throw new NodeLifecycleError(status, code, message, details)
}

function object(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(400, 'INVALID_ARGUMENT', `${label} must be an object.`)
  return value as JsonRecord
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 200) fail(400, 'INVALID_ARGUMENT', `${label} must be a non-empty identifier.`)
  return value
}

function point(value: unknown, label: string): { x: number; y: number } {
  const candidate = object(value, label)
  if (!Number.isFinite(candidate.x) || !Number.isFinite(candidate.y)) fail(400, 'INVALID_ARGUMENT', `${label} needs finite x/y.`)
  return { x: Number(candidate.x), y: Number(candidate.y) }
}

function size(value: unknown, label: string, fallback = { width: 300, height: 270 }): { width: number; height: number } {
  if (value === undefined) return fallback
  const candidate = object(value, label)
  if (!Number.isFinite(candidate.width) || !Number.isFinite(candidate.height) || Number(candidate.width) <= 0 || Number(candidate.height) <= 0) {
    fail(400, 'INVALID_ARGUMENT', `${label} needs positive finite width/height.`)
  }
  return { width: Number(candidate.width), height: Number(candidate.height) }
}

function validateOperation(value: unknown): LcosOperationV1 {
  const candidate = object(value, 'lcos_operation')
  if (candidate.version !== 1 || !['create', 'delete', 'duplicate-view'].includes(String(candidate.kind))
    || !['apply', 'undo', 'redo'].includes(String(candidate.phase))) {
    fail(400, 'INVALID_LCOS_OPERATION', 'Expected version 1 lifecycle operation metadata.')
  }
  const operationId = requiredString(candidate.operationId, 'lcos_operation.operationId')
  if (operationId.length > 200) fail(400, 'INVALID_LCOS_OPERATION', 'Lifecycle operation ID is too long.')
  return { version: 1, operationId, kind: candidate.kind as LcosOperationV1['kind'], phase: candidate.phase as LcosOperationV1['phase'] }
}

function parseRef(value: unknown): LcosNodeRefV1 {
  const candidate = object(value, 'lcos_ref')
  if (candidate.version !== 1 || !['artifact', 'view'].includes(String(candidate.entityType))) {
    fail(400, 'INVALID_LCOS_REF', 'Expected version 1 Artifact or ArtifactView identity.')
  }
  const entityType = candidate.entityType as LcosNodeRefV1['entityType']
  const entityId = requiredString(candidate.entityId, 'lcos_ref.entityId')
  const artifactId = requiredString(candidate.artifactId, 'lcos_ref.artifactId')
  const artifactViewId = requiredString(candidate.artifactViewId, 'lcos_ref.artifactViewId')
  const revisionId = requiredString(candidate.revisionId, 'lcos_ref.revisionId')
  if ((entityType === 'artifact' && entityId !== artifactId) || (entityType === 'view' && entityId !== artifactViewId)) {
    fail(400, 'INVALID_LCOS_REF', 'lcos_ref entityId does not match its entity type.')
  }
  return { version: 1, entityType, entityId, artifactId, artifactViewId, revisionId }
}

function loopbackOrigin(value: string, label: string): string {
  const url = new URL(value)
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '::1'].includes(url.hostname)
    || url.pathname !== '/' || url.search || url.hash) fail(400, 'INVALID_ORIGIN', `${label} must be an HTTP loopback origin.`)
  return url.origin
}

function isWithin(root: string, file: string): boolean {
  const relative = path.relative(root, file)
  return relative === '' || (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative))
}

async function readProjectFile(projectRoot: string, filePath: string, encoding?: BufferEncoding): Promise<Buffer | string> {
  const [root, target] = await Promise.all([realpath(projectRoot), realpath(filePath)])
  if (!isWithin(root, target)) fail(409, 'FILE_OUTSIDE_PROJECT', 'The Core FileRecord points outside its owning project.')
  return encoding ? readFile(target, encoding) : readFile(target)
}

function validRefMatchesBinding(ref: LcosNodeRefV1, binding: ProjectionBindingRecord): boolean {
  return binding.entityType === ref.entityType && binding.entityId === ref.entityId
}

function outputRef(entityType: 'artifact' | 'view', artifact: Artifact, view: ArtifactView, revision: ArtifactRevision): LcosNodeRefV1 {
  return { version: 1, entityType, entityId: entityType === 'artifact' ? String(artifact.id) : String(view.id),
    artifactId: String(artifact.id), artifactViewId: String(view.id), revisionId: String(revision.id) }
}

export function createNodeLifecycle(options: NodeLifecycleOptions) {
  const { repository, projectId, spatial, workspaceForCanvas } = options
  const publicOrigin = loopbackOrigin(options.publicOrigin, 'publicOrigin')
  // `coreOrigin` is validated here because the facade contract requires the exact live Core endpoint.
  const coreOrigin = loopbackOrigin(options.coreOrigin, 'coreOrigin')
  if (!repository.getProject(projectId)) fail(404, 'PROJECT_NOT_FOUND', 'Lifecycle project is not present in Local Core.')
  const membership = createNativeWorkspaceMembership({ repository, projectId, coreOrigin, fail })
  const linkExcerpt = createNativeMaterialExcerptRelations({ repository, projectId, coreOrigin, fail })
  const memberAddress = (canvasId: string, ref: LcosNodeRefV1) => ({ canvasId, artifactId: ref.artifactId,
    artifactViewId: ref.artifactViewId, revisionId: ref.revisionId })
  function memberData(canvasId: string, ref: LcosNodeRefV1, data: JsonRecord): JsonRecord {
    const row = membership.current(memberAddress(canvasId, ref))
    return { ...data, ...(row ? { lcos_workspace_membership: row } : {}) }
  }

  function workspaceAt(canvasId: string): Workspace {
    const workspace = workspaceForCanvas(canvasId)
    if (!workspace || String(workspace.projectId) !== projectId || workspace.canvasId !== canvasId || !workspace.scopeId) {
      fail(404, 'WORKSPACE_NOT_FOUND', 'No unique Core Workspace owns this Huabu canvas.')
    }
    if (!repository.getScopes(projectId).some((scope) => String(scope.id) === String(workspace.scopeId))) {
      fail(409, 'WORKSPACE_SCOPE_MISSING', 'The Core Workspace scope is unavailable.')
    }
    return workspace
  }

  async function canvasNodes(canvasId: string): Promise<SpatialNode[]> {
    const snapshot = await spatial.read(canvasId)
    if (!snapshot) fail(404, 'CANVAS_NOT_FOUND', 'Huabu has no saved space for this Core Workspace.')
    return (snapshot.state?.nodes ?? []) as SpatialNode[]
  }

  async function execute(canvasId: string, command: JsonRecord): Promise<any> {
    const result = await spatial.execute(canvasId, [command])
    const failed = Array.isArray(result?.results) ? result.results.find((item: any) => item.applied !== true) : undefined
    if (failed) fail(409, 'SPATIAL_WRITE_REJECTED', failed.message || failed.reason || 'Huabu rejected the lifecycle command.')
    if (!Array.isArray(result?.results) || result.results.length !== 1) fail(409, 'SPATIAL_RECEIPT_MISSING', 'Huabu did not return one result for the lifecycle command.')
    return result
  }

  function resolveMaterial(refValue: unknown, canvasId: string, mode: 'duplicate' | 'restore') {
    const ref = parseRef(refValue)
    const workspace = workspaceAt(canvasId)
    const artifact = repository.getArtifact(ref.artifactId)
    if (!artifact || String(artifact.projectId) !== projectId || artifact.archivedAt !== undefined) {
      fail(409, 'CORE_ARTIFACT_UNAVAILABLE', 'The referenced Core Artifact is missing, foreign, or archived.')
    }
    const view = repository.getArtifactView(ref.artifactViewId)
    const viewScopeExists = view && repository.getScopes(projectId).some((scope) => String(scope.id) === String(view.scopeId))
    if (!view || String(view.artifactId) !== String(artifact.id) || !viewScopeExists
      || (mode === 'restore' && String(view.scopeId) !== String(workspace.scopeId))) {
      fail(409, 'CORE_VIEW_UNAVAILABLE', 'The exact Core ArtifactView is missing or belongs to an unavailable worksite.')
    }
    if (ref.entityType === 'view' && String(view.id) !== ref.entityId) {
      fail(409, 'CORE_VIEW_ID_MISMATCH', 'The saved ArtifactView identity no longer matches the node reference.')
    }
    const revisionId = mode === 'restore'
      ? (ref.entityType === 'artifact' ? String(artifact.currentRevisionId ?? '') : String(view.revisionId ?? ref.revisionId))
      : ref.revisionId
    const revision = revisionId ? repository.getArtifactRevision(revisionId) : undefined
    if (!revision || String(revision.artifactId) !== String(artifact.id) || revision.status === 'draft') {
      fail(409, 'CORE_REVISION_UNAVAILABLE', 'The exact Core Artifact revision is unavailable.')
    }
    const file = repository.getFileRecord(String(revision.fileRecordId))
    if (!file || String(file.projectId) !== projectId) fail(409, 'CORE_FILE_RECORD_UNAVAILABLE', 'The Core revision has no project-owned FileRecord.')
    if (!['image', 'markdown', 'text'].includes(String(artifact.kind)) && !isNativeFileMaterial(artifact.kind)) {
      fail(501, 'NODE_TYPE_NOT_IMPLEMENTED', `Core Artifact kind ${String(artifact.kind)} has no supported native node mapping.`)
    }
    return { ref, workspace, artifact, view, revision, file, nodeType: artifact.kind === 'image' ? 'image' as const : 'text' as const }
  }

  async function nodeWire(canvasId: string, material: ReturnType<typeof resolveMaterial>, nodeId: string,
    position: { x: number; y: number }, measured: { width: number; height: number }, bindingType: 'artifact' | 'view') {
    const project = repository.getProject(projectId)
    if (!project) fail(404, 'PROJECT_NOT_FOUND', 'Lifecycle project is not present in Local Core.')
    const { artifact, view, revision, file, nodeType } = material
    if (nodeType === 'image') {
      const src = `${publicOrigin}/api/surface-core/file-records/${encodeURIComponent(String(file.id))}/content`
      // Check the selected revision's bytes are still readable from this synthetic project's root.
      await readProjectFile(project.rootPath, file.observedPath)
      return {
        node: { id: nodeId, nodeType: 'image', position, size: measured,
          data: { label: artifact.title, src } },
        result: { nodeId, type: 'image' as const, position, measured,
          data: { id: nodeId, title: artifact.title, src, type: 'upload', prompt: '', defaultOpenGallery: false },
          lcos_ref: outputRef(bindingType, artifact, view, revision) },
      }
    }
    if (isNativeFileMaterial(artifact.kind)) {
      // The spatial host stays a built-in. Binary bytes are only read by the
      // exact FileRecord reader, never decoded as editable Canvas text.
      await readProjectFile(project.rootPath, file.observedPath)
      const fileMetadata = nativeFileMaterialMetadata(material)
      const wireType = huabuNodeTypeForFamily(resolveVisualFamily({ artifactKind: artifact.kind, mimeType: file.mimeType }))
      const src = `${publicOrigin}/api/surface-core/file-records/${encodeURIComponent(String(file.id))}/content`
      return {
        node: { id: nodeId, nodeType: wireType, position, size: measured,
          data: { label: artifact.title, ...(wireType === 'video' ? { src } : {}) } },
        result: { nodeId, type: 'text' as const, position, measured,
          data: { id: nodeId, title: artifact.title, lcos_file_ref: fileMetadata },
          lcos_ref: outputRef(bindingType, artifact, view, revision) },
      }
    }
    const body = await readProjectFile(project.rootPath, file.observedPath, 'utf8') as string
    const title = artifact.title
    return {
      node: { id: nodeId, nodeType: 'note', position, size: measured, data: { label: title, content: body } },
      result: { nodeId, type: 'text' as const, position, measured,
        data: { id: nodeId, title, text: body, content: body, prompt: '', params: { ...DEFAULT_TEXT_PARAMS } },
        lcos_ref: outputRef(bindingType, artifact, view, revision) },
    }
  }

  const textPresentationKeys = ['lcosTextViewMode', 'lcosTextCollapsedIds', 'lcosTextBeforeMindMapSize'] as const
  const guiPresentationKeys = ['lcos_gui_emphasis'] as const

  function validateGuiPresentationData(data: JsonRecord, label: string): JsonRecord {
    if (!Object.hasOwn(data, 'lcos_gui_emphasis')) return {}
    if (typeof data.lcos_gui_emphasis !== 'boolean') fail(400, 'INVALID_GUI_EMPHASIS', `${label}.lcos_gui_emphasis must be a boolean visual preference.`)
    return { lcos_gui_emphasis: data.lcos_gui_emphasis }
  }

  function validateTextPresentationData(data: JsonRecord, label: string): JsonRecord {
    const presentation: JsonRecord = {}
    if (Object.hasOwn(data, 'lcosTextViewMode')) {
      if (!['text', 'outline', 'mindmap'].includes(String(data.lcosTextViewMode))) {
        fail(400, 'INVALID_ARGUMENT', `${label}.lcosTextViewMode must be text, outline, or mindmap.`)
      }
      presentation.lcosTextViewMode = data.lcosTextViewMode
    }
    if (Object.hasOwn(data, 'lcosTextCollapsedIds')) {
      if (!Array.isArray(data.lcosTextCollapsedIds) || data.lcosTextCollapsedIds.some((id) => typeof id !== 'string')) {
        fail(400, 'INVALID_ARGUMENT', `${label}.lcosTextCollapsedIds must be an array of strings.`)
      }
      presentation.lcosTextCollapsedIds = [...data.lcosTextCollapsedIds]
    }
    if (Object.hasOwn(data, 'lcosTextBeforeMindMapSize')) {
      const value = object(data.lcosTextBeforeMindMapSize, `${label}.lcosTextBeforeMindMapSize`)
      if (Object.keys(value).sort().join(',') !== 'height,width') {
        fail(400, 'INVALID_ARGUMENT', `${label}.lcosTextBeforeMindMapSize accepts only width and height.`)
      }
      presentation.lcosTextBeforeMindMapSize = size(value, `${label}.lcosTextBeforeMindMapSize`)
    }
    return presentation
  }

  function validateRestoredData(type: 'text' | 'image', value: unknown, expectedTitle: string, expectedSrc?: string,
    fileMetadata?: NativeFileMaterialMetadata): JsonRecord {
    const data = object(value, 'creates[].data')
    const gui = validateGuiPresentationData(data, 'creates[].data')
    if (fileMetadata) {
      const allowed = new Set(['id', 'title', 'lcos_file_ref', 'lcos_workspace_membership', 'text', 'content', 'prompt', ...guiPresentationKeys])
      if (Object.keys(data).some(key => !allowed.has(key))) fail(501, 'NODE_DATA_NOT_IMPLEMENTED', 'File restore has unsupported presentation fields.')
      if (data.title !== undefined && data.title !== expectedTitle) fail(409, 'CORE_TITLE_MISMATCH', 'File title must come from its Core Artifact.')
      if (data.lcos_file_ref !== undefined && !sameNativeFileMaterialMetadata(data.lcos_file_ref, fileMetadata))
        fail(409, 'CORE_FILE_REFERENCE_MISMATCH', 'File presentation disagrees with its exact Core version.')
      if (['text', 'content', 'prompt'].some(key => data[key] !== undefined && data[key] !== ''))
        fail(409, 'FILE_IS_NOT_CANVAS_TEXT', 'A file cannot be restored as authored Canvas text or a generation prompt.')
      return gui
    }
    const common = new Set(['id', 'title', 'lcos_workspace_membership', ...guiPresentationKeys])
    const allowed = type === 'text'
      ? new Set([...common, 'text', 'content', 'prompt', 'params', ...textPresentationKeys])
      : new Set([...common, 'src', 'type', 'prompt', 'defaultOpenGallery', '__metadata'])
    if (type === 'image' && textPresentationKeys.some((key) => Object.hasOwn(data, key))) {
      fail(400, 'NODE_TYPE_MISMATCH', 'Text presentation data cannot be applied to an image node.')
    }
    if (Object.keys(data).some((key) => !allowed.has(key))) {
      fail(501, 'NODE_DATA_NOT_IMPLEMENTED', `${type} restore/duplicate contains node data with unsupported semantics.`)
    }
    if (data.title !== undefined && data.title !== expectedTitle) {
      fail(409, 'CORE_TITLE_MISMATCH', 'A Core-bound node title must come from its Artifact.')
    }
    if (data.prompt !== undefined && data.prompt !== '') fail(501, 'NODE_PROMPT_NOT_IMPLEMENTED', 'Prompt generation is not connected to this Core material.')
    if (type === 'text') {
      const presentation = validateTextPresentationData(data, 'creates[].data')
      if (data.params !== undefined) {
        const params = object(data.params, 'data.params')
        const keys = Object.keys(params).sort().join(',')
        if (keys !== '' && !(keys === 'model,provider' && params.model === DEFAULT_TEXT_PARAMS.model && params.provider === DEFAULT_TEXT_PARAMS.provider)) {
          fail(501, 'NODE_PARAMS_NOT_IMPLEMENTED', 'Text generation settings are not connected to this Core material.')
        }
      }
      return { ...presentation, ...gui }
    }
    if (data.type !== undefined && data.type !== 'upload') fail(409, 'CANVAS_IMAGE_TYPE_MISMATCH', 'Only Core image uploads can be restored here.')
    if (data.defaultOpenGallery !== undefined && data.defaultOpenGallery !== false) {
      fail(501, 'IMAGE_PRESENTATION_NOT_IMPLEMENTED', 'Gallery presentation state is not preserved by this lifecycle.')
    }
    if (data.src !== undefined && data.src !== expectedSrc) fail(409, 'CORE_SOURCE_MISMATCH', 'Image source must match its Core FileRecord.')
    if (data.__metadata !== undefined) {
      const metadata = object(data.__metadata, 'data.__metadata')
      if (Object.keys(metadata).sort().join(',') !== 'height,url,width' || metadata.url !== expectedSrc
        || !Number.isFinite(metadata.width) || !Number.isFinite(metadata.height)
        || Number(metadata.width) <= 0 || Number(metadata.height) <= 0) {
        fail(409, 'IMAGE_RENDER_METADATA_MISMATCH', 'Image renderer metadata must identify the selected Core source.')
      }
    }
    return gui
  }

  function nodeIdForCreate(input: LifecycleCreateNode): string {
    return input.id === undefined ? `node-lifecycle-${randomUUID()}` : requiredString(input.id, 'node.id')
  }

  async function createCarrier(canvasId: string, node: JsonRecord, expectedType: 'text' | 'image'): Promise<Omit<LifecycleNodeResult, 'lcos_ref'>> {
    const clientNodeId = requiredString(node.id, 'node.id')
    const nodes = await canvasNodes(canvasId)
    if (nodes.some((item) => String(item.id) === clientNodeId)) fail(409, 'NODE_ID_COLLISION', 'The requested Huabu NodeID already exists.')
    const result = await execute(canvasId, { type: 'CREATE_NODES', nodes: [node] })
    const echoes = result.results[0]?.nodes
    const echo = Array.isArray(echoes) && echoes.length === 1 ? echoes[0] : undefined
    const nodeId = typeof echo?.nodeId === 'string' ? echo.nodeId : undefined
    const created = nodeId ? (await canvasNodes(canvasId)).find((item) => String(item.id) === nodeId) : undefined
    if (!created || !echo) fail(409, 'SPATIAL_CREATE_UNCONFIRMED', 'Huabu did not confirm the created NodeID.')
    if (created.type !== node.nodeType) fail(409, 'SPATIAL_TYPE_MISMATCH', 'Huabu created an unexpected node type.')
    return { clientNodeId, nodeId, type: expectedType,
      position: point(created.position ?? node.position, 'created.position'),
      measured: size(created.style ?? node.size, 'created.size'),
      data: { ...object(node.data, 'created.data'), id: nodeId } }
  }

  async function freshText(canvasId: string, input: LifecycleCreateNode): Promise<LifecycleNodeResult> {
    if (input.type !== 'text') fail(501, 'NODE_TYPE_NOT_IMPLEMENTED', 'Fresh image creation has no Core import producer; duplicate or restore a Core-bound image instead.')
    if (input.lcos_ref !== undefined) fail(400, 'UNEXPECTED_LCOS_REF', 'A new text creation cannot replace an existing Core identity.')
    const allowedNodeKeys = new Set(['id', 'type', 'position', 'measured', 'data', 'lcos_ref'])
    if (Object.keys(input).some((key) => !allowedNodeKeys.has(key))) fail(501, 'NODE_CREATE_NOT_IMPLEMENTED', 'Text create contains unsupported spatial semantics.')
    const data = object(input.data, 'creates[].data')
    const allowedDataKeys = new Set(['id', 'title', 'text', 'content', 'prompt', 'params', nativeMaterialExcerptKey, ...textPresentationKeys, ...guiPresentationKeys])
    if (Object.keys(data).some((key) => !allowedDataKeys.has(key))) fail(501, 'NODE_DATA_NOT_IMPLEMENTED', 'Text create contains fields without a Core producer.')
    const presentation = { ...validateTextPresentationData(data, 'creates[].data'), ...validateGuiPresentationData(data, 'creates[].data') }
    if (data.prompt !== undefined && data.prompt !== '') fail(501, 'NODE_PROMPT_NOT_IMPLEMENTED', 'Prompt generation is not connected to the Core text producer.')
    if (data.params !== undefined) {
      const params = object(data.params, 'data.params')
      const keys = Object.keys(params).sort().join(',')
      if (keys !== '' && !(keys === 'model,provider' && params.model === DEFAULT_TEXT_PARAMS.model && params.provider === DEFAULT_TEXT_PARAMS.provider)) {
        fail(501, 'NODE_PARAMS_NOT_IMPLEMENTED', 'Text generation settings are not connected to the Core text producer.')
      }
    }
    const title = typeof data.title === 'string' && data.title.trim() ? data.title.trim() : undefined
    const bodyValue = data.text !== undefined ? data.text : data.content
    if (typeof bodyValue !== 'string') fail(400, 'INVALID_ARGUMENT', 'New text nodes need a string data.text or data.content.')
    const position = point(input.position, 'creates[].position')
    const measured = size(input.measured, 'creates[].measured')
    const workspace = workspaceAt(canvasId)
    const excerpt = Object.hasOwn(data, nativeMaterialExcerptKey) ? await validateNativeMaterialExcerpt({ repository, projectId,
      value: data[nativeMaterialExcerptKey], body: bodyValue,
      read: async filePath => await readProjectFile(repository.getProject(projectId)!.rootPath, filePath) as Buffer,
      projectText: options.excerptSourceText ?? (async () => fail(501, 'EXCERPT_RENDERER_NOT_READY', '原正文的准确位置暂未准备好，未创建替代摘录。')),
      fail }) : undefined
    if (excerpt && data.text !== undefined && data.content !== undefined && data.text !== data.content)
      fail(409, 'EXCERPT_QUOTE_MISMATCH', '摘录的两份正文不一致，原文保留。')
    const nodeId = nodeIdForCreate(input)
    const node = { id: nodeId, nodeType: 'note', position, size: measured,
      data: { label: title ?? bodyValue.split(/\r?\n/)[0]?.trim().slice(0, 80) ?? '文本', content: bodyValue, ...presentation } }
    let carrier: Omit<LifecycleNodeResult, 'lcos_ref'> | undefined
    let completed: LifecycleNodeResult | undefined
    try {
      carrier = await createCarrier(canvasId, node, 'text')
      const created = await createTextArtifact(repository, projectId as ProjectId, {
        ...(title === undefined ? {} : { title }), body: bodyValue, scopeId: String(workspace.scopeId), workspaceId: String(workspace.id),
        x: position.x, y: position.y, nativeBinding: { canvasId, spatialId: carrier.nodeId },
      })
      const artifact = repository.getArtifact(created.artifactId)
      const view = repository.getArtifactView(created.viewId)
      const revision = repository.getArtifactRevision(created.revisionId)
      if (!artifact || !view || !revision || String(artifact.projectId) !== projectId || String(view.artifactId) !== created.artifactId) {
        fail(409, 'CORE_CREATE_UNCONFIRMED', 'Core text producer did not read back its Artifact, revision, and View.')
      }
      const text = await readFile(repository.getFileRecord(String(revision.fileRecordId))!.observedPath, 'utf8')
      if (text !== bodyValue) fail(409, 'CORE_CREATE_BODY_MISMATCH', 'Core text producer readback did not match the submitted text.')
      const ref = outputRef('artifact', artifact, view, revision)
      // Huabu's note data (label/content) is an internal spatial DTO. Native
      // history must receive the same text presentation vocabulary as nodeWire,
      // so its complete saved snapshot can pass the existing restore validator.
      // Keep the Huabu carrier untouched; do not leak arbitrary executor data.
      completed = { ...carrier, data: memberData(canvasId, ref, { id: carrier.nodeId, title: created.title,
        text: bodyValue, content: bodyValue, prompt: '', params: { ...DEFAULT_TEXT_PARAMS }, ...presentation }), lcos_ref: ref }
      if (excerpt) await linkExcerpt(created.artifactId, excerpt)
      return completed
    } catch (error) {
      // If Core has not committed the native binding, the disposable new carrier can be removed.
      const carrierNodeId = carrier?.nodeId ?? nodeId
      const binding = repository.getProjectionBindings(projectId).find((item) => item.canvasId === canvasId && item.spatialId === carrierNodeId)
      if (!binding) {
        await spatial.execute(canvasId, [{ type: 'DELETE_NODES', nodeIds: [carrierNodeId] }]).catch(() => undefined)
      }
      if (error instanceof NodeLifecycleError) {
        const existingDetails = error.details && typeof error.details === 'object' && !Array.isArray(error.details)
          ? error.details as JsonRecord : {}
        throw new NodeLifecycleError(error.status, error.code, error.message, { ...existingDetails,
          ...(completed ? { completed: [completed], lcos_refs: { [completed.nodeId]: completed.lcos_ref },
            client_to_spatial_ids: { [completed.clientNodeId]: completed.nodeId } } : {}),
          nodeId: carrierNodeId, coreBound: Boolean(binding), spatialSaved: Boolean(carrier) })
      }
      throw new NodeLifecycleError(409, 'CORE_TEXT_CREATE_FAILED', error instanceof Error ? error.message : String(error), {
        ...(completed ? { completed: [completed], lcos_refs: { [completed.nodeId]: completed.lcos_ref },
          client_to_spatial_ids: { [completed.clientNodeId]: completed.nodeId } } : {}),
        nodeId: carrierNodeId, coreBound: Boolean(binding), spatialSaved: Boolean(carrier),
      })
    }
  }

  async function createImportedImage(canvasId: string, input: LifecycleCreateNode, receiptRef: LifecycleImportedImageReceipt): Promise<LifecycleNodeResult> {
    if (input.type !== 'image') fail(409, 'NODE_TYPE_MISMATCH', 'The imported upload receipt can only create an image carrier.')
    if (input.lcos_ref !== undefined) fail(400, 'UNEXPECTED_LCOS_REF', 'Fresh image identity must come from the exact Core upload receipt.')
    const allowedNodeKeys = new Set(['id', 'type', 'position', 'measured', 'data'])
    if (Object.keys(input).some((key) => !allowedNodeKeys.has(key))) fail(501, 'NODE_CREATE_NOT_IMPLEMENTED', 'Imported image create contains unsupported spatial semantics.')
    const receipt = object(receiptRef, 'receiptRef')
    const receiptUrl = requiredString(receipt.url, 'receiptRef.url')
    const fileRecordId = requiredString(receipt.fileRecordId, 'receiptRef.fileRecordId')
    const ref = parseRef(receipt.lcos_ref)
    let uploadUrl: URL
    try { uploadUrl = new URL(receiptUrl) } catch { return fail(400, 'INVALID_UPLOAD_RECEIPT', 'Upload receipt URL must be absolute.') }
    const uploadParts = uploadUrl.pathname.split('/').filter(Boolean)
    if (uploadUrl.origin !== publicOrigin || uploadParts.length !== 5
      || uploadParts.slice(0, 4).join('/') !== 'api/conversation/storage/uploads'
      || !/^core-upload-[a-f0-9-]{36}$/.test(uploadParts[4]!)
      || uploadUrl.search || uploadUrl.hash) {
      fail(409, 'INVALID_UPLOAD_RECEIPT', 'Image receipt must be one exact local TapNow upload URL.')
    }
    const data = object(input.data, 'creates[].data')
    if (textPresentationKeys.some((key) => Object.hasOwn(data, key))) {
      fail(400, 'NODE_TYPE_MISMATCH', 'Text presentation data cannot be applied to an image node.')
    }
    const allowedDataKeys = new Set(['id', 'title', 'src', 'prompt', 'type', 'defaultOpenGallery', '__metadata', ...guiPresentationKeys])
    if (Object.keys(data).some((key) => !allowedDataKeys.has(key))) fail(501, 'NODE_DATA_NOT_IMPLEMENTED', 'Uploaded image contains fields without a Core projection mapping.')
    const presentation = validateGuiPresentationData(data, 'creates[].data')
    if (data.src !== receiptUrl) fail(409, 'UPLOAD_RECEIPT_URL_MISMATCH', 'The exact upload URL does not match the supplied Core receipt.')
    if (data.prompt !== undefined && data.prompt !== '') fail(501, 'IMAGE_PROMPT_NOT_IMPLEMENTED', 'Prompt-generated image semantics are not connected to this upload producer.')
    if (data.type !== undefined && data.type !== 'upload') fail(409, 'CANVAS_IMAGE_TYPE_MISMATCH', 'Only uploaded image nodes are connected to the Core import producer.')
    if (data.defaultOpenGallery !== undefined && data.defaultOpenGallery !== false) {
      fail(501, 'IMAGE_PRESENTATION_NOT_IMPLEMENTED', 'Gallery presentation state is not preserved by the Core import producer.')
    }
    if (data.title !== undefined && typeof data.title !== 'string') fail(400, 'INVALID_ARGUMENT', 'Image title must be a string when supplied.')
    let renderMetadata: JsonRecord | undefined
    if (data.__metadata !== undefined) {
      const metadata = object(data.__metadata, 'data.__metadata')
      if (Object.keys(metadata).sort().join(',') !== 'height,url,width' || metadata.url !== receiptUrl
        || !Number.isFinite(metadata.width) || !Number.isFinite(metadata.height)
        || Number(metadata.width) <= 0 || Number(metadata.height) <= 0) {
        fail(501, 'IMAGE_RENDER_METADATA_NOT_IMPLEMENTED', 'Only renderer dimensions tied to the exact upload URL can be translated.')
      }
      renderMetadata = { ...metadata }
    }

    const material = resolveMaterial(ref, canvasId, 'duplicate')
    if (material.nodeType !== 'image' || String(material.file.id) !== fileRecordId
      || String(material.revision.id) !== ref.revisionId || String(material.view.id) !== ref.artifactViewId) {
      fail(409, 'UPLOAD_RECEIPT_CORE_MISMATCH', 'The exact upload receipt does not identify this image Artifact, Revision, View, and FileRecord.')
    }
    const position = point(input.position, 'creates[].position')
    const measured = size(input.measured, 'creates[].measured')
    const nodeId = nodeIdForCreate(input)
    const built = await nodeWire(canvasId, material, nodeId, position, measured, 'artifact')
    built.node.data = { ...built.node.data, ...presentation }
    built.result.data = { ...built.result.data, ...presentation }
    // Upload is a fresh spatial carrier but not a second material import. The existing Core claim
    // decides whether this worksite uses the Artifact identity or a new View identity.
    let carrier: LifecycleNodeResult | undefined
    let claimedBinding: ProjectionBindingRecord | undefined
    try {
      carrier = await createCarrier(canvasId, built.node, 'image')
      const claimed = repository.claimImportedImageCarrier(projectId, {
        artifactId: String(material.artifact.id), revisionId: String(material.revision.id), viewId: String(material.view.id),
        canvasId, spatialId: carrier.nodeId, scopeId: String(material.workspace.scopeId), position, size: measured,
      })
      claimedBinding = claimed.binding
      const artifact = repository.getArtifact(String(claimed.view.artifactId))
      const revision = claimed.view.revisionId ? repository.getArtifactRevision(String(claimed.view.revisionId)) : undefined
      if (!artifact || !revision || claimed.binding.spatialId !== carrier.nodeId
        || String(claimed.view.artifactId) !== String(material.artifact.id)
        || String(revision.id) !== String(material.revision.id)
        || !['artifact', 'view'].includes(claimed.binding.entityType)) {
        fail(409, 'CORE_IMAGE_CLAIM_UNCONFIRMED', 'Core did not confirm the imported image View and native carrier binding.')
      }
      const refOut = outputRef(claimed.binding.entityType as 'artifact' | 'view', artifact, claimed.view, revision)
      if (renderMetadata) renderMetadata.url = built.result.data.src
      return { ...carrier, data: memberData(canvasId, refOut, { ...built.result.data, ...(renderMetadata ? { __metadata: renderMetadata } : {}), id: carrier.nodeId }), lcos_ref: refOut }
    } catch (error) {
      const carrierNodeId = carrier?.nodeId ?? nodeId
      if (claimedBinding && claimedBinding.spatialId === carrierNodeId) {
        repository.deleteProjectionBinding(projectId, canvasId, 'node', claimedBinding.entityType, claimedBinding.entityId)
      }
      if ((carrier || (await canvasNodes(canvasId)).some((item) => String(item.id) === carrierNodeId))) {
        await spatial.execute(canvasId, [{ type: 'DELETE_NODES', nodeIds: [carrierNodeId] }]).catch(() => undefined)
      }
      if (error instanceof NodeLifecycleError) throw error
      throw new NodeLifecycleError(409, 'CORE_IMAGE_CLAIM_FAILED', error instanceof Error ? error.message : String(error), {
        nodeId: carrierNodeId, coreBound: Boolean(claimedBinding), spatialSaved: Boolean(carrier),
      })
    }
  }

  function materialSourceRef(value: unknown): LcosNodeRefV1 {
    return parseRef(value)
  }

  async function duplicateView(canvasId: string, input: LifecycleCreateNode): Promise<LifecycleNodeResult> {
    if (!input.lcos_ref) fail(409, 'CORE_REFERENCE_REQUIRED', 'Material duplicate needs an explicit lcos_ref from the source node.')
    const allowedNodeKeys = new Set(['id', 'type', 'position', 'measured', 'data', 'lcos_ref'])
    if (Object.keys(input).some((key) => !allowedNodeKeys.has(key))) fail(501, 'NODE_CREATE_NOT_IMPLEMENTED', 'Duplicate contains unsupported spatial semantics.')
    const sourceRef = materialSourceRef(input.lcos_ref)
    const source = resolveMaterial(sourceRef, canvasId, 'duplicate')
    if (input.data.lcos_workspace_membership !== undefined) {
      const evidence = object(input.data.lcos_workspace_membership, 'lcos_workspace_membership')
      const sourceWorkspace = repository.getWorkspace(String(evidence.workspaceId))
      if (!sourceWorkspace?.canvasId) fail(409, 'WORKSPACE_MEMBERSHIP_OWNER_CHANGED', 'The copied source member has no owning Canvas.')
      const address = memberAddress(sourceWorkspace.canvasId, sourceRef)
      membership.check(address, membership.parse(address, evidence), false)
    }
    const position = point(input.position, 'creates[].position')
    const measured = size(input.measured, 'creates[].measured')
    if (input.type !== source.nodeType) fail(409, 'NODE_TYPE_MISMATCH', 'The TapNow node type does not match its bound Core Artifact kind.')
    const expectedSrc = `${publicOrigin}/api/surface-core/file-records/${encodeURIComponent(String(source.file.id))}/content`
    const presentation = validateRestoredData(source.nodeType, input.data, source.artifact.title, source.nodeType === 'image' ? expectedSrc : undefined,
      isNativeFileMaterial(source.artifact.kind) ? nativeFileMaterialMetadata(source) : undefined)
    const nodeId = nodeIdForCreate(input)
    const built = await nodeWire(canvasId, source, nodeId, position, measured, 'view')
    built.node.data = { ...built.node.data, ...presentation }
    built.result.data = { ...built.result.data, ...presentation }
    const node = built.node
    let carrier: LifecycleNodeResult | undefined
    let createdView: ArtifactView | undefined
    try {
      carrier = await createCarrier(canvasId, node, source.nodeType)
      let view: ArtifactView
      let binding: ProjectionBindingRecord
      if (source.nodeType === 'image') {
        const claimed = repository.claimImportedImageCarrier(projectId, {
          artifactId: String(source.artifact.id), revisionId: String(source.revision.id), viewId: String(source.view.id),
          canvasId, spatialId: carrier.nodeId, scopeId: String(source.workspace.scopeId), position, size: measured,
        })
        view = claimed.view
        binding = claimed.binding
        if (binding.entityType === 'view') createdView = view
      } else {
        view = { ...source.view, id: `view-${randomUUID()}` as ArtifactView['id'], scopeId: source.workspace.scopeId,
          revisionId: source.revision.id, referenceKind: 'explicit_additional', position, size: measured }
        createdView = view
        repository.upsertArtifactView(view)
        binding = { projectId, canvasId, spatialKind: 'node', spatialId: carrier.nodeId, entityType: 'view', entityId: String(view.id) }
        repository.upsertProjectionBinding(binding)
      }
      const artifact = repository.getArtifact(String(view.artifactId))
      const revision = view.revisionId ? repository.getArtifactRevision(String(view.revisionId)) : undefined
      if (!artifact || !revision || binding.spatialId !== carrier.nodeId || binding.entityId !== String(view.id)) {
        fail(409, 'CORE_VIEW_CREATE_UNCONFIRMED', 'Core did not confirm the additional ArtifactView binding.')
      }
      const ref = outputRef('view', artifact, view, revision)
      return { ...carrier, data: memberData(canvasId, ref, { ...built.result.data, id: carrier.nodeId,
        ...(isNativeFileMaterial(artifact.kind) ? { lcos_file_ref: nativeFileMaterialMetadata({ artifact, view, revision, file: source.file }) } : {}) }), lcos_ref: ref }
    } catch (error) {
      const carrierNodeId = carrier?.nodeId ?? nodeId
      const binding = repository.getProjectionBindings(projectId).find((item) => item.canvasId === canvasId && item.spatialId === carrierNodeId)
      if (binding && carrier) repository.deleteProjectionBinding(projectId, canvasId, 'node', binding.entityType, binding.entityId)
      if (createdView) repository.deleteArtifactView(String(createdView.id))
      if ((carrier || (await canvasNodes(canvasId)).some((item) => String(item.id) === carrierNodeId))) {
        await spatial.execute(canvasId, [{ type: 'DELETE_NODES', nodeIds: [carrierNodeId] }]).catch(() => undefined)
      }
      if (error instanceof NodeLifecycleError) throw error
      throw new NodeLifecycleError(409, 'CORE_VIEW_CREATE_FAILED', error instanceof Error ? error.message : String(error), {
        nodeId: carrierNodeId, coreBound: Boolean(binding), spatialSaved: Boolean(carrier),
      })
    }
  }

  async function referenceForNode(canvasId: string, node: SpatialNode, explicit?: unknown): Promise<LcosNodeRefV1 | undefined> {
    const bindings = repository.getProjectionBindings(projectId).filter((item) => item.canvasId === canvasId
      && item.spatialKind === 'node' && item.spatialId === String(node.id))
    if (bindings.length > 1) fail(409, 'MULTIPLE_NODE_BINDINGS', 'The Huabu node has more than one Core identity.')
    const binding = bindings[0]
    const explicitRef = explicit === undefined ? undefined : parseRef(explicit)
    if (binding && binding.entityType !== 'artifact' && binding.entityType !== 'view') {
      fail(501, 'NODE_BINDING_NOT_IMPLEMENTED', `Deleting Core binding type ${binding.entityType} is not supported by this lifecycle.`)
    }
    if (binding && explicitRef && !validRefMatchesBinding(explicitRef, binding)) {
      fail(409, 'LCOS_REF_BINDING_MISMATCH', 'History lcos_ref disagrees with the current persistent Core binding.')
    }
    if (!binding && !explicitRef) return undefined
    const ref = explicitRef ?? (() => {
      if (!binding) return undefined
      if (binding.entityType === 'view') {
        const view = repository.getArtifactView(binding.entityId)
        const artifact = view ? repository.getArtifact(String(view.artifactId)) : undefined
        const revision = view?.revisionId ? repository.getArtifactRevision(String(view.revisionId)) : undefined
        if (!view || !artifact || !revision || String(artifact.projectId) !== projectId) fail(409, 'CORE_VIEW_UNAVAILABLE', 'The node binding has no readable ArtifactView.')
        return outputRef('view', artifact, view, revision)
      }
      const artifact = repository.getArtifact(binding.entityId)
      if (!artifact || String(artifact.projectId) !== projectId) fail(409, 'CORE_ARTIFACT_UNAVAILABLE', 'The node binding has no project-owned Artifact.')
      const workspace = workspaceAt(canvasId)
      const views = repository.getArtifactViews(String(artifact.id)).filter((item) => String(item.scopeId) === String(workspace.scopeId)
        && item.referenceKind === 'primary')
      const view = views.length === 1 ? views[0] : undefined
      const revision = artifact.currentRevisionId ? repository.getArtifactRevision(String(artifact.currentRevisionId)) : undefined
      if (!view || !revision) fail(409, 'CORE_PRIMARY_VIEW_AMBIGUOUS', 'The bound Artifact has no unique primary View in this worksite.')
      return outputRef('artifact', artifact, view, revision)
    })()
    if (!ref) return undefined
    // Validate even DTO-only identities against the exact project and worksite records.
    resolveMaterial(ref, canvasId, 'restore')
    return ref
  }

  async function deleteNodes(canvasId: string, ids: readonly string[], explicitRefs: unknown, explicitSnapshots?: unknown): Promise<{
    deleted: string[]; refs: Record<string, LcosNodeRefV1>; coreSaved: boolean; spatialSaved: boolean;
  }> {
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 200) fail(400, 'INVALID_ARGUMENT', 'delete_ids must contain 1–200 node IDs.')
    const nodes = await canvasNodes(canvasId)
    const byId = new Map(nodes.map((node) => [String(node.id), node]))
    const refMap = explicitRefs === undefined ? {} : object(explicitRefs, 'lcos_refs')
    const snapshots = explicitSnapshots === undefined ? {} : object(explicitSnapshots, 'lcos_snapshots')
    const targets: Array<{ id: string; node: SpatialNode; ref: LcosNodeRefV1; member?: NativeWorkspaceMembershipSnapshot }> = []
    for (const rawId of ids) {
      const id = requiredString(rawId, 'delete ID')
      const node = byId.get(id)
      if (!node) fail(404, 'OBJECT_NOT_FOUND', `No Huabu node with ID ${id} exists in this worksite.`)
      const ref = await referenceForNode(canvasId, node, refMap[id])
      if (!ref) fail(409, 'CORE_BINDING_REQUIRED', `Node ${id} has no recoverable Core identity; history cannot safely restore it.`)
      const snapshot = snapshots[id]
      const address = memberAddress(canvasId, ref)
      let member: NativeWorkspaceMembershipSnapshot | undefined
      if (snapshot !== undefined) {
        const saved = object(snapshot, 'lcos_snapshots[nodeId]'), data = object(saved.data, 'lcos_snapshots[nodeId].data')
        const snapshotRef = parseRef(saved.lcos_ref ?? data.lcos_ref)
        if (saved.id !== id || !isDeepStrictEqual(snapshotRef, ref)) fail(409, 'CORE_SNAPSHOT_MISMATCH', 'The saved node does not match the exact deletion identity.')
        member = membership.parse(address, data.lcos_workspace_membership)
      }
      membership.check(address, member, true)
      targets.push({ id, node, ref, member })
    }
    let membershipChanged = false
    const removedMemberViewIds: string[] = []
    try {
      for (const target of targets) {
        const removed = await membership.remove(memberAddress(canvasId, target.ref), target.member)
        membershipChanged ||= removed.changed
        if (removed.changed) removedMemberViewIds.push(target.ref.artifactViewId)
      }
    } catch (error) {
      if (membershipChanged) throw new NodeLifecycleError(409, 'PARTIAL_LIFECYCLE_COMMIT', 'Some exact members were removed; the Canvas batch was not sent.', {
        removedMemberViewIds, spatialSaved: false, causeCode: error instanceof NodeLifecycleError ? error.code : undefined,
        cause: error instanceof Error ? error.message : String(error) })
      throw error
    }
    // A Core HTTP await must not turn an old delete into a write against a
    // rebound or edited carrier. Partial Core facts stay recorded, not rolled
    // back over someone else's newer work.
    const beforeSpatial = await canvasNodes(canvasId)
    for (const target of targets) {
      const current = beforeSpatial.find(node => String(node.id) === target.id)
      const currentRef = current ? await referenceForNode(canvasId, current, target.ref) : undefined
      if (!current || !isDeepStrictEqual(current, target.node) || !isDeepStrictEqual(currentRef, target.ref)
        || membership.current(memberAddress(canvasId, target.ref)))
        fail(409, 'PARTIAL_LIFECYCLE_COMMIT', 'The member changed but the saved carrier no longer matches; newer Canvas work was kept.', { membershipChanged })
    }
    let result: any
    try { result = await execute(canvasId, { type: 'DELETE_NODES', nodeIds: targets.map((item) => item.id) }) }
    catch (error) {
      const after = await canvasNodes(canvasId)
      if (targets.some(target => after.some(node => String(node.id) === target.id)))
        fail(409, 'PARTIAL_LIFECYCLE_COMMIT', 'The member and Canvas removal did not both finish. No automatic second delete was sent.',
          { membershipChanged, cause: error instanceof Error ? error.message : String(error) })
      result = { results: [{ applied: true }] }
    }
    let coreSaved = membershipChanged
    const outputRefs: Record<string, LcosNodeRefV1> = {}
    for (const target of targets) {
      const ref = target.ref!
      outputRefs[target.id] = ref
      const current = repository.findProjectionBinding(projectId, canvasId, 'node', ref.entityType, ref.entityId)
      if (current?.spatialId === target.id) {
        repository.deleteProjectionBinding(projectId, canvasId, 'node', ref.entityType, ref.entityId)
        coreSaved = true
      }
    }
    if (result.results[0]?.applied !== true) fail(409, 'SPATIAL_DELETE_UNCONFIRMED', 'Huabu did not confirm deleting the carrier nodes.')
    return { deleted: targets.map((item) => item.id), refs: outputRefs, coreSaved, spatialSaved: true }
  }

  async function restoreNode(canvasId: string, input: LifecycleCreateNode): Promise<LifecycleNodeResult> {
    if (!input.lcos_ref) fail(409, 'CORE_REFERENCE_REQUIRED', 'History restore needs the saved lcos_ref; NodeID is not a Core identity.')
    const allowedNodeKeys = new Set(['id', 'type', 'position', 'measured', 'data', 'lcos_ref'])
    if (Object.keys(input).some((key) => !allowedNodeKeys.has(key))) fail(501, 'NODE_CREATE_NOT_IMPLEMENTED', 'Restore contains unsupported spatial semantics.')
    const material = resolveMaterial(input.lcos_ref, canvasId, 'restore')
    const address = memberAddress(canvasId, outputRef(material.ref.entityType, material.artifact, material.view, material.revision))
    const member = membership.parse(address, input.data.lcos_workspace_membership)
    membership.check(address, member, true)
    if (input.type !== material.nodeType) fail(409, 'NODE_TYPE_MISMATCH', 'Restored node type does not match the saved Core Artifact.')
    const expectedSrc = `${publicOrigin}/api/surface-core/file-records/${encodeURIComponent(String(material.file.id))}/content`
    const presentation = validateRestoredData(material.nodeType, input.data, material.artifact.title, material.nodeType === 'image' ? expectedSrc : undefined,
      isNativeFileMaterial(material.artifact.kind) ? nativeFileMaterialMetadata(material) : undefined)
    const position = point(input.position, 'creates[].position')
    const measured = size(input.measured, 'creates[].measured')
    const nodeId = nodeIdForCreate(input)
    const binding = repository.findProjectionBinding(projectId, canvasId, 'node', material.ref.entityType, material.ref.entityId)
    let existingCarrier: SpatialNode | undefined
    if (binding) {
      const existingNodes = await canvasNodes(canvasId)
      existingCarrier = existingNodes.find((node) => String(node.id) === binding.spatialId)
      if (existingCarrier && binding.spatialId !== nodeId) fail(409, 'CORE_IDENTITY_ALREADY_VISIBLE', 'This Core Artifact/View already has a live Huabu carrier in the worksite.')
    }
    const built = await nodeWire(canvasId, material, nodeId, position, measured, material.ref.entityType)
    built.node.data = { ...built.node.data, ...presentation }
    built.result.data = { ...built.result.data, ...presentation }
    const carrierBodyMatches = (node: SpatialNode) => {
      const actual = object(node.data, 'restored.data'), expected = object(built.node.data, 'expected.data')
      // The original executor owns label deduplication/default accent/height
      // fields. Never rewrite those defaults to make a retry look identical.
      // The existing facade removes canonical label/content/src after binding;
      // absence means Core supplies it. A present different draft still fails.
      return ['content', 'src'].every(key => actual[key] === undefined || actual[key] === expected[key])
        && (!Object.hasOwn(presentation, 'lcos_gui_emphasis') || (actual.lcos_gui_emphasis === true) === (expected.lcos_gui_emphasis === true))
    }
    const sameCarrierAfterCoreCleanup = (before: SpatialNode, after: SpatialNode) => {
      const oldData = object(before.data, 'saved.data'), nextData = object(after.data, 'current.data')
      const comparedOld = { ...oldData }, comparedNext = { ...nextData }
      for (const key of ['label', 'content', 'src']) if (nextData[key] === undefined) { delete comparedOld[key]; delete comparedNext[key] }
      return isDeepStrictEqual({ ...before, data: comparedOld }, { ...after, data: comparedNext })
    }
    if (existingCarrier && (existingCarrier.type !== built.node.nodeType || !isDeepStrictEqual(existingCarrier.position, position)
      || !carrierBodyMatches(existingCarrier)
      || Number((existingCarrier.style as JsonRecord)?.width ?? existingCarrier.width) !== measured.width
      || Number((existingCarrier.style as JsonRecord)?.height ?? existingCarrier.height) !== measured.height))
      fail(409, 'CORE_RESTORE_CARRIER_CHANGED', 'The partially restored carrier was edited; history did not overwrite it.')
    let carrier: LifecycleNodeResult | undefined
    let bound = Boolean(existingCarrier)
    try {
      carrier = existingCarrier ? { clientNodeId: nodeId, nodeId, ...built.result } : await createCarrier(canvasId, built.node, material.nodeType)
      const nextBinding: ProjectionBindingRecord = { projectId, canvasId, spatialKind: 'node', spatialId: carrier.nodeId,
        entityType: material.ref.entityType, entityId: material.ref.entityId }
      repository.upsertProjectionBinding(nextBinding)
      const confirmed = repository.findProjectionBinding(projectId, canvasId, 'node', material.ref.entityType, material.ref.entityId)
      if (!confirmed || confirmed.spatialId !== carrier.nodeId) fail(409, 'CORE_RESTORE_UNCONFIRMED', 'Core did not confirm the restored node binding.')
      bound = true
      const beforeMember = (await canvasNodes(canvasId)).find(node => String(node.id) === carrier!.nodeId)
      if (!beforeMember || beforeMember.type !== built.node.nodeType || !isDeepStrictEqual(beforeMember.position, position)
        || !carrierBodyMatches(beforeMember)) fail(409, 'PARTIAL_LIFECYCLE_COMMIT', 'The restored carrier changed before confirming its member.')
      await membership.restore(address, member)
      const currentNodes = await canvasNodes(canvasId), current = currentNodes.find(node => String(node.id) === carrier!.nodeId)
      const currentBinding = repository.findProjectionBinding(projectId, canvasId, 'node', material.ref.entityType, material.ref.entityId)
      if (!current || currentBinding?.spatialId !== carrier.nodeId || !sameCarrierAfterCoreCleanup(beforeMember, current))
        fail(409, 'PARTIAL_LIFECYCLE_COMMIT', 'The restored carrier changed while confirming its member; newer work was kept.')
      return { ...carrier, data: memberData(canvasId, built.result.lcos_ref, { ...built.result.data, id: carrier.nodeId }), lcos_ref: built.result.lcos_ref }
    } catch (error) {
      if (bound) throw new NodeLifecycleError(409, 'PARTIAL_LIFECYCLE_COMMIT', 'The exact carrier is restored but its full membership receipt was not confirmed.', {
        nodeId, coreBound: true, spatialSaved: true, causeCode: error instanceof NodeLifecycleError ? error.code : undefined,
        cause: error instanceof Error ? error.message : String(error) })
      const carrierNodeId = carrier?.nodeId ?? nodeId
      const currentBinding = repository.findProjectionBinding(projectId, canvasId, 'node', material.ref.entityType, material.ref.entityId)
      if (currentBinding?.spatialId === carrierNodeId) {
        repository.deleteProjectionBinding(projectId, canvasId, 'node', material.ref.entityType, material.ref.entityId)
      }
      if ((carrier || (await canvasNodes(canvasId)).some((item) => String(item.id) === carrierNodeId))) {
        await spatial.execute(canvasId, [{ type: 'DELETE_NODES', nodeIds: [carrierNodeId] }]).catch(() => undefined)
      }
      if (error instanceof NodeLifecycleError) throw error
      throw new NodeLifecycleError(409, 'CORE_RESTORE_FAILED', error instanceof Error ? error.message : String(error), {
        nodeId: carrierNodeId, coreBound: Boolean(repository.findProjectionBinding(projectId, canvasId, 'node', material.ref.entityType, material.ref.entityId)),
        spatialSaved: Boolean(carrier),
      })
    }
  }

  async function applyAction(input: {
    readonly canvasId: string
    readonly action: LifecycleBatchAction
    readonly lcos_operation: LcosOperationV1
    readonly lcos_refs?: unknown
    readonly lcos_snapshots?: unknown
  }): Promise<NodeLifecycleResult> {
    const canvasId = requiredString(input.canvasId, 'canvasId')
    workspaceAt(canvasId)
    const operation = validateOperation(input.lcos_operation)
    const action = object(input.action, 'action')
    if (action.action === 'create') {
      if (Object.keys(action).some((key) => key !== 'action' && key !== 'creates')) {
        fail(501, 'NODE_CREATE_ACTION_NOT_IMPLEMENTED', 'Create action contains unsupported fields outside the node DTOs.')
      }
      if (!Array.isArray(action.creates) || action.creates.length === 0 || action.creates.length > 200) {
        fail(400, 'INVALID_ARGUMENT', 'create action needs 1–200 node DTOs.')
      }
      const created: LifecycleNodeResult[] = []
      let coreSaved = false
      try {
        for (const raw of action.creates) {
          const node = object(raw, 'creates[]') as unknown as LifecycleCreateNode
          let result: LifecycleNodeResult
          if (operation.phase === 'apply' && operation.kind === 'create') result = await freshText(canvasId, node)
          else if (operation.phase === 'apply' && operation.kind === 'duplicate-view') result = await duplicateView(canvasId, node)
          else if ((operation.phase === 'undo' && operation.kind === 'delete')
            || (operation.phase === 'redo' && (operation.kind === 'create' || operation.kind === 'duplicate-view'))) result = await restoreNode(canvasId, node)
          else fail(501, 'NODE_HISTORY_OPERATION_NOT_IMPLEMENTED', `Cannot apply ${operation.kind}/${operation.phase} through a create action.`)
          created.push(result)
          coreSaved = true
        }
      } catch (error) {
        const saved = error instanceof NodeLifecycleError && error.details && typeof error.details === 'object'
          ? (error.details as { completed?: LifecycleNodeResult[] }).completed ?? [] : []
        const completed = [...created, ...saved]
        if (completed.length > 0) {
          throw new NodeLifecycleError(409, 'PARTIAL_LIFECYCLE_COMMIT', `已保存 ${completed.length} 份材料，后续步骤尚未全部确认；原内容保留，请勿重复创建。`, {
            canvas_id: canvasId, operation, completed, lcos_refs: Object.fromEntries(completed.map((node) => [node.nodeId, node.lcos_ref])),
            client_to_spatial_ids: Object.fromEntries(completed.map((node) => [node.clientNodeId, node.nodeId])),
            causeCode: error instanceof NodeLifecycleError ? error.code : undefined,
            cause: error instanceof Error ? error.message : String(error),
            ...(error instanceof NodeLifecycleError ? { causeDetails: error.details } : {}),
          })
        }
        throw error
      }
      return { canvas_id: canvasId, operation, nodes: created, deleted_node_ids: [],
        lcos_refs: Object.fromEntries(created.map((node) => [node.nodeId, node.lcos_ref])),
        client_to_spatial_ids: Object.fromEntries(created.map((node) => [node.clientNodeId, node.nodeId])),
        core_saved: coreSaved, spatial_saved: true }
    }
    if (action.action === 'delete') {
      if (Object.keys(action).some((key) => key !== 'action' && key !== 'delete_ids')) {
        fail(501, 'NODE_DELETE_ACTION_NOT_IMPLEMENTED', 'Delete action contains unsupported fields outside delete_ids.')
      }
      const ids = action.delete_ids
      if (!Array.isArray(ids)) fail(400, 'INVALID_ARGUMENT', 'delete action needs delete_ids.')
      const allowed = (operation.kind === 'delete' && (operation.phase === 'apply' || operation.phase === 'redo'))
        || (operation.kind === 'create' && operation.phase === 'undo')
        || (operation.kind === 'duplicate-view' && operation.phase === 'undo')
      if (!allowed) fail(501, 'NODE_HISTORY_OPERATION_NOT_IMPLEMENTED', `Cannot apply ${operation.kind}/${operation.phase} through a delete action.`)
      const deleted = await deleteNodes(canvasId, ids as string[], input.lcos_refs, input.lcos_snapshots)
      return { canvas_id: canvasId, operation, nodes: [], deleted_node_ids: deleted.deleted,
        lcos_refs: deleted.refs, client_to_spatial_ids: {}, core_saved: deleted.coreSaved, spatial_saved: deleted.spatialSaved }
    }
    fail(501, 'NODE_ACTION_NOT_IMPLEMENTED', `Node action ${String(action.action)} is not supported by the Core lifecycle.`)
  }

  return {
    applyAction,
    createText: freshText,
    createImportedImage,
    duplicateView,
    restore: restoreNode,
    deleteNodes,
    referenceForNode,
    /** Exposed for the parent facade to project view-backed text from its pinned Core revision. */
    resolveReference: (ref: unknown, canvasId: string, mode: 'duplicate' | 'restore' = 'restore') => resolveMaterial(ref, canvasId, mode),
    coreOrigin,
  }
}
