import { createAbsolutePositionGetter, indexById } from '@huabu/shared/canvas-engine'

import type { ArtifactDetailProjection } from '../../lcos/apps/web-gen2/src/backend/artifacts.ts'
import type { ProjectionBinding } from '../../lcos/apps/web-gen2/src/spatial/projectionBinding.ts'
import type { ProjectGraphSnapshot, PresentationViewV0 } from '../../lcos/packages/contracts/src/index.ts'
import type { Artifact, ArtifactRevision, ArtifactView, Workspace } from '../../lcos/packages/domain/src/index.ts'

import { verifyNativeAssemblyVersion } from './native-assembly-policy.ts'
import { readNativeTextReference } from './native-text-policy.ts'
import {
  resolveNativeMaterialMetadata,
  type NativeMaterialMetadataNativeRef,
} from './native-material-metadata-policy.ts'

type JsonRecord = Record<string, unknown>

export interface NativeMaterialCanvasNode {
  readonly id: string
  readonly type?: string
  readonly parentId?: string
  readonly position?: unknown
  readonly measured?: unknown
  readonly data?: { readonly lcos_ref?: unknown; readonly [key: string]: unknown }
  readonly [key: string]: unknown
}

export interface NativeMaterialCanvasSnapshot {
  readonly canvasId: string
  readonly nodes: readonly NativeMaterialCanvasNode[]
}

export type NativeMaterialSourcePathInput =
  | { readonly status: 'registered'; readonly path: string; readonly exists: boolean; readonly isUrl: boolean }
  | { readonly status: 'unregistered' }
  | { readonly status: 'unavailable'; readonly reason?: string }

export type NativeMaterialArtifactDetailInput = ArtifactDetailProjection
  | { readonly status: 'unavailable'; readonly reason?: string }

export type NativeMaterialRegisteredSource =
  | { readonly status: 'registered'; readonly path: string; readonly exists: boolean; readonly isUrl: boolean }
  | { readonly status: 'unregistered' | 'not-read' }
  | { readonly status: 'unavailable'; readonly reason?: string }

export interface NativeMaterialContextInput {
  readonly projectId: string
  readonly artifactId: string
  /** Required exact revision. This function never substitutes Artifact.currentRevisionId. */
  readonly revisionId: string
  readonly graph: ProjectGraphSnapshot
  readonly workspaces: readonly Workspace[]
  readonly bindings: readonly ProjectionBinding[]
  readonly presentations: readonly PresentationViewV0[]
  readonly canvases: readonly NativeMaterialCanvasSnapshot[]
  readonly artifactDetail?: NativeMaterialArtifactDetailInput
  readonly sourcePath?: NativeMaterialSourcePathInput
}

export interface NativeMaterialRevisionSource {
  readonly revisionId: string
  readonly source: ArtifactRevision['source']
  readonly runId?: string
  readonly fileRecordId: string
}

export interface NativeMaterialMembershipRow {
  readonly kind: 'workspace' | 'presentation'
  readonly projectId: string
  readonly artifactId: string
  readonly artifactViewId: string
  readonly revisionId: string
  readonly fileRecordId: string
  /** Owner of the membership: Workspace scope or Presentation scope. */
  readonly scopeId: string
  /** ArtifactView's own scope is separate; a view can be received cross-scope. */
  readonly artifactViewScopeId: string
  readonly workspaceId?: string
  readonly canvasId?: string
  readonly presentationId?: string
  readonly capability?: PresentationViewV0['capability']
  readonly sameVersion: boolean
  /** False means canonical membership exists without an evidenced Canvas node. */
  readonly placed: boolean
}

export interface NativeMaterialLocationRow {
  readonly projectId: string
  readonly workspaceId: string
  readonly scopeId: string
  readonly canvasId: string
  readonly nodeId: string
  readonly artifactId: string
  readonly artifactViewId: string
  readonly revisionId: string
  readonly fileRecordId: string
  readonly sameVersion: boolean
  readonly position: { readonly x: number; readonly y: number }
  readonly size: { readonly width: number; readonly height: number }
  readonly bindingEntityType: 'artifact' | 'view'
}

