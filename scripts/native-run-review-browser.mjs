import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const args = new Set(process.argv.slice(2));
const existingId = [...args].find(value => value.startsWith('--existing-run-id='))?.slice(18);
if (!args.has('--deployed') || (args.has('--allow-one-run-create') === Boolean(existingId))) {
  console.error('not-started: requires --deployed and exactly one mode: --allow-one-run-create OR --existing-run-id=<id>.');
  process.exitCode = 2;
} else await run();

async function run() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const origin = 'http://127.0.0.1:17881';
  const projectId = 'disposable-surface-core-facade';
  const prefix = '/api/lcos/core/projects/' + projectId;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const visualRoot = 'E:/AppMoved/.codex/visualizations/2026/10/12/01a131ff-c4d7-7b41-86a3-c67738f5917b';
  const reportPath = path.join(root, '.runtime/native-run-review', stamp + '.json');
  const report = { at: new Date().toISOString(), passed: false, mode: existingId ? 'read-only existing Run' : 'one original UI Run journal create',
    runId: existingId ?? null, admittedWrites: 0, mayHaveCommitted: false, blockedWrites: [], apiFailures: [],
    consoleErrors: [], pageErrors: [], steps: [], screenshots: [], providerActionClicked: false, reportPath };
  let browser, page, before, receiver, workflow, material, expectedInstruction, expectedOrdered;
  async function json(route, core = true) {
    const response = await fetch(origin + route, { redirect: 'error', cache: 'no-store' });
    assert.equal(response.status, 200, route + ': HTTP ' + response.status);
    const payload = await response.json();
    assert.equal(core ? payload.ok : payload.code, core ? true : 0, route);
    return core ? payload.value : payload.data;
  }
  async function snapshot() {
    const [graph, presentations, runs, ...canvases] = await Promise.all([
      json(prefix + '/graph'), json(prefix + '/presentations'), json(prefix + '/runs'),
      ...['main', 'context', 'workflow'].map(key => json('/api/canvas/v1/canvases/surface-core-' + key, false)),
    ]);
    const files = {};
    for (const canvas of canvases) for (const node of canvas.nodes) {
      const ref = node.data?.lcos_ref;
      const revision = graph.artifactRevisions.find(row => row.id === ref?.revisionId);
      if (!revision || files[revision.fileRecordId]) continue;
      const file = graph.fileRecords.find(row => row.id === revision.fileRecordId);
      assert.ok(file && file.projectId === projectId);
      const response = await fetch(origin + prefix + '/file-records/' + encodeURIComponent(file.id) + '/content', { redirect: 'error' });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('content-type')?.split(';')[0], file.mimeType);
      files[file.id] = Buffer.from(await response.arrayBuffer());
      assert.equal(files[file.id].length, file.size);
    }
    return { graph, presentations, runs, canvases, files };
  }
  function assertMaterialsStable(after) {
    assert.deepEqual(after.graph, before.graph, 'Run journal must not mutate materials or workspace graph.');
    assert.deepEqual(after.presentations, before.presentations);
    assert.deepEqual(after.canvases, before.canvases);
    assert.deepEqual(after.files, before.files);
  }
  async function shot(name) {
    const target = path.join(visualRoot, 'tapnow-native-run-' + stamp + '-' + name + '.png');
    await page.screenshot({ path: target, fullPage: false });
    report.screenshots.push(target);
  }
  async function ready() {
    await page.locator('[data-lcos-professional-surface-state="ready"]').waitFor({ timeout: 30000, state: 'attached' });
    await page.waitForFunction(id => window.__LCOS_NODE_LAB__?.api
      && (window.__LCOS_NODE_LAB__.currentCanvasId ?? window.__LCOS_NODE_LAB__.canvasId) === id,
    workflow.canvasId, { timeout: 30000 });
    assert.equal(await page.locator('.react-flow').count(), 1);
    assert.match(await page.title(), /Workflow/);
  }
  async function openAgent() {
    const panel = page.getByRole('dialog', { name: '本地 Agent 会话入口', exact: true });
    if (!(await panel.isVisible().catch(() => false))) {
      const launcher = page.locator('[data-pile-gallery-chrome="bottom-right"] button').last();
      await launcher.waitFor({ state: 'visible', timeout: 15000 });
      assert.match(await launcher.evaluate(element => element.outerHTML), /\/agent-motion\//);
      await launcher.click();
      await panel.waitFor({ state: 'visible', timeout: 15000 });
    }
    return panel;
  }
  async function openReviewThroughList() {
    const panel = await openAgent();
    const button = panel.locator('[data-lcos-native-open-run="' + report.runId + '"]');
    await button.waitFor({ state: 'visible', timeout: 20000 });
    await button.click();
  }
  async function verifyReview(label) {
    const body = page.locator('[data-lcos-run-work="' + report.runId + '"]');
    await body.waitFor({ state: 'visible', timeout: 20000 });
    await body.getByText('本次指令', { exact: true }).waitFor({ timeout: 15000 });
    assert.ok((await body.innerText()).includes(expectedInstruction));
    const detail = body.locator('details').filter({ has: page.getByText('本次输入与来源', { exact: true }) });
    if (await detail.getAttribute('open') === null) await detail.locator('summary').click();
    await body.getByText('按任务创建时的输入记录显示；当前画布选中内容不会自动替换它。', { exact: true }).waitFor({ timeout: 15000 });
    assert.equal(await page.locator('.react-flow').count(), 1);
    const [review, recipe] = await Promise.all([
      json('/api/lcos/core/runs/' + encodeURIComponent(report.runId) + '/review'),
      json('/api/lcos/core/runs/' + encodeURIComponent(report.runId) + '/recipe'),
    ]);
    assert.equal(review.run.id, report.runId); assert.equal(review.run.projectId, projectId);
    assert.equal(review.run.status, 'created'); assert.equal(review.dispatch.status, 'planned');
    assert.equal(review.dispatch.attemptCount, 0); assert.equal(review.binding, undefined);
    assert.deepEqual(review.returns, []);
    assert.equal(recipe.runId, report.runId); assert.equal(recipe.projectId, projectId);
    assert.equal(recipe.receiver?.connectedConversationId, receiver.id);
    assert.equal(recipe.receiver?.provider, receiver.provider);
    assert.equal(recipe.prompt, expectedInstruction);
    assert.deepEqual(recipe.orderedReferences, expectedOrdered);
    assert.equal(review.run.instruction, expectedInstruction);
    report.steps.push({ label, runId: report.runId, status: review.run.status,
      dispatch: review.dispatch.status, attempts: review.dispatch.attemptCount,
      provider: review.run.provider, receiverProvider: receiver.provider,
      noBinding: true, noReturns: true, recipeExact: true, originalRunBody: true, singleCanvas: true });
    await shot(label);
    return body;
  }
  try {
    const health = await fetch(origin + '/health').then(response => response.json());
    assert.equal(health.profile, 'original-tapnow-full-integration-in-progress');
    assert.equal(health.cloudBackendConnected, false);
    report.pid = health.pid;
    before = await snapshot();
    const status = await json('/api/surface-core/status', false);
    assert.equal(status.projectId, projectId);
    workflow = status.surfaces.find(row => row.preferredSurface === 'workflow');
    assert.ok(workflow?.canvasId && workflow.workspaceId);
    const roster = await json(prefix + '/connected-conversations');
    const receivers = roster.filter(row => row.conversationRef === 'synthetic-native-agent-ui-20261014-workflow'
      && row.conversationSessionId && row.isRunning === false);
    assert.equal(receivers.length, 1); receiver = receivers[0];
    const session = await json(prefix + '/connected-conversations/' + receiver.id + '/collaboration-session');
    assert.equal(session.capabilities.canDelegate, true);
    report.receiver = { id: receiver.id, sessionId: receiver.conversationSessionId, canDelegate: true, isRunning: false };
    const providers = await json('/api/lcos/core/runtime/providers');
    assert.ok(providers.every(row => row.availability === 'offline'));
    const method = before.presentations.find(row => row.scopeId === workflow.scopeId && row.capability === 'workflow');
    assert.ok(method?.state.workflowActions?.length);
    const view = before.graph.artifactViews.find(row => row.id === method.state.memberViewIds[0]);
    const revision = before.graph.artifactRevisions.find(row => row.id === view?.revisionId);
    assert.ok(view && revision); material = { artifactId: view.artifactId, revisionId: revision.id };
    // Original method references leave the optional default-full mode absent;
    // the fixed Revision identity is explicit and must remain exact.
    expectedOrdered = [{ ref: { type: 'artifact', ...material }, order: 0 }];
    if (existingId) {
      const review = before.runs.find(row => row.run.id === existingId);
      assert.ok(review && review.run.projectId === projectId);
      expectedInstruction = review.run.instruction;
      assert.ok(expectedInstruction.includes('工作流方法：合成 Workflow'));
    } else assert.equal(before.runs.length, 0, 'No repeated creation: use explicit read-only recovery for a previously created Run.');
    const { chromium } = createRequire('E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926/package.json')('playwright-core');
    browser = await chromium.launch({ channel: 'chrome', headless: true,
      args: ['--disable-background-networking', '--disable-sync', '--disable-component-update', '--no-first-run'] });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', serviceWorkers: 'block' });
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.origin === origin && ['GET', 'HEAD'].includes(request.method())) return route.continue();
      if (!existingId && url.origin === origin && url.pathname === prefix + '/runs' && request.method() === 'POST' && report.admittedWrites === 0) {
        const body = request.postDataJSON();
        try {
          assert.equal(body.instruction, expectedInstruction);
          assert.equal(body.outputIntent, 'analyze'); assert.equal(body.workspaceId, workflow.workspaceId);
          assert.deepEqual(body.receiverRef, { connectedConversationId: receiver.id });
          assert.deepEqual(body.orderedReferences, expectedOrdered);
          assert.deepEqual(body.contextArtifactIds, [material.artifactId]);
        } catch (error) {
          report.invalidRunRequest = { body, error: String(error) };
          return route.abort('blockedbyclient');
        }
        report.admittedWrites++; report.mayHaveCommitted = true; report.submittedInput = body;
        return route.continue();
      }
      report.blockedWrites.push({ method: request.method(), origin: url.origin, path: url.pathname });
      return route.abort('blockedbyclient');
    });
    await context.routeWebSocket('**/*', socket => socket.close());
    page = await context.newPage();
    page.on('pageerror', error => report.pageErrors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text().slice(0, 1800)); });
    page.on('response', response => { if (response.status() >= 400) report.apiFailures.push({ path: new URL(response.url()).pathname, status: response.status() }); });
    await page.goto(origin + '/canvas/' + workflow.canvasId, { waitUntil: 'domcontentloaded' }); await ready();
    if (existingId) await openReviewThroughList();
    else {
      const panel = page.getByRole('dialog', { name: '本地 Agent 会话入口', exact: true });
      if (await panel.isVisible().catch(() => false)) await panel.getByRole('button', { name: '关闭 Agent 面板', exact: true }).click();
      const carriers = before.canvases[2].nodes.filter(node => node.data?.lcos_conversation_ref?.connectedConversationId === receiver.id);
      assert.equal(carriers.length, 1);
      const carrier = page.locator('.react-flow__node[data-id="' + carriers[0].id + '"]');
      await carrier.getByRole('button', { name: receiver.label, exact: true }).click();
      const work = page.locator('[data-lcos-window-body="conversation"][data-lcos-window-target="' + receiver.id + '"]');
      await work.waitFor({ state: 'visible', timeout: 20000 });
      await work.locator('[data-lcos-open-work-composer]').click();
      await work.locator('[data-lcos-composer][data-presentation="inline"]').waitFor({ state: 'visible', timeout: 15000 });
      const agent = await openAgent(); await agent.getByRole('button', { name: '打开工作流方法', exact: true }).click();
      const hand = page.getByRole('region', { name: '工作流手牌', exact: true });
      const card = hand.locator('[data-lcos-workflow-task-card][aria-label^="合成 Workflow ·"]');
      await card.waitFor({ state: 'visible', timeout: 30000 }); await card.locator('.lcos-workflow-task-copy').click();
      const preview = card.locator('.lcos-workflow-card-preview'); await preview.waitFor({ state: 'visible' });
      await page.waitForFunction(() => document.querySelector('[data-lcos-workflow-preview-status]')?.textContent?.includes('方法步骤已读到'), null, { timeout: 20000 });
      await preview.getByRole('button', { name: '加入当前草稿', exact: true }).click();
      await hand.waitFor({ state: 'hidden', timeout: 15000 });
      const composer = work.locator('[data-lcos-composer]'); await composer.waitFor({ state: 'visible' });
      assert.equal(await page.locator('[data-lcos-composer]').count(), 1, 'Original inline owner must suppress a duplicate floating Composer.');
      assert.equal(await composer.locator('[data-lcos-composer-receiver-blocked]').count(), 0);
      expectedInstruction = (await composer.locator('[data-lcos-composer-input]').inputValue()).trim();
      assert.ok(expectedInstruction.includes('来源 Presentation：' + method.id + ' · version ' + method.version));
      for (const action of method.state.workflowActions) assert.ok(expectedInstruction.includes(action.label));
      await shot('canonical-receiver-method-draft');
      const submitted = page.waitForResponse(response => response.request().method() === 'POST'
        && new URL(response.url()).pathname === prefix + '/runs', { timeout: 20000 });
      await composer.getByRole('button', { name: '提交', exact: true }).click();
      const response = await submitted, payload = await response.json();
      report.receipt = { status: response.status(), ok: payload.ok, error: payload.error };
      assert.equal(response.status(), 201); assert.equal(payload.ok, true);
      const created = payload.value.review; assert.equal(created.run.projectId, projectId);
      report.runId = created.run.id;
      await composer.getByRole('button', { name: '查看任务', exact: true }).click();
    }
    const reviewBody = await verifyReview('original-run-review');
    const pane = page.locator('[data-lcos-window-pane]').filter({ has: page.locator('[data-lcos-run-work="' + report.runId + '"]') });
    await pane.getByRole('button', { name: '关闭窗口', exact: true }).click();
    await reviewBody.waitFor({ state: 'detached', timeout: 10000 });
    await openReviewThroughList(); await verifyReview('close-reopen-core-run');
    await page.reload({ waitUntil: 'domcontentloaded' }); await ready();
    await openReviewThroughList(); await verifyReview('reload-core-run');
    const after = await snapshot(); assertMaterialsStable(after);
    const expectedIds = [...before.runs.map(row => row.run.id), ...(!existingId ? [report.runId] : [])].sort();
    assert.deepEqual(after.runs.map(row => row.run.id).sort(), expectedIds);
    for (const previous of before.runs) assert.deepEqual(after.runs.find(row => row.run.id === previous.run.id), previous);
    assert.equal(report.admittedWrites, existingId ? 0 : 1);
    assert.deepEqual(report.pageErrors, []);
    report.final = { onlyNewRunJournal: !existingId, graphAndMaterialsUnchanged: true, allCanvasesAndPresentationsUnchanged: true,
      exactFileRecordCount: Object.keys(after.files).length, noBindingOrReturn: true, providerExecution: false,
      createdRunRetained: report.runId, oneCanvas: true };
    report.passed = true;
  } catch (error) {
    report.failure = String(error.stack ?? error);
    if (page) { report.failureBody = (await page.locator('body').innerText().catch(() => '')).slice(0, 6500); await shot('failure').catch(() => {}); }
    if (before) {
      try {
        const after = await snapshot(); assertMaterialsStable(after);
        const added = after.runs.filter(row => !before.runs.some(old => old.run.id === row.run.id));
        report.recovery = { materialsAndCanvasesUnchanged: true, addedRuns: added.map(row => ({ id: row.run.id, status: row.run.status, dispatch: row.dispatch.status })) };
        if (report.mayHaveCommitted && added.length === 1) report.runId ??= added[0].run.id;
      } catch (readError) { report.recoveryFailure = String(readError.stack ?? readError); }
    }
  } finally {
    await browser?.close(); await mkdir(path.dirname(reportPath), { recursive: true });
    await writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ passed: report.passed, mode: report.mode, runId: report.runId,
      admittedWrites: report.admittedWrites, mayHaveCommitted: report.mayHaveCommitted,
      steps: report.steps.map(row => row.label), failure: report.failure ?? null, reportPath }, null, 2));
    if (!report.passed) process.exitCode = 1;
  }
}
