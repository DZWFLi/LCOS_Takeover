import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readCurrentGen2Resource } from '../lab/current-gen2-resources.mjs';
import { transformNativeLibraryMaterialOverlay } from '../lab/native-library-material-overlay-transform.mjs';

// Reuse the declared loopback-only peer fixture, not a candidate/Core handler.
// The old branches below reconstruct the exact snippets read before root's
// immediate repair; this is explicitly not a Git or whole-file old snapshot.
const root=path.resolve(import.meta.dirname,'..'),stamp=new Date().toISOString().replace(/[:.]/g,'-');
const evidence=path.join(root,'output/原生Drop整合_20261017f/恢复与Composer只读复核',stamp);
await fs.mkdir(evidence,{recursive:true});
const dispatcher=await fs.readFile(path.join(root,'lab/pilot/native-library-material-dispatch.ts'),'utf8');
const oldRun=String.raw`      const run = async (recovery: boolean, requestSignal?: AbortSignal): Promise<DropCommitReceipt> => {
        const isCurrent = () => current(recovery, requestSignal);
        if (!isCurrent()) return failed('原现场或接收位置已变化，本次没有提交或确认到其他位置。');
        try {
          await sourceGraph(requestSignal);
          if (!isCurrent()) return failed('读取期间现场已变化，材料保留，没有改放到其他位置。');
          const result = targetRef.kind === 'workspace'
            ? await placeNativeLibraryMaterial({ ...input, workspaceId: targetRef.id }, { api: release.api!, isCurrent, readOnly: recovery, signal: requestSignal })
            : await receiveNativeLibraryMaterial({ ...input, workspaceId: release.workspaceId!, targetRef: targetRef as { kind: 'main' } | { kind: 'context' | 'workflow' | 'conversation'; id: string } },
              { api: release.api!, isCurrent, readOnly: recovery, signal: requestSignal });
          if (result.status === 'placed' || result.status === 'already-present') {
            if (targetRef.kind === 'conversation') ports.refreshConversation?.(source.projectId, targetRef.id);
            return make('success', targetRef.kind === 'conversation' ? '已加入智能体上下文。'
              : result.status === 'already-present' ? '材料已在这里，原位置保留。' : '材料已放好。',
              'canonicalReceipt' in result ? result.canonicalReceipt : result);
          }
          if (result.status === 'rejected') return failed(result.message);
          const receipt = make('partial', result.message) as Recoverable;
          receipt[recoveryKey] = nextSignal => run(true, nextSignal);
          return receipt;
        } catch {
          if (!recovery) return failed('材料或现场暂时无法核对，原内容保留，没有提交新的放置。');
          const receipt = make('partial', '放置结果仍待确认，原材料与布局保留，没有重复放置。') as Recoverable;
          receipt[recoveryKey] = nextSignal => run(true, nextSignal);
          return receipt;
        }
      };
`;
const runStart=dispatcher.indexOf('      const run = async ('),runEnd=dispatcher.indexOf('      return run(false, signal);',runStart);
if(runStart<0||runEnd<0)throw new Error('Dispatcher review seam changed.');
let oldDispatcher=dispatcher.slice(0,runStart)+oldRun+dispatcher.slice(runEnd);
oldDispatcher=oldDispatcher.replace("const exact = (reference: any) => !!reference &&", "const exact = (reference: any) =>")
  .replace(/^      const exactReferences = .*\r?\n/m,'')
  .replace('|| !exactReferences())', '|| !exact(intent.reference) || intent.references && (intent.references.length !== 1 || !exact(intent.references[0])))')
  .replace("if (!allowed() || !exactReferences()) throw new Error('读取期间原输入或材料版本已变化，材料保留，未加入其他对话。');", "if (!allowed()) throw new Error('读取期间原输入已变化，材料保留，未加入其他对话。');");
