import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { currentGen2Root, readCurrentGen2Resource } from '../lab/current-gen2-resources.mjs';
import { createNativeUiSourceTransforms } from '../lab/native-ui-source-transforms.mjs';
import { withNativeChatSourceTransforms } from '../lab/native-chat-owner-transform.mjs';
import { withNativeMaterialReaderSourceTransforms } from '../lab/native-material-reader-source-transform.mjs';

const root=path.resolve(import.meta.dirname,'..'),dep=createRequire(path.join(currentGen2Root,'huabu/apps/web/package.json'));
const ts=createRequire(path.join(currentGen2Root,'package.json'))('typescript');
const React=dep('react'),{createRoot}=dep('react-dom/client'),{Window}=dep('happy-dom');
const output=path.join(root,'output/原生ColorPin整合_20261017h/旧任务重试改接验证',new Date().toISOString().replace(/[:.]/g,'-'));
const report={passed:false,scope:'actual adopted Run source + production source-transform composition + actual request/route helpers and extracted original task-event handler, real React state; no Core or candidate',
  mutations:0,candidateRequests:0,models:0,cases:[]};
const parse=(source,name)=>{const file=ts.createSourceFile(name,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);assert.equal(file.parseDiagnostics.length,0);return file};
const find=(root,predicate)=>{const found=[];const visit=node=>{if(predicate(node))found.push(node);ts.forEachChild(node,visit)};visit(root);return found};
const transpile=text=>ts.transpileModule(text,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const evaluate=(text,env)=>new Function(...Object.keys(env),transpile('const evaluated = ('+text+');')+'\nreturn evaluated;')(...Object.values(env));
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const dom=new Window({url:'http://127.0.0.1:1/'}),keys=['window','document','navigator','HTMLElement','Event','MouseEvent','CustomEvent','IS_REACT_ACT_ENVIRONMENT'];
const previous=Object.fromEntries(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));let mounted;
try{
  for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,writable:true,value:key==='window'?dom:key==='IS_REACT_ACT_ENVIRONMENT'?true:dom[key]});
  const key='lcos/huabu/apps/web/src/lcos/professional/RunWorkViewBody.tsx',sourcePath=path.join(root,key);
  const adopted=readCurrentGen2Resource(sourcePath),source=adopted?.contents??await fs.readFile(sourcePath,'utf8');
  const transforms=withNativeMaterialReaderSourceTransforms(withNativeChatSourceTransforms(createNativeUiSourceTransforms({nativeRailPilot:true})));
  const transform=transforms[key];assert.equal(typeof transform,'function');
  const transformed=transform(source,{sourcePath}),file=parse(transformed,sourcePath),before=parse(source,sourcePath);
  const originalOpen=find(before,node=>ts.isCallExpression(node)&&node.expression.getText(before).endsWith('.openWindow'));
  assert.equal(originalOpen.length,1);const call=originalOpen[0];
  assert.equal(call.getText(before),"useLcosShellStore.getState().openWindow('run-review', '重试任务', nextRunId)");
  const changedOnlyCall=source.slice(0,call.getStart(before))+'requestNativeTaskView({projectId,runId:nextRunId,sourceRunId:runId})'+source.slice(call.end);
  assert.ok(transformed.endsWith(changedOnlyCall),'only the destination expression plus import prefix changes; local forms/actions/lifetimes stay exact original');
  assert.equal(transform(transformed,{sourcePath}),transformed);
  assert.throws(()=>transform(source,{sourcePath:path.join(root,'lab/unrelated.tsx')}),/exact copied source/);
  assert.throws(()=>transform(source.replace("'重试任务'","'changed-seam'"),{sourcePath}),/legacy Run retry view/);
  assert.equal(await fs.readFile(sourcePath,'utf8'),source,'copied original file is unmodified');
  const collectionKey='lcos/huabu/apps/web/src/lcos/professional/CollectionWorkViewBody.tsx';
  assert.equal(transforms[collectionKey],undefined,'Collection three callers remain out of this batch');
  report.source={actualPath:adopted?.sourcePath??sourcePath,selectedReadOnly:!!adopted,transformRegistered:true,originalModified:false,onlyCallAndImportChanged:true};
  report.cases.push('formal transform composition adapts actual selected Run source exactly once; producer, local form, lifetime, Reader and Collection callers unchanged');
  const shell={projectId:'project',composerPrompt:'未发送的原输入',composerTarget:{nodeId:'original-node',messageId:'original-message',continuationOperationId:'original-operation'},
    conversationSendAttempts:new Map([['original-owner',{status:'unknown'}]]),windows:[{id:'source-window',bodyKey:'run-review',target:'source'}]};
  const savedShell={prompt:shell.composerPrompt,target:shell.composerTarget,attempts:shell.conversationSendAttempts,windows:shell.windows};
  for(const name of ['openWindow','closeWindow','openComposer','closeComposer'])shell[name]=()=>{report.mutations++;throw new Error('No old window or input mutation is allowed')};
  const shellHook={getState:()=>shell};
  const routeSource=await fs.readFile(path.join(root,'lab/pilot/native-task-route.ts'),'utf8'),routeFile=parse(routeSource,'native-task-route.ts');
  const exports={};new Function('exports','useLcosShellStore','window','CustomEvent',transpile(routeFile.statements.filter(node=>!ts.isImportDeclaration(node)).map(node=>node.getText(routeFile)).join('\n')))(exports,shellHook,dom,dom.CustomEvent);
  const chat=parse(await fs.readFile(path.join(root,'lab/pilot/native-chat-ui.tsx'),'utf8'),'native-chat-ui.tsx');
  const handler=find(chat,node=>ts.isVariableDeclaration(node)&&node.name.getText(chat)==='openTask');assert.equal(handler.length,1);
  const clickCall=find(file,node=>ts.isCallExpression(node)&&node.expression.getText(file)==='requestNativeTaskView');assert.equal(clickCall.length,1);
  let arrow=clickCall[0].parent;while(arrow&&!ts.isArrowFunction(arrow))arrow=arrow.parent;assert.ok(arrow);
  const openRetry=evaluate(arrow.getText(file),{projectId:'project',runId:'source',nextRunId:'next',requestNativeTaskView:exports.requestNativeTaskView});
  const conv=exports.nativeChatConversationRoute,list={page:'tasks',returnTo:conv};
  let seen,updates=0;const outlet=document.createElement('main');document.body.append(outlet);
  function Harness({initial}){
    const [route,setRoute]=React.useState(initial);seen=route;
    React.useEffect(()=>{const actual=evaluate(handler[0].initializer.getText(chat),{useLcosShellStore:shellHook,setRoute:update=>{updates++;setRoute(update)},
      nativeChatTaskRoute:exports.nativeChatTaskRoute,setConversationRequest(){},setSectionRequest(){},window:dom,CustomEvent:dom.CustomEvent});
      dom.addEventListener('lcos-native-open-task',actual);return()=>dom.removeEventListener('lcos-native-open-task',actual)},[]);
    return React.createElement(React.Fragment,null,React.createElement('button',{id:'open-retry',onClick:openRetry},'打开重试任务'),
      React.createElement('button',{id:'back',onClick:()=>setRoute(value=>exports.nativeChatBackRoute(value))},'返回'),React.createElement('pre',null,JSON.stringify(route)));
  }
  const mount=async initial=>{mounted=createRoot(outlet);await React.act(async()=>{mounted.render(React.createElement(Harness,{initial}));await tick()})};
  const close=async()=>{await React.act(async()=>mounted.unmount());mounted=null};
  const click=async id=>{await React.act(async()=>{document.querySelector(id).click();await tick()})};
  await mount(list);await click('#open-retry');assert.equal(seen.runId,'next');const first=seen;
  assert.equal(first.returnTo.runId,'source');assert.equal(first.returnTo.returnTo,list);
  await click('#open-retry');assert.equal(seen,first,'repeat target keeps the same route identity and returnTo');
  await click('#back');assert.equal(seen,first.returnTo);await click('#back');assert.equal(seen,list);
  report.navigation={opened:'next',back:['source','tasks'],sameTargetRetained:true};await close();
  report.cases.push('actual transformed button -> real dispatch -> extracted task event handler with real React state: source→next→source→original list, repeated next does not grow stack');
  const preciseSource={page:'task',runId:'source',returnTo:{page:'task',runId:'earlier-task',returnTo:list}};
  const fromCurrent=exports.nativeChatTaskRoute(preciseSource,'next','source');assert.equal(fromCurrent.returnTo,preciseSource);
  const deeper={page:'task',runId:'unrelated',returnTo:preciseSource};const reuse=exports.nativeChatTaskRoute(deeper,'next','source');assert.equal(reuse.returnTo,preciseSource);
  const existingNext={page:'task',runId:'next',returnTo:deeper};assert.equal(exports.nativeChatTaskRoute(existingNext,'next','source'),existingNext);
  const same=exports.nativeChatTaskRoute(list,'source','source');assert.equal(same.returnTo,list,'equal source/target creates one task, not a self-loop');
  assert.throws(()=>exports.nativeChatTaskRoute(list,'next',' '),/exact Run/);
  report.cases.push('existing source route reused at current/deeper level with its original precise returnTo; existing next remains untouched; equal source/target has no self-loop');
  await mount(list);const beforeUpdates=updates;
  for(const target of [{projectId:'foreign',runId:'next',sourceRunId:'source'},{projectId:'project',runId:'',sourceRunId:'source'},
    {projectId:'project',runId:'next',sourceRunId:''},{projectId:'project',runId:'next',sourceRunId:'  '}]){
    assert.equal(exports.requestNativeTaskView(target),false);
    await React.act(async()=>{dom.dispatchEvent(new dom.CustomEvent('lcos-native-open-task',{detail:target}));await tick()});
    assert.equal(seen,list,'raw event cannot bypass foreign/empty identity guard');
  }
  assert.equal(updates,beforeUpdates);await close();
  report.cases.push('foreign project, missing target or empty/whitespace optional source rejected by API and actual raw-event handler before route update');
  assert.equal(shell.composerPrompt,savedShell.prompt);assert.equal(shell.composerTarget,savedShell.target);assert.equal(shell.conversationSendAttempts,savedShell.attempts);assert.equal(shell.windows,savedShell.windows);
  assert.equal(report.mutations,0);report.cases.push('0 mutations: original old window, draft target/message/continuation, unknown send attempts and exact references remain untouched');
  report.passed=true;
}catch(error){report.error=String(error.stack??error);process.exitCode=1}
finally{
  if(mounted)await React.act(async()=>mounted.unmount());
  for(const key of keys)if(previous[key])Object.defineProperty(globalThis,key,previous[key]);else delete globalThis[key];
  await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));dom.happyDOM.abort();
  console.log(JSON.stringify({passed:report.passed,cases:report.cases,report:path.join(output,'report.json'),error:report.error}));
}
