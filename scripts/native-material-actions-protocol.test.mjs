import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const runtime=path.join(root,'.runtime/native-material-actions-protocol');await fs.mkdir(runtime,{recursive:true});
const moduleFile=path.join(runtime,'router.mjs');await buildPilotEntry('lab/pilot/core-protocol-router.ts',moduleFile,'node');
const{createCoreProtocolRouter}=await import(pathToFileURL(moduleFile).href+'?run='+Date.now());
const requests=[];
const core=http.createServer(async(req,res)=>{let bytes='';for await(const chunk of req)bytes+=chunk;const body=bytes?JSON.parse(bytes):undefined;
 requests.push({method:req.method,path:req.url,body});res.setHeader('content-type','application/json');
 if(body?.operationId==='conflict'){res.statusCode=409;res.end(JSON.stringify({ok:false,error:{code:'ORIGINAL_CONFLICT',message:'Original recovery evidence'}}));}
 else res.end(JSON.stringify({ok:true,value:{id:'material',projectId:'project',opened:true,revealed:true}}));});
await new Promise(resolve=>core.listen(0,'127.0.0.1',resolve));const address=core.address();
const router=createCoreProtocolRouter({coreOrigin:'http://127.0.0.1:'+address.port,projectId:'project',
 isArtifactOwned:id=>id==='material',isArtifactSourceInScope:async id=>id==='material'});
const invoke=(method,pathname,body)=>router.handle({method,pathname,body});
const report={passed:false,osActionExecuted:false,cases:[]};
try{
 for(const action of ['archive','restore']){const result=await invoke('POST','/api/lcos/core/projects/project/artifacts/material/'+action,{operationId:'explicit-operation'});assert.equal(result.status,200);assert.equal(requests.at(-1).body.operationId,'explicit-operation');}
 assert.equal((await invoke('POST','/api/lcos/core/projects/foreign/artifacts/material/archive',{operationId:'x'})).status,404);
 assert.equal((await invoke('POST','/api/lcos/core/projects/project/artifacts/foreign/archive',{operationId:'x'})).status,404);
 const conflict=await invoke('POST','/api/lcos/core/projects/project/artifacts/material/archive',{operationId:'conflict'});
 assert.equal(conflict.status,409);assert.equal(conflict.body.error.code,'ORIGINAL_CONFLICT');
 report.cases.push('Lifecycle forwards original operation identity and Core conflict, rejects foreign project/artifact');
 const before=requests.length;
 assert.equal((await invoke('POST','/api/lcos/core/artifacts/material/open',{path:'C:/unrelated.exe'})).status,400);
 assert.equal((await invoke('POST','/api/lcos/core/artifacts/foreign/open')).status,404);
 const noSource=createCoreProtocolRouter({coreOrigin:'http://127.0.0.1:'+address.port,projectId:'project',isArtifactOwned:()=>true,isArtifactSourceInScope:async()=>false});
 assert.equal((await noSource.handle({method:'POST',pathname:'/api/lcos/core/artifacts/material/open'})).status,404);
 assert.equal(requests.length,before);
 for(const action of ['open','reveal'])assert.equal((await invoke('POST','/api/lcos/core/artifacts/material/'+action)).status,200);
 report.cases.push('Source actions require contained registered source, reject caller paths and foreign identity before forwarding; fake Core only, no OS launch');
 assert.equal((await invoke('GET','/api/lcos/core/projects/project/context-manifests/v0/exact-manifest')).status,200);
 assert.equal((await invoke('GET','/api/lcos/core/projects/foreign/context-manifests/v0/exact-manifest')).status,404);
 assert.equal((await invoke('POST','/api/lcos/core/projects/project/context-manifests/v0/exact-manifest',{})).status,501);
 assert.equal((await invoke('POST','/api/lcos/core/artifacts/material/relink',{path:'C:/unrelated'})).status,501);
 report.cases.push('Task manifest read-only same-project mapping, no relink or implicit extra API exposure');
 report.passed=true;
}finally{await new Promise(resolve=>core.close(resolve));const output=path.join(root,'output/原流程施工_20261017b');await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'material-actions-protocol.json'),JSON.stringify(report,null,2));}
console.log(JSON.stringify(report));
