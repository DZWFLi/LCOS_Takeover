import { nativeTaskRouteSourceTransforms, transformNativeTaskComposerSource } from './native-task-route-source-transform.mjs';

/** Keep the existing Drop owner and its receipts, but route its Composer to
 * the native Chatbox. A second LcosComposerHost would share a draft while
 * racing requests, refs and focus; removing this caller is a real migration. */
export function transformNativeChatOverlay(source) {
  const caller = /\{projectId && composerTarget && \(\s*<LcosComposerHost\s+projectId=\{projectId\}\s+workspaceId=\{composerTarget\.workspaceId\}\s+anchor=\{composerTarget\.anchor\}\s+open=\{showComposer\}\s+onClose=\{closeComposer\}\s*\/>\s*\)\}/g;
  if (!caller.test(source)) throw new Error('The existing nearfield Composer caller could not be located.');
  return source.replace(caller, '{/* The native Chatbox owns the existing shell Composer; Drop stays here. */}');
}
export function transformNativeComposerOwner(source) {
  let result = source
    .replace(/useLcosShellStore\.getState\(\)\.openAssembly\(receiver \? \{ kind: 'conversation', id: receiver \}\s*: workspaceId \? \{ kind: 'workspace', id: workspaceId \} : \{ kind: 'main' \}, '装配', false, inputKey\);/,
      'window.dispatchEvent(new CustomEvent(\'lcos-native-open-library\', { detail: { projectId, composerOriginKey: inputKey } }));')
    .replaceAll('从装配区找材料', '从材料库添加');
  // An unavailable service is recorded by its capability endpoint; it is not
  // presented as a permanently dead control. Busy/recording controls remain.
  const voice = result.indexOf('disabled={!isVoiceInputSupported() || voiceAvailable !== true');
  if (voice >= 0) {
    const start = result.lastIndexOf('<LcosIconButton', voice);
    const end = result.indexOf('</LcosIconButton>', voice) + '</LcosIconButton>'.length;
    if (start >= 0 && end > voice) result = result.slice(0,start)
      + '{voiceAvailable === true && isVoiceInputSupported() && (' + result.slice(start,end) + ')}' + result.slice(end);
  }
  return result;
}
/** Expose the existing diagnostic read owner, without changing the original
 * three-argument Composer's send admission or adding another journal store. */
export function transformNativeContinuationReadState(source) {
  const marker = '/* native continuation diagnostic read owner */';
  if (source.includes(marker)) return source;
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const once = (before, after) => {
    if (source.split(before).length !== 2) throw new Error('Original continuation diagnostic seam changed: ' + before.slice(0, 80));
    source = source.replace(before, after);
  };
  once('target: LcosComposerTarget | null, open: boolean) {',
    'target: LcosComposerTarget | null, open: boolean, diagnosticsConversationId?: string) {');
  once("const enabled = open && target?.intent === 'continue';",
    "const enabled = open && (diagnosticsConversationId !== undefined || target?.intent === 'continue');");
  once('const conversationId = enabled ? target?.receiverConversationId : undefined;',
    'const conversationId = enabled ? diagnosticsConversationId ?? target?.receiverConversationId : undefined;');
  once('if (!enabled || !target || !operation || projection?.capabilities.canSend !== true) return;',
    'if (diagnosticsConversationId !== undefined || !enabled || !target || !operation || projection?.capabilities.canSend !== true) return;');
  once('}, [enabled, operation, projection, projectId, target]);',
    '}, [diagnosticsConversationId, enabled, operation, projection, projectId, target]);');
  // A known disconnected projection stays readable while its diagnostics load.
  // This changes user wording only; the original error/retry and send guards remain.
  once("        : !projection || currentRead?.status !== 'ready' ? '正在准备当前会话…'" + eol
    + "          : projection.capabilities.canSend !== true ? projection.capabilityReasons?.canSend ?? '当前会话暂不能追加消息'",
    "        : projection?.capabilities.canSend === false ? projection.capabilityReasons?.canSend ?? '当前会话暂不能追加消息'" + eol
    + "          : !projection || currentRead?.status !== 'ready' ? '正在读取会话状态…'" + eol
    + "            : projection.capabilities.canSend !== true ? projection.capabilityReasons?.canSend ?? '当前会话暂不能追加消息'");
  once('return { blockedReason, retry, error, diagnostics:',
    "const diagnosticsStatus: 'loading' | 'ready' | 'error' = currentRead?.status ?? 'loading';" + eol
    + "  const userBlockedReason = blockedReason?.includes('owner') ? '当前会话暂不能接收消息，可以查看历史或新建任务。' : blockedReason;" + eol
    + '  return { blockedReason: userBlockedReason, retry, error, diagnosticsStatus, diagnostics:');
  return marker + eol + source;
}
export const nativeChatSourceTransforms = {
  ...nativeTaskRouteSourceTransforms,
  'lcos/huabu/apps/web/src/lcos/LcosHostOverlay.tsx': transformNativeChatOverlay,
  'lcos/huabu/apps/web/src/lcos/composer/LcosComposerHost.tsx': (source, options) =>
    transformNativeComposerOwner(transformNativeTaskComposerSource(source, options)),
  'lcos/huabu/apps/web/src/lcos/composer/useComposerContinuation.ts': transformNativeContinuationReadState,
};

export function withNativeChatSourceTransforms(existing) {
  const result = { ...existing };
  for (const [file, transform] of Object.entries(nativeChatSourceTransforms)) {
    const before = result[file];
    result[file] = before ? (source, options) => transform(before(source, options), options) : transform;
  }
  return result;
}
