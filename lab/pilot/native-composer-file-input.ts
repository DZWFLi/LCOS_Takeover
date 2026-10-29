import { useEffect, useRef } from 'react';
// @ts-expect-error the shipped EO hook, re-exported by the existing Flow shim.
import { useOriginalFileUploadManager } from '/lcos/native-flow.js';
import useCanvasStore from './native-canvas-port';
import { useLcosShellStore } from '../../lcos/huabu/apps/web/src/lcos/shell/lcosShellStore';
import { useLcosReferenceStore } from '../../lcos/huabu/apps/web/src/lcos/lcosReferenceState';
import { composerInputKey } from '../../lcos/huabu/apps/web/src/lcos/composer/composerInputJourney';
import { referencePickOwnerKey } from '../../lcos/huabu/apps/web/src/lcos/referencePickOwnership';

type Transfer = Pick<DataTransfer, 'types' | 'files'>;
type Context = { projectId: string; canvasId: string | null; workspaceId?: string; api: unknown;
  inputKey?: string; nodeId?: string; intent?: string; receiverConversationId?: string; messageId?: string; operationId?: string; open: boolean };
type Notice = { ok: boolean; message: string };
type Reference = { entityType: 'artifact'; entityId: string; artifactId: string; artifactViewId: string;
  revisionId: string; mimeType: string; displayLabel: string };
type References = { projectId: string | null; referenceInputOperations: ReadonlyMap<symbol, { owner: string; kind: string }>;
  beginReferenceInputOperation(owner: string, kind: 'preparing'): symbol; finishReferenceInputOperation(token: symbol): void;
  addEntitiesToDraft(refs: readonly Reference[], intent?: string): { added: number; reason?: string } };
export interface NativeComposerFilePorts {
  current(): Context;
  references(): References;
  uploadFiles(files: readonly File[]): Promise<any>;
  graph(projectId: string): Promise<any>;
  active(): boolean;
  notice(value: Notice): void;
  captureCaret(): unknown;
  restoreCaret(caret: unknown): void;
}
const text = (value: unknown): value is string => typeof value === 'string' && !!value.trim();
const sameInput = (a: Context, b: Context) => a.projectId === b.projectId && a.canvasId === b.canvasId && a.api === b.api
  && a.workspaceId === b.workspaceId && a.inputKey === b.inputKey && a.nodeId === b.nodeId && a.intent === b.intent
  && a.receiverConversationId === b.receiverConversationId && a.messageId === b.messageId && a.operationId === b.operationId && a.open && b.open;

/** Files are distinct from LCOS excerpts/library MIME and from plain text. */
export function hasNativeComposerFiles(transfer: Transfer | null | undefined): boolean {
  return !!transfer && (Array.from(transfer.types).includes('Files') || transfer.files.length > 0);
}

function exactImportedReference(info: any, projectId: string, graph: any): Reference | undefined {
  const ref = info?.lcos_ref;
  if (!info || ref?.version !== 1 || ref.entityType !== 'artifact' || ref.entityId !== ref.artifactId
    || !['artifactId', 'artifactViewId', 'revisionId'].every(key => text(ref[key]))
    || !text(info.fileRecordId) || !text(info.mime_type) || !text(info.file_name)) return;
  const artifact = graph?.artifacts?.find((row: any) => row.id === ref.artifactId);
  const revision = graph?.artifactRevisions?.find((row: any) => row.id === ref.revisionId && row.artifactId === ref.artifactId);
  const file = graph?.fileRecords?.find((row: any) => row.id === info.fileRecordId);
  const view = graph?.artifactViews?.find((row: any) => row.id === ref.artifactViewId);
  if (graph?.project?.id !== projectId || artifact?.projectId !== projectId || artifact.archivedAt !== undefined
    || !revision || !['current', 'superseded'].includes(revision.status) || revision.fileRecordId !== info.fileRecordId
    || !text(revision.contentHash) || file?.projectId !== projectId || file.availability !== 'current'
    || file.observedHash !== revision.contentHash || file.mimeType !== info.mime_type || file.size !== info.file_size
    || view?.artifactId !== ref.artifactId || view.revisionId !== ref.revisionId
    || !graph.scopes?.some((scope: any) => scope.id === view.scopeId && scope.projectId === projectId)) return;
  return { entityType: 'artifact', entityId: ref.artifactId, artifactId: ref.artifactId, artifactViewId: ref.artifactViewId,
    revisionId: ref.revisionId, mimeType: info.mime_type, displayLabel: info.file_name };
}

/** One asynchronous attachment gesture uses the original input-operation
 * owner and draft admission. No prompt, receiver, Canvas, Run or send write. */
