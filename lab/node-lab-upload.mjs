import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
const types = new Set(['image/png', 'image/jpeg', 'image/webp']);
const maxBytes = 2 * 1024 * 1024;
export async function createNodeLabUpload({ runtimeRoot, origin }) {
  const root = path.join(runtimeRoot, 'synthetic-uploads');
  await mkdir(root, { recursive: true });
  const file = path.join(root, 'records.json');
  let records;
  try { records = JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; records = []; }
  let writes = Promise.resolve();
  const persist = operation => {
    const next = writes.then(async () => { const copy = structuredClone(records); const result = operation(copy);
      await writeFile(file + '.tmp', JSON.stringify(copy, null, 2)); await rename(file + '.tmp', file); records = copy; return result; });
    writes = next.catch(() => {}); return next;
  };
  const json = (response, status, data) => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ code: status < 300 ? 0 : status * 100, data, message: status < 300 ? '' : data?.error, lcos_adapter: { mode: 'local-upload-fixture', core_connected: false } })); };
  async function body(request, limit) { const parts = []; let size = 0; for await (const chunk of request) { size += chunk.length; if (size > limit) throw Object.assign(new Error('Upload fixture size limit exceeded.'), { status: 413 }); parts.push(chunk); } return Buffer.concat(parts); }
  const validImage = (buffer, type) => type === 'image/png' ? buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    : type === 'image/jpeg' ? buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255
    : buffer.subarray(0,4).toString() === 'RIFF' && buffer.subarray(8,12).toString() === 'WEBP';
  return async function handle(request, response, url) {
    const route = url.pathname;
    if (!route.startsWith('/api/files/upload-urls') && !route.startsWith('/api/node-lab/upload/') && !route.startsWith('/api/conversation/storage/uploads/')) return false;
    try {
      await writes;
      if (route === '/api/files/upload-urls' && request.method === 'POST') {
        const input = JSON.parse((await body(request, 128 * 1024)).toString());
        if (!types.has(input.mime_type) || !Number.isInteger(input.file_size) || input.file_size < 1 || input.file_size > maxBytes || input.is_resumable_mode) { json(response, 400, { error: 'Fixture supports only PNG/JPEG/WebP, <=2 MiB, single PUT.' }); return true; }
        const entry = { id: 'node-fixture-' + randomUUID(), type: input.mime_type, size: input.file_size, uploaded: false, complete: false };
        await persist(copy => copy.push(entry));
        json(response, 200, { file_id: entry.id, upload_strategy: 'single_put', upload_url: origin + '/api/node-lab/upload/' + entry.id, headers: {}, storage_type: 'local-fixture', expires_at: new Date(Date.now() + 600000).toISOString() }); return true;
      }
      const match = /^\/(?:api\/node-lab\/upload|api\/files\/upload-urls|api\/conversation\/storage\/uploads)\/(node-fixture-[a-f0-9-]+)(\/complete)?$/.exec(route);
      const entry = match && records.find(item => item.id === match[1]);
      if (!entry) { json(response, 404, { error: 'Unknown synthetic upload ID.' }); return true; }
      if (route.startsWith('/api/node-lab/upload/') && request.method === 'PUT') {
        const buffer = await body(request, maxBytes);
        if (buffer.length !== entry.size || !validImage(buffer, entry.type)) { json(response, 400, { error: 'Synthetic upload length or image signature mismatch.' }); return true; }
        await writeFile(path.join(root, entry.id), buffer);
        await persist(copy => { copy.find(item => item.id === entry.id).uploaded = true; });
        response.writeHead(200); response.end(); return true;
      }
      if (route.startsWith('/api/files/upload-urls/') && match[2] && request.method === 'PUT') {
        await body(request, 128 * 1024);
        if (!entry.uploaded) { json(response, 409, { error: 'Upload bytes are missing.' }); return true; }
        await persist(copy => { copy.find(item => item.id === entry.id).complete = true; });
        json(response, 200, { file_id: entry.id }); return true;
      }
      if (route.startsWith('/api/conversation/storage/uploads/') && ['GET','HEAD'].includes(request.method)) {
        if (!entry.complete) { json(response, 409, { error: 'Upload not completed.' }); return true; }
        const buffer = await readFile(path.join(root, entry.id));
        response.writeHead(200, { 'Content-Type': entry.type, 'Content-Length': buffer.length }); response.end(request.method === 'HEAD' ? undefined : buffer); return true;
      }
      json(response, 501, { error: 'Synthetic upload action not implemented.' }); return true;
    } catch (error) { json(response, error.status || (error instanceof SyntaxError ? 400 : 500), { error: error.message }); return true; }
  };
}
