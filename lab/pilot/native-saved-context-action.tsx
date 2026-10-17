import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';

import type { AssemblyApplyItemResultV1, AssemblyApplyResultV1 } from '../../lcos/packages/contracts/src/assembly.ts';
import type { ProjectGraphSnapshot, WarehouseItemV1 } from '../../lcos/packages/contracts/src/index.ts';
import type { PresentationEntityRefV0 } from '../../lcos/packages/contracts/src/presentations.ts';
import { HttpClient } from '../../lcos/apps/web-gen2/src/backend/client.ts';
import { CoreProjectClient } from '../../lcos/apps/web-gen2/src/backend/projects.ts';
import { reviewAssemblyApply } from '../../lcos/huabu/apps/web/src/lcos/professional/assemblyApplyReview.ts';
import { LcosButton } from '../../lcos/huabu/apps/web/src/lcos/ui/primitives/LcosButton.tsx';
import { LcosSurfaceFeedback } from '../../lcos/huabu/apps/web/src/lcos/ui/LcosSurfaceFeedback.tsx';
import { useLcosReferenceStore } from '../../lcos/huabu/apps/web/src/lcos/lcosReferenceState.ts';
import { useLcosShellStore } from '../../lcos/huabu/apps/web/src/lcos/shell/lcosShellStore.ts';
import { readSelectedCanvasNodes } from './native-material-actions.tsx';
import useCanvasStore from './native-canvas-port.ts';
import type { NativeCanvasSnapshot } from './native-canvas-port.ts';
import { isNativeSavedContextOwnerCurrent } from './native-saved-context-owner.ts';
import '../../lcos/huabu/apps/web/src/lcos/ui/primitives/oreo-controls.css';
import { createNativeContextReferencePort } from './native-context-reference.ts';
import type { NativeContextReferencePreviewV1 } from './native-context-reference.ts';

export interface NativeSavedContextActionProps {
  readonly projectId: string;
  readonly item: WarehouseItemV1;
}

type Notice =
  | { readonly status: 'idle' }
  | { readonly status: 'working'; readonly phase: 'checking' | 'applying' | 'reading' }
  | { readonly status: 'rejected' | 'error'; readonly message: string; readonly code?: string; readonly httpStatus?: number }
  | {
    readonly status: 'receipt';
    readonly result: AssemblyApplyResultV1;
    readonly confirmedItems: readonly AssemblyApplyItemResultV1[];
    readonly labelsByViewId: ReadonlyMap<string, string>;
    readonly presentation: PresentationReadback;
  };

