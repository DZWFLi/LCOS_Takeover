// Gen1@3e99769 artifactViewerRegistry.tsx: Pagus parse + SVG render adoption.
// @pagus-kit/core and @pagus-kit/renderer 0.1.1, MIT. No network/font service.
export interface ReaderPptxContent {
  readonly kind: 'pptx';
  readonly slides: readonly string[];
  readonly value: string;
  readonly mimeType: string;
  readonly viewKey?: string;
}

function passiveSvg(svg: string): { svg: string; text: string } {
  const inert = document.createElement('template');
  inert.innerHTML = svg;
  const root = inert.content.firstElementChild;
  if (!root || root.localName !== 'svg')
    throw new Error('PPTX 页面没有返回可读取的 SVG。');
  // Pagus renders text as XHTML inside foreignObject; keep that real content.
  root.querySelectorAll('script,iframe,object,embed,link,meta').forEach(element => element.remove());
  for (const element of [root, ...root.querySelectorAll('*')]) for (const attribute of [...element.attributes]) {
    if (/^on/i.test(attribute.name) || /^(?:javascript|vbscript):/i.test(attribute.value.trim())) element.removeAttribute(attribute.name);
  }
  return { svg: root.outerHTML,
    text: [...root.querySelectorAll('text,foreignObject')].map(element => element.textContent ?? '').join('\n') };
}

/** The caller already owns exact revision bytes; errors never fall back to Current. */
export async function readReaderPptx(bytes: Blob, input: { readonly viewKey?: string; readonly signal?: AbortSignal }): Promise<ReaderPptxContent> {
  input.signal?.throwIfAborted();
  const [{ parse }, { renderSlide }] = await Promise.all([import('@pagus-kit/core'), import('@pagus-kit/renderer')]);
  input.signal?.throwIfAborted();
  const buffer = await bytes.arrayBuffer();
  input.signal?.throwIfAborted();
  const presentation = await parse(buffer);
  input.signal?.throwIfAborted();
  const pages = presentation.slides.map(slide => passiveSvg(renderSlide(slide, presentation.slideSize).svg));
  input.signal?.throwIfAborted();
  return { kind: 'pptx', slides: pages.map(page => page.svg), value: pages.map(page => page.text).join('\n\n'),
    mimeType: bytes.type, ...(input.viewKey === undefined ? {} : { viewKey: input.viewKey }) };
}
