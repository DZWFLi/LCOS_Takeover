import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const experimentRoot = path.join(root, '.runtime', 'rea-static-20261013');
const args = process.argv.slice(2);
const traceAt = args.indexOf('--trace');
const traceDirectory = traceAt < 0 ? null : path.resolve(root, args[traceAt + 1]);
const directories = args.filter((_, index) => traceAt < 0 || (index !== traceAt && index !== traceAt + 1));
if (!directories.length) throw new Error('Supply completed experiment directories.');
const runs = [];
for (const directory of directories) {
  const selected = path.resolve(root, directory);
  if (!selected.startsWith(experimentRoot + path.sep)) throw new Error('Outside experiment result root.');
  const measurement = JSON.parse(await readFile(path.join(selected, 'measurement.json'), 'utf8'));
  const envelope = JSON.parse(await readFile(path.join(selected, 'stdout.json'), 'utf8'));
  const evidence = envelope.normalized_result ? envelope : envelope.details?.partial_observation;
  const result = evidence?.normalized_result;
  if (!result) throw new Error(`No complete or partial Evidence: ${directory}`);
  const semantic = result.semantic_graph;
  const graph = result.graph;
  const countKinds = values => Object.fromEntries([...values.reduce((map, value) =>
    map.set(value.kind, (map.get(value.kind) || 0) + 1), new Map()).entries()].sort());
  const channelLiterals = (semantic?.nodes || []).filter(node => node.kind === 'literal' &&
    typeof node.properties?.value === 'string' && node.properties.value.startsWith('tap-desktop:'));
  const bridgeGlobals = graph.nodes.filter(node => node.kind === 'context-bridge-api')
    .flatMap(node => node.observations.map(observation => observation.properties.api_key));
  const canvasPath = 'assets/page-Da_DfwiK.js';
  const canvasEdges = graph.edges.filter(edge => edge.evidence?.location?.value?.source === canvasPath);
  const dynamic = canvasEdges.filter(edge => edge.properties?.kind === 'dynamic-import');
  const rangeGroups = new Map();
  for (const edge of dynamic) {
    const location = edge.evidence.location.value;
    const key = JSON.stringify([location.start, location.end]);
    const group = rangeGroups.get(key) || { start: location.start, end: location.end, relations: 0, relativeLiteralTargets: 0 };
    group.relations += 1;
    if (edge.properties.specifier?.startsWith('./')) group.relativeLiteralTargets += 1;
    rangeGroups.set(key, group);
  }
  const providerBindings = graph.edges.filter(edge => edge.properties?.module_link_kind === 'import' &&
    edge.properties.specifier?.endsWith('agent-host-provider-uVo_bky5.js'));
  const providerBindingCounts = {};
  for (const edge of providerBindings) {
    const source = edge.evidence.location.value.source;
    providerBindingCounts[source] = (providerBindingCounts[source] || 0) + 1;
  }
  runs.push({
    label: measurement.label, version: measurement.version, input: measurement.input,
    inputSelection: measurement.inputSelection || null,
    elapsedMs: measurement.elapsedMs, exitCode: measurement.exitCode,
    errorCode: envelope.code || null, timedOutByWrapper: measurement.timedOut,
    limits: measurement.limits, outputBytes: measurement.stdoutBytes,
    sampledPeakWorkingSetBytes: measurement.memory.peakOwnedProcessCount > 0 ?
      measurement.memory.sampledPeakWorkingSetBytes : null,
    memorySamples: measurement.memory.samples,
    memoryNote: 'Sampled sum of REA-owned process-tree working sets; not exact peak RSS. Null is unmeasured, never zero usage.',
    statistics: result.statistics, electronSummary: result.summary,
    applicationCoverage: { status: graph.coverage.status, truncated: graph.coverage.truncated,
      omittedCount: graph.coverage.omitted_count },
    graph: { nodeCount: graph.nodes.length, edgeCount: graph.edges.length, kinds: countKinds(graph.nodes) },
    semantic: { nodeCount: semantic.nodes.length, relationCount: semantic.relations.length,
      unknownCount: semantic.unknowns.length, fingerprintCount: semantic.fingerprints.length,
      coverage: { status: semantic.coverage.status, truncated: semantic.coverage.truncated },
      nodeKinds: countKinds(semantic.nodes),
      channelLiteralNodeCount: channelLiterals.length,
      uniqueChannelLiteralCount: new Set(channelLiterals.map(node => node.properties.value)).size },
    bridgeGlobals, limitations: evidence.limitations,
    canvasComparison: measurement.label === 'canvas-slice' ? {
      staticImportRelations: canvasEdges.filter(edge => edge.properties?.kind === 'static-import').length,
      dynamicImportRelations: dynamic.length, dynamicSourceRanges: [...rangeGroups.values()],
      relativeLiteralDynamicTargets: dynamic.filter(edge => edge.properties.specifier?.startsWith('./')).length,
      expandedPreloadRelations: dynamic.filter(edge => !edge.properties.specifier?.startsWith('./')).length,
      providerNamedImportBindingCounts: providerBindingCounts,
      canvasFunctionNodes: semantic.nodes.filter(node => node.kind === 'function' && node.identity.module_path === canvasPath).length,
      interpretation: '4 literal dynamic import targets plus Vite preload arrays have different units from 90 expanded relations. Missing Canvas semantics reflect the reported worker heap failure, not absence of the original functions.',
    } : null,
    rawResultPath: path.join(selected, 'stdout.json'), measurementPath: path.join(selected, 'measurement.json'),
  });
}
let trace;
if (traceDirectory) {
  if (!traceDirectory.startsWith(experimentRoot + path.sep)) throw new Error('Outside trace result root.');
  trace = JSON.parse(await readFile(path.join(traceDirectory, 'measurement.json'), 'utf8'));
} else { trace = null; }
const report = {
  workspace: 'LCOS-DSH-03', generatedAt: new Date().toISOString(),
  scope: 'Four static REA 6.4.0 experiments plus one retained-graph query. No application execution or backend/MCP configuration changes.',
  toolAcquisition: 'npm exec --yes --ignore-scripts --package=rea-agents@6.4.0; temporary npm cache only, no setup or global installation.',
  runs, trace,
  knownComparison: {
    fromExistingAudit: { uniqueDesktopChannels: 77, desktopBridgeGlobals: 2, callableBridgeMembers: 76,
      scalarBridgeMembers: 5, canvasLiteralImports: 24, canvasStaticImports: 20, canvasDynamicImports: 4,
      agentHostStaticConsumers: 4, agentHostNamedBindingReferences: 21, agentHostNamedExports: 18 },
    limitations: 'Literal import edges, IPC observations, bridge methods and graph relations are different units. Partial material selection does not establish whole-application absence or completeness.',
  },
};
const destination = path.join(root, 'evidence', 'rea-static-comparison.json');
await writeFile(destination, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ destination, runs: runs.map(run => ({ label: run.label, elapsedMs: run.elapsedMs,
  exitCode: run.exitCode, errorCode: run.errorCode, statistics: run.statistics,
  graphCoverage: run.applicationCoverage, semanticCoverage: run.semantic.coverage,
  nodes: run.semantic.nodeCount, relations: run.semantic.relationCount,
  memoryMiB: run.sampledPeakWorkingSetBytes == null ? null : run.sampledPeakWorkingSetBytes / 1048576 })) }, null, 2));
