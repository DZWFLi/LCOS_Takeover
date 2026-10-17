import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { LcosComposerHost } from './LcosComposerHost';
import { useLcosReferenceStore } from '../lcosReferenceState';
import { useLcosShellStore } from '../shell/lcosShellStore';
import { LCOS_MATERIAL_TRANSFER_MIME } from '../ui/professional/donor/Gen1TextTransfer';

globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let host:HTMLDivElement,root:Root;
const requests:{method:string}[]=[];
beforeEach(()=>{
  requests.length=0;
  vi.stubGlobal('fetch',vi.fn(async(_url:string,init?:RequestInit)=>{
    requests.push({method:init?.method??'GET'});
    return new Response(JSON.stringify({ok:true,value:{available:false}}),{headers:{'Content-Type':'application/json'}});
  }));
  useLcosShellStore.getState().clear();useLcosShellStore.getState().setProject('p');
  useLcosShellStore.getState().openComposer({nodeId:'receiver',title:'原任务',intent:'delegate',workspaceId:'w',anchor:{x:0,y:0,width:1,height:1}});
  useLcosShellStore.getState().setComposerPrompt('原输入');
  useLcosReferenceStore.getState().reset();useLcosReferenceStore.getState().setProject('p');
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{
  await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();
  useLcosReferenceStore.getState().reset();useLcosShellStore.getState().clear();
});
const material={schemaVersion:1,kind:'material-transfer',capturedAt:'2026-10-13T00:00:00Z',
  source:{projectId:'p',artifactId:'file',revisionId:'old-version',title:'正在阅读的历史材料'},content:{kind:'text',text:'只选中的这一段'}};
it.each(['drop','paste'] as const)('the actual Composer %s handler admits a Reader excerpt once without importing or sending',async(kind)=>{
  await act(async()=>root.render(<LcosComposerHost projectId="p" workspaceId="w" anchor={null} inline open onClose={()=>undefined}/>));
  const editor=host.querySelector<HTMLTextAreaElement>('[data-lcos-composer-input]')!;
  const event=new Event(kind,{bubbles:true,cancelable:true});
  Object.defineProperty(event,kind==='drop'?'dataTransfer':'clipboardData',{value:{types:[LCOS_MATERIAL_TRANSFER_MIME,'text/plain'],
    getData:(mime:string)=>mime===LCOS_MATERIAL_TRANSFER_MIME?JSON.stringify(material):'source-less fallback'}});
  await act(async()=>editor.dispatchEvent(event));
  expect(event.defaultPrevented).toBe(true);
  expect(useLcosShellStore.getState().composerPrompt).toContain('原输入\n\n〔来源 正在阅读的历史材料〕');
  expect(useLcosShellStore.getState().composerPrompt).not.toContain('artifact:file@old-version');
  expect(useLcosShellStore.getState().composerPrompt).not.toContain('source-less fallback');
  expect(host.querySelectorAll('[data-lcos-composer-ref]')).toHaveLength(1);
  expect(useLcosReferenceStore.getState().draft.orderedEntityRefs[0]).toMatchObject({entityId:'file',revisionId:'old-version'});
  expect(requests.every(request=>request.method==='GET')).toBe(true);
});
it('malformed Reader data cannot fall through to the browser text insertion or change the draft',async()=>{
  await act(async()=>root.render(<LcosComposerHost projectId="p" workspaceId="w" anchor={null} inline open onClose={()=>undefined}/>));
  const event=new Event('drop',{bubbles:true,cancelable:true});
  Object.defineProperty(event,'dataTransfer',{value:{types:[LCOS_MATERIAL_TRANSFER_MIME,'text/plain'],getData:()=> 'bad material'}});
  await act(async()=>host.querySelector('[data-lcos-composer-input]')!.dispatchEvent(event));
  expect(event.defaultPrevented).toBe(true);
  expect(useLcosShellStore.getState().composerPrompt).toBe('原输入');
  expect(useLcosReferenceStore.getState().draft.orderedEntityRefs).toEqual([]);
  expect(host.querySelector('[data-lcos-composer-material-feedback]')?.textContent).toContain('原输入保留');
});
