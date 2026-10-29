import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { ReaderContentView } from './ReaderContentView';

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

async function mountImage() {
  await act(async () => root.render(<ReaderContentView
    content={{ kind: 'image', url: 'blob:pinned-image-old', mimeType: 'image/png', viewKey: 'old-image' }}
    fileName="真实参考图" kind="image"
    textSource={{ projectId: 'project-a', artifactId: 'image-a', revisionId: 'revision-old', title: '真实参考图' }} />));
}
async function openInfo() {
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="展开材料信息"]')?.click());
}

it('shows the image first and expands real source fields without fetching a second image', async () => {
  await mountImage();
  expect(host.querySelector('[data-lcos-reader-media-info]')).toBeNull();
  const image = host.querySelector('img');
  await openInfo();
  const info = host.querySelector('[data-lcos-reader-media-info]');
  expect(info?.textContent).toContain('真实参考图');
  expect(info?.textContent).toContain('image/png');
  expect(info?.querySelector('[title="revision-old"]')).not.toBeNull();
  expect(host.querySelector('img')).toBe(image);
  expect(image?.getAttribute('src')).toBe('blob:pinned-image-old');
});

it('reports decoded image dimensions, keeping unknown dimensions and generation parameters absent', async () => {
  await mountImage(); await openInfo();
  expect(host.querySelector('[data-lcos-reader-media-info]')?.textContent).not.toContain('尺寸');
  const image = host.querySelector('img')!;
  Object.defineProperty(image, 'naturalWidth', { configurable: true, value: 400 });
  Object.defineProperty(image, 'naturalHeight', { configurable: true, value: 218 });
  await act(async () => image.dispatchEvent(new Event('load', { bubbles: true })));
  expect(host.querySelector('[data-lcos-reader-media-info]')?.textContent).toContain('400 × 218 px');
  expect(host.querySelector('[data-lcos-reader-media-info]')?.textContent).not.toMatch(/模型|生成进度|提示词/);
});

it('closing only the sidebar keeps the exact image and existing viewport', async () => {
  await mountImage(); await openInfo();
  const image = host.querySelector('img');
  const viewport = host.querySelector('[data-lcos-reader-content="image"]');
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="收起材料信息"]')?.click());
  expect(host.querySelector('[data-lcos-reader-media-info]')).toBeNull();
  expect(host.querySelector('img')).toBe(image);
  expect(host.querySelector('[data-lcos-reader-content="image"]')).toBe(viewport);
});
