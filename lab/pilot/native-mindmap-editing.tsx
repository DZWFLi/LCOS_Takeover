import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MindMapEditor } from '../../lcos/huabu/apps/web/src/lcos/nodes/text/MindMapEditor';
import type { CanvasTextSnapshot } from '../../lcos/apps/web-gen2/src/backend/artifacts';
import { useLcosShellStore } from '../../lcos/huabu/apps/web/src/lcos/shell/lcosShellStore';
import useCanvasStore from './native-canvas-port';
import { readNativeTextReference, nativeTextFacts } from './native-text-policy';
import { canSaveNativeTextDraft, nativeTextPendingMatchesContext, nativeTextSnapshotMatchesContext } from './native-text-first-policy';
import { saveNativeCanvasText, verifyNativeCanvasTextSave, acknowledgeNativeCanvasTextSave, type NativeTextSaveResult } from './native-text-save';
import type { NativeMindMapControls, NativeMindMapDraftState } from './native-mindmap-editing-state';
import type { NativeMaterialViewerParts } from './native-material-viewer-types';
import './native-mindmap-editing.css';

export interface NativeMindMapEditingProps {
  projectId: string; canvasId: string; nodeId: string; artifactId: string; revisionId: string;
  onCancel(): void;
  onSaved(snapshot: CanvasTextSnapshot): void;
  parts: Pick<NativeMaterialViewerParts, 'ActionBar' | 'ActionButton'>;
  actionsTarget?: HTMLElement | null;
  actionsSelector?: string;
}
type DraftEntry = { base: CanvasTextSnapshot; state?: NativeMindMapDraftState; result?: NativeTextSaveResult };
// These are unsent editor drafts, not a material/Canvas mirror. In particular,
// an outer wa/c2 close must not drop an unresolved original-port operation.
const drafts = new Map<string, DraftEntry>();
const draftKey = (projectId: string, canvasId: string, nodeId: string, artifactId: string, viewId: string) =>
  JSON.stringify([projectId, canvasId, nodeId, artifactId, viewId]);

export function hasNativeMindMapDraft(projectId: string, canvasId: string, nodeId: string, artifactId: string, viewId: string, operationId?: string): boolean {
  const retained = drafts.get(draftKey(projectId, canvasId, nodeId, artifactId, viewId));
  return !!retained && (operationId === undefined || retained.result?.operationId === operationId);
}
const terminalSuccess = (result: NativeTextSaveResult) => result.status === 'confirmed' || result.status === 'unchanged';
function userSaveMessage(result: NativeTextSaveResult): string {
  if (['conflict', 'unobserved-revision', 'unmatched-response', 'readback-mismatch'].includes(result.status))
    return '正文已经变化，导图草稿已保留；没有覆盖新的版本。';
  if (result.status === 'context-changed' || result.status === 'wrong-canvas') return '现场已经变化，草稿保留在原位置。';
  return '这次保存尚未确认，导图草稿已保留。先核对原保存，不会重复提交。';
}
async function coreRead(path: string, signal: AbortSignal): Promise<any> {
  const response = await fetch('/api/lcos/core' + path, { signal, cache: 'no-store', redirect: 'error' });
  const payload = await response.json();
  if (!response.ok || payload?.ok !== true) throw new Error('原正文暂时无法读取，已有草稿仍保留。');
  return payload.value;
}

/** Only content + buttons for the shipped vZ edit mode. The original wa/d2/c2
 * still owns the single dialog, animation, sizing, focus and return anchor. */
