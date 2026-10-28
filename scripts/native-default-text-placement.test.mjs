import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';
import { parseOriginalDonorScript as parse } from '../lab/agent-node-transform.mjs';
import { transformNativeDefaultTextPlacementScript as transform } from '../lab/native-project-text-create-transform.mjs';

const root=path.resolve(import.meta.dirname,'..'),dir=path.join(root,'reference/tapnow-installed/resources/web/assets');
const runtime=path.join(root,'.runtime','native-default-text-placement-'+Date.now());await mkdir(runtime,{recursive:true});
const page=fs.readFileSync(path.join(dir,'page-Da_DfwiK.js'),'utf8'),flow=fs.readFileSync(path.join(dir,'UnlimitedModeToggle-D4wysAbz.js'),'utf8');
const index=fs.readFileSync(path.join(dir,'index-BAQXnPag.js'),'utf8');
const walk=(n,f)=>{if(!n?.type)return;f(n);for(const v of Object.values(n))if(Array.isArray(v))v.forEach(a=>walk(a,f));else if(v?.type)walk(v,f)};
const declarations=(source,name)=>{const out=[];walk(parse(source,'fixture'),n=>{if(n.type==='VariableDeclarator'&&n.id?.name===name)out.push(n)});return out};
const pageOutput=transform('page-Da_DfwiK.js',page),program=parse(pageOutput,'transformed-page');
assert.equal(transform('page-Da_DfwiK.js',pageOutput),pageOutput);
assert.equal(transform('other.js','unchanged'),'unchanged');
assert.throws(()=>transform('page-Da_DfwiK.js',page.replace('Ze=()=>{const Ee=i(),at=fi','Ze=(position)=>{const Ee=i(),at=fi')),/gained explicit input/);
assert.throws(()=>transform('page-Da_DfwiK.js',page.replace('fi({text:"",prompt:""},{position:ns(Ee)})','fi({text:"",prompt:""},{position:{x:1,y:2}})')),/viewport factory changed/);
const menu=declarations(pageOutput,'fH')[0],findInMenu=name=>{const a=[];walk(menu.init,n=>{if(n.type==='VariableDeclarator'&&n.id?.name===name)a.push(n)});assert.equal(a.length,1);return a[0]};
const ze=findInMenu('Ze').init,ke=findInMenu('Ke').init;
const originalMenu=declarations(page,'fH')[0],oldCommits=[];walk(originalMenu.init,n=>{if(n.type==='VariableDeclarator'&&n.id?.name==='Ze')walk(n.init,m=>{if(m.type==='CallExpression'&&m.callee?.name==='Ke')oldCommits.push(m)})});
assert.equal(oldCommits.length,1);
const marker='\n/* LCOS original fH default Text placement */',prefix='import{LCOSNativeDefaultTextPlacement}from"/lcos/agent-ui.js";\n';
const changed=pageOutput.slice(prefix.length,-marker.length);
const originalCommit=oldCommits[0],before=page.slice(0,originalCommit.start),after=page.slice(originalCommit.end);
assert.ok(changed.startsWith(before)&&changed.endsWith(after),'all explicit factory callers and original UI outside one default commit remain byte-for-byte');

const flowAst=parse(flow,'flow'),factory=declarations(flow,'XD')[0].init;
const dimensionImport=flowAst.body.filter(n=>n.type==='ImportDeclaration').flatMap(n=>n.specifiers).find(n=>n.local?.name==='ar');
const exported=parse(index,'index').body.filter(n=>n.type==='ExportNamedDeclaration').flatMap(n=>n.specifiers??[]).find(n=>n.exported?.name===dimensionImport.imported.name);
const dimension=declarations(index,exported.local.name)[0].init;
const originalSize=new Function('return ('+index.slice(dimension.start,dimension.end)+')')();
// Execute the shipped Rt object API and its real Sonner observer pipeline.
// A fake (string, options) recorder hid the actual blank-toast regression.
const indexAst=parse(index,'index-toast'),topDeclaration=name=>{
  const found=indexAst.body.flatMap(n=>n.declarations??[]).filter(n=>n.id?.name===name);
  assert.equal(found.length,1,name);return 'const '+index.slice(found[0].start,found[0].end)+';';
};
const toastClass=indexAst.body.find(n=>n.type==='ClassDeclaration'&&n.id.name==='drr');
const toastFunction=indexAst.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='Rt');
const errorAssignment=indexAst.body.find(n=>n.type==='ExpressionStatement'&&n.expression?.type==='AssignmentExpression'
  &&n.expression.left?.object?.name==='Rt'&&n.expression.left?.property?.name==='error');
