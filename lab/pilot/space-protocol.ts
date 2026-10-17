type JsonRecord = Record<string, unknown>
type EdgeStyle = Record<string, string | number>

export type SpaceProtocolFailureCode =
  | 'INVALID_ARGUMENT'
  | 'UNKNOWN_FIELD'
  | 'CANVAS_NOT_FOUND'
  | 'CONNECTION_ENDPOINT_NOT_FOUND'
  | 'CONNECTION_NOT_FOUND'
  | 'CONNECTION_ID_CONFLICT'
  | 'CONNECTION_PAIR_CONFLICT'
  | 'SPATIAL_RESPONSE_INVALID'
  | 'SPATIAL_WRITE_REJECTED'
  | 'SPATIAL_WRITE_PARTIAL'
  | 'SPATIAL_TRANSPORT_UNAVAILABLE'
  | 'UNSUPPORTED_OPERATION'
  | 'CORE_WORKSPACE_RENAME_UNSUPPORTED'

export type SpaceProtocolSuccess<T> = {
  status: 200
  body: { code: 0; message: ''; msg: ''; data: T }
}

export type SpaceProtocolFailure = {
  status: number
  body: {
    code: number
    data: null
    message: string
    msg: string
    error: { code: SpaceProtocolFailureCode; message: string; details?: unknown }
  }
}

export type SpaceProtocolResult<T> = SpaceProtocolSuccess<T> | SpaceProtocolFailure

type WorkspaceRef = {
  id: string | number
  name: string
  canvasId?: string | null
  projectId?: string | number
}

export type SpaceProtocolDependencies = {
  repository: { getWorkspaces(projectId: string): WorkspaceRef[] }
  projectId: string
  spatial: {
    read(canvasId: string): Promise<unknown>
    execute(canvasId: string, commands: unknown[]): Promise<unknown>
  }
  coreOrigin: string
}

type SpatialEdge = {
  id: string
  source: string
  target: string
  data?: JsonRecord
  [key: string]: unknown
}

type Scene = { state: { nodes: Array<{ id: string }>; edges: SpatialEdge[] } }
type EdgeCheck = { id: string; exists: boolean; source?: string; target?: string; style?: EdgeStyle }
type ActionPlan = {
  index: number
  action: 'create' | 'update' | 'delete'
  commands: unknown[]
  edgeIds: string[]
  checks: EdgeCheck[]
  noopReason?: string
}
type VirtualEdge = { id: string; source: string; target: string; style: EdgeStyle }

class ProtocolFault extends Error {
  constructor(
    readonly status: number,
    readonly code: SpaceProtocolFailureCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
  }
}

const ALLOWED_CONNECTION_FIELDS = [
  'id', 'source', 'target', 'type', 'data', 'source_handle', 'target_handle', 'deletable', 'selectable',
]
const ALLOWED_STYLE_FIELDS = ['lineType', 'lineStyle', 'stroke', 'strokeWidth', 'direction', 'label', 'labelSource']
const ALLOWED_TAPNOW_TYPES = new Set(['default', 'bezier', 'straight', 'step', 'smoothstep'])
const MAX_ACTIONS = 200
const MAX_ITEMS_PER_ACTION = 1000

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    throw new ProtocolFault(400, 'INVALID_ARGUMENT', `${label} must be a plain object.`)
  }
  return value as JsonRecord
}

function assertKeys(value: JsonRecord, allowed: readonly string[], label: string): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key))
  if (unknown.length) {
    throw new ProtocolFault(400, 'UNKNOWN_FIELD', `${label} contains unsupported field(s): ${unknown.join(', ')}.`, { fields: unknown })
  }
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.trim() !== value) {
    throw new ProtocolFault(400, 'INVALID_ARGUMENT', `${label} must be a non-empty string without surrounding whitespace.`)
  }
  return value
}

function assertLoopbackOrigin(value: string): void {
  let origin: URL
  try { origin = new URL(value) } catch { throw new Error('coreOrigin must be an explicit loopback HTTP origin.') }
  if (origin.protocol !== 'http:' || !['127.0.0.1', 'localhost', '::1', '[::1]'].includes(origin.hostname)
      || !origin.port || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) {
    throw new Error('coreOrigin must be an explicit loopback HTTP origin.')
  }
}

function failure(status: number, code: SpaceProtocolFailureCode, message: string, details?: unknown): SpaceProtocolFailure {
  return {
    status,
    body: {
      code: status * 100,
      data: null,
      message,
      msg: message,
      error: { code, message, ...(details === undefined ? {} : { details }) },
    },
  }
}

