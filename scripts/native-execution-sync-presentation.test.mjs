import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { currentGen2Root } from '../lab/current-gen2-resources.mjs';

const root = path.resolve(import.meta.dirname, '..'), dependency = createRequire(path.join(currentGen2Root, 'package.json'));
const source = await fs.readFile(path.join(root,'lab/pilot/native-execution-sync.tsx'),'utf8');
const transformed = await dependency('esbuild').transform(source, { loader:'tsx', format:'cjs', jsx:'transform', jsxFactory:'__jsx', jsxFragment:'__fragment' });
let currentState, retries=0;
const shell={projectId:'p',activeSurface:'main',activeWorkspaceId:'w',surfaceCanvasId:{main:'c'}};
const canvas={status:'ready',canvasId:'c',rfInstance:{}};
const shellHook=selector=>selector(shell), canvasHook=selector=>selector(canvas);
shellHook.getState=()=>shell;canvasHook.getState=()=>canvas;
const module={exports:{}};
const context=vm.createContext({module,exports:module.exports,console,__fragment:Symbol('Fragment'),
  __jsx:(type,props,...children)=>({type,props:{...props,children}}),
  require:specifier=>{
    if(specifier==='react')return{useEffect:()=>{},useMemo:factory=>factory(),useRef:()=>({current:{retry:()=>{retries++;}}}),useState:()=>[currentState,()=>{throw Error('No controller lifecycle in source presentation tree test');}]};
    if(specifier.endsWith('native-library-drop-feedback'))return{useNativeDropNotice:()=>null};
    if(specifier.endsWith('native-execution-sync-feedback'))return{createNativeExecutionSyncFeedbackController:()=>{throw Error('No controller lifecycle in presentation test');}};
    if(specifier.endsWith('lifecycleReconciler.ts'))return{HostLifecycleReconciler:class{constructor(){throw Error('No lifecycle start in presentation test');}}};
    if(specifier.endsWith('collaborationSessionStore.ts'))return{useCollaborationSessionStore:{getState:()=>{throw Error('No store write/read owner in presentation test');}}};
    if(specifier.endsWith('lcosShellStore.ts'))return{useLcosShellStore:shellHook};
    if(specifier.endsWith('native-canvas-port.ts'))return{__esModule:true,default:canvasHook};
    throw Error('Unexpected source dependency: '+specifier);
  }});
new vm.Script(transformed.code,{filename:'actual-native-execution-sync-source.cjs'}).runInContext(context);
const {NativeExecutionSync,nativeExecutionSyncPresentation}=module.exports;
const all=(node,predicate,result=[])=>{
  if(Array.isArray(node)){for(const child of node)all(child,predicate,result);return result;}
  if(!node||typeof node!=='object')return result;
  if(predicate(node))result.push(node);all(node.props?.children,predicate,result);return result;
};
const text=node=>Array.isArray(node)?node.map(text).join(''):node&&typeof node==='object'?text(node.props?.children):node===null||node===undefined||typeof node==='boolean'?'':String(node);
const report={passed:false,scope:'Actual TSX transformed to executable JSX tree with hook/store doubles; controller effects deliberately not run. Complements real controller tests; no running browser/Core/model.',cases:[]};
const raw='Failed to fetch — Core/API/Execution Projection/TapNow RawException';
for(const status of ['ready','syncing','blocked','unavailable']){
  currentState=Object.freeze({status,message:raw});
  const presentation=nativeExecutionSyncPresentation(currentState),tree=NativeExecutionSync({projectId:'p',canvasId:'c',workspaceId:'w',enabled:true});
  const hidden=all(tree,node=>node.props?.['data-lcos-native-execution-sync-state']===status);
  assert.equal(hidden.length,1);assert.equal(hidden[0].props.hidden,true);assert.equal(hidden[0].props.role,'status');assert.equal(hidden[0].props['aria-live'],'polite');assert.equal(text(hidden[0]),presentation.message);
  const visible=all(tree,node=>node.props?.['data-lcos-native-execution-sync-feedback']===status),buttons=all(tree,node=>node.props?.['data-lcos-native-execution-sync-retry']!==undefined);
  assert.equal(visible.length,['blocked','unavailable'].includes(status)?1:0);
  assert.equal(buttons.length,status==='blocked'?1:0);
  if(visible.length)assert.ok(text(visible[0]).includes(presentation.message));
  if(buttons.length){assert.equal(text(buttons[0]),'重试更新');assert.equal(buttons[0].props['aria-label'],'重试更新');const before=retries;buttons[0].props.onClick();assert.equal(retries,before+1,'original callback invokes its existing controller retry once');}
  assert.doesNotMatch(text(tree),/Failed to fetch|Core|API|Projection|TapNow|RawException|执行投影/i);
  assert.equal(currentState.message,raw,'presentation never erases or replaces controller diagnostic');
  report.cases.push({status,message:presentation.message,visible:visible.length===1,retry:buttons.length===1,hiddenLiveSafe:true,diagnosticRetained:true});
}
currentState=Object.freeze({status:'blocked',message:raw});
const disabledTree=NativeExecutionSync({projectId:'p',canvasId:'c',workspaceId:'w',enabled:false});
assert.equal(all(disabledTree,node=>node.props?.role==='alert').length,0);
assert.equal(all(disabledTree,node=>node.props?.['data-lcos-native-execution-sync-retry']!==undefined).length,0);
assert.doesNotMatch(text(disabledTree),/Failed to fetch|Core|API|Projection|TapNow|RawException|执行投影/i);
report.passed=true;console.log(JSON.stringify(report,null,2));
