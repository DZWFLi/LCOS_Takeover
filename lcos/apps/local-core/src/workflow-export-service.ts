import { createHash } from 'node:crypto'
import type { SurfaceElementV0, WorkflowActionEdgeV0, WorkflowActionV0, WorkflowOperatorV0 } from '@local-creative-os/contracts'
import type { SqliteMetadataRepository } from './metadata-repository.js'
import type { PresentationApplicationService } from './presentation-application-service.js'
import { buildZip } from './zip-writer.js'
import { readZipArchive } from './resources/zip-reader.js'

/**
 * Phase 4 §7.6：Workflow 导出/导入（.lcos-workflow.zip）。
 * 中性格式：manifest.json + workflow.json + references.json。
 * Core 不执行语义条件；predicateText 只是创作内容。
 */

const encoder = new TextEncoder()

interface WorkflowFile {
  readonly members: string[]
  readonly workspaces: { readonly id: string; readonly title: string; readonly memberViewIds: string[]; readonly order: number }[]
  readonly edges: { readonly source: string; readonly target: string; readonly presentationRole?: string }[]
  readonly operators: Record<string, WorkflowOperatorV0>
  readonly actions?: WorkflowActionV0[]
  readonly actionEdges?: WorkflowActionEdgeV0[]
  readonly surfaceElements?: SurfaceElementV0[]
}

interface WorkflowArchive {
  readonly manifest: Record<string, unknown>
  readonly workflow: WorkflowFile
}

export class WorkflowExportService {
  constructor(
    private readonly metadata: SqliteMetadataRepository,
    private readonly presentation: PresentationApplicationService,
  ) {}

  export(projectId: string, scopeId: string): Uint8Array {
    const presentationId = `presentation:workflow:${scopeId}`
    const view = this.presentation.get(projectId, presentationId)
    const members = view?.state.memberViewIds ?? []
    const workspaces = this.metadata.getWorkspaces(projectId)
      .filter((workspace) => String(workspace.scopeId) === scopeId)
      .map((workspace, index) => ({
        id: String(workspace.id),
        title: workspace.name,
        memberViewIds: workspace.focusedViewIds.map((id) => String(id)),
        order: index,
      }))
    const edges = (view?.state.presentationEdges ?? []).map((edge) => ({
      source: edge.fromViewId,
      target: edge.toViewId,
      presentationRole: 'primary' as const,
    }))
    const operators = view?.state.workflowOperators ?? {}
    const actions = view?.state.workflowActions ?? []
    const actionEdges = view?.state.workflowActionEdges ?? []
    const surfaceElements = view?.state.surfaceElements ?? []
    const references = members.flatMap((id) => {
      const artifactView = this.metadata.getArtifactView(id)
      if (artifactView === undefined) return []
      const artifact = this.metadata.getArtifact(String(artifactView.artifactId))
      return [{ viewId: String(artifactView.id), artifactId: String(artifactView.artifactId), title: artifact?.title ?? '' }]
    })
    const workflow: WorkflowFile = { members, workspaces, edges, operators, actions, actionEdges, surfaceElements }
    const contentHash = createHash('sha256').update(JSON.stringify(workflow)).digest('hex')
    const manifest = {
      schemaVersion: 1,
      kind: 'lcos-workflow',
      title: view?.updatedBy === 'web' ? 'Workflow' : 'Workflow',
      sourceProjectId: projectId,
      workflowViewId: presentationId,
      exportedAt: new Date().toISOString(),
      contentHash: `sha256:${contentHash}`,
    }
    return buildZip([
      { path: 'manifest.json', bytes: encoder.encode(JSON.stringify(manifest, null, 2)) },
      { path: 'workflow.json', bytes: encoder.encode(JSON.stringify(workflow, null, 2)) },
      { path: 'references.json', bytes: encoder.encode(JSON.stringify({ references }, null, 2)) },
    ])
  }

  import(projectId: string, scopeId: string, bytes: Uint8Array): { readonly imported: boolean; readonly members: number; readonly workspaces: number } {
    const archive = this.#readAndValidateArchive(projectId, bytes)
    this.#writeWorkflow(projectId, scopeId, archive)
    return { imported: true, members: archive.workflow.members.length, workspaces: (archive.workflow.workspaces ?? []).length }
  }

