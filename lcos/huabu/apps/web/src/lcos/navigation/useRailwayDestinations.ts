import { useCallback, useEffect, useRef, useState } from 'react';

import type { RailwaySnapshotV1, RailwayStoredRefV1 } from '@local-creative-os/contracts';
import type { CoreRailwayClient } from '@local-creative-os/web-gen2';

/** Request-local UI only. The current Core snapshot and existing CAS row own order. */
const unchanged = async (value: RailwaySnapshotV1): Promise<RailwaySnapshotV1> => value;
export function useRailwayDestinations(projectId: string, client: CoreRailwayClient,
  complete: (value: RailwaySnapshotV1, signal?: AbortSignal) => Promise<RailwaySnapshotV1> = unchanged) {
  const [snapshot, setSnapshot] = useState<RailwaySnapshotV1>();
  const current = useRef<RailwaySnapshotV1 | undefined>(undefined);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const usable = useRef(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string>();
  const alive = useRef(true);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const epoch = useRef(0);
  const reading = useRef<AbortController | undefined>(undefined);
  const writing = useRef(false);
  const refreshPending = useRef(false);
  const readFresh = useCallback(async (signal?: AbortSignal): Promise<RailwaySnapshotV1> => {
    const value = await client.snapshot(projectId,signal);
    // The same existing project identity rule applies to activation reads as
    // to adopted snapshots; fresh-checking must not bypass the read boundary.
    if (value.projectId !== projectId || value.order.projectId !== projectId) throw new Error('目的地响应属于另一个项目。');
    return complete(value,signal);
  }, [client, complete, projectId]);
  const adopt = useCallback((value: RailwaySnapshotV1) => {
    if (value.projectId !== projectId || value.order.projectId !== projectId) throw new Error('目的地响应属于另一个项目。');
    current.current = value; usable.current = true; setSnapshot(value); setStatus('ready');
  }, [projectId]);
  const reload = useCallback(async (): Promise<RailwaySnapshotV1 | undefined> => {
    if (writing.current) { refreshPending.current = true; return undefined; }
    const serial = ++epoch.current;
    reading.current?.abort(); const controller = new AbortController(); reading.current = controller;
    try {
      const value = await readFresh(controller.signal);
      if (alive.current && serial === epoch.current) { const recovering = !usable.current; adopt(value); if (recovering) setNotice(undefined); return value; }
    } catch {
      if (alive.current && serial === epoch.current && !controller.signal.aborted) {
        usable.current = false; setStatus('error'); setNotice('导航读取失败，保留上次结果；重试后再更新。');
      }
    }
    return undefined;
  }, [adopt, readFresh]);
  useEffect(() => {
    alive.current = true; void reload();
    // epoch is a request counter, not a DOM ref; cleanup invalidates every read
    // issued by this mounted owner, including reads newer than the effect setup.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Intentionally invalidate the current request counter on owner cleanup.
    return () => { alive.current = false; ++epoch.current; reading.current?.abort(); clearTimeout(noticeTimer.current); };
  }, [reload]);
  const update = useCallback(async (change: (value: RailwaySnapshotV1) => readonly RailwayStoredRefV1[], message: string) => {
    if (writing.current || !usable.current || !current.current) return false;
    writing.current = true; clearTimeout(noticeTimer.current); reading.current?.abort(); ++epoch.current; setBusy(true); setNotice(undefined);
    try {
      const source = current.current;
      const refs = change(source);
      const result = await complete(await client.save(projectId, refs, source.order.version));
      if (alive.current) {
        adopt(result); setNotice(message);
        noticeTimer.current = setTimeout(() => { if (alive.current) setNotice((current) => current === message ? undefined : current); }, 4000);
      }
      return true;
    } catch (error) {
      if (alive.current) {
        usable.current = false;
        try { const fresh = await readFresh(); if (alive.current) adopt(fresh); }
        catch { if (alive.current) setStatus('error'); }
        if (alive.current) setNotice(`${error instanceof Error ? error.message : '更新未确认'}；请按当前顺序确认后操作，不会自动重发。`);
      }
      return false;
    } finally {
      writing.current = false;
      if (alive.current) { setBusy(false); if (refreshPending.current) { refreshPending.current = false; void reload(); } }
    }
  }, [adopt, client, complete, projectId, readFresh, reload]);
  return {snapshot,status,busy,notice,setNotice,reload,update,readFresh};
}
