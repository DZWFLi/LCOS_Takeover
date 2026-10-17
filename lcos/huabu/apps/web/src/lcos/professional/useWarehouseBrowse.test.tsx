import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useWarehouseBrowse } from './useWarehouseBrowse';

import type { WarehouseItemV1, WarehouseSnapshotV1 } from '@local-creative-os/contracts';
import type { CoreAssemblyClient } from '@local-creative-os/web-gen2';

function page(ids: string[], nextCursor?: string): WarehouseSnapshotV1 {
  return { schemaVersion: 1, projectId: 'p', totalApprox: 60,
    items: ids.map((id) => ({ schemaVersion: 1, kind: 'collection', entityRef: { type: 'collection', id }, title: id, usageCount: 0 })),
    ...(nextCursor === undefined ? {} : { nextCursor }),
  };
}
let current: ReturnType<typeof useWarehouseBrowse>;
const host = document.createElement('div');
let root = createRoot(host);
function Probe({ client, search = '', projectId = 'p', kind }: { client: CoreAssemblyClient; search?: string; projectId?: string; kind?: WarehouseItemV1['kind'] }) {
  current = useWarehouseBrowse(client, projectId, search, kind);
  return <div>{current.items.map((item) => item.title).join(',')}</div>;
}
afterEach(async () => { await act(async () => root.unmount()); root = createRoot(host); });

async function render(queryWarehouse: ReturnType<typeof vi.fn>, search = '', projectId = 'p') {
  const client = { queryWarehouse } as unknown as CoreAssemblyClient;
  await act(async () => root.render(<Probe client={client} search={search} projectId={projectId} />));
  return client;
}
describe('canonical Warehouse browsing', () => {
  it('loads subsequent cursor pages and deduplicates the exact entity identity', async () => {
    const query = vi.fn().mockResolvedValueOnce(page(['first'], 'page-2')).mockResolvedValueOnce(page(['first', 'item-51']));
    await render(query);
    await act(async () => current.loadMore());
    expect(query.mock.calls[1]?.[1]).toEqual({ limit: 50, cursor: 'page-2' });
    expect(current.items.map((item) => item.title)).toEqual(['first', 'item-51']);
    expect(current.nextCursor).toBeUndefined();
  });
  it('sends the search to Core and starts from page one after a query change', async () => {
    const query = vi.fn().mockResolvedValueOnce(page(['old'], 'old-next')).mockResolvedValueOnce(page(['needle']));
    const client = await render(query);
    await act(async () => root.render(<Probe client={client} search=" needle " />));
    expect(query.mock.calls[1]?.[1]).toEqual({ limit: 50, search: 'needle' });
    expect(current.items.map((item) => item.title)).toEqual(['needle']);
  });
  it('keeps loaded pages on a next-page failure and retries the failed cursor', async () => {
    const query = vi.fn().mockResolvedValueOnce(page(['first'], 'next')).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(page(['second']));
    await render(query);
    await act(async () => current.loadMore());
    expect(current.state).toBe('error');
    expect(current.items).toHaveLength(1);
    await act(async () => current.retry());
    expect(query.mock.calls[2]?.[1]).toEqual({ limit: 50, cursor: 'next' });
    expect(current.state).toBe('ready');
    expect(current.items).toHaveLength(2);
  });
  it('aborts the old search and ignores a late response even when the producer ignores abort', async () => {
    let finish!: (value: WarehouseSnapshotV1) => void;
    const query = vi.fn().mockReturnValueOnce(new Promise<WarehouseSnapshotV1>((resolve) => { finish = resolve; })).mockResolvedValueOnce(page(['new']));
    const client = await render(query);
    await act(async () => root.render(<Probe client={client} search="new" />));
    expect((query.mock.calls[0]?.[2] as AbortSignal).aborted).toBe(true);
    await act(async () => finish(page(['stale'])));
    expect(current.items.map((item) => item.title)).toEqual(['new']);
  });
});

it('filters workflow on the server and clears cursor/items when kind changes, rejecting stale responses', async () => {
  let finish!: (value: WarehouseSnapshotV1) => void;
  const query = vi.fn().mockResolvedValueOnce(page(['old'], 'old-next'))
    .mockReturnValueOnce(new Promise<WarehouseSnapshotV1>(resolve => { finish = resolve; }))
    .mockResolvedValueOnce(page(['workflow'], 'wf-next')).mockResolvedValueOnce(page(['workflow-next']));
  const client = await render(query);
  await act(async () => current.loadMore());
  await act(async () => root.render(<Probe client={client} kind="workflow" search=" task " />));
  expect((query.mock.calls[1]?.[2] as AbortSignal).aborted).toBe(true);
  expect(query.mock.calls[2]?.[1]).toEqual({ limit: 50, kinds: ['workflow'], search: 'task' });
  await act(async () => finish(page(['stale'], 'stale-next')));
  expect(current.items.map(item => item.title)).toEqual(['workflow']);
  expect(current.nextCursor).toBe('wf-next');
  await act(async () => current.loadMore());
  expect(query.mock.calls[3]?.[1]).toEqual({ limit: 50, kinds: ['workflow'], search: 'task', cursor: 'wf-next' });
});
