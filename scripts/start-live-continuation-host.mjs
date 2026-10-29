import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { hostname } from 'node:os';
import { randomBytes } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildPilotEntry, installedRoot } from '../lab/pilot/build-pilot.mjs';
import { prepareNativeSpacePython } from './prepare-native-space-python.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const value = name => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const label = value('runtime-label');
if (!label || !/^isolated-live-continuation-[a-z0-9][a-z0-9-]{0,90}$/.test(label))
  throw new Error('Provide an explicit isolated-live-continuation-* runtime label in this workspace.');
const port = Number(value('port') ?? 56321);
if (!Number.isSafeInteger(port) || port < 1024 || port > 65535 || [17879, 17880, 17881, 56311].includes(port))
  throw new Error('Use a separate bounded local Host port; existing mainline ports cannot be reused.');
const start = process.argv.includes('--start');
if (start && process.argv.includes('--prepare-only')) throw new Error('Choose prepare-only or start, not both.');
const canvasRuntimeLabel = value('canvas-runtime');
let canvasTools;
if (canvasRuntimeLabel) {
  if (!/^isolated-[a-z0-9][a-z0-9-]{0,100}$/.test(canvasRuntimeLabel)) throw new Error('Use the existing isolated canvas runtime.');
  const canvasRuntime = await fs.realpath(path.join(root, '.runtime', canvasRuntimeLabel));
  if (path.dirname(canvasRuntime) !== await fs.realpath(path.join(root, '.runtime'))) throw new Error('Canvas runtime must stay inside this workspace.');
  const python = value('canvas-python');
  if (!python || !path.isAbsolute(python) || !(await fs.stat(python)).isFile()) throw new Error('Provide the existing absolute Python executable for the fixed canvas MCP.');
  await prepareNativeSpacePython(python);
  const script = await fs.realpath(path.join(root, 'scripts/native-space-kernel-mcp.py'));
  if (path.dirname(script) !== await fs.realpath(path.join(root, 'scripts'))) throw new Error('Use this workspace canvas MCP entry.');
  canvasTools = { projectId: 'disposable-surface-core-facade', runtimeLabel: canvasRuntimeLabel, python: await fs.realpath(python), script,
    canvases: { 'surface-core-main': true, 'surface-core-context': true, 'surface-core-workflow': true } };
}
const runtimeParent = path.join(root, '.runtime');
const runtimeRoot = path.resolve(runtimeParent, label);
if (!runtimeRoot.startsWith(runtimeParent + path.sep)) throw new Error('Host runtime must stay inside this workspace .runtime.');
await fs.mkdir(runtimeRoot, { recursive: true });
const exists = async filename => { try { return (await fs.stat(filename)).isFile(); } catch { return false; } };
const bundle = path.join(runtimeRoot, 'live-continuation-host.mjs');
const tokenFile = path.join(runtimeRoot, 'connection-token.json');
const manifestFile = path.join(runtimeRoot, 'host-preparation.json');
const dataDir = path.join(runtimeRoot, 'huabu-data');
const workspaceDir = path.join(runtimeRoot, 'huabu-workspace');
const cwd = path.join(runtimeRoot, 'host-cwd');
const profileDir = path.join(runtimeRoot, 'isolated-profile');
const appDataDir = path.join(profileDir, 'AppData', 'Roaming');
const localAppDataDir = path.join(profileDir, 'AppData', 'Local');
const tempDir = path.join(localAppDataDir, 'Temp');
const reachbackDir = path.join(cwd, 'node_modules', '.cache', 'agentlet', 'reachback');
const profileEnvironment = { USERPROFILE: profileDir, APPDATA: appDataDir, LOCALAPPDATA: localAppDataDir, TEMP: tempDir, TMP: tempDir,
  HOME: profileDir, XDG_CONFIG_HOME: path.join(profileDir, '.config'), XDG_CACHE_HOME: path.join(profileDir, '.cache'),
  XDG_DATA_HOME: path.join(profileDir, '.local', 'share'), XDG_STATE_HOME: path.join(profileDir, '.local', 'state'),
  AGENTLET_REACHBACK_DIR: reachbackDir };
if (process.platform === 'win32') {
  const drive = path.parse(profileDir).root.replace(/[\\/]$/, '');
  Object.assign(profileEnvironment, { HOMEDRIVE: drive, HOMEPATH: profileDir.slice(drive.length) });
}
for (const dir of [dataDir, workspaceDir, cwd, profileDir, appDataDir, localAppDataDir, tempDir, reachbackDir,
  profileEnvironment.XDG_CONFIG_HOME, profileEnvironment.XDG_CACHE_HOME, profileEnvironment.XDG_DATA_HOME, profileEnvironment.XDG_STATE_HOME])
  await fs.mkdir(dir, { recursive: true });

