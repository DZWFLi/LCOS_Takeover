// native-reader-recovery delegation
import { attachNativeReaderRecovery, readyNativeReaderRecovery, nativeReaderRecoveryCurrent, observeNativeReaderRecovery, closeNativeReaderRecovery, failNativeReaderRecovery, inheritNativeReaderRecovery } from './native-reader-recovery-state';
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Archive, ArchiveRestore, ArrowLeft, Download, FileSearch, FolderOpen, Link, MoreHorizontal } from 'lucide-react';
import { createLcosCoreSession } from '../../lcos/huabu/apps/web/src/lcos/app/lcosCoreClient';
import { useLcosShellStore } from '../../lcos/huabu/apps/web/src/lcos/shell/lcosShellStore';
import { useLcosReferenceStore } from '../../lcos/huabu/apps/web/src/lcos/lcosReferenceState';
import { composerInputKey, restoredComposerCaret } from '../../lcos/huabu/apps/web/src/lcos/composer/composerInputJourney';
import { prepareDraftReferences, runReferenceUnavailableReason } from '../../lcos/huabu/apps/web/src/lcos/composer/referenceSnapshot';
import { readReaderFormat } from '../../lcos/huabu/apps/web/src/lcos/professional/readerFormats';
import { readerLineageEntries, type ReaderLineageEntry } from '../../lcos/huabu/apps/web/src/lcos/professional/readerLineage';
import { materialCitationBlock, type MaterialSourceV1 } from '../../lcos/huabu/apps/web/src/lcos/ui/professional/donor/Gen1TextTransfer';
import type { ReaderVisibleContent } from '../../lcos/huabu/apps/web/src/lcos/ui/professional/ReaderContentView';
import type { RevisionCompareResultV1 } from '../../lcos/apps/web-gen2/src/backend/artifacts';
import { captureNativeLibraryInputReturn, restoreNativeLibraryInputReturn, type NativeLibraryInputReturn } from './native-library-contexts';
import { nativeMaterialViewEvent, registerNativeMaterialViewerOwner, type NativeMaterialViewRequest } from './native-material-viewer-port';
import { canOpenNativeMaterialMindMap, nativeMaterialVersionLabel, resolveNativeMaterialMindMapRecoveryVersion, resolveNativeMaterialVersion, type NativeMaterialVersion } from './native-material-viewer-read';
import type { NativeMaterialViewerParts, NativeMaterialViewerRuntime } from './native-material-viewer-types';
import { NativeMaterialTextReading } from './native-material-reading';
import useCanvasStore from './native-canvas-port';
import { requestNativeConversationView, requestNativeTaskView } from './native-task-route';
import './native-material-viewer.css';

const Pdf = lazy(() => import('../../lcos/huabu/apps/web/src/lcos/ui/professional/ReaderPdfView').then(m => ({ default: m.ReaderPdfView })));
const Pptx = lazy(() => import('../../lcos/huabu/apps/web/src/lcos/ui/professional/ReaderPptxView').then(m => ({ default: m.ReaderPptxView })));
const Format = lazy(() => import('../../lcos/huabu/apps/web/src/lcos/ui/professional/ReaderFormatContent').then(m => ({ default: m.ReaderFormatContentView })));
const MindMapEditing = lazy(() => import('./native-mindmap-editing').then(m => ({ default: m.NativeMindMapEditing })));
type Session = ReturnType<typeof createLcosCoreSession>;
type Loaded = { version: NativeMaterialVersion; blob: Blob; url: string; content: ReaderVisibleContent; lineage: readonly ReaderLineageEntry[] };
type Operation = { key: number; target: NativeMaterialViewRequest; canvasId: string; api: unknown;
  controller: AbortController; inputReturn: NativeLibraryInputReturn | null; viewerId: string; trail: readonly NativeMaterialViewRequest[] };
class MaterialUserError extends Error {}
const positionKey = (v: NativeMaterialVersion) => JSON.stringify([v.projectId, v.artifactId, v.revisionId]);
const exactSource = (v: NativeMaterialVersion): MaterialSourceV1 => ({ projectId: v.projectId, artifactId: v.artifactId,
  revisionId: v.revisionId, fileRecordId: v.fileRecordId, ...(v.artifactViewId ? { viewId: v.artifactViewId } : {}), title: v.title });

