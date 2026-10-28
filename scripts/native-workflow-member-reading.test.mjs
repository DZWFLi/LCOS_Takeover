import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {buildPilotEntry,installedRoot} from '../lab/pilot/build-pilot.mjs';
const temp=await fs.mkdtemp(path.resolve('.runtime/method-members-test-'));
const out=path.resolve('output/原方法混合成员阅读_20261025/定向测试',new Date().toISOString().replaceAll(':','-'));
await fs.mkdir(out,{recursive:true});
const report={passed:false,checks:[],realBrowserVerified:false,modelCalled:false,writes:0};
try{
 await buildPilotEntry('lab/pilot/native-workflow-member-reading.ts',path.join(temp,'reading.mjs'),'node');
 await buildPilotEntry('lab/pilot/native-library-scope-members.ts',path.join(temp,'members.mjs'),'node');
 // One module instance owns all leases in the tested dispatcher and return.
 const entry=path.join(temp,'combined.ts');await fs.writeFile(entry,`export * from ${JSON.stringify(path.resolve('lab/pilot/native-workflow-member-reading.ts'))};\nexport * from ${JSON.stringify(path.resolve('lab/pilot/native-library-reading-return.ts'))};`);
 await buildPilotEntry(path.relative(process.cwd(),entry),path.join(temp,'combined.mjs'),'node');
 const reading=await import(pathToFileURL(path.join(temp,'combined.mjs'))),members=await import(pathToFileURL(path.join(temp,'members.mjs')));
 const calls=[],signal=new AbortController().signal,conversations=[{id:'chat-exact',projectId:'project',label:'原对话'}],runs=Array.from({length:102},(_,i)=>({id:'run-'+(i+1),projectId:'project',title:'任务 '+(i+1)}));
 const client={conversations:{async listConnectedConversations(projectId,provided){calls.push(['conversations',projectId,provided]);return conversations}},runs:{async readExecutionProjection(projectId,provided){calls.push(['runs',projectId,provided]);return{projectId,runs}}}};
 const related=await reading.readNativeWorkflowRelatedMembers('project',client,signal);
 assert.equal(related.conversations,conversations);assert.equal(related.runs,runs);assert.deepEqual(calls,[['conversations','project',signal],['runs','project',signal]]);
 const item={kind:'workflow',entityRef:{id:'method'}},graph={project:{id:'project'},scopes:[{id:'method',projectId:'project',kind:'workflow',name:'原方法'}],artifactViews:[],artifacts:[],artifactRevisions:[],fileRecords:[],workspaces:[],notes:[{id:'note-exact',projectId:'project',body:'附注原文',updatedAt:'version-old'}]},presentation={projectId:'project',scopeId:'method',capability:'workflow',state:{memberViewIds:[],memberEntityRefs:[{type:'note',id:'note-exact'},{type:'conversation',id:'chat-exact'},{type:'run',id:'run-102'}]}};
 const rows=members.nativeLibraryScopeMembers('project',item,graph,[presentation],[],related.conversations,related.runs);
 assert.deepEqual(rows.map(row=>row.kind),['note','conversation','run']);assert.equal(rows[2].runId,'run-102');
 report.checks.push('Original conversation catalogue and full execution projection feed method members, including Run 102; exact Note identity/version is preserved.');
 const failChat=await reading.readNativeWorkflowRelatedMembers('project',{...client,conversations:{async listConnectedConversations(){throw Error('offline')}}});
 assert.equal(failChat.conversations,null);assert.equal(failChat.runs,runs);
 const chatUnavailable=members.nativeLibraryScopeMembers('project',item,graph,[presentation],[],failChat.conversations,failChat.runs);
 assert.deepEqual(chatUnavailable.map(row=>row.kind),['note','unavailable','run']);assert.equal(chatUnavailable[1].key,rows[1].key);assert.match(chatUnavailable[1].reason,/重新读取.*原成员保留/);
 const failRun=await reading.readNativeWorkflowRelatedMembers('project',{...client,runs:{async readExecutionProjection(){throw Error('offline')}}});
 assert.equal(failRun.runs,null);assert.equal(failRun.conversations,conversations);
 assert.deepEqual(members.nativeLibraryScopeMembers('project',item,graph,[presentation],[],failRun.conversations,failRun.runs).map(row=>row.kind),['note','conversation','unavailable']);
 const empty=await reading.readNativeWorkflowRelatedMembers('project',{conversations:{async listConnectedConversations(){return[]}},runs:{async readExecutionProjection(){return{projectId:'project',runs:[]}}}});
 assert.deepEqual(empty,{conversations:[],runs:[]});
 const foreign=await reading.readNativeWorkflowRelatedMembers('project',{conversations:{async listConnectedConversations(){return[{...conversations[0],projectId:'other'}]}},runs:{async readExecutionProjection(){return{projectId:'other',runs}}}});assert.deepEqual(foreign,{conversations:null,runs:null});
 report.checks.push('Independent failed/foreign catalogues remain null and retain unavailable members with reread guidance; genuine empty lists remain distinct.');
 const ts=createRequire(path.join(installedRoot,'package.json'))('typescript'),source=await fs.readFile('lab/pilot/native-workflow-templates.tsx','utf8'),file=ts.createSourceFile('method.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 assert.equal(file.parseDiagnostics.length,0);const declarations=[];function visit(node){if(ts.isVariableDeclaration(node)&&node.name.getText(file)==='readMaterial')declarations.push(node);ts.forEachChild(node,visit)}visit(file);assert.equal(declarations.length,1);
 const methodReader=file.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='readMethods');assert.ok(methodReader);
 const readerCode=ts.transpileModule('const reader = ('+methodReader.getText(file)+');',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const readerEnv={nativeLibraryEntryAssets:()=>{},session:()=>({...client,projects:{getProjectGraph:async()=>graph}}),coreRequest:async()=>[presentation],readNativeWorkflowRelatedMembers:reading.readNativeWorkflowRelatedMembers,buildWorkflowMethodDraft:()=>({status:'ready',prompt:'原步骤',references:[]}),nativeLibraryMethodText:()=> '原步骤',nativeLibraryScopeMembers:members.nativeLibraryScopeMembers,workflowMaterialCatalog:()=>[],cover:()=>''};
 const reader=new Function(...Object.keys(readerEnv),readerCode+'\nreturn reader;')(...Object.values(readerEnv));
 const[readTemplate]=await reader({projectId:'project',canvasId:'canvas',api:{}},[item]);assert.equal(readTemplate.lcos_method.members.length,3);assert.equal(readTemplate.description,'完整方法及关联内容会加入当前输入，步骤仍可编辑。关联 3 项内容，可逐项查看。');assert.equal(readTemplate.lcos_method.draft.references.length,0);
 report.checks.push('The actual method reader describes its three parsed mixed members and editable steps without claiming Take-time version locking.');
 const body=ts.transpileModule(`const read = (${declarations[0].initializer.getText(file)});`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const template={id:'method',lcos_method:{owner:{projectId:'project',canvasId:'canvas',api:{}},item}},prior={projectId:'project',connectedConversationId:'original-chat',canvasId:'canvas'},originalTarget={nodeId:'original-drop-target',intent:'delegate',workspaceId:'workspace',targetNodeIds:['original-material']};
 const originalDraft={prompt:'原输入尚未发送',references:['原引用'],caret:3};
 async function scenario(member,{dispatch=false,changed=false,stale=false,lateSameMethod=false,cancel=false}={}){
  let live=!stale,selectedTemplate=template,reads=0,opened=[],restored=[],requests=[],ui=[],queue=[];const leaseRef={current:undefined},button={dataset:{nativeMethodMember:member.key},focus(){doc.activeElement=this}},root={dataset:{methodId:'method'},scrollTop:61,getClientRects:()=>[{}],querySelectorAll:()=>[button]},element={closest:()=>root},doc={activeElement:null,querySelector:()=>null,querySelectorAll:()=>[root]};
  const currentRows=changed?[{...member,title:member.title+' changed'}]:[...rows,...(rows.includes(member)?[]:[member])],selected={current:template},readAttempt={current:0},pendingRead={current:undefined};
  const env={sameOwner:()=>live,selected,readAttempt,pendingRead,AbortController,searchKeyword:'原方法搜索',activeCategory:'all',nativeWorkflowMemberReadable:reading.nativeWorkflowMemberReadable,nativeMaterialViewerAvailable:()=>true,readMethods:async()=>{reads++;if(lateSameMethod){selected.current={...template};readAttempt.current++}if(cancel)pendingRead.current.abort();return[{...template,lcos_method:{...template.lcos_method,members:currentRows}}]},alive:{current:true},reading:leaseRef,setSelectedTemplate:value=>{selectedTemplate=value},readNativeConversationSelection:()=>prior,useLcosShellStore:{getState:()=>({composerTarget:originalTarget,openComposer:target=>opened.push(target)})},captureNativeLibraryInputReturn:()=>({inputKey:'original'}),setIsReading:value=>ui.push(value),restoreNativeConversationSelection:(...value)=>restored.push(value),requestNativeWorkflowMember:reading.requestNativeWorkflowMember,requestNativeMaterialView:request=>requests.push(['material',request]),requestNativeNoteView:request=>requests.push(['note',request]),requestNativeConversationView:request=>{requests.push(['conversation',request]);return!dispatch},requestNativeTaskView:request=>{requests.push(['task',request]);return!dispatch},requestNativeLibraryMemberView:async(projectId,member,source,signal)=>{requests.push(['library',{projectId,member,source,signal}])},restoreNativeMethod:async(...values)=>restored.push(values),cancelNativeLibraryReadingReturn:reading.cancelNativeLibraryReadingReturn,onMaterialUse:()=>{},onClose:()=>ui.push('close'),requestAnimationFrame:callback=>queue.push(callback),document:doc,CSS:{escape:value=>value}};
  const handler=new Function(...Object.keys(env),body+'\nreturn read;')(...Object.values(env));
  let error;try{await handler(template,member,element)}catch(value){error=value}
  if(stale){assert.ok(error);assert.equal(reads,0);assert.equal(requests.length,0);return}
  if(lateSameMethod||cancel){assert.equal(error,undefined);assert.equal(requests.length,0);assert.equal(leaseRef.current,undefined);return}
  if(changed){assert.match(error.message,/内容或所存版本已变化/);assert.equal(requests.length,0);return}
  if(dispatch){assert.match(error.message,/暂时无法打开/);assert.equal(leaseRef.current.closed,true);assert.equal(ui.at(-1),false);return}
  if(member.kind==='unavailable'){assert.equal(requests.length,0);assert.notEqual(selectedTemplate,template);while(queue.length)queue.shift()();assert.equal(root.scrollTop,61);return}
  if(['collection','scope'].includes(member.kind)){
    assert.equal(error,undefined);assert.equal(requests.length,1);assert.equal(requests[0][0],'library');const address=requests[0][1];
    assert.equal(address.member,member);assert.equal(address.source.current(),true);assert.equal(address.signal.aborted,false);
    // A nested Viewer retains its own one active lease; it cannot consume the
    // outer Gallery source because that source was never registered as active.
    const child={projectId:'project',rootKind:member.item.kind,rootId:member.item.entityRef.id,current:()=>true,onReturn:()=>{},closed:false};
    const childAddress=reading.withNativeLibraryReadingReturn({projectId:'project'},child);reading.releaseNativeLibraryReadingReturn(childAddress,true);
    assert.equal(address.source.current(),true);assert.equal(leaseRef.current.closed,false);
    address.source.release(true);await address.source.restore();assert.equal(leaseRef.current.closed,true);assert.equal(ui.at(-1),false);
    assert.deepEqual(restored,[[template.lcos_method.owner,item,{query:'原方法搜索',category:'all',scroll:61,memberKey:member.key}]]);assert.equal(opened.length,0);return;
  }
  assert.equal(error,undefined);assert.equal(requests.length,1);assert.equal(reading.nativeLibraryReadingReturnCurrent(requests[0][1]),true);assert.equal(ui.at(-1),true);root.scrollTop=0;
  assert.equal(reading.releaseNativeLibraryReadingReturn(requests[0][1],true),true);let frames=0;while(queue.length){assert.ok(++frames<125);queue.shift()()}await Promise.resolve();await Promise.resolve();
  assert.equal(root.scrollTop,61);assert.equal(doc.activeElement,button);assert.equal(ui.at(-1),false);assert.equal(leaseRef.current.closed,true);
  if(['conversation','run'].includes(member.kind)){assert.deepEqual(restored,[[prior,'project','canvas']]);assert.deepEqual(opened,[{...originalTarget,focusInput:false}]);assert.ok(!('prompt'in opened[0])&&!('references'in opened[0]));}else{assert.equal(opened.length,0);assert.equal(restored.length,0)}
  assert.deepEqual(originalDraft,{prompt:'原输入尚未发送',references:['原引用'],caret:3});
 }
 for(const row of rows)await scenario(row);
 report.checks.push('The actual method read handler routes Notes to the original Viewer and conversations/Run to existing panel owners; one original lease restores method scroll/member focus and original conversation/input address without copying draft text or references.');
 await scenario(rows[1],{changed:true});await scenario(rows[2],{dispatch:true});await scenario(rows[0],{stale:true});await scenario(chatUnavailable[1]);
 report.checks.push('Changed member, stale scene and rejected native panel dispatch do not open another target; reread updates the original selected method without opening a destination.');
 assert.match(source,/data-native-method-member=\{member.key\}/);assert.match(source,/data-native-method-material=\{member.kind==='material'\?member.key:undefined\}/);
 assert.equal(reading.nativeWorkflowMemberReadable({kind:'collection'}),true);assert.equal(reading.nativeWorkflowMemberReadable({kind:'scope'}),true);
 await scenario({key:'["collection","original-collection"]',kind:'collection',title:'同名内容',item:{kind:'collection',entityRef:{id:'original-collection'}}});
 await scenario({key:'["scope","original-context"]',kind:'scope',title:'同名内容',item:{kind:'context',entityRef:{id:'original-context'}}});
 await scenario(rows[0],{lateSameMethod:true});await scenario(rows[0],{cancel:true});
 report.checks.push('Collection/nested Scope use the exact original Library address and keep a separate Gallery source return; a child Viewer lease does not consume it. Same-method reopen and cancellation suppress late dispatch.');
 // Execute the actual Note host with ordinary hook lifetime semantics. A new
 // donor parts wrapper is a parent rerender, not a new Viewer/Canvas owner.
 const noteSource=await fs.readFile('lab/pilot/native-note-viewer.tsx','utf8'),noteFile=ts.createSourceFile('note.tsx',noteSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),noteFunction=noteFile.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='NativeNoteViewerHost');assert.ok(noteFunction);
 const noteCode=ts.transpileModule('const component = ('+noteFunction.getText(noteFile).replace(/^export\s+/,'')+');',{compilerOptions:{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
 let index=0,effectCleanup,dependencyValues,changedCanvas='canvas',currentViewer=null,closed=0,released=0,raf=[];const memoValues=[],refs=[],events=new EventTarget(),noteApi={};const noteSession={projects:{async getProjectGraph(){return{project:{id:'project'},notes:[{id:'note',projectId:'project',body:'附注完整正文',updatedAt:'version'}]}}}},viewer={open(value){currentViewer=value},close(){closed++;currentViewer=null;return true},getState:()=>({phase:'open',session:currentViewer}),subscribe:()=>()=>{}};
 const noteEnv={useMemo:factory=>memoValues[index]??(memoValues[index++]=factory()),useRef:value=>{const key=index++;return refs[key]??(refs[key]={current:value})},useEffect:(callback,deps)=>{if(!dependencyValues||!deps.every((value,i)=>Object.is(value,dependencyValues[i]))){effectCleanup?.();effectCleanup=callback();dependencyValues=deps}},createLcosCoreSession:()=>noteSession,useLcosShellStore:selector=>selector({projectId:'project'}),useCanvasStore:selector=>selector({canvasId:changedCanvas,rfInstance:noteApi}),nativeLibraryReadingReturnCurrent:()=>true,sameNativeLibraryReadingReturn:()=>true,releaseNativeLibraryReadingReturn:()=>released++,requestAnimationFrame:callback=>raf.push(callback),window:events,eventName:'note-test',document:{body:{},activeElement:{isConnected:true},querySelector:()=>null},React:{createElement:(type,props,...children)=>({type,props,children})},ArrowLeft:()=>null};noteEnv.useLcosShellStore.getState=()=>({projectId:'project'});noteEnv.useCanvasStore.getState=()=>({canvasId:changedCanvas,rfInstance:noteApi});
 // useMemo occupies its slot on every render, matching React's hook order.
 noteEnv.useMemo=factory=>{const key=index++;return key in memoValues?memoValues[key]:(memoValues[key]=factory())};
 const host=new Function(...Object.keys(noteEnv),noteCode+'\nreturn component;')(...Object.values(noteEnv)),parts={ActionButton:()=>null,ActionBar:()=>null};
 const render=nextParts=>{index=0;host({runtime:viewer,parts:nextParts})};render(parts);events.dispatchEvent(new CustomEvent('note-test',{detail:{projectId:'project',noteId:'note',updatedAt:'version',title:'附注'}}));await Promise.resolve();assert.equal(currentViewer.media.markdown,'附注完整正文');const originalViewer=currentViewer,originalEffect=effectCleanup;
 render({...parts});assert.equal(effectCleanup,originalEffect);assert.equal(currentViewer,originalViewer);assert.equal(released,0);assert.equal(closed,0);
 changedCanvas='different-canvas';render({...parts});assert.equal(released,1);assert.equal(closed,1);assert.equal(currentViewer,null);effectCleanup?.();
 report.checks.push('The actual Note host keeps its live original Viewer across a fresh donor parts wrapper, while a real Canvas-owner change still cancels the read and closes it once.');
 report.passed=true;
}catch(error){report.error=String(error.stack??error);process.exitCode=1}
await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,output:out},null,2));
