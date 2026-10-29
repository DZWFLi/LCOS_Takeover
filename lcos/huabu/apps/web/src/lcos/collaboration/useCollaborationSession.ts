// useCollaborationSession —— 组件侧 watch 一个会话的 Collaboration projection。
// 挂载持有一个 watch，卸载配对 unwatch；多个消费者共享同会话订阅；投影缺失/失败如实反映 status。

import { useEffect } from 'react';

import {
  readCollaborationEntry,
  useCollaborationSessionStore,
  type CollaborationSessionEntry,
} from './collaborationSessionStore';

export function useCollaborationSession(
  projectId: string | null | undefined,
  conversationId: string | null | undefined,
): CollaborationSessionEntry | undefined {
  const entry = useCollaborationSessionStore((state) =>
    readCollaborationEntry(state.entries, projectId, conversationId),
  );
  const watch = useCollaborationSessionStore((state) => state.watch);
  const unwatch = useCollaborationSessionStore((state) => state.unwatch);

  useEffect(() => {
    if (projectId === null || projectId === undefined || conversationId === null || conversationId === undefined) return;
    watch(projectId, conversationId);
    return () => unwatch(projectId, conversationId);
  }, [projectId, conversationId, watch, unwatch]);

  return entry;
}