// @vitest-environment happy-dom
import { CoreProjectClient, HttpClient } from '@local-creative-os/web-gen2';
import { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PreviewMedia } from './PreviewMedia';
import { composerInputKey } from '../../composer/composerInputJourney';
import { useLcosReferenceStore } from '../../lcosReferenceState';
import { useLcosShellStore } from '../../shell/lcosShellStore';
import { takeWorkflowScopeMethodDraft } from '../../surfaces/workflow/workflowMethodTake';
import { TemporalRailView } from '../context/TemporalRailView';
import { PortalPreviewView } from '../professional/PortalPreviewView';
import { WorkflowTaskCardView } from '../workflow/WorkflowTaskCardView';

import type { LcosComposerTarget } from '../../shell/lcosShellStore';
import type { Workspace } from '@local-creative-os/domain';
import type { ReactNode } from 'react';
import type { Root } from 'react-dom/client';

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
async function render(node: ReactNode): Promise<void> {
  await act(async () => root.render(node));
}
function button(selector: string): HTMLButtonElement {
  const node = host.querySelector(selector);
  if (!(node instanceof HTMLButtonElement)) throw new Error(`Expected button: ${selector}`);
  return node;
}

describe('Stage6 real React presentation', () => {
  it('has no invented Portal actions when no callbacks or scene are supplied', async () => {
    await render(<PortalPreviewView state="可预览" title="目标" />);
    expect(host.querySelector('button')).toBeNull();
    expect(host.textContent).toContain('预览内容尚未就绪');
  });

  it('retains the supplied scene across stale/recovery presentations', async () => {
    const retry = vi.fn();
    const scene = <div data-lcos-real-portal-preview><button type="button">原生预览动作</button></div>;
    await render(<PortalPreviewView state="旧缓存" title="目标" onRetry={retry}>{scene}</PortalPreviewView>);
    const before = host.querySelector('[data-lcos-real-portal-preview]');
    await act(async () => button('.lcos-portal-retry').click());
    expect(retry).toHaveBeenCalledTimes(1);
    await render(<PortalPreviewView state="部分预览" title="目标" onRetry={retry}>{scene}</PortalPreviewView>);
    expect(host.querySelector('[data-lcos-real-portal-preview]')).toBe(before);
    expect(host.querySelector('.lcos-portal-retry')).toBeNull();
  });

  it('keeps an unavailable target labelled and never calls open', async () => {
    const open = vi.fn();
    await render(<PortalPreviewView state="目标缺失" title="目标" detail="工作现场不可用" onOpen={open} />);
    expect(button('.lcos-portal-open').disabled).toBe(true);
    await act(async () => button('.lcos-portal-open').click());
    expect(open).not.toHaveBeenCalled();
    expect(host.textContent).toContain('工作现场不可用');
  });

  it('keeps task draft entry separate from Run and from image retry', async () => {
    const use = vi.fn();
    const preview = vi.fn();
    const enter = vi.fn();
    await render(<WorkflowTaskCardView title="任务" state="悬停" onUse={use} onPreview={preview} onEnter={enter} entryHint="双击或按 Enter 进入" />);
    await act(async () => button('[data-lcos-card-take]').click());
    expect(use).toHaveBeenCalledTimes(1);
    expect(preview).not.toHaveBeenCalled();
    expect(enter).not.toHaveBeenCalled();

    const card = host.querySelector('[data-lcos-workflow-task-card]');
    if (!(card instanceof HTMLElement)) throw new Error('Expected task card');
    await act(async () => card.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(preview).toHaveBeenCalledTimes(1);
    expect(use).toHaveBeenCalledTimes(1);
    await act(async () => card.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true })));
    expect(enter).toHaveBeenCalledTimes(1);
    await act(async () => card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })));
    expect(enter).toHaveBeenCalledTimes(2);

    await render(<WorkflowTaskCardView title="任务" state="草稿中" onUse={use} />);
    // Stage4 caller contract keeps draft take available; it must not create a Run.
    expect(host.querySelector('[data-lcos-card-take]')).not.toBeNull();
    expect(host.textContent).toContain('已加入草稿 · 未发送');
  });

  it('resets image failure by source and preserves the donor retry path', async () => {
    await render(<PreviewMedia src="/fixture/one.png" label="材料" />);
    const img = host.querySelector('img');
    if (!img) throw new Error('Expected initial image');
    await act(async () => { img.dispatchEvent(new Event('error')); });
    expect(host.textContent).toContain('预览读取失败');
    await act(async () => button('button').click());
    expect(host.querySelector('[data-image-phase="loading"]')).not.toBeNull();
    await render(<PreviewMedia src="/fixture/two.png" label="材料" />);
    expect(host.querySelector('img')?.getAttribute('src')).toBe('/fixture/two.png');
  });

  it('moves DOM focus, skips unavailable entries and cleans the preview on scope change', async () => {
    const preview = vi.fn();
    const items = [
      { id: 'a', label: '第一组', ratio: .1, lengthTier: 'L0' as const, staticWidth: 8 },
      { id: 'b', label: '不可用', ratio: .5, lengthTier: 'L2' as const, staticWidth: 16, disabled: true },
      { id: 'c', label: '第三组', ratio: .9, lengthTier: 'L4' as const, staticWidth: 34 },
    ];
    await render(<TemporalRailView
      items={items}
      window={{ startIndex: 2, endIndex: 4, totalCount: 9, positionRatio: .4, spanRatio: 1 / 3, label: '9月3日 — 9月5日' }}
      onPreviewChange={preview}
      scopeKey="one"
    />);
    expect(host.querySelector('[data-temporal-window-band]')?.getAttribute('data-window-start')).toBe('2');
    expect(host.textContent).toContain('3–5 / 9');
    expect(Number(host.querySelector('[data-lcos-temporal-rail]')?.getAttribute('aria-valuemax'))).toBeGreaterThan(0);
    expect(button('[data-temporal-item="c"]').dataset.lengthTier).toBe('L4');
    expect(button('[data-temporal-item="c"]').style.getPropertyValue('--lcos-temporal-item-width')).toBe('34px');
    await act(async () => button('[data-temporal-item="a"]').focus());
    await act(async () => { button('[data-temporal-item="a"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })); });
    expect(document.activeElement).toBe(button('[data-temporal-item="c"]'));
    await render(<TemporalRailView items={items} onPreviewChange={preview} scopeKey="two" />);
    expect(preview).toHaveBeenLastCalledWith(null);
  });

  it('keeps hover preview ephemeral across leave, Escape, click and unmount', async () => {
    const preview = vi.fn();
    const activate = vi.fn();
    const item = { id: 'episode-a', label: '一组真实对象', ratio: .5, lengthTier: 'L3' as const, staticWidth: 23 };
    await render(<TemporalRailView
      items={[item]}
      onPreviewChange={preview}
      onActivate={activate}
      scopeKey="context-a"
    />);
    const rail = host.querySelector('[data-lcos-temporal-rail]');
    if (!(rail instanceof HTMLElement)) throw new Error('Expected temporal rail');
    const episode = button('[data-temporal-item="episode-a"]');

    await act(async () => episode.dispatchEvent(new PointerEvent('pointerover', { bubbles: true })));
    expect(episode.dataset.preview).toBe('true');
    expect(preview).toHaveBeenLastCalledWith(item);

    await act(async () => rail.dispatchEvent(new PointerEvent('pointerout', { bubbles: true })));
    expect(episode.dataset.preview).toBeUndefined();
    expect(preview).toHaveBeenLastCalledWith(null);

    await act(async () => episode.focus());
    expect(episode.dataset.preview).toBe('true');
    await act(async () => episode.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
    expect(episode.dataset.preview).toBeUndefined();
    expect(preview).toHaveBeenLastCalledWith(null);

    await act(async () => episode.dispatchEvent(new PointerEvent('pointerover', { bubbles: true })));
    await act(async () => episode.click());
    expect(activate).toHaveBeenCalledExactlyOnceWith(item);
    expect(episode.dataset.preview).toBeUndefined();
    expect(preview).toHaveBeenLastCalledWith(null);

    await act(async () => episode.dispatchEvent(new PointerEvent('pointerover', { bubbles: true })));
    await render(null);
    expect(preview).toHaveBeenLastCalledWith(null);
  });

  it('isolates wheel with React StrictMode and leaves empty data truly empty', async () => {
    const shift = vi.fn();
    const outer = vi.fn();
    await render(<StrictMode><div onWheel={outer}><TemporalRailView items={[]} onWindowShift={shift} /></div></StrictMode>);
    const rail = host.querySelector('aside');
    if (!rail) throw new Error('Expected rail');
    await act(async () => { rail.dispatchEvent(new WheelEvent('wheel', { deltaY: 50, bubbles: true, cancelable: true })); });
    expect(shift).toHaveBeenCalledExactlyOnceWith(1);
    expect(outer).not.toHaveBeenCalled();
    expect(host.querySelector('.lcos-temporal-ticks')).toBeNull();
  });
});

it('keeps real method take in the original receiver separate from its workspace and never invents a source conversation', async () => {
  const projectId = 'stage-method-project', scopeId = 'saved-method-scope';
  const workspace: Workspace = { id: 'method-workspace' as Workspace['id'], projectId: projectId as Workspace['projectId'],
    scopeId: scopeId as Workspace['scopeId'], name: '品牌研究现场', intent: null, viewport: { x: 0, y: 0, zoom: 1 },
    focusedViewIds: [], visibleLayers: [], contextPolicy: 'workspace-related', canvasId: 'method-canvas',
    updatedAt: '2026-10-08T00:00:00Z' as Workspace['updatedAt'] };
  const graph = { project: { id: projectId }, scopes: [{ id: scopeId, kind: 'workflow', name: '品牌研究' }],
    workspaces: [workspace], artifacts: [{ id: 'method-artifact', title: '旧版品牌材料', currentRevisionId: 'current' }],
    artifactViews: [{ id: 'method-view', artifactId: 'method-artifact', revisionId: 'historical' }],
    artifactRevisions: [{ id: 'historical', artifactId: 'method-artifact', fileRecordId: 'old-file' }],
    fileRecords: [{ id: 'old-file', mimeType: 'text/markdown' }] };
  const presentation = { id: 'saved-method-presentation', projectId, scopeId, capability: 'workflow', version: 3,
    state: { memberViewIds: ['method-view'], workflowActions: [{ id: 'compare', label: '品牌对照',
      description: '阅读旧版品牌材料后对照需求', attachedViewIds: ['method-view'] }] } };
  const fetcher = vi.fn<typeof fetch>(async url => new Response(JSON.stringify({ ok: true,
    value: String(url).endsWith('/graph') ? graph : [presentation] }), { status: 200, headers: { 'content-type': 'application/json' } }));
  const http = new HttpClient({ baseUrl: 'http://127.0.0.1:0', fetch: fetcher });
  const session = { http, projects: new CoreProjectClient(http) };
  const receiver: LcosComposerTarget = { nodeId: 'conversation:existing-receiver', title: '现有会话', intent: 'continue',
    receiverConversationId: 'existing-receiver', messageId: 'original-message', anchor: { x: 1, y: 2, width: 3, height: 4 } };
  useLcosReferenceStore.getState().reset(); useLcosReferenceStore.getState().setProject(projectId);
  useLcosShellStore.setState({ projectId, composerOpen: true, composerTarget: receiver, composerPrompt: '用户原任务' });
  const inputKey = composerInputKey(receiver); if (!inputKey) throw new Error('Expected original receiver input');
  let pending: Promise<void> | undefined;
  const use = vi.fn(() => { pending = takeWorkflowScopeMethodDraft(session, projectId, scopeId, inputKey); });
  const enter = vi.fn(), close = vi.fn();
  try {
    await render(<WorkflowTaskCardView title="品牌研究" state="预览" dataEntity={scopeId} dataSource="core"
      summary="取用已保存方法，加入原输入；工作现场可独立进入。" onUse={use} onEnter={enter}
      entryAvailable entryTargetLabel={workspace.name} onClosePreview={close} />);
    const preview = host.querySelector('.lcos-workflow-card-preview');
    expect(preview).not.toBeNull();
    const action = (name: string) => Array.from(preview?.querySelectorAll('button') ?? []).find(button => button.textContent === name);
    expect(action('加入当前草稿')).toBeDefined();
    await act(async () => { action('加入当前草稿')?.click(); await pending; });
    expect(use).toHaveBeenCalledTimes(1); expect(enter).not.toHaveBeenCalled();
    expect(useLcosShellStore.getState().composerTarget).toBe(receiver);
    expect(useLcosShellStore.getState().composerPrompt).toContain(`用户原任务\n\n工作流方法：品牌研究`);
    expect(useLcosShellStore.getState().composerPrompt).toContain(`来源 Scope：${scopeId}`);
    expect(useLcosReferenceStore.getState().draft.orderedEntityRefs).toMatchObject([
      { entityId: 'method-artifact', artifactViewId: 'method-view', revisionId: 'historical' },
    ]);
    expect(fetcher).toHaveBeenCalledTimes(2); expect(fetcher.mock.calls.every(([, options]) => options?.method === 'GET')).toBe(true);
    await act(async () => action(`进入「${workspace.name}」`)?.click());
    expect(enter).toHaveBeenCalledTimes(1); expect(use).toHaveBeenCalledTimes(1);
    expect(action('续接原会话')).toBeUndefined(); expect(preview?.textContent).not.toContain('用于当前会话');
    await act(async () => button('[aria-label="返回手牌"]').click()); expect(close).toHaveBeenCalledTimes(1);
  } finally {
    useLcosReferenceStore.getState().reset(); useLcosShellStore.getState().clear();
  }
});
