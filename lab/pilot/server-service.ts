import fastify from 'fastify';
import path from 'node:path';
import {readFile}from'node:fs/promises';
import{startCorePilot}from'./core-service.ts';
import{startSpatialPilot}from'./spatial-service.ts';
import canvasRoutes from'../../lcos/huabu/apps/server/src/modules/canvas/canvas.route.ts';
import{HttpClient}from'../../lcos/apps/web-gen2/src/backend/client.ts';
import{CoreArtifactClient}from'../../lcos/apps/web-gen2/src/backend/artifacts.ts';

export async function startLiveAdoption({runtimeRoot,port=17879}){
 let spatial,core,app;
 async function close(){
   const errors=[];
   for(const service of[app,core,spatial])if(service)try{await service.close();}catch(error){errors.push(error);}
   if(errors.length)throw errors[0];
 }
 try{
 spatial=await startSpatialPilot({runtimeRoot});
 core=await startCorePilot({runtimeRoot,canvasId:spatial.canvasId});
 const artifacts=new CoreArtifactClient(new HttpClient({baseUrl:core.origin}));
 const previous=(await spatial.read()).state.nodes;
 if(!previous.length)await spatial.execute([{type:'CREATE_NODES',nodes:[
  {id:'pilot-image',nodeType:'image',position:{x:120,y:120},size:{width:360,height:240},data:{label:'图片 · 本地登记'}},
  {id:'pilot-text',nodeType:'note',position:{x:620,y:150},size:{width:380,height:320},data:{label:'文本 · Core 正文',content:''}}
 ]}]);
 let text=await artifacts.readCanvasText(core.projectId,{canvasId:core.canvasId,spatialId:'pilot-text'});
 if(!text)text=await artifacts.saveCanvasText(core.projectId,{canvasId:core.canvasId,spatialId:'pilot-text',expectedRevisionId:null,body:'# 已接真实本地 Core\n\n这是 TapNow 原文本呈现，空间仍由 Huabu 管理。\n\n**双击正文编辑，保存后刷新验证。**'});
 const png=await readFile(path.join(runtimeRoot,'synthetic-input.png'));
 const imported=await artifacts.importCopiedFile(core.projectId,{file:new File([png],'本地合成图.png',{type:'image/png'}),importRequestId:'takeover-pilot-image',scopeId:core.scopeId,position:{x:120,y:120},nativeCarrier:{canvasId:core.canvasId,spatialId:'pilot-image',size:{width:360,height:240}}});
 const recordId=String(core.repository.getArtifactRevision(String(imported.revision.id)).fileRecordId);
 const image={artifactId:String(imported.artifact.id),revisionId:String(imported.revision.id),fileRecordId:recordId,src:'http://127.0.0.1:'+port+'/_core/projects/'+core.projectId+'/file-records/'+recordId+'/content'};
 await spatial.execute([{type:'MERGE_NODE_DATA',patches:[{nodeId:'pilot-image',patch:{src:image.src}},{nodeId:'pilot-text',patch:{content:text.body}}]}]);
 app=fastify({logger:false,bodyLimit:128*1024});
 const publicAssets=new Set(JSON.parse(await readFile(path.join(runtimeRoot,'public-assets.json'),'utf8')));
 app.addHook('onRequest',async(request,reply)=>{
   if(!['127.0.0.1:'+port,'localhost:'+port].includes(String(request.headers.host)))return reply.code(403).send({message:'Loopback Host required.'});
   const origin=request.headers.origin;if(origin&&!['http://127.0.0.1:'+port,'http://localhost:'+port].includes(origin))return reply.code(403).send({message:'Same origin required.'});
   reply.header('Content-Security-Policy',"default-src 'self';script-src 'self';style-src 'self' 'unsafe-inline';img-src 'self' data: blob:;font-src 'self' data:;connect-src 'self';worker-src 'self' blob:;object-src 'none';frame-src 'none';base-uri 'self'");reply.header('Cache-Control','no-store');
 });
 await app.register(canvasRoutes,{prefix:'/api/canvas'});
 app.get('/pilot/status',async()=>({mode:'actual-core-and-huabu-isolated',projectId:core.projectId,canvasId:core.canvasId,image,domainOwner:'Local Core',spatialOwner:'Huabu',realUserDatabaseOpened:false}));
 app.post('/pilot/text-preview',async(request,reply)=>{
   const {artifactId,revisionId}=(request.body||{}) as any;
   if(typeof artifactId!=='string'||typeof revisionId!=='string')return reply.code(400).send({message:'Committed Core identity required.'});
   const current=await artifacts.readCanvasText(core.projectId,{canvasId:core.canvasId,spatialId:'pilot-text'});
   if(!current||current.artifactId!==artifactId||current.revisionId!==revisionId)return reply.code(409).send({message:'Core revision changed; reload before syncing preview.'});
   const execution=await spatial.execute([{type:'MERGE_NODE_DATA',patches:[{nodeId:'pilot-text',patch:{content:current.body}}]}]);
   return {spatialId:'pilot-text',artifactId:current.artifactId,revisionId:current.revisionId,body:current.body,toVersion:execution.toVersion};
 });
 app.route({method:['GET','PUT'],url:'/_core/*',handler:async(request,reply)=>{
   const route=request.url.slice('/_core'.length);
   if(!route.startsWith('/projects/'+core.projectId+'/'))return reply.code(403).send({message:'Only the synthetic project is in scope.'});
   const response=await fetch(core.origin+route,{method:request.method,...(request.method==='PUT'?{headers:{'Content-Type':'application/json'},body:JSON.stringify(request.body)}:{})});
   reply.code(response.status);reply.header('Content-Type',response.headers.get('content-type')||'application/octet-stream');return reply.send(Buffer.from(await response.arrayBuffer()));
 }});
 app.get('/',async(_request,reply)=>reply.type('text/html').send('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>LCOS 本地节点接入实验</title><link rel="stylesheet" href="/assets/ui.css"><link rel="stylesheet" href="/assets/recovered-markdown.css"><link rel="stylesheet" href="/assets/pilot.css"></head><body><div id="root"></div><script type="module" src="/assets/ui.js"></script></body></html>'));
 app.get('/assets/*',async(request,reply)=>{
   const name=(request.params as any)['*'];if(!/^[a-zA-Z0-9_./-]+$/.test(name)||name.split('/').includes('..'))return reply.code(403).send();
   if(!publicAssets.has(name))return reply.code(404).send({message:'Not a public asset.'});
   const file=path.join(runtimeRoot,name);const ext=path.extname(file);reply.type(({'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'}as any)[ext]||'application/octet-stream');return reply.send(await readFile(file));
 });
 await app.listen({port,host:'127.0.0.1'});
 return {app,core,spatial,close};
 }catch(error){await close().catch(()=>{});throw error;}
}
