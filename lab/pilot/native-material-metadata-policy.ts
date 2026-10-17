import { describeProjectedEntity } from '../../lcos/apps/web-gen2/src/presentation/projectedNodeDescriptor.ts'
import { readNativeTextReference } from './native-text-policy.ts'

type JsonRecord = Record<string, unknown>

export interface NativeMaterialMetadataInput {
  readonly projectId: string
  readonly canvasId: string
  readonly nodes: readonly unknown[]
  readonly graph: unknown
  readonly bindings: readonly unknown[]
}

export interface NativeMaterialMetadataReference {
  readonly entityType: 'artifact'
  readonly entityId: string
  readonly artifactViewId: string
  readonly revisionId: string
  readonly mimeType: string
}

export interface NativeMaterialMetadataNativeRef {
  readonly version: 1
  readonly entityType: 'artifact' | 'view'
  readonly entityId: string
  readonly artifactId: string
  readonly artifactViewId: string
  readonly revisionId: string
}

export interface NativeMaterialMetadataEntry {
  readonly nodeId: string
  readonly artifactId: string
  readonly artifactViewId: string
  readonly revisionId: string
  readonly fileRecordId: string
  /** Exact identity echoed by the current native image DTO and Core binding. */
  readonly nativeRef: NativeMaterialMetadataNativeRef
  readonly reference: NativeMaterialMetadataReference
  readonly descriptor: ReturnType<typeof describeProjectedEntity>
}

export interface NativeMaterialMetadataResolution {
  readonly status: 'ready' | 'unavailable'
  readonly reason?: string
  readonly byNodeId: ReadonlyMap<string, NativeMaterialMetadataEntry>
  readonly rejectedByNodeId: ReadonlyMap<string, string>
}

function record(value: unknown): JsonRecord | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : undefined
}

