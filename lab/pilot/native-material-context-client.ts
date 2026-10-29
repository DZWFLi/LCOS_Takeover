import { createProjectionBindingRegistry } from '@local-creative-os/web-gen2'

import type { LcosCoreSession } from '../../lcos/huabu/apps/web/src/lcos/app/lcosCoreClient.ts'
import { buildNativeMaterialContext } from './native-material-context.ts'
import type { NativeMaterialContext, NativeMaterialContextInput } from './native-material-context.ts'

type CanvasSnapshot = NativeMaterialContextInput['canvases'][number]
type ArtifactDetailInput = NonNullable<NativeMaterialContextInput['artifactDetail']>
type SourcePathInput = NonNullable<NativeMaterialContextInput['sourcePath']>
type UnknownRecord = Record<string, unknown>

export interface NativeMaterialContextReadResult {
  readonly input: NativeMaterialContextInput
  readonly context: NativeMaterialContext
}

export class NativeMaterialContextCanvasReadError extends Error {
  readonly failedCanvas: string

  constructor(canvasId: string, reason: string) {
    super('Canvas ' + canvasId + ' 读取未确认：' + reason)
    this.name = 'NativeMaterialContextCanvasReadError'
    this.failedCanvas = canvasId
  }
}

function record(value: unknown): UnknownRecord | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : undefined
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message
  const message = record(error)?.message
  return typeof message === 'string' && message.trim() ? message : fallback
}

function errorStatus(error: unknown): number | undefined {
  const status = record(error)?.status
  return typeof status === 'number' && Number.isInteger(status) ? status : undefined
}

function isAbort(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true
  if (error instanceof Error && error.name === 'AbortError') return true
  return record(error)?.code === 'aborted'
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return
  const error = new Error('Native material context read was aborted.')
  error.name = 'AbortError'
  throw error
}

async function readArtifactDetail(
  session: LcosCoreSession,
  artifactId: string,
  signal?: AbortSignal,
): Promise<ArtifactDetailInput> {
  try {
    return await session.artifacts.getArtifactDetail(artifactId, signal)
  } catch (error) {
    if (isAbort(error, signal)) throw error
    return {
      status: 'unavailable',
      reason: errorMessage(error, 'Artifact detail 读取失败。'),
    }
  }
}

async function readSourcePath(
  session: LcosCoreSession,
  artifactId: string,
  signal?: AbortSignal,
): Promise<SourcePathInput> {
  try {
    const value = await session.artifacts.artifactSourcePath(artifactId, signal)
    if (!nonEmpty(value.path) || typeof value.exists !== 'boolean' || typeof value.isUrl !== 'boolean') {
      return { status: 'unavailable', reason: 'Artifact source-path 回执不完整。' }
    }
    return { status: 'registered', path: value.path, exists: value.exists, isUrl: value.isUrl }
  } catch (error) {
    if (isAbort(error, signal)) throw error
    if (errorStatus(error) === 404) return { status: 'unregistered' }
    return {
      status: 'unavailable',
      reason: errorMessage(error, 'Artifact source-path 读取失败。'),
    }
  }
}

function validateProjectReads(
  projectId: string,
  graph: NonNullable<Awaited<ReturnType<LcosCoreSession['projects']['getProjectGraph']>>>,
  workspaces: NativeMaterialContextInput['workspaces'],
  bindings: NativeMaterialContextInput['bindings'],
  presentations: NativeMaterialContextInput['presentations'],
): void {
  if (String(graph.project?.id ?? '') !== projectId) {
    throw new Error('Core Project Graph 的项目身份与请求不一致。')
  }
  for (const workspace of workspaces) {
    if (String(workspace.projectId) !== projectId) {
      throw new Error('Workspace 读取包含其他项目的现场。')
    }
  }
  for (const workspace of graph.workspaces) {
    if (String(workspace.projectId) !== projectId) {
      throw new Error('Project Graph 的 Workspace 包含其他项目的现场。')
    }
  }
  for (const binding of bindings) {
    if (String(binding.projectId) !== projectId) {
      throw new Error('Projection binding 读取包含其他项目的空间身份。')
    }
  }
  for (const presentation of presentations) {
    if (String(presentation.projectId) !== projectId) {
      throw new Error('Presentation 读取包含其他项目的成员关系。')
    }
  }
}

