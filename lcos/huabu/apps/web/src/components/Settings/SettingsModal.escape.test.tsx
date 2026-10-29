import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

import { useCloseOnEscape } from '@/hooks/useCloseOnEscape';

import { SettingsModal } from './SettingsModal';

const m = vi.hoisted(() => ({ init: vi.fn(), settingsClose: vi.fn(), parentClose: vi.fn(), nestedClose: vi.fn() }));
vi.mock('@/store/llmStore', () => ({ useLLMStore: (select: (state: { init: typeof m.init }) => unknown) => select({ init: m.init }) }));
vi.mock('@/store/acpProfilesStore', () => ({ useAcpProfilesStore: (select: (state: { init: typeof m.init }) => unknown) => select({ init: m.init }) }));
vi.mock('@/store/deploymentReadinessStore', () => ({ useDeploymentReadinessStore: (select: (state: { load: typeof m.init }) => unknown) => select({ load: m.init }) }));
vi.mock('./DeploymentReadinessNotice', () => ({ DeploymentReadinessNotice: () => null }));
vi.mock('./agent-team/ExternalAgentsSettings', () => ({ ExternalAgentsSettings: () => null }));
vi.mock('./sections/GeneralSettings', () => ({ GeneralSettings: () => null }));
vi.mock('./sections/ImageProviderSettings', () => ({ ImageProviderSettings: () => null }));
vi.mock('./sections/IntegrationsSettings', () => ({ IntegrationsSettings: () => null }));
vi.mock('./sections/LLMSettings', () => ({ LLMSettings: () => null }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
function Parent() { useCloseOnEscape(true, m.parentClose); return <div />; }
function Nested() { useCloseOnEscape(true, m.nestedClose); return <div role="dialog" aria-modal="true" />; }

it('Escape closes Settings before the professional window beneath it', async () => {
  m.settingsClose.mockClear(); m.parentClose.mockClear();
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  try {
    await act(async () => root.render(<><Parent /><SettingsModal isOpen onClose={m.settingsClose} /></>));
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(m.settingsClose).toHaveBeenCalledTimes(1); expect(m.parentClose).not.toHaveBeenCalled();
  } finally { act(() => root.unmount()); host.remove(); }
});
it('a native nested dialog closes first and leaves Settings and the worksite intact', async () => {
  m.settingsClose.mockClear(); m.parentClose.mockClear(); m.nestedClose.mockClear();
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  try {
    await act(async () => root.render(<><Parent /><SettingsModal isOpen onClose={m.settingsClose} /><Nested /></>));
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(m.nestedClose).toHaveBeenCalledTimes(1); expect(m.settingsClose).not.toHaveBeenCalled(); expect(m.parentClose).not.toHaveBeenCalled();
  } finally { act(() => root.unmount()); host.remove(); }
});
