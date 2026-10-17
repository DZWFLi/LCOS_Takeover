import { beforeEach, describe, expect, it } from 'vitest';

import { useLcosShellStore } from './lcosShellStore';
import { activeWindowIdForRegion, createWindowRegion, windowIdsForRegion } from './windowRegionTopology';
import { readProfessionalWindowLayout } from '../professional/professionalWindowPersistence';

beforeEach(() => { localStorage.clear(); useLcosShellStore.getState().clear(); });

it('keeps the exact source page on reload and clears it when the Reader is reused without an origin', () => {
  const store = useLcosShellStore.getState();
  store.setProject('reader-source-page');
  store.openReader('原 PDF 第2页', 'pdf-a', { revisionId: 'old-revision', sourceLocator: { kind: 'page', pageNumber: 2 } });
  expect(readProfessionalWindowLayout('reader-source-page')?.windows[0]).toMatchObject({ readerRevisionId: 'old-revision', sourceLocator: { kind: 'page', pageNumber: 2 } });
  store.setProject('other'); store.setProject('reader-source-page');
  expect(useLcosShellStore.getState().windows[0]?.sourceLocator).toEqual({ kind: 'page', pageNumber: 2 });
  store.openReader('原 PDF', 'pdf-a', { revisionId: 'old-revision' });
  expect(useLcosShellStore.getState().windows).toHaveLength(1);
  expect(useLcosShellStore.getState().windows[0]).not.toHaveProperty('sourceLocator');
});

it('isolates project windows and drafts, restores them on return, and never replays old camera commands', () => {
  const store = useLcosShellStore.getState();
  store.clear();
  store.setProject('a');
  store.openWindow('reader', 'A', 'artifact-a');
  store.openComposer({ nodeId: 'a-node', title: 'A', anchor: { x: 1, y: 2, width: 3, height: 4 } });
  store.setComposerPrompt('draft A');
  store.setActiveWorkspaceId('workspace-a');
  store.setSurfaceCanvasId('main', 'canvas-a');
  store.requestCamera('fit');
  store.requestLocate({ reqId: 'a', surface: 'main', nodeId: 'a-node' });
  store.setProject('b');
  expect(useLcosShellStore.getState()).toMatchObject({ windows: [], composerPrompt: '', composerTarget: null, composerOpen: false, activeWorkspaceId: null, surfaceCanvasId: {}, cameraRequest: null, locateRequest: null });
  store.openWindow('reader', 'B', 'artifact-b');
  store.setComposerPrompt('draft B');
  store.setProject('b');
  expect(useLcosShellStore.getState().composerPrompt).toBe('draft B');
  store.setProject('a');
  expect(useLcosShellStore.getState()).toMatchObject({ composerPrompt: 'draft A', composerOpen: true, composerTarget: { nodeId: 'a-node' }, cameraRequest: null, locateRequest: null });
  expect(useLcosShellStore.getState().windows.map((w) => w.target)).toEqual(['artifact-a']);
  store.setProject('b');
  expect(useLcosShellStore.getState().composerPrompt).toBe('draft B');
  expect(useLcosShellStore.getState().windows.map((w) => w.target)).toEqual(['artifact-b']);
  store.clear();
  store.setProject('a');
  expect(useLcosShellStore.getState().windows.map((window) => window.target)).toEqual(['artifact-a']);
});