function validateCanvasWorkspace(
  projectId: string,
  canvasId: string,
  graph: NativeMaterialContextInput['graph'],
  workspaces: NativeMaterialContextInput['workspaces'],
): void {
  const matches = workspaces.filter(workspace => String(workspace.canvasId ?? '') === canvasId)
  if (matches.length !== 1) {
    throw new Error('绑定 Canvas ' + canvasId + ' 没有唯一 Workspace；未读取空间节点。')
  }
  const workspace = matches[0]
  const workspaceId = String(workspace.id ?? '')
  const scopeId = String(workspace.scopeId ?? '')
  if (String(workspace.projectId) !== projectId || !nonEmpty(workspaceId) || !nonEmpty(scopeId)) {
    throw new Error('绑定 Canvas ' + canvasId + ' 的 Workspace 身份不完整或跨项目。')
  }

  const endpointIdentityMatches = workspaces.filter(item => String(item.id) === workspaceId)
  const graphWorkspaceMatches = graph.workspaces.filter(item => String(item.id) === workspaceId)
  const graphCanvasMatches = graph.workspaces.filter(item => String(item.canvasId ?? '') === canvasId)
  const scopeMatches = graph.scopes.filter(item => String(item.id) === scopeId)
  if (endpointIdentityMatches.length !== 1 || graphWorkspaceMatches.length !== 1
    || graphCanvasMatches.length !== 1 || scopeMatches.length !== 1) {
    throw new Error('绑定 Canvas ' + canvasId + ' 的 Workspace/Scope 映射不唯一。')
  }
  const graphWorkspace = graphWorkspaceMatches[0]
  if (String(graphWorkspace.projectId) !== projectId
    || String(graphWorkspace.canvasId ?? '') !== canvasId
    || String(graphWorkspace.scopeId) !== scopeId
    || String(scopeMatches[0].projectId) !== projectId) {
    throw new Error('绑定 Canvas ' + canvasId + ' 与 Core Graph 的 Workspace/Scope 映射不一致。')
  }
}

function canvasIdsForMaterial(
  projectId: string,
  artifactId: string,
  graph: NativeMaterialContextInput['graph'],
  bindings: NativeMaterialContextInput['bindings'],
): string[] {
  const artifactViewIds = new Set(graph.artifactViews
    .filter(view => String(view.artifactId) === artifactId)
    .map(view => String(view.id)))
  const relevant = bindings.filter(binding => binding.spatialKind === 'node'
    && ((binding.entityType === 'artifact' && String(binding.entityId) === artifactId)
      || (binding.entityType === 'view' && artifactViewIds.has(String(binding.entityId)))))
  const canvasIds = new Set<string>()
  for (const binding of relevant) {
    if (String(binding.projectId) !== projectId || !nonEmpty(binding.canvasId) || !nonEmpty(binding.spatialId)) {
      throw new Error('Artifact/View 的 Projection binding 身份不完整或跨项目。')
    }
    canvasIds.add(String(binding.canvasId))
  }
  return [...canvasIds]
}

function canvasIdentity(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value)
  return undefined
}

function responseCanvasIds(payload: UnknownRecord, data: UnknownRecord): unknown[] {
  const nestedCanvas = record(data.canvas)
  return [
    data.id,
    data.canvas_id,
    data.canvasId,
    nestedCanvas?.id,
    nestedCanvas?.canvas_id,
    nestedCanvas?.canvasId,
    payload.canvas_id,
  ].filter(value => value !== undefined && value !== null)
}