function success<T>(data: T): SpaceProtocolSuccess<T> {
  return { status: 200, body: { code: 0, message: '', msg: '', data } }
}

function pairKey(source: string, target: string): string {
  return JSON.stringify([source, target])
}

function styleForEdge(edge: SpatialEdge): EdgeStyle {
  const edgeStyle = edge.data?.edgeStyle
  return edgeStyle && typeof edgeStyle === 'object' && !Array.isArray(edgeStyle)
    ? { ...(edgeStyle as EdgeStyle) }
    : {}
}

function sameStyle(left: EdgeStyle, right: EdgeStyle): boolean {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)])
  return [...keys].every((key) => left[key] === right[key])
}

function edgeFromState(value: unknown): SpatialEdge {
  const edge = record(value, 'Huabu edge')
  const id = nonEmptyString(edge.id, 'Huabu edge.id')
  const source = nonEmptyString(edge.source, 'Huabu edge.source')
  const target = nonEmptyString(edge.target, 'Huabu edge.target')
  return { ...edge, id, source, target }
}

function readScene(value: unknown): Scene {
  const outer = record(value, 'Huabu spatial read')
  const state = record(outer.state, 'Huabu spatial read.state')
  if (!Array.isArray(state.nodes) || !Array.isArray(state.edges)) {
    throw new ProtocolFault(502, 'SPATIAL_RESPONSE_INVALID', 'Huabu did not return node and connection arrays.')
  }
  const nodes = state.nodes.map((value) => {
    const node = record(value, 'Huabu node')
    return { id: nonEmptyString(node.id, 'Huabu node.id') }
  })
  const edges = state.edges.map(edgeFromState)
  if (new Set(edges.map((edge) => edge.id)).size !== edges.length) {
    throw new ProtocolFault(502, 'SPATIAL_RESPONSE_INVALID', 'Huabu returned duplicate connection IDs.')
  }
  return { state: { nodes, edges } }
}

function parseStyle(value: unknown, label: string): EdgeStyle {
  const style = record(value, label)
  assertKeys(style, ALLOWED_STYLE_FIELDS, label)
  for (const [key, field] of Object.entries(style)) {
    if (key === 'lineType' && !['bezier', 'straight', 'step'].includes(String(field))) {
      throw new ProtocolFault(400, 'INVALID_ARGUMENT', `${label}.lineType is not supported.`)
    }
    if (key === 'lineStyle' && !['solid', 'dashed', 'dotted'].includes(String(field))) {
      throw new ProtocolFault(400, 'INVALID_ARGUMENT', `${label}.lineStyle is not supported.`)
    }
    if (key === 'direction' && !['none', 'forward', 'backward', 'both'].includes(String(field))) {
      throw new ProtocolFault(400, 'INVALID_ARGUMENT', `${label}.direction is not supported.`)
    }
    if (key === 'labelSource' && !['auto', 'user', 'agent'].includes(String(field))) {
      throw new ProtocolFault(400, 'INVALID_ARGUMENT', `${label}.labelSource is not supported.`)
    }
    if (key === 'stroke' && (typeof field !== 'string' || !field)) {
      throw new ProtocolFault(400, 'INVALID_ARGUMENT', `${label}.stroke must be a non-empty string.`)
    }
    if (key === 'strokeWidth' && (typeof field !== 'number' || !Number.isFinite(field) || field <= 0)) {
      throw new ProtocolFault(400, 'INVALID_ARGUMENT', `${label}.strokeWidth must be a positive finite number.`)
    }
    if (key === 'label' && (typeof field !== 'string' || field.length > 120)) {
      throw new ProtocolFault(400, 'INVALID_ARGUMENT', `${label}.label must be a string of at most 120 characters.`)
    }
  }
  return style as EdgeStyle
}

function stylePatchFromConnection(value: JsonRecord, label: string): EdgeStyle {
  const result: EdgeStyle = {}
  if (value.type !== undefined) {
    if (typeof value.type !== 'string' || !ALLOWED_TAPNOW_TYPES.has(value.type)) {
      throw new ProtocolFault(501, 'UNSUPPORTED_OPERATION', `${label}.type cannot be represented by Huabu.`)
    }
    if (value.type !== 'default') {
      result.lineType = value.type === 'smoothstep' ? 'step' : value.type
    }
  }
  if (value.data !== undefined) {
    const data = record(value.data, `${label}.data`)
    assertKeys(data, ['edgeStyle'], `${label}.data`)
    if (data.edgeStyle !== undefined) {
      const style = parseStyle(data.edgeStyle, `${label}.data.edgeStyle`)
      for (const [key, field] of Object.entries(style)) {
        if (result[key] !== undefined && result[key] !== field) {
          throw new ProtocolFault(400, 'INVALID_ARGUMENT', `${label}.type conflicts with data.edgeStyle.${key}.`)
        }
        result[key] = field
      }
    }
  }
  return result
}

