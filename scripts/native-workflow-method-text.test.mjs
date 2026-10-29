import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {currentGen2Root} from '../lab/current-gen2-resources.mjs';
import {transformNativeWorkflowMethodText as adapt,transformNativeWorkflowMethodTake} from '../lab/native-workflow-method-text-transform.mjs';
const source=await readFile(new URL('../lcos/huabu/apps/web/src/lcos/surfaces/workflow/workflowMethodDraft.ts',import.meta.url),'utf8');
const updated=adapt(source);assert.equal(adapt(updated),updated);
const esbuild=createRequire(path.join(currentGen2Root,'package.json'))('esbuild');
async function build(text){const code=text.slice(text.indexOf('export const WORKFLOW_METHOD_UNAVAILABLE'),text.indexOf('/** Use the existing Presentation'));
 const compiled=await esbuild.transform(code,{loader:'ts',format:'cjs'}),module={exports:{}};new Function('module','exports',compiled.code)(module,module.exports);return module.exports.buildWorkflowMethodDraft;}
const before=await build(source),after=await build(updated);
const graph={project:{id:'project-private'},scopes:[{id:'scope-method',kind:'workflow',name:'审核方法'}],artifactViews:[{id:'v1',artifactId:'a1',revisionId:'r1'}],artifacts:[{id:'a1',title:'正文'}],artifactRevisions:[{id:'r1',artifactId:'a1',fileRecordId:'f1'}],fileRecords:[{id:'f1',mimeType:'text/plain'}]};
const presentation={id:'private-presentation',projectId:'project-private',scopeId:'scope-method',capability:'workflow',version:3,state:{memberViewIds:['v1'],workflowActions:[{id:'step1',label:'核对',description:'用户原文：来源 Project：不要删除这一句',attachedViewIds:['v1']}],workflowOperators:{branch:{label:'检查',kind:'branch',branches:[{label:'通过',predicateText:'保留用户条件',targetViewId:'v1'}]}}}};
const original=before('project-private','scope-method',graph,[presentation]),next=after('project-private','scope-method',graph,[presentation]);
assert.equal(next.status,'ready');assert.deepEqual(next.references,[{entityType:'scope',entityId:'scope-method',mode:'full',displayLabel:'审核方法'}]);assert.equal(original.references[0].entityType,'artifact');assert.ok(next.prompt.includes('用户原文：来源 Project：不要删除这一句'));assert.ok(next.prompt.includes('保留用户条件'));assert.ok(next.prompt.includes('使用已绑定材料'));
const structuralMember=structuredClone(presentation);structuralMember.state.workflowActions[0].attachedViewIds=[];structuralMember.state.workflowOperators={v1:{kind:'condition',branches:[{id:'b',label:'使用指定材料',targetViewId:'v1'}]}};
const structuralDraft=after('project-private','scope-method',graph,[structuralMember]);assert.equal(structuralDraft.status,'ready');assert.deepEqual(structuralDraft.references,next.references);assert.ok(!structuralDraft.prompt.includes('v1'));assert.ok(!structuralDraft.prompt.includes('condition'));
for(const field of ['artifactViews','artifacts','artifactRevisions','fileRecords']){
 const incomplete={...graph,[field]:[]};assert.equal(after('project-private','scope-method',incomplete,[presentation]).status,'unavailable',field+' validation remains original');
 assert.equal(after('project-private','scope-method',incomplete,[structuralMember]).status,'unavailable',field+' also validates a real View that shares an operator key');
}
for(const id of ['project-private','scope-method','private-presentation'])assert.ok(!next.prompt.includes(id));
const archivedGraph={...graph,scopes:graph.scopes.map(scope=>({...scope,archivedAt:'2026-10-23T04:00:00Z'}))};
const archived=after('project-private','scope-method',archivedGraph,[presentation]);assert.equal(archived.status,'ready');assert.equal(archived.archivedAt,'2026-10-23T04:00:00Z');assert.equal(archived.prompt,next.prompt);assert.deepEqual(archived.references,next.references);
const takeSource=transformNativeWorkflowMethodTake(await readFile(new URL('../lcos/huabu/apps/web/src/lcos/surfaces/workflow/workflowMethodTake.ts',import.meta.url),'utf8'));
const appendSource=takeSource.slice(takeSource.indexOf('export function appendWorkflowMethodDraft'),takeSource.indexOf('/** Assembly and native Drop'));
const appendCode=await esbuild.transform(appendSource,{loader:'ts',format:'cjs'}),appendModule={exports:{}};let accessedStore=0;
new Function('module','exports','useLcosShellStore','useLcosReferenceStore',appendCode.code)(appendModule,appendModule.exports,{getState:()=>{accessedStore++;throw new Error('must not touch original input')}},{getState:()=>{accessedStore++;}});
assert.throws(()=>appendModule.exports.appendWorkflowMethodDraft(archived,'project-private','original'),/方法已移除/);assert.equal(accessedStore,0);
for(const args of [['wrong','scope-method',graph,[presentation]],['project-private','missing',graph,[presentation]],['project-private','scope-method',graph,[]]])assert.deepEqual(after(...args),before(...args));
const report={passed:true,cases:['exact generated metadata only; user-authored provenance-looking text preserved','one whole workflow Scope reference; no member snapshot or fabricated version','original View/Artifact/Revision/FileRecord validation remains, including real View/operator identity collision','archived method still has complete readable text and references','shared append rejects archived methods before accessing any input state','same unavailable/identity behavior','source transform idempotent']};
await writeFile(new URL('../output/原方法移除恢复_20261023/方法正文与统一取用验证.json',import.meta.url),JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
