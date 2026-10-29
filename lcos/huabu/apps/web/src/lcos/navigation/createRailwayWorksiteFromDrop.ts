import { railwayStableKeyV1 } from '@local-creative-os/contracts';

import { assemblySourceKey, reviewAssemblyApply } from '../professional/assemblyApplyReview';

import type { LcosCoreSession } from '../app/lcosCoreClient';
import type { AssemblyApplyResultV1, AssemblySourceRefV1, ProjectGraphSnapshot, RailwaySnapshotV1 } from '@local-creative-os/contracts';
import type { Scope, Workspace } from '@local-creative-os/domain';

type WorksiteDropSession = Pick<LcosCoreSession, 'projects' | 'assembly' | 'railway'>;
type MaterialSource = Extract<AssemblySourceRefV1, { kind: 'artifactView' | 'note' }>;

export interface CreateRailwayWorksiteDropInput {
  readonly projectId: string;
  /** Existing Drop transaction identity; retry the same frozen gesture with this ID. */
  readonly operationId: string;
  readonly surface: 'main' | 'context' | 'workflow';
  readonly sourceRefs: readonly AssemblySourceRefV1[];
  /** Only the explicit + click creates an empty scene; a material Drop never does. */
  readonly createBlank?: boolean;
  readonly name?: string;
  /** Exact presented revisions captured by the caller, keyed by source View ID. */
  readonly capturedRevisionIdsBySource?: Readonly<Record<string, string>>;
  /** Optional native snapshot placement only; never copied from legacy Core x/y. */
  readonly placementBySource?: Readonly<Record<string, { readonly x: number; readonly y: number }>>;
}

export interface CreateRailwayWorksiteDropResult {
  readonly status: 'created' | 'partial';
  readonly workspaceId: string;
  readonly scopeId: string;
  readonly name: string;
  readonly canvasId?: string;
  readonly applyReceipt?: AssemblyApplyResultV1;
  readonly railwaySnapshot?: RailwaySnapshotV1;
  readonly message?: string;
  /** Identity-only receipts for native text carriers registered by the existing producer. */
  readonly nativeTextClaims?: readonly { readonly nodeId: string; readonly viewId: string;
    readonly artifactId: string; readonly revisionId: string }[];
}

function readMaterials(graph: ProjectGraphSnapshot, input: CreateRailwayWorksiteDropInput) {
  const unique = new Map(input.sourceRefs.map(ref => [assemblySourceKey(ref), { ...ref }]));
  if (!unique.size && !input.createBlank) throw new Error('没有可放入新现场的材料。');
  const sources: MaterialSource[] = [];
  const revisions = new Map<string, string>();
  for (const source of unique.values()) {
    if (!source.id.trim() || (source.kind !== 'artifactView' && source.kind !== 'note'))
      throw new Error('新现场目前接收材料和笔记；整组选中对象未创建，原对象保留。');
    if (source.kind === 'note') {
      const matches = graph.notes.filter(note => String(note.id) === source.id && String(note.projectId) === input.projectId);
      if (matches.length !== 1) throw new Error('原笔记身份已改变，未确认来源。');
    } else {
      const matches = graph.artifactViews.filter(view => String(view.id) === source.id);
      const view = matches.length === 1 ? matches[0] : undefined;
      const artifact = view && graph.artifacts.find(item => item.id === view.artifactId && String(item.projectId) === input.projectId);
      const revisionId = view?.revisionId ?? artifact?.currentRevisionId;
      const revision = graph.artifactRevisions.find(item => item.id === revisionId && item.artifactId === artifact?.id);
      const expectedRevision = input.capturedRevisionIdsBySource?.[source.id];
      if (!view || !artifact || !revision || expectedRevision !== undefined && expectedRevision !== String(revision.id))
        throw new Error('原材料或所见版本已改变，未改用最新版。');
      revisions.set(source.id, String(revision.id));
    }
    sources.push(source);
  }
  return { sources, revisions };
}