function rows(value: unknown): readonly unknown[] | undefined {
  return Array.isArray(value) ? value : undefined
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function exactlyOne<T>(values: readonly T[]): T | undefined {
  return values.length === 1 ? values[0] : undefined
}

function unavailable(reason: string): NativeMaterialMetadataResolution {
  return { status: 'unavailable', reason, byNodeId: new Map(), rejectedByNodeId: new Map() }
}

function imageIdentity(node: unknown): readonly unknown[] {
  const value = record(node)
  if (!value || value.type !== 'image') return []
  const data = record(value.data)
  const ref = record(data?.lcos_ref)
  return [
    String(value.id ?? ''),
    ref?.version ?? null,
    ref?.entityType ?? null,
    ref?.entityId ?? null,
    ref?.artifactId ?? null,
    ref?.artifactViewId ?? null,
    ref?.revisionId ?? null,
  ]
}

/** Identity-only signature: geometry, selection and display title are not read dependencies. */
export function nativeImageReferenceSignature(nodes: readonly unknown[]): string {
  return JSON.stringify(nodes.map(imageIdentity).filter(row => row.length > 0))
}

/** Stable React identity for the original rename entry; title/revision refreshes do not remount it. */
export function nativeMaterialRenameIdentityKey(
  projectId: string,
  canvasId: string,
  nodeId: string,
  value: unknown,
): string {
  const node = record(value)
  const data = record(node?.data)
  const reference = readNativeTextReference(data?.lcos_ref)
  const materialIdentity = node?.type === 'image' && reference
    ? [reference.entityType, reference.entityId, reference.artifactId, reference.artifactViewId]
    : [node?.type ?? 'none', 'unverified']
  return JSON.stringify([projectId, canvasId, nodeId, materialIdentity])
}

/** Read-only title selection for the original shared node shell. The existing
 * reference owner must describe this exact live image/View/Revision. Never
 * copy the metadata title into native node data or its history snapshots. */
export function nativeImagePresentedTitle(input: {
  readonly nodeId: string
  readonly rendererData: unknown
  readonly node: unknown
  readonly reference: unknown
  readonly projectId: string | null
  readonly shellProjectId: string | null
  readonly canvasId: string | null
  readonly canvasStatus: string
  readonly originalTitle: string
}): string {
  const node = record(input.node)
  const renderRef = readNativeTextReference(record(input.rendererData)?.lcos_ref)
  const liveRef = readNativeTextReference(record(node?.data)?.lcos_ref)
  const registered = record(input.reference)
  const descriptor = record(registered?.descriptor)
  if (input.canvasStatus !== 'ready' || !input.canvasId || !input.projectId
    || input.shellProjectId !== input.projectId || node?.id !== input.nodeId || node.type !== 'image'
    || !renderRef || !liveRef
    || renderRef.entityType !== liveRef.entityType || renderRef.entityId !== liveRef.entityId
    || renderRef.artifactId !== liveRef.artifactId || renderRef.artifactViewId !== liveRef.artifactViewId
    || renderRef.revisionId !== liveRef.revisionId
    || registered?.entityType !== 'artifact' || registered.entityId !== liveRef.artifactId
    || descriptor?.entityType !== 'artifact' || descriptor.entityId !== liveRef.artifactId
    || descriptor.artifactKind !== 'image' || descriptor.artifactViewId !== liveRef.artifactViewId
    || descriptor.presentedRevisionId !== liveRef.revisionId
    || !nonEmptyString(descriptor.title)) return input.originalTitle
  return descriptor.title
}

/**
 * Build only presentation facts for an image node that is already bound.
 * This is deliberately not the native-source resolver: it never imports,
 * claims, reconciles, or writes a binding. All IDs must join across the live
 * DTO ref, current-project graph, exact canvas binding, and original material
 * records before an Artifact descriptor can be registered.
 */
export function resolveNativeMaterialMetadata(input: NativeMaterialMetadataInput): NativeMaterialMetadataResolution {
  if (!nonEmptyString(input.projectId) || !nonEmptyString(input.canvasId)) {
    return unavailable('当前项目或 Canvas 身份缺失。')
  }

  const graph = record(input.graph)
  const project = record(graph?.project)
  const scopes = rows(graph?.scopes)
  const workspaces = rows(graph?.workspaces)
  const artifacts = rows(graph?.artifacts)
  const artifactViews = rows(graph?.artifactViews)
  const revisions = rows(graph?.artifactRevisions)
  const fileRecords = rows(graph?.fileRecords)
  if (!graph || !project || String(project.id ?? '') !== input.projectId
    || !scopes || !workspaces || !artifacts || !artifactViews || !revisions || !fileRecords) {
    return unavailable('Core 项目图或材料索引暂不可用。')
  }

  const canvasWorkspaces = workspaces.filter((value) => record(value)?.canvasId === input.canvasId)
  const workspace = exactlyOne(canvasWorkspaces)
  const workspaceRecord = record(workspace)
  if (!workspaceRecord || String(workspaceRecord.projectId ?? '') !== input.projectId
    || !nonEmptyString(workspaceRecord.id) || !nonEmptyString(workspaceRecord.scopeId)) {
    return unavailable('当前 Canvas 没有唯一、属于当前项目的 Workspace。')
  }
  const owningScopes = scopes.filter((value) => record(value)?.id === workspaceRecord.scopeId)
  const scopeRecord = record(exactlyOne(owningScopes))
  if (!scopeRecord || String(scopeRecord.projectId ?? '') !== input.projectId) {
    return unavailable('当前 Workspace 的 Scope 缺失、重复或不属于当前项目。')
  }

  if (!Array.isArray(input.bindings)) return unavailable('Core 节点绑定清单不可用。')

  const imageNodes: { readonly id: string; readonly node: JsonRecord }[] = []
  const rejected = new Map<string, string>()
  const seenIds = new Set<string>()
  for (const value of input.nodes) {
    const node = record(value)
    if (!node || node.type !== 'image') continue
    if (!nonEmptyString(node.id)) {
      rejected.set('<unknown-image-node>', '图片节点缺少稳定 NodeID。')
      continue
    }
    const nodeId = node.id
    if (seenIds.has(nodeId)) {
      rejected.set(nodeId, '当前 Canvas 中存在重复的图片 NodeID。')
      continue
    }
    seenIds.add(nodeId)
    imageNodes.push({ id: nodeId, node })
  }

  const byNodeId = new Map<string, NativeMaterialMetadataEntry>()
  for (const { id: nodeId, node } of imageNodes) {
    if (rejected.has(nodeId)) continue
    const data = record(node.data)
    const ref = record(data?.lcos_ref)
    const nativeRef = readNativeTextReference(ref)
    if (!nativeRef) {
      rejected.set(nodeId, '图片节点没有完整的 Core Artifact/View 引用。')
      continue
    }

    const nodeBindings = input.bindings.filter((value) => {
      const binding = record(value)
      return binding?.spatialKind === 'node' && binding.spatialId === nodeId
        && binding.canvasId === input.canvasId
    })
    const binding = record(exactlyOne(nodeBindings))
    if (!binding || String(binding.projectId ?? '') !== input.projectId
      || !['artifact', 'view'].includes(String(binding.entityType))
      || !nonEmptyString(binding.entityId)
      || binding.entityType !== nativeRef.entityType || binding.entityId !== nativeRef.entityId) {
      rejected.set(nodeId, '当前 Canvas 的唯一 Core binding 与节点引用不一致。')
      continue
    }

    const artifactMatches = artifacts.filter((value) => record(value)?.id === nativeRef.artifactId)
    const artifact = record(exactlyOne(artifactMatches))
    if (!artifact || String(artifact.projectId ?? '') !== input.projectId
      || artifact.archivedAt !== undefined || artifact.kind !== 'image'
      || !nonEmptyString(artifact.title)
      || !['available', 'missing', 'stale'].includes(String(artifact.availability))) {
      rejected.set(nodeId, 'Core Artifact 缺失、归档、类型不符或标题事实不可用。')
      continue
    }
    if (String(artifact.id) !== nativeRef.artifactId) {
      rejected.set(nodeId, 'Core Artifact ID 与节点引用不一致。')
      continue
    }

    const viewMatches = artifactViews.filter((value) => record(value)?.id === nativeRef.artifactViewId)
    const view = record(exactlyOne(viewMatches))
    if (!view || String(view.artifactId ?? '') !== String(artifact.id)
      || String(view.scopeId ?? '') !== String(workspaceRecord.scopeId)
      || !['primary', 'explicit_additional'].includes(String(view.referenceKind))) {
      rejected.set(nodeId, '精确 ArtifactView 缺失、跨 Scope 或引用种类未知。')
      continue
    }

    const expectedRevisionId = binding.entityType === 'artifact'
      ? artifact.currentRevisionId
      : view.revisionId
    if (!nonEmptyString(expectedRevisionId) || expectedRevisionId !== nativeRef.revisionId
      || binding.entityType === 'artifact' && (nativeRef.entityType !== 'artifact' || view.referenceKind !== 'primary')
      || binding.entityType === 'view' && (nativeRef.entityType !== 'view' || String(view.id) !== nativeRef.entityId)) {
      rejected.set(nodeId, '绑定类型、选中的 View/Revision 与 Core 当前事实不一致。')
      continue
    }

    const revisionMatches = revisions.filter((value) => record(value)?.id === expectedRevisionId)
    const revision = record(exactlyOne(revisionMatches))
    if (!revision || String(revision.artifactId ?? '') !== String(artifact.id)
      || !['current', 'superseded'].includes(String(revision.status))
      || !nonEmptyString(revision.fileRecordId)) {
      rejected.set(nodeId, '选中的 Core Revision 缺失、草稿或不属于此 Artifact。')
      continue
    }

    const fileMatches = fileRecords.filter((value) => record(value)?.id === revision.fileRecordId)
    const file = record(exactlyOne(fileMatches))
    if (!file || String(file.projectId ?? '') !== input.projectId
      || !nonEmptyString(file.mimeType) || !file.mimeType.toLowerCase().startsWith('image/')) {
      rejected.set(nodeId, '选中 Revision 的项目内图片 FileRecord 缺失或 MIME 不符。')
      continue
    }

    const artifactId = String(artifact.id)
    const viewId = String(view.id)
    const revisionId = String(revision.id)
    const fileRecordId = String(file.id)
    const descriptor = describeProjectedEntity({
      entityType: 'artifact',
      entityId: artifactId,
      title: artifact.title,
      artifactKind: 'image',
      managed: typeof artifact.managed === 'boolean' ? artifact.managed : undefined,
      availability: String(artifact.availability),
      currentRevisionId: nonEmptyString(artifact.currentRevisionId) ? artifact.currentRevisionId : undefined,
      presentedRevisionId: revisionId,
      artifactViewId: viewId,
      artifactViewReferenceKind: view.referenceKind as 'primary' | 'explicit_additional',
      fileRecordId,
      mimeType: file.mimeType,
      revisionStatus: revision.status as 'current' | 'superseded',
      ...(nonEmptyString(revision.runId) ? { sourceRunId: revision.runId } : {}),
    })
    byNodeId.set(nodeId, {
      nodeId,
      artifactId,
      artifactViewId: viewId,
      revisionId,
      fileRecordId,
      nativeRef: {
        version: 1,
        entityType: nativeRef.entityType,
        entityId: nativeRef.entityId,
        artifactId,
        artifactViewId: viewId,
        revisionId,
      },
      reference: { entityType: 'artifact', entityId: artifactId, artifactViewId: viewId, revisionId, mimeType: file.mimeType },
      descriptor,
    })
  }

  return { status: 'ready', byNodeId, rejectedByNodeId: rejected }
}
