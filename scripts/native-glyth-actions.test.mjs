import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {installedRoot} from '../lab/pilot/build-pilot.mjs';
const root=path.resolve(import.meta.dirname,'..'), require=createRequire(path.join(installedRoot,'package.json'));
const esbuild=require('esbuild'), ts=require('typescript');
const report={passed:false,checks:[],networkRequests:0,modelCalls:0,browser:false,productIntegration:false};
const output=path.join(root,'output/Glyth状态近场捷径_20261026');
await fs.mkdir(output,{recursive:true});
const temporary=await fs.mkdtemp(path.join(root,'.runtime/glyth-actions-'));
try {
 const moduleFile=path.join(temporary,'actions.mjs');
 await esbuild.build({entryPoints:[path.join(root,'lab/pilot/native-glyth-actions.ts')],outfile:moduleFile,bundle:true,format:'esm',platform:'node',target:'node22',logLevel:'warning'});
 const {resolveNativeGlythActions:resolve,resolveNativeGlythProgressItemId:progress}=await import(pathToFileURL(moduleFile));
 const caps={canSend:true,canDelegate:false,canResume:true,canFork:false,canSelectedContext:false,canBlankNew:false,canHandoff:false,
  canAnswerInput:true,canApprove:true,canCancel:true,canRecover:false,canOpenDiagnostics:true};
 const base={schemaVersion:1,projectId:'project',conversationId:'canonical',identity:{title:'搭档'},userState:'ready',relation:{targetRefs:[]},activity:{},recentReturns:[],capabilities:caps};
 const input=(patch={},extra={})=>({projectId:'project',conversationId:'canonical',entry:{status:'ready',projection:{...base,...patch},timeline:[],timelineStatus:'ready'},...extra});
 const review={returnId:'actual-return',title:'实际结果',status:'pending_review',returnedAt:'2026-10-26T00:00:00Z'};
 const pending={userState:'needs_user',activity:{activeRunId:'actual-run',pendingInputId:'actual-input'},recentReturns:[review]};
 const target=(section,other={})=>({projectId:'project',conversationId:'canonical',...(section?{section}:{}),...other});
 const before=JSON.stringify(input(pending));
 let model=resolve(input(pending));
 assert.equal(model.primary.id,'answer-input');assert.equal(model.primary.kind,'view');assert.deepEqual(model.primary.target,target('answer-input'));
 assert.deepEqual(model.more.map(x=>x.id),['open','session-options','session-diagnostics']);
 assert.equal(JSON.stringify(input(pending)),before);
 model=resolve(input({...pending,capabilities:{...caps,canAnswerInput:false},capabilityReasons:{canAnswerInput:'当前问题暂不能回答'}}));
 assert.equal(model.primary.id,'open');assert.equal(model.more.some(x=>x.id==='compose'||x.id==='answer-input'),false);
 assert.deepEqual(model.unavailable,[{id:'answer-input',label:'回答',reason:'当前问题暂不能回答'}]);
 report.checks.push('Original pending-input precedence over review; exact existing conversation/answer section; false capability is status text without filler buttons or invented continuation');

 model=resolve(input({userState:'needs_user',recentReturns:[review],capabilities:{...caps,canSend:false}}));
 assert.equal(model.primary.id,'review-result');assert.deepEqual(model.primary.target,target('review-result'));
 model=resolve(input({userState:'needs_user',recentReturns:[review],capabilities:{...caps,canApprove:false}}));
 assert.equal(model.primary.id,'open');assert.equal(model.unavailable[0].id,'review-result');
 report.checks.push('Original review priority/capability reused; disconnected canSend=false does not block reading or independently permitted review entry');

 const healthy={schemaVersion:1,projectId:'project',operationId:'healthy-original',connectedConversationId:'canonical',status:'attaching',cancel:'none',
  steps:{external_create:'confirmed',core_bind:'confirmed',attach:'not_started',projection:'not_started'},allowedActions:[{action:'cancel_request',requiresFreshRead:true}]};
 const attention={...healthy,operationId:'attention-original',steps:{...healthy.steps,attach:'failed'}};
 const diagnostics=(operations,status='ready',conversationId='canonical')=>({status,value:{conversationId,operations}});
 for(const state of ['recoverable','recovering','blocked']) {
  model=resolve(input({recovery:{state},capabilities:{...caps,canRecover:true}}));
  assert.equal(model.primary.id,'recover-session');assert.deepEqual(model.primary.target,target('recover-session'));
 }
 model=resolve(input({recovery:{state:'blocked'}},{diagnostics:diagnostics([attention])}));
 assert.equal(model.primary.id,'session-diagnostics');assert.deepEqual(model.primary.target,target('session-diagnostics'));
 const recoveryInput={recovery:{state:'recoverable'},capabilities:{...caps,canRecover:true}};
 model=resolve(input(recoveryInput,{diagnostics:diagnostics([healthy,attention,{...attention,operationId:'foreign',projectId:'elsewhere'}])}));
 assert.deepEqual(model.primary.target,target('recover-session',{continuationOperationId:'attention-original'}));
 for(const read of [diagnostics([attention],'loading'),diagnostics([attention],'error'),diagnostics([attention],'ready','other'),diagnostics([healthy]),
  diagnostics([attention,{...attention,operationId:'another-original'}])]) {
  assert.deepEqual(resolve(input(recoveryInput,{diagnostics:read})).primary.target,target('recover-session'));
 }
 model=resolve(input({}, {diagnostics:diagnostics([healthy])}));assert.equal(model.primary.id,'compose');
 report.checks.push('Recovery only navigates original section; optional already-read canonical unique NeedsAttention operation is exact; missing/error/ambiguous/foreign/healthy attaching never guesses a request or creates a false fault');

 for(const state of ['thinking','working']) {
  model=resolve(input({userState:state,activity:{activeRunId:'actual-active-run'}}));
  assert.equal(model.primary.id,'view-progress');assert.deepEqual(model.primary.target,target('view-progress'));
  const stop=model.more.find(x=>x.id==='cancel-work');assert.ok(stop);assert.equal(stop.kind,'view');assert.deepEqual(stop.target,target('cancel-work'));
  assert.equal(model.more.some(x=>x.id==='compose'),false);
 }
 for(const patch of [{capabilities:{...caps,canCancel:false}},{activity:{}}]) {
  assert.equal(resolve(input({userState:'working',activity:{activeRunId:'active'},...patch})).more.some(x=>x.id==='cancel-work'),false);
 }
 report.checks.push('Working/thinking reuse original progress entry; cancel-work only addresses original confirmation section when actual Run and canCancel exist, with no cancellation command');

 for(const state of ['ready','done']) {
  model=resolve(input({userState:state}));assert.equal(model.primary.id,'compose');assert.equal(model.primary.kind,'compose');assert.deepEqual(model.primary.target,target());
  model=resolve(input({userState:state,capabilities:{...caps,canSend:false},capabilityReasons:{canSend:'会话已断开，请重新连接。'}}));
  assert.equal(model.primary.id,'session-options');assert.equal(model.primary.kind,'view');assert.equal(model.primary.label,'重新连接…');assert.deepEqual(model.primary.target,target('session-options'));assert.equal(model.unavailable[0].reason,'会话已断开，请重新连接。');
  assert.ok(model.more.find(x=>x.id==='session-diagnostics'));assert.ok(model.more.find(x=>x.id==='open'));assert.equal(model.more.some(x=>x.id==='session-options'),false);
 }
 for(const state of ['needs_user','unavailable'])assert.equal(resolve(input({userState:state})).primary.id,'open');
 for(const entry of [undefined,{status:'loading',projection:base},{status:'error',projection:base},{status:'ready',projection:{...base,projectId:'other'}},{status:'ready',projection:{...base,conversationId:'other'}}]) {
  model=resolve(input({}, {entry}));assert.equal(model.primary.id,'open');assert.equal(model.unavailable.length,0);assert.equal(model.more.some(x=>x.kind==='compose'),false);
 }
 assert.equal(resolve({...input(),projectId:''}),undefined);assert.equal(resolve({...input(),conversationId:'  '}),undefined);
 report.checks.push('Ready/done compose permission remains original; disconnected can still read original history/requests/options; unready, unavailable and mismatched identities never become send-ready');

 // Evaluate the actual route with explicit read-only dispatch ports; default shell port is never invoked.
 const routeSource=await fs.readFile(path.join(root,'lab/pilot/native-task-route.ts'),'utf8');
 const routeFile=ts.createSourceFile('native-task-route.ts',routeSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
 const declarations=['isNativeChatConversationSection','address','request','requestNativeConversationView'];
 const routeParts=routeFile.statements.filter(node=>declarations.some(name=>node.name?.text===name||ts.isVariableStatement(node)&&node.declarationList.declarations.some(row=>row.name.getText(routeFile)===name)));
 assert.equal(routeParts.length,declarations.length);
 const routeCode=ts.transpileModule(routeParts.map(node=>node.getText(routeFile).replace(/^export /,'')).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
 const requestView=new Function('CustomEvent',routeCode+'\nreturn requestNativeConversationView;')(CustomEvent);
 const events=[], ports={projectId:()=> 'project',dispatch:event=>{events.push(event);return true;}};
 const cases=[input(pending),input({recentReturns:[review]}),input(recoveryInput,{diagnostics:diagnostics([attention])}),input({userState:'working',activity:{activeRunId:'actual-run'}}),input({capabilities:{...caps,canSend:false}})];
 for(const scenario of cases) {
  const snapshot=resolve(scenario);for(const action of [snapshot.primary,...snapshot.more].filter(x=>x.kind==='view')) {
   const count=events.length;assert.equal(requestView(action.target,ports),true);assert.equal(events.length,count+2);
   assert.equal(events[count].type,'lcos-native-select-conversation');assert.deepEqual(events[count].detail,action.target);
   assert.equal(events[count+1].type,'lcos-native-open-conversation');
  }
 }
 const count=events.length;assert.equal(requestView(target('answer-input'),{...ports,projectId:()=> 'different'}),false);assert.equal(events.length,count);
 assert.equal(events.some(event=>/send|recover|cancel|prepare|connect/.test(event.type)),false);
 report.checks.push('Every view target executes the actual existing requestNativeConversationView function with exact section/operation and same right-rail events; foreign live project dispatches nothing; zero mutation/prepare events');

 // All six user states retain the exact original primary command choice across permission changes.
 const originalPath=path.join(root,'lcos/apps/web-gen2/src/interaction/nodeCommandModel.ts');
 const originalOut=path.join(temporary,'original.mjs');await esbuild.build({entryPoints:[originalPath],outfile:originalOut,bundle:true,format:'esm',platform:'node',logLevel:'warning'});
 const original=await import(pathToFileURL(originalOut));
 let combinations=0;
 for(const userState of ['ready','done','thinking','working','needs_user','unavailable'])for(const field of ['canSend','canAnswerInput','canApprove','canRecover','canCancel'])for(const enabled of [true,false]) {
  const scenario=input({userState,capabilities:{...caps,[field]:enabled}}),model=resolve(scenario);
  const commands=original.buildLcosNodeCommands({nodeType:'note',entityType:'conversation',entityId:'canonical',capabilities:[],referenced:false,conversation:scenario.entry.projection});
  const expected=commands.find(command=>command.primary!==false&&command.disabledReason===undefined);
  const reconnect=commands.some(command=>command.id==='compose'&&command.disabledReason!==undefined)
   && scenario.entry.projection.capabilities.canSend===false && scenario.entry.projection.capabilities.canResume===true;
  assert.equal(model.primary.id,reconnect?'session-options':expected.id);combinations++;
 }
 report.checks.push(`Actual original command model parity across ${combinations} state/capability combinations except the explicit disconnected compose-to-original-options read-only adapter`);
 const progressRow=(itemId,kind,runId,occurredAt='2026-10-26T01:00:00Z')=>({schemaVersion:1,itemId,kind,title:itemId,occurredAt,refs:{runId}});
 const currentProgress=[progressRow('previous-run','progress','old-run'),progressRow('actual-start','work_started','current-run','2026-10-26T09:00:00Z'),
  progressRow('actual-latest','progress','current-run','2026-10-26T01:00:00Z'),progressRow('other-run-later','progress','old-run','2026-10-26T11:00:00Z')];
 const withTimeline=(timeline,patch={},extra={})=>input({userState:'working',activity:{activeRunId:'current-run'},...patch},
  {entry:{status:'ready',projection:{...base,userState:'working',activity:{activeRunId:'current-run'},...patch},timelineStatus:'ready',timeline,...extra}});
 assert.equal(progress(withTimeline(currentProgress)),'actual-latest','Preserve Core sequence, never re-sort by a timestamp');
 assert.equal(progress(withTimeline(currentProgress.slice(0,2))),'actual-start','Actual same-Run start is valid when no subsequent progress exists');
 for(const timeline of [[],[progressRow('unrelated','progress','old-run')],[progressRow('message-is-not-progress','user_message','current-run')],
  [progressRow('bad-id','progress','current-run')].map(row=>({...row,itemId:' '})),[{...progressRow('no-run','progress','current-run'),refs:{}}]])assert.equal(progress(withTimeline(timeline)),undefined);
 for(const extra of [{status:'error'},{status:'loading'},{timelineStatus:'error'},{timelineStatus:undefined}])assert.equal(progress(withTimeline(currentProgress,{},extra)),undefined);
 for(const patch of [{activity:{}},{activity:{activeRunId:' '}},{projectId:'other'},{conversationId:'other'}])assert.equal(progress(withTimeline(currentProgress,patch)),undefined);
 assert.equal(progress({...withTimeline(currentProgress),projectId:'other'}),undefined);
 report.checks.push('Progress focus resolves only the last Core-ordered progress/work_started item for the exact live active Run and canonical owner; stale/error/old-Run/message rows return undefined without fabricated message ids');
 // Exact product-state fields from the parent-reported real b0b GET. This is a
 // controlled fixture, not a claim of a fresh browser/transport verification.
 const disconnectedProjection={...base,userState:'ready',activity:{},recentReturns:[],recovery:null,
  capabilities:{...caps,canSend:false,canResume:true,canRecover:true},capabilityReasons:{canSend:'会话已断开，请重新连接。'}};
 model=resolve(input(disconnectedProjection,{diagnostics:diagnostics([healthy])}));
 assert.equal(model.primary.id,'session-options');assert.equal(model.primary.label,'重新连接…');assert.equal(model.primary.kind,'view');
 assert.deepEqual(model.primary.target,target('session-options'));assert.equal(Object.hasOwn(model.primary.target,'continuationOperationId'),false);
 assert.equal(model.more.some(action=>action.id==='recover-session'),false);
 assert.equal(resolve(input({...disconnectedProjection,capabilities:{...disconnectedProjection.capabilities,canResume:false}})).primary.id,'open');
 for(const patch of [pending,{recentReturns:[review]},{recovery:{state:'recoverable'}},{userState:'working',activity:{activeRunId:'actual-run'}}]) {
  const owner={...disconnectedProjection,...patch};const expected=resolve(input({...owner,capabilities:{...owner.capabilities,canResume:false}}));
  assert.equal(resolve(input(owner)).primary.id,expected.primary.id,'A higher original state priority is never replaced by reconnect options');
 }
 const reconnectEvents=[];assert.equal(requestView(model.primary.target,{projectId:()=> 'project',dispatch:event=>{reconnectEvents.push(event);return true;}}),true);
 assert.deepEqual(reconnectEvents.map(event=>event.type),['lcos-native-select-conversation','lcos-native-open-conversation']);
 assert.deepEqual(reconnectEvents[0].detail,target('session-options'));
 report.checks.push('Parent-observed ready/canSend=false/canResume=true/canRecover=true/recovery=null/no-Run disconnected shape opens only original same-canonical options as Reconnect; no operation inference, connection/preparation or mutation; canResume=false falls back to reading and higher original priorities remain intact');
 const capturedPath=path.join(root,'output/Glyth状态近场捷径_20261026/断线原投影_GET_20261026.json');
 const capturedPayload=JSON.parse(await fs.readFile(capturedPath,'utf8')),captured=capturedPayload.value??capturedPayload.data??capturedPayload;
 assert.equal(captured.conversationId,'connected-conversation-b0b62164-091e-4656-b495-40da78541bf0');
 assert.equal(captured.capabilities.canSend,false);assert.equal(captured.capabilities.canResume,true);assert.equal(captured.recovery??null,null);assert.equal(captured.activity.activeRunId,undefined);
 const capturedInput={projectId:captured.projectId,conversationId:captured.conversationId,entry:{status:'ready',projection:captured,timeline:[],timelineStatus:'ready'}};
 const captureBefore=JSON.stringify(captured),actualCaptured=resolve(capturedInput);
 assert.equal(actualCaptured.primary.id,'session-options');assert.equal(actualCaptured.primary.label,'重新连接…');
 assert.deepEqual(actualCaptured.primary.target,{projectId:captured.projectId,conversationId:captured.conversationId,section:'session-options'});
 assert.equal(actualCaptured.primary.kind,'view');assert.equal(JSON.stringify(captured),captureBefore);
 assert.equal(resolve({...capturedInput,entry:{...capturedInput.entry,projection:{...captured,capabilities:{...captured.capabilities,canResume:false}}}}).primary.id,'open');
 report.checks.push('Saved exact real b0b GET projection is consumed unmodified: ready/disconnected/canResume with no recovery/Run maps to same-canonical original session-options; canResume=false control stays generic read-only open');
 report.passed=true;
} catch(error) {report.error=String(error.stack??error);process.exitCode=1;}
finally {assert.equal(path.dirname(temporary),path.join(root,'.runtime'));assert.ok(path.basename(temporary).startsWith('glyth-actions-'));await fs.rm(temporary,{recursive:true,force:true});}
await fs.writeFile(path.join(output,'纯动作映射专项.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));



