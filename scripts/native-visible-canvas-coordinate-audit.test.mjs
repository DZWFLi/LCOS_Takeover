import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { currentGen2Root } from '../lab/current-gen2-resources.mjs';

// Execute the actual shared area/locate functions against controlled DOM/API
// facts. No browser, Core, camera, file data or application state is touched.
const ts = createRequire(path.join(currentGen2Root, 'package.json'))('typescript');
const source = await fs.readFile('lab/pilot/native-material-placement-client.ts', 'utf8');
const parsed = ts.createSourceFile('actual-placement.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
assert.equal(parsed.parseDiagnostics.length, 0);
const names = ['visibleCanvas', 'materialOutsideVisible', 'locateNativeMaterialNodes'];
const actual = names.map(name => {
  const declarations = parsed.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.equal(declarations.length, 1); return declarations[0].getText(parsed).replace(/^export\s+/, '');
}).join('\n');
const compiled = ts.transpileModule(actual, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
const rect = (left, top, right, bottom) => ({ left, top, right, bottom, width: right - left, height: bottom - top });
const element = box => ({ getBoundingClientRect: () => box, getAttribute: () => null, checkVisibility: () => true });
function create(paneBox, panelBoxes) {
  const document = { querySelector: () => element(paneBox), querySelectorAll: () => panelBoxes.map(element) };
  return new Function('document', compiled + '\nreturn {visibleCanvas,materialOutsideVisible,locateNativeMaterialNodes};')(document);
}
const rail = rect(15, 332, 69, 670), chat = rect(1020, 0, 1500, 1000);
const docked = create(rect(0,0,1020,1000), [rail,chat]);
const overlaid = create(rect(0,0,1500,1000), [rail,chat]);
assert.deepEqual(docked.visibleCanvas(), { left:69,right:1020,top:0,bottom:1000 });
assert.deepEqual(overlaid.visibleCanvas(), docked.visibleCanvas(), 'an already-narrowed original pane never loses a second chat width');
assert.deepEqual(create(rect(336,0,1020,1000),[rect(0,0,336,1000),chat]).visibleCanvas(),
  {left:336,right:1020,top:0,bottom:1000}, 'already-reserved left Library is not subtracted again');
assert.deepEqual(create(rect(0,0,360,400),[rect(0,400,360,820)]).visibleCanvas(), {left:0,right:360,top:0,bottom:400});
assert.deepEqual(create(rect(0,0,360,820),[rect(0,400,360,820)]).visibleCanvas(), {left:0,right:360,top:0,bottom:400});

const node = {id:'image',position:{x:120,y:100},width:375,height:250}; let captured;
const api = { getNodes:()=>[node], getNodesBounds:()=>({...node.position,width:375,height:250}),
  async setViewport(value) { captured=value; return true; },
  getViewport:()=>captured, flowToScreenPosition:point=>({x:captured.x+point.x*captured.zoom,y:captured.y+point.y*captured.zoom}) };
assert.equal(await docked.locateNativeMaterialNodes(['image'],{api,isCurrent:()=>true}),true);
assert.deepEqual(captured,{zoom:1.3,x:144.75,y:207.5});
const point=api.flowToScreenPosition(node.position), imageBox=rect(point.x,point.y,point.x+node.width*captured.zoom,point.y+node.height*captured.zoom);
assert.deepEqual(imageBox,rect(300.75,337.5,788.25,662.5));
assert.equal(docked.materialOutsideVisible(api,node),false,'the image fully fits the actual existing visible area');

const safe=docked.visibleCanvas(), viewport=rect(0,0,1500,1000);
const oldInsets={top:Math.max(0,safe.top),right:Math.max(0,viewport.right-safe.right),bottom:Math.max(0,viewport.bottom-safe.bottom),left:Math.max(0,safe.left)};
const applyInsets=(wrapper,insets)=>({left:wrapper.left+insets.left,top:wrapper.top+insets.top,right:wrapper.right-insets.right,bottom:wrapper.bottom-insets.bottom});
const localWrapper=rect(0,0,1020,1000), oldClip=applyInsets(localWrapper,oldInsets), portalClip=applyInsets(viewport,oldInsets);
assert.equal(oldInsets.right,480); assert.deepEqual(oldClip,{left:69,top:0,right:540,bottom:1000});
assert.ok(imageBox.right>oldClip.right&&imageBox.right<safe.right,'clip, not the actual pane or locate, truncates the image halo');
assert.deepEqual(portalClip,safe,'the same existing viewport-coordinate clip is correct when its wrapper actually spans the viewport');
const localInsets={left:Math.max(0,safe.left-localWrapper.left),top:Math.max(0,safe.top-localWrapper.top),
  right:Math.max(0,localWrapper.right-safe.right),bottom:Math.max(0,localWrapper.bottom-safe.bottom)};
assert.deepEqual(applyInsets(localWrapper,localInsets),safe,'container-local clipping is mathematically valid but needs all positioned children converted too');
const shiftedWrapper=rect(320,0,1020,1000), screenPoint={x:815,y:360}, localPoint={x:screenPoint.x-shiftedWrapper.left,y:screenPoint.y-shiftedWrapper.top};
assert.deepEqual(localPoint,{x:495,y:360}); assert.equal(shiftedWrapper.left+screenPoint.x,1135,'screen left cannot be reused as local left under an offset containing block');

const donor=await fs.readFile('reference/tapnow-installed/resources/web/assets/page-Da_DfwiK.js','utf8');
assert.ok(donor.includes('className:"flex-1 min-w-0 relative bg-black [contain:paint]","data-canvas-container":"true"'));
const report=JSON.parse(await fs.readFile('output/原生固定目录_20261026/2026-10-25T22-24-23-659Z/report.json','utf8'));
assert.equal(report.passed,true); assert.equal(report.originalPointerActions.find(row=>row.stage==='pin-surface-core-context').rect.right,697.5);
console.log(JSON.stringify({passed:true,checks:[
  'actual visibleCanvas source returns right1020 for either an overlaid or already-layout-reserved chat panel, with no additive deduction',
  'actual locate source yields viewport144.75/207.5/1.3 and image300.75..788.25, matching the saved screenshot geometry; outsideVisible remains false',
  'old viewport-derived inset480 applied to a controlled1020-wide wrapper clips at540; the same inset applied to a1500-wide body layer clips correctly at1020',
  'container-local alternative needs local clip and every screen-position conversion; body portal preserves current screen-coordinate projection',
  'actual original contain:paint source and saved report are read-only evidence; wrapper1020 is a controlled numerical assumption, not a new DOM measurement',
],numerical:{visible:safe,locate:captured,imageBox,oldInsets,oldClip,portalClip},scope:'actual TS functions + saved source/report + controlled DOM/geometry; no browser/live API/camera/model/data writes'},null,2));
