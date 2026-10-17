import { railwayStableKeyV1, type MutationBatch, type RailwayDestinationV1, type RailwaySnapshotV1, type RailwayStoredRefV1 } from '@local-creative-os/contracts';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';


import useCanvasStore from '@/store/canvasStore';

import { LcosRailway } from './LcosRailway';
import { resolveDropIntent } from '../drop/dropIntentResolver';
import { useLcosDropStore } from '../lcosDropState';
import { useLcosShellStore } from './lcosShellStore';

import type * as WebGen2 from '@local-creative-os/web-gen2';
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const m=vi.hoisted(()=>({read:vi.fn(),write:vi.fn(),graphRead:vi.fn(),graphWrite:vi.fn(),lastMutation:undefined as MutationBatch|undefined,
 candidates:[] as RailwayDestinationV1[],destinationByKey:new Map<string,RailwayDestinationV1>(),watch:vi.fn(),stop:vi.fn(),list:vi.fn(),binding:vi.fn(),invalidate:undefined as (()=>void)|undefined,
 session:undefined as undefined|{status:string;projection:{userState:string}}}));
vi.mock('@local-creative-os/web-gen2',async(original)=>({...await original<typeof WebGen2>(),
 CoreRailwayClient:class{snapshot=m.read;save=m.write;},CoreConversationClient:class{listConnectedConversations=m.list;getReceiverBinding=m.binding;}}));
