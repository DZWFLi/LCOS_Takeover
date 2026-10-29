import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {currentGen2Root} from '../lab/current-gen2-resources.mjs';
// Reports never need credentials, even when an upstream error happens to include them.
function redactLiveScopeEvidence(value) {
 const credential=/^(?:apikey|token|accesstoken|refreshtoken|idtoken|authtoken|sessiontoken|bearertoken|clientsecret|secret|password|authorization|cookie|setcookie|credentials?|privatekey|huabuhosttoken)$/i;
 const text=value=>value
  .replace(/\bBearer\s+[A-Za-z0-9._~+\/=:-]+/gi,'Bearer [REDACTED]')
  .replace(/(\b(?:Proxy-)?Authorization\s*:\s*)(?:Basic|Bearer)\s+[^\s\"'<>,;]+/gi,'$1[REDACTED]')
  .replace(/(\b(?:Set-Cookie|Cookie)\s*:\s*)[^\r\n]+/gi,'$1[REDACTED]')
  .replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g,'[REDACTED_API_KEY]')
  .replace(/([?&](?:api[_-]?key|access[_-]?token|refresh[_-]?token|auth[_-]?token|token|client[_-]?secret|secret|password)=)[^&#\s]+/gi,'$1[REDACTED]')
  .replace(/(\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|auth[_-]?token|token|client[_-]?secret|secret|password|authorization)\s*["']?\s*[:=]\s*)["'][^"'\r\n]+["']/gi,'$1"[REDACTED]"')
  .replace(/(\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|auth[_-]?token|token|client[_-]?secret|secret|password)\s*[:=]\s*)(?![\"'\[])[^\s,;}]+/gi,'$1[REDACTED]')
  .replace(/(https?:\/\/[^\s/:]+:)[^\s/@]+@/gi,'$1[REDACTED]@')
  .replace(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,'[REDACTED_PRIVATE_KEY]');
 const walk=value=>{
  if(typeof value==='string'){
   if(/^[\s]*[\[{]/.test(value))try{return JSON.stringify(walk(JSON.parse(value)));}catch{}
   return text(value);
  }
  if(Array.isArray(value))return value.map(walk);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,credential.test(key.replace(/[-_\s]/g,''))?'[REDACTED]':walk(item)]));
  return value;
 };
 return walk(value);
}
const evidenceJson=value=>JSON.stringify(redactLiveScopeEvidence(value),null,2);
if(process.argv.includes('--verify-redaction-only')){
 const fake='sk-syntheticcredential0123456789abcd',bearer='synthetic-access-credential';
 const raw={api_key:fake,headers:{Authorization:'Bearer '+bearer},nested:{accessToken:bearer,password:'synthetic-password'},
  body:JSON.stringify({clientSecret:fake,operationId:'op-unchanged',messageId:'message-unchanged'}),
  unquoted:'api_key='+fake+' token='+bearer+' client_secret='+bearer,
  basic:'Authorization: Basic '+bearer,cookies:'Cookie: session='+bearer,
  error:'Upstream Bearer '+bearer+' at https://127.0.0.1/path?token='+bearer+'; api_key="'+fake+'"',
  receipt:{externalSessionId:'external-unchanged',threadId:'thread-unchanged',contextResolution:[{ref:{type:'scope',scopeId:'scope-unchanged'},members:[{ref:{type:'note',id:'note-unchanged'},content:'原正文'}]}]}};
 const result=redactLiveScopeEvidence(raw),serialized=JSON.stringify(result);
 assert.ok(!serialized.includes(fake));assert.ok(!serialized.includes(bearer));assert.ok(!serialized.includes('synthetic-password'));
 assert.equal(result.receipt.externalSessionId,raw.receipt.externalSessionId);assert.deepEqual(result.receipt.contextResolution,raw.receipt.contextResolution);
 assert.equal(JSON.parse(result.body).operationId,'op-unchanged');assert.equal(JSON.parse(result.body).messageId,'message-unchanged');
 console.log(JSON.stringify({passed:true,checks:['credential fields, nested JSON, Bearer/API-key strings and query credentials redact','canonical identities, Scope members and ordinary text remain intact'],requests:0,modelCalls:0}));process.exit(0);
}
async function boundedCoreRead(read, matches, { timeoutMs = 180000, intervalMs = 750 } = {}) {
 const deadline=Date.now()+timeoutMs,controller=new AbortController();let timer;
 const expired=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('Original Core read did not confirm completion before the deadline; no mutation was replayed.'));},timeoutMs);});
 try{for(;;){const value=await Promise.race([read(controller.signal),expired]);if(matches(value)===true)return value;
  await Promise.race([new Promise(resolve=>setTimeout(resolve,Math.min(intervalMs,Math.max(1,deadline-Date.now())))),expired]);
 }}finally{clearTimeout(timer);controller.abort();}
}
if(process.argv.includes('--verify-local-waits-only')){
 let reads=0;const value=await boundedCoreRead(async()=>({ready:++reads===3}),value=>value.ready,{timeoutMs:1000,intervalMs:5});
 assert.equal(value.ready,true);assert.equal(reads,3);
 await assert.rejects(boundedCoreRead(async()=>false,value=>value,{timeoutMs:25,intervalMs:5}),/did not confirm completion/);
 await assert.rejects(boundedCoreRead(()=>new Promise(()=>{}),()=>true,{timeoutMs:25,intervalMs:5}),/did not confirm completion/);
 console.log(JSON.stringify({passed:true,checks:['awaits actual read results across false states','false never passes and deadline stops without a mutation','hung reads abort at the loop deadline'],requests:0,modelCalls:0}));process.exit(0);
}
const compareMessages=rows=>rows.map(row=>({id:row.id,sessionId:row.sessionId,seq:row.seq,role:row.role,eventKind:row.eventKind,contentText:row.contentText,sourceEventId:row.sourceEventId??null,fileRefs:row.fileRefs??[],createdAt:row.createdAt??null,parentId:row.parentId??null,contentHash:row.contentHash??null,toolName:row.toolName??null,toolCall:row.toolCall??null}));
function verifyLiveScopeConversation(messages,{baseline,prompt,index,priorComplete=baseline}){
 const expectedCount=baseline.length+index*2+1;
 assert.equal(messages.length,expectedCount,'Scope read includes complete prior turns plus this real pending user, and no invented assistant.');
 assert.equal(priorComplete.length,expectedCount-1);
 assert.deepEqual(compareMessages(messages.slice(0,priorComplete.length)),compareMessages(priorComplete),'Every prior complete message, including the previous new assistant reply, must remain unchanged.');
 assert.deepEqual(messages.map(row=>row.seq),Array.from({length:expectedCount},(_,n)=>n));
 assert.deepEqual(messages.map(row=>row.role),Array.from({length:expectedCount},(_,n)=>n%2?'assistant':'user'));
 assert.equal(messages.at(-1).contentText,prompt);
}
if(process.argv.includes('--verify-live-archive-only')){
 const row=(seq,content='text'+seq)=>({id:'message-'+seq,sessionId:'session-live',seq,role:seq%2?'assistant':'user',eventKind:seq%2?'agent_message':'user_message',contentText:content,sourceEventId:'source-'+seq,fileRefs:[]});
 const baseline=Array.from({length:4},(_,n)=>row(n)),first=[...baseline,row(4,'first')],second=[...baseline,row(4,'first'),row(5,'reply'),row(6,'second')];
 verifyLiveScopeConversation(first,{baseline,prompt:'first',index:0});verifyLiveScopeConversation(second,{baseline,prompt:'second',index:1,priorComplete:second.slice(0,6)});
 assert.throws(()=>verifyLiveScopeConversation(second.map((item,n)=>n===5?{...item,contentText:'rewritten new assistant'}:item),{baseline,prompt:'second',index:1,priorComplete:second.slice(0,6)}),/previous new assistant/);
 assert.throws(()=>verifyLiveScopeConversation([...first,row(5)],{baseline,prompt:'first',index:0}),/no invented assistant/);
 assert.throws(()=>verifyLiveScopeConversation(first.map((item,n)=>n===1?{...item,contentText:'rewritten'}:item),{baseline,prompt:'first',index:0}));
 assert.throws(()=>verifyLiveScopeConversation(first.map((item,n)=>n===4?{...item,role:'assistant'}:item),{baseline,prompt:'first',index:0}));
 assert.throws(()=>verifyLiveScopeConversation(second,{baseline,prompt:'wrong pending body',index:1,priorComplete:second.slice(0,6)}));
 console.log(JSON.stringify({passed:true,checks:['First and second self-Scope snapshots preserve four original messages and include exactly five/seven real rows','Missing, invented assistant, rewritten history and wrong pending prompt fail'],requests:0,modelCalls:0}));process.exit(0);
}
const archivedLiveReportFile=process.argv.find(arg=>arg.startsWith('--verify-archived-live-report='))?.slice('--verify-archived-live-report='.length);
if(archivedLiveReportFile){
 const archived=JSON.parse(await fs.readFile(archivedLiveReportFile,'utf8'));assert.equal(archived.passed,true);assert.equal(archived.submittedPrompts,2);
 const baseline=archived.baselineLiveMessages,first=archived.liveMessagesAfter1,final=archived.liveMessagesAfter2;assert.equal(baseline.length,4);assert.equal(first.length,6);assert.equal(final.length,8);
 for(let index=0;index<2;index++)for(const snapshot of archived['liveArchiveScopeSnapshot'+(index+1)])verifyLiveScopeConversation(snapshot.messages,{baseline,prompt:archived['message'+(index+1)].input.text,index,priorComplete:index===0?baseline:first});
 assert.deepEqual(first.slice(0,4),baseline);assert.deepEqual(final.slice(0,4),baseline);assert.deepEqual(final.slice(0,6),first);
 const result={passed:true,sourceReport:path.resolve(archivedLiveReportFile),requests:0,modelCalls:0,checks:['Second Scope snapshot preserves all six first-round complete messages, including the first new assistant reply','Final eight canonical messages retain the exact prior six rows and original four rows','Self-Scope snapshots contain exactly five/seven real messages without an invented pending assistant']};
 await fs.writeFile(path.join(path.dirname(archivedLiveReportFile),'归档增量后验核对.json'),evidenceJson(result));console.log(evidenceJson(result));process.exit(0);
}
const value=(name)=>process.argv.find(arg=>arg.startsWith('--'+name+'='))?.slice(name.length+3);
const origin=new URL(value('base-url')??'http://127.0.0.1:56311').origin;assert.equal(new URL(origin).hostname,'127.0.0.1');
const fixtureFile=value('fixture')??'output/混合Scope取用_20261022/fixture.json',fixture=JSON.parse(await fs.readFile(fixtureFile,'utf8')),projectId=fixture.projectId,prefix='/api/lcos/core/projects/'+projectId;
const connectOnly=process.argv.includes('--connect-only'),expectedLiveConversationId=value('expected-live-conversation'),inspectRecovery=value('inspect-recovery');
assert.ok(!inspectRecovery||['healthy','attention'].includes(inspectRecovery));
if(expectedLiveConversationId){assert.equal(fixture.liveConversationId,expectedLiveConversationId);assert.ok(Array.isArray(fixture.baselineLiveMessages));}
const resumeExistingConversationId=value('resume-existing-conversation'),inspectConversationId=value('inspect-conversation');
if(connectOnly)assert.ok(resumeExistingConversationId||(value('resume-operation')&&value('mode')==='continue_existing'&&value('source-conversation-id')),'Connect-only verifies original resume of an existing canonical owner; it never creates a replacement native session.');
const mode=resumeExistingConversationId?'continue_existing':value('mode')??'blank_new';assert.ok(['blank_new','selected_context','continue_existing'].includes(mode));
const output=path.resolve((connectOnly||expectedLiveConversationId||inspectRecovery?'output/健康恢复卡与断线续聊_20261023/真实页面/':'output/混合Scope真实续聊_20261022/真实页面/')+new Date().toISOString().replace(/[:.]/g,'-'));await fs.mkdir(output,{recursive:true});
const report={passed:false,connectOnly,expectedLiveConversationId,fixtureFile,inspectRecovery,preparedOnly:!process.argv.includes('--execute-live-ui'),origin,mode,output,checks:[],writes:[],screenshots:[],pageErrors:[],httpErrors:[],submittedPrompts:0,modelExecuted:false,
 notClaimed:['A create journal receipt is not proof that a provider session exists.','No hidden setter, imported-history rebind, fake transport, fake response or independent window is used.','Actual model/provider provenance must be supplied by the root live Host audit in addition to visible real assistant messages. The original attach/send adapter does not project runtimeScope in its receipts; that transport input requires the Host audit.']};
if(report.preparedOnly){
 report.flow=connectOnly?['Original history selects the exact existing canonical owner','Original continue-existing controls resume the same native/thread/transport/agentlet','Original healthy card is quiet, explicit requests preserve original cancellation, return restores quiet view','No collaboration-send is permitted; original four messages remain unchanged']:['Original title menu selects the preserved manual source','Original new-chat menu → existing session options → blank/selected-context confirm','Existing recovery actions create and bind one new canonical conversation, preserving source history','Same original right panel automatically chooses the newly bound target','Original Library Scope chip → original submit → live assistant reply','Second original submit in the same target/operation with a new messageId'];
 await fs.writeFile(path.join(output,'prepared-plan.json'),evidenceJson(report));console.log(JSON.stringify({preparedOnly:true,modelExecuted:false,output}));process.exit(0);
}
assert.ok(process.argv.includes('--send-real')||inspectConversationId||connectOnly,'The live-send test flag must be deliberate; the prepared-only phase never invokes a model.');
const get=async (route,signal)=>{const requestSignal=signal?AbortSignal.any([signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000);const response=await fetch(origin+route,{redirect:'error',cache:'no-store',signal:requestSignal}),body=await response.json();assert.ok(response.ok&&(body.ok===true||body.code===0),route+': '+evidenceJson(body));return body.value??body.data;};
const health=await(await fetch(origin+'/health',{signal:AbortSignal.timeout(20000)})).json();assert.equal(health.realCoreConnected,true);if(value('expected-pid'))assert.equal(health.pid,Number(value('expected-pid')));report.pid=health.pid;
const sourceId=inspectConversationId??resumeExistingConversationId??value('source-conversation-id')??fixture.conversationId,protectedSourceId=fixture.conversationId;
const protectedSource=async()=>{
 const [connected,sessions,timeline,graph]=await Promise.all([get(prefix+'/connected-conversations'),get(prefix+'/conversations'),get(prefix+'/connected-conversations/'+protectedSourceId+'/collaboration-timeline?limit=100'),get(prefix+'/graph')]);
 const source=connected.find(row=>row.id===protectedSourceId);assert.ok(source?.conversationSessionId);const session=sessions.find(row=>row.id===source.conversationSessionId);assert.ok(session);
 const artifact=graph.artifacts.find(row=>row.id===session.conversationArtifactId),view=graph.artifactViews.find(row=>row.id===session.conversationViewId);
 return{source,session,timeline,artifact,view,revisions:graph.artifactRevisions.filter(row=>row.artifactId===artifact?.id)};
};
const beforeSource=await protectedSource(),beforeProjection=await get(prefix+'/execution-projection');
const sourceConnected=(await get(prefix+'/connected-conversations')).find(row=>row.id===sourceId);assert.ok(sourceConnected);
const sourceSession=(await get(prefix+'/conversations')).find(row=>row.id===sourceConnected.conversationSessionId);assert.ok(sourceSession);
const sourceMessagesBefore=mode==='continue_existing'?await get(prefix+'/conversations/'+sourceSession.id+'/messages?limit=1000'):undefined;
const protectedOperationIds=[...new Set(process.argv.filter(arg=>arg.startsWith('--protect-operation=')).flatMap(arg=>arg.slice('--protect-operation='.length).split(',')).filter(Boolean))],protectedOperations=new Map();
for(const id of protectedOperationIds){const op=await get(prefix+'/conversation-continuations/'+id);assert.equal(op.projectId,projectId);protectedOperations.set(id,op);}
report.protectedOperationIds=protectedOperationIds;
let directCore;
if(value('core-base')){
 const url=new URL(value('core-base'));assert.equal(url.protocol,'http:');assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/');assert.equal(url.username,'');assert.equal(url.password,'');
 const status=await(await fetch(url.origin+'/health',{signal:AbortSignal.timeout(20000)})).json();assert.equal(status.service,'local-core');
 const pids=execFileSync('powershell.exe',['-NoProfile','-Command',`(Get-NetTCPConnection -LocalPort ${Number(url.port)} -State Listen).OwningProcess | Select-Object -Unique`],{encoding:'utf8',windowsHide:true}).trim().split(/\s+/).filter(Boolean).map(Number);assert.deepEqual(pids,[health.pid]);
 const graph=await(await fetch(url.origin+'/projects/'+projectId+'/graph',{signal:AbortSignal.timeout(20000)})).json();assert.equal(graph.ok,true);assert.deepEqual(graph.value,await get(prefix+'/graph'));directCore=url.origin;report.directCoreRead={base:directCore,pid:health.pid,onlyRoute:'GET /projects/:projectId/conversations/:sessionId/messages'};
}
const liveMessages=async signal=>{assert.ok(expectedLiveConversationId);const route='/projects/'+projectId+'/conversations/'+encodeURIComponent(fixture.liveConversationSessionId)+'/messages?offset=0&limit=100';if(!directCore)return get('/api/lcos/core'+route,signal);const response=await fetch(directCore+route,{redirect:'error',cache:'no-store',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000)}),body=await response.json();assert.ok(response.ok&&body.ok===true);return body.value;};
const beforeLiveMessages=expectedLiveConversationId?await liveMessages():null;
if(beforeLiveMessages){assert.equal(sourceId,expectedLiveConversationId);assert.equal(beforeLiveMessages.length,4,'Two original complete turns are required before this validation; do not rerun successful sends.');assert.deepEqual(compareMessages(beforeLiveMessages),compareMessages(fixture.baselineLiveMessages));assert.deepEqual(beforeLiveMessages.map(row=>row.role),['user','assistant','user','assistant']);report.baselineLiveMessages=beforeLiveMessages;}
const verifyProtectedOperations=async()=>{for(const[id,op]of protectedOperations)assert.deepEqual(await get(prefix+'/conversation-continuations/'+id),op,'Prior operation and its frozen messages must remain unchanged: '+id);report.protectedOperationsUnchanged=true;};
const {chromium}=createRequire(path.join(currentGen2Root,'package.json'))('playwright-core');let browser,page,operationId,newConversationId;
const sends=[],operations=[],priorFailedMessages=[],resumeOperationId=value('resume-operation');
if(resumeOperationId){assert.ok(resumeOperationId.trim());operationId=resumeOperationId;report.flowKind='resume-existing-operation-through-original-recovery-and-menu';report.resumedOperationId=resumeOperationId;}else report.flowKind=inspectConversationId?'existing-conversation-read-only-stable-ui':resumeExistingConversationId?'original-continue-existing-automatic-recovery':'original-new-session-automatic-connect';
assert.ok(!(resumeOperationId&&resumeExistingConversationId),'Select one existing-operation or canonical-resume path.');
try{
 browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-networking','--disable-sync','--no-first-run']});
 const context=await browser.newContext({viewport:{width:1500,height:1000},locale:'zh-CN',serviceWorkers:'block'});
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());if(['http:','https:'].includes(url.protocol)&&url.origin!==origin)return route.abort();
  if(!['GET','HEAD','OPTIONS'].includes(request.method())){
   const receipt={method:request.method(),path:url.pathname,body:'[omitted outside supported flow]',permitted:false};report.writes.push(receipt);
   if(inspectConversationId){receipt.reason='Read-only existing conversation inspection blocks every POST and other mutation';return route.abort();}
   if(url.pathname==='/api/events'){receipt.permitted=true;receipt.phase='local-ui-events';return route.continue();}
   if(request.method()==='POST'&&url.pathname===prefix+'/conversation-continuations'){
    assert.ok(!resumeOperationId,'A resumed original operation must never create another intent.');const parsed=JSON.parse(request.postData()),input=parsed.input??parsed;assert.equal(input.mode,mode);assert.equal(input.connectedConversationId,sourceId);assert.ok(!operationId||operationId===input.operationId);
    operationId=input.operationId;receipt.body=input;receipt.permitted=true;receipt.phase=mode==='continue_existing'?'original-existing-session-resume-intent':'original-new-session-intent';operations.push(input);await fs.writeFile(path.join(output,'真实操作意图.json'),evidenceJson(report.writes));return route.continue();
   }
   if(request.method()==='POST'&&operationId&&url.pathname===prefix+'/conversation-continuations/'+operationId+'/recovery-actions'){
    const parsed=JSON.parse(request.postData()),input=parsed.input??parsed;assert.ok(['recover_external','recover_bind','reconcile'].includes(input.action));assert.ok(Number.isSafeInteger(input.expectedRevision));receipt.body=input;
    if(process.argv.includes('--inject-first-recovery-loss')&&!report.autoRecoveryAborted&&input.action==='recover_external'){
      assert.equal(mode,'continue_existing');assert.ok(connectOnly);report.autoRecoveryAborted=true;receipt.permitted=false;receipt.phase='injected-before-Core-recovery';await fs.writeFile(path.join(output,'真实操作意图.json'),evidenceJson(report.writes));return route.abort();
    }
    receipt.permitted=true;receipt.phase='original-recovery-action';await fs.writeFile(path.join(output,'真实操作意图.json'),evidenceJson(report.writes));return route.continue();
   }
   if(request.method()==='POST'&&url.pathname.endsWith('/collaboration-send')&&connectOnly){receipt.reason='Connect-only phase forbids all model sends';return route.abort();}
   if(request.method()==='POST'&&newConversationId&&url.pathname===prefix+'/connected-conversations/'+newConversationId+'/collaboration-send'){
    const input=JSON.parse(request.postData());assert.equal(input.conversationId,newConversationId);assert.equal(input.continuationOperationId,operationId);assert.ok(input.messageId);assert.ok(sends.length<2,'Two explicit live prompts only; unknown sends are never replayed by this script.');
    assert.ok(!sends.some(previous=>previous.messageId===input.messageId));assert.deepEqual(input.orderedReferences?.map(item=>({...item,mode:item.mode??'full'})),[{ref:{type:'scope',scopeId:fixture.scopeId},order:0,mode:'full'}]);
    sends.push(input);report.submittedPrompts=sends.length;receipt.body=input;receipt.permitted=true;receipt.phase='original-live-continuation-send';await fs.writeFile(path.join(output,'真实操作意图.json'),evidenceJson(report.writes));return route.continue();
   }
   receipt.reason='Not part of the authorized original new-session/continuation flow';return route.abort();
  }
  if(url.pathname==='/lcos/agent-ui.js'){
   const response=await route.fetch({timeout:90000}),source=await response.text();return route.fulfill({response,body:source+'\nwindow.__LIVE_SCOPE_READ__=()=>{const s=useLcosShellStore.getState();return{projectId:s.projectId,prompt:s.composerPrompt,target:s.composerTarget,caret:s.composerCaret,windows:s.windows,refs:useLcosReferenceStore.getState().draft.orderedEntityRefs,document:performance.timeOrigin}};'});
  }
  return route.continue();
 });
 await context.routeWebSocket('**/*',socket=>socket.close());
 page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',error=>report.pageErrors.push(String(error)));page.on('response',response=>{if(response.status()>=400)report.httpErrors.push({status:response.status(),path:new URL(response.url()).pathname});});
 const read=()=>page.evaluate(()=>window.__LIVE_SCOPE_READ__());
 const screenshotOptions=()=>({mask:[page.locator('input[type="password"],input[autocomplete*="password"],input[name*="token" i],input[name*="api_key" i],input[name*="apiKey" i],input[name*="secret" i]'),page.getByText(/(?:sk-[A-Za-z0-9_-]{16,}|Bearer\s+[A-Za-z0-9._~+\/=:-]{12,})/)],maskColor:'#d9d9d9'});
 const shot=async name=>{const file=path.join(output,name+'.png');await page.screenshot({path:file,...screenshotOptions()});report.screenshots.push(file);};
 const input=page.getByRole('textbox',{name:'Composer 输入',exact:true}),header=page.locator('[data-lcos-native-chat-header]'),library=page.locator('[data-library-view="library"]'),preview=page.locator('.native-library-content-preview');
 const selectOriginalConversation=async(menu,id,label)=>{
  // The original Header maps the Core list in this same order; equal display titles are not identities.
  const rows=(await get(prefix+'/connected-conversations')).filter(row=>!row.conversationRef.startsWith('pending-')&&row.label===label);
  const index=rows.findIndex(row=>row.id===id);assert.ok(index>=0);
  const choices=menu.getByText(label,{exact:true});assert.equal(await choices.count(),rows.length,'Original menu must display the same canonical title cohort.');
  await choices.nth(index).click();await page.waitForFunction(id=>window.__LIVE_SCOPE_READ__().target?.receiverConversationId===id,id);
  (report.originalMenuSelections??=[]).push({conversationId:id,label,matchingRows:rows.length,visibleIndex:index});
 };
 const inspectOriginalRecoveryRequests=async({expected='healthy',operationIds=[]}={})=>{
  const cards=page.locator('[data-native-chat-operation]');
  if(expected==='healthy')await boundedCoreRead(async()=>({count:await cards.count()}),row=>row.count===0,{timeoutMs:30000,intervalMs:350});
  else await cards.first().waitFor();
  const defaultRows=await cards.evaluateAll(rows=>rows.map(row=>row.getAttribute('data-native-chat-operation')));
  if(expected==='healthy')assert.deepEqual(defaultRows,[]);else assert.ok(defaultRows.length>0);
  await shot('06-default-'+expected+'-recovery-state');
  const toggle=page.locator('[data-lcos-conversation-continuation] [aria-expanded="false"]');if(await toggle.count())await toggle.click();
  await page.locator('[data-native-open-conversation-requests]').click();await page.locator('[data-native-chat-requests]').waitFor();
  for(const id of operationIds){const row=page.locator('[data-native-chat-operation="'+id+'"]');await row.waitFor();const op=await get(prefix+'/conversation-continuations/'+id);for(const action of op.allowedActions??[]){const button=row.locator('[data-lcos-recovery-action="'+action.action+'"]');await button.waitFor();assert.equal(await button.isEnabled(),true,'Explicit original request action remains available: '+action.action);}}
  const explicitRows=await cards.evaluateAll(rows=>rows.map(row=>row.getAttribute('data-native-chat-operation')));assert.ok(explicitRows.length>0);
  await shot('07-original-explicit-conversation-requests');
  await page.locator('[data-native-chat-requests]').getByRole('button',{name:'返回对话',exact:true}).click();await page.locator('[data-native-chat-requests]').waitFor({state:'hidden'});
  if(expected==='healthy')await boundedCoreRead(async()=>({count:await cards.count()}),row=>row.count===0,{timeoutMs:30000,intervalMs:350});
  else assert.ok(await cards.count()>0,'Returning from explicit requests must preserve real attention states.');
  assert.equal((await read()).target?.receiverConversationId,sourceId,'Viewing requests does not replace the current conversation.');
  report.recoveryVisibility={expected,defaultRows,explicitRows,returnedRows:await cards.evaluateAll(rows=>rows.map(row=>row.getAttribute('data-native-chat-operation'))),actionsInspectedOnly:true};
  report.checks.push('Original options open requests in the same panel; original actions remain visible and enabled without clicking; return restores the business-attention view');
 };
 const takeScope=async()=>{if(!await library.isVisible())await page.getByTestId('canvas-dockbar-assets-btn').click();await library.getByRole('textbox',{name:'搜索',exact:true}).fill(fixture.scopeTitle);await library.getByRole('button',{name:fixture.scopeTitle,exact:true}).click();await preview.getByRole('button',{name:'用于当前对话',exact:true}).click();await preview.waitFor({state:'hidden'});await page.locator('[data-lcos-composer-ref]').first().waitFor();const s=await read();assert.equal(s.refs.length,1);assert.equal(s.refs[0].entityType,'scope');assert.equal(s.refs[0].entityId,fixture.scopeId);};
 await page.goto(origin+'/canvas/surface-core-main',{waitUntil:'domcontentloaded',timeout:120000});await page.locator('[data-lcos-professional-surface-state="ready"]').waitFor({state:'attached',timeout:90000});await input.waitFor();const documentId=(await read()).document;
 await header.getByRole('button',{name:'选择对话',exact:true}).click();let menu=page.locator('[data-lcos-native-chat-history]:visible');await selectOriginalConversation(menu,sourceId,sourceConnected.label);
 await page.waitForFunction(id=>window.__LIVE_SCOPE_READ__().target?.receiverConversationId===id,sourceId);
 if(inspectConversationId){
  const samples=[];let stable=0;
  const final=await boundedCoreRead(async()=>({ui:await read(),blocked:await page.locator('[data-lcos-composer-continuation-blocked]').allTextContents()}),value=>{
   samples.push({at:new Date().toISOString(),targetId:value.ui.target?.receiverConversationId,blocked:value.blocked});
   if(value.ui.target?.receiverConversationId===inspectConversationId&&value.ui.target?.continuationOperationId&&value.ui.target?.messageId&&(inspectRecovery==='attention'||value.blocked.length===0))stable++;else stable=0;
   return stable>=3;
  },{timeoutMs:60000,intervalMs:500});
  if(inspectRecovery!=='attention')await page.getByText('真实续聊验证二',{exact:true}).last().waitFor();
  if(inspectRecovery)await inspectOriginalRecoveryRequests({expected:inspectRecovery,operationIds:protectedOperationIds});
  await shot('05-existing-conversation-stable-read-only');
  report.ui=final.ui;report.stableFeedbackSamples=samples;report.dom=await page.locator('body').innerText();
  if(inspectRecovery!=='attention')assert.ok(report.dom.includes('真实续聊验证一')&&report.dom.includes('真实续聊验证二'));
  await verifyProtectedOperations();
  assert.equal(report.writes.filter(row=>row.permitted&&row.method==='POST').length,0);assert.deepEqual(await protectedSource(),beforeSource);
  report.checks.push('Read-only original history-menu selection shows both existing replies after three stable ready samples; every POST is blocked, no model/new/recovery/send action runs');
  report.passed=true;report.modelExecuted=false;report.newPosts=0;
 }else{
 let operation;
 if(resumeOperationId){
  operation=await get(prefix+'/conversation-continuations/'+operationId);assert.equal(operation.projectId,projectId);assert.equal(operation.requestConnectedConversationId,sourceId);assert.equal(operation.mode,mode);report.resumedOperationAlreadyBoundAtStart=operation.steps.core_bind==='confirmed';
  assert.ok(!(operation.promptReceipts??[]).some(row=>[row.receipt,row.attachReceipt,row.sendReceipt].filter(Boolean).some(receipt=>receipt.outcome==='outcome_unknown'||receipt.error?.outcomeUnknown===true)),'An unknown original message must be read back before any new send; this script never bypasses it.');
  priorFailedMessages.push(...(operation.promptReceipts??[]).filter(row=>row.attachReceipt?.outcome==='failed'&&row.attachReceipt.error?.outcomeUnknown===false&&!row.sendReceipt));
  report.priorFailedMessages=priorFailedMessages.map(row=>({messageId:row.messageId,attachOutcome:row.attachReceipt.outcome,errorCode:row.attachReceipt.error?.code,outcomeUnknown:false,hasSendReceipt:false}));
  if(mode==='continue_existing')assert.ok(sourceSession.originMeta?.continuationExternalSessionId,'An existing native owner must be explicit before retrying its original recovery.');
  else assert.equal(operation.steps.external_create,'confirmed','Resume only the existing confirmed external owner; never create another provider session.');
 }else{
  if(mode==='selected_context')await takeScope();
  if(resumeExistingConversationId){
   const toggle=page.locator('[data-lcos-conversation-continuation] [aria-expanded="false"]');if(await toggle.count())await toggle.click();
  }else{await header.getByRole('button',{name:'选择对话',exact:true}).click();menu=page.locator('[data-lcos-native-chat-history]:visible');await menu.getByText('新建对话…',{exact:true}).click();}
  const controls=page.locator('[data-lcos-conversation-continuation]');await controls.waitFor();await controls.locator('input[value="'+mode+'"]').check();const confirm=controls.locator('[data-lcos-continuation-confirm]');await boundedCoreRead(async()=>confirm.isEnabled(),enabled=>enabled,{timeoutMs:60000,intervalMs:250});
  await shot('01-original-session-options');const intentResponsePromise=page.waitForResponse(response=>response.request().method()==='POST'&&new URL(response.url()).pathname===prefix+'/conversation-continuations',{timeout:195000});await confirm.click();const intentResponse=await intentResponsePromise,intentResult=await intentResponse.json();assert.ok(intentResponse.ok()&&intentResult.ok,evidenceJson(intentResult));
  assert.ok(operationId);operation=await get(prefix+'/conversation-continuations/'+operationId);
 }
 if(resumeOperationId||process.argv.includes('--recover-via-original-controls')){
  if(process.argv.includes('--inject-first-recovery-loss')){
   await boundedCoreRead(async()=>({aborted:report.autoRecoveryAborted}),row=>row.aborted===true,{timeoutMs:30000,intervalMs:100});
   await page.locator('[data-native-chat-connection="'+operationId+'"] button').waitFor();
   const toggle=page.locator('[data-lcos-conversation-continuation] [aria-expanded="false"]');if(await toggle.count())await toggle.click();
   await page.locator('[data-native-open-conversation-requests]').click();await page.locator('[data-native-chat-requests]').waitFor();
  }
  for(let phase=0;phase<4&&operation.steps.core_bind!=='confirmed';phase++){
   const action=operation.allowedActions.find(item=>item.action===(operation.steps.external_create==='confirmed'?'recover_bind':'recover_external'));
   assert.ok(action,'Original operation must expose a safe create/bind recovery action.');if(resumeOperationId&&mode!=='continue_existing')assert.equal(action.action,'recover_bind');
   const button=page.locator('[data-native-chat-operation="'+operationId+'"] [data-lcos-recovery-action="'+action.action+'"]');await button.waitFor();assert.equal(await button.isEnabled(),true);
   await shot('01-resume-original-bind');
   const recoveryResponsePromise=page.waitForResponse(response=>response.request().method()==='POST'&&new URL(response.url()).pathname===prefix+'/conversation-continuations/'+operationId+'/recovery-actions',{timeout:195000});await button.click();
   const recoveryResponse=await recoveryResponsePromise,recoveryResult=await recoveryResponse.json();assert.ok(recoveryResponse.ok()&&recoveryResult.ok,evidenceJson(recoveryResult));operation=await get(prefix+'/conversation-continuations/'+operationId);
  }
 }else{
  operation=await boundedCoreRead(signal=>get(prefix+'/conversation-continuations/'+operationId,signal),row=>{
   if(row.status==='outcome_unknown'||Object.values(row.steps).some(step=>step==='outcome_unknown'||step==='failed'))throw new Error('Original automatic connection was not confirmed; inspect the same operation without recreating.');
   return row.steps.external_create==='confirmed'&&row.steps.core_bind==='confirmed';
  });
 }
 assert.equal(operation.requestConnectedConversationId,sourceId);assert.equal(operation.steps.external_create,'confirmed');assert.equal(operation.steps.core_bind,'confirmed');assert.ok(operation.externalEvidence?.externalSessionId);newConversationId=operation.connectedConversationId;
 if(resumeExistingConversationId||mode==='continue_existing'){
  assert.equal(newConversationId,sourceId,'Continue-existing must retain the same canonical target.');
  for(const [field,key]of [['externalSessionId','continuationExternalSessionId'],['threadId','continuationThreadId'],['transportSessionId','continuationTransportSessionId'],['agentletId','continuationAgentletId']]){
   assert.ok(sourceSession.originMeta?.[key],'Trusted source owner must be explicit.');assert.equal(operation.externalEvidence[field],sourceSession.originMeta[key],'Resume cannot replace '+field);
  }
 }else assert.ok(newConversationId&&newConversationId!==sourceId,'New session must have a distinct canonical target.');
 if(resumeOperationId){
  const target=(await get(prefix+'/connected-conversations')).find(row=>row.id===newConversationId);assert.ok(target);
  await header.getByRole('button',{name:'选择对话',exact:true}).click();menu=page.locator('[data-lcos-native-chat-history]:visible');
  await selectOriginalConversation(menu,newConversationId,target.label);
 }
 await page.waitForFunction(({id,op})=>{const s=window.__LIVE_SCOPE_READ__();return s.target?.intent==='continue'&&s.target.receiverConversationId===id&&s.target.continuationOperationId===op&&!!s.target.messageId;},{id:newConversationId,op:operationId},{timeout:60000});
 assert.deepEqual(await protectedSource(),beforeSource,'New session must not overwrite manual source identity, archive, body or messages.');
 const connected=(await get(prefix+'/connected-conversations')).find(row=>row.id===newConversationId),sessions=await get(prefix+'/conversations'),session=sessions.find(row=>row.id===connected.conversationSessionId);assert.ok(session);if(resumeExistingConversationId||mode==='continue_existing')assert.equal(session.id,sourceSession.id);else assert.notEqual(session.id,beforeSource.session.id);assert.equal(session.originMeta.continuationExternalSessionId,operation.externalEvidence.externalSessionId);assert.equal(session.originMeta.continuationProvider,operation.provider);
 const capability=await get(prefix+'/connected-conversations/'+newConversationId+'/collaboration-session');assert.equal(capability.capabilities.canSend,true);await shot('02-created-bound-new-target');report.created={operation,connected,session,capability};
 report.checks.push(resumeOperationId?(report.resumedOperationAlreadyBoundAtStart?'Previously bound original operation opened through original history menu; no repeated bind, replacement session or new intent; source archive unchanged':'Existing original operation recovered through its original bind action and original history-menu selection; no replacement session or new create intent; source archive unchanged'):(resumeExistingConversationId?'Original continue-existing controls restore the exact original native/thread/transport/canonical owner and choose the new confirmed operation in the same input; manual source history unchanged':'Original new-chat/options creates and binds a distinct actual provider session; source archive unchanged and original panel automatically selects new canonical target'));
 if(beforeLiveMessages)assert.deepEqual(compareMessages(await liveMessages()),compareMessages(beforeLiveMessages),'Connecting cannot change original complete turns.');
 if(connectOnly){
  if(process.argv.includes('--inject-first-recovery-loss')){
   assert.equal(report.autoRecoveryAborted,true);assert.equal(await page.locator('[data-native-chat-connection="'+operationId+'"]').count(),0,'Explicit recovery settles the matching stale connection notice.');
   await page.getByRole('button',{name:'返回对话',exact:true}).click();await page.locator('[data-native-chat-requests]').waitFor({state:'hidden'});
   report.checks.push('The first automatic recovery request is aborted before Core; original request controls then restore the same native owner and prepare the same original input, clearing only that connection notice.');
  }
  assert.deepEqual(await get(prefix+'/conversations/'+sourceSession.id+'/messages?limit=1000'),sourceMessagesBefore,'Same-owner recovery retains every existing message, including a genuinely empty conversation.');
  assert.equal(sends.length,0);assert.equal(report.submittedPrompts,0);assert.equal(report.writes.filter(row=>row.permitted&&row.path.endsWith('/collaboration-send')).length,0);
  await inspectOriginalRecoveryRequests({expected:'healthy',operationIds:[operationId]});await verifyProtectedOperations();
  assert.deepEqual(await get(prefix+'/execution-projection'),beforeProjection);assert.deepEqual(await protectedSource(),beforeSource);assert.deepEqual(report.pageErrors,[]);
  report.passed=true;report.modelExecuted=false;report.newPrompts=0;report.checks.push('Connect-only original resume retains canonical/native/thread/transport/agentlet and original messages, with no collaboration-send/model/new native session');
 }else{
 if(!(await read()).refs.some(ref=>ref.entityType==='scope'&&ref.entityId===fixture.scopeId))await takeScope();
 const markers=expectedLiveConversationId?['断线恢复验证一','断线恢复验证二']:['真实续聊验证一','真实续聊验证二'];
 for(let index=0;index<2;index++){
  const prompt=index===0?(expectedLiveConversationId?'请回复“断线恢复验证一”，随后按“集合、附注、人工历史对话、Run、工作集、当前对话实时归档”六项逐行写出这份上下文里对应的一个真实标题，必须逐字抄录原标题。最后抄录当前对话之前最后一条完整助手回复，用来确认恢复后旧记录还在。不要执行工具。':'请回复“真实续聊验证一”，随后按“集合、附注、历史对话、Run、工作集”五项逐行写出这份上下文里对应的一个真实标题，必须逐字抄录原标题，不要用类型名充数。不要执行工具。'):'请只回复“'+markers[1]+'”，确认这是同一个会话，不要创建新任务或执行工具。';
  await input.fill(prompt);const owner=await read();assert.equal(owner.target.receiverConversationId,newConversationId);assert.equal(owner.target.continuationOperationId,operationId);assert.ok(owner.target.messageId);assert.ok(!priorFailedMessages.some(previous=>previous.messageId===owner.target.messageId),'Known failed attachment remains recorded; successful sends use original new-message identities.');if(index)assert.notEqual(owner.target.messageId,sends[index-1].messageId);
  const submit=page.getByRole('button',{name:'提交',exact:true});assert.equal(await submit.isEnabled(),true);
  const responsePromise=page.waitForResponse(response=>response.request().method()==='POST'&&new URL(response.url()).pathname===prefix+'/connected-conversations/'+newConversationId+'/collaboration-send',{timeout:195000});await submit.click();const response=await responsePromise,result=await response.json();assert.ok(response.ok()&&result.ok===true,evidenceJson(result));
  await page.waitForFunction(()=>window.__LIVE_SCOPE_READ__().prompt==='');
  const actualTimeline=await boundedCoreRead(signal=>get(prefix+'/connected-conversations/'+newConversationId+'/collaboration-timeline?limit=100',signal),timeline=>{
   const rows=Array.isArray(timeline)?timeline:timeline?.items??[];return rows.some(row=>row.kind==='agent_message'&&row.body?.includes(markers[index]));
  });
  const answerRows=(Array.isArray(actualTimeline)?actualTimeline:actualTimeline.items??[]).filter(row=>row.kind==='agent_message'&&row.body?.includes(markers[index]));
  const answerText=answerRows.at(-1).body;
  const requestedTitles=index===0?[['collection',[fixture.outer.title,fixture.inner.title]],['note',[fixture.noteTitle]],['conversation',[fixture.conversationTitle]],['run',[fixture.runTitle]],['workspace',[fixture.workspace.name]]]:[];
  if(expectedLiveConversationId&&index===0)requestedTitles.push(['live-conversation',[sourceConnected.label,sourceSession.title]],['preserved-assistant',[beforeLiveMessages[3].contentText]]);
  const answerCoverage=requestedTitles.map(([type,titles])=>({type,matchedTitle:titles.find(title=>answerText.includes(title))??null}));
  await page.getByText(new RegExp(markers[index])).last().waitFor({timeout:60000});
  const fresh=await get(prefix+'/conversation-continuations/'+operationId),receipt=fresh.promptReceipts.find(row=>row.messageId===owner.target.messageId);assert.ok(receipt);assert.equal(receipt.sendReceipt?.outcome,'sent');assert.equal(receipt.attachReceipt?.outcome,'attached');report.successfulPrompts=(report.successfulPrompts??0)+1;report.modelExecuted=true;
  const scope=receipt.contextResolution?.find(row=>row.kind==='scope'&&row.scopeId===fixture.scopeId);assert.ok(scope?.members?.length);
  const find=(type,id)=>scope.members.filter(row=>row.ref.type===type&&row.ref.id===id);
  for(const [type,id]of [['scope',fixture.scopeId],['scope',fixture.workspaceScopeId],['collection',fixture.outer.id],['collection',fixture.inner.id],['note',fixture.noteId],['conversation',fixture.conversationId],['run',fixture.runId],['workspace',fixture.workspace.id],['view',fixture.textViewId]])assert.ok(find(type,id).length,'Live attached scope retains '+type+':'+id);
  if(fixture.baseScopeId)assert.ok(find('scope',fixture.baseScopeId).length,'The nested original whole Scope is retained, not flattened away.');
  for(const note of find('note',fixture.noteId))assert.equal(note.content,fixture.noteBody);
  for(const conversation of find('conversation',fixture.conversationId)){
   assert.equal(conversation.source.connectedConversation.conversationSessionId,fixture.conversationSessionId);
   assert.equal(conversation.source.messages.length,2);assert.deepEqual(conversation.source.messages.map(message=>message.role),['user','assistant']);
   assert.ok(conversation.content.includes('没有请求模型，也没有发送新消息。'));
  }
  if(expectedLiveConversationId){
   const liveEntries=find('conversation',expectedLiveConversationId);assert.ok(liveEntries.length,'Full nested Scope must include the live archived current conversation.');
   const expectedCount=beforeLiveMessages.length+index*2+1;
   for(const live of liveEntries){assert.equal(live.source.connectedConversation.conversationSessionId,fixture.liveConversationSessionId);verifyLiveScopeConversation(live.source.messages,{baseline:beforeLiveMessages,prompt,index,priorComplete:index===0?beforeLiveMessages:report.liveMessagesAfter1});}
   const current=await liveMessages();assert.equal(current.length,expectedCount+1);assert.deepEqual(current.slice(0,4),beforeLiveMessages);if(index)assert.deepEqual(current.slice(0,report.liveMessagesAfter1.length),report.liveMessagesAfter1,'Second send cannot rewrite the prior new complete turn.');assert.equal(current.at(-2).contentText,prompt);assert.equal(current.at(-1).contentText,answerText);assert.deepEqual(current.map(row=>row.seq),Array.from({length:current.length},(_,n)=>n));report['liveMessagesAfter'+(index+1)]=current;
   const archived=liveEntries.map(row=>({ref:row.ref,messages:row.source.messages,archive:row.source.archive}));report['liveArchiveScopeSnapshot'+(index+1)]=archived;
  }
  for(const task of find('run',fixture.runId)){assert.equal(task.source.run.status,'created');assert.ok(task.content.includes(fixture.runTitle));}
  for(const collection of find('collection',fixture.inner.id))assert.ok(JSON.stringify(collection.source).includes(fixture.noteId));
  for(const workspace of find('workspace',fixture.workspace.id))assert.deepEqual(workspace.source.membership.map(row=>row.artifactViewId),[fixture.textViewId]);
  for(const view of find('view',fixture.textViewId)){assert.equal(view.source.revision.id,fixture.revisionId);assert.equal(view.source.revision.artifactId,fixture.artifactId);assert.ok(typeof view.content==='string'&&view.content.length>0);}
  assert.equal(JSON.parse(scope.text).projectId,projectId);assert.equal(JSON.parse(scope.text).scopeId,fixture.scopeId);assert.ok(!scope.text.includes('参考图（e2e fixture）'));
  for(const providerReceipt of [receipt.attachReceipt,receipt.sendReceipt]){
   assert.equal(providerReceipt.externalSessionId,operation.externalEvidence.externalSessionId);
   for(const owner of ['provider','threadId','agentletId','transportSessionId'])if(operation.externalEvidence[owner]!==undefined)assert.equal(providerReceipt[owner],operation.externalEvidence[owner]);
   if(providerReceipt.runtimeScope!==undefined)assert.equal(providerReceipt.runtimeScope,operation.externalEvidence.runtimeScope);
  }
  report['message'+(index+1)]={input:sends[index],result,receipt,answerText,answerCoverage,allRequestedTitlesPresent:answerCoverage.every(row=>row.matchedTitle),
   runtimeScopeEvidence:{bound:operation.externalEvidence.runtimeScope??null,attachReceipt:receipt.attachReceipt.runtimeScope??null,
    sendReceipt:receipt.sendReceipt.runtimeScope??null,transportInputVerifiedByThisBrowser:false}};await shot('0'+(index+3)+'-real-same-conversation-reply');
  assert.equal((await read()).document,documentId,'Replies must appear in the same original page without reload.');assert.deepEqual((await read()).windows,[]);
 }
 if(priorFailedMessages.length){const final=await get(prefix+'/conversation-continuations/'+operationId);for(const previous of priorFailedMessages)assert.deepEqual(final.promptReceipts.find(row=>row.messageId===previous.messageId),previous,'The original failed attachment receipt must remain unchanged.');report.priorFailedMessagesUnchanged=true;}
 await verifyProtectedOperations();
 if(beforeLiveMessages){const final=await liveMessages();assert.equal(final.length,8);assert.deepEqual(final.slice(0,4),beforeLiveMessages);assert.deepEqual(final.slice(0,report.liveMessagesAfter1.length),report.liveMessagesAfter1);const fresh=await get(prefix+'/conversation-continuations/'+operationId);assert.deepEqual(fresh.promptReceipts.find(row=>row.messageId===sends[0].messageId).contextResolution,report.message1.receipt.contextResolution,'Second new message must not mutate the first frozen self-Scope evidence.');report.liveHistoryPreservedAndExtended=true;}
 assert.equal(sends.length,2);assert.notEqual(sends[0].messageId,sends[1].messageId);assert.equal(sends[0].conversationId,sends[1].conversationId);assert.equal(sends[0].continuationOperationId,sends[1].continuationOperationId);
 assert.deepEqual(await get(prefix+'/execution-projection'),beforeProjection,'True continuation sends must not create ordinary Runs.');assert.deepEqual(await protectedSource(),beforeSource);assert.deepEqual(report.pageErrors,[]);
 report.checks.push('Two real original-Composer sends retain all Scope members, one canonical conversation/operation and distinct message IDs; assistant replies render live without reload or ordinary Run creation');
 report.twoRealRepliesVerified=true;report.modelExecuted=true;
 assert.equal(report.message1.allRequestedTitlesPresent,true,'The actual assistant reply did not reproduce every requested member-type title; full attach evidence is recorded separately and no model retry is permitted.');
 if(expectedLiveConversationId)await inspectOriginalRecoveryRequests({expected:'healthy',operationIds:[operationId]});
 report.passed=true;
 }
 }
}catch(error){
 report.error=String(error.stack??error);process.exitCode=1;
 // A failed/lost response never repeats the POST. Read the original message IDs back before archiving uncertainty.
 if(operationId)try{
  const operation=await get(prefix+'/conversation-continuations/'+operationId);
  report.readBack={operation,messages:sends.map(message=>({messageId:message.messageId,
   receipt:operation.promptReceipts?.find(receipt=>receipt.messageId===message.messageId)??null}))};
  if(newConversationId)report.readBack.timeline=await get(prefix+'/connected-conversations/'+newConversationId+'/collaboration-timeline?limit=100');
 }catch(readError){report.readBack={error:String(readError),replayed:false};}
 if(page){await page.screenshot({path:path.join(output,'failure.png'),mask:[page.locator('input[type="password"],input[name*="token" i],input[name*="key" i],input[name*="secret" i]'),page.getByText(/(?:sk-[A-Za-z0-9_-]{16,}|Bearer\s+[A-Za-z0-9._~+\/=:-]{12,})/)],maskColor:'#d9d9d9'}).catch(()=>{});report.ui=await page.evaluate(()=>window.__LIVE_SCOPE_READ__?.()).catch(()=>null);report.dom=await page.locator('body').innerText().catch(()=>null);}
}
finally{await browser?.close();await fs.writeFile(path.join(output,'report.json'),evidenceJson(report));console.log(evidenceJson({passed:report.passed,operationId,newConversationId,submittedPrompts:report.submittedPrompts,checks:report.checks,error:report.error,output}));}

