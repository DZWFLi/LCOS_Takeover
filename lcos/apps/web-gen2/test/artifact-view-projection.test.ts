import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ProjectGraphSnapshot } from '@local-creative-os/contracts';
import type { ArtifactView } from '@local-creative-os/domain';
import { additionalArtifactViews } from '../src/spatial/artifactViewProjection.js';
import { viewPresentationByArtifact } from '../src/spatial/reconciliationRunner.js';
import { Gen2Host } from '../src/host/projectionFacade.js';
import { HttpClient } from '../src/backend/client.js';
import { HuabuRfsClient } from '../src/spatial/huabuRfsClient.js';

const primary={id:'primary',artifactId:'artifact',scopeId:'scope',revisionId:'current',referenceKind:'primary',position:{x:1,y:2},size:{width:244,height:150},displayMode:'card',collapsed:false} as ArtifactView;
const extra={...primary,id:'extra',referenceKind:'explicit_additional',revisionId:'old',position:{x:31,y:32},size:{width:555,height:182}} as ArtifactView;
const graph={artifacts:[{id:'artifact',projectId:'project',kind:'markdown',managed:true,currentRevisionId:'current',title:'Actual title'}],
 artifactViews:[primary,extra],artifactRevisions:[{id:'old',artifactId:'artifact',fileRecordId:'old-file',status:'superseded'},{id:'current',artifactId:'artifact',fileRecordId:'current-file',status:'current'}],
 fileRecords:[{id:'old-file',projectId:'project',mimeType:'text/plain'},{id:'current-file',projectId:'project',mimeType:'text/markdown'}]} as unknown as ProjectGraphSnapshot;

test('an additional occurrence has a durable View identity and exact original revision/file while foreground facts retain Artifact identity',()=>{
 const result=additionalArtifactViews(graph,[extra],new Map([['artifact',{viewId:'primary'}]]));
 assert.equal(result.failures.length,0);assert.equal(result.entries.length,1);
 const {source,facts}=result.entries[0]!;
 assert.equal(source.entityType,'view');assert.equal(source.entityId,'extra');assert.deepEqual(source.position,extra.position);assert.deepEqual(source.size,extra.size);
 assert.equal(facts.entityType,'artifact');assert.equal(facts.entityId,'artifact');assert.equal(facts.artifactViewId,'extra');
 assert.equal(facts.presentedRevisionId,'old');assert.equal(facts.currentRevisionId,'current');assert.equal(facts.fileRecordId,'old-file');assert.equal(facts.mimeType,'text/plain');
});
test('a missing pinned revision cannot silently use Current or create an invented body',()=>{
 const result=additionalArtifactViews(graph,[{...extra,revisionId:'missing'} as ArtifactView],new Map());
 assert.equal(result.entries.length,0);assert.equal(result.failures.length,1);assert.match(result.failures[0]!.message,/未改用 Current/);
 assert.equal(result.unavailableFacts[0]?.availability,'missing');assert.equal(result.unavailableFacts[0]?.presentedRevisionId,'missing');assert.equal(result.unavailableFacts[0]?.fileRecordId,undefined);
});
test('primary, archived and already selected default occurrences are not duplicated',()=>{
 assert.equal(additionalArtifactViews(graph,[primary],new Map()).entries.length,0);
 assert.equal(additionalArtifactViews(graph,[extra],new Map([['artifact',{viewId:'extra'}]])).entries.length,0);
 assert.equal(additionalArtifactViews({...graph,artifacts:graph.artifacts.map(artifact=>({...artifact,archivedAt:'2026-10-08'}))},[extra],new Map()).entries.length,0);
});
test('selecting an already bound additional image preserves its independent carrier and exact file facts',()=>{
 const imageGraph={...graph,artifacts:graph.artifacts.map(artifact=>({...artifact,kind:'image' as const})),
   fileRecords:graph.fileRecords.map(file=>({...file,mimeType:'image/png'}))};
 const selected=new Map([['artifact',{viewId:'extra'}]]);
 const result=additionalArtifactViews(imageGraph,[extra],selected,new Set(['extra']));
 assert.equal(result.entries.length,1);
 assert.equal(result.entries[0]?.source.entityType,'view');assert.equal(result.entries[0]?.source.entityId,'extra');
 assert.equal(result.entries[0]?.facts.artifactViewId,'extra');assert.equal(result.entries[0]?.facts.fileRecordId,'old-file');
 assert.equal(result.entries[0]?.facts.presentedRevisionId,'old');
});
test('the production Host keeps both original image carrier descriptors after a bound additional view becomes the selected view',async()=>{
 const imageGraph={...graph,project:{id:'project'},scopes:[{id:'scope',kind:'root',projectId:'project'}],
   workspaces:[{id:'site',projectId:'project',canvasId:'original-canvas',scopeId:'scope',preferredSurface:'main',focusedViewIds:['extra']}],
   workspaceMemberships:[],workspaceEntityMemberships:[],relations:[],notes:[],
   artifacts:graph.artifacts.map(artifact=>({...artifact,kind:'image',availability:'available'})),
   fileRecords:graph.fileRecords.map(file=>({...file,mimeType:'image/png',size:100}))};
 const binding=(spatialId:string,entityType:string,entityId:string)=>({projectId:'project',canvasId:'original-canvas',spatialKind:'node',spatialId,entityType,entityId});
 const response=(value:unknown)=>new Response(JSON.stringify({ok:true,value}),{headers:{'Content-Type':'application/json'}});
 const http=new HttpClient({baseUrl:'http://fixture-core.test',fetch:async(input)=>{
   const url=String(input);if(url.endsWith('/spatial/bindings'))return response([binding('original-image-one','artifact','artifact'),binding('original-image-two','view','extra')]);
   if(url.endsWith('/graph'))return response(imageGraph);return response([]);
 }});
 const rfs=new HuabuRfsClient({canvasId:'original-canvas',baseUrl:'http://fixture-huabu.test',fetch:async()=>response({})});
 const host=new Gen2Host({http,rfs,projectId:'project'});
 const sources=await host.listNodeBindings();
 assert.equal(sources.length,2);
 const independent=sources.find(source=>source.spatialId==='original-image-two');
 assert.equal(independent?.descriptor?.entityType,'artifact');assert.equal(independent?.descriptor?.entityId,'artifact');
 assert.equal(independent?.descriptor?.artifactViewId,'extra');assert.equal(independent?.descriptor?.presentedRevisionId,'old');
 assert.equal(independent?.descriptor?.fileRecordId,'old-file');
});
test('Main primary identity remains stable when the focused View is additional',()=>{
 const selected=viewPresentationByArtifact(graph.artifactViews,{scopeId:'scope',focusedViewIds:new Set(['extra']),preferPrimary:true});
 assert.equal(selected.get('artifact')?.viewId,'primary');
});
