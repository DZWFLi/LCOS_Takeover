import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const origin = 'http://127.0.0.1:17874';
async function readJson(route) {
  const response = await fetch(origin + route, { redirect: 'error', signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error('Local evidence read failed: ' + route + ' (' + response.status + ')');
  return response.json();
}
const health = await readJson('/health');
if (health.profile !== 'takeover-fixture' || health.cloudBackendConnected !== false) {
  throw new Error('Expected the new isolated takeover fixture, not a production or old Core service.');
}
const envelope = await readJson('/api/events');
const browserReports = envelope.events.filter(event => event.kind === 'takeover-browser-measured');
const interactions = envelope.events.filter(event => event.kind === 'takeover-interaction-measured');
const current = browserReports.at(-1)?.detail;
if (!current) throw new Error('No actual browser measurement has been saved yet.');
const diagnosticCounts = {};
for (const event of current.diagnostics || []) {
  diagnosticCounts[event.kind] = (diagnosticCounts[event.kind] || 0) + 1;
}
const evidence = {
  workspace: 'LCOS-DSH-03', generatedAt: new Date().toISOString(), eventTimezone: 'UTC',
  health, currentBrowserReport: current, diagnosticCounts, interactions,
  limitations: [
    'All displayed data is synthetic; the independent LCOS Core has not been started or connected.',
    'Drag is only local UI state. Write requests fail and reload restores the fixture.',
    'Library metadata displays, but file bytes, thumbnails, generation, payment and Electron bridge are not connected.',
    'Zero context-route blocks does not mean zero attempts: page fetch hooks and CSP can block them first.',
    'window.open and ordinary anchors are protected; direct custom-protocol location navigation remains unimplemented and was not attempted.',
    'Browser context route protection applies only to the measured isolated browser, not to an arbitrary manual browser tab.'
  ]
};
await fs.mkdir(path.join(root, 'evidence'), { recursive: true });
await fs.writeFile(path.join(root, 'evidence', 'takeover-verification.json'), JSON.stringify(evidence, null, 2) + '\n');
await fs.writeFile(path.join(root, 'evidence', 'takeover-protocol-events.json'), JSON.stringify(envelope, null, 2) + '\n');
console.log(JSON.stringify({ workspace: evidence.workspace, url: current.url, nodes: current.canvasNodeCount,
  diagnosticCounts, interactions: interactions.map(event => event.detail.kind), coreConnected: false }, null, 2));
