import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { StringDecoder } from 'node:string_decoder';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hostLabel = 'isolated-live-continuation-host-20261023';
const coreLabel = 'isolated-node-carry-20261020';
const corePort = 56311;
const environmentKeys = ['HUABU_HOST_URL', 'HUABU_HOST_TOKEN', 'HUABU_AGENTLET_ID',
  'HUABU_AGENTLET_SPAWN_COMMAND', 'HUABU_AGENTLET_SPAWN_CWD', 'HUABU_HOST_TIMEOUT_MS', 'LCOS_NATIVE_CANVAS_TOOLS_ENABLED', 'LCOS_NATIVE_CONVERSATION_PROVIDER'];

function contained(parent, child) {
  const relative = path.relative(parent, child);
  return relative !== '' && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}

async function readObject(filename, description) {
  try {
    const value = JSON.parse(await fs.readFile(filename, 'utf8'));
    if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch {
    // A JSON parser error can quote input. Never expose a token-file fragment.
    throw new Error(description + ' is unavailable or invalid.');
  }
}

function quotedCommandPath(filename) {
  if (/["\r\n\0]/.test(filename)) throw new Error('The explicit ACP executable path cannot be quoted safely.');
  return '"' + filename + '"';
}

function recordRedacted(stream, filename, secret) {
  const output = createWriteStream(filename, { flags: 'a', mode: 0o600 });
  const decoder = new StringDecoder('utf8');
  let pending = '';
  const replace = value => value.split(secret).join('[REDACTED]');
  stream.on('data', chunk => {
    pending += decoder.write(chunk);
    // Retain a possible partial secret, including when the token spans chunks.
    let cut = Math.max(0, pending.length - secret.length + 1);
    const secretStart = pending.lastIndexOf(secret, cut);
    if (secretStart >= 0 && secretStart < cut && secretStart + secret.length > cut) cut = secretStart;
    output.write(replace(pending.slice(0, cut)));
    pending = pending.slice(cut);
  });
  stream.on('end', () => output.end(replace(pending + decoder.end())));
  // Do not send raw child chunks to the console, including on logging failure.
  output.on('error', () => { process.stderr.write('A linked runtime log could not be written.\n'); });
}

async function main() {
  const arguments_ = process.argv.slice(2);
  if (arguments_.some(value => !['--start', '--prepare-only'].includes(value))
    || (arguments_.includes('--start') && arguments_.includes('--prepare-only')))
    throw new Error('Use --prepare-only (the default) or --start, with no extra arguments.');
  const start = arguments_.includes('--start');
  const actualRoot = await fs.realpath(root);
  const runtimeParent = await fs.realpath(path.join(root, '.runtime'));
  if (runtimeParent !== path.join(actualRoot, '.runtime'))
    throw new Error('The runtime directory must not redirect outside the current workspace.');
  const hostRoot = await fs.realpath(path.join(runtimeParent, hostLabel));
  if (hostRoot !== path.join(runtimeParent, hostLabel)) throw new Error('The prepared Host runtime must not redirect to another runtime.');
  const manifestFile = path.join(hostRoot, 'host-preparation.json');
  const manifest = await readObject(manifestFile, 'The prepared Host manifest');
  if (manifest.prepared !== true || manifest.mixedScopeSourceTransforms !== true
    || !manifest.actualBranches || ['originalHostRoutes', 'originalGateway', 'scopeHostParser',
      'scopePromptProvenance', 'scopeResolvedTextCheck'].some(key => manifest.actualBranches[key] !== true)
    || path.resolve(manifest.runtimeRoot ?? '') !== hostRoot)
    throw new Error('The prepared Host does not identify the original Mixed Scope continuation build.');
  const hostOrigin = new URL(manifest.origin);
  if (hostOrigin.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(hostOrigin.hostname)
    || hostOrigin.pathname !== '/' || hostOrigin.search || hostOrigin.hash || hostOrigin.username || hostOrigin.password
    || Number(hostOrigin.port) !== manifest.port)
    throw new Error('The prepared Host origin must be one explicit HTTP loopback origin.');
  if (typeof manifest.agentletId !== 'string' || !/^[a-z0-9_.-]{1,128}$/i.test(manifest.agentletId))
    throw new Error('The prepared Host agentlet identity is invalid.');
  const expectedTokenFile = path.join(hostRoot, 'connection-token.json');
  if (typeof manifest.connectionTokenFile !== 'string' || path.resolve(manifest.connectionTokenFile) !== expectedTokenFile
    || await fs.realpath(expectedTokenFile) !== expectedTokenFile)
    throw new Error('Only this prepared Host runtime connection-token file can be used.');
  const { connectionToken } = await readObject(expectedTokenFile, 'The prepared Host connection-token file');
  if (typeof connectionToken !== 'string' || !/^[0-9a-f]{64}$/.test(connectionToken))
    throw new Error('The prepared Host connection-token file is invalid.');

  const coreRoot = path.join(runtimeParent, coreLabel);
  await fs.mkdir(coreRoot, { recursive: true });
  const actualCoreRoot = await fs.realpath(coreRoot);
  if (!contained(runtimeParent, actualCoreRoot) || actualCoreRoot !== coreRoot)
    throw new Error('The Core runtime must remain inside this workspace runtime.');
  const agentCwd = path.join(coreRoot, 'agent-verification-project');
  const profile = path.join(coreRoot, 'isolated-profile');
  const profileEnv = { USERPROFILE: profile, HOME: profile, APPDATA: path.join(profile, 'roaming'),
    LOCALAPPDATA: path.join(profile, 'local'), TEMP: path.join(profile, 'temp'), TMP: path.join(profile, 'temp') };
  for (const directory of [agentCwd, ...new Set(Object.values(profileEnv))]) {
    await fs.mkdir(directory, { recursive: true });
    if (!contained(coreRoot, await fs.realpath(directory)))
      throw new Error('The verification directory or profile resolves outside the isolated Core runtime.');
  }
  const acpEntry = await fs.realpath(path.join(root, 'scripts', 'launch-live-qwen-acp.mjs'));
  if (!contained(path.join(root, 'scripts'), acpEntry)) throw new Error('Use the current workspace ACP launcher.');
  const entry = await fs.realpath(path.join(root, 'scripts', 'start-full-integration.mjs'));
  const argv = [entry, '--port=' + corePort, '--runtime-label=' + coreLabel, '--native-rail-pilot', '--live-continuation'];
  const liveHostEnv = {
    LCOS_NATIVE_CANVAS_TOOLS_ENABLED: '1',
    // The existing Core receiver channel used by this explicitly configured
    // ACP launcher. It is not the model's brand and is not shown as a choice.
    LCOS_NATIVE_CONVERSATION_PROVIDER: 'codex',
    HUABU_HOST_URL: hostOrigin.origin,
    HUABU_HOST_TOKEN: connectionToken,
    HUABU_AGENTLET_ID: manifest.agentletId,
    HUABU_AGENTLET_SPAWN_COMMAND: quotedCommandPath(process.execPath) + ' ' + quotedCommandPath(acpEntry),
    HUABU_AGENTLET_SPAWN_CWD: agentCwd,
    HUABU_HOST_TIMEOUT_MS: '360000',
  };
  const reportFile = path.join(coreRoot, 'linked-continuation-preparation.json');
  const report = { prepared: true, started: false, hostReadinessChecked: false,
    hostManifest: manifestFile, hostOrigin: hostOrigin.origin, hostTokenFile: expectedTokenFile,
    agentletId: manifest.agentletId, coreOrigin: 'http://127.0.0.1:' + corePort,
    coreRuntime: coreRoot, agentCwd, acpEntry, nodeExecutable: process.execPath,
    spawnCommand: liveHostEnv.HUABU_AGENTLET_SPAWN_COMMAND, timeoutMs: 360000,
    entry, arguments: argv.slice(1), environmentKeys,
    tokenHandling: 'Read only from this Host runtime; passed in child environment; omitted from arguments, report and logs.',
    existingProfileRead: false, providerCredentialReadByLauncher: false, modelRequestsByLauncher: 0,
    stdout: path.join(coreRoot, 'linked-continuation.stdout.log'),
    stderr: path.join(coreRoot, 'linked-continuation.stderr.log') };
  await fs.writeFile(reportFile, JSON.stringify(report, null, 2));
  if (!start) {
    console.log(JSON.stringify({ prepared: true, started: false, report: reportFile,
      coreOrigin: report.coreOrigin, hostOrigin: report.hostOrigin, agentCwd, timeoutMs: report.timeoutMs }, null, 2));
    return;
  }

  // Reuse the original starter, including its occupied-port refusal. No kill or
  // service replacement is performed here. No provider/profile is inherited.
  const env = { ...profileEnv, ...liveHostEnv };
  for (const key of ['PATH', 'SystemRoot', 'WINDIR', 'ComSpec', 'PATHEXT'])
    if (typeof process.env[key] === 'string') env[key] = process.env[key];
  const child = spawn(process.execPath, argv, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  recordRedacted(child.stdout, report.stdout, connectionToken);
  recordRedacted(child.stderr, report.stderr, connectionToken);
  child.once('spawn', () => {
    report.started = true;
    report.pid = child.pid;
    fs.writeFile(reportFile, JSON.stringify(report, null, 2)).then(() => {
      console.log(JSON.stringify({ started: true, ready: false, pid: child.pid, report: reportFile,
        coreOrigin: report.coreOrigin, stdout: report.stdout, stderr: report.stderr }, null, 2));
    }, () => { process.stderr.write('The linked Core launch report could not be updated.\n'); });
  });
  child.once('error', () => { process.stderr.write('The original linked Core starter could not launch.\n'); process.exitCode = 1; });
  child.once('exit', code => { process.exitCode = code ?? 1; });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
}

main().catch(error => { process.stderr.write(error.message + '\n'); process.exitCode = 1; });
