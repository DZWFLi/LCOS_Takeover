import { isDeepStrictEqual as equal } from 'node:util';
import { readGlythAppearance } from '../../lcos/huabu/apps/web/src/lcos/ui/glyth/glythAppearance';

/** Native create/delete history moves only the original spatial carrier and
 * ProjectionBinding. It never creates, deletes or reconnects a conversation. */
export function createNativeConversationLifecycle({ repository, projectId, spatial, fail }: any) {
  const text = (value: any) => typeof value === 'string' && !!value.trim();
  return async (canvasId: string, input: any) => {
    const action = input.actions?.[0], op = input.lcos_operation;
    const workspace = repository.getWorkspaces(projectId).find((row: any) => row.canvasId === canvasId);
    if (!workspace || input.created_by_role !== 'user' || input.actions?.length !== 1 || !op || op.version !== 1 || !text(op.operationId)
      || op.operationId.length > 200 || Object.keys(op).some(key => !['version', 'operationId', 'kind', 'phase'].includes(key))
      || !['create', 'delete'].includes(op.kind) || !['apply', 'undo', 'redo'].includes(op.phase))
      fail(400, 'CONVERSATION_HISTORY_INVALID', '原智能体历史操作尚未确认。');
    const restoring = action.action === 'create';
    if (restoring ? !(op.kind === 'create' && op.phase === 'redo' || op.kind === 'delete' && op.phase === 'undo')
      : !(action.action === 'delete' && (op.kind === 'create' && op.phase === 'undo' || op.kind === 'delete' && ['apply', 'redo'].includes(op.phase))))
      fail(409, 'CONVERSATION_HISTORY_PHASE_INVALID', '请沿原加号创建智能体，或沿原历史恢复已有智能体。');
    if (input.lcos_refs && Object.keys(input.lcos_refs).length
      || Object.keys(action).some(key => !['action', restoring ? 'creates' : 'delete_ids'].includes(key)))
      fail(400, 'CONVERSATION_HISTORY_MIXED', '智能体历史不能混入材料身份或其他动作。');
    const values = restoring ? action.creates : action.delete_ids?.map((id: string) => input.lcos_snapshots?.[id]);
    if (!Array.isArray(values) || !values.length || values.length > 200)
      fail(400, 'CONVERSATION_HISTORY_SNAPSHOT_REQUIRED', '原智能体快照不完整，未修改画布。');
    const parsed = values.map((value: any, index: number) => {
      const id = value?.id, data = value?.data, ref = data?.lcos_conversation_ref;
      const appearance = data?.lcosGlythAppearance === undefined ? undefined : readGlythAppearance(data.lcosGlythAppearance);
      const size = value?.measured ?? { width: value?.width ?? value?.style?.width, height: value?.height ?? value?.style?.height };
      if (restoring && Object.keys(value ?? {}).some(key => !['id','canvas_id','type','data','position','measured','parent_id'].includes(key)))
        fail(400, 'CONVERSATION_HISTORY_FIELDS_INVALID', '原智能体恢复不包含额外空间操作。');
      if (!text(id) || id.length > 200 || value.type !== 'lcos-conversation' || data?.id !== id
        || ref?.projectId !== projectId || ref.canvasId !== canvasId || ref.workspaceId !== String(workspace.id)
        || !text(ref.connectedConversationId) || Object.keys(ref).sort().join(',') !== 'canvasId,connectedConversationId,projectId,workspaceId'
        || value.parentId || value.parent_id || restoring && value.canvas_id !== undefined && value.canvas_id !== canvasId
        || !restoring && action.delete_ids[index] !== id
        || ![value.position?.x, value.position?.y].every(n => Number.isFinite(n) && Math.abs(n) <= 1_000_000)
        || Object.keys(value.position).sort().join(',') !== 'x,y'
        || ![size.width, size.height].every(n => Number.isFinite(n) && n > 0)
        || data.lcosGlythAppearance !== undefined && (!appearance || !equal(appearance, data.lcosGlythAppearance)))
        fail(409, 'CONVERSATION_HISTORY_OWNER_MISMATCH', '原智能体身份、形象或位置不匹配，当前画布保留。');
      if (Object.keys(data).some(key => !['id', 'title', 'lcos_conversation_ref', 'lcos_conversation_state', 'lcosGlythAppearance'].includes(key)))
        fail(400, 'CONVERSATION_HISTORY_DATA_INVALID', '智能体历史不能改写对话内容或运行状态。');
      const conversation = repository.getConnectedConversation(projectId, ref.connectedConversationId);
      if (!conversation || conversation.conversationRef.startsWith('pending-'))
        fail(409, 'CONVERSATION_IDENTITY_UNAVAILABLE', '原对话尚未确认，未创建替代会话。');
      return { id, ref, appearance, position: value.position, size, conversation };
    });
    if (new Set(parsed.map((row: any) => row.id)).size !== parsed.length
      || new Set(parsed.map((row: any) => row.ref.connectedConversationId)).size !== parsed.length)
      fail(409, 'CONVERSATION_HISTORY_DUPLICATE', '同一智能体不能重复恢复。');
    return spatial.withCanvasLock(canvasId, async (locked: any) => {
      const snapshot = await locked.read(), nodes = snapshot.state.nodes;
      const matches = (node: any, row: any, binding?: any) => node?.type === 'note'
        && (node.data?.lcos_conversation_ref ? equal(node.data.lcos_conversation_ref, row.ref) : binding?.spatialId === row.id)
        && equal(node.data?.lcosGlythAppearance, row.appearance) && equal(node.position, row.position)
        && Number(node.width ?? node.style?.width) === row.size.width && Number(node.height ?? node.style?.height) === row.size.height
        && !node.parentId && !node.parent_id;
      const needed: any[] = [];
      for (const row of parsed) {
        const binding = repository.findProjectionBinding(projectId, canvasId, 'node', 'conversation', row.conversation.id);
        const node = nodes.find((item: any) => item.id === row.id);
        if (binding && binding.spatialId !== row.id || node && !matches(node, row, binding)
          || nodes.some((item: any) => item.id !== row.id && item.data?.lcos_conversation_ref?.connectedConversationId === row.conversation.id))
          fail(409, 'CONVERSATION_CARRIER_CHANGED', '智能体已在别处或已有新编辑，未覆盖当前状态。');
        if ((snapshot.state.edges ?? []).some((edge: any) => edge.source === row.id || edge.target === row.id))
          fail(409, 'CONVERSATION_LINK_HISTORY_NOT_CONNECTED', '带连接线的智能体需要同时恢复连线；当前节点和连线已保留。');
        if (restoring ? !node : !!node) needed.push(row);
      }
      if (needed.length) {
        const command = restoring ? { type: 'CREATE_NODES', nodes: needed.map(row => ({ id: row.id, nodeType: 'note',
          position: row.position, size: row.size,
          data: { label: row.conversation.label, lcos_conversation_ref: row.ref, ...(row.appearance ? { lcosGlythAppearance: row.appearance } : {}) } })) }
          : { type: 'DELETE_NODES', nodeIds: needed.map(row => row.id) };
        try { await locked.execute([command]); }
        catch { /* Read the same original spatial state; never repeat an uncertain write. */ }
        const after = await locked.read();
        if (needed.some(row => restoring ? !matches(after.state.nodes.find((node: any) => node.id === row.id), row)
          : after.state.nodes.some((node: any) => node.id === row.id)))
          fail(409, 'CONVERSATION_HISTORY_UNCONFIRMED', '原画布保存结果尚待核对，对话和消息保留。');
      }
      // The original spatial save is confirmed before changing only its Core binding.
      // A failed binding write remains recoverable by the same exact snapshot.
      for (const row of parsed) {
        const latest = repository.findProjectionBinding(projectId, canvasId, 'node', 'conversation', row.conversation.id);
        if (latest && latest.spatialId !== row.id)
          fail(409, 'CONVERSATION_BINDING_CHANGED', '保存期间智能体已在别处重新放置；新绑定和对话保留，请核对原画布。');
        if (restoring) repository.upsertProjectionBinding({ projectId, canvasId, spatialKind: 'node', spatialId: row.id,
          entityType: 'conversation', entityId: row.conversation.id });
        else repository.deleteProjectionBinding(projectId, canvasId, 'node', 'conversation', row.conversation.id);
      }
      return { canvas_id: canvasId, operation: op, nodes: [], deleted_node_ids: restoring ? [] : parsed.map(row => row.id),
        lcos_refs: {}, client_to_spatial_ids: {}, core_saved: true, spatial_saved: true };
    });
  };
}