  /**
   * Import a portable definition as a canonical Workflow scope + worksite.
   * The archive hash is the idempotency identity: replaying the same bytes for
   * the same project converges on the same scope/workspaces instead of creating
   * another collection. No second workflow store is introduced.
   */
  importAsWorkflow(projectId: string, bytes: Uint8Array, requestedName?: string) {
    const archive = this.#readAndValidateArchive(projectId, bytes)
    const graph = this.metadata.get(projectId)
    if (graph === undefined) throw new Error('Project not found.')
    const rootScope = graph.scopes.find((scope) => scope.kind === 'root') ?? graph.scopes[0]
    if (rootScope === undefined) throw new Error('Project has no root scope.')

    const digest = createHash('sha256').update(bytes).digest('hex').slice(0, 20)
    const scopeId = `scope-workflow-${digest}`
    const fallbackName = typeof archive.manifest.title === 'string' && archive.manifest.title.trim() !== ''
      ? archive.manifest.title.trim()
      : 'Workflow'
    const name = requestedName?.trim() || fallbackName
    const existingScope = graph.scopes.find((scope) => String(scope.id) === scopeId)
    if (existingScope !== undefined && existingScope.kind !== 'workflow') {
      throw new Error(`Workflow import identity ${scopeId} is already owned by a non-workflow scope.`)
    }

    const definitions = (archive.workflow.workspaces ?? []).length === 0
      ? [{ id: 'primary', title: name, memberViewIds: archive.workflow.members, order: 0 }]
      : [...(archive.workflow.workspaces ?? [])].sort((a, b) => a.order - b.order)
    const now = new Date().toISOString()
    const workspaceIds = definitions.map((workspace, index) => {
      const workspaceDigest = createHash('sha256').update(`${digest}\0${workspace.id}\0${index}`).digest('hex').slice(0, 12)
      return `workspace-workflow-${workspaceDigest}`
    })
    const desiredWorkspaces = definitions.map((workspace, index) => ({
      id: workspaceIds[index] as never,
      projectId: projectId as never,
      scopeId: scopeId as never,
      name: workspace.title || name,
      intent: 'build' as const,
      viewport: { x: 0, y: 0, zoom: 1 },
      focusedViewIds: workspace.memberViewIds as never[],
      visibleLayers: ['core', 'process'],
      contextPolicy: 'workspace-related' as const,
      preferredSurface: 'workflow',
      updatedAt: now,
    }))
    const existingWorkspaceIds = new Set(graph.workspaces.map((workspace) => String(workspace.id)))
    const missingWorkspaces = desiredWorkspaces.filter((workspace) => !existingWorkspaceIds.has(String(workspace.id)))
    const created = existingScope === undefined
    if (created || missingWorkspaces.length > 0) {
      this.metadata.applyMutations({
        baseVersion: graph.graphVersion,
        actorKind: 'user',
        ops: [
          ...(created ? [{
            type: 'upsert_scope' as const,
            scope: {
              id: scopeId as never,
              projectId: projectId as never,
              parentScopeId: rootScope.id,
              containerViewId: null,
              kind: 'workflow' as const,
              name,
              createdAt: now,
              updatedAt: now,
            },
          }] : []),
          ...missingWorkspaces.map((workspace) => ({ type: 'upsert_workspace' as const, workspace })),
        ],
      }, projectId)
    }

    this.#writeWorkflow(projectId, scopeId, archive, false)
    return {
      imported: true as const,
      created,
      scopeId,
      workspaceIds,
      members: archive.workflow.members.length,
      workspaces: desiredWorkspaces.length,
    }
  }

  #readAndValidateArchive(projectId: string, bytes: Uint8Array): WorkflowArchive {
    const entries = readZipArchive(Buffer.from(bytes))
    const readJson = (name: string): Record<string, unknown> => {
      const entry = entries.find((item) => item.path === name)
      if (entry === undefined) throw new Error(`Workflow archive is missing ${name}.`)
      return JSON.parse(entry.bytes.toString('utf8')) as Record<string, unknown>
    }
    const manifest = readJson('manifest.json')
    if (manifest.schemaVersion !== 1 || manifest.kind !== 'lcos-workflow') {
      throw new Error('Unsupported workflow archive schema (expected lcos-workflow schemaVersion 1).')
    }
    const workflow = readJson('workflow.json') as unknown as WorkflowFile
    const referencesFile = readJson('references.json') as { references?: { viewId: string; artifactId: string; title?: string }[] }

