import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL}from'node:url';
import{buildPilotEntry}from'../lab/pilot/build-pilot.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const runtimeRoot=path.join(root,'.runtime','live-spatial-test-'+Date.now());await mkdir(runtimeRoot,{recursive:true});
process.env.HUABU_DATA_DIR=path.join(runtimeRoot,'huabu-private');
const entry=await buildPilotEntry('lab/pilot/spatial-service.ts',path.join(runtimeRoot,'spatial-service.mjs'));
const{startSpatialPilot}=await import(pathToFileURL(entry).href);
let pilot;const report={implementation:'copied actual Huabu storage and canvas executor',cases:[],originalWorkspaceOpened:false};
try{
 pilot=await startSpatialPilot({runtimeRoot});
 const created=await pilot.execute([{type:'CREATE_NODES',nodes:[{id:'pilot-image',nodeType:'image',position:{x:140,y:120},size:{width:360,height:240},data:{label:'图片'}},{id:'pilot-text',nodeType:'note',position:{x:600,y:140},size:{width:340,height:280},data:{label:'文本',content:'# 接真实空间'}}]}]);
 assert.ok(created.results.every(r=>r.applied));assert.equal((await pilot.read()).state.nodes.length,2);report.cases.push('native CREATE_NODES writes original disk space');
 const moved=await pilot.execute([{type:'SET_NODE_GEOMETRY',items:[{nodeId:'pilot-image',position:{x:180,y:150}},{nodeId:'pilot-text',size:{width:400,height:320}}]}]);assert.ok(moved.results.every(r=>r.applied));report.cases.push('original geometry commands persist positions and sizes');
 const connected=await pilot.execute([{type:'CONNECT_NODES',edges:[{source:'pilot-image',target:'pilot-text'}]}]);assert.ok(connected.results.every(r=>r.applied));assert.equal((await pilot.read()).state.edges.length,1);report.cases.push('original connection command persists edge');
 await pilot.close();pilot=await startSpatialPilot({runtimeRoot});const state=(await pilot.read()).state;assert.equal(state.nodes.find(n=>n.id==='pilot-image').position.x,180);assert.equal(state.edges.length,1);report.cases.push('original storage close/reopen restores scene');report.passed=true;
}catch(error){report.passed=false;report.error=error.stack;process.exitCode=1;}
finally{await pilot?.close();await writeFile(path.join(root,'evidence/live-spatial-pilot.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify(report,null,2));
