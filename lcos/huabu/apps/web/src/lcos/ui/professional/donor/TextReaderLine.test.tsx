import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { TextReaderLine } from './TextReaderLine';

const render = (line: string, query = '', idPrefix = 'reader-a'): string =>
  renderToStaticMarkup(<TextReaderLine line={line} query={query} index={0} idPrefix={idPrefix} />);

describe('GEN1 read-only line renderer', () => {
  it('renders authored headings and quotations', () => {
    expect(render('# 标题')).toContain('<h2');
    expect(render('> 引用')).toContain('<blockquote');
  });
  it('escapes source HTML and never executes it', () => {
    const html = render('<script>window.injected=true</script>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
  it('uses the caller-specific namespace for line IDs', () => {
    expect(render('正文', '', 'a')).toContain('id="a-text-line-0"');
    expect(render('正文', '', 'b')).toContain('id="b-text-line-0"');
  });
  it('highlights an explicitly supplied query without altering content', () => {
    expect(render('正文与正文', '正文')).toContain('<mark>正文</mark>与<mark>正文</mark>');
  });
});
