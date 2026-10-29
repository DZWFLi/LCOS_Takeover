import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';

const root=process.cwd(),dir=await fs.mkdtemp(path.resolve('.runtime/native-sync-feedback-'));
const output=path.resolve('output/原任务同步通知_20261026/专项',new Date().toISOString().replaceAll(':','-'));
await fs.mkdir(output,{recursive:true});
const spec=file=>JSON.stringify(path.resolve(file).replaceAll('\\','/'));
const sourceFile=path.resolve('lab/pilot/native-execution-sync.tsx');
let source=await fs.readFile(sourceFile,'utf8');
source=source.replace("from 'react';","from './hooks';")
 .replace(/import \{ useCollaborationSessionStore \} from [^;]+;/,'const useCollaborationSessionStore={getState:()=>({watchProjectChanges:(...args:any[])=>globalThis.__SYNC_HOOKS__.watch(...args)})};')
 .replace(/import \{ useLcosShellStore \} from [^;]+;/,'const useLcosShellStore:any=Object.assign((selector:any)=>selector(globalThis.__SYNC_HOOKS__.shell),{getState:()=>globalThis.__SYNC_HOOKS__.shell,subscribe:(fn:any)=>globalThis.__SYNC_HOOKS__.subscribeShell(fn)});')
 .replace(/import useCanvasStore, \{ type NativeCanvasSnapshot \} from [^;]+;/,'type NativeCanvasSnapshot=any;const useCanvasStore:any=Object.assign((selector:any)=>selector(globalThis.__SYNC_HOOKS__.canvas),{getState:()=>globalThis.__SYNC_HOOKS__.canvas,subscribe:(fn:any)=>globalThis.__SYNC_HOOKS__.subscribeCanvas(fn)});')
 .replace(/import \{ useNativeDropNotice \} from [^;]+;/,'const useNativeDropNotice=()=>globalThis.__SYNC_HOOKS__.notice;');
