import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ReaderMediaResultsView } from './ReaderMediaResultsView';
import { ReaderContentView } from './ReaderContentView';
import { VideoReaderContentView } from './VideoReaderContentView';
let host: HTMLDivElement; let root: Root;
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true); host=document.createElement('div'); document.body.append(host); root=createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
async function click(label: string) { await act(async () => host.querySelector<HTMLElement>(`[aria-label="${label}"]`)!.click()); }

it('moves one real action surface with image info and copies the exact pinned source', async () => {
  const writeText=vi.fn().mockResolvedValue(undefined); vi.stubGlobal('navigator',{ clipboard:{writeText} });
  const action=vi.fn();
  await act(async () => root.render(<ReaderContentView content={{kind:'image',url:'blob:old',mimeType:'image/png'}} kind="image" fileName="材料"
    textSource={{projectId:'p',artifactId:'image-a',revisionId:'revision-old',title:'材料'}} mediaActions={<button onClick={action}>原操作</button>} />));
  expect(host.querySelectorAll('button').length).toBeGreaterThan(0);
  await click('展开材料信息');
  const sidebar=host.querySelector('[data-lcos-reader-media-info]')!;
  expect(sidebar.textContent).toContain('原操作');
  await click('复制版本来源');
  expect(writeText).toHaveBeenCalledWith('artifact:image-a@revision-old');
  expect(sidebar.textContent).toContain('已复制');
  await act(async () => [...sidebar.querySelectorAll('button')].find(button => button.textContent==='原操作')!.click());
  expect(action).toHaveBeenCalledOnce();
  await click('收起材料信息');
  expect([...host.querySelectorAll('button')].filter(button => button.textContent==='原操作')).toHaveLength(1);
});

it('selects actual collection members, opens the selected member, and retires a removed selection', async () => {
  const openA=vi.fn(),openB=vi.fn();
  const a={id:'a',title:'图片 A',preview:<span>A 的实际预览</span>,onOpen:openA};
  const b={id:'b',title:'图片 B',preview:<span>B 的实际预览</span>,onOpen:openB};
  await act(async () => root.render(<ReaderMediaResultsView items={[a,b]} />));
  await click('查看 图片 B'); expect(host.querySelector('[data-lcos-media-result]')?.getAttribute('data-lcos-media-result')).toBe('b');
  await act(async () => [...host.querySelectorAll('button')].find(button => button.textContent==='打开阅读器')!.click());
  expect(openB).toHaveBeenCalledOnce(); expect(openA).not.toHaveBeenCalled();
  await click('图片网格视图'); await click('聚焦 图片 A');
  expect(host.querySelector('[data-lcos-media-result]')?.getAttribute('data-lcos-media-result')).toBe('a');
  await act(async () => root.render(<ReaderMediaResultsView items={[b]} />));
  expect(host.querySelector('[data-lcos-media-result]')?.getAttribute('data-lcos-media-result')).toBe('b');
});

it('video controls consume real native events, preserve the source and change native volume', async () => {
  await act(async () => root.render(<VideoReaderContentView src="blob:revision-old-video" title="视频" />));
  const video=host.querySelector('video')!;
  expect(host.querySelector<HTMLButtonElement>('[aria-label="播放视频"]')!.disabled).toBe(true);
  Object.defineProperty(video,'duration',{configurable:true,value:20});
  await act(async () => { video.dispatchEvent(new Event('loadedmetadata')); video.dispatchEvent(new Event('canplay')); video.dispatchEvent(new Event('play')); });
  expect(host.querySelector('[aria-label="暂停视频"]')).not.toBeNull();
  expect(host.querySelector('.lcos-video-time')?.textContent).toContain('00:20');
  await click('视频静音'); expect(video.muted).toBe(true);
  await act(async () => video.dispatchEvent(new Event('volumechange')));
  expect(host.querySelector('[aria-label="取消视频静音"]')).not.toBeNull();
  expect(video.getAttribute('src')).toBe('blob:revision-old-video');
  await act(async () => video.dispatchEvent(new Event('error')));
  expect(host.textContent).toContain('视频读取失败');
  expect(host.querySelector<HTMLButtonElement>('[aria-label="播放视频"]')!.disabled).toBe(true);
});