export interface NativeMaterialRejectedLocation {
  readonly canvasId: string
  readonly nodeId: string
  readonly artifactId?: string
  readonly artifactViewId?: string
  readonly revisionId?: string
  readonly reason: string
}

export interface NativeMaterialContext {
  readonly status: 'ready' | 'unavailable'
  readonly identity: { readonly projectId: string; readonly artifactId: string; readonly revisionId: string }
  readonly source?: {
    /** This is the selected Revision's source, not the Artifact's birth provenance. */
    readonly revision: NativeMaterialRevisionSource
    /** Registered file source is shown only when the explicit source-path read returned it. */
    readonly registeredSource: NativeMaterialRegisteredSource
    readonly artifactDetailStatus: 'available' | 'unavailable' | 'not-read'
  }
  readonly memberships: readonly NativeMaterialMembershipRow[]
  readonly locations: readonly NativeMaterialLocationRow[]
  readonly rejectedLocations: readonly NativeMaterialRejectedLocation[]
  readonly issues: readonly string[]
}

function record(value: unknown): JsonRecord | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : undefined
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function exactlyOne<T>(values: readonly T[]): T | undefined {
  return values.length === 1 ? values[0] : undefined
}

function sourcePathState(value: NativeMaterialSourcePathInput | undefined): NativeMaterialRegisteredSource {
  if (value === undefined) return { status: 'not-read' }
  if (value.status === 'unregistered') return { status: 'unregistered' }
  if (value.status === 'unavailable') return { status: 'unavailable', ...(value.reason ? { reason: value.reason } : {}) }
  if (!nonEmpty(value.path) || typeof value.exists !== 'boolean' || typeof value.isUrl !== 'boolean') {
    return { status: 'unavailable', reason: 'Source path 回执不完整。' }
  }
  return { status: 'registered', path: value.path, exists: value.exists, isUrl: value.isUrl }
}

function detailStatus(value: NativeMaterialArtifactDetailInput | undefined): 'available' | 'unavailable' | 'not-read' {
  if (value === undefined) return 'not-read'
  return record(value)?.status === 'unavailable' ? 'unavailable' : 'available'
}

function unavailableContext(input: NativeMaterialContextInput, reason: string, issues: readonly string[] = []): NativeMaterialContext {
  return {
    status: 'unavailable',
    identity: { projectId: input.projectId, artifactId: input.artifactId, revisionId: input.revisionId },
    memberships: [], locations: [], rejectedLocations: [], issues: [reason, ...issues],
  }
}

function sourceReadiness(input: NativeMaterialContextInput, artifact: Artifact, revision: ArtifactRevision): string | undefined {
  const detail = record(input.artifactDetail)
  if (!detail || detail.status === 'unavailable') return undefined
  const detailArtifact = record(detail.artifact)
  const detailRevisions = Array.isArray(detail.revisions) ? detail.revisions : undefined
  if (!detailArtifact || String(detailArtifact.id ?? '') !== input.artifactId
    || String(detailArtifact.projectId ?? '') !== input.projectId || !detailRevisions) {
    return 'Artifact detail 回执与请求项目/材料不一致。'
  }
  if (detail.currentRevisionId !== undefined && String(detail.currentRevisionId) !== String(artifact.currentRevisionId ?? '')) {
    return 'Artifact detail 与项目图谱的 Current Revision 不一致。'
  }
  const detailRevision = exactlyOne(detailRevisions.filter(row => record(row)?.id === input.revisionId))
  if (!detailRevision || String(record(detailRevision)?.source ?? '') !== String(revision.source)) {
    return 'Artifact detail 缺少所选 Revision，或来源与项目图谱不一致。'
  }
  const detailRunId = record(detailRevision)?.run
  if (detailRunId !== undefined && String(record(detailRunId)?.id ?? '') !== String(revision.runId ?? '')) {
    return 'Artifact detail 与所选 Revision 的 Run 身份不一致。'
  }
  return undefined
}