describe('Composer UI intent', () => {
  it('clears a completed submission only in its owning unchanged draft, including after leaving that project', () => {
    const store = useLcosShellStore.getState();
    store.clear(); store.setProject('a');
    const target = { nodeId: 'a-node', title: 'A', anchor: { x: 0, y: 0, width: 1, height: 1 } };
    store.openComposer(target); store.setComposerPrompt('sent A');
    store.setProject('b'); store.setComposerPrompt('new B');
    store.clearSubmittedComposerPrompt('a', target, 'sent A');
    expect(useLcosShellStore.getState().composerPrompt).toBe('new B');
    store.setProject('a');
    expect(useLcosShellStore.getState().composerPrompt).toBe('');
    store.setComposerPrompt('new A');
    store.clearSubmittedComposerPrompt('a', target, 'sent A');
    expect(useLcosShellStore.getState().composerPrompt).toBe('new A');
    store.openComposer({ ...target, nodeId: 'another-target' });
    store.clearSubmittedComposerPrompt('a', target, 'new A');
    expect(useLcosShellStore.getState().composerPrompt).toBe('new A');
  });
  it('opens for one explicit target and closes without clearing the prompt', () => {
    const store = useLcosShellStore.getState();
    store.clear();
    store.setComposerPrompt('继续整理这份材料');
    store.openComposer({
      nodeId: 'node-1',
      title: '山野主视觉',
      anchor: { x: 10, y: 20, width: 160, height: 90 },
      workspaceId: 'workspace-main',
      receiverConversationId: 'connected-conversation-1',
    });

    expect(useLcosShellStore.getState()).toMatchObject({
      composerOpen: true,
      composerTarget: {
        nodeId: 'node-1',
        title: '山野主视觉',
        receiverConversationId: 'connected-conversation-1',
      },
      composerPrompt: '继续整理这份材料',
    });

    store.closeComposer();
    expect(useLcosShellStore.getState()).toMatchObject({
      composerOpen: false,
      composerPrompt: '继续整理这份材料',
    });
  });

  it('rotates a successful continuation message id while keeping the same Composer open', () => {
    const store = useLcosShellStore.getState();
    store.clear();
    store.setProject('continuation-project');
    const target = {
      nodeId: 'conversation-node',
      title: '会话',
      anchor: { x: 0, y: 0, width: 1, height: 1 },
      intent: 'continue' as const,
      receiverConversationId: 'conversation-1',
      continuationOperationId: 'operation-1',
      messageId: 'message-1',
    };
    store.openComposer(target);
    store.setComposerPrompt('第一条');

    store.clearSubmittedComposerPrompt('continuation-project', target, '第一条');
    const afterSuccess = useLcosShellStore.getState();
    expect(afterSuccess.composerOpen).toBe(true);
    expect(afterSuccess.composerPrompt).toBe('');
    expect(afterSuccess.composerTarget).toMatchObject({
      receiverConversationId: 'conversation-1',
      continuationOperationId: 'operation-1',
    });
    expect(afterSuccess.composerTarget?.messageId).toBeTruthy();
    expect(afterSuccess.composerTarget?.messageId).not.toBe('message-1');

    // A stale completion cannot rotate the new identity or clear a new draft.
    store.setComposerPrompt('第二条');
    const rotatedId = useLcosShellStore.getState().composerTarget?.messageId;
    store.clearSubmittedComposerPrompt('continuation-project', target, '第一条');
    expect(useLcosShellStore.getState().composerTarget?.messageId).toBe(rotatedId);
    expect(useLcosShellStore.getState().composerPrompt).toBe('第二条');
  });

  it('clear resets the ephemeral Composer intent', () => {
    const store = useLcosShellStore.getState();
    store.openComposer({
      nodeId: 'node-2',
      title: '访谈摘要',
      anchor: { x: 0, y: 0, width: 1, height: 1 },
    });
    store.setComposerPrompt('draft');
    store.clear();

    expect(useLcosShellStore.getState()).toMatchObject({
      composerOpen: false,
      composerTarget: null,
      composerPrompt: '',
    });
  });
});

describe('Assembly target intent', () => {
  it('keeps the caller-provided canonical target on the professional window', () => {
    const store = useLcosShellStore.getState();
    store.clear();
    store.openAssembly(
      { kind: 'conversation', id: 'conversation-1' },
      'Assembly · 会话',
    );

    expect(useLcosShellStore.getState().windows).toHaveLength(1);
    expect(useLcosShellStore.getState().windows[0]).toMatchObject({
      bodyKey: 'assembly',
      title: 'Assembly · 会话',
      assemblyTargetRef: { kind: 'conversation', id: 'conversation-1' },
      active: true,
    });
  });
});

