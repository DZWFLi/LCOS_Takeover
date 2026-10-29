import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFile as runFile } from 'node:child_process';
import { promisify } from 'node:util';
import { currentGen2Root } from '../lab/current-gen2-resources.mjs';

// Real-page R02 verification. This file has no write/service/send mode. Wait for
// the unified bundle and the parent's exact PID before executing this script.
const option = name => process.argv.find(value => value.startsWith('--' + name + '='))?.slice(name.length + 3);
assert.ok(process.argv.includes('--execute-readonly'), 'Wait for the unified R02 build and explicit exact-PID authorization.');
const expectedPid = Number(option('expected-pid'));
assert.ok(Number.isSafeInteger(expectedPid) && expectedPid > 0);
const diagnoseFirstReopen = process.argv.includes('--diagnose-first-reopen');
const diagnoseViewerChrome = process.argv.includes('--diagnose-viewer-chrome');
const diagnoseEscapeFocus = process.argv.includes('--diagnose-escape-focus');
const diagnoseChatLayout = process.argv.includes('--diagnose-chat-layout');
const diagnoseLibraryStack = process.argv.includes('--diagnose-library-stack');
const onlyViewport=option('only-viewport');assert.ok(onlyViewport===undefined||['1500x1000','360x800','360x400'].includes(onlyViewport),'Only an existing full-chain viewport may be selected');
const origin = 'http://127.0.0.1:56311', projectId = 'disposable-surface-core-facade', canvasId = 'surface-core-main';
const conversationId = 'connected-conversation-4244107f-aa59-4466-85e2-7ca53e230009';
const base = '/api/lcos/core/projects/' + projectId, root = process.cwd();
const output = path.resolve(option('output-root') ?? 'output/文本选区准确定位_R02_20261026/真实原页/' + new Date().toISOString().replace(/[:.]/g, '-'));
await fs.mkdir(output, { recursive: true });
const execFile = promisify(runFile), factsScript = path.resolve('scripts/native-gui-facts-read.mjs');
const draftPrefix = 'R02 本地验证稿｜';
const report = { passed: false, expectedPid, onlyViewport, diagnoseFirstReopen, diagnoseViewerChrome, diagnoseEscapeFocus, diagnoseChatLayout, diagnoseLibraryStack, conversationId, checks: [], screenshots: [], selections: [], locations: [], sourceLines: [], resume: [],
  blockedWrites: [], external: [], protocols: [], streamsBlocked: [], socketsBlocked: [], pageErrors: [], routeErrors: [], httpErrors: [],
  forwardedWrites: 0, modelCalls: 0, submittedPrompts: 0, hiddenSetters: 0, selectionMutations: 0,
  observation: 'Only an appended read-only original Shell/ReferenceStore/Canvas snapshot. Original controls and real mouse selection; temporary DOM Ranges read geometry only and are never installed into Selection. All non-GET traffic is aborted.',
  notClaimed: ['Clipboard/drop source metadata and deferred-owner races are separately executed original-component tests; this real-page run does not invent a clipboard permission bypass.',
    'No node, Artifact, revision, conversation, Run, message or Core relationship is created. Real historical switching is tested only when a pre-existing revision exists.'] };
