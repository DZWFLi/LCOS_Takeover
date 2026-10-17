import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

import { WorkflowCardPool } from './WorkflowCardPool';
import { WorkflowHandOverlay } from './WorkflowWorksite';
import { useLcosDropStore } from '../../lcosDropState';

const m = vi.hoisted(() => ({
  enter: vi.fn(), onEntered: vi.fn(), skills: vi.fn(async () => Array.from({ length: 17 }, (_, i) => ({ id: `skill-${i}`, name: `Skill ${i}`, source: 'system' }))), browse: vi.fn(),
  draftRefs: [] as { entityType: string; entityId: string }[],
  addEntityToDraft: vi.fn(),
  addEntitiesToDraft: vi.fn(() => ({ added: 1 } as { added: number; reason?: string })),
  readMethod: vi.fn(async () => ({ status: 'unavailable' as const, reason: '这张工作流卡没有已保存的方法步骤，仍可进入工作现场或拖放。' } as WorkflowMethodDraft)),
  shellState: { projectId: 'p1', composerPrompt: '', setComposerPrompt: vi.fn(), activeWorkspaceId: 'source' as string | null, composerTarget: null as unknown, openComposer: vi.fn(), openWindow: vi.fn() },
  items: [{ schemaVersion: 1, kind: 'workflow', title: '真实工作流', usageCount: 0, entityRef: { type: 'workflow', id: 'wf1' } }],
}));
vi.mock('@local-creative-os/web-gen2', async (importOriginal) => ({
  ...await importOriginal<typeof WebGen2>(),
  CoreAssemblyClient: class {},
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('../../shell/LcosWorksiteStage', () => ({ LcosWorksiteStage: () => null }));
vi.mock('../../app/lcosCoreClient', () => ({ createLcosCoreSession: () => ({ http: {}, skills: { list: m.skills } }) }));
vi.mock('../../professional/useWarehouseBrowse', () => ({ useWarehouseBrowse: (...args: unknown[]) => { m.browse(...args); return { items: m.items, state: 'ready' }; } }));
vi.mock('../../navigation/childWorksiteNavigation', () => ({ beginChildWorksiteNavigation: m.enter }));
vi.mock('./workflowMethodDraft', async (original) => ({ ...await original<typeof import('./workflowMethodDraft')>(), readWorkflowMethodDraft: m.readMethod }));
vi.mock('../../lcosReferenceState', () => ({
  useLcosReferenceStore: Object.assign(
    (selector: (state: { draft: { orderedEntityRefs: typeof m.draftRefs } }) => unknown) =>
      selector({ draft: { orderedEntityRefs: m.draftRefs } }),
    { getState: () => ({ projectId: 'p1', addEntityToDraft: m.addEntityToDraft, addEntitiesToDraft: m.addEntitiesToDraft }) },
  ),
}));
vi.mock('../../shell/lcosShellStore', () => ({
  useLcosShellStore: Object.assign(
    (selector: (state: typeof m.shellState) => unknown) => selector(m.shellState),
    { getState: () => m.shellState },
  ),
}));
vi.mock('../../drop/railwayPointerDrop', async (original) => {
  const actual = await original<typeof import('../../drop/railwayPointerDrop')>();
  return { ...actual, createRailwayPointerDropController: () => actual.createRailwayPointerDropController({
    read: () => useLcosDropStore.getState(),
    begin: payload => { useLcosDropStore.getState().begin(payload); return true; },
    advance: () => true,
    commit: () => false,
    cancel: () => useLcosDropStore.getState().cancel(),
    currentProjectId: () => m.shellState.projectId,
  }) };
});
vi.mock('../../ui/workflow/WorkflowTaskCardView', () => ({
  WorkflowTaskCardView: ({ onEnter, onPreview, onUse, onDragStartCapture, onDragEndCapture, onPointerDown, carryHandle, draggable, entryAvailable, entryTargetLabel, alreadyInDraft, summary, entryControl }: {
    onEnter: () => void; onPreview: () => void; onUse?: (anchor: { x: number; y: number; width: number; height: number }) => void;
    onDragStartCapture?: (event: React.DragEvent<HTMLElement>) => void; onDragEndCapture?: () => void; draggable?: boolean;
    onPointerDown?: React.PointerEventHandler<HTMLElement>; carryHandle?: React.ReactNode;
    entryAvailable: boolean; entryTargetLabel?: string; alreadyInDraft?: boolean; summary?: string;
    entryControl?: React.ReactNode;
  }) => <div>
    <span data-entry-target>{entryTargetLabel ?? ''}</span>
    <span data-summary>{summary ?? ''}</span>
    <div data-assembly-drag-source draggable={draggable} onPointerDown={onPointerDown} onDragStartCapture={onDragStartCapture} onDragEndCapture={onDragEndCapture}>{carryHandle}</div>
    <button data-preview onClick={onPreview}>预览</button>
    {onUse && <button data-use onClick={() => onUse({ x: 48, y: 64, width: 120, height: 36 })}>{alreadyInDraft ? '已加入草稿' : '加入当前草稿'}</button>}
    <button data-enter disabled={!entryAvailable} onClick={onEnter}>进入</button>
    {entryControl}
  </div>,
}));


import type { Workspace } from '@local-creative-os/domain';
import type * as WebGen2 from '@local-creative-os/web-gen2';
import type { WorkflowMethodDraft } from './workflowMethodDraft';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const roots: Root[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.replaceChildren();
  vi.clearAllMocks();
  useLcosDropStore.getState().reset();
  m.draftRefs.length = 0;
  m.shellState.activeWorkspaceId = 'source';
  m.shellState.composerTarget = null;
  m.shellState.composerPrompt = '';
  m.addEntitiesToDraft.mockReturnValue({ added: 1 });
  m.readMethod.mockResolvedValue({ status: 'unavailable', reason: '这张工作流卡没有已保存的方法步骤，仍可进入工作现场或拖放。' });
});
async function mount(canvasId?: string, others: readonly Workspace[] = []) {
  const el = document.createElement('div'); document.body.append(el); const root = createRoot(el); roots.push(root);
  const target = { id: 'w1', name: '真实工作流现场', scopeId: 'wf1', preferredSurface: 'workflow', ...(canvasId === undefined ? {} : { canvasId }) } as Workspace;
  await act(async () => root.render(<WorkflowCardPool projectId="p1" sourceSurface="workflow" sourceWasChild={false} workspaces={[target, ...others]} onLeaveHand={m.onEntered} />));
  return el;
}
async function mountHandOverlay() {
  const el = document.createElement('div'); document.body.append(el); const root = createRoot(el); roots.push(root);
  await act(async () => root.render(<WorkflowHandOverlay projectId="p1" sourceSurface="workflow" sourceWasChild={false} workspaces={[]} open onClose={m.onEntered} />));
  return el;
}
it('light preview does not close the hand; successful entry retracts it through its existing owner', async () => {
  m.enter.mockReturnValue(true); const el = await mount('child-canvas');
  await act(async () => el.querySelector<HTMLButtonElement>('[data-preview]')?.click());
  expect(m.onEntered).not.toHaveBeenCalled(); expect(m.enter).not.toHaveBeenCalled();
  await act(async () => el.querySelector<HTMLButtonElement>('[data-enter]')?.click());
  expect(m.enter).toHaveBeenCalledWith(expect.objectContaining({ targetWorkspace: expect.objectContaining({ id: 'w1', canvasId: 'child-canvas' }) }));
  expect(m.onEntered).toHaveBeenCalledTimes(1);
});
it('a navigation refusal keeps the hand and its failure feedback', async () => {
  m.enter.mockReturnValue(false); const el = await mount('child-canvas');
  await act(async () => el.querySelector<HTMLButtonElement>('[data-enter]')?.click());
  expect(m.onEntered).not.toHaveBeenCalled();
  expect(el.textContent).toContain('工作流现场暂时无法进入');
});
it('a missing real canvas never pretends to have entered or closes the hand', async () => {
  const el = await mount();
  expect(el.querySelector<HTMLButtonElement>('[data-enter]')?.disabled).toBe(true);
  await act(async () => el.querySelector<HTMLButtonElement>('[data-enter]')?.click());
  expect(m.enter).not.toHaveBeenCalled(); expect(m.onEntered).not.toHaveBeenCalled();
});
it('enters the sole usable real worksite without an extra destination menu', async () => {
  const ready = { id: 'ready', name: '已就绪现场', scopeId: 'wf1', preferredSurface: 'workflow', canvasId: 'ready-canvas' } as Workspace;
  m.enter.mockResolvedValue(true); const el = await mount(undefined, [ready]);
  expect(el.querySelector('[data-entry-target]')?.textContent).toBe('已就绪现场');
  expect(el.querySelector('[aria-label="真实工作流现场"]')).toBeNull();
  await act(async () => el.querySelector<HTMLButtonElement>('[data-enter]')?.click());
  expect(m.enter).toHaveBeenCalledWith(expect.objectContaining({ targetWorkspace: ready }));
});
it('keeps multiple real addresses directly clickable and enters the exact named worksite', async () => {
  const second = { id: 'second', name: '第二现场', scopeId: 'wf1', preferredSurface: 'workflow', canvasId: 'second-canvas' } as Workspace;
  m.enter.mockResolvedValue(true); const el = await mount('first-canvas', [second]);
  expect(el.querySelectorAll('[aria-label="真实工作流现场"] button')).toHaveLength(2);
  expect(el.querySelector('[role="menu"]')).toBeNull();
  await act(async () => el.querySelector<HTMLButtonElement>('[aria-label="进入 第二现场"]')?.click());
  expect(m.enter).toHaveBeenCalledWith(expect.objectContaining({ targetWorkspace: second }));
});

it('keeps an unsupported workflow identity out of the message draft and preserves the current target', async () => {
  const target = {
    nodeId: 'conversation:conversation-a', title: '现有会话', anchor: { x: 1, y: 2, width: 3, height: 4 },
    intent: 'delegate' as const, receiverConversationId: 'conversation-a',
    targetReferences: [{ entityType: 'artifact', entityId: 'target-artifact' }],
  };
  m.shellState.composerTarget = target;
  const el = await mount('child-canvas');
  expect(el.querySelector('[data-entry-target]')?.textContent).toBe('真实工作流现场');
  expect(el.querySelector('[data-use]')).toBeNull();
  expect(el.querySelector<HTMLButtonElement>('[data-enter]')?.disabled).toBe(false);
  expect(el.querySelector('[data-assembly-drag-source]')?.getAttribute('draggable')).toBe('false');
  await act(async () => el.querySelector<HTMLButtonElement>('[data-preview]')?.click());
  expect(el.querySelector('[data-summary]')?.textContent).toBe('这张工作流卡没有已保存的方法步骤，仍可进入工作现场或拖放。');
  expect(m.addEntityToDraft).not.toHaveBeenCalled();
  expect(m.shellState.openComposer).not.toHaveBeenCalled();
  expect(m.onEntered).not.toHaveBeenCalled();
  expect(m.shellState.composerTarget).toBe(target);
});

it('keeps the existing receiver when a workflow has no take action for the input box', async () => {
  const target = { nodeId: 'conversation:conversation-a', title: '现有会话', anchor: { x: 1, y: 2, width: 3, height: 4 }, intent: 'continue' as const, receiverConversationId: 'conversation-a' };
  m.shellState.composerTarget = target;
  const el = await mount('child-canvas');
  expect(el.querySelector('[data-use]')).toBeNull();
  await act(async () => el.querySelector<HTMLButtonElement>('[data-preview]')?.click());
  expect(m.shellState.openComposer).not.toHaveBeenCalled();
  expect(m.onEntered).not.toHaveBeenCalled();
  expect(el.querySelector('[data-summary]')?.textContent).toContain('没有已保存的方法步骤');
  expect(m.addEntityToDraft).not.toHaveBeenCalled();
  expect(m.shellState.composerTarget).toBe(target);
});

it('takes a real authored method into the existing Composer prompt and exact Artifact refs without replacing the receiver or sending', async () => {
  const target = { nodeId: 'conversation:conversation-a', title: '现有会话', anchor: { x: 1, y: 2, width: 3, height: 4 }, intent: 'continue' as const, receiverConversationId: 'conversation-a' };
  m.shellState.composerTarget = target;
  m.shellState.composerPrompt = '用户已经写好的任务';
  const references = [{ entityType: 'artifact', entityId: 'a', revisionId: 'historical', artifactViewId: 'view-a', mimeType: 'text/markdown' }];
  const prompt = '工作流方法：核对\n来源 Scope：wf1\n来源 Presentation：workflow-p · version 3\n动作：对照检查';
  m.readMethod.mockResolvedValue({ status: 'ready', prompt, references });
  const el = await mount('child-canvas');
  expect(el.querySelector('[data-use]')).toBeNull();
  await act(async () => el.querySelector<HTMLButtonElement>('[data-preview]')?.click());
  expect(el.querySelector('[data-use]')).not.toBeNull();
  await act(async () => el.querySelector<HTMLButtonElement>('[data-use]')?.click());
  expect(m.addEntitiesToDraft).toHaveBeenCalledExactlyOnceWith(references, 'continue');
  expect(m.shellState.setComposerPrompt).toHaveBeenCalledExactlyOnceWith(`用户已经写好的任务\n\n${prompt}`);
  expect(m.shellState.openComposer).toHaveBeenCalledWith(expect.objectContaining({ intent: 'continue', receiverConversationId: 'conversation-a', nodeId: target.nodeId }));
  expect(m.enter).not.toHaveBeenCalled();
});

it('keeps the existing prompt and receiver when the real reference owner rejects method materials', async () => {
  const target = { nodeId: 'conversation:conversation-a', title: '现有会话', anchor: { x: 1, y: 2, width: 3, height: 4 }, intent: 'continue' as const, receiverConversationId: 'conversation-a' };
  m.shellState.composerTarget = target;
  m.shellState.composerPrompt = '原草稿';
  m.readMethod.mockResolvedValue({ status: 'ready', prompt: '真实方法说明', references: [{ entityType: 'artifact', entityId: 'a', revisionId: 'old' }] });
  m.addEntitiesToDraft.mockReturnValue({ added: 0, reason: '引用版本未确认' });
  const el = await mount('child-canvas');
  await act(async () => el.querySelector<HTMLButtonElement>('[data-preview]')?.click());
  await act(async () => el.querySelector<HTMLButtonElement>('[data-use]')?.click());
  expect(m.shellState.setComposerPrompt).not.toHaveBeenCalled();
  expect(m.shellState.openComposer).not.toHaveBeenCalled();
  expect(m.shellState.composerTarget).toBe(target);
  expect(el.querySelector('[data-summary]')?.textContent).toContain('引用版本未确认');
});

it('keeps ordinary left card drag out of Semantic Drop', async () => {
  const el = await mount('child-canvas');
  const source = el.querySelector<HTMLDivElement>('[data-assembly-drag-source]');
  expect(source?.getAttribute('draggable')).toBe('false');
  const setData = vi.fn();
  const dataTransfer = { effectAllowed: 'uninitialized', setData };
  const start = new Event('dragstart', { bubbles: true, cancelable: true });
  Object.defineProperty(start, 'dataTransfer', { value: dataTransfer });
  await act(async () => source?.dispatchEvent(start));
  expect(start.defaultPrevented).toBe(true);
  expect(setData).not.toHaveBeenCalled();
  await act(async () => {
    source?.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 31, pointerType: 'mouse', button: 0, buttons: 1, clientX: 20, clientY: 20, bubbles: true }));
    window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 31, pointerType: 'mouse', buttons: 1, clientX: 60, clientY: 20 }));
    window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 31, pointerType: 'mouse', button: 0, buttons: 0, clientX: 60, clientY: 20 }));
  });
  expect(useLcosDropStore.getState().state.status).toBe('idle');
});