function findViewContext(input: NativeMaterialContextInput, artifact: Artifact, viewId: string): {
  readonly view: ArtifactView
  readonly revision: ArtifactRevision
  readonly fileRecordId: string
} | undefined {
  const view = exactlyOne(input.graph.artifactViews.filter(row => String(row.id) === viewId))
  if (!view || String(view.artifactId) !== input.artifactId) return undefined
  const viewRevisionId = String(view.revisionId ?? (view.referenceKind === 'primary' ? artifact.currentRevisionId : undefined) ?? '')
  if (!viewRevisionId) return undefined
  const revision = exactlyOne(input.graph.artifactRevisions.filter(row => String(row.id) === viewRevisionId))
  if (!revision || String(revision.artifactId) !== input.artifactId || revision.status === 'draft') return undefined
  const file = exactlyOne(input.graph.fileRecords.filter(row => String(row.id) === String(revision.fileRecordId)))
  if (!file || String(file.projectId) !== input.projectId) return undefined
  return { view, revision, fileRecordId: String(file.id) }
}

function canvasWorkspace(input: NativeMaterialContextInput, canvasId: string): { workspace?: Workspace; reason?: string } {
  const candidates = input.workspaces.filter(workspace => String(workspace.canvasId ?? '') === canvasId)
  const workspace = exactlyOne(candidates)
  if (!workspace || String(workspace.projectId) !== input.projectId || !nonEmpty(workspace.id) || !nonEmpty(workspace.scopeId)) {
    return { reason: 'Canvas 没有唯一且属于当前项目的 Workspace。' }
  }
  const graphCandidates = input.graph.workspaces.filter(row => String(row.id) === String(workspace.id))
  const graphWorkspace = exactlyOne(graphCandidates)
  const duplicateWorkspaceIds = input.workspaces.filter(row => String(row.id) === String(workspace.id))
  const graphCanvasMatches = input.graph.workspaces.filter(row => String(row.canvasId ?? '') === canvasId)
  if (!graphWorkspace || String(graphWorkspace.projectId) !== input.projectId
    || duplicateWorkspaceIds.length !== 1 || graphCanvasMatches.length !== 1
    || String(graphWorkspace.canvasId ?? '') !== canvasId || String(graphWorkspace.scopeId) !== String(workspace.scopeId)) {
    return { reason: 'Core graph 与 Workspaces 读回的现场身份不一致。' }
  }
  const scopes = input.graph.scopes.filter(scope => String(scope.id) === String(workspace.scopeId))
  const scope = exactlyOne(scopes)
  if (!scope || String(scope.projectId) !== input.projectId) return { reason: 'Workspace Scope 缺失、重复或跨项目。' }
  return { workspace }
}

