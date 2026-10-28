const record = (value: any) => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: any) => typeof value === 'string' && value.length > 0 && value.length <= 220 && value.trim() === value;
const failure = (status: number, code: string, message: string) => ({ status, body: { ok: false, error: { code, message } } });
class CanvasSessionError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}
const fail = (status: number, code: string, message: string): never => { throw new CanvasSessionError(status, code, message); };

/** Existing Core reads select the target; preparation and the original send
 * share one local in-flight slot. There is no new message or session journal. */
export function createNativeSessionCanvasFacade({ projectId, repository, resolveCanvas, readTurn, next,
  enabled = process.env.LCOS_NATIVE_CANVAS_TOOLS_ENABLED === '1', hostOrigin = process.env.HUABU_HOST_URL,
  hostToken = process.env.HUABU_HOST_TOKEN, request = fetch }: any) {
  const inFlight = new Set<string>();
  function identity(conversationId: string) {
    const connected = repository.getConnectedConversation(projectId, conversationId);
    const session = connected?.conversationSessionId && repository.getConversationSessionRuntimeIdentity(projectId, connected.conversationSessionId);
    const origin = session?.originMeta;
    if (!connected || !session || connected.projectId !== projectId || session.projectId !== projectId
      || session.provider !== connected.provider || origin?.continuationProvider !== connected.provider
      || origin.continuationExternalSessionId !== connected.conversationRef || origin.continuationRuntimeScope !== projectId
      || !['continuationThreadId', 'continuationExternalSessionId', 'continuationTransportSessionId', 'continuationAgentletId'].every(key => text(origin[key])))
      fail(409, 'CANVAS_SESSION_UNCONFIRMED', '原对话连接尚未确认，请先恢复这条对话。');
    return { projectId, conversationId, conversationSessionId: connected.conversationSessionId,
      threadId: origin.continuationThreadId, externalSessionId: origin.continuationExternalSessionId,
      transportSessionId: origin.continuationTransportSessionId, agentletId: origin.continuationAgentletId };
  }
  const same = (a: any, b: any) => ['projectId', 'conversationId', 'conversationSessionId', 'threadId', 'externalSessionId', 'transportSessionId', 'agentletId']
    .every(key => a[key] === b[key]);
  function wire(owner: any) { return { projectId, conversationId: owner.conversationId, threadId: owner.threadId, externalSessionId: owner.externalSessionId }; }
  async function host(owner: any, suffix: string, method = 'GET', extra: any = {}) {
    let origin: URL;
    try { origin = new URL(hostOrigin); } catch { return fail(503, 'CANVAS_HOST_UNAVAILABLE', '原会话工具连接尚未就绪。'); }
    if (origin.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname)
      || origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password || !hostToken)
      fail(503, 'CANVAS_HOST_UNAVAILABLE', '原会话工具连接尚未就绪。');
    const url = new URL('/api/acp/continuation/agentlets/' + encodeURIComponent(owner.agentletId)
      + '/sessions/' + encodeURIComponent(owner.transportSessionId) + '/' + suffix, origin);
    const body = { ...wire(owner), ...extra };
    if (method === 'GET') url.search = new URLSearchParams(body).toString();
    const response = await request(url, { method, redirect: 'error', signal: AbortSignal.timeout(suffix.endsWith('/abandon') ? 3000 : 45_000),
      headers: { Authorization: 'Bearer ' + hostToken, 'Content-Type': 'application/json' },
      ...(method === 'GET' ? {} : { body: JSON.stringify(body) }) });
    const value = await response.json();
    if (!response.ok) fail(response.status, typeof value?.error?.code === 'string' ? value.error.code : 'CANVAS_HOST_UNAVAILABLE',
      ['canvas_session_busy', 'canvas_permission_changed', 'canvas_owner_changed'].includes(value?.error?.code)
        ? value.error.message : '原会话工具暂未就绪，输入和原请求已保留。');
    return value;
  }
  async function handle(input: any) {
    const path = input.pathname ?? new URL(input.url, 'http://127.0.0.1').pathname;
    const match = /^\/api\/lcos\/core\/projects\/([^/]+)\/connected-conversations\/([^/]+)\/(collaboration-send|canvas-permissions|canvas-tools)$/.exec(path);
    if (!match || !enabled) return undefined;
    const action = match[3], method = (input.method ?? 'GET').toUpperCase();
    if (action === 'collaboration-send' && method !== 'POST') return undefined;
    if (!['GET', 'POST'].includes(method) || action === 'canvas-tools' && method !== 'GET') return failure(405, 'METHOD_UNAVAILABLE', '这个操作暂不可用。');
    let owner: any, lock: string | undefined, prepared = false;
    try {
      if (decodeURIComponent(match[1]) !== projectId) fail(404, 'PROJECT_NOT_FOUND', '当前项目不存在。');
      owner = identity(decodeURIComponent(match[2]));
      const body = input.body;
      if (action !== 'collaboration-send') {
        if (method === 'POST') {
          if (!record(body) || Object.keys(body).some(key => !['messageId', 'requestId', 'decision'].includes(key)) || !text(body.messageId))
            fail(400, 'INVALID_ARGUMENT', '请使用当前对话中的确认请求。');
          const turn = readTurn(projectId, owner.conversationSessionId, body.messageId);
          if (turn?.status !== 'pending') fail(409, 'CANVAS_PERMISSION_CHANGED', '这条消息已不在等待，请重新读取原对话。');
        }
        const value = await host(owner, action, method, method === 'POST' ? body : {});
        if (!same(owner, identity(owner.conversationId))) fail(409, 'CANVAS_SESSION_CHANGED', '原对话连接已变化，请重新读取。');
        return { status: 200, body: { ok: true, value } };
      }
      if (!record(body) || !text(body.messageId) || !text(body.continuationOperationId)
        || typeof body.text !== 'string' || !body.text.trim() || body.text.length > 200_000
        || body.conversationId !== undefined && body.conversationId !== owner.conversationId)
        return next(input); // Original Core owns input errors; no tools have changed.
      const turn = readTurn(projectId, owner.conversationSessionId, body.messageId);
      if (turn !== undefined) return next(input); // Complete/pending receipts never reconfigure tools or replay a prompt.
      const operation = repository.getContinuationOperationJournal(projectId, body.continuationOperationId);
      if (!operation || operation.connectedConversationId !== owner.conversationId || operation.cancel !== 'none'
        || ['outcome_unknown', 'cancelled'].includes(operation.status)
        || !['threadId', 'externalSessionId', 'transportSessionId', 'agentletId'].every(key => operation.externalEvidence?.[key] === owner[key])
        || operation.externalEvidence.runtimeScope !== projectId)
        fail(409, 'CANVAS_SESSION_UNCONFIRMED', '当前消息尚未绑定可用的原会话，请先核对连接。');
      const address = input.canvasAddress;
      if (address !== undefined && (!record(address) || !text(address.canvasId) || !text(address.workspaceId)))
        fail(400, 'CANVAS_TARGET_INVALID', '当前现场尚未确认，输入已保留。');
      const canvas = address === undefined ? undefined : await resolveCanvas(address.canvasId);
      if (address && (!canvas || canvas.projectId !== projectId || canvas.workspaceId !== address.workspaceId))
        fail(409, 'CANVAS_TARGET_CHANGED', '当前现场已变化，请核对后再发送。');
      lock = JSON.stringify([owner.agentletId, owner.transportSessionId, owner.externalSessionId]);
      if (inFlight.has(lock)) { lock = undefined; fail(409, 'CANVAS_SESSION_BUSY', '这条对话仍在处理中，请等当前消息完成。'); }
      inFlight.add(lock);
      const receipt = await host(owner, 'canvas-tools', 'POST', { messageId: body.messageId, text: body.text, canvasId: canvas?.canvasId ?? null });
      prepared = true;
      if (!same(owner, identity(owner.conversationId)) || canvas && JSON.stringify(await resolveCanvas(canvas.canvasId)) !== JSON.stringify(canvas)
        || receipt.prepared !== true || receipt.messageId !== body.messageId || receipt.canvasId !== (canvas?.canvasId ?? null)
        || receipt.externalSessionId !== owner.externalSessionId || receipt.transportSessionId !== owner.transportSessionId)
        fail(409, 'CANVAS_TARGET_CHANGED', '原会话或现场已变化，本次消息未发送。');
      return await next(input);
    } catch (error) {
      return error instanceof CanvasSessionError ? failure(error.status, error.code, error.message)
        : failure(503, 'CANVAS_TOOLS_UNCONFIRMED', '原会话工具状态尚未确认，请核对连接；不会自动重发消息。');
    } finally {
      if (prepared && owner) await host(owner, 'canvas-tools/abandon', 'POST', { messageId: input.body.messageId }).catch(() => {});
      if (lock) inFlight.delete(lock);
    }
  }
  return { handle };
}
