import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';
import { currentGen2Root,readCurrentGen2Resource } from '../lab/current-gen2-resources.mjs';
import { withNativeComposerDraftTransforms } from '../lab/native-composer-draft-source-transform.mjs';
import { withNativeReferenceLocationTransforms } from '../lab/native-reference-location-source-transform.mjs';
import { createNativeUiSourceTransforms } from '../lab/native-ui-source-transforms.mjs';
import { withNativeChatSourceTransforms } from '../lab/native-chat-owner-transform.mjs';
import { withNativeMaterialReaderSourceTransforms } from '../lab/native-material-reader-source-transform.mjs';
import { withNativeReaderRecoverySourceTransforms } from '../lab/native-reader-recovery-source-transform.mjs';
import { withNativeComposerFileSourceTransforms } from '../lab/native-composer-file-source-transform.mjs';
import { withNativeMixedScopeComposerTransforms } from '../lab/native-mixed-scope-composer-transform.mjs';
import { withNativeLiveContinuationComposerTransforms } from '../lab/native-live-continuation-composer-transform.mjs';
import { withNativeSessionCanvasUiTransforms } from '../lab/native-session-canvas-ui-transform.mjs';
import { withNativeContinuationPresentationTransforms } from '../lab/native-continuation-presentation-transform.mjs';
import { withNativeTextLocationSourceTransforms } from '../lab/native-text-location-source-transforms.mjs';

const root=process.cwd(),dir=await fs.mkdtemp(path.resolve('.runtime/reference-locations-'));
const output=path.resolve('output/文本选区准确定位_R02_20261026/引用专项',new Date().toISOString().replaceAll(':','-'));
await fs.mkdir(output,{recursive:true});
const ts=createRequire(path.join(currentGen2Root,'package.json'))('typescript');
const files={references:'lcos/huabu/apps/web/src/lcos/lcosReferenceState.ts',snapshot:'lcos/huabu/apps/web/src/lcos/composer/referenceSnapshot.ts',
 ingress:'lcos/huabu/apps/web/src/lcos/composer/composerMaterialIngress.ts',shell:'lcos/huabu/apps/web/src/lcos/shell/lcosShellStore.ts',
 parked:'lab/pilot/native-composer-draft-state.ts',submission:'lcos/huabu/apps/web/src/lcos/composer/composerSubmission.ts',composer:'lcos/huabu/apps/web/src/lcos/composer/LcosComposerHost.tsx'};
