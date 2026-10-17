import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { parseOriginalDonorScript as parse, transformAgentNodeScript } from '../lab/agent-node-transform.mjs';
import { transformCutScript } from '../lab/cut-transform.mjs';
import { transformRendererScript } from '../lab/startup-transform.mjs';
import { transformNodeBridgeScript } from '../lab/node-transform.mjs';
import { transformSurfaceDockScript } from '../lab/surface-dock-transform.mjs';
import { transformHistoryIntentScript } from '../lab/history-intent-transform.mjs';
import { transformNativeLibraryDropScript, transformNativeLibraryDropNoticeScript, restoreNativeLibraryDropNoticeScriptForComparison } from '../lab/native-library-drop-transform.mjs';
import { transformNativeLibraryDropState, nativeLibraryDropStateSource, nativeLibraryDropOverlaySource,
  transformNativeLibraryDropFeedbackOverlay, restoreNativeLibraryDropFeedbackOverlayForComparison } from '../lab/native-library-drop-owner-source-transform.mjs';
import { buildPilotEntry, installedRoot } from '../lab/pilot/build-pilot.mjs';
import { readCurrentGen2Resource } from '../lab/current-gen2-resources.mjs';

const root=path.resolve(import.meta.dirname,'..'),require=createRequire(path.join(installedRoot,'package.json'));
const reactRequire=createRequire(path.join(installedRoot,'huabu/apps/web/package.json'));
const esbuild=require('esbuild'),ts=require('typescript');
const temp=path.join(root,'.runtime','native-library-feedback-'+Date.now());
const output=path.join(root,'output/原生Drop整合_20261017f');
const report={passed:false,scope:'actual donor Rt/Sonner observer/action + production feedback controller + actual transformed Drop store; controlled GET owner, no candidate/Core',
  candidateWrites:0,coreWrites:0,models:0,cases:[]};
