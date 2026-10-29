import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { ImageSourceView } from './ImageSourceView';

let host: HTMLDivElement; let root: Root;
beforeEach(() => { host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
async function render(src?: string) {
  await act(async () => root.render(<ImageSourceView family="image" title="真实图片"
    density="reading" {...(src === undefined ? {} : { mediaSrc: src })} />));
}
it('preserves the full image, shows an actual load error, and retries the same source', async () => {
  await render('/portrait.png');
  const image = host.querySelector('img')!;
  expect(image.style.objectFit).toBe('contain');
  await act(async () => image.dispatchEvent(new Event('error')));
  expect(host.querySelector('[data-image-phase="error"]')).not.toBeNull();
  expect(host.textContent).toContain('预览读取失败');
  await act(async () => host.querySelector('button')!.click());
  const retried = host.querySelector('img')!;
  expect(retried).not.toBe(image);
  expect(retried.getAttribute('src')).toBe('/portrait.png');
  await act(async () => retried.dispatchEvent(new Event('load')));
  expect(host.querySelector('[data-image-phase="ready"]')).not.toBeNull();
  expect(host.querySelector('[data-image-phase="error"]')).toBeNull();
});
it('resets the previous error when the real media identity changes', async () => {
  await render('/old.png');
  await act(async () => host.querySelector('img')!.dispatchEvent(new Event('error')));
  await render('/new.png');
  expect(host.querySelector('img')?.getAttribute('src')).toBe('/new.png');
  expect(host.querySelector('[data-image-phase="loading"]')).not.toBeNull();
  expect(host.querySelector('[data-image-phase="error"]')).toBeNull();
});
it('has an honest unavailable state rather than a fabricated thumbnail', async () => {
  await render();
  expect(host.querySelector('img')).toBeNull();
  expect(host.textContent).toContain('暂无预览');
});
