import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {buildPilotEntry,installedRoot} from '../lab/pilot/build-pilot.mjs';

// This process opens only its fresh disposable SQLite/Huabu stores. It neither
// inherits model/Host configuration nor touches the active development Core.
for(const key of Object.keys(process.env))if(/^(?:LCOS_|LOCAL_CORE_|HUABU_|OPENAI_|ANTHROPIC_|GEMINI_|GOOGLE_API_|OPENROUTER_|DEEPSEEK_)/.test(key))delete process.env[key];
const runtime=await fs.mkdtemp(path.resolve('.runtime/child-execution-owner-'));
process.env.LCOS_RECOVERY_TRANSPORT='none';process.env.LCOS_OLLAMA_URL='http://127.0.0.1:1';process.env.LCOS_CAPTURE_STAGING_ROOT=path.join(runtime,'capture');process.env.LCOS_OCR_RUNTIME_DIR=path.join(runtime,'ocr');
const out=path.resolve('output/子现场执行节点归属_20261025/Core与原校验',new Date().toISOString().replaceAll(':','-'));await fs.mkdir(out,{recursive:true});
await buildPilotEntry('lab/pilot/surface-core-facade.ts',path.join(runtime,'facade.mjs'),'node',{coreCollectionTitle:true,coreColorPin:true,coreWorkspaceMembership:true,coreWorkflowCollectionMembers:true,coreMixedScopeContext:true});
const {startSurfaceCoreFacade}=await import(pathToFileURL(path.join(runtime,'facade.mjs')));
let facade;const report={passed:false,checks:[],runtime,scope:'Fresh real Core SQLite + original Huabu storage and Run/ResultSlot/reconcile HTTP APIs, plus source-extracted actual GUI owner validators using original Zustand Shell/ReferenceStore. No provider dispatch or model call.'};
try{
 facade=await startSurfaceCoreFacade({runtimeRoot:runtime,publicOrigin:'http://127.0.0.1:19873',fullIntegration:true,nativeCollectionPilot:true,nativeTextPilot:true,nativeAssemblyPilot:true,nativeRailPilot:true});
 const repo=facade.core.repository,project=facade.core.projectId,prefix='/api/lcos/core/projects/'+project,initial=repo.get(project),scope='scope-child-execution-owner-test',workspace='workspace:'+scope;
 const call=(method,url,body)=>facade.handle({method,url,body}),value=r=>r.body.value??r.body.data??r.body;
 const expect=async(method,url,body,status=200)=>{const r=await call(method,url,body);assert.equal(r.status,status,JSON.stringify(r.body));return value(r)};
 const material=initial.artifactViews.find(view=>initial.artifacts.find(artifact=>artifact.id===view.artifactId)?.title==='Context · 资料现场');assert.ok(material);
 await expect('PUT',prefix+'/workflow/methods/'+scope,{create:true,name:'子现场执行归属验证',expectedGraphVersion:initial.graphVersion,presentations:[{id:'presentation:workflow:'+scope,expectedVersion:0,memberViewIds:[material.id],workflowActions:[{id:'inspect',label:'检查执行状态',attachedViewIds:[material.id],x:0,y:0}],workflowActionEdges:[],workflowOperators:{}}]});
 const opened=await expect('POST','/api/lcos/workflow/'+scope+'/workspace:open',{workspaceId:workspace}),canvasId=opened.canvasId,roots=initial.workspaces.filter(row=>row.canvasId),main=roots.find(row=>row.preferredSurface==='main');assert.ok(main);
 const childRun=(await expect('POST',prefix+'/runs',{instruction:'子现场隔离验证：只登记计划，不派发',outputIntent:'analyze',workspaceId:workspace,requestedProvider:'workbuddy'},201)).review;
 const mainRun=(await expect('POST',prefix+'/runs',{instruction:'主现场隔离验证：只登记计划，不派发',outputIntent:'analyze',workspaceId:main.id,requestedProvider:'workbuddy'},201)).review;
 const slot=await expect('POST',prefix+'/result-slots',{scopeId:scope,workspaceId:workspace,x:450,y:80,width:200,height:150},201);
 for(const review of[childRun,mainRun]){assert.equal(review.run.status,'created');assert.equal(review.dispatch.status,'planned');assert.equal(review.dispatch.attemptCount,0);assert.equal(repo.getRuntimeBinding(review.run.id),undefined)}
 await expect('POST','/api/lcos/canvases/'+canvasId+'/execution:reconcile',{});await expect('POST','/api/lcos/canvases/'+main.canvasId+'/execution:reconcile',{});
 const child=await expect('GET','/api/canvas/v1/canvases/'+canvasId),root=await expect('GET','/api/canvas/v1/canvases/'+main.canvasId);
 const childNode=child.nodes.find(node=>node.data?.lcos_execution_ref?.entityId===childRun.run.id),rootNode=root.nodes.find(node=>node.data?.lcos_execution_ref?.entityId===mainRun.run.id),slotNode=child.nodes.find(node=>node.data?.lcos_execution_ref?.entityId===slot.id);
 assert.ok(childNode&&rootNode&&slotNode);assert.equal(childNode.data.lcos_execution_ref.workspaceId,workspace);assert.equal(child.nodes.some(node=>node.data?.lcos_execution_ref?.entityId===mainRun.run.id),false);assert.equal(root.nodes.some(node=>node.data?.lcos_execution_ref?.entityId===childRun.run.id),false);
 report.checks.push('Real isolated Core creates only planned journals and one empty ResultSlot. Original reconciliation projects the child Run/slot only to the exact owned child Canvas and the Main Run only to Main.');
 const beforeBindings=repo.getProjectionBindings(project),beforeSpace=await facade.spatial.read(canvasId),beforeExecution=repo.getProjectExecutionProjection(project);
 const forged={id:childNode.id,type:childNode.type,position:structuredClone(childNode.position),measured:structuredClone(childNode.measured),data:{...rootNode.data,id:childNode.id,lcos_execution_ref:{...rootNode.data.lcos_execution_ref,canvasId,workspaceId:workspace}}};
 const rejected=await call('POST','/api/canvas/v1/canvases/'+canvasId+'/nodes:batchActions',{canvas_id:canvasId,actions:[{action:'update',updates:[forged]}]});assert.equal(rejected.status,409,JSON.stringify(rejected.body));assert.equal(rejected.body.error.code,'PROJECTED_NODE_FACTS_MISMATCH');
 assert.deepEqual(repo.getProjectionBindings(project),beforeBindings);assert.deepEqual(await facade.spatial.read(canvasId),beforeSpace);assert.deepEqual(repo.getProjectExecutionProjection(project),beforeExecution);
 report.checks.push('A forged node echo that relabels the Main Run as belonging to the child is rejected by original Core facts. Projection bindings, Run facts and Huabu state remain unchanged; no cross-worksite Run is admitted.');

 const abs=file=>path.resolve(file).replaceAll('\\','/');await fs.writeFile(path.join(runtime,'states.ts'),'export{useLcosShellStore}from '+JSON.stringify(abs('lcos/huabu/apps/web/src/lcos/shell/lcosShellStore.ts'))+';export{useLcosReferenceStore}from '+JSON.stringify(abs('lcos/huabu/apps/web/src/lcos/lcosReferenceState.ts'))+';');
 await buildPilotEntry(path.relative(process.cwd(),path.join(runtime,'states.ts')),path.join(runtime,'states.mjs'),'node');const {useLcosShellStore:S,useLcosReferenceStore:R}=await import(pathToFileURL(path.join(runtime,'states.mjs')));
 const source=await fs.readFile('lab/pilot/native-execution-ui.tsx','utf8'),ts=createRequire(path.join(installedRoot,'package.json'))('typescript'),ast=ts.createSourceFile('native-execution-ui.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),names=['isRecord','nonEmptyString','parseExecutionNode','hostCanvasId','sameReference','sameFacts','executionSurfaceMatches','checkCurrentOwner'];
 const functions=ast.statements.filter(node=>ts.isFunctionDeclaration(node)&&names.includes(node.name?.text));assert.equal(functions.length,names.length);const program=ts.transpileModule(functions.map(node=>node.getText(ast)).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
 const api={},host={projectId:project,canvasId,currentCanvasId:canvasId,api},windowPort={__LCOS_NODE_LAB__:host};const validator=new Function('useLcosShellStore','useLcosReferenceStore','window',program+'\nreturn{parseExecutionNode,checkCurrentOwner,executionSurfaceMatches};')(S,R,windowPort);
 S.getState().setProject(project);R.getState().setProject(project);const rootMap=Object.fromEntries(roots.map(row=>[row.preferredSurface,row.canvasId]));S.getState().setSurfaceCanvasMap(rootMap);S.getState().setActiveSurface('workflow');S.getState().setActiveWorkspaceId(workspace);
 const native={status:'ready',canvasId,rfInstance:api,nodes:child.nodes};const check=(node=childNode,scene=native)=>validator.checkCurrentOwner(node.id,node.data,validator.parseExecutionNode(node.id,node.data),scene);
 assert.equal(check().ready,true);assert.equal(check(slotNode).ready,true);assert.equal(S.getState().surfaceCanvasId.workflow,rootMap.workflow);assert.notEqual(rootMap.workflow,canvasId);
 report.checks.push('The exact original GUI validator now accepts the genuine child Run and empty ResultSlot DTOs while the three root navigation destinations remain unchanged.');
 S.getState().setActiveWorkspaceId(main.id);assert.equal(check().ready,false);S.getState().setActiveWorkspaceId(workspace);
 assert.equal(check(childNode,{...native,rfInstance:{}}).ready,false);assert.equal(check(childNode,{...native,canvasId:main.canvasId}).ready,false);host.projectId='other-project';assert.equal(check().ready,false);host.projectId=project;
 const stale=structuredClone(native);stale.rfInstance=api;stale.nodes.find(node=>node.id===childNode.id).data.lcos_execution_facts.execution.status='finished';assert.equal(check(childNode,stale).ready,false);
 const foreign=structuredClone(childNode);foreign.data.lcos_execution_ref.workspaceId=main.id;assert.equal(check(foreign,{...native,nodes:[foreign]}).ready,false);S.getState().setSurfaceCanvasMap({});assert.equal(check().ready,false);S.getState().setSurfaceCanvasMap(rootMap);
 report.checks.push('GUI checks still reject mismatched Workspace, project, Canvas/API, stale live facts, foreign-worksite references and missing root mappings. No child permission is inferred from Surface kind alone.');
 host.canvasId=main.canvasId;host.currentCanvasId=main.canvasId;S.getState().setActiveWorkspaceId(main.id);const mainNative={...native,canvasId:main.canvasId,nodes:root.nodes};S.getState().setActiveSurface('workflow');assert.equal(check(rootNode,mainNative).ready,false);S.getState().setActiveSurface('main');assert.equal(check(rootNode,mainNative).ready,true);
 report.checks.push('Root Canvas behavior remains exact: a Main Run with the wrong active Surface is rejected, then accepted only when Main is active.');
 report.passed=true;report.providerExecution=false;report.modelExecuted=false;report.canvasId=canvasId;report.childRunId=childRun.run.id;
}catch(error){report.error=String(error.stack??error);process.exitCode=1}
finally{await facade?.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2))}
console.log(JSON.stringify({...report,output:out},null,2));
