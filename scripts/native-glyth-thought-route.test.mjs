import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {currentGen2Root} from '../lab/current-gen2-resources.mjs';
const root=process.cwd(),dep=createRequire(path.join(currentGen2Root,'package.json')),web=createRequire(path.join(currentGen2Root,'huabu/apps/web/package.json'));
const ts=dep('typescript'),esbuild=dep('esbuild'),React=web('react'),{renderToStaticMarkup}=web('react-dom/server');
const output=path.join(root,'output/Glyth思绪详情_20261026/准确进展路由专项.json');await fs.mkdir(path.dirname(output),{recursive:true});
const report={passed:false,scope:'Actual exported pure helpers, original ThoughtDetail JSX button and ConversationNodeInstance callbacks, mounted NativeCoreChatPanel listener, actual ConversationContent TSX and actual timeline projector with controlled hook/DOM focus ports. No live browser, Core/Host, model, backend success simulation or build.',checks:[],failures:[],coreWrites:0,modelCalls:0};
const test=(name,fn)=>{try{fn();report.checks.push(name);}catch(error){report.failures.push({name,error:String(error.stack??error)});}};
const parse=(text,name='actual.tsx')=>{const file=ts.createSourceFile(name,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);assert.equal(file.parseDiagnostics.length,0);return file;};
const declaration=(file,name)=>{const found=file.statements.filter(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name||ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(file)===name));assert.equal(found.length,1,name+' actual owner');return found[0].getText(file).replace(/^export\s+/,'');};
const descendants=(root,predicate)=>{const out=[];const walk=n=>{if(predicate(n))out.push(n);ts.forEachChild(n,walk);};walk(root);return out;};
const compile=text=>ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None,jsx:ts.JsxEmit.React}}).outputText;
const evaluate=(source,names,env={})=>new Function(...Object.keys(env),compile(source)+';return {'+names.join(',')+'};')(...Object.values(env));
const readFile=async file=>parse(await fs.readFile(path.join(root,file),'utf8'),file);
const helperBuild=await esbuild.build({entryPoints:[path.join(root,'lab/pilot/native-glyth-actions.ts')],bundle:true,write:false,format:'cjs',platform:'node',logLevel:'silent'});
const helperModule={exports:{}};new Function('module','exports',helperBuild.outputFiles[0].text)(helperModule,helperModule.exports);
const {resolveNativeGlythActions:resolveActions,resolveNativeGlythThoughtTarget:thoughtTarget,resolveNativeGlythProgressItemId:progress}=helperModule.exports;
const thoughtFile=await readFile('lcos/huabu/apps/web/src/lcos/collaboration/glythThought.ts');
const {resolveGlythThought}=evaluate(['clean','compact','newest','resolveGlythThought'].map(name=>declaration(thoughtFile,name)).join('\n'),['resolveGlythThought']);
const routeFile=await readFile('lab/pilot/native-task-route.ts');
const route=evaluate(['address','isNativeChatConversationSection','request','requestNativeConversationView'].map(name=>declaration(routeFile,name)).join('\n'),['requestNativeConversationView','isNativeChatConversationSection'],{CustomEvent});
const messageFile=await readFile('lab/pilot/native-chat-messages.ts'),messageExports={};new Function('exports',ts.transpileModule(messageFile.text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)(messageExports);
const visibilityFile=await readFile('lab/pilot/native-conversation-recovery-visibility.ts'),visibilityExports={};new Function('exports',ts.transpileModule(visibilityFile.text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)(visibilityExports);
const caps={canSend:false,canCancel:false,canResume:true,canRecover:false,canAnswerInput:false,canApprove:false};
const projection=(runId='new-run',patch={})=>({schemaVersion:1,projectId:'p',conversationId:'c',userState:'working',capabilities:{...caps},activity:{activeRunId:runId},recentReturns:[],...patch});
const item=(itemId,kind,runId,patch={})=>({schemaVersion:1,itemId,kind,title:itemId,occurredAt:'2026-10-26T01:00:00Z',refs:{runId},...patch});
const old=item('old-public-progress','progress','old-run'),start=item('new-start','work_started','new-run'),latest=item('new-public-progress','progress','new-run');
const entry=(timeline=[old,start,latest],patch={})=>({status:'ready',timelineStatus:'ready',timeline,projection:projection(),...patch});
const input=entry=>({projectId:'p',conversationId:'c',entry});
const displayed=resolveGlythThought(projection('old-run'),[old],'ready');assert.equal(displayed.sourceItemId,old.itemId);
const exactTarget={projectId:'p',conversationId:'c',section:'view-progress',progressItemId:old.itemId,progressRunId:'old-run'};

test('Actual original thought.scope/sourceItem produces exact old Run/item; task fallback and no-item scopes stay ordinary same-conversation views',()=>{
 assert.deepEqual(thoughtTarget({projectId:'p',conversationId:'c'},displayed),exactTarget);
 for(const row of [item('question','input_required','old-run'),item('result','result_returned','old-run')]){
  const model=resolveGlythThought(projection('old-run',row.kind==='input_required'?{userState:'needs_user',activity:{activeRunId:'old-run',pendingInputId:'question'}}:{userState:'done'}),[row],'ready');
  assert.equal(thoughtTarget({projectId:'p',conversationId:'c'},model).progressItemId,row.itemId);
 }
 const task=resolveGlythThought(projection('old-run',{activity:{activeRunId:'old-run',activeSummary:'原任务说明'}}),[],'ready');
 assert.deepEqual(thoughtTarget({projectId:'p',conversationId:'c'},task),{projectId:'p',conversationId:'c'});
 for(const patch of [{scope:'bad JSON'},{scope:JSON.stringify(['p','other','old-run'])},{scope:JSON.stringify(['other','c','old-run'])},{scope:JSON.stringify(['p','c',null])},{scope:JSON.stringify(['p','c','old-run','extra'])},{sourceItemId:' '}])assert.equal(thoughtTarget({projectId:'p',conversationId:'c'},{...displayed,...patch}),undefined);
 assert.equal(thoughtTarget({projectId:' ',conversationId:'c'},displayed),undefined);
});
test('Actual exact progress resolver requires one unique public activity with matching Run, keeps historical Run after active Run changes and does not treat messages as activities',()=>{
 assert.equal(progress(input(entry()),{itemId:old.itemId,runId:'old-run'}),old.itemId);
 assert.equal(progress(input(entry())),latest.itemId);
 for(const rows of [[latest],[{...old,refs:{runId:'another'}}],[old,{...old}],[old,{...old,refs:{runId:'new-run'}}],[{...old,kind:'user_message',body:'not activity'}],[{...old,kind:'agent_message',body:'not activity'}]])assert.equal(progress(input(entry(rows)),{itemId:old.itemId,runId:'old-run'}),undefined);
 for(const patch of [{status:'loading'},{status:'error'},{timelineStatus:'error'},{timelineStatus:undefined},{projection:projection('new-run',{projectId:'other'})},{projection:projection('new-run',{conversationId:'other'})}])assert.equal(progress(input(entry([old],patch)),{itemId:old.itemId,runId:'old-run'}),undefined);
});
test('Actual route dispatch forwards exact pairs only to original same-rail events; malformed/foreign requests have zero dispatch',()=>{
 const events=[],ports={projectId:()=> 'p',dispatch:event=>{events.push(event);return true;}};
 assert.equal(route.requestNativeConversationView(exactTarget,ports),true);assert.deepEqual(events.map(e=>e.type),['lcos-native-select-conversation','lcos-native-open-conversation']);assert.deepEqual(events[0].detail,exactTarget);
 for(const target of [{...exactTarget,projectId:'foreign'},{...exactTarget,section:'session-options'},{...exactTarget,progressRunId:undefined},{...exactTarget,progressItemId:undefined},{...exactTarget,progressItemId:' '},{...exactTarget,section:'unknown'},{...exactTarget,conversationId:' '}]){const before=events.length;assert.equal(route.requestNativeConversationView(target,ports),false);assert.equal(events.length,before);}
});

const agentFile=await readFile('lab/pilot/native-agent-ui.tsx'),agentOwner=descendants(agentFile,n=>ts.isFunctionDeclaration(n)&&n.name?.text==='ConversationNodeInstance')[0];assert.ok(agentOwner);
const actualVariable=(owner,name)=>{const found=descendants(owner,n=>ts.isVariableDeclaration(n)&&n.name.getText(agentFile)===name);assert.equal(found.length,1,name);return 'const '+found[0].getText(agentFile)+';';};
const api={},reference={projectId:'p',connectedConversationId:'c',canvasId:'main',workspaceId:'workspace'},data={lcos_conversation_ref:reference};
let shell={projectId:'p'},live={status:'ready',canvasId:'main',rfInstance:api,nodes:[{id:'glyph',data}]},freshEntry=entry();const agentEvents=[];
const agentPorts={projectId:()=>shell.projectId,dispatch:event=>{agentEvents.push(event);return true;}};
const agentEnv={reference,data,id:'glyph',canvas:{rfInstance:api},useLcosShellStore:{getState:()=>shell},useCanvasStore:{getState:()=>live},
 useCollaborationSessionStore:{getState:()=>({entries:new Map([['p:c',freshEntry]])})},resolveNativeGlythThoughtTarget:thoughtTarget,resolveNativeGlythActions:resolveActions,
 requestNativeConversationView:target=>route.requestNativeConversationView(target,agentPorts)};
const agent=evaluate(actualVariable(agentOwner,'openThoughtProcess')+'\n'+actualVariable(agentOwner,'openStateAction'),['openThoughtProcess','openStateAction'],agentEnv);
test('Actual Glyth callback keeps displayed old thought address and rejects replaced project/API/scene/hidden/removed/retargeted original nodes',()=>{
 agent.openThoughtProcess(displayed);assert.deepEqual(agentEvents[0].detail,exactTarget);agentEvents.length=0;
 agent.openThoughtProcess();assert.deepEqual(agentEvents[0].detail,{projectId:'p',conversationId:'c'});agentEvents.length=0;
 const originalLive=live,originalShell=shell;
 for(const patch of [{status:'loading'},{canvasId:'elsewhere'},{rfInstance:{}},{nodes:[]},{nodes:[{id:'glyph',hidden:true,data}]},{nodes:[{id:'glyph',data:{lcos_conversation_ref:{...reference,connectedConversationId:'different'}}}]}]){live={...originalLive,...patch};agent.openThoughtProcess(displayed);assert.equal(agentEvents.length,0);}
 live=originalLive;shell={projectId:'elsewhere'};agent.openThoughtProcess(displayed);assert.equal(agentEvents.length,0);shell=originalShell;
});
test('Actual original state-primary callback still re-resolves current permissions and original primary section; thought routing does not replace primary',()=>{
 const current=resolveActions(input(freshEntry));assert.equal(current.primary.id,'view-progress');agent.openStateAction(current.primary);assert.deepEqual(agentEvents[0].detail,current.primary.target);assert.equal(Object.hasOwn(agentEvents[0].detail,'progressItemId'),false);agentEvents.length=0;
 freshEntry=entry([],{projection:projection(undefined,{userState:'ready',activity:{},capabilities:{...caps,canResume:true}})});
 const ready=resolveActions(input(freshEntry));assert.equal(ready.primary.id,'session-options');agent.openStateAction(ready.primary);assert.deepEqual(agentEvents[0].detail,ready.primary.target);agentEvents.length=0;
 agent.openStateAction(current.primary);assert.equal(agentEvents.length,0,'a stale old primary that is no longer available does not navigate');freshEntry=entry();
});
const detailFile=await readFile('lab/pilot/native-glyth-thought-detail.tsx');
const processButton=descendants(detailFile,n=>ts.isJsxElement(n)&&n.openingElement.attributes.properties.some(a=>ts.isJsxAttribute(a)&&a.name.getText(detailFile)==='data-native-glyth-thought-process'));assert.equal(processButton.length,1);
test('Actual ThoughtDetail JSX process handler closes the same Popover then passes displayed current, not a newer pending thought; empty button opens ordinary conversation',()=>{
 const focusRequest={current:true},outsideIntent={current:false},closed=[];let received;
 const latestThought=resolveGlythThought(projection(),[latest],'ready');
 const env={React,current:displayed,focusRequest,outsideIntent,setOpen:value=>closed.push(value),latest:{current:{thought:latestThought,onOpenProcess:value=>{received=value;agent.openThoughtProcess(value);}}}};
 const button=new Function(...Object.keys(env),compile('return '+processButton[0].getText(detailFile)))(...Object.values(env));button.props.onClick();
 assert.equal(received,displayed);assert.equal(focusRequest.current,false);assert.equal(outsideIntent.current,true);assert.deepEqual(closed,[false]);assert.deepEqual(agentEvents[0].detail,exactTarget);agentEvents.length=0;
 env.current=undefined;const empty=new Function(...Object.keys(env),compile('return '+processButton[0].getText(detailFile)))(...Object.values(env));assert.match(renderToStaticMarkup(empty),/查看对话/);empty.props.onClick();assert.deepEqual(agentEvents[0].detail,{projectId:'p',conversationId:'c'});agentEvents.length=0;
});

const uiFile=await readFile('lab/pilot/native-chat-ui.tsx');
const listenerOwners=descendants(uiFile,n=>ts.isCallExpression(n)&&n.expression.getText(uiFile)==='useEffect'&&ts.isArrowFunction(n.arguments[0])&&descendants(n.arguments[0],child=>ts.isVariableDeclaration(child)&&child.name.getText(uiFile)==='openConversation').length===1);assert.equal(listenerOwners.length,1);
test('Actual mounted panel listener carries exact progress item/Run to section state and same original route, rejects malformed pairs/foreign owners and unregisters on close',()=>{
 const bus=new EventTarget(),requests=[],sections=[],routes=[],snapshots=[],attempts=[],library=[];const shellState={projectId:'p'},libraryTaskRoute={current:{page:'task',runId:'previous'}};
 const env={window:bus,useLcosShellStore:{getState:()=>shellState},libraryTaskRoute,replaceLibraryOrigin:value=>library.push(value),hasNativeLibraryReadingReturn:()=>false,nativeLibraryReadingReturnCurrent:()=>false,
 setConversationRequest:value=>requests.push(value),setSectionRequest:value=>sections.push(value),sectionSequence:{current:4},isNativeChatConversationSection:route.isNativeChatConversationSection,
 setRoute:value=>routes.push(value),nativeChatConversationRoute:{page:'conversation'},setSnapshot:value=>snapshots.push(value),setAttempt:value=>attempts.push(value(0))};
 const mounted=new Function(...Object.keys(env),compile('const mounted='+listenerOwners[0].arguments[0].getText(uiFile))+';return mounted;')(...Object.values(env));const dispose=mounted();
 const ports={projectId:()=>shellState.projectId,dispatch:event=>bus.dispatchEvent(event)};assert.equal(route.requestNativeConversationView(exactTarget,ports),true);
 assert.deepEqual(requests,[{projectId:'p',conversationId:'c',status:'pending'}]);assert.deepEqual(sections,[{projectId:'p',conversationId:'c',section:'view-progress',sequence:5,progressItemId:old.itemId,progressRunId:'old-run'}]);assert.deepEqual(routes,[{page:'conversation'}]);assert.equal(libraryTaskRoute.current,undefined);
 for(const patch of [{projectId:'foreign'},{progressRunId:undefined},{progressItemId:' '},{section:'session-options'}])bus.dispatchEvent(new CustomEvent('lcos-native-select-conversation',{detail:{...exactTarget,...patch}}));assert.equal(requests.length,1);
 shellState.projectId='other';bus.dispatchEvent(new CustomEvent('lcos-native-select-conversation',{detail:exactTarget}));assert.equal(requests.length,1);shellState.projectId='p';dispose();bus.dispatchEvent(new CustomEvent('lcos-native-select-conversation',{detail:exactTarget}));assert.equal(requests.length,1);
});

const sameDeps=(a,b)=>!!a&&!!b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
function hooksRunner(create){const cells=[];let cursor=0,pending=false,mounted=true,effects=[],args,result;const hooks={
 useState(initial){const i=cursor++;if(!(i in cells))cells[i]={value:typeof initial==='function'?initial():initial};return[cells[i].value,update=>{assert.ok(mounted,'no setState after unmount');const value=typeof update==='function'?update(cells[i].value):update;if(!Object.is(value,cells[i].value)){cells[i].value=value;pending=true;}}];},
 useRef(initial){const i=cursor++;if(!(i in cells))cells[i]={value:{current:initial}};return cells[i].value;},
 useMemo(fn,deps){const i=cursor++;if(!cells[i]||!sameDeps(cells[i].deps,deps))cells[i]={deps,value:fn()};return cells[i].value;},
 useEffect(fn,deps){const i=cursor++,old=cells[i];if(!old||!sameDeps(old.deps,deps)){cells[i]={deps,cleanup:old?.cleanup};effects.push(()=>{cells[i].cleanup?.();cells[i].cleanup=fn();});}}};
 const fn=create(hooks);return{render(...next){args=next;let turns=0;do{assert.ok(++turns<30);pending=false;cursor=0;result=fn(...args);for(const effect of effects.splice(0))effect();}while(pending);return result;},unmount(){for(const cell of cells)cell?.cleanup?.();mounted=false;effects=[];}};}
const walkTree=(node,visit)=>{if(Array.isArray(node)){node.forEach(n=>walkTree(n,visit));return;}if(!React.isValidElement(node))return;visit(node);walkTree(node.props.children,visit);};
const contentCode=compile(declaration(uiFile,'useNativeConversationDiagnostics')+'\n'+declaration(uiFile,'ConversationContent').replace('(import.meta.env as Record<string, unknown>).LCOS_NATIVE_CANVAS_TOOLS','false'));
function uiHarness(){let currentEntry=entry(),lastTree,lastAfter,lastHtml,slots=[],activityNodes=[],progressNode;const rafs=new Map(),scheduled=[],focus=[],scroll=[],queries=[];let rafId=0,refresh=0,dismiss=0,mutation=0;
 const nodeFromElement=(element,label)=>{const controls=[];walkTree(element.props.children,n=>{if(['button','input','textarea','summary'].includes(n.type))controls.push(n);});const control=controls[0];const child=control?{focus(){focus.push('control:'+label);},click(){control.props.onClick?.();}}:null;
  return{isConnected:true,dataset:{nativeChatActivityItem:element.props['data-native-chat-activity-item'],nativeChatActivityRun:element.props['data-native-chat-activity-run']},matches:()=>false,
   querySelector:()=>child,scrollIntoView(){scroll.push(label);},focus(){focus.push(label);}};};
 const frameRoot={querySelectorAll(selector){queries.push(selector);assert.equal(selector,'[data-native-chat-activity-item]');return activityNodes;},querySelector(selector){queries.push(selector);if(selector==='[data-native-chat-progress-state]')return progressNode??null;throw Error('Unexpected first/fallback section query: '+selector);}};
 function NativeMessages(props){slots=props.messages.flatMap(message=>[props.renderBeforeMessage(message.id)]);lastAfter=props.renderAfterMessages();slots.push(lastAfter);return React.createElement('main',null,...slots);}
 let props={projectId:'p',conversationId:'c',NativeMessages,onRefresh:()=>refresh++,onDismissRequest:()=>dismiss++,requestedSection:{section:'view-progress',sequence:1,progressItemId:old.itemId,progressRunId:'old-run'}};
 const ui=hooksRunner(hooks=>{const shellHook=select=>select({composerTarget:{nodeId:'same-input',intent:'continue',receiverConversationId:props.conversationId}});shellHook.getState=()=>({projectId:props.projectId});const env={...hooks,React,useComposerContinuation:()=>({diagnosticsStatus:'ready',diagnostics:{conversationId:props.conversationId,operations:[]}}),
  useCollaborationSession:(p,c)=>{assert.equal(p,props.projectId);assert.equal(c,props.conversationId);return currentEntry;},useLcosShellStore:shellHook,createLcosCoreSession:()=>({http:{}}),CoreCollaborationClient:class{},useNativeComposerParts:()=>undefined,
  nativeConversationRecoveryOperations:visibilityExports.nativeConversationRecoveryOperations,nativeConversationRecoveryExecutionTarget:visibilityExports.nativeConversationRecoveryExecutionTarget,
  projectNativeChatMessages:messageExports.projectNativeChatMessages,resolveNativeGlythProgressItemId:progress,
  requestAnimationFrame:fn=>{const id=++rafId;rafs.set(id,fn);scheduled.push(fn);return id;},cancelAnimationFrame:id=>rafs.delete(id),
  document:{querySelector:selector=>{assert.equal(selector,'[data-lcos-native-chat-frame]');return frameRoot;},querySelectorAll:()=>[]},useCanvasStore:{getState:()=>({canvasId:'main'})},
  cancelConversationRun:()=>{mutation++;throw Error('No cancel action is authorized in this read-only test');},refreshNativeRecoveredComposer:()=>{mutation++;throw Error('No recovery action is authorized');}};
  return new Function(...Object.keys(env),contentCode+';return ConversationContent;')(...Object.values(env));});
 const render=(nextEntry=currentEntry,nextProps={})=>{currentEntry=nextEntry;props={...props,...nextProps};activityNodes.forEach(n=>n.isConnected=false);if(progressNode)progressNode.isConnected=false;slots=[];lastAfter=undefined;lastTree=ui.render(props);lastHtml=renderToStaticMarkup(lastTree);activityNodes=[];progressNode=undefined;
  const collect=n=>{if(n.props['data-native-chat-activity-item'])activityNodes.push(nodeFromElement(n,'activity:'+n.props['data-native-chat-activity-item']));if(n.props['data-native-chat-progress-state']!==undefined)progressNode=nodeFromElement(n,'progress-state');};walkTree(lastTree,collect);walkTree(slots,collect);return lastHtml;};
 return{render,frames(){const callbacks=[...rafs.values()];rafs.clear();callbacks.forEach(fn=>fn());},get pending(){return[...rafs.values()];},get scheduled(){return scheduled;},get focus(){return focus;},get scroll(){return scroll;},get queries(){return queries;},get activities(){return activityNodes;},get tree(){return lastTree;},get tail(){return lastAfter;},get html(){return lastHtml;},get refresh(){return refresh;},get dismiss(){return dismiss;},get mutations(){return mutation;},unmount:()=>ui.unmount()};
}

test('Actual ConversationContent TSX focuses exact old activity after a newer active Run, primary without exact target still focuses newest current Run, and activity identity/run attrs remain intact',()=>{
 const ui=uiHarness();ui.render();assert.equal(ui.activities.find(n=>n.dataset.nativeChatActivityItem===old.itemId).dataset.nativeChatActivityRun,'old-run');ui.frames();assert.equal(ui.scroll.at(-1),'activity:'+old.itemId);assert.equal(ui.focus.at(-1),'activity:'+old.itemId);
 ui.render(entry(),{requestedSection:{section:'view-progress',sequence:2}});ui.frames();assert.equal(ui.scroll.at(-1),'activity:'+latest.itemId);assert.ok(!ui.queries.includes('[data-native-chat-activity]'));assert.equal(ui.mutations,0);ui.unmount();
});
test('Actual missing/mismatched/message exact targets render named missing state, never current/latest fallback; return uses original onDismissRequest',()=>{
 const cases=[[latest],[{...old,refs:{runId:'wrong'}},latest],[{...old,kind:'user_message',body:'A real message, never activity'},latest],[{...old,kind:'agent_message',body:'A real reply, never activity'},latest]];
 for(const rows of cases){const ui=uiHarness();const html=ui.render(entry(rows));assert.match(html,/暂时没有找到这条进展，原对话和记录保留/);ui.frames();assert.equal(ui.scroll.at(-1),'progress-state');assert.ok(!ui.scroll.includes('activity:'+latest.itemId));let back;walkTree(ui.tail,n=>{if(n.type==='button'&&n.props.children==='返回对话')back=n;});assert.ok(back);back.props.onClick();assert.equal(ui.dismiss,1);assert.equal(ui.mutations,0);ui.unmount();}
});
test('Actual duplicate/invalid timeline and read errors stay named error with original retry; loading never focuses an old activity',()=>{
 for(const failure of [entry([old,old]),entry([{...old,kind:'unsupported_public_kind'}]),entry([old],{status:'error'}),entry([old],{timelineStatus:'error'})]){
  const ui=uiHarness();const html=ui.render(failure);assert.match(html,/暂时无法读取当前进展，已有对话保留/);assert.match(html,/重新读取进展/);assert.equal(ui.activities.length,0);ui.frames();assert.equal(ui.scroll.at(-1),'progress-state');let retry;walkTree(ui.tree,n=>{if(n.type==='button'&&n.props.children==='重新读取进展')retry=n;});assert.ok(retry);retry.props.onClick();assert.equal(ui.refresh,1);assert.equal(ui.mutations,0);ui.unmount();
 }
 const ui=uiHarness();assert.match(ui.render(entry([old],{status:'loading'})),/正在打开/);assert.equal(ui.pending.length,0);assert.equal(ui.focus.length,0);ui.unmount();
});
test('Actual conversation owner effect cancels old focus on conversation/project change and unmount; manually delivered old callback still cannot focus the replacement page',()=>{
 const ui=uiHarness();ui.render();const oldFrame=ui.pending[0];assert.ok(oldFrame);
 ui.render(entry([item('next-progress','progress','next-run')],{projection:projection('next-run',{conversationId:'next'})}),{conversationId:'next',requestedSection:{section:'view-progress',sequence:2,progressItemId:'next-progress',progressRunId:'next-run'}});
 assert.equal(ui.pending.length,1);oldFrame();assert.equal(ui.focus.length,0);ui.frames();assert.equal(ui.scroll.at(-1),'activity:next-progress');
 ui.render(entry([latest]),{conversationId:'c',requestedSection:{section:'view-progress',sequence:3,progressItemId:latest.itemId,progressRunId:'new-run'}});const pending=ui.pending[0];assert.ok(pending);const count=ui.focus.length;ui.unmount();assert.equal(ui.pending.length,0);pending();assert.equal(ui.focus.length,count);assert.equal(ui.mutations,0);
 const project=uiHarness();project.render();const oldProject=project.pending[0];project.render(entry([latest],{projection:projection('new-run',{projectId:'new-project'})}),{projectId:'new-project',requestedSection:{section:'view-progress',sequence:4,progressItemId:latest.itemId,progressRunId:'new-run'}});oldProject();assert.equal(project.focus.length,0);project.frames();assert.equal(project.focus.length,1);project.unmount();
});
report.passed=report.failures.length===0;await fs.writeFile(output,JSON.stringify(report,null,2));console.log(JSON.stringify({...report,report:output},null,2));if(!report.passed)process.exitCode=1;
