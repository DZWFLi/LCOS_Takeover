import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { TextSourceView } from './TextSourceView';
import { DocumentSourceView } from './DocumentSourceView';
import { sourceTextLayout } from './sourceTextLayout';

it('keeps the adopted reading typography at the Figma size but fits smaller real nodes', () => {
  expect(sourceTextLayout('reading', 385, 142)).toEqual({ fontSize: 37, lineHeight: 58, lines: 2 });
  const narrow = sourceTextLayout('reading', 180, 80);
  expect(narrow.fontSize).toBeLessThan(37);
  expect(narrow.lineHeight * narrow.lines).toBeLessThanOrEqual(60);
});
it('each density changes readable content, without replacing its title or geometry owner', () => {
  const text = (density: 'mark' | 'summary' | 'working' | 'reading') => renderToStaticMarkup(
    <TextSourceView family="text" title="原始身份" preview="真实正文内容" secondary="真实来源"
      density={density} worldWidth={385} worldHeight={142} />);
  expect(text('mark')).toContain('原始身份');
  expect(text('mark')).not.toContain('真实正文内容');
  expect(text('summary')).toContain('真实正文内容');
  expect(text('summary')).not.toContain('lcos-source-caption');
  expect(text('working')).toContain('原始身份');
  expect(text('working')).not.toContain('真实来源');
  expect(text('reading')).toContain('真实来源');
});
it('document identity survives mark density; detail remains supplied content', () => {
  const render = (density: 'mark' | 'reading') => renderToStaticMarkup(<DocumentSourceView
    family="document" title="文档身份" preview="已有内容" secondary="真实版本" density={density} />);
  expect(render('mark')).toContain('文档身份');
  expect(render('mark')).not.toContain('已有内容');
  expect(render('reading')).toContain('已有内容');
  expect(render('reading')).toContain('真实版本');
});
