import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { AudioSourceMorphology, sampleAudioPeaks } from './AudioSourceMorphology';
import { VideoSourceMorphology } from './VideoSourceMorphology';
import { WebSourceMorphology } from './WebSourceMorphology';
const { webPreview } = vi.hoisted(() => ({ webPreview: vi.fn() }));
vi.mock('@/api/web', () => ({ getWebPreview: webPreview }));
vi.mock('@/store/canvasStore', () => ({ default: (selector: (state: unknown) => unknown) => selector({ canvasId: 'canvas-real', ingestionByNodeId: {} }) }));
vi.mock('@/components/Nodes/shared/nodeHydrationScheduler', () => ({ useDeferredHydration: () => true }));
let host: HTMLDivElement; let root: Root;
beforeEach(() => { webPreview.mockReset(); host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });
it('keeps an older carrier as a registered link without calling a nonexistent native web preview port', async () => {
  await act(async () => root.render(<WebSourceMorphology nodeId="old-link-carrier" family="web" title="原链接" mediaSrc="https://example.org/source"
    webPreviewAvailable={false} density="reading" />));
  expect(webPreview).not.toHaveBeenCalled();
  expect(host.querySelector('a')?.getAttribute('href')).toBe('https://example.org/source');
  expect(host.textContent).toContain('链接已保存');
  expect(host.querySelector('[role="status"]')).toBeNull();
});
it('derives audio bars from actual sample amplitudes, never seeded placeholder heights', () => {
  expect(sampleAudioPeaks(new Float32Array([0, .5, -1, .25]), 2)).toEqual([.5, 1]);
  expect(sampleAudioPeaks(new Float32Array(4), 2)).toEqual([0, 0]);
  expect(sampleAudioPeaks(new Float32Array())).toEqual([]);
});
it('audio uses native play/time metadata/seek and surfaces error with retry', async () => {
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
  await act(async () => root.render(<AudioSourceMorphology family="audio" title="采访" mediaSrc="blob:real-audio" density="working" />));
  const audio = host.querySelector('audio')!;
  const slider = host.querySelector('input')!;
  expect(slider.disabled).toBe(true);
  expect(host.querySelector('[data-lcos-waveform]')).toBeNull();
  await act(async () => host.querySelector('button')!.click()); expect(play).toHaveBeenCalledOnce();
  Object.defineProperty(audio, 'duration', { configurable: true, value: 120 });
  await act(async () => audio.dispatchEvent(new Event('loadedmetadata', { bubbles: true })));
  expect(slider.disabled).toBe(false); expect(slider.max).toBe('120');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(slider, '30');
    slider.dispatchEvent(new Event('input', { bubbles: true })); slider.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(audio.currentTime).toBe(30);
  await act(async () => audio.dispatchEvent(new Event('error')));
  expect(host.textContent).toContain('音频读取失败');
  await act(async () => Array.from(host.querySelectorAll('button')).find((button) => button.textContent === '重试')!.click());
  expect(load).toHaveBeenCalledOnce();
});
it('video keeps the real URL/native controls, retries failed source and isolates player gestures', async () => {
  const parentDoubleClick = vi.fn();
  const render = (src: string) => root.render(<div onDoubleClick={parentDoubleClick}><VideoSourceMorphology family="video" title="素材" mediaSrc={src} density="working" /></div>);
  await act(async () => render('blob:real-video'));
  const video = host.querySelector('video')!;
  expect(video.getAttribute('src')).toBe('blob:real-video'); expect(video.controls).toBe(true);
  await act(async () => video.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))); expect(parentDoubleClick).not.toHaveBeenCalled();
  await act(async () => video.dispatchEvent(new Event('error'))); expect(host.textContent).toContain('视频读取失败');
  await act(async () => host.querySelector('button')!.click()); expect(host.querySelector('video')).not.toBeNull();
  await act(async () => host.querySelector('video')!.dispatchEvent(new Event('error')));
  await act(async () => render('blob:next-video')); expect(host.querySelector('video')!.getAttribute('src')).toBe('blob:next-video');
});
it('web requests exact node metadata, shows actual image/link, retries failures and never renders a live iframe', async () => {
  webPreview.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ url: 'https://example.org/source', label: '实际标题', image: 'https://example.org/cover.png', summary: '实际摘要', siteName: '实际站点' });
  await act(async () => root.render(<WebSourceMorphology nodeId="web-real" family="web" title="原标题" mediaSrc="https://example.org/source" density="reading" />));
  expect(webPreview).toHaveBeenCalledWith({ canvasId: 'canvas-real', nodeId: 'web-real' });
  expect(host.textContent).toContain('网页预览读取失败');
  await act(async () => host.querySelector('button')!.click());
  expect(host.textContent).toContain('实际标题'); expect(host.textContent).toContain('实际摘要');
  expect(host.querySelector('img')!.getAttribute('src')).toBe('https://example.org/cover.png');
  expect(host.querySelector('a')!.href).toBe('https://example.org/source'); expect(host.querySelector('iframe')).toBeNull();
});
it('far LOD does not create video decoder or request web preview', async () => {
  await act(async () => root.render(<><VideoSourceMorphology family="video" title="视频" mediaSrc="blob:video" density="mark" /><WebSourceMorphology nodeId="web-real" family="web" title="网页" mediaSrc="https://example.org" density="mark" /></>));
  expect(host.querySelector('video')).toBeNull(); expect(webPreview).not.toHaveBeenCalled();
});

it('decodes visible summary audio once and reuses real samples across density changes', async () => {
  const decode = vi.fn().mockResolvedValue({ getChannelData: () => new Float32Array([0, .2, -.8, .4]) });
  const close = vi.fn().mockResolvedValue(undefined);
  const fetchAudio = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(new Uint8Array([1, 2, 3])));
  vi.stubGlobal('AudioContext', class { state = 'running'; decodeAudioData = decode; close = close; });
  const render = (density: 'summary' | 'working' | 'reading' | 'mark') => root.render(
    <AudioSourceMorphology family="audio" title="真实录音" mediaSrc="/recording.wav" density={density} />);
  try {
    await act(async () => render('mark'));
    expect(fetchAudio).not.toHaveBeenCalled();
    expect(host.querySelector('.lcos-audio-wave')).toBeNull();
    await act(async () => render('summary'));
    expect(fetchAudio).toHaveBeenCalledOnce();
    expect(decode).toHaveBeenCalledOnce();
    expect(host.querySelectorAll('[data-lcos-wave-bar]')).toHaveLength(64);
    const first = host.querySelector('.lcos-audio-wave')!.innerHTML;
    const audio = host.querySelector('audio');
    await act(async () => render('working'));
    await act(async () => render('summary'));
    expect(host.querySelector('.lcos-audio-wave')!.innerHTML).toBe(first);
    expect(host.querySelector('audio')).toBe(audio);
    expect(fetchAudio).toHaveBeenCalledOnce();
    expect(decode).toHaveBeenCalledOnce();
  } finally { vi.unstubAllGlobals(); }
});
