import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ReconciliationRunner,type ReconciliationDeps} from '../src/spatial/reconciliationRunner.js';
import {ProjectionBindingRegistry,MemoryBindingStore,type ProjectionBinding} from '../src/spatial/projectionBinding.js';
import type {ProjectGraphSnapshot} from '@local-creative-os/contracts';
const binding:ProjectionBinding={projectId:'p1',canvasId:'c1',spatialKind:'node',spatialId:'original-carrier',entityType:'artifact',entityId:'created-text'};
const graph={artifacts:[],artifactViews:[],workspaces:[],artifactRevisions:[],fileRecords:[],scopes:[],notes:[]} as unknown as ProjectGraphSnapshot;
async function exercise(initial:boolean,change:'new'|'rebound'|'unchanged'){
 const registry=new ProjectionBindingRegistry(new MemoryBindingStore());if(initial)await registry.bind(binding);
 const deleted:string[]=[];
 const deps={projectId:'p1',canvasId:'c1',bindings:registry,
  projects:{getProjectGraph:async()=>{if(change==='new')await registry.bind(binding);return graph;}},
  nodeProjector:{projectArtifactsWithReport:async()=>{if(change==='rebound')await registry.bind({...binding,spatialId:'another-carrier'});return{bindings:[],failures:[]};},projectBatchWithReport:async()=>({bindings:[],failures:[]}),removeOrphanNode:async(row:ProjectionBinding)=>{deleted.push(row.spatialId);}},
  relations:{listRelations:async()=>[]},relationProjector:{removeOrphanRelationEdge:async()=>undefined}
 } as unknown as ReconciliationDeps;
 await new ReconciliationRunner(deps).runOnce();return deleted;
}
test('an entity/binding created during an older graph read is never pruned as an orphan',async()=>assert.deepEqual(await exercise(false,'new'),[]));
test('an existing canonical key retargeted to another carrier is not pruned using the earlier address',async()=>assert.deepEqual(await exercise(true,'rebound'),[]));
test('a genuinely orphaned binding present before the read is still removed',async()=>assert.deepEqual(await exercise(true,'unchanged'),['original-carrier']));
