import assert from 'node:assert/strict';

const area = (a,b) => a && b ? Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left)) * Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)) : 0;
const sameViewport = (a,b) => Math.abs(a.x-b.x)<1 && Math.abs(a.y-b.y)<1 && Math.abs(a.zoom-b.zoom)<.0001;
const frames = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

/** Actual original DOM/Range measurements and original mouse/keyboard actions.
 * No API camera setter, node edit, synthetic obstacle or model request. */
export async function runNativeNavigationVisualCases({ page, report, read, markers, target, receipt, openDirectory, closeEscape, choose, shot, setStage }) {
  const id = target.node.id, original = await read(), markerSelector = '[data-native-navigation-marker="'+id+'"]';
  const originalMarkerIds = (await markers()).map(row=>row.id).sort();
  const visual = report.visualPlacement = { passed:false, measurements:[], scroll:[], cases:[], notClaimed:[] };
  async function measure(label) {
    return page.evaluate(({id,label})=>{
      const bbox = element=>element.getBoundingClientRect().toJSON(), pane=document.querySelector('.react-flow'), layer=document.querySelector('[data-native-navigation-layer]');
      const wrapper=layer?.querySelector('.native-navigation-halos'), marker=layer?.querySelector('[data-native-navigation-marker="'+id+'"]'), api=window.__LCOS_NODE_LAB__.api;
      const p=bbox(pane), w=bbox(wrapper), tokens=/^inset\(([^)]+)\)$/.exec(getComputedStyle(wrapper).clipPath)?.[1].trim().split(/\s+/).map(parseFloat)??[];
      const inset=tokens.length===4?tokens:tokens.length===2?[tokens[0],tokens[1],tokens[0],tokens[1]]:[tokens[0],tokens[0],tokens[0],tokens[0]];
      const safe={left:w.left+inset[3],right:w.right-inset[1],top:w.top+inset[0]+8,bottom:w.bottom-inset[2]-8};
      const bounds=api.getNodesBounds([id]), at=api.flowToScreenPosition({x:bounds.x,y:bounds.y}), zoom=api.getViewport().zoom;
      const target={left:at.x,top:at.y,right:at.x+bounds.width*zoom,bottom:at.y+bounds.height*zoom};
      const shown=element=>element.checkVisibility?.({checkOpacity:true,checkVisibilityCSS:true})!==false;
      const clip=(box,container)=>({left:Math.max(box.left,container.left),right:Math.min(box.right,container.right),top:Math.max(box.top,container.top),bottom:Math.min(box.bottom,container.bottom)});
      const positive=box=>box.right>box.left&&box.bottom>box.top;
      const lines=[];
      for(const root of document.querySelectorAll('[data-native-first-text-body]')){
        if(!shown(root))continue;const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
        for(let text; (text=walker.nextNode());){
          const parent=text.parentElement;if(!text.textContent?.trim()||!parent||parent.closest('button,input,textarea,svg,script,style')||!shown(parent))continue;
          const range=document.createRange();range.selectNodeContents(text);let crop={...safe};
          for(let ancestor=parent;ancestor&&ancestor!==root.parentElement;ancestor=ancestor.parentElement){
            const css=getComputedStyle(ancestor);if(/auto|scroll|hidden|clip/.test(css.overflowX+' '+css.overflowY))crop=clip(crop,bbox(ancestor));
          }
          for(const box of range.getClientRects()){const visible=clip(box,crop);if(positive(visible))lines.push({nodeId:root.getAttribute('data-native-first-text-body'),kind:parent.closest('h1,h2,h3,h4,h5,h6,p,li')?.tagName??parent.tagName,box:visible});}
          range.detach();
        }
      }
      const chrome=[...document.querySelectorAll('.canvas-header-chrome,[data-lcos-surface-dock],[data-lcos-native-collapsed-assistant],[data-testid="canvas-dockbar-container"],[data-native-navigation-bottom-row],.react-flow__node-toolbar,[data-state="open"][role="dialog"],.native-navigation-feedback')]
        .filter(shown).map(element=>({kind:element.getAttribute('data-testid')??element.getAttribute('data-pile-gallery-chrome')??element.getAttribute('role')??element.className,box:bbox(element)}))
        .filter(row=>positive(clip(row.box,safe)));
      const box=marker&&bbox(marker),hit=box&&document.elementFromPoint(box.x+box.width/2,box.y+box.height/2);
      const intersection=clip(target,safe),visibleArea=positive(intersection)?(intersection.right-intersection.left)*(intersection.bottom-intersection.top):0;
      return{label,viewport:{width:innerWidth,height:innerHeight},pane:p,safe,target,visibleFraction:visibleArea/((target.right-target.left)*(target.bottom-target.top)),
        marker:box,phase:marker?.getAttribute('data-phase'),markerHit:!!hit&&marker.contains(hit),textLines:lines,chrome,
        fallbackTitle:document.querySelector('button[data-native-navigation-directory-trigger]')?.getAttribute('title'),
        camera:{...api.getViewport()}};
    },{id,label});
  }
  async function settled(label){
    let prior=await measure(label);
    for(let pass=0;pass<24;pass++){
      await frames(page);const next=await measure(label),a=prior.marker,b=next.marker;
      if(prior.phase===next.phase&&(!a&&!b||a&&b&&['x','y','width','height'].every(key=>Math.abs(a[key]-b[key])<.4))
        &&['left','right','top','bottom'].every(key=>Math.abs(prior.safe[key]-next.safe[key])<.4)
        &&sameViewport(prior.camera,next.camera))return next;
      prior=next;
    }
    throw Error(label+' actual navigation bounds did not settle');
  }
  async function check(label,{phase,visible,outside=false,allowMissing=false}={}){
    const value=await settled(label);visual.measurements.push(value);
    if(visible!==undefined)assert.equal(value.visibleFraction>0,visible,label+' target actually visible/offscreen');
    if(!value.marker){assert.equal(allowMissing,true,label+' should retain a real world marker');return value;}
    if(phase)assert.equal(value.phase,phase,label+' actual phase');
    assert.ok(value.marker.width>=44&&value.marker.height>=44,label+' full 44px button');assert.equal(value.markerHit,true,label+' real centre hit');
    assert.ok(value.marker.left>=value.safe.left-.5&&value.marker.right<=value.safe.right+.5&&value.marker.top>=value.safe.top-.5&&value.marker.bottom<=value.safe.bottom+.5,label+' entire hit area inside visible canvas');
    if(outside)assert.ok(area(value.marker,value.target)<.5,label+' complete hit area outside original image');
    const coveredText=value.textLines.filter(row=>area(value.marker,row.box)>.5),coveredChrome=value.chrome.filter(row=>area(value.marker,row.box)>.5);
    assert.deepEqual(coveredText,[],label+' does not cover actual H1/body lines');assert.deepEqual(coveredChrome,[],label+' does not cover original controls');
    return value;
  }
  async function assertStableState(before,label){const after=await read();assert.ok(sameViewport(after.viewport,before.viewport),label+' does not change camera');
    for(const key of ['prompt','refs','windows','workspace','canvas'])assert.deepEqual(after[key],before[key],label+' preserves '+key);}
  const collapse=page.getByRole('button',{name:'收起对话',exact:true}),ball=page.locator('[data-lcos-native-collapsed-assistant] button');
  const originallyOpen=await collapse.isVisible();
  setStage('visual-near-field');await closeEscape();
  const near=await check('main-return-nearly-visible',{phase:'local',visible:true,outside:true});
  assert.ok(near.visibleFraction>.95&&near.visibleFraction<1,'This real Main return is the existing approximately 98% visible case');
  visual.cases.push('Original Main return is nearly fully visible and stays local, with all 44px outside image');await shot('08-visible-near-field-pin');
  if(originallyOpen){const before=await read();await collapse.click();await page.locator('[data-lcos-native-collapsed-assistant]').waitFor();await check('right-rail-collapsed',{phase:'local',visible:true,outside:true});await assertStableState(before,'Original right rail collapse');
    await ball.click();await collapse.waitFor();await check('right-rail-reopened',{phase:'local',visible:true,outside:true});await assertStableState(before,'Original right rail reopen');}
  // Close the actual original assistant before testing narrow canvas controls.
  if(await collapse.isVisible())await collapse.click();
  for(const width of [360,320]){setStage('visual-reflow-'+width);const before=await read();await page.setViewportSize({width,height:820});
    const value=await check('actual-resize-'+width,{visible:false,phase:'edge'});await assertStableState(before,'Actual '+width+' resize');await shot('09-'+width+'-reflow-edge');
    assert.ok(value.chrome.length>0,'Real controls are measured at narrow size');}
  await page.setViewportSize({width:1500,height:1000});if(originallyOpen&&!await collapse.isVisible()){await ball.click();await collapse.waitFor();}
  await check('wide-restored-before-pan',{phase:'local',visible:true,outside:true});
  async function pan(dx,dy){
    const selection=await page.evaluate(({dx,dy})=>{
      const pane=document.querySelector('.react-flow').getBoundingClientRect(),tested=[];
      const minX=Math.max(pane.left+80,pane.left+80-dx),maxX=Math.min(pane.right-24,pane.right-24-dx);
      const minY=Math.max(pane.top+80,pane.top+80-dy),maxY=Math.min(pane.bottom-110,pane.bottom-110-dy);
      for(let y=maxY;y>=minY;y-=70)for(let x=maxX;x>=minX;x-=60){
        const hit=document.elementFromPoint(x,y),blocked=hit?.closest('.react-flow__node,button,input,textarea,[role="button"],.react-flow__controls,.react-flow__minimap,.canvas-header-chrome,[data-native-navigation-layer],[data-lcos-surface-dock]');
        const item={x,y,hit:hit?.tagName,className:typeof hit?.className==='string'?hit.className:'',blocked:!!blocked};tested.push(item);
        if(hit?.closest('.react-flow')&&!blocked)return{point:{x,y},tested};
      }return{point:null,tested};
    },{dx,dy});
    (visual.panBackgrounds??=[]).push(selection);
    const point=selection.point;assert.ok(point,'A real unoccluded original canvas background is required');const before=await read();
    await page.evaluate(id=>{
      const trace=window.__DIRECTORY_VISUAL_PAN_TRACE__={active:true,rows:[]};
      const capture=()=>{if(!trace.active||trace.rows.length>=240)return;
        const node=document.querySelector('.react-flow__node[data-id="'+id+'"]'),marker=document.querySelector('[data-native-navigation-marker="'+id+'"]'),wrapper=document.querySelector('.native-navigation-halos');
        if(node&&wrapper){const t=node.getBoundingClientRect(),w=wrapper.getBoundingClientRect(),v=/^inset\(([^)]+)\)$/.exec(getComputedStyle(wrapper).clipPath)?.[1].trim().split(/\s+/).map(parseFloat)??[],i=v.length===4?v:v.length===2?[v[0],v[1],v[0],v[1]]:[v[0],v[0],v[0],v[0]];
          trace.rows.push({at:performance.now(),target:t.toJSON(),marker:marker?.getBoundingClientRect().toJSON()??null,phase:marker?.getAttribute('data-phase'),safe:{left:w.left+i[3],right:w.right-i[1],top:w.top+i[0]+8,bottom:w.bottom-i[2]-8}});
        }requestAnimationFrame(capture);
      };requestAnimationFrame(capture);
    },id);
    await page.mouse.move(point.x,point.y);await page.mouse.down({button:'middle'});await page.mouse.move(point.x+dx,point.y+dy,{steps:24});await page.mouse.up({button:'middle'});await frames(page);
    const trace=await page.evaluate(()=>{window.__DIRECTORY_VISUAL_PAN_TRACE__.active=false;return window.__DIRECTORY_VISUAL_PAN_TRACE__.rows;});
    (visual.panFrames??=[]).push(trace);
    for(const frame of trace){const actuallyVisible=area(frame.target,frame.safe)>.5;
      if(actuallyVisible&&frame.marker){assert.equal(frame.phase,'local','Every painted pan frame with a visible target stays local');assert.ok(area(frame.marker,frame.target)<.5,'Every painted local Pin frame stays completely outside the real image');}
    }
    const after=await read();assert.ok(Math.abs(after.viewport.x-before.viewport.x)>20||Math.abs(after.viewport.y-before.viewport.y)>20,'Actual middle mouse changes camera');
  }
  setStage('visual-real-offscreen');
  for(let count=0;count<3;count++){const before=await settled('before-real-pan');if(before.target.right<0)break;await pan(-760,0);const value=await settled('after-real-pan');
    await check('real-pan-'+count,{phase:value.visibleFraction>0?'local':'edge',visible:value.visibleFraction>0,outside:value.visibleFraction>0});}
  const edge=await check('actually-offscreen-edge',{phase:'edge',visible:false});assert.ok(edge.target.right<0,'Original image is truly offscreen, not just clipped by a few pixels');
  visual.cases.push('Actual middle mouse moves target fully offscreen; edge avoids measured material text and original controls');await shot('10-real-offscreen-text-and-chrome');
  // Existing text only. A missing overflow fixture is recorded, never simulated
  // by changing node content, style, dimensions or a hidden scroll setter.
  const scrollCandidate=await page.evaluate(()=>{
    for(const root of document.querySelectorAll('[data-native-first-text-body]'))for(const element of [root,...root.querySelectorAll('*')]){
      const css=getComputedStyle(element),box=element.getBoundingClientRect();if(!/auto|scroll/.test(css.overflowY)||element.scrollHeight<=element.clientHeight+1||box.width<60||box.height<40)continue;
      const x=box.x+Math.min(30,box.width/2),y=box.y+Math.min(30,box.height/2),hit=document.elementFromPoint(x,y);
      if(hit&&element.contains(hit))return{nodeId:root.getAttribute('data-native-first-text-body'),path:[...root.querySelectorAll('*')].indexOf(element),top:element.scrollTop,client:element.clientHeight,content:element.scrollHeight,x,y};
    }return null;});
  if(scrollCandidate){const before=await read(),delta=scrollCandidate.top<scrollCandidate.content-scrollCandidate.client-1?180:-180;
    await page.mouse.move(scrollCandidate.x,scrollCandidate.y);await page.mouse.wheel(0,delta);await frames(page);
    const after=await page.evaluate(c=>{const root=document.querySelector('[data-native-first-text-body="'+c.nodeId+'"]'),element=c.path<0?root:root.querySelectorAll('*')[c.path];return{top:element.scrollTop,client:element.clientHeight,content:element.scrollHeight};},scrollCandidate);
    visual.scroll.push({before:scrollCandidate,after});assert.ok(after.top!==scrollCandidate.top,'Real wheel scrolls existing material internally');await check('after-real-material-scroll',{phase:'edge',visible:false});await assertStableState(before,'Internal material scroll');
    await page.mouse.wheel(0,scrollCandidate.top-after.top);await frames(page);
  }else visual.notClaimed.push('No reachable overflowing existing material at this camera; true internal-scroll placement remains unverified');
  // A real short canvas plus the original zoom slider creates a visible image
  // too large for any external 44px slot. No DOM obstruction is invented.
  setStage('visual-real-no-slot');if(await collapse.isVisible())await collapse.click();await page.setViewportSize({width:360,height:400});
  await openDirectory();await choose(receipt,target);
  const slider=page.locator('[data-native-navigation-zoom] [role="slider"]');await slider.waitFor();
  assert.ok(Number(await slider.getAttribute('aria-valuemax'))>=2,'Original slider must support 200%');
  for(let count=0;count<220;count++){const now=Number(await slider.getAttribute('aria-valuenow'));if(Math.abs(now-2)<.0001)break;await slider.press(now<2?'ArrowRight':'ArrowLeft');}
  assert.ok(Math.abs(Number(await slider.getAttribute('aria-valuenow'))-2)<.0001,'Only actual original slider keys set 200%');
  const noSlot=await settled('real-360x400-200percent');visual.measurements.push(noSlot);assert.ok(noSlot.visibleFraction>0,'No-slot image is still genuinely visible');
  assert.equal(noSlot.marker,null,'No fake edge appears for a still-visible image with no free outside slot');
  assert.match(noSlot.fallbackTitle??'',/图钉.*目录|目录.*图钉/,'Original directory trigger explains omitted world pin');
  assert.deepEqual((await markers()).map(row=>row.id).sort(),originalMarkerIds,'No-slot keeps exact persisted markers');
  await openDirectory();await page.locator('[data-native-navigation-directory-layout-notice]').waitFor();
  await page.locator('[data-native-navigation-directory-row="'+receipt.id+'"] .native-navigation-directory-row-main').waitFor();
  await shot('11-no-slot-original-directory');visual.cases.push('Real 360x400 and original 200% slider leave no external slot; exact target remains in original directory');
  setStage('visual-original-wide-restore');await page.setViewportSize({width:1500,height:1000});await choose(receipt,target);
  if(originallyOpen&&!await collapse.isVisible()){await ball.click();await collapse.waitFor();}
  // A second original locate records the current wide view; original Return
  // clears its temporary camera feedback and restores that same wide view.
  const priorArrival=(await read()).navigation.arrival?.until??0;await page.locator(markerSelector).click();
  const until=Date.now()+30000;let reached=false;while(Date.now()<until){const state=await read();if(!state.navigation.navigating&&(state.navigation.arrival?.until??0)>priorArrival){reached=true;break;}await frames(page);}
  assert.equal(reached,true,'Second actual original Pin locate completes before Return');
  const back=page.getByRole('button',{name:'返回原视角',exact:true});await back.waitFor();await back.click();
  await check('final-original-wide-view',{phase:'local',visible:true,outside:true});
  const final=await read();assert.ok(sameViewport(final.viewport,original.viewport),'Original wide camera restored through actual original navigation');
  for(const key of ['prompt','refs','windows','workspace','canvas'])assert.deepEqual(final[key],original[key],'Visual cases preserve '+key);
  assert.equal(await collapse.isVisible(),originallyOpen,'Original right rail visibility restored');
  assert.deepEqual((await markers()).map(row=>row.id).sort(),originalMarkerIds,'Visual cases retain both exact markers');
  await openDirectory();visual.passed=true;visual.cases.push('Original wide directory locate/Pin/Return restore source camera, input and right rail before exact UI cleanup');
}
