import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';

import useCanvasStore from '@/store/canvasStore';

import { useLcosReferenceStore } from '../lcosReferenceState';
import { CanvasNodeRenameEntry } from './CanvasNodeRenameEntry';
const rename=vi.hoisted(()=>vi.fn());
vi.mock('../app/lcosCoreClient',()=>({createLcosCoreSession:()=>({artifacts:{renameEntity:rename}})}));
let root:Root,host:HTMLDivElement;
beforeEach(()=>{
  rename.mockReset();rename.mockResolvedValue({id:'a-title',entity:'artifact',title:'真人改名',mode:'manual'});
  useCanvasStore.getState()._setStateNoAutosave({canvasId:'canvas-title',nodes:[{id:'node-title',type:'text',selected:true,position:{x:0,y:0},data:{label:'Native'}}]});
  useLcosReferenceStore.getState().reset();useLcosReferenceStore.getState().setProject('p-title');
  useLcosReferenceStore.getState().registerNodeEntity('node-title',{entityType:'artifact',entityId:'a-title'});
  host=document.createElement('div');host.innerHTML='<div class="react-flow__node" data-id="node-title"></div>';document.body.appendChild(host);
  const mount=document.createElement('div');host.appendChild(mount);root=createRoot(mount);
  act(()=>root.render(<CanvasNodeRenameEntry/>));
});
afterEach(()=>{act(()=>root.unmount());host.remove();useCanvasStore.getState()._setStateNoAutosave({canvasId:undefined});});
it('F2 opens the actual selected node title and submits the manual Core API',async()=>{
  act(()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'F2',bubbles:true,cancelable:true})));
  const input=document.querySelector<HTMLInputElement>('[aria-label="节点名称"]');if(!input)throw new Error('F2 has no rename entry');
  act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set?.call(input,'真人改名');input.dispatchEvent(new Event('input',{bubbles:true}));});
  await act(async()=>input.closest('form')?.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  expect(rename).toHaveBeenCalledWith('artifact','a-title','真人改名');expect(useCanvasStore.getState().nodes[0]?.data.label).toBe('Native');
});
