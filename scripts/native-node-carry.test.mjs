import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';
const root=path.resolve(import.meta.dirname,'..'),temp=await fs.mkdtemp(path.join(root,'.runtime','native-node-carry-test-'));
await fs.writeFile(path.join(temp,'entry.ts'),[
  "export * from '../../lab/pilot/native-node-carry';",
  "export {useLcosDropStore} from '../../lcos/huabu/apps/web/src/lcos/lcosDropState';",
  "export {resolveDropPointerTarget} from '../../lcos/huabu/apps/web/src/lcos/drop/dropPointerResolution';",
  "export {handleCarryContextMenu} from '../../lcos/huabu/apps/web/src/lcos/referenceClickSuppressor';",
].join('\n'));
await buildPilotEntry(path.relative(root,path.join(temp,'entry.ts')),path.join(temp,'entry.mjs'),'browser');
const app=await import(pathToFileURL(path.join(temp,'entry.mjs')));
const cases=[];
// Synthetic DOM transport, actual mature recognizer, pointer router, store and
// selected current resolver. This test never writes Core or claims browser UX.
class ElementFixture extends EventTarget {
  constructor(id,parent=null,role='node'){super();this.dataset=id?{id}:{};this.parent=parent;this.role=role;this.isConnected=true;this.ownerDocument={activeElement:null};this.capture=new Set();this.draggable=true;this.classList={contains:name=>name==='draggable'&&this.draggable};}
  contains(node){return node===this||node?.parent===this||node?.parent?.parent===this;}
  closest(selector){
    if(selector.includes('data-semantic-drop-handle'))return this.role==='handle'?this:null;
    if(selector.startsWith('input,'))return this.role==='control'?this:null;
    if(selector.startsWith('[contenteditable'))return this.role==='editor'?this:null;
    if(selector.startsWith('.react-flow__node'))return this.role==='node'?this:this.parent?.role==='node'?this.parent:null;
    return null;
  }
  setPointerCapture(id){this.capture.add(id);}hasPointerCapture(id){return this.capture.has(id);}releasePointerCapture(id){this.capture.delete(id);}
  getBoundingClientRect(){return{left:0,top:0,width:900,height:700};}
}
class MouseFixture extends Event {constructor(type,options={}){super(type,{bubbles:true,cancelable:true});for(const[k,v]of Object.entries(options))if(!['bubbles','cancelable'].includes(k))Object.defineProperty(this,k,{value:v,configurable:true});}}
globalThis.Element=ElementFixture;globalThis.MouseEvent=MouseFixture;
const wrapper=new ElementFixture(null,null,'wrapper'),nodeElement=new ElementFixture('n1',wrapper);
const exact=(artifact='a1',view='v1',revision='r1')=>({version:1,entityType:'artifact',entityId:artifact,artifactId:artifact,artifactViewId:view,revisionId:revision});
const original={id:'n1',type:'text',position:{x:40,y:80},data:{content:'body',title:'用户的真实材料标题',lcos_ref:exact()}};
let world={projectId:'p',canvasId:'c',workspaceId:'w',api:{screenToFlowPosition:p=>p},wrapper,nodes:[original],selectedNodeIds:['n1'],refs:new Map()};
const snapshot=()=>app.snapshotNativeCarryNodes(world,world.nodes.map(n=>n.id));
assert.equal(snapshot()[0].reference.revisionId,'r1');assert.equal(snapshot()[0].reference.displayLabel,'用户的真实材料标题');
world.refs=new Map([['n1',{entityType:'artifact',entityId:'a1',descriptor:{entityType:'artifact',entityId:'a1',presentedRevisionId:'r1',mimeType:'text/markdown'}}]]);
assert.equal(snapshot()[0].reference.mimeType,'text/markdown');
world.refs=new Map([['n1',{entityType:'artifact',entityId:'a1',revisionId:'r9'}]]);
assert.equal(snapshot()[0].reference,undefined);
world.refs=new Map();world.nodes=[{...original,data:{content:'body',lcos_ref:{...exact(),revisionId:''}}}];
assert.equal(snapshot()[0].reference,undefined,'malformed receipt never becomes a new native-text import');
cases.push('exact old version, MIME retained; conflicting/malformed material receipt rejected');
world.nodes=[{...original,type:'run',data:{lcos_ref:{version:1,entityType:'run',entityId:'run-1'}}}];world.refs=new Map([['n1',{entityType:'run',entityId:'run-1'}]]);
assert.equal(snapshot()[0].reference.entityType,'run');
world.nodes=[{...original,data:{lcos_ref:{version:1,entityType:'artifact',artifactId:'a1',artifactViewId:'v1',revisionId:'r1'},lcos_result_ref:{projectId:'p',canvasId:'c',workspaceId:'w',artifactId:'a1',artifactViewId:'v1',revisionId:'r1'}}}];world.refs=new Map();
assert.equal(snapshot()[0].reference.entityId,'a1');
for(const[kind,key,idKey]of[['collection','lcos_collection_ref','collectionId'],['conversation','lcos_conversation_ref','connectedConversationId']]){
 world.nodes=[{...original,data:{[key]:{projectId:'p',canvasId:'c',workspaceId:'w',[idKey]:'entity'}}}];world.refs=new Map([['n1',{entityType:kind,entityId:'entity'}]]);
 assert.equal(snapshot()[0].reference.entityType,kind);
 world.nodes=[{...world.nodes[0],data:{[key]:{projectId:'other',canvasId:'c',workspaceId:'w',[idKey]:'entity'}}}];assert.equal(snapshot()[0].reference,undefined);
}
world.nodes=[{...original,data:{}}];world.refs=new Map([['n1',{entityType:'scope',entityId:'workflow',descriptor:{entityType:'scope',entityId:'workflow',sourceKind:'workflow'}}]]);
assert.deepEqual(snapshot()[0].reference.sourceRef,{kind:'workflow',id:'workflow'});
cases.push('Run, result material, Collection, Glyth and Workflow preserve canonical identities; foreign binding rejected');
world.nodes=[{...original,data:{content:'native'}},{id:'n2',type:'image',position:{x:80,y:40},data:{src:'blob:existing'}}];world.refs=new Map();
assert.equal(snapshot()[0].reference.entityType,'native-text');assert.equal(snapshot()[1].reference.entityType,'native-image');
cases.push('genuine unbound text/image use existing preparation payloads, no guessed entity IDs');
world.nodes=[original];world.refs=new Map();world.selectedNodeIds=['n1'];
const host=new EventTarget(),messages=[];let commits=0;
let target={targetId:'input',kind:'composer-reference',enabled:true,semantic:{kind:'composer-reference',inputKey:'original-input',intent:'delegate'}};
const store=()=>app.useLcosDropStore.getState();
const binding=app.bindNativeNodeCarry(host,{
 world:()=>world,read:store,begin:(...args)=>store().begin(...args),cancel:()=>store().cancel(),reject:message=>messages.push(message),
 commit:()=>{commits++;store().commitAt('actual-recognizer-commit');},
 advance:event=>{const s=store();if(!('payload'in s.state))return;const r=app.resolveDropPointerTarget(s.state.payload,target,{native:false,rightCarry:s.carrySourceNodeId!==null});
 s.setBounds({left:0,top:0,right:900,bottom:700});s.advance({x:event.clientX,y:event.clientY},!!r.target,Date.now(),r.target?{targetId:r.target.targetId,previewPoint:{x:event.clientX,y:event.clientY}}:undefined,r.resolution,undefined,{x:event.clientX,y:event.clientY});},
});
function send(type,options={}){const e=new MouseFixture(type,{pointerId:1,pointerType:'mouse',isPrimary:true,button:2,buttons:type==='pointerup'?0:2,clientX:30,clientY:30,altKey:false,shiftKey:false,ctrlKey:false,metaKey:false,...options});Object.defineProperty(e,'target',{value:options.target??nodeElement});host.dispatchEvent(e);return e;}
function reset(){store().reset();target={targetId:'input',kind:'composer-reference',enabled:true,semantic:{kind:'composer-reference',inputKey:'original-input',intent:'delegate'}};world.nodes=[original];world.selectedNodeIds=['n1'];world.refs=new Map();}
reset();let menus=0;nodeElement.addEventListener('contextmenu',()=>menus++);
send('pointerdown');send('pointerup',{clientX:32});assert.equal(menus,1);assert.equal(store().state.status,'idle');
cases.push('short right click replays one original context menu, no payload or writes');
reset();assert.equal(send('pointerdown',{button:0,buttons:1}).defaultPrevented,false);send('pointermove',{button:0,buttons:1,clientX:100});send('pointerup',{button:0});assert.equal(store().state.status,'idle');
cases.push('ordinary left movement is never claimed');
reset();nodeElement.draggable=false;
for(const extra of [{button:2,buttons:2},{button:0,buttons:1,altKey:true}]){
 assert.equal(send('pointerdown',extra).defaultPrevented,false);send('pointermove',{...extra,clientX:100});send('pointerup',{...extra,buttons:0});
 assert.equal(store().state.status,'idle');
}nodeElement.draggable=true;
cases.push('original non-draggable hand/tool mode keeps both right and Alt input');
reset();const editor=new ElementFixture(null,nodeElement,'editor');wrapper.ownerDocument.activeElement=editor;
assert.equal(send('pointerdown',{target:editor}).defaultPrevented,false);send('pointerup',{target:editor});assert.equal(store().state.status,'idle');
wrapper.ownerDocument.activeElement=null;
const control=new ElementFixture(null,nodeElement,'control');assert.equal(send('pointerdown',{target:control,button:0,buttons:1,altKey:true}).defaultPrevented,false);send('pointerup',{target:control,button:0});
assert.equal(store().state.status,'idle');
cases.push('focused editor and form/resize controls retain their native pointer owner');

