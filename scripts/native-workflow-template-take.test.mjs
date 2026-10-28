import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { currentGen2Root } from '../lab/current-gen2-resources.mjs';
import { transformNativeWorkflowTemplatesScript as adapt } from '../lab/native-workflow-templates-transform.mjs';
import { parseOriginalDonorScript } from '../lab/agent-node-transform.mjs';
const esbuild=createRequire(path.join(currentGen2Root,'package.json'))('esbuild');
const source=await fs.readFile('lab/pilot/native-workflow-templates.tsx','utf8');
const code=await esbuild.transform(source.slice(source.indexOf('export async function takeNativeWorkflowTemplate'),source.indexOf('export function LCOSUseNativeWorkflowTemplates')),{loader:'ts',format:'cjs'});
let shell,operations,appended,finished,read,current,restored;
const owner={projectId:'p',canvasId:'c',api:{}}, draft={status:'ready',prompt:'method',references:[{entityType:'scope',entityId:'method',mode:'full',displayLabel:'同名方法'}]};
const presentations=[{id:'method-page',version:1,state:{memberEntityRefs:[{entityType:'note',entityId:'note'},{entityType:'conversation',entityId:'conversation'},{entityType:'run',entityId:'run'},{entityType:'collection',entityId:'collection'}]}}];
const template={lcos_method:{owner,item:{kind:'workflow',entityRef:{id:'method'}},draft,text:'真实方法',presentations}};
const mod={exports:{}};
new Function('module','exports','sameOwner','useLcosShellStore','captureNativeLibraryInputReturn','composerInputKey','referencePickOwnerKey','useLcosReferenceStore','readMethods','appendWorkflowMethodDraft','restoreNativeLibraryInputReturn',code.code)(mod,mod.exports,
 value=>current&&value===owner,{getState:()=>shell},()=>({input:'original'}),target=>target?.nodeId,()=> 'reference-owner',
 {getState:()=>({referenceInputOperations:operations,beginReferenceInputOperation:()=> 'token',finishReferenceInputOperation:()=>finished++})},
 (...args)=>read(...args),(method,p,key)=>{appended.push({method,p,key,prompt:shell.composerPrompt});},async()=>{restored++;return true});
const take=mod.exports.takeNativeWorkflowTemplate;
function reset(){shell={projectId:'p',composerTarget:{nodeId:'input',messageId:'message',continuationOperationId:'operation'},composerPrompt:'原稿'};operations=new Map();appended=[];finished=0;restored=0;current=true;read=async()=>[template];}
reset();const resume=await take(template);assert.equal(appended.length,1);assert.equal(appended[0].method.prompt,'真实方法');assert.deepEqual(appended[0].method.references,draft.references);assert.equal(restored,0);await resume();assert.equal(restored,1);assert.equal(finished,1);
for(const scenario of ['message','operation','input','scene','cancel','sending','stale','network']){
 reset();let alive=true;
 read=async()=>{if(scenario==='message')shell.composerTarget={...shell.composerTarget,messageId:'new'};
  if(scenario==='operation')shell.composerTarget={...shell.composerTarget,continuationOperationId:'new'};
  if(scenario==='input')shell.composerTarget={...shell.composerTarget,nodeId:'new'};
  if(scenario==='scene')current=false;if(scenario==='cancel')alive=false;
  if(scenario==='sending')operations.set('other',{owner:'reference-owner',kind:'sending'});
  if(scenario==='network')throw new Error('private transport details');
  return scenario==='stale'?[{...template,lcos_method:{...template.lcos_method,text:'changed'}}]:[template];};
 await assert.rejects(take(template,()=>alive));assert.deepEqual(appended,[],scenario);assert.equal(finished,1,scenario);assert.equal(shell.composerPrompt,'原稿');
}
for(const update of [rows=>rows[0].version++,rows=>rows[0].state.memberEntityRefs.reverse(),rows=>rows.push({id:'another-page',version:1,state:{memberEntityRefs:[]}})]){
 reset();read=async()=>{const changed=structuredClone(presentations);update(changed);return [{...template,lcos_method:{...template.lcos_method,presentations:changed}}]};
 await assert.rejects(take(template),/方法已更新/);assert.deepEqual(appended,[]);assert.equal(shell.composerPrompt,'原稿');assert.equal(finished,1);
}
reset();read=async()=>{shell.composerPrompt='用户在读取中继续输入';return [template]};await take(template);assert.equal(appended[0].prompt,'用户在读取中继续输入');
const file='index-BAQXnPag.js',original=await fs.readFile('reference/tapnow-installed/resources/web/assets/'+file,'utf8'),adapted=adapt(file,original);
assert.equal(adapt(file,adapted),adapted);
const ast=parseOriginalDonorScript(adapted,file),node=ast.body.find(node=>node.type==='FunctionDeclaration'&&node.id?.name==='Cx');
const url=new Function('PUe',adapted.slice(node.start,node.end)+';return Cx;')(value=>value);
for(const local of ['data:image/svg+xml,%3Csvg%2F%3E','blob:http://127.0.0.1/local-image'])assert.equal(url(local,'small'),local);
assert.equal(url('https://example.invalid/image.png','small'),'https://example.invalid/image.png?variant_name=small');
const page='page-Da_DfwiK.js',pageSource=await fs.readFile('reference/tapnow-installed/resources/web/assets/'+page,'utf8'),updated=adapt(page,pageSource);
assert.equal(adapt(page,updated),updated);
const report={passed:true,cases:['same original target and one whole Scope reference','late message/operation/input/scene switches rejected','cancel and send-in-progress leave original draft intact','changed method, member-only version/order/additional-page changes and network failure leave draft intact','latest user draft preserved while reading','local image URL untouched; original remote variant behavior retained','both original source adapters parse and are idempotent']};
await fs.mkdir('output/原方法模板接续_20261023',{recursive:true});await fs.writeFile('output/原方法模板接续_20261023/取用与原缩略图验证.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
