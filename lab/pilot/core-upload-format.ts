import path from 'node:path'
import { unzipSync } from 'fflate'
import { artifactKindForFile, mimeTypeForFile } from '../../lcos/apps/local-core/src/file-format-registry.ts'

// These are file/container checks, not a claim that a native canvas renderer,
// decoder, transcription worker, or archive extractor exists for every format.
const EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.txt', '.md', '.csv', '.json', '.yaml', '.yml',
  '.xml', '.html', '.pdf', '.docx', '.pptx', '.xlsx', '.zip', '.mp3', '.wav', '.m4a', '.mp4', '.mov', '.webm'])
const UTF8_EXTENSIONS = new Set(['.txt', '.md', '.csv', '.json', '.yaml', '.yml', '.xml', '.html'])
const MIME_ALIASES: Readonly<Record<string, readonly string[]>> = {
  'audio/wav': ['audio/x-wav', 'audio/wave', 'audio/vnd.wave'],
  'audio/mp4': ['audio/x-m4a'],
  'application/zip': ['application/x-zip-compressed'],
  'text/markdown': ['text/x-markdown', 'text/plain'],
  'application/yaml': ['text/yaml', 'application/x-yaml'],
  'application/xml': ['text/xml'],
}

export function coreUploadFormat(fileName: string, providedMimeType: unknown) {
  const extension = path.extname(fileName).toLowerCase()
  if (!EXTENSIONS.has(extension) || typeof providedMimeType !== 'string') return undefined
  const mimeType = mimeTypeForFile(fileName)
  const provided = providedMimeType.trim().toLowerCase()
  if (provided && provided !== 'application/octet-stream' && provided !== mimeType
    && !MIME_ALIASES[mimeType]?.includes(provided)) return undefined
  return { extension, mimeType, artifactKind: artifactKindForFile(fileName, mimeType) }
}

function utf8(bytes: Buffer): string | undefined {
  try {
    const value = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    return value.includes('\0') ? undefined : value
  } catch { return undefined }
}

/** Validate the original ZIP directory and local byte ranges without unpacking an archive. */
function zipEntries(bytes: Buffer): Set<string> | undefined {
  let end = bytes.length - 22
  while (end >= Math.max(0, bytes.length - 65557) && bytes.readUInt32LE(end) !== 0x06054b50) end--
  if (end < 0 || end < bytes.length - 65557 || end + 22 + bytes.readUInt16LE(end + 20) !== bytes.length) return undefined
  const count = bytes.readUInt16LE(end + 10), offset = bytes.readUInt32LE(end + 16), size = bytes.readUInt32LE(end + 12)
  // Multi-disk/ZIP64 containers have no connected validation path here.
  if (bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6) || count !== bytes.readUInt16LE(end + 8)
    || count === 0xffff || offset === 0xffffffff || offset + size !== end) return undefined
  const names = new Set<string>()
  let at = offset
  for (let index = 0; index < count; index++) {
    if (at + 46 > end || bytes.readUInt32LE(at) !== 0x02014b50) return undefined
    const compressed = bytes.readUInt32LE(at + 20), uncompressed = bytes.readUInt32LE(at + 24)
    const nameLength = bytes.readUInt16LE(at + 28), extra = bytes.readUInt16LE(at + 30), comment = bytes.readUInt16LE(at + 32)
    const local = bytes.readUInt32LE(at + 42), next = at + 46 + nameLength + extra + comment
    if (next > end || local + 30 > offset || bytes.readUInt32LE(local) !== 0x04034b50
      || compressed === 0xffffffff || uncompressed === 0xffffffff) return undefined
    const localName = bytes.readUInt16LE(local + 26), localExtra = bytes.readUInt16LE(local + 28)
    const content = local + 30 + localName + localExtra
    const name = bytes.subarray(at + 46, at + 46 + nameLength).toString('utf8')
    if (!name || names.has(name) || content + compressed > offset || localName !== nameLength
      || !bytes.subarray(local + 30, local + 30 + localName).equals(bytes.subarray(at + 46, at + 46 + nameLength))) return undefined
    names.add(name)
    at = next
  }
  return at === offset + size ? names : undefined
}