describe('Professional window topology', () => {
  it('treats artifact + revision as the Reader target and preserves its source identity', () => {
    const store = useLcosShellStore.getState();
    store.clear();
    store.openReader('材料 A · 旧版', 'artifact-a', {
      revisionId: 'revision-old',
      source: { surface: 'context', nodeId: 'node-a' },
    });
    store.openReader('材料 A · 当前版', 'artifact-a', {
      revisionId: 'revision-current',
      source: { surface: 'main', nodeId: 'node-a-main' },
    });
    expect(useLcosShellStore.getState().windows).toHaveLength(2);
    expect(useLcosShellStore.getState().windows.find((window) => window.active)).toMatchObject({
      target: 'artifact-a',
      readerRevisionId: 'revision-current',
      readerSource: { surface: 'main', nodeId: 'node-a-main' },
    });

    store.openReader('材料 A · 旧版（重开）', 'artifact-a', {
      revisionId: 'revision-old',
      source: { surface: 'workflow', nodeId: 'node-a-workflow' },
    });
    expect(useLcosShellStore.getState().windows).toHaveLength(2);
    expect(useLcosShellStore.getState().windows.find((window) => window.active)).toMatchObject({
      title: '材料 A · 旧版（重开）',
      readerRevisionId: 'revision-old',
      readerSource: { surface: 'workflow', nodeId: 'node-a-workflow' },
    });
  });

  it('creates one floating region per opened instance instead of an implicit global tab group', () => {
    const store = useLcosShellStore.getState();
    store.clear();
    store.openWindow('reader', '材料 A', 'artifact-a');
    store.openWindow('reader', '材料 B', 'artifact-b');

    const state = useLcosShellStore.getState();
    expect(state.windowRegions).toHaveLength(2);
    expect(state.windowRegions.every((region) => region.layout === 'floating')).toBe(true);
    expect(state.windowRegions.every((region) => windowIdsForRegion(region).length === 1)).toBe(true);
    expect(new Set(state.windowRegions.map((region) => activeWindowIdForRegion(region))).size).toBe(2);
  });

  it('keeps region activeWindowId in sync and allows an explicit dock layout', () => {
    const store = useLcosShellStore.getState();
    store.clear();
    store.openWindow('reader', '材料 A', 'artifact-a');
    const first = useLcosShellStore.getState().windows[0];
    if (!first) throw new Error('window must exist');
    const region = useLcosShellStore.getState().windowRegions[0];
    if (!region) throw new Error('region must exist');

    store.setWindowRegionLayout(region.id, 'docked-right');
    store.activateWindow(first.id);
    expect(useLcosShellStore.getState().windowRegions[0]).toMatchObject({
      id: region.id,
      layout: 'docked-right',
      groups: [{ id: `group-${first.id}`, windowIds: [first.id], activeWindowId: first.id }],
    });
  });

  it('publishes and clears environment as ephemeral stage state', () => {
    const store = useLcosShellStore.getState();
    store.clear();
    const environment = {
      safeRect: { x: 0, y: 0, width: 800, height: 600 },
      occupiedRects: [{ x: 400, y: 0, width: 400, height: 600 }],
      activeRegionId: 'region-a',
    };
    store.publishWindowEnvironment(environment);
    expect(useLcosShellStore.getState().windowEnvironment).toEqual(environment);
    store.clearWindowEnvironment();
    expect(useLcosShellStore.getState().windowEnvironment).toBeNull();
  });

  // R2-B：几何 override 与拓扑同住 windowRegions（唯一真相），并随工程会话一起往返。
  it('stores region geometry as a topology field, not body-local state', () => {
    const store = useLcosShellStore.getState();
    store.clear();
    store.openWindow('reader', '材料 A', 'artifact-a');
    const region = useLcosShellStore.getState().windowRegions[0];
    if (!region) throw new Error('region must exist');

    store.setWindowRegionRect(region.id, { x: 120, y: 140, width: 640, height: 520 });
    expect(useLcosShellStore.getState().windowRegions[0]?.rect)
      .toEqual({ x: 120, y: 140, width: 640, height: 520 });

    store.setWindowRegionDockWidth(region.id, 520.4);
    expect(useLcosShellStore.getState().windowRegions[0]?.dockWidth).toBe(520);
    // 几何字段不影响拓扑身份
    expect(windowIdsForRegion(useLcosShellStore.getState().windowRegions[0])).toEqual([useLcosShellStore.getState().windows[0]!.id]);
  });

  it('geometry survives a project round-trip through the same session record', () => {
    const store = useLcosShellStore.getState();
    store.clear();
    store.setProject('project-a');
    store.openWindow('reader', '材料 A', 'artifact-a');
    const region = useLcosShellStore.getState().windowRegions[0];
    if (!region) throw new Error('region must exist');
    store.setWindowRegionRect(region.id, { x: 60, y: 90, width: 700, height: 500 });

    store.setProject('project-b');
    expect(useLcosShellStore.getState().windowRegions).toHaveLength(0);
    store.setProject('project-a');
    expect(useLcosShellStore.getState().windowRegions[0]?.rect)
      .toEqual({ x: 60, y: 90, width: 700, height: 500 });
    store.clear();
  });

  // R2-B：只有显式 group/ungroup 才会把多个窗口合成/拆开 tab 组。
  it('groups two regions into one tabbed region and ungroups back out again', () => {
    const store = useLcosShellStore.getState();
    store.clear();
    store.openWindow('reader', '材料 A', 'artifact-a');
    store.openWindow('assembly', 'Assembly');
    const before = useLcosShellStore.getState();
    expect(before.windowRegions).toHaveLength(2);
    expect(before.windowRegions.every((region) => windowIdsForRegion(region).length === 1)).toBe(true);
    const [first, second] = before.windowRegions;
    if (!first || !second) throw new Error('two regions must exist');

    store.groupWindowRegions(second.id, first.id);
    const grouped = useLcosShellStore.getState();
    expect(grouped.windowRegions).toHaveLength(1);
    expect(windowIdsForRegion(grouped.windowRegions[0])).toHaveLength(2);
    expect(activeWindowIdForRegion(grouped.windowRegions[0])).toBe(activeWindowIdForRegion(second));

    store.ungroupWindowRegion(grouped.windowRegions[0]!.id);
    const ungrouped = useLcosShellStore.getState();
    expect(ungrouped.windowRegions).toHaveLength(2);
    expect(ungrouped.windowRegions.every((region) => windowIdsForRegion(region).length === 1)).toBe(true);
    expect(new Set(ungrouped.windowRegions.map((region) => activeWindowIdForRegion(region))).size).toBe(2);
    store.clear();
  });

  it.each(['original', 'merged'] as const)('splits the %s active Reader without losing instance or reading state', (selection) => {
    const store = useLcosShellStore.getState();
    store.clear();
    store.openReader('材料 A', 'artifact-a', { revisionId: 'revision-a' });
    store.openReader('材料 B', 'artifact-b', { revisionId: 'revision-b' });
    // The user's existing detach command explicitly creates the second region.
    store.ungroupWindowRegion(useLcosShellStore.getState().windowRegions[0]!.id);
    const [first, second] = useLcosShellStore.getState().windowRegions;
    if (!first || !second) throw new Error('two regions must exist');
    store.setWindowRegionRect(first.id, { x: 60, y: 90, width: 700, height: 500 });
    store.rememberReaderPosition('artifact-a:revision-a', { scrollTop: 240, zoom: 1.25 });
    store.rememberReaderRevision('artifact-a', 'revision-a');
    store.setComposerPrompt('保留未发送的草稿');
    store.groupWindowRegions(second.id, first.id);
    const activeId = selection === 'original' ? activeWindowIdForRegion(first)! : activeWindowIdForRegion(second)!;
    store.activateWindow(activeId);
    const before = useLcosShellStore.getState();
    store.ungroupWindowRegion(first.id);
    const split = useLcosShellStore.getState();
    expect(split.windowRegions).toHaveLength(2);
    expect(new Set(split.windowRegions.map((region) => region.id)).size).toBe(2);
    expect(split.windowRegions.find((region) => region.id === `region-${activeId}`)).toEqual(createWindowRegion(`region-${activeId}`, [activeId], activeId));
    const remaining = split.windowRegions.find((region) => activeWindowIdForRegion(region) !== activeId);
    expect(remaining?.rect).toEqual({ x: 60, y: 90, width: 700, height: 500 });
    expect(split.windows).toBe(before.windows);
    expect(split.windows.find((window) => window.active)?.id).toBe(activeId);
    expect(split.readerPositions).toBe(before.readerPositions);
    expect(split.readerLastRevisions).toBe(before.readerLastRevisions);
    expect(split.composerPrompt).toBe('保留未发送的草稿');
    // A repeated click on the now-single region must not duplicate or close either instance.
    store.ungroupWindowRegion(first.id);
    expect(useLcosShellStore.getState().windowRegions).toBe(split.windowRegions);
    store.clear();
  });

  it('can repeatedly regroup and split either original host without losing a third region', () => {
    const store = useLcosShellStore.getState();
    store.clear();
    store.openWindow('reader', '材料 A', 'a');
    store.openWindow('reader', '材料 B', 'b');
    store.openWindow('reader', '材料 C', 'c');
    const [a, b, c] = useLcosShellStore.getState().windowRegions;
    if (!a || !b || !c) throw new Error('three regions must exist');
    for (const activeId of [activeWindowIdForRegion(a)!, activeWindowIdForRegion(b)!, activeWindowIdForRegion(a)!]) {
      store.groupWindowRegions(b.id, a.id);
      store.activateWindow(activeId);
      store.ungroupWindowRegion(a.id);
      const current = useLcosShellStore.getState();
      expect(current.windowRegions).toHaveLength(3);
      expect(current.windowRegions.find((region) => region.id === c.id)).toBe(c);
      expect(current.windowRegions.flatMap(windowIdsForRegion).sort()).toEqual([activeWindowIdForRegion(a), activeWindowIdForRegion(b), activeWindowIdForRegion(c)].sort());
      expect(new Set(current.windowRegions.map((region) => region.id)).size).toBe(3);
      expect(current.windows.find((window) => window.active)?.id).toBe(activeId);
    }
    store.clear();
  });

  it('group/ungroup is a no-op without an explicit topology change', () => {
    const store = useLcosShellStore.getState();
    store.clear();
    store.openWindow('reader', '材料 A', 'artifact-a');
    const region = useLcosShellStore.getState().windowRegions[0];
    if (!region) throw new Error('region must exist');
    // 单窗口不可取消分组；同一区域不可自我分组
    store.ungroupWindowRegion(region.id);
    store.groupWindowRegions(region.id, region.id);
    expect(useLcosShellStore.getState().windowRegions).toHaveLength(1);
    expect(windowIdsForRegion(useLcosShellStore.getState().windowRegions[0])).toEqual([useLcosShellStore.getState().windows[0]!.id]);
    store.clear();
  });

  it('splits stable groups, persists the single groups topology, and collapses cleanly when a pane closes', () => {
    const store = useLcosShellStore.getState();
    store.clear(); store.setProject('split-persistence');
    store.openReader('材料 A', 'artifact-a'); store.openReader('材料 B', 'artifact-b');
    store.ungroupWindowRegion(useLcosShellStore.getState().windowRegions[0]!.id);
    const [a, b] = useLcosShellStore.getState().windowRegions;
    if (!a || !b) throw new Error('two regions required');
    store.groupWindowRegions(b.id, a.id);
    store.splitWindowRegion(a.id, 'vertical');
    const split = useLcosShellStore.getState().windowRegions[0];
    if (!split) throw new Error('split region missing');
    expect(split.groups).toHaveLength(2); expect(split.splitDirection).toBe('vertical');
    expect(split.splitRatio).toBe(0.5); expect(windowIdsForRegion(split)).toHaveLength(2);
    store.setWindowRegionSplitRatio(a.id, 0.64);
    expect(readProfessionalWindowLayout('split-persistence')?.windowRegions[0]?.splitRatio).toBe(0.64);
    expect(readProfessionalWindowLayout('split-persistence')?.windowRegions[0]).not.toHaveProperty('windowIds');
    const paneToClose = split.groups[1]?.activeWindowId;
    if (!paneToClose) throw new Error('second pane missing');
    store.closeWindow(paneToClose);
    const collapsed = useLcosShellStore.getState().windowRegions[0];
    expect(collapsed?.groups).toHaveLength(1);
    expect(collapsed).not.toHaveProperty('splitDirection'); expect(collapsed).not.toHaveProperty('splitRatio');
    store.clear();
  });
});