assert.ok(toastClass&&toastFunction&&errorAssignment);
const realToast=new Function('let gRe=1;'+index.slice(toastClass.start,toastClass.end)
  +['x2','urr','prr','frr','grr','jh'].map(topDeclaration).join('')
  +index.slice(toastFunction.start,toastFunction.end)+index.slice(errorAssignment.start,errorAssignment.end)+';return{toast:Rt,state:x2};')();
let next=0;
const originalFactory=new Function('Ru','ma','Di','Wa','SM','kM','ie','Pu','sd','zp','ar','return ('+flow.slice(factory.start,factory.end)+')')(
  {getState:()=>({mergedPolicy:{canvasMeta:{ignoreLocalRuntimeCache:true}}})},undefined,undefined,{model:{provider:'fixture'}},'model',()=>({}),
  {TEXT:'text'},()=>String(++next),{GENERATE:'generate'},{getState:()=>({selectedNodeCount:0})},originalSize);
const placementSource=fs.readFileSync(path.join(dir,'canvas-export-placement-BcB3femJ.js'),'utf8'),placementAst=parse(placementSource,'placement');
const placementFunction=placementAst.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name==='H');
const absolute=(node,map)=>{let x=node.position.x,y=node.position.y,p=node.parentId;while(p){const parent=map.get(p);assert.ok(parent);x+=parent.position.x;y+=parent.position.y;p=parent.parentId}return{x,y}};
const originalPlacement=new Function('h','B','g','C','a','G','Y','return ('+placementSource.slice(placementFunction.start,placementFunction.end)+')')(
  n=>n.measured?.width??n.width??n.style?.width,n=>n.measured?.height??n.height??n.style?.height,absolute,100,60,450,4);
const bridge=fs.readFileSync(path.join(root,'lab/startup-node-bridge.js'),'utf8').replace(/^import .+;\r?\n/gm,'').replaceAll('export function ','function ');
const originalApiFactory=new Function('originalExportPlacement','originalNodePosition','originalNodeWidth',bridge+';return createOriginalNodeApi;')(
  originalPlacement,absolute,n=>n.measured?.width??n.width??n.style?.width);
const bundle=path.join(runtime,'placement.mjs');await buildPilotEntry('lab/pilot/native-default-text-placement.ts',bundle);
const {LCOSNativeDefaultTextPlacement:place}=await import(pathToFileURL(bundle));
const clientBundle=path.join(runtime,'client.mjs');await buildPilotEntry('lab/pilot/native-material-placement-client.ts',clientBundle);
const {visibleCanvas}=await import(pathToFileURL(clientBundle));
assert.ok(index.includes('CONTAINER:"canvas-dockbar-container"'));
assert.ok(page.slice(menu.start,menu.end).includes('Me.CANVAS.DOCKBAR.CONTAINER'),'the rail selector belongs to original fH root, not an invented wrapper');

const previous={document:globalThis.document,host:globalThis.__LCOS_NODE_LAB__};
let raw=[],pending,view={x:0,y:0,zoom:1},preferred={x:424.24,y:98.55},pane,panels=[],overlays=[],rails=[],fallbackCalls=0,moves=0;
const listeners=new Set(),toast=[],rect=(left,top,width,height)=>({left,top,right:left+width,bottom:top+height,width,height});
const element=(box,options={})=>({getBoundingClientRect:()=>box,
  getAttribute:name=>name==='aria-hidden'&&options.ariaHidden?'true':null,checkVisibility:()=>options.visible!==false});