reset();send('pointerdown');send('pointermove',{clientX:100});assert.equal(store().resolution.intent.kind,'composer-reference');assert.equal(store().state.payload.objects[0].revisionId,'r1');send('pointerup',{clientX:100});assert.equal(commits,1);assert.equal(store().state.status,'committing');assert.deepEqual(original.position,{x:40,y:80});
cases.push('right drag enters actual resolver/store and commits once without moving the original');
reset();send('pointerdown',{button:0,buttons:1,altKey:true});send('pointermove',{button:0,buttons:1,altKey:true,clientX:100});assert.equal(store().state.status,'preview');host.dispatchEvent(new MouseFixture('keydown',{key:'Escape'}));assert.equal(store().state.status,'idle');send('pointerup',{button:0,clientX:100});assert.equal(commits,1);
cases.push('Alt-left uses same owner; Escape cancels without committing');
reset();send('pointerdown');send('pointermove',{clientX:100});nodeElement.draggable=false;send('pointerup',{clientX:100});
assert.equal(store().state.status,'idle');assert.equal(commits,1);nodeElement.draggable=true;
cases.push('changing to original non-draggable mode during carry cancels before release');

reset();world.nodes=[original,{id:'n2',type:'text',position:{x:2,y:2},data:{content:'two',lcos_ref:exact('a2','v2','r2')}}];world.selectedNodeIds=['n1','n2'];send('pointerdown');send('pointermove',{clientX:100});assert.equal(store().state.payload.objects.length,2);send('pointercancel');assert.equal(store().state.status,'idle');
reset();world.nodes=[original,{id:'n2',type:'unknown',position:{x:2,y:2},data:{}}];world.selectedNodeIds=['n1','n2'];send('pointerdown');send('pointermove',{clientX:100});assert.equal(store().state.status,'idle');assert.match(messages.at(-1),/整组/);send('pointerup');
cases.push('multi-selection preserves all exact identities; mixed unknown group rejects atomically');
reset();send('pointerdown');send('pointermove',{clientX:100});const before=world;world={...world,canvasId:'changed'};binding.invalidate();assert.equal(store().state.status,'idle');send('pointerup',{clientX:100});assert.equal(commits,1);world=before;
reset();send('pointerdown');send('pointermove',{clientX:100});world={...world,api:{screenToFlowPosition:p=>p}};binding.invalidate();assert.equal(store().state.status,'idle');send('pointerup');
cases.push('canvas/API replacement cancels held gesture and prevents late release writes');
reset();target={targetId:'canvas',kind:'canvas',enabled:true,semantic:{kind:'canvas',targetRef:{kind:'workspace',id:'w'}}};send('pointerdown');send('pointermove',{clientX:100});assert.equal(store().resolution.status,'ineligible');send('pointerup',{clientX:100});assert.equal(commits,1);
cases.push('existing right-carry-to-blank-Canvas rejection remains intact');
reset();send('pointerdown');send('pointermove',{clientX:100});binding.dispose();assert.equal(store().state.status,'idle');assert.equal(send('pointerdown').defaultPrevented,false);
assert.equal(commits,1);
console.log(JSON.stringify({passed:true,cases,scope:'synthetic DOM, actual recognizer/router/store/resolver; no real Core/browser writes'},null,2));
