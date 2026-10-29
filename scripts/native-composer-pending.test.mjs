import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { buildPilotEntry, installedRoot } from '../lab/pilot/build-pilot.mjs';
import { withNativeComposerDraftTransforms } from '../lab/native-composer-draft-source-transform.mjs';

const sourceFile='lcos/huabu/apps/web/src/lcos/lcosReferenceState.ts',absolute=path.resolve(sourceFile);
const transforms=withNativeComposerDraftTransforms(),transform=transforms[sourceFile];
const dir=await fs.mkdtemp(path.resolve('.runtime/composer-pending-test-'));
const out=path.resolve('output/原输入提交归属_20261025/真实状态',new Date().toISOString().replaceAll(':','-'));
await fs.mkdir(out,{recursive:true});
let source=transform(await fs.readFile(absolute,'utf8'),{sourcePath:absolute});
assert.equal(transform(source,{sourcePath:absolute}),source);
source=source.replace(/from\s+(['"])(\.[^'"]+)\1/g,(_,q,spec)=>'from '+JSON.stringify(path.resolve(path.dirname(absolute),spec).replaceAll('\\','/')));
await fs.writeFile(path.join(dir,'reference.ts'),source);
await buildPilotEntry(path.relative(process.cwd(),path.join(dir,'reference.ts')),path.join(dir,'entry.mjs'),'node');
const {useLcosReferenceStore:R}=await import(pathToFileURL(path.join(dir,'entry.mjs')));
const ts=createRequire(path.join(installedRoot,'package.json'))('typescript');
const compile=(expression,bindings)=>new Function(...Object.keys(bindings),ts.transpileModule('const actual = '+expression+';',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText+'\nreturn actual;')(...Object.values(bindings));
const report={passed:false,cases:[],scope:'Actual original transformed ReferenceStore; pending requests are owner-tagged original operation tokens, no new send ticket, no network/model/Run'};
try{
 R.getState().setProject('p');R.getState().setReferencePickOwner('p-picker');
 const a=JSON.stringify(['p','input-a']),b=JSON.stringify(['p','input-b']),q=JSON.stringify(['q','input-a']);
 const tokenA=R.getState().beginReferenceInputOperation(a,'sending');
 const preparing=R.getState().beginReferenceInputOperation('p-picker','preparing');
 const busy=owner=>[...R.getState().referenceInputOperations.values()].some(operation=>operation.owner===owner&&operation.kind==='sending');
 assert.equal(busy(a),true);assert.equal(busy(b),false);assert.equal(busy(q),false);
 R.getState().setProject('q');assert.equal(R.getState().referencePickOwner,null);
 assert.equal(R.getState().referenceInputOperations.has(tokenA),true);assert.equal(R.getState().referenceInputOperations.has(preparing),false);assert.equal(busy(q),false);
 report.cases.push('Project switch retains only actual sending tokens; preparing work and the picker owner still reset. A pending input does not mark another project/input as submitting.');
 const tokenQ=R.getState().beginReferenceInputOperation(q,'sending');R.getState().finishReferenceInputOperation(tokenA);
 assert.equal(R.getState().referenceInputOperations.has(tokenA),false);assert.equal(R.getState().referenceInputOperations.has(tokenQ),true);
 R.getState().setProject('p');assert.equal(busy(a),false);assert.equal(busy(q),true);R.getState().finishReferenceInputOperation(tokenA);assert.equal(busy(q),true);
 R.getState().finishReferenceInputOperation(tokenQ);assert.equal(R.getState().referenceInputOperations.size,0);
 report.cases.push('The original old-project token can finish after switching projects without releasing the new project request; repeated old completion is harmless.');
 const owner='p-original-reference-owner',inputA='exact-input-a',inputB='exact-input-b';
 const originalConsumers=[];
 for(const[file,name]of [['lab/pilot/native-assembly-ui.tsx','sending'],['lab/pilot/native-workflow-templates.tsx','busy'],['lcos/huabu/apps/web/src/lcos/lcosRecognizers.ts','sending']]){
   const text=await fs.readFile(file,'utf8'),expression=text.match(new RegExp('const '+name+' = ([\\s\\S]*?\\.some\\([\\s\\S]*?\\));'))?.[1];assert.ok(expression,file+' original sending check missing');
   originalConsumers.push({file,check:compile(expression,{useLcosReferenceStore:R,owner,referenceOwner:owner})});
 }
 const library=await fs.readFile('lab/pilot/native-library-contexts.tsx','utf8'),libraryCheck=library.match(/if \((\[\.\.\.refs\.referenceInputOperations\.values\(\)\]\.some\([^\n]+\))\)/)?.[1];assert.ok(libraryCheck);
 originalConsumers.push({file:'lab/pilot/native-library-contexts.tsx',check:()=>compile(libraryCheck,{refs:R.getState(),owner})});
 const hostFile='lcos/huabu/apps/web/src/lcos/composer/LcosComposerHost.tsx',host=transforms[hostFile](await fs.readFile(hostFile,'utf8'),{sourcePath:path.resolve(hostFile)}),selector=host.match(/const submittingInput = useLcosReferenceStore\(([\s\S]*?)\);/)?.[1];assert.ok(selector);
 const inputBusy=input=>compile(selector,{referenceSendingOwner:owner,referenceSendingInput:input})(R.getState());
 const precise=R.getState().beginReferenceInputOperation(owner,'sending',inputA);assert.equal(R.getState().referenceInputOperations.get(precise).owner,owner);assert.equal(inputBusy(inputA),true);assert.equal(inputBusy(inputB),false);
 for(const consumer of originalConsumers)assert.equal(consumer.check({inputOwner:owner}),true,consumer.file+' must retain its existing conservative pending check');
 R.getState().finishReferenceInputOperation(precise);for(const consumer of originalConsumers)assert.equal(consumer.check({inputOwner:owner}),false,consumer.file+' must release when original token finishes');
 const legacy=R.getState().beginReferenceInputOperation(owner,'sending');assert.equal(inputBusy(inputA),true);assert.equal(inputBusy(inputB),true);R.getState().finishReferenceInputOperation(legacy);
 report.cases.push('Source-extracted original Assembly, Library, method-taking and Canvas recognizer sending checks all continue to see the unchanged owner. The actual transformed Composer selector allows a different precise input; legacy operations without inputKey remain conservatively busy.');
 const later=R.getState().beginReferenceInputOperation(a,'sending');R.getState().reset();assert.equal(R.getState().referenceInputOperations.size,0);R.getState().finishReferenceInputOperation(later);assert.equal(R.getState().referenceInputOperations.size,0);
 report.cases.push('Original global reset still clears transient work and stale completion cannot restore a released token.');
 for(const[file,adapt]of Object.entries(transforms)){const original=await fs.readFile(path.resolve(file),'utf8'),options={sourcePath:path.resolve(file)},once=adapt(original,options);assert.equal(adapt(once,options),once)}
 report.cases.push('All original Shell/Composer/ReferenceStore adapters remain exact-seam and idempotent. Actual Composer button/shortcut behavior is checked separately in the real page.');
 report.passed=true;
}catch(error){report.error=String(error.stack??error);process.exitCode=1}
finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2))}
console.log(JSON.stringify({...report,output:out},null,2));
