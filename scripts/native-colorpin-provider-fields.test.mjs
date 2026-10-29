import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { buildPilotEntry, installedRoot } from '../lab/pilot/build-pilot.mjs';
const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'output/非材料节点颜色原入口_20261027',new Date().toISOString().replace(/[:.]/g,'-'));
await fs.mkdir(out,{recursive:true});const temp=await fs.mkdtemp(path.join(root,'.runtime/native-pin-provider-'));
const report={passed:false,scope:'Execute actual Provider TSX and production controller with controlled React hook scheduler and typed client/GET ports. No browser, live data, or simulated backend commit.',cases:[]};
try{
  await buildPilotEntry('lab/pilot/native-colorpin-controller.ts',path.join(temp,'controller.mjs'));
  await buildPilotEntry('lab/pilot/native-colorpin-model.ts',path.join(temp,'model.mjs'));
  await buildPilotEntry('lab/pilot/native-colorpin-groups.ts',path.join(temp,'groups.mjs'));
  const controllerModule=await import(pathToFileURL(path.join(temp,'controller.mjs'))),modelModule=await import(pathToFileURL(path.join(temp,'model.mjs'))),groupsModule=await import(pathToFileURL(path.join(temp,'groups.mjs')));
  const require=createRequire(path.join(installedRoot,'package.json')),esbuild=require('esbuild');
  const jsx=(type,props)=>({type,props}),slots=[],effects=[];let cursor=0,contextValue,projectReads=0,conversationReads=0,executionReads=0,executionFailed=false,watched=0,controller,ports;
  const same=(a,b)=>!!a&&!!b&&a.length===b.length&&a.every((x,i)=>Object.is(x,b[i]));
  const hooks={createContext:()=>({Provider:'OriginalProvider'}),useContext:()=>contextValue,
    useRef(initial){const i=cursor++;return slots[i]??=( {current:initial});},
    useMemo(fn,deps){const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps))slots[i]={deps,value:fn()};return slots[i].value;},
    useSyncExternalStore(subscribe,get){cursor++;return get();},
    useEffect(fn,deps){const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps)){effects.push(()=>{slots[i]?.cleanup?.();slots[i]={deps,cleanup:fn()};});}}};
  let canvas={status:'ready',canvasId:'c',rfInstance:{},nodes:[{id:'typed',type:'lcos-conversation',data:{id:'typed',lcos_conversation_ref:{projectId:'p',canvasId:'c',workspaceId:'w',entityType:'conversation',connectedConversationId:'conv'}}},
    {id:'raw',type:'text',data:{id:'raw',text:'原文',lcos_gui_navigation_pin:false,color_pins:['F0606B']},position:{x:10,y:20}}]};
  const shell={projectId:'p',activeWorkspaceId:'w',surfaceCanvasId:{main:'c'}};
  const graph={project:{id:'p'},workspaces:[{id:'w',projectId:'p',canvasId:'c',scopeId:'s'}],scopes:[{id:'s',projectId:'p'}]};
  let bindings=[{projectId:'p',canvasId:'c',spatialKind:'node',spatialId:'typed',entityType:'conversation',entityId:'conv'}];
  const definitionCreates=[];
  const session={http:{},colorPins:{snapshot:async()=>({definitions:[],memberships:[]}),createDefinition:async(project,input)=>{
    definitionCreates.push([project,structuredClone(input)]);return{definition:{id:'new-definition',projectId:project,...input},changeSetId:'only-definition'};
  }},projects:{getProjectGraph:async()=>{projectReads++;return graph;}},
    conversations:{listConnectedConversations:async()=>{conversationReads++;return[{id:'conv',projectId:'p'}];}},runs:{readExecutionProjection:async()=>{executionReads++;if(executionFailed)throw Error('unavailable');return{projectId:'p',runs:[],resultSlots:[]};}}};
  const canvasStore=Object.assign(selector=>selector(canvas),{getState:()=>canvas}),shellStore=Object.assign(selector=>selector(shell),{getState:()=>shell});
  globalThis.window={__LCOS_NODE_LAB__:{api:canvas.rfInstance,projectId:'p',currentCanvasId:'c'}};
  const requests=[];let savedNodes=structuredClone(canvas.nodes);
  const originalFetch=globalThis.fetch;globalThis.fetch=async(url,options={})=>{requests.push({url,options});return{ok:true,status:200,json:async()=>options.method==='POST'
    ?{code:0,data:{status:'confirmed',changed:false,nativeNode:{canvasId:'c',nodeId:'raw'}}}:{code:0,data:{nodes:savedNodes}}};};
  const compiled=esbuild.transformSync(await fs.readFile(path.join(root,'lab/pilot/native-colorpin-port.tsx'),'utf8'),{loader:'tsx',format:'cjs',jsxFactory:'jsx'}).code;
  const module={exports:{}};
  new Function('require','module','exports','jsx',compiled)(specifier=>{
    if(specifier==='react')return hooks;
    if(specifier.endsWith('lcosCoreClient'))return{createLcosCoreSession:()=>session};
    if(specifier.endsWith('lcosShellStore'))return{useLcosShellStore:shellStore};
    if(specifier.endsWith('collaborationSessionStore'))return{useCollaborationSessionStore:{getState:()=>({watchProjectChanges:()=>{watched++;return()=>{};}})}};
    if(specifier.endsWith('sqliteBindingStore'))return{SqliteBindingStore:class{async list(){return bindings;}}};
    if(specifier==='./native-canvas-port')return{__esModule:true,default:canvasStore};
    if(specifier==='./native-colorpin-controller')return{createNativeColorPinController:p=>{ports=p;return controller=controllerModule.createNativeColorPinController(p);}};
    if(specifier==='./native-colorpin-model')return modelModule;
    if(specifier==='./native-colorpin-groups')return groupsModule;
    if(specifier.endsWith('.css'))return{};
    throw Error('Unexpected actual Provider dependency '+specifier);
  },module,module.exports,jsx);
  const render=async()=>{cursor=0;const tree=module.exports.NativeColorPinProvider({children:'original-canvas'});contextValue=tree.props.value;while(effects.length)effects.shift()();await new Promise(resolve=>setImmediate(resolve));return tree;};
  await render();await render();assert.deepEqual(contextValue.targetForNode('typed'),{projectId:'p',kind:'entity',id:'conv'});assert.equal(watched,1);assert.ok(conversationReads>0&&executionReads>0);
  report.cases.push({name:'actual Provider supplies original connectedConversations and execution read models to typed projection; one original project watch',passed:true});
  assert.equal(typeof contextValue.createDefinition,'function');
  const created=await ports.client.createDefinition('p',{color:'#F0606B',label:'独立颜色名',expectedDefinitionId:null});
  assert.deepEqual(definitionCreates,[['p',{color:'#F0606B',label:'独立颜色名',expectedDefinitionId:null}]]);assert.equal(created.definition.id,'new-definition');
  report.cases.push({name:'actual Provider forwards the original available createDefinition client with project/color/label/observed absence only; no target or membership input',passed:true});
  const readCount=projectReads;
  canvas={...canvas,nodes:canvas.nodes.map(node=>({...node,selected:true,dragging:true,position:{x:60,y:70}}))};await render();await render();assert.equal(projectReads,readCount);
  canvas={...canvas,nodes:canvas.nodes.map(node=>({...node,dragging:false}))};await render();assert.equal(projectReads,readCount);
  report.cases.push({name:'geometry, selection and dragging only reproject local facts; no full Core read or extra project stream',passed:true});
  canvas={...canvas,nodes:canvas.nodes.map(node=>node.id==='raw'?{...node,data:{...node.data,color_pins:['123ABC']}}:node)};await render();await render();assert.ok(projectReads>readCount);assert.equal(contextValue.groups.find(group=>group.groupId==='123ABC').rawNodeIds[0],'raw');
  report.cases.push({name:'saved raw GUI field change uses original quiet read and same original group; arbitrary valid color is preserved',passed:true});
  executionFailed=true;await controller.refresh();await render();assert.deepEqual(contextValue.targetForNode('typed'),{projectId:'p',kind:'entity',id:'conv'});
  report.cases.push({name:'failed execution species read does not erase an independently read conversation identity',passed:true});
  assert.deepEqual(await ports.ordinary.read(controller.read().scene,'raw'),['F0606B']);const response=await ports.ordinary.set(controller.read().scene,'raw','123ABC',true);assert.equal(response.status,'confirmed');
  const request=requests.at(-1);assert.equal(request.url,'/api/lcos/canvases/c/gui');assert.deepEqual(JSON.parse(request.options.body),{type:'SET_COLOR_PIN',nodeId:'raw',color:'#123ABC',present:true});
  bindings=[...bindings,{projectId:'p',canvasId:'c',spatialKind:'node',spatialId:'raw',entityType:'note',entityId:'foreign'}];await assert.rejects(()=>ports.ordinary.read(controller.read().scene,'raw'));
  bindings=bindings.filter(row=>row.spatialId!=='raw');savedNodes=savedNodes.map(node=>node.id==='raw'?{...node,data:{...node.data,lcos_ref:null}}:node);await assert.rejects(()=>ports.ordinary.read(controller.read().scene,'raw'));
  savedNodes=savedNodes.map(node=>{if(node.id!=='raw')return node;const data={...node.data};delete data.lcos_ref;delete data.lcos_gui_navigation_pin;return{...node,data};});await assert.rejects(()=>ports.ordinary.read(controller.read().scene,'raw'));
  report.cases.push({name:'ordinary producer reads exact saved DTO and unbound identity; narrow POST has only explicit desired GUI field; binding or reserved null ref refuses raw downgrade',passed:true});
  globalThis.fetch=originalFetch;report.passed=true;
}catch(error){report.error=String(error.stack??error);throw error;}finally{delete globalThis.window;await fs.writeFile(path.join(out,'provider-report.json'),JSON.stringify(report,null,2));await fs.rm(temp,{recursive:true,force:true});}
console.log(JSON.stringify({passed:report.passed,cases:report.cases.length,report:path.join(out,'provider-report.json')}));