function ReadingState({ error = false, onRetry, message }: { error?: boolean; onRetry?: () => void; message?: string }) {
  return <div className="native-material-state" data-lcos-native-material-state={error ? 'error' : 'loading'} role={error ? 'alert' : 'status'}>
    <span>{message ?? (error ? '这份材料暂时无法打开，所选版本保留。' : '正在打开材料…')}</span>
    {error && onRetry && <button onClick={onRetry}>重读同一版本</button>}
  </div>;
}

function NativeFormatBody({ loaded, target }: { loaded: Loaded; target: NativeMaterialViewRequest }) {
  const content = loaded.content, source = { ...exactSource(loaded.version), locator: target.sourceLocator };
  if (!content) return <div className="native-material-state" role="status">此格式暂时不能预览，可以下载同一版本。</div>;
  return <div className="native-material-format-body"><Suspense fallback={<ReadingState />}>
    {content.kind === 'pdf' ? <Pdf content={content} fileName={loaded.version.title} source={source} />
      : content.kind === 'pptx' ? <Pptx content={content} fileName={loaded.version.title} source={source} />
        : content.kind === 'office' || content.kind === 'html' ? <Format content={content} fileName={loaded.version.title} />
          : content.kind === 'audio' ? <div className="native-material-audio"><strong>{loaded.version.title}</strong>
            <audio controls src={content.url} aria-label={loaded.version.title} /></div> : null}
  </Suspense></div>;
}

async function mediaDimensions(url: string, video: boolean, signal: AbortSignal): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const media = video ? document.createElement('video') : new Image();
    const finish = (error?: Error) => {
      media.removeEventListener(video ? 'loadedmetadata' : 'load', loaded);
      media.removeEventListener('error', failed); signal.removeEventListener('abort', aborted);
      const width = video ? (media as HTMLVideoElement).videoWidth : (media as HTMLImageElement).naturalWidth;
      const height = video ? (media as HTMLVideoElement).videoHeight : (media as HTMLImageElement).naturalHeight;
      if (video) { media.removeAttribute('src'); (media as HTMLVideoElement).load(); }
      if (error || width <= 0 || height <= 0) reject(error ?? new Error('媒体尺寸暂时不可读。'));
      else resolve({ width, height });
    };
    const loaded = () => finish(), failed = () => finish(new Error('媒体解码失败。'));
    const aborted = () => finish(new DOMException('Material read cancelled', 'AbortError'));
    if (signal.aborted) { aborted(); return; }
    media.addEventListener(video ? 'loadedmetadata' : 'load', loaded, { once: true });
    media.addEventListener('error', failed, { once: true }); signal.addEventListener('abort', aborted, { once: true });
    media.src = url;
  });
}