vi.mock('../app/lcosCoreClient',()=>({createLcosCoreSession:()=>({http:{},projects:{getProjectGraph:m.graphRead,applyGraphMutations:m.graphWrite}})}));
vi.mock('../collaboration/collaborationSessionStore',()=>({useCollaborationSessionStore:(select:(s:unknown)=>unknown)=>select({watchProjectChanges:m.watch})}));
vi.mock('../collaboration/useCollaborationSession',()=>({useCollaborationSession:()=>m.session}));
vi.mock('../composer/LcosReceiverIdentity',()=>({LcosReceiverIdentity:({conversationId}:{conversationId:string})=><span data-test-glyth-avatar={conversationId}/> }));
vi.mock('../navigation/RailwayPeek',()=>({RailwayPeek:()=><div>预览测试端口</div>}));
const roots:ReturnType<typeof createRoot>[]=[];
beforeEach(()=>{
  useCanvasStore.setState({canvasId:'main-canvas'});
  vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockReturnValue({x:10,y:10,left:10,top:10,right:62,bottom:62,width:52,height:52,toJSON:()=>({})});
});
beforeEach(()=>{m.session=undefined;m.candidates=[];m.destinationByKey.clear();m.lastMutation=undefined;m.graphRead.mockReset();m.graphWrite.mockReset();m.list.mockResolvedValue([]);m.binding.mockResolvedValue({activeReceiverId:null});m.watch.mockImplementation((_project,listener)=>{m.invalidate=listener;return m.stop;});});
afterEach(()=>{for(const root of roots.splice(0))act(()=>root.unmount());document.body.replaceChildren();useLcosDropStore.getState().reset();vi.restoreAllMocks();vi.resetAllMocks();});
function canonicalRead(count:number,unavailableIndex=-1){
 let order={schemaVersion:1 as const,projectId:'p',version:7,updatedAt:'',orderedRefs:Array.from({length:count},(_,i)=>({kind:'worksite' as const,projectId:'p',worksiteId:String(i)})) as RailwayStoredRefV1[]};
 m.candidates=[];m.destinationByKey.clear();
 const snapshot=():RailwaySnapshotV1=>({schemaVersion:1,projectId:'p',order,candidates:m.candidates,migrationRequired:false,destinations:order.orderedRefs.map((ref,index)=>m.destinationByKey.get(railwayStableKeyV1(ref))??({key:railwayStableKeyV1(ref),ref,role:'worksite',available:index!==unavailableIndex,label:`现场${ref.kind==='worksite'?ref.worksiteId:''}`,workspaceId:ref.kind==='worksite'?ref.worksiteId:'',canvasId:`c${ref.kind==='worksite'?ref.worksiteId:''}`,surface:'main',accepts:['artifactView','note'],...(index===unavailableIndex?{reason:'这个现场暂不可用'}:{})}))});
 m.read.mockImplementation(async()=>snapshot());m.write.mockImplementation(async(_pid,refs:RailwayStoredRefV1[],version:number)=>{expect(version).toBe(order.version);order={...order,orderedRefs:refs,version:version+1};m.candidates=m.candidates.filter(candidate=>!refs.some(ref=>railwayStableKeyV1(ref)===railwayStableKeyV1(candidate.ref)));return snapshot();});return order;
}
async function mount(activateDestination:(destination:RailwayDestinationV1)=>Promise<void>|void=()=>{},ensureWorkspaceCanvas:(workspaceId:string)=>Promise<string|undefined>=async()=>undefined){const host=document.createElement('div');document.body.append(host);const root=createRoot(host);roots.push(root);await act(async()=>root.render(<LcosRailway projectId="p" surfaceByWorkspace={new Map()} ensureWorkspaceCanvas={ensureWorkspaceCanvas} activateDestination={activateDestination}/>));return host;}
const button=(label:string)=>document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
async function openActions(label:string){await act(async()=>button(label).focus());await act(async()=>button(`空间操作 ${label}`).click());}
const contextWorksiteDestination=(workspaceId:string,label:string,canvasId?:string):RailwayDestinationV1=>{
 const ref={kind:'worksite' as const,projectId:'p',worksiteId:workspaceId};
 const available=canvasId!==undefined;
 return {key:railwayStableKeyV1(ref),ref,role:'worksite',label,available,workspaceId,surface:'context',accepts:available?['artifactView','note']:[],
  ...(canvasId===undefined?{reason:'这个现场还没有画布，暂不能进入或接收材料。'}:{canvasId})};
};
it('item-local Up/Down uses the current canonical snapshot version',async()=>{const order=canonicalRead(2);await mount();await openActions('现场0');expect(button('上移 现场0').disabled).toBe(true);await act(async()=>button('下移 现场0').click());expect(m.write).toHaveBeenCalledExactlyOnceWith('p',[order.orderedRefs[1],order.orderedRefs[0]],7);expect([...document.querySelectorAll('[data-lcos-railway-item]')].map(el=>el.getAttribute('aria-label'))).toEqual(['现场1','现场0']);});
it('Rail grows with available height instead of freezing to four items',async()=>{canonicalRead(5);await mount();expect([...document.querySelectorAll('[data-lcos-railway-item]')].map(el=>el.getAttribute('aria-label'))).toEqual(['现场0','现场1','现场2','现场3','现场4']);expect(document.querySelector('[data-lcos-railway-overflow-trigger]')).toBeNull();});
it('keeps unavailable candidates out of the default rail while retaining stored recovery identities',async()=>{
  canonicalRead(2,1);
  const pending=contextWorksiteDestination('pending','已有待继续现场');
  const unavailable={...contextWorksiteDestination('missing','没有地址的候选'),surface:'main' as const};
  m.candidates=[pending,unavailable];await mount();
  expect([...document.querySelectorAll('[data-lcos-railway-item]')].map(el=>el.getAttribute('aria-label'))).toEqual(['现场0','现场1']);
  expect(button('现场1').disabled).toBe(true);
  await act(async()=>button('添加与创建').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true})));
  expect(button('继续建立并进入 已有待继续现场').disabled).toBe(false);
  expect(document.querySelector('[aria-label="打开 没有地址的候选"]')).toBeNull();
  expect(document.querySelector('[data-lcos-railway-manage-list]')).toBeNull();
  expect(m.write).not.toHaveBeenCalled();
});
it('overflow keeps direct entry and one target nearby instead of opening a project manager',async()=>{const previous=window.innerHeight;Object.defineProperty(window,'innerHeight',{value:260,configurable:true});try{const order=canonicalRead(5);await mount();const trigger=document.querySelector<HTMLButtonElement>('[data-lcos-railway-overflow-trigger]')!;expect(trigger).not.toBeNull();await act(async()=>trigger.click());expect(trigger.getAttribute('aria-expanded')).toBe('true');expect(document.querySelector('[data-lcos-railway-overflow]')).not.toBeNull();expect(document.querySelector('[data-lcos-railway-manage-list]')).toBeNull();await openActions('现场4');expect(button('下移 现场4').disabled).toBe(true);expect(document.querySelector('[aria-label="上移 现场0"]')).toBeNull();await act(async()=>button('上移 现场4').click());expect(m.write).toHaveBeenCalledWith('p',[...order.orderedRefs.slice(0,3),order.orderedRefs[4],order.orderedRefs[3]],7);}finally{Object.defineProperty(window,'innerHeight',{value:previous,configurable:true});}});
it('Escape and deliberate re-click close overflow immediately, while hover grace remains separate',async()=>{
  const previous=window.innerHeight;
  Object.defineProperty(window,'innerHeight',{value:260,configurable:true});
  try {
    canonicalRead(5);await mount();
    const trigger=document.querySelector<HTMLButtonElement>('[data-lcos-railway-overflow-trigger]')!;
    await act(async()=>trigger.click());
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const shell=document.querySelector<HTMLElement>('[data-lcos-railway-overflow-shell]')!;
    await act(async()=>{ shell.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})); });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelector('[data-lcos-railway-overflow]')).toBeNull();
    await act(async()=>trigger.click());
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    await act(async()=>trigger.click());
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  } finally {Object.defineProperty(window,'innerHeight',{value:previous,configurable:true});}
});
it('overflow chooses the exact Core destination and keeps its live Receive target',async()=>{
  const previous=window.innerHeight;
  const previousWorkspace=useLcosShellStore.getState().activeWorkspaceId;
  Object.defineProperty(window,'innerHeight',{value:260,configurable:true});
  act(()=>useLcosShellStore.setState({activeWorkspaceId:'outside-rail'}));
  try {
    const order=canonicalRead(12);
    const activate=vi.fn();
    await mount(activate);
    const trigger=document.querySelector<HTMLButtonElement>('[data-lcos-railway-overflow-trigger]')!;
    await act(async()=>trigger.click());
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(document.querySelector('[data-lcos-railway-overflow]')).not.toBeNull();
    const key=railwayStableKeyV1(order.orderedRefs[11]);
    const buttons=[...document.querySelectorAll<HTMLButtonElement>('[data-lcos-railway-destination-key]')];
    const targetButton=buttons.find(button=>button.dataset.lcosRailwayDestinationKey===key);
    expect(buttons.map(button=>button.dataset.lcosRailwayDestinationKey)).toContain(key);
    expect(targetButton).not.toBeNull();
    expect(targetButton?.disabled).toBe(false);
    expect(document.querySelector('[data-lcos-railway-manage-list]')).toBeNull();
    const target=useLcosDropStore.getState().targets().find(item=>item.targetId===`railway:p:rail:${key}`);
    expect(target?.semantic.kind).toBe('railway-receive');
    await act(async()=>targetButton?.click());
    expect(activate).toHaveBeenCalledWith(expect.objectContaining({key,workspaceId:'11',canvasId:'c11'}));
    expect(document.querySelector('[data-lcos-railway-overflow]')).toBeNull();
  } finally {
    Object.defineProperty(window,'innerHeight',{value:previous,configurable:true});
    act(()=>useLcosShellStore.setState({activeWorkspaceId:previousWorkspace}));
  }
});
it('unavailable overflow destination stays disabled and excluded from Receive',async()=>{
  const previous=window.innerHeight;
  const previousWorkspace=useLcosShellStore.getState().activeWorkspaceId;
  Object.defineProperty(window,'innerHeight',{value:260,configurable:true});
  act(()=>useLcosShellStore.setState({activeWorkspaceId:'outside-rail'}));
  try {
    const order=canonicalRead(12,11);
    const activate=vi.fn();
    await mount(activate);
    await act(async()=>document.querySelector<HTMLButtonElement>('[data-lcos-railway-overflow-trigger]')!.click());
    const key=railwayStableKeyV1(order.orderedRefs[11]);
    const item=[...document.querySelectorAll<HTMLButtonElement>('[data-lcos-railway-destination-key]')]
      .find(element=>element.dataset.lcosRailwayDestinationKey===key);
    expect(item).not.toBeNull();
    expect(item?.disabled).toBe(true);
    const target=useLcosDropStore.getState().targets().find(candidate=>candidate.targetId===`railway:p:rail:${key}`);
    expect(target?.semantic).toMatchObject({kind:'drop-exclusion',reason:'这个现场暂不可用'});
    await act(async()=>item?.click());
    expect(activate).not.toHaveBeenCalled();
  } finally {
    Object.defineProperty(window,'innerHeight',{value:previous,configurable:true});
    act(()=>useLcosShellStore.setState({activeWorkspaceId:previousWorkspace}));
  }
});
it('project invalidation refreshes destinations and active receiver without remounting',async()=>{canonicalRead(1);await mount();m.read.mockClear();m.binding.mockClear();await act(async()=>m.invalidate!());expect(m.read).toHaveBeenCalledTimes(1);expect(m.binding).toHaveBeenCalledTimes(1);expect(m.watch).toHaveBeenCalledTimes(1);expect(button('现场0')).not.toBeNull();});
it('Rail hover and management yield to an active Semantic Drop',async()=>{
  canonicalRead(1);
  await mount();
  const target=button('现场0');
  act(()=>useLcosDropStore.getState().begin({kind:'text',value:'拖动中的内容'}));
  await act(async()=>target.focus());
  expect(document.querySelector('.lcos-railway-popover')).toBeNull();
  expect(target.getAttribute('draggable')).toBe('false');
  await act(async()=>button('添加与创建').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true})));
  expect(document.querySelector('.lcos-railway-popover')).toBeNull();
  act(()=>useLcosDropStore.getState().cancel());
  await act(async()=>{target.blur();target.focus();});
  expect(document.querySelector('.lcos-railway-popover')).not.toBeNull();
});
it('active receiver preserves shared identity/state and rejects material receive',async()=>{canonicalRead(0);m.binding.mockResolvedValue({activeReceiverId:'conversation'});m.list.mockResolvedValue([{id:'conversation',label:'创意伙伴'}]);m.session={status:'ready',projection:{userState:'needs_user'}};await mount();expect(document.querySelector('[data-test-glyth-avatar="conversation"]')).not.toBeNull();expect(document.querySelector('[data-lcos-railway-receiver]')?.getAttribute('aria-label')).toContain('等你回应');const target=useLcosDropStore.getState().targets().find(t=>t.targetId==='railway-control:p:receiver');expect(target?.semantic.kind).toBe('drop-exclusion');expect(resolveDropIntent({kind:'object',entityType:'note',entityId:'n'},target!).status).toBe('ineligible');});
it('new project removes previous destinations/receiver before its slow read returns',async()=>{canonicalRead(1);m.binding.mockResolvedValue({activeReceiverId:'old'});m.list.mockResolvedValue([{id:'old',label:'上个项目伙伴'}]);await mount();expect(button('现场0')).not.toBeNull();m.read.mockImplementation(()=>new Promise(()=>{}));m.list.mockImplementation(()=>new Promise(()=>{}));m.binding.mockImplementation(()=>new Promise(()=>{}));await act(async()=>roots.at(-1)!.render(<LcosRailway projectId="next" surfaceByWorkspace={new Map()} ensureWorkspaceCanvas={async()=>undefined} activateDestination={()=>{}}/>));expect(document.querySelector('[data-lcos-railway-item]')).toBeNull();expect(document.querySelector('[data-lcos-railway-receiver]')).toBeNull();});