const walk=(node,visit)=>{if(!node?.type)return;visit(node);for(const value of Object.values(node))if(Array.isArray(value))value.forEach(item=>walk(item,visit));else if(value?.type)walk(value,visit);};
let savedRaf,unsubscribe;
try{
  await fs.mkdir(temp,{recursive:true});
  const pageName='page-Da_DfwiK.js',page=await fs.readFile(path.join(root,'reference/tapnow-installed/resources/web/assets',pageName),'utf8');
  const hostSource=transformAgentNodeScript(pageName,transformHistoryIntentScript(pageName,transformSurfaceDockScript(pageName,
    transformNodeBridgeScript(pageName,transformCutScript(pageName,transformRendererScript(pageName,page))))));
  const ko=transformNativeLibraryDropScript(pageName,hostSource),noticed=transformNativeLibraryDropNoticeScript(pageName,ko);
  assert.equal(transformNativeLibraryDropNoticeScript(pageName,noticed),noticed);assert.equal(transformNativeLibraryDropScript(pageName,noticed),noticed);
  assert.equal(restoreNativeLibraryDropNoticeScriptForComparison(pageName,noticed,ko),ko);
  const noticeMarker='\n/* LCOS original Drop notice supplied to the existing host */';
  assert.equal(noticed.slice(0,-noticeMarker.length).replace(',NativeDropNotice:se',''),ko,'only the existing host gains the real donor toast prop');
  assert.throws(()=>transformNativeLibraryDropNoticeScript(pageName,page));
  const overlayPath=path.join(root,nativeLibraryDropOverlaySource),selected=readCurrentGen2Resource(overlayPath),overlay=selected.contents;
  const adapted=transformNativeLibraryDropFeedbackOverlay(overlay,{sourcePath:overlayPath});
  assert.equal(transformNativeLibraryDropFeedbackOverlay(adapted,{sourcePath:overlayPath}),adapted);
  assert.equal(restoreNativeLibraryDropFeedbackOverlayForComparison(adapted,overlay,{sourcePath:overlayPath}),overlay);
  const prefixEnd=adapted.indexOf('*/')+2+(adapted.includes('\r\n')?2:1);
  assert.equal(adapted.slice(prefixEnd).replace('<NativeLibraryDropFeedback><LcosDropReceipt /></NativeLibraryDropFeedback>','<LcosDropReceipt />'),overlay);
  assert.throws(()=>transformNativeLibraryDropFeedbackOverlay(overlay,{sourcePath:overlayPath+'.foreign'}));
  report.cases.push('real Rt alias enters only existing host prop; Ko idempotence/preservation stays; exact selected Overlay wraps original receipt child without rewriting legacy body');
  const index=await fs.readFile(path.join(root,'reference/tapnow-installed/resources/web/assets/index-BAQXnPag.js'),'utf8'),ast=parse(index,'donor-toast');
  const declaration=name=>{const nodes=ast.body.flatMap(node=>node.declarations??[]).filter(node=>node.id?.name===name);assert.equal(nodes.length,1,name);return 'const '+index.slice(nodes[0].start,nodes[0].end)+';';};
  const toastClass=ast.body.find(node=>node.type==='ClassDeclaration'&&node.id?.name==='drr'),toastFn=ast.body.find(node=>node.type==='FunctionDeclaration'&&node.id?.name==='Rt');
  const dismiss=ast.body.find(node=>node.type==='ExpressionStatement'&&node.expression.type==='AssignmentExpression'&&node.expression.left?.object?.name==='Rt'&&node.expression.left?.property?.name==='dismiss');
  const exported=ast.body.filter(node=>node.type==='ExportNamedDeclaration').flatMap(node=>node.specifiers??[]).find(node=>node.exported?.name==='al');
  assert.equal(exported.local.name,'Rt');assert.ok(toastClass&&toastFn&&dismiss);
  const donor=new Function('let gRe=1;'+index.slice(toastClass.start,toastClass.end)+['x2','urr','prr','frr','grr','jh'].map(declaration).join('')
    +index.slice(toastFn.start,toastFn.end)+index.slice(dismiss.start,dismiss.end)+';return {notice:Rt,state:x2};')();
  const actionNodes=[];walk(ast,node=>{if(node.type==='ArrowFunctionExpression'&&index.slice(node.start,node.end).includes('h.action.onClick.call(h.action,it)')
    &&node.params.length===1&&node.params[0]?.name==='it')actionNodes.push(node);});assert.equal(actionNodes.length,1);
  const originalAction=toast=>new Function('PG','h','st','return ('+index.slice(actionNodes[0].start,actionNodes[0].end)+')')(
    value=>!!value&&typeof value.label==='string',toast,()=>{throw new Error('Original Sonner action must not auto-dismiss unknown while checking.');});
  savedRaf=globalThis.requestAnimationFrame;globalThis.requestAnimationFrame=fn=>{fn();return 0;};
  const observations=[];unsubscribe=donor.state.subscribe(value=>observations.push(value));
  const entry=path.join(temp,'dependencies.ts'),bundle=path.join(temp,'dependencies.mjs');
  await fs.writeFile(entry,`export * from ${JSON.stringify(path.join(root,'lab/pilot/native-library-drop.ts'))};
export {create} from 'zustand';
export {advanceDropIntent,beginDrop,completeDropDwell,confirmDrop,failDrop,idleDrop,nominalAnchorAt} from '@local-creative-os/web-gen2';
export {assemblyDropReceipt,mergeAssemblyDropAttempt} from ${JSON.stringify(path.join(root,'lcos/huabu/apps/web/src/lcos/drop/dropAssemblyReceipt.ts'))};
export {DropTargetRegistry} from ${JSON.stringify(path.join(root,'lcos/huabu/apps/web/src/lcos/drop/dropTargetRegistry.ts'))};`);
  await buildPilotEntry(path.relative(root,entry),bundle);const app=await import(pathToFileURL(bundle));
  const evaluate=async(source,filename,dependency)=>{const code=(await esbuild.transform(source,{loader:filename.endsWith('.tsx')?'tsx':'ts',jsx:'automatic',format:'cjs',target:'node22'})).code;
    const module={exports:{}};new Function('require','module','exports',code)(dependency,module,module.exports);return module.exports;};
  const statePath=path.join(root,nativeLibraryDropStateSource),stateSource=await fs.readFile(statePath,'utf8');
  const {useLcosDropStore:store}=await evaluate(transformNativeLibraryDropState(stateSource,{sourcePath:statePath}),'state.ts',()=>app);
  const feedbackSource=await fs.readFile(path.join(root,'lab/pilot/native-library-drop-feedback.tsx'),'utf8');
  const ui=await evaluate(feedbackSource,'feedback.tsx',specifier=>{
    if(specifier==='react'||specifier==='react/jsx-runtime')return reactRequire(specifier);
    if(specifier.endsWith('/lcosDropState'))return{useLcosDropStore:store};
    if(specifier==='./native-library-drop')return app;
    if(specifier==='./native-library-material-owner')return{canCheckNativeLibraryDropReceipt(){throw new Error('component lifecycle not executed by controller unit test');},checkNativeLibraryDropReceipt(){throw new Error('not called');}};
    return {default(){throw new Error('unrelated Canvas hook not used by controller test');},useLcosShellStore(){throw new Error('not used');}};
  });
  const origin={projectId:'project',canvasId:'canvas',api:{}},asset={id:'artifact',name:'合成材料',lcos_projection:{project_id:'project',artifact_id:'artifact',
    presented_revision_id:'r1',artifact_view_id:'view',file_record_id:'file',content_available:true,referenceable:true,
    assembly_item:{kind:'artifact',title:'合成材料',entityRef:{type:'artifact',id:'artifact',viewId:'view'},presentedRevisionId:'r1',mimeType:'image/png'}}};
  const intent={kind:'assembly-apply',targetId:'receiver',sourceRefs:[{kind:'artifactView',id:'view'}],targetRef:{kind:'workspace',id:'workspace'},placementPoint:{x:444,y:222}};
  const seed=(tx)=>{store.getState().reset();app.beginNativeLibraryAssemblyDrop({clientX:10,clientY:20,dataTransfer:{effectAllowed:'move',setData(){}},preventDefault(){},stopPropagation(){}},asset,
    {readOrigin:()=>origin,read:()=>store.getState(),acquire:payload=>store.getState().begin(payload),cancel:()=>store.getState().cancel(),notice(){}});
    const payload=store.getState().state.payload;store.getState().setBounds({left:0,right:1000,top:0,bottom:800});
    store.getState().advance({x:444,y:222},true,1,{targetId:'receiver',previewPoint:{x:444,y:222}},{status:'ready',intent},{x:444,y:222});store.getState().commitAt(tx);return payload;};
  const result=(tx,payload,status='partial')=>app.markNativeLibraryPlacementReceipt({transactionId:tx,targetId:'receiver',projectId:'project',status,
    message:'INTERNAL UUID HTTP 503 must not enter user toast',canonicalReceipt:{nodeId:'exact-node',state:status==='success'?'present':'unconfirmed'}},payload);
  let canCheck=true,current=true,calls=0,resolveCheck,rejectCheck,signals=[];
  const controller=ui.createNativeLibraryDropFeedbackController(donor.notice,{read:()=>store.getState(),isCurrent:()=>current,
    canCheck:feedback=>canCheck&&app.isNativeLibraryPlacementReceipt(feedback.receipt,feedback.attempt.payload),
    check:(feedback,signal)=>{calls++;signals.push(signal);return new Promise((resolve,reject)=>{resolveCheck=resolve;rejectCheck=reject;});}});
  const active=()=>donor.state.getActiveToasts().at(-1),tick=()=>new Promise(resolve=>setTimeout(resolve,0));
  const payload=seed('one');controller.sync();const id=active().id;
  assert.equal(active().title,'正在放置材料…');assert.equal(active().duration,99999999);assert.equal(active().dismissible,false);
  const unknown=result('one',payload);store.getState().settle(unknown);controller.sync();
  assert.equal(active().id,id);assert.equal(active().action.label,'核对放置结果');assert.equal(active().duration,99999999);
  const event={defaultPrevented:false,preventDefault(){this.defaultPrevented=true;}};originalAction(active())(event);
  assert.equal(event.defaultPrevented,true);assert.equal(calls,1);assert.equal(signals[0].aborted,false);
  originalAction(active())(event);assert.equal(calls,1,'same checking gesture cannot duplicate even its GET');
  resolveCheck(result('one',payload,'success'));await tick();
  assert.equal(store.getState().feedback.receipt.status,'success');assert.equal(active().id,id);assert.equal(active().title,'已放到画布。');
  assert.equal(active().action,undefined);assert.equal(active().duration,undefined);assert.equal(active().dismissible,true);
  report.cases.push('actual donor Rt/Sonner observer receives one id busy→persistent unknown→success; actual original action prevents auto-dismiss, exact label, independent GET signal, no duplicate check, default success duration restored');
  const latePayload=seed('late');store.getState().settle(result('late',latePayload));controller.sync();originalAction(active())(event);
  const lateResolve=resolveCheck,oldSignal=signals.at(-1),lateToast=active().id;
  const nextPayload=seed('next');controller.sync();assert.equal(oldSignal.aborted,true);assert.ok(donor.state.dismissedToasts.has(lateToast));
  lateResolve(result('late',latePayload,'success'));await tick();assert.equal(store.getState().state.status,'committing');assert.equal(store.getState().state.payload,nextPayload);
  assert.equal(active().title,'正在放置材料…');
  report.cases.push('new tx/payload cancels only checking controller, dismisses prior original toast, refuses late result and never adopts into new gesture');
  store.getState().settle(result('next',nextPayload));controller.sync();originalAction(active())(event);
  const failedCheck=rejectCheck;failedCheck(new Error('HTTP 503 raw-id-internal'));await tick();
  assert.equal(active().title,'暂时无法核对，原材料和记录保留。');assert.equal(active().action.label,'核对放置结果');assert.equal(active().duration,99999999);
  assert.ok(observations.every(value=>!String(value.title).includes('HTTP')&&!String(value.title).includes('UUID')&&!String(value.title).includes('raw-id')));
  current=false;controller.sync();assert.ok(donor.state.dismissedToasts.has(active()?.id??0)||donor.state.getActiveToasts().length===0);
  current=true;canCheck=false;controller.sync();assert.equal(active().action,undefined);assert.equal(active().duration,undefined);
  assert.equal(active().title,'本次放置未完成，原材料保留。');
  controller.dispose();assert.equal(donor.state.getActiveToasts().length,0);
  report.cases.push('check errors remain human Chinese in same persistent action; raw transport detail stays log only; scene exit/dispose abort and dismiss; definite noncheckable result has no misleading retry');
  const legacy={kind:'assembly',itemId:'legacy',sourceRef:{kind:'artifactView',id:'vendor-view'}};store.getState().begin(legacy);
  const legacyController=ui.createNativeLibraryDropFeedbackController(donor.notice,{read:()=>store.getState(),isCurrent:()=>true,canCheck:()=>true,check:async()=>{throw new Error('never');}});
  const prior=observations.length;legacyController.sync();assert.equal(observations.length,prior);legacyController.dispose();
  assert.ok(!feedbackSource.includes('createPortal')&&!feedbackSource.includes('setTimeout')&&!feedbackSource.includes('retryFailed('));
  report.cases.push('nonlibrary source publishes no new toast and retains exact original receipt child; no new portal/card/timer/global store/generic retry');
  report.passed=true;
}catch(error){report.failure=String(error.stack??error);process.exitCode=1;}
finally{unsubscribe?.();globalThis.requestAnimationFrame=savedRaf;await fs.mkdir(output,{recursive:true});
  await fs.writeFile(path.join(output,'原库Drop原Toast测试.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));}