const transforms=withNativeReferenceLocationTransforms(withNativeComposerDraftTransforms(withNativeMixedScopeComposerTransforms()));
// The Composer source below passes through exactly the central production
// composition, not a fresh owner with only the last draft adapter applied.
const composed=withNativeTextLocationSourceTransforms(withNativeContinuationPresentationTransforms(withNativeComposerDraftTransforms(withNativeSessionCanvasUiTransforms(withNativeLiveContinuationComposerTransforms(withNativeMixedScopeComposerTransforms(withNativeComposerFileSourceTransforms(withNativeReaderRecoverySourceTransforms(withNativeMaterialReaderSourceTransforms(withNativeChatSourceTransforms(createNativeUiSourceTransforms({nativeRailPilot:true})))))))))));
const mapping=new Map(Object.entries(files).filter(([key])=>key!=='composer').map(([key,file])=>[path.resolve(file).replace(/\.tsx?$/,'').toLowerCase(),path.join(dir,key)]));
const imports=(source,file)=>source.replace(/from\s+(['"])(\.[^'"]+)\1/g,(_,q,value)=>{
 const resolved=path.resolve(path.dirname(file),value),mapped=mapping.get(resolved.replace(/\.tsx?$/,'').toLowerCase())??resolved;
 return 'from '+JSON.stringify(mapped.replaceAll('\\','/'));});
let composer;
for(const[key,file]of Object.entries(files)){
 const absolute=path.resolve(file),original=readCurrentGen2Resource(absolute)?.contents??await fs.readFile(absolute,'utf8');
 const value=key==='composer'?composed[file](original,{sourcePath:absolute}):transforms[file]?.(original,{sourcePath:absolute})??original;
 if(transforms[file]&&key!=='shell')assert.equal(transforms[file](value,{sourcePath:absolute}),value,'Location transform remains idempotent after preceding Composer transforms.');
 if(key==='composer'){composer=value;continue;}
 await fs.writeFile(path.join(dir,key+'.ts'),imports(value,absolute));
}
const ast=ts.createSourceFile(files.composer,composer,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const host=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='LcosComposerHost');assert.ok(host);
assert.equal(ast.parseDiagnostics.length,0,'The full central Composer composition parses.');
assert.match(composer,/ref\.entityType === 'scope' \|\|/,'Original Scope onOpen condition remains.');
assert.match(composer,/scopeUnavailableReason:\(\)=>draftReferenceUnavailableReason\(ref,composerTarget\?\.intent\)/,'Original Scope admission remains.');
assert.match(composer,/openScope:\(target\)=>requestNativeScopeReferenceView\(target\)/,'Original Scope Library port remains.');
assert.match(composer,/openMaterial:\(target\)=>requestNativeMaterialView\(target\)/,'Original native material route remains.');
const statements=host.body.statements;
const declaration=name=>statements.find(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(ast)===name));
const required=['inspectRequest','inputKey','inspectCanvasId','inspectOwner','inspectLatestOwner','rememberCaret','inspectReference'];
const pieces=required.map(name=>{const found=declaration(name);assert.ok(found,name+' actual owner exists');return found.getText(ast);});
const cleanup=statements.find(n=>ts.isExpressionStatement(n)&&ts.isCallExpression(n.expression)&&n.expression.expression.getText(ast)==='useEffect'&&n.getText(ast).includes('inspectLatestOwner.current'));
assert.ok(cleanup);
await fs.writeFile(path.join(dir,'hooks.ts'),['useEffect','useMemo','useRef'].map(name=>`export const ${name}=(...args:any[])=>globalThis.__REFERENCE_CHIP__.${name}(...args);`).join('\n'));
await fs.writeFile(path.join(dir,'chip.ts'),`import {useEffect,useMemo,useRef} from './hooks';
import {useLcosShellStore} from './shell';import {useLcosReferenceStore} from './references';
import {snapshotDraftReference,draftReferenceUnavailableReason} from './snapshot';
import {composerInputKey} from ${JSON.stringify(path.resolve('lcos/huabu/apps/web/src/lcos/composer/composerInputJourney.ts').replaceAll('\\','/'))};
import {inspectNativeReferenceLocation} from ${JSON.stringify(path.resolve('lab/pilot/native-reference-locations.ts').replaceAll('\\','/'))};
const useCanvasStore:any=Object.assign((selector:any)=>selector(globalThis.__REFERENCE_CHIP__.canvas),{getState:()=>globalThis.__REFERENCE_CHIP__.canvas,subscribe:(fn:any)=>globalThis.__REFERENCE_CHIP__.subscribeCanvas(fn)});
type CoreEntityRefLike=any;
export function actualChip(props:any){
const {projectId,open,composerTarget}=props;
const textareaRef={current:globalThis.__REFERENCE_CHIP__.textarea};
const session={projects:{getProjectGraph:(...args:any[])=>globalThis.__REFERENCE_CHIP__.readGraph(...args)}};
const setState=(value:any)=>globalThis.__REFERENCE_CHIP__.setState(value),setErrorDetail=(value:any)=>globalThis.__REFERENCE_CHIP__.setErrorDetail(value);
const requestNativeScopeReferenceView=(request:any)=>globalThis.__REFERENCE_CHIP__.openScope(request);
const requestNativeMaterialView=(request:any)=>globalThis.__REFERENCE_CHIP__.openMaterial(request);
${pieces.slice(0,5).join('\n')}
inspectLatestOwner.current=inspectOwner;
${cleanup.getText(ast)}
${pieces.slice(5).join('\n')}
return {inspectReference,onOpen:()=>inspectReference(props.ref,props.title)};
}`);
const spec=file=>JSON.stringify(path.resolve(file).replaceAll('\\','/'));
await fs.writeFile(path.join(dir,'entry.ts'),`export {useLcosReferenceStore} from './references';export {useLcosShellStore} from './shell';
export * from './snapshot';export * from './ingress';export * from './chip';export * from './submission';
export * from ${spec('lab/pilot/native-reference-locations.ts')};
export {draftReferenceKey} from ${spec('lcos/huabu/apps/web/src/lcos/referenceBridge.ts')};
export {buildSelectedContextReferences,toRunReference} from ${spec('lcos/huabu/apps/web/src/lcos/professional/conversationContinuationActions.ts')};
export {serializeMaterialTransfer,LCOS_MATERIAL_TRANSFER_MIME} from ${spec('lcos/huabu/apps/web/src/lcos/ui/professional/donor/Gen1TextTransfer.ts')};
export {composerInputKey} from ${spec('lcos/huabu/apps/web/src/lcos/composer/composerInputJourney.ts')};`);
await buildPilotEntry(path.relative(root,path.join(dir,'entry.ts')),path.join(dir,'entry.mjs'),'node');
const app=await import(pathToFileURL(path.join(dir,'entry.mjs'))),{useLcosReferenceStore:R,useLcosShellStore:S}=app;
const report={passed:false,cases:[],models:0,networkCalls:0,domainWrites:0,
 scope:'Actual original ReferenceStore/controller, exact composed snapshot/gesture/ingress and per-input Shell/parked drafts execute. Chip tests execute the actual transformed TSX handler and memo/ref/cleanup statements; React scheduling, Canvas/textarea and read/Reader route transports are controlled. No full rendered Composer or live Core/browser claim.'};