// Original server.ts retains its original load-env owner. Only the copied
// source-tree lookup paths are relevant after buildPilotEntry preserves each
// module's import.meta.url. Do not silently import an old .env into this runtime.
const sourceEnvFiles = ['lcos/huabu/apps/server/.env', 'lcos/huabu/.env'].map(file => path.join(root, file));
if ((await Promise.all(sourceEnvFiles.map(exists))).some(Boolean))
  throw new Error('A copied Host source .env exists. This fresh launcher will not read or inherit it; review the explicit environment first.');

const daemonCandidates = [
  path.join(installedRoot, 'huabu/external/agentlet/packages/local/dist/index.js'),
  'E:/OS开发/Huabu/external/agentlet/packages/local/dist/index.js',
];
let daemonEntry;
for (const candidate of daemonCandidates) if (await exists(candidate)) { daemonEntry = path.resolve(candidate); break; }
if (!daemonEntry) throw new Error('The original installed Agentlet daemon entry is unavailable; no fake daemon will be substituted.');

await buildPilotEntry('lcos/huabu/apps/server/src/server.ts', bundle, 'node', { coreMixedScopeContext: true, coreLiveContinuation: true });
execFileSync(process.execPath, ['--check', bundle], { cwd: runtimeRoot, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
const builtSource = await fs.readFile(bundle, 'utf8');
const actualBranches = {
  originalHostRoutes: builtSource.includes('/continuation/agentlets/:agentletId/sessions') && builtSource.includes('ensureContinuationOwner'),
  originalGateway: builtSource.includes('mountAgenetes') && builtSource.includes('getSupervisedAgentletId'),
  scopeHostParser: builtSource.includes('item.kind === "scope"') && builtSource.includes('item.members') && builtSource.includes('item.presentationId'),
  scopePromptProvenance: builtSource.includes('resolution.kind === "scope" ? { kind: "scope", scopeId: resolution.scopeId'),
  scopeResolvedTextCheck: builtSource.includes('resolution.text !== resolved2.text'),
  originalLiveOwnerProjection: builtSource.includes('getByTransportSession(connection.agentletId, connection.sessionId, connection)'),
  originalSessionCanvasTools: builtSource.includes('installNativeSessionCanvasTools') && builtSource.includes('readNativePermissions'),
};
if (Object.values(actualBranches).some(present => !present))
  throw new Error('The actual bundled Host is missing an original owner or Mixed Scope parser/prompt branch; it was not started.');

if (!(await exists(tokenFile))) await fs.writeFile(tokenFile, JSON.stringify({ connectionToken: randomBytes(32).toString('hex') }), { flag: 'wx', mode: 0o600 });
const { connectionToken } = JSON.parse(await fs.readFile(tokenFile, 'utf8'));
if (typeof connectionToken !== 'string' || !/^[0-9a-f]{64}$/.test(connectionToken)) throw new Error('Fresh runtime connection-token file is invalid.');

// Optional explicit agent environment must be newly supplied inside this
// runtime. It is never loaded from a home directory, old profile or database.
const agentEnvArgument = value('agent-env-file');
let agentEnv = {}, agentEnvFile;
if (agentEnvArgument) {
  agentEnvFile = path.resolve(root, agentEnvArgument);
  if (!agentEnvFile.startsWith(runtimeRoot + path.sep)) throw new Error('Explicit agent environment must be inside this fresh Host runtime.');
  const actual = await fs.realpath(agentEnvFile), actualRoot = await fs.realpath(runtimeRoot);
  if (!actual.startsWith(actualRoot + path.sep)) throw new Error('Explicit agent environment resolves outside this Host runtime.');
  agentEnv = JSON.parse(await fs.readFile(actual, 'utf8'));
  if (!agentEnv || Array.isArray(agentEnv) || Object.entries(agentEnv).some(([key, item]) => !/^[A-Z][A-Z0-9_]*$/.test(key) || typeof item !== 'string'
    || /^(?:HUABU_|SERVER_PORT$|PORT$|WEB_DIST_PATH$|NODE_OPTIONS$|NODE_PATH$|LCOS_)/.test(key)))
    throw new Error('Agent environment must contain explicit string provider/CLI settings, not Host/Node/runtime overrides.');
}
let coreOrigin, coreToken;
if (value('core-origin')) {
  const address = new URL(value('core-origin'));
  if (address.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(address.hostname)
    || address.pathname !== '/' || address.search || address.hash || address.username || address.password)
    throw new Error('Explicit Core origin must be one HTTP loopback origin.');
  coreOrigin = address.origin;
}
if (value('core-token-file')) {
  if (!coreOrigin) throw new Error('A Core token requires the exact explicit Core origin.');
  const filename = path.resolve(root, value('core-token-file'));
  const actual = await fs.realpath(filename), actualParent = await fs.realpath(runtimeParent);
  if (!actual.startsWith(actualParent + path.sep)) throw new Error('Explicit Core token must come from this workspace runtime, not an old user profile.');
  const stored = await fs.readFile(actual, 'utf8');
  try { const parsed = JSON.parse(stored); coreToken = parsed.apiToken ?? parsed.token ?? parsed.connectionToken; }
  catch { coreToken = stored.trim(); }
  if (typeof coreToken !== 'string' || !coreToken.trim()) throw new Error('Explicit Core token file has no usable token.');
}
const manifest = { prepared: true, started: false, runtimeRoot, hostBundle: bundle, entry: 'lcos/huabu/apps/server/src/server.ts',
  origin: `http://127.0.0.1:${port}`, port, dataDir, workspaceDir, cwd, connectionTokenFile: tokenFile,
  isolatedProfile: { profileDir, appDataDir, localAppDataDir, tempDir }, profileEnvironment,
  agentletState: { supervisorDataDir: dataDir, reachbackDir,
    homeStateDirectoryUsed: false, source: 'Original daemon has no stateDir/home .agentlet persistence; reachback is cwd-relative and supervisor legacy tickets are dataDir-owned.' },
  agentletId: hostname(), daemonEntry, daemonReadOnly: true, mixedScopeSourceTransforms: true, actualBranches,
  logging: { level: 'warn', stdout: path.join(runtimeRoot, 'host.stdout.log'), stderr: path.join(runtimeRoot, 'host.stderr.log'),
    reason: 'Original Fastify info request logs may include the Agentlet URL query token; use the original logger level to suppress them.' },
  existingProfileRead: false, originalProjectWritten: false, modelRequests: 0,
  ...(canvasTools ? { canvasTools } : {}),
  ...(agentEnvFile ? { explicitAgentEnvironmentFile: agentEnvFile, explicitAgentEnvironmentKeys: Object.keys(agentEnv) } : {}),
  ...(coreOrigin ? { explicitCoreOrigin: coreOrigin, explicitCoreTokenProvided: coreToken !== undefined } : {}),
  sourcesReceipt: bundle + '.sources.json' };
await fs.writeFile(manifestFile, JSON.stringify(manifest, null, 2));
if (!start) {
  console.log(JSON.stringify({ prepared: true, started: false, origin: manifest.origin, manifest: manifestFile,
    connectionTokenFile: tokenFile, agentletId: manifest.agentletId, daemonEntry, actualBranches }, null, 2));
} else {
  await new Promise((resolve, reject) => {
    const probe = net.createServer(); probe.once('error', reject); probe.listen(port, '127.0.0.1', () => probe.close(resolve));
  });
  const childEnv = { ...process.env };
  // Only a fresh explicitly supplied provider/CLI environment is used; no
  // inherited host credentials, secret bridge or old provider config is copied.
  for (const key of Object.keys(childEnv)) if (/^(?:HUABU_|AGENTLET_|LCOS_|OPENAI_|ANTHROPIC_|QWEN_|OPENCODE_|DEEPSEEK_|GOOGLE_|GEMINI_|AZURE_OPENAI_|CODEX_API_KEY$|LOCAL_CORE_|SERVER_PORT$|PORT$|WEB_DIST_PATH$|NODE_OPTIONS$|NODE_PATH$)/.test(key)) delete childEnv[key];
  Object.assign(childEnv, agentEnv, profileEnvironment, { SERVER_PORT: String(port), HUABU_BIND_HOST: '127.0.0.1', HUABU_DATA_DIR: dataDir,
    HUABU_WORKSPACE: workspaceDir, HUABU_CONNECTION_TOKEN: connectionToken, HUABU_AGENTLET_DAEMON_PATH: daemonEntry, LOG_LEVEL: 'warn' });
  if (coreOrigin) childEnv.LCOS_CORE_URL = coreOrigin;
  if (coreToken !== undefined) childEnv.LOCAL_CORE_API_TOKEN = coreToken;
  if (canvasTools) childEnv.LCOS_NATIVE_CANVAS_TOOLS = JSON.stringify(canvasTools);
  delete childEnv.WEB_DIST_PATH;
  const stdout = await fs.open(path.join(runtimeRoot, 'host.stdout.log'), 'a');
  const stderr = await fs.open(path.join(runtimeRoot, 'host.stderr.log'), 'a');
  let child;
  try {
    child = spawn(process.execPath, [bundle], { cwd, env: childEnv, detached: true, windowsHide: true, stdio: ['ignore', stdout.fd, stderr.fd] });
    await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
  } finally { await stdout.close(); await stderr.close(); }
  child.unref();
  await fs.writeFile(path.join(runtimeRoot, 'host-process.json'), JSON.stringify({ pid: child.pid, bundle, runtimeRoot, port, startedAt: new Date().toISOString() }, null, 2));
  console.log(JSON.stringify({ started: true, ready: false, pid: child.pid, origin: manifest.origin, runtimeRoot,
    note: 'Process launch only; verify the real daemon and capability endpoints before any prompt.' }, null, 2));
}
