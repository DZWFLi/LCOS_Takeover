import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';
import { parseOriginalDonorScript as parse, transformAgentNodeScript } from '../lab/agent-node-transform.mjs';
import { transformNativeMemberNodeScript } from '../lab/native-member-node-transform.mjs';
import { transformNativeNavigationCourseScript } from '../lab/native-navigation-course-transform.mjs';
import { transformNativeColorPinCourseScript } from '../lab/native-colorpin-course-transform.mjs';
import { transformNativeNodeGuiToolbarScript } from '../lab/native-node-gui-toolbar-transform.mjs';
import { transformRendererScript } from '../lab/startup-transform.mjs';
import { transformCutScript } from '../lab/cut-transform.mjs';
import { transformNodeBridgeScript } from '../lab/node-transform.mjs';
import { transformSurfaceDockScript } from '../lab/surface-dock-transform.mjs';
import { transformHistoryIntentScript } from '../lab/history-intent-transform.mjs';

const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'output/非材料节点颜色原入口_20261027',new Date().toISOString().replace(/[:.]/g,'-'));
await fs.mkdir(out,{recursive:true});const temp=await fs.mkdtemp(path.join(root,'.runtime/native-colorpin-nonmaterial-'));
const report={passed:false,scope:'Production controller and group projection with controlled original ports; actual donor Dg/Vde/ua wrapper and registry AST. No live Core, browser, model, or material creation.',cases:[]};
const pass=(name,evidence={})=>report.cases.push({name,passed:true,evidence});
const walk=(n,visit)=>{if(!n?.type)return;visit(n);for(const v of Object.values(n))if(Array.isArray(v))v.forEach(x=>walk(x,visit));else if(v?.type)walk(v,visit);};
const owner=(s,f,name)=>{const rows=[];walk(parse(s,f),n=>{if(['VariableDeclarator','FunctionDeclaration'].includes(n.type)&&n.id?.name===name)rows.push(n);});assert.equal(rows.length,1,name);return rows[0];};
const evaluate=(s,f,name,env)=>{const n=owner(s,f,name);return new Function(...Object.keys(env),'return ('+s.slice(n.start,n.end).replace(new RegExp('^'+name+'='),'')+');')(...Object.values(env));};
try{
  await buildPilotEntry('lab/pilot/native-colorpin-controller.ts',path.join(temp,'controller.mjs'));
  await buildPilotEntry('lab/pilot/native-colorpin-groups.ts',path.join(temp,'groups.mjs'));
  const {createNativeColorPinController:create}=await import(pathToFileURL(path.join(temp,'controller.mjs')));
  const {mergeNativeColorPinGroups:merge,nativeOrdinaryPinColors:colors}=await import(pathToFileURL(path.join(temp,'groups.mjs')));
  const definition={id:'d',projectId:'p',color:'#F0606B',label:'珊瑚红',createdAt:'1',updatedAt:'2'};
  const core={groupId:'F0606B',color:'#F0606B',definitionId:'d',updatedAt:'2',label:'珊瑚红',group:{id:'F0606B',hex:'#F0606B'},nodeIds:['typed'],count:1,membershipIds:['m'],sharedMembershipCount:1,surfaceMembershipCount:0};
  const groups=merge([core],[{id:'typed',data:{lcos_conversation_ref:{},color_pins:['F0606B']}},{id:'raw',data:{id:'raw',lcos_gui_navigation_pin:false,color_pins:['f0606b','123abc']}},{id:'bad',data:{lcos_ref:null,color_pins:['F0606B']}}],[definition],[]);
  assert.equal(groups.length,2);assert.deepEqual(groups[0].nodeIds,['typed','raw']);assert.deepEqual(groups[0].rawNodeIds,['raw']);assert.deepEqual(groups[0].membershipIds,['m']);
  assert.equal(groups[1].groupId,'123ABC');assert.equal(groups[1].definitionId,undefined);assert.deepEqual(colors(['123abc','123ABC','not-a-color',null]),['123ABC']);
  const rawShared=merge([],[{id:'raw',data:{id:'raw',lcos_gui_navigation_pin:false,color_pins:['F0606B']}}],[definition],[])[0];assert.equal(rawShared.definitionId,'d');assert.equal(rawShared.label,'珊瑚红');
  assert.deepEqual(merge([],[{id:'raw',data:{id:'raw',color_pins:['F0606B']}}],[],[]),[],'DTO-normalized identity without original bool qualification is not a raw color group');
  pass('one original group per color combines raw occurrences and canonical memberships; reserved damaged refs never become raw; a real shared definition may label raw without creating memberships');
  function fixture(){
    let node={id:'raw',type:'text',data:{id:'raw',text:'原正文',lcos_gui_navigation_pin:false,color_pins:[]},position:{x:10,y:20}},scene={projectId:'p',canvasId:'c',workspaceId:'w',api:{},nodes:[node]},saved=[];
    const snapshot={definitions:[],memberships:[]},calls=[];let mode='normal',failRead=false;
    const setLocal=value=>{node={...node,data:{...node.data,color_pins:[...value]}};scene={...scene,nodes:[node]};};
    const ports={scene:()=>scene,facts:async()=>({snapshot,graph:{project:{id:'p'}},bindings:[]}),client:{assign:async()=>{throw Error('No fake Core target');},removeMembership:async()=>{throw Error('No fake Core target');},renameDefinition:async()=>{throw Error('No fake definition');}},
      ordinary:{read:async()=>{calls.push('GET');if(failRead)throw Error('read unavailable');return [...saved];},set:async(s,id,color,present)=>{calls.push(['POST',s.canvasId,id,color,present]);saved=present?[...saved,color]:saved.filter(x=>x!==color);setLocal(saved);
        if(mode==='lost'){saved=[];setLocal(saved);throw Error('ACK lost');}
        if(mode==='superseded'){saved=[];setLocal(saved);}
        if(mode==='readfail')failRead=true;
        if(mode.startsWith('unknown-'))failRead=true;
        return {status:mode.startsWith('unknown-')?'unknown':'confirmed',changed:true,nativeNode:{canvasId:'c',nodeId:mode==='badack'?'foreign':id},
          ...(mode==='unknown-no-receipt'?{}:{spatialReceipt:{canvasId:'c',fromVersion:1,toVersion:2,spatialSaved:mode!=='unknown-bad-receipt',changedNodeIds:[id]}})};}}};
    return{ports,calls,get node(){return node;},mode:x=>mode=x,failRead:x=>failRead=x,external:value=>{saved=[...value];setLocal(saved);},swap:()=>{scene={...scene,api:{}};}};
  }
  let f=fixture(),c=create(f.ports);await c.refresh();assert.equal((await c.toggleNode('raw','F0606B')).status,'confirmed');assert.deepEqual(f.node.data.color_pins,['F0606B']);assert.equal(f.node.data.text,'原正文');assert.deepEqual(f.node.position,{x:10,y:20});
  f.external([]);await c.refresh();assert.equal(c.read().message,'');assert.equal((await c.toggleNode('raw','123ABC')).status,'confirmed');assert.equal((await c.toggleNode('raw','123ABC')).status,'confirmed');assert.deepEqual(f.node.data.color_pins,[]);
  pass('ordinary palette uses explicit narrow GUI desired state, preserves body and geometry, supports arbitrary read colors, external raw removal clears only old known success');
  f=fixture();c=create(f.ports);await c.refresh();f.mode('superseded');assert.equal((await c.toggleNode('raw','F0606B')).status,'rejected');assert.equal(c.read().needsCheck,false);assert.match(c.read().message,/刚有变化/);assert.equal(f.calls.filter(x=>Array.isArray(x)).length,1);
  pass('valid spatial ACK superseded by Agent is a known changed result, never a permanent pending or replay');
  f=fixture();c=create(f.ports);await c.refresh();f.mode('lost');assert.equal((await c.toggleNode('raw','F0606B')).status,'unknown');assert.equal((await c.verifyPending()).status,'unknown');assert.equal(c.read().needsCheck,true);assert.equal(f.calls.filter(x=>Array.isArray(x)).length,1);const unknownMessage=c.read().message;await c.refresh();assert.equal(c.read().message,unknownMessage);
  pass('no ACK and absent desired color remain unknown; quiet refresh and explicit verify only read and retain the real safety hold');
  f=fixture();c=create(f.ports);await c.refresh();f.mode('readfail');assert.equal((await c.toggleNode('raw','F0606B')).status,'unknown');f.failRead(false);f.external([]);assert.equal((await c.verifyPending()).status,'confirmed');assert.equal(c.read().needsCheck,false);assert.match(c.read().message,/刚有变化/);
  pass('valid ACK survives failed readback, then exact GET verification resolves supersession with no second write');
  f=fixture();c=create(f.ports);await c.refresh();f.mode('badack');assert.equal((await c.toggleNode('raw','F0606B')).status,'unknown');f.external([]);assert.equal((await c.verifyPending()).status,'unknown');assert.equal(c.read().needsCheck,true);
  pass('foreign node address cannot authorize a raw ACK, even when another mutation temporarily produced the requested color');
  f=fixture();delete f.node.data.lcos_gui_navigation_pin;c=create(f.ports);await c.refresh();assert.equal((await c.toggleNode('raw','F0606B')).status,'rejected');assert.equal(f.calls.filter(x=>Array.isArray(x)).length,0);
  pass('a normalized id without the original DTO boolean qualification cannot expose a raw operation or dispatch a GUI write');
  f=fixture();c=create(f.ports);await c.refresh();f.mode('unknown-valid-receipt');assert.equal((await c.toggleNode('raw','F0606B')).status,'unknown');assert.equal(c.read().needsCheck,true);
  f.failRead(false);f.external([]);assert.equal((await c.verifyPending()).status,'confirmed');assert.equal(c.read().needsCheck,false);assert.match(c.read().message,/刚有变化/);assert.equal(f.calls.filter(x=>Array.isArray(x)).length,1);
  pass('raw route unknown with exact valid spatialSaved ACK retains acceptance through failed readback; later Agent reversal verifies as changed, not permanent pending');
  for(const mode of ['unknown-no-receipt','unknown-bad-receipt']){
    f=fixture();c=create(f.ports);await c.refresh();f.mode(mode);assert.equal((await c.toggleNode('raw','F0606B')).status,'unknown');f.failRead(false);f.external([]);
    assert.equal((await c.verifyPending()).status,'unknown');assert.equal(c.read().needsCheck,true);assert.equal(f.calls.filter(x=>Array.isArray(x)).length,1);
  }
  pass('raw route unknown without a receipt or with invalid spatialSaved proof remains unknown and never replays');
  const filename='course-api-base-url-CifxI1ia.js',original=await fs.readFile(path.join(root,'reference/tapnow-installed/resources/web/assets',filename),'utf8');
  let source=transformNativeColorPinCourseScript(filename,original);source=transformNativeNavigationCourseScript(filename,source);source=transformNativeNodeGuiToolbarScript(filename,source);assert.equal(transformNativeNodeGuiToolbarScript(filename,source),source);
  const jsx=(type,props)=>({type,props}),hooks={memo:x=>x,useMemo:fn=>fn(),useCallback:fn=>fn,useRef:x=>({current:x}),Fragment:'OriginalFragment'};
  let readonly=false,state={enabled:true,controlled:true,managed:true,authoringPins:['F0606B']};
  const dg=evaluate(source,filename,'Dg',{d:hooks,a:{jsx},MF:()=>false,Wie:()=>({pinnable:false}),n5:()=>({pins:[]}),Yie:()=>({togglePinOnNode(){}}),Hie:'OriginalHie',LCOSUseNativeColorPinNode:()=>state,ii:()=>({id:'typed'}),wL:()=>readonly});
  assert.equal(dg('typed').node.type,'OriginalHie');readonly=true;assert.equal(dg('typed'),null);readonly=false;state={...state,enabled:false};assert.equal(dg('typed'),null);
  pass('actual original Dg exposes the same Hie for a valid custom typed carrier, while original readonly and failed identity still hide the capability');
  const withGui=evaluate(source,filename,'LCOSWithNativeNodeGui',{d:hooks,a:{jsx,jsxs:jsx},fp:()=>.5,ua:'OriginalUa',JT:'OriginalJT'});
  const tree=withGui('ExistingBody')({id:'typed',selected:true,dragging:false,data:{title:'原对象'}});assert.equal(tree.props.children.length,2);assert.equal(tree.props.children[0].type,'ExistingBody');assert.equal(tree.props.children[1].type,'OriginalUa');assert.equal(tree.props.children[1].props.children.type,'OriginalJT');assert.equal(tree.props.children[1].props.children.props.style.top,'-60px');
  const page='page-Da_DfwiK.js',pageOriginal=await fs.readFile(path.join(root,'reference/tapnow-installed/resources/web/assets',page),'utf8');
  const served=transformHistoryIntentScript(page,transformSurfaceDockScript(page,transformNodeBridgeScript(page,
    transformCutScript(page,transformRendererScript(page,pageOriginal))).replace('VITE_FILE_ACCESS_URL:""','VITE_FILE_ACCESS_URL:window.location.origin')));
  let changed=transformAgentNodeScript(page,served);changed=transformNativeMemberNodeScript(page,changed);changed=transformNativeNodeGuiToolbarScript(page,changed);assert.equal(transformNativeNodeGuiToolbarScript(page,changed),changed);
  const registry=[];walk(parse(changed,page),n=>{if(n.type==='ObjectProperty'&&n.key?.name==='nodeTypes')registry.push(n.value);});assert.equal(registry.length,1);
  assert.equal(registry[0].properties.filter(p=>p.value?.name?.startsWith('LCOSOriginalGuiRenderer')).length,5);
  assert.equal((changed.match(/createPortal\(/g)??[]).length,(pageOriginal.match(/createPortal\(/g)??[]).length);
  pass('five custom renderers keep original body and receive one original ua/JT toolbar at module scope; no new window or portal, original visibility and drag policy retained');
  await buildPilotEntry('lab/pilot/native-colorpin-port.tsx',path.join(temp,'port.js'),'browser',{nativeReact:true});
  report.passed=true;
}catch(error){report.error=String(error.stack??error);throw error;}finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await fs.rm(temp,{recursive:true,force:true});}
console.log(JSON.stringify({passed:report.passed,cases:report.cases.length,report:path.join(out,'report.json')}));