function readyContextCandidate(workspaceId:string,label:string,canvasId='canvas-context'){
  const candidate=contextWorksiteDestination(workspaceId,label,canvasId);
  m.candidates=[candidate];m.destinationByKey.set(candidate.key,candidate);return candidate;
}
it('add menu never creates a Context to impersonate a generic scene',async()=>{canonicalRead(0);await mount();await act(async()=>button('添加与创建').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true})));expect(document.querySelector('[data-lcos-railway-create-worksite-form]')).toBeNull();expect(document.querySelector('[data-lcos-railway-create-worksite]')).toBeNull();expect(document.querySelector('[data-lcos-railway-manage-list]')).toBeNull();expect(m.graphWrite).not.toHaveBeenCalled();});
it('resumes an existing no-canvas Context candidate after local pending state is gone',async()=>{
  canonicalRead(0);
  const existing=contextWorksiteDestination('workspace-existing-context','已保存上下文',undefined);
  m.candidates=[existing];
  const ensure=vi.fn(async(workspaceId:string)=>{readyContextCandidate(workspaceId,'已保存上下文','canvas-existing');return 'canvas-existing';});
  const activate=vi.fn();
  const previousProject=useLcosShellStore.getState().projectId;
  act(()=>useLcosShellStore.setState({projectId:'p'}));
  await mount(activate,ensure);
  await act(async()=>button('添加与创建').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true})));
  try {
    const resume=document.querySelector<HTMLButtonElement>('button[aria-label="继续建立并进入 已保存上下文"]');
    expect(resume).not.toBeNull();
    expect(resume?.disabled).toBe(false);
    await act(async()=>resume?.click());
    await vi.waitFor(()=>expect(activate).toHaveBeenCalledOnce());
    expect(m.graphWrite).not.toHaveBeenCalled();
    expect(ensure).toHaveBeenCalledExactlyOnceWith('workspace-existing-context');
    expect(m.write).not.toHaveBeenCalled(); // Enter the existing worksite without requiring a bookmark.
    expect(activate).toHaveBeenCalledWith(expect.objectContaining({workspaceId:'workspace-existing-context',canvasId:'canvas-existing',surface:'context'}));
  } finally {
    act(()=>useLcosShellStore.setState({projectId:previousProject}));
  }
});

