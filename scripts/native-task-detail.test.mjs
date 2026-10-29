import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { buildPilotEntry, installedRoot } from '../lab/pilot/build-pilot.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = path.join(root, '.runtime/native-task-detail-test');
fs.mkdirSync(directory, { recursive: true });
const view = path.relative(directory, path.join(root, 'lab/pilot/native-task-detail.tsx')).replaceAll('\\', '/');
fs.writeFileSync(path.join(directory, 'entry.tsx'), `import React,{useState}from'react';import{createRoot}from'react-dom/client';
import{NativeTaskDetail}from${JSON.stringify(view)};
window.navigation=[];function App(){const[id,setId]=useState('created');window.testView=setId;
return <NativeTaskDetail projectId="project-private-key" runId={id}
onOpenMaterial={target=>window.navigation.push({kind:'material',target})}
onOpenRun={runId=>window.navigation.push({kind:'task',runId})}/>}
createRoot(document.getElementById('root')).render(<App/>);`);
await buildPilotEntry(path.relative(root, path.join(directory, 'entry.tsx')), path.join(directory, 'app.js'), 'browser', { env: { LCOS_CORE_URL: '/api/lcos/core', LCOS_CORE_TOKEN: '' } });

const reviews = new Map(), requests = [], errors = [], failures = new Map();
const returnItem = (runId, id) => ({ id, runId, targetArtifactId: 'artifact-private-' + id,
  baseRevisionId: 'base-private-' + id, returnedFileId: 'file-private-' + id,
  draftRevisionId: 'candidate-private-' + id, contentHash: 'existing-content-' + id,
  canonicalPath: '.lcos/internal/' + runId + '/output.txt', action: 'created', status: 'pending_review' });
function review(id, status = 'running') {
  return { run: { id, projectId: 'project-private-key', instruction: '整理项目材料\n保留来源与原版本。', status, shortSummary: '已有内容保留' },
    dispatch: { id: 'dispatch-private-' + id, runId: id, status: status === 'created' ? 'planned' : 'bound' },
    ...(status === 'running' ? { binding: { runId: id, externalTaskId: 'external-private-' + id } } : {}),
    returns: [], draftRevisions: [], presentationPhase: status,
    capabilities: { schemaVersion: 1, accept: { enabled: true }, reject: { enabled: true }, retry: { enabled: true } } };
}
reviews.set('created', review('created', 'created'));
reviews.set('running', review('running'));
const question = review('question', 'waiting_input');
question.inputRequest = { schemaVersion: 1, runId: 'question', requestId: 'request-private-old', question: '先采用哪个方向？',
  status: 'pending', options: ['方向一', '方向二'], allowFreeText: true, selectedOptions: [] };