source=source.replace(/from\s+(['"])(\.[^'"]+)\1/g,(_,q,name)=>'from '+spec(path.resolve(path.dirname(sourceFile),name)))
 .replace(spec(path.resolve('lab/pilot/hooks')),spec(path.join(dir,'hooks')));
source+='\nconst React={Fragment:Symbol("fragment"),createElement:(type:any,props:any,...children:any[])=>({type,props:{...props,children}})};\n';
await fs.writeFile(path.join(dir,'sync.tsx'),source);
await fs.writeFile(path.join(dir,'hooks.ts'),['useEffect','useMemo','useRef','useState'].map(name=>`export const ${name}=(...args:any[])=>globalThis.__SYNC_HOOKS__.${name}(...args);`).join('\n'));
await fs.writeFile(path.join(dir,'entry.ts'),`export * from './sync';export * from ${spec('lab/pilot/native-execution-sync-feedback.ts')};`);
await buildPilotEntry(path.relative(root,path.join(dir,'entry.ts')),path.join(dir,'entry.mjs'),'node');
const {NativeExecutionSync,createNativeExecutionProjectionSyncController,createNativeExecutionSyncFeedbackController}=await import(pathToFileURL(path.join(dir,'entry.mjs')));
const report={passed:false,cases:[],networkCalls:0,domainWrites:0,models:0,
 scope:'Executes the actual feedback adapter, actual NativeExecutionSync TSX effects/cleanup and original HostLifecycleReconciler/controller. React slot scheduling, Canvas/Shell observations, original notice rendering and API transport are controlled. No browser or live Core verification.'};
const actualFetch=globalThis.fetch;globalThis.fetch=()=>{report.networkCalls++;throw Error('No network in source-only feedback test');};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const until=async(check,message)=>{const end=Date.now()+1800;while(Date.now()<end){if(check())return;await wait(5);}assert.ok(check(),message??'Expected original lifecycle completion');};
const defer=()=>{let resolve;return{promise:new Promise(r=>{resolve=r;}),resolve:v=>resolve(v)};};
function noticeFixture(){const calls=[],dismissals=[],visible=new Map();let n=0;
 const notice=options=>{const id=options.id??'actual-rt-'+(++n),entry={...options,id};calls.push(entry);visible.set(id,entry);return id;};
 notice.dismiss=id=>{dismissals.push(id);visible.delete(id);};return{notice,calls,dismissals,visible};}
function harness({outcomes=[{ok:false,reason:'Failed to fetch — Core/API internal detail'}],notice=true,enabled=true,status='ready'}={}){
 const physical=noticeFixture(),canvasListeners=new Set(),shellListeners=new Set(),watchers=new Set(),calls=[],slots=[],effects=[];
 let pointer=0,mounted=true,view,sets=0,unmountedSets=0,nextCall=0;
 const api={synchronizeExecutionProjection:async(target,options)=>{calls.push({target,options});const value=outcomes[nextCall++]??{ok:true};if(value instanceof Error)throw value;return await value;}};
 const shell={projectId:'p',activeSurface:'main',activeWorkspaceId:'w',surfaceCanvasId:{main:'c',context:'other'}};
 const canvas={status,canvasId:'c',rfInstance:api};
 const props={projectId:'p',canvasId:'c',workspaceId:'w',enabled};
 const environment={shell,canvas,notice:notice?physical.notice:null,
  subscribeCanvas:fn=>{canvasListeners.add(fn);return()=>canvasListeners.delete(fn);},subscribeShell:fn=>{shellListeners.add(fn);return()=>shellListeners.delete(fn);},
  watch:(project,fn)=>{assert.equal(project,'p');watchers.add(fn);return()=>watchers.delete(fn);},
  useRef(initial){const at=pointer++;if(!slots[at])slots[at]={value:{current:initial}};return slots[at].value;},
  useMemo(factory,deps){const at=pointer++;if(!slots[at]||!equal(slots[at].deps,deps))slots[at]={value:factory(),deps};return slots[at].value;},
  useState(initial){const at=pointer++;if(!slots[at])slots[at]={value:typeof initial==='function'?initial():initial};return[slots[at].value,value=>{if(!mounted){unmountedSets++;return;}sets++;slots[at].value=typeof value==='function'?value(slots[at].value):value;}];},
  useEffect(setup,deps){const at=pointer++;if(!slots[at]||!equal(slots[at].deps,deps)){const old=slots[at];slots[at]={deps,setup,cleanup:old?.cleanup};effects.push(()=>{slots[at].cleanup?.();slots[at].cleanup=setup();});}},
 };
 function equal(a,b){return!!a&&a.length===b.length&&a.every((x,i)=>Object.is(x,b[i]));}
 function activate(){globalThis.__SYNC_HOOKS__=environment;globalThis.window={__LCOS_NODE_LAB__:{api:canvas.rfInstance,projectId:shell.projectId,currentCanvasId:canvas.canvasId}};}
 const render=()=>{activate();pointer=0;view=NativeExecutionSync(props);while(effects.length)effects.shift()();return view;};
 const notify=()=>{activate();for(const fn of [...canvasListeners,...shellListeners])fn();};
 const unmount=()=>{activate();for(const slot of slots)slot?.cleanup?.();mounted=false;};
 const replay=()=>{activate();for(const slot of slots)if(slot?.setup){slot.cleanup?.();slot.cleanup=slot.setup();}};
 render();
 return{physical,canvas,shell,props,calls,watchers,slots,render,notify,unmount,replay,get view(){return view;},get sets(){return sets;},get unmountedSets(){return unmountedSets;},
  emit:()=>{activate();for(const fn of [...watchers])fn();},counts:()=>({canvas:canvasListeners.size,shell:shellListeners.size,watchers:watchers.size})};
}
const all=(node,predicate,out=[])=>{if(Array.isArray(node)){for(const n of node)all(n,predicate,out);return out;}if(node&&typeof node==='object'){if(predicate(node))out.push(node);all(node.props?.children,predicate,out);}return out;};
const text=node=>Array.isArray(node)?node.map(text).join(''):node&&typeof node==='object'?text(node.props?.children):node===null||node===undefined||typeof node==='boolean'?'':String(node);
try{
 // Pure adapter ports prove stale action identity and busy admission, with no
 // fake controller success. The integration cases below run the real one.
 const physical=noticeFixture();let current=true,retries=0;
 const feedback=createNativeExecutionSyncFeedbackController(physical.notice,{isCurrent:()=>current,retry:()=>{retries++;}});
 feedback.update({status:'blocked',message:'Failed to fetch: private detail'});const id=physical.calls[0].id,old=physical.calls[0].action;
 let prevented=0;old.onClick({preventDefault(){prevented++;}});old.onClick({preventDefault(){prevented++;}});
 assert.equal(retries,1);assert.equal(prevented,2);assert.equal(physical.calls.at(-1).action,undefined);assert.equal(physical.calls.at(-1).id,id);
 feedback.update({status:'blocked',message:'still genuinely blocked'});const fresh=physical.calls.at(-1).action;
 old.onClick();assert.equal(retries,1);feedback.update({status:'ready',message:'original receipt confirmed'});assert.equal(physical.visible.size,0);fresh.onClick();assert.equal(retries,1);
 feedback.update({status:'unavailable',message:'owner unavailable'});assert.equal(physical.calls.at(-1).action,undefined);assert.equal(physical.calls.at(-1).id,id);
 current=false;feedback.invalidate();assert.equal(physical.visible.size,0);current=true;feedback.update({status:'blocked',message:'old owner returned'});assert.equal(physical.visible.size,0);feedback.dispose();
 report.cases.push('One exact synchronization owner keeps one original toast ID; raw diagnostics never render; original retry action prevents auto-dismiss, is single while busy, and old action tokens cannot retry after state changes or owner invalidation.');
 let h=harness({outcomes:[{ok:false,reason:'Failed to fetch — Core/API detail'},{ok:true}]});await until(()=>h.physical.calls.at(-1)?.action);
 h.render();assert.equal(all(h.view,n=>n.props?.['data-lcos-native-execution-sync-feedback']).length,0,'Native notice replaces the independent positioned banner');
 assert.equal(all(h.view,n=>n.props?.['data-lcos-native-execution-sync-state']==='blocked').length,1);
 const fail=h.physical.calls.at(-1),beforeSets=h.sets;assert.equal(fail.title,'画布中的任务暂时无法更新，已有内容保留。');assert.equal(fail.duration,0);
 fail.action.onClick({preventDefault(){}});fail.action.onClick({preventDefault(){}});await until(()=>h.calls.length===2&&h.physical.visible.size===0);
 assert.equal(h.calls[0].options.retryPendingSave,undefined);assert.equal(h.calls[1].options.retryPendingSave,true);assert.ok(h.sets>beforeSets);assert.ok(h.physical.calls.every(c=>c.id===fail.id));
 await wait(40);assert.equal(h.calls.length,2,'No automatic retry after success');h.unmount();assert.deepEqual(h.counts(),{canvas:0,shell:0,watchers:0});
 report.cases.push('Actual TSX provider port + original controller: blocked receipt → same original toast busy/retry → original API receives retryPendingSave once → real ready receipt dismisses. Hidden original status remains; independent positioned feedback is absent only when the original notice is available.');
 h=harness({outcomes:[new TypeError('Failed to fetch')]});await until(()=>h.physical.calls.at(-1)?.action);assert.equal(h.physical.calls.at(-1).title,'画布中的任务暂时无法更新，已有内容保留。');
 const count=h.calls.length;await wait(70);assert.equal(h.calls.length,count);assert.equal(h.physical.visible.size,1);h.render();assert.equal(all(h.view,n=>n.props?.['data-lcos-native-execution-sync-state']==='ready').length,0);h.unmount();
 report.cases.push('Real controller transport rejection remains blocked with retained-content feedback, never a fake ready state or automatic retry; raw exception stays inside the original diagnostic.');
 for(const change of ['project','canvas','workspace','api','surface','mapping','host','disabled-prop']){
  h=harness();await until(()=>h.physical.calls.at(-1)?.action);const retained=h.physical.calls.at(-1).action,oldCalls=h.calls.length;
  if(change==='project')h.shell.projectId='other-project';if(change==='canvas')h.canvas.canvasId='other-canvas';if(change==='workspace')h.shell.activeWorkspaceId='other-workspace';
  if(change==='api')h.canvas.rfInstance={synchronizeExecutionProjection:async()=>{throw Error('Old action must not call replacement API');}};
  if(change==='surface')h.shell.activeSurface='context';if(change==='mapping')h.shell.surfaceCanvasId.main='replacement';
  if(change==='host')window.__LCOS_NODE_LAB__.api={};
  if(change==='disabled-prop'){h.props.enabled=false;h.render();}else if(change!=='host')h.notify();
  retained.onClick({preventDefault(){}});assert.equal(h.physical.visible.size,0,change);await wait(20);assert.equal(h.calls.length,oldCalls,change);h.unmount();
 }
 report.cases.push('Actual TSX stale callbacks across project/Canvas/Workspace/API/Surface/mapping/host/disabled reject before original retry; raw store notifications dismiss immediately, before React effect cleanup is needed.');
 const pending=defer();h=harness({outcomes:[pending.promise]});await until(()=>h.calls.length===1);const sets=h.sets;h.unmount();pending.resolve({ok:true});await tick();await tick();assert.equal(h.sets,sets);assert.equal(h.unmountedSets,0);assert.equal(h.physical.visible.size,0);assert.deepEqual(h.counts(),{canvas:0,shell:0,watchers:0});
 h=harness();await until(()=>h.physical.calls.at(-1)?.action);const retry=h.physical.calls.at(-1).action;retry.onClick();h.unmount();const after=h.calls.length;await wait(360);assert.equal(h.calls.length,after);retry.onClick();assert.equal(h.physical.visible.size,0);assert.equal(h.unmountedSets,0);
 report.cases.push('Unmount disposes the same original reconciler/watcher and toast, cancels a scheduled manual retry, and ignores late API success with zero unmounted setState; retained original action cannot resurrect work.');
 const first=defer(),second=defer();h=harness({outcomes:[first.promise,second.promise]});h.replay();await until(()=>h.calls.length===2);first.resolve({ok:false,reason:'obsolete first setup'});await tick();second.resolve({ok:true});await until(()=>h.physical.visible.size===0);assert.equal(h.unmountedSets,0);h.unmount();
 report.cases.push('Actual effect setup→cleanup→setup replay without render restores only its own owner; old setup completion cannot publish or dismiss the current setup notice.');
 h=harness({enabled:false});assert.equal(h.calls.length,0);assert.equal(h.physical.calls.length,0);h.unmount();
 h=harness({status:'waiting'});await until(()=>h.physical.calls.length===1);assert.equal(h.calls.length,0);assert.equal(h.physical.calls[0].action,undefined);h.unmount();
 h=harness({notice:false});await until(()=>h.calls.length===1);await tick();h.render();const fallback=all(h.view,n=>n.props?.['data-lcos-native-execution-sync-feedback']==='blocked');assert.equal(fallback.length,1);assert.match(text(fallback[0]),/已有内容保留/);h.unmount();
 report.cases.push('Disabled sync creates no work/notice; unavailable owner retains honest unavailable notice without an unauthorized retry. Missing original context retains the existing feedback/retry fallback rather than silently deleting the function.');
 assert.equal(report.networkCalls,0);report.passed=true;
}finally{globalThis.fetch=actualFetch;await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify({passed:report.passed,cases:report.cases.length,output}));