it('starts right carry after movement and keeps the source hand mounted while Canvas receives', async () => {
  const el = await mountHandOverlay();
  const source = el.querySelector<HTMLDivElement>('[data-assembly-drag-source]');
  await act(async () => source?.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 32, pointerType: 'mouse', button: 2, buttons: 2, clientX: 20, clientY: 20, bubbles: true, cancelable: true })));
  expect(useLcosDropStore.getState().state.status).toBe('idle');
  await act(async () => window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 32, pointerType: 'mouse', buttons: 2, clientX: 60, clientY: 20, cancelable: true })));

  expect(useLcosDropStore.getState().state.status).toBe('tracking');
  expect(el.querySelector('[data-lcos-workflow-hand]')?.getAttribute('data-native-assembly-drop')).toBe('true');
  expect(el.querySelector('[data-assembly-drag-source]')).toBe(source);
  expect(source?.isConnected).toBe(true);
  expect(m.onEntered).not.toHaveBeenCalled();
  expect(useLcosDropStore.getState().state).toMatchObject({ payload: { sourceRef: { kind: 'workflow', id: 'wf1' },
    entityRef: { type: 'scope', id: 'wf1' }, reference: { entityType: 'scope', entityId: 'wf1' } } });
  await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(useLcosDropStore.getState().state.status).toBe('idle');
});

