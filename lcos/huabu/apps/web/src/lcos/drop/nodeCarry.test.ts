import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PointerRouterCore } from '@/handler/pointerRouter';
import useCanvasStore from '@/store/canvasStore';

import { useLcosDropStore } from '../lcosDropState';
import { createLcosRecognizers } from '../lcosRecognizers';
import { useLcosReferenceStore } from '../lcosReferenceState';
import { handleCarryContextMenu } from '../referenceClickSuppressor';
import { useLcosShellStore } from '../shell/lcosShellStore';

import type { CanvasPointerRouterContext } from '@/handler/canvasPointerRouterContext';

const hit = vi.hoisted(() => ({ id: 'node-one' as string | null }));
vi.mock('@/handler/canvasNodeAtPoint', () => ({ nodeIdAtScreenPoint: () => hit.id }));
const wrapper = {
  getBoundingClientRect: () => ({ left: 100, top: 60, width: 1000, height: 740, right: 1100, bottom: 800 }),
  setPointerCapture: vi.fn(), hasPointerCapture: () => true, releasePointerCapture: vi.fn(),
} as unknown as HTMLDivElement;
const context = {
  wrapper, interactivityLocked: false, explicitToolActive: false, inputMode: 'mouse',
  instance: { screenToFlowPosition: ({ x, y }: { x: number; y: number }) => ({ x: x - 100, y: y - 60 }) },
} as CanvasPointerRouterContext;
function event(x = 150, y = 140, extra = {}): PointerEvent {
  const target=fixtureNode();
  return {
    pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 2,
    buttons:2,target,
    clientX: x, clientY: y, preventDefault: vi.fn(), stopPropagation: vi.fn(),
    ...extra,
  } as unknown as PointerEvent;
}
function fixtureNode(): HTMLElement {
  const node=document.querySelector<HTMLElement>('.react-flow__node');
  if(!node)throw new Error('Expected the fixture node');
  return node;
}
function nativeNoteEditor(): HTMLElement {
  useLcosReferenceStore.getState().forgetNode('node-one');
  useCanvasStore.setState({nodes:[{id:'node-one',type:'note',position:{x:40,y:80},selected:true,data:{content:''}}]});
  const editor=document.createElement('div');editor.setAttribute('contenteditable','true');editor.tabIndex=0;
  fixtureNode().append(editor);
  return editor;
}
function menu(): Event {
  return { preventDefault: vi.fn(), stopPropagation: vi.fn(), stopImmediatePropagation: vi.fn() } as unknown as Event;
}
beforeEach(() => {
  document.body.innerHTML='<div class="react-flow__node"></div>';
  hit.id = 'node-one';
  useLcosDropStore.getState().reset();
  useLcosReferenceStore.getState().reset();
  useLcosShellStore.setState({projectId:'p',composerOpen:false,composerTarget:null});
  useLcosReferenceStore.getState().setProject('p');
  useLcosReferenceStore.getState().beginNodeBindingRead('p','canvas');
  useLcosReferenceStore.getState().registerNodeEntity('node-one', { entityType: 'note', entityId: 'note-one' });
  useCanvasStore.setState({canvasId:'canvas',isLoading:false, nodes: [{ id: 'node-one', position: { x: 40, y: 80 }, data: {}, selected: true }] });
  handleCarryContextMenu(menu());
});
function registerGlyth(): void {
  useLcosDropStore.getState().registerTarget({
    targetId: 'glyth:two', kind: 'collaboration-reference', label: '设计会话',
    rect: { left: 300, top: 180, width: 100, height: 100 }, priority: 20, enabled: true,
    semantic: { kind: 'collaboration-reference', conversationId: 'conversation-two' },
  });
}
describe('T3 node right carry through the single pointer router', () => {
  it('carries a genuine unbound native note into new View without moving it or guessing its material identity', () => {
    useLcosReferenceStore.getState().forgetNode('node-one');
    useCanvasStore.setState({ nodes: [{ id: 'node-one', type: 'note', position: { x: 40, y: 80 }, selected: true,
      data: { content: '', label: 'Same name as an existing artifact' } }] });
    const before = useCanvasStore.getState().nodes;
    useLcosDropStore.getState().registerTarget({ targetId: 'new-view', kind: 'railway-new-view', label: '新现场',
      rect: { left: 300, top: 180, width: 100, height: 100 }, priority: 20, enabled: true,
      semantic: { kind: 'railway-new-view', projectId: 'p', sourceCanvasId: 'canvas', surface: 'main' } });
    const router = new PointerRouterCore(createLcosRecognizers(), () => context);
    router.handleDown(event()); router.handleMove(event(330, 210));
    expect(useLcosDropStore.getState().resolution).toMatchObject({ status: 'ready', intent: { kind: 'prepare-material',
      target:{semantic:{kind:'railway-new-view',sourceCanvasId:'canvas'}},
      objects:[{entityType:'native-text',entityId:'node-one',nativeText:{nodeType:'note',body:''}}] } });
    expect(useCanvasStore.getState().nodes).toBe(before);
    router.cancelAll();
  });
  it.each([{button:2,buttons:2},{button:0,buttons:1,altKey:true}])('carries an idle Native editor body through the existing right/Alt producer without moving or changing its text',extra=>{
    const editor=nativeNoteEditor();registerGlyth();
    const original=useCanvasStore.getState().nodes;
    const router=new PointerRouterCore(createLcosRecognizers(),()=>context);
    router.handleDown(event(150,140,{target:editor,...extra}));
    expect(router.ownerOf(1)?.id).toBe('lcos/node-carry');
    router.handleMove(event(330,210,{target:editor,...extra}));
    expect(useLcosDropStore.getState().resolution).toMatchObject({status:'ready',intent:{kind:'prepare-material',
      target:{semantic:{kind:'collaboration-reference',conversationId:'conversation-two'}},
      objects:[{entityType:'native-text',entityId:'node-one',nativeText:{nodeType:'note',body:''}}]}});
    expect(useCanvasStore.getState().nodes).toBe(original);
    router.cancelAll();
  });
  it('preserves a focused Native editor and its text selection instead of acquiring right or Alt carry',()=>{
    const editor=nativeNoteEditor();editor.focus();
    expect(document.activeElement).toBe(editor);
    const original=useCanvasStore.getState().nodes;
    const router=new PointerRouterCore(createLcosRecognizers(),()=>context);
    for(const extra of [{button:2,buttons:2},{button:0,buttons:1,altKey:true}]){
      router.handleDown(event(150,140,{target:editor,...extra}));
      expect(router.ownerOf(1)).toBeNull();
      expect(useLcosDropStore.getState().state.status).toBe('idle');
    }
    expect(useCanvasStore.getState().nodes).toBe(original);
  });
  it('keeps the explicit handle available while idle-editor ordinary left drag and form buttons retain their native owners',()=>{
    const editor=nativeNoteEditor();const router=new PointerRouterCore(createLcosRecognizers(),()=>context);
    router.handleDown(event(150,140,{target:editor,button:0,buttons:1}));
    expect(router.ownerOf(1)).toBeNull();
    for(const tag of ['button','input','textarea','select']){
      const control=document.createElement(tag);fixtureNode().append(control);
      router.handleDown(event(150,140,{target:control,button:2,buttons:2}));
      expect(router.ownerOf(1)).toBeNull();
    }
    editor.focus();const handle=document.createElement('button');editor.append(handle);
    handle.dataset.semanticDropHandle='';handle.dataset.nodeCarryId='node-one';
    router.handleDown(event(150,140,{target:handle,button:0,buttons:1}));
    expect(router.ownerOf(1)?.id).toBe('lcos/node-carry');
    router.cancelAll();
  });
  it('captures an unbound Native image with only the actual source canvas address through the pointer caller',()=>{
    useLcosReferenceStore.getState().forgetNode('node-one');
    useCanvasStore.setState({nodes:[{id:'node-one',type:'image',position:{x:40,y:80},selected:true,data:{src:'original-image.png'}}]});
    registerGlyth();const router=new PointerRouterCore(createLcosRecognizers(),()=>context);
    router.handleDown(event());router.handleMove(event(330,210));
    expect(useLcosDropStore.getState().resolution).toMatchObject({status:'ready',intent:{kind:'prepare-material',objects:[
      {entityType:'native-image',entityId:'node-one',nativeImage:{src:'original-image.png',canvasId:'canvas'}}]}});
    router.cancelAll();
  });
  it('carries a URL material from its visible link while retaining its original placement', () => {
    const parent = document.querySelector('.react-flow__node');
    if (!parent) throw new Error('Expected the fixture node');
    const link = document.createElement('a'); link.href = 'https://example.com'; parent.append(link);
    const original = useCanvasStore.getState().nodes;
    const router = new PointerRouterCore(createLcosRecognizers(), () => context);
    router.handleDown(event(150, 140, { target: link }));
    expect(router.ownerOf(1)?.id).toBe('lcos/node-carry');
    router.handleMove(event(190, 150, { target: link }));
    expect(useLcosDropStore.getState().carrySourceNodeIds).toEqual(['node-one']);
    expect(useCanvasStore.getState().nodes).toBe(original);
    router.cancelAll();
  });
  it('Alt carry freezes the full native selection and commits it once without moving or reselecting nodes',()=>{
    registerGlyth();
    useLcosReferenceStore.getState().registerNodeEntity('node-two',{entityType:'note',entityId:'note-two'});
    useCanvasStore.setState({nodes:[...useCanvasStore.getState().nodes,{id:'node-two',position:{x:90,y:80},data:{},selected:true}]});
    const original=useCanvasStore.getState().nodes;
    const router=new PointerRouterCore(createLcosRecognizers(),()=>context);
    router.handleDown(event(150,140,{button:0,buttons:1,altKey:true}));
    expect(router.ownerOf(1)?.id).toBe('lcos/node-carry');
    router.handleMove(event(330,210,{button:0,buttons:1,altKey:false}));
    expect(useLcosDropStore.getState().carrySourceNodeIds).toEqual(['node-one','node-two']);
    router.handleUp(event(330,210,{button:0,buttons:0}));
    expect(useLcosDropStore.getState().resolution).toMatchObject({status:'ready',intent:{sourceRefs:[{kind:'note',id:'note-one'},{kind:'note',id:'note-two'}]}});
    expect(useCanvasStore.getState().nodes).toBe(original);
    expect(useLcosDropStore.getState().state.status).toBe('committing');
  });
  it('the selected-node handle works as the same carry while ordinary node buttons and Shift selection keep their owners',()=>{
    const parent=fixtureNode();
    const button=document.createElement('button');parent.append(button);
    const router=new PointerRouterCore(createLcosRecognizers(),()=>context);
    router.handleDown(event(150,140,{target:button,button:0,buttons:1,altKey:true}));
    expect(router.ownerOf(1)).toBeNull();
    button.dataset.semanticDropHandle='';button.dataset.nodeCarryId='node-one';
    router.handleDown(event(150,140,{target:button,button:0,buttons:1,shiftKey:true}));
    expect(router.ownerOf(1)).toBeNull();
    router.handleDown(event(150,140,{target:button,button:0,buttons:1}));
    expect(router.ownerOf(1)?.id).toBe('lcos/node-carry');
    router.cancelAll();expect(useLcosDropStore.getState().state.status).toBe('idle');
  });
  it('dragging an unselected node does not silently include another selected group',()=>{
    registerGlyth();
    useCanvasStore.setState({nodes:[{id:'node-one',position:{x:40,y:80},data:{},selected:false},{id:'other',position:{x:90,y:80},data:{},selected:true}]});
    const router=new PointerRouterCore(createLcosRecognizers(),()=>context);
    router.handleDown(event());router.handleMove(event(330,210));
    expect(useLcosDropStore.getState().carrySourceNodeIds).toEqual(['node-one']);
    router.cancelAll();expect(useCanvasStore.getState().nodes.find(node=>node.id==='other')?.selected).toBe(true);
  });
  it('rejects the entire selected group when one item has no canonical identity',()=>{
    registerGlyth();
    useCanvasStore.setState({nodes:[...useCanvasStore.getState().nodes,{id:'unbound',position:{x:90,y:80},data:{},selected:true}]});
    const router=new PointerRouterCore(createLcosRecognizers(),()=>context);
    router.handleDown(event());router.handleMove(event(330,210));router.handleUp(event(330,210,{buttons:0}));
    expect(useLcosDropStore.getState().state.status).toBe('idle');
  });
  it.each([1, 3, 4])('keeps %ipx of right-button drift as management click without acquiring Drop', (distance) => {
    const replay=vi.fn((event:Event)=>handleCarryContextMenu(event));
    fixtureNode().addEventListener('contextmenu',replay);
    const router = new PointerRouterCore(createLcosRecognizers(), () => context);
    router.handleDown(event());
    const original = useCanvasStore.getState().nodes;
    router.handleMove(event(150 + distance));
    expect(useLcosDropStore.getState().state.status).toBe('idle');
    expect(useLcosDropStore.getState().carrySourceNodeId).toBeNull();
    router.handleUp(event(150 + distance,140,{buttons:0}));
    expect(useLcosDropStore.getState().state.status).toBe('idle');
    expect(replay).toHaveBeenCalledTimes(1);
    expect(replay.mock.results[0]?.value).toBe(false);
    expect(useCanvasStore.getState().nodes).toBe(original);
  });
  it('starts semantic carry only beyond 4px and suppresses the management menu', () => {
    const replay = vi.fn((event: Event) => handleCarryContextMenu(event));
    fixtureNode().addEventListener('contextmenu', replay);
    const original = useCanvasStore.getState().nodes;
    const router = new PointerRouterCore(createLcosRecognizers(), () => context);
    router.handleDown(event());
    router.handleMove(event(155));
    expect(useLcosDropStore.getState().state).toMatchObject({
      payload: { kind: 'objects', objects: [{ entityType: 'note', entityId: 'note-one' }] },
    });
    expect(useLcosDropStore.getState().carrySourceNodeIds).toEqual(['node-one']);
    router.handleUp(event(155,140,{buttons:0}));
    expect(useLcosDropStore.getState().state.status).toBe('idle');
    expect(replay).not.toHaveBeenCalled();
    expect(useCanvasStore.getState().nodes).toBe(original);
  });
  it('one move then release targets Glyth immediately and leaves source geometry and selection intact', () => {
    registerGlyth();
    const before = useCanvasStore.getState().nodes;
    const router = new PointerRouterCore(createLcosRecognizers(), () => context);
    router.handleDown(event());
    router.handleMove(event(330, 210));
    expect(useLcosDropStore.getState().state).toMatchObject({
      status: 'preview', destination: { targetId: 'glyth:two', previewPoint: { x: 230, y: 150 } },
    });
    router.handleUp(event(330,210,{buttons:0}));
    expect(useLcosDropStore.getState().state).toMatchObject({
      status: 'committing', intent: { kind: 'assembly-apply' },
    });
    expect(useLcosDropStore.getState().resolution).toMatchObject({ status: 'ready', intent: { targetRef: { kind: 'conversation', id: 'conversation-two' }, sourceRefs: [{ kind: 'note', id: 'note-one' }] } });
    if (useLcosDropStore.getState().resolution?.status === 'ready') expect(useLcosDropStore.getState().resolution).not.toHaveProperty('intent.placementPoint');
    expect(useCanvasStore.getState().nodes).toBe(before);
    expect(handleCarryContextMenu(menu())).toBe(true);
    expect(handleCarryContextMenu(menu())).toBe(false);
  });
  it('re-hit-tests release so a disappeared receiver cannot accept the stale preview', () => {
    registerGlyth();
    const router = new PointerRouterCore(createLcosRecognizers(), () => context);
    router.handleDown(event());
    router.handleMove(event(330, 210));
    useLcosDropStore.getState().unregisterTarget('glyth:two');
    router.handleUp(event(330,210,{buttons:0}));
    expect(useLcosDropStore.getState().state.status).toBe('idle');
  });
  it('Escape/blur cancellation releases capture and cannot commit later', () => {
    registerGlyth();
    const router = new PointerRouterCore(createLcosRecognizers(), () => context);
    router.handleDown(event());
    router.handleMove(event(330, 210));
    router.cancelAll();
    expect(router.ownerOf(1)).toBeNull();
    expect(useLcosDropStore.getState().state.status).toBe('idle');
    router.handleUp(event(330,210,{buttons:0}));
    expect(useLcosDropStore.getState().state.status).toBe('idle');
  });
  it('does not invent a Core reference for an unbound node or replace left drag', () => {
    const router = new PointerRouterCore(createLcosRecognizers(), () => context);
    hit.id = 'unbound';
    router.handleDown(event());
    expect(router.ownerOf(1)).toBeNull();
    hit.id = 'node-one';
    router.handleDown(event(150, 140, { button: 0 }));
    expect(router.ownerOf(1)).toBeNull();
  });
  it('does not turn right carry over blank canvas into a move of the original', () => {
    useLcosDropStore.getState().registerTarget({
      targetId: 'canvas:main', kind: 'canvas', label: '画布', enabled: true, priority: 10,
      rect: { left: 100, top: 60, width: 1000, height: 740 },
      semantic: { kind: 'canvas', targetRef: { kind: 'main' } },
    });
    const router = new PointerRouterCore(createLcosRecognizers(), () => context);
    router.handleDown(event());
    router.handleMove(event(330, 210));
    expect(useLcosDropStore.getState().resolution?.status).toBe('ineligible');
    router.handleUp(event(330,210,{buttons:0}));
    expect(useLcosDropStore.getState().state.status).toBe('idle');
  });
});
