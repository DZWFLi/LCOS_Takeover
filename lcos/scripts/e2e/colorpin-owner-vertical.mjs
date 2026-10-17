#!/usr/bin/env node

import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { runScenario } from './_harness.mjs';

const BASE = process.env.LCOS_E2E_WEB_URL ?? 'http://localhost:5283';
const PROJECT = process.env.LCOS_E2E_PROJECT ?? 'lcos-gen2-dev';
const TOKEN = process.env.LCOS_E2E_CORE_TOKEN ?? 'dev-token';
const SHOT = resolve(process.env.LCOS_E2E_SHOT ?? '.e2e-data/shots/colorpin-owner-vertical.png');
mkdirSync(resolve(SHOT, '..'), { recursive: true });

const result = await runScenario({
  name: 'ColorPin-owner-vertical',
  baseUrl: BASE,
  async body(h) {
    let bindingRegistrations = 0;
    h.page.on('console', (message) => {
      if (/\[lcos\] bindings registered: \d+/.test(message.text())) bindingRegistrations += 1;
    });
    const waitForBindingRegistration = async (after) => {
      const deadline = Date.now() + 90_000;
      while (bindingRegistrations <= after && Date.now() < deadline) await h.wait(500);
      return bindingRegistrations > after;
    };

    await h.goto(`/projects/${PROJECT}/main`);
    await h.requireSelector('[data-lcos-project-shell]', { timeout: 30_000 });
    if (!await h.page.waitForSelector('.react-flow', { timeout: 15_000 }).then(() => true).catch(() => false)) {
      const recover = h.page.locator('[data-lcos-recover-canvas]');
      const create = h.page.getByRole('button', { name: '建立主画布' });
      if (await recover.count() > 0) await recover.click();
      else if (await create.count() > 0) await create.click();
      else await h.page.reload({ waitUntil: 'domcontentloaded' });
      await h.requireSelector('.react-flow', { timeout: 60_000 });
    }
    let nodesReady = await h.page.waitForSelector('.react-flow__node', { timeout: 30_000 }).then(() => true).catch(() => false);
    if (!nodesReady) {
      await h.page.reload({ waitUntil: 'domcontentloaded' });
      await h.requireSelector('[data-lcos-project-shell]', { timeout: 30_000 });
      nodesReady = await h.page.waitForSelector('.react-flow__node', { timeout: 60_000 }).then(() => true).catch(() => false);
    }
    h.requireTrue(nodesReady, '真实 Core 投影未在 Main 现场落定');

    // This environment is disposable. Start from an empty membership set so
    // the browser run proves the complete create/remove path deterministically.
    await h.page.evaluate(async ({ projectId, token }) => {
      const headers = { Authorization: `Bearer ${token}` };
      const snapshot = await fetch(`/lcos-core/projects/${projectId}/color-pins`, { headers }).then((response) => response.json());
      for (const membership of snapshot.value.memberships) {
        await fetch(`/lcos-core/projects/${projectId}/color-pins/memberships/${membership.id}`, { method: 'DELETE', headers });
      }
    }, { projectId: PROJECT, token: TOKEN });
    await h.page.reload({ waitUntil: 'domcontentloaded' });
    await h.requireSelector('.react-flow__node', { timeout: 45_000 });

    // Materialize Context once so the same Artifact has two real canvas
    // occurrences before the Pin is authored from Main.
    await h.goto(`/projects/${PROJECT}/context`);
    const contextRegistration = bindingRegistrations;
    await h.requireSelector('[data-lcos-project-shell]', { timeout: 30_000 });
    if (!await h.page.waitForSelector('.react-flow', { timeout: 10_000 }).then(() => true).catch(() => false)) {
      const createContext = h.page.getByRole('button', { name: '建立Context画布' });
      if (await createContext.count() > 0) await createContext.click();
      await h.requireSelector('.react-flow', { timeout: 60_000 });
    }
    if (!await h.page.waitForSelector('.react-flow__node', { timeout: 30_000 }).then(() => true).catch(() => false)) {
      await h.page.reload({ waitUntil: 'domcontentloaded' });
      await h.requireSelector('.react-flow__node', { timeout: 60_000 });
    }
    h.requireTrue(await waitForBindingRegistration(contextRegistration), 'Context projection binding registration 未完成');
    const mainRegistration = bindingRegistrations;
    await h.goto(`/projects/${PROJECT}/main`);
    await h.requireSelector('.react-flow__node', { timeout: 45_000 });
    h.requireTrue(await waitForBindingRegistration(mainRegistration), 'Main projection binding registration 未完成');

    const target = await h.page.evaluate(async ({ projectId, token }) => {
      const response = await fetch(`/lcos-core/projects/${projectId}/spatial/bindings`, { headers: { Authorization: `Bearer ${token}` } });
      const envelope = await response.json();
      const bindings = envelope.value.filter((binding) => binding.spatialKind === 'node' && binding.entityType === 'artifact');
      const byEntity = new Map();
      for (const binding of bindings) {
        const rows = byEntity.get(binding.entityId) ?? [];
        rows.push(binding);
        byEntity.set(binding.entityId, rows);
      }
      for (const [entityId, rows] of byEntity) {
        if (new Set(rows.map((row) => row.canvasId)).size < 2) continue;
        const current = rows.find((row) => document.querySelector(`.react-flow__node[data-id="${CSS.escape(row.spatialId)}"]`));
        if (current === undefined) continue;
        const element = document.querySelector(`.react-flow__node[data-id="${CSS.escape(current.spatialId)}"]`);
        const rect = element.getBoundingClientRect();
        return { entityId, spatialId: current.spatialId, occurrenceCount: rows.length, x: rect.left + rect.width / 2, y: rect.top + Math.min(24, rect.height / 2) };
      }
      return null;
    }, { projectId: PROJECT, token: TOKEN });
    h.requireTrue(target !== null, 'fixture 中找不到跨现场复用的 Artifact 投影');

    await h.page.locator(`.react-flow__node[data-id="${target.spatialId}"]`).click({ force: true });
    const actionArcReady = await h.page.waitForSelector('[data-lcos-action-arc]', { timeout: 5_000 }).then(() => true).catch(() => false);
    if (actionArcReady) {
      await h.page.click('[data-lcos-arc-more]');
      const arcProducer = h.page.locator('[data-lcos-command="color-pin"]');
      if (await arcProducer.count() > 0) await arcProducer.click();
      else await h.page.click('[data-lcos-nav-part="pin-add"]');
    } else {
      // The shared HUD add affordance consumes the same current selection for
      // node families whose old toolbar is intentionally still mounted.
      await h.page.click('[data-lcos-nav-part="pin-add"]');
    }
    await h.requireSelector('[data-lcos-color-pin-palette][data-lcos-color-pin-target-kind="entity"]', { timeout: 5_000 });
    h.requireEqual(
      await h.page.locator('[data-lcos-color-pin-palette]').getAttribute('data-lcos-color-pin-target'),
      target.entityId,
      'Action Arc 应把 Artifact canonical id 交给 Color Pin owner',
    );

    await h.page.click('[data-lcos-color-pin-swatch="violet"]');
    await h.page.waitForFunction(async ({ projectId, entityId, token }) => {
      const envelope = await fetch(`/lcos-core/projects/${projectId}/color-pins`, { headers: { Authorization: `Bearer ${token}` } }).then((response) => response.json());
      return envelope.value.memberships.some((membership) => membership.targetRef.kind === 'entity' && membership.targetRef.id === entityId);
    }, { projectId: PROJECT, entityId: target.entityId, token: TOKEN }, { timeout: 10_000 });
    await h.requireSelector('[data-lcos-nav-part="pin"]', { timeout: 10_000 });

    const persisted = await h.page.evaluate(async ({ projectId, token }) => {
      const envelope = await fetch(`/lcos-core/projects/${projectId}/color-pins`, { headers: { Authorization: `Bearer ${token}` } }).then((response) => response.json());
      return envelope.value.memberships;
    }, { projectId: PROJECT, token: TOKEN });
    h.requireEqual(persisted.length, 1, '一次 authoring 只应写一个 membership');
    h.requireEqual(persisted[0].targetRef.kind, 'entity', '跨 occurrence Pin 必须留在 canonical entity');

    await h.page.click('[data-lcos-nav-part="pin"]');
    await h.requireSelector('[data-lcos-color-pin-member]', { timeout: 5_000 });
    await h.page.click('[data-lcos-color-pin-travel]');
    await h.requireSelector('[data-lcos-focus-where][data-open="true"]', { timeout: 10_000 });
    const occurrenceRows = await h.page.locator('[data-lcos-focus-where][data-open="true"] > div:last-child > div').count();
    h.requireTrue(occurrenceRows >= 2, `同一 canonical Artifact 应列出至少两个 occurrence，实际 ${occurrenceRows}`);
    await h.screenshot(SHOT);

    const travelButtons = h.page.locator('[data-lcos-focus-where][data-open="true"] button', { hasText: '前往' });
    h.requireTrue(await travelButtons.count() > 0, 'Focus/Where 没有可前往的具体 occurrence');
    const sourceUrl = h.page.url();
    await travelButtons.first().click();
    await h.page.waitForFunction((before) => window.location.href !== before, sourceUrl, { timeout: 20_000 });
    h.requireTrue(/\/projects\/[^/]+\/(context|workflow)/.test(h.page.url()), `未进入具体 occurrence 的现场：${h.page.url()}`);
    await h.page.keyboard.press('Escape');

    await h.page.click('[data-lcos-nav-part="pin"]');
    await h.requireSelector('[data-lcos-color-pin-remove]', { timeout: 5_000 });
    await h.page.click('[data-lcos-color-pin-remove]');
    await h.page.waitForFunction(async ({ projectId, token }) => {
      const envelope = await fetch(`/lcos-core/projects/${projectId}/color-pins`, { headers: { Authorization: `Bearer ${token}` } }).then((response) => response.json());
      return envelope.value.memberships.length === 0;
    }, { projectId: PROJECT, token: TOKEN }, { timeout: 10_000 });

    await h.page.reload({ waitUntil: 'domcontentloaded' });
    await h.requireSelector('[data-lcos-project-shell]', { timeout: 30_000 });
    const afterReload = await h.page.evaluate(async ({ projectId, token }) => {
      const envelope = await fetch(`/lcos-core/projects/${projectId}/color-pins`, { headers: { Authorization: `Bearer ${token}` } }).then((response) => response.json());
      return envelope.value.memberships.length;
    }, { projectId: PROJECT, token: TOKEN });
    h.requireEqual(afterReload, 0, '移除结果必须在 reload 后保持');
    h.requireEqual(await h.count('[data-lcos-nav-part="pin"]'), 0, 'orphan definition 不应占导航岛空槽');

    console.log(JSON.stringify({ targetEntityId: target.entityId, occurrenceCount: target.occurrenceCount, membershipId: persisted[0].id, screenshot: SHOT }));
  },
});

if (!result.ok) process.exitCode = 1;
