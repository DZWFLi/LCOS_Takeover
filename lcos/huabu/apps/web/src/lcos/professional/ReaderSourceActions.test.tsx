import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

import { ReaderSourceActions } from './ReaderSourceActions';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const roots: ReturnType<typeof createRoot>[] = [];
afterEach(() => { roots.splice(0).forEach(root => act(() => root.unmount())); document.body.replaceChildren(); });
async function fixture(source = { path: 'E:/registered/original.pdf', exists: true, isUrl: false }) {
  const client = { artifactSourcePath: vi.fn(async () => source), openArtifactSource: vi.fn(async () => ({ opened: true, path: source.path })),
    revealArtifactSource: vi.fn(async () => ({ revealed: true, path: source.path })) };
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host); roots.push(root);
  await act(async () => root.render(<ReaderSourceActions client={client} artifactId="exact-artifact" />));
  return { host, client };
}
it('opens/reveals only the canonical registered source address while leaving Reader revision ownership untouched', async () => {
  const { host, client } = await fixture();
  await act(async () => host.querySelector<HTMLButtonElement>('[data-lcos-reader-open-original]')?.click());
  await act(async () => host.querySelector<HTMLButtonElement>('[data-lcos-reader-reveal-original]')?.click());
  expect(client.artifactSourcePath).toHaveBeenCalledWith('exact-artifact', expect.any(AbortSignal));
  expect(client.openArtifactSource).toHaveBeenCalledExactlyOnceWith('exact-artifact', expect.any(AbortSignal));
  expect(client.revealArtifactSource).toHaveBeenCalledExactlyOnceWith('exact-artifact', expect.any(AbortSignal));
  expect(host.textContent).toContain('已请求在文件夹中显示原文件');
});
it('keeps missing original files unavailable while the existing reading version remains intact', async () => {
  const { host, client } = await fixture({ path: 'E:/missing.pdf', exists: false, isUrl: false });
  expect(host.querySelector('[data-lcos-reader-open-original]')).toBeNull();
  expect(host.textContent).toContain('阅读版本保留'); expect(client.openArtifactSource).not.toHaveBeenCalled();
});
it('provides the real source URL instead of advertising a nonexistent local-file opener', async () => {
  const { host } = await fixture({ path: 'https://example.org/registered', exists: true, isUrl: true });
  expect(host.querySelector('[data-lcos-reader-open-url]')?.getAttribute('href')).toBe('https://example.org/registered');
  expect(host.querySelector('[data-lcos-reader-open-original]')).toBeNull();
});
it('resolves a material with no external file internally without exposing useless file controls', async () => {
  const { host, client } = await fixture({ path: '', exists: false, isUrl: false });
  expect(host.querySelector('[data-lcos-reader-original-source]')).toBeNull();
  expect(client.artifactSourcePath).toHaveBeenCalledWith('exact-artifact', expect.any(AbortSignal));
  expect(client.openArtifactSource).not.toHaveBeenCalled();
  expect(client.revealArtifactSource).not.toHaveBeenCalled();
});