function parseCanvasSnapshot(payload: unknown, canvasId: string): CanvasSnapshot {
  const envelope = record(payload)
  const data = record(envelope?.data)
  if (!envelope || envelope.code !== 0 || !data) {
    throw new Error('Canvas API 未返回 code 0 的 data。')
  }
  const identities = responseCanvasIds(envelope, data).map(canvasIdentity)
  if (identities.length === 0 || identities.some(identity => identity === undefined)) {
    throw new Error('Canvas API 没有返回可核对的 canvas id。')
  }
  if (identities.some(identity => identity !== canvasId)) {
    throw new Error('Canvas API 返回的 id/canvas_id 与请求现场不一致。')
  }
  if (!Array.isArray(data.nodes)) {
    throw new Error('Canvas API 没有返回完整 nodes 数组。')
  }
  const nodes = data.nodes.map((item, index) => {
    const node = record(item)
    if (!node || !nonEmpty(node.id)) {
      throw new Error('Canvas nodes[' + index + '] 缺少稳定 Node ID。')
    }
    for (const value of [node.canvas_id, node.canvasId]) {
      if (value !== undefined && value !== null && canvasIdentity(value) !== canvasId) {
        throw new Error('Canvas nodes[' + index + '] 的 canvas_id 与请求现场不一致。')
      }
    }
    return node as CanvasSnapshot['nodes'][number]
  })
  return { canvasId, nodes }
}

async function readCanvasSnapshot(canvasId: string, signal?: AbortSignal): Promise<CanvasSnapshot> {
  try {
    const response = await fetch('/api/canvas/v1/canvases/' + encodeURIComponent(canvasId), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
      redirect: 'error',
      signal,
    })
    const payload: unknown = await response.json()
    if (!response.ok) {
      throw new Error('Canvas API HTTP ' + response.status + '.')
    }
    return parseCanvasSnapshot(payload, canvasId)
  } catch (error) {
    if (isAbort(error, signal)) throw error
    throw new NativeMaterialContextCanvasReadError(canvasId, errorMessage(error, '空间读取失败。'))
  }
}

/** Read only the exact Core metadata and bound native Canvas snapshots for one material revision. */
export async function readNativeMaterialContext(
  session: LcosCoreSession,
  projectId: string,
  artifactId: string,
  revisionId: string,
  signal?: AbortSignal,
): Promise<NativeMaterialContextReadResult> {
  if (!nonEmpty(projectId) || !nonEmpty(artifactId) || !nonEmpty(revisionId)) {
    throw new Error('Native material context requires project, artifact, and exact revision IDs.')
  }
  throwIfAborted(signal)

  const [maybeGraph, workspaces, bindings, presentations, artifactDetail, sourcePath] = await Promise.all([
    session.projects.getProjectGraph(projectId),
    session.projects.getWorkspaces(projectId, signal),
    createProjectionBindingRegistry(session.http, projectId).list(),
    session.projects.listPresentations(projectId, signal),
    readArtifactDetail(session, artifactId, signal),
    readSourcePath(session, artifactId, signal),
  ])
  if (!maybeGraph) throw new Error('Core Project Graph 为空；没有生成材料位置。')
  throwIfAborted(signal)
  validateProjectReads(projectId, maybeGraph, workspaces, bindings, presentations)

  const canvasIds = canvasIdsForMaterial(projectId, artifactId, maybeGraph, bindings)
  for (const canvasId of canvasIds) validateCanvasWorkspace(projectId, canvasId, maybeGraph, workspaces)
  const canvases = await Promise.all(canvasIds.map(canvasId => readCanvasSnapshot(canvasId, signal)))
  throwIfAborted(signal)

  const input: NativeMaterialContextInput = {
    projectId,
    artifactId,
    revisionId,
    graph: maybeGraph,
    workspaces,
    bindings,
    presentations,
    canvases,
    artifactDetail,
    sourcePath,
  }
  return { input, context: buildNativeMaterialContext(input) }
}
