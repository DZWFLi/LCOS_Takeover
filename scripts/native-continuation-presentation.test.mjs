import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {currentGen2Root,readCurrentGen2Resource} from '../lab/current-gen2-resources.mjs';
import {transformNativeContinuationPresentationSource,withNativeContinuationPresentationTransforms} from '../lab/native-continuation-presentation-transform.mjs';
import {nativeTaskRouteSourceTransforms} from '../lab/native-task-route-source-transform.mjs';
import {nativeLiveContinuationComposerTransforms} from '../lab/native-live-continuation-composer-transform.mjs';
const root=path.resolve(import.meta.dirname,'..'),require=createRequire(path.join(currentGen2Root,'package.json')),ts=require('typescript');
const web=createRequire(path.join(currentGen2Root,'huabu/apps/web/package.json')),React=web('react'),{renderToStaticMarkup}=web('react-dom/server');
const owner='lcos/huabu/apps/web/src/lcos/professional/ConversationContinuationControls.tsx',sourcePath=path.join(root,owner),original=await fs.readFile(sourcePath,'utf8');
const report={passed:false,checks:[],networkRequests:0,coreWrites:0,modelCalls:0,browser:false,fullBuild:false};
const output=path.join(root,'output/会话选项用户文案_20261026');await fs.mkdir(output,{recursive:true});
const parse=(source,name='actual.tsx')=>{const file=ts.createSourceFile(name,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);assert.equal(file.parseDiagnostics.length,0);return file;};
const nodes=(file,predicate)=>{const found=[];const visit=node=>{if(predicate(node))found.push(node);ts.forEachChild(node,visit);};visit(file);return found;};
const declaration=(file,name)=>{const rows=file.statements.filter(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name||ts.isVariableStatement(node)&&node.declarationList.declarations.some(row=>row.name.getText(file)===name));assert.equal(rows.length,1,name);return rows[0].getText(file).replace(/^export\s+/,'');};
const compile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None,jsx:ts.JsxEmit.React}}).outputText;
const tick=()=>new Promise(resolve=>setImmediate(resolve));
try{
 const routed=nativeTaskRouteSourceTransforms[owner](original,{sourcePath});
 const before=nativeLiveContinuationComposerTransforms[owner](routed,{sourcePath}),after=transformNativeContinuationPresentationSource(before,{sourcePath});
 const wrapped=withNativeContinuationPresentationTransforms({[owner]:(source,options)=>nativeLiveContinuationComposerTransforms[owner](nativeTaskRouteSourceTransforms[owner](source,options),options)});
 assert.equal(wrapped[owner](original,{sourcePath}),after);assert.equal(transformNativeContinuationPresentationSource(after,{sourcePath}),after);
 assert.throws(()=>transformNativeContinuationPresentationSource(original,{sourcePath:path.join(root,'different.tsx')}),/exact original sourcePath/);
 assert.throws(()=>transformNativeContinuationPresentationSource(original.replace("capability: 'canFork'","capability: 'canSelectedContext'"),{sourcePath}),/exact mode identity/);
 const oldFile=parse(before),file=parse(after);
 const variable=(file,name)=>{const row=nodes(file,node=>ts.isVariableDeclaration(node)&&node.name.getText(file)===name);assert.equal(row.length,1);return row[0].initializer.getText(file);};
 for(const name of ['submit','handleEscape'])assert.equal(variable(file,name),variable(oldFile,name),name+' remains exact original controller');
 assert.equal(declaration(file,'readOnlyItems'),declaration(oldFile,'readOnlyItems'));
 for(const attrName of ['onClick','onChange','disabled']){
  const attrs=file=>nodes(file,node=>ts.isJsxAttribute(node)&&node.name.getText(file)===attrName).map(node=>node.initializer?.getText(file));
  assert.deepEqual(attrs(file),attrs(oldFile),attrName+' callbacks/admission remain exact original');
 }
 const presenter={};new Function('exports',ts.transpileModule(await fs.readFile('lab/pilot/native-continuation-presentation.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)(presenter);
 const icons=Object.fromEntries(['ChevronDown','GitFork','History','Layers','Plus','RotateCcw'].map(name=>[name,props=>React.createElement('svg',{'data-icon':name,...props})]));
 const evaluate=(source,env)=>new Function(...Object.keys(env),compile(source))(...Object.values(env));
 const readModes=(file,withPresenter)=>evaluate(declaration(file,'MODES')+'\nreturn MODES;',{...icons,...(withPresenter?presenter:{})});
 assert.deepEqual(readModes(file,true).map(({action,capability,Icon})=>({action,capability,Icon})),readModes(oldFile,false).map(({action,capability,Icon})=>({action,capability,Icon})));
 report.checks.push('Exact original source owner/idempotent wrapper composes after existing routes/live transforms; original four action/capability/Icon identities, submit/receipt/retry/escape/onChange/onClick/disabled expressions remain unchanged; wrong source/mode seams fail explicitly');

 const actions=['continue_existing','selected_context','blank_new','native_full_fork'];
 for(const action of actions){
  assert.equal(presenter.nativeContinuationCapabilityReason(action,true,'ready'),undefined);
  assert.ok(presenter.nativeContinuationCapabilityReason(action,false,'ready'));
  assert.match(presenter.nativeContinuationCapabilityReason(action,undefined,'loading'),/正在读取/);
  assert.match(presenter.nativeContinuationCapabilityReason(action,undefined,'error'),/暂时无法读取/);
 }
 const rawError={schemaVersion:1,code:'future_unknown_code',retryable:true,userMessage:'Core HTTP 503 operation provider protocol detail',diagnosticsRef:'retained-original-evidence'};
 const errorBefore=JSON.stringify(rawError);assert.match(presenter.nativeContinuationErrorMessage('blank_new',rawError),/重试原请求/);assert.equal(JSON.stringify(rawError),errorBefore);
 assert.match(presenter.nativeContinuationErrorMessage('blank_new',{...rawError,retryable:false}),/查看原请求/);
 for(const code of ['unavailable','needs_recovery','permission_required','input_required','provider_offline','operation_unknown','operation_failed','cancelled']){
  const text=presenter.nativeContinuationErrorMessage('native_full_fork',{...rawError,code});assert.ok(text.length>0);assert.doesNotMatch(text,/Core|HTTP|operation|provider|protocol|Agenetes|authoritative/);
 }
 report.checks.push('Pure copy depends only on actual action/capability/read state/product error code/retryability, not raw-string filtering; known capabilities remain available and unknown retryable errors retain original retry semantics/evidence');

 const actionsPath=path.join(root,'lcos/huabu/apps/web/src/lcos/professional/conversationContinuationActions.ts');
 const actionsSource=readCurrentGen2Resource(actionsPath)?.contents??await fs.readFile(actionsPath,'utf8');
 const originalActions={};let allocated=0;
 new Function('exports','crypto',ts.transpileModule(actionsSource,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)(originalActions,{randomUUID:()=> 'controlled-'+(++allocated)});
 const buttonFile=parse(await fs.readFile('lcos/huabu/apps/web/src/lcos/ui/primitives/LcosButton.tsx','utf8'));
 const LcosButton=evaluate(declaration(buttonFile,'LcosButton')+'\nreturn LcosButton;',{React,forwardRef:React.forwardRef});
 const componentCode=compile(declaration(file,'MODES')+'\n'+declaration(file,'readOnlyItems')+'\n'+declaration(file,'ConversationContinuationControls')+'\nreturn ConversationContinuationControls;');
 const sameDeps=(a,b)=>!!a&&!!b&&a.length===b.length&&a.every((value,index)=>Object.is(value,b[index]));
 function hooksRunner(create){const cells=[];let cursor=0,pending=false,mounted=true,effects=[],args,result;
  const hooks={useState(initial){const index=cursor++;if(!(index in cells))cells[index]={value:typeof initial==='function'?initial():initial};return[cells[index].value,update=>{assert.equal(mounted,true);const value=typeof update==='function'?update(cells[index].value):update;if(!Object.is(value,cells[index].value)){cells[index].value=value;pending=true;}}];},
   useRef(initial){const index=cursor++;if(!(index in cells))cells[index]={value:{current:initial}};return cells[index].value;},
   useMemo(callback,deps){const index=cursor++;if(!cells[index]||!sameDeps(cells[index].deps,deps))cells[index]={deps,value:callback()};return cells[index].value;},
   useEffect(callback,deps){const index=cursor++,previous=cells[index];if(!previous||!sameDeps(previous.deps,deps)){cells[index]={deps,cleanup:previous?.cleanup};effects.push(()=>{cells[index].cleanup?.();cells[index].cleanup=callback();});}},
   useId(){return hooks.useMemo(()=> 'original-control-id',[]);}};
  const fn=create(hooks),flush=()=>{let turns=0;do{assert.ok(++turns<30);pending=false;cursor=0;result=fn(...args);for(const effect of effects.splice(0))effect();}while(pending);return result;};
  return{render(...next){args=next;return flush();},unmount(){mounted=false;for(const cell of cells)cell?.cleanup?.();}};
 }
 const walk=(node,predicate)=>{const found=[];const visit=value=>{if(Array.isArray(value)){value.forEach(visit);return;}if(!React.isValidElement(value))return;if(predicate(value))found.push(value);visit(value.props.children);};visit(node);return found;};
 const baseCaps={canResume:true,canSelectedContext:true,canBlankNew:true,canFork:true};
 const actualProjection={schemaVersion:1,projectId:'p',conversationId:'c',userState:'ready',capabilities:baseCaps,capabilityReasons:{},activity:{},recentReturns:[],relation:{targetRefs:[]},identity:{title:'搭档'}};
 const pinnedRefs=[{entityType:'artifact',entityId:'original-artifact',revisionId:'original-revision'},{entityType:'workspace',entityId:'original-workspace'}];
 function harness({projection=actualProjection,status='ready',draftReferences=pinnedRefs,result}={}){
  const requests=new Map(),calls=[],submissions=[],refreshes=[],routes=[],updates=[];
  const shell={continuationRequests:requests,setContinuationRequest(key,value){updates.push({key,value});if(value===undefined)requests.delete(key);else requests.set(key,value);}};
  const store=Object.assign(selector=>selector(shell),{getState:()=>shell});
  const client=Object.fromEntries(['resume','newSession','fork'].map(kind=>[kind,async(...args)=>{calls.push({kind,args});if(result)return result(kind,args);return{ok:true,receipt:{command:kind==='newSession'?'new_session':kind,conversationId:kind==='newSession'?args[2].conversationId:args[1].conversationId,continuationOperationId:kind==='newSession'?args[2].operationId:args[1].operationId}};}]));
  const reader={status,projection};let props={projectId:'p',conversationId:'c',draftReferences,collaboration:client,onSubmitted:value=>submissions.push(value)};
  const runner=hooksRunner(hooks=>{const env={...hooks,...icons,...presenter,...originalActions,React,LcosButton,
   CoreCollaborationClient:class{constructor(){throw Error('No real client construction in controlled test');}},createLcosCoreSession(){throw Error('No runtime session creation');},
   useCollaborationSession:()=>reader,useLcosShellStore:store,useCollaborationSessionStore:{getState:()=>({refresh:(...args)=>{refreshes.push(args);return Promise.resolve();}})},
   ComposerReferenceStrip:({items})=>React.createElement('div',{'data-original-reference-preview':items.map(item=>item.label).join('|')}),requestNativeConversationView:target=>routes.push(target)};
   return new Function(...Object.keys(env),componentCode)(...Object.values(env));});
  let tree,html;const render=()=>{tree=runner.render(props);html=renderToStaticMarkup(tree);return html;};
  const find=predicate=>{const rows=walk(tree,predicate);assert.equal(rows.length,1);return rows[0];};
  const clickConfirm=()=>{const button=find(node=>node.props['data-lcos-continuation-confirm']!==undefined);assert.notEqual(button.props.disabled,true,'Only real enabled original confirmation is clicked');button.props.onClick();};
  render();find(node=>node.type==='button'&&node.props.className==='lcos-continuation-toggle').props.onClick();render();
  return{render,find,clickConfirm,get html(){return html;},get tree(){return tree;},props,setProps(value){props={...props,...value};},reader,runner,requests,calls,submissions,refreshes,routes,updates,
   choose(action){find(node=>node.type==='input'&&node.props.value===action).props.onChange();render();}};
 }
 const realPayload=JSON.parse(await fs.readFile(path.join(root,'output/Glyth状态近场捷径_20261026/断线原投影_GET_20261026.json'),'utf8'));
 const captured=realPayload.value??realPayload.data??realPayload,readBefore=JSON.stringify(captured);
 const unsupported=harness({projection:captured});unsupported.choose('native_full_fork');
 assert.match(unsupported.html,/开始方式/);assert.match(unsupported.html,/历史分支/);assert.match(unsupported.html,/目前不能从完整历史创建分支/);
 assert.doesNotMatch(unsupported.html,/authoritative|Agenetes|probe|HTTP|\bCore\b|\bAPI\b|operation/i);
 const disabledConfirm=unsupported.find(node=>node.props['data-lcos-continuation-confirm']!==undefined);assert.equal(disabledConfirm.props.disabled,true);assert.match(disabledConfirm.props.title,/目前不能从完整历史创建分支/);
 assert.equal(unsupported.find(node=>node.type==='input'&&node.props.value==='native_full_fork').props.checked,true);
 assert.equal(unsupported.calls.length,0);assert.equal(JSON.stringify(captured),readBefore);unsupported.runner.unmount();
 report.checks.push('Actual transformed TSX consumes saved real unsupported-fork projection: human explanation/tooltip, original native_full_fork stays selected, confirmation stays disabled, no selected-context fallback or call, and raw probe evidence remains unchanged');

 for(const action of actions){
  let resolve;const pending=new Promise(done=>{resolve=done;});const control=harness({result:()=>pending});control.choose(action);
  assert.equal(control.find(node=>node.props['data-lcos-continuation-confirm']!==undefined).props.disabled,false);
  const firstButton=control.find(node=>node.props['data-lcos-continuation-confirm']!==undefined);firstButton.props.onClick();firstButton.props.onClick();
  assert.equal(control.calls.length,1,'Original synchronous sending guard prevents double submit');
  const call=control.calls[0],payload=call.kind==='newSession'?call.args[2]:call.args[1],command=action==='continue_existing'?'resume':action==='native_full_fork'?'fork':'new_session';
  assert.equal(call.kind,command==='new_session'?'newSession':command);assert.equal(payload.conversationId,'c');
  if(command==='new_session')assert.equal(call.args[1],action);
  if(action==='selected_context')assert.deepEqual(payload.orderedReferences,originalActions.buildSelectedContextReferences(pinnedRefs).orderedReferences);
  else assert.equal(payload.orderedReferences,undefined);
  resolve({ok:true,receipt:{command,conversationId:'c',continuationOperationId:payload.operationId}});await tick();control.render();
  assert.equal(control.submissions.length,1);assert.equal(control.submissions[0].action,action);assert.equal(control.submissions[0].operationId,payload.operationId);
  assert.match(control.html,/已提交，等待连接结果确认/);assert.equal([...control.requests.values()][0].status,'accepted');
  firstButton.props.onClick();assert.equal(control.calls.length,1,'Original accepted receipt prevents repeat creation');control.runner.unmount();
 }
 report.checks.push('Actual unchanged submit runs all four original supported handlers: resume, selected-context newSession with exact refs, blank newSession without refs, and true fork; original double-click/accepted guards and exact operation receipts remain intact');

 const retryRaw={schemaVersion:1,code:'future_unknown_code',retryable:true,userMessage:'Core HTTP 503 operation protocol detail',diagnosticsRef:'original-private-evidence'};
 const retried=harness({result:()=>({ok:false,error:retryRaw})});retried.choose('selected_context');retried.clickConfirm();await tick();retried.render();
 const firstIntent=[...retried.requests.values()][0].intent,firstPayload=structuredClone(retried.calls[0].args[2]);
 assert.equal([...retried.requests.values()][0].error,retryRaw);assert.match(retried.html,/重试原请求/);assert.doesNotMatch(retried.html,/Core HTTP|operation protocol/);
 assert.equal(retried.find(node=>node.props['data-lcos-continuation-confirm']!==undefined).props.disabled,false);
 retried.setProps({draftReferences:[{entityType:'artifact',entityId:'new-draft-artifact',revisionId:'new-draft-revision'}]});retried.render();retried.clickConfirm();await tick();retried.render();
 assert.equal(retried.calls.length,2);assert.deepEqual(retried.calls[1].args[2],firstPayload);assert.equal([...retried.requests.values()][0].intent,firstIntent);assert.equal([...retried.requests.values()][0].error,retryRaw);
 retried.runner.unmount();
 report.checks.push('Unknown retryable error remains retryable in actual TSX, raw error/diagnostic evidence is preserved, and original retry reuses the same operation plus first immutable selected-reference snapshot despite later draft edits');

 const wrongReceipt=harness({result:()=>({ok:true,receipt:{command:'new_session',conversationId:'other',continuationOperationId:'other-operation'}})});wrongReceipt.choose('blank_new');wrongReceipt.clickConfirm();await tick();wrongReceipt.render();
 const unconfirmed=[...wrongReceipt.requests.values()][0];assert.equal(unconfirmed.error.code,'operation_unknown');assert.equal(unconfirmed.error.retryable,false);
 assert.equal(wrongReceipt.find(node=>node.props['data-lcos-continuation-confirm']!==undefined).props.disabled,true);assert.match(wrongReceipt.html,/结果还没有确认/);assert.equal(wrongReceipt.submissions.length,0);
 const recoveryButton=wrongReceipt.find(node=>node.type===LcosButton&&node.props.variant==='ghost');recoveryButton.props.onClick();
 assert.deepEqual(wrongReceipt.routes,[{projectId:'p',conversationId:'c',section:'recover-session',continuationOperationId:unconfirmed.intent.operationId}]);wrongReceipt.runner.unmount();
 report.checks.push('Original mismatched-receipt protection yields outcome-unknown/nonretryable, keeps same stored intent, and original recovery button addresses that exact request in the same conversation; no alternate session/window is introduced');

 let finish;const delayed=harness({result:()=>new Promise(resolve=>{finish=resolve;})});delayed.choose('blank_new');delayed.clickConfirm();const oldPayload=delayed.calls[0].args[2];
 delayed.setProps({conversationId:'new-owner'});delayed.render();finish({ok:true,receipt:{command:'new_session',conversationId:'c',continuationOperationId:oldPayload.operationId}});await tick();delayed.render();
 assert.equal(delayed.submissions.length,0);assert.ok([...delayed.requests.keys()].every(key=>!key.startsWith('["p","new-owner"]')));delayed.runner.unmount();
 assert.equal(await fs.readFile(sourcePath,'utf8'),original);
 report.checks.push('Actual original target/mounted ownership blocks delayed old-request navigation into a replacement conversation, and all original source files remain read-only');
 report.passed=true;
}catch(error){report.error=String(error.stack??error);process.exitCode=1;}
await fs.writeFile(path.join(output,'实际TSX与原handler专项.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