interface PresentationReadback {
  readonly status: 'confirmed' | 'partial' | 'unavailable';
  readonly memberViewIds: readonly string[];
  readonly memberEntityRefs: readonly PresentationEntityRefV0[];
  readonly expectedViewIds: readonly string[];
  readonly rows: readonly { readonly viewId: string; readonly label?: string }[];
  readonly entityRows: readonly { readonly ref: PresentationEntityRefV0; readonly label?: string }[];
  readonly message: string;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function canonicalContextId(item: WarehouseItemV1): string | undefined {
  return item.kind === 'context' && item.entityRef.type === 'context' && nonEmpty(item.entityRef.id)
    ? item.entityRef.id : undefined;
}

function currentCanvasIdentityProblem(
  canvas: NativeCanvasSnapshot,
  projectId: string,
  shellProjectId: string | null,
  referenceProjectId: string | null,
): string | undefined {
  const nodeLab = typeof window === 'undefined' ? undefined : window.__LCOS_NODE_LAB__;
  const nodeLabProjectId = nodeLab?.projectId;
  const nodeLabCanvasId = nonEmpty(nodeLab?.currentCanvasId) ? nodeLab.currentCanvasId : nodeLab?.canvasId;

  if (canvas.status !== 'ready' || !nonEmpty(canvas.canvasId)) {
    return '原 Huabu Canvas 尚未提供可读的当前现场。';
  }
  if (!nonEmpty(nodeLabCanvasId) || nodeLabCanvasId !== canvas.canvasId) {
    return '当前 Canvas 身份刚刚变化；请确认选区后重试。';
  }
  if (!canvas.rfInstance || nodeLab?.api !== canvas.rfInstance) {
    return '当前原生 Canvas API 已更换；请确认选区后重试。';
  }
  if (shellProjectId !== projectId || referenceProjectId !== projectId
    || (nonEmpty(nodeLabProjectId) && nodeLabProjectId !== projectId)) {
    return '当前画布与 Core 项目身份不一致；未提交。';
  }
  return undefined;
}

function coreHttpForCurrentOrigin(): HttpClient {
  if (typeof window === 'undefined') throw new Error('当前环境没有浏览器 Core 代理。');
  // The reference port independently validates the same-origin loopback Core prefix.
  return new HttpClient({ baseUrl: `${window.location.origin}/api/lcos/core` });
}

function itemLabel(item: AssemblyApplyItemResultV1, labelsByViewId: ReadonlyMap<string, string>): string {
  return item.sourceRef.kind === 'artifactView'
    ? labelsByViewId.get(item.sourceRef.id) ?? `ArtifactView ${item.sourceRef.id}`
    : `${item.sourceRef.kind} ${item.sourceRef.id}`;
}

function receiptLabel(item: AssemblyApplyItemResultV1): string {
  if (item.status === 'applied' && item.channel === 'presentation-membership') return 'Core 已加入';
  if (item.status === 'skipped' && item.channel === 'already-member') return 'Core 已在目标中';
  if (item.status === 'skipped' && item.channel === 'unsupported') return 'Core 不支持';
  return item.status === 'failed' ? 'Core 未确认加入' : 'Core 回执未知';
}

function receiptSummary(items: readonly AssemblyApplyItemResultV1[]): string {
  let applied = 0;
  let alreadyMember = 0;
  let failed = 0;
  for (const item of items) {
    if (item.status === 'applied' && item.channel === 'presentation-membership') applied += 1;
    else if (item.status === 'skipped' && item.channel === 'already-member') alreadyMember += 1;
    else failed += 1;
  }
  return `逐项回执：加入 ${applied} · 已存在 ${alreadyMember} · 未确认 ${failed}`;
}

function entityRefLabel(graph: ProjectGraphSnapshot, ref: PresentationEntityRefV0, projectId: string): string | undefined {
  if (ref.type === 'view') return graphLabelForView(graph, ref.id, projectId);
  if (ref.type === 'scope') {
    const matches = graph.scopes.filter((scope) => String(scope.id) === ref.id && String(scope.projectId) === projectId);
    return matches.length === 1 && nonEmpty(matches[0].name) ? matches[0].name : undefined;
  }
  if (ref.type === 'workspace') {
    const matches = graph.workspaces.filter((workspace) => String(workspace.id) === ref.id
      && String(workspace.projectId) === projectId);
    return matches.length === 1 && nonEmpty(matches[0].name) ? matches[0].name : undefined;
  }
  if (ref.type === 'note') {
    const matches = graph.notes.filter((note) => String(note.id) === ref.id && String(note.projectId) === projectId);
    const firstLine = matches.length === 1 ? matches[0].body.split(/\r?\n/, 1)[0]?.trim() : undefined;
    return nonEmpty(firstLine) ? firstLine : undefined;
  }
  return undefined;
}

function isPresentationEntityRef(value: unknown): value is PresentationEntityRefV0 {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const ref = value as { type?: unknown; id?: unknown };
  return ['view', 'scope', 'workspace', 'conversation', 'note'].includes(String(ref.type)) && nonEmpty(ref.id);
}

async function readPresentationMembership(
  projects: CoreProjectClient,
  projectId: string,
  contextId: string,
  expectedViewIds: readonly string[] = [],
): Promise<PresentationReadback> {
  try {
    const [graph, presentations] = await Promise.all([
      projects.getProjectGraph(projectId),
      projects.listPresentations(projectId),
    ]);
    if (graph === undefined || String(graph.project.id) !== projectId) {
      return { status: 'unavailable', memberViewIds: [], memberEntityRefs: [], expectedViewIds, rows: [], entityRows: [],
        message: 'Core 尚未返回当前项目的 canonical graph；没有推测材料名称或成员。' };
    }
    const scopes = graph.scopes.filter((scope) => String(scope.id) === contextId
      && String(scope.projectId) === projectId && scope.kind === 'context');
    if (scopes.length !== 1) {
      return { status: 'unavailable', memberViewIds: [], memberEntityRefs: [], expectedViewIds, rows: [], entityRows: [],
        message: 'Core graph 未确认唯一的当前项目 Saved Context scope；没有读取或写入其他目标。' };
    }
    const presentationId = `presentation:context:${contextId}`;
    const matching = presentations.filter((row) => row.projectId === projectId
      && row.scopeId === contextId && row.id === presentationId && row.capability === 'context');
    if (matching.length !== 1) {
      return {
        status: 'unavailable', memberViewIds: [], memberEntityRefs: [], expectedViewIds, rows: [], entityRows: [],
        message: matching.length === 0
          ? 'Core 尚未提供该 Saved Context 的 canonical Presentation；没有从 Canvas geometry 推测成员。'
          : 'Core 返回重复的 Saved Context Presentation 身份；未猜测成员状态。',
      };
    }
    const memberViewIds = matching[0].state.memberViewIds;
    if (!Array.isArray(memberViewIds) || memberViewIds.some((id) => !nonEmpty(id))
      || new Set(memberViewIds).size !== memberViewIds.length) {
      return { status: 'unavailable', memberViewIds: [], memberEntityRefs: [], expectedViewIds, rows: [], entityRows: [],
        message: 'Core Presentation 成员 ID 缺失或重复；没有猜测列表。' };
    }
    const memberEntityRefs = matching[0].state.memberEntityRefs ?? [];
    const entityKeys = memberEntityRefs.map((ref) => `${ref.type}:${ref.id}`);
    if (!Array.isArray(memberEntityRefs) || memberEntityRefs.some((ref) => !isPresentationEntityRef(ref))
      || new Set(entityKeys).size !== entityKeys.length) {
      return { status: 'unavailable', memberViewIds: [], memberEntityRefs: [], expectedViewIds, rows: [], entityRows: [],
        message: 'Core Presentation 的实体成员引用缺失或重复；没有猜测列表。' };
    }
    const rows = memberViewIds.map((viewId) => {
      const views = graph.artifactViews.filter((view) => String(view.id) === viewId);
      if (views.length !== 1) return { viewId };
      const view = views[0];
      const viewScopes = graph.scopes.filter((scope) => String(scope.id) === String(view.scopeId)
        && String(scope.projectId) === projectId);
      const artifacts = graph.artifacts.filter((artifact) => String(artifact.id) === String(view.artifactId)
        && String(artifact.projectId) === projectId);
      if (viewScopes.length !== 1 || artifacts.length !== 1 || !nonEmpty(artifacts[0]?.title)) return { viewId };
      return { viewId, label: artifacts[0].title.trim() };
    });
    const entityRows = memberEntityRefs.map((ref) => ({ ref, label: entityRefLabel(graph, ref, projectId) }));
    const members = new Set(memberViewIds);
    const matched = expectedViewIds.filter((id) => members.has(id)).length;
    return {
      status: matched === expectedViewIds.length ? 'confirmed' : matched > 0 ? 'partial' : 'unavailable',
      memberViewIds,
      memberEntityRefs,
      expectedViewIds,
      rows,
      entityRows,
      message: matched === expectedViewIds.length
        ? expectedViewIds.length === 0 ? `Core Presentation 已读回 ${memberViewIds.length} 个 ArtifactView 与 ${memberEntityRefs.length} 个实体成员。`
          : `Core Presentation 已读回 ${matched}/${expectedViewIds.length} 个精确 ArtifactView 成员。`
        : `Core Presentation 只读回 ${matched}/${expectedViewIds.length} 个请求成员；以逐项 Assembly 回执为准。`,
    };
  } catch (error: unknown) {
    return {
      status: 'unavailable', memberViewIds: [], memberEntityRefs: [], expectedViewIds, rows: [], entityRows: [],
      message: error instanceof Error ? `Core Presentation 重读失败：${error.message}` : 'Core Presentation 重读失败。',
    };
  }
}

function graphLabelForView(graph: ProjectGraphSnapshot, viewId: string, projectId: string): string | undefined {
  const views = graph.artifactViews.filter((view) => String(view.id) === viewId);
  if (views.length !== 1) return undefined;
  const view = views[0];
  const viewScopes = graph.scopes.filter((scope) => String(scope.id) === String(view.scopeId)
    && String(scope.projectId) === projectId);
  const artifacts = graph.artifacts.filter((artifact) => String(artifact.id) === String(view.artifactId)
    && String(artifact.projectId) === projectId);
  return viewScopes.length === 1 && artifacts.length === 1 && nonEmpty(artifacts[0]?.title)
    ? artifacts[0].title.trim() : undefined;
}

export function NativeSavedContextAction({ projectId, item }: NativeSavedContextActionProps): JSX.Element {
  const canvas = useCanvasStore((state) => state);
  const shellProjectId = useLcosShellStore((state) => state.projectId);
  const referenceProjectId = useLcosReferenceStore((state) => state.projectId);
  const [notice, setNotice] = useState<Notice>({ status: 'idle' });
  const [membership, setMembership] = useState<PresentationReadback | undefined>(undefined);
  const [refreshKey, setRefreshKey] = useState(0);
  const membershipReadGeneration = useRef(0);
  const actionGeneration = useRef(0);
  const contextIdRef = useRef<string | undefined>(undefined);
  const projectIdRef = useRef(projectId);
  const contextId = canonicalContextId(item);
  contextIdRef.current = contextId;
  projectIdRef.current = projectId;
  const identityProblem = currentCanvasIdentityProblem(canvas, projectId, shellProjectId, referenceProjectId);
  const selected = readSelectedCanvasNodes(canvas);
  const selectionLabel = selected.status === 'ready'
    ? `当前选区 ${selected.nodes.length} 项 · 原画布实时快照`
    : selected.message;
  const working = notice.status === 'working';
  const disabled = working || contextId === undefined || identityProblem !== undefined || selected.status !== 'ready';

  useEffect(() => {
    const currentGeneration = ++membershipReadGeneration.current;
    let active = true;
    setNotice({ status: 'idle' });
    setMembership(undefined);
    if (contextId === undefined) {
      setMembership({ status: 'unavailable', memberViewIds: [], memberEntityRefs: [], expectedViewIds: [], rows: [], entityRows: [],
        message: '目标不是 canonical Saved Context。' });
      return () => { active = false; };
    }
    if (identityProblem !== undefined) {
      setMembership({ status: 'unavailable', memberViewIds: [], memberEntityRefs: [], expectedViewIds: [], rows: [], entityRows: [],
        message: `${identityProblem}未读取其他项目的 Saved Context。` });
      return () => { active = false; };
    }
    let projects: CoreProjectClient;
    try {
      const http = coreHttpForCurrentOrigin();
      createNativeContextReferencePort({ http, projectId });
      projects = new CoreProjectClient(http);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Core 代理不可用。';
      setMembership({ status: 'unavailable', memberViewIds: [], memberEntityRefs: [], expectedViewIds: [], rows: [], entityRows: [], message });
      return () => { active = false; };
    }
    void readPresentationMembership(projects, projectId, contextId).then((readback) => {
      if (active && membershipReadGeneration.current === currentGeneration
        && contextIdRef.current === contextId && projectIdRef.current === projectId) {
        setMembership(readback);
      }
    });
    return () => {
      active = false;
      if (membershipReadGeneration.current === currentGeneration) membershipReadGeneration.current += 1;
      actionGeneration.current += 1;
    };
  }, [projectId, contextId, refreshKey, canvas.status, canvas.canvasId, canvas.rfInstance, shellProjectId, referenceProjectId, identityProblem]);

  const refreshMembership = (): void => {
    if (!working) setRefreshKey((current) => current + 1);
  };

  const applyCurrentSelection = async (): Promise<void> => {
    if (contextId === undefined) {
      setNotice({ status: 'rejected', message: '目标不是当前项目 Warehouse 中的 canonical Saved Context。' });
      return;
    }
    const liveCanvas = useCanvasStore.getState();
    const liveProblem = currentCanvasIdentityProblem(liveCanvas, projectId,
      useLcosShellStore.getState().projectId, useLcosReferenceStore.getState().projectId);
    if (liveProblem) { setNotice({ status: 'rejected', message: liveProblem }); return; }
    const capturedCanvasId = liveCanvas.canvasId;
    const capturedRfInstance = liveCanvas.rfInstance;
    const capturedProjectId = projectId;
    const liveSelection = readSelectedCanvasNodes(liveCanvas);
    if (liveSelection.status !== 'ready') {
      setNotice({ status: 'rejected', message: liveSelection.message });
      return;
    }

    let http: HttpClient;
    try {
      http = coreHttpForCurrentOrigin();
    } catch (error: unknown) {
      setNotice({ status: 'error', message: error instanceof Error ? error.message : 'Core 代理不可用。' });
      return;
    }
    const port = createNativeContextReferencePort({ http, projectId });
    const projects = new CoreProjectClient(http);
    const currentActionGeneration = ++actionGeneration.current;
    const isCurrentTarget = (): boolean => {
      const currentCanvas = useCanvasStore.getState();
      const currentNodeLab = typeof window === 'undefined' ? undefined : window.__LCOS_NODE_LAB__;
      const currentProjectId = projectIdRef.current;
      return contextIdRef.current === contextId
        && isNativeSavedContextOwnerCurrent(
          { projectId: capturedProjectId, canvasId: capturedCanvasId, rfInstance: capturedRfInstance },
          { projectId: currentProjectId, canvasId: currentCanvas.canvasId, rfInstance: currentCanvas.rfInstance },
          currentNodeLab?.api,
          currentActionGeneration,
          actionGeneration.current,
        )
        && currentCanvasIdentityProblem(currentCanvas, capturedProjectId,
          useLcosShellStore.getState().projectId, useLcosReferenceStore.getState().projectId) === undefined;
    };
    const target = { kind: 'context' as const, id: contextId, projectId };
    setNotice({ status: 'working', phase: 'checking' });
    let preview: NativeContextReferencePreviewV1;
    try {
      preview = await port.preview({ projectId, selectedNodes: liveSelection.nodes, target });
    } catch (error: unknown) {
      if (!isCurrentTarget()) return;
      setNotice({ status: 'error', message: error instanceof Error ? error.message : 'Core 预览失败。' });
      return;
    }
    if (!isCurrentTarget()) return;
    if (preview.status !== 'ready') {
      setNotice({ status: preview.status, message: preview.message,
        ...('code' in preview ? { code: preview.code } : {}),
        ...('httpStatus' in preview && preview.httpStatus !== undefined ? { httpStatus: preview.httpStatus } : {}) });
      return;
    }

    // A project/Canvas/API switch during preview invalidates this click before Core receives apply.
    const beforeApplyCanvas = useCanvasStore.getState();
    const beforeApplyProblem = currentCanvasIdentityProblem(beforeApplyCanvas, projectId,
      useLcosShellStore.getState().projectId, useLcosReferenceStore.getState().projectId);
    if (!isCurrentTarget() || beforeApplyCanvas.canvasId !== capturedCanvasId
      || beforeApplyCanvas.rfInstance !== capturedRfInstance || beforeApplyProblem) {
      if (actionGeneration.current === currentActionGeneration
        && contextIdRef.current === contextId && projectIdRef.current === capturedProjectId) {
        setNotice({ status: 'rejected', message: `${beforeApplyProblem ?? '预览期间原 Canvas 或 API 已切换。'} Core 尚未收到 Assembly apply。` });
      }
      return;
    }

    setNotice({ status: 'working', phase: 'applying' });
    let rawResult: AssemblyApplyResultV1;
    try {
      // Explicit click is the only write boundary. Never automatically retry an uncertain receipt.
      rawResult = await port.apply(preview);
    } catch (error: unknown) {
      if (!isCurrentTarget()) return;
      setNotice({ status: 'error', message: error instanceof Error
        ? `未收到 Assembly 回执；写入结果未知，请先重读 Saved Context 再决定是否重试。${error.message}`
        : '未收到 Assembly 回执；写入结果未知，请先重读 Saved Context 再决定是否重试。' });
      return;
    }
    if (!isCurrentTarget()) return;

    const reviewed = reviewAssemblyApply(preview.request, rawResult);
    const expectedViewIds = preview.request.sourceRefs.flatMap((ref) => ref.kind === 'artifactView' ? [ref.id] : []);
    setNotice({ status: 'working', phase: 'reading' });
    const presentation = await readPresentationMembership(projects, projectId, contextId, expectedViewIds);
    if (!isCurrentTarget()) return;
    setMembership(presentation);
    setNotice({ status: 'receipt', result: reviewed.result, confirmedItems: reviewed.result.results,
      labelsByViewId: liveSelection.labelsByViewId, presentation });
  };

  return (
    <div data-lcos-native-saved-context-action={contextId ?? 'unavailable'}
      style={{ display: 'grid', gridTemplateColumns: 'auto auto', justifyContent: 'start', alignItems: 'center', gap: '4px 8px', flex: '1 1 100%', width: '100%', minWidth: 0, marginTop: 6 }}>
      <div style={{ gridColumn: '1 / -1', minWidth: 0, fontSize: 10, lineHeight: 1.3, opacity: 0.76 }}>{selectionLabel}</div>
      <div style={{ gridColumn: '1 / -1', display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
        <LcosButton appearance="oreo" variant="secondary" size="sm" className="nodrag"
          disabled={disabled}
          aria-label={`把当前选区添加到 ${item.title || 'Saved Context'}`}
          onClick={() => { void applyCurrentSelection(); }}>
          {working ? '正在加入…' : '加入当前选区'}
        </LcosButton>
        <LcosButton appearance="oreo" variant="secondary" size="sm" className="nodrag"
          disabled={working || contextId === undefined || membership === undefined}
          aria-label={`刷新 ${item.title || 'Saved Context'} 的 Core 成员`}
          onClick={refreshMembership}>
          刷新成员
        </LcosButton>
      </div>
      {identityProblem && <div role="status" style={{ gridColumn: '1 / -1', fontSize: 10, opacity: 0.76 }}>{identityProblem}</div>}
      {contextId === undefined && <div role="status" style={{ gridColumn: '1 / -1', fontSize: 10, opacity: 0.76 }}>目标不是可写入的 canonical Context。</div>}
      {working && <div role="status" style={{ gridColumn: '1 / -1', fontSize: 10 }}>
        {notice.phase === 'checking' ? '正在核对原画布选区与 Core 身份…'
          : notice.phase === 'applying' ? '正在提交到现有 Core Assembly…' : '正在重读 Core Presentation 成员…'}
      </div>}
      {(notice.status === 'rejected' || notice.status === 'error') && (
        <div role="alert" data-saved-context-action-error={notice.code ?? undefined}
          style={{ gridColumn: '1 / -1', maxWidth: 360, fontSize: 10, color: 'var(--lcos-color-danger, #a62929)' }}>
          {notice.message}{notice.httpStatus === undefined ? '' : `（HTTP ${notice.httpStatus}）`}
        </div>
      )}
      {membership && <div role="status" data-saved-context-members
        data-presentation-readback={membership.status}
        data-presentation-id={`presentation:context:${contextId ?? ''}`}
        style={{ gridColumn: '1 / -1', display: 'grid', gap: 3, minWidth: 0, fontSize: 10 }}>
        <LcosSurfaceFeedback presentation={membership.status === 'confirmed' ? 'normal'
          : membership.status === 'partial' ? 'recovery' : 'error'}
          message={`已保存成员 · ${membership.message}`} />
        {membership.rows.map((row) => <span key={row.viewId} data-saved-context-member={row.viewId}>
          {row.label ? `${row.label} · ${row.viewId}` : `Core 图未返回唯一 Artifact 标题 · ${row.viewId}`}
        </span>)}
        {membership.entityRows.map(({ ref, label }) => <div key={`${ref.type}:${ref.id}`} data-saved-context-entity-member={`${ref.type}:${ref.id}`}>
          {label ? `${label} · ${ref.type}:${ref.id}` : `Core 图未返回此实体的可读名称 · ${ref.type}:${ref.id}`}
        </div>)}
      </div>}
      {membership === undefined && contextId !== undefined && <div role="status" data-saved-context-members
        data-presentation-readback="loading" data-presentation-id={`presentation:context:${contextId}`}
        style={{ gridColumn: '1 / -1', minWidth: 0, fontSize: 10 }}>
        <LcosSurfaceFeedback presentation="loading" message="正在从 Core 读取 Saved Context 成员…" />
      </div>}
      {notice.status === 'receipt' && (
        <div role="status" data-saved-context-action-receipt
          data-context-all-applied={notice.result.allApplied ? 'true' : 'false'}
          data-presentation-readback={notice.presentation.status}
          data-presentation-id={`presentation:context:${contextId ?? ''}`}
          style={{ gridColumn: '1 / -1', display: 'grid', gap: 3, maxWidth: 360, fontSize: 10 }}>
          <strong>{receiptSummary(notice.confirmedItems)}</strong>
          {notice.confirmedItems.map((result) => {
            const viewMember = result.sourceRef.kind === 'artifactView'
              && notice.presentation.memberViewIds.includes(result.sourceRef.id);
            return <span key={`${result.sourceRef.kind}:${result.sourceRef.id}`}
              data-saved-context-receipt-item={result.sourceRef.id}
              data-source-kind={result.sourceRef.kind}
              data-status={result.status}
              data-channel={result.channel}
              title={result.sourceRef.id}>
              {itemLabel(result, notice.labelsByViewId)}：{receiptLabel(result)}
              {result.message ? ` · ${result.message}` : ''}
              {result.changeSetId ? ` · ChangeSet ${result.changeSetId}` : ''}
              {result.sourceRef.kind === 'artifactView'
                ? ` · Presentation${viewMember ? ' 已读到成员' : ' 未读到成员'}` : ''}
            </span>;
          })}
          <span>{notice.presentation.message}</span>
        </div>
      )}
    </div>
  );
}
