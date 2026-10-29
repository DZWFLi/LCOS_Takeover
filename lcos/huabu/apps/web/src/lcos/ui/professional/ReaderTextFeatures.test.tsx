import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LCOS_MATERIAL_TRANSFER_MIME } from './donor/Gen1TextTransfer';
import { ReaderContentView } from './ReaderContentView';
import { readerTextRanges, readerTextSelection } from './readerTextRanges';

let host: HTMLDivElement;
let root: Root;
const source = { projectId: 'project-1', artifactId: 'article-1', revisionId: 'historical-7', fileRecordId: 'file-old-7', title: '真实旧版材料' };
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  window.getSelection()?.removeAllRanges(); host.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks();
});
const reader = (body: ReactNode, id = 'reader-old') => <ReaderContentView
  content={{ kind: 'text', value: '读取的是旧版字节', viewKey: id }} kind="markdown" fileName="材料"
  textSource={source} renderedText={body} />;
const select = (node: Node) => {
  const range = document.createRange(); range.selectNodeContents(node);
  const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range);
};
const input = async (field: HTMLInputElement, value: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

describe('GEN1 Reader text feature adoption', () => {
  it('finds literal text through inline formatting without mutating the shared DOM or joining separate paragraphs', async () => {
    await act(async () => root.render(reader(<><p>LC<strong>OS</strong> 的 LCOS</p><p>下一段</p></>)));
    const documentRoot = host.querySelector<HTMLElement>('.lcos-reader-measure')!;
    const before = documentRoot.innerHTML;
    const ranges = readerTextRanges(documentRoot, 'lcos');
    expect(ranges.map(range => range.toString())).toEqual(['LCOS', 'LCOS']);
    expect(readerTextRanges(documentRoot, 'LCOS下一段')).toEqual([]);
    expect(documentRoot.innerHTML).toBe(before);
  });

  it('keeps local search counts and heading jumps separate in two simultaneous Readers', async () => {
    await act(async () => root.render(<>{reader(<><h2 id="same">第一份</h2><p>LC<strong>OS</strong> 和 LCOS</p></>, 'one')}
      {reader(<><h2 id="same">第二份</h2><p>另一份正文</p></>, 'two')}</>));
    const fields = host.querySelectorAll<HTMLInputElement>('input[aria-label="在文档中查找"]');
    await input(fields[0]!, 'lcos');
    expect(host.querySelector('[data-lcos-reader-match-count]')?.textContent).toBe('1/2');
    expect(fields[1]?.value).toBe('');
    const headings = host.querySelectorAll<HTMLElement>('h2');
    const firstScroll = vi.fn(); const secondScroll = vi.fn();
    headings[0]!.scrollIntoView = firstScroll; headings[1]!.scrollIntoView = secondScroll;
    const secondToggle = host.querySelectorAll<HTMLButtonElement>('button[aria-label="文档目录"]')[1]!;
    await act(async () => secondToggle.click());
    const chapter = host.querySelector<HTMLButtonElement>('nav[aria-label="文档目录"] button')!;
    await act(async () => chapter.click());
    expect(firstScroll).not.toHaveBeenCalled();
    expect(secondScroll).toHaveBeenCalledWith({ block: 'start', behavior: 'smooth' });
  });

  it('owns Ctrl+F while focus is inside its document instead of opening global project search', async () => {
    await act(async () => root.render(reader(<p>正文</p>)));
    const viewport = host.querySelector<HTMLElement>('[data-lcos-reader-content="text"]')!;
    const event = new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true, cancelable: true });
    await act(async () => viewport.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(host.querySelector('input'));
  });

  it('copies selected text with the exact historical source and nearest heading using the GEN1 MIME', async () => {
    await act(async () => root.render(reader(<><h2>上一章</h2><p>前文</p><h2>选区章节</h2><p>选中的旧版正文</p></>)));
    select(host.querySelectorAll('p')[1]!);
    const clipboard = { setData: vi.fn() };
    const event = new Event('copy', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: clipboard });
    await act(async () => host.querySelectorAll('p')[1]!.dispatchEvent(event));
    expect(clipboard.setData).toHaveBeenCalledWith('text/plain', '选中的旧版正文');
    const serialized = clipboard.setData.mock.calls.find(([mime]) => mime === LCOS_MATERIAL_TRANSFER_MIME)?.[1];
    expect(JSON.parse(serialized!)).toMatchObject({ content: { kind: 'text', text: '选中的旧版正文' },
      source: { ...source, locator: { kind: 'selection', label: '选区章节' } } });
    expect(event.defaultPrevented).toBe(true);
  });

  it('drags a source-bearing excerpt through existing native text transport and rejects foreign selections', async () => {
    await act(async () => root.render(<>{reader(<p>选中的正文</p>)}<p data-outside>其他窗口</p></>));
    const paragraph = host.querySelector('.lcos-reader-measure p')!;
    await act(async () => select(paragraph));
    const dataTransfer = { setData: vi.fn(), effectAllowed: 'none' };
    const drag = new Event('dragstart', { bubbles: true, cancelable: true });
    Object.defineProperty(drag, 'dataTransfer', { value: dataTransfer });
    await act(async () => paragraph.dispatchEvent(drag));
    expect(dataTransfer.effectAllowed).toBe('copy');
    expect(dataTransfer.setData).toHaveBeenCalledWith('text/plain',
      '〔来源 真实旧版材料〕\n> 选中的正文');
    const serialized=dataTransfer.setData.mock.calls.find(([mime])=>mime===LCOS_MATERIAL_TRANSFER_MIME)?.[1];
    expect(JSON.parse(String(serialized))).toMatchObject({source:{artifactId:'article-1',revisionId:'historical-7'}});
    await act(async () => select(host.querySelector('[data-outside]')!));
    expect(readerTextSelection(host.querySelector('.lcos-reader-measure'))).toBeNull();
    dataTransfer.setData.mockClear();
    const rejected = new Event('dragstart', { bubbles: true, cancelable: true });
    Object.defineProperty(rejected, 'dataTransfer', { value: dataTransfer });
    await act(async () => paragraph.dispatchEvent(rejected));
    expect(rejected.defaultPrevented).toBe(true); expect(dataTransfer.setData).not.toHaveBeenCalled();
  });

  it('does not attach stale source metadata when the selection spans reader chrome or another window', async () => {
    await act(async () => root.render(<>{reader(<p>正文</p>)}<span data-outside>其他窗口</span></>));
    const range = document.createRange();
    range.setStart(host.querySelector('.lcos-reader-measure p')!.firstChild!, 0);
    range.setEnd(host.querySelector('[data-outside]')!.firstChild!, 4);
    const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range);
    const clipboard = { setData: vi.fn() };
    const event = new Event('copy', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: clipboard });
    await act(async () => host.querySelector('.lcos-reader-measure p')!.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(false); expect(clipboard.setData).not.toHaveBeenCalled();
  });

  it('preserves the shared renderer native link drag when no excerpt is selected', async () => {
    await act(async () => root.render(reader(<p><a href="https://example.com">原有链接</a></p>)));
    const event = new Event('dragstart', { bubbles: true, cancelable: true });
    const transfer = { setData: vi.fn() };
    Object.defineProperty(event, 'dataTransfer', { value: transfer });
    await act(async () => host.querySelector('a')!.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(false); expect(transfer.setData).not.toHaveBeenCalled();
  });
});
