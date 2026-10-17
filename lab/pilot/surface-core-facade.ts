import { existsSync } from 'node:fs'
import { mkdir, readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { imageSize } from 'image-size'
import { createId } from '../../lcos/huabu/packages/shared/src/index.ts'

import { ExplicitProjectCatalog } from '../../lcos/apps/local-core/src/project-catalog.ts'
import { SqliteMetadataRepository } from '../../lcos/apps/local-core/src/metadata-repository.ts'
import { createMvpSampleSnapshot } from '../../lcos/apps/local-core/src/mvp-sample-project.ts'
import { createTextArtifact } from '../../lcos/apps/local-core/src/text-artifact-service.ts'
import { readCanvasText, saveCanvasText } from '../../lcos/apps/local-core/src/canvas-text-service.ts'
import { createLocalCoreServer } from '../../lcos/apps/local-core/src/server.ts'
import { CoreArtifactClient } from '../../lcos/apps/web-gen2/src/backend/artifacts.ts'
import { HttpClient } from '../../lcos/apps/web-gen2/src/backend/client.ts'
import { setWorkspacePath } from '../../lcos/huabu/apps/server/src/modules/workspace.ts'
import { closeStorage, createSpace, initStorage, space, withCanvasMutex } from '../../lcos/huabu/apps/server/src/modules/storage/index.ts'
import { executeOnServer, executeOnServerAlreadyLocked } from '../../lcos/huabu/apps/server/src/modules/canvas/canvas-executor.ts'
import { getSpacePreviewScene, SpacePreviewSceneError } from '../../lcos/huabu/apps/server/src/modules/canvas/space-preview-scene.ts'
import { createNodeLifecycle, NodeLifecycleError } from './node-lifecycle.ts'
import { createCoreProtocolRouter } from './core-protocol-router.ts'
import { createLibraryProjection } from './library-projection.ts'
import { createAssemblyLibraryProjection } from './assembly-library-projection.ts'
import { createSpaceProtocol } from './space-protocol.ts'
import { createHeadlessProjectionPort } from './headless-projection-port.ts'
import { Gen2Host } from '../../lcos/apps/web-gen2/src/host/projectionFacade.ts'
import { reconcileExecutionProjection, executionBelongsHere } from '../../lcos/apps/web-gen2/src/spatial/reconcileExecutionProjection.ts'
import { runPresentation, resultSlotPresentation } from '../../lcos/apps/web-gen2/src/presentation/executionPresentation.ts'
import { resolveNativeResultMaterial, NativeResultMaterialConflictError } from './native-result-material.ts'
import { createCoreUpload } from './core-upload.ts'
import { isNativeFileMaterial, nativeFileMaterialMetadata } from './native-file-material.ts'
import { createNativeUploadPlacement } from './native-upload-placement.ts'
import { createRuntimeComposition } from './runtime-composition.ts'
import { createCoreEventStream } from './core-event-stream.ts'
import { createNativeCollectionProjection } from './native-collection-projection.ts'
import { createNativeCollectionFrameProjection } from './native-collection-frame-projection.ts'
import { createNativePileCollectionProjection } from './native-pile-collection-projection.ts'
import { createNativePileCollectionPlacement } from './native-pile-collection-placement.ts'
import { createNativeCollectionSpace } from './native-collection-space.ts'
import { createNativeCollectionSpaceHistory } from './native-collection-space-history.ts'
import { createNativeHistoryProjection } from './native-history-projection.ts'
import { createNativeMaterialPlacement } from './native-material-placement.ts'
import { createNativeMaterialReceive } from './native-material-receive.ts'
import { createNativeMaterialGeometry } from './native-material-geometry.ts'
import { createNativeTextResponseCache } from './native-text-response-cache.ts'

const PROJECT_ID = 'disposable-surface-core-facade'
const SYNTHETIC_PNG_PATH = 'E:/AppMoved/.codex/visualizations/2026/10/12/01a131ff-c4d7-7b41-86a3-c67738f5917b/node-upload-fixture.png'
const SURFACES = [
  { key: 'main', workspaceIndex: 0, name: 'Main / 项目总览', canvasId: 'surface-core-main', textNodeId: 'surface-main-text', imageNodeId: 'surface-main-image', title: 'Main · 项目总览', body: '# Main · 项目总览\n\n整理这份合成项目的 Brief 与下一步。' },
  { key: 'context', workspaceIndex: 1, name: 'Context / 资料现场', canvasId: 'surface-core-context', textNodeId: 'surface-context-text', imageNodeId: 'surface-context-image', title: 'Context · 资料现场', body: '# Context · 资料现场\n\n检查参考图与反馈，材料来自真实 Core FileRecord。' },
  { key: 'workflow', workspaceIndex: 2, name: 'Workflow / 交付现场', canvasId: 'surface-core-workflow', textNodeId: 'surface-workflow-text', imageNodeId: 'surface-workflow-image', title: 'Workflow · 交付现场', body: '# Workflow · 交付现场\n\n确认交付步骤并准备 handoff review。' },
] as const

const ADAPTER = {
  mode: 'surface-core-facade',
  core_connected: true,
  mutations_connected: true,
  fixture_writes_connected: false,
  billing_connected: false,
  source: 'real-local-core-and-huabu',
} as const

const DEFAULT_TEXT_PARAMS = Object.freeze({ model: 'gemini-3.1-flash-lite', provider: 'google' })

type Surface = typeof SURFACES[number]
type JsonRecord = Record<string, any>

class FacadeError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly details?: unknown) {
    super(message)
    this.name = 'FacadeError'
  }
}

const success = (data: unknown, status = 200) => ({
  status,
  body: { code: 0, message: '', msg: '', data, lcos_adapter: ADAPTER },
})

const failure = (status: number, code: string, message: string, details?: unknown) => ({
  status,
  body: { code: status * 100, data: null, message, msg: message, error: { code, message, ...(details === undefined ? {} : { details }) }, lcos_adapter: ADAPTER },
})

function fail(status: number, code: string, message: string): never {
  throw new FacadeError(status, code, message)
}

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(400, 'INVALID_ARGUMENT', label + ' must be an object.')
  return value as JsonRecord
}

function finitePoint(value: unknown, label: string): { x: number; y: number } {
  const point = record(value, label)
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) fail(400, 'INVALID_ARGUMENT', label + ' needs finite x/y.')
  return { x: point.x, y: point.y }
}

function positiveSize(value: unknown, label: string): { width: number; height: number } {
  const size = record(value, label)
  if (!Number.isFinite(size.width) || !Number.isFinite(size.height) || size.width <= 0 || size.height <= 0) {
    fail(400, 'INVALID_ARGUMENT', label + ' needs positive finite width/height.')
  }
  return { width: size.width, height: size.height }
}

const TEXT_PRESENTATION_KEYS = ['lcosTextViewMode', 'lcosTextCollapsedIds', 'lcosTextBeforeMindMapSize'] as const

function validateTextPresentationData(data: JsonRecord): JsonRecord {
  const patch: JsonRecord = {}
  if (Object.hasOwn(data, 'lcosTextViewMode')) {
    if (!['text', 'outline', 'mindmap'].includes(data.lcosTextViewMode)) fail(400, 'INVALID_ARGUMENT', 'lcosTextViewMode must be text, outline, or mindmap.')
    patch.lcosTextViewMode = data.lcosTextViewMode
  }
  if (Object.hasOwn(data, 'lcosTextCollapsedIds')) {
    if (!Array.isArray(data.lcosTextCollapsedIds) || data.lcosTextCollapsedIds.some((id: unknown) => typeof id !== 'string')) {
      fail(400, 'INVALID_ARGUMENT', 'lcosTextCollapsedIds must be an array of strings.')
    }
    patch.lcosTextCollapsedIds = [...data.lcosTextCollapsedIds]
  }
  if (Object.hasOwn(data, 'lcosTextBeforeMindMapSize')) {
    const size = record(data.lcosTextBeforeMindMapSize, 'lcosTextBeforeMindMapSize')
    if (Object.keys(size).sort().join(',') !== 'height,width') fail(400, 'INVALID_ARGUMENT', 'lcosTextBeforeMindMapSize accepts only width and height.')
    patch.lcosTextBeforeMindMapSize = positiveSize(size, 'lcosTextBeforeMindMapSize')
  }
  return patch
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  return relative === '' || (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative))
}

async function readContainedFile(projectRoot: string, filePath: string): Promise<Buffer> {
  const [realProjectRoot, realFilePath] = await Promise.all([realpath(projectRoot), realpath(filePath)])
  if (!isWithin(realProjectRoot, realFilePath)) fail(404, 'FILE_RECORD_NOT_FOUND', 'FileRecord resolves outside the synthetic project root.')
  return readFile(realFilePath)
}

function pngDimensions(bytes: Buffer): { width: number; height: number } | undefined {
  if (bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || bytes.toString('ascii', 12, 16) !== 'IHDR') return undefined
  const width = bytes.readUInt32BE(16)
  const height = bytes.readUInt32BE(20)
  return width > 0 && height > 0 ? { width, height } : undefined
}

function localImageDimensions(bytes: Buffer): { width: number; height: number } | undefined {
  try {
    const dimensions = imageSize(bytes)
    return dimensions.width && dimensions.height ? { width: dimensions.width, height: dimensions.height } : undefined
  } catch { return undefined }
}

function normalizePublicOrigin(value: string | undefined): string {
  const origin = new URL(value || 'http://127.0.0.1:17879')
  if (origin.protocol !== 'http:' || !['127.0.0.1', 'localhost', '::1'].includes(origin.hostname)
    || origin.pathname !== '/' || origin.search || origin.hash) {
    throw new Error('publicOrigin must be an HTTP loopback origin without a path.')
  }
  return origin.origin
}

function syntheticSnapshot(projectRoot: string, fullIntegration = false) {
  const snapshot = structuredClone(createMvpSampleSnapshot(projectRoot))
  snapshot.project = {
    ...snapshot.project,
    id: PROJECT_ID as typeof snapshot.project.id,
    name: 'Surface Core Facade Sample',
    rootPath: projectRoot,
  }

  for (const entity of [...snapshot.scopes, ...snapshot.workspaces, ...snapshot.artifacts, ...snapshot.fileRecords,
    ...snapshot.relations, ...snapshot.notes, ...snapshot.checkpoints]) {
    ;(entity as { projectId: string }).projectId = PROJECT_ID
  }

  const imageArtifactIds = new Set(snapshot.artifacts.filter((artifact) => artifact.kind === 'image').map((artifact) => String(artifact.id)))
  const imageRevisions = snapshot.artifactRevisions.filter((revision) => imageArtifactIds.has(String(revision.artifactId)))
  const imageRevisionIds = new Set(imageRevisions.map((revision) => String(revision.id)))
  const imageFileRecordIds = new Set(imageRevisions.map((revision) => String(revision.fileRecordId)))
  const imageViewIds = new Set(snapshot.artifactViews.filter((view) => imageArtifactIds.has(String(view.artifactId))).map((view) => String(view.id)))
  snapshot.artifacts = snapshot.artifacts.filter((artifact) => !imageArtifactIds.has(String(artifact.id)))
  snapshot.artifactRevisions = snapshot.artifactRevisions.filter((revision) => !imageRevisionIds.has(String(revision.id)))
  snapshot.fileRecords = snapshot.fileRecords.filter((fileRecord) => !imageFileRecordIds.has(String(fileRecord.id)))
  snapshot.artifactViews = snapshot.artifactViews.filter((view) => !imageViewIds.has(String(view.id)))
  snapshot.relations = snapshot.relations.filter((relation) => !(
    relation.sourceEntityType === 'artifact' && imageArtifactIds.has(String(relation.sourceEntityId))
    || relation.targetEntityType === 'artifact' && imageArtifactIds.has(String(relation.targetEntityId))
  ))

  snapshot.workspaces = snapshot.workspaces.map((workspace, index) => {
    const surface = SURFACES[index]
    if (!surface) return { ...workspace, focusedViewIds: workspace.focusedViewIds.filter((id) => !imageViewIds.has(String(id))) }
    return {
      ...workspace,
      focusedViewIds: workspace.focusedViewIds.filter((id) => !imageViewIds.has(String(id))),
      name: surface.name,
      preferredSurface: surface.key,
      canvasId: surface.canvasId,
    }
  })
  if (fullIntegration) {
    const rootScope = snapshot.scopes.find((scope) => scope.kind === 'root')
    if (!rootScope) throw new Error('Synthetic factory must contain its root scope.')
    // Bootstrap only: retain sample Saved Context/Workflow entities without
    // mistaking them for the three root Surface workspaces. Current Gen2's
    // buildSurfaceCanvasMap requires all three root workspaces at rootScope.
    // Existing persisted runtimes are never migrated by this fixture factory.
    snapshot.workspaces = snapshot.workspaces.map(workspace => ({ ...workspace, scopeId: rootScope.id }))
    for (const kind of ['context', 'workflow'] as const) {
      const scopeId = 'scope-surface-core-' + kind
      snapshot.scopes.push({ ...rootScope, id: scopeId as never, parentScopeId: rootScope.id,
        kind, name: kind === 'context' ? '合成 Saved Context' : '合成 Workflow' })
    }
  }

  const checkpoint = snapshot.checkpoints[0]
  if (checkpoint && checkpoint.snapshotJson && typeof checkpoint.snapshotJson === 'object' && !Array.isArray(checkpoint.snapshotJson)) {
    const snapshotJson = checkpoint.snapshotJson as JsonRecord
    checkpoint.snapshotJson = { ...snapshotJson, projectId: PROJECT_ID,
      ...(Array.isArray(snapshotJson.artifactIds) ? { artifactIds: snapshotJson.artifactIds.filter((id: unknown) => !imageArtifactIds.has(String(id))) } : {}) }
  }
  return snapshot
}

