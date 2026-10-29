import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { buildPilotEntry, installedRoot } from '../lab/pilot/build-pilot.mjs';
import { parseOriginalDonorScript as parse } from '../lab/agent-node-transform.mjs';
import { transformNativeColorPinPageScript } from '../lab/native-colorpin-page-transform.mjs';

const root=path.resolve(import.meta.dirname,'..'),out=path.join(root,'output/普通颜色组独立命名_20261028',new Date().toISOString().replace(/[:.]/g,'-'));
await fs.mkdir(out,{recursive:true});const temp=await fs.mkdtemp(path.join(root,'.runtime/native-pin-name-'));
const report={passed:false,scope:'Actual production controller and original transformed m7/y7 callbacks under controlled React hooks/client ports. No live Core/browser, fake membership, provider or model.',cases:[]};
const pass=(name,evidence={})=>report.cases.push({name,passed:true,evidence}),tick=()=>new Promise(resolve=>setImmediate(resolve));
const key='F0606B',color='#'+key;
try{
  await buildPilotEntry('lab/pilot/native-colorpin-controller.ts',path.join(temp,'controller.mjs'));
  const {createNativeColorPinController:create}=await import(pathToFileURL(path.join(temp,'controller.mjs')));
  const definition=(label='珊瑚')=>({id:'definition-created',projectId:'p',color,label,createdAt:'2026-10-28T00:00:00.000Z',updatedAt:'2026-10-28T00:00:00.000Z'});
  function fixture(){
    let scene={projectId:'p',canvasId:'c',workspaceId:'w',api:{},nodes:[{id:'raw',type:'text',data:{id:'raw',lcos_gui_navigation_pin:false,color_pins:[key],text:'原文'},position:{x:5,y:6}}]};
    const snapshot={definitions:[],memberships:[]},calls=[];let mode='normal',failRead=false;
    const ports={scene:()=>scene,facts:async()=>{if(failRead)throw Error('read failed');return structuredClone({snapshot,graph:{project:{id:'p'}},bindings:[]});},
      client:{assign:async()=>{throw Error('No membership permitted');},removeMembership:async()=>{throw Error('No membership permitted');},
        createDefinition:async(project,input)=>{calls.push(['create',project,structuredClone(input)]);snapshot.definitions.push(definition(input.label));
          if(mode==='conflict'){snapshot.definitions[0].label='其他人先命名';throw Object.assign(Error('STALE_COLOR_PIN_DEFINITION_ABSENCE'),{status:409});}
          if(mode==='lost'){throw Error('ACK lost');}
          const receipt={definition:structuredClone(snapshot.definitions[0]),changeSetId:'cs-name-only'};
          if(mode==='superseded')snapshot.definitions[0].label='后来名称';
          if(mode==='badack')receipt.definition.projectId='foreign';
          if(mode==='readfail')failRead=true;
          return receipt;},
        renameDefinition:async(project,id,input)=>{calls.push(['rename',project,id,structuredClone(input)]);snapshot.definitions[0].label=input.label;snapshot.definitions[0].updatedAt='2026-10-28T00:00:01.000Z';return{definition:structuredClone(snapshot.definitions[0])};}}};
    return{ports,calls,snapshot,mode:x=>mode=x,failRead:x=>failRead=x,swap:()=>{scene={...scene,api:{}};},removeRaw:()=>{scene={...scene,nodes:[]};}};
  }
  let f=fixture(),controller=create(f.ports);await controller.refresh();const beforeNode=structuredClone(f.ports.scene().nodes);
  assert.equal((await controller.createDefinition({color,label:' 珊瑚 ',expectedDefinitionId:null})).status,'confirmed');
  assert.deepEqual(f.calls,[['create','p',{color,label:'珊瑚',expectedDefinitionId:null}]]);assert.equal(f.snapshot.definitions.length,1);assert.deepEqual(f.snapshot.memberships,[]);assert.deepEqual(f.ports.scene().nodes,beforeNode);
  pass('raw-only group creates only a real color definition/label with observed absence; 0 member/entity/body/geometry writes');
  assert.equal((await controller.renameDefinition({definitionId:'definition-created',label:'二次名称',expectedUpdatedAt:f.snapshot.definitions[0].updatedAt,expectedLabel:'珊瑚'})).status,'confirmed');
  assert.equal(f.calls[1][0],'rename');assert.equal(f.snapshot.definitions[0].id,'definition-created');assert.equal(f.snapshot.memberships.length,0);
  pass('once a definition exists, later edit uses the original exact-id label/timestamp CAS without replacing its identity');
  f=fixture();f.snapshot.definitions.push(definition('别人先建'));controller=create(f.ports);await controller.refresh();assert.equal((await controller.createDefinition({color,label:'我的新名',expectedDefinitionId:null})).status,'rejected');assert.equal(f.calls.length,0);assert.equal(controller.read().facts.snapshot.definitions[0].label,'别人先建');
  f=fixture();controller=create(f.ports);await controller.refresh();f.mode('conflict');assert.equal((await controller.createDefinition({color,label:'我的新名',expectedDefinitionId:null})).status,'rejected');assert.equal(controller.read().needsCheck,false);assert.equal(controller.read().facts.snapshot.definitions[0].label,'其他人先命名');assert.equal(f.calls.length,1);
  pass('same-color definition discovered before submit or concurrent creation 409 never overwrites it, adopts its real latest name and does not hold/replay');
  f=fixture();controller=create(f.ports);await controller.refresh();f.mode('superseded');assert.equal((await controller.createDefinition({color,label:'我的新名',expectedDefinitionId:null})).status,'rejected');assert.equal(controller.read().needsCheck,false);assert.match(controller.read().message,/刚有变化/);
  f=fixture();controller=create(f.ports);await controller.refresh();f.mode('readfail');assert.equal((await controller.createDefinition({color,label:'我的新名',expectedDefinitionId:null})).status,'unknown');f.failRead(false);f.snapshot.definitions[0].label='之后被改';assert.equal((await controller.verifyPending()).status,'confirmed');assert.equal(controller.read().needsCheck,false);assert.match(controller.read().message,/刚有变化/);assert.equal(f.calls.length,1);
  pass('valid new-definition ACK preserves exact created id; supersession/read failure then changed readback resolves without replay');
  for(const mode of ['lost','badack']){f=fixture();controller=create(f.ports);await controller.refresh();f.mode(mode);assert.equal((await controller.createDefinition({color,label:'我的新名',expectedDefinitionId:null})).status,'unknown');assert.equal((await controller.verifyPending()).status,'unknown');assert.equal(controller.read().needsCheck,true);assert.equal(f.calls.length,1);assert.deepEqual(f.snapshot.memberships,[]);}
  pass('lost/wrong-project create ACK has no trusted new id and stays unknown even if a similar label exists; check is GET-only, no fake membership or retry');
  f=fixture();controller=create(f.ports);await controller.refresh();f.removeRaw();assert.equal((await controller.createDefinition({color,label:'已无组',expectedDefinitionId:null})).status,'rejected');assert.equal(f.calls.length,0);
  pass('raw group no longer visible in the exact scene cannot submit a delayed first name');

  const esbuild=createRequire(path.join(installedRoot,'package.json'))('esbuild');
  let model,frame;const frames=()=>({slots:[],cursor:0,sets:[],cleanups:[]});
  const hooks={memo:x=>x,useMemo:fn=>{frame.cursor++;return fn();},useCallback:fn=>{frame.cursor++;return fn;},
    useRef:value=>{const i=frame.cursor++;return frame.slots[i]??=( {current:value});},
    useState:value=>{const owner=frame,i=owner.cursor++;if(!(i in owner.slots))owner.slots[i]=typeof value==='function'?value():value;return[owner.slots[i],value=>{owner.sets.push([i,value]);owner.slots[i]=typeof value==='function'?value(owner.slots[i]):value;}];},
    useId:()=>{frame.cursor++;return'original-rename-action';},useEffect:fn=>{frame.cursor++;frame.cleanups.push(fn);},useLayoutEffect:()=>{frame.cursor++;}};
  const run=(owner,fn)=>{frame=owner;owner.cursor=0;return fn();},jsx=(type,props)=>({type,props});
  const elements=tree=>!tree||typeof tree!=='object'?[]:Array.isArray(tree)?tree.flatMap(elements):[tree,...elements(tree.props?.children)];
  const api={},rawGroup={groupId:key,color,group:{id:key,hex:color},nodeIds:['raw'],count:1,membershipIds:[],rawNodeIds:['raw'],sharedMembershipCount:0,surfaceMembershipCount:0};
  const uiCalls=[];let nameOutcome={status:'rejected'},deferred;
  const resetModel=()=>{model={projectId:'p',canvasId:'c',api,enabled:true,status:'ready',busy:false,needsCheck:false,message:'',groups:[rawGroup],
    isCurrent:()=>true,createDefinition:async input=>{uiCalls.push(['create',structuredClone(input)]);return deferred?await deferred:nameOutcome;},
    renameDefinition:async input=>{uiCalls.push(['rename',structuredClone(input)]);return deferred?await deferred:nameOutcome;},verifyPending:async()=>({status:'confirmed'}),refresh:async()=>{}};};
  resetModel();globalThis.window={__LCOS_NODE_LAB__:{projectId:'p',currentCanvasId:'c',api}};
  const compiled=esbuild.transformSync(await fs.readFile(path.join(root,'lab/pilot/native-colorpin-menu.tsx'),'utf8'),{loader:'tsx',format:'cjs',jsxFactory:'React.createElement'}).code,module={exports:{}};
  new Function('require','module','exports',compiled)(specifier=>{
    if(specifier==='react')return{...hooks,createElement:jsx};if(specifier==='./native-colorpin-port')return{useNativeColorPins:()=>model};
    if(specifier.endsWith('lcosCoreClient'))return{createLcosCoreSession:()=>({})};
    if(specifier==='./native-colorpin-download')return{};if(specifier==='./native-colorpin-model')return{};
    throw Error('Unexpected dependency '+specifier);
  },module,module.exports);
  const adapters=module.exports,filename='page-Da_DfwiK.js',original=await fs.readFile(path.join(root,'reference/tapnow-installed/resources/web/assets',filename),'utf8'),source=transformNativeColorPinPageScript(filename,original);
  const owners=new Map(parse(source,filename).body.flatMap(n=>n.type==='FunctionDeclaration'?[[n.id.name,n]]:n.type==='VariableDeclaration'?n.declarations.map(n=>[n.id?.name,n]):[]));
  const common={l:hooks,r:{jsx,jsxs:jsx},he:()=>({t:key=>key}),...Object.fromEntries(['Ir','Pt','Tr','kr','zl','ja','md','Jr','iT','g7','pt','ka','oT'].map(name=>[name,name])),
    LCOSUseNativeColorPinMenuActions:()=>adapters.useNativeColorPinMenuActions(),LCOSColorPinClearDescription:()=>'',LCOSColorPinMenuStatus:'NativeStatus',
    p7:()=>({locateNode(){},nodeDisplays:[],notice:''}),Dj:()=>({triggerContainerRef:{},closeTooltip(){},handleTooltipOpenChange(){},markPointerInteraction(){},markKeyboardInteraction(){},handleCloseAutoFocus(){}}),Ah:{confirm(){}},jw:500};
  const evaluate=(name,env)=>new Function(...Object.keys(env),'return ('+source.slice(owners.get(name).start,owners.get(name).end).replace(new RegExp('^'+name+'='),'')+');')(...Object.values(env));
  let forwarded;
  const groupButton=evaluate('y7',{...common,ie:(...classes)=>classes.filter(Boolean).join(' '),m7:'OriginalM7'}),observedProof={projectId:'p',canvasId:'c',api,groupId:key,color,definitionId:null,expectedLabel:null};
  const buttonTree=groupButton({group:rawGroup,onRename:(...args)=>{forwarded=args;}});buttonTree.props.onRenameName('候选名',observedProof);
  assert.equal(forwarded[0],key);assert.equal(forwarded[1],'候选名');assert.equal(forwarded[2],observedProof);
  pass('actual original y7 forwards the edit-start observation through its existing inline callback, without discarding the new optional argument');
  const menu=evaluate('m7',common);let parent=frames(),child=frames(),tree,names;
  const render=()=>{names=run(parent,()=>adapters.useNativeColorPinNames('c'));tree=run(child,()=>menu({group:model.groups[0],open:true,displayName:'红色',defaultName:'红色',customName:model.groups[0].label,
    onOpenChange(){},onDownload(){},onRemoveAllNodes(){},onRenameName:(label,observed)=>names.renameGroup(key,label,observed)}));return tree;};
  const begin=()=>{const row=elements(render()).find(x=>x.type==='pt'&&x.props.id==='original-rename-action');assert.equal(!!row.props.disabled,false);row.props.onSelect({preventDefault(){}});render();};
  const input=()=>elements(tree).find(x=>x.type==='input'),save=()=>elements(tree).find(x=>x.type==='button'&&typeof x.props.onClick==='function');
  begin();assert.ok(input());assert.equal(input().props['aria-label'],'颜色组名称（本项目）');assert.equal(elements(tree).filter(x=>x.type==='span'&&x.props.children==='项目共享').length,1);
  input().props.onChange({target:{value:'我的第一名'}});model={...model,groups:[{...rawGroup,definitionId:'concurrent-id',label:'别人先命名',updatedAt:'new'}]};render();save().props.onClick();await tick();
  assert.deepEqual(uiCalls[0],['create',{color,label:'我的第一名',expectedDefinitionId:null}]);render();assert.equal(input().props.value,'我的第一名');
  pass('actual original m7 opens the same raw inline input with shared-scope copy; a later render with a definition cannot replace the captured absence or close a rejected draft');
  parent=frames();child=frames();uiCalls.length=0;resetModel();model.groups=[{...rawGroup,definitionId:'known',updatedAt:'old',label:'旧名'}];begin();input().props.onChange({target:{value:'我的编辑'}});model={...model,groups:[{...model.groups[0],label:'别人新名',updatedAt:'new'}]};render();save().props.onClick();await tick();
  assert.deepEqual(uiCalls[0],['rename',{definitionId:'known',label:'我的编辑',expectedUpdatedAt:'old',expectedLabel:'旧名'}]);
  pass('actual inline editor captures original known-label CAS at edit start; a fresh render never silently grants overwrite of a newer name');
  parent=frames();child=frames();uiCalls.length=0;resetModel();let release;deferred=new Promise(resolve=>release=resolve);begin();input().props.onChange({target:{value:'第一次'}});render();save().props.onClick();await tick();assert.equal(uiCalls.length,1);
  input().props.onKeyDown({key:'Escape',stopPropagation(){},preventDefault(){}});render();begin();input().props.onChange({target:{value:'后来输入'}});render();release({status:'confirmed'});await tick();render();assert.equal(input().props.value,'后来输入');deferred=undefined;
  pass('original cancel/reopen invalidates the exact old rename callback; late success cannot close the new inline input or change its draft');
  parent=frames();child=frames();uiCalls.length=0;resetModel();nameOutcome={status:'confirmed'};begin();input().props.onChange({target:{value:'保存名'}});render();save().props.onClick();await tick();render();assert.equal(input(),undefined);assert.equal(uiCalls.length,1);
  pass('confirmed same-owner create closes the original inline input through its existing focus/state path');
  parent=frames();child=frames();uiCalls.length=0;resetModel();begin();input().props.onChange({target:{value:'旧场景'}});render();window.__LCOS_NODE_LAB__.api={};save().props.onClick();await tick();assert.equal(uiCalls.length,0);window.__LCOS_NODE_LAB__.api=api;
  pass('old scene/API inline callback refuses mutation before any create or rename request');
  await buildPilotEntry('lab/pilot/native-colorpin-port.tsx',path.join(temp,'port.js'),'browser',{nativeReact:true});
  report.passed=true;
}catch(error){report.error=String(error.stack??error);throw error;}finally{delete globalThis.window;await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await fs.rm(temp,{recursive:true,force:true});}
console.log(JSON.stringify({passed:report.passed,cases:report.cases.length,report:path.join(out,'report.json')}));
