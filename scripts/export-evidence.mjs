import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const origin = 'http://127.0.0.1:17873';
const health = await (await fetch(origin + '/health')).json();
if (health.mode !== 'offline' || health.cloudBackendConnected !== false) {
  throw new Error('This export is only for the isolated offline lab.');
}
const events = await (await fetch(origin + '/api/events')).json();
const state = await (await fetch(origin + '/api/state')).json();
const verification = events.events.filter(event => event.source === 'verification');
const lastRenderer = verification.filter(event => event.kind === 'renderer-after-local-worker-fix').at(-1);
const result = {
  workspace: 'LCOS-DSH-03',
  localTime: new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', dateStyle: 'short', timeStyle: 'long' }).format(new Date()),
  health,
  verification,
  currentWidgetState: state,
  renderer: lastRenderer?.detail || null,
  eventTimestampTimezone: 'UTC',
  limitation: 'Only the listed local tool states and unauthenticated renderer initialization are verified; no LCOS backend apply is connected.'
};
await fs.mkdir(path.join(root, 'evidence'), { recursive: true });
await fs.writeFile(path.join(root, 'evidence', 'first-offline-verification.json'), JSON.stringify(result, null, 2) + '\n');
await fs.writeFile(path.join(root, 'evidence', 'protocol-events.json'), JSON.stringify(events, null, 2) + '\n');
console.log(JSON.stringify({workspace: result.workspace, localTime: result.localTime, verifications: verification.map(event => event.kind), savedExposure: state.widgets['color-adjust']?.state?.exposure, rendererText: result.renderer?.dom?.rootText, remoteAllowed: result.renderer?.network?.remoteAllowed}, null, 2));
