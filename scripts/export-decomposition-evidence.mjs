import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
async function events(port) {
  const response = await fetch('http://127.0.0.1:' + port + '/api/events', { redirect: 'error', signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error('Expected this workspace\'s local experiment: ' + port);
  return response.json();
}
const islandEnvelope = await events(17875);
const cutEnvelope = await events(17876);
const islandMeasurements = islandEnvelope.events.filter(event => event.kind === 'island-measured');
const cutMeasurement = cutEnvelope.events.filter(event => event.kind === 'cut-measured').at(-1)?.detail;
if (!islandMeasurements.length || !cutMeasurement) throw new Error('Actual tool and component measurements are required.');
const evidence = {
  workspace: 'LCOS-DSH-03', exportedAt: new Date().toISOString(), coreConnected: false,
  islands: islandMeasurements, islandSavedState: JSON.parse(await fs.readFile(path.join(root, '.runtime', 'offline-islands', 'widget-state.json'), 'utf8')),
  customizedCanvas: cutMeasurement,
  limitations: ['Raw vendor files are unchanged; customization uses in-memory transforms and an editable local module.',
    'Original TSX names/types/source-file boundaries are not recovered.',
    'Only selected local interactions are tested; not all 24 tools.',
    'Apply/message/backend generation is explicitly refused. No real project or native action executed.',
    'Statsig and shared agent-host code remain. Removing a component mount is not equivalent to deleting its bundle.',
    'Direct custom-protocol location navigation remains unimplemented; context protections apply to the isolated measured browser.']
};
await fs.writeFile(path.join(root, 'evidence', 'decomposition-verification.json'), JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify({ tools: islandMeasurements.map(event => event.detail.tool), nodes: cutMeasurement.nodes,
  customComponent: cutMeasurement.customComponent, drag: cutMeasurement.drag.moved,
  libraryAssetsVisible: cutMeasurement.libraryAssetsVisible, agentRequests: cutMeasurement.agentApiRequests.length,
  attributionRequests: cutMeasurement.attributionRequests.length, sentryAttempts: cutMeasurement.sentryAttempts.length }, null, 2));