const boxes=()=>raw.filter(n=>!n.hidden).map(n=>{const p=absolute(n,new Map(raw.map(n=>[n.id,n])));return rect(p.x*view.zoom+view.x,p.y*view.zoom+view.y,(n.measured?.width??n.width)*view.zoom,(n.measured?.height??n.height)*view.zoom)});
globalThis.document={querySelector:()=>element(pane),querySelectorAll:selector=>[
  ...(selector.includes('.react-flow__node')?[...boxes(),...panels,...overlays]:panels).map(box=>element(box)),
  ...rails.map(row=>element(row.box,row))]};
const rawApi={getNodes:()=>raw,getNode:id=>raw.find(n=>n.id===id),getEdges:()=>[],getViewport:()=>view,getZoom:()=>view.zoom,
  screenToFlowPosition:p=>({x:(p.x-view.x)/view.zoom,y:(p.y-view.y)/view.zoom}),flowToScreenPosition:p=>({x:p.x*view.zoom+view.x,y:p.y*view.zoom+view.y}),
  getNodesBounds:nodes=>{const b=nodes.map(n=>{const p=absolute(n,new Map(raw.map(n=>[n.id,n])));return rect(p.x,p.y,n.width,n.height)});const x=Math.min(...b.map(b=>b.left)),y=Math.min(...b.map(b=>b.top));return{x,y,width:Math.max(...b.map(b=>b.right))-x,height:Math.max(...b.map(b=>b.bottom))-y}},
  setViewport:async next=>{view=next;moves++;return true}};
const api=originalApiFactory(rawApi,{subscribeNative:listener=>{listeners.add(listener);return()=>listeners.delete(listener)}}),find=api.findMaterialPlacement;
api.findMaterialPlacement=size=>{fallbackCalls++;return find(size)};
const install=()=>{globalThis.__LCOS_NODE_LAB__={api,canvasId:'canvas',currentCanvasId:'canvas',projectId:'project'}};
const publish=()=>{raw=pending;pending=undefined;for(const listener of [...listeners])listener()};
const commit=new Function('o','return ('+pageOutput.slice(ke.start,ke.end)+')')(updater=>{pending=updater(raw)});
const unsubscribeToast=realToast.state.subscribe(value=>toast.push(value));
const originalToast=realToast.toast;
const action=new Function('i','fi','ns','Ke','e','LCOSNativeDefaultTextPlacement','se','return ('+pageOutput.slice(ze.start,ze.end)+')')(
  ()=>view,originalFactory,()=>({...preferred}),commit,'canvas',place,originalToast);
