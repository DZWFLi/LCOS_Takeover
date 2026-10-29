import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import { projectNativeNavigationMarker as project, clusterNativeNavigationMarkers as cluster } from '../lab/pilot/native-navigation-geometry.ts';

const safe = {left:0,top:0,right:400,bottom:300};
const rect = (left,top,right=left+80,bottom=top+80) => ({left,top,right,bottom});
const marker = (targetRect, extra={}) => project({id:'target',targetRect,safeRect:safe,...extra});
const hit = m => ({left:m.x-22,top:m.y-22,right:m.x+22,bottom:m.y+22});
const overlaps = (a,b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
const within = (m,r=safe) => {const h=hit(m); assert.ok(h.left>=r.left&&h.right<=r.right&&h.top>=r.top&&h.bottom<=r.bottom,JSON.stringify({m,r}));};
const synthetic = (id,edge,x,y,angle=0,phase='edge') => ({id,edge,x,y,angle,phase,progress:phase==='edge'?1:0});

test('local full 44px hit area sits outside the target content',()=>{
  const target=rect(80,40,100,80), result=marker(target);
  assert.equal(result.phase,'local'); assert.equal(result.progress,0); assert.equal(result.x,128); assert.equal(result.y,62);
  assert.ok(!overlaps(hit(result),target)); within(result);
  assert.equal(result.angle,Math.atan2(60-result.y,90-result.x));
});
test('four edges preserve hit size, direction and one output',()=>{
  for(const [edge,target] of [['left',rect(-200,80,-100,160)],['right',rect(500,100,600,180)],['top',rect(100,-200,180,-100)],['bottom',rect(100,400,180,480)]]){
    const result=marker(target); assert.equal(result.edge,edge); assert.equal(result.phase,'edge'); assert.equal(result.progress,1); within(result);
    assert.equal(result.angle,Math.atan2((target.top+target.bottom)/2-result.y,(target.left+target.right)/2-result.x));
    assert.ok(!Array.isArray(result));
  }
});
test('four corners remain within the same safe area',()=>{
  for(const target of [rect(-400,-300),rect(700,-300),rect(-400,600),rect(700,600)]){
    const result=marker(target); assert.equal(result.phase,'edge'); within(result);
    assert.ok(['left','right','top','bottom'].includes(result.edge));
  }
});
test('an unavailable right anchor switches local side, not target visibility; the still-safe previous side is stable',()=>{
  const right=marker(rect(280,100,350,170)); assert.equal(right.phase,'local'); assert.equal(right.edge,'right');
  const crossed=marker(rect(280,100,350.01,170),{previousMarker:right});
  assert.equal(crossed.phase,'local'); assert.equal(crossed.progress,0); assert.equal(crossed.edge,'left');
  const restored=marker(rect(280,100,349.99,170),{previousMarker:crossed,previousPhase:'edge'});
  assert.equal(restored.phase,'local'); assert.equal(restored.edge,'left'); assert.equal(restored.progress,0);
  assert.ok(!overlaps(hit(restored),rect(280,100,349.99,170))); within(restored);
  const moved=marker(rect(260,110,329.99,180),{previousMarker:restored});
  assert.equal(moved.edge,'left'); assert.equal(moved.x,restored.x-20); assert.equal(moved.y,restored.y+10,'old side follows target instead of freezing a screen point');
  const invalidPrior=marker(rect(280,100,349.99,170),{previousMarker:{...crossed,x:NaN}});
  assert.equal(invalidPrior.edge,'right','invalid previous geometry cannot select a side');
  assert.equal(marker(rect(280,100,349.99,170),{previousMarker:{...crossed,id:'different-target'}}).edge,'right');
});
test('real 06 return geometry keeps the 98 percent visible target local on its safe left side',async()=>{
  const report=JSON.parse(await fs.readFile('output/原生固定目录_20261026/2026-10-25T22-32-46-851Z/report.json','utf8'));
  const node=report.targets.find(row=>row.canvasId==='surface-core-main').node,view=report.savedDirectory.viewport;
  const target=rect(view.x+node.position.x*view.zoom,view.y+node.position.y*view.zoom,
    view.x+(node.position.x+node.measured.width)*view.zoom,view.y+(node.position.y+node.measured.height)*view.zoom);
  const safeRect={...report.navigationClipChecks.find(row=>row.label==='context-right-rail-arrival').clip,top:8,bottom:992};
  assert.deepEqual(target,rect(540.75,337.5,1028.25,662.5)); assert.equal(target.right-safeRect.right,8.25);
  const result=project({id:node.id,targetRect:target,safeRect,previousPhase:'edge',
    previousMarker:synthetic(node.id,'right',998,359.5,0,'edge')});
  assert.equal(result.phase,'local'); assert.equal(result.edge,'left'); assert.equal(result.progress,0);
  assert.deepEqual(hit(result),rect(490.75,337.5,534.75,381.5)); assert.ok(!overlaps(hit(result),target)); within(result,safeRect);
  assert.equal(result.angle,Math.atan2(500-result.y,784.5-result.x)); assert.equal(hit(result).right,target.left-6);
});
test('slight clipping at every edge and corner stays local outside the target, while true separation makes an arrow',()=>{
  for(const target of [rect(-5,100,75,180),rect(325,100,405,180),rect(100,-5,180,75),rect(100,225,180,305),
    rect(-5,-5,75,75),rect(325,-5,405,75),rect(-5,225,75,305),rect(325,225,405,305)]){
    const result=marker(target,{previousPhase:'edge'}); assert.ok(result); assert.equal(result.phase,'local'); assert.equal(result.progress,0);
    assert.ok(!overlaps(hit(result),target)); within(result);
  }
  for(const target of [rect(-80,100,0,180),rect(400,100,480,180),rect(100,-80,180,0),rect(100,300,180,380)]){
    const result=marker(target); assert.equal(result.phase,'edge'); assert.equal(result.progress,1); within(result);
    assert.equal(result.angle,Math.atan2((target.top+target.bottom)/2-result.y,(target.left+target.right)/2-result.x));
  }
  const previous=marker(rect(390,100,470,180)),outside=marker(rect(400,100,480,180),{previousMarker:previous});
  assert.equal(previous.phase,'local'); assert.equal(outside.phase,'edge');
  const back=marker(rect(390,100,470,180),{previousMarker:outside,previousPhase:'edge'});
  assert.equal(back.phase,'local'); assert.equal(back.edge,'left'); assert.deepEqual(back,previous);
  assert.equal(marker(rect(-1000,-200,2000,-100)).edge,'top','wide offscreen target belongs above, regardless of its upper-right corner');
});
test('visible huge targets and blocked local sides report no slot instead of covering the target with an arrow',()=>{
  for(const target of [rect(-100,-100,500,400),rect(1,1,399,299),rect(-5,-5,405,305)])
    assert.equal(marker(target,{previousPhase:'edge'}),undefined);
  const target=rect(150,100,250,220),first=marker(target);
  const moved=marker(target,{previousMarker:first,obstacles:[rect(260,90,300,180),rect(90,80,140,240)]});
  assert.equal(moved.phase,'local'); assert.equal(moved.edge,'top'); assert.ok(!overlaps(hit(moved),target)); within(moved);
  assert.equal(marker(target,{previousMarker:first,obstacles:[safe]}),undefined);
});
test('obstacles move on the same edge and clear original controls',()=>{
  const obstacle=rect(340,80,400,170), original=marker(rect(500,100,600,180));
  const result=marker(rect(500,100,600,180),{obstacles:[obstacle]});
  assert.equal(result.edge,'right'); assert.equal(result.x,original.x); assert.notEqual(result.y,original.y);
  assert.ok(!overlaps(hit(result),obstacle)); assert.ok(result.y+22<=obstacle.top-4||result.y-22>=obstacle.bottom+4); within(result);
  const target=rect(80,40,100,80), local=marker(target,{obstacles:[rect(100,40,160,100)]});
  assert.equal(local.phase,'local'); assert.equal(local.y,62); assert.ok(!overlaps(hit(local),target)); assert.ok(!overlaps(hit(local),rect(100,40,160,100)));
});
test('overlapping obstacles merge and a blocked edge asks the caller to aggregate',()=>{
  const target=rect(500,100,600,180);
  assert.equal(marker(target,{obstacles:[rect(340,0,400,150),rect(340,140,400,300)]}),undefined);
  assert.equal(marker(target,{obstacles:[rect(340,0,400,300)]}),undefined);
});
test('narrow safe rectangles fail without shrinking a hit area',()=>{
  for(const r of [rect(0,0,43,300),rect(0,0,400,43)])assert.equal(marker(rect(500,100),{safeRect:r}),undefined);
  const r=rect(0,0,44,44), result=marker(rect(500,100),{safeRect:r}); assert.ok(result); within(result,r);
  assert.equal(marker(rect(500,100),{safeRect:r,obstacles:[r]}),undefined);
});
test('invalid and NaN input never emits invalid marker geometry',()=>{
  for(const target of [rect(NaN,0),rect(0,Infinity),rect(10,10,9,20),rect(-1e308,0,1e308,20),rect(0,0,0,10),rect(0,0,10,0)])assert.equal(marker(target),undefined);
  assert.equal(marker(rect(0,0),{id:''}),undefined); assert.equal(marker(rect(0,0),{safeRect:rect(0,NaN)}),undefined);
  assert.equal(project(undefined),undefined);
  assert.deepEqual(marker(rect(500,100),{obstacles:[rect(NaN,0)]}),marker(rect(500,100)));
});
test('projection is deterministic, does not mutate input, and keeps hit areas safe over a screen grid',()=>{
  const input={id:'grid',targetRect:rect(500,100),safeRect:safe,obstacles:[rect(330,50,400,80)]}, before=structuredClone(input);
  assert.deepEqual(project(input),project(input)); assert.deepEqual(input,before);
  for(let left=-500;left<=700;left+=100)for(let top=-400;top<=600;top+=100){
    const result=marker(rect(left,top),{obstacles:[rect(170,0,230,50),rect(300,240,400,300)]});
    if(result){within(result); assert.ok(Number.isFinite(result.angle)); for(const o of [rect(170,0,230,50),rect(300,240,400,300)])assert.ok(!overlaps(hit(result),o));
      const target=rect(left,top),visible=overlaps(target,safe);assert.equal(result.phase,visible?'local':'edge');if(visible)assert.ok(!overlaps(hit(result),target));}
  }
});
test('same-edge adjacent markers cluster with exact members; unrelated edges and local pins stay individual',()=>{
  const a=synthetic('a','right',378,100),b=synthetic('b','right',378,130),c=synthetic('c','right',378,220),d=synthetic('d','top',378,22),e=synthetic('e','right',378,110,0,'local');
  const groups=cluster([c,e,b,d,a]), pair=groups.find(g=>g.members.length===2);
  assert.deepEqual(pair.members,[a,b]); assert.equal(pair.members[0],a); assert.equal(pair.x,378); assert.equal(pair.y,100); assert.equal(pair.edge,'right');
  assert.equal(groups.length,4); assert.equal(groups.find(g=>g.id==='e').phase,'local');
  assert.deepEqual(cluster([b,a]),cluster([a,b]));
});
test('opposite directions cannot mix, including chained near-angle neighbours and permissive options',()=>{
  const a=synthetic('a','top',100,22,0), b=synthetic('b','top',120,22,Math.PI/3), c=synthetic('c','top',140,22,Math.PI*2/3), opposite=synthetic('o','top',110,22,Math.PI);
  assert.equal(cluster([a,opposite],{maxAngle:Math.PI}).length,2);
  assert.equal(cluster([a,b,c],{maxAngle:Math.PI/2}).length,2);
  const wrap=cluster([synthetic('w1','left',22,100,Math.PI-0.02),synthetic('w2','left',22,120,-Math.PI+0.02)]);
  assert.equal(wrap.length,1); assert.ok(Math.abs(Math.abs(wrap[0].angle)-Math.PI)<0.02);
});
test('clustering skips invalid/duplicate IDs, handles options and does not mutate members',()=>{
  const a=synthetic('a','right',378,100),b=synthetic('b','right',378,130),before=structuredClone([a,b]);
  assert.equal(cluster([a,b],{maxGap:10}).length,2); assert.equal(cluster([a,b],{maxGap:NaN,maxAngle:NaN}).length,1);
  assert.equal(cluster([a,{...a,y:120},{...b,x:NaN},null]).length,1); assert.deepEqual(cluster(undefined),[]);
  cluster([a,b]);assert.deepEqual([a,b],before);
});

test('a cluster keeps a real unblocked member position instead of averaging across a control',()=>{
  const obstacle=rect(340,80,400,170);
  const a=marker(rect(500,50,600,130),{id:'above',obstacles:[obstacle]});
  const b=marker(rect(500,180,600,260),{id:'below',obstacles:[obstacle]});
  const groups=cluster([a,b],{maxGap:300}); assert.equal(groups.length,1);
  assert.ok(groups[0].members.some(m=>m.x===groups[0].x&&m.y===groups[0].y));
  assert.ok(!overlaps(hit(groups[0]),obstacle));within(groups[0]);
});
