import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {isDeepStrictEqual as same} from 'node:util';
import {currentGen2Root} from '../lab/current-gen2-resources.mjs';

const mode=process.argv.includes('--expect-blocked')?'before':'after';
const restoring=process.argv.includes('--restore-original-position');
const expectedPid=Number(process.argv.find(arg=>arg.startsWith('--expected-pid='))?.split('=')[1]);
assert.ok(Number.isSafeInteger(expectedPid)&&expectedPid>0);
const origin='http://127.0.0.1:56311',canvasId='surface-core-main',id='surface-main-image';
const canvasRoute='/api/canvas/v1/canvases/'+canvasId;
const prefix='/api/lcos/core/projects/disposable-surface-core-facade';
const output=path.resolve('output/Main图片左拖修复_20261026/实屏',mode+'-'+new Date().toISOString().replaceAll(':','-'));
await fs.mkdir(output,{recursive:true});
const report={passed:false,mode,output,checks:[],writes:[],errors:[],httpErrors:[],screenshots:[],blockedNetwork:[],unknownProtocols:[],webSockets:[],modelSends:0,newRuns:0,hiddenSetters:0};
const save=()=>fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
const get=async route=>{const r=await fetch(origin+route,{redirect:'error',signal:AbortSignal.timeout(30000)});assert.ok(r.ok,route);const d=await r.json();return d.value??d.data??d;};
const health=await get('/health');assert.equal(health.pid,expectedPid);assert.equal(health.realCoreConnected,true);report.pid=health.pid;
const before=await get(canvasRoute),initial=before.nodes.find(n=>n.id===id);assert.equal(initial?.data?.title??initial?.data?.name??initial?.title,'本地合成图.png');
if(!restoring)assert.deepEqual(initial.position,{x:120,y:100},'The authorized PNG starts at its confirmed original position; do not overwrite a different user placement.');
const facts=async()=>{
  const [graph,presentations,bindings,execution,conversations]=await Promise.all([
    get(prefix+'/graph'),get(prefix+'/presentations'),get(prefix+'/spatial/bindings'),get(prefix+'/execution-projection'),get(prefix+'/conversations')]);
  assert.ok(Array.isArray(conversations));
  const messages=Object.fromEntries(await Promise.all(conversations.map(async row=>{
    const value=await get(prefix+'/conversations/'+encodeURIComponent(row.id)+'/messages?limit=1000');
    const rows=Array.isArray(value)?value:value.messages??value.items;
    assert.ok(Array.isArray(rows),'Read the complete original message list');
    assert.equal(Boolean(value.hasMore??value.nextCursor),false,'No message pagination omitted');
    return [row.id,rows];
  })));
  return {graph,presentations,bindings,execution,conversations,messages};
};
const factsBefore=await facts();report.before={canvas:before,facts:factsBefore};
report.protectedMessages={counts:Object.fromEntries(Object.entries(factsBefore.messages).map(([key,rows])=>[key,rows.length])),total:Object.values(factsBefore.messages).reduce((total,rows)=>total+rows.length,0)};
assert.equal(report.protectedMessages.counts['conversation-08d78311-43d1-4be1-97c5-52d5442839f4'],28);
assert.equal(report.protectedMessages.total,36);await save();
const {chromium}=createRequire(path.join(currentGen2Root,'package.json'))('playwright-core');
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-networking','--disable-sync','--no-first-run']});
let page,stage='load',cleanupPosition;
try{
  const context=await browser.newContext({viewport:{width:1500,height:1000},locale:'zh-CN',serviceWorkers:'block'});
  await context.route('**/*',async route=>{
    const req=route.request(),u=new URL(req.url());
    if(!['http:','https:','data:','blob:'].includes(u.protocol)){report.unknownProtocols.push({stage,protocol:u.protocol});return route.abort();}
    if(['data:','blob:'].includes(u.protocol))return route.continue();
    if(u.origin!==origin){report.blockedNetwork.push({stage,origin:u.origin,path:u.pathname,method:req.method()});return route.abort();}
    if(!['GET','HEAD','OPTIONS'].includes(req.method())){
      let body;try{body=req.postDataJSON()}catch{}
      const row={stage,path:u.pathname,method:req.method(),permitted:false};report.writes.push(row);
      if(req.method()==='POST'&&(u.pathname==='/api/events'||/^\/api\/lcos\/canvases\/surface-core-(main|context|workflow)\/(execution|conversations):reconcile$/.test(u.pathname)&&same(body,{})))row.permitted=true;
      if(req.method()==='POST'&&u.pathname===canvasRoute+'/nodes:batchActions'){
        const current=await get(canvasRoute);
        row.permitted=body?.canvas_id===canvasId&&body.created_by_role==='user'&&!body.lcos_operation
          &&Object.keys(body).every(k=>['canvas_id','created_by_role','actions','lcos_expected_revisions'].includes(k))
          &&Array.isArray(body.actions)&&body.actions.length>0&&body.actions.every(a=>a.action==='update'&&Object.keys(a).every(k=>['action','updates'].includes(k))
          &&Array.isArray(a.updates)&&a.updates.every(n=>{
            const old=current.nodes.find(x=>x.id===n.id),first=before.nodes.find(x=>x.id===n.id);if(!old||!first)return false;
            return Object.entries(n).every(([k,v])=>{
              if(!['id','type','position','data','measured','parent_id'].includes(k))return false;
              if(k==='parent_id'&&n.id===id&&['original-undo','original-redo'].includes(stage)&&v===''&&old.parent_id==null&&first.parent_id==null)return true;
              if(k==='data'&&n.id===id&&['original-undo','original-redo'].includes(stage)){
                if(same(v.id,old.data.id)&&same(v.lcos_ref,old.data.lcos_ref)
                  &&Object.entries(v).every(([key,value])=>same(value,old.data[key])&&same(value,first.data[key])))return true; // Original history sends a partial data echo (no derived title).
              }
              if(k==='measured'&&n.id===id&&same(v,{width:375,height:250}))return true; // Observed original image measurement, already supported by the facade.
              if(k!=='position')return same(v,old[k])&&same(v,first[k]);
              if(same(v,old.position))return true;
              return n.id===id&&stage!=='load'&&v&&Number.isFinite(v.x)&&Number.isFinite(v.y)
                &&v.x>=Math.min(initial.position.x,120)-2&&v.x<=initial.position.x+110&&v.y>=Math.min(initial.position.y,100)-2&&v.y<=initial.position.y+100;
            });
          }));
        row.positions=body?.actions?.flatMap(a=>a.updates??[]).filter(n=>n.position&&!same(n.position,current.nodes.find(x=>x.id===n.id)?.position)).map(n=>({id:n.id,position:n.position}));
      }
      if(!row.permitted){row.differences=body?.actions?.flatMap(a=>a.updates??[]).map(n=>({id:n.id,fields:Object.keys(n),
        changed:Object.entries(n).filter(([k,v])=>!same(v,before.nodes.find(x=>x.id===n.id)?.[k])).map(([k,v])=>({field:k,
          ...(k==='data'?{dataFields:Object.keys(v??{}).filter(field=>!same(v[field],before.nodes.find(x=>x.id===n.id)?.data?.[field])),missingDataFields:Object.keys(before.nodes.find(x=>x.id===n.id)?.data??{}).filter(field=>!Object.hasOwn(v??{},field))}:{}),
          ...(k==='position'||k==='measured'||k==='parent_id'?{value:v,before:before.nodes.find(x=>x.id===n.id)?.[k]}:{})}))}));await save();return route.abort();}
    }
    if(u.pathname==='/lcos/agent-ui.js'){
      const r=await route.fetch({timeout:120000});return route.fulfill({response:r,body:await r.text()+'\nwindow.__MAIN_DRAG_READ__=()=>{const c=useCanvasStore.getState(),s=useLcosShellStore.getState();return{canvas:c.canvasId,status:c.status,nodes:c.nodes,viewport:c.rfInstance?.getViewport(),prompt:s.composerPrompt,target:s.composerTarget,refs:useLcosReferenceStore.getState().draft.orderedEntityRefs,windows:s.windows}};'});
    }
    return route.continue();
  });
  await context.routeWebSocket('**/*',socket=>{const u=new URL(socket.url());report.webSockets.push({stage,protocol:u.protocol,origin:u.origin,path:u.pathname});socket.close();});
  page=await context.newPage();page.setDefaultTimeout(30000);page.on('pageerror',e=>report.errors.push(String(e)));
  page.on('response',r=>{if(r.status()>=400)report.httpErrors.push({path:new URL(r.url()).pathname,status:r.status()});});
  const read=()=>page.evaluate(()=>window.__MAIN_DRAG_READ__());
  const shot=async name=>{const file=path.join(output,name+'.png');await page.screenshot({path:file});report.screenshots.push(file);await save();};
  const open=async()=>{
    await page.goto(origin+'/canvas/'+canvasId,{waitUntil:'domcontentloaded',timeout:120000});
    await page.waitForFunction(id=>window.__MAIN_DRAG_READ__?.().canvas===id&&window.__MAIN_DRAG_READ__?.().status==='ready',canvasId,{timeout:120000});
    await page.locator('[data-lcos-professional-surface-state=ready]').waitFor({state:'attached',timeout:120000});
    await page.getByTestId('common-loading-overlay').waitFor({state:'hidden',timeout:60000});
    assert.equal(await page.locator('vite-error-overlay').count(),0);
    await page.evaluate(async id=>{const api=window.__LCOS_NODE_LAB__?.api;if(!api?.fitView)throw Error('Original camera unavailable');await api.fitView({nodes:[{id}],padding:.8,minZoom:.6,maxZoom:.8,duration:0});},id);
  };
  const source=async()=>page.locator('.react-flow__node[data-id="'+id+'"]').evaluate((e,id)=>{
    const r=e.getBoundingClientRect();for(const y of [.35,.5,.65])for(const x of [.3,.5,.7]){
      const p={x:r.x+r.width*x,y:r.y+r.height*y},t=document.elementFromPoint(p.x,p.y);
      if(t?.tagName==='IMG'&&t.closest('.react-flow__node')?.getAttribute('data-id')===id&&!t.closest('.nodrag,button,input,textarea,a,[role=dialog]'))return{...p,hit:t.tagName,
        nodeClass:e.className,nodeDraggable:e.classList.contains('draggable'),imageDraggable:t.draggable,pointerEvents:getComputedStyle(t).pointerEvents,
        rect:{x:r.x,y:r.y,width:r.width,height:r.height}};
    }return null;
  },id);
  cleanupPosition=async()=>{
    const target={x:120,y:100},currentCanvas=await get(canvasRoute),current=currentCanvas.nodes.find(n=>n.id===id);
    report.cleanup={required:!same(current?.position,target),attempted:false,restored:false,target};
    assert.ok(current&&same(current.data.lcos_ref,initial.data.lcos_ref),'Cleanup cannot act on a replaced PNG identity');
    assert.equal((await get('/health')).pid,expectedPid,'Cleanup cannot continue into another runtime');
    if(!same(current.position,target)){
      const ownPositions=report.writes.flatMap(row=>row.permitted?row.positions??[]:[]).filter(row=>row.id===id).map(row=>row.position);
      assert.ok(ownPositions.some(value=>same(value,current.position)),'Unexpected placement is not owned by this test; preserve it for review');
      report.cleanup.attempted=true;await open();
      const live=await read();assert.equal(live.canvas,canvasId);assert.equal(live.status,'ready');
      const start=await source();assert.ok(start?.nodeDraggable,'Cleanup needs an unobstructed original draggable IMG');
      const zoom=live.viewport.zoom;let pointer={x:start.x,y:start.y};
      stage='cleanup-original-left-drag';await page.mouse.move(pointer.x,pointer.y);await page.mouse.down();
      try{
        for(let attempt=0;attempt<4;attempt++){
          const node=(await read()).nodes.find(n=>n.id===id);assert.ok(node&&same(node.data.lcos_ref,initial.data.lcos_ref));
          if(same(node.position,target))break;
          pointer={x:pointer.x+(target.x-node.position.x)*zoom,y:pointer.y+(target.y-node.position.y)*zoom};
          await page.mouse.move(pointer.x,pointer.y,{steps:24});
          await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
        }
      }finally{await page.mouse.up();}
      let saved;
      for(let attempt=0;attempt<12;attempt++){saved=(await get(canvasRoute)).nodes.find(n=>n.id===id);if(same(saved?.position,target))break;await page.waitForTimeout(200);}
      assert.deepEqual(saved?.position,target,'Original mouse cleanup must persist the exact120,100');
      await shot('05-cleanup-original-position');
    }
    const final=await get(canvasRoute);assert.deepEqual(final.nodes.find(n=>n.id===id)?.position,target);
    const finalFacts=await facts();report.cleanup.factsUnchanged=same(finalFacts,factsBefore);assert.ok(report.cleanup.factsUnchanged,'Cleanup changed Core facts');
    for(const old of before.nodes){const next=final.nodes.find(n=>n.id===old.id);
      assert.deepEqual(next,old.id===id?{...old,position:target,measured:{width:375,height:250}}:old);}
    assert.deepEqual(final.connections,before.connections);report.cleanup.restored=true;
  };
  await open();const stateBefore=await read();report.stateBefore={...stateBefore,nodes:undefined};await shot('01-before');
  const drag=async()=>{
    const start=await source();assert.ok(start,'Unobstructed original image face required');const zoom=(await read()).viewport.zoom;
    const delta=restoring?{x:(120-initial.position.x)*zoom,y:(100-initial.position.y)*zoom}:{x:64,y:48};
    stage='original-left-drag';report.pointer={start,deltaScreen:delta,zoom};
    await page.mouse.move(start.x,start.y);await page.mouse.down();
    try{await page.mouse.move(start.x+delta.x,start.y+delta.y,{steps:24});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
      if(restoring){const at=(await read()).nodes.find(n=>n.id===id).position;await page.mouse.move(start.x+delta.x+(120-at.x)*zoom,start.y+delta.y+(100-at.y)*zoom);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));}
      report.during=(await read()).nodes.find(n=>n.id===id);}finally{await page.mouse.up();}
    await page.waitForTimeout(1800);report.afterDrag=(await get(canvasRoute)).nodes.find(n=>n.id===id);await shot('02-after-original-left-drag');
  };
  await drag();
  if(restoring){assert.deepEqual(report.afterDrag.position,{x:120,y:100});report.checks.push('Actual original mouse drag restores pre-investigation position; no hidden setter');}
  else if(mode==='before'){
    assert.deepEqual(report.afterDrag.position,initial.position,'Reproduce: original mouse drag is swallowed by Pile member guard');
    assert.deepEqual(report.during.position,initial.position);report.checks.push('Actual original left mouse drag leaves both rendered and saved image position unchanged');
  }else{
    const moved=report.afterDrag.position;assert.ok(moved.x>initial.position.x+40&&moved.y>initial.position.y+20,'Original mouse drag must move and save the real image');
    report.checks.push('Original mouse drag moves and persists the exact existing image');
    stage='original-undo';await page.keyboard.press('Control+z');await page.waitForTimeout(1400);
    assert.deepEqual((await get(canvasRoute)).nodes.find(n=>n.id===id).position,initial.position);report.checks.push('Original Undo restores initial saved position');
    stage='original-redo';await page.keyboard.press('Control+Shift+z');await page.waitForTimeout(1400);
    assert.deepEqual((await get(canvasRoute)).nodes.find(n=>n.id===id).position,moved);report.checks.push('Original Redo restores mouse result');await shot('03-redo');
    stage='original-undo';await page.keyboard.press('Control+z');await page.waitForTimeout(1400);
    assert.deepEqual((await get(canvasRoute)).nodes.find(n=>n.id===id).position,initial.position);
    stage='load';await open();assert.deepEqual((await read()).nodes.find(n=>n.id===id).position,initial.position);
    report.checks.push('Reload reads the restored saved image without temporary geometry setters');await shot('04-reloaded-original-position');
  }
  const after=await get(canvasRoute),factsAfter=await facts();assert.deepEqual(factsAfter,factsBefore);
  for(const old of before.nodes){const next=after.nodes.find(n=>n.id===old.id);
    if(old.id===id&&mode==='after')assert.deepEqual(next,{...old,measured:{width:375,height:250},...(restoring?{position:{x:120,y:100}}:{})});
    else assert.deepEqual(next,old);
  }assert.deepEqual(after.connections,before.connections);
  const stateAfter=await read();for(const field of ['prompt','target','refs','windows'])assert.deepEqual(stateAfter[field],stateBefore[field]);
  assert.ok(report.writes.every(w=>w.permitted),'Unexpected writes were blocked');assert.deepEqual(report.errors,[]);
  report.checks.push('All Collection memberships, Core identities, bindings, other nodes, connections, messages and Run truth unchanged');report.passed=true;
}catch(error){report.error=String(error.stack??error);if(page){report.body=await page.locator('body').innerText().catch(()=>null);await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});}process.exitCode=1;}
finally{
  try{if(cleanupPosition)await cleanupPosition();}catch(error){report.passed=false;process.exitCode=1;report.cleanup={...report.cleanup,error:String(error.stack??error)};}
  await save();await browser.close();
}
console.log(JSON.stringify({passed:report.passed,output,checks:report.checks,pointer:report.pointer,during:report.during?.position,afterDrag:report.afterDrag?.position,cleanup:report.cleanup,blockedWrites:report.writes.filter(w=>!w.permitted),errors:report.errors,error:report.error},null,2));