    if (!Array.isArray(workflow.members) || new Set(workflow.members).size !== workflow.members.length) {
      throw new Error('workflow.members must be a unique view id list.')
    }
    const memberSet = new Set(workflow.members)
    for (const edge of workflow.edges ?? []) {
      if (!memberSet.has(edge.source) || !memberSet.has(edge.target)) {
        throw new Error(`Workflow edge references a non-member (${edge.source} -> ${edge.target}).`)
      }
    }
    const workspaceIds = new Set<string>()
    for (const workspace of workflow.workspaces ?? []) {
      if (workspaceIds.has(workspace.id)) throw new Error(`Duplicate workspace id ${workspace.id}.`)
      workspaceIds.add(workspace.id)
    }
    for (const viewId of workflow.members) {
      const reference = (referencesFile.references ?? []).find((item) => item.viewId === viewId)
      if (reference === undefined) throw new Error(`Missing reference for member ${viewId}.`)
      const artifact = this.metadata.getArtifact(reference.artifactId)
      if (artifact === undefined || String(artifact.projectId) !== projectId) {
        throw new Error(`Reference artifact ${reference.artifactId} does not exist in this project.`)
      }
    }
    const actionIds = new Set((workflow.actions ?? []).map((action) => action.id))
    if (actionIds.size !== (workflow.actions ?? []).length) throw new Error('Workflow action ids must be unique.')
    for (const action of workflow.actions ?? []) {
      for (const viewId of action.attachedViewIds ?? []) if (!memberSet.has(viewId)) throw new Error(`Workflow action ${action.id} references non-member ${viewId}.`)
    }
    for (const edge of workflow.actionEdges ?? []) {
      if (!actionIds.has(edge.fromActionId) || !actionIds.has(edge.toActionId)) throw new Error(`Workflow action edge ${edge.id} references a missing action.`)
    }
    for (const [viewId, operator] of Object.entries(workflow.operators ?? {})) {
      if (!memberSet.has(viewId)) throw new Error(`Operator references non-member ${viewId}.`)
      for (const branch of operator.branches ?? []) {
        if (branch.targetViewId !== undefined && !memberSet.has(branch.targetViewId)) {
          throw new Error(`Operator branch target ${branch.targetViewId} is not a member.`)
        }
      }
    }

    return { manifest, workflow }
  }

  #writeWorkflow(projectId: string, scopeId: string, archive: WorkflowArchive, writeArchiveWorkspaces = true): void {
    const { workflow } = archive
    const now = new Date().toISOString()
    if (writeArchiveWorkspaces) {
      for (const workspace of (workflow.workspaces ?? []).sort((a, b) => a.order - b.order)) {
        this.metadata.upsertWorkspace({
          id: workspace.id as never,
          projectId: projectId as never,
          scopeId: scopeId as never,
          name: workspace.title,
          intent: null,
          viewport: { x: 0, y: 0, zoom: 1 },
          focusedViewIds: workspace.memberViewIds as never[],
          visibleLayers: ['core', 'process'],
          contextPolicy: 'workspace-related',
          updatedAt: now,
        })
      }
    }

    const presentationId = `presentation:workflow:${scopeId}`
    const existing = this.presentation.get(projectId, presentationId)
    this.presentation.save(projectId, {
      presentationId,
      scopeId: scopeId as never,
      capability: 'workflow',
      renderer: 'workflow',
      state: {
        memberViewIds: workflow.members,
        hiddenViewIds: [],
        positions: {},
        hierarchy: { parentByViewId: {}, orderByParent: {} },
        presentationEdges: (workflow.edges ?? []).map((edge, index) => ({ id: `presentation:${index}:${edge.source}:${edge.target}`, fromViewId: edge.source, toViewId: edge.target })),
        pinnedViewIds: [],
        emphasisByViewId: {},
        workflowOperators: workflow.operators ?? {},
        workflowActions: workflow.actions ?? [],
        workflowActionEdges: workflow.actionEdges ?? [],
        surfaceElements: (workflow.surfaceElements ?? []).map((element) => ({ ...element, projectId })),
      },
      expectedVersion: existing?.version ?? 0,
      updatedBy: 'agent',
    })
  }
}
