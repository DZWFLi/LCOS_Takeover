import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformCutScript } from '../lab/cut-transform.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const webRoot = path.join(root, 'reference', 'tapnow-installed', 'resources', 'web');
const evidencePath = path.join(root, 'evidence', 'dependency-cuts.json');
const entryPath = 'assets/index-BAQXnPag.js';
const canvasPath = 'assets/page-Da_DfwiK.js';
const agentPath = 'assets/agent-host-provider-uVo_bky5.js';

async function walk(directory) {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(absolute));
    else if (entry.isFile()) files.push(absolute);
  }
  return files;
}

const toWebPath = absolute => path.relative(webRoot, absolute).split(path.sep).join('/');
const allFiles = await walk(webRoot);
const filesByAbsolutePath = new Set(allFiles.map(file => path.resolve(file)));
const jsFiles = allFiles.filter(file => path.extname(file) === '.js').sort();
const contentByPath = new Map();
const relativeImportPattern = /(?:\bfrom\s*|\bimport\s*\()\s*["']([^"']+)["']/g;
const edges = [];
const missing = [];

for (const absolute of jsFiles) {
  const source = await fs.readFile(absolute, 'utf8');
  const from = toWebPath(absolute);
  contentByPath.set(from, source);
  for (const match of source.matchAll(relativeImportPattern)) {
    const specifier = match[1];
    if (!specifier.startsWith('./') && !specifier.startsWith('../')) continue;
    const targetAbsolute = path.resolve(path.dirname(absolute), specifier);
    const target = toWebPath(targetAbsolute);
    const exists = filesByAbsolutePath.has(targetAbsolute);
    const kind = /^\s*import\s*\(/.test(match[0]) ? 'dynamic-literal' : 'static';
    edges.push({ from, to: target, kind, exists });
    if (!exists) missing.push({ from, specifier, resolvedTarget: target });
  }
}

function directEdges(filename) {
  return edges.filter(edge => edge.from === filename);
}

function reachableFrom(entry) {
  const visited = new Set();
  const reachedEdges = new Set();
  const queue = [entry];
  while (queue.length > 0) {
    const current = queue.shift();
    if (visited.has(current)) continue;
    visited.add(current);
    for (const edge of directEdges(current)) {
      reachedEdges.add(edge);
      if (edge.exists && path.extname(edge.to) === '.js' && !visited.has(edge.to)) queue.push(edge.to);
    }
  }
  return { files: [...visited].sort(), edgeCount: reachedEdges.size };
}

function count(source, needle) {
  return source ? source.split(needle).length - 1 : 0;
}

function seam(filename, start, end, applied = false) {
  const source = contentByPath.get(filename);
  return { file: filename, startMarker: start, startCount: count(source, start), endBoundary: end, applied };
}

function importedBindings(filename, targetBasename) {
  const source = contentByPath.get(filename) || '';
  const marker = 'from"./' + targetBasename + '"';
  const declarations = [];
  let offset = 0;
  let at = source.indexOf(marker, offset);
  while (at >= 0) {
    const start = source.lastIndexOf('import{', at);
    if (start >= 0) {
      const names = source.slice(start + 7, at).split(',').map(item => item.trim()).filter(Boolean);
      declarations.push({
        importedBindingCount: names.length,
        imports: names.map(item => item.replace(/\s+as\s+.*/, '').trim())
      });
    }
    offset = at + marker.length;
    at = source.indexOf(marker, offset);
  }
  return declarations;
}

const entryEdges = directEdges(entryPath);
const canvasEdges = directEdges(canvasPath);
const reachable = reachableFrom(entryPath);
const entryStat = await fs.stat(path.join(webRoot, entryPath));
const canvasStat = await fs.stat(path.join(webRoot, canvasPath));

const outgoing = new Map(jsFiles.map(file => [toWebPath(file), []]));
for (const edge of edges) {
  if (edge.exists && path.extname(edge.to) === '.js' && outgoing.has(edge.from)) outgoing.get(edge.from).push(edge.to);
}
let nextIndex = 0;
const indexByNode = new Map();
const lowLinkByNode = new Map();
const stack = [];
const onStack = new Set();
const components = [];
function visit(node) {
  indexByNode.set(node, nextIndex);
  lowLinkByNode.set(node, nextIndex++);
  stack.push(node);
  onStack.add(node);
  for (const target of outgoing.get(node) || []) {
    if (!indexByNode.has(target)) {
      visit(target);
      lowLinkByNode.set(node, Math.min(lowLinkByNode.get(node), lowLinkByNode.get(target)));
    } else if (onStack.has(target)) {
      lowLinkByNode.set(node, Math.min(lowLinkByNode.get(node), indexByNode.get(target)));
    }
  }
  if (lowLinkByNode.get(node) !== indexByNode.get(node)) return;
  const component = [];
  let current;
  do {
    current = stack.pop();
    onStack.delete(current);
    component.push(current);
  } while (current !== node);
  components.push(component.sort());
}
for (const node of outgoing.keys()) if (!indexByNode.has(node)) visit(node);

const agentImporters = edges.filter(edge => edge.to === agentPath).map(edge => ({
  from: edge.from,
  kind: edge.kind,
  bindings: importedBindings(edge.from, path.basename(agentPath))
}));
const cyclicComponents = components
  .filter(component => component.length > 1 || (outgoing.get(component[0]) || []).includes(component[0]))
  .sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]));