function MaterialOptions({ loaded, target, session, parts, current, selectVersion, cite, close, canCite, onBack, openSource }: {
  loaded: Loaded; target: NativeMaterialViewRequest; session: Session; parts: NativeMaterialViewerParts;
  current(): boolean; selectVersion(revisionId: string): Promise<void>; cite(selection?: string): Promise<string>; close(): void;
  canCite: boolean; onBack?: () => void; openSource(entry: ReaderLineageEntry): Promise<void>;
}) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [note, setNote] = useState('');
  const [compare, setCompare] = useState<RevisionCompareResultV1 | null>(null);
  const [source, setSource] = useState<{ exists: boolean; isUrl: boolean; path: string } | null>(null);
  const [lifecyclePending, setLifecyclePending] = useState<'archive' | 'restore' | null>(null);
  const Popover = parts.Popover, Button = parts.ActionButton, version = loaded.version;
  const selectedRevision = version.revisions.find(row => String(row.id) === version.revisionId);
  const comparisonRevision = selectedRevision?.parentRevisionId
    ? version.revisions.find(row => String(row.id) === String(selectedRevision.parentRevisionId))
    : version.currentRevisionId !== version.revisionId ? version.revisions.find(row => String(row.id) === version.currentRevisionId) : undefined;
  const act = async (operation: () => Promise<string | void>) => {
    if (busy || !current()) return;
    setBusy(true); setNote('');
    try { const result = await operation(); if (current() && result) setNote(result); }
    catch (error) { if (current()) setNote(error instanceof MaterialUserError ? error.message : '操作暂未确认，请重新核对后再试。'); }
    finally { if (current()) setBusy(false); }
  };
  const download = () => { if (!current()) return; const link = document.createElement('a'); link.href = loaded.url;
    link.download = version.title; link.click(); };
  return <>
    {onBack && <Button label="返回上一份材料" tooltipsEnabled onClick={onBack}><ArrowLeft size={20} /></Button>}
    {canCite && <Button label="加入当前输入" tooltipsEnabled onClick={() => void act(async () => { const result = await cite(); close(); return result; })}>
      <Link size={20} /></Button>}
    <Button label="下载当前阅读版本" tooltipsEnabled onClick={download}><Download size={20} /></Button>
    <Popover trigger="click" open={open} onOpenChange={setOpen} side="top" align="end" sideOffset={12}
      contentClassName="p-0" content={<div className="native-material-viewer-menu" data-lcos-native-material-options>
        <h3>{version.title}</h3>
        <label>阅读版本<select aria-label="阅读版本" value={version.revisionId} disabled={busy}
          onChange={event => void act(() => selectVersion(event.target.value))}>
          {version.revisions.map((row, index) => <option key={String(row.id)} value={String(row.id)}>
            {nativeMaterialVersionLabel({ isDraft: row.status === 'draft', isCurrent: String(row.id) === version.currentRevisionId,
              createdAt: row.createdAt })} · {version.revisions.length - index}</option>)}
        </select></label>
        <p>{nativeMaterialVersionLabel(version)}{version.archived ? ' · 已归档' : ''}</p>
        <button disabled={busy || !comparisonRevision} onClick={() => void act(async () => {
          if (!comparisonRevision) return;
          const result = await session.artifacts.compareRevisions(version.projectId, String(comparisonRevision.id), version.revisionId);
          if (current()) setCompare(result);
        })}><FileSearch size={15} />{selectedRevision?.parentRevisionId ? '与上一版本对照' : '与当前版本对照'}</button>
        {compare && <div className="native-material-compare" data-lcos-native-revision-compare>
          <p>{comparisonRevision && nativeMaterialVersionLabel({ isDraft: comparisonRevision.status === 'draft',
            isCurrent: String(comparisonRevision.id) === version.currentRevisionId, createdAt: comparisonRevision.createdAt })} → {nativeMaterialVersionLabel(version)}</p>
          {!compare.changed ? '两个版本相同。' : !compare.contentAvailable ? '此格式目前只能对照版本信息。'
            : compare.diff?.map((line, index) => <div key={index} data-kind={line.type}>{line.type === 'add' ? '+ ' : line.type === 'remove' ? '− ' : '  '}{line.text}</div>)}
        </div>}
        <button disabled={busy} onClick={() => void act(async () => {
          const value = await session.artifacts.artifactSourcePath(version.artifactId);
          if (current()) setSource(value);
          return value.exists || value.isUrl ? '原文件已找到。' : '原文件当前不在原位置；阅读版本仍保留。';
        })}><FolderOpen size={15} />查找原文件</button>
        {loaded.lineage.map(entry => <button key={entry.relationId + ':' + entry.artifactId + ':' + entry.revisionId}
          disabled={busy || !!entry.unavailableReason} title={entry.unavailableReason}
          onClick={() => void act(() => openSource(entry))}><ArrowLeft size={15} />来源 · {entry.title}{entry.locator?.label ? ` · ${entry.locator.label}` : ''}</button>)}
        {source?.isUrl && /^https?:\/\//i.test(source.path) && <a href={source.path} target="_blank" rel="noopener noreferrer">打开来源链接</a>}
        {source?.exists && !source.isUrl && <>
          <button disabled={busy} onClick={() => void act(async () => {
            const result = await session.artifacts.openArtifactSource(version.artifactId);
            if (!result.opened) throw new Error('Source open not confirmed'); return '已请求打开原文件。';
          })}>打开原文件</button>
          <button disabled={busy} onClick={() => void act(async () => {
            const result = await session.artifacts.revealArtifactSource(version.artifactId);
            if (!result.revealed) throw new Error('Source reveal not confirmed'); return '已请求在文件夹显示。';
          })}>在文件夹显示</button>
          {!version.isCurrent && <p>此处打开登记的原文件；阅读内容仍是所选历史版本。</p>}
        </>}
        <button disabled={busy} onClick={() => void act(async () => {
          const action = lifecyclePending ?? (version.archived ? 'restore' : 'archive');
          const desiredArchived = action === 'archive';
          const before = await session.artifacts.getArtifactDetail(version.artifactId);
          if (!current()) return;
          if (String(before.artifact.projectId) !== version.projectId) throw new MaterialUserError('材料所属项目已变化，未修改。');
          let result = before.artifact;
          if ((result.archivedAt !== undefined) !== desiredArchived) {
            if (lifecyclePending) throw new MaterialUserError('操作结果仍未确认，阅读版本保留；请稍后再次核对。');
            setLifecyclePending(action);
            try { result = action === 'restore' ? await session.artifacts.restoreArtifact(version.projectId, version.artifactId)
              : await session.artifacts.archiveArtifact(version.projectId, version.artifactId); }
            catch { throw new MaterialUserError('操作回执未确认，请核对结果；不会自动重复提交。'); }
          }
          if (String(result.id) !== version.artifactId || String(result.projectId) !== version.projectId
            || (result.archivedAt !== undefined) !== desiredArchived) throw new MaterialUserError('操作回执尚未核对，阅读版本保留。');
          setLifecyclePending(null);
          useLcosReferenceStore.getState().requestNodeBindingRefresh();
          await selectVersion(version.revisionId);
          return desiredArchived ? '材料已归档；画布更新仍按实际回执确认。' : '材料已恢复。';
        })}>{version.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}{lifecyclePending ? '核对操作结果' : version.archived ? '恢复材料' : '归档材料'}</button>
        {note && <p role="status">{note}</p>}
      </div>}>
      <span><Button label="阅读选项" tooltipsEnabled><MoreHorizontal size={20} /></Button></span>
    </Popover>
  </>;
}

