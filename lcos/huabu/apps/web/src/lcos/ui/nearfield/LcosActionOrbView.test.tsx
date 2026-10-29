import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

import { LcosActionOrbView } from './LcosActionOrbView';
import { resolveActionArcGeometry } from '../../navigation/actionArcGeometry';

describe('Arc presentation delegates commands', () => {
  it.each([3, 4])('retains the existing %i-item template and 44px hit targets', async (count) => {
    const geometry = resolveActionArcGeometry(count);
    const host = document.createElement('div'); document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () => root.render(<>{geometry.points.map((point, index) => (
        <LcosActionOrbView key={index} point={point} label={`动作 ${index}`}
          actionId={`${index}`} onClick={() => undefined}>
          <span>•</span>
        </LcosActionOrbView>
      ))}</>));
      const buttons = [...host.querySelectorAll<HTMLButtonElement>('[data-lcos-action-orb-hit]')];
      expect(buttons).toHaveLength(count);
      for (const [index, button] of buttons.entries()) {
        expect(button.style.width).toBe('44px');
        expect(button.style.height).toBe('44px');
        const placement = button.closest<HTMLElement>('.lcos-action-orb-placement')!;
        expect(Number.parseFloat(placement.style.left) + Number.parseFloat(button.style.left) + 7).toBe(geometry.points[index]?.x);
        expect(Number.parseFloat(placement.style.top) + Number.parseFloat(button.style.top) + 7).toBe(geometry.points[index]?.y);
        expect(button.querySelector<HTMLElement>('[data-lcos-action-orb]')?.style.width).toBe('30px');
      }
    } finally { await act(async () => root.unmount()); host.remove(); }
  });
  it('keeps More and primary selectors on native buttons and honors disabled reasons', async () => {
    const invoke = vi.fn();
    const host = document.createElement('div'); document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () => root.render(
        <LcosActionOrbView point={{ x: 0, y: 0 }} label="更多命令" more
          expanded={false} disabledReason="当前不可用" onClick={invoke}>…</LcosActionOrbView>,
      ));
      const button = host.querySelector<HTMLButtonElement>('[data-lcos-arc-more]');
      expect(button?.tagName).toBe('BUTTON');
      expect(button?.disabled).toBe(true);
      expect(button?.getAttribute('aria-label')).toBe('更多命令');
      expect(button?.getAttribute('aria-description')).toBe('当前不可用');
      const trigger = button?.closest('.lcos-action-orb-tooltip-host');
      await act(async () => { trigger?.dispatchEvent(new MouseEvent('mouseenter')); await new Promise((resolve) => setTimeout(resolve, 170)); });
      expect(document.querySelector('[role=tooltip]')?.textContent).toBe('当前不可用');
      await act(async () => button?.click());
      expect(invoke).not.toHaveBeenCalled();
    } finally { await act(async () => root.unmount()); host.remove(); }
  });
});
