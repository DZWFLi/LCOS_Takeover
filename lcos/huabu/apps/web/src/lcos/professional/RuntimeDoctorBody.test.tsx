import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const getHealth = vi.hoisted(() => vi.fn());
vi.mock('../app/lcosCoreClient', () => ({ createLcosCoreSession: () => ({ health: { getHealth } }) }));
import { RuntimeDoctorBody } from './RuntimeDoctorBody';
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
let container: HTMLDivElement;
const healthy = { status: 'ok', service: 'local-core', version: '1.2.3', mode: 'phase_2_lite', token: 'never-copy-me' };
async function render() {
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  await act(async () => root?.render(<RuntimeDoctorBody onClose={() => undefined} />));
}
async function click(label: string) {
  const button = Array.from(container.querySelectorAll('button')).find((row) => row.textContent?.startsWith(label));
  expect(button).toBeDefined(); await act(async () => button?.click());
}
afterEach(() => { act(() => root?.unmount()); root = undefined; container?.remove(); getHealth.mockReset(); vi.unstubAllGlobals(); });
describe('RuntimeDoctorBody existing health evidence', () => {
  it('copies only real allowlisted evidence without claiming provider health', async () => {
    getHealth.mockResolvedValue(healthy); const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } }); await render();
    expect(container.textContent).toContain('尚无独立连接证据');
    await click('查看详情'); await click('复制诊断摘要');
    expect(JSON.parse(writeText.mock.calls[0]![0])).toEqual({ status: 'ok', service: 'local-core', version: '1.2.3', mode: 'phase_2_lite' });
    expect(container.textContent).toContain('已复制');
  });
  it.each([{}, { ...healthy, mode: 'unknown-mode' }])('does not report malformed evidence as healthy', async (value) => {
    getHealth.mockResolvedValue(value); await render();
    expect(container.querySelector('section')?.dataset.readState).toBe('unknown');
    expect(container.textContent).not.toContain('本机服务可连接');
  });
  it('retries an offline read without repair or task replay', async () => {
    getHealth.mockRejectedValueOnce({ status: 503 }).mockResolvedValueOnce(healthy); await render();
    expect(container.querySelector('section')?.dataset.readState).toBe('offline');
    await click('本机服务'); expect(container.querySelector('section')?.dataset.readState).toBe('ready');
    expect(getHealth).toHaveBeenCalledTimes(2);
  });
  it('reports clipboard failure honestly', async () => {
    getHealth.mockResolvedValue(healthy); vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    await render(); await click('查看详情'); await click('复制诊断摘要'); expect(container.textContent).toContain('复制失败');
    expect(container.textContent).not.toContain('已复制');
  });
  it('ignores a copy receipt belonging to a previous read', async () => {
    let finish!: () => void;
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn(() => new Promise<void>((resolve) => { finish = resolve; })) } });
    getHealth.mockResolvedValue(healthy); await render(); await click('查看详情'); await click('复制诊断摘要');
    await click('本机服务'); await act(async () => finish()); expect(container.textContent).not.toContain('已复制');
  });
  it('closes details before the host and returns keyboard focus', async () => {
    getHealth.mockResolvedValue(healthy); await render(); await click('查看详情');
    const hostEscape = vi.fn(); document.addEventListener('keydown', hostEscape);
    try {
      const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      act(() => container.querySelector('section')?.dispatchEvent(event));
      expect(hostEscape).not.toHaveBeenCalled();
      expect(document.activeElement?.textContent).toBe('查看详情');
      expect(container.querySelector('.lcos-system-details')).toBeNull();
    } finally { document.removeEventListener('keydown', hostEscape); }
  });
  it('aborts a pending read on unmount', async () => {
    let signal!: AbortSignal;
    getHealth.mockImplementation((value: AbortSignal) => { signal = value; return new Promise(() => undefined); });
    await render(); act(() => root?.unmount()); root = undefined; expect(signal.aborted).toBe(true);
  });
});