function validateHandlesAndFlags(value: JsonRecord, label: string): void {
  for (const key of ['source_handle', 'target_handle']) {
    const handle = value[key]
    if (handle !== undefined && handle !== null && handle !== '') {
      throw new ProtocolFault(501, 'UNSUPPORTED_OPERATION', `${label}.${key} is not persisted by Huabu.`)
    }
  }
  for (const key of ['deletable', 'selectable']) {
    if (value[key] !== undefined && value[key] !== true) {
      throw new ProtocolFault(501, 'UNSUPPORTED_OPERATION', `${label}.${key}=false is not persisted by Huabu.`)
    }
  }
}

function commandEdge(edge: VirtualEdge): JsonRecord {
  return {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    ...(Object.keys(edge.style).length ? { style: edge.style } : {}),
  }
}

function connectionsFor(scene: Scene): JsonRecord[] {
  return scene.state.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    source_handle: typeof edge.sourceHandle === 'string' ? edge.sourceHandle : null,
    target_handle: typeof edge.targetHandle === 'string' ? edge.targetHandle : null,
    type: typeof edge.type === 'string' ? edge.type : 'default',
    data: edge.data ?? {},
  }))
}

function checkPostconditions(checks: EdgeCheck[], scene: Scene): string[] {
  const actual = new Map(scene.state.edges.map((edge) => [edge.id, edge]))
  const failed: string[] = []
  for (const check of checks) {
    const edge = actual.get(check.id)
    if (!check.exists) {
      if (edge) failed.push(check.id)
      continue
    }
    if (!edge || edge.source !== check.source || edge.target !== check.target) {
      failed.push(check.id)
      continue
    }
    if (check.style) {
      const actualStyle = styleForEdge(edge)
      if (Object.entries(check.style).some(([key, value]) => actualStyle[key] !== value)) failed.push(check.id)
    }
  }
  return [...new Set(failed)]
}

function stateSignature(scene: Scene): string {
  return JSON.stringify(scene.state.edges
    .map((edge) => ({ id: edge.id, source: edge.source, target: edge.target, style: styleForEdge(edge) }))
    .sort((a, b) => a.id.localeCompare(b.id)))
}

