import { useEffect, useRef, useState } from 'react';

import { readerLineageEntries } from './readerLineage';
import { useLcosShellStore } from '../shell/lcosShellStore';

import type { ReaderLineageEntry } from './readerLineage';
import type { LcosCoreSession } from '../app/lcosCoreClient';

/** Existing extraction evidence → existing exact-source Reader, without replacing Current. */
export function ReaderLineageActions({ projects, projectId, artifactId }: {
  readonly projects: Pick<LcosCoreSession['projects'], 'getProjectGraph'>;
  readonly projectId: string; readonly artifactId: string;
}): React.JSX.Element | null {
  const [entries, setEntries] = useState<readonly ReaderLineageEntry[]>([]);
  const [note, setNote] = useState<string>();
  const [busy, setBusy] = useState(false);
  const alive = useRef(false);
  const pending = useRef(false);
  useEffect(() => {
    let current = true; alive.current = true;
    setEntries([]); setNote(undefined);
    void projects.getProjectGraph(projectId).then(graph => {
      if (!current) return;
      if (!graph) throw new Error('来源关系暂时读不到，现有阅读保留。');
      setEntries(readerLineageEntries(projectId, artifactId, graph));
    }).catch((reason: unknown) => { if (current) setNote(reason instanceof Error ? reason.message : '来源关系暂时读不到，现有阅读保留。'); });
    return () => { current = false; alive.current = false; };
  }, [artifactId, projectId, projects]);
  const open = async (entry: ReaderLineageEntry): Promise<void> => {
    if (pending.current || entry.unavailableReason) return;
    const before = useLcosShellStore.getState();
    const sourceWindowId = before.windows.find(window => window.active)?.id;
    if (before.projectId !== projectId) { setNote('当前项目已改变，现有阅读保留。'); return; }
    pending.current = true; setBusy(true); setNote(undefined);
    try {
      const graph = await projects.getProjectGraph(projectId);
      if (!alive.current) return;
      const fresh = graph ? readerLineageEntries(projectId, artifactId, graph).find(item => item.relationId === entry.relationId
        && item.artifactId === entry.artifactId && item.revisionId === entry.revisionId
        && JSON.stringify(item.locator ?? null) === JSON.stringify(entry.locator ?? null)) : undefined;
      if (!fresh || fresh.unavailableReason || !fresh.revisionId) throw new Error(fresh?.unavailableReason ?? '来源关系或具体版本已变化，现有阅读保留。');
      const shell = useLcosShellStore.getState();
      if (shell.projectId !== projectId || shell.windows.find(window => window.active)?.id !== sourceWindowId) throw new Error('当前阅读现场已改变，未把来源打开到其它任务。');
      shell.openReader(`来源 · ${fresh.title}`, fresh.artifactId, { revisionId: fresh.revisionId,
        ...(fresh.locator ? { sourceLocator: fresh.locator } : {}), ...(sourceWindowId ? { returnToWindowId: sourceWindowId } : {}) });
    } catch (reason: unknown) { if (alive.current) setNote(reason instanceof Error ? reason.message : '来源暂不可打开，现有阅读保留。'); }
    finally { pending.current = false; if (alive.current) setBusy(false); }
  };
  if (!entries.length && !note) return null;
  return <div data-lcos-reader-lineage className="flex flex-wrap items-center gap-2 text-[11px]">
    {entries.map((entry, index) => <span key={`${entry.relationId}:${index}`}>
      <button type="button" data-lcos-reader-lineage-source={entry.artifactId} disabled={busy || Boolean(entry.unavailableReason)}
        title={entry.unavailableReason ?? `artifact:${entry.artifactId}@${entry.revisionId}`} onClick={() => { void open(entry); }}>
        回到原材料 · {entry.title}{entry.locator?.label ? ` · ${entry.locator.label}` : ''}
      </button>{entry.unavailableReason && <span>{entry.unavailableReason}</span>}
    </span>)}
    {note && <span role="status">{note}</span>}
  </div>;
}