it('keeps an explicit child-worksite return context separate from project truth', () => {
  const store = useLcosShellStore.getState();
  store.clear();
  store.setProject('project-1');
  store.beginChildNavigation({
    projectId: 'project-1',
    sourceSurface: 'main',
    sourceWorkspaceId: 'workspace-main',
    sourceWasChild: false,
    sourceCanvasId: 'canvas-main',
    sourceViewport: { x: 48, y: -24, zoom: 0.82 },
    sourceApproachViewport: { x: 32, y: -38, zoom: 0.9 },
    selectedNodeIds: ['node-a', 'node-b'],
    sourceEntityRefs: [{ nodeId: 'node-a', entityType: 'artifact', entityId: 'artifact-a' }],
  });
  expect(useLcosShellStore.getState().childReturn).toEqual(expect.objectContaining({
    projectId: 'project-1',
    sourceCanvasId: 'canvas-main',
    sourceViewport: { x: 48, y: -24, zoom: 0.82 },
    sourceApproachViewport: { x: 32, y: -38, zoom: 0.9 },
    selectedNodeIds: ['node-a', 'node-b'],
    sourceEntityRefs: [{ nodeId: 'node-a', entityType: 'artifact', entityId: 'artifact-a' }],
  }));
  store.clearChildNavigation();
  expect(useLcosShellStore.getState().childReturn).toBeNull();
});

