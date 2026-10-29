import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const base = 'lcos/huabu/apps/web/src/lcos/';
const files = {
  attempt: base + 'composer/conversationSendAttempt.ts', shell: base + 'shell/lcosShellStore.ts',
  composer: base + 'composer/LcosComposerHost.tsx', collaboration: 'lcos/apps/web-gen2/src/backend/collaboration.ts',
  permission: 'lcos/huabu/apps/web/src/components/Messages/AIMessage/PermissionCard.tsx',
};
const marker = '/* LCOS original send canvas address and permission callback. */';
function once(source, before, after) {
  if (source.split(before).length !== 2) throw new Error('Original canvas UI seam changed: ' + before.slice(0, 60));
  return source.replace(before, after);
}
function adapt(kind, source, { sourcePath } = {}) {
  if (path.resolve(sourcePath ?? '').toLowerCase() !== path.resolve(root, files[kind]).toLowerCase()) throw new Error('Exact original canvas UI source required.');
  if (source.includes(marker)) return source;
  let next = source.replaceAll('\r\n', '\n');
  if (kind === 'attempt') next = once(next, "  readonly phase: 'sending' | 'unconfirmed';", "  readonly phase: 'sending' | 'unconfirmed';\n  readonly canvasAddress?: { readonly canvasId: string; readonly workspaceId: string };");
  if (kind === 'shell') {
    let specifier = path.relative(path.dirname(sourcePath), path.join(root, 'lab/pilot/native-session-canvas-ui.tsx')).replaceAll('\\', '/');
    if (!specifier.startsWith('.')) specifier = './' + specifier;
    next = 'import { captureNativeCanvasSendAddress } from ' + JSON.stringify(specifier) + ';\n' + next;
    next = once(next, '    const attempt = captureConversationSend(projectId, input);', `    const attempt = { ...captureConversationSend(projectId, input),
      canvasAddress: previous ? previous.canvasAddress : captureNativeCanvasSendAddress(projectId, input) };`);
  }
  if (kind === 'composer') {
    next = once(next, 'collaboration.send(projectId, sendAttempt.input)', 'collaboration.send(projectId, sendAttempt.input, undefined, sendAttempt.canvasAddress)');
    next = once(next, '{retainedSend && <div data-lcos-pending-send', "{retainedSend?.phase === 'unconfirmed' && <div data-lcos-pending-send");
    next = once(next, "<strong>{retainedSend.phase === 'sending' ? '原消息正在发送' : '原消息结果尚未确认'}</strong>", '<strong>发送结果尚未确认</strong>');
    next = once(next, '当前草稿可以保留；重试只使用这条原消息及其原引用，不会新建任务。', '输入已保留。核对结果后，可以重试这条消息。');
  }
  if (kind === 'collaboration') {
    next = once(next, '    input: CollaborationSendInputV1,\n    signal?: AbortSignal,\n  ): Promise<CollaborationCommandResultV1>',
      '    input: CollaborationSendInputV1,\n    signal?: AbortSignal,\n    canvasAddress?: { readonly canvasId: string; readonly workspaceId: string },\n  ): Promise<CollaborationCommandResultV1>');
    next = once(next, '          signal,\n          body: {\n            conversationId: input.conversationId,', `          signal,
          ...(canvasAddress ? { headers: { 'x-lcos-canvas-id': canvasAddress.canvasId, 'x-lcos-workspace-id': canvasAddress.workspaceId } } : {}),
          body: {
            conversationId: input.conversationId,`);
  }
  if (kind === 'permission') {
    next = once(next, 'interface PermissionTrayProps {', `interface PermissionTrayProps {
  onRespond?: (decision: { optionId: string } | { cancelled: true }) => Promise<void>;
  onSettled?: () => void;
  onError?: () => void;`);
    next = once(next, 'interface PermissionTrayProps {', 'interface PermissionTrayProps {\n  displayTitle?: string;\n  displayPreview?: string;');
    next = once(next, 'export function PermissionTray({\n  threadId,\n  messageId,\n  part,', 'export function PermissionTray({\n  threadId,\n  messageId,\n  part,\n  onRespond, onSettled, onError, displayTitle, displayPreview,');
    next = once(next, "  const { requestId, toolCall, options } = part;\n  const title = permissionTitle(part, t('messages.permissionRequested'));",
      "  const { requestId, toolCall, options } = part;\n  const title = displayTitle ?? permissionTitle(part, t('messages.permissionRequested'));");
    next = once(next, '    // Optimistic local resolution before the network round-trip.', `    if (onRespond) {
      try { await onRespond(option ? { optionId: option.optionId } : { cancelled: true }); onSettled?.(); }
      catch { onError?.(); }
      finally { setSubmitting(false); }
      return;
    }
    // Optimistic local resolution before the network round-trip.`);
    next = once(next, '      aria-label={t(\'messages.permissionRequestAria\')}', "      aria-label={t('messages.permissionRequestAria')}\n      data-native-session-request={onRespond ? requestId : undefined}");
    next = once(next, '        {preview && (', '        {displayPreview !== undefined ? <p className="text-fg-muted mt-2 text-sm leading-relaxed">{displayPreview}</p> : preview && (');
    next = once(next, '              key={option.optionId}\n              size="sm"', '              key={option.optionId}\n              data-native-permission-option={onRespond ? option.optionId : undefined}\n              size="sm"');
  }
  return marker + '\n' + next;
}
export function withNativeSessionCanvasUiTransforms(existing = {}) {
  const next = { ...existing };
  for (const [kind, file] of Object.entries(files)) {
    const prior = next[file]; next[file] = (source, options) => adapt(kind, prior ? prior(source, options) : source, options);
  }
  return next;
}