function NativeMindMapEditingContent(props: NativeMindMapEditingProps) {
  const { projectId, canvasId, nodeId, artifactId, revisionId } = props;
  const mountApi = useRef(useCanvasStore.getState().rfInstance);
  const mounted = useRef(false), controls = useRef<NativeMindMapControls | null>(null);
  const [entry, setEntry] = useState<DraftEntry | null>(null);
  const [notice, setNotice] = useState('正在读取原正文…');
  const [pending, setPending] = useState<NativeTextSaveResult | null>(null);
  const [retry, setRetry] = useState(0);
  const [actionTarget, setActionTarget] = useState<HTMLElement | null>(props.actionsTarget ?? null);
  const root = useRef<HTMLDivElement>(null);
  const callbacks = useRef(props); callbacks.current = props;
  const context = useCallback(() => {
    const canvas = useCanvasStore.getState(), shell = useLcosShellStore.getState();
    const ref = readNativeTextReference(canvas.nodes.find(node => node.id === nodeId)?.data?.lcos_ref);
    if (shell.projectId !== projectId || canvas.status !== 'ready' || canvas.canvasId !== canvasId
      || canvas.rfInstance !== mountApi.current || !ref || ref.entityType !== 'artifact' || ref.artifactId !== artifactId)
      throw new Error('原现场或材料已变化，导图草稿仍保留。');
    return { projectId, canvasId, nodeId, reference: ref };
  }, [projectId, canvasId, nodeId, artifactId]);
  const keyFor = (draft: DraftEntry) => draftKey(projectId, canvasId, nodeId, artifactId, draft.base.viewId);
  const consume = useCallback((draft: DraftEntry, result: NativeTextSaveResult): boolean => {
    draft.result = result;
    let live: ReturnType<typeof context>;
    try { live = context(); } catch { return false; }
    if (!mounted.current) return false; // retain late result and draft for resume
    if (terminalSuccess(result) && result.value && nativeTextSnapshotMatchesContext(result.value, live)) {
      drafts.delete(draftKey(projectId, canvasId, nodeId, artifactId, draft.base.viewId));
      if (result.operationId) acknowledgeNativeCanvasTextSave(result.operationId);
      callbacks.current.onSaved(result.value);
      return true;
    }
    const operation = result.operationId ? window.__LCOS_NATIVE_TEXT_SAVE_PORT__?.getPending(result.operationId) : null;
    const matching = operation && nativeTextPendingMatchesContext(operation, live);
    // acknowledge is deliberately a no-op for unresolved work. A lost/partial
    // receipt stays in the existing port and can only be read-only verified.
    const released = matching && result.operationId && acknowledgeNativeCanvasTextSave(result.operationId);
    const retained = matching && !released ? { status: operation.status, operationId: operation.operationId } : null;
    if (!retained) draft.result = undefined;
    setPending(retained); setNotice(userSaveMessage(result));
    return false;
  }, [context, projectId, canvasId, nodeId, artifactId]);

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    void (async () => {
      try {
        const initial = context();
        const query = new URLSearchParams({ canvasId, spatialId: nodeId });
        const [text, detail] = await Promise.all([
          coreRead('/projects/' + encodeURIComponent(projectId) + '/curation/canvas-text?' + query, controller.signal),
          coreRead('/artifacts/' + encodeURIComponent(artifactId), controller.signal),
        ]);
        if (controller.signal.aborted) return;
        const live = context();
        if (live.reference.artifactViewId !== initial.reference.artifactViewId) throw new Error('原节点已经指向另一份材料，草稿保留。');
        nativeTextFacts({ ...live, text, detail });
        const cacheKey = draftKey(projectId, canvasId, nodeId, artifactId, text.viewId);
        const retained = drafts.get(cacheKey);
        if (!retained && (text.revisionId !== revisionId || text.revisionId !== live.reference.revisionId))
          throw new Error('当前版本已变化，请返回正文重新打开；没有用新正文替换旧草稿。');
        const current = retained ?? { base: text };
        drafts.set(cacheKey, current); setEntry(current);
        const operation = window.__LCOS_NATIVE_TEXT_SAVE_PORT__?.getPending({ canvasId, nodeId });
        const registered = operation && nativeTextPendingMatchesContext(operation, live)
          ? { status: operation.status, operationId: operation.operationId } : null;
        setPending(registered);
        setNotice(current.base.revisionId !== live.reference.revisionId
          ? '原正文已更新，未确认的导图草稿仍在；保存不会覆盖新的版本。'
          : registered ? '上次保存仍待核对，导图草稿已保留。' : '');
        if (current.result && terminalSuccess(current.result)) consume(current, current.result);
      } catch (error) {
        if (!controller.signal.aborted) setNotice(error instanceof Error ? error.message : '原正文暂时无法读取，草稿仍保留。');
      }
    })();
    return () => { mounted.current = false; controller.abort(); };
  }, [context, projectId, canvasId, nodeId, artifactId, revisionId, retry, consume]);

  useLayoutEffect(() => {
    if (props.actionsTarget) { setActionTarget(props.actionsTarget); return; }
    if (!props.actionsSelector) return;
    const viewer = root.current?.closest('[data-media-viewer]');
    if (!viewer) return;
    const find = () => {
      const target = viewer.querySelector<HTMLElement>(props.actionsSelector!);
      if (target) setActionTarget(target);
      return !!target;
    };
    if (find()) return;
    const observer = new MutationObserver(() => { if (find()) observer.disconnect(); });
    observer.observe(viewer, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [props.actionsTarget, props.actionsSelector]);

  const retainDraft = useCallback((state: NativeMindMapDraftState) => {
    if (entry) entry.state = state;
  }, [entry]);
  const cancel = useCallback(() => {
    if (!entry || pending || controls.current?.busy) return;
    drafts.delete(keyFor(entry)); callbacks.current.onCancel();
  }, [entry, pending, projectId, canvasId, nodeId, artifactId]);
  const save = useCallback(async (input: { title: string; body: string }) => {
    if (!entry || pending) return false;
    let live: ReturnType<typeof context>;
    try { live = context(); } catch (error) { setNotice((error as Error).message); return false; }
    if (!canSaveNativeTextDraft(entry.base, live)) { setNotice('原正文已更新，导图草稿已保留；没有覆盖新的版本。'); return false; }
    if (input.title !== entry.base.title) { setNotice('请通过原节点命名入口改标题，导图草稿已保留。'); return false; }
    entry.result = { status: 'saving' }; setPending(entry.result); setNotice('正在保存…');
    let result: NativeTextSaveResult;
    try { result = await saveNativeCanvasText({ projectId, canvasId, nodeId, artifactId,
      expectedRevisionId: entry.base.revisionId, body: input.body }); }
    catch { result = { status: 'error' }; }
    return consume(entry, result);
  }, [entry, pending, context, projectId, canvasId, nodeId, artifactId, consume]);
  const verify = async () => {
    if (!entry || !pending?.operationId) return;
    const result = await verifyNativeCanvasTextSave(pending.operationId);
    consume(entry, result);
  };
  const renderActions = (value: NativeMindMapControls): ReactNode => {
    controls.current = value;
    const Button = props.parts.ActionButton, busy = value.busy || !!pending;
    return <>
      {value.error && <p className="native-mindmap-editing-message" role="status">{value.error}</p>}
      {actionTarget && createPortal(<>
        <Button label="复制分支（Ctrl+C）" tooltipsEnabled disabled={busy || !value.branchSelected} onClick={value.copy}>复制</Button>
        <Button label="剪切分支（Ctrl+X）" tooltipsEnabled disabled={busy || !value.branchSelected} onClick={value.cut}>剪切</Button>
        <Button label="删除分支（Del）" tooltipsEnabled disabled={busy || !value.branchSelected} onClick={value.remove}>删除</Button>
        <Button label="粘贴分支（Ctrl+V）" tooltipsEnabled disabled={busy || !value.canPaste} onClick={value.paste}>粘贴</Button>
        <Button label="取消本次编辑" tooltipsEnabled disabled={busy} onClick={cancel}>取消</Button>
        <Button label="保存导图" tooltipsEnabled disabled={busy} onClick={value.save}>保存</Button>
        {pending?.operationId && <Button label="只核对上次保存，不会重复提交" tooltipsEnabled onClick={() => { void verify(); }}>核对保存</Button>}
      </>, actionTarget)}
    </>;
  };
  return <div ref={root} className="native-mindmap-editing" data-native-mindmap-editing={nodeId}>
    {notice && <p className="native-mindmap-editing-message" role="status">{notice}
      {!entry && <button type="button" onClick={() => setRetry(value => value + 1)}>重读正文</button>}</p>}
    {entry && <>
      <p className="native-mindmap-editing-help">双击改字 · Tab 加子级 · Shift+Tab 升级 · Enter 加同级 · Ctrl+C/X/V 操作分支 · Del 删除</p>
      {/* These props are supplied by the in-memory transform of this exact
          project-owned Gen1 editor; the original file remains read-only. */}
      <MindMapEditor {...{ embedded: true, resumeState: entry.state, onDraftChange: retainDraft, renderActions } as any}
        title={entry.base.title} outline={entry.base.body} disabled={!!pending} onCancel={cancel} onSave={save} />
    </>}
  </div>;
}

export function NativeMindMapEditing(props: NativeMindMapEditingProps) {
  const key = JSON.stringify([props.projectId, props.canvasId, props.nodeId, props.artifactId, props.revisionId]);
  return <NativeMindMapEditingContent key={key} {...props} />;
}