const overlayPath=path.join(root,'lcos/huabu/apps/web/src/lcos/LcosHostOverlay.tsx');
const originalOverlay=readCurrentGen2Resource(overlayPath).contents;
const currentOverlay=transformNativeLibraryMaterialOverlay(originalOverlay);
const oldOverlay=currentOverlay.replace(/        await nativeLibraryMaterialOwner\.admitComposer\(referenceIntent, signal, inputIsCurrent\);[\s\S]*?        const result = nativeLibraryDraftReferences\.addEntitiesToDraft\(referenceIntent\.references \?\? \[referenceIntent\.reference\], nativeLibraryDraftShell\.composerTarget\?\.intent\);/,
  '        await nativeLibraryMaterialOwner.admitComposer(referenceIntent, signal, inputIsCurrent);\n        const result = references.addEntitiesToDraft(referenceIntent.references ?? [referenceIntent.reference], shell.composerTarget?.intent);');
if(oldOverlay===currentOverlay||oldDispatcher===dispatcher)throw new Error('Review must distinguish the read old snippets and repaired source.');
await Promise.all([
  fs.writeFile(path.join(evidence,'旧分支重建_dispatcher.ts.txt'),oldDispatcher),fs.writeFile(path.join(evidence,'受测新源码_dispatcher.ts.txt'),dispatcher),
  fs.writeFile(path.join(evidence,'旧分支重建_Overlay.tsx.txt'),oldOverlay),fs.writeFile(path.join(evidence,'受测新源码_Overlay.tsx.txt'),currentOverlay),
]);
let source=await fs.readFile(path.join(root,'scripts/native-library-material-dispatch.test.mjs'),'utf8');
source=source.replace('output/原生Drop整合_20261017f/材料分派独立HTTP验证', 'output/原生Drop整合_20261017f/恢复与Composer只读复核_peer');
source=source.replace("  await buildPilotEntry(path.relative(root, entry), bundle, 'node');",
  '  await writeFile(entry, (await readFile(entry,\'utf8\')) + '+JSON.stringify('\n'
    +'export {placeNativeLibraryMaterial} from '+JSON.stringify(path.join(root,'lab/pilot/native-material-placement-client.ts'))+';\n'
    +'export {receiveNativeLibraryMaterial} from '+JSON.stringify(path.join(root,'lab/pilot/native-material-receive-client.ts'))+';\n'
    +'export {useLcosReferenceStore} from '+JSON.stringify(path.join(root,'lcos/huabu/apps/web/src/lcos/lcosReferenceState.ts'))+';\n'
    +'export {composerInputKey} from '+JSON.stringify(path.join(root,'lcos/huabu/apps/web/src/lcos/composer/composerInputJourney.ts'))+';\n')+');\n'
    +"  await buildPilotEntry(path.relative(root, entry), bundle, 'node');");
