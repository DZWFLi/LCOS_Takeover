import { act,useState } from 'react';
import { createRoot,type Root } from 'react-dom/client';
import { afterEach,beforeEach,expect,it,vi } from 'vitest';

const portal=vi.hoisted(()=>({show:undefined as (()=>void)|undefined,hide:undefined as (()=>void)|undefined}));
vi.mock('@/components/Common/CanvasFloatingPopover',()=>({
  CanvasFloatingPopover:({children,open}:{children:React.ReactNode;open:boolean})=>{
    const [mounted,setMounted]=useState(false);
    portal.show=()=>setMounted(true);portal.hide=()=>setMounted(false);
    return open&&mounted?children:null;
  },
}));

import { LcosComposerHost } from './LcosComposerHost';
import { useLcosDropStore } from '../lcosDropState';
import { useLcosReferenceStore } from '../lcosReferenceState';
import { useLcosShellStore } from '../shell/lcosShellStore';

globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let root:Root;let host:HTMLDivElement;
const anchor={x:10,y:20,width:100,height:80};
const receivers=()=>useLcosDropStore.getState().targets().filter(target=>target.kind==='composer-reference');
beforeEach(()=>{host=document.createElement('div');document.body.append(host);root=createRoot(host);
  useLcosDropStore.getState().reset();useLcosReferenceStore.getState().reset();useLcosReferenceStore.getState().setProject('p');
  useLcosShellStore.getState().clear();useLcosShellStore.getState().openComposer({nodeId:'node-a',title:'原输入',intent:'delegate',anchor});
  vi.spyOn(Element.prototype,'getBoundingClientRect').mockReturnValue(new DOMRect(40,60,300,160));
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();
  useLcosDropStore.getState().reset();useLcosReferenceStore.getState().reset();useLcosShellStore.getState().clear();});
async function mount(open=true){await act(async()=>root.render(<LcosComposerHost projectId="p" workspaceId="w" anchor={anchor} open={open} onClose={()=>undefined}/>));}
it('registers a delayed real reference DOM without re-rendering its owner and releases it when the portal hides',async()=>{
  await mount();expect(receivers()).toEqual([]);
  await act(async()=>portal.show?.());expect(host.querySelector('[data-lcos-composer-reference-surface]')).not.toBeNull();
  expect(receivers()).toHaveLength(1);expect(receivers()[0]).toMatchObject({kind:'composer-reference',enabled:true,
    semantic:{kind:'composer-reference',intent:'delegate'}});
  await act(async()=>portal.hide?.());expect(receivers()).toEqual([]);
  await act(async()=>portal.show?.());expect(receivers()).toHaveLength(1);
});
it('reads the actual live reference rectangle after movement, without requiring another render',async()=>{
  await mount();await act(async()=>portal.show?.());
  const surface=host.querySelector<HTMLElement>('[data-lcos-composer-reference-surface]');
  if(!surface)throw new Error('Actual reference DOM missing');
  vi.spyOn(surface,'getBoundingClientRect').mockReturnValue(new DOMRect(240,320,400,180));
  expect(receivers()[0]?.readRect?.()).toEqual({left:240,top:320,width:400,height:180});
});
it('replaces the exact receiver identity on target change and unregisters on explicit close',async()=>{
  await mount();await act(async()=>portal.show?.());const firstId=receivers()[0]?.targetId;
  await act(async()=>useLcosShellStore.getState().openComposer({nodeId:'node-b',title:'另一个输入',intent:'delegate',anchor}));
  expect(receivers()).toHaveLength(1);expect(receivers()[0]?.targetId).not.toBe(firstId);
  await mount(false);expect(receivers()).toEqual([]);
});
