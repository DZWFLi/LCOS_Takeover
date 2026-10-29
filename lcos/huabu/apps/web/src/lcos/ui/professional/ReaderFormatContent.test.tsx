import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

import { ReaderFormatContentView } from './ReaderFormatContent';

import type { ReaderFormatContent } from '../../professional/readerFormats';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@/components/Milkdown', () => ({ MilkdownPreview: ({ markdown, onRendered }: { markdown: string; onRendered?: () => void }) => {
  useEffect(() => onRendered?.(), [markdown, onRendered]);
  return <div data-office-markdown>{markdown}</div>;
} }));
const roots: ReturnType<typeof createRoot>[] = [];
afterEach(() => { for (const root of roots.splice(0)) act(() => root.unmount()); document.body.replaceChildren(); });
async function mount(content: Exclude<ReaderFormatContent, { readonly kind: 'pptx' }>) {
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host); roots.push(root); const ready = vi.fn();
  await act(async () => root.render(<ReaderFormatContentView content={content} fileName="Historical file" onContentReady={ready} />));
  return { host, root, ready };
}
it('renders the exact HTML in an isolated interactive preview and exposes its original source', async () => {
  const value = '<button onclick="this.textContent=\'Done\'">Historical button</button>';
  const content = { kind: 'html', value, mimeType: 'text/html', viewKey: 'old' } as const;
  const { host, ready } = await mount(content);
  const frame = host.querySelector<HTMLIFrameElement>('iframe');
  expect(frame?.getAttribute('srcdoc')).toBe(value);
  expect(frame?.getAttribute('sandbox')).toContain('allow-scripts');
  expect(frame?.getAttribute('sandbox')).not.toContain('allow-same-origin');
  await act(async () => frame?.dispatchEvent(new Event('load')));
  expect(ready).toHaveBeenCalledExactlyOnceWith(content);
  await act(async () => [...host.querySelectorAll('button')].find(button => button.textContent === 'HTML 源码')?.click());
  expect(host.querySelector('iframe')).toBeNull();
  expect(host.querySelector('[data-lcos-reader-html-source]')?.textContent).toBe(value);
  expect(host.querySelector('[data-lcos-reader-html-source] button')).toBeNull();
});
it('renders real extracted Office content through the existing read-only Markdown renderer', async () => {
  const content = { kind: 'office', format: 'xlsx', value: '| History | Count |\n| --- | --- |\n| Old | 42 |', mimeType: 'office', viewKey: 'old' } as const;
  const { host, ready } = await mount(content);
  expect(host.querySelector('[data-office-markdown]')?.textContent).toBe(content.value);
  expect(host.textContent).toContain('XLSX · 只读内容预览');
  expect(ready).toHaveBeenCalledExactlyOnceWith(content);
});
it('resets the HTML source/preview state when the Reader changes exact revision identity', async () => {
  const { host, root } = await mount({ kind: 'html', value: '<p>Old</p>', mimeType: 'text/html', viewKey: 'old' });
  await act(async () => [...host.querySelectorAll('button')].find(button => button.textContent === 'HTML 源码')?.click());
  await act(async () => root.render(<ReaderFormatContentView fileName="Historical file" content={{ kind: 'html', value: '<p>New revision</p>', mimeType: 'text/html', viewKey: 'new' }} />));
  expect(host.querySelector('iframe')?.getAttribute('srcdoc')).toBe('<p>New revision</p>');
  expect(host.querySelector('[data-lcos-reader-html-source]')).toBeNull();
});
