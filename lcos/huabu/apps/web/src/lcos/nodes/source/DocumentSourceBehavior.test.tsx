import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const { read } = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('../../app/lcosCoreClient', () => ({ createLcosCoreSession: () => ({ artifacts: { getFileRecordText: read } }) }));
vi.mock('@/components/Nodes/shared/nodeHydrationScheduler', () => ({ useDeferredHydration: () => true }));
vi.mock('@/components/Milkdown', () => ({ MilkdownPreview: ({ markdown }: { markdown: string }) => <div data-rich-body>{markdown}</div> }));
import { DocumentSourceMorphology } from './DocumentSourceMorphology';
import { documentOutline } from '../../ui/source/documentSourceLayout';
let host: HTMLDivElement; let root: Root;
beforeEach(() => { read.mockReset(); host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
const props = { family: 'document' as const, title: '真实文档', projectId: 'p', fileRecordId: 'f1', artifactKind: 'markdown', preview: '旧的160字摘要' };
it('does not read at mark, derives outline from true headings and renders all reading content beyond 160 characters', async () => {
 const full = '# 原标题\n\n## 研究\n' + '真实段落。'.repeat(50) + '\n## 结论\n真正的尾句';
 read.mockResolvedValue(full);
 await act(async () => root.render(<DocumentSourceMorphology {...props} density="mark" />));
 expect(read).not.toHaveBeenCalled();
 await act(async () => root.render(<DocumentSourceMorphology {...props} density="working" />));
 expect(host.textContent).toContain('研究'); expect(host.textContent).toContain('结论');
 expect(host.querySelector('[data-rich-body]')).toBeNull();
 await act(async () => root.render(<DocumentSourceMorphology {...props} density="reading" />));
 expect(host.querySelector('[data-rich-body]')?.textContent).toBe(full);
 expect(read).toHaveBeenCalledTimes(1);
});
it('aborts the old revision and never renders its late result after source change or unmount', async () => {
 let finish!: (value: string) => void;
 read.mockReturnValueOnce(new Promise<string>(resolve => { finish = resolve; })).mockResolvedValueOnce('# 新版本\n新的正文');
 await act(async () => root.render(<DocumentSourceMorphology {...props} density="reading" />));
 const signal = read.mock.calls[0]![2] as AbortSignal;
 await act(async () => root.render(<DocumentSourceMorphology {...props} fileRecordId="f2" density="reading" />));
 expect(signal.aborted).toBe(true);
 await act(async () => finish('# 过期版本'));
 expect(host.textContent).toContain('新版本'); expect(host.textContent).not.toContain('过期版本');
 await act(async () => root.render(null)); expect((read.mock.calls[1]![2] as AbortSignal).aborted).toBe(true);
});
it('keeps the truthful preview on error and retries the same canonical file', async () => {
 read.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce('# 恢复正文');
 await act(async () => root.render(<DocumentSourceMorphology {...props} density="reading" />));
 expect(host.textContent).toContain('正文读取失败'); expect(host.textContent).toContain('旧的160字摘要');
 await act(async () => host.querySelector<HTMLButtonElement>('button')!.click());
 expect(host.textContent).toContain('恢复正文'); expect(host.textContent).not.toContain('正文读取失败');
});
it('extracts only source headings, excludes fenced code and preserves headingless fallback', () => {
 expect(documentOutline('# A\r\n```md\r\n# fake\r\n```\r\n## B', 'working')).toBe('B');
 expect(documentOutline('No heading', 'summary')).toBe('');
 expect(documentOutline('# A', 'mark')).toBe('');
});
