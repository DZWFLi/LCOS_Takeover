import { ReactFlowProvider } from '@xyflow/react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSettingsUiStore } from '@/store/settingsUiStore';
import { useToolStore } from '@/store/toolStore';

import { useCanvasShortcuts } from './useCanvasShortcuts';
import { useLcosReferenceStore } from '../../lcos/lcosReferenceState';
import { LcosCanvasCreationMenu } from '../../lcos/nodes/creation/LcosCanvasCreationMenu';
import { isNodePresentationHidden, isOwnPresentationHidden, restoreNodePresentationPath, setNodePresentationsHidden } from '../../lcos/nodes/nodePresentationVisibility';
import { MindMapEditor } from '../../lcos/nodes/text/MindMapEditor';
import { canvasHistoryManager } from '../../store/canvasHistoryManager';
import useCanvasStore from '../../store/canvasStore';
import { useGesturePreviewStore } from '../../store/gesturePreviewStore';

import type { CanvasShortcutRefs } from './useCanvasShortcuts';
import type { Node } from '@xyflow/react';

const semanticHost=vi.hoisted(()=>({projectId:'project-commands',bindings:{list:async()=>[]},notifyMutationSuccess:()=>undefined}));
vi.mock('../../lcos/host/lcosHostState',()=>({useLcosHostStore:{getState:()=>({host:semanticHost})}}));
let host: HTMLDivElement, root: Root;
const node = (id: string, selected = true, parentId?: string): Node => ({ id, type: 'note', position: { x: 0, y: 0 },
  data: { content: `actual:${id}` }, selected, ...(parentId ? { parentId } : {}) });
const refs: CanvasShortcutRefs = { rfInstanceRef: { current: null }, mousePositionRef: { current: { x: 0, y: 0 } } };
function ProductionCommandSeam() {
  const { tool, setTool } = useCanvasShortcuts(refs, { chromeMode: 'lcos' });
  return <LcosCanvasCreationMenu activeTool={tool} onToolChange={setTool} />;
}
const press = (key: string, extra: KeyboardEventInit = {}) => act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra })));
beforeEach(() => {
  canvasHistoryManager.clear();
  useSettingsUiStore.getState().close(); useToolStore.getState().setPendingNodeType(null);
  useGesturePreviewStore.setState({ sketchStrokeSelection: {} });
  useCanvasStore.getState()._setStateNoAutosave({ canvasId: undefined, nodes: [node('bound')], edges: [], canUndo: false, canRedo: false });
  useLcosReferenceStore.getState().reset(); useLcosReferenceStore.getState().setProject('project-commands');
  useLcosReferenceStore.getState().registerNodeEntity('bound', { entityType: 'artifact', entityId: 'artifact-real' });
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  act(() => root.render(<ReactFlowProvider><ProductionCommandSeam /></ReactFlowProvider>));
});
afterEach(() => { act(() => root.unmount()); host.remove(); useCanvasStore.getState()._setStateNoAutosave({canvasId:undefined});canvasHistoryManager.clear(); useLcosReferenceStore.getState().reset(); });

