import { CoreProjectClient, HttpClient } from '@local-creative-os/web-gen2';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

import { readerSourceLocator } from './readerLineage';
import { ReaderLineageActions } from './ReaderLineageActions';
import { useLcosShellStore } from '../shell/lcosShellStore';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const roots: ReturnType<typeof createRoot>[] = [];
afterEach(() => { roots.splice(0).forEach(root => act(() => root.unmount())); document.body.replaceChildren(); vi.restoreAllMocks(); });
async function fixture(anchor = 'pdf:p2', absentAtRead = 0) {
  useLcosShellStore.setState({ projectId: 'p' });
  useLcosShellStore.getState().openReader('当前摘取材料', 'derived', { revisionId: 'derived-old' });
  const sourceWindowId = useLcosShellStore.getState().windows.find(window => window.active)?.id;
  const open = vi.spyOn(useLcosShellStore.getState(), 'openReader').mockImplementation(() => undefined);
  let reads = 0;
  const fetcher = vi.fn<typeof fetch>(async () => {
    reads += 1;
    const graph = { project: { id: 'p' }, artifacts: [{ id: 'source-a', projectId: 'p', title: '真实原件', currentRevisionId: 'current' }],
      relations: [{ id: 'evidence-r', projectId: 'p', sourceEntityType: 'artifact', sourceEntityId: 'derived', targetEntityType: 'artifact', targetEntityId: 'source-a', kind: 'reference',
        evidenceRefs: [{ kind: 'artifact', id: 'source-a', revisionId: 'old', sourceAnchor: anchor }] }],
      artifactRevisions: absentAtRead && reads >= absentAtRead ? [] : [{ id: 'old', artifactId: 'source-a', fileRecordId: 'old-file' }], fileRecords: [{ id: 'old-file' }] };
    return new Response(JSON.stringify({ ok: true, value: graph }), { status: 200 });
  });
  const projects = new CoreProjectClient(new HttpClient({ baseUrl: 'http://127.0.0.1:0', fetch: fetcher }));
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host); roots.push(root);
  await act(async () => root.render(<ReaderLineageActions projects={projects} projectId="p" artifactId="derived" />));
  await vi.waitFor(async () => { await act(async () => { await Promise.resolve(); }); expect(host.querySelector('[data-lcos-reader-lineage-source]')).not.toBeNull(); });
  return { host, open, fetcher, sourceWindowId };
}
it('returns from an extracted PDF to the recorded source revision/page using the existing Reader owner', async () => {
  const { host, open, fetcher, sourceWindowId } = await fixture();
  await act(async () => host.querySelector<HTMLButtonElement>('[data-lcos-reader-lineage-source]')?.click());
  await vi.waitFor(() => expect(open).toHaveBeenCalledExactlyOnceWith('来源 · 真实原件', 'source-a', {
    revisionId: 'old', sourceLocator: { kind: 'page', pageNumber: 2, label: '第 2 页' }, returnToWindowId: sourceWindowId,
  }));
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it('returns a PPT extraction to the recorded old slide without following Current', async () => {
  const { host, open } = await fixture('pptx:s2');
  await act(async () => host.querySelector<HTMLButtonElement>('[data-lcos-reader-lineage-source]')?.click());
  await vi.waitFor(() => expect(open).toHaveBeenCalledWith('来源 · 真实原件', 'source-a', expect.objectContaining({
    revisionId: 'old', sourceLocator: { kind: 'slide', slideNumber: 2, label: '第 2 页' },
  })));
});
it('keeps the existing Reader when a historical source revision disappears before the click commits', async () => {
  const { host, open } = await fixture('pdf:p2', 2);
  await act(async () => host.querySelector<HTMLButtonElement>('[data-lcos-reader-lineage-source]')?.click());
  await vi.waitFor(() => expect(host.textContent).toContain('版本已缺失，未改用当前版本'));
  expect(open).not.toHaveBeenCalled();
});
it('does not advertise a missing historical address or reinterpret malformed page anchors', async () => {
  const { host, open } = await fixture('pdf:p2', 1);
  expect(host.querySelector<HTMLButtonElement>('[data-lcos-reader-lineage-source]')?.disabled).toBe(true); expect(open).not.toHaveBeenCalled();
  expect(readerSourceLocator('pdf:p0')).toBeUndefined();
  expect(readerSourceLocator('pptx:s9007199254740993')).toBeUndefined();
  expect(readerSourceLocator('text:l2-l5')).toEqual({ kind: 'lines', start: 1, end: 4, label: '第 2–5 行' });
  expect(readerSourceLocator('section:方法')).toEqual({ kind: 'selection', label: '方法' });
});
