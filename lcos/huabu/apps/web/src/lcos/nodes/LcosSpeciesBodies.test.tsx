// S2b Figma Main source morphology — pure view contract tests.
// These tests verify exact Figma adoption markers and, more importantly, that
// Core visual families no longer collapse into one generic card.

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { LcosSpeciesBodyContent } from './LcosSpeciesBodies';

import type { LcosVisualFamily } from '@local-creative-os/web-gen2';

function renderSource(
  visualFamily: LcosVisualFamily,
  options: { preview?: string; mediaSrc?: string; durationSec?: number; worldWidth?: number; mimeType?: string; artifactKind?: string; sourceRunId?: string; density?: 'mark' | 'summary' | 'working' | 'reading' } = {},
): string {
  return renderToStaticMarkup(
    <LcosSpeciesBodyContent
      species="source"
      title="测试对象"
      density={options.density ?? 'reading'}
      secondary="真实次级行"
      preview={options.preview}
      mediaSrc={options.mediaSrc}
      durationSec={options.durationSec}
      mimeType={options.mimeType}
      artifactKind={options.artifactKind}
      sourceRunId={options.sourceRunId}
      worldWidth={options.worldWidth}
      visualFamily={visualFamily}
    />,
  );
}

describe('LcosSpeciesBodies / Main source morphology', () => {
  it('known image outputs reuse the adopted image body and retain generated provenance', () => {
    const html = renderSource('output', {
      mimeType: 'image/png',
      mediaSrc: '/actual-output.png',
      sourceRunId: 'run-actual',
      artifactKind: 'output',
    });
    expect(html).toContain('data-lcos-source-visual="image"');
    expect(html).toContain('data-figma-node-id="5388:98"');
    expect(html).toContain('src="/actual-output.png"');
    expect(html).toContain('生成结果');
    expect(html).not.toContain('data-lcos-generic-source-family="output"');
  });

  it('generic families keep truthful Chinese identity labels and family-specific glyphs', () => {
    const cases = [
      ['skill', '技能'],
      ['run', '运行'],
      ['output', '运行结果'],
      ['unknown', '来源'],
    ] as const;
    for (const [family, label] of cases) {
      const html = renderSource(family);
      expect(html).toContain(`data-lcos-generic-source-family="${family}"`);
      expect(html).toContain(`>${label}</span>`);
      expect(html).not.toContain(`>${family}</span>`);
    }
  });

  it('generic mark is glyph-only but exposes its real title; summary omits preview while reading keeps it', () => {
    const mark = renderSource('skill', { density: 'mark', preview: '不应在远景显示的正文' });
    expect(mark).toContain('data-density="mark"');
    expect(mark).toContain('role="group"');
    expect(mark).toContain('aria-label="技能：测试对象"');
    expect(mark).toContain('title="技能 · 测试对象"');
    expect(mark).not.toContain('data-lcos-generic-source-title');
    expect(mark).not.toContain('不应在远景显示的正文');

    const summary = renderSource('unknown', { density: 'summary', preview: '摘要档应隐藏的正文' });
    expect(summary).toContain('data-lcos-generic-source-title');
    expect(summary).not.toContain('data-lcos-node-preview');
    expect(summary).not.toContain('摘要档应隐藏的正文');

    const reading = renderSource('unknown', { density: 'reading', preview: '近景真实预览' });
    expect(reading).toContain('近景真实预览');
  });

  it('text → Figma 5388:102 typography object, not generic material card', () => {
    const html = renderSource('text', { preview: '越过边界，看见下一座山。' });
    expect(html).toContain('data-lcos-source-visual="text"');
    expect(html).toContain('data-figma-node-id="5388:102"');
    expect(html).toContain('越过边界，看见下一座山。');
    expect(html).not.toContain('>材料<');
  });

  it('document → Figma 5388:106 paper morphology with real preview', () => {
    const html = renderSource('document', { preview: '不是为了抵达更远，而是重新发现自己。' });
    expect(html).toContain('data-lcos-source-visual="document"');
    expect(html).toContain('data-figma-node-id="5388:106"');
    expect(html).toContain('不是为了抵达更远');
  });

  it('image → Figma 5388:98 media-first morphology and real src', () => {
    const html = renderSource('image', { mediaSrc: 'https://example.test/ridge.png' });
    expect(html).toContain('data-lcos-source-visual="image"');
    expect(html).toContain('data-figma-node-id="5388:98"');
    expect(html).toContain('src="https://example.test/ridge.png"');
  });

  it('audio preserves its identity without fabricating a waveform or playback progress', () => {
    const html = renderSource('audio', { durationSec: 38 });
    expect(html).toContain('data-lcos-source-visual="audio"');
    expect(html).toContain('data-figma-node-id="5388:121"');
    expect(html).not.toContain('data-lcos-waveform');
    expect(html).toContain('00:38');
    expect(html).toContain('播放 测试对象');
    expect(html).not.toContain('data-wave-tone="leading"');
  });
});

