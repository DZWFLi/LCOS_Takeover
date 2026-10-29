import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

import { LCOS_MATERIAL_TRANSFER_MIME } from './donor/Gen1TextTransfer';
import { ReaderPptxView } from './ReaderPptxView';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const roots: ReturnType<typeof createRoot>[] = [];
afterEach(() => { roots.splice(0).forEach(root => act(() => root.unmount())); document.body.replaceChildren(); });
async function fixture(exact = true) {
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host); roots.push(root);
  const content = { kind: 'pptx', slides: ['<svg><text>First historical page</text></svg>', '<svg><text>Second historical page</text></svg>'], value: 'historical pages', mimeType: 'pptx', viewKey: `old-${exact}` } as const;
  const ready = vi.fn();
  await act(async () => root.render(<ReaderPptxView content={content} fileName="history.pptx" onContentReady={ready}
    source={exact ? { projectId: 'p', artifactId: 'a', revisionId: 'old', fileRecordId: 'old-file', title: 'history.pptx' } : { title: 'unbound' }} />));
  return { host, content, ready };
}
it('renders pages and switches the actual page using thumbnails and the keyboard', async () => {
  const { host, content, ready } = await fixture();
  expect(host.querySelector('[data-lcos-pptx-current-page]')?.textContent).toContain('First historical page');
  await act(async () => host.querySelector<HTMLButtonElement>('[data-lcos-pptx-slide="2"]')?.click());
  expect(host.querySelector('[data-lcos-pptx-current-page]')?.textContent).toContain('Second historical page');
  await act(async () => host.querySelector('nav button')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })));
  expect(host.querySelector('[data-lcos-pptx-current-page]')?.getAttribute('data-lcos-pptx-current-page')).toBe('1');
  expect(ready).toHaveBeenCalledExactlyOnceWith(content);
});
it('drags a page using Gen1 MIME with exact historical revision, FileRecord, slide locator and real SVG', async () => {
  const { host, content } = await fixture(); const setData = vi.fn();
  const event = new Event('dragstart', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: { setData, effectAllowed: 'none' } });
  await act(async () => host.querySelector('[data-lcos-pptx-slide="2"]')?.dispatchEvent(event));
  const serialized = setData.mock.calls.find(call => call[0] === LCOS_MATERIAL_TRANSFER_MIME)?.[1];
  expect(JSON.parse(serialized)).toMatchObject({ kind: 'material-transfer', source: { artifactId: 'a', revisionId: 'old', fileRecordId: 'old-file', locator: { kind: 'slide', slideNumber: 2 } }, content: { kind: 'presentation-slide', slideNumber: 2, svg: content.slides[1] } });
});
it('never advertises page extraction without exact owner supplied source identity', async () => {
  const { host } = await fixture(false);
  expect([...host.querySelectorAll('[data-lcos-pptx-slide]')].every(element => element.getAttribute('draggable') === 'false')).toBe(true);
});
it('updates the requested source slide in the same Reader and refuses an out-of-range historical anchor', async () => {
  const { host, content } = await fixture(); const root = roots[roots.length - 1];
  await act(async () => root.render(<ReaderPptxView content={content} fileName="history.pptx"
    source={{ title: 'history.pptx', locator: { kind: 'slide', slideNumber: 2 } }} />));
  expect(host.querySelector('[data-lcos-pptx-current-page]')?.getAttribute('data-lcos-pptx-current-page')).toBe('2');
  await act(async () => root.render(<ReaderPptxView content={content} fileName="history.pptx"
    source={{ title: 'history.pptx', locator: { kind: 'slide', slideNumber: 99 } }} />));
  expect(host.textContent).toContain('第 99 页不在此版本中'); expect(host.querySelector('[data-lcos-pptx-current-page]')).toBeNull();
});
