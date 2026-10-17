import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const response = await fetch('http://127.0.0.1:17874/api/events', { redirect: 'error', signal: AbortSignal.timeout(5000) });
if (!response.ok) throw new Error('Local experiment events are unavailable.');
const envelope = await response.json();
const reports = [...new Map(envelope.events.filter(event => event.kind === 'ablation-measured').map(event => [event.detail.profile, event.detail])).values()];
const evidence = { workspace: 'LCOS-DSH-03', measuredWith: 'fresh isolated browser context per profile; original installed renderer with explicit local fixture',
  exportedAt: new Date().toISOString(), coreConnected: false, reports };
await fs.writeFile(path.join(root, 'evidence', 'ablation-verification.json'), JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify(reports.map(report => ({ profile: report.profile, url: report.url, nodes: report.nodes, modules: report.successfulJsModules,
  jsBytes: report.successfulJsBytes, interaction: report.interaction, nodesAfterExtendedWait: report.nodesAfterExtendedWait,
  denied: [...new Set(report.denied.map(item => item.path))], errors: report.errors })), null, 2));