function positionProblem(nodeId: string, nodesById: ReadonlyMap<string, NativeMaterialCanvasNode>): string | undefined {
  const seen = new Set<string>()
  let currentId = nodeId
  for (;;) {
    if (seen.has(currentId)) return 'Canvas 节点 parentId 存在循环，无法确认绝对位置。'
    seen.add(currentId)
    const node = nodesById.get(currentId)
    if (!node) return 'Canvas 节点或 parentId 对应节点缺失，无法确认绝对位置。'
    const position = record(node.position)
    if (!position || typeof position.x !== 'number' || typeof position.y !== 'number'
      || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return 'Canvas 节点位置数据不可用。'
    if (node.parentId === undefined || node.parentId === null || node.parentId === '') return undefined
    if (typeof node.parentId !== 'string' || !node.parentId.trim()) return 'Canvas 节点 parentId 无效。'
    currentId = node.parentId
  }
}

function measuredSize(node: NativeMaterialCanvasNode): { readonly width: number; readonly height: number } | undefined {
  const measured = record(node.measured)
  if (!measured || typeof measured.width !== 'number' || typeof measured.height !== 'number'
    || !Number.isFinite(measured.width) || !Number.isFinite(measured.height)
    || measured.width <= 0 || measured.height <= 0) return undefined
  return { width: measured.width, height: measured.height }
}

function bindingForNode(input: NativeMaterialContextInput, canvasId: string, nodeId: string,
  nativeRef: NativeMaterialMetadataNativeRef): ProjectionBinding | undefined {
  const matches = input.bindings.filter(binding => binding.canvasId === canvasId && binding.spatialKind === 'node'
    && binding.spatialId === nodeId)
  const binding = exactlyOne(matches)
  if (!binding || binding.projectId !== input.projectId || binding.entityType !== nativeRef.entityType
    || binding.entityId !== nativeRef.entityId) return undefined
  return binding
}

function textNodeEntry(input: NativeMaterialContextInput, canvasId: string, node: NativeMaterialCanvasNode): {
  readonly reference: NativeMaterialMetadataNativeRef
  readonly entry: {
    readonly nodeId: string
    readonly artifactId: string
    readonly artifactViewId: string
    readonly revisionId: string
    readonly fileRecordId: string
    readonly nativeRef: NativeMaterialMetadataNativeRef
  }
} | { readonly reason: string } {
  const nativeRef = readNativeTextReference(node.data?.lcos_ref)
  if (!nativeRef) return { reason: '文本节点没有完整的 Core Artifact/View 引用。' }
  const binding = bindingForNode(input, canvasId, node.id, nativeRef)
  if (!binding) return { reason: '唯一 Core binding 与当前项目、Canvas 或文本节点引用不一致。' }
  const artifacts = input.graph.artifacts.filter(row => String(row.id) === nativeRef.artifactId)
  const artifact = exactlyOne(artifacts)
  if (!artifact || String(artifact.projectId) !== input.projectId || artifact.archivedAt !== undefined
    || !['markdown', 'text'].includes(String(artifact.kind))) return { reason: 'Core 文本 Artifact 缺失、归档或材料类型不符。' }
  const view = exactlyOne(input.graph.artifactViews.filter(row => String(row.id) === nativeRef.artifactViewId))
  if (!view || String(view.artifactId) !== nativeRef.artifactId) return { reason: '精确 ArtifactView 缺失或指向其他 Artifact。' }
  if (binding.entityType === 'artifact'
    ? nativeRef.entityType !== 'artifact' || nativeRef.entityId !== nativeRef.artifactId
      || view.referenceKind !== 'primary' || String(artifact.currentRevisionId ?? '') !== nativeRef.revisionId
    : nativeRef.entityType !== 'view' || nativeRef.entityId !== nativeRef.artifactViewId
      || !['primary', 'explicit_additional'].includes(view.referenceKind) || String(view.revisionId ?? '') !== nativeRef.revisionId) {
    return { reason: '绑定类型与精确 Artifact/View/Revision 不一致。' }
  }
  const revision = exactlyOne(input.graph.artifactRevisions.filter(row => String(row.id) === nativeRef.revisionId))
  if (!revision || String(revision.artifactId) !== nativeRef.artifactId || revision.status === 'draft') {
    return { reason: '精确 Revision 缺失、仍是草稿或属于其他 Artifact。' }
  }
  const file = exactlyOne(input.graph.fileRecords.filter(row => String(row.id) === String(revision.fileRecordId)))
  if (!file || String(file.projectId) !== input.projectId) return { reason: 'Revision 的 Core FileRecord 缺失或跨项目。' }
  const item = {
    schemaVersion: 1 as const,
    entityRef: { type: 'artifact' as const, id: nativeRef.artifactId,
      ...(binding.entityType === 'view' || view.revisionId !== undefined ? { viewId: nativeRef.artifactViewId } : {}) },
    kind: 'artifact' as const,
    title: artifact.title,
    presentedRevisionId: nativeRef.revisionId,
    usageCount: 0,
  }
  try {
    verifyNativeAssemblyVersion(input.graph, input.projectId, item, String(file.id))
  } catch (error) {
    return { reason: error instanceof Error ? error.message : '精确 Revision 校验失败。' }
  }
  return {
    reference: nativeRef,
    entry: {
      nodeId: node.id,
      artifactId: nativeRef.artifactId,
      artifactViewId: nativeRef.artifactViewId,
      revisionId: nativeRef.revisionId,
      fileRecordId: String(file.id),
      nativeRef,
    },
  }
}

function artifactRevision(input: NativeMaterialContextInput): { artifact: Artifact; revision: ArtifactRevision; fileRecordId: string } | undefined {
  const artifact = exactlyOne(input.graph.artifacts.filter(row => String(row.id) === input.artifactId))
  if (!artifact || String(artifact.projectId) !== input.projectId || artifact.archivedAt !== undefined) return undefined
  const revision = exactlyOne(input.graph.artifactRevisions.filter(row => String(row.id) === input.revisionId))
  if (!revision || String(revision.artifactId) !== input.artifactId || revision.status === 'draft') return undefined
  const file = exactlyOne(input.graph.fileRecords.filter(row => String(row.id) === String(revision.fileRecordId)))
  if (!file || String(file.projectId) !== input.projectId) return undefined
  return { artifact, revision, fileRecordId: String(file.id) }
}

function membershipRows(input: NativeMaterialContextInput, artifact: Artifact, revisionId: string,
  locations: readonly NativeMaterialLocationRow[]): NativeMaterialMembershipRow[] {
  const rows: NativeMaterialMembershipRow[] = []
  const graphMemberships = input.graph.workspaceMemberships
  if (Array.isArray(graphMemberships)) {
    for (const membership of graphMemberships) {
      const workspaceMatches = input.workspaces.filter(workspace => String(workspace.id) === String(membership.workspaceId))
      const workspace = exactlyOne(workspaceMatches)
      if (!workspace || String(workspace.projectId) !== input.projectId) continue
      const viewData = findViewContext(input, artifact, String(membership.artifactViewId))
      if (!viewData) continue
      const sameVersion = String(viewData.revision.id) === revisionId
      const canvasId = typeof workspace.canvasId === 'string' ? workspace.canvasId : undefined
      rows.push({ kind: 'workspace', projectId: input.projectId, artifactId: String(artifact.id),
        artifactViewId: String(viewData.view.id), revisionId: String(viewData.revision.id), fileRecordId: viewData.fileRecordId,
        scopeId: String(workspace.scopeId), artifactViewScopeId: String(viewData.view.scopeId),
        workspaceId: String(workspace.id), ...(canvasId ? { canvasId } : {}), sameVersion,
        placed: locations.some(location => location.workspaceId === String(workspace.id)
          && location.artifactViewId === String(viewData.view.id) && location.revisionId === String(viewData.revision.id)) });
    }
  }
  for (const presentation of input.presentations) {
    if (presentation.projectId !== input.projectId) continue
    for (const viewId of presentation.state.memberViewIds ?? []) {
      const viewData = findViewContext(input, artifact, String(viewId))
      if (!viewData) continue
      const sameVersion = String(viewData.revision.id) === revisionId
      rows.push({ kind: 'presentation', projectId: input.projectId, artifactId: String(artifact.id),
        artifactViewId: String(viewData.view.id), revisionId: String(viewData.revision.id), fileRecordId: viewData.fileRecordId,
        scopeId: String(presentation.scopeId), artifactViewScopeId: String(viewData.view.scopeId),
        presentationId: presentation.id, capability: presentation.capability, sameVersion,
        placed: locations.some(location => location.scopeId === String(presentation.scopeId)
          && location.artifactViewId === String(viewData.view.id) && location.revisionId === String(viewData.revision.id)) });
    }
  }
  return rows
}

/** Pure read-model aggregation. Core owns entities/membership; Canvas DTO + Core binding prove placements. */
export function buildNativeMaterialContext(input: NativeMaterialContextInput): NativeMaterialContext {
  const identity = { projectId: input.projectId, artifactId: input.artifactId, revisionId: input.revisionId }
  const sourcePath = sourcePathState(input.sourcePath)
  if (!nonEmpty(input.projectId) || !nonEmpty(input.artifactId) || !nonEmpty(input.revisionId)
    || String(input.graph.project?.id ?? '') !== input.projectId) {
    return unavailableContext(input, '项目、材料、精确 Revision 或 Core 项目图身份不可用。')
  }
  const selected = artifactRevision(input)
  if (!selected) return unavailableContext(input, '所选 Artifact/Revision/FileRecord 缺失、重复、跨项目或仍是草稿。')
  const detailIssue = sourceReadiness(input, selected.artifact, selected.revision)
  if (detailIssue) return unavailableContext(input, detailIssue)

  const rejectedLocations: NativeMaterialRejectedLocation[] = []
  const locations: NativeMaterialLocationRow[] = []
  const seenCanvasIds = new Set<string>()
  for (const canvas of input.canvases) {
    if (!nonEmpty(canvas.canvasId)) {
      rejectedLocations.push({ canvasId: '<unknown>', nodeId: '<canvas>', reason: 'Canvas ID 缺失。' })
      continue
    }
    if (seenCanvasIds.has(canvas.canvasId)) {
      rejectedLocations.push({ canvasId: canvas.canvasId, nodeId: '<canvas>', reason: '输入包含重复 Canvas DTO，不能确定空间现场。' })
      continue
    }
    seenCanvasIds.add(canvas.canvasId)
    const owner = canvasWorkspace(input, canvas.canvasId)
    if (!owner.workspace) {
      rejectedLocations.push({ canvasId: canvas.canvasId, nodeId: '<canvas>', reason: owner.reason ?? 'Canvas Workspace 身份不可用。' })
      continue
    }

    const nodeIds = new Map<string, number>()
    for (const node of canvas.nodes) if (nonEmpty(node?.id)) nodeIds.set(node.id, (nodeIds.get(node.id) ?? 0) + 1)
    const duplicateNodeIds = new Set([...nodeIds].filter(([, count]) => count > 1).map(([id]) => id))
    const nodesById = new Map(canvas.nodes.filter(node => nonEmpty(node?.id) && nodeIds.get(node.id) === 1).map(node => [node.id, node]))
    const index = indexById([...nodesById.values()] as never[])
    const absolutePosition = createAbsolutePositionGetter(index)

    const canvasEntries = new Map<string, { readonly nodeId: string; readonly artifactId: string; readonly artifactViewId: string;
      readonly revisionId: string; readonly fileRecordId: string; readonly nativeRef: NativeMaterialMetadataNativeRef }>()
    const imageRead = resolveNativeMaterialMetadata({ projectId: input.projectId, canvasId: canvas.canvasId,
      nodes: canvas.nodes, graph: input.graph, bindings: input.bindings })
    if (imageRead.status === 'ready') {
      for (const entry of imageRead.byNodeId.values()) if (entry.artifactId === input.artifactId) {
        canvasEntries.set(entry.nodeId, { nodeId: entry.nodeId, artifactId: entry.artifactId,
          artifactViewId: entry.artifactViewId, revisionId: entry.revisionId,
          fileRecordId: entry.fileRecordId, nativeRef: entry.nativeRef })
      }
      for (const [nodeId, reason] of imageRead.rejectedByNodeId) {
        const node = nodesById.get(nodeId)
        const ref = readNativeTextReference(node?.data?.lcos_ref)
        if (ref?.artifactId === input.artifactId) rejectedLocations.push({ canvasId: canvas.canvasId, nodeId,
          artifactId: ref.artifactId, artifactViewId: ref.artifactViewId, revisionId: ref.revisionId, reason })
      }
    } else if (canvas.nodes.some(node => node.type === 'image')) {
      rejectedLocations.push({ canvasId: canvas.canvasId, nodeId: '<canvas>', reason: imageRead.reason ?? '图片材料身份不可用。' })
    }

    for (const node of canvas.nodes) {
      if (!nonEmpty(node?.id)) continue
      if (duplicateNodeIds.has(node.id)) {
        rejectedLocations.push({ canvasId: canvas.canvasId, nodeId: node.id, reason: 'Canvas 中存在重复 Node ID。' })
        continue
      }
      let entry = canvasEntries.get(node.id)
      if (!entry && (node.type === 'text' || node.type === 'note')) {
        const parsed = textNodeEntry(input, canvas.canvasId, node)
        if ('reason' in parsed) {
          const ref = readNativeTextReference(node.data?.lcos_ref)
          if (ref?.artifactId === input.artifactId) rejectedLocations.push({ canvasId: canvas.canvasId, nodeId: node.id,
            artifactId: ref.artifactId, artifactViewId: ref.artifactViewId, revisionId: ref.revisionId, reason: parsed.reason })
          continue
        }
        entry = parsed.entry
      }
      if (!entry || entry.artifactId !== input.artifactId) continue
      const locationBase = { canvasId: canvas.canvasId, nodeId: node.id, artifactId: entry.artifactId,
        artifactViewId: entry.artifactViewId, revisionId: entry.revisionId }
      const viewData = findViewContext(input, selected.artifact, entry.artifactViewId)
      if (!viewData || String(viewData.revision.id) !== entry.revisionId || viewData.fileRecordId !== entry.fileRecordId) {
        rejectedLocations.push({ ...locationBase, reason: '画布引用与 Core View/Revision/FileRecord 不一致。' })
        continue
      }
      if (String(viewData.view.scopeId) !== String(owner.workspace.scopeId)) {
        rejectedLocations.push({ ...locationBase, reason: 'ArtifactView 与 Workspace Scope 不一致，不能把跨 Scope 成员当作此画布落位。' })
        continue
      }
      const ancestryIssue = positionProblem(node.id, nodesById)
      if (ancestryIssue) {
        rejectedLocations.push({ ...locationBase, reason: ancestryIssue })
        continue
      }
      const position = absolutePosition(node.id) as { readonly x?: unknown; readonly y?: unknown } | undefined
      const size = measuredSize(node)
      if (!position || typeof position.x !== 'number' || typeof position.y !== 'number'
        || !Number.isFinite(position.x) || !Number.isFinite(position.y)) {
        rejectedLocations.push({ ...locationBase, reason: 'Canvas 绝对位置暂不可计算。' })
        continue
      }
      if (!size) {
        rejectedLocations.push({ ...locationBase, reason: 'Canvas 节点缺少有效 measured 尺寸。' })
        continue
      }
      locations.push({ projectId: input.projectId, workspaceId: String(owner.workspace.id), scopeId: String(owner.workspace.scopeId),
        canvasId: canvas.canvasId, nodeId: node.id, artifactId: entry.artifactId, artifactViewId: entry.artifactViewId,
        revisionId: entry.revisionId, fileRecordId: entry.fileRecordId, sameVersion: entry.revisionId === input.revisionId,
        position: { x: position.x, y: position.y }, size,
        bindingEntityType: entry.nativeRef.entityType })
    }
  }

  const memberships = membershipRows(input, selected.artifact, input.revisionId, locations)
  const issues = input.graph.workspaceMemberships === undefined ? ['Core workspace membership 未随项目图读取；成员状态不可判定。'] : []
  return {
    status: 'ready', identity,
    source: {
      revision: { revisionId: String(selected.revision.id), source: selected.revision.source,
        ...(selected.revision.runId === undefined ? {} : { runId: String(selected.revision.runId) }),
        fileRecordId: selected.fileRecordId },
      registeredSource: sourcePath,
      artifactDetailStatus: detailStatus(input.artifactDetail),
    },
    memberships, locations, rejectedLocations, issues,
  }
}

export function verifyNativeMaterialLocation(context: NativeMaterialContext, location: NativeMaterialLocationRow): {
  readonly canNavigate: boolean
  readonly reason?: string
  readonly location?: NativeMaterialLocationRow
} {
  if (context.status !== 'ready' || location.projectId !== context.identity.projectId
    || location.artifactId !== context.identity.artifactId) return { canNavigate: false, reason: '材料或项目身份未确认。' }
  const exact = context.locations.find(item => item.projectId === location.projectId && item.workspaceId === location.workspaceId
    && item.scopeId === location.scopeId && item.canvasId === location.canvasId && item.nodeId === location.nodeId
    && item.artifactId === location.artifactId && item.artifactViewId === location.artifactViewId
    && item.revisionId === location.revisionId && item.fileRecordId === location.fileRecordId
    && item.sameVersion === location.sameVersion
    && item.position.x === location.position.x && item.position.y === location.position.y
    && item.size.width === location.size.width && item.size.height === location.size.height
    && item.bindingEntityType === location.bindingEntityType)
  if (!exact) return { canNavigate: false, reason: '该 Canvas 位置不在本次 Core/Binding/Canvas 读回结果中。' }
  if (!exact.sameVersion || exact.revisionId !== context.identity.revisionId) {
    return { canNavigate: false, reason: `该现场显示的是 Revision ${exact.revisionId}，不是所选版本 ${context.identity.revisionId}。` }
  }
  return { canNavigate: true, location: exact }
}