const transformedMain = transformCutScript(entryPath, contentByPath.get(entryPath));
const transformedCanvas = transformCutScript(canvasPath, contentByPath.get(canvasPath));
const cutTransformChecks = {
  mainBundleChanged: transformedMain !== contentByPath.get(entryPath),
  canvasBundleChanged: transformedCanvas !== contentByPath.get(canvasPath),
  sentryInitializationNoop: transformedMain.includes('function rht(){}'),
  mixpanelInitializationNoop: transformedMain.includes('function e2r(){}'),
  remoteReachabilityProbeNoop: transformedMain.includes('function Kut(){}'),
  attributionTrackingDisabled: transformedMain.includes('tracking_disabled'),
  agentPanelMountUsesEditableModule: transformedCanvas.includes('LF=()=>window.__LCOS_CUSTOM_PANEL__?.render(r)||null'),
  previsPromoLauncherNoop: transformedCanvas.includes('function PB(){}'),
  unknownBundlePassthrough: transformCutScript('unrelated.js', 'unchanged') === 'unchanged'
};
const cutTransformValidation = {
  passed: Object.values(cutTransformChecks).every(Boolean),
  transformedVendorExecuted: false,
  checks: cutTransformChecks
};
if (!cutTransformValidation.passed) {
  throw new Error('A required in-memory cut transform check failed: ' + JSON.stringify(cutTransformChecks));
}

