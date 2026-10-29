import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const vendorRoot = path.join(root, 'reference', 'tapnow-installed', 'resources', 'web');
const groups = {};
async function walk(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(filename);
    else {
      const extension = path.extname(filename).toLowerCase() || '(none)';
      const group = groups[extension] ||= { count: 0, bytes: 0 };
      group.count++; group.bytes += (await fs.stat(filename)).size;
    }
  }
}
await walk(vendorRoot);
const volume = bytes => ({ bytes, MB: +(bytes / 1e6).toFixed(2), MiB: +(bytes / 1048576).toFixed(2) });
const sum = extensions => extensions.reduce((total, extension) => total + (groups[extension]?.bytes || 0), 0);
const evidence = {
  measuredAt: new Date().toISOString(), workspace: 'LCOS-DSH-03', source: 'copied installed resources/web only',
  excluded: ['Electron executable and Chromium/Node runtime', 'app.asar desktop shell', 'our lab code and formatted analysis outputs'],
  units: 'MB = 1,000,000 bytes; MiB = 1,048,576 bytes; raw installed file bytes, not gzip/brotli transfer size',
  groups, jsCss: volume(sum(['.js', '.css'])), html: volume(sum(['.html'])),
  jsCssHtml: volume(sum(['.js', '.css', '.html'])),
  totalWebDirectory: volume(Object.values(groups).reduce((total, group) => total + group.bytes, 0)),
  mainBundle: volume((await fs.stat(path.join(vendorRoot, 'assets', 'index-BAQXnPag.js'))).size),
  limitation: 'Includes third-party React/Three/SDK/library code. No reliable proprietary-business-only byte attribution without original build metadata.'
};
await fs.writeFile(path.join(root, 'evidence', 'code-volume.json'), JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify({ jsCss: evidence.jsCss, jsCssHtml: evidence.jsCssHtml, totalWebDirectory: evidence.totalWebDirectory }, null, 2));
