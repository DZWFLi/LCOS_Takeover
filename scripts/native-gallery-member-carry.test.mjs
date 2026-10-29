import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildPilotEntry,installedRoot} from '../lab/pilot/build-pilot.mjs';
import {createRequire} from 'node:module';
import {getEventListeners} from 'node:events';
import {readCurrentGen2Resource} from '../lab/current-gen2-resources.mjs';
const root=path.resolve(import.meta.dirname,'..'),runtime=path.join(root,'.runtime'),temporary=await fs.mkdtemp(path.join(runtime,'gallery-carry-test-'));
const report={passed:false,scope:'Actual Gallery adapter + mature panel-pointer controller + shared store/resolver. Controlled DOM only; no Core/browser writes.',checks:[]};
const previous={Element:globalThis.Element,Node:globalThis.Node,document:globalThis.document};
try{
 const entry=path.join(temporary,'entry.ts'),bundle=path.join(temporary,'entry.mjs');await fs.writeFile(entry,[
  "export {semanticCarryTriggerFromPointer} from '../../lcos/huabu/apps/web/src/lcos/drop/rightCarry';",
  "export {canCommitDropRelease} from '../../lcos/huabu/apps/web/src/lcos/drop/dropReleaseConsistency';",
  "export {useLcosDropStore} from '../../lcos/huabu/apps/web/src/lcos/lcosDropState';",
  "export {resolveDropPointerTarget} from '../../lcos/huabu/apps/web/src/lcos/drop/dropPointerResolution';",
 ].join('\n'));await buildPilotEntry(path.relative(root,entry),bundle);const app={...await import(pathToFileURL(bundle))};
 const require=createRequire(path.join(installedRoot,'huabu/apps/web/package.json')),esbuild=require('esbuild');
 const selected=async relative=>{const file=path.join(root,relative);return readCurrentGen2Resource(file)?.contents??await fs.readFile(file,'utf8');};
 const evaluate=async(source,loader,dependency)=>{const code=(await esbuild.transform(source,{loader,jsx:'automatic',format:'cjs',target:'node22'})).code,module={exports:{}};new Function('require','module','exports',code)(dependency,module,module.exports);return module.exports;};
 const rail=await evaluate(await selected('lcos/huabu/apps/web/src/lcos/drop/railwayPointerDrop.ts'),'ts',()=>app);
 Object.assign(app,await evaluate(await fs.readFile(path.join(root,'lab/pilot/native-gallery-member-carry.tsx'),'utf8'),'tsx',name=>name==='react'||name==='react/jsx-runtime'?require(name):name.endsWith('/railwayPointerDrop')?rail:app));
 const recognizers=await selected('lcos/huabu/apps/web/src/lcos/lcosRecognizers.ts'),acquire=recognizers.match(/export function acquireDrop\([\s\S]*?\n}/)?.[0];assert.ok(acquire,'actual acquisition function');
 Object.assign(app,await evaluate(acquire,'ts',()=>app));
 // The exact acquisition function has one imported store; bind that identifier.
 const acquireCode=(await esbuild.transform(acquire.replace('export ',''),{loader:'ts',target:'node22'})).code;
 app.acquireDrop=new Function('useLcosDropStore',acquireCode+';return acquireDrop')(app.useLcosDropStore);

 // Node 22 removes a boolean capture listener incorrectly; normalize to the DOM-equivalent options object.
 class DomTarget extends EventTarget {removeEventListener(type,listener,options){super.removeEventListener(type,listener,options===true?{capture:true}:options);}}
 class Element extends DomTarget {constructor(){super();this.isConnected=true;this.capture=new Set();this.ownerDocument={documentElement:this};}closest(){return null;}contains(e){return e===this;}setPointerCapture(id){this.capture.add(id);}hasPointerCapture(id){return this.capture.has(id);}releasePointerCapture(id){this.capture.delete(id);}}
 class Pointer extends Event {constructor(type,fields={}){super(type,{cancelable:true,bubbles:true});for(const[k,v]of Object.entries(fields))Object.defineProperty(this,k,{value:v,configurable:true});}}
 globalThis.Element=Element;globalThis.Node=Element;globalThis.document={visibilityState:'visible'};
 const store=()=>app.useLcosDropStore.getState(),api={},element=new Element(),visibility=new DomTarget(),host=new DomTarget();
 const geometry={id:'real-source-node',parentId:'original-parent',position:{x:41,y:87}},members=['material','other'];const before={geometry:structuredClone(geometry),members:[...members]};
 let origin,ref,source,target,closed,commits,controller,denyBegin;
 const send=(type,fields={})=>{const e=new Pointer(type,{pointerId:7,pointerType:'mouse',isPrimary:true,button:2,buttons:type==='pointerup'?0:2,clientX:100,clientY:100,altKey:false,shiftKey:false,ctrlKey:false,metaKey:false,target:element,...fields});host.dispatchEvent(e);return e;};
 const down=(fields={})=>new Pointer('pointerdown',{pointerId:7,pointerType:'mouse',isPrimary:true,button:2,buttons:2,clientX:20,clientY:20,altKey:false,shiftKey:false,ctrlKey:false,metaKey:false,target:element,currentTarget:element,...fields});
 const reset=()=>{controller?.dispose();store().reset();closed=0;commits=0;denyBegin=false;element.isConnected=true;
  origin={projectId:'project',canvasId:'canvas',workspaceId:'workspace',api};ref={entityType:'artifact',entityId:'material',artifactViewId:'exact-view',revisionId:'old-revision',displayLabel:'原版本'};
  source={...origin,collectionId:'original-collection',readReference:()=>ref};target={targetId:'composer',kind:'composer-reference',enabled:true,semantic:{kind:'composer-reference',inputKey:'original-input',intent:'delegate'}};
  controller=app.createNativeGalleryCarryController({origin:()=>origin,read:store,begin:payload=>{if(denyBegin)return false;app.acquireDrop(payload,'panel-pointer');return store().state.payload===payload;},
   advance:point=>{const s=store();if(!('payload'in s.state))return false;const r=app.resolveDropPointerTarget(s.state.payload,target,{native:false,rightCarry:false});s.setBounds({left:0,top:0,right:900,bottom:700});s.advance({x:point.clientX,y:point.clientY},!!r.target,Date.now(),r.target?{targetId:r.target.targetId,previewPoint:{x:point.clientX,y:point.clientY}}:undefined,r.resolution,undefined,{x:point.clientX,y:point.clientY});return true;},
   commit:()=>{commits++;store().commitAt('gallery-test-'+commits);return store().state.status==='committing';},cancel:()=>store().cancel(),
  },host,visibility);};
 const start=(fields={})=>controller.start(down(fields),source,'node:real-source-node',()=>{closed++;assert.ok('payload'in store().state,'Gallery closes only after acquisition');element.isConnected=false;controller.detach();});
 const run=(name,fn)=>{reset();fn();assert.deepEqual({geometry,members},before);report.checks.push(name);};
 run('ordinary left drag stays outside semantic carry and leaves Gallery open',()=>{assert.equal(start({button:0,buttons:1}),false);send('pointermove',{button:0,buttons:1});send('pointerup',{button:0});assert.equal(closed,0);assert.equal(store().state.status,'idle');});
 run('short right press leaves native menu/Gallery untouched; four-pixel slop creates no payload',()=>{assert.equal(start(),true);send('pointermove',{clientX:22,clientY:22});send('pointerup',{clientX:22,clientY:22});assert.equal(closed,0);assert.equal(commits,0);assert.equal(store().state.status,'idle');});
 run('right drag retains exact View/revision, closes after acquire, survives Gallery unmount and commits once',()=>{assert.equal(start(),true);send('pointermove');assert.equal(closed,1);assert.equal(store().resolution.intent.kind,'composer-reference');assert.equal(store().state.payload.objects[0].revisionId,'old-revision');assert.equal(store().state.payload.objects[0].artifactViewId,'exact-view');assert.deepEqual(store().carrySourceNodeIds,[]);assert.equal(store().carrySourceNodeId,null);assert.equal(store().nativeSource,null);assert.equal(store().transportOwner,'panel-pointer');send('pointerup');assert.equal(commits,1);});
 run('Alt-left uses same panel owner and suppresses trailing item click',()=>{assert.equal(start({button:0,buttons:1,altKey:true}),true);send('pointermove',{button:0,buttons:1,altKey:true});send('pointerup',{button:0});assert.equal(commits,1);assert.equal(closed,1);assert.equal(send('click',{button:0,detail:1}).defaultPrevented,true);});
 run('exact material targets Collection membership rather than physical parent move',()=>{target={targetId:'collection',kind:'collection-membership',enabled:true,semantic:{kind:'collection-membership',collectionId:'target-collection'}};start();send('pointermove');assert.equal(store().resolution.intent.kind,'collection-membership');assert.equal(store().resolution.intent.memberRef.id,'material');send('pointerup');assert.equal(commits,1);assert.equal(store().nativeSource,null);});
 run('Core member without Canvas occurrence carries Artifact identity without fabricated View/node',()=>{ref={entityType:'artifact',entityId:'unprojected',displayLabel:'未投影正文'};start();send('pointermove');assert.equal(store().resolution.status,'ready');assert.equal(store().state.payload.objects[0].entityId,'unprojected');assert.equal(store().state.payload.objects[0].artifactViewId,undefined);assert.deepEqual(store().carrySourceNodeIds,[]);send('pointerup');assert.equal(commits,1);});
 for(const [label,change]of [['project',()=>origin={...origin,projectId:'different'}],['Canvas',()=>origin={...origin,canvasId:'different'}],['workspace',()=>origin={...origin,workspaceId:'different'}],['API',()=>origin={...origin,api:{}}],['member removed',()=>ref=undefined],['shown revision replaced',()=>ref={...ref,revisionId:'new-revision'}]])run(label+' change cancels before release',()=>{start();send('pointermove');change();send('pointerup');assert.equal(commits,0);assert.equal(store().state.status,'idle');});
 for(const event of ['Escape','blur','pointercancel'])run(event+' cancels acquired reference without modifying source',()=>{start();send('pointermove');if(event==='Escape')send('keydown',{key:'Escape'});else send(event);send('pointerup');assert.equal(commits,0);assert.equal(store().state.status,'idle');});
 run('failed acquisition never closes Gallery',()=>{denyBegin=true;start();send('pointermove');send('pointerup');assert.equal(closed,0);assert.equal(commits,0);assert.equal(store().state.status,'idle');});
 run('unmount before drag starts cancels armed gesture',()=>{start();controller.detach();send('pointermove');send('pointerup');assert.equal(closed,0);assert.equal(commits,0);});
 run('changed release target is rejected by mature consistency owner',()=>{start();send('pointermove');target={...target,targetId:'other'};send('pointerup');assert.equal(commits,0);assert.equal(store().state.status,'idle');});
 controller.dispose();for(const name of ['pointerdown','pointermove','pointerup','pointercancel','lostpointercapture','click','contextmenu','keydown','blur'])assert.equal(getEventListeners(host,name).length,0,name+' listeners released');report.checks.push('original controller and adapter release all gesture listeners on dispose');const pileBundle=path.join(temporary,'pile.js');await buildPilotEntry('lab/pilot/native-pile-ui.tsx',pileBundle,'browser',{nativeReact:true});assert.doesNotMatch(await fs.readFile(pileBundle,'utf8'),/useLcosDropStore|createRailwayPointerDropController/);report.checks.push('independent pile bundle contains no second Drop store or pointer owner');report.passed=true;
}catch(error){report.error=String(error.stack??error);process.exitCode=1;}
finally{Object.assign(globalThis,previous);const out=path.join(root,'output/原Gallery语义拖出_20261020');await fs.mkdir(out,{recursive:true});const evidence=path.join(out,'controller-test-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json');await fs.writeFile(evidence,JSON.stringify(report,null,2));console.log(JSON.stringify({...report,evidence},null,2));const rel=path.relative(runtime,temporary);assert.ok(rel.startsWith('gallery-carry-test-')&&!rel.includes(path.sep));await fs.rm(temporary,{recursive:true,force:true});}
