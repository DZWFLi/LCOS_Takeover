import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { currentGen2Root } from '../lab/current-gen2-resources.mjs';
import { parseOriginalDonorScript } from '../lab/agent-node-transform.mjs';
const argument = name => process.argv.find(value => value.startsWith('--' + name + '='))?.slice(name.length + 3);
const origin = new URL(argument('base-url') ?? 'http://127.0.0.1:56311').origin;
assert.equal(new URL(origin).hostname, '127.0.0.1');
const projectId = 'disposable-surface-core-facade', prefix = '/api/lcos/core/projects/' + projectId;
const output = path.resolve(import.meta.dirname, '../output/Scope逐项查看_20261022/真实页面/' + new Date().toISOString().replace(/[:.]/g, '-'));
await fs.mkdir(output, { recursive: true });
const health = await (await fetch(origin + '/health')).json();
assert.equal(health.runtimeLabel, 'isolated-node-carry-20261020');
if (argument('expected-pid')) assert.equal(health.pid, Number(argument('expected-pid')));
const report = { passed: false, origin, pid: health.pid, browser: 'Chrome / Playwright Core', browserPlugin: 'not available',
  output, checks: [], screenshots: [], pageErrors: [], consoleErrors: [], writes: [], requests: [], blockedExternal: [], storeMutation: false, models: 0 };
const get = async address => { const response = await fetch(origin + address, { redirect: 'error', cache: 'no-store' });
  const result = await response.json(); assert.ok(response.ok && (result.ok === true || result.code === 0), address); return result.value ?? result.data; };
const facts = async () => ({ graph: await get(prefix + '/graph'), presentations: await get(prefix + '/presentations'),
  workspaces: await get(prefix + '/workspaces'), runs: await get(prefix + '/runs'), canvas: await get('/api/canvas/v1/canvases/surface-core-main') });
