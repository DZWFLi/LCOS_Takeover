import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {isDeepStrictEqual as same} from 'node:util';
import {currentGen2Root} from '../lab/current-gen2-resources.mjs';
const expectedPid=Number(process.argv.find(v=>v.startsWith('--expected-pid='))?.split('=')[1]);assert.ok(Number.isSafeInteger(expectedPid)&&expectedPid>0);
const origin='http://127.0.0.1:56311',canvasId='surface-core-main',routePath='/api/canvas/v1/canvases/'+canvasId;
const output=path.resolve('output/原加号菜单未接入口收起_20261026/实屏',new Date().toISOString().replaceAll(':','-'));await fs.mkdir(output,{recursive:true});
const report={passed:false,output,panels:[],writes:[],errors:[],checks:[],modelSends:0,newRuns:0};
const get=async p=>{const r=await fetch(origin+p);assert.ok(r.ok);const d=await r.json();return d.data??d.value??d;};
assert.equal((await get('/health')).pid,expectedPid);report.pid=expectedPid;
const before=await get(routePath),prefix='/api/lcos/core/projects/disposable-surface-core-facade';
const facts=async()=>({graph:await get(prefix+'/graph'),execution:await get(prefix+'/execution-projection'),bindings:await get(prefix+'/spatial/bindings'),messages:await get(prefix+'/conversations/conversation-08d78311-43d1-4be1-97c5-52d5442839f4/messages?limit=1000')});
const factsBefore=await facts();const {chromium}=createRequire(path.join(currentGen2Root,'package.json'))('playwright-core');
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-networking','--disable-sync','--no-first-run']});
try{
  for(const width of [1500,360]){
    const context=await browser.newContext({viewport:{width,height:1000},locale:'zh-CN',serviceWorkers:'block'});
    await context.route('**/*',async route=>{
      const req=route.request(),u=new URL(req.url());if(u.origin!==origin)return route.abort();
      if(!['GET','HEAD','OPTIONS'].includes(req.method())){
        let body;try{body=req.postDataJSON()}catch{}
        let permitted=req.method()==='POST'&&(u.pathname==='/api/events'||/^\/api\/lcos\/canvases\/surface-core-(main|context|workflow)\/(execution|conversations):reconcile$/.test(u.pathname)&&same(body,{}));
        if(req.method()==='POST'&&u.pathname===routePath+'/nodes:batchActions')permitted=body?.canvas_id===canvasId&&!body.lcos_operation&&body.actions?.every(a=>a.action==='update'&&a.updates?.every(n=>{const old=before.nodes.find(x=>x.id===n.id);return old&&Object.entries(n).every(([k,v])=>['id','type','position','data','measured'].includes(k)&&same(v,old[k]));}));
        report.writes.push({method:req.method(),path:u.pathname,permitted});if(!permitted)return route.abort();
      }return route.continue();
    });await context.routeWebSocket('**/*',s=>s.close());
    const page=await context.newPage();page.on('pageerror',e=>report.errors.push(String(e)));
    await page.goto(origin+'/canvas/'+canvasId,{waitUntil:'domcontentloaded',timeout:120000});
    await page.locator('[data-lcos-professional-surface-state=ready]').waitFor({state:'attached',timeout:120000});
    await page.getByTestId('common-loading-overlay').waitFor({state:'hidden',timeout:60000});
    await page.getByTestId('canvas-dockbar-add-node-btn').click();
    const menu=page.getByRole('dialog').filter({visible:true});
    await menu.getByText('添加节点',{exact:true}).waitFor();
    for(const label of ['文本','上传','添加智能体拖到画布，开始新对话']){
      if(label.startsWith('添加智能体'))await page.getByRole('button',{name:'添加智能体：拖到画布或点击放置'}).waitFor();
      else await menu.getByText(label,{exact:true}).waitFor();
    }
    for(const label of ['图片','视频','音频','3D','剪辑时间线','3D 片场','图片编辑器','辅助工具'])assert.equal(await menu.getByText(label,{exact:true}).filter({visible:true}).count(),0,label+' has no unsupported creation entry');
    assert.equal(await page.getByRole('button',{name:'刷新智能体形象',exact:true}).isVisible(),true);
    await page.waitForFunction(()=>[...document.querySelectorAll('[role=dialog]')].some(element=>{
      const r=element.getBoundingClientRect();if(!r.width||!r.height)return false;
      for(let e=element;e instanceof HTMLElement;e=e.parentElement)if(Number(getComputedStyle(e).opacity)<.99)return false;
      return true;
    }));
    const file=path.join(output,'add-menu-'+width+'.png');await page.screenshot({path:file});
    report.panels.push({width,screenshot:file,body:await page.locator('body').innerText(),canvasWidth:await page.locator('.react-flow').evaluate(e=>e.getBoundingClientRect().width)});
    await page.keyboard.press('Escape');await context.close();
  }
  assert.deepEqual(await get(routePath),before);assert.deepEqual(await facts(),factsBefore);assert.ok(report.writes.every(r=>r.permitted));assert.deepEqual(report.errors,[]);
  report.checks.push('1500px and fresh 360px original plus menu retain text/upload/Glyth creation and refresh',
    'Seven unavailable empty-media/editor creation rows and their empty helper section are absent',
    'Original Canvas nodes, geometry, materials, Core memberships, execution truth and all 28 messages unchanged');report.passed=true;
}catch(error){report.error=String(error.stack??error);process.exitCode=1;}
finally{await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify({passed:report.passed,output,checks:report.checks,panels:report.panels.map(p=>({width:p.width,canvasWidth:p.canvasWidth})),blockedWrites:report.writes.filter(r=>!r.permitted),errors:report.errors,error:report.error},null,2));