function office(bytes: Buffer, extension: string): boolean {
  const names = zipEntries(bytes)
  const part = extension === '.docx' ? 'word/document.xml' : extension === '.pptx' ? 'ppt/presentation.xml' : 'xl/workbook.xml'
  if (!names?.has('[Content_Types].xml') || !names.has('_rels/.rels') || !names.has(part)) return false
  try {
    // Read only the two format declarations. Never inflate arbitrary archive
    // members, nor a declared XML part larger than the existing import ceiling.
    const entries = unzipSync(bytes, { filter: (file) => {
      if (file.name !== '[Content_Types].xml' && file.name !== part) return false
      if (file.originalSize > 128 * 1024 * 1024 || ![0, 8].includes(file.compression)) throw new Error('Unsupported Office declaration')
      return true
    } })
    const types = entries['[Content_Types].xml'] && utf8(Buffer.from(entries['[Content_Types].xml']))
    const body = entries[part] && utf8(Buffer.from(entries[part]))
    const declaration = extension === '.docx' ? 'wordprocessingml.document.main+xml'
      : extension === '.pptx' ? 'presentationml.presentation.main+xml' : 'spreadsheetml.sheet.main+xml'
    return Boolean(types?.includes(declaration) && types.includes(`/${part}`) && body?.trim().startsWith('<'))
  } catch { return false }
}

function wav(bytes: Buffer): boolean {
  if (bytes.length < 44 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE'
    || bytes.readUInt32LE(4) + 8 !== bytes.length) return false
  let at = 12, format = false, data = false
  while (at + 8 <= bytes.length) {
    const size = bytes.readUInt32LE(at + 4), next = at + 8 + size + (size & 1)
    if (next > bytes.length) return false
    if (bytes.toString('ascii', at, at + 4) === 'fmt ') format = size >= 16
    if (bytes.toString('ascii', at, at + 4) === 'data') data = size > 0
    at = next
  }
  return at === bytes.length && format && data
}