function findWorkspaceRoot(runtimeRoot: string): string {
  let current = path.resolve(runtimeRoot)
  while (true) {
    if (path.basename(current) === '.runtime') {
      const candidate = path.dirname(current)
      if (existsSync(path.join(candidate, '.git'))) return candidate
    }
    const parent = path.dirname(current)
    if (parent === current) throw new Error('runtimeRoot must be inside the workspace .runtime directory.')
    current = parent
  }
}

function assertRuntimeRoot(runtimeRoot: string): string {
  const resolved = path.resolve(runtimeRoot)
  const workspaceRoot = findWorkspaceRoot(resolved)
  const allowed = path.join(workspaceRoot, '.runtime') + path.sep
  if (!resolved.toLowerCase().startsWith(allowed.toLowerCase())) {
    throw new Error('Surface Core facade runtime must stay under the workspace .runtime directory.')
  }
  return resolved
}

function nodeSize(node: JsonRecord): { width: number; height: number } {
  const width = node.measured?.width ?? node.width ?? node.style?.width ?? node.size?.width ?? 300
  const height = node.measured?.height ?? node.height ?? node.style?.height ?? node.size?.height ?? 270
  return { width: Number(width), height: Number(height) }
}

function tapNowNode(node: JsonRecord, canvasId: string, coreBody: string | undefined, coreTitle: string | undefined, coreRevisionId: string | undefined,
  imageSrc: string, imageDimensions?: { width: number; height: number }, coreRef?: unknown, includeTextPresentation = false, nativeTextPilot = false) {
  const image = node.type === 'image'
  const widthHeight = nodeSize(node)
  const data = record(node.data ?? {}, 'node.data')
  const title = String(coreTitle ?? data.title ?? data.label ?? (image ? '合成参考图' : '合成文本'))
  // The original O8 history captures the read DTO. Give its default text face
  // an explicit value in this opt-in mode: MERGE cannot undo by omission.
  const textPresentation = includeTextPresentation && !image
    ? { ...(nativeTextPilot ? { lcosTextViewMode: 'text' } : {}), ...validateTextPresentationData(data) } : {}
  return {
    id: String(node.id),
    canvas_id: canvasId,
    type: image ? 'image' : 'text',
    position: finitePoint(node.position ?? { x: 0, y: 0 }, 'node.position'),
    measured: widthHeight,
    ...(image || coreRevisionId === undefined ? {} : { lcos_revision_id: coreRevisionId }),
    data: image
      ? { id: String(node.id), title, src: imageSrc, type: 'upload', prompt: '', defaultOpenGallery: false, ...(coreRef ? { lcos_ref: coreRef } : {}),
        ...(imageDimensions ? { __metadata: { url: imageSrc, width: imageDimensions.width, height: imageDimensions.height } } : {}) }
      : { id: String(node.id), title, text: coreBody ?? String(data.content ?? ''), content: coreBody ?? String(data.content ?? ''), prompt: '',
        params: { ...DEFAULT_TEXT_PARAMS }, ...textPresentation, ...(coreRef ? { lcos_ref: coreRef } : {}) },
  }
}

function unwrapApplied(result: any): void {
  const failed = Array.isArray(result?.results) ? result.results.find((item: any) => item.applied !== true) : undefined
  if (failed) fail(409, 'SPATIAL_WRITE_REJECTED', failed.message || failed.reason || 'Huabu rejected the command batch.')
}

