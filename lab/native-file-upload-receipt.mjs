/** Stateless completion adoption inside the original Jir/Mor upload owner.
 * Self-contained on purpose: the donor index must not import agent-ui and
 * introduce a new course/index/host initialization cycle. */
export function LCOSNativeFileUploadReceipt(original, incoming, file) {
  const nonempty = value => typeof value === 'string' && !!value.trim();
  const record = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const expected = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
    txt: 'text/plain', md: 'text/markdown', csv: 'text/csv', json: 'application/json',
    yaml: 'application/yaml', yml: 'application/yaml', xml: 'application/xml', html: 'text/html', pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', zip: 'application/zip',
    mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
  };
  const aliases = { 'audio/wav': ['audio/x-wav', 'audio/wave', 'audio/vnd.wave'], 'audio/mp4': ['audio/x-m4a'],
    'application/zip': ['application/x-zip-compressed'], 'text/markdown': ['text/x-markdown', 'text/plain'],
    'application/yaml': ['text/yaml', 'application/x-yaml'], 'application/xml': ['text/xml'] };
  const extension = typeof file?.name === 'string' ? /\.([^.]+)$/.exec(file.name.toLowerCase())?.[1] : '';
  const mime = expected[extension], provided = typeof file?.type === 'string' ? file.type.trim().toLowerCase() : '';
  const info = original?.fileInfo, ref = incoming?.lcos_ref;
  if (original?.success !== true || !record(info) || !record(incoming) || !record(ref) || !mime
    || provided && provided !== 'application/octet-stream' && provided !== mime && !aliases[mime]?.includes(provided)
    || incoming.file_id !== info.file_id || incoming.file_name !== file.name || info.file_name !== file.name
    || incoming.file_size !== file.size || info.file_size !== file.size || incoming.mime_type !== mime
    || incoming.url !== info.url || !nonempty(incoming.fileRecordId)
    || !['image', 'markdown', 'pdf', 'presentation', 'other', 'text'].includes(incoming.artifact_kind)
    || ref.version !== 1 || ref.entityType !== 'artifact' || ref.entityId !== ref.artifactId
    || !['entityId', 'artifactId', 'artifactViewId', 'revisionId'].every(key => nonempty(ref[key]))) return original;
  return { ...original, fileInfo: { ...info, ...incoming, lcos_ref: { ...ref } } };
}
