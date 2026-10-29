import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { readNativeNavigationObstacles as read, layoutNativeNavigationMarkers as layout,
  NATIVE_NAVIGATION_CHROME_SELECTOR, NATIVE_NAVIGATION_MATERIAL_TEXT_SELECTOR } from '../lab/pilot/native-navigation-obstacles.ts';
import { projectNativeNavigationMarker as project, clusterNativeNavigationMarkers as cluster } from '../lab/pilot/native-navigation-geometry.ts';

// Controlled DOM layout facade only: no browser, HTTP, live data or renderer.
// Selectors use actual original owners; text ranges supply wrapped line boxes,
// independently from element/card bounds, exactly as a browser Range does.
const bounds = (left, top, right, bottom) => ({ left, top, right, bottom, x: left, y: top, width: right - left, height: bottom - top });
const intersects = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
const hit = marker => bounds(marker.x - 22, marker.y - 22, marker.x + 22, marker.y + 22);
const descendants = root => root.children.flatMap(node => [node, ...(node.nodeType === 1 ? descendants(node) : [])]);
function matchesSimple(element, selector) {
  const tag = /^[a-zA-Z][\w-]*/.exec(selector)?.[0];
  if (tag && element.tagName.toLowerCase() !== tag.toLowerCase()) return false;
  for (const value of selector.matchAll(/\.([\w-]+)|\[([\w-]+)(?:="([^"]*)")?\]/g)) {
    if (value[1] && !element.classes.includes(value[1])) return false;
    if (value[2] && (!element.hasAttribute(value[2]) || value[3] !== undefined && element.getAttribute(value[2]) !== value[3])) return false;
  }
  return true;
}
function matches(element, selector) {
  return selector.split(',').some(item => {
    const parts = item.trim().split(/\s+/); let current = element;
    if (!matchesSimple(current, parts.pop())) return false;
    while (parts.length) { const part = parts.pop(); current = current.parentElement; while (current && !matchesSimple(current, part)) current = current.parentElement; if (!current) return false; }
    return true;
  });
}
class Element {
  nodeType = 1; children = []; parentElement = null;
  constructor(tag, attributes = {}, box = bounds(0, 0, 0, 0), styles = {}) {
    this.tagName = tag.toUpperCase(); this.attributes = attributes; this.classes = (attributes.class ?? '').split(/\s+/); this.box = box;
    this.styles = { display: 'block', visibility: 'visible', opacity: '1', overflow: 'visible', overflowX: '', overflowY: '', ...styles };
    this.offsetWidth = this.clientWidth = box.width; this.offsetHeight = this.clientHeight = box.height; this.clientLeft = this.clientTop = 0;
  }
  append(...nodes) { for (const node of nodes) { node.parentElement = this; this.children.push(node); } return this; }
  querySelectorAll(selector) { return descendants(this).filter(node => node.nodeType === 1 && matches(node, selector)); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  closest(selector) { for (let node = this; node; node = node.parentElement) if (matches(node, selector)) return node; return null; }
  matches(selector) { return matches(this, selector); }
  hasAttribute(name) { return Object.hasOwn(this.attributes, name); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  getBoundingClientRect() { return this.box; }
  checkVisibility() { return this.visibility !== false; }
}
class Text {
  nodeType = 3; parentElement = null;
  constructor(text, rectangles) { this.textContent = text; this.rectangles = rectangles; }
}
function fixture(width = 360, height = 820) {
  const body = new Element('body', {}, bounds(0, 0, width, height));
  const pane = new Element('main', { class: 'react-flow' }, bounds(0, 0, width, height), { overflow: 'hidden' }); body.append(pane);
  const counts = { ranges: 0, measured: [] };
  const document = { body, defaultView: { getComputedStyle: element => element.styles },
    querySelector: selector => body.querySelector(selector), querySelectorAll: selector => body.querySelectorAll(selector),
    createTreeWalker(root, show) { assert.equal(show, 4); const texts = descendants(root).filter(node => node.nodeType === 3); let i = 0; return { nextNode: () => texts[i++] ?? null }; },
    createRange() { let selected; return { selectNodeContents(node) { assert.equal(node.nodeType, 3); selected = node; },
      getClientRects() { counts.ranges++; counts.measured.push(selected); return selected.rectangles; }, detach() {} }; },
  };
  return { document, body, pane, counts, node(id = 'material', box = bounds(58.7, 196.2, 418.7, 476.2)) {
    const node = new Element('article', { class: 'react-flow__node', 'data-id': id }, box); pane.append(node); return node;
  } };
}
function textRoot(parent, className, text, boxes, attributes = {}, rootBox = boxes[0]) {
  const root = new Element('div', { class: className, ...attributes }, rootBox); root.append(new Text(text, boxes)); parent.append(root); return root;
}
const checks = [];
const source = await fs.readFile('reference/tapnow-installed/resources/web/assets/course-api-base-url-CifxI1ia.js', 'utf8');
assert.ok(source.includes('canvas-node-title')); assert.ok(source.includes('fn.CANVAS.NODE.TEXT.TEXT_CONTENT'));
const [constantSource, minimapSource] = await Promise.all([
  fs.readFile('reference/tapnow-installed/resources/web/assets/index-BAQXnPag.js', 'utf8'),
  fs.readFile('reference/tapnow-installed/resources/web/assets/UnlimitedModeToggle-D4wysAbz.js', 'utf8'),
]);
assert.ok(constantSource.includes('TEXT_CONTENT:"canvas-node-text-content"')); assert.ok(constantSource.includes('CONTAINER:"canvas-dockbar-container"'));
assert.ok(minimapSource.includes('"data-testid":"rf__minimap"'));
const [textSource, documentSource] = await Promise.all([
  fs.readFile('lcos/huabu/apps/web/src/lcos/nodes/LcosCanvasTextBody.tsx', 'utf8'),
  fs.readFile('lcos/huabu/apps/web/src/lcos/ui/source/DocumentSourceView.tsx', 'utf8'),
]);
assert.ok(textSource.includes('data-lcos-inline-text')); assert.ok(documentSource.includes('lcos-document-title'));
assert.ok(NATIVE_NAVIGATION_MATERIAL_TEXT_SELECTOR.includes('[data-testid="canvas-node-text-content"]'));
assert.ok(NATIVE_NAVIGATION_CHROME_SELECTOR.includes('[data-testid="rf__minimap"]'));
checks.push('selectors reference actual installed Canvas shell, original rail/minimap and current LCOS text source; no invented title identity');

const evidenceRoot = 'output/原生导航与强调_20261026/2026-10-25T20-21-36-088Z/';
const evidence = JSON.parse(await fs.readFile(evidenceRoot + 'report.json', 'utf8'));
const facts = JSON.parse(await fs.readFile(evidenceRoot + 'before-facts.json', 'utf8'));
const image = facts.canvas.nodes.find(node => node.id === 'surface-main-image'); assert.ok(image);
const departure = evidence.narrowGeometry.departure;
const imageScreen = bounds(departure.x + image.position.x * departure.zoom, departure.y + image.position.y * departure.zoom,
  departure.x + (image.position.x + image.measured.width) * departure.zoom, departure.y + (image.position.y + image.measured.height) * departure.zoom);
assert.deepEqual(imageScreen, bounds(-707.5, 375, -332.5, 625));
const safe = bounds(69, 8, 360, 812), main = fixture();
const header = new Element('header', { class: 'canvas-header-chrome' }, bounds(15, 16, 230, 58));
// Rail top=241 reproduces the saved marker's exact y=215 when inflated by
// the existing 22px hit radius + 4px gap. H1/paragraph line boxes below are
// controlled layout values within the saved screenshot, not claimed DOM reads.
const rail = new Element('nav', { 'data-testid': 'canvas-dockbar-container' }, bounds(15, 241, 69, 581)); main.body.append(header, rail);
const text = main.node('surface-main-text');
const caption = textRoot(text, 'canvas-node-title', 'Main · 项目总览', [bounds(80, 174, 165, 188)]);
const content = new Element('section', { 'data-testid': 'canvas-node-text-content', class: 'canvas-text-markdown' }, text.box);
const h1 = new Element('h1', {}, bounds(75, 214, 320, 244)).append(new Text('Main · 项目总览', [bounds(75, 214, 320, 244)]));
const paragraph = new Element('p', {}, bounds(75, 275, 350, 291)).append(new Text('整理这份合成项目的 Brief 与下一步。', [bounds(75, 275, 350, 291)])); content.append(h1, paragraph); text.append(content);
const folder = main.node('visible-folder', bounds(0,374,305,624));
const folderTitle = textRoot(folder, 'canvas-node-title', '原库整体落点', [bounds(47,598,290,616)]);
const old = project({ id: image.id, targetRect: imageScreen, safeRect: safe, obstacles: [header.box, rail.box] });
assert.deepEqual(hit(old), bounds(evidence.narrowGeometry.markerBox.x, evidence.narrowGeometry.markerBox.y,
  evidence.narrowGeometry.markerBox.x + 44, evidence.narrowGeometry.markerBox.y + 44));
assert.ok(intersects(hit(old), h1.box), 'existing actual algorithm reproduces title collision');
const obstacles = read(main.document, { safeRect: safe, pane: main.pane });
assert.equal(main.counts.ranges, 4); assert.equal(new Set(main.counts.measured).size, 4, 'one Range per text run, never per character or repeated nested root');
assert.ok(!obstacles.rects.some(value => value.left === text.box.left && value.bottom === text.box.bottom), 'no full material body rectangle');
const improved = layout({ targets: [{ id: image.id, targetRect: imageScreen }], safeRect: safe, obstacles: obstacles.rects });
assert.equal(improved.markers.length, 1); assert.deepEqual(improved.blockedIds, []);
const moved = improved.markers[0]; assert.equal(moved.edge, 'left'); assert.equal(moved.x, old.x); assert.equal(moved.y, 642);
for (const value of [header.box, rail.box, caption.box, h1.box, paragraph.box, folderTitle.box]) assert.ok(!intersects(hit(moved), value));
assert.equal(moved.angle, Math.atan2(500 - moved.y, -520 - moved.x)); assert.equal(hit(moved).width, 44); assert.equal(hit(moved).height, 44);
checks.push('saved target/viewport reproduce exact old 69,193,44,44 H1 collision; controlled text-run fixture moves same 44px cursor to 69,620,44,44, keeps exact target angle and clears caption/H1/body/folder-title/chrome');

const whitespace = fixture(); const empty = whitespace.node();
textRoot(empty, 'canvas-text-markdown', 'Only one short line', [bounds(75, 215, 200, 240)], {}, empty.box);
const blank = layout({ targets: [{ id: 'blank-space', targetRect: bounds(-700, 378, -300, 628) }], safeRect: safe,
  obstacles: read(whitespace.document, { safeRect: safe }).rects });
assert.equal(blank.markers[0].y, 400); assert.ok(intersects(hit(blank.markers[0]), empty.box), 'unused card whitespace stays available');
assert.ok(!intersects(hit(blank.markers[0]), bounds(75, 215, 200, 240)));
checks.push('unused card whitespace remains a real slot; only visible text runs and controls are forbidden, never the full node rectangle');

const clipped = fixture(); const clippedNode = clipped.node();
const scroller = new Element('section', { class: 'canvas-text-markdown' }, bounds(90, 100, 190, 180), { overflow: 'auto' });
scroller.clientLeft = scroller.clientTop = 2; scroller.clientWidth = 96; scroller.clientHeight = 76;
scroller.append(new Text('scrolled above\nvisible line\nclipped lower line', [bounds(100, 50, 180, 70), bounds(100, 130, 230, 150), bounds(80, 170, 220, 210)]));
const invisible = new Element('span', {}, bounds(90, 110, 190, 120), { opacity: '0' }).append(new Text('invisible text', [bounds(90, 110, 190, 120)]));
scroller.append(invisible); clippedNode.append(scroller);
const clippedResult = read(clipped.document, { safeRect: bounds(0, 0, 360, 820) });
assert.deepEqual(clippedResult.rects, [bounds(100, 130, 188, 150), bounds(92, 170, 188, 178)].map(({left, top, right, bottom}) => ({left, top, right, bottom})));
assert.ok(clippedResult.elements.includes(scroller)); assert.equal(clipped.counts.ranges, 1);
const scaled = fixture(); const scaledNode = scaled.node();
const scaledClip = new Element('section', { class: 'canvas-text-markdown' }, bounds(100, 100, 200, 140), { overflow: 'hidden' });
Object.assign(scaledClip, { offsetWidth: 200, offsetHeight: 80, clientWidth: 192, clientHeight: 72, clientLeft: 4, clientTop: 4 });
scaledClip.append(new Text('scaled overflow text', [bounds(90, 90, 220, 150)])); scaledNode.append(scaledClip);
assert.deepEqual(read(scaled.document, { safeRect: bounds(0, 0, 360, 820) }).rects, [{left:102,top:102,right:198,bottom:138}]);
checks.push('scrolled-off and opacity-hidden text contributes no phantom obstacle; ancestor overflow clips both axes including borders, scrollbars and original CSS scaling');

const scoped = fixture(); scoped.node('current');
const otherPane = new Element('main', { class: 'react-flow' }, bounds(0, 0, 360, 820)); scoped.body.append(otherPane);
const otherNode = new Element('article', { class: 'react-flow__node' }, bounds(0, 0, 360, 820)); otherPane.append(otherNode);
textRoot(otherNode, 'canvas-text-markdown', 'other canvas content', [bounds(50, 200, 300, 230)]);
otherPane.append(new Element('header', { class: 'canvas-header-chrome' }, bounds(0, 0, 360, 70)));
textRoot(scoped.body, 'canvas-text-markdown', 'Library/Popover prose is not a Canvas material', [bounds(50, 200, 300, 230)]);
assert.deepEqual(read(scoped.document, { safeRect: safe, pane: scoped.pane }).rects, []);
const map = new Element('div', { 'data-testid': 'rf__minimap' }, bounds(220, 600, 350, 720)); scoped.body.append(map);
assert.deepEqual(read(scoped.document, { safeRect: safe }).rects, [{left:220,top:600,right:350,bottom:720}]);
const hiddenRail = new Element('nav', { 'data-testid': 'canvas-dockbar-container', 'aria-hidden': 'true' }, bounds(15, 20, 69, 700)); scoped.body.append(hiddenRail);
assert.equal(read(scoped.document, { safeRect: safe }).rects.length, 1);
checks.push('material extraction stays inside the current original Canvas; another Canvas/Library/Popover prose is ignored; actual rf__minimap is protected and hidden rails create no phantom region');

const rightPanel = fixture(1500, 900); const nearRight = rightPanel.node('near-right', bounds(900, 150, 1300, 500));
textRoot(nearRight, 'canvas-text-markdown', 'visible part of right-side text', [bounds(940, 210, 1200, 250)]);
rightPanel.body.append(new Element('aside', { 'data-lcos-native-chat-frame': '' }, bounds(960, 0, 1500, 900)));
const narrowed = bounds(69, 8, 960, 892), rightObstacles = read(rightPanel.document, { safeRect: narrowed });
assert.deepEqual(rightObstacles.rects, [{left:940,top:210,right:960,bottom:250}]);
const full = project({ id: 'right-target', targetRect: bounds(1200, 200, 1400, 400), safeRect: bounds(69, 8, 1500, 892) }); assert.equal(full.phase, 'local');
const afterPanel = layout({ targets: [{ id: 'right-target', targetRect: bounds(1200, 200, 1400, 400) }], safeRect: narrowed, obstacles: rightObstacles.rects });
assert.equal(afterPanel.markers[0].phase, 'edge'); assert.equal(afterPanel.markers[0].x, 938); assert.equal(afterPanel.markers[0].y, 184);
assert.equal(hit(afterPanel.markers[0]).right, 960); assert.ok(!intersects(hit(afterPanel.markers[0]), rightObstacles.rects[0]));
checks.push('opening the actual right rail narrows the same visible Canvas; clipped content moves the right-edge cursor to x938/y184 with all 44px inside the remaining width');

const returnReport = JSON.parse(await fs.readFile('output/原生固定目录_20261026/2026-10-25T22-32-46-851Z/report.json','utf8'));
const returnNode = returnReport.targets.find(row=>row.canvasId==='surface-core-main').node, returnView=returnReport.savedDirectory.viewport;
const returnTarget = bounds(returnView.x+returnNode.position.x*returnView.zoom,returnView.y+returnNode.position.y*returnView.zoom,
  returnView.x+(returnNode.position.x+returnNode.measured.width)*returnView.zoom,returnView.y+(returnNode.position.y+returnNode.measured.height)*returnView.zoom);
const returnSafe = {...returnReport.navigationClipChecks.find(row=>row.label==='context-right-rail-arrival').clip,top:8,bottom:992};
const returnDom=fixture(1500,1000),returnImage=returnDom.node(returnNode.id,returnTarget);
const returnTitle=textRoot(returnImage,'canvas-node-title','本地合成图.png',[bounds(546,309,700,325)]);
const returnObstacles=read(returnDom.document,{safeRect:returnSafe});
const returnLayout=layout({targets:[{id:returnNode.id,targetRect:returnTarget,previousPhase:'edge'}],safeRect:returnSafe,obstacles:returnObstacles.rects});
assert.equal(returnLayout.markers.length,1);assert.deepEqual(returnLayout.unplaced,[]);
const near=returnLayout.markers[0];assert.equal(near.phase,'local');assert.equal(near.edge,'left');
assert.deepEqual(hit(near),bounds(490.75,337.5,534.75,381.5));assert.ok(!intersects(hit(near),returnTarget));assert.ok(!intersects(hit(near),returnTitle.box));
const shiftedTarget=bounds(returnTarget.left-60,returnTarget.top,returnTarget.right-60,returnTarget.bottom);
const sticky=layout({targets:[{id:returnNode.id,targetRect:shiftedTarget,previousMarker:near}],safeRect:returnSafe,obstacles:[]});
assert.equal(sticky.markers[0].phase,'local');assert.equal(sticky.markers[0].edge,'left');assert.equal(sticky.markers[0].x,near.x-60);
const nextToImage=returnDom.node('neighboring-text',bounds(490,335,535,665));
textRoot(nextToImage,'canvas-text-markdown','neighbor text beside the original image',[bounds(490,335,535,665)]);
const alternate=layout({targets:[{id:returnNode.id,targetRect:returnTarget,previousMarker:near}],safeRect:returnSafe,
  obstacles:read(returnDom.document,{safeRect:returnSafe}).rects});
assert.equal(alternate.markers[0].phase,'local');assert.equal(alternate.markers[0].edge,'top');
for(const forbidden of [returnTarget,...read(returnDom.document,{safeRect:returnSafe}).rects])assert.ok(!intersects(hit(alternate.markers[0]),forbidden));
const huge=layout({targets:[{id:'visible-huge',targetRect:bounds(-100,-100,1600,1100)}],safeRect:returnSafe,obstacles:[]});
assert.deepEqual(huge.markers,[]);assert.deepEqual(huge.unplaced,[{id:'visible-huge',reason:'blocked'}]);assert.deepEqual(huge.blockedIds,['visible-huge']);
const allLocalBlocked=layout({targets:[{id:returnNode.id,targetRect:returnTarget}],safeRect:returnSafe,obstacles:[returnSafe]});
assert.deepEqual(allLocalBlocked.markers,[]);assert.deepEqual(allLocalBlocked.blockedIds,[returnNode.id]);
checks.push('real06 target and right-rail facts now place one local44px Pin outside its left edge; original title/body obstacles can choose another local side, previous safe side follows target, and huge/blocked visible targets stay explicitly unplaced for the existing directory rather than becoming fake arrows');

const noSlotTargets = [{ id: 'one', targetRect: imageScreen }, { id: 'two', targetRect: bounds(-900, 300, -800, 500) }];
const blocked = layout({ targets: noSlotTargets, safeRect: safe, obstacles: [bounds(0, 0, 130, 820)] });
assert.deepEqual(blocked.markers, []); assert.deepEqual(blocked.blockedIds, ['one', 'two']);
assert.deepEqual(blocked.unplaced, [{id:'one',reason:'blocked'},{id:'two',reason:'blocked'}]);
assert.equal(blocked.markers.length + blocked.unplaced.length, noSlotTargets.length);
assert.deepEqual(layout({targets:[noSlotTargets[0]],safeRect:bounds(0,0,43,820),obstacles:[]}).unplaced,[{id:'one',reason:'insufficient-space'}]);
assert.deepEqual(layout({targets:[{id:'unknown',targetRect:bounds(NaN,0,80,100)}],safeRect:safe,obstacles:[]}).unplaced,[{id:'unknown',reason:'geometry-unavailable'}]);
const second = layout({targets:[{id:'other',targetRect:bounds(-800,630,-400,830)}],safeRect:safe,obstacles:obstacles.rects}).markers[0];
assert.ok(second); const grouped = cluster([moved, second]); assert.equal(grouped.length, 1); assert.equal(grouped[0].members.length, 2);
for (const forbidden of obstacles.rects) assert.ok(!intersects(hit(grouped[0]), forbidden));
checks.push('no same-edge slot explicitly returns every unplaced ID/reason for the existing directory count/prompt; no silent flatMap loss, shrinking, fake target or coordinate writes; original cluster keeps an already-safe member slot');

const broken = fixture(); const brokenNode = broken.node(); const root = textRoot(brokenNode, 'canvas-text-markdown', 'unmeasurable', [bounds(80,200,250,220)]);
broken.document.createRange = () => { throw Error('DOM measurement unavailable'); };
const unavailable = read(broken.document, { safeRect: safe }); assert.deepEqual(unavailable.rects, []); assert.deepEqual(unavailable.unmeasured, [root]);
checks.push('failed text measurement is reported separately; no whole-body rectangle fallback or false claim of complete measurement');
console.log(JSON.stringify({ passed: true, checks, numerical: { oldHit: hit(old), improvedHit: hit(moved), rightRailHit: hit(afterPanel.markers[0]), returnLocalHit:hit(near), blocked: blocked.unplaced, visibleNoSlot:huge.unplaced },
  scope: 'actual original source selectors and saved target/viewport + controlled DOM line/client/overflow boxes; actual project/cluster functions; no browser/live API/model/data writes' }, null, 2));
