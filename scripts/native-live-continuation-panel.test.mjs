import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {installedRoot} from '../lab/pilot/build-pilot.mjs';
const root=path.resolve(import.meta.dirname,'..'),ts=createRequire(path.join(installedRoot,'package.json'))('typescript');
const source=await fs.readFile(path.join(root,'lab/pilot/native-agent-ui.tsx'),'utf8'),file=ts.createSourceFile('native-agent-ui.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);assert.equal(file.parseDiagnostics.length,0);
const fixture=JSON.parse(await fs.readFile(path.join(root,'output/混合Scope真实续聊_20261022/真实已绑定会话列表结构.json'),'utf8'));
const fn=name=>{let found;const visit=node=>{if(ts.isFunctionDeclaration(node)&&node.name?.text===name){assert.ok(!found);found=node;}ts.forEachChild(node,visit);};visit(file);assert.ok(found,name);return found.getText(file).replace(/^export /,'');};
let rows=structuredClone(fixture.rows);const env={isRecord:value=>value!==null&&typeof value==='object'&&!Array.isArray(value),nonEmptyString:value=>typeof value==='string'&&value.trim().length>0,
 resolveProjectId:async()=>fixture.projectId,readRuntimeProviders:async()=>[],readCoreValue:async()=>rows};
const compiled=ts.transpileModule(['isConnectedConversation','readConnectedConversations','reasonOf','loadConnectedPanel'].map(fn).join('\n')+'\nreturn {isConnectedConversation,loadConnectedPanel};',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
const api=new Function(...Object.keys(env),compiled)(...Object.values(env)),signal=new AbortController().signal;
const bound=rows.find(row=>row.executorId==='');assert.ok(bound);assert.equal(api.isConnectedConversation(bound,fixture.projectId),true);
let result=await api.loadConnectedPanel(signal);assert.equal(result.status,'ready');assert.ok(result.conversations.some(row=>row.id===bound.id));
for(const invalid of [{executorId:null},{executorId:undefined},{executorId:3},{projectId:'other-project'},{id:''},{conversationRef:''},{label:''},{provider:'unknown'},{schemaVersion:2}]){
 rows=[{...bound,...invalid}];assert.equal(api.isConnectedConversation(rows[0],fixture.projectId),false);result=await api.loadConnectedPanel(signal);assert.equal(result.status,'unavailable');assert.ok(!result.conversations);
}
rows=structuredClone(fixture.rows);result=await api.loadConnectedPanel(signal);assert.equal(result.status,'ready');assert.deepEqual(rows,fixture.rows,'List decoder never rewrites canonical rows.');
const report={passed:true,checks:['Actual original bound Core row with executorId empty string remains readable through the original loadConnectedPanel','Null/missing/non-string executor, cross-project and invalid schema/provider/address/label reject the entire malformed list','Original Core canSend/owner truth is unchanged; no fake executor ID or dispatch is introduced'],requests:0,modelCalls:0,sourceId:bound.id};
await fs.writeFile(path.join(root,'output/混合Scope真实续聊_20261022/原会话菜单空执行器编号回归.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
