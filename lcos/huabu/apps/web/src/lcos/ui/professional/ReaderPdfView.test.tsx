import { act, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

import { LCOS_MATERIAL_TRANSFER_MIME } from './donor/Gen1TextTransfer';
import { pdfPageTransfer } from './readerPdfMaterial';
import { ReaderPdfView } from './ReaderPdfView';

import type { ReactNode } from 'react';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const mocks = vi.hoisted(() => ({ file: vi.fn(), snapshot: true, text: true, failure: false }));
vi.mock('@/components/Nodes/pdf/pdfWorker', () => ({ PDF_DOCUMENT_OPTIONS: { verbosity: 0 } }));
vi.mock('react-pdf', () => ({
  pdfjs: { GlobalWorkerOptions: {}, VerbosityLevel: { ERRORS: 0 } },
  Document: ({ file, children, onLoadSuccess, onLoadError }: { file: string; children: ReactNode; onLoadSuccess: (value: { numPages: number }) => void; onLoadError: (error: Error) => void }) => {
    const callbacks = useRef({ onLoadSuccess, onLoadError }); callbacks.current = { onLoadSuccess, onLoadError };
    useEffect(() => { mocks.file(file); if (mocks.failure) callbacks.current.onLoadError(new Error('broken historic PDF')); else callbacks.current.onLoadSuccess({ numPages: 2 }); }, [file]);
    return <div>{children}</div>;
  },
  Page: ({ pageNumber, width, renderTextLayer, onLoadSuccess, onRenderSuccess }: { pageNumber: number; width: number; renderTextLayer: boolean;
    onLoadSuccess: (page: { pageNumber: number; getTextContent: () => Promise<{ items: { str: string; hasEOL: boolean }[] }> }) => void; onRenderSuccess: () => void }) => {
    const callbacks = useRef({ onLoadSuccess, onRenderSuccess }); callbacks.current = { onLoadSuccess, onRenderSuccess };
    useEffect(() => { callbacks.current.onLoadSuccess({ pageNumber, getTextContent: async () => ({ items: mocks.text ? [{ str: `Historical PDF page ${pageNumber}`, hasEOL: true }] : [] }) }); callbacks.current.onRenderSuccess(); }, [pageNumber, width]);
    return <div><canvas data-test-pdf-canvas={pageNumber} width={width} height={150} />{renderTextLayer && <span>Historical PDF page {pageNumber}</span>}</div>;
  },
}));
const roots: ReturnType<typeof createRoot>[] = [];
afterEach(() => { roots.splice(0).forEach(root => act(() => root.unmount())); document.body.replaceChildren(); vi.restoreAllMocks(); mocks.snapshot = true; mocks.text = true; mocks.failure = false; });
async function fixture(exact = true) {
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(function (this: HTMLCanvasElement) {
    if (!mocks.snapshot) throw new Error('canvas not readable');
    return `data:image/png;base64,${btoa(this.getAttribute('data-test-pdf-canvas') ?? 'page')}`;
  });
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host); roots.push(root); const ready = vi.fn(), retry = vi.fn();
  const content = { kind: 'pdf', url: 'blob:exact-old-pdf', mimeType: 'application/pdf', viewKey: `old-${exact}` } as const;
  await act(async () => root.render(<ReaderPdfView content={content}
    fileName="historical.pdf" onContentReady={ready} onRetry={retry} source={exact ? { projectId: 'p', artifactId: 'a', revisionId: 'old', fileRecordId: 'old-file', title: 'historical.pdf' } : { title: 'unbound' }} />));
  return { host, ready, retry, root, content };
}
function drag(host: HTMLElement, page: number) {
  const setData = vi.fn(); const event = new Event('dragstart', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: { setData, effectAllowed: 'none' } });
  act(() => host.querySelector(`[data-lcos-pdf-page="${page}"]`)?.dispatchEvent(event));
  const serialized = setData.mock.calls.find(call => call[0] === LCOS_MATERIAL_TRANSFER_MIME)?.[1];
  return { event, payload: serialized ? JSON.parse(serialized) : undefined };
}
it('reuses the supplied exact Blob URL, renders page thumbnails and changes the current page', async () => {
  const { host, ready } = await fixture();
  expect(mocks.file).toHaveBeenCalledWith('blob:exact-old-pdf');
  expect(host.querySelectorAll('[data-lcos-pdf-page]')).toHaveLength(2);
  await act(async () => host.querySelector<HTMLButtonElement>('[data-lcos-pdf-page="2"]')?.click());
  expect(host.querySelector('[data-lcos-pdf-current-page]')?.textContent).toContain('Historical PDF page 2');
  expect(ready).toHaveBeenCalled();
});
it('extracts a rendered PDF page with actual renderer snapshot/text and the exact historical source/page locator', async () => {
  const { host } = await fixture(); const { payload } = drag(host, 2);
  expect(payload).toMatchObject({ source: { artifactId: 'a', revisionId: 'old', fileRecordId: 'old-file', locator: { kind: 'page', pageNumber: 2 } },
    content: { kind: 'document-page', pageNumber: 2, previewDataUrl: `data:image/png;base64,${btoa('2')}`, text: 'Historical PDF page 2' } });
});
it('uses only extracted real page text when canvas capture fails', async () => {
  const { host } = await fixture(); mocks.snapshot = false; const { payload } = drag(host, 2);
  expect(payload.content).toMatchObject({ kind: 'document-page', pageNumber: 2, text: 'Historical PDF page 2' });
  expect(payload.content).not.toHaveProperty('previewDataUrl');
});
it('never creates a fake empty-page payload or advertises extraction without exact source', async () => {
  mocks.text = false; mocks.snapshot = false; const { host } = await fixture(); const { payload, event } = drag(host, 2);
  expect(payload).toBeUndefined(); expect(event.defaultPrevented).toBe(true); expect(host.textContent).toContain('未摘取空白材料');
  expect(pdfPageTransfer({ title: 'unknown' }, 1, 'data:image/png;base64,valid')).toBeUndefined();
});
it('reports real PDF failure and retries the same owner version', async () => {
  mocks.failure = true; const { host, retry } = await fixture(); expect(host.textContent).toContain('broken historic PDF');
  await act(async () => [...host.querySelectorAll('button')].find(button => button.textContent === '重读同一版本')?.click());
  expect(retry).toHaveBeenCalledOnce();
});
it('updates a page anchor in the same Reader and refuses an unavailable historical page', async () => {
  const { host, root, content } = await fixture();
  await act(async () => root.render(<ReaderPdfView content={content} fileName="historical.pdf" source={{ title: 'historical.pdf', locator: { kind: 'page', pageNumber: 2 } }} />));
  expect(host.querySelector('[data-lcos-pdf-current-page]')?.getAttribute('data-lcos-pdf-current-page')).toBe('2');
  await act(async () => root.render(<ReaderPdfView content={content} fileName="historical.pdf" source={{ title: 'historical.pdf', locator: { kind: 'page', pageNumber: 99 } }} />));
  expect(host.textContent).toContain('第 99 页不在此版本中'); expect(host.querySelector('[data-lcos-pdf-current-page]')).toBeNull();
});
