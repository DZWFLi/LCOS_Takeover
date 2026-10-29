import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cache = path.join(process.env.LOCALAPPDATA, 'npm-cache', '_npx');
const cli = fs.readdirSync(cache).map(entry => path.join(cache, entry, 'node_modules/@playwright/cli/playwright-cli.js')).find(file => fs.existsSync(file));
if (!cli) throw new Error('Cached CLI unavailable; no install attempted.');
const output = execFileSync(process.execPath, [cli, '-s=dsh-03-nodes', 'run-code', 'async page => { return { url:page.url(), title:await page.title(), cases:page.__nodeCases || [], pageErrors:page.__nodeLabReport?.errors || [], contextBlockedCount:page.__nodeLabReport?.externalBlocked?.length || 0, requests:(page.__nodeLabReport?.requests || []).filter(r=>r.path.startsWith("/api/")).slice(-350) }; }'], { cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
const line = output.split(/\r?\n/).find(line => line.startsWith('{') && line.includes('"cases"'));
if (!line) throw new Error('CLI did not return a structured measurement; preserve previous evidence.');
const interactive = JSON.parse(line);
const origin = 'http://127.0.0.1:17877';
const health = await (await fetch(origin + '/health')).json();
const status = await (await fetch(origin + '/api/node-lab/status')).json();
const errors = await (await fetch(origin + '/api/errors')).json();
const report = { measuredAt: new Date().toISOString(), profile: health.profile, fixtureStatus: status.data, productionCoreConnected: false,
  interactive, expectedUnsupported: ['cloud generation', 'billing/entitlements', 'generation history', 'download task gateway', 'native IPC', 'collaboration/share'],
  caveats: ['CLI failures followed by successful retries remain in cases; do not count every initial probe as passed.', 'Context blocked count does not include fetch/CSP blocks that happened earlier.', 'No claims about arbitrary custom-protocol navigation protection or production browser safety.'],
  protocolErrors: errors.errors.map(event => ({ sequence: event.sequence, kind: event.kind, path: event.detail?.path, message: event.detail?.message })).slice(-200) };
fs.writeFileSync(path.join(root, 'evidence', 'node-lab-interactive.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ archive: 'evidence/node-lab-interactive.json', interactiveCases: interactive.cases.length, pageErrors: interactive.pageErrors.length, fixtureCanvasCount: status.data.canvas_count, productionCoreConnected: false }));