let runtimeAblation = { source: 'evidence/ablation-verification.json', available: false };
try {
  const parsed = JSON.parse(await fs.readFile(path.join(root, 'evidence', 'ablation-verification.json'), 'utf8'));
  runtimeAblation = {
    source: 'evidence/ablation-verification.json',
    available: true,
    exportedAt: parsed.exportedAt,
    coreConnected: parsed.coreConnected,
    profiles: (parsed.reports || []).map(report => {
      const responses = report.responses || [];
      const diagnostics = report.diagnostics || [];
      return {
        profile: report.profile,
        url: report.url,
        nodes: report.nodes,
        nodesAfterExtendedWait: report.nodesAfterExtendedWait,
        successfulJsModules: report.successfulJsModules,
        successfulJsBytes: report.successfulJsBytes,
        remoteAttempts: diagnostics.filter(event => event.kind === 'remote-fetch-attempt').length,
        remoteBlocked: diagnostics.filter(event => event.kind === 'remote-fetch-blocked').length,
        nonSuccessApiResponses: responses
          .filter(response => response.path && response.path.startsWith('/api/') && response.status >= 400)
          .map(response => ({ path: response.path, status: response.status })),
        errors: report.errors || []
      };
    })
  };
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

const report = {
  workspace: 'LCOS-DSH-03',
  auditedAt: new Date().toISOString(),
  scope: {
    installedBundleRoot: 'reference/tapnow-installed/resources/web',
    sourceFilesModified: false,
    vendorCodeExecuted: false,
    serverOrBrowserStartedByAudit: false
  },
  graphMethod: {
    description: 'Lexical scan of literal relative from-specifiers and import() specifiers in .js files.',
    completeAst: false,
    includesComputedImports: false,
    includesRuntimeConditionalReachability: false
  },
  graph: {
    javascriptFiles: jsFiles.length,
    relativeImportEdges: edges.length,
    missingRelativeImports: missing,
    entry: entryPath,
    entryBytes: entryStat.size,
    entryDirectImportEdges: entryEdges.length,
    entryDirectDynamicImports: entryEdges.filter(edge => edge.kind === 'dynamic-literal').length,
    entryDirectStaticImports: entryEdges.filter(edge => edge.kind === 'static').length,
    entryDirectTargets: entryEdges.map(({ to, kind, exists }) => ({ to, kind, exists })),
    entryReachableJavaScriptFiles: reachable.files.length,
    entryReachableRelativeImportEdges: reachable.edgeCount,
    stronglyConnectedComponents: components.length,
    cyclicStronglyConnectedComponents: cyclicComponents.length,
    largestCyclicComponents: cyclicComponents.slice(0, 10)
  },
  canvasRoute: {
    file: canvasPath,
    bytes: canvasStat.size,
    directImportEdges: canvasEdges.length,
    directImports: canvasEdges.map(({ to, kind, exists }) => ({ to, kind, exists })),
    agentHostIsDirectStaticDependency: canvasEdges.some(edge => edge.kind === 'static' && edge.to === agentPath),
    agentHostImporters: agentImporters,
    canvasNamedAgentHostBindings: importedBindings(canvasPath, path.basename(agentPath)),
    reactFlowLibraryIsDirectStaticDependency: canvasEdges.some(edge =>
      edge.kind === 'static' && edge.to === 'assets/UnlimitedModeToggle-D4wysAbz.js'),
    cuttableAgentPanelMount: 'LF reads chat isOpen and route agentQuery/openAgentPanel, then mounts YT inside eP',
    promoOnlyPrevisIntroOpener: 'PB calls pj with Agentic Previs copy and remote comparison video URLs'
  },
  cutSeams: [
    seam(entryPath, 'function rht(){', 'function h0s(t={})', true),
    seam(entryPath, 'function e2r(){', 'function t2r()', true),
    seam(entryPath, 'function Kut(t){', 'const fcs=', true),
    seam(entryPath, 'OIa=Axs.initSession', 'const wxs=', true),
    seam(entryPath, 'function BDl({children:t,config:e,identity:n}){', 'const zDl=', false),
    seam(canvasPath, 'LF=()=>{const e=Ks(a=>a.isOpen)', ',Xa=({node:', true),
    seam(canvasPath, 'function PB(e){', 'function DB({canvasId:e})', true)
  ],
  cutTransformValidation,
  behavioralFindings: [
    'The HTML entry loads assets/index-BAQXnPag.js; its renderer startup ends at hFl().',
    'page-Da_DfwiK.js statically imports agent-host-provider-uVo_bky5.js. A 404 prevents Canvas ESM evaluation.',
    'LF is the Canvas-local Agent chat panel mount. Replacing its body with the editable local panel keeps static imports and the route intact.',
    'UnlimitedModeToggle-D4wysAbz.js contains ReactFlow implementation markers and remains imported by Canvas.',
    'Canvas library loading is a separate route/API path; this transform does not synthesize successful data responses.',
    'The Agentic Previs intro is an automatic promo dialog with remote comparison videos. PB is its launcher; 3D Studio creation is separate.',
    'Gift Tapies usage education is part of Agent chat. The Canvas credits pill is a balance/subscription affordance and remains visible.',
    'The default in-memory transform deliberately leaves the Statsig provider untouched; its hooks/provider shape needs an isolated runtime test before cutting.'
  ],
  runtimeAblation
};

await fs.mkdir(path.dirname(evidencePath), { recursive: true });
await fs.writeFile(evidencePath, JSON.stringify(report, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({
  output: path.relative(root, evidencePath),
  javascriptFiles: report.graph.javascriptFiles,
  relativeImportEdges: report.graph.relativeImportEdges,
  missingRelativeImports: report.graph.missingRelativeImports.length,
  entryDirectImportEdges: report.graph.entryDirectImportEdges,
  entryDirectDynamicImports: report.graph.entryDirectDynamicImports,
  entryReachableJavaScriptFiles: report.graph.entryReachableJavaScriptFiles,
  canvasDirectImportEdges: report.canvasRoute.directImportEdges,
  cyclicStronglyConnectedComponents: report.graph.cyclicStronglyConnectedComponents,
  agentHostImporters: agentImporters.length,
  runtimeProfiles: runtimeAblation.profiles ? runtimeAblation.profiles.length : 0
}, null, 2));
