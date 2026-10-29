import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Server } from 'node:net';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeRoot = path.join(root, '.runtime', 'init-failure-test-' + Date.now() + '-' + process.pid);
const reportPath = path.join(root, 'evidence', 'live-adoption-init-failure.json');
const missingInput = path.join(runtimeRoot, 'synthetic-input.png');
const paths = {
  captureStaging: path.join(runtimeRoot, 'capture'),
  ocrRuntime: path.join(runtimeRoot, 'ocr'),
  huabuData: path.join(runtimeRoot, 'huabu-private'),
  huabuWorkspace: path.join(runtimeRoot, 'huabu-workspace'),
  profile: path.join(runtimeRoot, 'profile'),
};
const report = {
  test: 'live-adoption-init-failure',
  implementation: 'copied actual Local Core plus Huabu storage/canvas executor',
  passed: false,
  runtimeRoot,
  missingInput,
};

function listeningNodeServers() {
  return process._getActiveHandles()
    .filter((handle) => handle instanceof Server && handle.listening);
}

function describeServer(handle) {
  let address;
  try { address = handle.address(); } catch {}
  return {
    type: handle.constructor?.name ?? 'unknown',
    address: address && typeof address === 'object'
      ? { address: address.address, port: address.port }
      : address,
  };
}

const allUnderRuntime = (candidate) => {
  const relative = path.relative(runtimeRoot, candidate);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
};

assert.equal(existsSync(runtimeRoot), false, 'Refusing to reuse runtime directory: ' + runtimeRoot);

const clearedPrefixes = ['LCOS_', 'HUABU_', 'LOCAL_CORE_', 'VITE_'];
const clearedKeys = Object.keys(process.env).filter((key) =>
  clearedPrefixes.some((prefix) => key.startsWith(prefix)) || ['SERVER_PORT', 'WEB_PORT'].includes(key));
for (const key of clearedKeys) delete process.env[key];

Object.assign(process.env, {
  LCOS_CAPTURE_STAGING_ROOT: paths.captureStaging,
  LCOS_OCR_RUNTIME_DIR: paths.ocrRuntime,
  LCOS_RECOVERY_TRANSPORT: 'none',
  HUABU_DATA_DIR: paths.huabuData,
  HUABU_WORKSPACE: paths.huabuWorkspace,
  USERPROFILE: paths.profile,
  APPDATA: path.join(paths.profile, 'roaming'),
  LOCALAPPDATA: path.join(paths.profile, 'local'),
  TEMP: path.join(paths.profile, 'temp'),
  TMP: path.join(paths.profile, 'temp'),
});

report.inheritedApplicationSettingsCleared = clearedKeys;
report.isolatedEnvironment = {
  captureStaging: process.env.LCOS_CAPTURE_STAGING_ROOT,
  ocrRuntime: process.env.LCOS_OCR_RUNTIME_DIR,
  huabuData: process.env.HUABU_DATA_DIR,
  huabuWorkspace: process.env.HUABU_WORKSPACE,
  homeProfile: process.env.USERPROFILE,
  recoveryTransport: process.env.LCOS_RECOVERY_TRANSPORT,
  allPathsInsideRuntime: Object.values(paths).every(allUnderRuntime),
};

try {
  await mkdir(runtimeRoot, { recursive: false });
  await Promise.all([
    paths.captureStaging,
    paths.ocrRuntime,
    paths.huabuData,
    paths.huabuWorkspace,
    path.join(paths.profile, 'roaming'),
    path.join(paths.profile, 'local'),
    path.join(paths.profile, 'temp'),
  ].map((directory) => mkdir(directory, { recursive: true })));
  assert.equal(existsSync(missingInput), false, 'The failure fixture must be absent in this fresh runtime.');

  const { buildPilotEntry } = await import('../lab/pilot/build-pilot.mjs');
  const bundle = await buildPilotEntry('lab/pilot/server-service.ts', path.join(runtimeRoot, 'server-service.mjs'));
  const { startLiveAdoption } = await import(pathToFileURL(bundle).href);
  const before = new Set(listeningNodeServers());
  let startupError;
  let unexpectedlyStarted;
  try {
    unexpectedlyStarted = await startLiveAdoption({ runtimeRoot, port: 0 });
  } catch (error) {
    startupError = error;
  }
  if (unexpectedlyStarted) await unexpectedlyStarted.close();

  assert.ok(startupError, 'Startup unexpectedly resolved despite the absent synthetic input.');
  report.failure = {
    name: startupError.name,
    code: startupError.code,
    path: startupError.path,
    message: startupError.message,
  };
  assert.equal(startupError.code, 'ENOENT');
  assert.equal(path.resolve(startupError.path), missingInput);

  await new Promise((resolve) => setTimeout(resolve, 40));
  const after = listeningNodeServers();
  const leaked = after.filter((handle) => !before.has(handle));
  report.listeningNodeServersBefore = [...before].map(describeServer);
  report.listeningNodeServersAfter = after.map(describeServer);
  report.newListeningNodeServersAfterFailure = leaked.map(describeServer);
  assert.equal(leaked.length, 0, 'Initialization failure left a new listening Node Server handle.');

  report.coreDatabaseCreated = existsSync(path.join(runtimeRoot, 'core.sqlite'));
  report.huabuDataEntries = await readdir(paths.huabuData).catch(() => []);
  report.failureOccurredAfterRealCoreAndHuabuStartup = report.coreDatabaseCreated && report.huabuDataEntries.length > 0;
  assert.equal(report.coreDatabaseCreated, true, 'Expected the real Core to have initialized its isolated database before the fixture read.');
  assert.equal(report.failureOccurredAfterRealCoreAndHuabuStartup, true, 'Expected Huabu to have initialized isolated data before the fixture read.');
  report.passed = true;
} catch (error) {
  report.error = { name: error.name, message: error.message, stack: error.stack };
  process.exitCode = 1;
} finally {
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
}

console.log(JSON.stringify(report, null, 2));
