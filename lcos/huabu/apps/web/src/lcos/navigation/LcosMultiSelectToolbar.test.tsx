import { describeProjectedEntity } from '@local-creative-os/web-gen2';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';

import { MultiSelectToolbar } from '@/components/Panels/Canvas/FloatingToolbars/MultiSelectToolbar';
import { NodeBodyResolverContext } from '@/lcos-seam/nodeBodySlot';
import { canvasHistoryManager } from '@/store/canvasHistoryManager';
import useCanvasStore from '@/store/canvasStore';


const mocks = vi.hoisted(() => ({ nodes: [] as Array<{ id: string; selected: boolean; parentId?: string; position: { x: number; y: number }; data: Record<string,unknown>; type: string; dragging?: boolean; resizing?: boolean }>, deleteNodes: vi.fn(), move: vi.fn() }));
vi.mock('react-i18next', async original => ({ ...await original<typeof ReactI18next>(),useTranslation: () => ({ t: (s: string) => s }) }));
vi.mock('@/hooks/useInputMode', () => ({ useIsNotMouse: () => true }));
vi.mock('@/i18n/colors', () => ({ translateColorOptions: () => [] }));
vi.mock('@/components/Common/CanvasFloatingPopover', () => ({ CanvasFloatingPopover: ({ children, open }: { children: ReactNode; open: boolean }) => open ? <div>{children}</div> : null }));
vi.mock('@/components/Common/FloatingToolbar', () => ({ FLOATING_TOOLBAR_CLASS: '', FloatingToolbar: {
  Popover: ({ children, trigger, triggerData, label }: { children: ReactNode; trigger?: ReactNode; triggerData?: { 'data-lcos-selection-more'?: boolean }; label?: string }) => <div><button aria-label={label} data-lcos-selection-more={triggerData?.['data-lcos-selection-more'] || undefined}>{trigger}</button>{children}</div>,
  AlignPicker: ({ onDistribute }: { onDistribute?: unknown }) => <div data-testid="align-picker" data-can-distribute={typeof onDistribute === 'function'} />,
  SizePicker: () => <div data-testid="geometry-size-picker" />,
  NumberInput: ({ label }: { label: string }) => <div data-testid="font-size-picker">{label}</div>,
  ColorPicker: () => <div data-testid="accent-picker" />,
  Divider: () => null,
  ActionButton: ({ title, disabled, onClick }: { title: string; disabled?: boolean; onClick: () => void }) => <button title={title} disabled={disabled} onClick={onClick}>{title}</button>,
} }));
import { LcosMultiSelectToolbar } from './LcosMultiSelectToolbar';
import { useLcosReferenceStore } from '../lcosReferenceState';
import { createLcosNodePresentationSeam } from '../nodes/createLcosNodePresentationSeam';
import { useLcosShellStore } from '../shell/lcosShellStore';
import { TextSourceView } from '../ui/source/TextSourceView';

import type { LcosNodeEntityRef } from '../lcosReferenceState';
import type * as ReactI18next from 'react-i18next';
let host: HTMLDivElement; let root: Root;
const actualDelete=useCanvasStore.getState().deleteNodes;
const actualMove=useCanvasStore.getState().setMoveSelectionDialogOpen;
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
const bodySeam = createLcosNodePresentationSeam();
const node = (id: string, selected = true, parentId?: string, type = 'image') => ({ id, selected, ...(parentId ? { parentId } : {}), position: { x: 0, y: 0 }, data: {content:`content:${id}`}, type });
beforeEach(() => {
  canvasHistoryManager.clear();
  mocks.nodes = [node('a'), node('b')]; mocks.deleteNodes.mockClear(); mocks.move.mockClear();
  useCanvasStore.getState()._setStateNoAutosave({canvasId:'canvas',nodes:mocks.nodes,edges:[],canUndo:false,canRedo:false,deleteNodes:actualDelete,setMoveSelectionDialogOpen:actualMove});
  vi.spyOn(useCanvasStore.getState(),'deleteNodes').mockImplementation(ids=>{mocks.deleteNodes(ids);actualDelete(ids);});
  vi.spyOn(useCanvasStore.getState(),'setMoveSelectionDialogOpen').mockImplementation(mocks.move);
  useLcosShellStore.setState({ projectId: 'p' });
  useLcosReferenceStore.setState({ projectId: 'p', bindingCanvasId: 'canvas', bindingIdentitiesReady: true, nodeEntityRefs: new Map() });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks();canvasHistoryManager.clear();useCanvasStore.getState()._setStateNoAutosave({canvasId:undefined,deleteNodes:actualDelete,setMoveSelectionDialogOpen:actualMove}); });
