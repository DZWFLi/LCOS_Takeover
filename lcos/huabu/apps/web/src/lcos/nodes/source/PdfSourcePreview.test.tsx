import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
vi.mock('@/components/Nodes/pdf/pdfWorker', () => ({ PDF_DOCUMENT_OPTIONS: {} }));
vi.mock('react-pdf', () => ({
  Document: ({ file, children, onLoadSuccess, onLoadError }: { file: string; children: ReactNode; onLoadSuccess: (value: { numPages: number }) => void; onLoadError: () => void }) =>
    <div data-pdf-source={file}><button onClick={() => onLoadSuccess({ numPages: 7 })}>metadata</button><button onClick={onLoadError}>fail</button>{children}</div>,
  Page: ({ pageNumber }: { pageNumber: number }) => <div data-pdf-page={pageNumber} />,
}));
import PdfSourcePreview from './PdfSourcePreview';
let host: HTMLDivElement; let root: Root;
beforeEach(() => { host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
it('passes real PDF bytes URL to the existing first-page renderer, gets actual page count and allows retry', async () => {
  await act(async () => root.render(<PdfSourcePreview family="document" title="研究.pdf" mediaSrc="blob:actual-pdf" density="reading" />));
  expect(host.querySelector('[data-pdf-source]')?.getAttribute('data-pdf-source')).toBe('blob:actual-pdf');
  expect(host.querySelector('[data-pdf-page]')?.getAttribute('data-pdf-page')).toBe('1');
  await act(async () => host.querySelector('button')!.click()); expect(host.textContent).toContain('7 页');
  await act(async () => host.querySelectorAll('button')[1]!.click()); expect(host.textContent).toContain('PDF 预览读取失败');
  await act(async () => host.querySelector('button')!.click()); expect(host.querySelector('[data-pdf-source]')).not.toBeNull();
});