const reset=()=>{raw=[];pending=undefined;view={x:0,y:0,zoom:1};pane=rect(0,0,1440,1000);panels=[];overlays=[];rails=[];fallbackCalls=0;moves=0;toast.length=0;install()};
const overlaps=(n,box)=>n.position.x<box.right&&n.position.x+n.width>box.left&&n.position.y<box.bottom&&n.position.y+n.height>box.top;
const cases=[];
try{
  originalToast('old invalid string signature',{action:{label:'定位',onClick(){}}});
  assert.equal(toast.at(-1).title,undefined);assert.equal(toast.at(-1).action,undefined);
  reset();cases.push('real shipped Rt + Sonner observer reproduces invalid string signature as blank title/no action; regression is not hidden by a toast mock');
  reset();const node=originalFactory({text:'',prompt:''},{position:{...preferred}}),result=place(node,'canvas');
  assert.equal(result.node,node,'an unobstructed default point and factory object identity are retained');assert.equal(fallbackCalls,0);assert.equal(moves,0);
  cases.push('clear default keeps exact original factory position and dimensions; no camera or fallback');

  reset();const measured=JSON.parse(fs.readFileSync(path.join(root,'output/原流程融合_20261017c/原加号文本落点只读测量.json'),'utf8'));
  raw=measured.nodes.filter(n=>n.id!==measured.createdNodeId).map(n=>({...structuredClone(n),width:n.measured.width,height:n.measured.height,selected:true}));
  const before=structuredClone(raw),camera=structuredClone(view);action();assert.ok(pending);const created=pending.at(-1);
  assert.equal(created.width,originalSize.width);assert.equal(created.height,originalSize.height);assert.notDeepEqual(created.position,preferred);
  assert.ok(before.every(n=>!overlaps({...created,width:360,height:280},rect(n.position.x,n.position.y,n.width,n.height))));assert.equal(fallbackCalls,0);
  assert.deepEqual(raw,before,'planning and original deferred Ke do not rewrite existing nodes');assert.deepEqual(view,camera);
  publish();assert.deepEqual(raw.slice(0,-1).map(({selected,...n})=>n),before.map(({selected,...n})=>n));
  assert.ok(raw.slice(0,-1).every(n=>!n.selected)&&created.selected,'the original Ke selection policy remains');
  cases.push('actual fH.Ze/XD/Ke execute against the measured two-card overlap and place a fully visible non-overlapping Text; old geometry/camera unchanged');

  reset();panels=[rect(0,0,320,1000),rect(1080,0,360,1000)];overlays=[rect(320,0,760,72),rect(510,880,400,100),rect(320,72,390,300)];
  preferred={x:424.24,y:98.55};const avoided=place(originalFactory({}, {position:{...preferred}}),'canvas');
  assert.ok(!avoided.outsideVisible);assert.ok([...panels,...overlays].every(b=>!overlaps(avoided.node,b)));assert.equal(moves,0);
  cases.push('visible placement avoids original Library, right rail, header, dock and preview using the existing rectangle selector');

  reset();pane=rect(0,0,600,450);panels=[rect(0,0,190,450),rect(410,0,190,450)];
  raw=[{id:'parent',type:'group',position:{x:1000,y:10},width:500,height:500},{id:'child',type:'text',parentId:'parent',position:{x:900,y:30},width:150,height:120}];
  const nestedBefore=structuredClone(raw),fallback=place(originalFactory({}, {position:{...preferred}}),'canvas');
  assert.equal(fallbackCalls,1);assert.ok(fallback.outsideVisible);assert.equal(fallback.node.position.x,2150,'actual original export helper starts after the rightmost absolute child edge');
  assert.equal(moves,0);assert.deepEqual(raw,nestedBefore);
  const locating=fallback.locate();await new Promise(r=>setTimeout(r,0));assert.equal(moves,0,'locate cannot move the camera before native publish');
  raw.push(fallback.node);for(const listener of [...listeners])listener();assert.equal(await locating,true);assert.equal(moves,1);assert.equal(listeners.size,0);
  cases.push('no visible slot uses actual original export-placement with nested absolute bounds; explicit locate waits for native publish then alone moves camera');

  reset();pane=rect(0,0,320,1000);panels=[rect(320,0,360,1000)];rails=[{box:rect(15,331,54,338)}];
  view={x:-767.4956310250143,y:-20.92918118824514,zoom:1.2187707886145738};
  raw=[{id:'image',type:'image',position:{x:120,y:100},width:375,height:250},
    {id:'text',type:'text',position:{x:540,y:110},width:360,height:280}];
  const railScene=structuredClone(raw),railCamera=structuredClone(view);
  assert.deepEqual(visibleCanvas(),{left:69,right:320,top:0,bottom:1000});
  const railFallback=place(originalFactory({}, {position:{...preferred}}),'canvas');
  assert.equal(railFallback.outsideVisible,true);assert.equal(fallbackCalls,1);assert.deepEqual(view,railCamera);assert.equal(moves,0);
  raw.push(railFallback.node);assert.equal(await railFallback.locate(),true);assert.equal(moves,1);
  const located=rawApi.flowToScreenPosition(railFallback.node.position);
  const actual={left:located.x,top:located.y,right:located.x+railFallback.node.width*view.zoom,bottom:located.y+railFallback.node.height*view.zoom};
  assert.ok(actual.left>=69+23.99&&actual.right<=320-23.99);
  assert.ok(actual.right<=15||actual.left>=69||actual.bottom<=331||actual.top>=669,'actual narrow-screen Text clears original fH rail');
  assert.deepEqual(raw.slice(0,-1),railScene,'rail-aware locate leaves existing world geometry/body intact');
  rails[0].ariaHidden=true;assert.equal(visibleCanvas().left,0,'aria-hidden rail reserves no phantom width');
  rails[0].ariaHidden=false;rails[0].visible=false;assert.equal(visibleCanvas().left,0,'CSS/opacity-hidden original rail reserves no width');
  rails=[];assert.equal(visibleCanvas().left,0,'unmounted original rail reserves no width');
  rails=[{box:rect(16,1100,53,338)}];assert.equal(visibleCanvas().left,0,'off-canvas rail reserves no width');
  pane=rect(0,0,1000,1000);panels=[rect(16,64,320,800),rect(520,0,480,1000)];rails=[{box:rect(15,331,54,338)}];
  assert.deepEqual(visibleCanvas(),{left:336,right:520,top:0,bottom:1000},'Library replaces the rail; max edge is not additive width');
  cases.push('measured 320px Canvas / 54px fH root bounds constrain explicit original locate; hidden, absent, off-canvas and Library-replaced rail never leaves phantom width');

  reset();pane=rect(0,0,360,800);panels=[rect(0,400,360,400)];rails=[{box:rect(15,230,54,338)}];
  assert.deepEqual(visibleCanvas(),{left:69,right:360,top:0,bottom:400},'the existing shared visible-area helper excludes the real half-screen conversation');

  reset();rails=[{box:rect(15,331,54,338)}];preferred={x:24,y:360};
  const underRail=originalFactory({}, {position:{...preferred}}),clearRail=place(underRail,'canvas');
  assert.notDeepEqual(clearRail.node.position,underRail.position);assert.ok(clearRail.node.position.x>=85);
  assert.equal(clearRail.outsideVisible,false);assert.equal(fallbackCalls,0);assert.equal(moves,0);
  cases.push('default Text prefers an existing visible clear slot instead of placing under the live original rail; no camera or original factory size changes');

  reset();pane=rect(0,0,600,450);panels=[rect(0,0,190,450),rect(410,0,190,450)];raw=[{id:'old',type:'text',position:{x:1000,y:0},width:300,height:250}];
  action();assert.ok(pending);assert.equal(toast.length,1);assert.equal(toast[0].title,'新文本在当前视口外，可点定位查看。');assert.equal(toast[0].action.label,'定位');assert.equal(moves,0);
  assert.equal(realToast.state.getActiveToasts().at(-1).action,toast[0].action,'the actual original Sonner observer receives the action, not only a synthetic recorder');
  const lost=toast[0].action.onClick();globalThis.__LCOS_NODE_LAB__={...globalThis.__LCOS_NODE_LAB__,canvasId:'other'};publish();await lost;
  await new Promise(r=>setTimeout(r,0));assert.equal(moves,0);assert.ok(toast.some(t=>t.type==='error'),'scene change is reported honestly by the existing toast');
  assert.equal(listeners.size,0);cases.push('original toast exposes an explicit locate action; changing scene before publish refuses late camera work');

  reset();api.findMaterialPlacement=()=>undefined;globalThis.document.querySelector=()=>null;action();
  assert.equal(pending,undefined);assert.ok(toast.some(t=>t.type==='error'));assert.equal(moves,0);cases.push('unavailable placement refuses native Ke instead of silently creating an overlapping card');
  api.findMaterialPlacement=size=>{fallbackCalls++;return find(size)};
  const explicit=originalFactory({text:'explicit'}, {position:{x:-117.2,y:26.08}});assert.deepEqual(explicit.position,{x:-117.2,y:26.08});
  cases.push('explicit position factory remains unchanged and never invokes default placement');
}finally{unsubscribeToast();globalThis.document=previous.document;globalThis.__LCOS_NODE_LAB__=previous.host}
const report={passed:true,scope:'source-executed original fH.Ze/Ke/XD + original export-placement and actual bridge/client helper; synthetic DOM/native publish, no Core/server/browser',
  originalSize,explicitCallersByteUnchanged:true,cases,rootRuntimeStarted:false,coreWrites:0,cameraOnlyAfterExplicitLocate:true};
await mkdir(path.join(root,'output/原流程收口_20261017d'),{recursive:true});await writeFile(path.join(root,'output/原流程收口_20261017d/原加号创建落点目标测试.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