const warehouse = await get(prefix + '/warehouse?kinds=context,workflow&limit=100');
const saved = warehouse.items.find(item => item.kind === 'context'), method = warehouse.items.find(item => item.kind === 'workflow');
assert.ok(saved && method);
const { chromium } = createRequire(path.join(currentGen2Root, 'package.json'))('playwright-core');
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--disable-background-networking', '--no-first-run'] });
let page, failureArtifact, missingViewId;
try {
  const context = await browser.newContext({ viewport: { width: 1880, height: 1120 }, locale: 'zh-CN', serviceWorkers: 'block' });
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (['http:', 'https:'].includes(url.protocol) && url.origin !== origin) { report.blockedExternal.push(url.origin); return route.abort(); }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
      report.writes.push({ method: request.method(), path: url.pathname, body: request.postData() });
      if (/\/runs(?:$|\/)|collaboration-send|conversation-continuations|agent\/gateway/.test(url.pathname)) return route.abort();
    }
    if (request.method() === 'GET' && url.pathname.startsWith('/api/lcos/core/')) report.requests.push(url.pathname);
    if (missingViewId && request.method() === 'GET' && url.pathname === prefix + '/graph') {
      const response = await route.fetch(), body = await response.json();
      body.value.artifactViews = body.value.artifactViews.filter(view => view.id !== missingViewId); missingViewId = undefined;
      return route.fulfill({ response, json: body });
    }
    if (process.argv.includes('--diagnostic') && url.pathname === '/assets/page-Da_DfwiK.js') {
      const response = await route.fetch(); let source = await response.text(); const ast = parseOriginalDonorScript(source, 'page-Da_DfwiK.js');
      const walk = (node, fn) => { if (!node?.type) return; fn(node); for (const value of Object.values(node)) {
        if (Array.isArray(value)) value.forEach(child => walk(child, fn)); else if (value?.type) walk(value, fn); } };
      let row; walk(ast, node => { if (node.type === 'VariableDeclarator' && node.id?.name === 'Zp') row = node; }); assert.ok(row);
      const edits = []; walk(row, node => { if (node.type === 'CallExpression' && node.callee?.name === 'C') edits.push({ start: node.start, end: node.end,
        text: '((window.__BROWSE_CLOSE_TRACE__??=[]).push({name:e.name,time:Date.now(),call:' + JSON.stringify(source.slice(node.start, node.end)) + ',stack:new Error().stack}),' + source.slice(node.start, node.end) + ')' }); });
      for (const edit of edits.sort((a, b) => b.start - a.start)) source = source.slice(0, edit.start) + edit.text + source.slice(edit.end);
      return route.fulfill({ response, body: source });
    }
    if (failureArtifact && request.method() === 'GET' && url.pathname === '/api/lcos/core/artifacts/' + failureArtifact) {
      failureArtifact = undefined;
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, error: { code: 'TEST_UNAVAILABLE', message: 'Controlled one-request read failure' } }) });
    }
    if (url.pathname === '/lcos/agent-ui.js') {
      const response = await route.fetch(), source = await response.text();
      assert.ok(source.includes('useLcosShellStore =') && source.includes('nativeLibraryScopeMembers'));
      return route.fulfill({ response, body: source + `\nif(${process.argv.includes('--diagnostic')}){const original=LCOSNativeLibraryPreviewRetain;LCOSNativeLibraryPreviewRetain=(...args)=>{const value=original(...args);(window.__BROWSE_RETAIN_TRACE__??=[]).push({time:Date.now(),reason:args[1],target:args[2]?.target?.outerHTML?.slice(0,200),value});return value;};}
window.__SCOPE_BROWSE_READ__=()=>{const shell=useLcosShellStore.getState(),canvas=useCanvasStore.getState(),drop=useLcosDropStore.getState();return{projectId:shell.projectId,canvasId:canvas.canvasId,prompt:shell.composerPrompt,caret:shell.composerCaret,windows:shell.windows,references:useLcosReferenceStore.getState().draft.orderedEntityRefs,stage:shell.stage,drop:{status:drop.state.status,resolution:drop.resolution},closeTrace:window.__BROWSE_CLOSE_TRACE__,retainTrace:window.__BROWSE_RETAIN_TRACE__,apiCurrent:canvas.rfInstance===window.__LCOS_NODE_LAB__?.api}};` });
    }
    return route.continue();
  });
  await context.routeWebSocket('**/*', socket => socket.close());
  page = await context.newPage(); page.setDefaultTimeout(20000);
  page.on('pageerror', error => report.pageErrors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text()); });
  const read = () => page.evaluate(() => window.__SCOPE_BROWSE_READ__());
  const shot = async name => { const file = path.join(output, name + '.png'); await page.screenshot({ path: file }); report.screenshots.push(file); };
  const viewer = page.locator('[data-media-viewer]');
  const waitViewer = async () => {
    await viewer.waitFor({ state: 'visible' });
    await page.getByRole('button', { name: '返回库内预览', exact: true }).waitFor({ state: 'visible' });
    await page.waitForFunction(async () => { const runtime = (await import('/assets/course-api-base-url-CifxI1ia.js')).LCOSNativeMaterialViewerRuntime;
      const state = runtime.getState(); return state.phase === 'open' && !!state.session?.lcosControlled?.requestKey
        && !!document.querySelector('[data-media-viewer]') && !document.querySelector('[data-lcos-native-material-state]'); });
  };
  const readViewer = () => page.evaluate(async () => { const state = (await import('/assets/course-api-base-url-CifxI1ia.js')).LCOSNativeMaterialViewerRuntime.getState();
    return { phase: state.phase, key: state.session?.lcosControlled?.requestKey, title: state.session?.media?.title,
      active: document.activeElement?.outerHTML?.slice(0, 300) }; });
  const library = page.locator('[data-library-view="library"]');
  const receiver = id => page.locator('[data-native-library-scope-drop-target="' + id + '"]');
  const memberButton = (scope, title, kind = '查看') => receiver(scope.entityRef.id).getByRole('button', { name: kind + ' ' + title, exact: true });
  await page.goto(origin + '/canvas/surface-core-main', { waitUntil: 'domcontentloaded' });
  await page.locator('[data-lcos-professional-surface-state="ready"]').waitFor({ state: 'attached', timeout: 60000 });
  await page.getByTestId('common-loading-overlay').waitFor({ state: 'hidden', timeout: 60000 });
  const input = page.getByRole('textbox', { name: 'Composer 输入', exact: true }); await input.waitFor();
  const draft = 'Scope逐项查看：这段输入不发送，也不覆盖。'; await input.fill(draft);
  await input.evaluate(element => element.setSelectionRange(4, 7));
  const before = await facts(), beforeUI = await read(), writeStart = report.writes.length;
  report.identity = { url: page.url(), title: await page.title(), nonBlank: (await page.locator('body').innerText()).length > 100 };
  assert.equal(report.identity.url, origin + '/canvas/surface-core-main'); assert.equal(report.identity.nonBlank, true);
  const contextPresentation = before.presentations.find(row => row.id === 'presentation:context:' + saved.entityRef.id);
  assert.ok(contextPresentation.state.memberEntityRefs.some(ref => ref.type === 'scope' && ref.id === method.entityRef.id));
  const view = before.graph.artifactViews.find(view => view.id === contextPresentation.state.memberViewIds[0]);
  const image = before.graph.artifacts.find(artifact => artifact.id === view.artifactId);
  await page.getByTestId('canvas-dockbar-assets-btn').click(); await library.waitFor();
  const search = library.getByRole('textbox', { name: '搜索', exact: true }); await search.fill('合成');
  await library.getByRole('button', { name: saved.title, exact: true }).click(); await receiver(saved.entityRef.id).waitFor();
  await memberButton(saved, image.title).waitFor(); await memberButton(saved, method.title, '进入').waitFor(); await shot('01-context-items');
  assert.equal(await page.getByText(/另有.*项关联内容/).count(), 0);
  report.checks.push('原 Library 搜索行进入原 TS；整份 Workflow 显示独立入口，成员未展开写回');
  await memberButton(saved, image.title).click(); await viewer.waitFor(); await waitViewer();
  await page.getByRole('button', { name: '返回库内预览', exact: true }).waitFor();
  const imageFile = before.graph.artifactRevisions.find(revision => revision.id === view.revisionId).fileRecordId;
  assert.ok(report.requests.some(address => address.includes(encodeURIComponent(imageFile)) || address.includes(imageFile)));
  report.readMembers = [{ scopeId: saved.entityRef.id, viewId: view.id, revisionId: view.revisionId, fileRecordId: imageFile }];
  await shot('02-exact-image-viewer');
  const images = viewer.locator('img'), largest = (await images.evaluateAll(elements => elements.map((element, index) => ({ index,
    area: element.getBoundingClientRect().width * element.getBoundingClientRect().height })))).sort((a, b) => b.area - a.area)[0];
  assert.ok(largest); await images.nth(largest.index).click(); await page.locator('[data-media-viewer-inspecting-image="true"]').waitFor();
  await page.keyboard.press('Escape'); await page.locator('[data-media-viewer-inspecting-image="true"]').waitFor({ state: 'hidden' });
  await viewer.waitFor({ state: 'visible' });
  await page.getByRole('button', { name: '返回库内预览', exact: true }).click(); await viewer.waitFor({ state: 'hidden' });
  await memberButton(saved, image.title).waitFor(); await page.waitForFunction(() => document.activeElement?.hasAttribute('data-native-scope-member'));
  assert.equal(await search.inputValue(), '合成'); assert.equal((await read()).prompt, draft);
  report.checks.push('确版图片经原 Viewer 查看；原返回按钮回到同一 Scope、同一成员焦点和搜索');
  await memberButton(saved, method.title, '进入').click(); await receiver(method.entityRef.id).waitFor();
  const workflowPresentation = before.presentations.find(row => row.id === 'presentation:workflow:' + method.entityRef.id);
  const textView = before.graph.artifactViews.find(view => view.id === workflowPresentation.state.memberViewIds[0]);
  const text = before.graph.artifacts.find(artifact => artifact.id === textView.artifactId);
  await memberButton(method, text.title).waitFor(); await shot('03-linked-workflow-same-preview');
  assert.equal(await page.locator('.native-library-content-preview').count(), 1);
  const source = page.locator('.react-flow__node[data-id="surface-main-image"]'), sourceBox = await source.boundingBox(); assert.ok(sourceBox);
  let sourcePoint;
  for (const x of [.3, .5, .7]) for (const y of [.2, .5, .8]) {
    const point = { x: sourceBox.x + sourceBox.width * x, y: sourceBox.y + sourceBox.height * y };
    if (await page.evaluate(point => document.elementFromPoint(point.x, point.y)?.closest('.react-flow__node')?.getAttribute('data-id') === 'surface-main-image', point)) sourcePoint = point;
  }
  assert.ok(sourcePoint); const targetBox = await receiver(method.entityRef.id).boundingBox(); assert.ok(targetBox);
  await page.mouse.move(sourcePoint.x, sourcePoint.y); await page.mouse.down({ button: 'right' });
  await page.mouse.move(sourcePoint.x + 18, sourcePoint.y + 8, { steps: 4 });
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 18 });
  await page.waitForFunction(() => window.__SCOPE_BROWSE_READ__().drop.status === 'preview');
  const hovered = (await read()).drop.resolution; assert.equal(hovered.status, 'ready'); assert.equal(hovered.intent.targetRef.id, method.entityRef.id);
  await page.keyboard.press('Escape'); await page.mouse.up({ button: 'right' }); await receiver(method.entityRef.id).waitFor();
  report.checks.push('同一 Context 行进入的关联 Workflow 仍接原拖放；真实右拖指向当前 Workflow，Esc 取消零提交');
  await memberButton(method, text.title).click(); await waitViewer(); await page.locator('[data-lcos-native-text-reading]').waitFor();
  await shot('04-workflow-text-viewer'); await page.keyboard.press('Escape'); await viewer.waitFor({ state: 'hidden' });
  await receiver(method.entityRef.id).waitFor(); await memberButton(method, text.title).waitFor();
  for (const id of [...new Set(workflowPresentation.state.memberViewIds)]) {
    const memberView = before.graph.artifactViews.find(row => row.id === id); assert.ok(memberView);
    const artifact = before.graph.artifacts.find(row => row.id === memberView.artifactId); assert.ok(artifact);
    const revision = before.graph.artifactRevisions.find(row => row.id === memberView.revisionId); assert.ok(revision);
    if (id !== textView.id) {
      await memberButton(method, artifact.title).click(); await waitViewer(); await page.locator('[data-lcos-native-text-reading]').waitFor();
      await page.keyboard.press('Escape'); await viewer.waitFor({ state: 'hidden' }); await memberButton(method, artifact.title).waitFor();
    }
    assert.ok(report.requests.some(address => address.includes(encodeURIComponent(revision.fileRecordId)) || address.includes(revision.fileRecordId)));
    report.readMembers.push({ scopeId: method.entityRef.id, viewId: id, revisionId: memberView.revisionId, fileRecordId: revision.fileRecordId });
  }
  report.checks.push('Scope 中图片保留原放大/第一次 Esc；Workflow 每一份材料均实际点开、确版读文件并返回');
  await receiver(method.entityRef.id).getByRole('button', { name: '返回 ' + saved.title, exact: true }).click();
  await memberButton(saved, method.title, '进入').waitFor(); await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label')?.startsWith('进入 '));
  await shot('05-back-to-context');
  report.checks.push('Context → 整份 Workflow → 逐项确版文字 → Esc 返回 Workflow → 返回 Context；只存在一个原 TS 和原 Viewer');
  // A failed exact read must return to the same member, not switch to Current or open a Stage window.
  failureArtifact = image.id;
  await memberButton(saved, image.title).click(); await viewer.waitFor();
  await page.locator('[data-lcos-native-material-state="error"]').waitFor(); await shot('06-original-viewer-read-failure');
  report.failureReadState = await page.evaluate(async () => ({ active: document.activeElement?.outerHTML?.slice(0, 800),
    viewer: (await import('/assets/course-api-base-url-CifxI1ia.js')).LCOSNativeMaterialViewerRuntime.getState().phase }));
  assert.equal(failureArtifact, undefined); await page.keyboard.press('Escape'); await viewer.waitFor({ state: 'hidden' });
  await memberButton(saved, image.title).waitFor();
  report.reread = { before: await readViewer() }; await memberButton(saved, image.title).click(); report.reread.afterClick = await readViewer();
  await waitViewer(); report.reread.afterWait = await readViewer(); await shot('06b-exact-reread');
  await page.keyboard.press('Escape'); report.reread.afterEscape = await readViewer(); await viewer.waitFor({ state: 'hidden' });
  await memberButton(saved, image.title).waitFor();
  report.checks.push('受控单次真实读取 503：原 Viewer 显示失败，Esc 返回原成员；再次点击确版读取成功');
  await page.setViewportSize({ width: 1040, height: 760 });
  await memberButton(saved, method.title, '进入').click(); await memberButton(method, text.title).waitFor();
  const previewBox = await page.locator('.native-library-content-preview').boundingBox();
  assert.ok(previewBox && previewBox.x >= 0 && previewBox.y >= 0 && previewBox.x + previewBox.width <= 1041 && previewBox.y + previewBox.height <= 761);
  await shot('07-narrow-original-preview');
  await receiver(method.entityRef.id).getByRole('button', { name: '返回 ' + saved.title, exact: true }).click(); await memberButton(saved, image.title).waitFor();
  await page.keyboard.press('Escape'); await receiver(saved.entityRef.id).waitFor({ state: 'hidden' });
  await library.getByRole('button', { name: saved.title, exact: true }).click(); await memberButton(saved, image.title).waitFor();
  report.checks.push('1040×760 原预览完整可达；阅读退出后的下一次 Esc 正常关闭，原搜索行可再次进入');
  await page.keyboard.press('Escape'); await receiver(saved.entityRef.id).waitFor({ state: 'hidden' });
  missingViewId = view.id; await library.getByRole('button', { name: saved.title, exact: true }).click();
  await receiver(saved.entityRef.id).getByText('所存版本暂不可读取，未换用其他版本', { exact: true }).waitFor();
  assert.equal(await memberButton(saved, image.title).count(), 0); await memberButton(saved, method.title, '进入').waitFor(); await shot('08-missing-version-keeps-other-members');
  await memberButton(saved, method.title, '进入').click(); await memberButton(method, text.title).waitFor();
  await receiver(method.entityRef.id).getByRole('button', { name: '返回 ' + saved.title, exact: true }).click(); await memberButton(saved, image.title).waitFor();
  report.checks.push('受控缺失 View：该项保留不可读说明，关联 Workflow 可继续进入；返回重新读取恢复原确版入口');
  const after = await facts(), afterUI = await read();
  for (const key of ['artifacts', 'artifactViews', 'artifactRevisions', 'fileRecords', 'scopes']) assert.deepEqual(after.graph[key], before.graph[key], key);
  for (const key of ['presentations', 'workspaces', 'runs', 'canvas']) assert.deepEqual(after[key], before[key], key);
  assert.equal(afterUI.prompt, draft); assert.deepEqual(afterUI.windows, beforeUI.windows); assert.equal(afterUI.apiCurrent, true);
  assert.deepEqual(afterUI.references, beforeUI.references);
  report.browseWrites = report.writes.slice(writeStart).filter(row => row.path !== '/api/events');
  assert.deepEqual(report.browseWrites, []);
  assert.deepEqual(report.pageErrors, []);
  report.checks.push('浏览阶段零写入：成员／材料／画布／工作区／Runs／Stage 地址未变；未发送输入保留');
  assert.deepEqual([afterUI.caret.start, afterUI.caret.end], [4, 7]);
  await memberButton(saved, method.title, '进入').click(); await memberButton(method, text.title).click(); await waitViewer();
  await page.getByRole('button', { name: '加入当前输入', exact: true }).click(); await viewer.waitFor({ state: 'hidden' });
  await page.locator('.native-library-content-preview').waitFor({ state: 'hidden' }); await input.waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Composer 输入');
  const used = await read(); assert.equal(await input.inputValue(), draft); assert.deepEqual([used.caret.start, used.caret.end], [4, 7]);
  assert.ok(used.references.some(ref => ref.entityId === textView.artifactId && ref.artifactViewId === textView.id && ref.revisionId === textView.revisionId));
  const usedFacts = await facts(); for (const key of ['presentations', 'workspaces', 'runs', 'canvas']) assert.deepEqual(usedFacts[key], after[key]);
  report.checks.push('继续接通查看后取用：关联 Workflow 材料 → 原加入输入按钮 → 同一 Composer、同一草稿和光标；确版引用加入，未发送');
  await shot('09-use-material-returns-to-input');
  report.expectedErrors = report.consoleErrors.filter(value => /503|501|Statsig|Offline experiment blocks remote fetch/.test(value));
  report.unexpectedErrors = report.consoleErrors.filter(value => !/503|501|Statsig|Offline experiment blocks remote fetch/.test(value));
  assert.deepEqual(report.unexpectedErrors, []); report.passed = true;
} catch (error) {
  report.error = String(error.stack ?? error); process.exitCode = 1;
  if (page) { await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
    report.dom = await page.locator('body').innerText().catch(() => null); report.ui = await page.evaluate(() => window.__SCOPE_BROWSE_READ__?.()).catch(() => null); }
} finally {
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); await browser.close();
  console.log(JSON.stringify({ passed: report.passed, checks: report.checks, error: report.error, output }, null, 2));
}
