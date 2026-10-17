import { ArrowLeft, Check, ChevronRight, FileText, LoaderCircle, MoreHorizontal, Play, RefreshCw, RotateCcw, Square, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { JSX } from 'react';
import type { ContextManifestV0, PersistedContextManifestV0, ProjectGraphSnapshot, RunRecipeV0, RunReview } from '../../lcos/packages/contracts/src/index';
import { coreRequest } from '../../lcos/apps/web-gen2/src/backend/coreTypes';
import { createLcosCoreSession } from '../../lcos/huabu/apps/web/src/lcos/app/lcosCoreClient';
import { useCollaborationSessionStore } from '../../lcos/huabu/apps/web/src/lcos/collaboration/collaborationSessionStore';
import { assertRunReview, performRunWorkAction } from '../../lcos/huabu/apps/web/src/lcos/professional/runWorkActions';
import type { RunWorkAction } from '../../lcos/huabu/apps/web/src/lcos/professional/runWorkActions';
import { useNativeComposerParts } from './native-composer-view';
import './native-task-detail.css';

export interface NativeTaskMaterialTarget {
  readonly projectId: string;
  readonly artifactId: string;
  readonly revisionId?: string;
  readonly artifactViewId?: string;
  readonly returnId?: string;
}
export interface NativeTaskDetailProps {
  readonly projectId: string;
  readonly runId: string;
  readonly onOpenMaterial?: (target: NativeTaskMaterialTarget) => void;
  readonly onOpenRun?: (runId: string) => void;
  readonly onBack?: () => void;
}

type Result = RunReview['returns'][number];
const phases: Record<RunReview['presentationPhase'], string> = {
  created: '待开始', queued: '排队中', running: '进行中', waiting_input: '等你回答',
  review: '等你确认', completed: '已完成', failed: '暂时中断', cancelled: '已停止',
};
export function nativeTaskState(review: RunReview): { phase: RunReview['presentationPhase']; label: string } {
  const phase = review.inputRequest?.status === 'pending' ? 'waiting_input' : review.presentationPhase;
  return { phase, label: phases[phase] ?? '状态更新中' };
}
/** No live Current fallback: a pending result must open its exact candidate. */
export function nativeTaskResultVersion(review: RunReview, item: Result): string | undefined {
  if (item.draftRevisionId) return String(item.draftRevisionId);
  const candidates = (review.draftRevisions ?? []).filter(row => row.artifactId === item.targetArtifactId
    && row.fileRecordId === item.returnedFileId && row.contentHash === item.contentHash);
  return candidates.length === 1 ? String(candidates[0]!.id) : undefined;
}
export function nativeTaskActions(review: RunReview): ReadonlySet<string> {
  const actions = new Set<string>();
  const terminal = ['completed', 'cancelled', 'failed'].includes(review.run.status);
  if (review.run.status === 'created' && review.dispatch.status === 'planned') actions.add('dispatch');
  if (!['completed', 'cancelled'].includes(review.run.status)
    && (review.run.status === 'failed' || ['failed', 'recovery_required'].includes(review.dispatch.status))) actions.add('recover');
  if (!terminal) actions.add('cancel');
  // The original adapter requires a real external task before it can sync.
  if (review.binding?.externalTaskId && (!terminal || review.run.status === 'failed')) actions.add('sync');
  return actions;
}

type InputRow = { key: string; label: string; material?: Omit<NativeTaskMaterialTarget, 'projectId'>; body?: string; unavailable?: boolean };
const nonEmpty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
/** Core's persisted manifest is the input snapshot. Current graph labels may
 * name non-material references; they never select the task's input revision. */
export function nativeTaskInputRows(recipe: RunRecipeV0, graph?: ProjectGraphSnapshot, manifest?: PersistedContextManifestV0): readonly InputRow[] {
  const exact = graph?.project.id === recipe.projectId ? graph : undefined;
  const metadataRows = recipe.orderedReferences.map(({ ref }, index): InputRow => {
    const value = ref as unknown as Record<string, string>;
    const key = `${index}:${ref.type}`;
    if (ref.type === 'artifact') return { key,
      label: exact?.artifacts.find(row => row.id === ref.artifactId)?.title ?? `材料 ${index + 1}`,
      ...(ref.revisionId ? { material: { artifactId: ref.artifactId, revisionId: ref.revisionId } } : { unavailable: true }) };
    if (ref.type === 'view') {
      const view = exact?.artifactViews.find(row => row.id === ref.viewId);
      return { key, label: exact?.artifacts.find(row => row.id === view?.artifactId)?.title ?? `材料 ${index + 1}`,
        unavailable: true };
    }
    if (ref.type === 'workspace') return { key, label: exact?.workspaces.find(row => row.id === ref.workspaceId)?.name ?? '工作现场' };
    if (ref.type === 'scope') return { key, label: exact?.scopes.find(row => row.id === ref.scopeId)?.name ?? '上下文范围' };
    if (value.type === 'collection') return { key, label: exact?.collections?.find(row => row.id === value.collectionId)?.title ?? '集合' };
    return { key, label: ref.type === 'conversation' ? '对话' : '组件' };
  });
  if (!recipe.contextManifestId) {
    if (manifest) throw new Error('Task has no manifest address.');
    return metadataRows;
  }
  if (!manifest || manifest.schemaVersion !== 0 || String(manifest.id) !== recipe.contextManifestId
    || String(manifest.projectId) !== recipe.projectId || typeof manifest.canonicalJson !== 'string') throw new Error('Task manifest owner mismatch.');
  const snapshot = JSON.parse(manifest.canonicalJson) as Pick<ContextManifestV0, 'schemaVersion' | 'project' | 'orderedItems'> & { id?: string };
  if (!snapshot || snapshot.schemaVersion !== 0 || snapshot.id !== undefined && snapshot.id !== recipe.contextManifestId
    || snapshot.project?.id !== recipe.projectId || !Array.isArray(snapshot.orderedItems)) throw new Error('Task manifest content is unavailable.');
  const identities = new Set<string>();
  const rows = snapshot.orderedItems.map((item, index): InputRow => {
    if (!item || !nonEmpty(item.identity) || identities.has(item.identity) || typeof item.title !== 'string'
      || !['target', 'feedback', 'reference', 'decision', 'context'].includes(item.role)
      || item.content !== undefined && typeof item.content !== 'string'
      || (item.artifactId !== undefined || item.revisionId !== undefined) && (!nonEmpty(item.artifactId) || !nonEmpty(item.revisionId)))
      throw new Error('Task manifest material is unavailable.');
    identities.add(item.identity);
    if (item.artifactId && item.revisionId) return { key: item.identity, label: item.title.trim() || `材料 ${index + 1}`,
      material: { artifactId: item.artifactId, revisionId: item.revisionId } };
    const prefix = `<untrusted-context identity="${item.identity}">\n`, suffix = '\n</untrusted-context>';
    const body = item.content?.startsWith(prefix) && item.content.endsWith(suffix)
      ? item.content.slice(prefix.length, -suffix.length) : item.content;
    // ContextManifestService emits this exact fallback for Notes. Its identity
    // remains the key; the saved text, rather than an internal address, names it.
    const automaticNoteTitle = item.title === `Note ${item.identity}`;
    const noteTitle = body?.trim().split(/\r?\n/, 1)[0]?.replace(/^#{1,6}\s+/, '').trim();
    return { key: item.identity, label: automaticNoteTitle ? noteTitle || '项目笔记' : item.title.trim() || '任务中的文字内容',
      ...(body !== undefined ? { body } : { unavailable: true }) };
  });
  for (const { ref } of recipe.orderedReferences) if (ref.type === 'artifact' && ref.revisionId
    && !rows.some(row => row.material?.artifactId === ref.artifactId && row.material.revisionId === ref.revisionId))
    throw new Error('The task manifest does not contain its pinned reference.');
  // Aggregate addresses keep their identity. Expanded material content comes
  // exclusively from this manifest, never from today's aggregate membership.
  return [...rows, ...metadataRows.filter((_, index) => !['artifact', 'view'].includes(recipe.orderedReferences[index]!.ref.type))];
}

/** Inline body for the existing TapNow Chatbox. Reuses the original Run action
 * owner, including fresh-read/CAS/answer checks and unknown-result recovery.
 * It never creates a window, dispatches on open, or stores domain truth. */
export function NativeTaskDetail(props: NativeTaskDetailProps): JSX.Element {
  return <TaskBody key={JSON.stringify([props.projectId, props.runId])} {...props} />;
}
function TaskBody({ projectId, runId, onOpenMaterial, onOpenRun, onBack }: NativeTaskDetailProps): JSX.Element {
  const session = useMemo(() => createLcosCoreSession(), []);
  const Button = useNativeComposerParts()?.Button ?? 'button';
  const [review, setReview] = useState<RunReview>();
  const [readError, setReadError] = useState(false);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [mustVerify, setMustVerify] = useState(false);
  const [stopConfirm, setStopConfirm] = useState(false);
  const [answer, setAnswer] = useState('');
  const [options, setOptions] = useState<string[]>([]);
  const [nextRunId, setNextRunId] = useState<string>();
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [inputs, setInputs] = useState<{ state: 'loading' | 'ready' | 'error'; rows: readonly InputRow[] }>({ state: 'loading', rows: [] });
  const [readVersion, setReadVersion] = useState(0);
  const generation = useRef(0), reading = useRef<AbortController | undefined>(undefined);
  const lifetime = useRef(new AbortController()), inFlight = useRef(false);
  const questionId = useRef<string | undefined>(undefined);
  // Keep exact failures for developer inspection without rendering provider
  // internals, technical keys or raw HTTP messages to the user.
  const diagnostic = useRef<unknown>(undefined);

  const refresh = useCallback(async (explicit = false): Promise<void> => {
    const serial = ++generation.current;
    reading.current?.abort();
    const controller = new AbortController(); reading.current = controller;
    try {
      const value = assertRunReview(await session.runs.readRunReview(runId, controller.signal), projectId, runId);
      if (controller.signal.aborted || lifetime.current.signal.aborted || serial !== generation.current) return;
      if (value.inputRequest && value.inputRequest.runId !== runId) throw new Error('Question owner changed.');
      setReview(value); setReadError(false); setReadVersion(version => version + 1);
      if (questionId.current !== value.inputRequest?.requestId) {
        questionId.current = value.inputRequest?.requestId;
        setAnswer(value.inputRequest?.answerText ?? ''); setOptions([...(value.inputRequest?.selectedOptions ?? [])]);
      }
      if (explicit) { setMustVerify(false); setNotice('已更新任务状态。'); }
    } catch (error) {
      if (!controller.signal.aborted && !lifetime.current.signal.aborted && serial === generation.current) {
        diagnostic.current = error; setReadError(true);
      }
    }
  }, [session, projectId, runId]);

  useEffect(() => {
    lifetime.current = new AbortController(); void refresh();
    const unwatch = useCollaborationSessionStore.getState().watchProjectChanges(projectId, () => { void refresh(); });
    return () => { ++generation.current; reading.current?.abort(); lifetime.current.abort(); unwatch(); };
  }, [projectId, refresh]);

  useEffect(() => {
    if (!sourcesOpen) return;
    const controller = new AbortController();
    setInputs(previous => ({ ...previous, state: 'loading' }));
    void Promise.all([
      session.runs.readRecipe(runId, controller.signal),
      session.projects.getProjectGraph(projectId).catch(() => undefined),
    ]).then(async ([recipe, graph]) => {
      if (controller.signal.aborted) return;
      if (recipe.projectId !== projectId || recipe.runId !== runId) throw new Error('Task input owner changed.');
      if (review?.run.contextManifestId && String(review.run.contextManifestId) !== recipe.contextManifestId) throw new Error('Task manifest address changed.');
      const manifest = recipe.contextManifestId ? await coreRequest<PersistedContextManifestV0>(session.http, 'GET',
        `/projects/${encodeURIComponent(projectId)}/context-manifests/v0/${encodeURIComponent(recipe.contextManifestId)}`, { signal: controller.signal }) : undefined;
      if (controller.signal.aborted) return;
      setInputs({ state: 'ready', rows: nativeTaskInputRows(recipe, graph, manifest) });
    }).catch(error => {
      if (controller.signal.aborted) return;
      diagnostic.current = error; setInputs(previous => ({ ...previous, state: 'error' }));
    });
    return () => controller.abort();
  }, [sourcesOpen, session, projectId, runId, readVersion]);

  const act = async (action: RunWorkAction): Promise<void> => {
    if (inFlight.current || !review || readError || mustVerify || lifetime.current.signal.aborted) return;
    inFlight.current = true; setBusy(true); setNotice('正在处理…'); setStopConfirm(false);
    const signal = lifetime.current.signal;
    try {
      const result = await performRunWorkAction(session.runs, projectId, runId, action, signal);
      if (signal.aborted) return;
      setNextRunId(result.nextRunId);
      setNotice(action.kind === 'accept' ? '已采纳，材料正在更新。'
        : action.kind === 'reject' ? '已保留原版本，不采用这份结果。'
          : action.kind === 'retry' ? '重试任务已准备，尚未开始。'
            : action.kind === 'answer' ? '回答已提交。'
              : action.kind === 'cancel' ? '已请求停止，已有材料保留。' : '已处理，正在更新任务状态。');
      await refresh();
    } catch (error) {
      if (signal.aborted) return;
      diagnostic.current = error; setMustVerify(true);
      setNotice('刚才的操作尚未确认。已有任务与材料保留，请先核对状态。');
      await refresh();
    } finally { inFlight.current = false; if (!signal.aborted) setBusy(false); }
  };

  const disabled = busy || readError || mustVerify;
  const state = review ? nativeTaskState(review) : undefined;
  const actions = review ? nativeTaskActions(review) : new Set<string>();
  const openNext = (): void => {
    if (!nextRunId) return;
    if (onOpenRun) onOpenRun(nextRunId);
    else window.dispatchEvent(new CustomEvent('lcos-native-open-task', { detail: { projectId, runId: nextRunId } }));
  };
  return <article className="native-task-detail" data-native-task-detail aria-busy={busy}>
    <header className="native-task-heading">
      {onBack && <Button onClick={onBack} aria-label="返回任务列表" title="返回任务列表"><ArrowLeft size={16} aria-hidden /></Button>}
      <div className="native-task-heading-copy"><span className="native-task-state" data-state={state?.phase}>
        {busy && <LoaderCircle size={12} aria-hidden className="animate-spin" />}{state?.label ?? (readError ? '暂时无法读取' : '正在打开…')}
      </span><h2>{review?.run.instruction.trim().split(/\r?\n/, 1)[0] || '任务'}</h2></div>
      {review && <details className="native-task-more"><summary aria-label="更多任务操作"><MoreHorizontal size={17} aria-hidden /></summary>
        <div role="menu"><button role="menuitem" disabled={busy} onClick={() => { void refresh(true); }}>刷新</button>
          {actions.has('sync') && <button role="menuitem" disabled={disabled} onClick={() => { void act({ kind: 'sync' }); }}>更新进展</button>}
        </div></details>}
    </header>
    {(readError || mustVerify) && <div className="native-task-notice" role="alert">
      <p>{readError ? '暂时无法读取最新任务，已有内容保留。' : notice}</p>
      <Button disabled={busy} onClick={() => { void refresh(true); }}><RefreshCw size={13} aria-hidden />{mustVerify ? '核对刚才的操作' : '重试读取'}</Button>
    </div>}
    {notice && !readError && !mustVerify && <p className="native-task-notice" role="status">{notice}</p>}
    {review && <>
      <div className="native-task-actions">
        {actions.has('dispatch') && <Button className="native-task-primary" disabled={disabled} onClick={() => { void act({ kind: 'dispatch' }); }}><Play size={13} aria-hidden />开始</Button>}
        {actions.has('recover') && <Button disabled={disabled} onClick={() => { void act({ kind: 'recover' }); }}><RotateCcw size={13} aria-hidden />恢复任务</Button>}
        {actions.has('cancel') && <Button disabled={disabled} onClick={() => setStopConfirm(true)}><Square size={12} aria-hidden />停止</Button>}
      </div>
      {stopConfirm && <section className="native-task-confirm" role="group" aria-label="确认停止任务"
        onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setStopConfirm(false); } }}>
        <p>停止当前任务？已有材料保留。</p><div className="native-task-actions">
          <Button disabled={disabled} onClick={() => { void act({ kind: 'cancel' }); }}>确认停止</Button>
          <Button disabled={busy} onClick={() => setStopConfirm(false)}>继续任务</Button>
        </div>
      </section>}
      {review.inputRequest?.status === 'pending' && <section className="native-task-question" aria-label="等你回答">
        <h3>等你回答</h3><p>{review.inputRequest.question}</p>
        {review.inputRequest.options.length > 0 && <div className="native-task-options">{review.inputRequest.options.map(option => <label key={option}>
          <input type="checkbox" checked={options.includes(option)} disabled={disabled}
            onChange={event => setOptions(previous => event.target.checked ? [...previous, option] : previous.filter(value => value !== option))} />{option}
        </label>)}</div>}
        {review.inputRequest.allowFreeText && <textarea aria-label="回答当前问题" value={answer} disabled={disabled} rows={3} onChange={event => setAnswer(event.target.value)} />}
        <Button className="native-task-primary" disabled={disabled || (!answer.trim() && options.length === 0)}
          onClick={() => { void act({ kind: 'answer', input: { requestId: review.inputRequest!.requestId, text: answer, selectedOptions: options } }); }}>提交回答</Button>
      </section>}
      <section className="native-task-instruction"><h3>任务内容</h3><p>{review.run.instruction}</p></section>
      {(review.run.resultSummary || review.run.shortSummary) && <section><h3>进展</h3><p>{review.run.resultSummary || review.run.shortSummary}</p></section>}
      {review.run.status === 'failed' && <p className="native-task-notice">任务暂时中断，已有材料保留。可以先查看进展，再决定是否恢复。</p>}
      {review.returns.length > 0 && <section aria-label="任务产物"><h3>产物</h3><div className="native-task-results">{review.returns.map((item, index) => {
        const revisionId = nativeTaskResultVersion(review, item);
        const available = (['accept', 'reject', 'retry'] as const).filter(kind => item.status === 'pending_review' && review.capabilities[kind].enabled);
        return <div key={String(item.id)} className="native-task-result">
          <div className="native-task-result-heading"><FileText size={15} aria-hidden /><strong>结果 {index + 1}</strong>
            <span>{item.status === 'pending_review' ? '等你确认' : item.status === 'adopted' ? '已采纳' : '未采用'}</span>
            {revisionId && onOpenMaterial && <Button aria-label={`查看结果 ${index + 1}`} onClick={() => onOpenMaterial({ projectId, artifactId: String(item.targetArtifactId), revisionId, returnId: String(item.id) })}><ChevronRight size={15} aria-hidden /></Button>}
          </div>
          {!revisionId && <p role="status">对应内容暂时无法读取，已有结果保留。</p>}
          {revisionId && !onOpenMaterial && <p role="status">材料查看入口暂未接入，结果仍已保留。</p>}
          {item.status === 'pending_review' && <p className="native-task-result-note">原版本保留，采纳后才更新。</p>}
          {available.length > 0 && <div className="native-task-actions">{available.map(kind => <Button key={kind}
            className={kind === 'accept' ? 'native-task-primary' : undefined} disabled={disabled}
            onClick={() => { void act({ kind, returnId: String(item.id), baseRevisionId: String(item.baseRevisionId) }); }}>
            {kind === 'accept' ? <><Check size={13} aria-hidden />采纳</> : kind === 'reject' ? <><X size={13} aria-hidden />不采用</> : <><RotateCcw size={13} aria-hidden />重新尝试</>}
          </Button>)}</div>}
          {item.status === 'pending_review' && available.length === 0 && <p role="status">这份结果暂时无法处理，请刷新后核对。</p>}
        </div>;
      })}</div></section>}
      {nextRunId && <Button onClick={openNext}>查看重试任务<ChevronRight size={13} aria-hidden /></Button>}
      <details className="native-task-sources" onToggle={event => setSourcesOpen(event.currentTarget.open)}><summary>使用的材料</summary>
        {inputs.state === 'loading' && <p role="status">正在读取…</p>}
        {inputs.state === 'error' && <p role="alert">材料记录暂时无法读取。<button disabled={busy} onClick={() => setReadVersion(version => version + 1)}>重试读取</button></p>}
        {inputs.state === 'ready' && inputs.rows.length > 0 && <ol>{inputs.rows.map(row => <li key={row.key}>{row.material && onOpenMaterial
          ? <button onClick={() => onOpenMaterial({ projectId, ...row.material! })}>{row.label}</button>
          : row.body !== undefined ? <details><summary>{row.label}</summary><p className="native-task-source-content">{row.body}</p></details> : <span>{row.label}</span>}
          {row.unavailable && <small>当时使用的内容暂不可读取，未改用当前版本。</small>}</li>)}</ol>}
        {inputs.state === 'ready' && inputs.rows.length === 0 && <p>没有附加材料。</p>}
      </details>
    </>}
  </article>;
}