describe('LCOS command composition with original Huabu store/history', () => {
  it('Delete hides the bound presentation and keyboard Undo/Redo preserves its real identity and content', () => {
    press('Delete');
    expect(useCanvasStore.getState().nodes).toHaveLength(1);
    expect(useCanvasStore.getState().nodes[0]?.data.content).toBe('actual:bound');
    expect(useCanvasStore.getState().nodes.some(isOwnPresentationHidden)).toBe(true);
    expect(useLcosReferenceStore.getState().nodeEntityRefs.get('bound')?.entityId).toBe('artifact-real');
    press('z', { ctrlKey: true });
    expect(useCanvasStore.getState().nodes.some(isOwnPresentationHidden)).toBe(false);
    press('z', { ctrlKey: true, shiftKey: true });
    expect(useCanvasStore.getState().nodes.some(isOwnPresentationHidden)).toBe(true);
  });
  it('one mixed Delete and one Undo restores both bound presentation visibility and native node/edge deletion', async () => {
    act(() => useCanvasStore.getState()._setStateNoAutosave({ nodes: [node('bound'), node('native')],
      canvasId:'canvas-commands',edges: [{ id: 'native-edge', source: 'bound', target: 'native', selected: true }] }));
    await act(async()=>{press('Delete');await new Promise(resolve=>setTimeout(resolve,0));});
    expect(useCanvasStore.getState().nodes.map((item) => item.id)).toEqual(['bound']);
    expect(useCanvasStore.getState().nodes.some(isOwnPresentationHidden)).toBe(true);
    expect(useCanvasStore.getState().edges).toHaveLength(0);
    press('z', { ctrlKey: true });
    expect(useCanvasStore.getState().nodes.map((item) => item.id)).toEqual(['bound', 'native']);
    expect(useCanvasStore.getState().nodes.some(isOwnPresentationHidden)).toBe(false);
    expect(useCanvasStore.getState().edges.map((item) => item.id)).toEqual(['native-edge']);
  });
  it('a selected native frame with a bound descendant hides its subtree instead of cascading deletion; explicit locate restores it', () => {
    act(() => useCanvasStore.getState()._setStateNoAutosave({ nodes: [{ ...node('frame'), type: 'frame' }, node('bound', false, 'frame')], edges: [] }));
    press('Backspace');
    const hidden = useCanvasStore.getState().nodes;
    expect(hidden.map((item) => item.id)).toEqual(['frame', 'bound']);
    const child = hidden.find((item) => item.id === 'bound'); if (!child) throw new Error('Core child was deleted');
    expect(isNodePresentationHidden(child, new Map(hidden.map((item) => [item.id, item])))).toBe(true);
    act(() => { restoreNodePresentationPath(useCanvasStore.getState(), 'bound'); });
    expect(useCanvasStore.getState().nodes.some(isOwnPresentationHidden)).toBe(false);
    expect(useLcosReferenceStore.getState().nodeEntityRefs.get('bound')?.entityId).toBe('artifact-real');
  });
  it('ignores already hidden selection and respects locked bound presentations without adding a phantom undo', () => {
    act(() => useCanvasStore.getState()._setStateNoAutosave({ nodes: [
      { ...node('bound'), data: { content: 'actual:bound', locked: true } },
      { ...node('hidden-native'), data: { content: 'hidden body', lcosPresentationHidden: true } },
    ] }));
    press('Delete');
    expect(useCanvasStore.getState().nodes.map((item) => item.id)).toEqual(['bound', 'hidden-native']);
    expect(useCanvasStore.getState().nodes.find((item) => item.id === 'bound')?.data.lcosPresentationHidden).toBeUndefined();
    expect(useCanvasStore.getState().canUndo).toBe(false);
  });
  it('an already registered native capture listener leaves branch Delete and copy to the map editor', () => {
    const extra = document.createElement('div'); document.body.appendChild(extra); const editorRoot = createRoot(extra);
    act(() => editorRoot.render(<MindMapEditor title="Map" outline={'- Branch\n  - Child'} onCancel={() => undefined} onSave={async () => true} />));
    const topic = [...document.querySelectorAll('g.lcos-mindmap-topic')].find((item) => item.textContent === 'Branch');
    act(() => topic?.dispatchEvent(new MouseEvent('click', {bubbles:true})));
    press('Delete');
    expect(document.querySelectorAll('g.lcos-mindmap-topic')).toHaveLength(1);
    expect(useCanvasStore.getState().nodes.some(isOwnPresentationHidden)).toBe(false);
    expect(useCanvasStore.getState().canUndo).toBe(false);
    act(() => editorRoot.unmount()); extra.remove();
  });
  it('shares actual creation/tool shortcuts with the LCOS menu and restores hidden entries from its visible recovery action', () => {
    press('2'); expect(useToolStore.getState().pendingNodeType).toBe('text');
    press('p'); expect(useToolStore.getState().pendingNodeType).toBeNull();
    act(() => { setNodePresentationsHidden(useCanvasStore.getState(), ['bound'], true); });
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="创建与画布工具"]')?.click());
    const restore = document.querySelector<HTMLButtonElement>('[data-lcos-restore-presentations]');
    expect(restore).not.toBeNull(); act(() => restore?.click());
    expect(useCanvasStore.getState().nodes.some(isOwnPresentationHidden)).toBe(false);
    expect(useCanvasStore.getState().nodes.map((item) => item.id)).toEqual(['bound']);
  });
});