export async function receiveNativeComposerFiles(files: readonly File[], ports: NativeComposerFilePorts): Promise<Notice> {
  const origin = ports.current(), refs = ports.references();
  const fail = (message: string) => ({ ok: false, message });
  if (!files.length) return fail('没有读取到文件，原输入保留。');
  if (!origin.open || !text(origin.projectId) || !text(origin.inputKey) || !text(origin.nodeId) || !origin.canvasId || !origin.api
    || refs.projectId !== origin.projectId || !ports.active()) return fail('原输入暂未就绪，文件未上传。');
  const owner = referencePickOwnerKey(origin.projectId, { nodeId: origin.nodeId, intent: origin.intent,
    receiverConversationId: origin.receiverConversationId });
  // Use the exact same owner key as LcosComposerHost's existing preparing flag.
  if (!owner || [...refs.referenceInputOperations.values()].some(operation => operation.owner === owner))
    return fail('当前材料仍在准备，请稍候；原输入保留。');
  const token = refs.beginReferenceInputOperation(owner, 'preparing'), caret = ports.captureCaret();
  const current = () => ports.active() && sameInput(origin, ports.current()) && ports.references().projectId === origin.projectId
    && ports.references().referenceInputOperations.get(token)?.owner === owner;
  try {
    if (!current()) return fail('原输入已变化，文件未上传。');
    ports.notice({ ok: true, message: '正在上传材料，尚未发送。' });
    const result = await ports.uploadFiles(files);
    if (!current()) return fail('上传结果留在传输列表，未加入其他输入。');
    const rows = Array.isArray(result?.results) ? result.results : [];
    const completed = rows.filter((row: any) => row?.result?.success === true && row.result.fileInfo);
    if (!completed.length) return fail('上传结果尚未确认，请在传输列表核对；原输入保留。');
    const graph = await ports.graph(origin.projectId);
    if (!current()) return fail('读取期间原输入已变化，材料保留，未加入其他输入。');
    const selected = completed.map((row: any) => exactImportedReference(row.result.fileInfo, origin.projectId, graph));
    if (selected.some((ref: Reference | undefined) => !ref)) return fail('上传材料的版本暂时无法核对，未替换为其他版本；原输入保留。');
    // Last check and original admission are synchronous: no later input can
    // slip between an awaited read and mutation of the shared draft.
    if (!current()) return fail('原输入已变化，材料未加入其他输入。');
    const admission = ports.references().addEntitiesToDraft(selected as Reference[], origin.intent);
    if (admission.reason) return fail(admission.reason);
    ports.restoreCaret(caret);
    return completed.length === rows.length && result?.success === true
      ? { ok: true, message: '文件已加入本次引用，尚未发送。' }
      : fail('已确认的文件已加入本次引用；其余上传结果请在传输列表核对，尚未发送。');
  } catch { return fail('上传或材料核对尚未完成，请在传输列表核对；原输入保留。');
  } finally { ports.references().finishReferenceInputOperation(token); }
}

export function useNativeComposerFileInput(input: { projectId: string; inputKey?: string; open: boolean;
  blocked: boolean; textareaRef: { current: HTMLTextAreaElement | null }; onNotice(value: Notice): void;
  session: { projects: { getProjectGraph(projectId: string): Promise<any> } } }) {
  const manager = useOriginalFileUploadManager();
  const latest = useRef(input); latest.current = input;
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  return (transfer: Transfer): boolean => {
    if (!hasNativeComposerFiles(transfer)) return false;
    const start = latest.current;
    if (start.blocked) { start.onNotice({ ok: false, message: '当前输入正在处理，文件未上传；原输入保留。' }); return true; }
    const context = (): Context => {
      const shell = useLcosShellStore.getState(), canvas = useCanvasStore.getState(), target = shell.composerTarget;
      const host = window.__LCOS_NODE_LAB__;
      return { projectId: shell.projectId ?? '', canvasId: canvas.canvasId, workspaceId: target?.workspaceId,
        api: canvas.rfInstance, inputKey: composerInputKey(target), nodeId: target?.nodeId, intent: target?.intent,
        messageId: target?.messageId, operationId: target?.continuationOperationId, receiverConversationId: target?.receiverConversationId,
        open: latest.current.open && shell.composerOpen && canvas.status === 'ready'
          && host?.projectId === shell.projectId && host.api === canvas.rfInstance };
    };
    const origin = context(), active = () => mounted.current && latest.current.projectId === start.projectId
      && latest.current.inputKey === start.inputKey && latest.current.open && !latest.current.blocked;
    if (origin.projectId !== start.projectId || origin.inputKey !== start.inputKey) {
      start.onNotice({ ok: false, message: '原输入已变化，文件未上传。' }); return true;
    }
    void receiveNativeComposerFiles(Array.from(transfer.files), {
      current: context, references: () => useLcosReferenceStore.getState(), active,
      uploadFiles: files => manager.uploadFiles(files), graph: project => start.session.projects.getProjectGraph(project),
      notice: value => { if (active() && sameInput(origin, context())) latest.current.onNotice(value); },
      captureCaret: () => {
        const shell = useLcosShellStore.getState(), editor = start.textareaRef.current;
        if (!editor || !origin.inputKey) return null;
        const caret = { editor, text: shell.composerPrompt, start: editor.selectionStart, end: editor.selectionEnd,
          focused: document.activeElement === editor };
        shell.rememberComposerCaret({ projectId: origin.projectId, targetKey: origin.inputKey, text: caret.text, start: caret.start, end: caret.end });
        return caret;
      },
      restoreCaret: captured => {
        const caret = captured as { editor: HTMLTextAreaElement; text: string; start: number; end: number; focused: boolean } | null;
        if (!caret?.focused) return;
        requestAnimationFrame(() => {
          const editor = start.textareaRef.current, shell = useLcosShellStore.getState();
          if (!active() || !sameInput(origin, context()) || editor !== caret.editor || !editor?.isConnected
            || shell.composerPrompt !== caret.text || document.activeElement !== editor
            || editor.selectionStart !== caret.start || editor.selectionEnd !== caret.end) return;
          editor.setSelectionRange(caret.start, caret.end);
        });
      },
    }).then(result => { if (active() && sameInput(origin, context())) latest.current.onNotice(result); });
    return true;
  };
}
