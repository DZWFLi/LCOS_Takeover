import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {installedRoot} from '../lab/pilot/build-pilot.mjs';
const ts=createRequire(path.join(installedRoot,'package.json'))('typescript');
const source=await fs.readFile('lab/pilot/native-navigation-ui.tsx','utf8'),file=ts.createSourceFile('actual-nav.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
assert.equal(file.parseDiagnostics.length,0);
const signature=file.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='nativeNavigationGuiSignature');assert.ok(signature);
const signatureJs=ts.transpileModule(signature.getText(file).replace(/^export /,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
const sign=new Function(signatureJs+';return nativeNavigationGuiSignature;')();
let effect;const visit=node=>{if(ts.isCallExpression(node)&&node.expression.getText(file)==='useEffect'&&node.arguments[0]?.getText(file).includes('watchProjectChanges')){assert.equal(effect,undefined);effect=node.arguments[0];}ts.forEachChild(node,visit);};visit(file);assert.ok(effect);
const effectJs=ts.transpileModule('const setup='+effect.getText(file)+';', {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
const bridgeSource=await fs.readFile('lab/pilot/native-canvas-port.ts','utf8'),bridge=ts.createSourceFile('actual-bridge.ts',bridgeSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const refresh=bridge.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='refreshSnapshot');assert.ok(refresh);
const notifications=refresh.body.statements.filter(node=>ts.isIfStatement(node)&&node.getText(bridge).includes('for (const listener of listeners)'));
assert.equal(notifications.length,1);const dispatchJs=ts.transpileModule(notifications[0].getText(bridge),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
const dispatchBridge=new Function('listeners','notify','previous',dispatchJs);
assert.throws(()=>dispatchBridge(new Set([next=>next.nodes]),true,{}),TypeError,'The actual bridge dispatcher reproduces the rejected Zustand-style callback convention');
const listeners=new Set(),calls=[],scene={projectId:'p',canvasId:'c',api:{}},state={nodes:[{id:'n',type:'text',position:{x:10,y:20},data:{id:'n',lcos_gui_navigation_pin:false}}]};let projectListener;
const reader=owner=>({refresh(){calls.push(owner+'-saved-read');},dispose(){calls.push(owner+'-dispose');}});
const ports={project:'p',currentNativeNavigationScene:()=>scene,nativeNavigationGuiSignature:sign,
  createNativeNavigationProjectReader:()=>reader('navigation'),createNativeNavigationDirectoryProjectReader:()=>reader('directory'),
  useCollaborationSessionStore:{getState:()=>({watchProjectChanges(project,listener){assert.equal(project,'p');projectListener=listener;return()=>{projectListener=undefined;};}})},
  useCanvasStore:{getState:()=>state,subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);}}};
const cleanup=new Function(...Object.keys(ports),effectJs+'return setup();')(...Object.values(ports));
// native-canvas-port forwards a zero-argument bridge notification, not the
// Zustand(state) callback convention. Every observer must read getState().
const emit=()=>dispatchBridge(listeners,true,{});
const checks=[];
state.nodes[0]={...state.nodes[0],selected:true,position:{x:999,y:-50},measured:{width:600,height:900}};emit();assert.deepEqual(calls,[]);
state.nodes[0]={...state.nodes[0],data:{...state.nodes[0].data,lcos_gui_navigation_pin:undefined}};emit();assert.deepEqual(calls,[],'Absent and explicit false are the same GUI state');
state.nodes[0]={...state.nodes[0],data:{...state.nodes[0].data,lcos_gui_navigation_pin:true}};emit();assert.deepEqual(calls,['navigation-saved-read','directory-saved-read']);
checks.push('Actual AST-extracted bridge dispatcher reproduces the old callback crash, while the fixed actual Host effect reads getState() after its zero-argument notification. Bool changes request both quiet saved readers; geometry, selection, measurement and absent/false do not.');
state.nodes[0]={...state.nodes[0],data:{...state.nodes[0].data,lcos_ref:{version:1,artifactId:'a',artifactViewId:'v',revisionId:'r',entityType:'artifact',entityId:'a'}}};emit();assert.equal(calls.length,4);
state.nodes[0]={...state.nodes[0],data:{...state.nodes[0].data,lcos_ref:{...state.nodes[0].data.lcos_ref}}};emit();assert.equal(calls.length,4,'Equivalent identity does not request another read');
state.nodes[0]={...state.nodes[0],data:{...state.nodes[0].data,lcos_ref:{...state.nodes[0].data.lcos_ref,artifactViewId:'other'}}};emit();assert.equal(calls.length,6);
projectListener();assert.equal(calls.length,8);assert.equal(state.nodes[0].data.lcos_gui_navigation_pin,true);
checks.push('Canonical/materialized identity replacement uses the same quiet readers; equivalent DTO clones are stable, and original project invalidation remains subscribed. No local boolean setter, camera or focus action exists in this effect.');
cleanup();assert.equal(listeners.size,0);assert.equal(projectListener,undefined);assert.deepEqual(calls.slice(-2),['navigation-dispose','directory-dispose']);const count=calls.length;emit();assert.equal(calls.length,count);
checks.push('Exact effect cleanup releases original Canvas/project subscriptions and disposes both readers; late node events cannot refresh an old scene. Reader owner/pending/return behavior is covered by existing state suites.');
const output=path.join(process.cwd(),'output/普通节点导航固定_20261027/原Host轻量失效',new Date().toISOString().replace(/[:.]/g,'-'));await fs.mkdir(output,{recursive:true});
const report={passed:true,checks,scope:'Executed actual AST-extracted bridge notification dispatcher, signature and original Host subscription effect with controlled saved-reader ports; not a real SSE/browser claim',modelCalls:0,activeRuntimeWrites:0};await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({output,...report},null,2));
