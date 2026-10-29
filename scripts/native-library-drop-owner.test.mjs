import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { buildPilotEntry, installedRoot } from '../lab/pilot/build-pilot.mjs';
import { readCurrentGen2Resource } from '../lab/current-gen2-resources.mjs';
import { createNativeLibraryDropOwnerSourceTransforms, nativeLibraryDropRouterSource, nativeLibraryDropStateSource,
  restoreNativeLibraryDropOwnerForComparison } from '../lab/native-library-drop-owner-source-transform.mjs';

const root = path.resolve(import.meta.dirname, '..'), require = createRequire(path.join(installedRoot, 'package.json'));
const esbuild = require('esbuild'), ts = require('typescript');
const temp = path.join(root, '.runtime', 'native-library-drop-owner-' + Date.now());
const output = path.join(root, 'output/原生Drop整合_20261017f');
const report = { passed: false, candidateWrites: 0, coreWrites: 0, models: 0,
  scope: 'actual selected original Router + actual transformed Zustand Drop store; real transport metadata, controlled producer only', cases: [] };
const transforms = createNativeLibraryDropOwnerSourceTransforms(), transformed = new Map(), originals = new Map();
const find = (node, predicate) => { const values=[]; const walk=n=>{if(predicate(n))values.push(n);ts.forEachChild(n,walk);};walk(node);return values; };
const one = values => { assert.equal(values.length,1); return values[0]; };
let originalFetch;
try {
  await fs.mkdir(temp,{recursive:true});
  for (const [resource,transform] of Object.entries(transforms)) {
    const sourcePath = path.join(root,resource), selected=readCurrentGen2Resource(sourcePath);
    const source = selected?.contents ?? await fs.readFile(sourcePath,'utf8'), result = transform(source,{sourcePath});
    if (resource===nativeLibraryDropRouterSource) {
      assert.ok(selected?.sourcePath.includes('LCOS_GEN2_GUI_RECOVERY_20260926'));
      report.selectedRouter={resourcePath:selected.resourcePath,sourcePath:selected.sourcePath,copiedPath:selected.copiedPath};
    }
    originals.set(resource,source);transformed.set(resource,result);
    assert.equal(transform(result,{sourcePath}),result);
    assert.equal(restoreNativeLibraryDropOwnerForComparison(result,source,{sourcePath}),source);
    assert.throws(()=>transform(source,{sourcePath:sourcePath+'.foreign'}));
    const ast=ts.createSourceFile(sourcePath,result,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
    assert.deepEqual(ast.parseDiagnostics,[]);
    let stripped=result;
    if(resource===nativeLibraryDropRouterSource){
      const member=one(find(ast,n=>ts.isPropertySignature(n)&&n.name.getText()==='handleNativeLibraryMaterial'));
      const marker=result.indexOf('/* Native Library exact-material owner inside original transaction */');
      const preparation=one(find(ast,n=>ts.isIfStatement(n)&&ts.isBinaryExpression(n.expression)&&n.expression.left.getText()==='intent.kind'
        &&ts.isStringLiteral(n.expression.right)&&n.expression.right.text==='prepare-material'));
      stripped=result.slice(0,marker)+result.slice(preparation.getStart(ast));
      stripped=stripped.slice(0,member.getFullStart())+stripped.slice(member.end);
    }else{
      const declaration=one(find(ast,n=>ts.isMethodSignature(n)&&n.name.getText()==='confirmNativeLibraryPlacementReceipt'));
      one(find(ast,n=>ts.isPropertyAssignment(n)&&n.name.getText()==='confirmNativeLibraryPlacementReceipt'));
      const originalRailway=one(find(ast,n=>ts.isPropertyAssignment(n)&&n.name.getText()==='confirmRailwayReceipt'));
      stripped=result.slice(0,result.indexOf('/* Native Library exact-material readonly recovery */'))+result.slice(originalRailway.getStart(ast));
      stripped=stripped.slice(0,declaration.getStart(ast))+stripped.slice(declaration.end+(result.includes('\r\n')?2:1)+2);
      stripped=stripped.slice(stripped.indexOf('// LCOS Semantic Drop presentation state'))
        .replace('!(isNativeLibraryPlacementReceipt(incoming, state.payload) && incoming.targetId === resolution.intent.targetId) && ','');
    }
    assert.equal(stripped,source,'all original bytes survive when only the declared added seams are removed');
  }
  report.cases.push('actual selected Router provenance; exact sourcePath; AST/idempotence/precise restore; all original bytes survive only-added seam removal');
  const entry=path.join(temp,'entry.ts'), bundle=path.join(temp,'dependencies.mjs');
  await fs.writeFile(entry,`export * from ${JSON.stringify(path.join(root,'lab/pilot/native-library-drop.ts'))};
export {create} from 'zustand';
export {advanceDropIntent,beginDrop,completeDropDwell,confirmDrop,failDrop,idleDrop,nominalAnchorAt} from '@local-creative-os/web-gen2';
export {railwayStableKeyV1} from '@local-creative-os/contracts';
export * from ${JSON.stringify(path.join(root,'lcos/huabu/apps/web/src/lcos/drop/dropAssemblyReceipt.ts'))};
export * from ${JSON.stringify(path.join(root,'lcos/huabu/apps/web/src/lcos/drop/dropIntentResolver.ts'))};
export * from ${JSON.stringify(path.join(root,'lcos/huabu/apps/web/src/lcos/professional/assemblyApplyReview.ts'))};
export {DropTargetRegistry} from ${JSON.stringify(path.join(root,'lcos/huabu/apps/web/src/lcos/drop/dropTargetRegistry.ts'))};`);
  await buildPilotEntry(path.relative(root,entry),bundle);
  const app=await import(pathToFileURL(bundle));
  const browserEntry=path.join(temp,'owner-browser-entry.ts'),browserBundle=path.join(temp,'owner-browser.js');
  await fs.writeFile(browserEntry,`export {DropCommitRouter} from ${JSON.stringify(path.join(root,nativeLibraryDropRouterSource))};
export {useLcosDropStore} from ${JSON.stringify(path.join(root,nativeLibraryDropStateSource))};
export {markNativeLibraryPlacementReceipt,readNativeLibraryDropCapture} from ${JSON.stringify(path.join(root,'lab/pilot/native-library-drop.ts'))};`);
  await buildPilotEntry(path.relative(root,browserEntry),browserBundle,'browser',{nativeReact:true,sourceTransforms:transforms});
  const browserSources=JSON.parse(await fs.readFile(browserBundle+'.sources.json','utf8'));
  assert.equal(browserSources.resources.filter(row=>row.resourcePath==='huabu/apps/web/src/lcos/drop/dropCommitRouter.ts').length,1);
  report.cases.push('independent browser bundle compiles both exact source transforms with selected original Router and shared receipt module; no candidate build or server');
  const run=async(resource)=>{
    const code=(await esbuild.transform(transformed.get(resource),{loader:'ts',format:'cjs',target:'node22'})).code;
    const module={exports:{}};
    new Function('require','module','exports',code)(specifier=>{
      assert.ok(['@local-creative-os/contracts','@local-creative-os/web-gen2','zustand','./dropAssemblyReceipt','./dropIntentResolver',
        '../professional/assemblyApplyReview','./drop/dropAssemblyReceipt','./drop/dropTargetRegistry'].includes(specifier)
        || specifier.endsWith('/lab/pilot/native-library-drop'), 'unexpected actual dependency '+specifier);
      return app;
    },module,module.exports);return module.exports;
  };
  const {DropCommitRouter}=await run(nativeLibraryDropRouterSource),{useLcosDropStore:store}=await run(nativeLibraryDropStateSource);
  originalFetch=globalThis.fetch;globalThis.fetch=()=>{throw new Error('This Router/store test never calls Core/network.');};
  const origin={projectId:'project',canvasId:'canvas',api:{}}, messages=[];
  const asset={id:'artifact',name:'确版材料',lcos_projection:{project_id:'project',artifact_id:'artifact',presented_revision_id:'revision-r1',
    current_revision_id:'revision-newer',artifact_view_id:'source-view',file_record_id:'file-r1',content_available:true,referenceable:true,
    assembly_item:{kind:'artifact',title:'确版材料',entityRef:{type:'artifact',id:'artifact',viewId:'source-view'},presentedRevisionId:'revision-r1',mimeType:'text/plain'}}};
  const acquire=()=>{
    store.getState().reset();
    assert.equal(app.beginNativeLibraryAssemblyDrop({clientX:12,clientY:34,dataTransfer:{effectAllowed:'move',setData(){}},
      preventDefault(){},stopPropagation(){}},asset,{readOrigin:()=>origin,read:()=>store.getState(),acquire:payload=>store.getState().begin(payload),
      cancel:()=>store.getState().cancel(),notice:value=>messages.push(value)}),'started');
    return store.getState().state.payload;
  };
  const source={kind:'artifactView',id:'source-view'}, intent={kind:'assembly-apply',targetId:'original-canvas-receiver',
    sourceRefs:[source],targetRef:{kind:'workspace',id:'workspace'},placementPoint:{x:321,y:-123}};
  const commitState=(payload,which,transactionId)=>{
    store.getState().begin(payload);store.getState().setBounds({left:0,right:1000,top:0,bottom:800});
    store.getState().advance({x:500,y:400},true,1,{targetId:which.targetId,previewPoint:{x:500,y:400}},
      {status:'ready',intent:which},which.placementPoint);store.getState().commitAt(transactionId);
    assert.equal(store.getState().state.status,'committing');assert.equal(store.getState().state.payload,payload);
  };
  const receipt=(transactionId,status='success')=>({status,transactionId,targetId:intent.targetId,projectId:'project',
    message:status==='success'?'已放到画布':'已提交，画布显示尚未确认',canonicalReceipt:{state:status==='success'?'present':'unconfirmed',nodeId:'same-exact-node',revisionId:'revision-r1'}});
  const payload=acquire();commitState(payload,intent,'native-one');
  let delegated=0,applied=0,finish;
  const owners={projectId:'project',addComposerReference:async()=>{},applyAssembly:async()=>{applied++;throw new Error('Mutable View fallback forbidden');},
    handleNativeLibraryMaterial:async(received,tx,signal)=>{delegated++;assert.equal(received,intent);assert.equal(tx,'native-one');assert.equal(signal,undefined);
      return new Promise(resolve=>{finish=()=>resolve(app.markNativeLibraryPlacementReceipt(receipt(tx),payload));});}};
  const router=new DropCommitRouter(),first=router.commit(intent,'native-one',owners),duplicate=router.commit(intent,'native-one',owners);
  assert.equal(first,duplicate);assert.equal(delegated,1);assert.equal(applied,0);
  const changed=await router.commit({...intent,placementPoint:{x:9,y:9}},'native-one',owners);assert.equal(changed.status,'failed');assert.equal(delegated,1);
  finish();const native=await first;assert.ok(app.isNativeLibraryPlacementReceipt(native,payload));
  store.getState().settle(native);assert.equal(store.getState().state.status,'idle');assert.equal(store.getState().feedback.receipt,native);
  assert.equal(store.getState().feedback.receipt.assemblyItems,undefined);assert.equal(store.getState().feedback.receipt.canonicalReceipt.nodeId,'same-exact-node');
  report.cases.push('delegate executes inside original tx/signature dedup once; changed intent rejects; exact real-placement-shaped receipt settles without invented Assembly rows or mutable apply');
  const unknownPayload=acquire();commitState(unknownPayload,intent,'native-unknown');let unknownCalls=0;
  const unknownOwner={...owners,handleNativeLibraryMaterial:async(_,tx)=>{unknownCalls++;return app.markNativeLibraryPlacementReceipt(receipt(tx,'partial'),unknownPayload);}};
  const unknown=await router.commit(intent,'native-unknown',unknownOwner);store.getState().settle(unknown);
  const unknownState=store.getState();assert.equal(unknownState.state.status,'failed');assert.equal(unknownState.feedback.receipt,unknown);
  assert.equal(unknownState.feedback.attempt.payload,unknownPayload);assert.equal(unknownState.feedback.originalIntent.intent.placementPoint.x,321);
  assert.equal(unknownState.feedback.receipt.retrySourceRefs,undefined);store.getState().retryFailed('must-not-post');assert.equal(store.getState().state,unknownState.state);
  assert.equal(await router.commit(intent,'native-unknown',unknownOwner),unknown);assert.equal(unknownCalls,1);assert.equal(applied,0);
  report.cases.push('unknown retains same payload/source/target/explicit release point and true receipt; no Assembly merge erasure, retryFailed admission, or automatic producer replay');
  const checked=app.markNativeLibraryPlacementReceipt(receipt('native-unknown'),unknownPayload);
  const preservedState=store.getState().state, preservedFeedback=store.getState().feedback;
  assert.equal(store.getState().confirmNativeLibraryPlacementReceipt('foreign-tx',checked),false);
  assert.equal(store.getState().confirmNativeLibraryPlacementReceipt('native-unknown',{...checked,targetId:'foreign-target'}),false);
  assert.equal(store.getState().confirmNativeLibraryPlacementReceipt('native-unknown',{...checked,projectId:'foreign-project'}),false);
  assert.equal(store.getState().confirmNativeLibraryPlacementReceipt('native-unknown',JSON.parse(JSON.stringify(checked))),false);
  const otherPayload=acquire();
  const foreignMarked=app.markNativeLibraryPlacementReceipt(receipt('native-unknown'),otherPayload);
  store.setState({state:preservedState,feedback:preservedFeedback});
  assert.equal(store.getState().confirmNativeLibraryPlacementReceipt('native-unknown',foreignMarked),false);
  assert.equal(store.getState().state,preservedState);assert.equal(store.getState().feedback,preservedFeedback);
  const stillUnknown=app.markNativeLibraryPlacementReceipt({...receipt('native-unknown','partial'),message:'仍在核对原放置'},unknownPayload);
  assert.equal(store.getState().confirmNativeLibraryPlacementReceipt('native-unknown',stillUnknown),true);
  assert.equal(store.getState().state,preservedState);assert.equal(store.getState().feedback.attempt,preservedFeedback.attempt);
  assert.equal(store.getState().confirmNativeLibraryPlacementReceipt('native-unknown',checked),true);
  assert.equal(store.getState().state.status,'idle');assert.equal(store.getState().feedback.receipt,checked);
  assert.equal(store.getState().confirmNativeLibraryPlacementReceipt('native-unknown',stillUnknown),false);
  assert.equal(store.getState().feedback.receipt,checked);
  store.getState().begin(otherPayload);
  assert.equal(store.getState().confirmNativeLibraryPlacementReceipt('native-unknown',checked),false);
  assert.equal(unknownCalls,1);assert.equal(applied,0);
  report.cases.push('readonly recovery adopts only same feedback tx/target/project/original payload proof; unknown retains failure, exact success becomes idle, new gesture/foreign/later downgrade refuse; no producer calls');
  const another=acquire();assert.equal(app.isNativeLibraryPlacementReceipt(unknown,another),false);
  assert.equal(app.isNativeLibraryPlacementReceipt(unknown,{...unknownPayload}),false,'even a symbol-preserving payload clone is not the original gesture object');
  assert.equal(app.isNativeLibraryPlacementReceipt({...unknown,transactionId:'foreign'},unknownPayload),false);
  assert.equal(app.isNativeLibraryPlacementReceipt(JSON.parse(JSON.stringify(unknown)),unknownPayload),false);
  assert.throws(()=>app.markNativeLibraryPlacementReceipt({...receipt('x'),projectId:'foreign'},another));
  assert.throws(()=>app.markNativeLibraryPlacementReceipt({...receipt('x'),retrySourceRefs:[source]},another));
  commitState(another,intent,'foreign-receipt');store.getState().settle({...native,transactionId:'foreign-receipt'});
  assert.notEqual(store.getState().feedback.receipt.status,'success');assert.ok(store.getState().feedback.receipt.unknownSourceKeys.length);
  const wrongTarget=acquire();commitState(wrongTarget,intent,'wrong-target');
  store.getState().settle(app.markNativeLibraryPlacementReceipt({...receipt('wrong-target'),targetId:'another-target'},wrongTarget));
  assert.notEqual(store.getState().feedback.receipt.status,'success');
  report.cases.push('private receipt proof is payload/project/tx/target bound, not JSON-restorable; foreign or generic-retry claims cannot bypass original safety review');
  let legacyCalls=0;
  const canonical=(refs,status='applied')=>({schemaVersion:1,projectId:'project',results:refs.map(sourceRef=>({sourceRef,status,
    channel:status==='applied'?'workspace-membership':'error'})),allApplied:status==='applied'});
  const legacyOwners={projectId:'project',addComposerReference:async()=>{},applyAssembly:async which=>{legacyCalls++;return canonical(which.sourceRefs);}};
  const legacy=await router.commit(intent,'legacy',legacyOwners);assert.equal(legacy.status,'success');assert.equal(legacyCalls,1);
  const viaUndefined=await router.commit(intent,'non-library', {...legacyOwners,handleNativeLibraryMaterial:async()=>undefined});
  assert.equal(viaUndefined.status,'success');assert.equal(legacyCalls,2);
  const rejected=await router.commit(intent,'library-rejected',{...legacyOwners,handleNativeLibraryMaterial:async()=>{throw new Error('来源已变化，原材料保留');}});
  assert.equal(rejected.status,'failed');assert.equal(legacyCalls,2);
  let abortedCalls=0;const abort=new AbortController();abort.abort();
  const cancelled=await router.commit(intent,'aborted',{...legacyOwners,handleNativeLibraryMaterial:async()=>{abortedCalls++;}},abort.signal);
  assert.equal(cancelled.status,'failed');assert.equal(abortedCalls,0);assert.equal(legacyCalls,2);
  let receiveCalls=0,remoteDelegates=0;
  for(const kind of ['portal','railway']){
    const remoteIntent={...intent,[kind==='portal'?'portalReceive':'railwayReceive']:true,railwayCanvasId:'remote',railwayDestinationRef:{kind:'worksite',projectId:'project',worksiteId:'remote'}};
    const receive=async(which,operationId)=>{receiveCalls++;return{status:'committed',operationId,
      destination:{ref:which.railwayDestinationRef,canvasId:which.railwayCanvasId},result:canonical(which.sourceRefs)};};
    const remotePayload=acquire();
    const remote=await router.commit(remoteIntent,'native-'+kind,{...legacyOwners,receivePortal:receive,receiveRailway:receive,
      handleNativeLibraryMaterial:async(_,tx)=>{remoteDelegates++;return app.markNativeLibraryPlacementReceipt({...receipt(tx,'failed'),message:'该入口材料接收尚未连接'},remotePayload);}});
    assert.equal(remote.status,'failed');assert.equal(receiveCalls,0);assert.equal(legacyCalls,2);
    const ordinaryRemote=await router.commit(remoteIntent,'legacy-'+kind,{...legacyOwners,receivePortal:receive,receiveRailway:receive,
      handleNativeLibraryMaterial:async()=>undefined});
    assert.equal(ordinaryRemote.status,'success');assert.equal(receiveCalls,1);receiveCalls=0;
  }
  assert.equal(remoteDelegates,2);
  report.cases.push('ordinary absent/undefined delegate keeps original apply owner; native rejection never falls back; original abort stays; captured portal/rail delegate blocks mutable receive while noncapture remote original owner still succeeds');
  const refs=[source,{kind:'artifactView',id:'second-view'}],legacyPayload={kind:'assembly',itemId:'legacy-selection',sourceRef:source};
  const mixed={...intent,sourceRefs:refs};commitState(legacyPayload,mixed,'mixed-first');
  const initial=app.assemblyDropReceipt(mixed,'mixed-first',{schemaVersion:1,projectId:'project',allApplied:false,
    results:[...canonical([source]).results,...canonical([refs[1]],'failed').results]},'project');
  store.getState().settle(initial);assert.equal(store.getState().feedback.receipt.status,'partial');
  assert.deepEqual(store.getState().feedback.receipt.retrySourceRefs,[refs[1]]);
  store.getState().retryFailed('mixed-retry');assert.equal(store.getState().state.status,'committing');
  assert.deepEqual(store.getState().resolution.intent.sourceRefs,[refs[1]]);
  const retry=await router.commit(store.getState().resolution.intent,'mixed-retry',legacyOwners);store.getState().settle(retry);
  assert.equal(store.getState().state.status,'idle');assert.equal(store.getState().feedback.receipt.status,'success');
  assert.deepEqual(store.getState().feedback.receipt.assemblyItems.map(row=>row.sourceRef),refs);
  const malformedPayload={kind:'assembly',itemId:'bad',sourceRef:source};commitState(malformedPayload,intent,'legacy-unknown');
  store.getState().settle(app.assemblyDropReceipt(intent,'legacy-unknown',{schemaVersion:1,projectId:'foreign',results:[]},'project'));
  assert.equal(store.getState().feedback.receipt.retrySourceRefs.length,0);assert.equal(store.getState().feedback.receipt.unknownSourceKeys.length,1);
  report.cases.push('ordinary Assembly partial retry remains failed-subset only; prior successes merge back; malformed/foreign legacy receipt remains unknown and never replayable');
  report.passed=true;
}catch(error){report.failure=String(error.stack??error);process.exitCode=1;}
finally{
  if(originalFetch)globalThis.fetch=originalFetch;
  await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'原库DropRouter与Store测试.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
}
