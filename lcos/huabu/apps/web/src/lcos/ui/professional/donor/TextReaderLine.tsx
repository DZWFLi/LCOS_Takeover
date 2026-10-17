// Actual GEN1 artifactViewerRegistry.tsx TextReaderLine/highlightReaderMatch.
// Thin adapter: per-reader IDs prevent duplicate DOM IDs; strict indexed access guarded.
import type { ReactNode } from 'react';

export function TextReaderLine({ line, index, query, idPrefix }: { line: string; index: number; query: string; idPrefix: string }) {
  const heading = line.match(/^(#{1,3})\s+(.+)$/)
  const list = line.match(/^\s*[-*]\s+(.+)$/)
  const quote = line.match(/^\s*>\s?(.*)$/)
  const code = /^\s{4}/.test(line) || /^```/.test(line)
  const content = heading?.[2] ?? list?.[1] ?? quote?.[1] ?? line
  const rendered = highlightReaderMatch(content || ' ', query)
  if (heading) {
    const Tag = (`h${Math.min(3, (heading[1]?.length ?? 1) + 1)}`) as 'h2' | 'h3' | 'h4'
    return <Tag id={`${idPrefix}-text-line-${index}`} data-line={index}>{rendered}</Tag>
  }
  if (list) return <div id={`${idPrefix}-text-line-${index}`} className="reader-list" data-line={index}><i/> <span>{rendered}</span></div>
  if (quote) return <blockquote id={`${idPrefix}-text-line-${index}`} data-line={index}>{rendered}</blockquote>
  if (code) return <code id={`${idPrefix}-text-line-${index}`} className="reader-code" data-line={index}>{rendered}</code>
  if (!line.trim()) return <span id={`${idPrefix}-text-line-${index}`} className="reader-space" data-line={index} aria-hidden="true" />
  return <p id={`${idPrefix}-text-line-${index}`} data-line={index}>{rendered}</p>
}

export function highlightReaderMatch(text: string, query: string) {
  const needle = query.trim()
  if (!needle) return text
  const lower = text.toLocaleLowerCase()
  const target = needle.toLocaleLowerCase()
  const parts: ReactNode[] = []
  let cursor = 0
  let matchIndex = lower.indexOf(target, cursor)
  let key = 0
  while (matchIndex >= 0) {
    if (matchIndex > cursor) parts.push(text.slice(cursor, matchIndex))
    parts.push(<mark key={key++}>{text.slice(matchIndex, matchIndex + needle.length)}</mark>)
    cursor = matchIndex + needle.length
    matchIndex = lower.indexOf(target, cursor)
  }
  if (cursor < text.length) parts.push(text.slice(cursor))
  return parts
}
