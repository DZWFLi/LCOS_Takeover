import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { AssemblyBody } from './AssemblyBody';
import { composerInputKey } from '../composer/composerInputJourney';
import { useLcosDropStore } from '../lcosDropState';
import { useLcosReferenceStore } from '../lcosReferenceState';

import type * as RailwayPointerDropModule from '../drop/railwayPointerDrop';
import type * as ReferenceModule from '../lcosReferenceState';
import type { ReactElement, ReactNode } from 'react';

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  projectId: 'project-a',
  warehouse: vi.fn(),
  apply: vi.fn(),
  captureSnapshot: vi.fn(),
  capturePreview: vi.fn(),
  resourceList: vi.fn(),
  resourceDescriptor: vi.fn(),
  skillList: vi.fn(),
  skillRead: vi.fn(),
  workspaces: vi.fn(),
  openWindow: vi.fn(),
  openComposer: vi.fn(),
  closeComposer: vi.fn(),
  addReference: vi.fn(),
  navigate: vi.fn(),
  beginChildNavigation: vi.fn(),
  composerTarget: null as {
    nodeId: string;
    title: string;
    anchor: { x: number; y: number; width: number; height: number };
    intent: 'delegate';
    workspaceId: string;
  } | null,
}));

// R4：AssemblyBody 现在消费 web-gen2 的 AssemblySourceBayController / assemblyCardView，
// 以及 lcosDropState 的 idleDrop——必须 partial mock，否则整棵模块图会拿到 undefined。
vi.mock('@local-creative-os/web-gen2', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    CoreAssemblyClient: class {
      getWarehouse = mocks.warehouse;
      queryWarehouse = mocks.warehouse;
      apply = mocks.apply;
    },
  };
});
vi.mock('../app/lcosCoreClient', () => ({
  createLcosCoreSession: () => ({
    http: {},
    projects: { getWorkspaces: mocks.workspaces },
    assembly: { getWarehouse: mocks.warehouse, queryWarehouse: async (projectId: string, ...args: unknown[]) => {
      const snapshot = await mocks.warehouse(projectId, ...args);
      return { schemaVersion: 1, projectId, ...snapshot };
    }, apply: mocks.apply },
    captureSpace: { snapshot: mocks.captureSnapshot, preview: mocks.capturePreview },
    resources: { list: mocks.resourceList, descriptor: mocks.resourceDescriptor },
    skills: { list: mocks.skillList, read: mocks.skillRead },
  }),
}));
vi.mock('../lcosReferenceState', async importOriginal => {
  const actual = await importOriginal<typeof ReferenceModule>();
  const store = actual.useLcosReferenceStore;
  const add = store.getState().addEntitiesToDraft;
  store.setState({ addEntitiesToDraft: (refs, intent) => {
    refs.forEach(ref => mocks.addReference(ref));
    return add(refs, intent);
  } });
  return actual;
});
vi.mock('../surfaces/workflow/workflowMethodDraft', () => ({
  readWorkflowScopeMethodDraft: async () => ({ status: 'unavailable', reason: '此工作流没有已保存的方法步骤，原草稿保留。' }),
}));
vi.mock('../ui/professional/AssemblyMasonryView', () => ({
  AssemblyMasonryView: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('../shell/lcosShellStore', () => {
  const shellState = {
    projectId: 'project-a',
    composerPrompt: '原任务',
    setComposerPrompt: vi.fn(),
    resumeComposer: mocks.openComposer,
    openWindow: mocks.openWindow,
    openComposer: mocks.openComposer,
    closeComposer: mocks.closeComposer,
    composerOpen: false as boolean,
    composerTarget: null as typeof mocks.composerTarget,
    activeSurface: 'main' as const,
    activeWorkspaceId: null,
    beginChildNavigation: mocks.beginChildNavigation,
  };
  const currentShellState = () => ({
    ...shellState,
    projectId: mocks.projectId,
    composerOpen: mocks.composerTarget !== null,
    composerTarget: mocks.composerTarget,
  });
  const useLcosShellStore = Object.assign(
    (select: (state: typeof shellState) => unknown) => select(currentShellState()),
    { getState: currentShellState },
  );
  return { useLcosShellStore };
});
vi.mock('../drop/railwayPointerDrop', async (original) => {
  const actual = await original<typeof RailwayPointerDropModule>();
  return { ...actual, createRailwayPointerDropController: () => actual.createRailwayPointerDropController({
    read: () => useLcosDropStore.getState(),
    begin: payload => { useLcosDropStore.getState().begin(payload, undefined, undefined, 'panel-pointer'); return true; },
    advance: () => true,
    commit: () => false,
    cancel: () => useLcosDropStore.getState().cancel(),
    currentProjectId: () => mocks.projectId,
  }) };
});
vi.mock('../navigation/childWorksiteNavigation', () => ({
  beginChildWorksiteNavigation: (input: {
    readonly projectId: string;
    readonly targetSurface: string;
    readonly targetWorkspace: { readonly id: string };
    readonly navigate: (to: string) => void;
  }) => {
    mocks.beginChildNavigation(input);
    input.navigate(`/projects/${encodeURIComponent(input.projectId)}/${input.targetSurface}?workspaceId=${encodeURIComponent(String(input.targetWorkspace.id))}`);
    return true;
  },
}));
vi.mock('../nodes/CanonicalCollectionView',()=>({CanonicalCollectionView:()=> <span>实际集合成员读面单独验收</span>}));
vi.mock('../composer/LcosComposerHost', () => ({
  LcosComposerHost: () => <div data-lcos-composer />,
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate }));
vi.mock('../ui/LcosSurfaceFeedback', () => ({
  LcosSurfaceFeedback: ({ message }: { message: string }) => (
    <div>{message}</div>
  ),
}));
vi.mock('../ui/lcosTokens', () => ({
  lcosTokens: {
    color: {
      raised: '#eee',
      muted: '#888',
      surface: '#fff',
      borderSubtle: '#ddd',
      text: '#111',
      info: '#06c',
      inverse: '#111',
      textOnInverse: '#fff',
      accent: '#0a0',
      danger: '#a00',
    },
    shadow: { default: 'none' },
  },
}));
vi.mock('@/components/Common/DropdownMenu', () => ({
  DropdownMenu: ({
    trigger,
    children,
  }: {
    trigger: ReactElement;
    children: ReactNode;
  }) => (
    <div data-test-dropdown>
      {trigger}
      {children}
    </div>
  ),
  DropdownMenuItem: ({
    children,
    ...props
  }: {
    children: ReactNode;
    disabled?: boolean;
    onClick?: () => void;
  }) => (
    <button type="button" data-test-dropdown-item {...props}>
      {children}
    </button>
  ),
  DropdownMenuSubmenu: ({ label, children }: { label: ReactNode; children: ReactNode }) => (
    <div data-test-dropdown-submenu>
      <span data-test-dropdown-submenu-label>{label}</span>
      {children}
    </div>
  ),
}));

const artifact = (id: string, title: string) => ({
  schemaVersion: 1,
  entityRef: { type: 'artifact', id, viewId: id },
  presentedRevisionId: 'saved-revision',
  kind: 'artifact',
  title,
  usageCount: 0,
});
const scene = (id: string, title: string) => ({
  schemaVersion: 1,
  entityRef: { type: 'scene', id },
  kind: 'scene',
  title,
  usageCount: 0,
});
const context = (id: string, title: string) => ({
  schemaVersion: 1,
  entityRef: { type: 'context', id },
  kind: 'context',
  title,
  usageCount: 0,
});

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  mocks.warehouse.mockReset();
  mocks.apply.mockReset();
  mocks.captureSnapshot.mockReset();
  mocks.capturePreview.mockReset();
  mocks.resourceList.mockReset();
  mocks.resourceDescriptor.mockReset();
  mocks.skillList.mockReset();
  mocks.skillRead.mockReset();
  mocks.workspaces.mockReset();
  mocks.openWindow.mockReset();
  mocks.openComposer.mockReset();
  mocks.closeComposer.mockReset();
  mocks.addReference.mockReset();
  mocks.navigate.mockReset();
  mocks.beginChildNavigation.mockReset();
  mocks.composerTarget = null;
  useLcosReferenceStore.getState().reset();
  useLcosDropStore.getState().reset();
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

const mainTargetRef = { kind: 'main' } as const;
async function render(projectId: string, composerOriginKey?: string): Promise<void> {
  mocks.projectId = projectId;
  useLcosReferenceStore.getState().setProject(projectId);
  await act(async () => {
    root.render(
      <AssemblyBody projectId={projectId} targetRef={mainTargetRef}
        {...(composerOriginKey === undefined ? {} : { composerOriginKey })} />,
    );
  });
}

it('opens the canonical archive body from Assembly instead of fabricating a second page', async () => {
  mocks.warehouse.mockResolvedValue({ items: [] });
  mocks.workspaces.mockResolvedValue([]);
  await render('project-a');
  await act(async () => mocks.warehouse.mock.results[0]?.value);
  const archive = [...host.querySelectorAll<HTMLButtonElement>('button')]
    .find((button) => button.textContent?.includes('查看归档'));
  if (!archive) throw new Error('archive entry missing');
  await act(async () => archive.click());
  expect(mocks.openWindow).toHaveBeenCalledWith('archive', '归档');
});

it('uses plain Chinese for read failures while keeping the real diagnostic code in a tooltip', async () => {
  mocks.warehouse.mockRejectedValue(Object.assign(new Error('failed'), { code: 'READ_SOURCE_42' }));
  mocks.workspaces.mockResolvedValue([]);
  await render('project-a');
  await act(async () => mocks.warehouse.mock.results[0]?.value.catch(() => undefined));
  const failure = host.querySelector<HTMLElement>('[data-lcos-assembly-error="project"]');
  expect(failure?.textContent).toContain('材料读取失败，请重试。');
  expect(failure?.textContent).not.toContain('READ_SOURCE_42');
  expect(failure?.title).toBe('读取诊断代码：READ_SOURCE_42');
});

it('cannot let a late A response replace the already loaded B warehouse', async () => {
  const a = deferred<{ items: readonly unknown[] }>();
  const b = deferred<{ items: readonly unknown[] }>();
  mocks.warehouse.mockImplementation((projectId: string) =>
    projectId === 'project-a' ? a.promise : b.promise,
  );
  mocks.workspaces.mockResolvedValue([]);

  await render('project-a');
  await render('project-b');
  b.resolve({ items: [artifact('b-artifact', 'B 内容')] });
  await act(async () => b.promise);
  expect(host.textContent).toContain('B 内容');

  a.resolve({ items: [artifact('a-artifact', 'A 内容')] });
  await act(async () => a.promise);
  expect(host.textContent).toContain('B 内容');
  expect(host.textContent).not.toContain('A 内容');
});

it('opens a scene using the resolved real workspace canvas id', async () => {
  mocks.warehouse.mockResolvedValue({
    items: [scene('workspace-1', '现场一')],
  });
  mocks.workspaces.mockResolvedValue([
    { id: 'workspace-1', canvasId: 'canvas-real' },
  ]);

  await render('project-a');
  await act(async () => mocks.warehouse.mock.results[0]?.value);
  const take = host.querySelector<HTMLButtonElement>(
    '[data-lcos-assembly-more]',
  );
  if (!take) { throw new Error('取用 action missing'); }
  await act(async () => take.click());
  const open = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (button) => button.textContent?.includes('预览现场'),
  );
  if (!open) { throw new Error('现场 open action missing'); }
  await act(async () => open.click());

  expect(mocks.openWindow).toHaveBeenCalledWith(
    'portal-preview',
    '预览现场 · 现场一',
    'canvas-real',
    'canvas',
    { workspaceId: 'workspace-1' },
  );
});

it('keeps artifact cards available when workspace loading fails', async () => {
  mocks.warehouse.mockResolvedValue({
    items: [artifact('artifact-1', '可用材料')],
  });
  mocks.workspaces.mockRejectedValue(new Error('workspace unavailable'));

  await render('project-a');
  await act(async () => mocks.warehouse.mock.results[0]?.value);
  expect(host.textContent).toContain('可用材料');
  expect(
    host.querySelector('[data-lcos-assembly-item="artifact-1"]'),
  ).not.toBeNull();
});

it('does not mistake a connected conversation warehouse ID for a session receiver or material reference', async () => {
  mocks.warehouse.mockResolvedValue({
    items: [{ schemaVersion: 1, entityRef: { type: 'conversation', id: 'conversation-a' }, kind: 'conversation', title: '会话 A', usageCount: 0 }],
  });
  mocks.workspaces.mockResolvedValue([]);

  await render('project-a');
  await act(async () => mocks.warehouse.mock.results[0]?.value);
  await act(async () => host.querySelector<HTMLButtonElement>('[data-lcos-assembly-more]')?.click());
  await act(async () => host.querySelector<HTMLButtonElement>('[data-lcos-assembly-add]')?.click());

  expect(mocks.addReference).not.toHaveBeenCalled();
  expect(mocks.openComposer).not.toHaveBeenCalled();
  expect(host.querySelector<HTMLButtonElement>('[data-lcos-assembly-add]')?.disabled).toBe(true);
});

it('keeps a material reference in the existing draft without creating an Assembly Composer or inventing a receiver', async () => {
  mocks.warehouse.mockResolvedValue({
    items: [artifact('artifact-a', '材料 A')],
  });
  mocks.workspaces.mockResolvedValue([]);

  await render('project-a');
  await act(async () => mocks.warehouse.mock.results[0]?.value);
  await act(async () => host.querySelector<HTMLButtonElement>('[data-lcos-assembly-more]')?.click());
  await act(async () => host.querySelector<HTMLButtonElement>('[data-lcos-assembly-add]')?.click());

  expect(mocks.addReference).toHaveBeenCalledWith(expect.objectContaining({ entityType: 'artifact', entityId: 'artifact-a' }));
  expect(mocks.openComposer).not.toHaveBeenCalled();
  expect(useLcosReferenceStore.getState().draft.orderedEntityRefs).toMatchObject([{ entityType: 'artifact', entityId: 'artifact-a', revisionId: 'saved-revision' }]);
});

it('offers every exact context scope workspace and opens the selected canvas', async () => {
  mocks.warehouse.mockResolvedValue({
    items: [context('scope-c', '上下文 C')],
  });
  mocks.workspaces.mockResolvedValue([
    {
      id: 'workspace-1',
      scopeId: 'scope-c',
      name: '现场一',
      canvasId: 'canvas-one',
    },
    {
      id: 'workspace-2',
      scopeId: 'scope-c',
      name: '现场二',
      canvasId: 'canvas-two',
    },
    {
      id: 'workspace-other',
      scopeId: 'scope-other',
      name: '无关现场',
      canvasId: 'canvas-other',
    },
    {
      id: 'workspace-empty',
      scopeId: 'scope-c',
      name: '未就绪现场',
      canvasId: undefined,
    },
  ]);

  await render('project-a');
  await act(async () => mocks.warehouse.mock.results[0]?.value);
  expect(mocks.openWindow).not.toHaveBeenCalled();

  const take = host.querySelector<HTMLButtonElement>(
    '[data-lcos-assembly-more]',
  );
  if (!take) { throw new Error('取用 action missing'); }
  await act(async () => take.click());

  const menuItems = [
    ...host.querySelectorAll<HTMLButtonElement>('[data-test-dropdown-item]'),
  ];
  expect(menuItems.map((item) => item.textContent)).toEqual([
    '预览现场',
    '进入现场',
    '预览现场',
    '进入现场',
    '预览现场',
    '进入现场',
  ]);
  expect(menuItems[4]?.disabled).toBe(true);
  expect(menuItems[5]?.disabled).toBe(true);

  await act(async () => menuItems[2]?.click());
  expect(mocks.openWindow).toHaveBeenCalledTimes(1);
  expect(mocks.openWindow).toHaveBeenCalledWith(
    'portal-preview',
    '预览现场 · 现场二',
    'canvas-two',
    'canvas',
    { workspaceId: 'workspace-2' },
  );
});

it('enters an exact context child workspace through the shared route, without guessing a canvas', async () => {
  mocks.warehouse.mockResolvedValue({
    items: [context('scope-c', '上下文 C')],
  });
  mocks.workspaces.mockResolvedValue([
    { id: 'workspace-context', scopeId: 'scope-c', name: 'Context 子现场', canvasId: 'canvas-context' },
  ]);

  await render('project-a');
  await act(async () => mocks.warehouse.mock.results[0]?.value);
  const take = host.querySelector<HTMLButtonElement>('[data-lcos-assembly-more]');
  if (!take) { throw new Error('取用 action missing'); }
  await act(async () => take.click());
  const enter = [...host.querySelectorAll<HTMLButtonElement>('[data-test-dropdown-item]')]
    .find((button) => button.textContent?.includes('进入现场'));
  if (!enter) { throw new Error('进入现场 action missing'); }
  await act(async () => enter.click());

  expect(mocks.beginChildNavigation).toHaveBeenCalledWith(expect.objectContaining({
    projectId: 'project-a',
    sourceSurface: 'main',
    sourceWasChild: false,
  }));
  expect(mocks.navigate).toHaveBeenCalledWith('/projects/project-a/context?workspaceId=workspace-context');
});

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}


it('reports a Workflow without saved method steps and does not insert a raw Scope or create a second input', async () => {
  mocks.warehouse.mockResolvedValue({ items: [{ schemaVersion: 1, entityRef: { type: 'workflow', id: 'workflow-scope' }, kind: 'workflow', title: '工作流', usageCount: 0 }] });
  mocks.workspaces.mockResolvedValue([]);
  mocks.composerTarget = { nodeId: 'original-input', title: '原任务', intent: 'delegate', workspaceId: 'workspace-main', anchor: { x: 0, y: 0, width: 200, height: 100 } };
  await render('project-a');
  await act(async () => host.querySelector<HTMLButtonElement>('[data-lcos-assembly-add]')?.click());
  expect(mocks.addReference).not.toHaveBeenCalled();
  expect(host.textContent).toContain('没有已保存的方法步骤');
  expect(mocks.openComposer).not.toHaveBeenCalled();
  expect(mocks.apply).not.toHaveBeenCalled();
});

it('submits selected source identities once and retains only incomplete selections', async () => {
  mocks.warehouse.mockResolvedValue({ items: [artifact('a', '材料 A'), artifact('b', '材料 B')] });
  mocks.workspaces.mockResolvedValue([]);
  const pending = deferred<unknown>();
  mocks.apply.mockReturnValue(pending.promise);
  await render('project-a');
  await act(async () => {
    host.querySelector<HTMLInputElement>('input[aria-label="选择 材料 A"]')?.click();
    host.querySelector<HTMLInputElement>('input[aria-label="选择 材料 B"]')?.click();
  });
  const apply = host.querySelector<HTMLButtonElement>('[data-lcos-assembly-batch-apply]');
  expect(apply).not.toBeNull();
  await act(async () => { apply?.click(); apply?.click(); });
  expect(mocks.apply).toHaveBeenCalledTimes(1);
  expect(mocks.apply).toHaveBeenCalledWith('project-a', expect.objectContaining({
    projectId: 'project-a', targetRef: { kind: 'main' },
    sourceRefs: [{ kind: 'artifactView', id: 'a' }, { kind: 'artifactView', id: 'b' }],
  }));
  expect(apply?.disabled).toBe(true);
  pending.resolve({ schemaVersion: 1, projectId: 'project-a', allApplied: false, results: [
    { sourceRef: { kind: 'artifactView', id: 'a' }, status: 'applied', channel: 'workspace-membership', changeSetId: 'change-a' },
    { sourceRef: { kind: 'artifactView', id: 'b' }, status: 'failed', channel: 'error', message: '未落地' },
  ] });
  await act(async () => pending.promise);
  expect(host.querySelector<HTMLInputElement>('input[aria-label="选择 材料 A"]')?.checked).toBe(false);
  expect(host.querySelector<HTMLInputElement>('input[aria-label="选择 材料 B"]')?.checked).toBe(true);
  expect(host.textContent).toContain('1 项已放入 · 失败 1');
  expect(host.textContent).not.toContain('全部成功');
});

it('keeps the failed-apply retry guard current after Assembly enters Composer reference picking', async () => {
  mocks.warehouse.mockResolvedValue({ schemaVersion: 1, projectId: 'project-a', totalApprox: 1, items: [
    { schemaVersion: 1, entityRef: { id: 'context-a', type: 'context' }, kind: 'context', title: '上下文 A', usageCount: 0 },
  ] });
  mocks.workspaces.mockResolvedValue([]);
  mocks.apply.mockResolvedValue({
    schemaVersion: 1,
    projectId: 'project-a',
    allApplied: false,
    results: [{ sourceRef: { kind: 'context', id: 'context-a' }, status: 'failed', channel: 'error', message: '未落地' }],
  });
  await render('project-a');
  await act(async () => mocks.warehouse.mock.results[0]?.value);
  expect(host.textContent).toContain('上下文 A');

  const drop = host.querySelector<HTMLButtonElement>('[data-lcos-assembly-drop]');
  if (!drop) throw new Error('Assembly apply action missing');
  await act(async () => { drop.click(); await Promise.resolve(); });
  expect(mocks.apply).toHaveBeenCalledTimes(1);
  expect(host.querySelector('[data-lcos-assembly-retry-failed]')).not.toBeNull();

  const target = {
    nodeId: 'main-node', title: '施工纪律', anchor: { x: 20, y: 30, width: 140, height: 44 },
    intent: 'delegate' as const, workspaceId: 'workspace-main',
  };
  const originKey = composerInputKey(target);
  if (originKey === undefined) throw new Error('Composer input key is missing');
  mocks.composerTarget = target;
  await render('project-a', originKey);

  const retry = host.querySelector<HTMLButtonElement>('[data-lcos-assembly-retry-failed]');
  if (!retry) throw new Error('Retry control missing after entering Composer reference picking');
  await act(async () => retry.click());
  expect(mocks.apply).toHaveBeenCalledTimes(1);
});

it('does not call an unconfirmed transport failure a failed write or retry it automatically', async () => {
  mocks.warehouse.mockResolvedValue({ items: [artifact('a', '材料 A')] });
  mocks.workspaces.mockResolvedValue([]);
  mocks.apply.mockRejectedValue(new Error('连接中断'));
  await render('project-a');
  await act(async () => host.querySelector<HTMLButtonElement>('[data-lcos-assembly-drop]')?.click());
  expect(host.textContent).toContain('结果尚未确认');
  expect(host.textContent).toContain('不会自动重发');
  expect(host.textContent).toContain('尚未确认');
  expect(host.textContent).not.toContain('投放失败 · 没有来源落地');
  expect(mocks.apply).toHaveBeenCalledTimes(1);
});

it('does not reopen a source preview when its late result arrives after closing', async () => {
  mocks.warehouse.mockResolvedValue({ items: [] });
  mocks.workspaces.mockResolvedValue([]);
  mocks.captureSnapshot.mockResolvedValue({ items: [{ id: 'capture-a', kind: 'web_page', source: { title: '原始网页', url: 'https://example.org/a' } }] });
  const pending = deferred<unknown>();
  mocks.capturePreview.mockReturnValue(pending.promise);
  await render('project-a');
  await act(async () => host.querySelector<HTMLButtonElement>('[data-lcos-assembly-source-tab="capture"]')?.click());
  await act(async () => host.querySelector<HTMLButtonElement>('[data-lcos-assembly-preview-open="capture:capture-a"]')?.click());
  expect(host.querySelector('[data-lcos-assembly-preview]')).not.toBeNull();
  await act(async () => host.querySelector<HTMLButtonElement>('[data-lcos-assembly-preview-close]')?.click());
  pending.resolve({ type: 'text', text: '已经关闭的旧内容' });
  await act(async () => pending.promise);
  expect(host.querySelector('[data-lcos-assembly-preview]')).toBeNull();
  expect(host.textContent).not.toContain('已经关闭的旧内容');
});

it('keeps plain left dragging and selection controls out of Assembly carry', async () => {
  mocks.warehouse.mockResolvedValue({ items: [artifact('a', '材料 A')] });
  mocks.workspaces.mockResolvedValue([]);
  await render('project-a');
  const source = host.querySelector<HTMLElement>('[data-lcos-assembly-item="a"]');
  expect(source?.getAttribute('draggable')).toBe('false');
  const start = new Event('dragstart', { bubbles: true, cancelable: true });
  const setData = vi.fn();
  Object.defineProperty(start, 'dataTransfer', { value: { setData } });
  await act(async () => source?.dispatchEvent(start));
  expect(start.defaultPrevented).toBe(true);
  expect(setData).not.toHaveBeenCalled();
  await act(async () => {
    source?.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 71, pointerType: 'mouse', button: 0, buttons: 1, clientX: 20, clientY: 20, bubbles: true }));
    window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 71, pointerType: 'mouse', buttons: 1, clientX: 60, clientY: 20 }));
    source?.querySelector('input[type="checkbox"]')?.dispatchEvent(new PointerEvent('pointerdown', {
      pointerId: 72, pointerType: 'mouse', button: 0, buttons: 1, altKey: true, bubbles: true }));
    window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 72, pointerType: 'mouse', buttons: 1, clientX: 60, clientY: 20 }));
  });
  expect(useLcosDropStore.getState().state.status).toBe('idle');
  expect(mocks.apply).not.toHaveBeenCalled();
});

