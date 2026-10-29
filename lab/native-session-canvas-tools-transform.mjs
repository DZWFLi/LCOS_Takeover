import path from 'node:path';
import { nativeGlythTitleSource, transformNativeGlythTitle } from './native-glyth-title-transform.mjs';
const root = path.resolve(import.meta.dirname, '..');
const marker = '/* LCOS original session canvas tools. */';
const client = 'lcos/huabu/external/agenetes/packages/acp-driver/src/client.ts';
const host = 'lcos/huabu/apps/server/src/modules/agent/acp/continuation-transport.route.ts';
const server = 'lcos/apps/local-core/src/server.ts';
function once(source, before, after) {
  if (source.split(before).length !== 2) throw new Error('Original session canvas seam changed: ' + before.slice(0, 70));
  return source.replace(before, after);
}
function adapt(source, { sourcePath } = {}) {
  const relative = path.relative(root, path.resolve(sourcePath ?? '')).replaceAll('\\', '/');
  if (![client, host, server].includes(relative)) throw new Error('Original session canvas source path required.');
  if (source.includes(marker)) return source;
  let next = source.replaceAll('\r\n', '\n');
  if (relative === server) {
    next = once(next, '      : requestTimeoutMs\n    const timeout = setTimeout', `      : /\\/connected-conversations\\/[^/]+\\/collaboration-send(?:\\?|$)/.test(request.url ?? '')
        ? Math.max(requestTimeoutMs, 360_000) : requestTimeoutMs
    const timeout = setTimeout`);
    next = once(next, 'export interface LocalCoreServer {', `export interface LocalCoreServer {
  /** Read through the existing conversation service, without reserving a turn. */
  readContinuationTurn(projectId: string, conversationId: string, messageId: string): ReturnType<ConversationImportService['getContinuationTurn']>
  readConversationCreation(): Promise<{ canCreate: boolean }>
`);
    next = once(next, '  const api: LocalCoreServer = {', `  const api: LocalCoreServer = {
    readContinuationTurn(projectId, conversationId, messageId) {
      if (!conversations) throw new Error('Original conversation service is unavailable.')
      return conversations.getContinuationTurn(projectId, conversationId, messageId)
    },`);
    next = once(next, '  const api: LocalCoreServer = {', `  const api: LocalCoreServer = {
    async readConversationCreation() {
      if (!recoveryAdapter) return { canCreate: false }
      try {
        const snapshot = await recoveryAdapter.probe({ provider: recoveryAdapter.provider,
          adapterId: recoveryAdapter.adapterId, probeId: 'original-conversation-creation' })
        return { canCreate: snapshot.session.createSession.value === true }
      } catch { return { canCreate: false } }
    },`);
  } else if (relative === client) {
    next = once(next, '      sessionId: string;\n      resolve: (decision: PermissionDecision) => void;', '      sessionId: string;\n      request?: Parameters<PermissionNotifier>[0];\n      resolve: (decision: PermissionDecision) => void;');
    next = once(next, '        notifier({\n          requestId,', '        const notification: Parameters<PermissionNotifier>[0] = {\n          requestId,');
    next = once(next, '          options: options as unknown as AcpPermissionOption[],\n        });', `          options: options as unknown as AcpPermissionOption[],
        };
        this.pendingPermissions.get(requestId)!.request = notification;
        notifier(notification);`);
    next = once(next, '  /** Notify the agent to abort the current turn. Fire-and-forget. */', `  hasNativePrompt(sessionId: string): boolean { return this.updateHandlers.has(sessionId); }

  async nativeCanvasMcp(sessionId: string, operation: 'add' | 'remove', name: string, originatorClientId: string,
    config?: { command: string; args: string[]; alwaysLoadTools?: boolean }): Promise<any> {
    if (this._closed || this.updateHandlers.has(sessionId)) throw new Error('Original session is unavailable or busy.');
    if (!['add', 'remove'].includes(operation)) throw new Error('Unsupported canvas tool operation.');
    return this.sdk.extMethod('qwen/control/session/mcp/runtime-' + operation,
      { sessionId, name, originatorClientId, ...(operation === 'add' ? { config } : {}) });
  }

  async readNativeCanvasMcp(sessionId: string): Promise<unknown[]> {
    if (this._closed) throw new Error('Original session is unavailable.');
    const value = await this.sdk.extMethod('qwen/status/session/context_usage', { sessionId, detail: true }) as any;
    if (value?.sessionId !== sessionId || !Array.isArray(value?.usage?.mcpTools)) throw new Error('Session tool state was not confirmed.');
    return value.usage.mcpTools;
  }

  readNativePermissions(sessionId: string): Parameters<PermissionNotifier>[0][] {
    return [...this.pendingPermissions.values()].filter(pending => pending.sessionId === sessionId && pending.request)
      .map(pending => structuredClone(pending.request!));
  }

  answerNativePermission(sessionId: string, requestId: string, decision: PermissionDecision): boolean {
    const pending = this.pendingPermissions.get(requestId);
    if (!pending || pending.sessionId !== sessionId || !pending.request
      || !decision.cancelled && !pending.request.options.some(option => option.optionId === decision.optionId)) return false;
    return this.resolvePermission(requestId, decision);
  }

  /** Notify the agent to abort the current turn. Fire-and-forget. */`);
  } else {
    let specifier = path.relative(path.dirname(sourcePath), path.join(root, 'lab/pilot/native-session-canvas-host.ts')).replaceAll('\\', '/');
    if (!specifier.startsWith('.')) specifier = './' + specifier;
    next = 'import { installNativeSessionCanvasTools } from ' + JSON.stringify(specifier) + ';\n' + next;
    next = once(next, 'const continuationTransportRoutes: FastifyPluginAsync = async (app) => {', `const continuationTransportRoutes: FastifyPluginAsync = async (app) => {
  const nativeCanvasTools = installNativeSessionCanvasTools(app, { getGateway: getAgentletGateway, registry: acpSessionRegistry });`);
    next = once(next, '      try {\n        const result = await promptExistingAcpSession(', `      const canvasPrompt = nativeCanvasTools.beginPrompt(owner, connection, input, request.headers.authorization);
      if (!canvasPrompt.ok) return reply.status(409).send(errorBody(canvasPrompt.code!, canvasPrompt.message!));
      try {
        const result = await promptExistingAcpSession(`);
    next = once(next, '          runCorrelation === undefined\n            ? undefined', '          runCorrelation === undefined\n            ? canvasPrompt.onPermissionRequest');
    next = once(next, '      } finally {\n        if (runCorrelation !== undefined)', '      } finally {\n        nativeCanvasTools.endPrompt(canvasPrompt);\n        if (runCorrelation !== undefined)');
  }
  return marker + '\n' + next;
}
export function createNativeSessionCanvasToolsTransforms() { return { ...Object.fromEntries([client, host, server].map(file => [file, adapt])), [nativeGlythTitleSource]: transformNativeGlythTitle }; }