it('generated material keeps the actual image and does not invent a pending-review state', () => {
  const html = renderToStaticMarkup(<LcosSpeciesBodyContent species="draft" title="生成图片"
    density="reading" visualFamily="image" mediaSrc="/actual-result.png" sourceRunId="run-confirmed" />);
  expect(html).toContain('src="/actual-result.png"');
  expect(html).toContain('生成结果');
  expect(html).not.toContain('待 Review');
  expect(html).not.toContain('尚未成为 Current');
});

it('reuses the folder face in the Main node and does not claim an unknown organization', () => {
  const html = renderToStaticMarkup(<LcosSpeciesBodyContent species="collection"
    title="项目材料" density="reading" worldWidth={248} worldHeight={244} />);
  expect(html).toContain('lcos-collection-folder-face');
  expect(html).toContain('data-design-source="GEN1-collection"');
  expect(html).toContain('lcos-collection-folder-tab">集合</span>');
  expect(html).not.toContain('组织未标注');
  expect(html).not.toContain('按事情组织');
});

it('presents a real Context scope through its existing Context face without canonical Collection folding or invented time organization', () => {
  const html = renderToStaticMarkup(<LcosSpeciesBodyContent species="collection" contextCollection
    title="研究上下文" density="reading" worldWidth={248} worldHeight={244}
    workflowAction={<button type="button">进入真实上下文</button>} />);
  expect(html).toContain('data-design-source="Figma-5333:96"');
  expect(html).toContain('data-lcos-collection-kind="context-collection"');
  expect(html).toContain('进入真实上下文');
  expect(html).not.toContain('lcos-collection-folder-face');
  expect(html).not.toContain('data-lcos-canonical-collection');
  expect(html).not.toContain('按时间组织');
});

it('unassigned source views do not invent colored memberships', () => {
  expect(renderSource('text')).not.toContain('data-lcos-source-corner-marker');
  expect(renderSource('image', { worldWidth: 200 })).not.toContain('data-lcos-source-corner-marker');
});

it('decision reading uses the real excerpt slot and never invents a recoverable-version claim', () => {
  const reading = renderToStaticMarkup(<LcosSpeciesBodyContent species="decision" title="实地校准" density="reading"
    preview="真实温度记录与影像一致" />);
  expect(reading).toContain('data-figma-node-id="5054:4560"');
  expect(reading).toContain('data-lcos-decision-excerpt');
  expect(reading).toContain('真实温度记录与影像一致');
  expect(reading).not.toContain('版本标记 · 可恢复');

  const empty = renderToStaticMarkup(<LcosSpeciesBodyContent species="decision" title="实地校准" density="reading" />);
  expect(empty).not.toContain('data-lcos-decision-excerpt');
  expect(empty).not.toContain('版本标记 · 可恢复');
});
