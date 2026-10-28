import { isDeepStrictEqual } from 'node:util'
import { nativeCanvasGuiUnboundNode } from './native-canvas-gui-markers.ts'

type Row = Record<string, any>
const record = (value: unknown): value is Row => !!value && typeof value === 'object' && !Array.isArray(value)
const keys = (value: Row, allowed: string[]) => Object.keys(value).every(key => allowed.includes(key))

/** A title intent travels in the original O8 entry. Huabu's node record is the
 * only label owner; this adapter has no title store or separate undo stack. */
export function createNativeOrdinaryFrameTitle({ repository, projectId, spatial, readContent, projectFrame, fail }: {
  repository: { getWorkspaces(projectId: string): readonly Row[]; getProjectionBindings(projectId: string): readonly Row[] }
  projectId: string
  spatial: { withCanvasLock<T>(canvasId: string, run: (locked: {
    read(): Promise<any>; execute(commands: unknown[]): Promise<any>
  }) => Promise<T>): Promise<T> }
  readContent(canvasId: string, nodeId: string): Promise<any>
  projectFrame(canvasId: string, source: Row, nodes: readonly Row[]): Row | undefined
  fail(status: number, code: string, message: string): never
}) {
  const reject = (code: string, message: string, status = 409): never => fail(status, code, message)
  const identify = async (canvasId: string, snapshot: Row, nodeId: string) => {
    const owners = repository.getWorkspaces(projectId).filter(row => row.canvasId === canvasId)
    const nodes = snapshot?.state?.nodes
    if (owners.length !== 1 || String(owners[0]?.projectId) !== projectId || !Array.isArray(nodes))
      reject('FRAME_TITLE_OWNER_UNAVAILABLE', '当前画布归属尚未确认，名称未保存。')
    const matches = nodes.filter((node: Row) => node.id === nodeId)
    const node = matches[0]
    if (matches.length !== 1 || node?.type !== 'frame'
      || !nativeCanvasGuiUnboundNode({ ...node, data: { ...node.data, id: node.data?.id ?? node.id } },
        repository.getProjectionBindings(projectId), canvasId))
      reject('FRAME_TITLE_IDENTITY_MISMATCH', '此框的原始身份已变化，名称未保存。')
    const saved = await readContent(canvasId, nodeId)
    if (!saved || saved.record?.nodeId !== nodeId || saved.record?.type !== 'frame'
      || saved.record.label !== null && typeof saved.record.label !== 'string')
      reject('FRAME_TITLE_CONTENT_UNAVAILABLE', '此框的原名称暂不可读，输入已保留。')
    const source = { ...node, data: { ...node.data, label: saved.record.label } }
    // Existing projection validates exact parent identities, cycles and sizes.
    const projected = projectFrame(canvasId, source, nodes)
    if (!projected || projected.type !== 'group' || typeof projected.data?.title !== 'string')
      reject('FRAME_TITLE_IDENTITY_MISMATCH', '此框尚未连接原名称保存入口。')
    const seen = new Set<string>()
    let cursor: Row | undefined = node
    while (cursor) {
      if (seen.has(cursor.id)) reject('FRAME_TITLE_PARENT_UNCONFIRMED', '此框的层级尚未确认，名称未保存。')
      seen.add(cursor.id)
      if (cursor.data?.locked === true || cursor.draggable === false)
        reject('NODE_LOCKED', '先解锁此框及其父框，再修改名称。')
      if (!cursor.parentId) break
      const parents = nodes.filter((item: Row) => item.id === cursor!.parentId)
      if (parents.length !== 1 || parents[0].type !== 'frame')
        reject('FRAME_TITLE_PARENT_UNCONFIRMED', '此框的父框尚未确认，名称未保存。')
      cursor = parents[0]
    }
    return { node, nodes, saved, title: projected!.data.title as string }
  }

  return {
    async apply(canvasId: string, input: unknown) {
      if (!record(input) || !keys(input, ['canvas_id', 'actions', 'created_by_role', 'lcos_operation'])
        || input.canvas_id !== canvasId || input.created_by_role !== undefined && input.created_by_role !== 'user')
        reject('INVALID_FRAME_TITLE_BATCH', '名称须沿原画布标题输入提交。', 400)
      const operation = input.lcos_operation
      if (!record(operation) || !keys(operation, ['version', 'operationId', 'kind', 'phase', 'title'])
        || operation.version !== 1 || operation.kind !== 'frame-title'
        || typeof operation.operationId !== 'string' || !operation.operationId.trim() || operation.operationId.length > 200
        || !['apply', 'undo', 'redo'].includes(operation.phase) || !record(operation.title)
        || !keys(operation.title, ['nodeId', 'before', 'after', 'beforeLabel']))
        reject('INVALID_FRAME_TITLE_OPERATION', '标题操作缺少原始编辑信息，输入已保留。', 400)
      const { nodeId, before, after, beforeLabel } = operation.title
      if (typeof nodeId !== 'string' || !nodeId.trim() || typeof before !== 'string' || before.length > 32768
        || typeof after !== 'string' || !after.trim() || after !== after.trim() || after.length > 500
        || beforeLabel !== null && typeof beforeLabel !== 'string')
        reject('INVALID_FRAME_TITLE', '框名称需要 1–500 个字。', 400)
      const expected = operation.phase === 'undo' ? after : before
      const desired = operation.phase === 'undo' ? before : after
      const expectedLabel = operation.phase === 'undo' ? after : beforeLabel
      const desiredLabel = operation.phase === 'undo' ? beforeLabel : after
      const action = input.actions?.[0], update = action?.updates?.[0]
      if (!Array.isArray(input.actions) || input.actions.length !== 1 || !record(action)
        || !keys(action, ['action', 'updates']) || action.action !== 'update' || !Array.isArray(action.updates)
        || action.updates.length !== 1 || !record(update) || !keys(update, ['id', 'data'])
        || update.id !== nodeId || !record(update.data) || Object.keys(update.data).join(',') !== 'title'
        || update.data.title !== desired)
        reject('FRAME_TITLE_CHANGESET_MISMATCH', '本次只保存准确框名，不混入正文、位置或其他操作。', 400)
      return spatial.withCanvasLock(canvasId, async locked => {
        const snapshot = await locked.read()
        const current = await identify(canvasId, snapshot, nodeId)
        if (current.title !== expected || current.saved.record.label !== expectedLabel)
          reject('FRAME_TITLE_STALE', '框名称已被修改；输入已保留，请先核对当前名称。')
        let result: any
        if (desiredLabel !== current.saved.record.label) {
          result = await locked.execute([{ type: 'MERGE_NODE_DATA', patches: [
            { nodeId, patch: { label: desiredLabel, labelSource: 'user' } },
          ] }])
          if (!Array.isArray(result?.results) || result.results.some((item: any) => item.applied !== true))
            reject('FRAME_TITLE_SAVE_UNCONFIRMED', '名称保存尚未确认，请核对当前框；不会自动重发。')
        }
        const refreshed = await locked.read()
        const confirmed = await identify(canvasId, refreshed, nodeId)
        if (confirmed.title !== desired || confirmed.saved.record.label !== desiredLabel)
          reject('FRAME_TITLE_SAVE_UNCONFIRMED', '名称保存尚未确认，请核对当前框；不会自动重发。')
        const protectedNode = (node: Row) => node.id === nodeId ? { ...node, data: Object.fromEntries(Object.entries(node.data ?? {})
          .filter(([key]) => !['label', 'labelSource'].includes(key))) } : node
        if (!isDeepStrictEqual(current.nodes.map(protectedNode), confirmed.nodes.map(protectedNode)))
          reject('FRAME_TITLE_SAVE_UNCONFIRMED', '名称操作后的画布状态需核对；不会自动重发。')
        const fromVersion = snapshot.version, toVersion = refreshed.version
        return { canvas_id: canvasId, nodes: refreshed.state.nodes, connections: refreshed.state.edges ?? [],
          core_saved: false, spatial_saved: true, from_version: fromVersion, to_version: toVersion,
          frame_title_receipt: { canvasId, nodeId, operationId: operation.operationId, phase: operation.phase,
            before, after, beforeLabel, title: desired, spatialSaved: true, fromVersion, toVersion } }
      })
    },
  }
}
