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
export const nativeChatSourceTransforms = {
  ...nativeTaskRouteSourceTransforms,
  'lcos/huabu/apps/web/src/lcos/LcosHostOverlay.tsx': transformNativeChatOverlay,
  'lcos/huabu/apps/web/src/lcos/composer/LcosComposerHost.tsx': (source, options) =>
    transformNativeComposerOwner(transformNativeTaskComposerSource(source, options)),
  'lcos/huabu/apps/web/src/lcos/composer/useComposerContinuation.ts': source => source.replace(
    'return { blockedReason, retry, error, diagnostics:',
    "const userBlockedReason = blockedReason?.includes('owner') ? '当前会话暂不能接收消息，可以查看历史或新建任务。' : blockedReason;\n  return { blockedReason: userBlockedReason, retry, error, diagnostics:"),
};

export function withNativeChatSourceTransforms(existing) {
  const result = { ...existing };
  for (const [file, transform] of Object.entries(nativeChatSourceTransforms)) {
    const before = result[file];
    result[file] = before ? (source, options) => transform(before(source, options), options) : transform;
  }
  return result;
}