export function createSpaceProtocol({ repository, projectId, spatial, coreOrigin }: SpaceProtocolDependencies) {
  if (typeof projectId !== 'string' || !projectId.trim()) throw new Error('projectId is required.')
  assertLoopbackOrigin(coreOrigin)

  function workspaceForCanvas(canvasId: string): WorkspaceRef | undefined {
    return repository.getWorkspaces(projectId).find((workspace) => String(workspace.canvasId ?? '') === canvasId)
  }

  function planActions(actions: unknown[], canvasId: string, initial: Scene): ActionPlan[] {
    if (actions.length > MAX_ACTIONS) throw new ProtocolFault(400, 'INVALID_ARGUMENT', `actions may contain at most ${MAX_ACTIONS} items.`)
    const nodeIds = new Set(initial.state.nodes.map((node) => node.id))
    const virtual = new Map<string, VirtualEdge>()
    for (const edge of initial.state.edges) virtual.set(edge.id, {
      id: edge.id, source: edge.source, target: edge.target, style: styleForEdge(edge),
    })
    const plans: ActionPlan[] = []

    const assertEndpoints = (source: string, target: string, label: string) => {
      if (source === target) throw new ProtocolFault(400, 'INVALID_ARGUMENT', `${label} cannot connect a node to itself.`)
      const missing = [source, target].filter((id) => !nodeIds.has(id))
      if (missing.length) throw new ProtocolFault(404, 'CONNECTION_ENDPOINT_NOT_FOUND', `${label} refers to a node outside this canvas.`, { missingNodeIds: missing, canvasId })
    }
    const assertPairAvailable = (source: string, target: string, exceptId?: string) => {
      const duplicate = [...virtual.values()].find((edge) => edge.id !== exceptId && edge.source === source && edge.target === target)
      if (duplicate) throw new ProtocolFault(409, 'CONNECTION_PAIR_CONFLICT', 'Huabu already has a connection with the same direction and endpoints.', { existingEdgeId: duplicate.id, source, target })
    }

    actions.forEach((rawAction, index) => {
      const action = record(rawAction, `actions[${index}]`)
      const actionName = action.action
      if (actionName === 'create') {
        assertKeys(action, ['action', 'creates'], `actions[${index}]`)
        if (!Array.isArray(action.creates) || action.creates.length > MAX_ITEMS_PER_ACTION) {
          throw new ProtocolFault(400, 'INVALID_ARGUMENT', `actions[${index}].creates must be an array of at most ${MAX_ITEMS_PER_ACTION} connections.`)
        }
        const createEdges: VirtualEdge[] = []
        const checks: EdgeCheck[] = []
        for (const [itemIndex, raw] of action.creates.entries()) {
          const item = record(raw, `actions[${index}].creates[${itemIndex}]`)
          assertKeys(item, ALLOWED_CONNECTION_FIELDS, `actions[${index}].creates[${itemIndex}]`)
          validateHandlesAndFlags(item, `actions[${index}].creates[${itemIndex}]`)
          const id = nonEmptyString(item.id, `actions[${index}].creates[${itemIndex}].id`)
          const source = nonEmptyString(item.source, `actions[${index}].creates[${itemIndex}].source`)
          const target = nonEmptyString(item.target, `actions[${index}].creates[${itemIndex}].target`)
          assertEndpoints(source, target, `actions[${index}].creates[${itemIndex}]`)
          const style = stylePatchFromConnection(item, `actions[${index}].creates[${itemIndex}]`)
          const existing = virtual.get(id)
          if (existing) {
            if (existing.source === source && existing.target === target && sameStyle(existing.style, style)) {
              checks.push({ id, exists: true, source, target, ...(Object.keys(style).length ? { style } : {}) })
              continue
            }
            throw new ProtocolFault(409, 'CONNECTION_ID_CONFLICT', 'TapNow connection id already belongs to a different Huabu edge.', { edgeId: id })
          }
          assertPairAvailable(source, target)
          const edge = { id, source, target, style }
          virtual.set(id, edge)
          createEdges.push(edge)
          checks.push({ id, exists: true, source, target, ...(Object.keys(style).length ? { style } : {}) })
        }
        plans.push({ index, action: 'create', commands: createEdges.length ? [{ type: 'CONNECT_NODES', edges: createEdges.map(commandEdge) }] : [], edgeIds: checks.map((check) => check.id), checks,
          ...(createEdges.length ? {} : { noopReason: 'idempotent-create' }) })
        return
      }

      if (actionName === 'update') {
        assertKeys(action, ['action', 'updates'], `actions[${index}]`)
        if (!Array.isArray(action.updates) || action.updates.length > MAX_ITEMS_PER_ACTION) {
          throw new ProtocolFault(400, 'INVALID_ARGUMENT', `actions[${index}].updates must be an array of at most ${MAX_ITEMS_PER_ACTION} connections.`)
        }
        const seenIds = new Set<string>()
        const disconnectIds: string[] = []
        const reconnect: VirtualEdge[] = []
        const stylePatches: Array<{ edge: string; style: EdgeStyle }> = []
        const checks: EdgeCheck[] = []
        for (const [itemIndex, raw] of action.updates.entries()) {
          const item = record(raw, `actions[${index}].updates[${itemIndex}]`)
          assertKeys(item, ALLOWED_CONNECTION_FIELDS, `actions[${index}].updates[${itemIndex}]`)
          validateHandlesAndFlags(item, `actions[${index}].updates[${itemIndex}]`)
          const id = nonEmptyString(item.id, `actions[${index}].updates[${itemIndex}].id`)
          if (seenIds.has(id)) throw new ProtocolFault(400, 'INVALID_ARGUMENT', `actions[${index}].updates repeats edge id ${id}.`)
          seenIds.add(id)
          const current = virtual.get(id)
          if (!current) throw new ProtocolFault(404, 'CONNECTION_NOT_FOUND', `No Huabu connection with id ${id}.`, { edgeId: id })
          const source = item.source === undefined ? current.source : nonEmptyString(item.source, `actions[${index}].updates[${itemIndex}].source`)
          const target = item.target === undefined ? current.target : nonEmptyString(item.target, `actions[${index}].updates[${itemIndex}].target`)
          assertEndpoints(source, target, `actions[${index}].updates[${itemIndex}]`)
          const patch = stylePatchFromConnection(item, `actions[${index}].updates[${itemIndex}]`)
          const nextStyle = { ...current.style, ...patch }
          const endpointsChanged = source !== current.source || target !== current.target
          const styleChanged = !sameStyle(current.style, nextStyle)
          if (!endpointsChanged && !styleChanged) {
            checks.push({ id, exists: true, source, target })
            continue
          }
          assertPairAvailable(source, target, id)
          const next = { id, source, target, style: nextStyle }
          virtual.set(id, next)
          if (endpointsChanged) {
            disconnectIds.push(id)
            reconnect.push(next)
          } else if (Object.keys(patch).length) {
            stylePatches.push({ edge: id, style: patch })
          }
          checks.push({ id, exists: true, source, target, ...(Object.keys(patch).length ? { style: patch } : {}) })
        }
        const commands: unknown[] = []
        if (disconnectIds.length) commands.push({ type: 'DISCONNECT_EDGES', edges: disconnectIds })
        if (reconnect.length) commands.push({ type: 'CONNECT_NODES', edges: reconnect.map(commandEdge) })
        if (stylePatches.length) commands.push({ type: 'SET_EDGE_STYLE', edges: stylePatches })
        plans.push({ index, action: 'update', commands, edgeIds: [...seenIds], checks,
          ...(commands.length ? {} : { noopReason: 'unchanged' }) })
        return
      }

      if (actionName === 'delete') {
        assertKeys(action, ['action', 'delete_ids'], `actions[${index}]`)
        if (!Array.isArray(action.delete_ids) || action.delete_ids.length > MAX_ITEMS_PER_ACTION) {
          throw new ProtocolFault(400, 'INVALID_ARGUMENT', `actions[${index}].delete_ids must be an array of at most ${MAX_ITEMS_PER_ACTION} connection ids.`)
        }
        const ids = action.delete_ids.map((id, itemIndex) => nonEmptyString(id, `actions[${index}].delete_ids[${itemIndex}]`))
        if (new Set(ids).size !== ids.length) throw new ProtocolFault(400, 'INVALID_ARGUMENT', `actions[${index}].delete_ids contains duplicate ids.`)
        for (const id of ids) {
          if (!virtual.has(id)) throw new ProtocolFault(404, 'CONNECTION_NOT_FOUND', `No Huabu connection with id ${id}.`, { edgeId: id })
          virtual.delete(id)
        }
        plans.push({ index, action: 'delete', commands: ids.length ? [{ type: 'DISCONNECT_EDGES', edges: ids }] : [], edgeIds: ids,
          checks: ids.map((id) => ({ id, exists: false })), ...(ids.length ? {} : { noopReason: 'empty-delete' }) })
        return
      }

      throw new ProtocolFault(501, 'UNSUPPORTED_OPERATION', `actions[${index}].action must be create, update, or delete.`)
    })
    return plans
  }

  async function applyConnections(canvasIdValue: string, bodyValue: unknown): Promise<SpaceProtocolResult<JsonRecord>> {
    let initial: Scene | undefined
    let committedActions: Array<{ index: number; action: string; edge_ids: string[] }> = []
    try {
      const canvasId = nonEmptyString(canvasIdValue, 'canvasId')
      if (!workspaceForCanvas(canvasId)) throw new ProtocolFault(404, 'CANVAS_NOT_FOUND', 'No Core Workspace owns this canvas.')
      const body = record(bodyValue, 'body')
      assertKeys(body, ['canvas_id', 'actions'], 'body')
      if (body.canvas_id !== canvasId) throw new ProtocolFault(400, 'INVALID_ARGUMENT', 'body.canvas_id must match the route canvas id.')
      if (!Array.isArray(body.actions)) throw new ProtocolFault(400, 'INVALID_ARGUMENT', 'body.actions must be an array.')
      try { initial = readScene(await spatial.read(canvasId)) } catch (error) {
        if (error instanceof ProtocolFault) throw error
        throw new ProtocolFault(503, 'SPATIAL_TRANSPORT_UNAVAILABLE', 'Huabu could not read the selected canvas before the write.', { cause: error instanceof Error ? error.message : String(error) })
      }
      const plans = planActions(body.actions, canvasId, initial)
      const results: JsonRecord[] = []
      let latest = initial

      for (const plan of plans) {
        if (plan.commands.length === 0) {
          results.push({ action: plan.action, applied: false, reason: plan.noopReason, edge_ids: plan.edgeIds })
          continue
        }
        let execution: unknown
        try {
          execution = await spatial.execute(canvasId, plan.commands)
        } catch (error) {
          const observed = await spatial.read(canvasId).then(readScene).catch(() => undefined)
          const changed = observed ? stateSignature(observed) !== stateSignature(initial!) : undefined
          return failure(503, changed === true || committedActions.length ? 'SPATIAL_WRITE_PARTIAL' : 'SPATIAL_TRANSPORT_UNAVAILABLE',
            'Huabu execution did not return a confirmed result; inspect the observed canvas before retrying.', {
              partial: changed ?? (committedActions.length > 0 ? true : null),
              committedActions,
              failedAction: { index: plan.index, action: plan.action, edgeIds: plan.edgeIds },
              observedConnections: observed ? connectionsFor(observed) : null,
              cause: error instanceof Error ? error.message : String(error),
            })
        }
        const response = execution && typeof execution === 'object' && !Array.isArray(execution)
          ? execution as JsonRecord
          : {}
        const commandResults = response.results
        let rejected = !Array.isArray(commandResults) || commandResults.length !== plan.commands.length
        if (Array.isArray(commandResults) && commandResults.some((result) =>
          !result || typeof result !== 'object' || Array.isArray(result) || (result as JsonRecord).applied !== true)) rejected = true
        let observed: Scene | undefined
        try { observed = readScene(await spatial.read(canvasId)) } catch { /* The write result is not enough to claim a complete readback. */ }
        const failedChecks = observed ? checkPostconditions(plan.checks, observed) : plan.edgeIds
        if (rejected || !observed || failedChecks.length) {
          const changed = observed ? stateSignature(observed) !== stateSignature(initial!) : undefined
          const partial = changed ?? (committedActions.length > 0 ? true : null)
          return failure(partial === true ? 409 : (observed ? 409 : 502), partial === true ? 'SPATIAL_WRITE_PARTIAL' : 'SPATIAL_WRITE_REJECTED',
            observed ? 'Huabu rejected or did not persist the requested connection state.' : 'Huabu returned without a verifiable readback.', {
              partial,
              committedActions,
              failedAction: { index: plan.index, action: plan.action, edgeIds: plan.edgeIds },
              failedEdgeIds: failedChecks,
              commandResults: Array.isArray(commandResults) ? commandResults : null,
              observedConnections: observed ? connectionsFor(observed) : null,
            })
        }
        latest = observed
        committedActions.push({ index: plan.index, action: plan.action, edge_ids: plan.edgeIds })
        results.push({ action: plan.action, applied: true, edge_ids: plan.edgeIds })
      }

      latest = readScene(await spatial.read(canvasId))
      return success({ canvas_id: canvasId, actions: results, connections: connectionsFor(latest) })
    } catch (error) {
      if (error instanceof ProtocolFault) return failure(error.status, error.code, error.message, error.details)
      return failure(503, 'SPATIAL_TRANSPORT_UNAVAILABLE', 'Space protocol could not complete the request.', {
        committedActions,
        partial: committedActions.length > 0,
        cause: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async function renameCanvas(canvasIdValue: string, bodyValue: unknown): Promise<SpaceProtocolResult<JsonRecord>> {
    try {
      const canvasId = nonEmptyString(canvasIdValue, 'canvasId')
      const body = record(bodyValue, 'body')
      assertKeys(body, ['name'], 'body')
      const name = nonEmptyString(body.name, 'body.name')
      const workspace = workspaceForCanvas(canvasId)
      if (!workspace) throw new ProtocolFault(404, 'CANVAS_NOT_FOUND', 'No Core Workspace owns this canvas.')
      if (workspace.name === name) return success({ canvas_id: canvasId, workspace_id: String(workspace.id), name, applied: false, reason: 'already-named' })
      return failure(501, 'CORE_WORKSPACE_RENAME_UNSUPPORTED', 'Core’s existing workspace PUT route only writes canvasId; it ignores name, so no rename request was sent.', {
        workspaceId: String(workspace.id),
        requestedName: name,
        route: `PUT /projects/${encodeURIComponent(projectId)}/workspaces/${encodeURIComponent(String(workspace.id))}`,
        existingRouteEffect: 'updateWorkspaceCanvasId(canvasId)',
        attempted: false,
      })
    } catch (error) {
      if (error instanceof ProtocolFault) return failure(error.status, error.code, error.message, error.details)
      return failure(503, 'SPATIAL_TRANSPORT_UNAVAILABLE', 'Space protocol could not complete the rename request.', {
        cause: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return { applyConnections, renameCanvas }
}