const testsStart=source.indexOf("  for (const target of [{ kind: 'main' }, { kind: 'context'"),testsEnd=source.indexOf('  report.passed = true;',testsStart);
if(testsStart<0||testsEnd<0)throw new Error('Declared disposable peer fixture changed.');
const driver=String.raw`
  report.reviewEvidence = EVIDENCE_PATH;
  report.scope = 'Old read snippets reconstructed for defect reproduction versus repaired actual dispatcher and source-extracted original Overlay callback with actual reference store; loopback controlled peer only, no candidate/Core/O8/GUI proof.';
  report.oldSource = 'Exact old read snippets reconstructed against current unchanged surroundings; not a Git/whole-file byte snapshot.';
  const oldText = await readFile(path.join(report.reviewEvidence,'旧分支重建_dispatcher.ts.txt'),'utf8');
  const oldModule = {exports:{}};
  new Function('require','module','exports',(await esbuild.transform(oldText,{loader:'ts',format:'cjs',target:'node22'})).code)(() => dependencies,oldModule,oldModule.exports);
  const versions = {old:{...dependencies,...owners,...oldModule.exports},fixed:{...dependencies,...owners}};
  for (const [version, versionApp] of Object.entries(versions)) {
    app = versionApp;
    for (const change of ['target-before','target-during-graph','api-before','place-get-user-edit','graph-outage'])
      await runCase(version+': '+(version==='old'?'audit old closure-loss defect ':'preserve unknown closure and GET recover after ')+change,async row=>{
        const ordinary=change==='place-get-user-edit';
        const f=fixture(ordinary?{kind:'workspace',id:'workspace'}:{kind:'main'},{losePost:true});
        const first=await f.commit();assert.equal(first.status,'partial');f.settle(first);
        const feedback=app.useLcosDropStore.getState().feedback, before=facts(f);
        let restore=()=>{};
        const peerFetch=globalThis.fetch;
        if(change==='target-before'){
          app.useLcosDropStore.getState().unregisterTarget(f.target.targetId);
          restore=()=>app.useLcosDropStore.getState().registerTarget(f.target);
        }else if(change==='api-before'){
          f.current={...f.current,api:{}};restore=()=>{f.current={...f.release};};
        }else if(change==='target-during-graph'){
          f.graphRead=deferred();f.graphGate=deferred();
        }else if(change==='place-get-user-edit'){
          globalThis.fetch=async(input,init)=>{
            const response=await peerFetch(input,init);
            if(String(input).includes('/materials:place?'))return{ok:response.ok,json:async()=>{const value=await response.json();
              f.nodes[0].data.text='later live user edit during receipt GET';return value;}};
            return response;
          };
        }else if(change==='graph-outage'){
          globalThis.fetch=(input,init)=>String(input).endsWith('/graph')?Promise.reject(new Error('Temporary controlled Graph read failure')):peerFetch(input,init);
        }
        let checked;
        try{
          const pending=app.checkNativeLibraryDropReceipt(feedback,new AbortController().signal);
          if(change==='target-during-graph'){
            await f.graphRead.promise;app.useLcosDropStore.getState().unregisterTarget(f.target.targetId);f.graphGate.resolve();
            restore=()=>app.useLcosDropStore.getState().registerTarget(f.target);
          }
          checked=await pending;
        }finally{globalThis.fetch=peerFetch;}
        assert.equal(app.useLcosDropStore.getState().confirmNativeLibraryPlacementReceipt(f.tx,checked),true);
        const afterCheck=app.useLcosDropStore.getState().feedback,checkable=app.canCheckNativeLibraryDropReceipt(afterCheck);
        const oldBug=version==='old'&&change!=='graph-outage';
        assert.equal(checkable,!oldBug);assert.equal(checked.status,oldBug?'failed':'partial');
        restore();
        let final=checked;
        if(checkable){final=await recover(f);assert.equal(final.status,'success');}
        assert.equal(f.peerWrites,1);assert.equal(f.flushes,before.flushes);assert.equal(f.requests.filter(r=>r.method==='POST').length,1);
        if(ordinary)assert.equal(f.nodes[0].data.text,'later live user edit during receipt GET');
        row.observed={oldBugReproduced:oldBug,recoveryKept:checkable,afterTemporaryCheck:clone(checked),final:clone(final),onlyOneOriginalProducerWrite:true};
      });
    for(const mutation of ['reference-version','reference-list'])
      await runCase(version+': Composer slow Graph '+(version==='old'?'reproduces erroneous admission of ':'rejects changed ')+mutation,async row=>{
        const f=fixture({kind:'main'},{graphRead:deferred(),graphGate:deferred()});
        const intent={kind:'composer-reference',targetId:f.intent.targetId,inputKey:'same-input',intent:'delegate',reference:f.payload.reference,
          ...(mutation==='reference-list'?{references:[{...f.payload.reference}]}:{})};
        f.target.semantic={kind:'composer-reference',inputKey:intent.inputKey,intent:intent.intent};app.useLcosDropStore.getState().registerTarget(f.target);
        const pending=f.dispatcher.admitComposer(intent,undefined,()=>true);await f.graphRead.promise;
        if(mutation==='reference-version')intent.reference.revisionId='later-r2';else intent.references.push({...intent.reference});
        f.graphGate.resolve();let admitted=false,error;
        try{await pending;admitted=true;}catch(e){error=String(e.message);}
        assert.equal(admitted,version==='old');assert.equal(f.requests.length,1);assert.equal(f.peerWrites,0);assert.equal(f.flushes,0);
        row.observed={oldBugReproduced:admitted,admitted,error,mutated:clone(intent)};
      });
  }
  app=versions.fixed;
  const ts=createRequire(path.join(currentGen2Root,'package.json'))('typescript');
  const extract=async(filename)=>{
    const text=await readFile(path.join(report.reviewEvidence,filename),'utf8');
    const tree=ts.createSourceFile(filename,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),found=[];
    const walk=node=>{if(ts.isPropertyAssignment(node)&&node.name.getText()==='addComposerReference')found.push(node.initializer);ts.forEachChild(node,walk);};walk(tree);
    assert.equal(found.length,1);return{text:text.slice(found[0].getStart(tree),found[0].end),source:text};
  };
  for(const [version,filename]of Object.entries({old:'旧分支重建_Overlay.tsx.txt',fixed:'受测新源码_Overlay.tsx.txt'}))
    for(const change of ['same-input','later-message-same-key','reference-project'])
      await runCase(version+': actual original Overlay addComposerReference last synchronous owner '+change,async row=>{
        const f=fixture();app.useLcosReferenceStore.getState().reset();app.useLcosReferenceStore.getState().setProject('project');
        let shell={projectId:'project',composerTarget:{nodeId:'same-node',intent:'delegate',messageId:'A'}};
        const key=app.composerInputKey(shell.composerTarget),admission=deferred();let entered=false;
        const module={exports:{}};const fragment=await extract(filename);
        const code=(await esbuild.transform('module.exports = '+fragment.text,{loader:'ts',format:'cjs',target:'node22'})).code;
        new Function('useLcosShellStore','useLcosReferenceStore','projectId','inputIsCurrent','composerInputKey','nativeLibraryMaterialOwner',
          'addWorkflowMethodDrop','session','dropState','useLcosDropStore','module',code)(
          {getState:()=>shell},app.useLcosReferenceStore,'project',()=>shell.composerTarget.messageId==='A',app.composerInputKey,
          {admitComposer:async()=>{entered=true;await admission.promise;}},()=>{throw new Error('Workflow is not this ordinary reference');},{},
          {transactionId:f.tx},app.useLcosDropStore,module);
        const intent={kind:'composer-reference',targetId:f.intent.targetId,inputKey:key,intent:'delegate',reference:{...f.payload.reference,mimeType:'text/plain'}};
        const pending=module.exports(intent,undefined);assert.equal(entered,true);
        if(change==='later-message-same-key')shell={...shell,composerTarget:{...shell.composerTarget,messageId:'B'}};
        if(change==='reference-project')app.useLcosReferenceStore.getState().setProject('foreign-project');
        assert.equal(app.composerInputKey(shell.composerTarget),key,'message change deliberately keeps the original visual input key');
        admission.resolve();let rejected=false,error;try{await pending;}catch(e){rejected=true;error=String(e.message);}
        const refs=app.useLcosReferenceStore.getState().draft.orderedEntityRefs;
        const shouldReject=version==='fixed'&&change!=='same-input';
        assert.equal(rejected,shouldReject);assert.equal(refs.length,shouldReject?0:1);
        if(refs.length)assert.equal(refs[0].revisionId,'r1');assert.equal(f.peerWrites,0);assert.equal(f.requests.length,0);
        row.observed={oldWrongInputWriteReproduced:version==='old'&&change!=='same-input',rejected,error,
          liveMessage:shell.composerTarget.messageId,actualReferenceStoreProject:app.useLcosReferenceStore.getState().projectId,actualDraft:clone(refs)};
      });
  report.passed = true;
`.replace('EVIDENCE_PATH',JSON.stringify(evidence));
source=source.slice(0,testsStart)+driver+source.slice(testsEnd+'  report.passed = true;'.length);
const generated=path.join(root,'.runtime','native-library-review-'+stamp+'.mjs');
await fs.writeFile(generated,source);
await import(pathToFileURL(generated));
