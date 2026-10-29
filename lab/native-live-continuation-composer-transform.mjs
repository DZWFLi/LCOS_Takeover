import path from 'node:path';
import { createRequire } from 'node:module';
import { installedRoot } from './pilot/build-pilot.mjs';
const root = path.resolve(import.meta.dirname, '..');
const ts = createRequire(path.join(installedRoot, 'package.json'))('typescript');
const file = 'lcos/huabu/apps/web/src/lcos/composer/LcosComposerHost.tsx';
const controls = 'lcos/huabu/apps/web/src/lcos/professional/ConversationContinuationControls.tsx';
const recovery = 'lcos/huabu/apps/web/src/lcos/professional/RecoverySection.tsx';
const collaboration = 'lcos/apps/web-gen2/src/backend/collaboration.ts';
const marker = '/* LCOS connect accepted new conversation in the original rail. */';
function transform(source, { sourcePath } = {}) {
  if (typeof sourcePath !== 'string' || ![file, controls, recovery, collaboration].some(owner => path.relative(root, path.resolve(sourcePath)).replaceAll('\\', '/').toLowerCase() === owner.toLowerCase()))
    throw new Error('Native live continuation transform requires its exact existing sourcePath.');
  if (source.includes(marker)) return source;
  if (path.relative(root, path.resolve(sourcePath)).replaceAll('\\', '/').toLowerCase() === collaboration.toLowerCase()) {
    const before = '.filter((op) => op.connectedConversationId === conversationId)';
    if (source.split(before).length !== 2) throw new Error('Original source/target diagnostics seam changed.');
    return marker + '\n' + source.replace(before, '.filter((op) => op.projectId === projectId && (op.connectedConversationId === conversationId || op.requestConnectedConversationId === conversationId))');
  }
  if (path.relative(root, path.resolve(sourcePath)).replaceAll('\\', '/').toLowerCase() === recovery.toLowerCase()) {
    const edits = [
      ['export interface RecoverySectionProps {', 'export interface RecoverySectionProps {\n  readonly title?: string;'],
      ['onRefreshed, diagnostics = false, conversationId }', "onRefreshed, diagnostics = false, conversationId, title = '会话恢复' }"],
      [": '会话恢复'}", ': title}'],
    ];
    let adapted = source;
    for (const [before, after] of edits) { if (adapted.split(before).length !== 2) throw new Error('Original Recovery title seam changed.'); adapted = adapted.replace(before, after); }
    return marker + '\n' + adapted;
  }
  if (path.relative(root, path.resolve(sourcePath)).replaceAll('\\', '/').toLowerCase() === controls.toLowerCase()) {
    const before = "disabled ? '当前消息尚未确认，请先核对或处理原消息'";
    if (source.split(before).length !== 2) throw new Error('Original disabled-request message seam changed.');
    const parsed = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX), fields = [];
    const visit = node => { if (ts.isJsxElement(node) && node.openingElement.tagName.getText(parsed) === 'fieldset') fields.push(node); ts.forEachChild(node, visit); }; visit(parsed);
    if (fields.length !== 1) throw new Error('Original conversation options section changed.');
    const at = fields[0].getStart(parsed);
    let specifier = path.relative(path.dirname(sourcePath), path.join(root, 'lab/pilot/native-task-route.ts')).replaceAll('\\', '/');
    if (!specifier.startsWith('.')) specifier = './' + specifier;
    const entry = `<button type="button" className="lcos-continuation-note" data-native-open-conversation-requests
          onClick={() => requestNativeConversationView({ projectId, conversationId, section: 'session-diagnostics' })}>查看会话请求</button>\n        `;
    return marker + '\nimport { requestNativeConversationView } from ' + JSON.stringify(specifier) + ';\n'
      + (source.slice(0, at) + entry + source.slice(at)).replace(before, "disabled ? '当前请求尚未确认，请先核对或处理原请求'");
  }
  const parsed = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  if (parsed.parseDiagnostics.length) throw new Error('Original Composer source must parse.');
  const callbacks = [];
  const visit = node => { if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(parsed) === 'ConversationContinuationControls') {
    for (const attr of node.attributes.properties) if (ts.isJsxAttribute(attr) && attr.name.getText(parsed) === 'onSubmitted') callbacks.push(attr);
  } ts.forEachChild(node, visit); }; visit(parsed);
  if (callbacks.length !== 1 || callbacks[0].getText(parsed) !== 'onSubmitted={() => continuation.retry()}') throw new Error('Original continuation submission callback seam changed.');
  const callback = callbacks[0];
  const control = callback.parent;
  const disabled = control.properties.find(attr => ts.isJsxAttribute(attr) && attr.name.getText(parsed) === 'disabled');
  if (!disabled || disabled.getText(parsed) !== 'disabled={retainedSend !== undefined}') throw new Error('Original continuation disabled seam changed.');
  let specifier = path.relative(path.dirname(sourcePath), path.join(root, 'lab/pilot/native-live-continuation.ts')).replaceAll('\\', '/');
  if (!specifier.startsWith('.')) specifier = './' + specifier;
  const oldFeedback = "'消息已提交 · 等待会话回应'";
  if (source.split(oldFeedback).length !== 2) throw new Error('Original continuation accepted-feedback seam changed.');
  const replacement = `onSubmitted={submission => {
            continuation.retry();
            if (submission.action !== 'blank_new' && submission.action !== 'selected_context' && submission.action !== 'continue_existing') return;
            const sourceConversationId = composerTarget?.receiverConversationId;
            const current = useLcosShellStore.getState();
            if (!sourceConversationId || current.projectId !== projectId
              || current.composerTarget?.receiverConversationId !== sourceConversationId) return;
            requestNativeLiveContinuation({ projectId, sourceConversationId, operationId: submission.operationId, action: submission.action });
          }}`;
  const adapted = marker + '\nimport { requestNativeLiveContinuation, nativeContinuationCreationPending } from ' + JSON.stringify(specifier) + ';\n'
    + source.slice(0, disabled.getStart(parsed))
    + 'disabled={retainedSend !== undefined || nativeContinuationCreationPending(continuation.diagnostics?.operations, projectId, composerTarget?.receiverConversationId)}'
    + source.slice(disabled.end, callback.getStart(parsed)) + replacement + source.slice(callback.end);
  return adapted.replace(oldFeedback, "'消息已提交'");
}
export const nativeLiveContinuationComposerTransforms = { [file]: transform, [controls]: transform, [recovery]: transform, [collaboration]: transform };
export function withNativeLiveContinuationComposerTransforms(existing = {}) {
  const result = { ...existing };
  for (const owner of [file, controls, recovery, collaboration]) {
    const before = result[owner];
    result[owner] = before ? (source, options) => transform(before(source, options), options) : transform;
  }
  return result;
}
