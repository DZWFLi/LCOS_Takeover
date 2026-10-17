import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';

import { canvasHistoryManager } from '@/store/canvasHistoryManager';
import useCanvasStore from '@/store/canvasStore';

import { useLcosReferenceStore } from '../lcosReferenceState';
import { LcosMultiSelectToolbar } from './LcosMultiSelectToolbar';
import { useLcosShellStore } from '../shell/lcosShellStore';

vi.mock('react-i18next',async (original)=>({...await original<typeof ReactI18next>(),useTranslation:()=>({t:(key:string)=>key})}));
vi.mock('@/hooks/useInputMode',()=>({useIsNotMouse:()=>false}));
vi.mock('@/components/Common/CanvasFloatingPopover',()=>({CanvasFloatingPopover:({children,open}:{children:ReactNode;open:boolean})=>open?<div>{children}</div>:null}));
import type * as ReactI18next from 'react-i18next';
let root:Root,host:HTMLDivElement;
beforeEach(()=>{
  canvasHistoryManager.clear();
  useCanvasStore.getState()._setStateNoAutosave({canvasId:'canvas-remove',nodes:[{id:'bound',type:'text',selected:true,position:{x:0,y:0},data:{content:'real'}},{id:'native',type:'text',selected:true,position:{x:400,y:0},data:{content:'native'}}],edges:[],canUndo:false,canRedo:false});
  useLcosShellStore.setState({projectId:'p-remove'});useLcosReferenceStore.getState().reset();useLcosReferenceStore.getState().setProject('p-remove');
  useLcosReferenceStore.setState({bindingCanvasId:'canvas-remove',bindingIdentitiesReady:true});
  useLcosReferenceStore.getState().registerNodeEntity('bound',{entityType:'artifact',entityId:'a-real'});
  host=document.createElement('div');document.body.appendChild(host);root=createRoot(host);act(()=>root.render(<LcosMultiSelectToolbar/>));
});
afterEach(()=>{act(()=>root.unmount());host.remove();canvasHistoryManager.clear();useCanvasStore.getState()._setStateNoAutosave({canvasId:undefined});});
it.each(['button','context-menu'])('%s removes with keyboard hide semantics and one native Undo',(entry)=>{
  if(entry==='button') act(()=>host.querySelector<HTMLButtonElement>('[data-lcos-selection-more]')?.click());
  else { const selected=document.createElement('div');selected.className='react-flow__node';selected.dataset.id='bound';host.appendChild(selected);act(()=>selected.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}))); }
  const remove=[...document.querySelectorAll<HTMLButtonElement>('button')].find((button)=>button.getAttribute('aria-label')==='从画布收起所选表征');
  expect(remove).toBeTruthy();act(()=>remove?.click());
  expect(useCanvasStore.getState().nodes.map((node)=>node.id)).toEqual(['bound']);
  expect(useCanvasStore.getState().nodes[0]?.data.lcosPresentationHidden).toBe(true);
  act(()=>useCanvasStore.getState().undo());
  expect(useCanvasStore.getState().nodes.map((node)=>node.id)).toEqual(['bound','native']);
  expect(useCanvasStore.getState().nodes[0]?.data.lcosPresentationHidden).toBeUndefined();
  expect(useLcosReferenceStore.getState().nodeEntityRefs.get('bound')?.entityId).toBe('a-real');
});