const render = () => act(() => {
  useCanvasStore.getState()._setStateNoAutosave({nodes:mocks.nodes});
  root.render(<NodeBodyResolverContext.Provider value={bodySeam}><LcosMultiSelectToolbar /></NodeBodyResolverContext.Provider>);
});
const clickAll = () => act(() => host.querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.click()));
it('keeps LCOS cross-space move out of the Huabu modal while touch delete stays operational', () => {
  render(); clickAll(); expect(mocks.move).not.toHaveBeenCalled(); expect(mocks.deleteNodes).toHaveBeenCalledWith(['a', 'b']);
  expect(useCanvasStore.getState().nodes).toHaveLength(0);act(()=>useCanvasStore.getState().undo());expect(useCanvasStore.getState().nodes.map(item=>item.id)).toEqual(['a','b']);
});
it('removes a mixed selection with one Undo while preserving the bound object identity and content', () => {
  useLcosReferenceStore.setState({ nodeEntityRefs: new Map([['a', { entityType: 'artifact', entityId: 'artifact-a' }]]) });
  render();expect(host.querySelector('[data-lcos-selection-more]')).not.toBeNull();clickAll(); expect(mocks.move).not.toHaveBeenCalled(); expect(mocks.deleteNodes).toHaveBeenCalledWith(['b']);
  expect(useCanvasStore.getState().nodes.map(item=>item.id)).toEqual(['a']);expect(useCanvasStore.getState().nodes[0]?.data.lcosPresentationHidden).toBe(true);
  expect(useCanvasStore.getState().nodes[0]?.data.content).toBe('content:a');
  expect(useLcosReferenceStore.getState().nodeEntityRefs.get('a')?.entityId).toBe('artifact-a');
  act(()=>useCanvasStore.getState().undo());expect(useCanvasStore.getState().nodes.map(item=>item.id)).toEqual(['a','b']);expect(useCanvasStore.getState().nodes[0]?.data.lcosPresentationHidden).toBeUndefined();
  expect(host.querySelector('button[title^="这组项目材料"]')).toBeNull();
  expect(host.querySelector('button[title^="所选含项目材料"]')).toBeNull();
  // Native Undo restores content and visibility, while its original history
  // deliberately clears selection. The multi-selection bar then stands down.
  expect(host.querySelector('[data-lcos-selection-more]')).toBeNull();
});
it('protects a selected parent with an unselected bound descendant', () => {
  mocks.nodes.push(node('child', false, 'a'));
  useLcosReferenceStore.setState({ nodeEntityRefs: new Map([['child', { entityType: 'conversation', entityId: 'conversation-c' }]]) });
  render(); clickAll(); expect(mocks.move).not.toHaveBeenCalled(); expect(mocks.deleteNodes).toHaveBeenCalledWith(['b']);
  expect(useCanvasStore.getState().nodes.map(item=>item.id)).toEqual(['a','child']);
  expect(useCanvasStore.getState().nodes.find(item=>item.id==='a')?.data.lcosPresentationHidden).toBe(true);
  act(()=>useCanvasStore.getState().undo());expect(useCanvasStore.getState().nodes.map(item=>item.id)).toEqual(['a','b','child']);
});
it('waits for current canvas identities and enables ordinary nodes once ready', () => {
  useLcosReferenceStore.setState({ bindingCanvasId: 'old-canvas' }); render(); clickAll();
  expect(mocks.deleteNodes).not.toHaveBeenCalled(); expect(mocks.move).not.toHaveBeenCalled();
  act(() => useLcosReferenceStore.setState({ bindingCanvasId: 'canvas' })); clickAll();
  expect(mocks.deleteNodes).toHaveBeenCalledWith(['a', 'b']);
});
it('exposes create-Collection action through the production host toolbar for fully bound selection', () => {
  useLcosReferenceStore.setState({ nodeEntityRefs: new Map([
    ['a', { entityType: 'artifact', entityId: 'artifact-a' }],
    ['b', { entityType: 'note', entityId: 'note-b' }],
  ]) });
  render();
  const action = host.querySelector<HTMLButtonElement>('button[aria-label="收成集合"]');
  expect(action).not.toBeNull();
  expect(action?.disabled).toBe(false);
});
it('keeps LCOS formatting and layout in More while hiding numeric geometry controls', () => {
  mocks.nodes = [node('a', true, undefined, 'text'), node('b', true, undefined, 'text'), node('c', true, undefined, 'text')];
  render();

  expect(host.querySelector('[data-testid="geometry-size-picker"]')).toBeNull();
  expect(host.querySelector('[data-testid="font-size-picker"]')).toBeNull();
  expect(host.querySelector('[data-testid="accent-picker"]')).not.toBeNull();
  expect(host.querySelector('[data-testid="align-picker"]')?.getAttribute('data-can-distribute')).toBe('true');
  expect(host.querySelector<HTMLButtonElement>('button[title="moveSelection.action"]')).toBeNull();
  expect(host.querySelector<HTMLButtonElement>('button[title="删除所选节点"]')?.disabled).toBe(false);
  expect(host.querySelector('[data-lcos-selection-more]')).not.toBeNull();
});
it('ignores stale drag flags outside the selected nodes but still suppresses an active selected drag', () => {
  const first = node('a');
  const second = node('b');
  const stale = Object.assign(node('stale', false), { dragging: true });
  mocks.nodes = [first, second, stale];
  render();

  expect(host.querySelector('[data-lcos-selection-more]')).not.toBeNull();

  mocks.nodes = [Object.assign(first, { dragging: true }), second, stale];
  render();
  expect(host.querySelector('[data-lcos-selection-more]')).toBeNull();
});
it('hides accent for a mixed native and host-owned selection instead of changing only the native node', () => {
  mocks.nodes = [node('native-text', true, undefined, 'text'), node('bound-text', true, undefined, 'text')];
  const selectedNodes = mocks.nodes;
  const boundRef: LcosNodeEntityRef = {
    entityType: 'artifact',
    entityId: 'artifact-text',
    descriptor: {
      ...describeProjectedEntity({ entityType: 'artifact', entityId: 'artifact-text', title: '项目正文', artifactKind: 'text' }),
      managed: true,
      revisionStatus: 'current',
      currentRevisionId: 'revision-1',
      presentedRevisionId: 'revision-1',
    },
  };
  render();
  expect(host.querySelector('[data-testid="accent-picker"]')).not.toBeNull();

  act(() => useLcosReferenceStore.setState({
    nodeEntityRefs: new Map<string, LcosNodeEntityRef>([['bound-text', boundRef]]),
  }));

  expect(mocks.nodes).toBe(selectedNodes);
  expect(host.querySelector('[data-testid="font-size-picker"]')).toBeNull();
  expect(host.querySelector('[data-testid="accent-picker"]')).toBeNull();

  act(() => useLcosReferenceStore.setState({ nodeEntityRefs: new Map() }));
  expect(host.querySelector('[data-testid="accent-picker"]')).not.toBeNull();
});
it('renders the G2 text body at its density-owned size while native font metadata changes', () => {
  mocks.nodes = [node('a', true, undefined, 'text'), node('b', true, undefined, 'text')];
  const renderFixture = (fontSize: number) => act(() => {useCanvasStore.getState()._setStateNoAutosave({nodes:mocks.nodes});root.render(<>
    <div data-lcos-text-fixture data-native-font-metadata={fontSize}>
      <TextSourceView family="text" title="G2 正文" preview="density owns this rendered text" density="reading"
        worldWidth={385} worldHeight={142} zoom={1} />
    </div>
    <NodeBodyResolverContext.Provider value={bodySeam}><LcosMultiSelectToolbar /></NodeBodyResolverContext.Provider>
  </>);});
  const textNode = mocks.nodes[0];
  if (textNode === undefined) throw new Error('Expected G2 text fixture node');
  textNode.data = { content: '正文', style: { fontSize: 16 } };
  renderFixture(16);

  const body = host.querySelector<HTMLElement>('[data-lcos-source-visual="text"]');
  expect(body).not.toBeNull();
  const before = body?.style.getPropertyValue('--lcos-source-text-size');
  textNode.data = { content: '正文', style: { fontSize: 128 } };
  renderFixture(128);

  expect(body?.style.getPropertyValue('--lcos-source-text-size')).toBe(before);
  expect(body?.style.getPropertyValue('--lcos-source-text-size')).toBe('37px');
  expect(host.querySelector('[data-testid="font-size-picker"]')).toBeNull();
});
it('keeps the shared native width and height picker by default', () => {
  mocks.nodes = [node('a', true, undefined, 'text'), node('b', true, undefined, 'text')];
  act(() => {useCanvasStore.getState()._setStateNoAutosave({nodes:mocks.nodes});root.render(<MultiSelectToolbar moveDisabledReason="native move reason" deleteDisabledReason="native delete reason" />);});

  expect(host.querySelector('[data-testid="geometry-size-picker"]')).not.toBeNull();
  expect(host.querySelector('[data-testid="font-size-picker"]')).not.toBeNull();
  expect(host.querySelector('[data-testid="accent-picker"]')).not.toBeNull();
  expect(host.querySelector<HTMLButtonElement>('button[title="native move reason"]')?.disabled).toBe(true);
  expect(host.querySelector<HTMLButtonElement>('button[title="native delete reason"]')?.disabled).toBe(true);
});
