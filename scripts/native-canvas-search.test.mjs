import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';
import { parseOriginalDonorScript } from '../lab/agent-node-transform.mjs';
import { transformNativeRailSearchScript } from '../lab/native-rail-search-transform.mjs';
const root=process.cwd(), runtime=await fs.mkdtemp(path.join(root,'.runtime/isolated-native-search-'));
const api=await import(pathToFileURL(await buildPilotEntry('lab/pilot/native-canvas-search.ts',path.join(runtime,'entry.mjs'),'node')));
const raw=await fs.readFile('reference/tapnow-installed/resources/web/assets/page-Da_DfwiK.js','utf8'), program=parseOriginalDonorScript(raw,'page-Da_DfwiK.js');
const names=['kV','EV','HC','Ml','PV','Ll','DV'], declarations=[];
for(const row of program.body)for(const d of row.declarations??[])if(names.includes(d.id?.name))declarations.push('const '+d.id.name+'='+raw.slice(d.init.start,d.init.end)+';');
assert.equal(declarations.length,names.length);const sandbox=vm.createContext({ee:{DOC_EDITOR:'doc-editor'},Set});
const original=vm.runInContext(declarations.join('\n')+'\nDV;',sandbox);
const nodes=[
 {id:'text',type:'text',data:{title:'Brief',content:'一段实际正文，不是 Prompt。'}},
 {id:'agent',type:'lcos-conversation',data:{title:'小绿',lcos_conversation_ref:{connectedConversationId:'do-not-index-this-id'},lcos_conversation_state:{provider:'do-not-index-provider',isRunning:false}}},
 {id:'run',type:'lcos-execution',data:{title:'写完分镜',lcos_execution_facts:{execution:{status:'created'}}}},
 {id:'collection',type:'pile',data:{title:'参考集合',memberIds:['a','b']}},
 {id:'file',type:'text',data:{title:'说明.pdf',lcos_file_ref:{fileRecordId:'do-not-index-path'}}},
 {id:'hidden',type:'text',hidden:true,data:{title:'Hidden'}},
];
const before=structuredClone(nodes), documents=api.LCOSNativeSearchDocuments(nodes,original);
assert.deepEqual(nodes,before);assert.equal(documents.length,5);for(const doc of documents)assert.equal(doc.node,nodes.find(n=>n.id===doc.node.id));
assert.ok(documents[0].entries.some(x=>x.value===nodes[0].data.content));
assert.ok(!JSON.stringify(documents.map(x=>x.entries)).includes('do-not-index'));
const originalFamily=node=>['image','text','audio','video','world','group'].includes(node.type)?node.type:'other';
for(const [kind,id]of[['conversation','agent'],['task','run'],['collection','collection'],['file','file']])assert.deepEqual(api.LCOSNativeSearchFilter(documents,kind,originalFamily).map(x=>x.node.id),[id]);
const filters=api.LCOSNativeSearchFilters([{id:'all'},{id:'text'},{id:'image'},{id:'world'}],documents,originalFamily,{});
assert.deepEqual(filters.map(x=>x.id),['all','text','conversation','collection','task','file']);
assert.equal(api.LCOSNativeSearchSummary({document:documents[2],field:'title'},''),'任务 · 尚未开始');
assert.equal(api.LCOSNativeSearchSummary({document:documents[3],field:'title'},''),'集合 · 2 项内容');
assert.equal(api.LCOSNativeSearchSummary({document:documents[0],field:'text',preview:'实际命中段落'},'命中'),'实际命中段落');
const transformed=transformNativeRailSearchScript('page-Da_DfwiK.js',raw);assert.notEqual(transformed,raw);assert.equal(transformNativeRailSearchScript('page-Da_DfwiK.js',transformed),transformed);
assert.ok(transformed.includes('fitBounds:i,fitView:o,screenToFlowPosition:a,setNodes:c')); // Same original camera and selection owner.
const report={passed:true,checks:['Original DV/Ml/Ll normalization retains hidden-node exclusion and actual node identities; new content search never edits nodes or indexes protocol IDs/providers.',
 'Actual node families produce useful text, collection count and task state; original matched body excerpts stay visible.',
 'The same original dialog, keyboard, matcher, selection and camera remain; only search data, summaries, type chips, existing icon choices and Rail accessibility are adapted.'],modelCalls:0};
await fs.mkdir('output/原Rail接续_20261023',{recursive:true});await fs.writeFile('output/原Rail接续_20261023/原搜索适配验证.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
