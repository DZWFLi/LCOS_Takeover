import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const web = path.join(root, 'reference', 'tapnow-installed', 'resources', 'web');
const files = [];
async function walk(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(absolute);
    else if (entry.isFile()) files.push(absolute);
  }
}
await walk(web);
const extensions = {};
const apiShapes = new Set();
const missingImports = [];
let bytes = 0;
let importReferences = 0;
for (const absolute of files) {
  const stat = await fs.stat(absolute);
  bytes += stat.size;
  const extension = path.extname(absolute) || '(none)';
  extensions[extension] = (extensions[extension] || 0) + 1;
  if (extension !== '.js') continue;
  const content = await fs.readFile(absolute, 'utf8');
  for (const match of content.matchAll(/(?:\bfrom\s*|\bimport\s*\()\s*["']([^"']+)["']/g)) {
    if (!match[1].startsWith('./') && !match[1].startsWith('../')) continue;
    importReferences++;
    try { await fs.access(path.resolve(path.dirname(absolute), match[1])); }
    catch { missingImports.push({ file: path.relative(web, absolute), dependency: match[1] }); }
  }
  for (const match of content.matchAll(/\/(?:api|v1|v2)\/[A-Za-z0-9_?&=./:{}-]+/g)) {
    const value = match[0].split('?')[0].replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id');
    if (!value.includes('/envelope/')) apiShapes.add(value);
  }
}
const preload = await fs.readFile(path.join(root, 'reference', 'desktop-shell', 'preload.cjs'), 'utf8');
const ipc = [...new Set(preload.match(/tap-desktop:[a-z0-9:-]+/g) || [])].sort();
const meta = JSON.parse(await fs.readFile(path.join(web, 'desktop-build-meta.json'), 'utf8'));
const report = {
  workspace: 'LCOS-DSH-03',
  installedDesktopVersion: '0.4.95',
  webBundleVersion: meta.release.webBundleVersion,
  webFiles: files.length,
  webBytes: bytes,
  extensions,
  sourceMaps: extensions['.map'] || 0,
  importScan: { method: 'lexical static/dynamic import inspection; not complete AST analysis', references: importReferences, missing: missingImports },
  apiScan: { method: 'URL string heuristic, normalized sample IDs; not endpoint count', shapes: [...apiShapes].sort() },
  desktopIpcChannels: ipc,
  firstOfflineTool: 'usercontent-proxy/apps/color-adjust@v2.285e6ccb.html'
};
await fs.mkdir(path.join(root, 'evidence'), { recursive: true });
await fs.writeFile(path.join(root, 'evidence', 'inventory.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ workspace: report.workspace, webBundle: report.webBundleVersion, files: report.webFiles, bytes, extensions, importReferences, missingImports: missingImports.length, ipcChannels: ipc.length }, null, 2));
