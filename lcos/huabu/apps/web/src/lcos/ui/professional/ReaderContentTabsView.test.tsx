// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ReaderContentTabsView } from './ReaderContentTabsView';
import { ReaderGroupView } from './ReaderGroupView';
import { LcosWindowChrome } from '../families/LcosWindowChrome';
import { LcosSurfaceFeedbackView } from '../LcosSurfaceFeedbackView';

import type { ReactNode } from 'react';
import type { Root } from 'react-dom/client';

let root: Root | undefined;
let host: HTMLDivElement | undefined;
async function render(node: ReactNode): Promise<HTMLDivElement> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(node));
  return host;
}
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

const items = [
  { id: 'a', label: '创意简报.pdf', selected: true },
  { id: 'b', label: '访谈节选', selected: false },
];
describe('Reader instance skin and existing owner boundaries', () => {
  it('forwards the exact content id without selecting locally', async () => {
    const action = vi.fn();
    const h = await render(<ReaderContentTabsView label="正文" items={items} onActivate={action} />);
    await act(async () => h.querySelector<HTMLButtonElement>('[data-lcos-reader-content-tab="b"]')?.click());
    expect(action).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenCalledWith('b');
    expect(h.querySelector('[data-selected="true"]')?.getAttribute('data-lcos-reader-content-tab')).toBe('a');
  });
  it('does not dispatch disabled content', async () => {
    const action = vi.fn();
    const h = await render(<ReaderContentTabsView label="正文" items={[{
      id: 'a', label: '创意简报.pdf', selected: true, disabled: true,
    }]} onActivate={action} />);
    await act(async () => h.querySelector<HTMLButtonElement>('button')?.click());
    expect(action).not.toHaveBeenCalled();
  });
  it('does not manufacture a tab when empty', async () => {
    const h = await render(<ReaderContentTabsView label="正文" items={[]} onActivate={vi.fn()} />);
    expect(h.querySelectorAll('button')).toHaveLength(0);
  });
  it('preserves legacy opaque tabs when both entry points are supplied', async () => {
    const h = await render(<ReaderGroupView presentation="single" activeGroupId="g" groups={[{
      id: 'g', label: '正文', content: <p>正文</p>, tabs: <button data-legacy>原标签</button>,
      contentTabs: { label: '不应渲染', items, onActivate: vi.fn() },
    }]} />);
    expect(h.querySelector('[data-legacy]')).not.toBeNull();
    expect(h.querySelector('[data-lcos-reader-content-tabs]')).toBeNull();
  });
  it('renders the descriptor skin only when explicitly supplied', async () => {
    const h = await render(<ReaderGroupView presentation="split" activeGroupId="g" groups={[{
      id: 'g', label: '正文', content: <p>正文</p>, contentTabs: { label: '正文材料', items, onActivate: vi.fn() },
    }]} />);
    expect(h.querySelectorAll('[data-lcos-reader-content-tab]')).toHaveLength(2);
    expect(h.querySelector('[data-lcos-reader-content-tabs-track]')).not.toBeNull();
  });
  it('forwards window instance value even when two tabs share a kind', async () => {
    const action = vi.fn();
    const h = await render(<LcosWindowChrome layout="分组" title="阅读" tabs={[
      { key: 'reader', value: 'one', label: '第一份' }, { key: 'reader', value: 'two', label: '第二份' },
    ]} onSelectTab={action} />);
    await act(async () => h.querySelector<HTMLButtonElement>('[data-lcos-window-tab-value="two"]')?.click());
    expect(action).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenCalledWith('two');
    expect(h.querySelector('[data-lcos-window-busy]')).toBeNull();
  });
  it('keeps a real action outside the lightweight feedback body', async () => {
    const action = vi.fn();
    const h = await render(<LcosSurfaceFeedbackView presentation="error" message="读取失败" onAction={action} />);
    expect(h.querySelector('[data-lcos-feedback-body] button')).toBeNull();
    await act(async () => h.querySelector<HTMLButtonElement>('[data-lcos-feedback-action]')?.click());
    expect(action).toHaveBeenCalledTimes(1);
    expect(h.querySelector('[data-lcos-surface-feedback="error"]')).not.toBeNull();
  });
  it('keeps split group identity stable for Figma divider geometry', async () => {
    const h = await render(<ReaderGroupView presentation="split" activeGroupId="left" groups={[
      { id: 'left', label: '左组', content: <p>左</p>, contentTabs: { label: '左组材料', items, onActivate: vi.fn() } },
      { id: 'right', label: '右组', content: <p>右</p>, contentTabs: { label: '右组材料', items, onActivate: vi.fn() } },
    ]} />);
    expect(h.querySelector('[data-reader-group-index="0"]')).not.toBeNull();
    expect(h.querySelector('[data-reader-group-index="1"]')).not.toBeNull();
  });
  it('leaves feedback without a callback non-actionable', async () => {
    const h = await render(<LcosSurfaceFeedbackView presentation="disabled" message="没有读取权限" />);
    expect(h.querySelectorAll('button')).toHaveLength(0);
    expect(h.textContent).toContain('没有读取权限');
  });
});
