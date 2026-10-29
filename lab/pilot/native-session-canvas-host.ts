import { getConnectionToken } from '../../lcos/huabu/apps/server/src/connection-token.ts';
import { confirmNativeSessionCanvasTarget, isNativeSessionCanvasTarget, NativeSessionCanvasTargetError } from './native-session-canvas-target.ts';

const record = (value: any) => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: any) => typeof value === 'string' && value.length > 0 && value.length <= 220 && value.trim() === value;
const same = (a: any, b: any) => ['projectId', 'conversationId', 'threadId', 'externalSessionId'].every(key => a?.[key] === b?.[key]);
const failure = (reply: any, status: number, code: string, message: string) => reply.status(status).send({ error: { code, message } });

/** Only transient preparation on an existing ACP client. The client still owns
 * its suspended permissions; Core still owns every conversation and turn. */
export function installNativeSessionCanvasTools(app: any, { getGateway, registry }: any) {
  let config: any;
  try { config = JSON.parse(process.env.LCOS_NATIVE_CANVAS_TOOLS ?? 'null'); } catch { throw new Error('Canvas tool launch configuration is invalid.'); }
  if (config !== null && (!record(config) || !text(config.projectId) || !record(config.canvases)
    || typeof config.python !== 'string' || typeof config.script !== 'string'
    || !/^(?:[a-z]:[\\/]|\/)/i.test(config.python) || !/^(?:[a-z]:[\\/]|\/)/i.test(config.script)
    || !/^isolated-[a-z0-9-]+$/.test(config.runtimeLabel))) throw new Error('Canvas tool launch configuration is invalid.');
  const states = new WeakMap<object, any>();
  const authenticated = (authorization: any) => typeof authorization === 'string' && authorization === 'Bearer ' + getConnectionToken();
  function find(request: any, reply: any, body: any) {
    if (!authenticated(request.headers.authorization)) { failure(reply, 401, 'canvas_auth_required', '需要当前本地会话连接。'); return; }
    if (!config) { failure(reply, 503, 'canvas_tools_unavailable', '当前会话尚未配置画布工具。'); return; }
    if (!record(body) || !['projectId', 'conversationId', 'threadId', 'externalSessionId'].every(key => text(body[key]))
      || body.projectId !== config.projectId) { failure(reply, 400, 'canvas_owner_invalid', '会话目标尚未确认。'); return; }
    const gateway = getGateway(), connection = gateway?.getSession(request.params.agentletId, request.params.sessionId);
    const owner = registry.get(request.params.agentletId, body.threadId);
    if (!owner || !connection || connection.status !== 'connected' || owner.client.isClosed
      || owner.sessionId !== body.externalSessionId || owner.client.transportSessionId !== request.params.sessionId
      || !owner.client.isConnectedTo(connection) || owner.namespace?.name !== body.projectId) {
      failure(reply, 409, 'canvas_owner_changed', '原会话连接已变化，请先恢复原会话。'); return;
    }
    return { owner, connection, current: () => registry.get(request.params.agentletId, body.threadId) === owner
      && gateway.getSession(request.params.agentletId, request.params.sessionId) === connection
      && connection.status === 'connected' && !owner.client.isClosed && owner.client.isConnectedTo(connection) };
  }
  const prefix = '/continuation/agentlets/:agentletId/sessions/:sessionId';
  app.post(prefix + '/canvas-tools', async (request: any, reply: any) => {
    const body = request.body, found = find(request, reply, body); if (!found) return;
    if (Object.keys(body).some(key => !['projectId', 'conversationId', 'threadId', 'externalSessionId', 'messageId', 'canvasId', 'text'].includes(key))
      || !text(body.messageId) || typeof body.text !== 'string' || !body.text.trim() || body.text.length > 200_000
      || body.canvasId !== null && !isNativeSessionCanvasTarget(config, body.canvasId))
      return failure(reply, 400, 'canvas_preparation_invalid', '当前消息或画布目标尚未确认。');
    const { owner, current } = found, previous = states.get(owner.client);
    if (owner.client.hasNativePrompt(owner.sessionId) || ['preparing', 'running'].includes(previous?.phase))
      return failure(reply, 409, 'canvas_session_busy', '这条对话仍在处理中，请等当前消息完成。');
    // Keep the full existing native identifier, with UUID punctuation removed.
    // A long thread prefix made the provider replace every operation suffix
    // with an opaque hash in its model-facing function names.
    const nativeName = body.externalSessionId.replaceAll('-', '');
    if (!/^[a-z0-9_]{1,32}$/i.test(nativeName)) return failure(reply, 400, 'canvas_tool_name_unavailable', '这条会话的画布工具名称尚未适配，原对话保留。');
    const name = 'lcos_' + nativeName;
    const clientId = 'lcos:' + body.projectId + ':' + body.threadId;
    const state = { ...body, name, clientId, phase: 'preparing', configured: previous?.configured ?? false, toolCount: 0 };
    states.set(owner.client, state);
    let stage = 'canvas-owner', providerStarted = false;
    let receipt: any;
    try {
      if (body.canvasId !== null) await confirmNativeSessionCanvasTarget(config, body.canvasId);
      if (!current() || states.get(owner.client) !== state || owner.client.hasNativePrompt(owner.sessionId))
        throw new NativeSessionCanvasTargetError(409, 'canvas_owner_changed', '原会话连接已变化，请先恢复原会话。');
      stage = 'provider-call'; providerStarted = true;
      if (body.canvasId === null) {
        await owner.client.nativeCanvasMcp(owner.sessionId, 'remove', name, clientId);
        state.configured = false;
      } else {
        receipt = await owner.client.nativeCanvasMcp(owner.sessionId, 'add', name, clientId, {
          command: config.python, args: ['-X', 'utf8', config.script, '--runtime-label', config.runtimeLabel, '--canvas', body.canvasId],
          // Original provider flag: these eight current-canvas tools are small
          // and must be declared even when this model has no tool_search.
          // This affects discovery only; it never trusts or auto-approves tools.
          alwaysLoadTools: true,
        });
        stage = 'provider-receipt';
        if (!record(receipt) || receipt.name !== name || receipt.skipped === true || receipt.shadowedSettings === true || receipt.toolCount !== 8)
          throw new Error('The provider did not confirm the eight tools.');
        state.configured = true; state.toolCount = receipt.toolCount;
      }
      stage = 'owner-readback';
      if (!current() || states.get(owner.client) !== state || owner.client.hasNativePrompt(owner.sessionId))
        throw new Error('The original connection changed during tool preparation.');
      state.phase = 'ready';
      return { prepared: true, projectId: body.projectId, conversationId: body.conversationId, messageId: body.messageId,
        canvasId: body.canvasId, externalSessionId: owner.sessionId, transportSessionId: found.connection.sessionId,
        threadId: body.threadId, toolCount: state.toolCount };
    } catch (error: any) {
      if (!providerStarted) {
        if (states.get(owner.client) === state) {
          if (previous) states.set(owner.client, previous); else states.delete(owner.client);
        }
        return failure(reply, error instanceof NativeSessionCanvasTargetError ? error.status : 503,
          error instanceof NativeSessionCanvasTargetError ? error.code : 'canvas_tools_unconfirmed',
          error instanceof NativeSessionCanvasTargetError ? error.message : '当前现场归属暂未确认，本次消息未发送。');
      }
      // Even an unknown add may have succeeded; block unprepared prompts until
      // the next explicit same-owner preparation reconciles this service.
      state.phase = 'unconfirmed'; state.configured = true;
      const diagnostic = { stage, errorName: /^[a-z]+$/i.test(error?.name) ? error.name : 'Error',
        ...(Number.isInteger(error?.code) ? { rpcCode: error.code } : {}),
        ...(typeof error?.data?.errorKind === 'string' && /^[a-z0-9_]+$/i.test(error.data.errorKind) ? { errorKind: error.data.errorKind } : {}),
        ...(record(receipt) ? { nameMatches: receipt.name === name, toolCount: receipt.toolCount, skipped: receipt.skipped === true } : {}) };
      app.log.warn({ diagnostic }, 'Original canvas tool preparation was not confirmed.');
      return reply.status(503).send({ error: { code: 'canvas_tools_unconfirmed', message: '画布工具连接尚未确认，本次消息未发送。', diagnostic } });
    }
  });
  app.get(prefix + '/canvas-tools', async (request: any, reply: any) => {
    const body = request.query, found = find(request, reply, body); if (!found) return;
    const state = states.get(found.owner.client);
    if (!state || !same(state, body)) return { canvasId: null, phase: 'unprepared', tools: [] };
    try {
      const status = await found.owner.client.readNativeCanvasMcp(found.owner.sessionId);
      if (!found.current() || states.get(found.owner.client) !== state) return failure(reply, 409, 'canvas_owner_changed', '原会话连接已变化。');
      return { canvasId: state.canvasId, phase: state.phase, messageId: state.messageId, serverName: state.name,
        externalSessionId: found.owner.sessionId, tools: status };
    } catch { return failure(reply, 503, 'canvas_tools_unconfirmed', '暂时无法核对原会话工具。'); }
  });
  app.post(prefix + '/canvas-tools/abandon', async (request: any, reply: any) => {
    const body = request.body, found = find(request, reply, body); if (!found) return;
    const state = states.get(found.owner.client);
    if (state && same(state, body) && state.messageId === body.messageId && state.phase === 'ready') state.phase = 'idle';
    return { handled: true };
  });
  app.get(prefix + '/canvas-permissions', async (request: any, reply: any) => {
    const body = request.query, found = find(request, reply, body); if (!found) return;
    const state = states.get(found.owner.client);
    return { projectId: body.projectId, conversationId: body.conversationId,
      messageId: state && same(state, body) ? state.messageId : null,
      canvasId: state && same(state, body) ? state.canvasId : null,
      requests: state && same(state, body) && state.phase === 'running'
        ? found.owner.client.readNativePermissions(found.owner.sessionId) : [] };
  });
  app.post(prefix + '/canvas-permissions', async (request: any, reply: any) => {
    const body = request.body, found = find(request, reply, body); if (!found) return;
    const state = states.get(found.owner.client);
    if (!state || !same(state, body) || state.phase !== 'running' || body.messageId !== state.messageId
      || !text(body.requestId) || !record(body.decision)
      || Object.keys(body.decision).some(key => !['optionId', 'cancelled'].includes(key))
      || !(body.decision.cancelled === true && body.decision.optionId === undefined
        || body.decision.cancelled === undefined && text(body.decision.optionId)))
      return failure(reply, 409, 'canvas_permission_changed', '这次确认请求已变化，请重新读取。');
    if (!found.owner.client.answerNativePermission(found.owner.sessionId, body.requestId, body.decision))
      return failure(reply, 409, 'canvas_permission_changed', '这次确认已结束或选项不匹配，请重新读取。');
    return { handled: true, messageId: state.messageId, requestId: body.requestId };
  });
  return {
    beginPrompt(owner: any, connection: any, input: any, authorization: any) {
      const state = states.get(owner.client);
      if (!state) return config && owner.namespace?.name === config.projectId
        ? { ok: false, code: 'canvas_prompt_not_prepared', message: '当前消息尚未核对画布工具，请从原对话重新发送。' }
        : { ok: true };
      if (!authenticated(authorization) || state.phase !== 'ready' || state.threadId !== input.threadId
        || state.externalSessionId !== input.externalSessionId || state.text.trim() !== input.text.trim()
        || state.projectId !== input.runtimeScope || !owner.client.isConnectedTo(connection)
        || input.contextAttachment && input.contextAttachment.messageId !== state.messageId) {
        return { ok: false, code: 'canvas_prompt_not_prepared', message: '这条消息的画布目标尚未确认，请重新核对原请求。' };
      }
      state.phase = 'running';
      return { ok: true, state, owner,
        // The original client Map owns the suspended request and its timeout.
        // The current conversation reads it and answers explicitly below.
        onPermissionRequest: state.canvasId === null ? undefined : () => {} };
    },
    endPrompt(operation: any) {
      if (operation.state && states.get(operation.owner.client) === operation.state) operation.state.phase = 'idle';
    },
  };
}