export async function startSurfaceCoreFacade({ runtimeRoot, publicOrigin, fullIntegration = false, nativeCollectionPilot = false, nativeTextPilot = false, nativeAssemblyPilot = false, nativeRailPilot = false }: {
  runtimeRoot: string; publicOrigin?: string; fullIntegration?: boolean; nativeCollectionPilot?: boolean; nativeTextPilot?: boolean; nativeAssemblyPilot?: boolean; nativeRailPilot?: boolean
}) {
  if (nativeCollectionPilot && !fullIntegration) {
    throw new Error('Native Collection pilot requires the explicit isolated full-integration runtime.')
  }
  const root = assertRuntimeRoot(runtimeRoot)
  const configuredCaptureRoot = process.env.LCOS_CAPTURE_STAGING_ROOT
  const origin = normalizePublicOrigin(publicOrigin)
  await mkdir(root, { recursive: true })

  const oldHuabuDir = process.env.HUABU_DATA_DIR
  process.env.HUABU_DATA_DIR = path.join(root, 'huabu-private')
  let storageReady = false
  let server: ReturnType<typeof createLocalCoreServer> | undefined
  let coreEventStream: ReturnType<typeof createCoreEventStream> | undefined
  let serverStarted = false
  const repository = new SqliteMetadataRepository(path.join(root, 'core.sqlite'), { disposableOnly: true })

  try {
    const projectRoot = path.join(root, 'synthetic-project')
    await mkdir(projectRoot, { recursive: true })

    const isNewProject = !repository.getProject(PROJECT_ID)
    if (isNewProject) {
      const snapshot = syntheticSnapshot(projectRoot, fullIntegration)
      repository.save(snapshot)
    }

    const project = repository.getProject(PROJECT_ID)
    if (!project) throw new Error('Synthetic Surface Core project was not persisted.')
    const workspaces = repository.getWorkspaces(PROJECT_ID)
    if (workspaces.length !== 3 || new Set(workspaces.map((workspace) => workspace.preferredSurface)).size !== 3
      || new Set(workspaces.map((workspace) => workspace.canvasId)).size !== 3) {
      throw new Error('Synthetic project must resolve to three distinct Core Workspaces and canvases.')
    }

    setWorkspacePath(path.join(root, 'huabu-workspace'))
    const storage = await initStorage({ structured: { kind: 'disk' }, blobs: { kind: 'disk' } })
    storageReady = true
    await storage.structured.spaces().ensureWorld()

    const newProject = repository.getProject(PROJECT_ID)
    if (!newProject) throw new Error('Synthetic project disappeared during bootstrap.')
    const catalog = new ExplicitProjectCatalog([{ id: newProject.id, name: newProject.name, rootPath: newProject.rootPath, graphVersion: newProject.graphVersion }])
    const runtime = fullIntegration ? createRuntimeComposition(repository) : undefined
    server = createLocalCoreServer({ metadataRepository: repository, ...runtime?.coreServerOptions, catalog, port: 0,
      previewCacheRoot: path.join(root, 'preview-cache'), agentletsRoot: path.join(root, 'agentlets'), allowedOrigins: [origin] })
    const address = await server.start()
    serverStarted = true
    const coreOrigin = 'http://' + address.host + ':' + address.port
    if (fullIntegration) coreEventStream = createCoreEventStream({ coreOrigin, projectId: PROJECT_ID })
    const artifacts = new CoreArtifactClient(new HttpClient({ baseUrl: coreOrigin }))

    if (isNewProject) {
      const png = await readFile(SYNTHETIC_PNG_PATH)
      if (!pngDimensions(png)) throw new Error('The authorized synthetic image fixture is not a valid PNG.')

      for (const surface of SURFACES) {
        const workspace = workspaces.find((item) => item.preferredSurface === surface.key)
        if (!workspace?.canvasId || !workspace.scopeId) throw new Error('Core Workspace for ' + surface.key + ' is incomplete.')
        const existing = await space(workspace.canvasId).read()
        if (!existing) await createSpace(workspace.canvasId, surface.name)
        const created = await executeOnServer({ canvasId: workspace.canvasId, commands: [{ type: 'CREATE_NODES', nodes: [
          { id: surface.imageNodeId, nodeType: 'image', position: { x: 120, y: 100 }, size: { width: 360, height: 240 }, data: { label: '合成参考图' } },
          { id: surface.textNodeId, nodeType: 'note', position: { x: 540, y: 110 }, size: { width: 360, height: 280 }, data: { label: surface.title, content: surface.body } },
        ] }], originator: { source: 'user' }, publish: false })
        unwrapApplied(created)

        const imported = await artifacts.importCopiedFile(PROJECT_ID, { file: new File([new Uint8Array(png)], '本地合成图.png', { type: 'image/png' }),
          importRequestId: 'surface-core-facade-image-' + surface.key, scopeId: String(workspace.scopeId), position: { x: 120, y: 100 },
          nativeCarrier: { canvasId: workspace.canvasId, spatialId: surface.imageNodeId, size: { width: 360, height: 240 } } })
        const imageFile = repository.getFileRecord(String(imported.revision.fileRecordId))
        if (!imageFile || String(imageFile.projectId) !== PROJECT_ID) throw new Error('Core image import did not persist a synthetic FileRecord for ' + surface.key + '.')
        const fileSrc = origin + '/api/surface-core/file-records/' + encodeURIComponent(String(imageFile.id)) + '/content'
        unwrapApplied(await executeOnServer({ canvasId: workspace.canvasId, commands: [{ type: 'MERGE_NODE_DATA', patches: [
          { nodeId: surface.imageNodeId, patch: { src: fileSrc } },
        ] }], originator: { source: 'user' }, publish: false }))

        await createTextArtifact(repository, PROJECT_ID as never, { title: surface.title, body: surface.body,
          scopeId: String(workspace.scopeId), workspaceId: String(workspace.id), nativeBinding: { canvasId: workspace.canvasId, spatialId: surface.textNodeId } })
      }
    }

    const bootstrapProblems: string[] = []
    for (const surface of SURFACES) {
      const workspace = workspaces.find((item) => item.preferredSurface === surface.key)
      if (!workspace?.canvasId) {
        bootstrapProblems.push(surface.key + ': missing Core Workspace canvasId')
        continue
      }
      const scene = await space(workspace.canvasId).read()
      if (fullIntegration && !isNewProject) {
        // A legitimately edited scene need not retain its initial sample nodes.
        // Still reject missing spatial storage and ambiguous/foreign bindings.
        if (!scene) bootstrapProblems.push(surface.key + ': missing persisted Huabu space')
        const bindings = repository.getProjectionBindings(PROJECT_ID).filter((item) => item.canvasId === workspace.canvasId && item.spatialKind === 'node')
        if (new Set(bindings.map((item) => item.spatialId)).size !== bindings.length) bootstrapProblems.push(surface.key + ': ambiguous node bindings')
        for (const binding of bindings) {
          const artifactId = binding.entityType === 'artifact' ? binding.entityId
            : binding.entityType === 'view' ? String(repository.getArtifactView(binding.entityId)?.artifactId ?? '') : undefined
          if (artifactId && String(repository.getArtifact(artifactId)?.projectId) !== PROJECT_ID) bootstrapProblems.push(surface.key + ': foreign or missing material')
        }
        continue
      }
      const spatialIds = new Set((scene?.state?.nodes ?? []).map((node: JsonRecord) => String(node.id)))
      if (!spatialIds.has(surface.imageNodeId)) bootstrapProblems.push(surface.key + ': missing Huabu image node ' + surface.imageNodeId)
      if (!spatialIds.has(surface.textNodeId)) bootstrapProblems.push(surface.key + ': missing Huabu text node ' + surface.textNodeId)

      const bindings = repository.getProjectionBindings(PROJECT_ID).filter((item) => item.canvasId === workspace.canvasId && item.spatialKind === 'node')
      const imageBindings = bindings.filter((item) => item.spatialId === surface.imageNodeId)
      const textBindings = bindings.filter((item) => item.spatialId === surface.textNodeId)
      const imageBinding = imageBindings.length === 1 ? imageBindings[0] : undefined
      const imageEntityId = imageBinding?.entityType === 'artifact' ? imageBinding.entityId
        : imageBinding?.entityType === 'view' ? String(repository.getArtifactView(imageBinding.entityId)?.artifactId ?? '') : undefined
      const imageEntity = imageEntityId ? repository.getArtifact(imageEntityId) : undefined
      const imageRevision = imageEntity?.currentRevisionId ? repository.getArtifactRevision(String(imageEntity.currentRevisionId)) : undefined
      const imageFile = imageRevision ? repository.getFileRecord(String(imageRevision.fileRecordId)) : undefined
      if (!imageEntity || String(imageEntity.projectId) !== PROJECT_ID || imageEntity.kind !== 'image' || !imageRevision || !imageFile
        || String(imageFile.projectId) !== PROJECT_ID) {
        bootstrapProblems.push(surface.key + ': missing unique Core image Artifact binding')
      }
      if (textBindings.length !== 1 || textBindings[0]!.entityType !== 'artifact') {
        bootstrapProblems.push(surface.key + ': missing unique Core text Artifact binding')
      } else {
        try {
          const text = await readCanvasText(repository, PROJECT_ID, { canvasId: workspace.canvasId, spatialId: surface.textNodeId })
          if (!text) bootstrapProblems.push(surface.key + ': Core text binding has no canonical body')
        } catch (error) {
          bootstrapProblems.push(surface.key + ': Core text binding is unreadable: ' + (error instanceof Error ? error.message : String(error)))
        }
      }
    }
    if (bootstrapProblems.length) throw new Error('Surface Core bootstrap is incomplete; existing data was preserved for inspection: ' + bootstrapProblems.join('; '))

    const core = { repository, server, origin: coreOrigin, projectId: PROJECT_ID,
      databasePath: repository.databasePath, project: repository.getProject(PROJECT_ID)! }
    const spatial = {
      read: async (canvasId: string) => {
        if (!workspaces.some((workspace) => workspace.canvasId === canvasId)) fail(404, 'CANVAS_NOT_FOUND', 'No Core Workspace owns this canvas.')
        return space(canvasId).read()
      },
      execute: async (canvasId: string, commands: unknown[]) => {
        if (!workspaces.some((workspace) => workspace.canvasId === canvasId)) fail(404, 'CANVAS_NOT_FOUND', 'No Core Workspace owns this canvas.')
        return executeOnServer({ canvasId, commands: commands as never[], originator: { source: 'user' }, publish: false })
      },
      // Read, plan, validate, and commit under the existing spatial owner lock.
      // This is private coordination, not a public arbitrary-command endpoint.
      withCanvasLock: async <T>(canvasId: string, operation: (locked: {
        read: () => Promise<any>; execute: (commands: unknown[]) => Promise<any>
      }) => Promise<T>): Promise<T> => {
        if (!workspaces.some((workspace) => workspace.canvasId === canvasId)) fail(404, 'CANVAS_NOT_FOUND', 'No Core Workspace owns this canvas.')
        return withCanvasMutex(canvasId, () => operation({
          read: () => space(canvasId).read(),
          execute: (commands) => executeOnServerAlreadyLocked({ canvasId, commands: commands as never[],
            originator: { source: 'user' }, publish: false }),
        }))
      },
    }

    const lifecycle = createNodeLifecycle({ repository, projectId: PROJECT_ID, spatial, publicOrigin: origin, coreOrigin,
      workspaceForCanvas: (canvasId) => repository.getWorkspaces(PROJECT_ID).find((workspace) => workspace.canvasId === canvasId) })
    const coreProtocol = createCoreProtocolRouter({ coreOrigin, projectId: PROJECT_ID, nativeCollectionTitle: nativeCollectionPilot,
      isCaptureMaterializeInScope: async (captureIds) => {
        // Staging is system-level, not project-owned. The explicit destination
        // is checked by the router; this experiment only enables its own blobs,
        // never an arbitrary filesystem source or a remote Capture import.
        if (!configuredCaptureRoot || !isWithin(root, path.resolve(configuredCaptureRoot))) return false
        try {
          const [realRuntime, realBlobs] = await Promise.all([realpath(root), realpath(configuredCaptureRoot)])
          if (!isWithin(realRuntime, realBlobs)) return false
          for (const id of captureIds) {
            const item = repository.getCaptureStagingItem(id)
            if (!item || item.resolvedProjectId !== undefined && item.resolvedProjectId !== PROJECT_ID) return false
            const blob = /^blob:([a-f0-9]{64})$/i.exec(item.payloadRef)?.[1]
            if (!blob || !isWithin(realBlobs, await realpath(path.join(realBlobs, blob)))) return false
          }
          return true
        } catch { return false }
      },
      isScopeOwned: (scopeId) => repository.getScopes(PROJECT_ID).some((scope) => String(scope.id) === scopeId),
      isWorkspaceScopeOwned: (workspaceId, scopeId) => {
        const workspace = repository.getWorkspace(workspaceId)
        return String(workspace?.projectId ?? '') === PROJECT_ID && String(workspace?.scopeId ?? '') === scopeId
      },
      isResultSlotOwned: (slotId) => repository.getResultSlot(slotId)?.projectId === PROJECT_ID,
      isRunOwned: (runId) => String(repository.getRun(runId)?.projectId ?? '') === PROJECT_ID,
      isArtifactReturnOwned: (returnId) => {
        const returned = repository.getArtifactReturn(returnId)
        return returned !== undefined && String(repository.getRun(String(returned.runId))?.projectId ?? '') === PROJECT_ID
      },
      isArtifactOwned: (artifactId) => String(repository.getArtifact(artifactId)?.projectId ?? '') === PROJECT_ID,
      isArtifactSourceInScope: async (artifactId) => {
        const source = repository.getArtifactSourcePath(artifactId)
        if (!source || source.isUrl || !path.isAbsolute(source.path)) return false
        try {
          const [realRuntime, realSource] = await Promise.all([realpath(root), realpath(source.path)])
          return isWithin(realRuntime, realSource)
        } catch { return false }
      },
      isCollectionOwned: (collectionId) => String(repository.getCollection(collectionId)?.projectId ?? '') === PROJECT_ID,
      isRevisionOwned: (revisionId) => {
        const revision = repository.getArtifactRevision(revisionId)
        return revision !== undefined && String(repository.getArtifact(String(revision.artifactId))?.projectId ?? '') === PROJECT_ID
      },
      isFileContentInScope: async (fileRecordId) => {
        const file = repository.getFileRecord(fileRecordId), project = repository.getProject(PROJECT_ID)
        if (!file || !project || String(file.projectId) !== PROJECT_ID) return false
        try {
          const [realRoot, realFile] = await Promise.all([realpath(project.rootPath), realpath(file.observedPath)])
          return isWithin(realRoot, realFile)
        } catch { return false }
      } })
    const libraryProjection = (nativeAssemblyPilot ? createAssemblyLibraryProjection : createLibraryProjection)({ repository, projectId: PROJECT_ID, publicOrigin: origin })
    const nativeHistory = createNativeHistoryProjection({ repository, projectId: PROJECT_ID, publicOrigin: origin })
    const spaceProtocol = createSpaceProtocol({ repository, projectId: PROJECT_ID, spatial, coreOrigin })
    const upload = fullIntegration ? createCoreUpload({ repository, projectId: PROJECT_ID, coreOrigin, publicOrigin: origin, runtimeRoot: root }) : undefined
    const projectionHosts = new Map<string, Gen2Host>()
    const rendererDefaults: JsonRecord = { loading: false, taskInfo: null, options: [], historyVariantsHidden: false,
      historyVariantCount: 1, historyLocalQueues: [], historyLocalQueueMetadata: [], historyLocalQueueResourceMetadata: [] }
    const translateRendererData = (value: unknown, nativeNodeType?: string) => {
      const data = { ...record(value, 'data') }
      if (!fullIntegration) return data
      // The original copier serializes these neutral renderer values. They do
      // not imply a Core job, generation history, or durable queue. Non-neutral
      // values stay unsupported instead of being fabricated as local execution.
      for (const [key, expected] of Object.entries(rendererDefaults)) {
        if (!Object.hasOwn(data, key)) continue
        if (JSON.stringify(data[key]) !== JSON.stringify(expected)) fail(501, 'RENDERER_STATE_NOT_CONNECTED', key + ' has no connected Core/presentation owner.')
        delete data[key]
      }
      if (nativeNodeType === 'text' && Object.hasOwn(data, 'type')) {
        // The original Add menu marks an empty text editor as "generate".
        // This renderer discriminator is not a job or an execution request.
        if (data.type !== 'generate' && !(data.type === 'pure' && data.lcos_file_ref !== undefined))
          fail(501, 'TEXT_RENDERER_KIND_NOT_CONNECTED', 'This renderer discriminator has no confirmed text or file carrier.')
        delete data.type
      }
      return data
    }
    const projectionHost = (canvasId: string) => {
      if (!workspaces.some((workspace) => workspace.canvasId === canvasId)) fail(404, 'CANVAS_NOT_FOUND', 'No Core Workspace owns this projection target.')
      let host = projectionHosts.get(canvasId)
      if (!host) {
        host = new Gen2Host({ projectId: PROJECT_ID, http: new HttpClient({ baseUrl: coreOrigin }),
          rfs: createHeadlessProjectionPort({ canvasId, coreOrigin, ...spatial }) })
        projectionHosts.set(canvasId, host)
      }
      return host
    }
    const collectionFrameProjection = createNativeCollectionFrameProjection({ repository, projectId: PROJECT_ID, fail,
      includeCollectionRef: nativeCollectionPilot })
    const collectionProjection = createNativeCollectionProjection({ repository, projectId: PROJECT_ID, spatial, projectionHost,
      projectParent: collectionFrameProjection.parent, fail })
    const nativePileProjection = nativeCollectionPilot
      ? createNativePileCollectionProjection({ repository, projectId: PROJECT_ID, spatial,
        projectParent: collectionFrameProjection.parent, fail }) : undefined
    const nativePilePlacement = nativeCollectionPilot
      ? createNativePileCollectionPlacement({ repository, projectId: PROJECT_ID, spatial, fail,
        projectPile: (canvasId, carrier, nodes) => nativePileProjection!.node(canvasId, carrier, nodes),
        receiveCollection: (canvasId, collectionId, targetRef) => projectionHost(canvasId).assembly.apply(PROJECT_ID,
          { schemaVersion: 1, projectId: PROJECT_ID, sourceRefs: [{ kind: 'collection', id: collectionId }], targetRef }),
        projectCollection: async (canvasId, input, assertCurrent) => {
          const workspace = repository.getWorkspaces(PROJECT_ID).find(owner => owner.canvasId === canvasId)!
          const sourceRef = { projectId: PROJECT_ID, canvasId, workspaceId: String(workspace.id), collectionId: input.entityId }
          const host = new Gen2Host({ projectId: PROJECT_ID, http: new HttpClient({ baseUrl: coreOrigin }),
            rfs: createHeadlessProjectionPort({ canvasId, coreOrigin, read: spatial.read,
              execute: (id, commands) => {
                // The ordinary executor assigns missing IDs before taking its
                // mutex. Its already-locked entry expects those original IDs.
                const identified = commands.map(command => {
                  const value = command as JsonRecord
                  return value.type === 'CREATE_NODES' ? { ...value,
                    nodes: value.nodes.map((node: JsonRecord) => ({ ...node, id: node.id ?? createId('node'),
                      data: { ...node.data, lcos_collection_ref: sourceRef } })) } : value
                })
                return spatial.withCanvasLock(id, async locked => {
                  assertCurrent()
                  const saved = await locked.read()
                  assertCurrent()
                  if (!Array.isArray(saved?.state?.nodes)) fail(503, 'COLLECTION_CANVAS_UNAVAILABLE', 'The original Canvas cannot confirm first placement.')
                  // This is the canonical source echo on the original carrier,
                  // not a binding or a second truth. It survives a CREATE whose
                  // subsequent Core binding response failed, so another queued
                  // creator cannot mistake that carrier for an empty Canvas.
                  const echoed = saved.state.nodes.some((node: JsonRecord) => {
                    const ref = node.data?.lcos_collection_ref
                    return ref?.projectId === sourceRef.projectId && ref.canvasId === sourceRef.canvasId
                      && ref.workspaceId === sourceRef.workspaceId && ref.collectionId === sourceRef.collectionId
                  })
                  const bound = repository.getProjectionBindings(PROJECT_ID).some(binding => binding.canvasId === canvasId
                    && binding.spatialKind === 'node' && binding.entityType === 'collection' && binding.entityId === input.entityId)
                  if (echoed || bound) fail(409, 'COLLECTION_PLACEMENT_UNCONFIRMED', 'An original carrier already exists or remains unconfirmed. Inspect it instead of repeating CREATE.')
                  return locked.execute(identified)
                })
              } }) })
          return host.nodeProjector.projectEntity(input)
        } }) : undefined
    const collectionSpace = createNativeCollectionSpace({ repository, projectId: PROJECT_ID, spatial, projectionHost, fail,
      ...(nativeCollectionPilot ? { mode: 'native-pile' as const,
        nativeMemberNodeIds: (canvasId: string, collectionId: string, nodes: readonly JsonRecord[]) =>
          nativePileProjection!.memberNodeIds(canvasId, collectionId, nodes),
        nativeUnprojectedMemberCount: (canvasId: string, collectionId: string, nodes: readonly JsonRecord[]) =>
          nativePileProjection!.unprojectedMemberCount(canvasId, collectionId, nodes) } : {}) })
    const referenceForNode = async (canvasId: string, nodeId: string) => {
      const snapshot = await spatial.read(canvasId)
      const node = snapshot?.state?.nodes?.find((item: JsonRecord) => String(item.id) === nodeId)
      return node ? lifecycle.referenceForNode(canvasId, node) : undefined
    }

    const canonicalText = async (canvasId: string, nodeId: string) => {
      const binding = repository.getProjectionBindings(PROJECT_ID).find((item) => item.canvasId === canvasId && item.spatialKind === 'node' && item.spatialId === nodeId)
      if (binding?.entityType === 'artifact' && isNativeFileMaterial(repository.getArtifact(binding.entityId)?.kind)) return null
      if (binding?.entityType !== 'view') return readCanvasText(repository, PROJECT_ID, { canvasId, spatialId: nodeId })
      const ref = await referenceForNode(canvasId, nodeId)
      if (!ref) return null
      const material = lifecycle.resolveReference(ref, canvasId)
      if (material.nodeType !== 'text' || isNativeFileMaterial(material.artifact.kind)) return null
      const bytes = await readContainedFile(repository.getProject(PROJECT_ID)!.rootPath, material.file.observedPath)
      return { canvasId, spatialId: nodeId, artifactId: String(material.artifact.id), viewId: String(material.view.id),
        revisionId: String(material.revision.id), body: bytes.toString('utf8'), title: material.artifact.title }
    }

    const validateRefEcho = async (canvasId: string, nodeId: string, value: unknown) => {
      if (value === undefined) return
      if (!fullIntegration) fail(501, 'NODE_REFERENCE_NOT_CONNECTED', 'References are only accepted in full integration mode.')
      const actual = await referenceForNode(canvasId, nodeId)
      const echoed = record(value, 'lcos_ref')
      if (!actual || ['version', 'entityType', 'entityId', 'artifactId', 'artifactViewId'].some((key) => echoed[key] !== (actual as JsonRecord)[key])
        || Object.keys(echoed).some((key) => !['version', 'entityType', 'entityId', 'artifactId', 'artifactViewId', 'revisionId'].includes(key))
        || typeof echoed.revisionId !== 'string' || String(repository.getArtifactRevision(echoed.revisionId)?.artifactId) !== actual.artifactId) {
        fail(409, 'CORE_REFERENCE_MISMATCH', 'Renderer metadata cannot replace this node\'s Core identity.')
      }
    }

    const imageProjection = (canvasId: string, spatialId: string) => {
      const binding = repository.getProjectionBindings(PROJECT_ID).find((item) => item.canvasId === canvasId
        && item.spatialKind === 'node' && item.spatialId === spatialId)
      const artifactId = binding?.entityType === 'artifact' ? binding.entityId
        : binding?.entityType === 'view' ? String(repository.getArtifactView(binding.entityId)?.artifactId ?? '') : ''
      const artifact = artifactId ? repository.getArtifact(artifactId) : undefined
      const view = binding?.entityType === 'view' ? repository.getArtifactView(binding.entityId) : undefined
      const revisionId = view?.revisionId ?? artifact?.currentRevisionId
      const revision = revisionId ? repository.getArtifactRevision(String(revisionId)) : undefined
      const fileRecord = revision ? repository.getFileRecord(String(revision.fileRecordId)) : undefined
      if (!artifact || String(artifact.projectId) !== PROJECT_ID || artifact.kind !== 'image' || !revision || !fileRecord
        || String(fileRecord.projectId) !== PROJECT_ID) return undefined
      const src = origin + '/api/surface-core/file-records/' + encodeURIComponent(String(fileRecord.id)) + '/content'
      return { artifact, revision, fileRecord, src }
    }
    const matchesImageSource = (value: unknown, image: NonNullable<ReturnType<typeof imageProjection>>) => {
      if (value === image.src) return true
      if (!fullIntegration || typeof value !== 'string') return false
      // An asynchronous donor metadata callback can retain the exact upload URL
      // after the confirmed import changed the node to its canonical content URL.
      // Resolve only that recorded receipt and verify all selected Core identities.
      const receipt = upload?.resolveReceiptByUrl(value)
      return !!receipt && receipt.fileRecordId === String(image.fileRecord.id)
        && receipt.lcos_ref.artifactId === String(image.artifact.id) && receipt.lcos_ref.revisionId === String(image.revision.id)
    }

    // Read-only projection of original execution/material identities. This is
    // not another node producer: geometry and carrier ids remain in Huabu.
    const executionNode = (canvasId: string, node: JsonRecord) => {
      const binding = repository.getProjectionBindings(PROJECT_ID).find((item) => item.canvasId === canvasId
        && item.spatialKind === 'node' && item.spatialId === String(node.id))
      if (!binding || !['run', 'result-slot'].includes(binding.entityType)) return undefined
      const owners = repository.getWorkspaces(PROJECT_ID).filter((item) => item.canvasId === canvasId)
      if (owners.length !== 1) fail(409, 'EXECUTION_WORKSPACE_AMBIGUOUS', 'The execution canvas must have one exact Core Workspace.')
      const workspace = owners[0]!
      const snapshot = repository.getProjectExecutionProjection(PROJECT_ID)
      const entity = binding.entityType === 'run' ? snapshot.runs.find((item) => item.id === binding.entityId)
        : snapshot.resultSlots.find((item) => item.id === binding.entityId)
      if (!entity || !executionBelongsHere(entity, workspace)) fail(409, 'EXECUTION_REFERENCE_MISMATCH', 'The projected execution identity no longer belongs to this worksite.')
      const facts = binding.entityType === 'run' ? runPresentation(entity as typeof snapshot.runs[number])
        : resultSlotPresentation(entity as typeof snapshot.resultSlots[number], snapshot)
      return { id: String(node.id), canvas_id: canvasId, type: 'lcos-execution', position: node.position, measured: nodeSize(node),
        data: { id: String(node.id), title: facts.title,
          lcos_execution_ref: { projectId: PROJECT_ID, canvasId, workspaceId: String(workspace.id), entityType: binding.entityType, entityId: binding.entityId },
          lcos_execution_facts: facts } }
    }

    const resultMaterialNode = async (canvasId: string, node: JsonRecord) => {
      const material = resolveNativeResultMaterial({ repository, projectId: PROJECT_ID, canvasId, spatialId: String(node.id) })
      if (!material) return undefined
      const { artifact, view, revision, file, slot } = material
      const owners = repository.getWorkspaces(PROJECT_ID).filter((item) => item.canvasId === canvasId)
      if (owners.length !== 1) fail(409, 'RESULT_WORKSPACE_AMBIGUOUS', 'The material canvas must have one exact Core Workspace.')
      const workspace = owners[0]!
      const bytes = await readContainedFile(repository.getProject(PROJECT_ID)!.rootPath, file.observedPath)
      const kind = artifact.kind
      const text = ['markdown', 'text'].includes(kind) ? bytes.toString('utf8') : undefined
      const dimensions = kind === 'image' ? localImageDimensions(bytes) : undefined
      if (text === undefined && !dimensions) fail(501, 'RESULT_MATERIAL_KIND_NOT_CONNECTED', 'Only verified image bytes and Markdown/text accepted materials have a native body in this adapter.')
      const facts = { entityType: 'artifact', entityId: String(artifact.id), title: artifact.title, artifactKind: kind,
        managed: artifact.managed, availability: artifact.availability, currentRevisionId: String(artifact.currentRevisionId ?? ''),
        presentedRevisionId: String(revision.id), artifactViewId: String(view.id), artifactViewReferenceKind: view.referenceKind,
        fileRecordId: String(file.id), mimeType: file.mimeType, canvasTextEditable: false,
        revisionStatus: revision.status, ...(revision.runId ? { sourceRunId: String(revision.runId) } : {}) }
      return { id: String(node.id), canvas_id: canvasId, type: 'lcos-result-material', position: node.position, measured: nodeSize(node),
        data: { id: String(node.id), title: artifact.title,
          ...(text === undefined ? { src: origin + '/api/surface-core/file-records/' + encodeURIComponent(String(file.id)) + '/content', __metadata: dimensions }
            : { text, content: text }),
          lcos_ref: { version: 1, entityType: 'artifact', entityId: String(artifact.id), artifactId: String(artifact.id),
            artifactViewId: String(view.id), revisionId: String(revision.id) },
          lcos_result_ref: { projectId: PROJECT_ID, canvasId, workspaceId: String(workspace.id), slotId: slot.id,
            artifactId: String(artifact.id), artifactViewId: String(view.id), revisionId: String(revision.id) },
          lcos_result_facts: facts } }
    }

    // One existing DTO reader for both persisted Canvas GET and a read-only
    // Collection plan. A planned snapshot is never saved by this projection.
    const projectNativeNodes = async (canvasId: string, snapshot: JsonRecord): Promise<JsonRecord[]> => {
      const workspace = repository.getWorkspaces(PROJECT_ID).find(item => item.canvasId === canvasId)
      if (!workspace) fail(404, 'CANVAS_NOT_FOUND', 'No Core Workspace owns this canvas ID.')
      const sourceNodes = snapshot.state?.nodes ?? []
      const nodes: JsonRecord[] = []
      for (const node of sourceNodes) {
        const nativeParent = fullIntegration ? collectionFrameProjection.parent(canvasId, node, sourceNodes) : {}
        if (fullIntegration && node.type === 'frame') {
          nodes.push(collectionFrameProjection.frame(canvasId, node, sourceNodes)!)
          continue
        }
        const binding = repository.getProjectionBindings(PROJECT_ID).find(item => item.canvasId === canvasId
          && item.spatialKind === 'node' && item.spatialId === node.id)
        if (fullIntegration && binding?.entityType === 'conversation') {
          const conversation = repository.getConnectedConversation(PROJECT_ID, binding.entityId)
          if (!conversation || conversation.conversationRef.startsWith('pending-')) {
            fail(409, 'CONVERSATION_IDENTITY_UNAVAILABLE', 'This projection no longer resolves to a confirmed Core conversation.')
          }
          nodes.push({ id: String(node.id), canvas_id: canvasId, type: 'lcos-conversation', position: node.position,
            measured: nodeSize(node), ...nativeParent, data: { id: String(node.id), title: conversation.label,
              lcos_conversation_ref: { projectId: PROJECT_ID, connectedConversationId: conversation.id, canvasId, workspaceId: String(workspace.id) },
              lcos_conversation_state: { isRunning: conversation.isRunning, waitingReason: conversation.waitingReason, provider: conversation.provider } } })
          continue
        }
        if (fullIntegration) {
          const collection = nativeCollectionPilot
            ? nativePileProjection!.node(canvasId, node, sourceNodes)
            : collectionProjection.node(canvasId, node, sourceNodes)
          if (collection) { nodes.push({ ...collection, ...nativeParent }); continue }
          const execution = executionNode(canvasId, node)
          if (execution) { nodes.push({ ...execution, ...nativeParent }); continue }
          const material = await resultMaterialNode(canvasId, node)
          if (material) { nodes.push({ ...material, ...nativeParent }); continue }
        }
        if (fullIntegration && ['artifact', 'view'].includes(String(binding?.entityType))) {
          const reference = await referenceForNode(canvasId, String(node.id))
          const material = reference ? lifecycle.resolveReference(reference, canvasId) : undefined
          if (material && isNativeFileMaterial(material.artifact.kind)) {
            nodes.push({ id: String(node.id), canvas_id: canvasId, type: 'text', position: node.position,
              measured: nodeSize(node), ...nativeParent, data: { id: String(node.id), title: material.artifact.title,
                lcos_ref: reference, lcos_file_ref: nativeFileMaterialMetadata(material) } })
            continue
          }
        }
        let canonicalBody: string | undefined
        let canonicalTitle: string | undefined
        let canonicalRevisionId: string | undefined
        if (node.type !== 'image' && ['artifact', 'view'].includes(String(binding?.entityType))) {
          const text = await canonicalText(canvasId, String(node.id))
          canonicalBody = text?.body
          canonicalTitle = text?.title
          canonicalRevisionId = text?.revisionId
        }
        const image = node.type === 'image' ? imageProjection(canvasId, String(node.id)) : undefined
        if (node.type === 'image') canonicalTitle = image?.artifact.title
        const bytes = image ? await readContainedFile(repository.getProject(PROJECT_ID)!.rootPath, image.fileRecord.observedPath) : undefined
        nodes.push({ ...tapNowNode(node, canvasId, canonicalBody, canonicalTitle, canonicalRevisionId, image?.src ?? '',
          bytes ? localImageDimensions(bytes) : undefined, fullIntegration ? await referenceForNode(canvasId, String(node.id)) : undefined, fullIntegration, nativeTextPilot), ...nativeParent })
      }
      // Original O8 snapshots retain this derived working-set evidence. Core
      // still owns the row; undo must freshly verify it before touching it.
      return nodes.map(node => {
        const ref = node.data?.lcos_ref
        if (!ref || typeof ref.artifactViewId !== 'string') return node
        const view = repository.getArtifactView(ref.artifactViewId)
        if (!view || String(view.artifactId) !== ref.artifactId || String(view.scopeId) !== String(workspace.scopeId)) return node
        const member = repository.listWorkspaceMembers(workspace.id).find(row => String(row.artifactViewId) === ref.artifactViewId)
        if (!member) return node
        return { ...node, data: { ...node.data, lcos_workspace_membership: { workspaceId: String(workspace.id),
          viewId: ref.artifactViewId, addedAt: member.addedAt, addedBy: member.addedBy } } }
      })
    }
    const collectionSpaceHistory = createNativeCollectionSpaceHistory({ repository, projectId: PROJECT_ID,
      spatial, collectionSpace, projectNativeNodes, fail, nativeTapNowGroupBounds: nativeCollectionPilot })
    const materialPlacement = createNativeMaterialPlacement({ repository, projectId: PROJECT_ID,
      projectionHost, spatial, projectNativeNodes, fail })
    const placeUploadedMaterial = upload ? createNativeUploadPlacement({ repository, projectId: PROJECT_ID,
      upload, placement: materialPlacement, fail }) : undefined
    const materialReceive = createNativeMaterialReceive({ repository, projectId: PROJECT_ID,
      projectionHost, spatial, projectNativeNodes, fail })
    const presentationHttp = new HttpClient({ baseUrl: coreOrigin })
    const materialGeometry = createNativeMaterialGeometry({ repository, projectId: PROJECT_ID,
      roots: SURFACES.flatMap(surface => {
        const owners = workspaces.filter(w => w.canvasId === surface.canvasId && w.preferredSurface === surface.key)
        return owners.length === 1 ? [{ canvasId: surface.canvasId, workspaceId: String(owners[0]!.id),
          scopeId: String(owners[0]!.scopeId), surface: surface.key }] : []
      }), readReference: referenceForNode,
      savePresentation: async (presentation, positions) => {
        const response = await presentationHttp.request<any>('PUT', `/projects/${encodeURIComponent(PROJECT_ID)}/presentations/${encodeURIComponent(presentation.id)}`,
          { body: { expectedVersion: presentation.version, contract: { ...presentation,
            state: { ...presentation.state, positions: { ...presentation.state.positions, ...positions } }, updatedBy: 'web' } } })
        if (response?.ok !== true || !response.value) fail(409, 'MATERIAL_LAYOUT_UNCONFIRMED', 'The original layout owner did not confirm its save.')
        return response.value
      } })

    const dispatch = async ({ method = 'GET', pathname, url, body }: { method?: string; pathname?: string; url?: string | URL; body?: unknown } = {}) => {
      try {
        const requestUrl = url instanceof URL ? url : new URL(url || pathname || '/', 'http://127.0.0.1')
        const route = pathname || requestUrl.pathname
        const upperMethod = method.toUpperCase()
        const canvasPrefix = '/api/canvas/v1/canvases'
        if (fullIntegration) {
          const routed = await coreProtocol.handle({ method: upperMethod, pathname: route, url: requestUrl, body })
          if (routed) return routed
          const library = await libraryProjection({ method: upperMethod, pathname: route, url: requestUrl })
          if (library) return library
          const history = await nativeHistory({ method: upperMethod, pathname: route, url: requestUrl })
          if (history) return history
          const materialPlacementRoute = /^\/api\/lcos\/canvases\/([^/]+)\/materials:place$/.exec(route)
          const materialReceiveRoute = /^\/api\/lcos\/canvases\/([^/]+)\/materials:receive$/.exec(route)
          if (materialReceiveRoute) {
            const canvasId = decodeURIComponent(materialReceiveRoute[1]!)
            if (upperMethod === 'GET') {
              const input: JsonRecord = Object.fromEntries(requestUrl.searchParams)
              try { input.targetRef = JSON.parse(String(input.targetRef)) }
              catch { return failure(400, 'MATERIAL_TARGET_INVALID', 'A read requires the original semantic target reference.') }
              return success(await materialReceive.inspect(canvasId, input as unknown as import('./native-material-receive.ts').NativeMaterialReceiveInput))
            }
            if (upperMethod === 'POST') return success(await materialReceive.receive(canvasId,
              record(body, 'body') as unknown as import('./native-material-receive.ts').NativeMaterialReceiveInput))
            return failure(405, 'MATERIAL_RECEIVE_METHOD_UNAVAILABLE', 'Material receiving accepts a read or an explicit original-target operation only.')
          }
          if (materialPlacementRoute) {
            const canvasId = decodeURIComponent(materialPlacementRoute[1]!)
            if (upperMethod === 'GET') return success(await materialPlacement.inspect(canvasId,
              Object.fromEntries(requestUrl.searchParams) as import('./native-material-placement.ts').NativeMaterialPlacementInput))
            if (upperMethod === 'POST') return success(await materialPlacement.place(canvasId,
              record(body, 'body') as import('./native-material-placement.ts').NativeMaterialPlacementInput))
            return failure(405, 'MATERIAL_PLACEMENT_METHOD_UNAVAILABLE', 'Material placement accepts an exact read or an explicit placement only.')
          }
          const collectionProject = /^\/api\/lcos\/canvases\/([^/]+)\/collections:project$/.exec(route)
          if (collectionProject && upperMethod === 'POST') {
            const input = record(body, 'body')
            if (nativeCollectionPilot) return success(await nativePilePlacement!.project(decodeURIComponent(collectionProject[1]!),
              input as import('./native-pile-collection-placement.ts').NativePileCollectionPlacementInput))
            if (Object.keys(input).length !== 1 || typeof input.collectionId !== 'string' || !input.collectionId.trim()) {
              return failure(400, 'INVALID_ARGUMENT', 'Select one received canonical Collection; no geometry, membership or provider override is accepted.')
            }
            return success(await collectionProjection.project(decodeURIComponent(collectionProject[1]!), input.collectionId))
          }
          const collectionBinding = /^\/api\/lcos\/canvases\/([^/]+)\/collections\/([^/]+)\/projection$/.exec(route)
          if (collectionBinding && upperMethod === 'GET') {
            if (nativeCollectionPilot) return success(await nativePilePlacement!.inspect(decodeURIComponent(collectionBinding[1]!), decodeURIComponent(collectionBinding[2]!)))
            const reader = nativeCollectionPilot ? nativePileProjection! : collectionProjection
            return success(await reader.readBinding(decodeURIComponent(collectionBinding[1]!), decodeURIComponent(collectionBinding[2]!)))
          }
          const collectionSpaceRoute = /^\/api\/lcos\/canvases\/([^/]+)\/collections\/([^/]+)\/space$/.exec(route)
          if (collectionSpaceRoute) {
            const target = { canvasId: decodeURIComponent(collectionSpaceRoute[1]!), collectionId: decodeURIComponent(collectionSpaceRoute[2]!) }
            if (upperMethod === 'GET') return success(await collectionSpace.readProjection(target))
            if (upperMethod !== 'POST') return failure(501, 'COLLECTION_SPACE_OPERATION_NOT_CONNECTED', 'Only exact Collection space read and first-open are connected; no arbitrary command, remove, or rename is accepted.')
            const input = record(body, 'body')
            if (Object.keys(input).length !== 2 || !Object.hasOwn(input, 'collectionNodeId')
              || !Object.hasOwn(input, 'expectedVersion') || typeof input.collectionNodeId !== 'string' || !input.collectionNodeId.trim()
              || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) {
              return failure(400, 'INVALID_ARGUMENT', 'Collection first-open requires its exact carrier NodeID and the current Canvas version only.')
            }
            return success(await collectionSpace.apply({ ...target, collectionNodeId: input.collectionNodeId, expectedVersion: input.expectedVersion }))
          }
          const collectionMergePrepare = /^\/api\/lcos\/canvases\/([^/]+)\/collections\/([^/]+)\/space:merge-prepare$/.exec(route)
          if (collectionMergePrepare) {
            if (upperMethod !== 'GET') return failure(501, 'COLLECTION_MERGE_PREPARE_READ_ONLY', 'Merge preparation is read-only; the original Canvas/O8 commits the explicit action.')
            const sourceCollectionId = requestUrl.searchParams.get('sourceCollectionId')
            if (!sourceCollectionId?.trim()) return failure(400, 'INVALID_ARGUMENT', 'An exact source Collection is required for the merge.')
            return success(await collectionSpaceHistory.prepareMerge({ canvasId: decodeURIComponent(collectionMergePrepare[1]!),
              sourceCollectionId, targetCollectionId: decodeURIComponent(collectionMergePrepare[2]!) }))
          }
          const collectionArrangePrepare = /^\/api\/lcos\/canvases\/([^/]+)\/collections\/([^/]+)\/space:arrange-prepare$/.exec(route)
          if (collectionArrangePrepare) {
            if (upperMethod !== 'GET') return failure(501, 'COLLECTION_ARRANGE_PREPARE_READ_ONLY', 'Arrangement prepare is read-only; the original Canvas/O8 owns the change.')
            const canvasId = decodeURIComponent(collectionArrangePrepare[1]!)
            const collectionId = decodeURIComponent(collectionArrangePrepare[2]!)
            const plan = await collectionSpace.prepareArrangement({ canvasId, collectionId })
            const beforeIds = new Set(plan.before.map(node => node.id))
            const afterIds = new Set(plan.after.map(node => node.id))
            const [beforeNodes, afterNodes] = await Promise.all([
              projectNativeNodes(canvasId, plan.beforeSnapshot), projectNativeNodes(canvasId, plan.afterSnapshot),
            ])
            return success({ project_id: PROJECT_ID, canvas_id: canvasId, workspace_id: plan.workspaceId,
              collection_id: collectionId, collection_node_id: plan.collectionNodeId, frame_id: plan.frameId,
              source_version: plan.sourceVersion, same_frame: true, created: false,
              node_ids: plan.nodeIds, changed_node_ids: plan.changedIds, admitted_node_ids: plan.admittedIds,
              before_nodes: beforeNodes.filter(node => beforeIds.has(String(node.id))),
              after_nodes: afterNodes.filter(node => afterIds.has(String(node.id))),
              space: { projectId: PROJECT_ID, canvasId, workspaceId: plan.workspaceId, collectionId,
                collectionNodeId: plan.collectionNodeId, frameId: plan.frameId, sourceVersion: plan.sourceVersion,
                before: plan.before, after: plan.after },
              committed: false, provider_execution_started: false })
          }
          const collectionSpacePrepare = /^\/api\/lcos\/canvases\/([^/]+)\/collections\/([^/]+)\/space:prepare$/.exec(route)
          if (collectionSpacePrepare) {
            if (upperMethod !== 'GET') return failure(501, 'COLLECTION_SPACE_PREPARE_READ_ONLY', 'Collection prepare is read-only; native O8 owns the actual space mutation.')
            const canvasId = decodeURIComponent(collectionSpacePrepare[1]!)
            const collectionId = decodeURIComponent(collectionSpacePrepare[2]!)
            const plan = await collectionSpace.prepare({ canvasId, collectionId })
            if (!plan.created) return failure(409, 'COLLECTION_FRAME_ALREADY_EXISTS', 'This Collection already has a frame; reopening only changes display state.')
            const beforeIds = new Set(plan.before.map(node => node.id))
            const afterIds = new Set(plan.after.map(node => node.id))
            const [beforeNodes, afterNodes] = await Promise.all([
              projectNativeNodes(canvasId, plan.beforeSnapshot), projectNativeNodes(canvasId, plan.afterSnapshot),
            ])
            return success({ project_id: PROJECT_ID, canvas_id: canvasId, workspace_id: plan.workspaceId,
              collection_id: collectionId, collection_node_id: plan.collectionNodeId, frame_id: plan.frameId,
              source_version: plan.sourceVersion, node_ids: plan.nodeIds.filter(id => id !== plan.frameId),
              before_nodes: beforeNodes.filter(node => beforeIds.has(String(node.id))),
              after_nodes: afterNodes.filter(node => afterIds.has(String(node.id))),
              space: { projectId: PROJECT_ID, canvasId, workspaceId: plan.workspaceId, collectionId,
                collectionNodeId: plan.collectionNodeId, frameId: plan.frameId, sourceVersion: plan.sourceVersion,
                before: plan.before, after: plan.after },
              committed: false, provider_execution_started: false })
          }
          const executionProject = /^\/api\/lcos\/canvases\/([^/]+)\/execution:reconcile$/.exec(route)
          if (executionProject && upperMethod === 'POST') {
            const targetCanvasId = decodeURIComponent(executionProject[1]!)
            const input = body === undefined ? {} : record(body, 'body')
            if (Object.keys(input).length) return failure(400, 'INVALID_ARGUMENT', 'Execution reconciliation accepts no identity, state, or geometry overrides.')
            const host = projectionHost(targetCanvasId)
            const [graph, snapshot] = await Promise.all([host.projects.getProjectGraph(PROJECT_ID), host.runs.readExecutionProjection(PROJECT_ID)])
            if (!graph) return failure(404, 'PROJECT_NOT_FOUND', 'The projection project no longer exists.')
            const owners = graph.workspaces.filter((item) => item.canvasId === targetCanvasId)
            if (owners.length !== 1) return failure(409, 'EXECUTION_WORKSPACE_AMBIGUOUS', 'The projection target must have one exact Core Workspace.')
            const report = await reconcileExecutionProjection({ projectId: PROJECT_ID, canvasId: targetCanvasId, snapshot,
              workspace: owners[0], activeArtifactIds: new Set(graph.artifacts.filter((item) => item.archivedAt === undefined).map((item) => String(item.id))),
              runs: host.runs, nodeProjector: host.nodeProjector, bindings: host.bindings })
            const receipt = { canvas_id: targetCanvasId, workspace_id: String(owners[0]!.id), bindings: report.bindings,
              failures: report.failures, runs_projected: report.runsProjected, slots_projected: report.slotsProjected, promoted: report.promoted,
              run_ids: [...report.runIds], slot_ids: [...report.slotIds], blocked_artifact_ids: [...report.blockedArtifactIds],
              owner: 'existing reconcileExecutionProjection / Core binding / Huabu executor', provider_execution_started: false }
            if (report.failures) return failure(409, 'EXECUTION_PROJECTION_PARTIAL', 'Some spatial projections remain pending; canonical Run and Accept receipts are preserved. Do not resubmit the Run.', receipt)
            return success(receipt)
          }
          const conversationProject = /^\/api\/lcos\/canvases\/([^/]+)\/conversations:reconcile$/.exec(route)
          if (conversationProject && upperMethod === 'POST') {
            const targetCanvasId = decodeURIComponent(conversationProject[1]!)
            const input = body ? record(body, 'body') : {}
            if (Object.keys(input).some((key) => key !== 'connectedConversationId') || input.connectedConversationId !== undefined
              && (typeof input.connectedConversationId !== 'string' || !input.connectedConversationId.trim())) return failure(400, 'INVALID_ARGUMENT', 'Select an exact confirmed Core ConnectedConversation ID.')
            let bindings
            if (input.connectedConversationId !== undefined) {
              const conversation = repository.getConnectedConversation(PROJECT_ID, input.connectedConversationId)
              if (!conversation || conversation.conversationRef.startsWith('pending-')) return failure(409, 'CONVERSATION_IDENTITY_UNAVAILABLE', 'Pending or unknown conversations cannot be displayed as confirmed Agents.')
              bindings = await projectionHost(targetCanvasId).nodeProjector.projectBatch([{ projectId: PROJECT_ID, entityType: 'conversation',
                entityId: conversation.id, kind: 'text', title: conversation.label }])
            } else bindings = await projectionHost(targetCanvasId).projectConversations()
            return success({ canvas_id: targetCanvasId, bindings, owner: 'existing Gen2Host / ProjectToSpaceProjection', provider_execution_started: false })
          }
          if (route === '/api/lcos/translation' && upperMethod === 'GET') return success({
            projectId: PROJECT_ID, fullScopeComplete: false, operations: coreProtocol.operations,
            modules: [
              { id: 'node-lifecycle', owner: 'Core Artifact/View + Huabu executor', boundary: 'display removal is not material deletion', backendConnected: true, nativeUiVerified: false },
              { id: 'library', owner: nativeAssemblyPilot ? 'Existing Core Warehouse / Artifact / View / Revision / FileRecord + original Composer draft' : 'Core metadata / FileRecord',
                boundary: nativeRailPilot
                  ? 'Artifact-only native Library, exact-version source and physical placements, read-only scene Peek, original Surface navigation and exact-node camera locate; no full Rail tree, cloud folders, Capture, Sources, Skills or Drop completion'
                  : nativeAssemblyPilot ? 'Artifact-only native Library browse, exact-version preview and unsent message references; current-canvas locate only; no cloud folders, Capture, Sources, Skills or Drop completion' : 'local read projection, not cloud folder ownership',
                backendConnected: true, nativeUiVerified: false },
              { id: 'agent', owner: 'Core Collaboration / Continuation', boundary: 'pending registration is not provider execution', backendConnected: true, nativeUiVerified: false },
              { id: 'saved-context-atlas', owner: 'Existing ContextAtlasStage / NativeContextReferencePort / Core Assembly Presentation membership',
                caller: 'Original Agent panel → Atlas focused Context summary → exact selected ArtifactView refs → Assembly apply → canonical Presentation readback',
                boundary: 'existing context Scope only; not a second Canvas, Collection membership, Conversation context, or Workflow execution',
                backendConnected: true, nativeUiVerified: false },
              { id: 'workflow-method-hand', owner: 'Existing WorkflowHandView / WorkflowCardPool / Workflow Presentation / original Composer draft',
                caller: 'Original Agent panel → canonical Workflow method preview → original appendWorkflowMethodDraft → existing LcosHostOverlay Composer',
                boundary: 'method authoring and unsent draft only; not a second Canvas, Run dispatch, or DAG execution',
                backendConnected: true, nativeUiVerified: false },
              { id: 'runtime-journal', owner: 'Existing RuntimeApplicationService / RuntimeReviewService', boundary: 'offline Run creation is only created/planned journal; no Bridge network or dispatch exposed', backendConnected: true, nativeUiVerified: false },
              { id: 'runtime-review-decisions', owner: 'Existing RuntimeReviewService / original RunWorkViewBody',
                boundary: 'same-project ArtifactReturn parent Run; original accept CAS/reject/retry and input/cancel producers; no dispatch or provider lifecycle override',
                backendConnected: true, nativeUiVerified: false },
              { id: 'result-slot-protocol', owner: 'Existing Core ResultSlotService / execution-projection',
                caller: 'Existing CoreAssemblyClient and CoreRunClient; exact project/scope/workspace/slot identity',
                boundary: 'original slot list/create/read and execution state only; no deletion, spatial promotion, provider execution or native GUI completion claim',
                backendConnected: true, nativeUiVerified: false },
              { id: 'execution-projection', owner: 'Existing reconcileExecutionProjection / Core bindings / Huabu executor',
                caller: 'Explicit worksite execution:reconcile; original execution facts and exact accepted material readback',
                boundary: 'same slot carrier; no implicit GET writes, automatic dispatch, primary-view impersonation or GUI completion claim',
                backendConnected: true, nativeUiVerified: false },
              { id: 'project-events', owner: 'Existing Core ProjectEventHub', boundary: 'same-project byte relay with original reconnect frames; no second event bus', backendConnected: true, nativeUiVerified: false },
              { id: 'native-text-body', owner: 'Existing Milkdown / LcosCanvasTextBody / LcosTextFaces', boundary: 'Original Text shell/toolbar stays native; saves use the native receipt path and primary binding only', backendConnected: true, nativeUiVerified: false },
              { id: 'native-text-presentation', owner: 'Original ReactFlow updateNode / Huabu MERGE_NODE_DATA', boundary: 'Three validated text preferences plus mode/geometry in one native update; no Core text Revision', backendConnected: true, nativeUiVerified: false },
              { id: 'native-project-text-create', owner: 'Original XD/b_/fi text factory + NodeLab addNodes / existing Core text lifecycle',
                boundary: 'Only the existing LcosTextFaces finishBranch caller; exact primary Core/history receipt; no direct Core create/PUT or automatic replay',
                caller: 'LcosTextFaces.finishBranch -> createNativeProjectText -> original addNodes -> native batch -> Core GET',
                backendConnected: true, nativeUiVerified: false },
            ], unsupported: ['full image-tool revision writeback', 'complete Gen1 text parity/history pending', 'complete Agent WorkView UI', 'full workflow execution/review UI'],
          })
        }
        const scenePeek = /^\/api\/canvas\/([^/]+)\/preview-scene$/.exec(route)
        if (nativeRailPilot && scenePeek) {
          if (upperMethod !== 'GET') return failure(501, 'PREVIEW_SCENE_READ_ONLY', 'Peek uses the existing read-only Huabu scene producer.')
          const canvasId = decodeURIComponent(scenePeek[1]!)
          const owners = repository.getWorkspaces(PROJECT_ID).filter(workspace => workspace.canvasId === canvasId)
          if (owners.length !== 1 || String(owners[0]!.projectId) !== PROJECT_ID) return failure(404, 'CANVAS_NOT_FOUND', 'No unique current-project Workspace owns this scene.')
          try { return success(await getSpacePreviewScene(canvasId)) } catch (error) {
            return failure(error instanceof SpacePreviewSceneError ? error.statusCode : 503, 'PREVIEW_SCENE_UNAVAILABLE', error instanceof Error ? error.message : 'Scene preview is unavailable.')
          }
        }
        if (route === '/api/surface-core/status' && upperMethod === 'GET') {
          return success({ implementation: 'Local Core + Huabu disk storage/executor', projectId: PROJECT_ID,
            core: { connected: true, origin: core.origin, databasePath: core.databasePath, graphVersion: repository.getProject(PROJECT_ID)?.graphVersion },
            workspaces: repository.getWorkspaces(PROJECT_ID).map((workspace) => ({ id: String(workspace.id), name: workspace.name,
              preferredSurface: workspace.preferredSurface, canvasId: workspace.canvasId })),
            surfaces: repository.getWorkspaces(PROJECT_ID).map((workspace) => ({ workspaceId: String(workspace.id), preferredSurface: workspace.preferredSurface,
              canvasId: workspace.canvasId, scopeId: String(workspace.scopeId), name: workspace.name })) })
        }

        const fileMatch = /^\/api\/surface-core\/file-records\/([^/]+)\/content$/.exec(route)
        if (fileMatch) {
          if (upperMethod !== 'GET') return failure(501, 'FILE_ACTION_NOT_IMPLEMENTED', 'FileRecord content is read-only in this facade.')
          const fileRecordId = decodeURIComponent(fileMatch[1] || '')
          const fileRecord = repository.getFileRecord(fileRecordId)
          const projectNow = repository.getProject(PROJECT_ID)
          if (!fileRecord || String(fileRecord.projectId) !== PROJECT_ID || !projectNow) return failure(404, 'FILE_RECORD_NOT_FOUND', 'No synthetic Core FileRecord with this ID.')
          try {
            const bytes = await readContainedFile(projectNow.rootPath, fileRecord.observedPath)
            return { status: 200, body: bytes, contentType: fileRecord.mimeType || 'application/octet-stream' }
          } catch (error) {
            return failure(404, 'FILE_CONTENT_UNAVAILABLE', error instanceof Error ? error.message : 'FileRecord content is unavailable.')
          }
        }

        if (route === canvasPrefix) {
          if (upperMethod !== 'GET') return failure(501, 'CANVAS_CREATE_NOT_IMPLEMENTED', 'Canvas creation is not supported; Workspaces are the three real Core surfaces.')
          const keyword = (requestUrl.searchParams.get('keyword') || '').toLowerCase()
          const sortBy = requestUrl.searchParams.get('sort_by') || 'updated_at'
          const sortOrder = requestUrl.searchParams.get('sort_order') || 'desc'
          if (!['updated_at', 'created_at', 'name'].includes(sortBy) || !['asc', 'desc'].includes(sortOrder)) return failure(400, 'INVALID_ARGUMENT', 'Unsupported canvas sorting.')
          const all = repository.getWorkspaces(PROJECT_ID)
          const list = await Promise.all(all.map(async (workspace) => ({ workspace, state: await space(workspace.canvasId!).read() })))
          const items = list.filter((entry) => entry.workspace.name.toLowerCase().includes(keyword))
            .sort((a, b) => {
              const left = sortBy === 'name' ? a.workspace.name : a.workspace.updatedAt
              const right = sortBy === 'name' ? b.workspace.name : b.workspace.updatedAt
              return String(left).localeCompare(String(right)) * (sortOrder === 'asc' ? 1 : -1)
            })
          const offset = Number(requestUrl.searchParams.get('offset') || 0)
          const limit = Number(requestUrl.searchParams.get('limit') || 100)
          if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 1000) return failure(400, 'INVALID_ARGUMENT', 'Invalid list pagination.')
          return success({ canvases: items.slice(offset, offset + limit).map(({ workspace, state }) => ({ id: workspace.canvasId, name: workspace.name,
            type: 'canvas', description: 'Core Workspace · ' + workspace.preferredSurface, preferred_surface: workspace.preferredSurface,
            workspace_id: String(workspace.id), is_public: false, isCollaborationEnabled: false, created_at: workspace.updatedAt,
            updated_at: state?.updatedAt ? new Date(state.updatedAt).toISOString() : workspace.updatedAt, node_count: state?.state?.nodes?.length ?? 0 })), total: items.length })
        }

        const canvasMatch = /^\/api\/canvas\/v1\/canvases\/([^/]+?)(?:\/(nodes:batchActions|connections:batchActions))?$/.exec(route)
        if (!route.startsWith(canvasPrefix) || !canvasMatch) return null
        const canvasId = decodeURIComponent(canvasMatch[1] || '')
        const workspace = repository.getWorkspaces(PROJECT_ID).find((item) => item.canvasId === canvasId)
        if (!workspace || !SURFACES.some((surface) => surface.canvasId === canvasId)) return failure(404, 'CANVAS_NOT_FOUND', 'No Core Workspace owns this canvas ID.')
        const state = await space(canvasId).read()
        if (!state) return failure(404, 'CANVAS_NOT_FOUND', 'Huabu has no saved space for this Core Workspace.')

        if (!canvasMatch[2]) {
          if (fullIntegration && upperMethod === 'PATCH') return spaceProtocol.renameCanvas(canvasId, body)
          if (upperMethod !== 'GET') return failure(501, 'CANVAS_ACTION_NOT_IMPLEMENTED', 'Rename, delete, clone, and new Canvas actions are not connected to Core Workspaces.')
          const nodes = await projectNativeNodes(canvasId, state)
          const connections = (state.state?.edges || []).map((edge: JsonRecord) => ({ id: edge.id, source: edge.source, target: edge.target,
            source_handle: edge.sourceHandle ?? null, target_handle: edge.targetHandle ?? null, type: edge.type ?? 'default', data: edge.data ?? {} }))
          return success({ id: canvasId, name: workspace.name, type: 'canvas', description: 'Core Workspace · ' + workspace.preferredSurface,
            version: state.version,
            preferred_surface: workspace.preferredSurface, workspace_id: String(workspace.id), is_public: false, isCollaborationEnabled: false,
            created_at: workspace.updatedAt, updated_at: new Date(state.updatedAt).toISOString(), nodes, connections })
        }

        if (fullIntegration && canvasMatch[2] === 'connections:batchActions' && upperMethod === 'POST') return spaceProtocol.applyConnections(canvasId, body)
        if (canvasMatch[2] !== 'nodes:batchActions' || upperMethod !== 'POST') return failure(501, 'CANVAS_ACTION_NOT_IMPLEMENTED', 'Only real node geometry and bound text updates are supported.')
        const input = record(body, 'body')
        if (input.canvas_id !== canvasId || !Array.isArray(input.actions) || input.actions.length > 200) return failure(400, 'INVALID_ARGUMENT', 'Expected matching canvas_id and a bounded actions array.')
        if (fullIntegration && ['collection-space', 'collection-arrange', 'collection-merge'].includes(input.lcos_operation?.kind)) {
          const allowed = new Set(['canvas_id', 'actions', 'created_by_role', 'lcos_operation',
            'lcos_expected_canvas_version', 'lcos_expected_revisions', 'lcos_refs', 'lcos_snapshots'])
          if (Object.keys(input).some(key => !allowed.has(key))
            || input.created_by_role !== undefined && input.created_by_role !== 'user'
            || !Number.isSafeInteger(input.lcos_expected_canvas_version) || input.lcos_expected_canvas_version < 0) {
            return failure(400, 'INVALID_COLLECTION_SPACE_BATCH', 'Collection space requires its exact native user intent, bounded actions and freshly read Canvas version.')
          }
          for (const key of ['lcos_refs', 'lcos_snapshots']) {
            if (input[key] !== undefined && (!input[key] || typeof input[key] !== 'object'
              || Array.isArray(input[key]) || Object.keys(input[key]).length)) {
              return failure(400, 'COLLECTION_SPACE_LIFECYCLE_METADATA_UNSUPPORTED', 'Collection space cannot carry material lifecycle refs or snapshots.')
            }
          }
          return success(await collectionSpaceHistory.applyOperation({ canvasId,
            expectedVersion: input.lcos_expected_canvas_version, operation: input.lcos_operation, actions: input.actions,
            expectedRevisions: input.lcos_expected_revisions }))
        }
        if (fullIntegration && input.actions.some((action: any) => action?.action !== 'update')) {
          // Native intent buckets are distinct submissions. Reject an ambiguous
          // mixed batch before any producer commits, never after half a write.
          if (input.actions.length !== 1 || !['create', 'delete'].includes(input.actions[0]?.action)) return failure(501, 'MIXED_LIFECYCLE_BATCH_NOT_CONNECTED', 'Submit each explicit native lifecycle intent separately from geometry/text updates.')
          if (!input.lcos_operation) return failure(409, 'NATIVE_OPERATION_REQUIRED', 'Lifecycle actions need the explicit original history/copy operation, not inferred identity.')
          const nativeAction = record(input.actions[0], 'action')
          const action = nativeAction.action === 'create' && Array.isArray(nativeAction.creates) ? { ...nativeAction, creates: nativeAction.creates.map((raw: unknown) => {
            const value = record(raw, 'creates[]')
            if (value.canvas_id !== undefined && value.canvas_id !== canvasId) fail(400, 'CANVAS_ID_MISMATCH', 'Created carrier does not belong to this canvas.')
            if (value.parent_id !== undefined && value.parent_id !== '') fail(501, 'NODE_PARENT_CREATE_NOT_CONNECTED', 'Creating a child node needs its existing spatial parent producer.')
            // An explicit empty parent in original redo means the same root
            // placement that the existing unparented create producer performs.
            const { canvas_id: _canvasId, parent_id: _rootParent, ...node } = value
            const data = record(node.data, 'creates[].data')
            if (data.lcos_ref !== undefined) {
              if (node.lcos_ref !== undefined && JSON.stringify(node.lcos_ref) !== JSON.stringify(data.lcos_ref)) fail(409, 'CORE_REFERENCE_MISMATCH', 'Conflicting create identity metadata.')
              node.lcos_ref = data.lcos_ref
              const { lcos_ref: _ref, ...renderData } = data
              node.data = renderData
            }
            node.data = translateRendererData(node.data, node.type)
            if (node.data.id !== undefined) node.data.id = node.id // carrier serializer cache, never a domain identity
            return node
          }) } : nativeAction
          let result: any
          if (action.action === 'create' && action.creates?.some((node: any) => node.data?.lcos_upload_url !== undefined)
            && input.lcos_operation.kind === 'create' && input.lcos_operation.phase === 'apply') {
            if (!placeUploadedMaterial || action.creates.length !== 1 || Object.keys(action).some((key) => !['action', 'creates'].includes(key)))
              return failure(501, 'MULTI_UPLOAD_CREATE_NOT_CONNECTED', 'Each file uses its own explicit original upload intent.')
            const operation = record(input.lcos_operation, 'lcos_operation')
            if (operation.version !== 1 || typeof operation.operationId !== 'string' || !operation.operationId.trim()
              || operation.operationId.length > 200 || Object.keys(operation).some((key) => !['version', 'operationId', 'kind', 'phase'].includes(key)))
              return failure(400, 'INVALID_OPERATION', 'Use a complete explicit native operation.')
            const node = await placeUploadedMaterial(canvasId, action.creates[0])
            result = { canvas_id: canvasId, operation, nodes: [node], deleted_node_ids: [], lcos_refs: { [node.nodeId]: node.lcos_ref },
              client_to_spatial_ids: { [node.clientNodeId]: node.nodeId }, core_saved: true, spatial_saved: true }
          } else if (action.action === 'create' && action.creates?.some((node: any) => node.type === 'image')
            && input.lcos_operation.kind === 'create' && input.lcos_operation.phase === 'apply') {
            if (action.creates.length !== 1 || Object.keys(action).some((key) => !['action', 'creates'].includes(key))) return failure(501, 'MULTI_UPLOAD_CREATE_NOT_CONNECTED', 'Each uploaded image currently needs its own explicit native intent bucket.')
            const operation = record(input.lcos_operation, 'lcos_operation')
            if (operation.version !== 1 || typeof operation.operationId !== 'string' || !operation.operationId.trim()
              || operation.operationId.length > 200 || Object.keys(operation).some((key) => !['version', 'operationId', 'kind', 'phase'].includes(key))) return failure(400, 'INVALID_OPERATION', 'Use a complete explicit native operation.')
            const receipt = upload?.resolveReceiptByUrl(action.creates[0].data?.src)
            if (!receipt) return failure(409, 'CORE_UPLOAD_RECEIPT_REQUIRED', 'New images must resolve to a confirmed exact local Core upload receipt.')
            const node = await lifecycle.createImportedImage(canvasId, action.creates[0], receipt)
            result = { canvas_id: canvasId, operation, nodes: [node], deleted_node_ids: [], lcos_refs: { [node.nodeId]: node.lcos_ref },
              client_to_spatial_ids: { [node.clientNodeId]: node.nodeId }, core_saved: true, spatial_saved: true }
          } else result = await lifecycle.applyAction({ canvasId, action: action as never, lcos_operation: input.lcos_operation,
            lcos_refs: input.lcos_refs, lcos_snapshots: input.lcos_snapshots })
          const after = await spatial.read(canvasId)
          const expectedRevisions: Record<string, string> = {}
          for (const node of result.nodes) {
            if (node.type !== 'text') continue
            const text = await canonicalText(canvasId, node.nodeId)
            if (text) expectedRevisions[node.nodeId] = text.revisionId
          }
          return success({ canvas_id: canvasId, nodes: after?.state?.nodes ?? [], connections: after?.state?.edges ?? [],
            core_saved: result.core_saved, spatial_saved: result.spatial_saved, lcos_expected_revisions: expectedRevisions,
            lifecycle_results: [result], lcos_refs: result.lcos_refs, client_to_spatial_ids: result.client_to_spatial_ids })
        }
        const updates: JsonRecord[] = []
        for (const actionValue of input.actions) {
          const action = record(actionValue, 'action')
          if (action.action !== 'update') return failure(501, 'NODE_ACTION_NOT_IMPLEMENTED', 'Create and delete are unsupported until Core and Huabu can preserve their full identity and history.')
          if (!Array.isArray(action.updates)) return failure(400, 'INVALID_ARGUMENT', 'Expected updates array.')
          updates.push(...action.updates.map((item: unknown) => record(item, 'update')))
        }

        const mergedUpdates: JsonRecord[] = []
        const updateIndexByNodeId = new Map<string, number>()
        for (const patch of updates) {
          if (typeof patch.id !== 'string') {
            mergedUpdates.push(patch)
            continue
          }
          const previousIndex = updateIndexByNodeId.get(patch.id)
          if (previousIndex === undefined) {
            updateIndexByNodeId.set(patch.id, mergedUpdates.length)
            mergedUpdates.push(patch)
            continue
          }
          const previous = mergedUpdates[previousIndex]!
          const merged = { ...previous, ...patch }
          if (previous.data !== undefined || patch.data !== undefined) {
            const previousData = previous.data === undefined ? {} : record(previous.data, 'data')
            const nextData = patch.data === undefined ? {} : record(patch.data, 'data')
            const data = { ...previousData, ...nextData }
            // Treat each alias as a field update across duplicate entries. A
            // later content-only patch must not inherit an earlier stale text.
            if (Object.hasOwn(nextData, 'content') && !Object.hasOwn(nextData, 'text')) delete data.text
            merged.data = data
          }
          mergedUpdates[previousIndex] = merged
        }

        const currentNodes = new Map((state.state?.nodes || []).map((node: JsonRecord) => [String(node.id), node]))
        const geometryItems: JsonRecord[] = []
        const nodeDataPatches = new Map<string, JsonRecord>()
        const textUpdates: Array<{ nodeId: string; body: string; expectedRevisionId: string; artifactId: string; bodyChanged: boolean; titleChanged: boolean; title?: string }> = []
        const textRevisionCandidates = new Set<string>()
        for (const patch of mergedUpdates) {
          if (fullIntegration && Object.hasOwn(patch, 'parent_id')) {
            const current = currentNodes.get(patch.id) as JsonRecord | undefined
            // Exact saved-parent echoes are not parent writes. The parent must
            // be a verified original Collection frame; changes/detach still
            // require the complete spatial operation, never an ordinary patch.
            const expectedParent = current?.parentId ?? current?.parent_id ?? ''
            if (!current || patch.parent_id !== expectedParent) return failure(501, 'NODE_PARENT_PATCH_NOT_CONNECTED', 'Node parenting needs its existing spatial producer; it cannot be silently detached.')
            if (expectedParent) collectionFrameProjection.parent(canvasId, current, state.state.nodes)
            delete patch.parent_id
          }
          if (Object.keys(patch).some((key) => !['id', 'type', 'position', 'measured', 'data', ...(fullIntegration ? ['lcos_ref'] : [])].includes(key)) || typeof patch.id !== 'string' || !patch.id) {
            return failure(501, 'NODE_PATCH_NOT_IMPLEMENTED', 'Only node geometry and text fields are supported.')
          }
          const node = currentNodes.get(patch.id)
          if (!node) return failure(404, 'OBJECT_NOT_FOUND', 'No node with this ID in the selected Core Workspace.')
          const binding = fullIntegration ? repository.getProjectionBindings(PROJECT_ID).find((item) => item.canvasId === canvasId
            && item.spatialKind === 'node' && item.spatialId === patch.id) : undefined
          const conversationBinding = binding?.entityType === 'conversation' ? binding : undefined
          const projectedNode = fullIntegration ? collectionFrameProjection.frame(canvasId, node as JsonRecord, state.state.nodes)
            ?? (nativeCollectionPilot
              ? nativePileProjection!.node(canvasId, node as JsonRecord, state.state.nodes)
              : collectionProjection.node(canvasId, node as JsonRecord, state.state.nodes))
            ?? executionNode(canvasId, node as JsonRecord) ?? await resultMaterialNode(canvasId, node as JsonRecord) : undefined
          if (!conversationBinding && !projectedNode && !['image', 'note'].includes(String(node.type))) return failure(501, 'NODE_TYPE_NOT_IMPLEMENTED', 'Only bound native materials and original execution projections are supported.')
          if (projectedNode) {
            if (patch.lcos_ref !== undefined && !isDeepStrictEqual(patch.lcos_ref, (projectedNode.data as JsonRecord).lcos_ref)) return failure(409, 'CORE_REFERENCE_MISMATCH', 'Renderer cannot replace the exact projected Core reference.')
          } else await validateRefEcho(canvasId, patch.id, patch.lcos_ref)
          const expectedNodeType = projectedNode?.type ?? (conversationBinding ? 'lcos-conversation' : node.type === 'image' ? 'image' : 'text')
          if (patch.type !== undefined && patch.type !== expectedNodeType) return failure(409, 'CANVAS_NODE_TYPE_MISMATCH', 'TapNow node type does not match the Huabu node type.')
          const geometry: JsonRecord = { nodeId: patch.id }
          if (patch.position !== undefined) geometry.position = finitePoint(patch.position, 'position')
          if (patch.measured !== undefined) geometry.size = positiveSize(patch.measured, 'measured')
          if (patch.position !== undefined || patch.measured !== undefined) geometryItems.push(geometry)
          if (patch.data !== undefined) {
            const data = translateRendererData(patch.data, expectedNodeType)
            if (!projectedNode) await validateRefEcho(canvasId, patch.id, data.lcos_ref)
            if (data.id !== undefined && data.id !== patch.id) return failure(400, 'CANVAS_ID_MISMATCH', 'Node data identity does not match the update target.')
            if (projectedNode) {
              // Renderer data may echo freshly read facts for a geometry save;
              // it cannot rename, write bytes, advance a revision or forge state.
              const actual = projectedNode.data as JsonRecord
              if (Object.keys(data).some((key) => !Object.hasOwn(actual, key))) return failure(501, 'PROJECTED_NODE_DATA_NOT_CONNECTED', 'Projected execution/material data is read-only; only exact echo and native geometry are connected.')
              if (Object.keys(data).some((key) => !isDeepStrictEqual(data[key], actual[key]))) return failure(409, 'PROJECTED_NODE_FACTS_MISMATCH', 'Core facts changed or renderer tried to write them. Reload this projection before changing geometry.')
            } else if (conversationBinding) {
              const conversation = repository.getConnectedConversation(PROJECT_ID, conversationBinding.entityId)
              if (!conversation || conversation.conversationRef.startsWith('pending-')) return failure(409, 'CONVERSATION_IDENTITY_UNAVAILABLE', 'Confirmed Core conversation is unavailable.')
              if (Object.keys(data).some((key) => !['id', 'title', 'lcos_conversation_ref', 'lcos_conversation_state'].includes(key))) return failure(501, 'CONVERSATION_NODE_DATA_NOT_CONNECTED', 'Conversation content and execution remain owned by Core, not node data.')
              if (data.title !== undefined && data.title !== conversation.label) return failure(501, 'CONVERSATION_RENAME_NOT_CONNECTED', 'Conversation labels need their real Core mutation owner.')
              if (data.lcos_conversation_ref !== undefined) {
                const ref = record(data.lcos_conversation_ref, 'lcos_conversation_ref')
                if (Object.keys(ref).sort().join(',') !== 'canvasId,connectedConversationId,projectId,workspaceId' || ref.projectId !== PROJECT_ID
                  || ref.canvasId !== canvasId || ref.connectedConversationId !== conversation.id || ref.workspaceId !== String(workspace.id)) return failure(409, 'CONVERSATION_REFERENCE_MISMATCH', 'Renderer cannot replace the Core conversation binding.')
              }
              if (data.lcos_conversation_state !== undefined) {
                const current = record(data.lcos_conversation_state, 'lcos_conversation_state')
                if (Object.keys(current).sort().join(',') !== 'isRunning,provider,waitingReason' || current.isRunning !== conversation.isRunning
                  || current.waitingReason !== conversation.waitingReason || current.provider !== conversation.provider) return failure(409, 'CONVERSATION_STATE_MISMATCH', 'Execution state must come from Core receipts, not frontend writes.')
              }
            } else if (node.type === 'image') {
              const allowedImageKeys = ['id', 'title', 'src', 'type', 'prompt', 'defaultOpenGallery', '__metadata', ...(fullIntegration ? ['lcos_ref'] : [])]
              if (Object.keys(data).some((key) => !allowedImageKeys.includes(key))) return failure(501, 'IMAGE_NODE_DATA_NOT_IMPLEMENTED', 'Only the exact image projection fields are accepted.')
              const image = imageProjection(canvasId, patch.id)
              if (!image) return failure(409, 'CORE_BINDING_REQUIRED', 'This image is not bound to a Core image Artifact and FileRecord.')
              if (data.title !== undefined) {
                if (typeof data.title !== 'string' || !data.title.trim()) return failure(400, 'INVALID_ARGUMENT', 'Core title must be a non-empty string.')
                if (data.title !== image.artifact.title) return failure(501, 'IMAGE_TITLE_UPDATE_NOT_IMPLEMENTED', 'Image title changes are not supported by this facade.')
              }
              if (data.src !== undefined && !matchesImageSource(data.src, image)) return failure(409, 'CORE_SOURCE_MISMATCH', 'Image source must match its bound Core FileRecord or exact confirmed upload receipt.')
              if (data.type !== undefined && data.type !== 'upload') return failure(409, 'CANVAS_IMAGE_TYPE_MISMATCH', 'Image data.type must match the Core upload projection.')
              if (data.prompt !== undefined && data.prompt !== '') return failure(501, 'NODE_PROMPT_NOT_IMPLEMENTED', 'Prompt editing is not connected to a Core entity.')
              if (data.defaultOpenGallery !== undefined && data.defaultOpenGallery !== false) {
                return failure(501, 'IMAGE_PRESENTATION_PATCH_NOT_IMPLEMENTED', 'Gallery presentation state is not persisted by Core.')
              }
              if (data.__metadata !== undefined) {
                const metadata = record(data.__metadata, '__metadata')
                if (Object.keys(metadata).sort().join(',') !== 'height,url,width') {
                  return failure(501, 'IMAGE_RENDER_METADATA_NOT_IMPLEMENTED', 'Only renderer url/width/height metadata is recognized.')
                }
                const imageBytes = await readContainedFile(repository.getProject(PROJECT_ID)!.rootPath, image.fileRecord.observedPath)
                const dimensions = localImageDimensions(imageBytes)
                if (!dimensions || !matchesImageSource(metadata.url, image) || metadata.width !== dimensions.width || metadata.height !== dimensions.height) {
                  return failure(409, 'IMAGE_RENDER_METADATA_MISMATCH', 'Renderer metadata must match the bound Core image bytes and URL.')
                }
              }
            } else {
              const allowedTextKeys: string[] = ['id', 'title', 'text', 'content', 'prompt', 'params', ...(fullIntegration ? ['lcos_ref', 'label', ...TEXT_PRESENTATION_KEYS] : [])]
              if (Object.keys(data).some((key) => !allowedTextKeys.includes(key))) return failure(501, 'NODE_DATA_PATCH_NOT_IMPLEMENTED', 'Only text identity, title, body, empty renderer params, and the exact text presentation fields are connected.')
              const presentation = fullIntegration ? validateTextPresentationData(data) : {}
              if (Object.keys(presentation).length) nodeDataPatches.set(patch.id, presentation)
              if (data.label !== undefined) {
                // Lifecycle readback includes a presentation label. The editor
                // echoes it with title; it is not an independent material field
                // or a spatial rename. Accept only the exact current/requested
                // Core title alias, with normal title CAS below still required.
                const labeledText = await canonicalText(canvasId, patch.id)
                if (!labeledText || typeof data.label !== 'string'
                  || data.label !== labeledText.title && data.label !== data.title) {
                  return failure(501, 'TEXT_LABEL_ALIAS_NOT_CONNECTED', 'Text label must exactly echo the canonical or explicitly requested Core title; independent label changes are unsupported.')
                }
              }
              // PureTextNode edits only text; these are unchanged installation defaults, not Core-owned settings.
              if (data.params !== undefined) {
                const params = data.params
                const plainObject = !!params && typeof params === 'object' && !Array.isArray(params) && Object.getPrototypeOf(params) === Object.prototype
                const keys = plainObject ? Object.keys(params).sort().join(',') : ''
                const unchanged = plainObject && (keys === '' || (keys === 'model,provider'
                  && params.model === DEFAULT_TEXT_PARAMS.model && params.provider === DEFAULT_TEXT_PARAMS.provider))
                if (!unchanged) return failure(501, 'NODE_PARAMS_NOT_IMPLEMENTED', 'Only unchanged text-node default params are accepted; generation settings are not connected.')
              }
              if (data.title !== undefined && (typeof data.title !== 'string' || !data.title.trim())) return failure(400, 'INVALID_ARGUMENT', 'Core title must be a non-empty string.')
              if (data.prompt !== undefined && data.prompt !== '') return failure(501, 'NODE_PROMPT_NOT_IMPLEMENTED', 'Prompt editing is not connected to a Core entity.')
              if ((data.text !== undefined && typeof data.text !== 'string') || (data.content !== undefined && typeof data.content !== 'string')) {
                return failure(400, 'INVALID_ARGUMENT', 'Text node body must be a string.')
              }
              const hasBody = data.text !== undefined || data.content !== undefined
              const nextBody = data.text !== undefined ? data.text : data.content
              if (!hasBody && data.title === undefined) continue
              const currentText = await canonicalText(canvasId, patch.id)
              if (!currentText) return failure(409, 'CORE_BINDING_REQUIRED', 'This note is not bound to a Core Artifact.')
              const expectedMap = input.lcos_expected_revisions && typeof input.lcos_expected_revisions === 'object'
                && !Array.isArray(input.lcos_expected_revisions) ? input.lcos_expected_revisions as JsonRecord : undefined
              const expectedRevisionId = expectedMap?.[patch.id]
              if (typeof expectedRevisionId !== 'string' || !expectedRevisionId.trim()) {
                return failure(409, 'EXPECTED_REVISION_REQUIRED', 'Text and title updates need the lcos_revision_id returned by a fresh canvas read.', { nodeId: patch.id })
              }
              if (expectedRevisionId !== currentText.revisionId) {
                return failure(409, 'STALE_REVISION', 'This text changed after it was read. Keep the draft and reload before retrying.', {
                  nodeId: patch.id, expectedRevisionId, currentRevisionId: currentText.revisionId,
                })
              }
              textRevisionCandidates.add(patch.id)
              const body = nextBody ?? currentText.body
              const bodyChanged = hasBody && body !== currentText.body
              const titleChanged = data.title !== undefined && data.title !== currentText.title
              if (bodyChanged && (await referenceForNode(canvasId, patch.id))?.entityType === 'view') return failure(501, 'VIEW_TEXT_WRITE_NOT_CONNECTED', 'This additional view reads the canonical revision; its binding-aware text write producer is not connected yet. No Core protection was bypassed.')
              if (bodyChanged || titleChanged) textUpdates.push({ nodeId: patch.id, body, expectedRevisionId, artifactId: currentText.artifactId,
                bodyChanged, titleChanged, ...(data.title === undefined ? {} : { title: data.title }) })
            }
          }
        }

        const materialGeometryPlan = await materialGeometry.prepare(canvasId, geometryItems)
        const coreCommittedNodeIds = new Set<string>()
        try {
          for (const text of textUpdates) {
            if (text.bodyChanged) {
              await saveCanvasText(repository, PROJECT_ID, { canvasId, spatialId: text.nodeId, body: text.body,
                expectedRevisionId: text.expectedRevisionId, artifactId: text.artifactId })
              coreCommittedNodeIds.add(text.nodeId)
            }
            if (text.titleChanged && text.title !== undefined) {
              repository.updateEntityTitle('artifact', text.artifactId, { title: text.title, mode: 'manual' })
              coreCommittedNodeIds.add(text.nodeId)
            }
          }
        } catch (error) {
          if (coreCommittedNodeIds.size) throw new FacadeError(409, 'PARTIAL_COMMIT', 'Some Core text/title writes committed before a later Core write failed.', {
            coreSavedNodeIds: [...coreCommittedNodeIds], spatialSaved: false, reason: error instanceof Error ? error.message : String(error),
          })
          throw error
        }
        const commands: any[] = []
        const changedBodies = textUpdates.filter((item) => item.bodyChanged)
        for (const item of changedBodies) {
          nodeDataPatches.set(item.nodeId, { ...(nodeDataPatches.get(item.nodeId) ?? {}), content: item.body })
        }
        if (nodeDataPatches.size) commands.push({ type: 'MERGE_NODE_DATA', patches: [...nodeDataPatches].map(([nodeId, patch]) => ({ nodeId, patch })) })
        if (geometryItems.length) commands.push({ type: 'SET_NODE_GEOMETRY', items: geometryItems })
        if (commands.length) {
          try {
            unwrapApplied(await executeOnServer({ canvasId, commands, originator: { source: 'user' }, publish: false }))
          } catch (error) {
            if (coreCommittedNodeIds.size) throw new FacadeError(409, 'PARTIAL_COMMIT', 'Core text/title committed, but Huabu rejected the spatial batch. Reload the canvas before retrying.', {
              coreSavedNodeIds: [...coreCommittedNodeIds], spatialSaved: false, reason: error instanceof Error ? error.message : String(error),
            })
            throw error
          }
        }
        const materialGeometryReceipt = await materialGeometry.commit(materialGeometryPlan)
        if (!materialGeometryReceipt.ok) throw new FacadeError(409, 'PARTIAL_COMMIT',
          '画布移动已保存，但原布局尚未同步；请核对当前现场，已保存的位置保留。', {
            spatialSaved: commands.length > 0, coreSavedNodeIds: [...coreCommittedNodeIds, ...materialGeometryReceipt.changedNodeIds],
            corePresentationSavedIds: materialGeometryReceipt.savedPresentationIds,
            presentationFailure: { id: materialGeometryReceipt.failedPresentationId, code: materialGeometryReceipt.code,
              reason: materialGeometryReceipt.reason } })
        const refreshed = await space(canvasId).read()
        const expectedRevisions: Record<string, string> = {}
        const textReceipts: JsonRecord[] = []
        for (const nodeId of textRevisionCandidates) {
          const text = await canonicalText(canvasId, nodeId)
          if (text) expectedRevisions[nodeId] = text.revisionId
          if (fullIntegration && text && coreCommittedNodeIds.has(nodeId)
            && changedBodies.some((item) => item.nodeId === nodeId)) {
            const ref = await referenceForNode(canvasId, nodeId)
            if (ref?.entityType !== 'artifact' || ref.artifactId !== text.artifactId
              || ref.artifactViewId !== text.viewId || ref.revisionId !== text.revisionId) {
              throw new FacadeError(409, 'PARTIAL_COMMIT', 'Core text and spatial writes committed, but their exact primary revision receipt is unavailable. Reload before retrying.', {
                coreSavedNodeIds: [...coreCommittedNodeIds], spatialSaved: commands.length > 0,
              })
            }
            // This is the existing canonical text receipt, not another write or
            // a lifecycle intent. The original history owner only backfills ref
            // metadata on snapshots whose body already equals these bytes.
            textReceipts.push({ projectId: PROJECT_ID, canvasId, nodeId, ref, body: text.body })
          }
        }
        return success({ canvas_id: canvasId, nodes: refreshed?.state?.nodes ?? [], connections: refreshed?.state?.edges ?? [],
          core_saved: coreCommittedNodeIds.size > 0 || materialGeometryReceipt.changedNodeIds.length > 0,
          spatial_saved: commands.length > 0, lcos_expected_revisions: expectedRevisions,
          ...(materialGeometryReceipt.savedPresentationIds.length ? { lcos_presentation_geometry_receipts: materialGeometryReceipt } : {}),
          ...(fullIntegration ? { lcos_text_receipts: textReceipts } : {}) })
      } catch (error) {
        if (error instanceof FacadeError) return failure(error.status, error.code, error.message, error.details)
        if (error instanceof NodeLifecycleError) return failure(error.status, error.code, error.message, error.details)
        if (error instanceof NativeResultMaterialConflictError) return failure(error.status, error.code, error.message)
        if (error instanceof URIError) return failure(400, 'INVALID_ARGUMENT', 'Malformed encoded identifier.')
        return failure(409, 'CORE_OR_SPATIAL_CONFLICT', error instanceof Error ? error.message : 'Core or Huabu rejected the request.')
      }
    }

    let batchWriteTail: Promise<void> = Promise.resolve()
    const handleUncached = (request: { method?: string; pathname?: string; url?: string | URL; body?: unknown } = {}) => {
      const requestUrl = request.url instanceof URL
        ? request.url
        : new URL(request.url || request.pathname || '/', 'http://127.0.0.1')
      const route = request.pathname || requestUrl.pathname
      if (request.method?.toUpperCase() !== 'POST' || !(/^\/api\/canvas\/v1\/canvases\/[^/]+\/(nodes|connections):batchActions$/.test(route)
        || /^\/api\/lcos\/canvases\/[^/]+\/(execution|conversations):reconcile$/.test(route)
        || /^\/api\/lcos\/canvases\/[^/]+\/collections:project$/.test(route)
        || /^\/api\/lcos\/canvases\/[^/]+\/collections\/[^/]+\/space$/.test(route))) {
        return dispatch(request)
      }
      const operation = batchWriteTail.then(() => dispatch(request))
      batchWriteTail = operation.then(() => undefined, () => undefined)
      return operation
    }

    const textResponseCache = fullIntegration ? createNativeTextResponseCache({ execute: handleUncached,
      ownsCanvas: canvasId => SURFACES.some(surface => surface.canvasId === canvasId)
        && repository.getWorkspaces(PROJECT_ID).some(workspace => workspace.canvasId === canvasId) }) : undefined
    const handle = (request: { method?: string; pathname?: string; url?: string | URL; body?: unknown } = {}) =>
      textResponseCache?.handle(request) ?? handleUncached(request)

    let closed = false
    return {
      handle,
      core,
      spatial,
      workspaces: repository.getWorkspaces(PROJECT_ID),
      upload,
      handleCoreEventStream: coreEventStream?.handle,
      async close() {
        if (closed) return
        closed = true
        try { await coreEventStream?.dispose(); await server?.close() } finally {
          repository.close()
          if (storageReady) await closeStorage().catch(() => {})
          if (oldHuabuDir === undefined) delete process.env.HUABU_DATA_DIR
          else process.env.HUABU_DATA_DIR = oldHuabuDir
        }
      },
    }
  } catch (error) {
    await coreEventStream?.dispose().catch(() => {})
    try { if (serverStarted) await server?.close() } catch { /* best effort startup cleanup */ }
    if (storageReady) await closeStorage().catch(() => {})
    repository.close()
    if (oldHuabuDir === undefined) delete process.env.HUABU_DATA_DIR
    else process.env.HUABU_DATA_DIR = oldHuabuDir
    throw error
  }
}
