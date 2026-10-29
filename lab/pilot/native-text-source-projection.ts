import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseHTML } from 'linkedom';
import { CT } from 'lcos-original-text-course';
import { createNativeTextIndex } from './native-text-location';

/** The same original CT and exact index used by the Reader. linkedom parses
 * inert local markup only: no global fake DOM, script execution or network. */
export async function nativeExcerptSourceText(markdown: string): Promise<string> {
  const markup = renderToStaticMarkup(createElement(CT, { markdown, sourceLines: true }));
  const { document } = parseHTML('<!doctype html><html><head></head><body><div id="native-source-root">' + markup + '</div></body></html>');
  const root = document.getElementById('native-source-root');
  if (!root) throw new Error('Original text renderer did not produce a document root.');
  return createNativeTextIndex(root).text;
}
