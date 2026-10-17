import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';
import { createNativeUiSourceTransforms } from '../lab/native-ui-source-transforms.mjs';
import { nativeComposerSourceOverride } from '../lab/native-composer-source-transform.mjs';
import { withNativeChatSourceTransforms } from '../lab/native-chat-owner-transform.mjs';
import { withNativeMaterialReaderSourceTransforms } from '../lab/native-material-reader-source-transform.mjs';
import { withNativeReaderRecoverySourceTransforms } from '../lab/native-reader-recovery-source-transform.mjs';
import { withNativeComposerFileSourceTransforms } from '../lab/native-composer-file-source-transform.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argument = process.argv.find(value => value.startsWith('--port='));
const port = Number(argument?.slice(7) || '17881');
const buildUiOnly = process.argv.includes('--build-ui-only');
const nativeRailPilot = process.argv.includes('--native-rail-pilot');
const nativeAssemblyPilot = process.argv.includes('--native-assembly-pilot') || nativeRailPilot;
const nativeTextPilot = process.argv.includes('--native-text-pilot') || nativeAssemblyPilot;
const nativeCollectionPilot = process.argv.includes('--native-collection-pilot') || nativeTextPilot;
if (buildUiOnly && process.argv.includes('--reuse-native-ui')) throw new Error('UI-only build cannot reuse an old UI build.');
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Use a bounded loopback port.');
// Diagnose ownership by binding only, never stop another listener.
if (!buildUiOnly) await new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.once('error', reject);
  probe.listen(port, '127.0.0.1', () => probe.close(resolve));
});
const runtimeLabelArg = process.argv.find(value => value.startsWith('--runtime-label='));
const runtimeLabel = runtimeLabelArg?.slice('--runtime-label='.length) || 'live-full-integration';
if (nativeCollectionPilot && (!runtimeLabelArg || !runtimeLabel.startsWith('isolated-') || [17879, 17880, 17881].includes(port))) {
  throw new Error('The native Collection pilot requires an explicit isolated-* runtime and a non-live port.');
}
if (runtimeLabel !== 'live-full-integration' && !/^isolated-[a-z0-9][a-z0-9-]{0,100}$/.test(runtimeLabel)) {
  throw new Error('A custom runtime label must be a bounded isolated-* child name; paths and reserved runtimes are not accepted.');
}
const runtimeRoot = path.join(root, '.runtime', runtimeLabel);
if (runtimeLabel !== 'live-full-integration' && fs.existsSync(runtimeRoot)) {
  const relative = path.relative(fs.realpathSync(path.join(root, '.runtime')), fs.realpathSync(runtimeRoot));
  if (relative === '' || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
    throw new Error('The isolated runtime resolves outside its existing workspace runtime directory.');
  }
}
fs.mkdirSync(runtimeRoot, { recursive: true });
if (!buildUiOnly) await buildPilotEntry('lab/pilot/surface-core-facade.ts', path.join(runtimeRoot, 'surface-core-facade.mjs'), 'node', { coreCollectionTitle: nativeCollectionPilot, coreColorPin: nativeRailPilot, coreWorkspaceMembership: true });
if (process.argv.includes('--reuse-native-ui')) {
  if (!fs.existsSync(path.join(runtimeRoot, 'native-ui', 'agent-ui.js'))) throw new Error('No previously built native UI exists to reuse.');
  console.log('Native UI build explicitly reused for a backend/history diagnostic; no complete-UI claim.');
} else {
  await buildPilotEntry('lab/pilot/native-agent-ui.tsx', path.join(runtimeRoot, 'native-ui', 'agent-ui.js'), 'browser', {
    nativeReact: true,
    env: { LCOS_CORE_URL: '/api/lcos/core', LCOS_CORE_TOKEN: '', PROJECT_ID: 'disposable-surface-core-facade', LCOS_NATIVE_COLLECTION_PILOT: nativeCollectionPilot, LCOS_NATIVE_ASSEMBLY_PILOT: nativeAssemblyPilot, LCOS_NATIVE_RAIL_PILOT: nativeRailPilot },
    sourceOverrides: {
      ...nativeComposerSourceOverride,
      'lcos/huabu/apps/web/src/store/canvasStore.ts': 'lab/pilot/native-canvas-port.ts',
      'lcos/huabu/apps/web/src/lcos/professional/NativeWorkspaceBody.tsx': 'lab/pilot/native-professional-host.tsx',
    },
    sourceTransforms: withNativeComposerFileSourceTransforms(withNativeReaderRecoverySourceTransforms(withNativeMaterialReaderSourceTransforms(withNativeChatSourceTransforms(createNativeUiSourceTransforms({ nativeRailPilot }))))),
  });
}
if (nativeCollectionPilot && !process.argv.includes('--reuse-native-ui')) {
  await buildPilotEntry('lab/pilot/native-pile-ui.tsx', path.join(runtimeRoot, 'native-ui', 'native-pile-ui.js'), 'browser', { nativeReact: true });
}
if (nativeTextPilot && !process.argv.includes('--reuse-native-ui')) {
  await buildPilotEntry('lab/pilot/native-text-first-ui.tsx', path.join(runtimeRoot, 'native-ui', 'native-text-first-ui.js'), 'browser', {
    nativeReact: true, sourceTransforms: createNativeUiSourceTransforms(),
    sourceOverrides: { 'lcos/huabu/apps/web/src/store/canvasStore.ts': 'lab/pilot/native-canvas-port.ts' },
  });
}
if (buildUiOnly) {
  console.log('Native UI/asset build completed; existing server, Core and spatial runtime were not restarted.');
  process.exit(0);
}
const profile = path.join(runtimeRoot, 'isolated-profile');
const env = {
  PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR,
  USERPROFILE: profile, APPDATA: path.join(profile, 'roaming'), LOCALAPPDATA: path.join(profile, 'local'),
  TEMP: path.join(profile, 'temp'), TMP: path.join(profile, 'temp'),
  HUABU_DATA_DIR: path.join(runtimeRoot, 'huabu-private'),
  LCOS_CAPTURE_STAGING_ROOT: path.join(runtimeRoot, 'capture'), LCOS_OCR_RUNTIME_DIR: path.join(runtimeRoot, 'ocr'),
  LCOS_RECOVERY_TRANSPORT: 'none',
  // Accept's original indexer keeps local FTS even without embeddings. Do not
  // let its default probe invoke the user's unrelated local model service.
  LCOS_OLLAMA_URL: 'http://127.0.0.1:1',
};
for (const directory of [profile, env.APPDATA, env.LOCALAPPDATA, env.TEMP]) fs.mkdirSync(directory, { recursive: true });
const child = spawn(process.execPath, [path.join(root, 'lab/server.mjs'), '--takeover', '--cut', '--full-integration', '--port', String(port), '--runtime-label=' + runtimeLabel, ...(nativeCollectionPilot ? ['--native-collection-pilot'] : []), ...(nativeTextPilot ? ['--native-text-pilot'] : []), ...(nativeAssemblyPilot ? ['--native-assembly-pilot'] : []), ...(nativeRailPilot ? ['--native-rail-pilot'] : [])], {
  cwd: root, env, stdio: 'inherit', windowsHide: true,
});
console.log('Isolated full-integration child PID: ' + child.pid);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code || 0; });
