import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useLayerReturnFocus } from './useLayerReturnFocus';
import { WorkflowTaskCardView } from '../workflow/WorkflowTaskCardView';

let host: HTMLDivElement; let root: Root; let opener: HTMLButtonElement;
beforeEach(() => {
  host = document.createElement('div'); opener = document.createElement('button'); opener.textContent = '原入口';
  document.body.append(opener, host); opener.focus(); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); opener.remove(); });
function Layer({ present }: { present: boolean }) { const ref = useLayerReturnFocus(present); return <div ref={ref}><button data-inside>浮层动作</button></div>; }
async function render(present: boolean) { await act(async () => root.render(<Layer present={present} />)); }
async function focusInside() { await act(async () => host.querySelector<HTMLButtonElement>('[data-inside]')?.focus()); }

describe('temporary layer return focus', () => {
  it('restores the exact opener on dismiss without creating another focus owner', async () => {
    await render(true); await focusInside(); expect(document.activeElement).not.toBe(opener);
    await render(false); expect(document.activeElement).toBe(opener);
  });
  it('does not steal focus from a new input that already took over', async () => {
    const input = document.createElement('textarea'); document.body.append(input);
    try { await render(true); await focusInside(); input.focus(); await render(false); expect(document.activeElement).toBe(input); }
    finally { input.remove(); }
  });
  it('does not restore to an opener that was removed with the old route', async () => {
    await render(true); await focusInside(); opener.remove(); await render(false);
    expect(document.activeElement).not.toBe(opener); expect(document.body.contains(document.activeElement)).toBe(true);
  });
  it('restores on unmount while retaining the opener itself', async () => {
    await render(true); await focusInside(); await act(async () => root.render(null)); expect(document.activeElement).toBe(opener);
  });
});

function PreviewFixture() {
  const [preview, setPreview] = useState(true);
  return <WorkflowTaskCardView title="原任务" state={preview ? '预览' : '静息'} onPreview={() => setPreview(true)} onClosePreview={() => setPreview(false)} />;
}
describe('Workflow near-card return', () => {
  it.each(['button', 'Escape'] as const)('returns %s to the same card, keeping the surrounding hand alive', async (method) => {
    await act(async () => root.render(<PreviewFixture />));
    const card = host.querySelector<HTMLElement>('[data-lcos-workflow-task-card]');
    const close = host.querySelector<HTMLButtonElement>('[aria-label="返回手牌"]');
    if (!card || !close) throw new Error('actual card preview missing');
    close.focus();
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    await act(async () => { if (method === 'button') close.click(); else close.dispatchEvent(event); });
    expect(host.querySelector('[data-lcos-workflow-task-card]')).toBe(card);
    expect(host.querySelector('[data-preview="true"]')).toBeNull();
    expect(document.activeElement).toBe(card);
    if (method === 'Escape') expect(event.defaultPrevented).toBe(true);
    await act(async () => card.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })));
    expect(host.querySelector('[data-preview="true"]')).toBe(card);
  });
});