const originalFetch=globalThis.fetch;globalThis.fetch=()=>{report.networkCalls++;throw Error('No network in R02 source-only reference tests');};
const A={kind:'selection',label:'摘录A',textRange:{start:0,end:4,quote:'你好😀'}},B={kind:'selection',label:'摘录B',textRange:{start:10,end:14,quote:'你好😀'}};
const legacy={kind:'lines',start:3,end:5,label:'原第三至五行'},chapter={kind:'selection',label:'唯一章节'};
const base={entityType:'artifact',entityId:'material',artifactViewId:'view',revisionId:'r-old',displayLabel:'准确材料',mimeType:'text/markdown'};
const withLoc=(ref,locator)=>app.withNativeReferenceSourceLocation(ref,locator);
const clone=v=>structuredClone(v),tick=()=>new Promise(resolve=>setImmediate(resolve));
const defer=()=>{let resolve,reject;return{promise:new Promise((a,b)=>{resolve=a;reject=b;}),resolve:v=>resolve(v),reject:e=>reject(e)};};
const refs=()=>R.getState().draft.orderedEntityRefs;
let serial=0;
function fixture(){
 const projectId='locations-'+(++serial),canvasId='canvas',workspaceId='workspace';R.getState().reset();S.getState().setProject(projectId);R.getState().setProject(projectId);S.getState().setActiveWorkspaceId(workspaceId);
 S.setState({activeSurface:'main',surfaceCanvasId:{main:canvasId,context:'context'}});
 S.getState().openComposer({nodeId:'conversation:existing',title:'原对话',intent:'continue',workspaceId,receiverConversationId:'existing',messageId:'message',continuationOperationId:'operation',anchor:{x:0,y:0,width:0,height:0}});
 S.getState().setComposerPrompt('原输入文字');
 const inputKey=app.composerInputKey(S.getState().composerTarget);S.getState().rememberComposerCaret({projectId,targetKey:inputKey,text:'原输入文字',start:2,end:3});
 return{projectId,canvasId,workspaceId,inputKey};
}
function chipHarness(f,ref){
 const slots=[],effects=[],canvasListeners=new Set(),opened=[],states=[],errors=[],scopeRoutes=[],materialRoutes=[];let pointer=0,mounted=true,reads=0,afterUnmount=0,scopeRead=async()=>undefined;
 const canvas={status:'ready',canvasId:f.canvasId,rfInstance:{id:'original-api'}};
 const textarea={value:S.getState().composerPrompt,selectionStart:2,selectionEnd:3};
 let readGraph=async()=>({artifacts:[{id:'material',projectId:f.projectId,currentRevisionId:'new'}],artifactViews:[{id:'view',artifactId:'material',revisionId:'new'}]});
 const props={projectId:f.projectId,open:true,composerTarget:S.getState().composerTarget,ref,title:'准确材料'};
 const eq=(a,b)=>!!a&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
 const environment={canvas,textarea,readGraph:(...args)=>{reads++;return readGraph(...args);},subscribeCanvas:fn=>{canvasListeners.add(fn);return()=>canvasListeners.delete(fn);},
  openScope:request=>{scopeRoutes.push(request);return scopeRead(request);},
  openMaterial:request=>{materialRoutes.push(clone(request));const {title,artifactId,revisionId,composerOriginKey,sourceLocator}=request;opened.push([title,artifactId,{revisionId,composerOriginKey,...(sourceLocator?{sourceLocator}: {})}]);},
  setState:v=>{if(!mounted)afterUnmount++;else states.push(v);},setErrorDetail:v=>{if(!mounted)afterUnmount++;else errors.push(v);},
  useRef:initial=>{const at=pointer++;if(!slots[at])slots[at]={value:{current:initial}};return slots[at].value;},
  useMemo:(fn,deps)=>{const at=pointer++;if(!slots[at]||!eq(slots[at].deps,deps))slots[at]={value:fn(),deps};return slots[at].value;},
  useEffect:(fn,deps)=>{const at=pointer++;if(!slots[at]||!eq(slots[at].deps,deps)){const prior=slots[at];slots[at]={deps,fn,cleanup:prior?.cleanup};effects.push(()=>{slots[at].cleanup?.();slots[at].cleanup=fn();});}},
 };
 S.setState({openReader:(...args)=>opened.push(clone(args))});let view;
 const activate=()=>{globalThis.__REFERENCE_CHIP__=environment;};
 const render=()=>{activate();props.composerTarget=S.getState().composerTarget;pointer=0;view=app.actualChip(props);while(effects.length)effects.shift()();return view;};
 render();return{props,canvas,textarea,opened,states,errors,scopeRoutes,materialRoutes,setScope:fn=>{scopeRead=fn;},render,get view(){return view;},reads:()=>reads,afterUnmount:()=>afterUnmount,
  setRead:fn=>{readGraph=fn;},notify:()=>{activate();for(const fn of [...canvasListeners])fn();},
  unmount:()=>{activate();for(const s of slots)s?.cleanup?.();mounted=false;},
  replay:()=>{activate();for(const s of slots)if(s?.fn){s.cleanup?.();s.cleanup=s.fn();}}};
}
try{
 fixture();let a=withLoc(base,A),b=withLoc(base,B);assert.equal(app.draftReferenceKey(a),app.draftReferenceKey(base));
 assert.equal(R.getState().addEntitiesToDraft([a],'continue').added,1);assert.equal(R.getState().addEntitiesToDraft([b],'continue').added,0);
 assert.equal(refs().length,1);assert.deepEqual(refs()[0].sourceLocations,[A,B]);const held=refs()[0];assert.equal(R.getState().addEntitiesToDraft([a],'continue').added,0);assert.equal(refs()[0],held);
 assert.deepEqual(app.nativeReferenceSourceLocator(refs()[0]),{kind:'selection',locations:[A,B]});
 assert.deepEqual(withLoc(base,{kind:'selection',locations:[A,B],selected:B}).sourceLocations,[B]);
 assert.deepEqual(withLoc(base,{kind:'selection',locations:[A,B]}).sourceLocations,[A,B]);
 report.cases.push('Same original material/revision keeps one semantic reference and original key/order: add A→B merges exact positions, duplicate A changes neither count nor object; added remains 0 for a metadata-only merge. Multi inspect has no implicit selected location.');
 fixture();assert.equal(R.getState().addEntitiesToDraft([a,b,a],'continue').added,1);assert.deepEqual(refs()[0].sourceLocations,[A,B]);
 R.getState().addEntitiesToDraft([withLoc({...base,revisionId:'other'},A)],'continue');assert.equal(refs().length,2);assert.deepEqual(refs()[1].sourceLocations,[A]);assert.equal(refs()[1].revisionId,'other');
 const before=clone(refs());const denied=R.getState().addEntitiesToDraft([{entityType:'unknown',entityId:'unknown',sourceLocations:[B]}],'continue');assert.ok(denied.reason);assert.deepEqual(refs(),before);
 R.getState().removeEntityFromDraft(base);assert.equal(refs().length,1);assert.equal(refs()[0].revisionId,'other');
 report.cases.push('Batch preparation merges A/B before its original seen-key de-duplication; different revisions remain separate, failed admission keeps all prior metadata, original remove clears only the addressed reference.');
 fixture();const mixed=withLoc(withLoc(withLoc(base,A),legacy),chapter);R.getState().addEntitiesToDraft([mixed],'continue');
 const snapshot=app.snapshotDraftReference(refs()[0]),gesture=app.draftReferenceForGesture(refs()[0]);assert.deepEqual(snapshot.sourceLocations,[A,legacy,chapter]);assert.deepEqual(gesture.sourceLocations,[A,legacy,chapter]);
 const malformed={...base,sourceLocations:[A,{kind:'selection',textRange:{start:2,end:3,quote:'wrong'}}]};assert.equal(app.snapshotDraftReference(malformed).sourceLocations,undefined);assert.equal(app.draftReferenceForGesture(malformed).sourceLocations,undefined);
 const mapped=app.buildSelectedContextReferences([snapshot,gesture]);assert.equal(JSON.stringify(mapped).includes('sourceLocations'),false);assert.equal(JSON.stringify(mapped).includes('textRange'),false);assert.equal(JSON.stringify(mapped).includes('quote'),false);
 const run=app.buildComposerRunInput({projectId:'p',workspaceId:'w',instruction:'只构造不发送',target:{nodeId:'canvas',title:'原输入',intent:'delegate',workspaceId:'w',anchor:{x:0,y:0,width:0,height:0}},refs:[snapshot]});
 const continuation=app.buildComposerContinuationInput({conversationId:'existing',messageId:'message',continuationOperationId:'operation',text:'只构造不发送',refs:[gesture]});
 for(const payload of [run,continuation])for(const field of ['sourceLocations','textRange','quote','摘录A','唯一章节'])assert.equal(JSON.stringify(payload).includes(field),false);
 report.cases.push('Exact Range plus legacy lines/selection labels survive actual snapshot/gesture whitelist; invalid metadata is omitted without changing canonical reference; original Run/continuation sender mapping never sends GUI positions or quote to Core.');
 const f=fixture();const transfer=locator=>({types:[app.LCOS_MATERIAL_TRANSFER_MIME],getData:()=>app.serializeMaterialTransfer({schemaVersion:1,kind:'material-transfer',capturedAt:'2026-10-26T00:00:00Z',source:{projectId:f.projectId,artifactId:'material',revisionId:'r-old',viewId:'view',title:'准确材料',locator},content:{kind:'text',text:'你好😀'}})});
 const first=app.insertComposerMaterial(f.projectId,f.inputKey,transfer(A),{start:2,end:3});assert.equal(first.ok,true);assert.equal(refs().length,1);assert.deepEqual(refs()[0].sourceLocations,[A]);assert.equal(refs()[0].revisionId,'r-old');
 const second=app.insertComposerMaterial(f.projectId,f.inputKey,transfer(B));assert.equal(second.ok,true);assert.equal(refs().length,1);assert.deepEqual(refs()[0].sourceLocations,[A,B]);
 assert.match(S.getState().composerPrompt,/来源/);assert.equal(S.getState().composerCaret.targetKey,f.inputKey);
 const prompt=S.getState().composerPrompt;S.getState().openComposer({...S.getState().composerTarget,nodeId:'other',receiverConversationId:'other'});
 const wrong=app.insertComposerMaterial(f.projectId,f.inputKey,transfer(A));assert.equal(wrong.ok,false);assert.equal(S.getState().composerPrompt,'');
 S.getState().openComposer({nodeId:'conversation:existing',title:'原对话',intent:'continue',workspaceId:f.workspaceId,receiverConversationId:'existing',anchor:{x:0,y:0,width:0,height:0}});
 assert.equal(S.getState().composerPrompt,prompt);assert.deepEqual(refs()[0].sourceLocations,[A,B]);
 report.cases.push('Actual original MIME clipboard/drop ingress retains exact source version and A/B metadata, inserts citations at original caret, rejects another input, and original parked-draft restore returns the same text and positions without another draft store.');
 for(const locator of [null,{kind:'selection',textRange:{start:0,end:4,quote:'坏长度'}},{kind:'selection',textRange:{start:0,end:4,quote:'不同文字'}},{kind:'lines',start:'wrong',end:5},
  {kind:'selection',locations:[A,{kind:'selection',locations:[B]}]}]){
  const invalidFixture=fixture(),oldPrompt=S.getState().composerPrompt,oldCaret=clone(S.getState().composerCaret);
  const invalidTransfer={types:[app.LCOS_MATERIAL_TRANSFER_MIME],getData:()=>app.serializeMaterialTransfer({schemaVersion:1,kind:'material-transfer',capturedAt:'2026-10-26T00:00:00Z',
   source:{projectId:invalidFixture.projectId,artifactId:'material',revisionId:'r-old',viewId:'view',title:'准确材料',locator},content:{kind:'text',text:'你好😀'}})};
  const rejected=app.insertComposerMaterial(invalidFixture.projectId,invalidFixture.inputKey,invalidTransfer);assert.equal(rejected.claimed,true);assert.equal(rejected.ok,false);
  assert.equal(refs().length,0);assert.equal(S.getState().composerPrompt,oldPrompt);assert.deepEqual(S.getState().composerCaret,oldCaret);
 }
 for(const locator of [legacy,chapter,{kind:'selection',locations:[A,B]},{kind:'selection',locations:[A,B],selected:B}]){
  const validFixture=fixture();const validTransfer={types:[app.LCOS_MATERIAL_TRANSFER_MIME],getData:()=>app.serializeMaterialTransfer({schemaVersion:1,kind:'material-transfer',capturedAt:'2026-10-26T00:00:00Z',
   source:{projectId:validFixture.projectId,artifactId:'material',revisionId:'r-old',viewId:'view',title:'准确材料',locator},content:{kind:'text',text:'你好😀'}})};
  const accepted=app.insertComposerMaterial(validFixture.projectId,validFixture.inputKey,validTransfer);assert.equal(accepted.ok,true);
  assert.deepEqual(refs()[0].sourceLocations,'locations'in locator?locator.selected?[locator.selected]:locator.locations:[locator]);
 }
 report.cases.push('Actual ingress rejects a supplied malformed/nested/null locator or single Range quote/text mismatch before any reference, text or caret mutation. Valid legacy and explicit/unselected groups retain their exact metadata.');
 let fi=fixture();R.getState().addEntitiesToDraft([withLoc(base,A),withLoc(base,B)],'continue');let h=chipHarness(fi,refs()[0]);await h.view.onOpen();assert.equal(h.reads(),0);assert.equal(h.opened.length,1);
 assert.deepEqual(h.opened[0][2].sourceLocator,{kind:'selection',locations:[A,B]});assert.equal(h.opened[0][2].revisionId,'r-old');assert.equal(h.opened[0][2].composerOriginKey,fi.inputKey);h.unmount();
 fi=fixture();const viewRef=withLoc({entityType:'view',entityId:'view',revisionId:'r-old'},A);R.getState().addEntitiesToDraft([viewRef],'continue');h=chipHarness(fi,refs()[0]);await h.view.onOpen();assert.equal(h.reads(),1);assert.equal(h.opened[0][2].revisionId,'r-old');assert.deepEqual(h.opened[0][2].sourceLocator,A);h.unmount();
 report.cases.push('Actual transformed TSX chip handler opens the original Reader transport with one exact location or an unselected multi envelope. View→Artifact read preserves explicit old revision even when the graph View/current artifact names a newer revision.');
 for(const change of ['message','operation','close','canvas','api','workspace','sending','remove','locations','unmount','render-close']){
  fi=fixture();R.getState().addEntitiesToDraft([viewRef],'continue');h=chipHarness(fi,refs()[0]);const pending=defer();h.setRead(()=>pending.promise);const active=h.view.onOpen();assert.equal(h.reads(),1);
  if(change==='message')S.setState({composerTarget:{...S.getState().composerTarget,messageId:'new-message'}});
  if(change==='operation')S.setState({composerTarget:{...S.getState().composerTarget,continuationOperationId:'new-operation'}});
  if(change==='close')S.getState().closeComposer();if(change==='canvas'){h.canvas.canvasId='other';h.notify();}if(change==='api'){h.canvas.rfInstance={};h.notify();}
  if(change==='workspace')S.getState().setActiveWorkspaceId('other');
  if(change==='sending')R.getState().beginReferenceInputOperation(JSON.stringify([fi.projectId,S.getState().composerTarget.nodeId,S.getState().composerTarget.intent,S.getState().composerTarget.receiverConversationId]),'sending',fi.inputKey);
  if(change==='remove')R.getState().removeEntityFromDraft(viewRef);if(change==='locations')R.getState().addEntitiesToDraft([withLoc(viewRef,B)],'continue');
  if(change==='unmount')h.unmount();if(change==='render-close'){h.props.open=false;h.render();}
  pending.resolve({artifacts:[{id:'material',projectId:fi.projectId,currentRevisionId:'new'}],artifactViews:[{id:'view',artifactId:'material',revisionId:'new'}]});await active;
  assert.equal(h.opened.length,0,change);assert.deepEqual(h.errors,[],change);assert.equal(h.afterUnmount(),0,change);h.unmount();
 }
 report.cases.push('Same-input-key new message/operation, close, Canvas/API/Workspace change, sending, removed reference, changed multi positions, component prop closure and unmount cancel delayed actual chip inspect with zero Reader opens/errors or unmounted state updates.');
 fi=fixture();R.getState().addEntitiesToDraft([viewRef],'continue');h=chipHarness(fi,refs()[0]);const oldRead=defer(),newRead=defer();let n=0;h.setRead(()=>++n===1?oldRead.promise:newRead.promise);
 const older=h.view.onOpen(),newer=h.view.onOpen();assert.equal(h.reads(),2);oldRead.resolve({});await older;
 h.props.open=false;h.render();newRead.resolve({artifacts:[{id:'material',projectId:fi.projectId,currentRevisionId:'new'}],artifactViews:[{id:'view',artifactId:'material',revisionId:'new'}]});await newer;
 assert.equal(h.opened.length,0);assert.deepEqual(h.errors,[]);h.unmount();
 report.cases.push('A newer inspect cancels the older request; older finally cannot clear the newer request slot, so later closure still cancels the current read.');
 fi=fixture();R.getState().addEntitiesToDraft([viewRef],'continue');h=chipHarness(fi,refs()[0]);const oldHandler=h.view.onOpen,caret=clone(S.getState().composerCaret);S.setState({composerTarget:{...S.getState().composerTarget,messageId:'replacement'}});h.render();await oldHandler();assert.equal(h.reads(),0);assert.deepEqual(S.getState().composerCaret,caret);assert.equal(h.opened.length,0);
 h.replay();await h.view.onOpen();assert.equal(h.opened.length,1);h.unmount();
 report.cases.push('Saved old-render chip callback cannot read, open or overwrite caret after input owner changes. Actual cleanup/setup replay without another render restores its own valid current chip owner.');
 for(const ref of [base,{entityType:'view',entityId:'view',revisionId:'r-old',displayLabel:'没有摘录的旧版本'}]){
  fi=fixture();assert.equal(R.getState().addEntitiesToDraft([ref],'continue').added,1);h=chipHarness(fi,refs()[0]);await h.view.onOpen();
  assert.equal(h.materialRoutes.length,1);assert.equal(h.materialRoutes[0].artifactId,'material');assert.equal(h.materialRoutes[0].revisionId,'r-old');assert.equal(h.materialRoutes[0].artifactViewId,'view');
  assert.equal(h.materialRoutes[0].sourceLocator,undefined);assert.equal(h.scopeRoutes.length,0);assert.deepEqual(h.errors,[]);h.unmount();
 }
 report.cases.push('The real central Composer composition preserves ordinary Artifact and View chip opening without any sourceLocations, exact old revision/View and the already-adopted native Viewer port. GUI excerpt metadata is optional.');
 const scopeRef={entityType:'scope',entityId:'scope-all',mode:'full',displayLabel:'原混合内容'};
 fi=fixture();assert.equal(R.getState().addEntitiesToDraft([scopeRef],'continue').added,1);h=chipHarness(fi,refs()[0]);await h.view.onOpen();
 assert.equal(h.scopeRoutes.length,1);assert.equal(h.materialRoutes.length,0);assert.equal(h.reads(),0);
 const route=h.scopeRoutes[0];assert.equal(route.scopeId,'scope-all');assert.equal(route.projectId,fi.projectId);assert.equal(route.composerOriginKey,fi.inputKey);
 assert.equal(route.messageId,'message');assert.equal(route.continuationOperationId,'operation');assert.equal(route.signal.aborted,false);assert.deepEqual(h.errors,[]);h.unmount();
 fi=fixture();R.getState().addEntitiesToDraft([scopeRef],'continue');h=chipHarness(fi,refs()[0]);const scopePending=defer();h.setScope(()=>scopePending.promise);const scopeOpening=h.view.onOpen();
 assert.equal(h.scopeRoutes.length,1);S.setState({composerTarget:{...S.getState().composerTarget,continuationOperationId:'replacement-operation'}});
 assert.equal(h.scopeRoutes[0].signal.aborted,true);scopePending.reject(new DOMException('Scope old owner cancelled','AbortError'));await scopeOpening;
 assert.equal(h.materialRoutes.length,0);assert.deepEqual(h.errors,[]);h.unmount();
 fi=fixture();R.getState().addEntitiesToDraft([scopeRef],'continue');h=chipHarness(fi,refs()[0]);
 // Execute the original admission guard against an existing but invalid Scope
 // address. It must not be silently routed as an Artifact or opened anyway.
 R.setState({draft:{...R.getState().draft,orderedEntityRefs:[{...scopeRef,mode:'partial'}]}});h.props.ref=R.getState().draft.orderedEntityRefs[0];h.render();await h.view.onOpen();
 assert.equal(h.scopeRoutes.length,0);assert.equal(h.materialRoutes.length,0);assert.equal(h.reads(),0);assert.equal(h.errors.length,1);
 assert.equal(h.errors[0],app.draftReferenceUnavailableReason(h.props.ref,'continue'),'Keep the exact original Scope admission reason');h.unmount();
 report.cases.push('Full mixed-Scope central composition retains original chip onOpen/admission and requestNativeScopeReferenceView Library route with message/operation/signal. A changed operation aborts the pending original Scope request with no late error; malformed Scope addresses never reach either route.');
 assert.equal(report.networkCalls,0);report.passed=true;
}finally{globalThis.fetch=originalFetch;await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify({passed:report.passed,cases:report.cases.length,output}));