reviews.set('question', question);
const returned = review('returned', 'review');
returned.returns = ['return-a', 'return-b', 'return-c'].map(id => returnItem('returned', id));
reviews.set('returned', returned);
const locked = review('locked', 'review'); locked.returns = [returnItem('locked', 'locked-result')];
for (const action of ['accept', 'reject', 'retry']) locked.capabilities[action].enabled = false;
reviews.set('locked', locked);
reviews.set('read-error', review('read-error'));
reviews.set('old-slow', { ...review('old-slow'), run: { ...review('old-slow').run, instruction: '不应覆盖新任务的旧响应' } });
reviews.set('new-fast', { ...review('new-fast'), run: { ...review('new-fast').run, instruction: '新的当前任务' } });
reviews.set('view-history', review('view-history'));
reviews.set('manifest-error', review('manifest-error'));
reviews.set('legacy-view', review('legacy-view'));
let manifestValidationFault = true;
const count = (method, suffix) => requests.filter(row => row.method === method && row.path.endsWith(suffix)).length;
const respond = (response, value, status = 200) => response.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(status < 400 ? { ok: true, value } : { ok: false, error: { code: 'TEST_PRIVATE', message: value } }));
const server = http.createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
  if (pathname === '/' || pathname === '/index.html') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end('<html><head><style>:root{--foreground:#242625;--background:#fff;--muted:#f1f3f4;--muted-foreground:#69716b;--border:#ddd;--card:#fff;--input:#ccc;--accent:#eaeff1;--popover:#fff;--destructive:#b74436;--accent-primary:#107d98}body{margin:0;width:480px;height:900px}</style><link rel="stylesheet" href="/app.css"></head><body><div id="root" style="height:100%"></div><script type="module" src="/app.js"></script></body></html>'); return;
  }
  if (['/app.js', '/app.css'].includes(pathname)) { response.writeHead(200, { 'content-type': pathname.endsWith('.js') ? 'text/javascript' : 'text/css' }).end(fs.readFileSync(path.join(directory, pathname.slice(1)))); return; }
  if (pathname.endsWith('/events')) { response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' }); response.write(': connected\n\n'); return; }
  let body = ''; for await (const chunk of request) body += chunk;
  requests.push({ method: request.method, path: pathname, body: body ? JSON.parse(body) : undefined });
  const read = /^\/api\/lcos\/core\/runs\/([^/]+)\/review$/.exec(pathname);
  if (read && request.method === 'GET') {
    const id = decodeURIComponent(read[1]);
    if ((failures.get(id) ?? 0) > 0) { failures.set(id, failures.get(id) - 1); respond(response, 'Core RuntimeBinding raw-private-key ' + id, 500); return; }
    const value = structuredClone(reviews.get(id));
    if (id === 'old-slow') await new Promise(resolve => setTimeout(resolve, 300));
    respond(response, value); return;
  }
  if (/\/runs\/[^/]+\/recipe$/.test(pathname)) {
    const id = pathname.split('/').at(-2);
    if (['view-history', 'manifest-error', 'legacy-view'].includes(id)) {
      respond(response, { schemaVersion: 0, projectId: 'project-private-key', runId: id, prompt: '人工历史输入验证', intent: 'analyze',
        ...(id === 'legacy-view' ? {} : { contextManifestId: 'manifest-private-' + id }),
        orderedReferences: [{ ref: { type: 'view', viewId: 'view-input-private' }, order: 0 }] }); return;
    }
    respond(response, { schemaVersion: 0, projectId: 'project-private-key', runId: id, prompt: '整理项目材料', intent: 'analyze',
      orderedReferences: [{ ref: { type: 'artifact', artifactId: 'artifact-input-private', revisionId: 'version-input-private' }, order: 0 },
        { ref: { type: 'workspace', workspaceId: 'workspace-input-private' }, order: 1 },
        { ref: { type: 'scope', scopeId: 'scope-input-private' }, order: 2 }] }); return;
  }
  if (pathname.includes('/context-manifests/v0/')) {
    const id = pathname.split('/').at(-1), invalid = id.endsWith('manifest-error') && manifestValidationFault;
    respond(response, { schemaVersion: 0, id, projectId: invalid ? 'foreign-private-project' : 'project-private-key',
      canonicalJson: JSON.stringify({ schemaVersion: 0, project: { id: 'project-private-key' }, orderedItems: [
        { role: 'reference', identity: 'reference:0:artifact-input-private:past-view-private', title: '当时的视图材料',
          artifactId: 'artifact-input-private', revisionId: 'past-view-private' },
        { role: 'context', identity: 'note-private-input', title: '当时的笔记',
          content: '<untrusted-context identity="note-private-input">\n保留这段用户正文\n<untrusted-context>用户自己写的标签</untrusted-context>\n</untrusted-context>' },
        { role: 'context', identity: 'note-private-generated', title: 'Note note-private-generated',
          content: '<untrusted-context identity="note-private-generated">\n# 项目里真正需要看的笔记\n第二行用户正文不能丢\n</untrusted-context>' },
      ] }) }); return;
  }
  if (pathname.endsWith('/graph')) { respond(response, { project: { id: 'project-private-key' },
    artifacts: [{ id: 'artifact-input-private', title: '参考剧本', currentRevisionId: 'new-current-private' }],
    artifactViews: [{ id: 'view-input-private', artifactId: 'artifact-input-private', revisionId: 'new-current-private' }], collections: [],
    scopes: [{ id: 'scope-input-private', name: '精选参考' }], workspaces: [{ id: 'workspace-input-private', name: '资料现场' }] }); return; }
  const action = /^\/api\/lcos\/core\/runs\/([^/]+)\/(dispatch|sync|recover|cancel|input-request)$/.exec(pathname);
  if (action && request.method === 'POST') {
    const id = decodeURIComponent(action[1]), value = reviews.get(id);
    if (action[2] === 'cancel' && id === 'running') { respond(response, 'RuntimeBinding external-private-running receipt unknown', 500); return; }
    value.run.status = 'queued'; value.presentationPhase = 'queued'; value.dispatch.status = 'bound';
    if (action[2] === 'input-request') value.inputRequest.status = 'answered';
    respond(response, { review: value }); return;
  }
  const result = /^\/api\/lcos\/core\/artifact-returns\/([^/]+)\/(accept|reject|retry)$/.exec(pathname);
  if (result && request.method === 'POST') {
    const value = reviews.get('returned'), item = value.returns.find(row => row.id === result[1]);
    if (result[2] === 'retry') {
      const previousReturn = structuredClone(item); item.status = 'rejected';
      respond(response, { previousRun: value.run, previousReturn, run: { id: 'confirmed-next-task', projectId: value.run.projectId } }); return;
    }
    item.status = result[2] === 'accept' ? 'adopted' : 'rejected';
    respond(response, { run: value.run, artifactReturn: item }); return;
  }
  respond(response, 'Not found', 404);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const require = createRequire(path.join(installedRoot, 'package.json'));
const { chromium } = require('playwright-core');
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--disable-background-networking'] });
  const page = await browser.newPage({ viewport: { width: 800, height: 900 } });
  page.on('pageerror', error => errors.push(error.message));
  const origin = `http://127.0.0.1:${server.address().port}`;
  await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
  await page.goto(origin);
  const body = page.locator('[data-native-task-detail]');
  await page.getByRole('button', { name: '开始', exact: true }).waitFor();
  assert.equal(requests.filter(row => row.method === 'POST').length, 0, 'opening only reads');
  assert.equal(await body.evaluate(e => /project-private|dispatch-private|Recipe|RuntimeBinding|Core/.test(e.textContent)), false);
  await page.getByRole('button', { name: '开始', exact: true }).click();
  await page.getByText('排队中', { exact: true }).waitFor();
  assert.equal(count('POST', '/created/dispatch'), 1);
  assert.ok(count('GET', '/created/review') >= 3, 'read on open, fresh read before action, read after receipt');
  await page.getByText('使用的材料', { exact: true }).click();
  await page.getByRole('button', { name: '参考剧本', exact: true }).waitFor();
  assert.deepEqual(await body.locator('ol li').allTextContents(), ['参考剧本', '资料现场', '精选参考']);
  await page.getByRole('button', { name: '参考剧本', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.navigation.at(-1)), { kind: 'material', target: { projectId: 'project-private-key', artifactId: 'artifact-input-private', revisionId: 'version-input-private' } });
  assert.equal(await body.evaluate(e => /input-private|scope-input|workspace-input|manifest|Recipe/.test(e.textContent)), false);
  await page.evaluate(() => window.testView('view-history'));
  await body.locator('summary').filter({ hasText: '使用的材料' }).click();
  await body.getByRole('button', { name: '当时的视图材料', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.navigation.at(-1)), { kind: 'material',
    target: { projectId: 'project-private-key', artifactId: 'artifact-input-private', revisionId: 'past-view-private' } });
  assert.equal(count('GET', '/context-manifests/v0/manifest-private-view-history'), 1, 'actual component requests its immutable manifest');
  await body.getByText('当时的笔记', { exact: true }).click();
  assert.ok((await body.locator('.native-task-source-content').allTextContents()).some(value => value.includes('<untrusted-context>用户自己写的标签</untrusted-context>')));
  assert.equal(await body.evaluate(e => /note-private-input|new-current-private|manifest-private/.test(e.textContent)), false);
  await body.getByText('项目里真正需要看的笔记', { exact: true }).click();
  assert.ok((await body.locator('.native-task-source-content').allTextContents()).some(value => value.includes('第二行用户正文不能丢')));
  assert.equal(await body.evaluate(e => /Note note-private-generated|note-private-generated/.test(e.textContent)), false);
  await page.evaluate(() => window.testView('manifest-error'));
  await body.locator('summary').filter({ hasText: '使用的材料' }).click();
  await body.getByText('材料记录暂时无法读取。', { exact: false }).waitFor();
  assert.equal(await body.getByRole('button', { name: '当时的视图材料', exact: true }).count(), 0, 'foreign snapshot does not silently show Current');
  manifestValidationFault = false; await body.getByRole('button', { name: '重试读取', exact: true }).click();
  await body.getByRole('button', { name: '当时的视图材料', exact: true }).waitFor();
  await page.evaluate(() => window.testView('legacy-view'));
  await body.locator('summary').filter({ hasText: '使用的材料' }).click();
  await body.getByText('当时使用的内容暂不可读取，未改用当前版本。', { exact: true }).waitFor();
  assert.equal(await body.locator('ol button').count(), 0, 'legacy unpinned View cannot open current graph revision as past input');

  await page.evaluate(() => window.testView('running'));
  await page.getByRole('button', { name: '停止', exact: true }).waitFor();
  await page.getByRole('button', { name: '停止', exact: true }).click();
  assert.equal(count('POST', '/running/cancel'), 0, 'existing confirmation remains before stop');
  await page.getByRole('button', { name: '确认停止', exact: true }).click();
  await page.getByRole('button', { name: '核对刚才的操作', exact: true }).waitFor();
  assert.equal(count('POST', '/running/cancel'), 1);
  assert.equal(await page.getByRole('button', { name: '停止', exact: true }).isDisabled(), true, 'unknown receipt blocks repeat');
  assert.equal(await body.evaluate(e => /RuntimeBinding|external-private|receipt unknown/.test(e.textContent)), false);
  await page.getByRole('button', { name: '核对刚才的操作', exact: true }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('button')].find(e => e.textContent === '停止')?.disabled === false);
  assert.equal(count('POST', '/running/cancel'), 1, 'verification is read-only, never a cancellation retry');

  await page.evaluate(() => window.testView('question'));
  await page.getByRole('textbox', { name: '回答当前问题', exact: true }).waitFor();
  await page.getByRole('textbox', { name: '回答当前问题', exact: true }).fill('保留我的回答');
  await page.getByRole('checkbox', { name: '方向一', exact: true }).check();
  reviews.get('question').inputRequest.requestId = 'request-private-new';
  await page.getByRole('button', { name: '提交回答', exact: true }).click();
  await page.getByRole('button', { name: '核对刚才的操作', exact: true }).waitFor();
  assert.equal(count('POST', '/question/input-request'), 0, 'fresh request identity rejects stale question');
  await page.getByRole('button', { name: '核对刚才的操作', exact: true }).click();
  await page.getByRole('textbox', { name: '回答当前问题', exact: true }).fill('确认新问题');
  await page.getByRole('button', { name: '提交回答', exact: true }).click();
  await page.getByText('回答已提交。', { exact: true }).waitFor();
  assert.equal(count('POST', '/question/input-request'), 1);
  assert.equal(requests.find(row => row.method === 'POST' && row.path.endsWith('/question/input-request')).body.requestId, 'request-private-new');

  await page.evaluate(() => window.testView('returned'));
  await page.getByRole('button', { name: '查看结果 1', exact: true }).waitFor();
  await page.getByRole('button', { name: '查看结果 1', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.navigation.at(-1)), { kind: 'material', target: { projectId: 'project-private-key', artifactId: 'artifact-private-return-a', revisionId: 'candidate-private-return-a', returnId: 'return-a' } });
  await page.getByRole('button', { name: '采纳', exact: true }).nth(0).click();
  await page.getByText('已采纳', { exact: true }).waitFor();
  assert.deepEqual(requests.find(row => row.method === 'POST' && row.path.endsWith('/return-a/accept')).body, { expectedBaseRevisionId: 'base-private-return-a' });
  reviews.get('returned').returns[1].baseRevisionId = 'base-private-changed';
  await page.getByRole('button', { name: '不采用', exact: true }).nth(0).click();
  await page.getByRole('button', { name: '核对刚才的操作', exact: true }).waitFor();
  assert.equal(count('POST', '/return-b/reject'), 0, 'fresh review checks item and exact base before decision');
  await page.getByRole('button', { name: '核对刚才的操作', exact: true }).click();
  await page.getByRole('button', { name: '不采用', exact: true }).nth(0).click();
  await page.getByText('未采用', { exact: true }).waitFor();
  assert.equal(count('POST', '/return-b/reject'), 1);
  await page.getByRole('button', { name: '重新尝试', exact: true }).click();
  await page.getByRole('button', { name: '查看重试任务', exact: true }).waitFor();
  await page.getByRole('button', { name: '查看重试任务', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.navigation.at(-1)), { kind: 'task', runId: 'confirmed-next-task' });
  assert.equal(count('POST', '/confirmed-next-task/dispatch'), 0, 'retry receipt never auto-dispatches a new task');

  await page.evaluate(() => window.testView('locked'));
  await page.getByText('这份结果暂时无法处理，请刷新后核对。', { exact: true }).waitFor();
  for (const name of ['采纳', '不采用', '重新尝试']) assert.equal(await page.getByRole('button', { name, exact: true }).count(), 0, 'disabled capability does not produce a fake actionable button');
  failures.set('read-error', 1);
  await page.evaluate(() => window.testView('read-error'));
  await page.getByRole('button', { name: '重试读取', exact: true }).waitFor();
  assert.equal(await body.evaluate(e => /Core|RuntimeBinding|raw-private/.test(e.textContent)), false);
  await page.getByRole('button', { name: '重试读取', exact: true }).click();
  await page.getByRole('button', { name: '停止', exact: true }).waitFor();
  await page.evaluate(() => window.testView('old-slow'));
  await page.waitForRequest(request => request.url().endsWith('/old-slow/review'));
  await page.evaluate(() => window.testView('new-fast'));
  await page.getByRole('heading', { name: '新的当前任务', exact: true }).waitFor();
  await page.waitForTimeout(350);
  assert.equal(await page.getByRole('heading', { name: '不应覆盖新任务的旧响应', exact: true }).count(), 0, 'late response cannot replace current scope');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, browser: 'installed Chrome', backend: 'owned isolated HTTP test fixture',
    originalActionOwner: 'performRunWorkAction', covered: ['read-only open', 'dispatch fresh read', 'ordered input titles and exact versions',
      'stop confirmation', 'unknown receipt blocks repeat', 'explicit read-only verification', 'changed question identity',
      'answer original request', 'candidate reader exact revision', 'accept CAS', 'stale result base', 'reject', 'retry confirmed next task',
      'no automatic new dispatch', 'state-dependent actions', 'recoverable read error', 'no technical ID/error disclosure', 'late response scope',
      'real manifest HTTP read and exact historical View input', 'foreign snapshot retry without Current fallback', 'legacy unpinned input unavailable', 'manifest text keeps user content',
      'generated Note identity title becomes saved first line without losing full text or custom title'],
    productionModelExecuted: false }, null, 2));
} finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
