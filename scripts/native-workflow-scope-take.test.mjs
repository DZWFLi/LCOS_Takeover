import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { currentGen2Root, readCurrentGen2Resource } from '../lab/current-gen2-resources.mjs';
import { createNativeUiSourceTransforms } from '../lab/native-ui-source-transforms.mjs';
import { withNativeChatSourceTransforms } from '../lab/native-chat-owner-transform.mjs';
import { withNativeMixedScopeComposerTransforms } from '../lab/native-mixed-scope-composer-transform.mjs';
import { withNativeComposerDraftTransforms } from '../lab/native-composer-draft-source-transform.mjs';

const root=process.cwd(), runtime=path.join(root,'.runtime');await fs.mkdir(runtime,{recursive:true});
const temp=await fs.mkdtemp(path.join(runtime,'workflow-scope-take-'));
const output=path.join(root,'output/整份混合方法取用_20261025/真实前端状态',new Date().toISOString().replaceAll(':','-'));
await fs.mkdir(output,{recursive:true});
const report={passed:false,cases:[],realBrowserVerified:false,modelCalls:0,networkRequests:0,domainWrites:0};
const spec=relative=>JSON.stringify(path.join(root,relative).replaceAll('\\','/'));
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve}};
try{
  const transforms=withNativeComposerDraftTransforms(withNativeMixedScopeComposerTransforms(withNativeChatSourceTransforms(createNativeUiSourceTransforms({nativeRailPilot:true}))));
  const entry=path.join(temp,'entry.ts'),bundle=path.join(temp,'entry.mjs');
  await fs.writeFile(entry,[
    'surfaces/workflow/workflowMethodDraft','surfaces/workflow/workflowMethodTake','shell/lcosShellStore',
    'lcosReferenceState','referencePickOwnership','composer/composerInputJourney','composer/composerSubmission',
  ].map(name=>`export * from ${spec('lcos/huabu/apps/web/src/lcos/'+name+'.ts')};`).join('\n')+
    `\nexport {HttpClient} from ${spec('lcos/apps/web-gen2/src/backend/client.ts')};`);
  const esbuild=createRequire(path.join(currentGen2Root,'package.json'))('esbuild');
  const packageRequire=createRequire(path.join(currentGen2Root,'huabu/apps/web/package.json'));
  await esbuild.build({entryPoints:[entry],outfile:bundle,bundle:true,platform:'node',format:'esm',target:'node22',logLevel:'warning',plugins:[{
    name:'actual-original-workflow-and-singleton-stores',setup(build){
      build.onResolve({filter:/^@local-creative-os\/web-gen2$/},()=>({path:'original-pure-bridge',namespace:'original-pure-bridge'}));
      build.onLoad({filter:/.*/,namespace:'original-pure-bridge'},()=>({contents:
        `export * from ${spec('lcos/apps/web-gen2/src/interaction/referenceController.ts')};\nexport {coreRequest} from ${spec('lcos/apps/web-gen2/src/backend/coreTypes.ts')};`,loader:'ts',resolveDir:root}));
      build.onResolve({filter:/^(zustand(?:\/.*)?|react(?:\/.*)?)$/},args=>({path:packageRequire.resolve(args.path)}));
      build.onLoad({filter:/\.ts$/},async args=>{
        const relative=path.relative(root,args.path).replaceAll('\\','/');
        const original=readCurrentGen2Resource(args.path)?.contents??await fs.readFile(args.path,'utf8');
        const adapt=transforms[relative],contents=adapt?adapt(original,{sourcePath:args.path}):original;
        if(adapt)assert.equal(adapt(contents,{sourcePath:args.path}),contents,relative+' is idempotent');
        return {contents,loader:'ts',resolveDir:path.dirname(args.path)};
      });
    }
  }]});
  const api=await import(pathToFileURL(bundle)),S=api.useLcosShellStore,R=api.useLcosReferenceStore;
  const graph={project:{id:'p'},scopes:[{id:'method-one',projectId:'p',kind:'workflow',name:'同名方法'},{id:'method-two',projectId:'p',kind:'workflow',name:'同名方法'}],
    artifactViews:[{id:'v',artifactId:'a',revisionId:'historical'}],artifacts:[{id:'a',title:'原历史材料',currentRevisionId:'latest'}],
    artifactRevisions:[{id:'historical',artifactId:'a',fileRecordId:'f'}],fileRecords:[{id:'f',mimeType:'text/plain'}]};
  const rows=['method-one','method-two'].flatMap(scopeId=>[
    {id:scopeId+'-first',projectId:'p',scopeId,capability:'workflow',version:1,state:{memberViewIds:['v'],workflowActions:[{id:'a',label:'步骤一',attachedViewIds:['v']}],memberEntityRefs:[{entityType:'collection',entityId:'collection'},{entityType:'note',entityId:'note'}]}},
    {id:scopeId+'-second',projectId:'p',scopeId,capability:'workflow',version:4,state:{memberViewIds:[],workflowActions:[{id:'b',label:'步骤二',attachedViewIds:[]}],memberEntityRefs:[{entityType:'conversation',entityId:'conversation'},{entityType:'run',entityId:'run'}]}},
  ]);
  const historical={entityType:'artifact',entityId:'existing',artifactViewId:'old-view',revisionId:'old-revision',mimeType:'text/plain',displayLabel:'已有引用'};
  const active=()=>R.getState().draft.orderedEntityRefs;
  const target=intent=>({nodeId:intent==='continue'?'conversation:receiver':'canvas:main',workspaceId:'workspace',intent,title:'原输入',anchor:{x:0,y:0,width:0,height:0},
    ...(intent==='continue'?{receiverConversationId:'receiver',messageId:'message',continuationOperationId:'operation'}:{})});
  const reset=intent=>{S.getState().clear();R.getState().reset();S.getState().setProject('p');R.getState().setProject('p');S.getState().openComposer(target(intent));S.getState().setComposerPrompt('用户已有输入');assert.equal(R.getState().addEntityToDraft(historical,intent),true);return S.getState().composerTarget};
  const method=api.buildWorkflowMethodDraft('p','method-one',graph,rows);
  assert.equal(method.status,'ready');assert.ok(method.prompt.includes('步骤一')&&method.prompt.includes('步骤二'));
  assert.deepEqual(method.references,[{entityType:'scope',entityId:'method-one',mode:'full',displayLabel:'同名方法'}]);
  const session=readGraph=>({projects:{getProjectGraph:readGraph??(async()=>graph)},http:new api.HttpClient({baseUrl:'http://127.0.0.1:0',fetch:async()=>new Response(JSON.stringify({ok:true,value:rows}),{headers:{'content-type':'application/json'}})})});
  for(const intent of ['delegate','continue']){
    const originalTarget=reset(intent),key=api.composerInputKey(originalTarget);
    api.appendWorkflowMethodDraft(method,'p',key);
    assert.equal(S.getState().composerPrompt,'用户已有输入\n\n'+method.prompt);assert.equal(S.getState().composerTarget,originalTarget);
    assert.deepEqual(active(),[historical,...method.references]);
    api.appendWorkflowMethodDraft(method,'p',key);assert.equal(active().length,2);assert.equal(S.getState().composerPrompt,'用户已有输入\n\n'+method.prompt);
    const second=api.buildWorkflowMethodDraft('p','method-two',graph,rows);api.appendWorkflowMethodDraft(second,'p',key);
    assert.deepEqual(active().map(ref=>ref.entityId),['existing','method-one','method-two']);
    const ordinary=api.buildComposerRunInput({projectId:'p',instruction:S.getState().composerPrompt,workspaceId:'workspace',target:{...originalTarget,intent:'delegate'},refs:active()});
    const continued=api.buildComposerContinuationInput({conversationId:'receiver',messageId:'message',continuationOperationId:'operation',text:S.getState().composerPrompt,refs:active()});
    assert.deepEqual(ordinary.orderedReferences,continued.orderedReferences);
    assert.deepEqual(ordinary.orderedReferences.map(value=>value.ref),[{type:'artifact',artifactId:'existing',revisionId:'old-revision'},{type:'scope',scopeId:'method-one'},{type:'scope',scopeId:'method-two'}]);
    assert.deepEqual(ordinary.contextArtifactIds,['existing']);assert.ok(ordinary.instruction.startsWith('用户已有输入'));
    const gate=deferred();reset(intent);const pending=api.takeWorkflowScopeMethodDraft(session(()=>gate.promise),'p','method-one',key);
    S.getState().setComposerPrompt('准备期间最新手改输入');R.getState().addEntityToDraft({entityType:'collection',entityId:'existing-collection'},intent);gate.resolve(graph);await pending;
    assert.equal(S.getState().composerPrompt,'准备期间最新手改输入\n\n'+method.prompt);assert.deepEqual(active().map(ref=>ref.entityId),['existing','existing-collection','method-one']);
  }
  report.cases.push('Actual original builder + append + real Zustand ReferenceStore preserve editable text and historical references for ordinary and continuation inputs; one Scope per identity, same names remain distinct, reapply dedupes.');
  report.cases.push('Both original submission builders preserve typed reference order and whole Scope addresses; no Scope-as-Artifact or fabricated Take-time version. Pending read appends to latest edited draft.');
  for(const intent of ['delegate','continue'])for(const scenario of ['abort','cancel','message','operation','target','project']){
    const initial=reset(intent),key=api.composerInputKey(initial),gate=deferred(),abort=new AbortController();let current=true;
    const pending=api.takeWorkflowScopeMethodDraft(session(()=>gate.promise),'p','method-one',key,abort.signal,()=>current);
    if(scenario==='abort')abort.abort();if(scenario==='cancel')current=false;
    if(scenario==='message'||scenario==='operation')S.setState({composerTarget:{...initial,[scenario==='message'?'messageId':'continuationOperationId']:'new'}});
    if(scenario==='target')S.getState().openComposer({...target(intent),nodeId:'another-input',...(intent==='continue'?{receiverConversationId:'another-receiver'}:{})});
    if(scenario==='project'){S.getState().setProject('another-project');R.getState().setProject('another-project')}
    const before={text:S.getState().composerPrompt,refs:structuredClone(active())};gate.resolve(graph);await assert.rejects(pending);
    assert.equal(S.getState().composerPrompt,before.text,`${intent}/${scenario}`);assert.deepEqual(active(),before.refs,`${intent}/${scenario}`);
  }
  report.cases.push('Actual original Drop Take cancellation, late message/operation/input/project switches cannot append into any newer input, for ordinary and continuation paths.');
  const library=(await fs.readFile('lab/pilot/native-library-contexts.tsx','utf8')).replaceAll('\r\n','\n');
  const freshStart=library.indexOf('  const fresh = async (version: number)'),freshEnd=library.indexOf('  const addSelection =',freshStart);
  assert.ok(freshStart>0&&freshEnd>freshStart);
  const freshCode=await esbuild.transform(library.slice(freshStart,freshEnd),{loader:'ts',format:'cjs'});
  for(const intent of ['delegate','continue'])for(const scenario of ['ready','member-version','changed-name','message','cancel']){
    const originalTarget=reset(intent),gate=deferred(),model={graph,presentations:rows,version:'original-pages',method};let alive=true,closed=0,restored=0;
    const value={...model};if(scenario==='member-version')value.version='updated-pages';
    if(scenario==='changed-name')value.method={...method,prompt:'方法已改名'};
    const env={act:async task=>task(1),model,load:()=>gate.promise,current:()=>alive,UserError:Error,projectId:'p',context:false,
      item:{entityRef:{id:'method-one'}},useLcosShellStore:S,useLcosReferenceStore:R,composerInputKey:api.composerInputKey,
      referencePickOwnerKey:api.referencePickOwnerKey,captureNativeLibraryInputReturn:()=>({input:'same-original'}),
      appendWorkflowMethodDraft:api.appendWorkflowMethodDraft,nativeLibraryMethodText:()=>method.prompt,onClose:()=>closed++,
      restoreNativeLibraryInputReturn:async()=>{restored++;return true}};
    const useContent=new Function(...Object.keys(env),freshCode.code+';return useContent;')(...Object.values(env));
    const pending=useContent();S.getState().setComposerPrompt('原库准备中的新输入');
    if(scenario==='message')S.setState({composerTarget:{...originalTarget,messageId:'new-message'}});if(scenario==='cancel')alive=false;
    gate.resolve(value);
    if(scenario==='ready'){
      await pending;assert.equal(S.getState().composerPrompt,'原库准备中的新输入\n\n'+method.prompt);assert.deepEqual(active(),[historical,...method.references]);assert.equal(closed,1);assert.equal(restored,1);
    }else{await assert.rejects(pending);assert.equal(S.getState().composerPrompt,'原库准备中的新输入');assert.deepEqual(active(),[historical]);assert.equal(closed,0);assert.equal(restored,0)}
    assert.equal(R.getState().referenceInputOperations.size,0);
  }
  report.cases.push('Actual original-Library fresh/useContent callback + real Stores uses one same-snapshot validated builder result, retains latest ordinary/continuation edits, and refuses changed member versions/name, canceled owner or newer message without closing source.');
  for(const field of ['artifactViews','artifacts','artifactRevisions','fileRecords']){
    reset('delegate');const unavailable=api.buildWorkflowMethodDraft('p','method-one',{...graph,[field]:[]},rows);assert.equal(unavailable.status,'unavailable');
    assert.throws(()=>api.appendWorkflowMethodDraft(unavailable,'p'),/缺失/);assert.equal(S.getState().composerPrompt,'用户已有输入');assert.deepEqual(active(),[historical]);
  }
  reset('continue');const archived=api.buildWorkflowMethodDraft('p','method-one',{...graph,scopes:graph.scopes.map(scope=>({...scope,archivedAt:'removed'}))},rows);
  assert.throws(()=>api.appendWorkflowMethodDraft(archived,'p'),/方法已移除/);assert.equal(S.getState().composerPrompt,'用户已有输入');assert.deepEqual(active(),[historical]);
  report.cases.push('Original material/View/revision/file validation and removed-method refusal remain before actual Store mutation. Multiple original workflow rows feed the same complete Scope address.');
  S.getState().clear();R.getState().reset();report.passed=true;
}catch(error){report.error=String(error.stack??error);process.exitCode=1}
finally{await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,output},null,2));if(!path.resolve(temp).startsWith(runtime+path.sep))throw new Error('Unexpected test path');await fs.rm(temp,{recursive:true,force:true})}