it('keeps only the latest one-shot worksite camera transition', () => {
  const store = useLcosShellStore.getState();
  store.clear();
  const first = store.requestWorksiteCameraTransition({
    canvasId: 'canvas-child-a',
    kind: 'enter-settle',
  });
  const second = store.requestWorksiteCameraTransition({
    canvasId: 'canvas-child-b',
    kind: 'enter-settle',
  });
  expect(second).not.toBe(first);

  store.updateWorksiteCameraTransition(first, {
    targetViewport: { x: 0, y: 0, zoom: 1 },
  });
  expect(useLcosShellStore.getState().worksiteCameraTransition).toMatchObject({
    id: second,
    canvasId: 'canvas-child-b',
  });

  store.updateWorksiteCameraTransition(second, {
    startViewport: { x: 10, y: 20, zoom: 0.8 },
    targetViewport: { x: 0, y: 0, zoom: 1 },
  });
  expect(useLcosShellStore.getState().worksiteCameraTransition).toMatchObject({
    id: second,
    startViewport: { x: 10, y: 20, zoom: 0.8 },
    targetViewport: { x: 0, y: 0, zoom: 1 },
  });
  store.consumeWorksiteCameraTransition(first);
  expect(useLcosShellStore.getState().worksiteCameraTransition?.id).toBe(second);
  store.consumeWorksiteCameraTransition(second);
  expect(useLcosShellStore.getState().worksiteCameraTransition).toBeNull();
});

