import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildPilotEntry} from '../lab/pilot/build-pilot.mjs';
import {parseOriginalDonorScript} from '../lab/agent-node-transform.mjs';
import {transformNativeLibraryContextsScript} from '../lab/native-library-contexts-transform.mjs';
const root=process.cwd(),runtime=path.join(root,'.runtime'),temporary=await fs.mkdtemp(path.join(runtime,'preview-retain-test-'));
const report={passed:false,scope:'Actual donor IQe with and without optional retention slot; actual shared-state helper, controlled events only',checks:[]};
const saved={setTimeout:globalThis.setTimeout,clearTimeout:globalThis.clearTimeout,PointerEvent:globalThis.PointerEvent,Element:globalThis.Element};
try{
 const name='index-BAQXnPag.js',original=await fs.readFile(path.join(root,'reference/tapnow-installed/resources/web/assets',name),'utf8'),adapted=transformNativeLibraryContextsScript(name,original);assert.equal(transformNativeLibraryContextsScript(name,adapted),adapted);
 const component=source=>{const p=parseOriginalDonorScript(source,name);return p.body.flatMap(n=>n.type==='VariableDeclaration'?n.declarations:[]).find(n=>n.id?.name==='IQe').init;};
 function mount(source,props={}){
  const node=component(source),calls=[],effects=[],timers=[],peers=[],rootType='PopoverRoot',contentType='PopoverContent';
  globalThis.setTimeout=callback=>{timers.push(callback);return timers.length;};globalThis.clearTimeout=id=>{timers[id-1]=null;};
  const react={forwardRef:fn=>fn,useState:value=>[value,()=>{}],useRef:value=>({current:value}),useEffect:fn=>effects.push(fn),useCallback:fn=>fn,useMemo:fn=>fn(),useContext:()=>({subscribe:item=>{peers.push(item);return()=>{};},emitOpen(){}})};
  const jsx={jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};
  const events=new EventTarget();
  const render=new Function('w','v','R8a','P8a','L8a','fQe','Ie','y7a','window','return '+source.slice(node.start,node.end))(react,jsx,rootType,'Trigger','Portal',contentType,()=>'',{},events);
  const tree=render({children:'row',content:'body',open:true,onOpenChange:value=>calls.push(value),...props},null);effects.forEach(fn=>fn());
  const content=tree.props.children[1].props.children,trigger=tree.props.children[0].props.children;
  return{tree,content,trigger,calls,events,peer:()=>peers.at(-1).close(),hover:()=>{trigger.props.onMouseLeave({});timers.splice(0).forEach(fn=>fn?.());},outside:(reason,modal=false,originalEvent={target:{closest:()=>modal?{}:null}})=>{let prevented=false;const e={detail:{originalEvent},preventDefault(){prevented=true;}};content.props[reason](e);if(!prevented)tree.props.onOpenChange(false);return prevented;}};
 }
 for(const action of ['peer','hover','outside','focus','dialog-outside','explicit-close']){
  const outcomes=[];for(const source of [original,adapted]){const m=mount(source);let prevented;if(action==='peer')m.peer();else if(action==='hover')m.hover();else if(action==='explicit-close')m.tree.props.onOpenChange(false);else prevented=m.outside(action==='focus'?'onFocusOutside':'onPointerDownOutside',action==='dialog-outside');outcomes.push({calls:m.calls,prevented});}assert.deepEqual(outcomes[1],outcomes[0],action);report.checks.push('No-slot original IQe '+action+' is behaviorally unchanged');
 }
 const active=mount(adapted,{lcosKeepPreviewOpen:reason=>reason!=='viewer-open'});active.peer();active.hover();assert.deepEqual(active.calls,[]);assert.equal(active.outside('onPointerDownOutside'),true);assert.equal(active.outside('onFocusOutside'),true);assert.deepEqual(active.calls,[]);active.tree.props.onOpenChange(false);assert.deepEqual(active.calls,[false]);assert.equal(typeof active.content.props.onEscapeKeyDown,'function');report.checks.push('Drop-only slot protects peer/hover/pointer/focus; normal Root close/Escape stays unchanged');
 let reading=true;const viewer=mount(adapted,{lcosKeepPreviewOpen:reason=>reason==='viewer-open'&&reading});viewer.tree.props.onOpenChange(false);assert.deepEqual(viewer.calls,[]);assert.equal(typeof viewer.content.props.onEscapeKeyDown,'function');reading=false;viewer.tree.props.onOpenChange(false);assert.deepEqual(viewer.calls,[false]);report.checks.push('Only a live originating Viewer ignores simultaneous underlying Root dismiss; next close proceeds without intercepting its Escape event');
 const pointer={target:{}},rowFocus={target:{contains:target=>target===pointer.target,closest:()=>null}};
 const start=()=>mount(adapted,{lcosKeepPreviewOpen:(reason,event)=>reason==='pointer-outside'&&event===pointer});
 const focus=start();assert.equal(focus.outside('onPointerDownOutside',false,pointer),true);const childBlur=new Event('blur');Object.defineProperty(childBlur,'target',{value:{}});focus.events.dispatchEvent(childBlur);assert.equal(focus.outside('onFocusOutside',false,rowFocus),true);assert.equal(focus.outside('onFocusOutside',false,rowFocus),false);
 report.checks.push('Retained original row pointer protects only its one immediate ancestor focus before native dragstart');
 for(const type of ['pointerup','pointercancel','blur','keydown']){const ended=start();ended.outside('onPointerDownOutside',false,pointer);ended.events.dispatchEvent(new Event(type));assert.equal(ended.outside('onFocusOutside',false,rowFocus),false);}
 const unrelated=start();unrelated.outside('onPointerDownOutside',false,pointer);assert.equal(unrelated.outside('onFocusOutside',false,{target:{contains:()=>false,closest:()=>null}}),false);
 report.checks.push('Pointer end, cancellation, blur, keyboard and unrelated focus clear continuity; idle focus remains dismissible');
 Object.assign(globalThis,{setTimeout:saved.setTimeout,clearTimeout:saved.clearTimeout});
 const bundle=path.join(temporary,'helper.mjs');await buildPilotEntry('lab/pilot/native-library-preview-retain.ts',bundle);const app=await import(pathToFileURL(bundle));
 class ElementFixture{constructor(kind){this.kind=kind;}closest(selector){if(selector.startsWith('input'))return this.kind==='control'?this:null;if(selector.startsWith('.react-flow'))return this.kind==='node'?this:null;if(selector==='[draggable="true"]'||selector==='[data-library-view="library"]')return this.kind==='row'?this:null;return null;}}
 class PointerFixture{constructor(options={}){Object.assign(this,{button:2,altKey:false,ctrlKey:false,metaKey:false,shiftKey:false,isPrimary:true,pointerType:'mouse',target:new ElementFixture('node')},options);}}
 globalThis.Element=ElementFixture;globalThis.PointerEvent=PointerFixture;
 const detail={asset:{lcos_library_entry:{projectId:'p',item:{schemaVersion:1,kind:'context',entityRef:{type:'context',id:'s'},title:'Context',usageCount:0}}}};
 const read={projectId:'p',state:{status:'idle'},targets:[{targetId:'native-library-scope-preview:'+JSON.stringify(['p','context','s']),semantic:{kind:'spatial-membership',targetRef:{kind:'context',id:'s'}}}]};
 const should=(reason,event)=>app.shouldRetainNativeLibraryPreview(detail,reason,event,read);
 assert.equal(should('pointer-outside',new PointerFixture()),true);assert.equal(should('pointer-outside',new PointerFixture({button:0,altKey:true})),true);assert.equal(should('pointer-outside',new PointerFixture({button:0})),false);assert.equal(should('pointer-outside',new PointerFixture({target:new ElementFixture('background')})),false);assert.equal(should('pointer-outside',new PointerFixture({target:new ElementFixture('control')})),false);report.checks.push('Only actual native semantic source starts are retained; ordinary left/background/control stays dismissible');
 assert.equal(should('pointer-outside',new PointerFixture({button:0,target:new ElementFixture('row')})),true);assert.equal(should('peer-open'),false);report.checks.push('Native Library HTML drag can start; plain row click still peer-closes the previous preview');
 for(const status of ['tracking','dwell','preview','committing']){read.state={status};for(const reason of ['peer-open','hover-leave','pointer-outside','focus-outside'])assert.equal(should(reason),true);}report.checks.push('All existing active Drop phases retain the exact registered receiver');
 for(const status of ['idle','failed']){read.state={status};for(const reason of ['peer-open','hover-leave','focus-outside'])assert.equal(should(reason),false);}report.checks.push('Idle/failed state restores original automatic dismiss');
 read.state={status:'preview'};read.projectId='other';assert.equal(should('peer-open'),false);read.projectId='p';read.targets=[];assert.equal(should('peer-open'),false);detail.asset.lcos_library_entry.item.kind='collection';assert.equal(should('peer-open'),false);report.checks.push('Foreign project, unregistered preview and non-Scope entry have no retention privilege');
 report.passed=true;
}catch(error){report.error=String(error.stack??error);process.exitCode=1;}
finally{Object.assign(globalThis,saved);const out=path.join(root,'output/原库预览Drop关闭保护_20261020');await fs.mkdir(out,{recursive:true});const evidence=path.join(out,'test-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json');await fs.writeFile(evidence,JSON.stringify(report,null,2));console.log(JSON.stringify({...report,evidence},null,2));const rel=path.relative(runtime,temporary);assert.ok(rel.startsWith('preview-retain-test-')&&!rel.includes(path.sep));await fs.rm(temporary,{recursive:true,force:true});}
