import type { PresentationDensity } from '@local-creative-os/web-gen2';

/** Maps the owner-supplied density to real excerpt content, never invents headings or a summary. */
export function documentExcerpt(preview: string | undefined, density: PresentationDensity): string {
  if (density === 'mark' || !preview?.trim()) return '';
  const content = preview.trim();
  if (density === 'reading') return content;
  const sentences = content.match(/[^。！？!?\n]+[。！？!?]?/gu) ?? [content];
  return sentences.slice(0, density === 'summary' ? 1 : 3).join('\n').trim();
}

/** Continuous screen legibility within existing world geometry; no camera or density thresholds. */
export function documentSourceLayout(density: PresentationDensity, zoom = 1, worldHeight = 154) {
  const scale = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const titleSize = Math.max(16, 12 / scale);
  const bodySize = Math.max(13, 11 / scale);
  const lineHeight = bodySize * 1.55;
  const padding = Math.max(12, 6 / scale);
  const available = Math.max(lineHeight, worldHeight - padding * 2 - titleSize * 1.5 - 8 - (density === 'reading' ? 28 : 0));
  const lines = Math.max(1, Math.min({ mark: 0, summary: 1, working: 3, reading: 12 }[density], Math.floor(available / lineHeight)));
  return { titleSize, bodySize, lineHeight, padding, lines, iconSize: Math.max(15, 13 / scale) };
}

/** Gen1 documentSemanticZoom extraction idea; no donor thresholds or second LOD owner.
 * Derive real headings, excluding fenced code; a headingless source keeps true excerpt fallback. */
export function documentOutline(markdown: string, density: PresentationDensity): string {
  if (density === 'mark') return '';
  const headings: { depth: number; text: string }[] = [];
  let fence = '';
  for (const line of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    const delimiter = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (delimiter) { if (!fence) fence = delimiter[1]![0]!; else if (delimiter[1]![0] === fence) fence = ''; continue; }
    if (fence) continue;
    const match = line.match(/^\s{0,3}(#{1,3})\s+(.+?)\s*#*\s*$/);
    if (match) headings.push({ depth: match[1]!.length, text: match[2]!.replace(/\*\*|==|`/g, '').trim() });
  }
  // The leading H1 is the document heading; the node already supplies its identity.
  const sections = headings[0]?.depth === 1 ? headings.slice(1) : headings;
  const structural = sections.filter(heading => heading.depth <= 2);
  const selected = structural.length >= 2 ? structural : sections;
  return selected.slice(0, density === 'summary' ? 2 : 7).map(heading => heading.text).join('\n');
}

/** True content fallback for headingless documents; never presents a repeated H1 as an outline. */
export function documentBodyExcerpt(markdown: string, density: PresentationDensity): string {
  const plain = markdown.replace(/^\s{0,3}#{1,6}\s+.*$/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '').replace(/\*\*|==|`/g, '').trim();
  return documentExcerpt(plain, density);
}