function mp3(bytes: Buffer): boolean {
  let at = 0, frames = 0
  if (bytes.toString('ascii', 0, 3) === 'ID3') {
    if (bytes.length < 10 || bytes.subarray(6, 10).some(value => value > 127)) return false
    const size = bytes[6]! * 2097152 + bytes[7]! * 16384 + bytes[8]! * 128 + bytes[9]!
    at = 10 + size + ((bytes[5]! & 0x10) ? 10 : 0)
  }
  while (at + 4 <= bytes.length) {
    if (bytes.length - at === 128 && bytes.toString('ascii', at, at + 3) === 'TAG') { at += 128; break }
    const a = bytes[at]!, b = bytes[at + 1]!, c = bytes[at + 2]!
    const version = (b >> 3) & 3, layer = (b >> 1) & 3, rateIndex = (c >> 2) & 3, bitIndex = c >> 4
    if (a !== 255 || (b & 224) !== 224 || version === 1 || layer !== 1 || rateIndex === 3 || bitIndex === 0 || bitIndex === 15) return false
    const rates = version === 3 ? [44100, 48000, 32000] : version === 2 ? [22050, 24000, 16000] : [11025, 12000, 8000]
    const bitrates = version === 3 ? [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
      : [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]
    const length = Math.floor((version === 3 ? 144000 : 72000) * bitrates[bitIndex]! / rates[rateIndex]!) + ((c >> 1) & 1)
    if (at + length > bytes.length) return false
    at += length
    frames++
  }
  return frames > 0 && at === bytes.length
}

function isoMedia(bytes: Buffer, extension: string): boolean {
  let at = 0, fileType = false, movie = false, data = false
  while (at + 8 <= bytes.length) {
    let size = bytes.readUInt32BE(at), header = 8
    const kind = bytes.toString('ascii', at + 4, at + 8)
    if (size === 1) {
      if (at + 16 > bytes.length) return false
      const large = bytes.readBigUInt64BE(at + 8)
      if (large > BigInt(Number.MAX_SAFE_INTEGER)) return false
      size = Number(large); header = 16
    } else if (size === 0) size = bytes.length - at
    if (size < header || at + size > bytes.length) return false
    if (kind === 'ftyp') fileType = size >= header + 8
    if (kind === 'moov') movie = size > header
    if (kind === 'mdat') data = size > header
    at += size
  }
  return at === bytes.length && movie && data && (fileType || extension === '.mov')
}

function ebmlLength(bytes: Buffer, at: number, identifier = false): { value: number; next: number; unknown: boolean } | undefined {
  const first = bytes[at]
  if (first === undefined || first === 0) return undefined
  let length = 1
  while (length <= 8 && !(first & (128 >> (length - 1)))) length++
  if (length > (identifier ? 4 : 8) || at + length > bytes.length) return undefined
  let value = identifier ? first : first & ((128 >> (length - 1)) - 1)
  let unknown = !identifier && value === ((128 >> (length - 1)) - 1)
  for (let index = 1; index < length; index++) { value = value * 256 + bytes[at + index]!; unknown &&= bytes[at + index] === 255 }
  return Number.isSafeInteger(value) ? { value, next: at + length, unknown } : undefined
}

function webm(bytes: Buffer): boolean {
  const id = ebmlLength(bytes, 0, true), header = id && ebmlLength(bytes, id.next)
  if (id?.value !== 0x1a45dfa3 || !header || header.unknown || header.next + header.value >= bytes.length) return false
  const headerEnd = header.next + header.value
  if (!bytes.subarray(header.next, headerEnd).includes(Buffer.from('webm'))) return false
  const segmentId = ebmlLength(bytes, headerEnd, true), segment = segmentId && ebmlLength(bytes, segmentId.next)
  if (segmentId?.value !== 0x18538067 || !segment || (!segment.unknown && segment.next + segment.value !== bytes.length)) return false
  let at = segment.next, tracks = false, cluster = false
  while (at < bytes.length) {
    const child = ebmlLength(bytes, at, true), size = child && ebmlLength(bytes, child.next)
    if (!child || !size || size.unknown || size.next + size.value > bytes.length) return false
    tracks ||= child.value === 0x1654ae6b && size.value > 0
    cluster ||= child.value === 0x1f43b675 && size.value > 0
    at = size.next + size.value
  }
  return tracks && cluster
}

export function validCoreUploadBytes(bytes: Buffer, fileName: string, mimeType: string): boolean {
  const format = coreUploadFormat(fileName, mimeType)
  if (!format || !bytes.length) return false
  const { extension } = format
  if (mimeType === 'image/png') return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  if (mimeType === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
  if (mimeType === 'image/webp') return bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
  if (UTF8_EXTENSIONS.has(extension)) {
    const text = utf8(bytes)
    if (text === undefined) return false
    if (extension === '.json') { try { JSON.parse(text); } catch { return false } }
    return true
  }
  if (extension === '.pdf') return bytes.subarray(0, 5).toString() === '%PDF-'
    && /%%EOF\s*$/.test(bytes.subarray(Math.max(0, bytes.length - 1024)).toString('latin1'))
  if (['.docx', '.pptx', '.xlsx'].includes(extension)) return office(bytes, extension)
  if (extension === '.zip') return zipEntries(bytes) !== undefined
  if (extension === '.wav') return wav(bytes)
  if (extension === '.mp3') return mp3(bytes)
  if (['.mp4', '.mov', '.m4a'].includes(extension)) return isoMedia(bytes, extension)
  if (extension === '.webm') return webm(bytes)
  return false
}
