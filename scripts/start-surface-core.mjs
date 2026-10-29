import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { buildPilotEntry } from '../lab/pilot/build-pilot.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeRoot = path.join(root, '.runtime/live-surface-core-v2');
fs.mkdirSync(runtimeRoot, { recursive: true });
await buildPilotEntry('lab/pilot/surface-core-facade.ts', path.join(runtimeRoot, 'surface-core-facade.mjs'));
const profile = path.join(runtimeRoot, 'isolated-profile');
const env = {
  PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR,
  USERPROFILE: profile, APPDATA: path.join(profile, 'roaming'), LOCALAPPDATA: path.join(profile, 'local'),
  TEMP: path.join(profile, 'temp'), TMP: path.join(profile, 'temp'),
  HUABU_DATA_DIR: path.join(runtimeRoot, 'huabu-private'),
  LCOS_CAPTURE_STAGING_ROOT: path.join(runtimeRoot, 'capture'), LCOS_OCR_RUNTIME_DIR: path.join(runtimeRoot, 'ocr'),
  LCOS_RECOVERY_TRANSPORT: 'none'
};
for (const directory of [profile, env.APPDATA, env.LOCALAPPDATA, env.TEMP]) fs.mkdirSync(directory, { recursive: true });
const child = spawn(process.execPath, [path.join(root, 'lab/server.mjs'), '--takeover', '--cut', '--surface-core', '--port', '17880'], { cwd: root, env, stdio: 'inherit', windowsHide: true });
console.log('Isolated surface runtime child PID: ' + child.pid);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code || 0; });
