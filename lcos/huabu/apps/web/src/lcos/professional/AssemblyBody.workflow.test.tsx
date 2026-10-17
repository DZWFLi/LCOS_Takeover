import { CoreAssemblyClient, CoreProjectClient, HttpClient } from '@local-creative-os/web-gen2';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

import { AssemblyBody } from './AssemblyBody';
import { composerInputKey } from '../composer/composerInputJourney';
import { useLcosReferenceStore } from '../lcosReferenceState';
import { useLcosShellStore } from '../shell/lcosShellStore';

import type { LcosComposerTarget } from '../shell/lcosShellStore';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const mocks = vi.hoisted(() => ({ session: vi.fn(), navigate: vi.fn() }));
vi.mock('../app/lcosCoreClient', () => ({ createLcosCoreSession: () => mocks.session() }));
vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate }));
const roots: ReturnType<typeof createRoot>[] = [];
const target: LcosComposerTarget = { nodeId: 'conversation:c', title: '原近场输入', intent: 'continue', receiverConversationId: 'c',
  anchor: { x: 10, y: 20, width: 220, height: 100 } };
afterEach(() => {
  roots.splice(0).forEach(root => act(() => root.unmount())); document.body.replaceChildren();
  useLcosReferenceStore.getState().reset(); useLcosShellStore.setState({ composerTarget: null, composerPrompt: '', composerOpen: false });
});
async function fixture(missing = false, ordinaryOnly = false) {
  useLcosReferenceStore.getState().reset(); useLcosReferenceStore.getState().setProject('p');
  useLcosShellStore.setState({ projectId: 'p', composerTarget: target, composerPrompt: '用户原问题', composerOpen: true });
  const fetcher = vi.fn<typeof fetch>(async url => {
    const path = new URL(String(url)).pathname;
    const value = path.endsWith('/warehouse') ? { schemaVersion: 1, projectId: 'p', items: [
      { schemaVersion: 1, kind: 'workflow', title: '真实方法', entityRef: { type: 'workflow', id: 'wf' }, usageCount: 0 },
      { schemaVersion: 1, kind: 'artifact', title: '普通材料', entityRef: { type: 'artifact', id: 'a', viewId: 'v' }, presentedRevisionId: 'old', mimeType: 'text/markdown', usageCount: 0 },
    ].filter(item => !ordinaryOnly || item.kind === 'artifact'), relations: [] } : path.endsWith('/graph') ? {
      project: { id: 'p' }, scopes: [{ id: 'wf', name: '真实方法', kind: 'workflow' }], artifactViews: [{ id: 'v', artifactId: 'a', revisionId: 'old' }],
      artifacts: [{ id: 'a', title: '普通材料', currentRevisionId: 'current' }], artifactRevisions: missing ? [] : [{ id: 'old', artifactId: 'a', fileRecordId: 'f' }], fileRecords: [{ id: 'f', mimeType: 'text/markdown' }],
    } : path.endsWith('/presentations') ? [{ id: 'pres', projectId: 'p', scopeId: 'wf', capability: 'workflow', version: 4,
      state: { memberViewIds: ['v'], workflowActions: [{ id: 'step', label: '先核对来源', attachedViewIds: ['v'] }] } }] : [];
    return new Response(JSON.stringify({ ok: true, value }), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  const http = new HttpClient({ baseUrl: 'http://127.0.0.1:0', fetch: fetcher });
  mocks.session.mockReturnValue({ http, projects: new CoreProjectClient(http), assembly: new CoreAssemblyClient(http) });
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host); roots.push(root);
  await act(async () => root.render(<AssemblyBody projectId="p" targetRef={{ kind: 'main' }} composerOriginKey={composerInputKey(target)} />));
  await vi.waitFor(async () => { await act(async () => { await Promise.resolve(); }); expect(host.querySelector(`[data-lcos-assembly-item="${ordinaryOnly ? 'a' : 'wf'}"]`)).not.toBeNull(); });
  return { host, fetcher };
}
it('takes the actual Assembly Workflow into the original near-field input, preserving its receiver and historical material', async () => {
  const { host } = await fixture();
  await act(async () => host.querySelector<HTMLButtonElement>('[data-lcos-assembly-item="wf"] [data-lcos-assembly-add]')?.click());
  await vi.waitFor(async () => { await act(async () => { await Promise.resolve(); }); expect(host.textContent).toContain('工作流方法已加入当前输入，未发送'); });
  expect(useLcosShellStore.getState().composerPrompt).toContain('用户原问题\n\n工作流方法：真实方法');
  expect(useLcosShellStore.getState().composerPrompt).toContain('动作：先核对来源');
  expect(useLcosShellStore.getState().composerTarget).toMatchObject(target);
  expect(useLcosReferenceStore.getState().draft.orderedEntityRefs).toMatchObject([{ entityId: 'a', revisionId: 'old' }]);
});
it('reports the exact missing version without changing any part of the original draft', async () => {
  const { host } = await fixture(true); const before = useLcosReferenceStore.getState().draft;
  await act(async () => host.querySelector<HTMLButtonElement>('[data-lcos-assembly-item="wf"] [data-lcos-assembly-add]')?.click());
  await vi.waitFor(async () => { await act(async () => { await Promise.resolve(); }); expect(host.textContent).toContain('材料或版本已缺失：v'); });
  expect(useLcosShellStore.getState().composerPrompt).toBe('用户原问题'); expect(useLcosShellStore.getState().composerTarget).toBe(target);
  expect(useLcosReferenceStore.getState().draft).toBe(before);
});
it('keeps ordinary material on the original reference route without reading Workflow presentations', async () => {
  const { host, fetcher } = await fixture(false, true);
  const button = host.querySelector<HTMLButtonElement>('[data-lcos-assembly-item="a"] [data-lcos-assembly-add]');
  expect(button?.disabled, host.textContent ?? '').toBe(false);
  await act(async () => button?.click());
  expect(useLcosShellStore.getState().composerPrompt).toBe('用户原问题'); expect(useLcosShellStore.getState().composerTarget).toMatchObject(target);
  expect(useLcosReferenceStore.getState().draft.orderedEntityRefs).toMatchObject([{ entityId: 'a', revisionId: 'old' }]);
  expect(fetcher.mock.calls.some(([url]) => String(url).includes('/presentations'))).toBe(false);
});
