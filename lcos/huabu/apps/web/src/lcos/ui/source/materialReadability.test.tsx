import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { resolvePresentationDensity } from '@local-creative-os/web-gen2';
import { documentExcerpt, documentSourceLayout } from './documentSourceLayout';
import { DocumentSourceView } from './DocumentSourceView';
import { sourceTextLayout } from './sourceTextLayout';
import { glythBodyLayout } from '../glyth/glythBodyLayout';

it('maps the same true document to identity, one excerpt, key sentences and all supplied preview', () => {
  const preview = '我们从山野出发。收集图像与声音。尝试新的构图。最后整理交付。';
  expect(documentExcerpt(preview, 'mark')).toBe('');
  expect(documentExcerpt(preview, 'summary')).toBe('我们从山野出发。');
  expect(documentExcerpt(preview, 'working')).toBe('我们从山野出发。\n收集图像与声音。\n尝试新的构图。');
  expect(documentExcerpt(preview, 'reading')).toBe(preview);
  for (const density of ['mark', 'summary', 'working', 'reading'] as const) {
    const markup = renderToStaticMarkup(<DocumentSourceView family="document" title="山野研究" density={density} preview={preview} zoom={.535} />);
    expect(markup).toContain('山野研究');
    if (density === 'mark') expect(markup).not.toContain('我们从山野出发');
    if (density === 'summary') expect(markup).not.toContain('最后整理交付');
    if (density === 'reading') expect(markup).toContain('最后整理交付');
  }
});
it('never invents outline blocks for missing text or rewrites a source sentence', () => {
  expect(documentExcerpt(undefined, 'working')).toBe('');
  expect(documentExcerpt('The actual source has no headings.', 'summary')).toBe('The actual source has no headings.');
});
it('keeps a .535-scale summary legible in screen pixels without upgrading its density', () => {
  const zoom = .535;
  const input = { worldWidth: 206, worldHeight: 154, screenWidth: 206 * zoom, screenHeight: 154 * zoom, dpr: 2, zoom, phase: 'rest' as const };
  const density = resolvePresentationDensity(input);
  expect(density).toBe('summary');
  const layout = documentSourceLayout(density, zoom, input.worldHeight);
  expect(layout.titleSize * zoom).toBeGreaterThanOrEqual(12);
  expect(layout.bodySize * zoom).toBeGreaterThanOrEqual(11);
  expect(layout.lines).toBe(1);
  expect(sourceTextLayout('mark', 206, 154, .25).fontSize * .25).toBeGreaterThanOrEqual(12);
});
it('removes the Glyth 34/92 jump across the existing density boundary', () => {
  const below = glythBodyLayout(121, 142, 84 / 121 - .001);
  const above = glythBodyLayout(121, 142, 84 / 121 + .001);
  expect(Math.abs(below.size - above.size)).toBeLessThan(1);
  const actual = glythBodyLayout(106, 126, .535);
  expect(actual.size * .535).toBeGreaterThan(40);
  expect(actual.left + actual.size).toBeLessThanOrEqual(106);
  for (const zoom of [.12, .2, .43, .535, 1, 2]) {
    const value = glythBodyLayout(121, 142, zoom);
    expect(value.size).toBeLessThanOrEqual(121);
    expect(value.left).toBeGreaterThanOrEqual(0);
  }
  expect(glythBodyLayout(121, 142, 1).size).toBe(92);
});