/** Read Core bytes into the original viewer session. This component renders no
 * extra window or canvas. Native d2 still owns opening, inspect and closing. */
export function NativeMaterialViewerHost({ runtime, parts }: { runtime: NativeMaterialViewerRuntime; parts: NativeMaterialViewerParts }) {
  const session = useMemo(() => createLcosCoreSession(), []), operation = useRef<Operation | null>(null);
  const sequence = useRef(0), resources = useRef<string[]>([]), latestParts = useRef(parts); latestParts.current = parts;
  const shellProject = useLcosShellStore(state => state.projectId);
  const canvasId = useCanvasStore(state => state.canvasId), canvasApi = useCanvasStore(state => state.rfInstance);
  useEffect(() => {
    const unregisterOwner = registerNativeMaterialViewerOwner();
    const ownedRequests = new Set<number>();
    const present = (value: Record<string, any>) => { ownedRequests.add(value.lcosControlled.requestKey); runtime.open(attachNativeReaderRecovery(value, operation.current?.target)); };
    const disposeResources = () => { resources.current.forEach(url => URL.revokeObjectURL(url)); resources.current = []; };
    const isCurrent = (owner: Operation) => {
      const canvas = useCanvasStore.getState();
      return operation.current === owner && !owner.controller.signal.aborted
        && useLcosShellStore.getState().projectId === owner.target.projectId
        && canvas.status === 'ready' && canvas.canvasId === owner.canvasId && canvas.rfInstance === owner.api
        && nativeReaderRecoveryCurrent(owner.target);
    };
    const close = (owner: Operation) => { if (operation.current === owner) runtime.close(owner.viewerId); };
    const open = async (requested: NativeMaterialViewRequest, returning?: NativeLibraryInputReturn | null,
      trail: readonly NativeMaterialViewRequest[] = []) => {
      const canvas = useCanvasStore.getState();
      if (useLcosShellStore.getState().projectId !== requested.projectId || canvas.status !== 'ready' || !canvas.canvasId) return;
      // Match the existing Reader continuity: an unspecified address resumes
      // its last read version. Missing explicit/remembered versions stay errors.
      const remembered = requested.revisionId === undefined && requested.artifactViewId === undefined
        ? useLcosShellStore.getState().readerLastRevisions[JSON.stringify([requested.projectId, requested.artifactId])] : undefined;
      const target = remembered ? { ...requested, revisionId: remembered } : requested;
      const previous = operation.current;
      previous?.controller.abort();
      const inputReturn = returning === undefined ? captureNativeLibraryInputReturn(target.projectId) : returning;
      const legacyOrigin = useLcosShellStore.getState().windows.find(row => row.id === target.legacyReturnWindowId);
      const returnTrail = !trail.length && legacyOrigin?.bodyKey === 'reader' && legacyOrigin.target
        && legacyOrigin.target !== target.artifactId ? [{ projectId: target.projectId, artifactId: legacyOrigin.target,
          revisionId: legacyOrigin.readerRevisionId, sourceLocator: legacyOrigin.sourceLocator,
          nodeId: legacyOrigin.readerSource?.nodeId, composerOriginKey: legacyOrigin.composerOriginKey }] : trail;
      const owner: Operation = { key: ++sequence.current, target, canvasId: canvas.canvasId, api: canvas.rfInstance,
        controller: new AbortController(), inputReturn, viewerId: previous?.viewerId ?? `lcos-material:${target.artifactId}`, trail: returnTrail };
      operation.current = owner;
      const native = latestParts.current;
      const currentViewer = runtime.getState().session;
      const initial = !currentViewer?.lcosControlled || !previous || previous.target.artifactId !== target.artifactId;
      if (initial) present({ id: owner.viewerId, media: { type: 'text', title: target.title ?? '材料', markdown: '' },
        actions: {}, lcosControlled: { requestKey: owner.key, bodySlot: <ReadingState />, hideCopy: true } });
      try {
        const [detail, revisions, graph] = await Promise.all([session.artifacts.getArtifactDetail(target.artifactId, owner.controller.signal),
          session.artifacts.listArtifactRevisions(target.artifactId, owner.controller.signal), session.projects.getProjectGraph(target.projectId)]);
        if (!isCurrent(owner)) return;
        let version: NativeMaterialVersion;
        try { version = resolveNativeMaterialVersion(target, detail, revisions, graph); }
        catch (error) {
          if (target.editMode !== 'mindmap' || !target.nodeId) throw error;
          const node = canvas.rfInstance?.getNodes().find(row => row.id === target.nodeId);
          const reference = node?.data?.lcos_ref as Record<string, unknown> | undefined;
          const retainedDraft = typeof reference?.artifactViewId === 'string'
            && (await import('./native-mindmap-editing')).hasNativeMindMapDraft(target.projectId, canvas.canvasId,
              target.nodeId, target.artifactId, reference.artifactViewId);
          if (!isCurrent(owner)) return;
          version = resolveNativeMaterialMindMapRecoveryVersion(target, detail, revisions, graph, {
            canvasId: canvas.canvasId, nodeId: target.nodeId, reference, retainedDraft,
            pending: window.__LCOS_NATIVE_TEXT_SAVE_PORT__?.getPending({ canvasId: canvas.canvasId, nodeId: target.nodeId }),
          });
        }
        const blob = await session.artifacts.getFileRecordContent(target.projectId, version.fileRecordId, owner.controller.signal);
        if (!isCurrent(owner)) return;
        if (blob.type.split(';')[0]?.toLowerCase() !== version.mimeType.split(';')[0]?.toLowerCase()) throw new Error('Exact file MIME changed');
        const url = URL.createObjectURL(blob); resources.current.push(url);
        const mime = blob.type.toLowerCase().split(';')[0];
        const format = await readReaderFormat(blob, { fileName: '', viewKey: positionKey(version), signal: owner.controller.signal });
        const text = !format && (mime?.startsWith('text/') || ['application/json', 'application/yaml', 'application/xml'].includes(mime ?? '')) ? await blob.text() : undefined;
        const mediaKind = mime?.startsWith('image/') ? 'image' : mime?.startsWith('video/') ? 'video' : null;
        const dimensions = mediaKind ? await mediaDimensions(url, mediaKind === 'video', owner.controller.signal) : null;
        if (!isCurrent(owner)) return;
        const content: ReaderVisibleContent = format ?? (text !== undefined ? { kind: 'text', value: text, mimeType: blob.type, viewKey: positionKey(version) }
          : mime === 'application/pdf' ? { kind: 'pdf', url, mimeType: blob.type, viewKey: positionKey(version) }
            : mime?.startsWith('audio/') ? { kind: 'audio', url, mimeType: blob.type, viewKey: positionKey(version) } : null);
        const loaded: Loaded = { version, blob, url, content, lineage: readerLineageEntries(target.projectId, target.artifactId, graph) };
        const cite = async (excerpt?: string): Promise<string> => {
          if (!isCurrent(owner)) throw new MaterialUserError('阅读目标已变化，未加入其他输入。');
          const shell = useLcosShellStore.getState(), inputKey = composerInputKey(shell.composerTarget);
          const expected = target.composerOriginKey ?? inputReturn?.inputKey;
          if (!inputReturn || !inputKey || inputKey !== expected || shell.projectId !== target.projectId
            || shell.composerTarget?.messageId !== inputReturn.messageId
            || shell.composerTarget?.continuationOperationId !== inputReturn.continuationOperationId
            || useLcosReferenceStore.getState().projectId !== target.projectId) throw new MaterialUserError('当前输入已变化，请从要使用的输入重新打开材料。');
          const ref = { entityType: 'artifact' as const, entityId: version.artifactId, revisionId: version.revisionId,
            displayLabel: version.title, mimeType: version.mimeType };
          const prepared = prepareDraftReferences([ref], shell.composerTarget?.intent);
          if (prepared.reason) throw new MaterialUserError(prepared.reason);
          if (shell.composerTarget?.intent !== 'continue') { const reason = runReferenceUnavailableReason(ref); if (reason) throw new MaterialUserError(reason); }
          const admission = useLcosReferenceStore.getState().addEntitiesToDraft(prepared.references, shell.composerTarget?.intent);
          if (admission.reason) throw new MaterialUserError(admission.reason);
          if (excerpt) {
            const live = useLcosShellStore.getState(), caret = restoredComposerCaret(live.composerCaret, target.projectId, inputKey, live.composerPrompt);
            const prefix = live.composerPrompt.slice(0, caret.start), suffix = live.composerPrompt.slice(caret.end);
            const insertion = `${prefix && !prefix.endsWith('\n') ? '\n\n' : ''}${materialCitationBlock({ ...exactSource(version), locator: target.sourceLocator }, excerpt)}${suffix ? '\n\n' : ''}`;
            const next = prefix + insertion + suffix; live.setComposerPrompt(next);
            live.rememberComposerCaret({ projectId: target.projectId, targetKey: inputKey, text: next,
              start: prefix.length + insertion.length, end: prefix.length + insertion.length });
          }
          return '已加入当前输入，尚未发送。';
        };
        const citeSelection = async (): Promise<string> => {
          const selected = window.getSelection(), root = document.querySelector('[data-lcos-native-text-reading] .lcos-reader-measure');
          if (!selected || !root || !selected.rangeCount || !selected.toString().trim()
            || ![...Array(selected.rangeCount)].every((_, index) => { const range = selected.getRangeAt(index);
              return root.contains(range.startContainer) && root.contains(range.endContainer); })) throw new MaterialUserError('先选中这份正文再摘录。');
          const message = await cite(selected.toString().trim()); close(owner); return message;
        };
        const selectVersion = async (revisionId: string) => {
          if (!isCurrent(owner)) return;
          await open({ ...target, revisionId, ...(revisionId === version.revisionId && version.artifactViewId
            ? { artifactViewId: version.artifactViewId } : { artifactViewId: undefined }) }, inputReturn, owner.trail);
        };
        const openSource = async (entry: ReaderLineageEntry) => {
          if (!isCurrent(owner) || !entry.revisionId) return;
          const currentGraph = await session.projects.getProjectGraph(target.projectId);
          if (!isCurrent(owner)) return;
          if (!currentGraph) throw new MaterialUserError('来源材料暂时无法核对，当前阅读保留。');
          const exact = readerLineageEntries(target.projectId, target.artifactId, currentGraph).find(row => row.relationId === entry.relationId
            && row.artifactId === entry.artifactId && row.revisionId === entry.revisionId
            && JSON.stringify(row.locator ?? null) === JSON.stringify(entry.locator ?? null));
          if (!exact || exact.unavailableReason) throw new MaterialUserError('来源材料或记录的位置已变化，当前阅读保留。');
          await open(inheritNativeReaderRecovery(target, { projectId: target.projectId, artifactId: exact.artifactId, revisionId: exact.revisionId, title: exact.title,
            sourceLocator: exact.locator, composerOriginKey: target.composerOriginKey, legacyReturnWindowId: target.legacyReturnWindowId }),
          inputReturn, [...owner.trail, { ...target, revisionId: version.revisionId }]);
        };
        const back = owner.trail.length ? () => { if (isCurrent(owner)) void open(owner.trail.at(-1)!, inputReturn, owner.trail.slice(0, -1)); } : undefined;
        const buttons = <MaterialOptions key={positionKey(version)} loaded={loaded} target={target} session={session} parts={native} current={() => isCurrent(owner)}
          canCite={!!inputReturn} selectVersion={selectVersion} cite={cite} close={() => close(owner)} onBack={back} openSource={openSource} />;
        const node = target.nodeId && (!target.sourceCanvasId || target.sourceCanvasId === canvas.canvasId)
          ? canvas.rfInstance?.getNodes().find(row => row.id === target.nodeId) : undefined;
        const ref = node?.data?.lcos_ref as Record<string, unknown> | undefined;
        const nodeId = ref?.version === 1 && ref.artifactId === target.artifactId && ref.revisionId === version.revisionId
          && (!version.artifactViewId || ref.artifactViewId === version.artifactViewId) ? node?.id : undefined;
        owner.viewerId = nodeId ?? `lcos-material:${target.artifactId}`;
        const sourceAnchor = nodeId ? runtime.anchor?.(nodeId) : undefined;
        const editing = target.editMode === 'mindmap';
        if (editing) {
          const retainedDraft = nodeId && typeof ref?.artifactViewId === 'string'
            ? (await import('./native-mindmap-editing')).hasNativeMindMapDraft(target.projectId, canvas.canvasId,
              nodeId, target.artifactId, ref.artifactViewId) : false;
          if (!isCurrent(owner)) return;
          const pending = nodeId ? window.__LCOS_NATIVE_TEXT_SAVE_PORT__?.getPending({ canvasId: canvas.canvasId, nodeId }) : null;
          if (!canOpenNativeMaterialMindMap(version, { hasText: text !== undefined, canvasId: canvas.canvasId, nodeId,
            reference: ref, retainedDraft: !!retainedDraft, pending }))
            throw new MaterialUserError('这个位置或版本目前不能编辑导图，原正文与草稿保留；请从原节点的当前正文重新打开。');
        }
        const editActions = editing ? <span data-native-mindmap-actions={String(owner.key)} className="contents" /> : buttons;
        const body = editing ? <Suspense fallback={<ReadingState />}><MindMapEditing projectId={target.projectId} canvasId={canvas.canvasId}
            nodeId={nodeId!} artifactId={target.artifactId} revisionId={version.revisionId} parts={native}
            actionsSelector={`[data-native-mindmap-actions="${owner.key}"]`}
            onCancel={() => { if (isCurrent(owner)) void open({ ...target, editMode: undefined }, inputReturn, owner.trail); }}
            onSaved={value => { if (isCurrent(owner)) void open({ ...target, editMode: undefined,
              revisionId: value.revisionId, artifactViewId: value.viewId }, inputReturn, owner.trail); }} /></Suspense>
          : text !== undefined ? <NativeMaterialTextReading key={positionKey(version)} markdown={text} source={{ ...exactSource(version), locator: target.sourceLocator }} parts={native} onCiteSelection={citeSelection} />
            : mediaKind ? undefined : <NativeFormatBody key={positionKey(version)} loaded={loaded} target={target} />;
        readyNativeReaderRecovery(target, version, owner.key);
        present({ id: owner.viewerId, mode: editing ? 'edit' : 'view', actions: {}, sourceAnchor,
          media: mediaKind ? { type: mediaKind, src: url, ...(mediaKind === 'image' ? { displaySrc: url } : {}), title: version.title, ...dimensions }
            : { type: 'text', title: version.title, markdown: text ?? '' },
          ...(mediaKind ? { resources: [{ src: url, sourceUrl: url, thumbnailSrc: url, ...dimensions, createdAt: version.createdAt }] } : {}),
          lcosControlled: { requestKey: owner.key,
            bodySlot: body,
            factsSlot: <div className="native-material-viewer-facts"><strong>{version.title}</strong><p>{nativeMaterialVersionLabel(version)}</p>
              <native.Facts fileInfo={dimensions} mediaType={mediaKind} loading={false} />
            </div>, actionsSlot: <native.ActionBar>{editActions}</native.ActionBar>, textActionsSlot: editActions, hideCopy: editing || text === undefined },
        });
      } catch (error) {
        if (!isCurrent(owner)) return;
        failNativeReaderRecovery(target);
        present({ id: owner.viewerId, media: { type: 'text', title: target.title ?? '材料', markdown: '' }, actions: {},
          lcosControlled: { requestKey: owner.key, hideCopy: true, bodySlot: <ReadingState error message={error instanceof MaterialUserError ? error.message : undefined}
            onRetry={() => void open(target, inputReturn, owner.trail)} /> } });
      }
    };
    const listener = (event: Event) => { void open((event as CustomEvent<NativeMaterialViewRequest>).detail); };
    window.addEventListener(nativeMaterialViewEvent, listener);
    const release = runtime.subscribe(state => {
      const owner = operation.current;
      if (owner) observeNativeReaderRecovery(owner.target, state);
      if (!owner || state.session?.lcosControlled?.requestKey === owner.key) return;
      // Keep the previous revision alive during a pending version handoff.
      if (state.session?.lcosControlled?.requestKey !== undefined && ownedRequests.has(state.session.lcosControlled.requestKey)
        && owner.controller.signal.aborted === false) return;
      owner.controller.abort(); operation.current = null; disposeResources();
      if (!state.session) {
        if (closeNativeReaderRecovery(owner.target)) return;
        const shell = useLcosShellStore.getState();
        const origin = shell.projectId === owner.target.projectId
          ? shell.windows.find(row => row.id === owner.target.legacyReturnWindowId) : undefined;
        if (origin?.bodyKey === 'run-review' && origin.target) requestNativeTaskView({ projectId: owner.target.projectId, runId: origin.target });
        else if (origin?.bodyKey === 'conversation' && origin.target) requestNativeConversationView({ projectId: owner.target.projectId, conversationId: origin.target });
        else if (origin?.bodyKey === 'assembly' && !document.querySelector('[data-library-view="library"]'))
          document.querySelector<HTMLButtonElement>('[data-testid="canvas-dockbar-assets-btn"]')?.click();
        void restoreNativeLibraryInputReturn(owner.inputReturn);
      }
    });
    return () => {
      window.removeEventListener(nativeMaterialViewEvent, listener); release(); unregisterOwner();
      const owner = operation.current; owner?.controller.abort(); if (owner) runtime.close(owner.viewerId);
      operation.current = null; disposeResources();
    };
  }, [runtime, session, shellProject, canvasId, canvasApi]);
  return null;
}