it('new View target admits ordinary material without canvas fallback',async()=>{
  canonicalRead(0);await mount();
  const target=useLcosDropStore.getState().targets().find(t=>t.targetId==='railway-new-view:p');
  expect(target?.semantic.kind).toBe('railway-new-view');
  expect(resolveDropIntent({kind:'object',entityType:'note',entityId:'n'},target!).status).toBe('ready');
  expect(m.write).not.toHaveBeenCalled();
});
it('overflow disables native HTML5 dragging so pointer carry and reorder have one owner',async()=>{
  const previous=window.innerHeight;Object.defineProperty(window,'innerHeight',{value:260,configurable:true});
  try {
    canonicalRead(5);await mount();
    await act(async()=>document.querySelector<HTMLButtonElement>('[data-lcos-railway-overflow-trigger]')!.click());
    const item=document.querySelector<HTMLButtonElement>('[data-lcos-railway-destination-key]')!;
    expect(item.getAttribute('draggable')).toBe('false');
    const setData=vi.fn();const event=new Event('dragstart',{bubbles:true,cancelable:true});
    Object.defineProperties(event,{altKey:{value:true},dataTransfer:{value:{effectAllowed:'',setData}}});
    await act(async()=>item.dispatchEvent(event));
    expect(setData).not.toHaveBeenCalled();
    expect(m.write).not.toHaveBeenCalled();
    await act(async()=>item.dispatchEvent(new Event('dragend',{bubbles:true})));
    expect(useLcosDropStore.getState().state.status).toBe('idle');
  } finally {Object.defineProperty(window,'innerHeight',{value:previous,configurable:true});}
});

it('the left plus discloses creation tools without creating a worksite by itself', async () => {
 canonicalRead(0); await mount();
 await act(async () => button('添加与创建').click());
 expect(document.querySelector('[data-lcos-creation-tools-host]')).not.toBeNull();
 expect(button('新建空白现场')).not.toBeNull();
 expect(m.graphWrite).not.toHaveBeenCalled();
});