it('drops a child return context when changing project', () => {
  const store = useLcosShellStore.getState();
  store.clear();
  store.setProject('project-a');
  store.beginChildNavigation({ projectId: 'project-a', sourceSurface: 'main', sourceWasChild: false, selectedNodeIds: [] });
  store.setProject('project-b');
  expect(useLcosShellStore.getState().childReturn).toBeNull();
});

it('reuses a canvas preview without conflating an entity with the same id', () => {
  const store = useLcosShellStore.getState();
  store.clear();
  store.openWindow('portal-preview', 'entity', 'same-id');
  store.openWindow('portal-preview', 'canvas', 'same-id', 'canvas');
  store.openWindow('portal-preview', 'canvas', 'same-id', 'canvas');
  const windows = useLcosShellStore.getState().windows;
  expect(windows).toHaveLength(2);
  expect(new Set(windows.map((window) => window.id)).size).toBe(2);
  expect(windows.filter((window) => window.active)).toHaveLength(1);
  expect(windows.find((window) => window.active)?.targetKind).toBe('canvas');
  store.clear();
});

it('does not show a previously opened artifact when the next target is missing', () => {
  const store = useLcosShellStore.getState();
  store.clear();
  store.openWindow('reader', '材料 A', 'artifact-a');
  store.openWindow('reader', '缺失的材料');
  const windows = useLcosShellStore.getState().windows;
  expect(windows).toHaveLength(2);
  expect(windows.find((window) => window.active)?.target).toBeUndefined();
  store.openWindow('reader', '材料 A', 'artifact-a');
  expect(useLcosShellStore.getState().windows.find((window) => window.active)?.target).toBe('artifact-a');
});