function matchesSavedWorksite(graph: ProjectGraphSnapshot, workspaceId: string, scopeId: string,
  rootId: string, input: CreateRailwayWorksiteDropInput) {
  const scopes = graph.scopes.filter(scope => String(scope.id) === scopeId);
  const workspaces = graph.workspaces.filter(workspace => String(workspace.id) === workspaceId);
  const scope = scopes.length === 1 ? scopes[0] : undefined;
  const workspace = workspaces.length === 1 ? workspaces[0] : undefined;
  if (!scope || !workspace || String(scope.projectId) !== input.projectId || String(workspace.projectId) !== input.projectId
    || scope.kind !== (input.surface === 'main' ? 'delivery' : input.surface)
    || String(scope.parentScopeId) !== rootId || String(workspace.scopeId) !== scopeId || workspace.preferredSurface !== input.surface)
    throw new Error('本次新现场身份尚未确认，未覆盖已有现场。');
  return workspace;
}

/** One small choreography over existing Core owners. Does not navigate, cache a
 * graph, clone source Views, write native geometry or create a new transaction owner.
 * Existing operation-derived primary keys allow a manual retry to read back the
 * same partial Workspace after a lost response, instead of creating another one. */
export async function createRailwayWorksiteFromDrop(session: WorksiteDropSession,
  input: CreateRailwayWorksiteDropInput, ensureWorkspaceCanvas: (workspaceId: string) => Promise<string | undefined>,
  signal?: AbortSignal, isCurrent?: () => boolean): Promise<CreateRailwayWorksiteDropResult> {
  const current = (): void => {
    if (signal?.aborted || isCurrent?.() === false) throw new Error('操作已取消或来源项目已变化，原材料保留。');
  };
  current();
  if (!input.projectId.trim() || !input.operationId.trim() || !['main', 'context', 'workflow'].includes(input.surface))
    throw new Error('新现场的项目、操作或现场类型尚未确认。');
  const graph = await session.projects.getProjectGraph(input.projectId);
  current();
  if (!graph || String(graph.project.id) !== input.projectId) throw new Error('项目尚未读回，未创建新现场。');
  const roots = graph.scopes.filter(scope => scope.kind === 'root' && String(scope.projectId) === input.projectId);
  const root = roots.length === 1 ? roots[0] : undefined;
  if (!root) throw new Error('项目根身份不唯一，未创建新现场。');
  const { sources, revisions } = readMaterials(graph, input);
  const address = `${encodeURIComponent(input.projectId)}:${encodeURIComponent(input.operationId)}`;
  const workspaceId = `workspace:rail-drop:${address}`, scopeId = `scope:rail-drop:${address}`;
  const existing = graph.workspaces.find(item => String(item.id) === workspaceId);
  const rootIds = new Set(graph.scopes.filter(scope => scope.kind === 'root').map(scope => String(scope.id)));
  const prefix = input.surface === 'main' ? '现场' : input.surface === 'context' ? '上下文现场' : '工作流现场';
  let nextNumber = graph.workspaces.filter(workspace => !rootIds.has(String(workspace.scopeId))).length + 1;
  while (graph.workspaces.some(workspace => workspace.name === `${prefix} ${nextNumber}`)) nextNumber += 1;
  const name = existing?.name ?? input.name?.trim() ?? `${prefix} ${nextNumber}`;
  if (!name || name.length > 200) throw new Error('现场名称需要1–200个字符。');
  let canvasId: string | undefined;
  let applyReceipt: AssemblyApplyResultV1 | undefined;
  let phase = '现场创建';
  try {
    if (existing || graph.scopes.some(scope => String(scope.id) === scopeId)) {
      matchesSavedWorksite(graph, workspaceId, scopeId, String(root.id), input);
    } else {
      const now = new Date().toISOString();
      const scope: Scope = { id: scopeId as Scope['id'], projectId: graph.project.id, parentScopeId: root.id,
        containerViewId: null, kind: input.surface === 'main' ? 'delivery' : input.surface, name, createdAt: now, updatedAt: now };
      const workspace: Workspace = { id: workspaceId as Workspace['id'], projectId: graph.project.id, scopeId: scope.id,
        name, intent: null, viewport: { x: 0, y: 0, zoom: 1 }, focusedViewIds: [], visibleLayers: ['core'],
        contextPolicy: 'workspace-related', preferredSurface: input.surface, updatedAt: now };
      current();
      await session.projects.applyGraphMutations(input.projectId, { baseVersion: graph.graphVersion, actorKind: 'user',
        ops: [{ type: 'upsert_scope', scope }, { type: 'upsert_workspace', workspace }] });
    }
    const saved = await session.projects.getProjectGraph(input.projectId);
    current();
    if (!saved || String(saved.project.id) !== input.projectId) throw new Error('新现场尚未读回。');
    matchesSavedWorksite(saved, workspaceId, scopeId, String(root.id), input);
    const retained = readMaterials(saved, input);
    if ([...revisions].some(([id, revision]) => retained.revisions.get(id) !== revision))
      throw new Error('材料版本在创建期间已变化，未投递到新现场。');
    phase = '材料投放';
    const request = { schemaVersion: 1 as const, projectId: input.projectId, sourceRefs: sources,
      targetRef: { kind: 'workspace' as const, id: workspaceId },
      ...(input.placementBySource ? { placementBySource: input.placementBySource } : {}) };
    if (sources.length) {
      applyReceipt = await session.assembly.apply(input.projectId, request, signal);
      current();
      const reviewed = reviewAssemblyApply(request, applyReceipt);
      if (!reviewed.result.allApplied) throw new Error(reviewed.unknownKeys.length
        ? '部分材料回执未确认；请核对同一现场，未自动重新投递。' : '部分材料未完成投放；同一现场与原材料保留。');
    }
    const confirmed = await session.projects.getProjectGraph(input.projectId);
    current();
    if (!confirmed || String(confirmed.project.id) !== input.projectId) throw new Error('材料成员尚未读回。');
    matchesSavedWorksite(confirmed, workspaceId, scopeId, String(root.id), input);
    const confirmedMaterials = readMaterials(confirmed, input);
    if ([...revisions].some(([id, revision]) => confirmedMaterials.revisions.get(id) !== revision))
      throw new Error('材料所见版本在投放期间已变化，请核对同一现场。');
    if (sources.some(source => source.kind === 'artifactView'
      ? !confirmed.workspaceMemberships?.some(member => String(member.workspaceId) === workspaceId && String(member.artifactViewId) === source.id)
      : !confirmed.workspaceEntityMemberships?.some(member => String(member.workspaceId) === workspaceId && member.entityType === 'note' && member.entityId === source.id)))
      throw new Error('材料成员尚未确认到本次现场，未宣布完整创建。');
    phase = '现场画布';
    canvasId = await ensureWorkspaceCanvas(workspaceId);
    current();
    if (!canvasId) throw new Error('现场画布尚未建立，已保存的材料与现场保留。');
    const ready = await session.projects.getProjectGraph(input.projectId);
    current();
    if (!ready || String(ready.project.id) !== input.projectId
      || matchesSavedWorksite(ready, workspaceId, scopeId, String(root.id), input).canvasId !== canvasId)
      throw new Error('现场画布绑定尚未确认。');
    phase = 'Rail入口保存';
    const snapshot = await session.railway.snapshot(input.projectId, signal);
    current();
    if (snapshot.projectId !== input.projectId || snapshot.order.projectId !== input.projectId)
      throw new Error('导航项目身份已变化，未保存到另一项目。');
    const ref = { kind: 'worksite' as const, projectId: input.projectId, worksiteId: workspaceId };
    const retainedInRail = snapshot.order.orderedRefs.some(item => railwayStableKeyV1(item) === railwayStableKeyV1(ref));
    const railwaySnapshot = retainedInRail ? snapshot : await session.railway.save(input.projectId,
      [...snapshot.order.orderedRefs, ref], snapshot.order.version, signal);
    current();
    if (railwaySnapshot.projectId !== input.projectId || !railwaySnapshot.order.orderedRefs.some(item => railwayStableKeyV1(item) === railwayStableKeyV1(ref)))
      throw new Error('新现场入口回执尚未确认。');
    return { status: 'created', workspaceId, scopeId, name, canvasId, applyReceipt, railwaySnapshot };
  } catch (error: unknown) {
    // Writes belong to different existing owners. Never delete an uncertain
    // Workspace or auto-replay a possibly committed Apply to fake atomic success.
    return { status: 'partial', workspaceId, scopeId, name, ...(canvasId ? { canvasId } : {}),
      ...(applyReceipt ? { applyReceipt } : {}), message: `${phase}未完整确认：${error instanceof Error ? error.message : String(error)}` };
  }
}
