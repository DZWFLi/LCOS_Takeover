// Wave 7 验收：Workflow 现场 + 手牌/Card Pool（真实 Core 数据；取用→canonical 草稿→既有 Composer）。
// 真实隔离栈：scripts/e2e/r0-e2e-env.ps1 up 后运行；默认端口可用 LCOS_E2E_BASE 覆盖。
import { chromium } from 'playwright-core';

const BASE = process.env.LCOS_E2E_BASE ?? 'http://localhost:5273';
const SHOTS = 'C:/Users/1/AppData/Local/Temp/trae/screenshots';
const EXE = 'C:/Users/1/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';
const out = {};
const failures = [];
const browser = await chromium.launch({ executablePath: EXE, headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
page.on('console', (m) => { if (m.type() === 'error') (out.consoleErrors ??= []).push(m.text().slice(0, 250)); });

await page.goto(`${BASE}/projects/lcos-gen2-dev/workflow`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(9000);
// 若画布引用失效（seeded stale canvasId）→ 走真实恢复：重建画布并回写
const recover = page.getByRole('button', { name: '重新建立现场画布（回写 workspace）' });
if (await recover.count() > 0) {
  out.recovery = 'canvas-not-found → recover clicked';
  await recover.click();
  await page.waitForTimeout(6000);
}
const create = page.getByRole('button', { name: '建立Workflow画布' });
if (await create.count() > 0) {
  out.creation = 'missing canvas → create clicked';
  await create.click();
  await page.waitForTimeout(6000);
}
await page.waitForSelector('.react-flow', { timeout: 30000 });
await page.waitForTimeout(4000);
out.worksite = await page.evaluate(() => JSON.stringify({
  worksite: !!document.querySelector('[data-lcos-workflow-worksite]'),
  stageSurface: document.querySelector('[data-lcos-worksite-stage]')?.getAttribute('data-lcos-worksite-stage') ?? null,
  handToggle: !!document.querySelector('[data-lcos-workflow-hand-toggle]'),
  canvasAlive: !!document.querySelector('.react-flow'),
}));
await page.screenshot({ path: `${SHOTS}/wave7_step1_workflow_1366.png` });

// 打开手牌卡池
await page.locator('[data-lcos-workflow-hand-toggle]').click();
await page.waitForSelector('[data-lcos-workflow-hand]', { timeout: 15000 });
await page.waitForTimeout(3000);
out.pool = await page.evaluate(() => JSON.stringify({
  open: !!document.querySelector('[data-lcos-workflow-hand]'),
  taskCards: document.querySelectorAll('[data-lcos-family="task-card"]').length,
  workflowTaskCards: document.querySelectorAll('[data-lcos-workflow-card="workflow"]').length,
  skillTaskCards: document.querySelectorAll('[data-lcos-workflow-card="skill"]').length,
  materialCards: document.querySelectorAll('[data-lcos-reference-card]').length,
  receiverCards: document.querySelectorAll('[data-lcos-receiver-card]').length,
  sources: Array.from(document.querySelectorAll('[data-lcos-card-source]')).map((card) => card.getAttribute('data-lcos-card-source')),
  skillUnavailable: !!document.querySelector('[data-lcos-skill-unavailable]'),
}));
const poolEvidence = JSON.parse(out.pool);
if (poolEvidence.taskCards !== 0 || poolEvidence.workflowTaskCards !== 0 || poolEvidence.skillTaskCards !== 0) failures.push('fixture unexpectedly rendered ordinary items as workflow/skill TaskCards');
if (poolEvidence.materialCards === 0) failures.push('isolated warehouse produced no compact material reference cards');
if (poolEvidence.receiverCards === 0) failures.push('isolated warehouse produced no conversation receiver card');
if (!poolEvidence.sources.includes('warehouse')) failures.push('card pool did not expose warehouse-backed cards');
await page.screenshot({ path: `${SHOTS}/wave7_step2_hand_1366.png` });

// 取用一张卡 → Composer 草稿 strip（真实 DOM click；Playwright force-click 对 absolute 容器有合成事件怪癖）
const take = page.locator('[data-lcos-material-take]').filter({ hasText: '取用' }).first();
if (await take.count() > 0) {
  await page.evaluate(() => {
    const btn = document.querySelector('[data-lcos-material-take]');
    btn?.click();
  });
  await page.waitForTimeout(900);
  out.tookToDraft = await page.evaluate(() => JSON.stringify({
    composerRefs: Array.from(document.querySelectorAll('[data-lcos-composer-ref]')).map((r) => (r.textContent ?? '').trim()),
    composerTarget: document.querySelector('[data-lcos-composer]')?.getAttribute('data-lcos-composer-target') ?? null,
    uiState: document.querySelector('[data-lcos-composer]')?.getAttribute('data-ui-state') ?? null,
    submitDisabled: document.querySelector('[data-lcos-composer] [aria-label="提交"]')?.disabled ?? null,
    blockedReason: document.querySelector('[data-lcos-composer-receiver-blocked]')?.textContent?.trim() ?? null,
  }));
  const draftEvidence = JSON.parse(out.tookToDraft);
  if (draftEvidence.composerRefs.length === 0) failures.push('taking a card did not update the canonical reference draft');
  if (draftEvidence.blockedReason === null || draftEvidence.submitDisabled !== true) failures.push('material card did not fail-closed without a receiver');
  await page.screenshot({ path: `${SHOTS}/wave7_step3_take_draft_1366.png` });

  // Conversation card is the explicit receiver path. It reuses the same
  // canonical reference draft and Composer; Core decides whether a real
  // provider can accept the Run, so the evidence may be receipt or honest error.
  await page.locator('[data-lcos-composer] [aria-label="关闭 Composer"]').click();
  const receiver = page.locator('[data-lcos-receiver-card] [data-lcos-receiver-take]').first();
  if (await receiver.count() === 0) {
    failures.push('isolated fixture has no conversation receiver card');
  } else {
    await receiver.evaluate((button) => button.click());
    await page.waitForSelector('[data-lcos-composer-input]', { timeout: 10000 });
    await page.locator('[data-lcos-composer-input]').fill('Wave7 real Run receipt probe');
    const submit = page.locator('[data-lcos-composer] [aria-label="提交"]');
    if (await submit.isDisabled()) failures.push('conversation receiver card did not enable the existing Run submit path');
    await submit.click();
    await page.waitForTimeout(2500);
    out.runSubmit = await page.evaluate(() => JSON.stringify({
      target: document.querySelector('[data-lcos-composer]')?.getAttribute('data-lcos-composer-target') ?? null,
      uiState: document.querySelector('[data-lcos-composer]')?.getAttribute('data-ui-state') ?? null,
      receipt: document.querySelector('[data-lcos-composer] [data-feedback-tone="normal"]')?.textContent?.trim() ?? null,
      error: document.querySelector('[data-lcos-composer] [data-feedback-tone="error"]')?.textContent?.trim() ?? null,
    }));
    const runEvidence = JSON.parse(out.runSubmit);
    if (runEvidence.receipt === null && runEvidence.error === null) failures.push('Run submit produced neither receipt nor honest error');
    await page.screenshot({ path: `${SHOTS}/wave7_step4_run_submit_1366.png` });

    const openConversation = page.locator('[data-lcos-receiver-card] [data-lcos-card-open-conversation]').first();
    await openConversation.evaluate((button) => button.click());
    await page.waitForSelector('[data-lcos-conversation-work-view]', { timeout: 15000 });
    out.workView = await page.evaluate(() => JSON.stringify({
      reachable: !!document.querySelector('[data-lcos-conversation-work-view]'),
      waiting: document.querySelectorAll('[data-lcos-waiting-input]').length,
      review: document.querySelectorAll('[data-lcos-artifact-return]').length,
    }));
    await page.screenshot({ path: `${SHOTS}/wave7_step5_conversation_work_view_1366.png` });
  }
} else {
  failures.push('isolated card pool had no takeable material card');
}

await browser.close();
console.log(JSON.stringify({ status: failures.length === 0 ? 'PASS' : 'FAIL', failures, ...out }, null, 2));
if (failures.length > 0) process.exitCode = 1;
