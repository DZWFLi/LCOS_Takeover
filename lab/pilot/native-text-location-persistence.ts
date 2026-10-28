import { hasNativeTextLocationExtension, normalizeNativeTextLocator, type NativeTextSourceLocator } from './native-text-location';

// Relation evidence already owns an opaque sourceAnchor string. This only
// distinguishes a normalized text selection from the existing legacy forms.
const TEXT_SELECTION_PREFIX = 'text-selection:';

/** The original Reader layout parser still rejects a supplied invalid locator.
 * No account/session data is copied and no new persistence owner is created. */
export function normalizeNativePersistedSourceLocator(value: unknown): NativeTextSourceLocator | undefined {
  return normalizeNativeTextLocator(value);
}

/** Preserve legacy sourceAnchor bytes. New text/group coordinates travel in
 * the same relation evidence, never reduced to a section label or line guess. */
export function encodeNativeMaterialSourceAnchor(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  const locator = normalizeNativeTextLocator(value);
  if (!locator) throw new Error('来源位置尚未确认，未继续保存这份摘录；原文保留。');
  if (hasNativeTextLocationExtension(locator)) return TEXT_SELECTION_PREFIX + JSON.stringify(locator);
  if (locator.kind === 'page') return `pdf:p${locator.pageNumber}`;
  if (locator.kind === 'slide') return `pptx:s${locator.slideNumber}`;
  if (locator.kind === 'lines') return `text:l${locator.start + 1}-l${locator.end + 1}`;
  if (locator.kind === 'selection' && locator.label) return `section:${locator.label}`;
  return undefined;
}

/** Invalid/unknown coordinates stay unavailable to the original lineage
 * reader. In particular a malformed new envelope cannot fall through into
 * legacy section/line positioning or silently become a positionless read. */
export function decodeNativeReaderSourceLocator(anchor?: string): NativeTextSourceLocator | undefined {
  if (typeof anchor !== 'string' || !anchor) return undefined;
  if (anchor.startsWith(TEXT_SELECTION_PREFIX)) {
    try {
      const value: unknown = JSON.parse(anchor.slice(TEXT_SELECTION_PREFIX.length));
      if (!hasNativeTextLocationExtension(value)) return undefined;
      return normalizeNativeTextLocator(value);
    } catch { return undefined; }
  }
  const page = /^pdf:p([1-9]\d*)$/.exec(anchor), slide = /^pptx:s([1-9]\d*)$/.exec(anchor);
  const value = page?.[1] ?? slide?.[1];
  if (value && Number.isSafeInteger(Number(value))) return page ? { kind: 'page', pageNumber: Number(value), label: `第 ${value} 页` }
    : { kind: 'slide', slideNumber: Number(value), label: `第 ${value} 页` };
  const lines = /^text:l([1-9]\d*)-l([1-9]\d*)$/.exec(anchor);
  if (lines && Number.isSafeInteger(Number(lines[1])) && Number.isSafeInteger(Number(lines[2])) && Number(lines[2]) >= Number(lines[1]))
    return { kind: 'lines', start: Number(lines[1]) - 1, end: Number(lines[2]) - 1, label: `第 ${lines[1]}–${lines[2]} 行` };
  return anchor.startsWith('section:') && anchor.slice(8).trim() ? { kind: 'selection', label: anchor.slice(8) } : undefined;
}