it.each(['alt', 'handle'] as const)('offers an explicit %s primary carry fallback without entering a worksite', async trigger => {
  const el = await mount('child-canvas');
  const target = el.querySelector<HTMLElement>(trigger === 'handle' ? '[data-semantic-drop-handle]' : '[data-assembly-drag-source]');
  expect(target).not.toBeNull();
  await act(async () => {
    target?.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 33, pointerType: 'mouse', button: 0, buttons: 1,
      altKey: trigger === 'alt', clientX: 20, clientY: 20, bubbles: true, cancelable: true }));
    window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 33, pointerType: 'mouse', buttons: 1, clientX: 60, clientY: 20, cancelable: true }));
  });
  expect(useLcosDropStore.getState().state.status).toBe('tracking');
  expect(m.enter).not.toHaveBeenCalled();
});

it('keeps the hand while a real entry promise is pending and on failed completion', async () => {
  let complete!: (value: boolean) => void;
  m.enter.mockImplementation(() => new Promise<boolean>(resolve => { complete = resolve; }));
  const el = await mount('child-canvas');
  await act(async () => el.querySelector<HTMLButtonElement>('[data-enter]')?.click());
  expect(m.onEntered).not.toHaveBeenCalled();
  await act(async () => complete(false));
  expect(m.onEntered).not.toHaveBeenCalled(); expect(el.textContent).toContain('工作流现场暂时无法进入');
});

it('does not request seventeen skills or let them turn one workflow into a large pool', async () => {
  const el = await mount('child-canvas');
  expect(m.skills).not.toHaveBeenCalled();
  expect(m.browse).toHaveBeenCalledWith(expect.anything(), 'p1', '', 'workflow');
  expect(el.querySelector('[data-card-layout]')?.getAttribute('data-card-layout')).toBe('hand');
  expect(el.querySelectorAll('[data-preview]')).toHaveLength(1);
  expect(el.querySelector('[data-lcos-card-lane="material"]')).toBeNull();
  expect(el.querySelector('[data-lcos-card-lane="receiver"]')).toBeNull();
});
