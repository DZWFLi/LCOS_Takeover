// R2 呈现描述 + 节点卡片注册表测试（node:test）。
// 两条红线在这里被钉住：
//   1. 未绑定 Core 的用户节点绝不被 LCOS body 顶掉（note/text 不兜底 → unknown → native）；
//   2. 同一个物种只能有一个渲染器 owner（重复注册直接抛错，不静默覆盖）。

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildNodeSecondaryLine,
  buildContentPreview,
  describeProjectedEntity,
  resolveNodeSpeciesFromFacts,
} from '../src/presentation/projectedNodeDescriptor.js';
import { createNodeCardRegistry } from '../src/presentation/rendererRegistry.js';

test('R2 次级行：只写真实事实', () => {
  assert.equal(
    buildNodeSecondaryLine({
      entityType: 'artifact',
      entityId: 'a1',
      title: 'Brief',
      artifactKind: 'markdown',
      managed: true,
      availability: 'current',
    }),
    '文本 · 受管',
  );
  assert.equal(
    buildNodeSecondaryLine({
      entityType: 'artifact',
      entityId: 'a2',
      title: 'Pic',
      artifactKind: 'image',
      availability: 'missing',
    }),
    '图片 · 源缺失',
  );
  assert.equal(
    buildNodeSecondaryLine({ entityType: 'artifact', entityId: 'a3', title: 'X', currentRevisionId: 'abcdef1234567' }),
    'rev abcdef12',
  );
  assert.equal(
    buildNodeSecondaryLine({
      entityType: 'artifact',
      entityId: 'a4',
      title: 'Historical projection',
      currentRevisionId: 'current-1234567',
      presentedRevisionId: 'history-7654321',
    }),
    'rev history-',
  );
  // 没有任何事实 → 明确说没有，不编造内容
  assert.equal(buildNodeSecondaryLine({ entityType: 'artifact', entityId: 'a4', title: 'Y' }), '（无 Core 元数据）');
});

test('R2 物种解析：Core 事实优先', () => {
  assert.equal(resolveNodeSpeciesFromFacts({ entityType: 'conversation' }), 'glyth');
  assert.equal(resolveNodeSpeciesFromFacts({ entityType: 'run' }), 'run');
  assert.equal(resolveNodeSpeciesFromFacts({ entityType: 'skill' }), 'source');
  assert.equal(resolveNodeSpeciesFromFacts({ entityType: 'artifact', artifactKind: 'markdown' }), 'source');
  assert.equal(
    resolveNodeSpeciesFromFacts({ entityType: 'artifact', artifactKind: 'reference' }),
    'context-reference',
  );
  // 绑定了但缺 Kind 事实 → 仍按机械投影（不因一次 Core 抖动退回 native）
  assert.equal(resolveNodeSpeciesFromFacts({ entityType: 'artifact' }), 'source');
  assert.equal(
    resolveNodeSpeciesFromFacts({ entityType: 'artifact', sourceRunId: 'run-1', managed: true }),
    'draft',
  );
});

test('Wave 3 Draft 次级行保留真实 Run 来源', () => {
  assert.equal(
    buildNodeSecondaryLine({
      entityType: 'artifact',
      entityId: 'a-draft',
      title: 'Generated brief',
      artifactKind: 'markdown',
      managed: true,
      sourceRunId: 'run-1',
    }),
    '文本 · 受管 · Run 产出',
  );
});

test('R2 物种解析：未绑定用户节点绝不兜底成 LCOS 物种', () => {
  for (const huabuNodeType of ['note', 'text', 'image', 'pdf', 'frame', 'question', 'sketch']) {
    assert.equal(
      resolveNodeSpeciesFromFacts({ huabuNodeType }),
      'unknown',
      `${huabuNodeType} 不应被兜底成 LCOS 物种`,
    );
  }
  // 唯一例外：纯入口壳（本身没有可编辑内容）
  assert.equal(resolveNodeSpeciesFromFacts({ huabuNodeType: 'canvasRef' }), 'portal');
});

test('R2 描述：species 与 secondaryLine 同源', () => {
  const descriptor = describeProjectedEntity({
    entityType: 'artifact',
    entityId: 'a1',
    title: 'Brief',
    artifactKind: 'pdf',
    availability: 'current',
  });
  assert.equal(descriptor.species, 'source');
  assert.equal(descriptor.secondaryLine, 'PDF');
});

test('R2 节点卡片注册表：一个物种一个 owner，未注册返回 undefined', () => {
  const reg = createNodeCardRegistry<string, string>();
  reg.registerNodeCard('source', 'SourceCard');
  assert.equal(reg.resolveNodeCard('source'), 'SourceCard');
  assert.equal(reg.isRegistered('source'), true);
  assert.equal(reg.resolveNodeCard('run'), undefined);
  assert.throws(() => reg.registerNodeCard('source', 'AnotherCard'), /已有 owner/);
  assert.deepEqual(reg.registeredSpecies(), ['source']);
});

test('lightweight text previews preserve source line and paragraph boundaries without changing document summaries', () => {
  const lines = { preserveLineBreaks: true };
  assert.equal(buildContentPreview('越过边界，\r\n看见下一座山。', 160, lines), '越过边界，\n看见下一座山。');
  assert.equal(buildContentPreview(' 第一行\n\n\n\n第二行\t  内容\n ', 160, lines), '第一行\n\n第二行 内容');
  assert.equal(buildContentPreview('A\nBCD', 3, lines), 'A\nB…');
  assert.equal(buildContentPreview('AB\nCD', 3, lines), 'AB…');
  assert.equal(buildContentPreview('AB\nCD', 5, lines), 'AB\nCD');
  assert.equal(buildContentPreview(' \r\n\t ', 160, lines), '');
  assert.equal(buildContentPreview('# 标题\n- 第一项\n- 第二项'), '第一项 第二项');
});
