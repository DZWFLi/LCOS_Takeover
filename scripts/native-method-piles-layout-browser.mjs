import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {isDeepStrictEqual as same} from 'node:util';
import {currentGen2Root} from '../lab/current-gen2-resources.mjs';

// Deliberately not a projector or layout setter. Run after the root task has
// finished its other real-browser checks; only the two original mouse drags
// below may change the existing method Canvas geometry.
const option=name=>process.argv.find(arg=>arg.startsWith('--'+name+'='))?.slice(name.length+3);
assert.ok(process.argv.includes('--execute-real-ui'),'Explicit --execute-real-ui is required.');
const expectedPid=Number(option('expected-pid'));
assert.ok(Number.isSafeInteger(expectedPid)&&expectedPid>0,'Exact --expected-pid is required.');
const origin=new URL(option('base-url')??'http://127.0.0.1:56311').origin;
assert.equal(new URL(origin).protocol,'http:');assert.equal(new URL(origin).hostname,'127.0.0.1');
const fixture=JSON.parse(await fs.readFile('output/方法嵌套成员与混合现场_20261025/fixture.json','utf8'));
assert.equal(fixture.scopeId,'scope-workflow-nested-members-20261025');
const prefix='/api/lcos/core/projects/'+encodeURIComponent(fixture.projectId);
const output=path.resolve('output/方法集合原鼠标归位_20261025/实屏',new Date().toISOString().replace(/[:.]/g,'-'));
await fs.mkdir(output,{recursive:true});
const report={passed:false,output,expectedPid,browser:'Browser plugin not available; existing Playwright Core / Chrome',
  checks:[],writes:[],blockedExternal:[],blockedWebSockets:[],pageErrors:[],httpErrors:[],screenshots:[],drags:[],
  modelSends:0,newRuns:0,hiddenSetters:0,fixture:{projectId:fixture.projectId,scopeId:fixture.scopeId,workspaceId:fixture.workspaceId}};
const save=()=>fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
const get=async route=>{const response=await fetch(origin+route,{redirect:'error',signal:AbortSignal.timeout(30000)}),body=await response.json();
  assert.ok(response.ok&&body.ok!==false,route+': '+JSON.stringify(body));return body.value??body.data??body;};
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const finitePoint=value=>record(value)&&Object.keys(value).every(field=>['x','y'].includes(field))&&Number.isFinite(value.x)&&Number.isFinite(value.y);
const close=(a,b,tolerance=2)=>finitePoint(a)&&finitePoint(b)&&Math.abs(a.x-b.x)<=tolerance&&Math.abs(a.y-b.y)<=tolerance;
const within=(value,first,last,tolerance=2)=>finitePoint(value)&&value.x>=Math.min(first.x,last.x)-tolerance&&value.x<=Math.max(first.x,last.x)+tolerance
  &&value.y>=Math.min(first.y,last.y)-tolerance&&value.y<=Math.max(first.y,last.y)+tolerance;
const size=node=>{const width=Number(node.measured?.width??node.width??node.style?.width??240),height=Number(node.measured?.height??node.height??node.style?.height??200);
  assert.ok(Number.isFinite(width)&&width>0&&Number.isFinite(height)&&height>0,'Existing finite node bounds are required: '+node.id);return{width,height};};
const bounds=(node,position=node.position)=>({...position,...size(node)});
const overlap=(a,b,gap=24)=>a.x<b.x+b.width+gap&&a.x+a.width+gap>b.x&&a.y<b.y+b.height+gap&&a.y+a.height+gap>b.y;
const nodeSelector=id=>'.react-flow__node[data-id='+JSON.stringify(id)+']';
let browser,page,canvasId,beforeCanvas,plans=[],draggingId=null;
let acceptedBatches=0,positionChanges=0;
const canvasRoute=()=>'/api/canvas/v1/canvases/'+encodeURIComponent(canvasId);
const facts=async()=>({graph:await get(prefix+'/graph'),presentations:await get(prefix+'/presentations'),bindings:await get(prefix+'/spatial/bindings'),
  execution:await get(prefix+'/execution-projection'),messages:await get(prefix+'/conversations/'+encodeURIComponent(fixture.liveSessionId)+'/messages?limit=1000'),
  outerMembers:await get(prefix+'/collections/'+encodeURIComponent(fixture.nested.outer.id)+'/members'),
  innerMembers:await get(prefix+'/collections/'+encodeURIComponent(fixture.nested.inner.id)+'/members')});

