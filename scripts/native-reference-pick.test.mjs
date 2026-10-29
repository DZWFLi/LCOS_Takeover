import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';
import { readCurrentGen2Resource } from '../lab/current-gen2-resources.mjs';
import { transformNativeReferencePickSource } from '../lab/native-reference-pick-source-transform.mjs';
import { withNativeComposerDraftTransforms } from '../lab/native-composer-draft-source-transform.mjs';

const root=process.cwd(),temp=await fs.mkdtemp(path.resolve('.runtime/native-reference-pick-'));
const output=path.resolve('output/原画布引用点取_20261026/桥接专项',new Date().toISOString().replaceAll(':','-'));
await fs.mkdir(output,{recursive:true});
const report={passed:false,cases:[],models:0,domainWrites:0,networkCalls:0,
  scope:'Actual native adapter + original transformed recognizer, shared PointerRouterCore/right-carry and original reference controller execute. DOM geometry and read transport are controlled; this is not a real-page pass.'};
const spec=file=>JSON.stringify(path.resolve(file).replaceAll('\\','/'));
const absolute=(source,file)=>source.replace(/from\s+(['"])(\.[^'"]+)\1/g,(_,q,name)=>'from '+spec(path.resolve(path.dirname(file),name)));
const originalFile=path.resolve('lcos/huabu/apps/web/src/lcos/lcosRecognizers.ts');
const original=readCurrentGen2Resource(originalFile)?.contents??await fs.readFile(originalFile,'utf8');
const transformed=transformNativeReferencePickSource(original,originalFile);
assert.equal(transformNativeReferencePickSource(transformed,originalFile),transformed);
const begin=transformed.indexOf('export function createReferencePickRecognizer('),end=transformed.indexOf('\n/**\n * Acquire a payload',begin);
assert.ok(begin>=0&&end>begin);
// The entire original recognizer executes. Only DOM/Canvas observations and
// the import transport are replaced, never the toggle/controller implementation.
const shellFile=path.resolve('lcos/huabu/apps/web/src/lcos/shell/lcosShellStore.ts');
await fs.writeFile(path.join(temp,'shell.ts'),absolute(withNativeComposerDraftTransforms()['lcos/huabu/apps/web/src/lcos/shell/lcosShellStore.ts'](
  readCurrentGen2Resource(shellFile)?.contents??await fs.readFile(shellFile,'utf8'),{sourcePath:shellFile}),shellFile));
await fs.writeFile(path.join(temp,'canvas.ts'),`let value:any={canvasId:null,nodes:[]};const listeners=new Set<any>();
export default {getState:()=>value,setState(patch:any){value={...value,...patch};for(const fn of [...listeners])fn();},subscribe(fn:any){listeners.add(fn);return()=>listeners.delete(fn);}};`);
await fs.writeFile(path.join(temp,'recognizer.ts'),`
import {isReferencePick,pointerModifiersOf} from '@local-creative-os/web-gen2';
import {composerInputKey} from ${spec('lcos/huabu/apps/web/src/lcos/composer/composerInputJourney.ts')};
import {draftReferenceUnavailableReason,snapshotDraftReference} from ${spec('lcos/huabu/apps/web/src/lcos/composer/referenceSnapshot.ts')};
import {sameCanvasDropNode,snapshotCanvasDropNodes} from ${spec('lcos/huabu/apps/web/src/lcos/drop/nativeCanvasDropGeometry.ts')};
import {useLcosReferenceStore} from ${spec('lcos/huabu/apps/web/src/lcos/lcosReferenceState.ts')};
import {referencePickOwnerKey} from ${spec('lcos/huabu/apps/web/src/lcos/referencePickOwnership.ts')};
import {markReferencePickCompleted} from ${spec('lcos/huabu/apps/web/src/lcos/referenceClickSuppressor.ts')};
import {useLcosShellStore} from './shell';import useCanvasStore from './canvas';
type PointerRecognizer<A,B>=any;type CanvasPointerRouterContext=any;type CanvasDropNode=any;type LcosNodeEntityRef=any;
type NativeReferencePickPreparation=(input:any)=>Promise<any>;
const prepareNativeReferencePick=async()=>{throw Error('Unexpected original producer transport');};
const nodeIdAtScreenPoint=()=>{throw Error('Global rectangle hit must not run');};
const toast=()=>{throw Error('Old unmounted Toast must not run');};
${transformed.slice(begin,end)}
`);
const adapterFile=path.resolve('lab/pilot/native-reference-pick.ts');
let adapter=await fs.readFile(adapterFile,'utf8');
adapter=adapter.replace(/import \{ prepareNativeReferencePick, type NativeReferencePickPreparation \} from [^;]+;/,
  `type NativeReferencePickPreparation=(request:any)=>Promise<any>;const prepareNativeReferencePick=async()=>{throw Error('Unexpected default import transport');};`);
adapter=absolute(adapter,adapterFile).replace(spec(path.resolve('lcos/huabu/apps/web/src/lcos/lcosRecognizers')),JSON.stringify(path.join(temp,'recognizer').replaceAll('\\','/')));
await fs.writeFile(path.join(temp,'adapter.ts'),adapter);
await fs.writeFile(path.join(temp,'entry.ts'),`export * from './adapter';
export {bindNativeNodeCarry} from ${spec('lab/pilot/native-node-carry.ts')};
export {useLcosShellStore} from './shell';export {default as canvasStore} from './canvas';
export {useLcosReferenceStore} from ${spec('lcos/huabu/apps/web/src/lcos/lcosReferenceState.ts')};
export {referencePickOwnerKey} from ${spec('lcos/huabu/apps/web/src/lcos/referencePickOwnership.ts')};
export {composerInputKey} from ${spec('lcos/huabu/apps/web/src/lcos/composer/composerInputJourney.ts')};
export {useLcosDropStore} from ${spec('lcos/huabu/apps/web/src/lcos/lcosDropState.ts')};`);
await buildPilotEntry(path.relative(root,path.join(temp,'entry.ts')),path.join(temp,'entry.mjs'),'node');
const app=await import(pathToFileURL(path.join(temp,'entry.mjs'))),{useLcosShellStore:S,useLcosReferenceStore:R,canvasStore:C}=app;
const realFetch=globalThis.fetch;globalThis.fetch=()=>{report.networkCalls++;throw Error('No network in this isolated test');};
class ElementFixture extends EventTarget{
  constructor(id,parent=null,role='node'){super();this.dataset=id?{id}:{};this.parent=parent;this.role=role;this.isConnected=true;this.draggable=true;
    this.ownerDocument=parent?.ownerDocument??{activeElement:null,elementFromPoint:()=>null};this.classList={contains:name=>name==='draggable'&&this.draggable};}
  contains(node){for(let p=node;p;p=p.parent)if(p===this)return true;return false;}
  closest(selector){if(selector.includes('data-semantic-drop-handle')&&this.role==='handle')return this;
    if((selector.startsWith('button,')||selector.startsWith('input,'))&&this.role==='control')return this;
    if(selector.startsWith('[contenteditable')&&this.role==='editor')return this;
    if(selector.startsWith('.react-flow__node')){for(let p=this;p;p=p.parent)if(p.role==='node')return p;}return null;}
  getClientRects(){return this.isConnected?[this.getBoundingClientRect()]:[];}
  getBoundingClientRect(){return{left:0,top:0,width:900,height:700};}
  setPointerCapture(){}hasPointerCapture(){return false;}releasePointerCapture(){}
}
class PointerFixture extends Event{constructor(type,options={}){super(type,{cancelable:true,bubbles:true});for(const[key,value]of Object.entries(options))Object.defineProperty(this,key,{value,configurable:true});}}
globalThis.Element=ElementFixture;globalThis.MouseEvent=PointerFixture;
const clone=value=>structuredClone(value),tick=()=>new Promise(resolve=>setImmediate(resolve));
const until=async check=>{for(let n=0;n<60;n++){if(check())return;await tick();}assert.ok(check(),'Original queue did not settle');};
const defer=()=>{let resolve;return{promise:new Promise(r=>{resolve=r;}),resolve:v=>resolve(v)};};
let serial=0;
function fixture({registered=false,lock=false,noSaved=false}={}){
 const projectId='pick-project-'+(++serial),canvasId='canvas',workspaceId='workspace';
 const saved={version:1,entityType:'view',entityId:'view',artifactId:'artifact',artifactViewId:'view',revisionId:'old'};
 const node={id:'image',type:'image',position:{x:120,y:100},selected:false,data:{id:'image',src:'data:actual-image',locked:lock,...(!noSaved?{lcos_ref:saved}:{})}};
 const graph={project:{id:projectId},workspaces:[{id:workspaceId,projectId,canvasId,scopeId:'scope'}],scopes:[{id:'scope',projectId}],
  artifacts:[{id:'artifact',projectId,kind:'image',title:'准确旧图',currentRevisionId:'new'}],artifactViews:[{id:'view',artifactId:'artifact',scopeId:'scope',revisionId:'old',referenceKind:'explicit_additional'}],
  artifactRevisions:[{id:'old',artifactId:'artifact',status:'superseded',fileRecordId:'file',contentHash:'existing-file-fact'}],fileRecords:[{id:'file',projectId,mimeType:'image/png',availability:'current',observedHash:'existing-file-fact'}]};
 const facts={graph,bindings:[{projectId,canvasId,spatialKind:'node',spatialId:'image',entityType:'view',entityId:'view'}]};
 S.getState().setProject(projectId);R.getState().setProject(projectId);S.getState().setActiveWorkspaceId(workspaceId);
 S.getState().openComposer({nodeId:'receiver',title:'已有对话',workspaceId,intent:'continue',receiverConversationId:'conversation',messageId:'message',continuationOperationId:'operation',anchor:{x:0,y:0,width:0,height:0}});
 S.getState().setComposerPrompt('原输入不动');S.getState().rememberComposerCaret({projectId,targetKey:app.composerInputKey(S.getState().composerTarget),text:'原输入不动',start:2,end:3});
 R.getState().setReferencePickOwner(app.referencePickOwnerKey(projectId,S.getState().composerTarget));
 R.getState().registerNodeEntity('other',{entityType:'collection',entityId:'existing-collection'});
 const ref={entityType:'artifact',entityId:'artifact',artifactViewId:'view',revisionId:'old',mimeType:'image/png'};
 if(registered)R.getState().registerNodeEntity('image',ref);
 const wrapper=new ElementFixture(null,null,'wrapper'),element=new ElementFixture('image',wrapper),image=new ElementFixture(null,element,'image');
 let hit=image;wrapper.ownerDocument.elementFromPoint=()=>hit;
 let world={projectId,canvasId,workspaceId,api:{screenToFlowPosition:p=>p},wrapper,nodes:[node],selectedNodeIds:['other'],interaction:{explicitToolActive:false,interactivityLocked:false}};
 const worldRead=()=>world?{...world,refs:R.getState().nodeEntityRefs}:null;
 C.setState({canvasId,nodes:world.nodes});const notices=[];let reads=0,imports=0,read=async()=>clone(facts);
 let prepare=async request=>{const old=clone(ref);R.getState().registerNodeEntity('image',old);return old;};
 const adapter=app.createNativeReferencePickAdapter({world:worldRead,notice:message=>notices.push(message),readFacts:async(...args)=>{reads++;return read(...args);},prepareNative:async request=>{imports++;return prepare(request);}});
 const host=new EventTarget(),drop=()=>app.useLcosDropStore.getState();drop().reset();let carryBegins=0;
 const router=app.bindNativeNodeCarry(host,{world:worldRead,referenceRecognizer:adapter.recognizer,read:drop,begin:(...a)=>{carryBegins++;drop().begin(...a);},advance:()=>{},commit:()=>{},cancel:()=>drop().cancel(),reject:m=>notices.push(m)});
 const send=(type,extra={})=>{const event=new PointerFixture(type,{pointerId:1,pointerType:'mouse',isPrimary:true,button:0,buttons:type==='pointerup'?0:1,clientX:120,clientY:100,altKey:false,shiftKey:false,ctrlKey:false,metaKey:false,...extra});Object.defineProperty(event,'target',{value:extra.target??image});host.dispatchEvent(event);return event;};
 const refs=()=>clone(R.getState().orderedNodeReferences());
 const protectedInput=()=>clone({target:S.getState().composerTarget,prompt:S.getState().composerPrompt,caret:S.getState().composerCaret,nodes:world?.nodes,selected:world?.selectedNodeIds});
 const dispose=()=>{adapter.dispose();router.dispose();};
 return{node,facts,element,image,wrapper,adapter,router,send,refs,protectedInput,notices,ref,readCount:()=>reads,imports:()=>imports,carryBegins:()=>carryBegins,
  world:worldRead,setWorld:fn=>{world=fn(world);C.setState({canvasId:world?.canvasId,nodes:world?.nodes??[]});router.invalidate();adapter.invalidate();},setHit:x=>{hit=x;},setRead:fn=>{read=fn;},setPrepare:fn=>{prepare=fn;},dispose};
}
try{
 let f=fixture();const before=f.protectedInput();assert.equal(f.send('pointerdown').defaultPrevented,true);f.send('pointerup');await until(()=>f.refs().length===1);
 assert.deepEqual(f.refs()[0],{...f.ref,displayLabel:'准确旧图'});assert.equal(f.readCount(),1);assert.equal(f.imports(),0);assert.equal(f.carryBegins(),0);
 assert.ok(R.getState().nodeEntityRefs.has('other'));assert.deepEqual(f.protectedInput(),before);f.send('pointerdown');f.send('pointerup');assert.deepEqual(f.refs(),[]);assert.equal(f.readCount(),1);f.dispose();
 report.cases.push('Unregistered saved image: actual original pick → exact historical GET join → one original cache entry → ordered draft; second pick toggles without GET/import/selection/input changes.');
 f=fixture();f.node.type='text';f.node.data.content='真实已保存文字';f.facts.graph.artifacts[0].kind='text';f.facts.graph.fileRecords[0].mimeType='text/markdown';
 f.send('pointerdown');f.send('pointerup');await until(()=>f.refs().length===1);assert.equal(f.refs()[0].mimeType,'text/markdown');assert.equal(f.refs()[0].revisionId,'old');assert.equal(f.imports(),0);f.dispose();
 for(const bad of ['binding','revision','file']){f=fixture();if(bad==='binding')f.facts.bindings[0].entityId='unrelated-view';if(bad==='revision')f.facts.graph.artifactViews[0].revisionId='new';if(bad==='file')f.facts.graph.fileRecords[0].availability='missing';
  f.send('pointerdown');f.send('pointerup');await until(()=>f.notices.length);assert.deepEqual(f.refs(),[]);assert.equal(R.getState().nodeEntityRefs.has('image'),false);assert.equal(f.imports(),0);f.dispose();}
 report.cases.push('Saved text uses the same exact historical GET path; wrong canonical binding, changed View Revision and unavailable file never register, import or admit.');
 for(const patch of [ref=>({...ref,artifactViewId:'wrong'}),ref=>({...ref,revisionId:'new'}),ref=>({...ref,entityId:'other-artifact'}),ref=>({entityType:ref.entityType,entityId:ref.entityId})]){
  f=fixture({registered:true});R.getState().registerNodeEntity('image',patch(f.ref));assert.equal(f.send('pointerdown').defaultPrevented,true);f.send('pointerup');assert.deepEqual(f.refs(),[]);assert.match(f.notices.at(-1),/视图或版本不一致/);assert.equal(f.imports(),0);assert.equal(f.readCount(),0);f.dispose();
 }
 f=fixture();f.node.data.lcos_ref.revisionId='';f.send('pointerdown');f.send('pointerup');assert.deepEqual(f.refs(),[]);assert.match(f.notices.at(-1),/版本引用尚未确认/);assert.equal(f.imports(),0);f.dispose();
 report.cases.push('Conflicting/missing cache View/Revision, wrong entity and malformed saved receipt consume pick with native notice; never import or fall through selection.');
 f=fixture({registered:true});f.element.draggable=false;f.node.data.locked=true;f.send('pointerdown');f.send('pointerup');assert.equal(f.refs().length,1);f.dispose();
 report.cases.push('Read-only geometry/locked/non-draggable material can still be referenced; read semantics are not drag permission.');
 for(const extra of [{shiftKey:true},{altKey:true},{pointerType:'touch'},{pointerType:'pen'}]){f=fixture({registered:true});assert.equal(f.send('pointerdown',extra).defaultPrevented,extra.altKey===true);f.send('pointerup',extra);assert.deepEqual(f.refs(),[]);assert.equal(f.carryBegins(),0);f.dispose();}
 for(const interaction of [undefined,{explicitToolActive:true,interactivityLocked:false},{explicitToolActive:false,interactivityLocked:true}]){
  f=fixture({registered:true});f.setWorld(w=>({...w,interaction}));assert.equal(f.send('pointerdown').defaultPrevented,false);f.send('pointerup');assert.deepEqual(f.refs(),[]);f.dispose();
 }
 f=fixture({registered:true});f.send('pointerdown');f.send('pointermove',{clientX:130});f.send('pointerup',{clientX:130});assert.deepEqual(f.refs(),[]);f.dispose();
 report.cases.push('Shift/ordinary Alt/touch/pen, original active tool and missing input-owner snapshot keep original owners; 4px-slop drag cancels reference.');
 for(const targetKind of ['overlay','foreign','control','hidden']){
  f=fixture({registered:true});const foreign=new ElementFixture('foreign',null);const control=new ElementFixture(null,f.element,'control');
  if(targetKind==='overlay')f.setHit(new ElementFixture(null,null,'overlay'));if(targetKind==='foreign')f.setHit(foreign);if(targetKind==='control')f.setHit(control);if(targetKind==='hidden')f.node.hidden=true;
  assert.equal(f.send('pointerdown').defaultPrevented,false);f.send('pointerup');assert.deepEqual(f.refs(),[]);f.dispose();
 }
 f=fixture({registered:true});const child=new ElementFixture(null,f.element,'control');assert.equal(f.send('pointerdown',{target:child}).defaultPrevented,false);f.dispose();
 report.cases.push('Actual EFP/current wrapper/node identity and controls protect overlay, other Canvas, hidden nodes and toolbar/resize content; no global bbox fallback.');
 for(const change of ['api','wrapper','version','unmount','input','close','sending']){
  f=fixture();const pending=defer();let aborted=false;f.setRead((_project,signal)=>{signal.addEventListener('abort',()=>{aborted=true;});return pending.promise;});f.send('pointerdown');f.send('pointerup');await until(()=>f.readCount()===1);
  if(change==='api')f.setWorld(w=>({...w,api:{screenToFlowPosition:p=>p}}));
  if(change==='wrapper')f.setWorld(w=>({...w,wrapper:new ElementFixture(null,null,'wrapper')}));
  if(change==='version')f.setWorld(w=>({...w,nodes:[{...w.nodes[0],data:{...w.nodes[0].data,lcos_ref:{...w.nodes[0].data.lcos_ref,revisionId:'new'}}}]}));
  if(change==='unmount')f.adapter.dispose();
  if(change==='input')S.getState().openComposer({...S.getState().composerTarget,nodeId:'another-input'});
  if(change==='close')S.getState().closeComposer();
  if(change==='sending')R.getState().beginReferenceInputOperation(app.referencePickOwnerKey(S.getState().projectId,S.getState().composerTarget),'sending');
  pending.resolve(clone(f.facts));await until(()=>![...R.getState().referenceInputOperations.values()].some(x=>x.kind==='preparing'));
  assert.deepEqual(f.refs(),[],change);assert.equal(R.getState().nodeEntityRefs.has('image'),false,change);assert.equal(f.imports(),0);assert.equal(aborted,true,change);f.dispose();
 }
 report.cases.push('Delayed saved GET across API/wrapper/version/input/close/sending/unmount aborts and performs zero stale cache registration or draft admission.');
 f=fixture();f.setRead(async()=>{throw Error('材料暂时无法读取，原输入保留；可以重试。');});f.send('pointerdown');f.send('pointerup');await until(()=>f.notices.length);assert.match(f.notices[0],/无法读取/);assert.deepEqual(f.refs(),[]);f.dispose();
 f=fixture({noSaved:true});f.send('pointerdown');f.send('pointerup');await until(()=>f.refs().length===1);assert.equal(f.imports(),1);assert.equal(f.readCount(),0);f.dispose();
 f=fixture({noSaved:true});f.setPrepare(async()=>{throw new TypeError('Failed to fetch');});f.send('pointerdown');f.send('pointerup');await until(()=>f.notices.length);assert.match(f.notices[0],/材料暂时无法读取/);assert.equal(f.notices[0].includes('Failed to fetch'),false);f.dispose();
 for(const cause of [new SyntaxError('Unexpected token < in JSON'),new Error('原材料明确处于只读状态，请先保存。'),Object.assign(new Error('request aborted'),{name:'AbortError'})]){
  f=fixture({noSaved:true});f.setPrepare(async()=>{throw cause;});f.send('pointerdown');f.send('pointerup');await until(()=>f.notices.length);
  assert.equal(f.notices[0],cause instanceof SyntaxError?'材料暂时无法读取，原输入保留；可以重试点取。':cause.message);assert.deepEqual(f.refs(),[]);f.dispose();
 }
 report.cases.push('Read failure reaches original notice with intact draft; genuinely unbound native image retains original preparation transport instead of being silently removed.');
 f=fixture({registered:true});R.getState().setReferencePickOwner(null);assert.equal(f.send('pointerdown').defaultPrevented,false);f.send('pointerup');
 assert.equal(f.send('pointerdown',{button:2,buttons:2}).defaultPrevented,true);f.send('pointermove',{button:2,buttons:2,clientX:150});assert.equal(f.carryBegins(),1);f.send('pointercancel',{button:2});f.dispose();
 report.cases.push('Same PointerRouterCore preserves ordinary left selection and right carry; reference is ordered before carry without a second capture router.');
 assert.equal(report.networkCalls,0);report.passed=true;
}finally{globalThis.fetch=realFetch;await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify({passed:report.passed,cases:report.cases.length,output}));
