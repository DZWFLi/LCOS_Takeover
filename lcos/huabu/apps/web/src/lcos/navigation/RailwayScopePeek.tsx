import { useEffect, useMemo, useState } from 'react';

import { readRailwayMemberGeometry } from './railwayMemberGeometry';
import { RailwayMemberMap } from './RailwayMemberMap';
import { readSemanticNavigationLocations } from './semanticNavigationLocations';
import { createLcosCoreSession } from '../app/lcosCoreClient';

import type { ProjectNavigationIndex } from './projectNavigationIndex';
import type { RailwayMapMember, RailwayMemberMapSnapshot } from './RailwayMemberMap';
import type { NavigationEntityIdentity } from './semanticNavigationLocations';
import type { CollectionMemberPreview as MemberPreview, RailwayDestinationV1, ProjectGraphSnapshot } from '@local-creative-os/contracts';

export function scopeMemberPreview(graph: ProjectGraphSnapshot, member: NavigationEntityIdentity): MemberPreview | undefined {
  if (member.entityType === 'artifact') {
    const artifact = graph.artifacts.find(item => String(item.id) === member.entityId);
    if (!artifact) return { type: 'artifact', id: member.entityId, label: '原材料已移除', kind: 'file', availability: 'missing' };
    const view = member.artifactViewId ? graph.artifactViews.find(item => String(item.id) === member.artifactViewId) : undefined;
    const revision = graph.artifactRevisions.find(item => item.artifactId === artifact.id && item.id === (view?.revisionId ?? artifact.currentRevisionId));
    const file = revision ? graph.fileRecords.find(item => item.id === revision.fileRecordId) : undefined;
    return { type: 'artifact', id: member.entityId, label: artifact.title,
      kind: artifact.kind === 'markdown' ? 'text' : artifact.kind === 'other' ? 'file' : artifact.kind,
      availability: artifact.availability === 'missing' || file?.availability === 'missing' ? 'missing'
        : artifact.availability === 'stale' || file?.availability === 'stale' ? 'stale' : file && file.availability !== 'unreadable' ? 'available' : 'unreadable',
      ...(revision ? { revisionId: String(revision.id) } : {}),
      ...(file ? { fileRecordId: String(file.id), mimeType: file.mimeType, byteSize: file.size } : {}) };
  }
  if (member.entityType === 'note') {
    const note = graph.notes.find(item => String(item.id) === member.entityId);
    return note ? { type: 'note', id: member.entityId, label: note.body.split('\n')[0] || '笔记',
      kind: 'note', availability: 'available', excerpt: note.body } : undefined;
  }
  if (member.entityType === 'scope') {
    const scope = graph.scopes.find(item => String(item.id) === member.entityId);
    return scope ? { type: 'scope', id: member.entityId, label: scope.name, kind: 'scope', availability: 'available' } : undefined;
  }
  if (member.entityType === 'workspace') {
    const workspace = graph.workspaces.find(item => String(item.id) === member.entityId);
    return workspace ? { type: 'workspace', id: member.entityId, label: workspace.name, kind: 'workspace', availability: 'available' } : undefined;
  }
  if (member.entityType === 'conversation') return { type: 'conversation', id: member.entityId, label: '已保存会话', kind: 'conversation', availability: 'unreadable' };
  return undefined;
}

/** Scope peek reads real Presentation membership. Existing worksite addresses
 * are optional direct entries, never a mandatory destination selector. */
export function RailwayScopePeek({ projectId, scopeId, index, worksiteDestinations, onOpenWorksite, refreshKey }: {
  readonly projectId: string; readonly scopeId: string; readonly index?: ProjectNavigationIndex;
  readonly worksiteDestinations: readonly RailwayDestinationV1[];
  readonly onOpenWorksite: (destination: RailwayDestinationV1) => void;
  readonly refreshKey?: string;
}): React.JSX.Element {
  const session = useMemo(() => createLcosCoreSession(), []);
  const identity = JSON.stringify([projectId, scopeId, refreshKey]);
  const [attempt, setAttempt] = useState(0);
  const [load, setLoad] = useState<{ identity: string; status: 'loading' | 'ready' | 'error'; members: readonly RailwayMapMember[]; map: RailwayMemberMapSnapshot; unresolvedCount: number; message?: string }>(
    { identity, status: 'loading', members: [], map: {geometry:[]}, unresolvedCount: 0 });
  const view = load.identity === identity ? load : { identity, status: 'loading' as const, members: [], map: {geometry:[]}, unresolvedCount: 0 };
  useEffect(() => {
    const controller = new AbortController();
    setLoad({ identity, status: 'loading', members: [], map: {geometry:[]}, unresolvedCount: 0 });
    if (!index?.graph || String(index.graph.project.id) !== projectId) {
      setLoad({ identity, status: 'error', members: [], map: {geometry:[]}, unresolvedCount: 0, message: '项目成员暂不可读取。' }); return () => controller.abort();
    }
    void readSemanticNavigationLocations(session, projectId, index, controller.signal).then(async result => {
      const graph = index.graph;
      if (controller.signal.aborted || !graph) return;
      const locations = result.locations.filter(item => item.entityType === 'scope' && item.entityId === scopeId);
      const members = [...new Map(locations.flatMap(item => item.members)
        .map(item => [JSON.stringify([item.entityType,item.entityId,item.artifactViewId]), item])).entries()]
        .map(([key,item]): RailwayMapMember => { const preview = scopeMemberPreview(graph,item); return { ...item,key,
          label:preview?.label ?? '原引用暂不可读取',kind:preview?.kind ?? item.entityType,availability:preview?.availability ?? 'unreadable' }; });
      const unresolvedCount = new Set(locations.flatMap(item => item.unresolvedViewIds ?? [])).size;
      const map = await readRailwayMemberGeometry(session,projectId,{entityType:'scope',entityId:scopeId},members,controller.signal,graph);
      if (controller.signal.aborted) return;
      setLoad({ identity, map, status: result.issues.length && !locations.length ? 'error' : 'ready', members, unresolvedCount,
        ...(result.issues.length ? { message: result.issues.join('；') } : {}) });
    }).catch(reason => { if (!controller.signal.aborted) setLoad({ identity, status: 'error', members: [], map: {geometry:[]}, unresolvedCount: 0, message: reason instanceof Error ? reason.message : '成员读取失败。' }); });
    return () => controller.abort();
  }, [session, projectId, scopeId, identity, index, attempt, refreshKey]);
  const relatedWorksites = worksiteDestinations.filter(item => item.ref.projectId === projectId && item.ref.kind === 'worksite'
    && index?.graph?.workspaces.some(workspace => String(workspace.id) === item.workspaceId && String(workspace.scopeId) === scopeId));
  return <section data-lcos-railway-scope-peek={scopeId} aria-label="已保存成员与实际现场">
    {view.status === 'loading' && <p role="status">正在读取已保存成员…</p>}
    {view.message && <p role="status">{view.message} <button type="button" onClick={() => setAttempt(value => value + 1)}>重试</button></p>}
    {view.status === 'ready' && <>
      {view.members.length === 0 && view.unresolvedCount === 0 && <p role="status" data-lcos-railway-preview-empty>尚未保存成员</p>}
      <RailwayMemberMap members={view.members} snapshot={view.map} unresolvedCount={view.unresolvedCount} />
    </>}
    {relatedWorksites.length > 0 && <div data-lcos-railway-scope-worksites aria-label="已有工作现场">{relatedWorksites.map(item =>
      <button key={item.key} type="button" disabled={!item.available} onClick={() => onOpenWorksite(item)}>{item.label}</button>)}</div>}
  </section>;
}