try{
  const health=await get('/health');assert.equal(health.pid,expectedPid);assert.equal(health.realCoreConnected,true);report.pid=health.pid;
  const before=await facts(),workspaces=before.graph.workspaces.filter(row=>row.id===fixture.workspaceId&&row.projectId===fixture.projectId&&row.scopeId===fixture.scopeId);
  assert.equal(workspaces.length,1);assert.ok(workspaces[0].canvasId,'The existing method workspace must already be opened; this script never creates it.');
  canvasId=workspaces[0].canvasId;report.canvasId=canvasId;beforeCanvas=await get(canvasRoute());
  assert.ok(Array.isArray(beforeCanvas.nodes)&&Array.isArray(beforeCanvas.connections));
  const targets=[['outer',fixture.nested.outer.id],['inner',fixture.nested.inner.id]].map(([role,collectionId])=>{
    const rows=beforeCanvas.nodes.filter(node=>node.type==='pile'&&node.data?.lcos_native_collection===true
      &&node.data?.lcos_collection_ref?.projectId===fixture.projectId&&node.data.lcos_collection_ref.canvasId===canvasId
      &&node.data.lcos_collection_ref.workspaceId===fixture.workspaceId&&node.data.lcos_collection_ref.collectionId===collectionId);
    assert.equal(rows.length,1,role+' original PILE identity');const node=rows[0];assert.ok(finitePoint(node.position));
    const bindings=before.bindings.filter(row=>row.projectId===fixture.projectId&&row.canvasId===canvasId&&row.spatialKind==='node'
      &&row.spatialId===node.id&&row.entityType==='collection'&&row.entityId===collectionId);
    assert.equal(bindings.length,1,role+' exact canonical binding');return{role,collectionId,nodeId:node.id,node,binding:bindings[0]};
  });
  assert.notEqual(targets[0].nodeId,targets[1].nodeId);
  const targetIds=new Set(targets.map(row=>row.nodeId)),obstacles=beforeCanvas.nodes.filter(node=>!targetIds.has(node.id)).map(node=>bounds(node));
  for(const [index,target]of targets.entries()){
    const preferred={x:index===0?0:340,y:360},dimension=size(target.node),stride=Math.max(240,dimension.height+48);
    let to={...preferred},row=0;
    while([...obstacles,...plans.map(plan=>bounds(plan.node,plan.to))].some(other=>overlap(bounds(target.node,to),other))){
      assert.ok(++row<=20,'No free existing-bounds row was found for '+target.role);to={x:preferred.x,y:preferred.y+row*stride};
    }
    plans.push({...target,from:{...target.node.position},to,preferred,row});
  }
  report.plan=plans.map(({node,...plan})=>plan);
  report.before={canvas:beforeCanvas,facts:before};await save();

  const {chromium}=createRequire(path.join(currentGen2Root,'package.json'))('playwright-core');
  browser=await chromium.launch({channel:'chrome',headless:!process.argv.includes('--headed'),args:['--disable-background-networking','--disable-sync','--no-first-run']});
  const context=await browser.newContext({viewport:{width:1500,height:1000},locale:'zh-CN',serviceWorkers:'block'});
  await context.route('**/*',async route=>{
    try{
    const request=route.request(),url=new URL(request.url()),method=request.method();
    if(url.origin!==origin){report.blockedExternal.push({protocol:url.protocol,host:url.host});return route.abort();}
    if(!['GET','HEAD','OPTIONS'].includes(method)){
      let body;try{body=request.postDataJSON()}catch{}
      const write={method,path:url.pathname,permitted:false,stage:draggingId??'read-only'};report.writes.push(write);
      if(method==='POST'&&url.pathname==='/api/events')write.permitted=true;
      else if(method==='POST'&&[ '/api/lcos/canvases/'+encodeURIComponent(canvasId)+'/execution:reconcile',
        '/api/lcos/canvases/'+encodeURIComponent(canvasId)+'/conversations:reconcile' ].includes(url.pathname)&&same(body,{}))write.permitted=true;
      else if(method==='POST'&&url.pathname===canvasRoute()+'/nodes:batchActions'){
        const current=await get(canvasRoute());
        const top=['canvas_id','actions','created_by_role','lcos_expected_revisions'];
        write.permitted=record(body)&&body.canvas_id===canvasId&&body.created_by_role==='user'&&!body.lcos_operation
          &&Object.keys(body).every(field=>top.includes(field))&&Array.isArray(body.actions)&&body.actions.length>0&&body.actions.length<=2
          &&body.actions.every(action=>record(action)&&Object.keys(action).every(field=>['action','updates'].includes(field))
            &&action.action==='update'&&Array.isArray(action.updates)&&action.updates.length>0&&action.updates.length<=beforeCanvas.nodes.length
            &&action.updates.every(patch=>{
              if(!record(patch)||!Object.hasOwn(patch,'id')||!Object.keys(patch).every(field=>['id','type','data','position','measured'].includes(field)))return false;
              const old=current.nodes.find(node=>node.id===patch.id),original=beforeCanvas.nodes.find(node=>node.id===patch.id);
              if(!old||!original)return false;
              for(const field of ['type','data','measured'])if(Object.hasOwn(patch,field)&&(!same(patch[field],old[field])||!same(patch[field],original[field])))return false;
              if(!Object.hasOwn(patch,'position')||same(patch.position,old.position))return true; // Exact serializer echoes only.
              const plan=plans.find(plan=>plan.nodeId===patch.id);
              if(!plan||draggingId!==patch.id||!within(patch.position,plan.from,plan.to,plan.positionTolerance))return false;
              return true;
            }));
        if(write.permitted){
          const changed=body.actions.flatMap(action=>action.updates).filter(patch=>Object.hasOwn(patch,'position')&&!same(patch.position,current.nodes.find(node=>node.id===patch.id)?.position));
          acceptedBatches++;positionChanges+=changed.length;
          if(acceptedBatches>200||positionChanges>100){write.permitted=false;write.reason='Unexpected number of original geometry/echo writes.';}
          write.changed=changed.map(patch=>({id:patch.id,position:patch.position}));
          write.kind=changed.length?'original-mouse-position':'exact-data-measured-geometry-echo';
        }
      }
      if(!write.permitted){write.bodyKeys=record(body)?Object.keys(body):[];await save();return route.abort();}
    }
    if(url.pathname==='/lcos/agent-ui.js'){
      const response=await route.fetch({timeout:120000});return route.fulfill({response,body:await response.text()+
        '\nwindow.__METHOD_PILES_LAYOUT_READ__=()=>{const s=useLcosShellStore.getState(),c=useCanvasStore.getState(),h=window.__LCOS_NODE_LAB__;return{canvas:c.canvasId,status:c.status,workspace:s.activeWorkspaceId,projectId:s.projectId,host:h&&{projectId:h.projectId,canvasId:h.canvasId,currentCanvasId:h.currentCanvasId,apiMatches:h.api===c.rfInstance},viewport:c.rfInstance?.getViewport(),nodes:c.nodes,prompt:s.composerPrompt,target:s.composerTarget,refs:useLcosReferenceStore.getState().draft.orderedEntityRefs,windows:s.windows,document:performance.timeOrigin}};'});
    }
    return route.continue();
    }catch(error){report.writes.push({path:new URL(route.request().url()).pathname,permitted:false,reason:'Route inspection failed: '+String(error.message)});
      await save();await route.abort().catch(()=>{});}
  });
  await context.routeWebSocket('**/*',socket=>{report.blockedWebSockets.push(socket.url());socket.close()});
  page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',error=>report.pageErrors.push(String(error)));
  page.on('response',response=>{if(response.status()>=400)report.httpErrors.push({path:new URL(response.url()).pathname,status:response.status()})});
  const read=()=>page.evaluate(()=>window.__METHOD_PILES_LAYOUT_READ__());
  const shot=async name=>{await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));const file=path.join(output,name+'.png');await page.screenshot({path:file});report.screenshots.push(file);await save();};
  await page.goto(origin+'/canvas/'+encodeURIComponent(canvasId),{waitUntil:'domcontentloaded',timeout:120000});
  await page.waitForFunction(({canvasId,workspaceId,projectId})=>{const value=window.__METHOD_PILES_LAYOUT_READ__?.();return value?.canvas===canvasId&&value.status==='ready'
    &&value.workspace===workspaceId&&value.projectId===projectId&&value.host?.apiMatches&&(value.host.currentCanvasId??value.host.canvasId)===canvasId},
    {canvasId,workspaceId:fixture.workspaceId,projectId:fixture.projectId},{timeout:120000});
  await page.locator('[data-lcos-professional-surface-state=ready]').waitFor({state:'attached',timeout:120000});
  await page.getByTestId('common-loading-overlay').waitFor({state:'hidden',timeout:60000});
  assert.equal(await page.locator('vite-error-overlay').count(),0);
  report.pageIdentity={url:page.url(),title:await page.title(),nonBlank:(await page.locator('body').innerText()).length>100};
  assert.ok(report.pageIdentity.url.endsWith('/canvas/'+encodeURIComponent(canvasId))&&report.pageIdentity.title&&report.pageIdentity.nonBlank);
  // Original viewport action only; it never changes a node or a hidden Store.
  await page.evaluate(async()=>{assertNativeHost();function assertNativeHost(){if(!window.__LCOS_NODE_LAB__?.api?.fitView)throw Error('Original fitView is unavailable.');}
    await window.__LCOS_NODE_LAB__.api.fitView({padding:.3,duration:0,minZoom:.2,maxZoom:.7});});
  const inputBefore=await read();report.inputBefore={...inputBefore,nodes:undefined};
  assert.deepEqual((await get(canvasRoute())).nodes,beforeCanvas.nodes,'Loading/fitView must not alter existing node geometry.');
  await shot('01-original-piles-before');

  for(const plan of plans){
    if(close(plan.from,plan.to)){report.drags.push({role:plan.role,nodeId:plan.nodeId,alreadyPlaced:true,from:plan.from,to:plan.to});continue;}
    const blank=await page.locator('.react-flow__pane').evaluate(pane=>{
      const rect=pane.getBoundingClientRect();for(const fy of [.82,.18,.68,.32])for(const fx of [.82,.18,.68,.32]){
        const point={x:rect.left+rect.width*fx,y:rect.top+rect.height*fy};if(document.elementFromPoint(point.x,point.y)===pane)return point;
      }return null;
    });
    assert.ok(blank,'Original empty Canvas pane is required to clear the previous selection.');await page.mouse.click(blank.x,blank.y);
    const node=page.locator(nodeSelector(plan.nodeId));await node.waitFor({state:'visible'});
    const hit=async()=>node.evaluate((element,id)=>{
      const face=[...element.querySelectorAll('[data-native-pile-folder-node-id]')].find(row=>row.getAttribute('data-native-pile-folder-node-id')===id);
      const rect=(face??element).getBoundingClientRect();
      for(const fy of [.28,.42,.58,.72])for(const fx of [.28,.42,.58,.72]){
        const point={x:rect.left+rect.width*fx,y:rect.top+rect.height*fy},target=document.elementFromPoint(point.x,point.y);
        const outerButton=target?.closest('[data-pile-node]'),button=target?.closest('button');
        if(target?.closest('.react-flow__node')?.getAttribute('data-id')!==id||target.closest('.nodrag,a,input,textarea,select,[role="dialog"]')||button&&button!==outerButton)continue;
        return{...point,source:face?'original-pile-folder':'original-node',rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height}};
      }return null;
    },plan.nodeId);
    let start=await hit();
    if(!start){
      // The existing focusable ReactFlow node raises its normal selected/focus
      // stacking order. This is an original DOM focus/key action, never a setter.
      assert.ok(await node.getAttribute('tabindex')!==null,'Overlapped PILE has no original keyboard focus route.');
      await node.focus();await node.press('Enter');start=await hit();
    }
    assert.ok(start,'The exact outer-first original PILE must have a real unobstructed drag point: '+plan.nodeId);
    const state=await read();assert.equal(state.canvas,canvasId);assert.equal(state.host.apiMatches,true);
    const zoom=state.viewport?.zoom;assert.ok(Number.isFinite(zoom)&&zoom>0);
    // Native mouse coordinates are quantized to CSS pixels. At this zoom,
    // one screen pixel is more than two world units; report that tolerance.
    plan.positionTolerance=Math.max(2,1/zoom);
    // Original wFe/Xh expands the visible Pile around its canonical center.
    // Its top-left is a display projection, not the saved Canvas position.
    // Read the canonical owner again, then move both by the same actual delta.
    const current=state.nodes.find(row=>row.id===plan.nodeId);assert.ok(finitePoint(current?.position));
    const canonical=(await get(canvasRoute())).nodes.find(row=>row.id===plan.nodeId);
    assert.ok(close(canonical?.position,plan.from),'Original saved start position changed before drag.');
    const delta={x:plan.to.x-canonical.position.x,y:plan.to.y-canonical.position.y};
    const displayTarget={x:current.position.x+delta.x,y:current.position.y+delta.y};
    const end={x:start.x+delta.x*zoom,y:start.y+delta.y*zoom};
    report.pendingDrag={nodeId:plan.nodeId,canonicalFrom:canonical.position,displayFrom:current.position,displayTarget,delta,start,end,zoom};await save();
    const viewport=page.viewportSize();assert.ok(end.x>=8&&end.y>=8&&end.x<=viewport.width-8&&end.y<=viewport.height-8,'Target is outside the fitted original viewport; do not issue a partial drag.');
    draggingId=plan.nodeId;
    await page.mouse.move(start.x,start.y);await page.mouse.down();
    try{
      const selected=await page.evaluate(()=>window.__LCOS_NODE_LAB__?.api?.getSelection()?.nodeIds??[]);
      assert.ok(selected.length<=1&&selected.every(id=>id===plan.nodeId),'A drag must not move any previously selected sibling.');
      report.pendingDrag.afterDown=(await read()).viewport;
      await page.mouse.move(end.x,end.y,{steps:24});
      // Let the original animation-frame drag handler consume the final
      // pointer event before mouseup closes its existing drag transaction.
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      await page.mouse.move(end.x,end.y);
      // ReactFlow starts its native drag after the pointer crosses its
      // threshold. Refine the real pointer once from the observed card,
      // rather than pretending that the first threshold motion was applied.
      const afterMove=(await read()).nodes.find(row=>row.id===plan.nodeId);
      assert.ok(finitePoint(afterMove?.position));
      const correction={x:end.x+(displayTarget.x-afterMove.position.x)*zoom,y:end.y+(displayTarget.y-afterMove.position.y)*zoom};
      assert.ok(Math.hypot(correction.x-end.x,correction.y-end.y)<=16,'Unexpected drag displacement; do not compensate for a product jump.');
      report.pendingDrag.beforeRelease={observed:afterMove.position,correction};
      await page.mouse.move(correction.x,correction.y);
      await page.waitForFunction(({id,to,tolerance})=>{const position=window.__LCOS_NODE_LAB__?.api?.getNode(id)?.position;return position&&Math.abs(position.x-to.x)<=tolerance&&Math.abs(position.y-to.y)<=tolerance},
        {id:plan.nodeId,to:displayTarget,tolerance:plan.positionTolerance},{timeout:10000});
    }finally{await page.mouse.up();}
    await page.waitForFunction(({id,to,tolerance})=>{const position=window.__LCOS_NODE_LAB__?.api?.getNode(id)?.position;return position&&Math.abs(position.x-to.x)<=tolerance&&Math.abs(position.y-to.y)<=tolerance},
      {id:plan.nodeId,to:displayTarget,tolerance:plan.positionTolerance});
    let persisted;
    for(let attempt=0;attempt<80;attempt++){
      persisted=await get(canvasRoute());if(close(persisted.nodes.find(row=>row.id===plan.nodeId)?.position,plan.to,plan.positionTolerance))break;
      await page.waitForTimeout(250);
    }
    assert.ok(close(persisted.nodes.find(row=>row.id===plan.nodeId)?.position,plan.to,plan.positionTolerance),'Mouse movement was not confirmed by the original Canvas readback.');
    report.drags.push({role:plan.role,nodeId:plan.nodeId,collectionId:plan.collectionId,from:plan.from,to:plan.to,start,end,zoom,positionTolerance:plan.positionTolerance,displayFrom:current.position,displayTarget,
      actual:persisted.nodes.find(row=>row.id===plan.nodeId).position});
    await shot('0'+(report.drags.length+1)+'-'+plan.role+'-original-mouse-readback');draggingId=null;
  }

  const afterCanvas=await get(canvasRoute()),after=await facts();report.after={canvas:afterCanvas,facts:after};
  assert.deepEqual(after,before,'Core graph, memberships, bindings, Presentations, Run truth and messages must remain unchanged.');
  assert.deepEqual(afterCanvas.nodes.map(node=>node.id).sort(),beforeCanvas.nodes.map(node=>node.id).sort());assert.deepEqual(afterCanvas.connections,beforeCanvas.connections);
  for(const old of beforeCanvas.nodes){
    const next=afterCanvas.nodes.find(node=>node.id===old.id),plan=plans.find(plan=>plan.nodeId===old.id);
    for(const field of ['type','data','measured','width','height','style','parentId','origin','zIndex'])assert.deepEqual(next[field],old[field],old.id+' '+field);
    if(plan)assert.ok(close(next.position,plan.to,plan.positionTolerance),old.id+' final position');else assert.deepEqual(next.position,old.position,old.id+' other geometry');
  }
  const inputAfter=await read();assert.equal(inputAfter.prompt,inputBefore.prompt);assert.deepEqual(inputAfter.target,inputBefore.target);
  assert.deepEqual(inputAfter.refs,inputBefore.refs);assert.deepEqual(inputAfter.windows,inputBefore.windows);assert.equal(inputAfter.document,inputBefore.document);
  const displayBounds=inputAfter.nodes.map(node=>({id:node.id,type:node.type,parentId:node.parentId,...node.position,
    width:Number(node.width??node.measured?.width),height:Number(node.height??node.measured?.height)}));
  report.displayBounds=displayBounds;report.displayOverlaps=[];
  for(let a=0;a<displayBounds.length;a++)for(let b=a+1;b<displayBounds.length;b++){
    const first=displayBounds[a],last=displayBounds[b];
    if(first.parentId===last.id||last.parentId===first.id)continue;
    if(overlap(first,last,0))report.displayOverlaps.push([first.id,last.id]);
  }
  assert.deepEqual(report.displayOverlaps,[],'Actual original wFe display boxes, including both Piles, must be separate.');
  assert.ok(report.writes.every(write=>write.permitted),'A non-geometry operation was blocked.');assert.deepEqual(report.pageErrors,[]);
  await page.evaluate(async()=>{await window.__LCOS_NODE_LAB__.api.fitView({padding:.3,duration:0,minZoom:.2,maxZoom:.7});});
  await shot('04-original-method-two-piles-separated');
  report.checks.push('The existing outer/inner PILE positions were checked in order; already placed carriers were kept, remaining moves used original mouse down/move/up and the measured viewport zoom with one CSS pixel tolerance.',
    'Exact original node IDs, Core Collection bindings/memberships, node data/measured and every other node geometry remained unchanged; both moved positions were confirmed by original Canvas GET.',
    'No hidden setter, model call, new Run, message, semantic membership or alternative placement endpoint was used; all non-allowlisted writes were blocked.');
  report.passed=true;
}catch(error){
  report.error=String(error.stack??error);process.exitCode=1;
  if(page){await page.mouse.up().catch(()=>{});report.failedState=await page.evaluate(()=>window.__METHOD_PILES_LAYOUT_READ__?.()).catch(()=>undefined);
    const file=path.join(output,'failure.png');await page.screenshot({path:file}).catch(()=>{});report.screenshots.push(file);}
  if(canvasId)report.failureReadback=await get(canvasRoute()).catch(error=>({unavailable:String(error.message)}));
}finally{await save();await browser?.close();}
console.log(JSON.stringify({passed:report.passed,checks:report.checks,error:report.error,output},null,2));
