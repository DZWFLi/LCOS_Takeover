import { HttpClient } from '@local-creative-os/web-gen2';
import { expect, it, vi } from 'vitest';

import { canvasExternalUrl, saveProjectUrl, singleHttpUrl } from './projectUrlImport';
import { navigationGraph } from '../navigation/navigationFixtures';

const placement = { projectId: 'p', canvasId: 'main', workspaceId: 'w', url: 'https://example.com', position: { x: 24, y: 48 } };
const saved = { resourceId: 'r', artifactId: 'a', revisionId: 'rev', viewId: 'view', sourceKind: 'link', understandingStatus: 'pending' };
const graph = navigationGraph({ scopes: [{ id: 'root', kind: 'root' }], workspaces: [{ id: 'w', projectId: 'p', canvasId: 'main', scopeId: 'root' }] });
function session(reply: typeof saved = saved, membershipFails = false) {
  const requests: { url: string; method: string; body?: unknown }[] = [];
  const fetcher: typeof fetch = vi.fn(async (url, init) => {
    requests.push({ url: String(url), method: init?.method ?? 'GET', ...(init?.body ? { body: JSON.parse(String(init.body)) as unknown } : {}) });
    const value = String(url).endsWith('/graph') ? graph : reply;
    return new Response(JSON.stringify(membershipFails && String(url).endsWith('/members')
      ? { ok: false, error: { code: 'CONFLICT', message: '原现场已移除' } } : { ok: true, value }), { status: 200 });
  });
  return { http: new HttpClient({ baseUrl: 'http://core', fetch: fetcher }), requests };
}
function transfer(data: Record<string, string>, files: File[] = [], items: Pick<DataTransferItem, 'kind'>[] = []) {
  return { types: Object.keys(data), files, items, getData: (kind: string) => data[kind] ?? '' } as unknown as DataTransfer;
}
it('captures exactly one external URL without converting prose, native transfers or file imports', () => {
  expect(singleHttpUrl(' https://example.com/a?q=1 ')).toBe('https://example.com/a?q=1');
  expect(singleHttpUrl('文档在 https://example.com')).toBeUndefined();
  expect(singleHttpUrl('file:///secret')).toBeUndefined();
  expect(canvasExternalUrl(transfer({ 'text/uri-list': '# source\nhttps://example.com/a', 'text/plain': 'title' }))).toBe('https://example.com/a');
  expect(canvasExternalUrl(transfer({ 'text/uri-list': 'https://example.com/a\nhttps://example.com/b' }))).toBeUndefined();
  expect(canvasExternalUrl(transfer({ 'application/x-huabu-dnd': '{}', 'text/plain': placement.url }))).toBeUndefined();
  expect(canvasExternalUrl(transfer({ 'application/x-lcos-material-transfer': '{}', 'text/plain': placement.url }))).toBeUndefined();
  expect(canvasExternalUrl(transfer({ 'text/plain': placement.url }, [new File(['x'], 'source.txt')]))).toBeUndefined();
  expect(canvasExternalUrl(transfer({ 'text/plain': placement.url }, [], [{ kind: 'file' }]))).toBeUndefined();
});
it('uses the existing URL and import-membership producers with the actual workspace scope', async () => {
  const client = session();
  expect(await saveProjectUrl(client, placement)).toEqual({ saved, workspaceMember: true });
  expect(client.requests).toEqual([
    { url: 'http://core/projects/p/graph', method: 'GET' },
    { url: 'http://core/projects/p/resources/import-url', method: 'POST', body: { url: 'https://example.com/', scopeId: 'root', x: 24, y: 48 } },
    { url: 'http://core/workspaces/w/members', method: 'POST', body: { viewIds: ['view'], addedBy: 'import' } },
  ]);
});
it('repeated URLs retain Core URL identity without minting request IDs or text-artifact calls', async () => {
  const client = session(); await saveProjectUrl(client, placement); await saveProjectUrl(client, placement);
  const posts = client.requests.filter(item => item.url.endsWith('import-url'));
  expect(posts).toHaveLength(2); expect(posts[0]?.body).toEqual(posts[1]?.body);
  expect(client.requests.some(item => item.url.includes('text-artifact'))).toBe(false);
});
it('refuses a stale/missing destination before any producer writes', async () => {
  const client = session();
  await expect(saveProjectUrl(client, { ...placement, canvasId: 'wrong' })).rejects.toThrow('当前现场身份');
  await expect(saveProjectUrl(client, placement, { isCurrent: () => false })).rejects.toThrow('现场已变化');
  expect(client.requests.every(item => item.method === 'GET')).toBe(true);
});
it('reports saved identity separately from a failed workspace-membership confirmation', async () => {
  const client = session(saved, true);
  expect(await saveProjectUrl(client, placement)).toEqual({ saved, workspaceMember: false, membershipError: '原现场已移除' });
  expect(client.requests.filter(item => item.url.endsWith('import-url'))).toHaveLength(1);
});
it('never accepts a plain text producer reply as URL material', async () => {
  const client = session({ ...saved, sourceKind: 'file_copy' });
  await expect(saveProjectUrl(client, placement)).rejects.toThrow('回执尚未确认');
  expect(client.requests.some(item => item.url.endsWith('/members'))).toBe(false);
});
