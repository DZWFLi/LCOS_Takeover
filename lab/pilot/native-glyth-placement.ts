import { isDeepStrictEqual } from 'node:util';
import { createId } from '../../lcos/huabu/packages/shared/src/index';
import { Gen2Host } from '../../lcos/apps/web-gen2/src/host/projectionFacade';
import { HttpClient } from '../../lcos/apps/web-gen2/src/backend/client';
import { readGlythAppearance, appearanceKey, DEFAULT_GLYTH_APPEARANCE } from '../../lcos/huabu/apps/web/src/lcos/ui/glyth/glythAppearance';
import { createHeadlessProjectionPort } from './headless-projection-port';

/** Initial appearance and position belong to the same original spatial node.
 * ProjectToSpaceProjection still owns creation/binding and its duplicate checks. */
export function createNativeGlythPlacement({ repository, projectId, spatial, coreOrigin, fail }: any) {
  return async (canvasId: string, conversation: any, input: any) => {
    const appearance = readGlythAppearance(input?.appearance), position = input?.position;
    if (!input || Object.keys(input).sort().join(',') !== 'appearance,position' || !appearance
      || !isDeepStrictEqual(appearance, input.appearance) || !position
      || Object.keys(position).sort().join(',') !== 'x,y'
      || ![position.x, position.y].every(value => Number.isFinite(value) && Math.abs(value) <= 1_000_000))
      fail(400, 'GLYTH_PLACEMENT_INVALID', '请选择有效形象和画布落点。');
    const workspace = repository.getWorkspaces(projectId).find((row: any) => row.canvasId === canvasId);
    if (!workspace || conversation.projectId !== projectId) fail(404, 'CANVAS_NOT_FOUND', '当前画布尚未确认。');
    const reference = { projectId, connectedConversationId: conversation.id, canvasId, workspaceId: String(workspace.id) };
    const matching = () => repository.getProjectionBindings(projectId).filter((row: any) => row.canvasId === canvasId
      && row.entityType === 'conversation' && row.entityId === conversation.id && row.spatialKind === 'node');
    const checkExisting = async () => {
      const bindings = matching();
      if (bindings.length > 1) fail(409, 'GLYTH_PLACEMENT_UNCONFIRMED', '原会话的画布位置需要核对，未创建新节点。');
      if (!bindings.length) return;
      const snapshot = await spatial.read(canvasId), node = snapshot.state.nodes.find((row: any) => row.id === bindings[0].spatialId);
      if (!node || !isDeepStrictEqual(readGlythAppearance(node.data?.lcosGlythAppearance), appearance))
        fail(409, 'GLYTH_APPEARANCE_CHANGED', '这个会话已有不同形象，保留原节点。');
      return bindings;
    };
    const existing = await checkExisting(); if (existing) return existing;
    const host = new Gen2Host({ projectId, http: new HttpClient({ baseUrl: coreOrigin }),
      rfs: createHeadlessProjectionPort({ canvasId, coreOrigin, read: spatial.read,
        execute: (id: string, commands: any[]) => spatial.withCanvasLock(id, async (locked: any) => {
          const snapshot = await locked.read(), nodes = snapshot.state.nodes;
          const own = nodes.find((node: any) => isDeepStrictEqual(node.data?.lcos_conversation_ref, reference));
          if (own) fail(409, 'GLYTH_PLACEMENT_UNCONFIRMED', '原投放已经留下节点，绑定结果需要核对；未重复创建。');
          const occupied = new Set(repository.getProjectionBindings(projectId).filter((row: any) => row.canvasId === canvasId
            && row.entityType === 'conversation' && row.spatialKind === 'node').map((row: any) => row.spatialId));
          if (nodes.some((node: any) => (occupied.has(node.id) || node.data?.lcos_conversation_ref || node.type === 'question')
            && appearanceKey(readGlythAppearance(node.data?.lcosGlythAppearance) ?? DEFAULT_GLYTH_APPEARANCE) === appearanceKey(appearance!)))
            fail(409, 'GLYTH_APPEARANCE_USED', '这个形象刚被使用了，换个形象后继续放置同一会话。');
          if (commands.some(command => command.type !== 'CREATE_NODES')
            || commands.flatMap(command => command.nodes ?? []).length !== 1)
            fail(409, 'GLYTH_CREATION_CHANGED', '原会话投影创建方式已变化，未写入。');
          return locked.execute(commands.map(command => ({ ...command, nodes: command.nodes.map((node: any) => ({
            ...node, id: node.id ?? createId('node'), data: { ...node.data, lcosGlythAppearance: appearance, lcos_conversation_ref: reference },
          })) })));
        }),
      }) });
    // The original batch projector intentionally rearranges new items around
    // obstacles. A user's explicit drop uses its single-entity entry instead.
    const binding = await host.nodeProjector.projectEntity({ projectId, entityType: 'conversation', entityId: conversation.id,
      kind: 'text', title: conversation.label, position });
    const confirmed = await checkExisting();
    if (!confirmed || binding.spatialId !== confirmed[0].spatialId) fail(409, 'GLYTH_PLACEMENT_UNCONFIRMED', '原会话已建立，画布位置尚待核对。');
    return confirmed;
  };
}
