import { useCallback, useEffect, useRef, useState } from 'react';

import type { WarehouseItemV1 } from '@local-creative-os/contracts';
import type { CoreAssemblyClient } from '@local-creative-os/web-gen2';

/** A read-only view of canonical Warehouse pages; no membership or duplicate store. */
export function useWarehouseBrowse(client: CoreAssemblyClient, projectId: string, search: string, kind?: WarehouseItemV1['kind']) {
  const [items, setItems] = useState<readonly WarehouseItemV1[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string>();
  const [nextCursor, setNextCursor] = useState<string>();
  const pending = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const failedCursor = useRef<string | undefined>(undefined);
  const busy = useRef(false);
  const normalizedSearch = search.trim();

  const readPage = useCallback((cursor?: string) => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    const request = ++sequence.current;
    busy.current = true;
    failedCursor.current = cursor;
    setState('loading');
    setError(undefined);
    if (cursor === undefined) {
      setItems([]);
      setNextCursor(undefined);
    }
    void client.queryWarehouse(projectId, {
      limit: 50,
      ...(kind === undefined ? {} : { kinds: [kind] }),
      ...(normalizedSearch ? { search: normalizedSearch } : {}),
      ...(cursor === undefined ? {} : { cursor }),
    }, controller.signal).then((snapshot) => {
      if (controller.signal.aborted || request !== sequence.current) return;
      setItems((previous) => {
        const unique = new Map<string, WarehouseItemV1>();
        for (const item of [...(cursor === undefined ? [] : previous), ...snapshot.items]) {
          unique.set(`${item.entityRef.type}:${item.entityRef.id}`, item);
        }
        return [...unique.values()];
      });
      setNextCursor(snapshot.nextCursor);
      setState('ready');
    }).catch((cause: unknown) => {
      if (controller.signal.aborted || request !== sequence.current) return;
      setError(cause instanceof Error ? cause.message : String(cause));
      setState('error');
    }).finally(() => {
      if (request === sequence.current) busy.current = false;
    });
  }, [client, projectId, normalizedSearch, kind]);

  useEffect(() => {
    readPage();
    return () => {
      pending.current?.abort();
      sequence.current += 1;
      busy.current = false;
    };
  }, [readPage]);

  return {
    items, state, error, nextCursor,
    loadMore: () => { if (!busy.current && nextCursor !== undefined) readPage(nextCursor); },
    retry: () => { if (!busy.current) readPage(failedCursor.current); },
  };
}