it.each(['right', 'alt', 'handle'] as const)('carries the exact Assembly version through the shared %s entry', async trigger => {
  mocks.warehouse.mockResolvedValue({ items: [artifact('a', '材料 A')] });
  mocks.workspaces.mockResolvedValue([]);
  await render('project-a');
  const source = host.querySelector<HTMLElement>(trigger === 'handle'
    ? '[data-lcos-assembly-item="a"] [data-semantic-drop-handle]' : '[data-lcos-assembly-item="a"]');
  const right = trigger === 'right';
  await act(async () => source?.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 73, pointerType: 'mouse',
    button: right ? 2 : 0, buttons: right ? 2 : 1, altKey: trigger === 'alt', clientX: 20, clientY: 20, bubbles: true, cancelable: true })));
  expect(useLcosDropStore.getState().state.status).toBe('idle');
  await act(async () => window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 73, pointerType: 'mouse',
    buttons: right ? 2 : 1, clientX: 60, clientY: 20, cancelable: true })));
  expect(useLcosDropStore.getState().state).toMatchObject({ status: 'tracking', payload: { kind: 'assembly',
    itemId: 'a', sourceRef: { kind: 'artifactView', id: 'a' }, entityRef: { type: 'artifact', id: 'a' },
    reference: { entityType: 'artifact', entityId: 'a', artifactViewId: 'a', revisionId: 'saved-revision' } } });
  expect(mocks.apply).not.toHaveBeenCalled();
  await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(useLcosDropStore.getState().state.status).toBe('idle');
});

