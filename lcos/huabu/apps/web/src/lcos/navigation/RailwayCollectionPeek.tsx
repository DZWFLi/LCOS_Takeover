// Core membership + the existing Huabu scene geometry; no second spatial owner.
import { collectionPreviewMembers } from '@local-creative-os/web-gen2';
import { useEffect, useMemo, useState } from 'react';

import { readRailwayMemberGeometry } from './railwayMemberGeometry';
import { RailwayMemberMap } from './RailwayMemberMap';
import { createLcosCoreSession } from '../app/lcosCoreClient';

import type { RailwayMapMember, RailwayMemberMapSnapshot } from './RailwayMemberMap';
import type { ProjectGraphSnapshot } from '@local-creative-os/contracts';
import type { CoreCollectionMembersSnapshot } from '@local-creative-os/web-gen2';

export function RailwayCollectionPeek({ projectId, collectionId, refreshKey, graph }: {
  readonly projectId: string;
  readonly collectionId: string;
  readonly refreshKey?: string;
  readonly graph?: ProjectGraphSnapshot;
}): React.JSX.Element {
  const session = useMemo(() => createLcosCoreSession(), []);
  const identity = JSON.stringify([projectId, collectionId, refreshKey]);
  const [load, setLoad] = useState<{
    identity: string; status: 'loading' | 'ready' | 'error'; snapshot: CoreCollectionMembersSnapshot | null;
    members: readonly RailwayMapMember[]; map: RailwayMemberMapSnapshot; error?: string;
  }>({ identity, status: 'loading', snapshot: null, members: [], map: {geometry:[]} });
  const [attempt, setAttempt] = useState(0);
  const view: typeof load = load.identity === identity ? load
    : { identity, status: 'loading', snapshot: null, members: [], map: {geometry:[]} };

  useEffect(() => {
    const controller = new AbortController();
    setLoad({ identity, status: 'loading', snapshot: null, members: [], map: {geometry:[]} });
    void session.collections.members(projectId, collectionId, controller.signal).then(async snapshot => {
      if (controller.signal.aborted) return;
      if (snapshot.collection.projectId !== projectId || snapshot.collection.id !== collectionId)
        throw new Error('集合成员身份不匹配。');
      const members = collectionPreviewMembers(snapshot).map((member): RailwayMapMember => ({
        key: JSON.stringify([member.type,member.id]), entityType:member.type,entityId:member.id,
        label:member.label,kind:member.kind,availability:member.availability,
      }));
      const map = await readRailwayMemberGeometry(session,projectId,{entityType:'collection',entityId:collectionId},members,controller.signal,graph);
      if (!controller.signal.aborted) setLoad({ identity,status:'ready',snapshot,members,map });
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) setLoad({ identity,status:'error',snapshot:null,members:[],map:{geometry:[]},
        error: reason instanceof Error ? reason.message : '集合成员读取失败。' });
    });
    return () => controller.abort();
  }, [session, projectId, collectionId, identity, attempt, refreshKey, graph]);

  return <section data-lcos-railway-collection-peek={collectionId}
    aria-label={`${view.snapshot?.collection.title ?? '集合'} · 实际成员预览`} className="lcos-railway-collection-peek">
    {view.status === 'loading' && <p role="status" data-lcos-railway-preview-status>正在读取集合成员…</p>}
    {view.status === 'error' && <p role="status" data-lcos-railway-preview-status>
      {view.error || '集合暂时无法读取。'}<button type="button" onClick={() => setAttempt(count => count + 1)}>重试</button>
    </p>}
    {view.status === 'ready' && view.members.length === 0 && <p role="status" data-lcos-railway-preview-empty>集合里还没有成员。</p>}
    {view.status === 'ready' && <RailwayMemberMap members={view.members} snapshot={view.map} />}
  </section>;
}