const safe = value => String(value).replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g, '[REDACTED]').replace(/\bBearer\s+[^\s"']+/gi, 'Bearer [REDACTED]');
const save = () => fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
const health = async () => {
  const response = await fetch(origin + '/health', { method: 'GET', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, 200); const value = await response.json();
  assert.equal(value.pid, expectedPid); assert.equal(value.realCoreConnected, true); return value;
};
const facts = async (name, compare) => {
  await health(); const file = path.join(output, name + '.json');
  await execFile(process.execPath, [factsScript, '--output=' + file, ...(compare ? ['--compare=' + compare] : [])], { cwd: root, timeout: 120000, maxBuffer: 1024 * 1024 });
  const value = JSON.parse(await fs.readFile(file, 'utf8')); assert.equal(value.summary.pid, expectedPid); return { file, ...value };
};
const poll = async (read, match, label, timeout = 30000) => {
  const end = Date.now() + timeout; let value;
  do { value = await read(); if (match(value)) return value; await new Promise(resolve => setTimeout(resolve, 80)); } while (Date.now() < end);
  throw Error(label + ' timed out; last=' + JSON.stringify(value));
};
const readFileBytes = async ids => {
  const rows = new Map();
  for (const id of ids) {
    await health(); const response = await fetch(origin + base + '/file-records/' + encodeURIComponent(id) + '/content',
      { method: 'GET', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(30000) });
    const bytes = Buffer.from(await response.arrayBuffer());
    rows.set(id, { status: response.status, type: response.headers.get('content-type'), bytes });
  }
  return rows;
};
const compareBytes = (actual, before) => {
  assert.deepEqual([...actual.keys()], [...before.keys()]);
  for (const [id, previous] of before) {
    const next = actual.get(id); assert.equal(next.status, previous.status, id + ' file read status');
    assert.equal(next.type, previous.type, id + ' MIME');
    if (previous.status === 200) assert.equal(next.bytes.equals(previous.bytes), true, id + ' original bytes');
  }
};
let browser, page, currentRead, cleanupUi, stage = 'preflight', before, bytesBefore;
try {
  before = await facts('facts-before'); report.factsBefore = before.summary;
  assert.equal(before.summary.markers, 0); assert.equal(before.summary.journal, 34); assert.equal(before.summary.totalMessages, 36);
  assert.equal(before.summary.longConversationMessages, 28);
  const canonical = before.data.connected.find(row => row.id === conversationId);
  assert.ok(canonical?.conversationSessionId); assert.equal(before.data.messages[canonical.conversationSessionId].length, 4);
  const bindings = before.data.bindings.filter(row => row.projectId === projectId && row.entityType === 'conversation' && row.entityId === conversationId && row.canvasId === canvasId && row.spatialKind === 'node');
  assert.equal(bindings.length, 1); const conversationNode = before.data.canvases[canvasId].nodes.find(row => row.id === bindings[0].spatialId);
  assert.ok(conversationNode); report.conversationNodeId = conversationNode.id;
  const graph = before.data.graph, artifact = graph.artifacts.find(row => row.id === 'artifact-brief'); assert.ok(artifact);
  const revisionRows = graph.artifactRevisions.filter(row => row.artifactId === artifact.id);
  const revision = revisionRows.find(row => row.id === artifact.currentRevisionId); assert.ok(revision?.fileRecordId);
  const fileIds = [...new Set(graph.fileRecords.map(row => row.id))].sort();
  bytesBefore = await readFileBytes(fileIds);
  assert.equal(bytesBefore.get(revision.fileRecordId)?.status, 200);
  report.files = [...bytesBefore].map(([id, value]) => ({ id, status: value.status, type: value.type, bytes: value.bytes.length, compared: value.status === 200 }));
  report.material = { artifactId: artifact.id, title: artifact.title, revisionId: revision.id, fileRecordId: revision.fileRecordId, realRevisionCount: revisionRows.length };
  const { chromium } = createRequire(path.join(currentGen2Root, 'package.json'))('playwright-core');
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-networking', '--disable-sync', '--no-first-run'] });
  const viewports=(diagnoseLibraryStack?[{width:360,height:800}]:diagnoseChatLayout?[{width:360,height:400}]:[{ width: 1500, height: 1000 }, { width: 360, height: 800 }, { width: 360, height: 400 }]).filter(viewport=>!onlyViewport||viewport.width+'x'+viewport.height===onlyViewport);
  assert.ok(viewports.length>0,'Selected viewport must execute its full existing chain');
  for (const viewport of viewports) {
    const label = (viewport.width === 360 ? 'narrow' : 'desktop') + viewport.width + 'x' + viewport.height; stage = label + '-load';
    const context = await browser.newContext({ viewport, locale: 'zh-CN', serviceWorkers: 'block' });
    await context.route('**/*', async route => {
      try {
        const request = route.request(), url = new URL(request.url()), method = request.method();
        if (['data:', 'blob:'].includes(url.protocol)) return route.continue();
        if (!['http:', 'https:'].includes(url.protocol)) { report.protocols.push({ stage, protocol: url.protocol }); return route.abort(); }
        if (url.origin !== origin || url.pathname.startsWith('/api/lcos/core/projects/') && !url.pathname.startsWith(base + '/')) {
          report.external.push({ stage, method, path: url.pathname }); return route.abort();
        }
        if (method !== 'GET') { report.blockedWrites.push({ stage, method, path: url.pathname, forwarded: false }); return route.abort('blockedbyclient'); }
        if (request.resourceType() === 'eventsource' || (request.headers().accept ?? '').includes('text/event-stream')) {
          report.streamsBlocked.push({ stage, path: url.pathname }); return route.abort();
        }
        if (url.pathname === '/lcos/agent-ui.js') {
          const response = await route.fetch({ timeout: 120000, maxRedirects: 0 }); let source = await response.text();
          assert.ok(source.includes('data-native-material-location-options') && source.includes('sourceLocations'), 'Unified source must contain R02 location options and original reference metadata.');
          assert.ok(source.includes('function createNativeTextIndex('), 'Actual R02 text-index implementation must be observable without replacing it.');
          if(diagnoseFirstReopen){
            const seam='function resolveNativeTextLocation(';
            assert.equal(source.split(seam).length,2,'Observe the one actual resolver implementation.');
            // The implementation body remains byte-for-byte intact. A wrapper
            // records only its real first-call inputs/output and returns the
            // same object; no retry, branch change or synthetic resolution.
            source=source.replace(seam,'function __R02OriginalResolveNativeTextLocation(')+`\nfunction resolveNativeTextLocation(root,value,markdown){
              const attributes=e=>({tag:e.tagName,hidden:e.hasAttribute('hidden'),inert:e.hasAttribute('inert'),ariaHidden:e.getAttribute('aria-hidden'),role:e.getAttribute('role'),cls:typeof e.className==='string'?e.className:undefined});
              const ancestors=[];for(let e=root;e;e=e.parentElement)ancestors.push(attributes(e));
              const index=createNativeTextIndex(root),entry={at:performance.now(),connected:root.isConnected,root:attributes(root),ancestors,textLength:index.text.length,text:index.text,locator:normalizeNativeTextLocator(value),markdownLength:markdown?.length};
              try{const result=__R02OriginalResolveNativeTextLocation(root,value,markdown);entry.output={status:result.status,message:result.message,rangeText:result.range?.toString()};return result;}
              catch(error){entry.error=String(error);throw error;}
              finally{(window.__R02_RESOLVE_TRACE__??=[]).push(entry);}
            }`;
          }
          return route.fulfill({ response, body: source + '\nwindow.__TEXT_LOCATION_READ__=()=>{const s=useLcosShellStore.getState(),r=useLcosReferenceStore.getState(),c=useCanvasStore.getState(),sel=readNativeConversationSelection(),e=useCollaborationSessionStore.getState().entries.get(s.projectId+":"+sel?.connectedConversationId);return{project:s.projectId,canvas:c.canvasId,workspace:s.activeWorkspaceId,surface:s.activeSurface,status:c.status,selection:sel?.connectedConversationId,target:s.composerTarget,prompt:s.composerPrompt,caret:s.composerCaret,refs:r.draft.orderedEntityRefs,windowCount:s.windows.length,composerOpen:s.composerOpen,readerPositions:s.readerPositions,readerLastRevisions:s.readerLastRevisions,conversationStatus:e?.status,capabilities:e?.projection?.capabilities};};\nwindow.__TEXT_LOCATION_INDEX_READ__=()=>{const root=document.querySelector("[data-lcos-native-text-reading] .lcos-reader-measure");if(!root)return null;const index=createNativeTextIndex(root);return{text:index.text,textContent:root.textContent,innerText:root.innerText,html:root.innerHTML,hiddenAncestor:root.closest("[hidden],[inert]")?.outerHTML.slice(0,200),segments:index.segments.map(s=>({start:s.start,end:s.end,text:s.node.textContent,parent:s.node.parentElement?.tagName,sourceStart:s.node.parentElement?.closest("[data-native-source-start-line]")?.getAttribute("data-native-source-start-line")}))};};' });
        }
        return route.continue();
      } catch (error) { report.routeErrors.push({ stage, error: safe(error.stack ?? error) }); await route.abort().catch(() => {}); }
    });
    await context.routeWebSocket('**/*', socket => { report.socketsBlocked.push({ stage, path: new URL(socket.url()).pathname }); socket.close(); });
    page = await context.newPage(); page.setDefaultTimeout(30000);
    page.on('pageerror', error => report.pageErrors.push({ stage, message: safe(error.stack ?? error) }));
    page.on('response', response => { if (response.status() >= 400) report.httpErrors.push({ stage, path: new URL(response.url()).pathname, status: response.status() }); });
    const input = page.getByRole('textbox', { name: 'Composer 输入', exact: true });
    const ownedPrompts = new Set(['']); let ownedDraft, expectedViewId;
    const read = () => page.evaluate(() => window.__TEXT_LOCATION_READ__?.()); currentRead = read;
    const viewer = () => page.locator('[data-media-viewer]'), body = () => page.locator('[data-lcos-native-text-reading] .lcos-reader-measure');
    const scroller = () => page.locator('.native-material-text-scroll');
    const runtime = () => page.evaluate(async () => {
      const state = (await import('/assets/course-api-base-url-CifxI1ia.js')).LCOSNativeMaterialViewerRuntime.getState();
      return { phase: state.phase, sessionId: state.session?.id, requestKey: state.session?.lcosControlled?.requestKey,
        source: state.session?.lcosControlled?.bodySlot?.props?.source, markdown: state.session?.media?.markdown };
    });
    const locationGeometry = () => page.evaluate(() => {
      const measure = document.querySelector('[data-lcos-native-text-reading] .lcos-reader-measure'), viewport = document.querySelector('.native-material-text-scroll');
      const box = node => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
      const highlights = [...(CSS.highlights ?? [])].filter(([name]) => name.endsWith('-source-location')).map(([name, highlight]) => ({ name,
        ranges: [...highlight].map(range => ({ text: range.toString(), rect: box(range), rects: [...range.getClientRects()].map(r => ({ x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height })) })) }));
      const hits=element=>{const r=element.getBoundingClientRect();return[[.15,.2],[.85,.2],[.5,.5],[.15,.8],[.85,.8]].map(([x,y])=>{const at=document.elementFromPoint(r.x+r.width*x,r.y+r.height*y);return at===element||element.contains(at)});};
      const nativeRoot=document.querySelector('[data-media-viewer][data-lcos-native-viewer-owner]'),actions=nativeRoot?.querySelector('[data-lcos-native-viewer-actions="text"]');
      const chrome=actions?{lift:nativeRoot.style.getPropertyValue('--lcos-native-viewer-actions-lift'),actions:box(actions),buttons:[...actions.querySelectorAll('button')].map(element=>({label:element.getAttribute('aria-label')??element.getAttribute('title')??element.textContent,rect:box(element),hits:hits(element)})),
        toasts:[...document.querySelectorAll('[data-sonner-toast]')].filter(element=>element.getClientRects().length>0&&getComputedStyle(element).opacity!=='0').map(element=>({text:element.textContent,rect:box(element),buttons:[...element.querySelectorAll('button')].map(button=>({label:button.textContent,rect:box(button),hits:hits(button)}))}))}:undefined;
      return { viewport: viewport ? box(viewport) : null, scrollTop: viewport?.scrollTop, scrollHeight: viewport?.scrollHeight, clientHeight: viewport?.clientHeight,
        zoom: measure?.style.zoom, state: document.querySelector('[data-native-text-location-state]')?.getAttribute('data-native-text-location-state') ?? 'none',
        note: document.querySelector('[data-native-text-location-state]')?.textContent, highlights,chrome };
    });
    const settle = async () => page.evaluate(async () => {
      const elements = [...document.querySelectorAll('[data-media-viewer],[data-lcos-native-material-options],[data-lcos-native-chat-frame],[data-sonner-toast]')];
      const animations = [...new Set(elements.flatMap(element => element.getAnimations({ subtree: true })))].filter(animation => animation.playState === 'running' && animation.effect?.getComputedTiming().iterations !== Infinity);
      await Promise.all(animations.map(animation => animation.finished.catch(() => undefined)));
      return { finiteAnimationsAwaited: animations.length };
    });
    const chatGeometry=()=>page.evaluate(()=>{
      const box=e=>{if(!e)return null;const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}};
      const info=e=>{if(!e)return null;const s=getComputedStyle(e);return{tag:e.tagName,className:typeof e.className==='string'?e.className:undefined,attrs:Object.fromEntries([...e.attributes].filter(a=>a.name.startsWith('data-')||a.name==='style').map(a=>[a.name,a.value])),rect:box(e),display:s.display,position:s.position,height:s.height,minHeight:s.minHeight,maxHeight:s.maxHeight,flex:s.flex,flexGrow:s.flexGrow,flexShrink:s.flexShrink,flexBasis:s.flexBasis,overflow:s.overflow,overflowX:s.overflowX,overflowY:s.overflowY,padding:s.padding,scrollTop:e.scrollTop,scrollHeight:e.scrollHeight,clientHeight:e.clientHeight};};
      const frame=document.querySelector('[data-lcos-native-chat-frame]'),inner=frame?.firstElementChild,header=frame?.querySelector('[data-lcos-native-chat-header]'),composer=frame?.querySelector('[data-lcos-composer]');
      let slot=composer;while(slot&&slot.parentElement!==inner)slot=slot.parentElement;
      const msg=frame?.querySelector('[data-chat-message-id]'),messageAncestors=[];for(let e=msg;e&&e!==inner;e=e.parentElement)messageAncestors.push(info(e));
      const controls=[...(frame?.querySelectorAll('button,textarea,input,select,[role="button"]')??[])].filter(e=>e.getClientRects().length>0&&e.getBoundingClientRect().width>0).map(e=>{const r=e.getBoundingClientRect();return{label:e.getAttribute('aria-label')??e.getAttribute('title')??e.textContent?.slice(0,80),tag:e.tagName,rect:box(e),hits:[[.15,.2],[.85,.2],[.5,.5],[.15,.8],[.85,.8]].map(([x,y])=>{const at=document.elementFromPoint(r.x+r.width*x,r.y+r.height*y);return{hit:at===e||e.contains(at),tag:at?.tagName,toast:at?.closest('[data-sonner-toast]')?.textContent}})}});
      return{viewport:{width:innerWidth,height:innerHeight},frame:info(frame),inner:info(inner),header:info(header),slot:info(slot),composer:info(composer),bubble:info(frame?.querySelector('[data-canvas-input-bubble]')),textarea:info(frame?.querySelector('textarea')),canvas:info(document.querySelector('[data-canvas-container]')),reactFlow:info(document.querySelector('[data-canvas-container] .react-flow')),innerChildren:[...(inner?.children??[])].map(info),messageAncestors,controls,toasters:[...document.querySelectorAll('[data-sonner-toaster]')].map(info),toasts:[...document.querySelectorAll('[data-sonner-toast]')].map(e=>({...info(e),text:e.textContent})),focus:document.activeElement?.tagName};
    });
    const shot = async name => { const animations = await settle(), file = path.join(output, label + '-' + name + '.png');
      await page.screenshot({ path: file }); report.screenshots.push(file); report.locations.push({ label, stage, animations, runtime: await runtime(), geometry: await locationGeometry() }); await save(); };
    const fullHit = async (locator, name) => {
      await locator.waitFor({ state: 'visible' }); assert.equal(await locator.count(), 1, name + ' unique');
      // Original Viewer chrome fades while idle. Reveal it through an actual
      // pointer move inside its existing page, never a style/store override.
      if(await viewer().isVisible()){
        const panel=await body().boundingBox();if(panel)await page.mouse.move(panel.x+Math.min(panel.width/2,80),panel.y+Math.min(panel.height/2,40));
        await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await settle();
      }
      const buttonBox=await locator.boundingBox();if(buttonBox)await page.mouse.move(buttonBox.x+buttonBox.width/2,buttonBox.y+buttonBox.height/2,{steps:4});
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await settle();
      const value = await locator.evaluate(element => { const r = element.getBoundingClientRect(); const result={ rect: { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom },
        viewport: { width: innerWidth, height: innerHeight }, hits: [[.15,.2],[.85,.2],[.5,.5],[.15,.8],[.85,.8]].map(([x,y]) => { const target = document.elementFromPoint(r.x + r.width*x, r.y + r.height*y); return {hit:target === element || element.contains(target),tag:target?.tagName,toast:target?.closest('[data-sonner-toast]')?.textContent,html:target?.outerHTML.slice(0,300)}; }) };
        if(r.x<0||r.y<0||r.right>innerWidth||r.bottom>innerHeight||result.hits.some(point=>!point.hit)){
          result.ancestors=[];for(let current=element;current;current=current.parentElement){const rect=current.getBoundingClientRect(),style=getComputedStyle(current);result.ancestors.push({tag:current.tagName,role:current.getAttribute('role'),className:typeof current.className==='string'?current.className:undefined,attrs:Object.fromEntries([...current.attributes].filter(attr=>attr.name.startsWith('data-')||attr.name==='style').map(attr=>[attr.name,attr.value])),rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height,right:rect.right,bottom:rect.bottom},position:style.position,transform:style.transform,zIndex:style.zIndex,overflowX:style.overflowX,overflowY:style.overflowY,pointerEvents:style.pointerEvents});}
        }return result; });
      (report.controlHits ??= []).push({ label, stage, name, ...value });
      assert.ok(value.rect.width > 0 && value.rect.height > 0 && value.rect.x >= 0 && value.rect.y >= 0 && value.rect.right <= value.viewport.width && value.rect.bottom <= value.viewport.height, name + ' fits viewport');
      assert.ok(value.hits.every(point=>point.hit), name + ' original full hit'); return value;
    };
    const originalClick = async (locator, name) => { const value = await fullHit(locator, name); await page.mouse.click(value.rect.x + value.rect.width/2, value.rect.y + value.rect.height/2); };
    const assertShortChatGeometry=async name=>{
      if(viewport.width!==360||viewport.height!==400)return;
      await settle();const geometry=await chatGeometry();(report.actualChatGeometry??=[]).push({label,stage,name,...geometry});await save();
      assert.ok(geometry.canvas?.rect&&geometry.frame?.rect&&geometry.bubble?.rect&&geometry.textarea?.rect,'Actual original Canvas/frame/bubble/input must exist');
      assert.ok(Math.abs(geometry.canvas.rect.bottom-geometry.frame.rect.y)<=1,'Original Canvas bottom equals the actual adaptive Chat top');
      assert.ok(Math.abs(geometry.canvas.rect.height-(geometry.frame.rect.y-geometry.canvas.rect.y))<=1,'Actual Canvas height uses the same available upper region');
      assert.ok(geometry.canvas.rect.height>0,'Original Canvas retains a positive visible height');
      assert.ok(geometry.reactFlow?.rect&&Math.abs(geometry.reactFlow.rect.bottom-geometry.canvas.rect.bottom)<=1,'Actual original ReactFlow viewport shares the Canvas available bottom');
      assert.ok(geometry.bubble.rect.y>=geometry.frame.rect.y&&geometry.bubble.rect.bottom<=geometry.frame.rect.bottom+.5,'Entire original core input bubble fits the current Chat frame');
      assert.ok(geometry.textarea.rect.height>=99.5&&geometry.textarea.rect.height<=100.5,'Real short-height long draft keeps the original 100px textarea instead of shortening the draft');
      const hits={};for(const [key,control]of[['frame',page.locator('[data-lcos-native-chat-frame]')],['corebubble',page.locator('[data-lcos-native-chat-frame] [data-canvas-input-bubble]')],['textarea',input],['library',page.getByRole('button',{name:'从材料库添加',exact:true})],['submit',page.getByRole('button',{name:'提交',exact:true})]])hits[key]=await fullHit(control,'Adaptive short-height original '+key+' '+name);
      const current=await chatGeometry();(report.actualChatGeometry??=[]).push({label,stage,name:name+'-actual-five-point-controls',...current,fullHit:hits});
      const file=path.join(output,label+'-'+name+'-adaptive-chat.png');await page.screenshot({path:file});report.screenshots.push(file);await save();
    };
    const exactSource = value => { assert.equal(value.source?.projectId, projectId); assert.equal(value.source?.artifactId, artifact.id); assert.equal(value.source?.revisionId, revision.id); assert.equal(value.source?.fileRecordId, revision.fileRecordId);
      if (expectedViewId === undefined && value.source?.viewId !== undefined) expectedViewId = value.source.viewId;
      assert.equal(value.source?.viewId, expectedViewId, 'Keep the original exact View occurrence'); return value; };
    const waitReader = async () => { await viewer().waitFor(); await body().waitFor(); return poll(runtime, value => value.phase === 'open' && value.source?.revisionId === revision.id, 'Original CT loaded the actual exact Brief revision'); };
    let libraryOpenSerial=0;
    const library = async () => {
      await originalClick(page.getByRole('button', { name: '从材料库添加', exact: true }), 'Original Composer material-library entry');
      const search = page.getByRole('textbox', { name: '搜索', exact: true }); await search.waitFor(); await search.fill('Brief');
      const row=page.getByRole('button', { name: 'Brief', exact: true }).first();const rowRect=await row.boundingBox();await row.click();
      const action=page.getByRole('button', { name: '查看准确版本', exact: true });await action.waitFor({state:'visible'});
      const previewGeometry=()=>action.evaluate(element=>{
        const rect=e=>{if(!e)return null;const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
        const root=element.closest('.native-assembly-preview'),popup=root?.closest('[data-side]')??root?.closest('[role="dialog"]')??root;
        const title=root&&[...root.querySelectorAll('*')].find(e=>e.children.length===0&&e.textContent?.trim()==='Brief');
        const scroll=[];for(let e=element;e;e=e.parentElement){const style=getComputedStyle(e);if(/auto|scroll/.test(style.overflowY)&&e.scrollHeight>e.clientHeight)scroll.push({className:e.className,rect:rect(e),scrollTop:e.scrollTop,scrollHeight:e.scrollHeight,clientHeight:e.clientHeight,overflowY:style.overflowY});if(e===popup)break;}
        return{preview:rect(root),popup:rect(popup),popupClass:popup?.className,side:popup?.getAttribute('data-side'),popupStyle:popup?.getAttribute('style'),title:rect(title),titleText:title?.textContent,action:rect(element),scroll,viewport:{width:innerWidth,height:innerHeight}};
      });
      let preview=await previewGeometry();
      assert.ok(preview.popup&&preview.popup.x>=0&&preview.popup.y>=0&&preview.popup.right<=viewport.width+.5&&preview.popup.bottom<=viewport.height+.5,'Whole original material preview stays within the real viewport');
      // If the native preview itself scrolls, use the actual wheel in its
      // original overflow owner to reveal its title and actions in turn.
      let previewWheels=0;
      const revealPreview=async key=>{let current;for(let attempt=0;attempt<6;attempt++){
        current=await previewGeometry();const target=current[key],scroll=current.scroll[0],top=Math.max(0,current.popup.y,scroll?.rect.y??0),bottom=Math.min(viewport.height,current.popup.bottom,scroll?.rect.bottom??viewport.height);
        if(target&&target.y>=top&&target.bottom<=bottom)return current;if(!target||!scroll)break;
        const r=scroll.rect,delta=target.y<top?target.y-top-4:target.bottom-bottom+4;
        await page.mouse.move(Math.max(8,Math.min(viewport.width-8,r.x+r.width/2)),Math.max(8,Math.min(viewport.height-8,r.y+r.height/2)));await page.mouse.wheel(0,delta);previewWheels++;await page.waitForTimeout(100);
      }return current;};
      preview=await revealPreview('title');
      assert.ok(preview.title&&preview.title.y>=Math.max(0,preview.popup.y)&&preview.title.bottom<=Math.min(viewport.height,preview.popup.bottom),'Original preview title can be reached through its actual scroll owner');
      const titlePreview=preview;preview=await revealPreview('action');
      (report.libraryDetails??=[]).push({label,open:++libraryOpenSerial,rowRect,titleState:titlePreview,actionState:preview,actualWheel:previewWheels});
      if(libraryOpenSerial===1){const file=path.join(output,label+'-00-original-library-full-preview.png');await page.screenshot({path:file});report.screenshots.push(file);await save();}
      await originalClick(action, 'Original library exact-version action');
      return exactSource(await waitReader());
    };
    let inputOwner;
    const sameInput = async (expectedText, expectedLocations) => {
      await input.waitFor(); const value = await read(); assert.equal(value.project, projectId); assert.equal(value.canvas, canvasId); assert.equal(value.selection, conversationId);
      // Original Reader return legitimately requests focus on the existing
      // input. That presentation request is not a new target or message.
      const identity = target => { const { focusInput, ...rest } = target; return rest; };
      assert.deepEqual(identity(value.target), identity(inputOwner.target), 'Same original receiver/input/message/operation'); assert.equal(value.windowCount, inputOwner.windowCount); assert.equal(value.composerOpen, true);
      if (expectedText !== undefined) assert.equal(value.prompt, expectedText, 'Original input text after the requested operation');
      if (expectedLocations !== undefined) {
        assert.equal(value.refs.length, 1); assert.equal(value.refs[0].entityId, artifact.id); assert.equal(value.refs[0].revisionId, revision.id); assert.equal(value.refs[0].artifactViewId, expectedViewId);
        assert.deepEqual(value.refs[0].sourceLocations, expectedLocations, 'One original reference keeps all accurate source locations');
      }
      return value;
    };
    const returnLibraryToInput=async()=>{
      const panel=page.locator('[data-library-panel]');if(!(await panel.isVisible()))return;
      const beforeReturn=await sameInput(),back=panel.locator('button').first();
      const originalHeader=await back.evaluate(element=>{const headerAncestors=[];for(let current=element.parentElement;current&&!current.matches('[data-library-panel]')&&headerAncestors.length<4;current=current.parentElement)headerAncestors.push({className:current.className,text:current.textContent});return{tag:element.tagName,label:element.getAttribute('aria-label'),title:element.getAttribute('title'),html:element.outerHTML,headerAncestors};});
      assert.ok(originalHeader.headerAncestors.some(current=>current.text?.includes('素材库')),'Use the original Library header Back, not another page control');
      await originalClick(back,'Original Library Header Back to the existing input');await panel.waitFor({state:'hidden'});await settle();
      const returned=await sameInput(beforeReturn.prompt);assert.deepEqual(returned.refs,beforeReturn.refs);assert.deepEqual(returned.caret,beforeReturn.caret,'Original Library Header Back preserves the current caret');
      const actualCaret=await input.evaluate(element=>({start:element.selectionStart,end:element.selectionEnd}));assert.equal(actualCaret.start,returned.caret.start);assert.equal(actualCaret.end,returned.caret.end);
      (report.libraryInputReturns??=[]).push({label,stage,kind:'pure-browse-original-Header-Back',libraryRetainedAfterReaderEscape:true,originalHeader,libraryClosed:true,prompt:returned.prompt,caret:returned.caret,refs:returned.refs,target:returned.target,noSyntheticClose:true});
    };
    const closeReader = async () => {
      if (await page.locator('[data-lcos-native-material-options]:visible').count()) await page.keyboard.press('Escape');
      await page.keyboard.press('Escape'); await viewer().waitFor({ state: 'hidden' }); await input.waitFor(); await settle();
      // Plain browsing returns through its retained original Library layer.
      // Only its actual Header Back may then return to the original input.
      await returnLibraryToInput();
    };
    cleanupUi = async () => {
      if (!page || page.isClosed()) return;
      if (await viewer().isVisible()) {
        if(report.error){
          // Preserve the failed Escape assertion, but clean up through the
          // other original native control rather than repeating a broken key.
          const back=viewer().getByRole('button',{name:'返回',exact:true});await back.click();await viewer().waitFor({state:'hidden'});await input.waitFor();
          (report.failureBackCleanup??=[]).push({label,originalBack:true,EscapeFailureNotClaimedFixed:true});
        }else await closeReader();
      }
      // Failure cleanup follows the same retained original Library layer too.
      // Escape in its search only clears the query, so use its real Header
      // Back before trying to clear this profile's owned input/reference.
      const cleanupLibrary=page.locator('[data-library-panel]');
      if(await cleanupLibrary.isVisible()){
        const owner=await read();if(owner?.selection!==conversationId||owner.project!==projectId||owner.canvas!==canvasId)return;
        await cleanupLibrary.locator('button').first().click();await cleanupLibrary.waitFor({state:'hidden'});await settle();
        (report.failureLibraryCleanup??=[]).push({label,originalHeaderBack:true});
      }
      for (let index = 0; index < 3 && !(await input.isVisible()); index++) await page.keyboard.press('Escape');
      const value = await read();
      if (value?.selection !== conversationId || value.project !== projectId || value.canvas !== canvasId) return;
      const ownInsertedDraft = ownedDraft && value.prompt.startsWith(ownedDraft.slice(0, 2)) && value.prompt.endsWith(ownedDraft.slice(2));
      assert.ok(ownedPrompts.has(value.prompt) || ownInsertedDraft, 'Refuse to clear unrelated local input');
      for (const ref of value.refs) assert.ok(ref.entityId === artifact.id && ref.revisionId === revision.id, 'Refuse to remove an unrelated reference');
      await input.fill('');
      while (await page.locator('[data-lcos-composer-ref] .native-composer-reference-remove').count())
        await page.locator('[data-lcos-composer-ref] .native-composer-reference-remove').first().click();
      await poll(read, next => next.prompt === '' && next.refs.length === 0, 'Original UI cleanup of this test draft and reference');
      (report.uiCleanup ??= []).push({ label, originalControls: true, prompt: '', refs: 0 });
    };
    await page.goto(origin + '/canvas/' + canvasId, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.locator('[data-lcos-professional-surface-state="ready"]').waitFor({ state: 'attached', timeout: 120000 });
    await page.getByTestId('common-loading-overlay').waitFor({ state: 'hidden', timeout: 60000 });
    await page.locator('[data-native-glyth-open=' + JSON.stringify(String(conversationNode.id)) + ']').click();
    await poll(read, value => value?.selection === conversationId && value.conversationStatus === 'ready' && value.capabilities?.canSend === false, 'Exact actual 424 input');
    await poll(() => page.locator('[data-lcos-native-chat-frame] [data-chat-message-id]').count(), count => count === 4, 'All four original messages');
    await input.waitFor(); const initial = await read(); assert.equal(initial.prompt, ''); assert.deepEqual(initial.refs, []); assert.equal(initial.windowCount, 0);
    if(diagnoseLibraryStack){
      stage=label+'-original-library-stack-diagnostic';
      await originalClick(page.getByRole('button',{name:'从材料库添加',exact:true}),'Original empty Composer library entry for stack probe');
      const search=page.getByRole('textbox',{name:'搜索',exact:true});await search.waitFor();await search.fill('Brief');
      const row=page.getByRole('button',{name:'Brief',exact:true}).first();await row.waitFor();await settle();
      report.libraryStackGeometry=await row.evaluate(element=>{
        const box=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}};
        const info=e=>{const s=getComputedStyle(e);return{tag:e.tagName,className:typeof e.className==='string'?e.className:undefined,attrs:Object.fromEntries([...e.attributes].filter(a=>a.name.startsWith('data-')||a.name==='style'||a.name==='role'||a.name==='aria-label').map(a=>[a.name,a.value])),rect:box(e),display:s.display,position:s.position,zIndex:s.zIndex,transform:s.transform,translate:s.translate,opacity:s.opacity,filter:s.filter,backdropFilter:s.backdropFilter,perspective:s.perspective,contain:s.contain,isolation:s.isolation,willChange:s.willChange,overflowX:s.overflowX,overflowY:s.overflowY,clipPath:s.clipPath,pointerEvents:s.pointerEvents};};
        const chain=e=>{const result=[];for(;e;e=e.parentElement)result.push(info(e));return result;};
        const hit=e=>{const r=e.getBoundingClientRect();return[[.15,.2],[.85,.2],[.5,.5],[.15,.8],[.85,.8]].map(([x,y])=>{const point={x:r.x+r.width*x,y:r.y+r.height*y},at=document.elementFromPoint(point.x,point.y);return{point,hit:at===e||e.contains(at),top:at?info(at):null,topAncestors:at?chain(at):[],elements:document.elementsFromPoint(point.x,point.y).map(info)};});};
        const search=document.querySelector('input[placeholder="搜索"],input[aria-label="搜索"]')??[...document.querySelectorAll('input')].find(e=>e.value==='Brief');
        const dock=document.querySelector('[data-lcos-surface-dock]'),canvas=document.querySelector('[data-canvas-container]');
        return{viewport:{width:innerWidth,height:innerHeight},row:info(element),rowAncestors:chain(element),rowHits:hit(element),search:search?info(search):null,searchAncestors:search?chain(search):[],dock:dock?info(dock):null,dockAncestors:dock?chain(dock):[],dockHits:dock?hit(dock):[],canvas:canvas?info(canvas):null,canvasAncestors:canvas?chain(canvas):[],libraryCandidates:[...document.querySelectorAll('[data-pile-gallery-chrome],[data-lcos-native-library-contexts],[data-native-library-browse-root],[role="dialog"]')].map(e=>({element:info(e),ancestors:chain(e)})),bodyChildren:[...document.body.children].map(info)};
      });
      const file=path.join(output,label+'-original-library-row-dock-stack.png');await page.screenshot({path:file});report.screenshots.push(file);await save();
      await page.keyboard.press('Escape');await search.waitFor({state:'hidden'});await settle();const final=await read();assert.equal(final.prompt,'');assert.deepEqual(final.refs,[]);assert.deepEqual(final.target,initial.target);cleanupUi=undefined;
      report.libraryStackUiUnchanged={prompt:'',refs:0,originalEscape:true};
      throw Error('Diagnostic-only stop after original empty-input Library row/Dock stack and EFP measurements; no Composer/ref edit, row click or full-chain PASS claim.');
    }
    if(diagnoseChatLayout){
      const layout=chatGeometry;
      stage=label+'-natural-empty-original-chat-layout';await settle();report.chatLayoutBefore=await layout();
      const firstFile=path.join(output,label+'-natural-empty-chat-layout.png');await page.screenshot({path:firstFile});report.screenshots.push(firstFile);
      const slot=report.chatLayoutBefore.slot,toastTop=Math.min(...report.chatLayoutBefore.toasts.map(t=>t.rect.y));
      const wheelPoint={x:Math.max(8,Math.min(viewport.width-8,slot.rect.x+12)),y:Math.max(slot.rect.y+4,Math.min(slot.rect.bottom-4,toastTop-4))};
      const wheelHit=await page.evaluate(point=>{const at=document.elementFromPoint(point.x,point.y);return{tag:at?.tagName,insideChat:!!at?.closest('[data-lcos-native-chat-frame]'),toast:!!at?.closest('[data-sonner-toast]')}},wheelPoint);
      assert.ok(wheelHit.insideChat&&!wheelHit.toast,'Diagnostic wheel begins inside the actual original Chat slot outside the notification');
      await page.mouse.move(wheelPoint.x,wheelPoint.y);await page.mouse.wheel(0,800);await page.waitForTimeout(150);
      report.chatLayoutAfterOriginalWheel=await layout();report.chatLayoutWheel={...wheelPoint,hit:wheelHit,delta:800};
      const secondFile=path.join(output,label+'-original-slot-wheel-chat-layout.png');await page.screenshot({path:secondFile});report.screenshots.push(secondFile);
      const emptyAfterWheel=await read();assert.equal(emptyAfterWheel.prompt,'');assert.deepEqual(emptyAfterWheel.refs,[]);
      // A second, exact-owned local draft measures the original textarea's
      // natural 100px cap. It uses the real input and original clear control;
      // no DOM positioning, store setters or send/admission calls are made.
      const longDraft=draftPrefix+'短高长稿布局诊断\n'+Array.from({length:12},(_,index)=>'第'+(index+1)+'行：仅在原输入测量自然高度，不发送。').join('\n');
      ownedDraft=longDraft;ownedPrompts.add(longDraft);stage=label+'-original-long-draft-chat-layout';
      await input.fill(longDraft);
      const longOwner=await poll(read,value=>value?.prompt===longDraft,'Original local long draft');
      assert.equal(longOwner.project,initial.project);assert.equal(longOwner.canvas,initial.canvas);assert.equal(longOwner.selection,initial.selection);assert.deepEqual(longOwner.target,initial.target);assert.deepEqual(longOwner.refs,[]);
      await poll(()=>input.evaluate(element=>element.getBoundingClientRect().height),height=>height>=99.5&&height<=100.5,'Original textarea reaches its actual 100px cap');
      await settle();report.chatLayoutLongDraft=await layout();
      report.chatLayoutLongDraftOwner={project:longOwner.project,canvas:longOwner.canvas,selection:longOwner.selection,target:longOwner.target,promptLength:longDraft.length,refs:0};
      const longFile=path.join(output,label+'-original-long-draft-chat-layout.png');await page.screenshot({path:longFile});report.screenshots.push(longFile);
      const longSlot=report.chatLayoutLongDraft.slot,longToastTop=Math.min(...report.chatLayoutLongDraft.toasts.map(t=>t.rect.y));
      const longWheelPoint={x:Math.max(8,Math.min(viewport.width-8,longSlot.rect.x+12)),y:Math.max(longSlot.rect.y+4,Math.min(longSlot.rect.bottom-4,longToastTop-4))};
      const longWheelHit=await page.evaluate(point=>{const at=document.elementFromPoint(point.x,point.y);return{tag:at?.tagName,insideChat:!!at?.closest('[data-lcos-native-chat-frame]'),toast:!!at?.closest('[data-sonner-toast]')}},longWheelPoint);
      assert.ok(longWheelHit.insideChat&&!longWheelHit.toast,'Long-draft wheel begins inside the original Chat slot outside the notification');
      await page.mouse.move(longWheelPoint.x,longWheelPoint.y);await page.mouse.wheel(0,800);await page.waitForTimeout(150);
      report.chatLayoutLongDraftAfterOriginalWheel=await layout();report.chatLayoutLongDraftWheel={...longWheelPoint,hit:longWheelHit,delta:800};
      const longWheelFile=path.join(output,label+'-original-long-draft-slot-wheel-chat-layout.png');await page.screenshot({path:longWheelFile});report.screenshots.push(longWheelFile);
      await input.fill('');const final=await poll(read,value=>value?.prompt===''&&value.refs.length===0,'Original UI clears the exact-owned local diagnostic draft');
      assert.equal(final.project,initial.project);assert.equal(final.canvas,initial.canvas);assert.equal(final.selection,initial.selection);assert.deepEqual(final.target,initial.target);
      (report.uiCleanup??=[]).push({label,originalControls:true,prompt:'',refs:0,diagnosticLongDraft:true});report.chatLayoutAfterOriginalClear=await layout();cleanupUi=undefined;
      throw Error('Diagnostic-only stop after natural empty Chat, actual slot wheels and exact-owned 100px local long draft cleared by the original input; no send/reference edit or full-chain PASS claim.');
    }
    if(viewport.width===360&&viewport.height===400){await settle();(report.actualChatGeometry??=[]).push({label,stage,name:'natural-empty-before-long-draft',...await chatGeometry()});}
    const draft = viewport.width===360&&viewport.height===400
      ?draftPrefix+label+'原长稿整链\n'+Array.from({length:12},(_,index)=>'第'+(index+1)+'行：仅在原输入验证摘录回程，不发送。').join('\n')
      :draftPrefix + label + '，只保留在原输入，不发送。';
    ownedDraft = draft; ownedPrompts.add(draft); await input.fill(draft); await input.press('Control+Home'); await input.press('ArrowRight'); await input.press('ArrowRight');
    inputOwner = await poll(read, value => value.prompt === draft && value.caret?.start === 2 && value.caret?.end === 2, 'Real original input caret 2');
    report.checks.push({ label, stage: 'exact-input', target: inputOwner.target, caret: inputOwner.caret, messages: 4, windowCount: 0 });
    await assertShortChatGeometry('00-original-long-draft-before-library');
    stage = label + '-library-original-CT'; const opened = await library(); assert.equal(opened.source.locator, undefined);
    if(!diagnoseFirstReopen&&!diagnoseViewerChrome&&!diagnoseEscapeFocus){
      stage=label+'-early-original-More-Escape';
      await originalClick(page.getByRole('button',{name:'阅读选项',exact:true}),'Original More early Escape check');
      await page.locator('[data-lcos-native-material-options]').waitFor({state:'visible'});const key=(await runtime()).requestKey;
      await page.keyboard.press('Escape');await page.locator('[data-lcos-native-material-options]').waitFor({state:'hidden'});await settle();
      assert.equal(await viewer().isVisible(),true,'Early first Escape retains the original Reader');assert.equal((await runtime()).requestKey,key);
      const focus=await poll(()=>page.evaluate(()=>{const element=document.activeElement;return{tag:element?.tagName,label:element?.getAttribute('aria-label'),html:element?.outerHTML.slice(0,500),insideViewer:!!element?.closest('[data-media-viewer]')}}),value=>value.tag==='BUTTON'&&value.label==='阅读选项','Original Popover restores actual More BUTTON without test focus',2000);
      report.checks.push({label,earlyMoreEscape:true,firstRetainedReader:true,actualFocus:focus,noForcedFocus:true});
      await closeReader();const returned=await sameInput(draft);assert.deepEqual(returned.refs,[]);assert.equal(returned.caret.start,2);assert.equal(returned.caret.end,2);
      report.checks.push({label,earlySecondEscape:true,sameInput:true,refs:0,caret:returned.caret});
      stage=label+'-library-original-CT';assert.equal((await library()).source.locator,undefined);
    }
    const sourceLines = await body().locator('[data-native-source-start-line][data-native-source-end-line]').evaluateAll(elements => elements.map(element => ({ tag: element.tagName,
      text: element.textContent, start: Number(element.getAttribute('data-native-source-start-line')), end: Number(element.getAttribute('data-native-source-end-line')) })));
    assert.ok(sourceLines.some(row => row.start === 1 && row.text.includes('PortaSplit MVP Brief')), 'Original CT h1 keeps actual Markdown source line 1');
    assert.ok(sourceLines.some(row => row.start === 3 && row.text.startsWith('Goal:')), 'Original CT first paragraph keeps actual Markdown source line 3');
    assert.ok(sourceLines.some(row => row.start === 5 && row.text.startsWith('Audience:')), 'Original CT second paragraph keeps actual Markdown source line 5');
    report.sourceLines.push({ label, sourceLines }); await shot('01-exact-original-CT-source-lines');
    if(diagnoseViewerChrome){
      const panel=await body().boundingBox();if(panel)await page.mouse.move(panel.x+80,panel.y+40);await settle();
      report.viewerChromeGeometry=await page.getByRole('button',{name:'阅读选项',exact:true}).evaluate(button=>{
        const box=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
        const info=e=>{const style=getComputedStyle(e);return{tag:e.tagName,className:typeof e.className==='string'?e.className:undefined,role:e.getAttribute('role'),inline:e.getAttribute('style'),rect:box(e),position:style.position,bottom:style.bottom,top:style.top,left:style.left,right:style.right,transform:style.transform,translate:style.translate,zIndex:style.zIndex,pointerEvents:style.pointerEvents,opacity:style.opacity,display:style.display,contain:style.contain,parentIsBody:e.parentElement===document.body};};
        const ancestors=[];for(let e=button;e;e=e.parentElement)ancestors.push(info(e));
        return{viewport:{width:innerWidth,height:innerHeight},buttonAncestors:ancestors,toasters:[...document.querySelectorAll('[data-sonner-toaster]')].map(e=>({...info(e),html:e.outerHTML.slice(0,700)})),toasts:[...document.querySelectorAll('[data-sonner-toast]')].map(e=>({...info(e),text:e.textContent})),viewer:[...document.querySelectorAll('[data-media-viewer]')].map(info)};
      });
      await shot('02-original-viewer-toolbar-toast-diagnostic');throw Error('Diagnostic-only stop after original Viewer/Toast DOM geometry; no full-chain PASS claim.');
    }
    const mouseSelection = async paragraphIndex => {
      const paragraph = body().locator('p').nth(paragraphIndex); await paragraph.waitFor();
      // Range objects below are read-only geometry probes, never installed in
      // window.Selection. Select a short single physical line via the mouse.
      let points;
      for (let attempt = 0; attempt < 14; attempt++) {
        points = await paragraph.evaluate(element => {
          const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT); let text;
          while ((text = walker.nextNode()) && !(text.textContent ?? '').trim()) {}
          if (!text) return null;
          const viewport = element.closest('.native-material-text-scroll').getBoundingClientRect(), value = text.textContent;
          const ranges = [];
          for (let offset = 0; offset < Math.min(34, value.length); offset++) {
            const range = document.createRange(); range.setStart(text, offset); range.setEnd(text, offset + 1);
            const r = range.getBoundingClientRect(); ranges.push({ offset, x: r.x, y: r.y, right: r.right, bottom: r.bottom, height: r.height, width: r.width });
          }
          const first = ranges.find(r => r.width > 0 && r.height > 0), sameLine = first && ranges.filter(r => Math.abs(r.y - first.y) < 1);
          const end = sameLine?.at(Math.min(17, sameLine.length - 1));
          if (!first || !end || end.offset <= first.offset + 4) return null;
          const startPoint = { x: first.x + Math.min(.5, first.width / 6), y: first.y + first.height / 2 };
          const endPoint = { x: end.right - Math.min(.5, end.width / 6), y: end.y + end.height / 2 };
          const visible = first.y >= viewport.top + 4 && first.bottom <= viewport.bottom - 4;
          const hit = p => document.elementFromPoint(p.x, p.y)?.closest('p') === element;
          return { start: startPoint, end: endPoint, visible, hit: hit(startPoint) && hit(endPoint), viewport: { x: viewport.x, y: viewport.y, right: viewport.right, bottom: viewport.bottom }, paragraph: element.textContent };
        });
        if (points?.visible && points.hit) break;
        const box = await scroller().boundingBox(); assert.ok(box);
        await page.mouse.move(box.x + Math.min(box.width / 2, 60), box.y + box.height / 2);
        const delta = points ? points.start.y < points.viewport.y + 4 ? points.start.y - points.viewport.y - 12
          : points.end.y > points.viewport.bottom - 4 ? points.end.y - points.viewport.bottom + 12 : 40 : 100;
        await page.mouse.wheel(0, delta); await page.waitForTimeout(100);
      }
      assert.ok(points?.visible && points.hit, 'Actual selectable paragraph has an unobstructed physical line');
      await page.mouse.move(points.start.x, points.start.y); await page.mouse.down(); await page.mouse.move(points.end.x, points.end.y, { steps: 18 }); await page.mouse.up();
      const selected = await page.evaluate(() => { const selection = document.getSelection(), root = document.querySelector('[data-lcos-native-text-reading] .lcos-reader-measure');
        return { text: selection?.toString(), ranges: selection?.rangeCount, within: !!selection?.rangeCount && root.contains(selection.getRangeAt(0).startContainer) && root.contains(selection.getRangeAt(0).endContainer) }; });
      assert.ok(selected.within && selected.ranges === 1 && selected.text?.trim().length >= 5, 'Real mouse produces one non-empty selection in this original CT');
      const actualIndex = await page.evaluate(() => window.__TEXT_LOCATION_INDEX_READ__?.());
      assert.ok(points.paragraph.includes(selected.text.trim())); report.selections.push({ label, stage, paragraphIndex, ...points, selected, actualIndex });
      return selected.text.trim();
    };
    const citeMouse = async (paragraphIndex, previousText, previousLocations) => {
      const quote = await mouseSelection(paragraphIndex);
      await originalClick(page.getByRole('button', { name: '摘录到输入', exact: true }), 'Original selection excerpt action');
      await viewer().waitFor({ state: 'hidden' }); await input.waitFor();
      const value = await poll(read, next => next.refs.length === 1 && next.refs[0].sourceLocations?.length === previousLocations.length + 1, 'Original same-version reference receives the new exact position');
      ownedPrompts.add(value.prompt);
      await settle();const libraryVisibleCount=await page.locator('[data-library-panel]:visible').count(),libraryVisible=libraryVisibleCount>0;
      const actualGeometry=await chatGeometry(),libraryPanels=await page.locator('[data-library-panel]').evaluateAll(elements=>elements.map(element=>{const r=element.getBoundingClientRect(),s=getComputedStyle(element);return{rect:{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom},position:s.position,zIndex:s.zIndex,parentIsBody:element.parentElement===document.body};}));
      (report.libraryInputReturns??=[]).push({label,stage,kind:'explicit-excerpt-direct-input',libraryVisible,libraryVisibleCount,libraryPanels,actualGeometry,extraHeaderBackUsed:false,prompt:value.prompt,caret:value.caret,refs:value.refs,target:value.target});
      assert.equal(libraryVisible,false,'Explicit excerpt must close the original Library and return directly to the current input; no extra Back may hide a product gap');
      const locations = value.refs[0].sourceLocations; assert.deepEqual(locations.slice(0, previousLocations.length), previousLocations);
      const added = locations.at(-1); assert.equal(added.kind, 'selection'); assert.equal(added.textRange.quote, quote);
      assert.equal(added.textRange.end - added.textRange.start, quote.length); assert.ok(value.prompt.includes(quote));
      await sameInput(value.prompt, locations); assert.ok(value.prompt.length > previousText.length, 'Excerpt inserts source text into the same input');
      const start = inputOwner.caret.start, end = inputOwner.caret.end;
      if (previousLocations.length === 0) {
        assert.ok(value.prompt.startsWith(previousText.slice(0, start)), 'Original prefix at captured caret is kept');
        assert.ok(value.prompt.endsWith(previousText.slice(end)), 'Original suffix at captured caret is kept');
      }
      const selection = await input.evaluate(element => ({ start: element.selectionStart, end: element.selectionEnd, text: element.value }));
      assert.equal(selection.text, value.prompt); assert.equal(selection.start, value.caret.start); assert.equal(selection.end, value.caret.end);
      assert.equal(value.caret.start, value.caret.end); report.checks.push({ label, stage, quote, location: added, refs: value.refs.length, caret: value.caret, textarea: selection, target: value.target });
      await assertShortChatGeometry('chat-after-excerpt-'+(previousLocations.length===0?'A':'B'));
      return value;
    };
    const openChip = async () => { await originalClick(page.locator('[data-lcos-composer-ref] .native-composer-reference-open'), 'Original single material reference inspect'); return exactSource(await waitReader()); };
    const assertHighlight = async locator => {
      const value = await poll(locationGeometry, next => next.state === 'ready' && next.highlights.flatMap(row => row.ranges).some(row => row.text === locator.textRange.quote), 'Actual CSS source Highlight for selected exact position');
      const exact = value.highlights.flatMap(row => row.ranges).filter(row => row.text === locator.textRange.quote); assert.equal(exact.length, 1);
      assert.ok(exact[0].rects.some(rect => rect.width > 0 && rect.height > 0 && rect.y >= value.viewport.y - 1 && rect.bottom <= value.viewport.bottom + 1), 'Actual highlighted Range is visible in the original Reader scroller');
      return value;
    };
    stage = label + '-mouse-A-excerpt'; const first = await citeMouse(0, draft, []); await shot('02-excerpt-A-same-input');
    stage = label + '-chip-single-A'; let chip = await openChip(); assert.deepEqual(chip.source.locator, first.refs[0].sourceLocations[0]);
    if(diagnoseFirstReopen){report.resolveFirstCallTrace=await poll(()=>page.evaluate(()=>window.__R02_RESOLVE_TRACE__??[]),rows=>rows.length>0,'Real original resolver first-call observation');await shot('03-first-reopen-diagnostic');throw Error('Diagnostic-only stop after the real first resolver call; no full-chain PASS claim.');}
    await assertHighlight(first.refs[0].sourceLocations[0]); await shot('03-chip-single-A-highlight');
    stage = label + '-mouse-B-excerpt'; const second = await citeMouse(1, first.prompt, first.refs[0].sourceLocations); await shot('04-excerpt-B-still-one-ref');
    const locations = second.refs[0].sourceLocations; assert.equal(locations.length, 2); assert.notDeepEqual(locations[0].textRange, locations[1].textRange);
    stage = label + '-chip-multiple-no-default'; chip = await openChip(); assert.equal(chip.source.locator.kind, 'selection');
    assert.deepEqual(chip.source.locator.locations, locations); assert.equal(chip.source.locator.selected, undefined);
    await poll(locationGeometry, value => value.state === 'choice', 'Unselected multi-location reference honestly asks for a location');
    assert.equal((await locationGeometry()).highlights.length, 0, 'Multiple locations do not silently choose A or B'); await shot('05-chip-multiple-no-default');
    const selectLocation = async (index, priorKey) => {
      await originalClick(page.getByRole('button', { name: '阅读选项', exact: true }), 'Original Reader More');
      const section = page.locator('section[data-native-material-location-options]'); await section.waitFor();
      assert.equal(await section.locator('button[data-native-material-location-index]').count(), 2);
      const action = section.locator('button[data-native-material-location-index="' + (index + 1) + '"]'); assert.equal(await action.isDisabled(), false, 'New operation has no stale More busy state');
      await originalClick(action, 'Original position ' + (index + 1));
      const next = await poll(runtime, value => value.phase === 'open' && value.requestKey !== priorKey && value.source?.locator?.selected?.textRange?.quote === locations[index].textRange.quote, 'Same original Viewer opens a new exact-position request');
      exactSource(next); assert.deepEqual(next.source.locator.selected, locations[index]); await assertHighlight(locations[index]);
      await settle();
      const handoffFocus=await page.evaluate(()=>{const element=document.activeElement,root=document.querySelector('[data-media-viewer]');return{tag:element?.tagName,label:element?.getAttribute('aria-label'),role:element?.getAttribute('role'),owner:element?.getAttribute('data-lcos-native-viewer-owner'),elementIsViewerRoot:element===root,insideViewer:!!element?.closest('[data-media-viewer]'),html:element?.outerHTML.slice(0,500)};});
      report.checks.push({label,stage,newRequestHandoffFocus:handoffFocus,requestKey:next.requestKey,noUserFocusAfterSelection:true});
      assert.equal(handoffFocus.elementIsViewerRoot,true,'Same-version request handoff focuses the actual original Viewer root before any further More click');
      assert.equal(handoffFocus.owner,String(next.requestKey));
      await fullHit(page.getByRole('button',{name:'阅读选项',exact:true}),'Original More after same-version location switch');
      const chrome=(await locationGeometry()).chrome;assert.ok(chrome?.buttons.length>0);assert.ok(chrome.buttons.every(button=>button.hits.every(Boolean)),'All original Reader action buttons remain full-hit');
      const notice=chrome.toasts.find(toast=>toast.text.includes('画布中的任务暂时无法更新'));assert.ok(notice,'Original truthful failure notice remains visible');
      assert.ok(notice.buttons.some(button=>button.label==='重试更新'&&button.hits.every(Boolean)),'Original notice retry retains its full hit without being covered by the Reader bar');
      return next;
    };
    stage = label + '-More-A'; chip = await selectLocation(0, chip.requestKey); await shot('06-original-More-A-exact-highlight');
    stage = label + '-More-B'; chip = await selectLocation(1, chip.requestKey); await shot('07-original-More-B-exact-highlight');
    if(diagnoseEscapeFocus){
      report.escapeBefore=await page.evaluate(()=>{const element=document.activeElement,root=document.querySelector('[data-media-viewer]');window.__R02_KEY_TRACE__=[];
        const observe=where=>event=>{if(event.key==='Escape')window.__R02_KEY_TRACE__.push({where,type:event.type,phase:event.eventPhase,target:event.target?.tagName,targetLabel:event.target?.getAttribute?.('aria-label'),defaultPrevented:event.defaultPrevented,cancelBubble:event.cancelBubble,active:document.activeElement?.tagName,activeLabel:document.activeElement?.getAttribute('aria-label')})};
        document.addEventListener('keydown',observe('document-capture'),true);document.addEventListener('keydown',observe('document-bubble'));
        root.addEventListener('keydown',observe('original-root-capture'),true);root.addEventListener('keydown',observe('original-root-bubble'));
        return{active:{tag:element?.tagName,html:element?.outerHTML.slice(0,900),label:element?.getAttribute('aria-label'),role:element?.getAttribute('role'),insideViewer:!!element?.closest('[data-media-viewer]')},menus:[...document.querySelectorAll('[data-lcos-native-material-options]')].map(element=>({state:element.closest('[data-state]')?.getAttribute('data-state'),rect:element.getBoundingClientRect().toJSON()}))};
      });report.escapeBefore.runtime=await runtime();
      await page.keyboard.press('Escape');await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await settle();
      report.escapeAfter={runtime:await runtime(),ui:await read(),trace:await page.evaluate(()=>window.__R02_KEY_TRACE__),focus:await page.evaluate(()=>{const element=document.activeElement;return{tag:element?.tagName,label:element?.getAttribute('aria-label'),html:element?.outerHTML.slice(0,900),insideViewer:!!element?.closest('[data-media-viewer]')}})};
      await shot('08-original-Escape-focus-diagnostic');throw Error('Diagnostic-only stop after real A/B and original Escape focus/propagation observation; no full-chain PASS claim.');
    }
    stage = label + '-More-first-Escape';
    await originalClick(page.getByRole('button',{name:'阅读选项',exact:true}),'Original More before Escape hierarchy');
    await page.locator('[data-lcos-native-material-options]').waitFor({state:'visible'});
    await page.keyboard.press('Escape');await page.locator('[data-lcos-native-material-options]').waitFor({state:'hidden'});
    assert.equal(await viewer().isVisible(),true,'First Escape closes the original More only, retaining this same Reader');
    const afterMenuEscape=exactSource(await runtime());assert.equal(afterMenuEscape.requestKey,chip.requestKey,'First Escape does not replace the material request');
    const originalFocus=await page.evaluate(()=>{const element=document.activeElement;return{tag:element?.tagName,label:element?.getAttribute('aria-label'),title:element?.getAttribute('title'),role:element?.getAttribute('role'),className:element?.className,html:element?.outerHTML.slice(0,600),insideViewer:!!element?.closest('[data-media-viewer]')};});
    report.checks.push({label,originalMoreEscape:true,firstEscapeRetainedReader:true,requestKey:afterMenuEscape.requestKey,actualFocus:originalFocus,noForcedFocus:true});
    assert.equal(originalFocus.tag,'BUTTON');assert.equal(originalFocus.label,'阅读选项');assert.equal(originalFocus.insideViewer,true);
    stage = label + '-escape-same-input'; await closeReader(); const returned = await sameInput(second.prompt, locations);
    assert.deepEqual(returned.caret, second.caret, 'Escape returns the same original input caret');
    const returnedCaret = await input.evaluate(element => ({ start: element.selectionStart, end: element.selectionEnd }));
    assert.equal(returnedCaret.start, second.caret.start); assert.equal(returnedCaret.end, second.caret.end); await shot('08-Esc-same-input-and-ref');
    await assertShortChatGeometry('chat-after-two-layer-Escape');
    stage = label + '-library-no-locator-resume'; const noLocator = await library(); assert.equal(noLocator.source.locator, undefined);
    const readerKey=JSON.stringify([projectId,artifact.id,revision.id]);
    let resumeBefore = await locationGeometry();
    const scrollObservation={label,beforeWheel:resumeBefore,samples:[]};(report.resumeAttempts??=[]).push(scrollObservation);
    const settledReadingGeometry=async()=>{
      let previous,changedAt=Date.now(),stableFrames=0;
      return(await poll(async()=>{
        await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)));
        const geometry=await locationGeometry(),shell=(await read()).readerPositions[readerKey];
        const matches=!!shell&&Math.abs(shell.scrollTop-geometry.scrollTop)<1&&Math.abs(shell.zoom-Number(geometry.zoom)*100)<.01;
        const sample={scrollTop:geometry.scrollTop,scrollHeight:geometry.scrollHeight,clientHeight:geometry.clientHeight,zoom:geometry.zoom,state:geometry.state,shell,matches};
        if(!previous||JSON.stringify(previous)!==JSON.stringify(sample)){scrollObservation.samples.push(sample);previous=sample;changedAt=Date.now();stableFrames=0;}
        else stableFrames++;
        scrollObservation.stability={stableFrames,stableFor:Date.now()-changedAt,matches};
        return{geometry,stableFor:Date.now()-changedAt,stableFrames,matches};
      },value=>value.geometry.viewport&&value.matches&&value.stableFor>=160&&value.stableFrames>=3,'Actual original wheel geometry and Shell saved position match across multiple stable RAF observations',5000)).geometry;
    };
    // A small real Brief need not overflow on desktop. On narrow screens, use
    // the existing reader zoom controls, then a real wheel, to verify nonzero
    // same-revision scroll memory without manufacturing document content.
    if (viewport.width === 360) {
      await page.locator('.native-material-reading-options summary').click();
      for (let count = 0; count < 8 && !(await page.getByRole('button', { name: '放大阅读字号', exact: true }).isDisabled()); count++)
        await page.getByRole('button', { name: '放大阅读字号', exact: true }).click();
      await page.locator('.native-material-reading-options summary').click();
      const box = await scroller().boundingBox(); assert.ok(box); await page.mouse.move(box.x + box.width/2, box.y + box.height/2); await page.mouse.wheel(0, 240);
      resumeBefore=await settledReadingGeometry();assert.ok(resumeBefore.scrollTop>0,'Original narrow Brief has real nonzero scroll after the actual wheel settles');
    }
    const savedInput = await read();
    const storedPosition=savedInput.readerPositions[readerKey];
    if(viewport.width===360)assert.ok(storedPosition,'Real nonzero narrow scroll must be saved by the original owner');
    else if(!storedPosition)assert.equal(resumeBefore.scrollTop,0,'Absent original memory is legitimate only for untouched zero-scroll desktop content');
    const savedPosition = storedPosition??{scrollTop:0,zoom:100}; assert.ok(Math.abs(savedPosition.scrollTop - resumeBefore.scrollTop) < 1);
    Object.assign(scrollObservation,{beforeClose:resumeBefore,savedBeforeClose:savedPosition});await save();
    await closeReader(); await sameInput(second.prompt, locations);
    scrollObservation.savedAfterClose=(await read()).readerPositions[readerKey];await save();
    const reopened = await library(); assert.equal(reopened.source.locator, undefined);
    scrollObservation.reopenedSource=reopened.source;scrollObservation.restoreSamples=[];
    const resumed = await poll(async()=>{const geometry=await locationGeometry(),sample={scrollTop:geometry.scrollTop,scrollHeight:geometry.scrollHeight,clientHeight:geometry.clientHeight,zoom:geometry.zoom,state:geometry.state};
      if(JSON.stringify(scrollObservation.restoreSamples.at(-1))!==JSON.stringify(sample)){scrollObservation.restoreSamples.push(sample);await save();}return geometry;
    }, value => Math.abs(value.scrollTop - savedPosition.scrollTop) < 1 && value.state === 'none', 'No-locator original Library restores its real same-version scroll position');
    report.resume.push({ label, sourceLocatorAbsent: true, saved: savedPosition,storedEntryPresent:!!storedPosition,defaultZeroUsed:!storedPosition, before: resumeBefore, reopened: resumed, nonzeroMeasured: resumeBefore.scrollTop > 0 });
    await shot('09-original-library-no-locator-resume');
    if (viewport.width === 360) {
      await page.locator('.native-material-reading-options summary').click(); await page.getByRole('button', { name: '恢复阅读字号', exact: true }).click();
      await page.locator('.native-material-reading-options summary').click();
    }
    if (revisionRows.length > 1) {
      stage = label + '-real-history-clear-locator';
      await closeReader(); chip = await openChip(); await page.getByRole('button', { name: '阅读选项', exact: true }).click();
      const revisions = page.getByRole('combobox', { name: '阅读版本', exact: true }), other = revisionRows.find(row => row.id !== revision.id);
      await revisions.selectOption(other.id); const historical = await poll(runtime, value => value.phase === 'open' && value.source?.revisionId === other.id, 'Pre-existing real alternate revision');
      assert.equal(historical.source.locator, undefined, 'Explicit real version switch clears old location');
      report.checks.push({ label, realHistoricalSwitch: true, revisionId: other.id, oldLocatorCleared: true });
    } else report.checks.push({ label, realHistoricalSwitch: 'not available', reason: 'The actual Brief has one stored revision; switch/clear semantics remain covered by isolated actual-Viewer tests. No revision was fabricated.' });
    await closeReader(); await sameInput(second.prompt, locations);
    await cleanupUi(); cleanupUi = undefined; await shot('10-original-input-clean');
    report.checks.push({ label, completeMouseSelectionChain: true, exactCT: true, oneSemanticReference: true, locations: 2, originalMoreChoices: true, EscToSameReceiverMessageOperation: true, originalFullHit: true });
    await context.close(); page = undefined; currentRead = undefined;
  }
  const after = await facts('facts-after', before.file); report.factsAfter = after.summary; report.factsUnchanged = true;
  compareBytes(await readFileBytes([...bytesBefore.keys()]), bytesBefore); report.originalFileBytesUnchanged = true;
  assert.deepEqual(report.external, []); assert.deepEqual(report.protocols, []); assert.deepEqual(report.pageErrors, []); assert.deepEqual(report.routeErrors, []);
  assert.equal(report.forwardedWrites, 0); assert.equal(report.modelCalls, 0); report.passed = true;
} catch (error) {
  report.error = safe(error.stack ?? error); process.exitCode = 1;
  if (page) { report.failureUi = await currentRead?.().catch(() => null); report.failureIndex = await page.evaluate(() => window.__TEXT_LOCATION_INDEX_READ__?.()).catch(() => null);
    report.failureFocus=await page.evaluate(()=>{const element=document.activeElement;return{tag:element?.tagName,label:element?.getAttribute('aria-label'),role:element?.getAttribute('role'),html:element?.outerHTML.slice(0,900),insideViewer:!!element?.closest('[data-media-viewer]'),menus:[...document.querySelectorAll('[data-lcos-native-material-options]')].map(node=>({state:node.closest('[data-state]')?.getAttribute('data-state'),rect:node.getBoundingClientRect().toJSON()}))};}).catch(()=>null);
    report.resolveFirstCallTrace=await page.evaluate(()=>window.__R02_RESOLVE_TRACE__??[]).catch(()=>[]);
    report.failureBody = safe(await page.locator('body').innerText().catch(() => ''));
    await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {}); }
} finally {
  try { await cleanupUi?.(); } catch (error) { report.uiCleanupError = safe(error.stack ?? error); report.passed = false; process.exitCode = 1; }
  await browser?.close();
  if (before) try { const final = await facts('facts-final', before.file); report.factsFinal = final.summary; report.finalFactsUnchanged = true; }
  catch (error) { report.factsError = safe(error.stack ?? error); report.passed = false; process.exitCode = 1; }
  if (bytesBefore) try { compareBytes(await readFileBytes([...bytesBefore.keys()]), bytesBefore); report.finalOriginalFileBytesUnchanged = true; }
  catch (error) { report.fileBytesError = safe(error.stack ?? error); report.passed = false; process.exitCode = 1; }
  await save();
}
console.log(JSON.stringify({ passed: report.passed, expectedPid, output, error: report.error, finalFactsUnchanged: report.finalFactsUnchanged,
  finalOriginalFileBytesUnchanged: report.finalOriginalFileBytesUnchanged, blockedWrites: report.blockedWrites.length,
  external: report.external, protocols: report.protocols, pageErrors: report.pageErrors, routeErrors: report.routeErrors }, null, 2));