it('uses the same canonical Scope payload for Assembly Workflow carry and the hand', async () => {
  mocks.warehouse.mockResolvedValue({ items: [{ schemaVersion: 1, entityRef: { type: 'workflow', id: 'wf' },
    kind: 'workflow', title: '真实工作流', usageCount: 0 }] });
  mocks.workspaces.mockResolvedValue([]);
  await render('project-a');
  const source = host.querySelector<HTMLElement>('[data-lcos-assembly-item="wf"]');
  await act(async () => {
    source?.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 74, pointerType: 'mouse', button: 2, buttons: 2,
      clientX: 20, clientY: 20, bubbles: true, cancelable: true }));
    window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 74, pointerType: 'mouse', buttons: 2, clientX: 60, clientY: 20 }));
  });
  expect(useLcosDropStore.getState().state).toMatchObject({ status: 'tracking', payload: {
    sourceRef: { kind: 'workflow', id: 'wf' }, entityRef: { type: 'scope', id: 'wf' },
    reference: { entityType: 'scope', entityId: 'wf', displayLabel: '真实工作流' } } });
});


it.each(['right','alt','handle'] as const)('carries canonical Collection from its actual Assembly row via %s without calling legacy Apply',async trigger=>{
  mocks.warehouse.mockResolvedValue({items:[{schemaVersion:1,kind:'collection',title:'真实集合',
    entityRef:{type:'collection',id:'canonical-collection'},usageCount:0}]});
  mocks.workspaces.mockResolvedValue([]);
  await render('project-a');
  const row=host.querySelector<HTMLElement>('[data-lcos-assembly-item="canonical-collection"]');
  expect(row).not.toBeNull();
  expect(row?.querySelector('[data-semantic-drop-handle]')).not.toBeNull();
  expect(row?.querySelector('[data-lcos-assembly-drop]')).toBeNull();
  const source=trigger==='handle'?row?.querySelector('[data-semantic-drop-handle]'):row;
  const right=trigger==='right';
  await act(async()=>{
    source?.dispatchEvent(new PointerEvent('pointerdown',{pointerId:81,pointerType:'mouse',button:right?2:0,
      buttons:right?2:1,altKey:trigger==='alt',clientX:20,clientY:20,bubbles:true,cancelable:true}));
    window.dispatchEvent(new PointerEvent('pointermove',{pointerId:81,pointerType:'mouse',buttons:right?2:1,clientX:60,clientY:20}));
  });
  expect(useLcosDropStore.getState().state).toMatchObject({status:'tracking',payload:{kind:'assembly',
    sourceRef:{kind:'collection',id:'canonical-collection'},entityRef:{type:'collection',id:'canonical-collection'},
    reference:{entityType:'collection',entityId:'canonical-collection'}}});
  expect(mocks.apply).not.toHaveBeenCalled();
  await act(async()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  expect(useLcosDropStore.getState().state.status).toBe('idle');
  expect(row?.isConnected).toBe(true);
});

it.each(['right','alt','handle'] as const)('carries the entire checked file selection through the actual library row via %s', async trigger => {
  mocks.warehouse.mockResolvedValue({items:[artifact('file-one','第一份文件'),artifact('file-two','第二份文件')]});
  mocks.workspaces.mockResolvedValue([]);
  await render('project-a');
  await act(async()=>{
    host.querySelector<HTMLInputElement>('[data-lcos-assembly-item="file-one"] input[type="checkbox"]')?.click();
    host.querySelector<HTMLInputElement>('[data-lcos-assembly-item="file-two"] input[type="checkbox"]')?.click();
  });
  const row = host.querySelector<HTMLElement>('[data-lcos-assembly-item="file-one"]')!;
  const origin = trigger === 'handle' ? row.querySelector('[data-semantic-drop-handle]') : row;
  const right = trigger === 'right';
  await act(async()=>{
    origin?.dispatchEvent(new PointerEvent('pointerdown',{pointerId:83,pointerType:'mouse',button:right?2:0,
      buttons:right?2:1,altKey:trigger==='alt',clientX:20,clientY:20,bubbles:true,cancelable:true}));
    window.dispatchEvent(new PointerEvent('pointermove',{pointerId:83,pointerType:'mouse',buttons:right?2:1,clientX:60,clientY:20}));
  });
  expect(useLcosDropStore.getState().state).toMatchObject({status:'tracking',payload:{kind:'objects',objects:[
    {entityType:'artifact',entityId:'file-one',artifactViewId:'file-one',revisionId:'saved-revision'},
    {entityType:'artifact',entityId:'file-two',artifactViewId:'file-two',revisionId:'saved-revision'},
  ]}});
  expect(mocks.apply).not.toHaveBeenCalled();
  await act(async()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  expect(useLcosDropStore.getState().state.status).toBe('idle');
  expect(host.querySelectorAll('input:checked')).toHaveLength(2);
});

it.each(['capture','sources'] as const)('the actual %s tab carries both checked sources and keeps them on cancel',async tab=>{
  mocks.warehouse.mockResolvedValue({items:[]});mocks.workspaces.mockResolvedValue([]);
  mocks.captureSnapshot.mockResolvedValue({items:['one','two'].map(id=>({id:`capture-${id}`,kind:'web_page',source:{title:`收件 ${id}`,url:`https://example.org/${id}`}}))});
  mocks.capturePreview.mockResolvedValue({type:'text',text:'预览'});
  mocks.resourceList.mockResolvedValue(['one','two'].map(id=>({resourceId:`resource-${id}`,title:`来源 ${id}`})));
  mocks.resourceDescriptor.mockResolvedValue({});
  await render('project-a');
  await act(async()=>host.querySelector<HTMLButtonElement>(`[data-lcos-assembly-source-tab="${tab}"]`)?.click());
  const boxes=host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');expect(boxes).toHaveLength(2);
  await act(async()=>boxes.forEach(box=>box.click()));
  const row=boxes[0]?.closest<HTMLElement>('.lcos-assembly-item');if(!row)throw new Error('Actual selected row missing');
  await act(async()=>{
    row.dispatchEvent(new MouseEvent('pointerdown',{bubbles:true,cancelable:true,button:2,buttons:2,clientX:10,clientY:10}));
    window.dispatchEvent(new MouseEvent('pointermove',{bubbles:true,cancelable:true,buttons:2,clientX:70,clientY:90}));
  });
  expect(useLcosDropStore.getState().state).toMatchObject({status:'tracking',payload:{kind:'objects',objects:[
    {entityType:tab==='capture'?'capture':'resource',entityId:tab==='capture'?'capture-one':'resource-one'},
    {entityType:tab==='capture'?'capture':'resource',entityId:tab==='capture'?'capture-two':'resource-two'},
  ]}});
  expect(mocks.apply).not.toHaveBeenCalled();
  await act(async()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})));
  expect(useLcosDropStore.getState().state.status).toBe('idle');
  expect(host.querySelectorAll('input[type="checkbox"]:checked')).toHaveLength(2);
});
