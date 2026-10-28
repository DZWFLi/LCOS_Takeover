import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';
import { withNativeComposerDraftTransforms } from '../lab/native-composer-draft-source-transform.mjs';

const root = process.cwd(), dir = await fs.mkdtemp(path.resolve('.runtime/native-node-composer-'));
const output = path.resolve('output/原节点用于当前输入_20261026/专项', new Date().toISOString().replaceAll(':','-'));
await fs.mkdir(output, { recursive: true });
const absoluteImports = (source, file) => source.replace(/from\s+(['"])(\.[^'"]+)\1/g,
  (_, quote, spec) => 'from ' + JSON.stringify(path.resolve(path.dirname(file),spec).replaceAll('\\','/')));
const shellFile = path.resolve('lcos/huabu/apps/web/src/lcos/shell/lcosShellStore.ts');
const shellSource = withNativeComposerDraftTransforms()['lcos/huabu/apps/web/src/lcos/shell/lcosShellStore.ts'](
  await fs.readFile(shellFile,'utf8'), { sourcePath:shellFile });
await fs.writeFile(path.join(dir,'shell.ts'), absoluteImports(shellSource,shellFile));
const serviceFile = path.resolve('lab/pilot/native-node-composer.ts');
let serviceSource = await fs.readFile(serviceFile,'utf8');
assert.equal(serviceSource.split("import useCanvasStore from './native-canvas-port';").length,2);
await fs.writeFile(path.join(dir,'hooks.ts'),['useEffect','useMemo','useRef','useState'].map(name=>
  `export const ${name}=(...args:any[])=>globalThis.__NODE_COMPOSER_HOOKS__.${name}(...args);`).join('\n'));
serviceSource=serviceSource.replace("from 'react';","from './hooks';");
// Only browser hooks/Canvas are controlled. The actual hook and service body,
// original Shell, reference controller, preparation and admission all execute.
serviceSource = serviceSource.replace("import useCanvasStore from './native-canvas-port';",
  "const useCanvasStore:any=Object.assign((selector:any)=>selector(globalThis.__NODE_COMPOSER_HOOKS__.canvas),{getState(){return globalThis.__NODE_COMPOSER_HOOKS__.canvas},subscribe(listener:any){return globalThis.__NODE_COMPOSER_HOOKS__.subscribe?.(listener)??(()=>{})}});");
serviceSource=serviceSource.replace("import { useLcosShellStore } from", "import { useLcosShellStore as actualShellStore } from")
  .replace("import { useLcosReferenceStore } from", "import { useLcosReferenceStore as actualReferenceStore } from")
  .replace("import { requestNativeCurrentComposerInput,", "import { requestNativeCurrentComposerInput as actualRequestCurrentInput,")
  + '\nconst useLcosShellStore:any=Object.assign((selector:any)=>selector(actualShellStore.getState()),{getState:actualShellStore.getState,subscribe:actualShellStore.subscribe});\n'
  + 'const useLcosReferenceStore:any=Object.assign((selector:any)=>selector(actualReferenceStore.getState()),{getState:actualReferenceStore.getState,subscribe:actualReferenceStore.subscribe});\n'
  + 'function requestNativeCurrentComposerInput(target:any){return actualRequestCurrentInput(target,{projectId:()=>actualShellStore.getState().projectId,dispatch:event=>window.dispatchEvent(event)});}\n';
let isolatedService=absoluteImports(serviceSource,serviceFile)
  .replace(JSON.stringify(path.resolve('lab/pilot/hooks').replaceAll('\\','/')),JSON.stringify(path.join(dir,'hooks').replaceAll('\\','/')))
  .replace(JSON.stringify(shellFile.replaceAll('\\','/').replace(/\.ts$/,'')),JSON.stringify(path.join(dir,'shell').replaceAll('\\','/')));
await fs.writeFile(path.join(dir,'service.ts'),isolatedService);
const spec = value => JSON.stringify(path.resolve(value).replaceAll('\\','/'));
await fs.writeFile(path.join(dir,'entry.ts'), `export * from './service';
export {useLcosShellStore} from './shell';
export {useLcosReferenceStore} from ${spec('lcos/huabu/apps/web/src/lcos/lcosReferenceState.ts')};
export {composerInputKey} from ${spec('lcos/huabu/apps/web/src/lcos/composer/composerInputJourney.ts')};
export {referencePickOwnerKey} from ${spec('lcos/huabu/apps/web/src/lcos/referencePickOwnership.ts')};`);
await buildPilotEntry(path.relative(root,path.join(dir,'entry.ts')),path.join(dir,'entry.mjs'),'node');
const {createNativeNodeComposerService,createNativeNodeComposerFeedbackController,resolveNativeNodeComposerReference,nativeNodeComposerCandidate,nativeNodeComposerLocalAvailability,readNativeNodeComposerFacts,LCOSUseNativeNodeComposer,
  useLcosShellStore:S,useLcosReferenceStore:R,composerInputKey,referencePickOwnerKey} = await import(pathToFileURL(path.join(dir,'entry.mjs')));
const report = {passed:false,cases:[],models:0,domainWrites:0,scope:'Actual new service + adopted original prepareDraftReferences/Run capability + original ReferenceStore/controller + actual Shell transformed by its existing per-input draft owner. No browser, backend write or model.'};
const realFetch = globalThis.fetch;
globalThis.fetch = () => { throw Error('No network allowed by this source-only service test'); };
let serial = 0;
const clone = value => structuredClone(value);
function fixture({intent='delegate',mime='text/plain',noInput=false}={}) {
  const projectId='p-'+(++serial),canvasId='canvas',workspaceId='workspace',scopeId='scope',artifactId='artifact',viewId='view',revisionId='revision-old';
  S.getState().setProject(projectId);R.getState().setProject(projectId);S.getState().setActiveWorkspaceId(workspaceId);
  S.setState({composerTarget:null,composerOpen:false,composerPrompt:'原输入中间的文字',composerCaret:null});
  const savedRef={version:1,entityType:'view',entityId:viewId,artifactId,artifactViewId:viewId,revisionId};
  const node={id:'node',type:mime.startsWith('image/')?'image':'text',data:{id:'node',lcos_ref:savedRef},position:{x:120,y:100}};
  const canvas={status:'ready',canvasId,rfInstance:{id:'original-api'},nodes:[node]};
  const graph={project:{id:projectId},workspaces:[{id:workspaceId,projectId,canvasId,scopeId}],scopes:[{id:scopeId,projectId}],
    artifacts:[{id:artifactId,projectId,kind:mime.startsWith('image/')?'image':'text',title:'准确材料',currentRevisionId:'revision-new'}],
    artifactViews:[{id:viewId,artifactId,scopeId,revisionId,referenceKind:'explicit_additional'}],
    artifactRevisions:[{id:revisionId,artifactId,status:'superseded',fileRecordId:'file-old',contentHash:'original-existing-file-fact'}],
    fileRecords:[{id:'file-old',projectId,mimeType:mime,availability:'current',observedHash:'original-existing-file-fact'}]};
  const facts={graph,bindings:[{projectId,canvasId,spatialKind:'node',spatialId:node.id,entityType:'view',entityId:viewId}]};
  const target={nodeId:'canvas:input',title:'原输入',workspaceId,intent,anchor:{x:0,y:0,width:0,height:0},
    messageId:'original-message',continuationOperationId:'original-operation',...(intent==='continue'?{receiverConversationId:'receiver'}:{})};
  if(!noInput)S.getState().openComposer(target);
  S.getState().setComposerPrompt('原输入中间的文字');
  if(!noInput)S.getState().rememberComposerCaret({projectId,targetKey:composerInputKey(S.getState().composerTarget),text:S.getState().composerPrompt,start:2,end:5});
  const preexisting={entityType:'artifact',entityId:'existing',revisionId:'existing-old',mimeType:'text/plain'};
  R.getState().addEntitiesToDraft([preexisting],intent);
  const reveal=[];let read=async()=>clone(facts), reads=0;
  const ports={shell:()=>S.getState(),canvas:()=>canvas,references:()=>R.getState(),readFacts:async(...args)=>{reads++;return read(...args);},revealCurrentInput:request=>{reveal.push(request);return true;}};
  const service=createNativeNodeComposerService(ports);
  return {projectId,canvasId,workspaceId,node,canvas,facts,target,preexisting,service,ports,reveal,setRead:fn=>{read=fn;},reads:()=>reads};
}
const refs=()=>R.getState().draft.orderedEntityRefs;
const protectedInput=()=>({target:clone(S.getState().composerTarget),prompt:S.getState().composerPrompt,caret:clone(S.getState().composerCaret),refs:clone(refs())});
const inputIdentityForTest=target=>Object.fromEntries(Object.entries(target).filter(([key])=>key!=='focusInput'));
const assertUnchanged=value=>assert.deepEqual(protectedInput(),value);
const defer=()=>{let resolve,reject;return{promise:new Promise((a,b)=>{resolve=a;reject=b}),release:value=>resolve(value),reject:error=>reject(error)};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const until=async check=>{for(let index=0;index<25;index++){if(check())return;await tick();}assert.ok(check(),'Expected local controller completion');};
function originalNoticeFixture(){
  const calls=[],dismissed=[],visible=new Map();let next=0;
  const notice=options=>{const id=options.id??'physical-rt-'+(++next);const value={...options,id};calls.push(value);visible.set(id,value);return id;};
  notice.dismiss=id=>{dismissed.push(id);visible.delete(id);};return{notice,calls,dismissed,visible};
}
function hookHarness(f,notice){
  const slots=[],effects=[];let cursor=0,view;
  const depsEqual=(a,b)=>!!a&&!!b&&a.length===b.length&&a.every((value,index)=>Object.is(value,b[index]));
  const hooks={canvas:f.canvas,useRef(value){const at=cursor++;return slots[at]??(slots[at]={current:value});},
    useState(value){const at=cursor++;slots[at]??={value:typeof value==='function'?value():value};return[slots[at].value,next=>{slots[at].value=typeof next==='function'?next(slots[at].value):next;}];},
    useMemo(make,deps){const at=cursor++;if(!slots[at]||!depsEqual(slots[at].deps,deps))slots[at]={value:make(),deps};return slots[at].value;},
    useEffect(effect,deps){const at=cursor++;if(!slots[at]||!depsEqual(slots[at].deps,deps))effects.push(()=>{slots[at]?.cleanup?.();slots[at]={deps,cleanup:effect()};});}};
  globalThis.__NODE_COMPOSER_HOOKS__=hooks;
  return{get view(){return view;},render(){cursor=0;view=LCOSUseNativeNodeComposer('node',notice);while(effects.length)effects.shift()();return view;},
    dispose(){for(const slot of slots)slot?.cleanup?.();if(globalThis.__NODE_COMPOSER_HOOKS__===hooks)delete globalThis.__NODE_COMPOSER_HOOKS__;}};
}
try {
  for(const intent of ['delegate','continue']) {
    const f=fixture({intent}),before=protectedInput();
    assert.equal((await f.service.availability('node')).canUse,true);
    const result=await f.service.useForCurrentInput('node');assert.equal(result.ok,true);assert.equal(result.added,1);
    assert.equal(S.getState().composerPrompt,before.prompt);assert.deepEqual(S.getState().composerCaret,before.caret);
    const {focusInput,...target}=S.getState().composerTarget;assert.deepEqual(target,{...before.target});
    assert.equal(S.getState().composerTarget.messageId,'original-message');assert.equal(S.getState().composerTarget.continuationOperationId,'original-operation');
    assert.equal(refs()[0].entityId,'existing');assert.equal(refs()[1].revisionId,'revision-old');assert.equal(refs()[1].artifactViewId,'view');
    assert.equal((await f.service.useForCurrentInput('node')).added,0);assert.equal(refs().length,2);assert.equal(R.getState().referenceInputOperations.size,0);
    assert.deepEqual(f.reveal[0],{projectId:f.projectId,canvasId:'canvas',inputKey:composerInputKey(S.getState().composerTarget),messageId:'original-message',continuationOperationId:'original-operation'});
  }
  report.cases.push('Ordinary and continuation inputs retain receiver/address/message/operation/text/caret and original ordered references; exact historical View/Revision is appended once, duplicate click is idempotent through the original controller.');
  {
    const f=fixture({noInput:true}),before=protectedInput();assert.equal((await f.service.useForCurrentInput('node')).ok,true);
    const target=S.getState().composerTarget;assert.equal(target.nodeId,'node');assert.equal(target.workspaceId,f.workspaceId);assert.equal(target.intent,'delegate');
    assert.deepEqual(target.targetNodeIds,['node']);assert.equal(target.targetReferences[0].revisionId,'revision-old');assert.equal(target.receiverConversationId,undefined);
    assert.equal(S.getState().composerPrompt,before.prompt);assert.equal(refs()[0].entityId,'existing');assert.equal(refs().length,2);assert.equal(f.reveal.length,1);
    report.cases.push('No existing input opens the original Composer with exact object context and adopts the unaddressed draft/references once; it does not create/send a conversation or Run.');
  }
  {
    const f=fixture({mime:'image/png'}),before=protectedInput();assert.match((await f.service.availability('node')).reason,/图片|PDF|暂/);
    assert.equal((await f.service.useForCurrentInput('node')).ok,false);assertUnchanged(before);
    const c=fixture({mime:'image/png',intent:'continue'});assert.equal((await c.service.useForCurrentInput('node')).ok,true);assert.equal(refs()[1].mimeType,'image/png');
    report.cases.push('Adopted ordinary Run text capability rejects PNG without changing input; continuation uses its own existing reference admission and retains the exact PNG version.');
  }
  for(const change of ['view-revision','binding','duplicate-binding','duplicate-view','file-unavailable','archived','scope','unknown-revision','primary-stale']) {
    const f=fixture(),before=protectedInput();
    if(change==='view-revision')f.facts.graph.artifactViews[0].revisionId='revision-new';
    if(change==='binding')f.facts.bindings[0].entityId='another-view';
    if(change==='duplicate-binding')f.facts.bindings.push(clone(f.facts.bindings[0]));
    if(change==='duplicate-view')f.facts.graph.artifactViews.push(clone(f.facts.graph.artifactViews[0]));
    if(change==='file-unavailable')f.facts.graph.fileRecords[0].availability='missing';
    if(change==='archived')f.facts.graph.artifacts[0].archivedAt='2026-10-26';
    if(change==='scope')f.facts.graph.artifactViews[0].scopeId='foreign';
    if(change==='unknown-revision')f.facts.graph.artifactRevisions=[];
    if(change==='primary-stale'){Object.assign(f.node.data.lcos_ref,{entityType:'artifact',entityId:'artifact'});Object.assign(f.facts.bindings[0],{entityType:'artifact',entityId:'artifact'});f.facts.graph.artifactViews[0].referenceKind='primary';}
    assert.equal((await f.service.useForCurrentInput('node')).ok,false,change);assertUnchanged(before);assert.equal(f.reveal.length,0);assert.equal(R.getState().referenceInputOperations.size,0);
  }
  report.cases.push('Wrong/duplicate binding, duplicate View, changed View/Revision, unknown version, unreadable file, archived artifact, foreign Scope and stale primary all fail atomically; no latest fallback or partial reference insertion.');
  for(const change of ['project','canvas','api','workspace','node-ref','message','operation','receiver','new-input']) {
    const f=fixture({intent:'continue'}),pending=defer();f.setRead(()=>pending.promise);const operation=f.service.useForCurrentInput('node');
    if(change==='project'){S.getState().setProject('other');R.getState().setProject('other');}
    if(change==='canvas')f.canvas.canvasId='other';
    if(change==='api')f.canvas.rfInstance={id:'new-api'};
    if(change==='workspace')S.getState().setActiveWorkspaceId('other');
    if(change==='node-ref')f.node.data.lcos_ref.revisionId='replaced';
    if(change==='message')S.setState({composerTarget:{...S.getState().composerTarget,messageId:'new-message'}});
    if(change==='operation')S.setState({composerTarget:{...S.getState().composerTarget,continuationOperationId:'new-operation'}});
    if(change==='receiver')S.getState().openComposer({...f.target,receiverConversationId:'other'});
    if(change==='new-input')S.getState().openComposer({...f.target,nodeId:'another-input'});
    const current=protectedInput();pending.release(clone(f.facts));assert.equal((await operation).ok,false,change);assertUnchanged(current);assert.equal(f.reveal.length,0);assert.equal(R.getState().referenceInputOperations.size,0);
  }
  report.cases.push('Delayed read after project/canvas/API/Workspace/node identity/input/message/operation/receiver changes cannot write or focus the new input; every preparing token is released.');
  {
    const f=fixture(),pending=defer();f.setRead(()=>pending.promise);const operation=f.service.useForCurrentInput('node');
    S.getState().setComposerPrompt('异步核对期间用户的新文字');S.getState().rememberComposerCaret({projectId:f.projectId,targetKey:composerInputKey(S.getState().composerTarget),text:S.getState().composerPrompt,start:3,end:7});
    const current=protectedInput();pending.release(clone(f.facts));assert.equal((await operation).ok,true);assert.equal(S.getState().composerPrompt,current.prompt);assert.deepEqual(S.getState().composerCaret,current.caret);
    report.cases.push('Same-input typing and a new selection during the read remain intact; the service never restores an old text/caret snapshot.');
  }
  for(const phase of ['before','during']) {
    const f=fixture(),before=protectedInput(),owner=referencePickOwnerKey(f.projectId,S.getState().composerTarget);let sendingToken;
    const pending=defer();if(phase==='during')f.setRead(()=>pending.promise);else sendingToken=R.getState().beginReferenceInputOperation(owner,'sending');
    const operation=f.service.useForCurrentInput('node');
    if(phase==='during'){sendingToken=R.getState().beginReferenceInputOperation(owner,'sending');pending.release(clone(f.facts));}
    assert.equal((await operation).ok,false);assertUnchanged(before);R.getState().finishReferenceInputOperation(sendingToken);assert.equal(R.getState().referenceInputOperations.size,0);
  }
  report.cases.push('An actual original sending operation, already active or beginning during preparation, blocks admission without dropping references or pending-send identity.');
  {
    const f=fixture(),pending=defer();f.setRead(()=>pending.promise);const first=f.service.useForCurrentInput('node');assert.equal((await f.service.useForCurrentInput('node')).ok,false);assert.equal(f.reads(),1);
    pending.release(clone(f.facts));assert.equal((await first).ok,true);assert.equal(refs().length,2);
    const before=protectedInput();f.setRead(()=>{throw Error('真实读取不可达');});assert.equal((await f.service.useForCurrentInput('node')).ok,false);assertUnchanged(before);
    report.cases.push('Concurrent double click starts one preparation; failed/unknown read preserves the whole input and releases the original operation.');
  }
  for(const field of ['lcos_collection_ref','lcos_member_ref','lcos_conversation_ref','lcos_execution_ref','lcos_run_ref','lcos_result_ref']) {
    const f=fixture(),before=protectedInput();f.node.data[field]={entityType:'run',entityId:'not-an-artifact'};
    assert.equal(nativeNodeComposerCandidate(f.node).supported,false);assert.equal((await f.service.useForCurrentInput('node')).ok,false);assertUnchanged(before);
  }
  {
    const f=fixture(),before=protectedInput();f.node.data.lcos_ref.entityType='unknown';assert.equal(nativeNodeComposerCandidate(f.node).supported,false);assert.equal((await f.service.useForCurrentInput('node')).ok,false);assertUnchanged(before);
    report.cases.push('Collection/Scope/member/conversation/Run/result and malformed unknown refs are explicitly unsupported by this ordinary-material action, never passed as fabricated Artifacts.');
  }
  {
    const calls=[];globalThis.fetch=async(url,init)=>{calls.push({url,init});return new Response(JSON.stringify({ok:true,value:url.endsWith('/graph')?{project:{id:'read-only'}}:[]}),{status:200,headers:{'Content-Type':'application/json'}});};
    await readNativeNodeComposerFacts('read-only');assert.equal(calls.length,2);assert.deepEqual(calls.map(row=>row.init.method),['GET','GET']);assert.ok(calls.every(row=>row.url.startsWith('/api/lcos/core/projects/read-only/')&&row.init.redirect==='error'));
    globalThis.fetch=async()=>new Response(JSON.stringify({ok:false,error:{message:'unavailable'}}),{status:503});await assert.rejects(()=>readNativeNodeComposerFacts('read-only'));
    globalThis.fetch=async()=>{throw new TypeError('Failed to fetch');};await assert.rejects(()=>readNativeNodeComposerFacts('read-only'),error=>/材料暂时无法读取/.test(error.message)&&!error.message.includes('Failed')&&error.cause?.message==='Failed to fetch');
    globalThis.fetch=async()=>new Response('<html>not-json</html>',{status:200});await assert.rejects(()=>readNativeNodeComposerFacts('read-only'),error=>/材料暂时无法读取/.test(error.message)&&error.cause instanceof SyntaxError);
    const abort=new DOMException('cancelled','AbortError');globalThis.fetch=async()=>{throw abort;};await assert.rejects(()=>readNativeNodeComposerFacts('read-only'),error=>error===abort);
    report.cases.push('Default reader executes exactly graph and binding GETs with no redirect. Network rejection and invalid JSON produce a human material-read message with unrendered original cause; AbortError identity remains cancellation. No POST, external URL or model path exists.');
  }
  {
    const f=fixture({mime:'application/pdf'});
    assert.equal(nativeNodeComposerLocalAvailability(f.node,'delegate').canUse,true,'Unknown text carrier MIME waits for the click read, without hiding the original action');
    const exact={entityType:'artifact',entityId:'artifact',descriptor:{entityType:'artifact',entityId:'artifact',artifactViewId:'view',presentedRevisionId:'revision-old',mimeType:'application/pdf'}};
    assert.equal(nativeNodeComposerLocalAvailability(f.node,'delegate',exact).canUse,false);
    exact.descriptor.presentedRevisionId='foreign-latest';assert.equal(nativeNodeComposerLocalAvailability(f.node,'delegate',exact).canUse,true,'A mismatched descriptor must not supply another version MIME');
    const image=fixture({mime:'image/png'});assert.equal(nativeNodeComposerLocalAvailability(image.node,'delegate').canUse,false);assert.equal(nativeNodeComposerLocalAvailability(image.node,'continue').canUse,true);
    report.cases.push('Local More availability uses only matching original descriptor or declared media carrier, never another revision; unknown text MIME waits for authoritative click validation.');
  }
  {
    const f=fixture({intent:'continue'}),toast=originalNoticeFixture(),results=[],busy=[];
    f.setRead(async()=>{throw Error('这份材料暂时无法读取，原输入保留。');});
    const controller=createNativeNodeComposerFeedbackController(f.ports,toast.notice,{onResult:value=>results.push(value),onBusy:(value,token)=>busy.push({value,token})});
    const stops=[S.subscribe(controller.sync),R.subscribe(controller.sync)];
    try {
      const before=protectedInput();assert.equal((await controller.start('node')).ok,false);assertUnchanged(before);assert.equal(f.reads(),1);
      const first=toast.calls[0],failed=toast.calls.at(-1);assert.equal(first.duration,0);assert.equal(first.action,undefined);assert.equal(failed.id,first.id);assert.equal(failed.duration,0);assert.equal(failed.action.label,'重试');assert.equal(toast.visible.size,1);
      const pending=defer();f.setRead(()=>pending.promise);let prevented=0;
      failed.action.onClick({preventDefault(){prevented++;}});failed.action.onClick({preventDefault(){prevented++;}});assert.equal(prevented,2);assert.equal(f.reads(),2,'Double retry starts one read pair only');
      S.getState().setComposerPrompt('重试前用户编辑的新稿');S.getState().rememberComposerCaret({projectId:f.projectId,targetKey:composerInputKey(S.getState().composerTarget),text:S.getState().composerPrompt,start:1,end:4});
      const edited=protectedInput();pending.release(clone(f.facts));await until(()=>results.length===2);assert.equal(results[1].ok,true);assert.equal(refs().length,2);
      assert.equal(S.getState().composerPrompt,edited.prompt);assert.deepEqual(S.getState().composerCaret,edited.caret);assert.deepEqual(inputIdentityForTest(S.getState().composerTarget),inputIdentityForTest(edited.target));
      const success=toast.calls.at(-1);assert.equal(success.id,first.id);assert.equal(success.action,undefined);assert.equal(success.duration,2500);assert.equal(toast.visible.size,1);
      f.setRead(async()=>clone(f.facts));assert.equal((await controller.start('node')).added,0);assert.match(toast.calls.at(-1).title,/已在当前输入/);assert.equal(toast.visible.size,1);assert.equal(R.getState().referenceInputOperations.size,0);
      assert.deepEqual(busy.map(row=>row.value),[true,false,true,false,true,false]);
    }finally{stops.forEach(stop=>stop());controller.dispose();}
    assert.equal(toast.visible.size,0);report.cases.push('Same physical Rt id changes pending→failed+original retry→success; retry prevents auto-dismiss, duplicate retry makes one read, newer same-input text/caret survive, reference admission deduplicates and original preparing operations release. No automatic retry or second toast queue.');
  }
  for(const change of ['project','canvas','api','workspace','node-ref','message','operation','receiver','new-input','close-input','sending','unmount']) {
    const f=fixture({intent:'continue'}),toast=originalNoticeFixture(),results=[];f.setRead(async()=>{throw Error('Read unavailable');});
    const controller=createNativeNodeComposerFeedbackController(f.ports,toast.notice,{onResult:value=>results.push(value)}),stops=[S.subscribe(controller.sync),R.subscribe(controller.sync)];
    try {
      assert.equal((await controller.start('node')).ok,false);const failed=toast.calls.at(-1),retry=failed.action.onClick,originalTarget=S.getState().composerTarget;
      if(change==='project'){S.getState().setProject('foreign-project');R.getState().setProject('foreign-project');}
      if(change==='canvas')f.canvas.canvasId='foreign-canvas';
      if(change==='api')f.canvas.rfInstance={newApi:true};
      if(change==='workspace')S.getState().setActiveWorkspaceId('foreign-workspace');
      if(change==='node-ref')f.node.data.lcos_ref.revisionId='foreign-version';
      if(change==='message')S.setState({composerTarget:{...originalTarget,messageId:'new-message'}});
      if(change==='operation')S.setState({composerTarget:{...originalTarget,continuationOperationId:'new-operation'}});
      if(change==='receiver')S.getState().openComposer({...originalTarget,receiverConversationId:'another-receiver'});
      if(change==='new-input')S.getState().openComposer({...originalTarget,nodeId:'another-input'});
      if(change==='close-input')S.getState().closeComposer();
      if(change==='sending'){const token=R.getState().beginReferenceInputOperation(referencePickOwnerKey(f.projectId,originalTarget),'sending');R.getState().finishReferenceInputOperation(token);}
      if(change==='unmount')controller.dispose();else controller.sync();
      assert.ok(toast.dismissed.includes(failed.id),change+' dismisses the original toast');
      // Returning to the same open address must not revive an old action that
      // was invalidated by closing it or by an intervening send.
      if(change==='close-input')S.getState().resumeComposer(composerInputKey(originalTarget));
      const current=protectedInput(),reads=f.reads(),published=toast.calls.length;f.setRead(async()=>clone(f.facts));
      retry({preventDefault(){}});await tick();retry({preventDefault(){}});await tick();
      assert.equal(f.reads(),reads,change+' stale callback starts no new GET');assertUnchanged(current);assert.equal(toast.calls.length,published);assert.equal(results.length,1);assert.equal(f.reveal.length,0);assert.equal(R.getState().referenceInputOperations.size,0);
    }finally{stops.forEach(stop=>stop());controller.dispose();}
  }
  report.cases.push('Original failed-toast retry is bound to its captured project/Canvas/API/Workspace/node/ref/input/message/operation. Changing any, closing input, beginning even a completed new send, or unmount dismisses it. Retained old action callbacks make zero GET/admission/route calls and cannot revive after reopening.');
  {
    const f=fixture(),toast=originalNoticeFixture(),pending=defer(),results=[],busy=[];f.setRead(()=>pending.promise);
    const controller=createNativeNodeComposerFeedbackController(f.ports,toast.notice,{onResult:value=>results.push(value),onBusy:value=>busy.push(value)});
    const operation=controller.start('node');assert.equal(toast.calls.length,1);f.setRead(async()=>clone(f.facts));controller.dispose();
    const calls=toast.calls.length,states=busy.length,before=protectedInput();pending.release(clone(f.facts));assert.equal((await operation).ok,false);assertUnchanged(before);assert.equal(toast.calls.length,calls);assert.equal(busy.length,states);assert.deepEqual(results,[]);assert.equal(toast.visible.size,0);
    report.cases.push('Disposing a pending physical notice aborts the action; a late read produces no notification, state callback, admission or route and leaves the original draft intact.');
  }
  {
    const f=fixture({noInput:true}),toast=originalNoticeFixture(),controller=createNativeNodeComposerFeedbackController(f.ports,toast.notice),stops=[S.subscribe(controller.sync),R.subscribe(controller.sync)];
    try{assert.equal((await controller.start('node')).ok,true);assert.equal(toast.calls.at(-1).action,undefined);assert.match(toast.calls.at(-1).title,/已用于/);assert.equal(refs().length,2);}finally{stops.forEach(stop=>stop());controller.dispose();}
    report.cases.push('The original shell establishing its missing input is an authorized synchronous admission transition; it does not invalidate its own successful exact-reference result or create a conversation/Run.');
  }
  for(const mode of ['closed-existing','no-target']){
    const f=fixture({noInput:mode==='no-target'}),toast=originalNoticeFixture();if(mode==='closed-existing')S.getState().closeComposer();
    const previousWindow=globalThis.window,previousCustom=globalThis.CustomEvent;
    globalThis.CustomEvent=class{constructor(type,options){this.type=type;this.detail=options?.detail;}};globalThis.window={dispatchEvent:()=>true};
    let reads=0;globalThis.fetch=async url=>{reads++;return new Response(JSON.stringify({ok:true,value:url.endsWith('/graph')?clone(f.facts.graph):clone(f.facts.bindings)}),{status:200});};
    const h=hookHarness(f,toast.notice);h.render();const stops=[S.subscribe(()=>h.render()),R.subscribe(()=>h.render())];
    try{
      assert.equal((await h.view.useForCurrentInput()).ok,true);h.render();assert.equal(S.getState().composerOpen,true);assert.equal(refs().length,2);assert.equal(toast.visible.size,1);assert.equal(toast.calls.at(-1).duration,2500);assert.match(toast.calls.at(-1).title,/已用于/);assert.deepEqual(toast.dismissed,[]);
      const old=h.view.useForCurrentInput,before=protectedInput(),count=reads;
      S.setState({composerTarget:{...S.getState().composerTarget,messageId:'new-render-message'}});const changed=protectedInput();assert.equal((await old()).ok,false);assert.equal(reads,count);assertUnchanged(changed);
      S.getState().closeComposer();assert.equal(toast.visible.size,0);assert.equal(refs().length,2);assert.equal(h.view.notice,undefined);
    }finally{stops.forEach(stop=>stop());h.dispose();globalThis.window=previousWindow;globalThis.CustomEvent=previousCustom;}
  }
  report.cases.push('Actual hook with synchronous original-store re-renders preserves its successful2500ms Rt notice when resuming a closed existing target or opening its missing target. Saved render handlers cannot capture a changed message; explicit later close dismisses the notice while references remain.');
  {
    const f=fixture({intent:'continue'}),slots=[],pendingEffects=[],hookNotice=originalNoticeFixture();let cursor=0,view,stateWrites=0;
    const sameDeps=(a,b)=>!!a&&!!b&&a.length===b.length&&a.every((value,index)=>Object.is(value,b[index]));
    const hooks={canvas:f.canvas,
      useRef(value){const index=cursor++;if(!slots[index])slots[index]={current:value};return slots[index];},
      useState(value){const index=cursor++;if(!slots[index])slots[index]={value:typeof value==='function'?value():value};return[slots[index].value,next=>{stateWrites++;slots[index].value=typeof next==='function'?next(slots[index].value):next;}];},
      useMemo(make,deps){const index=cursor++;if(!slots[index]||!sameDeps(slots[index].deps,deps))slots[index]={value:make(),deps};return slots[index].value;},
      useEffect(effect,deps){const index=cursor++;if(!slots[index]||!sameDeps(slots[index].deps,deps))pendingEffects.push(()=>{slots[index]?.cleanup?.();slots[index]={deps,effect,cleanup:effect()};});}};
    globalThis.__NODE_COMPOSER_HOOKS__=hooks;
    const render=()=>{cursor=0;view=LCOSUseNativeNodeComposer('node',hookNotice.notice);while(pendingEffects.length)pendingEffects.shift()();return view;};
    const reads=[];globalThis.fetch=(url,init)=>{const pending=defer();reads.push({url,init,pending});return pending.promise;};
    render();render();assert.equal(reads.length,0,'Mount/re-render availability must issue zero project reads');assert.equal(view.canUse,true);
    // The actual effect setup/cleanup/setup sequence is replayed with no
    // intervening render, exactly the StrictMode lifetime that was missing.
    for(const slot of slots)if(slot?.effect){slot.cleanup?.();slot.cleanup=slot.effect();}
    // Route bridge dispatch is original and read-only, using the same exact
    // shell imported above. The service never chooses another receiver.
    const previousWindow=globalThis.window,previousCustom=globalThis.CustomEvent;
    globalThis.CustomEvent=class{constructor(type,options){this.type=type;this.detail=options?.detail;}};
    const events=[];globalThis.window={dispatchEvent:event=>{events.push(event);return true;}};
    try {
      const old=view.useForCurrentInput();render();assert.equal(view.busy,true);assert.equal(reads.length,2);
      const oldSignal=reads[0].init.signal;S.setState({composerTarget:{...S.getState().composerTarget,messageId:'new-current-message'}});render();assert.equal(oldSignal.aborted,true);assert.equal(view.busy,false);
      const current=view.useForCurrentInput();render();assert.equal(view.busy,true);assert.equal(reads.length,4);
      const answer=(from,to)=>{for(const row of reads.slice(from,to))row.pending.release(new Response(JSON.stringify({ok:true,value:row.url.endsWith('/graph')?clone(f.facts.graph):clone(f.facts.bindings)}),{status:200}));};
      answer(0,2);assert.equal((await old).ok,false);render();assert.equal(view.busy,true,'Late old finally must not clear the new input operation busy state');assert.equal(view.notice,undefined);
      answer(2,4);assert.equal((await current).ok,true);render();assert.equal(view.busy,false);assert.equal(refs().length,2);assert.equal(S.getState().composerTarget.messageId,'new-current-message');
      assert.ok(events.some(row=>row.type==='lcos-native-show-current-input'&&row.detail.messageId==='new-current-message'));assert.equal(R.getState().referenceInputOperations.size,0);
      assert.equal(reads.length,4,'Availability must remain read-free after admission and owner transition');
      {
        const from=reads.length,before=protectedInput(),failedOperation=view.useForCurrentInput();render();assert.equal(view.busy,true);
        for(const row of reads.slice(from))row.pending.release(new Response(JSON.stringify({ok:false,error:{message:'simulated original GET error'}}),{status:503}));
        assert.equal((await failedOperation).ok,false);render();assertUnchanged(before);const failed=hookNotice.calls.at(-1);assert.equal(failed.action.label,'重试');
        let prevented=false;failed.action.onClick({preventDefault(){prevented=true;}});assert.ok(prevented);render();assert.equal(view.busy,true);assert.equal(reads.length,from+4);
        answer(from+2,from+4);await until(()=>hookNotice.calls.at(-1)?.action===undefined&&/已在当前输入/.test(hookNotice.calls.at(-1).title));render();assert.equal(view.busy,false);assert.equal(hookNotice.calls.at(-1).id,failed.id);assertUnchanged(before);
      }
      for(const mode of ['resolve','reject']) {
        if(mode==='reject'){slots.length=0;render();}
        const start=reads.length,before=protectedInput(),eventCount=events.length,pending=view.useForCurrentInput();render();assert.equal(view.busy,true);
        for(const slot of slots)slot?.cleanup?.();stateWrites=0;
        assert.ok(reads.slice(start).every(row=>row.init.signal.aborted));
        if(mode==='resolve')answer(start,start+2);else for(const row of reads.slice(start))row.pending.reject(new Error('late aborted response'));
        assert.equal((await pending).ok,false);assert.equal(stateWrites,0,'Unmounted real hook must not set feedback or busy state after late completion');
        assertUnchanged(before);assert.equal(events.length,eventCount);assert.equal(R.getState().referenceInputOperations.size,0);
      }
    }finally{globalThis.window=previousWindow;globalThis.CustomEvent=previousCustom;delete globalThis.__NODE_COMPOSER_HOOKS__;}
    report.cases.push('Actual hook and its original notice parameter execute with controlled React slots and real stores: StrictMode replay remains usable; mount/input-change availability has zero GETs; new owner aborts old GET without clearing new busy. Failed GET→same physical toast retry→deduplicated success preserves the whole input. Unmount late resolve/reject causes zero state updates, admission or route.');
  }
  {
    const saved=JSON.parse(await fs.readFile('output/Main图片左拖修复_20261026/实屏/after-2026-10-25T23-21-12.621Z/report.json','utf8'));
    const facts={graph:saved.before.facts.graph,bindings:saved.before.facts.bindings},canvas=clone(saved.before.canvas),node=canvas.nodes.find(row=>row.id==='surface-main-image');
    const projectId=facts.graph.project.id,workspace=facts.graph.workspaces.find(row=>row.canvasId===canvas.id||row.canvasId==='surface-core-main');assert.ok(workspace);
    canvas.status='ready';canvas.canvasId='surface-core-main';canvas.rfInstance={id:'captured-native-api'};
    S.getState().setProject(projectId);R.getState().setProject(projectId);S.getState().setActiveWorkspaceId(workspace.id);S.getState().openComposer({nodeId:'conversation:retained',title:'原续聊',workspaceId:workspace.id,intent:'continue',receiverConversationId:'retained',messageId:'retained-message',continuationOperationId:'retained-op',anchor:{x:0,y:0,width:0,height:0}});
    const reference=resolveNativeNodeComposerReference(node,{projectId,canvasId:canvas.canvasId,workspaceId:workspace.id},facts);
    assert.equal(reference.artifactViewId,'import-view-31bb29200e91e6e9dfef6305');assert.equal(reference.revisionId,'import-revision-31bb29200e91e6e9dfef6305');
    const service=createNativeNodeComposerService({shell:()=>S.getState(),canvas:()=>canvas,references:()=>R.getState(),readFacts:async()=>clone(facts),revealCurrentInput:()=>true});
    assert.equal((await service.useForCurrentInput(node.id)).ok,true);
    assert.deepEqual(node.position,{x:120,y:100});report.cases.push('Exact PNG producer shape from the already-verified Core82564 GET snapshot passes canonical joining, retains its actual Artifact/View/Revision and never mutates the captured canvas. This is snapshot execution, not a new live-page claim.');
  }
  if(process.argv.includes('--live-read')) {
    const expectedPid=Number(process.argv.find(value=>value.startsWith('--expected-pid='))?.split('=')[1]);assert.ok(Number.isSafeInteger(expectedPid)&&expectedPid>0);
    const calls=[],origin='http://127.0.0.1:56311',base='/api/lcos/core/projects/disposable-surface-core-facade';
    const get=async route=>{calls.push({method:'GET',route});const response=await realFetch(origin+route,{method:'GET',redirect:'error',signal:AbortSignal.timeout(30000)});assert.equal(response.status,200);const value=await response.json();return value.value??value.data??value;};
    const health=await get('/health');assert.equal(health.pid,expectedPid);
    const [graph,bindings,canvas]=await Promise.all([get(base+'/graph'),get(base+'/spatial/bindings'),get('/api/canvas/v1/canvases/surface-core-main')]);
    const workspaces=graph.workspaces.filter(row=>row.canvasId==='surface-core-main'&&!row.archivedAt);assert.equal(workspaces.length,1);
    const owner={projectId:graph.project.id,canvasId:'surface-core-main',workspaceId:workspaces[0].id};
    const resolved=canvas.nodes.filter(node=>nativeNodeComposerCandidate(node).canUse).map(node=>{
      try {const reference=resolveNativeNodeComposerReference(node,owner,{graph,bindings});const artifact=graph.artifacts.find(row=>row.id===reference.entityId),revision=graph.artifactRevisions.find(row=>row.id===reference.revisionId),file=graph.fileRecords.find(row=>row.id===revision.fileRecordId),view=graph.artifactViews.find(row=>row.id===reference.artifactViewId);
        return{nodeId:node.id,type:node.type,reference,archivedAtField:Object.hasOwn(artifact,'archivedAt')?artifact.archivedAt:'<absent>',artifactAvailability:artifact.availability,fileAvailability:file.availability,fileHashPresent:typeof file.observedHash==='string'&&!!file.observedHash,revisionHashMatches:file.observedHash===revision.contentHash,viewReferenceKind:view.referenceKind,scopeMatches:view.scopeId===workspaces[0].scopeId};
      }catch(error){return{nodeId:node.id,type:node.type,error:String(error.message??error)};}
    });
    assert.ok(resolved.find(row=>row.nodeId==='surface-main-image'&&row.reference));assert.ok(resolved.some(row=>row.type==='text'&&row.reference));
    report.liveRead={pid:health.pid,calls,owner,resolved,domainWrites:0};report.cases.push('Current live Core graph/bindings/Main DTO are joined by the actual resolver using the unique real Workspace: primary PNG and text resolve; exact archived/availability/hash/referenceKind/scope fields recorded. Four GETs only, no page/runtime mutation.');
  }
  report.passed=true;
} catch(error) {report.error=String(error.stack??error);process.exitCode=1;}
finally {globalThis.fetch=realFetch;await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify({...report,output},null,2));
