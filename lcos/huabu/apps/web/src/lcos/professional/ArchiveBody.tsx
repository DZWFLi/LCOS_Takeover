// ArchiveBody — canonical Artifact cold-state browser inside the existing Professional Window.
// It never owns a second archive store: every row is read from Core and restore keeps the same id.

import { ArchiveRestore, BookOpen, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { createLcosCoreSession } from '../app/lcosCoreClient';
import { useCollaborationSessionStore } from '../collaboration/collaborationSessionStore';
import { useLcosHostStore } from '../host/lcosHostState';
import { useLcosShellStore } from '../shell/lcosShellStore';
import { lcosTokens } from '../ui/lcosTokens';

import type { Artifact } from '@local-creative-os/domain';

export function ArchiveBody({
  projectId,
}: {
  readonly projectId: string;
}): React.JSX.Element {
  const session = useMemo(() => createLcosCoreSession(), []);
  const openReader = useLcosShellStore((state) => state.openReader);
  const [items, setItems] = useState<readonly Artifact[]>([]);
  const [query, setQuery] = useState('');
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [busyId, setBusyId] = useState<string | undefined>();
  const [message, setMessage] = useState<string | undefined>();
  const requestId = useRef(0);
  const activeProjectId = useRef<string | null>(null);
  const mounted = useRef(false);
  const reloadRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    let disposed = false;
    activeProjectId.current = projectId;
    mounted.current = true;
    setItems([]);
    setState('loading');
    setBusyId(undefined);
    setMessage(undefined);

    const reload = (): void => {
      if (disposed || !mounted.current || activeProjectId.current !== projectId) return;
      const currentRequestId = ++requestId.current;
      setState('loading');
      void session.artifacts
        .listArtifacts(projectId, 'archived')
        .then((value) => {
          if (disposed || !mounted.current || activeProjectId.current !== projectId || requestId.current !== currentRequestId) return;
          setItems(value);
          setState('ready');
        })
        .catch((error: unknown) => {
          if (disposed || !mounted.current || activeProjectId.current !== projectId || requestId.current !== currentRequestId) return;
          setState('error');
          setMessage(error instanceof Error ? error.message : '归档读取失败');
        });
    };

    reloadRef.current = reload;
    const stopWatching = useCollaborationSessionStore
      .getState()
      .watchArtifactChanges(projectId, reload);
    reload();

    return () => {
      disposed = true;
      requestId.current += 1;
      if (activeProjectId.current === projectId) {
        activeProjectId.current = null;
        mounted.current = false;
      }
      stopWatching();
    };
  }, [projectId, session]);

  const visible = items.filter((artifact) =>
    artifact.title
      .toLocaleLowerCase('zh-CN')
      .includes(query.trim().toLocaleLowerCase('zh-CN')),
  );
  const restore = (artifact: Artifact): void => {
    setBusyId(String(artifact.id));
    setMessage(undefined);
    void session.artifacts
      .restoreArtifact(projectId, String(artifact.id))
      .then(() => {
        const isCurrentProject = mounted.current && activeProjectId.current === projectId;
        if (!isCurrentProject) return;
        useLcosHostStore.getState().host?.notifyMutationSuccess();
        setMessage(`已恢复「${artifact.title}」；将按当前现场重新落位。`);
        reloadRef.current();
      })
      .catch((error: unknown) => {
        if (!mounted.current || activeProjectId.current !== projectId) return;
        setMessage(error instanceof Error ? error.message : '恢复失败');
      })
      .finally(() => {
        if (mounted.current && activeProjectId.current === projectId) setBusyId(undefined);
      });
  };

  return (
    <div
      data-lcos-archive-body
      className="flex h-full min-h-[320px] flex-col gap-3 p-4"
    >
      <div>
        <h2
          className="text-base font-semibold"
          style={{ color: lcosTokens.color.text }}
        >
          归档
        </h2>
        <p className="text-xs" style={{ color: lcosTokens.color.muted }}>
          对象仍在项目中；这里是只读冷区，恢复后会重新落位。
        </p>
      </div>
      <label
        className="flex min-h-11 items-center gap-2 rounded-xl px-3"
        style={{ background: lcosTokens.color.raised }}
      >
        <Search
          className="h-4 w-4"
          aria-hidden
          style={{ color: lcosTokens.color.muted }}
        />
        <input
          data-lcos-archive-search
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索归档对象"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          style={{ color: lcosTokens.color.text }}
        />
      </label>
      {state === 'loading' && (
        <p className="text-sm" style={{ color: lcosTokens.color.muted }}>
          正在读取归档…
        </p>
      )}
      {state === 'error' && (
        <button
          type="button"
          onClick={() => reloadRef.current()}
          className="min-h-11 rounded-xl px-3 text-left text-sm"
          style={{ color: lcosTokens.color.danger }}
        >
          读取失败，点此重试
        </button>
      )}
      {state === 'ready' && visible.length === 0 && (
        <p
          className="py-8 text-center text-sm"
          style={{ color: lcosTokens.color.muted }}
        >
          没有匹配的归档对象
        </p>
      )}
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        {visible.map((artifact) => (
          <article
            key={String(artifact.id)}
            data-lcos-archive-item={String(artifact.id)}
            className="rounded-xl p-3"
            style={{ background: lcosTokens.color.raised }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p
                  className="truncate text-sm font-medium"
                  style={{ color: lcosTokens.color.text }}
                >
                  {artifact.title}
                </p>
                <p
                  className="mt-1 text-xs"
                  style={{ color: lcosTokens.color.muted }}
                >
                  {artifact.kind} · 归档于{' '}
                  {artifact.archivedAt
                    ? new Date(artifact.archivedAt).toLocaleString()
                    : '未知时间'}
                </p>
              </div>
              <span
                className="shrink-0 rounded-full px-2 py-1 text-[10px]"
                style={{ color: lcosTokens.color.muted }}
              >
                只读
              </span>
            </div>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => openReader(artifact.title, String(artifact.id))}
                className="flex min-h-11 items-center gap-1 rounded-full px-3 text-xs"
                style={{ color: lcosTokens.color.info }}
              >
                <BookOpen className="h-3.5 w-3.5" aria-hidden />
                查看
              </button>
              <button
                type="button"
                disabled={busyId !== undefined}
                onClick={() => restore(artifact)}
                className="flex min-h-11 items-center gap-1 rounded-full px-3 text-xs disabled:opacity-50"
                style={{ color: lcosTokens.color.text }}
              >
                <ArchiveRestore className="h-3.5 w-3.5" aria-hidden />
                {busyId === String(artifact.id) ? '恢复中…' : '恢复'}
              </button>
            </div>
          </article>
        ))}
      </div>
      {message && (
        <p
          aria-live="polite"
          className="text-xs"
          style={{ color: lcosTokens.color.muted }}
        >
          {message}
        </p>
      )}
    </div>
  );
}