it('keeps ONE shared Assembly per project and only updates its live targetRef', () => {
  const store = useLcosShellStore.getState();
  store.clear();
  // C1-3 冻结语义：一个 Project 一个共享 Assembly region，target 不编码进 regionId。
  store.openAssembly({ kind: 'main' });
  expect(useLcosShellStore.getState().windows).toHaveLength(1);
  expect(useLcosShellStore.getState().windowRegions).toHaveLength(1);
  expect(useLcosShellStore.getState().windowRegions[0]?.id).toBe('region-assembly');

  store.openAssembly({ kind: 'conversation', id: 'conv-a' });
  const afterConversation = useLcosShellStore.getState();
  expect(afterConversation.windows, '换 target 不得新建第二个 Assembly').toHaveLength(1);
  expect(afterConversation.windowRegions, '换 target 不得新建 region').toHaveLength(1);
  expect(afterConversation.windowRegions[0]?.id).toBe('region-assembly');
  expect(afterConversation.windows[0]?.assemblyTargetRef).toEqual({ kind: 'conversation', id: 'conv-a' });
  expect(afterConversation.windows.filter((window) => window.active)).toHaveLength(1);

  // 再切 target：仍是同一窗口、同一区域，只有 targetRef / title 变。
  store.openAssembly({ kind: 'workflow', id: 'ws-1' }, 'Assembly');
  const afterWorkflow = useLcosShellStore.getState();
  expect(afterWorkflow.windows).toHaveLength(1);
  expect(afterWorkflow.windowRegions).toHaveLength(1);
  expect(afterWorkflow.windows[0]?.assemblyTargetRef).toEqual({ kind: 'workflow', id: 'ws-1' });

  // 关闭后重开：仍然只有一个 Assembly（region 重建，但绝不并存两个）。
  const assemblyId = afterWorkflow.windows[0]!.id;
  store.closeWindow(assemblyId);
  expect(useLcosShellStore.getState().windows).toHaveLength(0);
  store.openAssembly({ kind: 'main' });
  expect(useLcosShellStore.getState().windows).toHaveLength(1);
  expect(useLcosShellStore.getState().windowRegions).toHaveLength(1);
});

it('preserves the shared Assembly region geometry and group topology across target switches', () => {
  const store = useLcosShellStore.getState();
  store.clear();
  store.openWindow('reader', '材料 A', 'artifact-a');
  store.openAssembly({ kind: 'main' });
  const assemblyRegion = useLcosShellStore.getState().windowRegions.find((region) => region.id === 'region-assembly');
  if (!assemblyRegion) throw new Error('assembly region must exist');
  // 用户把 Assembly 拖到固定几何并停靠
  store.setWindowRegionRect(assemblyRegion.id, { x: 120, y: 150, width: 700, height: 520 });
  store.setWindowRegionLayout(assemblyRegion.id, 'docked-right');
  const readerRegion = useLcosShellStore.getState().windowRegions.find((region) => region.id !== assemblyRegion.id)!;
  // 把 Reader 并进 Assembly 所在区域（source=reader，target=assembly）
  store.groupWindowRegions(readerRegion.id, assemblyRegion.id);

  store.openAssembly({ kind: 'context', id: 'ctx-1' });
  const after = useLcosShellStore.getState();
  expect(after.windows).toHaveLength(2);
  expect(after.windowRegions, 'target 变化不得改变 group 拓扑').toHaveLength(1);
  expect(windowIdsForRegion(after.windowRegions[0])).toHaveLength(2);
  expect(activeWindowIdForRegion(after.windowRegions[0])).toBe('assembly');
  expect(after.windows.find((window) => window.bodyKey === 'assembly')?.assemblyTargetRef)
    .toEqual({ kind: 'context', id: 'ctx-1' });
});

it('worksite-following Assembly updates its destination without stealing another window focus', () => {
  const store = useLcosShellStore.getState();
  store.clear();
  store.openAssembly({ kind: 'main' }, '装配 · 主画布', true);
  store.openWindow('conversation', '会话', 'conversation-one');
  const regions = useLcosShellStore.getState().windowRegions;
  store.retargetWorksiteAssembly({ kind: 'workspace', id: 'child-two' }, '装配 · 上下文');
  const state = useLcosShellStore.getState();
  expect(state.windows.find((w) => w.bodyKey === 'assembly')).toMatchObject({
    assemblyTargetRef: { kind: 'workspace', id: 'child-two' }, active: false,
  });
  expect(state.windowRegions).toBe(regions);
});
it('explicit conversation Assembly target is not replaced by navigation', () => {
  const store = useLcosShellStore.getState();
  store.clear();
  store.openAssembly({ kind: 'conversation', id: 'conversation-one' });
  store.retargetWorksiteAssembly({ kind: 'main' }, '装配 · 主画布');
  expect(useLcosShellStore.getState().windows[0]?.assemblyTargetRef).toEqual({ kind: 'conversation', id: 'conversation-one' });
});
