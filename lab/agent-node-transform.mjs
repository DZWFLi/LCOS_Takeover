import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const TARGET = 'page-Da_DfwiK.js';
const UI_IMPORT = '/lcos/agent-ui.js';
// A module-level renderer keeps the physical node mounted across selection,
// policy and Popover updates. The original parts never pass through node data.
const THOUGHT_RENDERER = 'function LCOSNativeConversationNodeWithParts(e){return r.jsx(LCOSConversationNode,{...e,NativePopover:pr,NativeButton:LCOSNativeViewerParts.ActionButton})}';
const REACT_FLOW_IMPORT_SUFFIX = 'UnlimitedModeToggle-D4wysAbz.js';
const WORKSPACE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CANONICAL_FILE = path.join(WORKSPACE_ROOT, 'reference/tapnow-installed/resources/web/assets', TARGET);
const CUT_LF_STUB = '()=>window.__LCOS_CUSTOM_PANEL__?.render(r)||null';
let babelParse;
let canonicalSource;
let canonicalPanelExpression;

function getBabelParse() {
  if (babelParse) return babelParse;

  const npmCache = process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, 'npm-cache', '_npx') : '';
  if (npmCache && fs.existsSync(npmCache)) {
    const cached = fs.readdirSync(npmCache).sort()
      .map((entry) => path.join(npmCache, entry, 'node_modules/playwright/lib/transform/babelBundle.js'))
      .find((filename) => fs.existsSync(filename));
    if (cached) {
      babelParse = require(cached).babelParse;
      return babelParse;
    }
  }

  try {
    const localParser = require.resolve('@babel/parser');
    const parser = require(localParser);
    babelParse = (source, filename) => parser.parse(source, {
      sourceType: 'module',
      sourceFilename: filename,
    });
    return babelParse;
  } catch {
    // Reuse the already-installed LCOS parser; this transform never downloads dependencies.
  }

  const parserStore = 'E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926/huabu/node_modules/.pnpm';
  if (fs.existsSync(parserStore)) {
    const parserPackage = fs.readdirSync(parserStore).find((name) => name.startsWith('@babel+parser@'));
    if (parserPackage) {
      const filename = path.join(parserStore, parserPackage, 'node_modules/@babel/parser/lib/index.js');
      const parser = require(filename);
      babelParse = (source, file) => parser.parse(source, {
        sourceType: 'module',
        sourceFilename: file,
      });
      return babelParse;
    }
  }

  throw new Error('Agent node transform: cached @babel/parser unavailable; no download attempted.');
}

function parse(source, filename) {
  return getBabelParse()(source, filename, true);
}

/** Shared read-only parser for precise donor seams; never rewrites an original. */
export function parseOriginalDonorScript(source, filename) {
  return parse(source, filename).program;
}

function walk(root, visit) {
  const pending = [root];
  while (pending.length) {
    const node = pending.pop();
    if (!node || typeof node.type !== 'string') continue;
    visit(node);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) {
        for (const child of value) if (child?.type) pending.push(child);
      } else if (value?.type) {
        pending.push(value);
      }
    }
  }
}

function unique(items, label) {
  if (items.length !== 1) {
    throw new Error(`Agent node seam changed: expected one ${label}, got ${items.length}.`);
  }
  return items[0];
}

function propertyName(property) {
  if (property?.type !== 'ObjectProperty' || property.computed) return undefined;
  if (property.key?.type === 'Identifier') return property.key.name;
  if (property.key?.type === 'StringLiteral') return property.key.value;
  return undefined;
}

function objectProperty(object, name) {
  return object?.type === 'ObjectExpression'
    ? object.properties.find((property) => propertyName(property) === name)
    : undefined;
}

function findLFFunction(program) {
  const matches = [];
  walk(program, (node) => {
    if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier'
      && node.id.name === 'LF' && node.init?.type === 'ArrowFunctionExpression') matches.push(node);
  });
  return unique(matches, 'original AgentSidebar LF function');
}

function jsxCallsFor(root, componentName) {
  const calls = [];
  walk(root, (node) => {
    if (node.type === 'CallExpression'
      && node.callee?.type === 'MemberExpression'
      && !node.callee.computed
      && ['jsx', 'jsxs'].includes(node.callee.property?.name)
      && node.arguments[0]?.type === 'Identifier'
      && node.arguments[0].name === componentName) calls.push(node);
  });
  return calls;
}

function lFVariable(lf, name) {
  const matches = [];
  walk(lf.init.body, (node) => {
    if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier'
      && node.id.name === name) matches.push(node);
  });
  return unique(matches, `LF binding ${name}`);
}

function selectorName(call, storeName) {
  if (call?.type !== 'CallExpression' || call.callee?.type !== 'Identifier'
    || call.callee.name !== storeName || call.arguments[0]?.type !== 'ArrowFunctionExpression') return undefined;
  const body = call.arguments[0].body;
  return body?.type === 'MemberExpression' && !body.computed ? body.property?.name : undefined;
}

function assertOriginalSidebarShape(program, lf, componentName) {
  const rendered = unique(jsxCallsFor(lf.init, componentName), `LF ${componentName} render call`);
  const props = rendered.arguments[1];
  const isOpen = objectProperty(props, 'isOpen')?.value;
  const onClose = objectProperty(props, 'onClose')?.value;
  if (isOpen?.type !== 'LogicalExpression' || isOpen.operator !== '&&'
    || isOpen.left?.type !== 'Identifier' || isOpen.left.name !== 's'
    || isOpen.right?.type !== 'Identifier' || isOpen.right.name !== 'e'
    || onClose?.type !== 'Identifier' || onClose.name !== 'o') {
    throw new Error('Agent node seam changed: original AgentSidebar visibility/close props changed.');
  }

  if (selectorName(lFVariable(lf, 'e').init, 'Ks') !== 'isOpen'
    || selectorName(lFVariable(lf, 't').init, 'Ks') !== 'setIsOpen') {
    throw new Error('Agent node seam changed: original AgentSidebar store selectors changed.');
  }
  const featureGate = lFVariable(lf, 's').init;
  if (featureGate?.type !== 'CallExpression' || featureGate.callee?.name !== 'Da') {
    throw new Error('Agent node seam changed: original AgentSidebar feature policy gate changed.');
  }
  const closeCallback = lFVariable(lf, 'o').init;
  if (closeCallback?.type !== 'CallExpression' || closeCallback.callee?.property?.name !== 'useCallback'
    || closeCallback.arguments[0]?.type !== 'ArrowFunctionExpression') {
    throw new Error('Agent node seam changed: original AgentSidebar close callback changed.');
  }
  let closesStore = false;
  let tracksOriginalClose = false;
  walk(closeCallback.arguments[0].body, (node) => {
    if (node.type === 'CallExpression' && node.callee?.type === 'Identifier' && node.callee.name === 't'
      && node.arguments[0]?.type === 'UnaryExpression' && node.arguments[0].operator === '!'
      && node.arguments[0].argument?.type === 'NumericLiteral' && node.arguments[0].argument.value === 1) {
      closesStore = true;
    }
    if (node.type === 'MemberExpression' && node.property?.name === 'trackChatboxExpose') tracksOriginalClose = true;
  });
  if (!closesStore || !tracksOriginalClose) {
    throw new Error('Agent node seam changed: original close callback no longer closes the Agent store.');
  }
  return rendered;
}

function assertCanonicalAliases(program) {
  const required = [
    ['./index-BAQXnPag.js', 'ce', 'r'],
    ['./index-BAQXnPag.js', 'cd', 'l'],
    ['./index-BAQXnPag.js', 'cq', 'nt'],
    ['./index-BAQXnPag.js', 'pz', 'Da'],
    ['./index-BAQXnPag.js', 'cH', 'tv'],
    ['./UnlimitedModeToggle-D4wysAbz.js', 'v', 'Ks'],
    ['./use-chat-attachment-file-input-ajTygSPP.js', 'j', 'eP'],
    ['./agent-host-provider-uVo_bky5.js', 'C', 'YT'],
  ];
  for (const [moduleName, importedName, localName] of required) {
    const matches = program.body.filter((node) => node.type === 'ImportDeclaration'
      && node.source.value.endsWith(moduleName))
      .flatMap((node) => node.specifiers.filter((specifier) => specifier.type === 'ImportSpecifier'
        && specifier.imported?.name === importedName && specifier.local?.name === localName));
    unique(matches, `bound original LF alias ${localName}`);
  }
}

function readCanonicalSource() {
  if (canonicalSource === undefined) canonicalSource = fs.readFileSync(CANONICAL_FILE, 'utf8');
  return canonicalSource;
}

function getCanonicalPanelExpression() {
  if (canonicalPanelExpression !== undefined) return canonicalPanelExpression;
  const original = readCanonicalSource();
  const program = parse(original, CANONICAL_FILE).program;
  const lf = findLFFunction(program);
  assertCanonicalAliases(program);
  const rendered = assertOriginalSidebarShape(program, lf, 'YT');
  const component = rendered.arguments[0];
  canonicalPanelExpression = original.slice(lf.init.start, component.start)
    + 'LCOSConnectedConversationPanel'
    + original.slice(component.end, lf.init.end);
  canonicalPanelExpression = canonicalPanelExpression
    .replace('onClose:o}', 'onClose:o,NativeFrame:LCOSNativeChatFrame,NativeMessages:LCOSNativeMessages,NativeComposerParts:LCOSNativeComposerParts}')
    .replace('return r.jsx(eP,', 'l.useEffect(()=>{const a=()=>t(!0),b=()=>{if(!rp.getState().isOpen)document.querySelector(\'[data-testid="canvas-dockbar-assets-btn"]\')?.click()};window.addEventListener("lcos-native-open-conversation",a);window.addEventListener("lcos-native-open-library",b);return()=>{window.removeEventListener("lcos-native-open-conversation",a);window.removeEventListener("lcos-native-open-library",b)}},[t]);return r.jsx(eP,');
  return canonicalPanelExpression;
}

function currentLFFunctionCall(program, source) {
  const lf = findLFFunction(program);
  const currentExpression = source.slice(lf.init.start, lf.init.end);
  if (currentExpression === CUT_LF_STUB) {
    return { lf, expression: getCanonicalPanelExpression(), restoredCutStub: true };
  }
  const originalCalls = jsxCallsFor(lf.init, 'YT');
  if (originalCalls.length === 1) {
    // The raw vendor function is intentionally not a transform input. Rebuilding it
    // would overwrite edits outside the recognized in-memory cut seam.
    throw new Error('Agent node transform expects the exact cut LF stub; original LF is not a writable seam.');
  }
  const installedCalls = jsxCallsFor(lf.init, 'LCOSConnectedConversationPanel');
  if (installedCalls.length === 1) {
    assertOriginalSidebarShape(program, lf, 'LCOSConnectedConversationPanel');
    return { lf, expression: currentExpression, alreadyInstalled: true };
  }
  throw new Error('Agent node transform found an unknown LF body; refusing to replace it.');
}

function assertLFCaller(program) {
  const callers = [];
  walk(program, (node) => {
    if (node.type !== 'CallExpression' || node.callee?.type !== 'MemberExpression'
      || !['jsx', 'jsxs'].includes(node.callee.property?.name)
      || node.arguments[0]?.type !== 'Identifier' || node.arguments[0].name !== 'LF') return;
    callers.push(node);
  });
  const caller = unique(callers, 'existing AgentSidebar composition caller');
  if (caller.arguments[1]?.type !== 'ObjectExpression' || caller.arguments[1].properties.length !== 0) {
    throw new Error('Agent node seam changed: original LF caller props changed.');
  }
}

function reactFlowAliases(program) {
  return program.body
    .filter((node) => node.type === 'ImportDeclaration'
      && node.source.value.endsWith(REACT_FLOW_IMPORT_SUFFIX))
    .flatMap((node) => node.specifiers
      .filter((specifier) => specifier.type === 'ImportSpecifier'
        && specifier.imported?.name === 'i')
      .map((specifier) => specifier.local.name));
}

function reactFlowRootCalls(program) {
  const aliases = new Set(reactFlowAliases(program));
  if (aliases.size === 0) return [];
  const calls = [];
  walk(program, (node) => {
    if (node.type !== 'CallExpression'
      || node.callee?.type !== 'MemberExpression'
      || node.callee.computed
      || !['jsx', 'jsxs'].includes(node.callee.property?.name)
      || node.arguments[0]?.type !== 'Identifier'
      || !aliases.has(node.arguments[0].name)) return;
    calls.push(node);
  });
  return calls;
}

function isJsxComponentCall(node, componentName, runtimeName) {
  return node?.type === 'CallExpression'
    && node.callee?.type === 'MemberExpression'
    && !node.callee.computed
    && ['jsx', 'jsxs'].includes(node.callee.property?.name)
    && (runtimeName === undefined || node.callee.object?.name === runtimeName)
    && node.arguments[0]?.type === 'Identifier'
    && node.arguments[0].name === componentName;
}

function professionalHostSlot(program, expectInstalled) {
  const root = unique(reactFlowRootCalls(program), 'original ReactFlow root');
  const runtime = root.callee.object?.name;
  const childrenProperty = objectProperty(root.arguments[1], 'children');
  const children = childrenProperty?.value;
  if (children?.type !== 'ArrayExpression' || !runtime) {
    throw new Error('Agent node seam changed: ReactFlow root no longer owns an explicit children array.');
  }
  const bridgeChildren = children.elements.filter((element) => isJsxComponentCall(element, 'LCOSOriginalNodeBridge', runtime));
  const hostChildren = children.elements.filter((element) => isJsxComponentCall(element, 'LCOSProfessionalHost', runtime));
  const hostCallsAnywhere = jsxCallsFor(root, 'LCOSProfessionalHost');
  unique(bridgeChildren, 'existing original NodeBridge child');
  if (hostCallsAnywhere.length !== hostChildren.length || hostChildren.length !== (expectInstalled ? 1 : 0)) {
    throw new Error('Agent node seam changed: ProfessionalHost is not at the unique original ReactFlow child seam.');
  }
  const bridgeIndex = children.elements.indexOf(bridgeChildren[0]);
  if (expectInstalled) {
    if (hostChildren[0] !== children.elements.at(-1) || children.elements[bridgeIndex + 1] !== hostChildren[0]) {
      throw new Error('Agent node seam changed: ProfessionalHost no longer follows the original NodeBridge child.');
    }
  } else if (bridgeChildren[0] !== children.elements.at(-1)) {
    throw new Error('Agent node seam changed: original NodeBridge is no longer the final ReactFlow child.');
  }
  return { root, runtime, children, bridge: bridgeChildren[0], host: hostChildren[0] };
}

function mapOwner(program) {
  const roots = reactFlowRootCalls(program);
  unique(roots, 'original ReactFlow root');

  const candidates = [];
  walk(program, (node) => {
    if (node.type !== 'ObjectProperty' || propertyName(node) !== 'nodeTypes'
      || node.value?.type !== 'Identifier') return;
    candidates.push(node);
  });
  const nodeTypes = unique(candidates, 'ReactFlow nodeTypes owner');

  const ownerDeclarators = [];
  walk(program, (node) => {
    if (node.type !== 'VariableDeclarator' || node.id?.type !== 'Identifier'
      || node.init?.type !== 'CallExpression'
      || node.init.callee?.type !== 'MemberExpression'
      || node.init.callee.property?.name !== 'useMemo') return;
    const callback = node.init.arguments[0];
    let returned = callback?.body;
    if (returned?.type === 'BlockStatement') {
      const returns = returned.body.filter((statement) => statement.type === 'ReturnStatement');
      if (returns.length !== 1) return;
      returned = returns[0].argument;
    }
    if (returned?.type !== 'ObjectExpression') return;
    const properties = returned.properties.filter((property) => propertyName(property) === 'nodeTypes');
    if (properties.length === 1 && properties[0] === nodeTypes) {
      ownerDeclarators.push({ declaration: node, object: returned });
    }
  });
  const owner = unique(ownerDeclarators, 'memoized nodeTypes owner');

  const rootProps = roots[0].arguments[1];
  if (!rootProps) throw new Error('Agent node seam changed: ReactFlow root props are missing.');
  const rootSpreadNames = new Set();
  walk(rootProps, (node) => {
    if (node.type === 'SpreadElement' && node.argument?.type === 'Identifier') {
      rootSpreadNames.add(node.argument.name);
    }
  });
  const consumingBindings = [];
  walk(program, (node) => {
    if (node.type !== 'VariableDeclarator' || node.id?.type !== 'Identifier'
      || !rootSpreadNames.has(node.id.name) || !node.init) return;
    let consumesOwner = false;
    walk(node.init, (child) => {
      if (child.type === 'Identifier' && child.name === owner.declaration.id.name) consumesOwner = true;
    });
    if (consumesOwner) consumingBindings.push(node);
  });
  const consumesOwner = consumingBindings.length === 1;
  if (!consumesOwner) {
    throw new Error('Agent node seam changed: ReactFlow root no longer consumes the original nodeTypes owner.');
  }

  if (nodeTypes.value.type !== 'Identifier') {
    throw new Error('Agent node seam changed: original nodeTypes map is not an identifier.');
  }
  const mapName = nodeTypes.value.name;
  // The owner has a later options spread. It only carries ReactFlow mechanics;
  // fail closed if a future bundle tries to replace nodeTypes after our map.
  const laterNodeTypesOverrides = owner.object.properties.some((property, index) => {
    const nodeTypesIndex = owner.object.properties.indexOf(nodeTypes);
    if (index <= nodeTypesIndex || property.type !== 'SpreadElement') return false;
    const name = property.argument?.name;
    const binding = name && program.body
      .filter((statement) => statement.type === 'VariableDeclaration')
      .flatMap((statement) => statement.declarations)
      .find((declaration) => declaration.id?.type === 'Identifier' && declaration.id.name === name);
    return binding?.init?.type === 'ObjectExpression'
      && binding.init.properties.some((entry) => propertyName(entry) === 'nodeTypes');
  });
  if (laterNodeTypesOverrides) {
    throw new Error('Agent node seam changed: a later ReactFlow options spread owns nodeTypes.');
  }

  return { nodeTypes, mapName };
}

function installedState(program) {
  const imports = program.body.filter((node) => node.type === 'ImportDeclaration'
    && node.source.value === UI_IMPORT
    && ['LCOSConversationNode', 'LCOSExecutionNode', 'LCOSResultMaterialNode', 'LCOSCollectionNode', 'LCOSConnectedConversationPanel', 'LCOSProfessionalHost'].every((name) => node.specifiers.some((specifier) =>
      specifier.type === 'ImportSpecifier' && specifier.imported?.name === name && specifier.local?.name === name)));
  const registrations = [];
  walk(program, (node) => {
    if (node.type !== 'ObjectProperty' || propertyName(node) !== 'nodeTypes'
      || node.value?.type !== 'ObjectExpression') return;
    const spread = node.value.properties.find((property) => property.type === 'SpreadElement');
    const expected = {
      'lcos-conversation': 'LCOSNativeConversationNodeWithParts',
      'lcos-execution': 'LCOSExecutionNode',
      'lcos-result-material': 'LCOSResultMaterialNode',
      'lcos-collection': 'LCOSCollectionNode',
    };
    const complete = Object.entries(expected).every(([key, value]) => {
      const entries = node.value.properties.filter((property) => propertyName(property) === key);
      return entries.length === 1 && entries[0].value?.type === 'Identifier' && entries[0].value.name === value;
    });
    if (spread?.argument?.type === 'Identifier'
      && complete) {
      registrations.push({ node, base: spread.argument.name });
    }
  });
  const lf = findLFFunction(program);
  const panelCalls = jsxCallsFor(lf.init, 'LCOSConnectedConversationPanel');
  const root = unique(reactFlowRootCalls(program), 'original ReactFlow root');
  const hostCalls = jsxCallsFor(root, 'LCOSProfessionalHost');
  professionalHostSlot(program, hostCalls.length === 1);
  const thoughtRenderers = program.body.filter(node => node.type === 'FunctionDeclaration'
    && node.id?.name === 'LCOSNativeConversationNodeWithParts');
  if (thoughtRenderers.length) {
    const renderer = unique(thoughtRenderers, 'stable native thought renderer');
    const call = unique(jsxCallsFor(renderer, 'LCOSConversationNode'), 'original conversation renderer with original parts');
    const props = call.arguments[1];
    if (renderer.params.length !== 1 || renderer.params[0]?.name !== 'e'
      || call.callee?.object?.name !== 'r' || props?.properties.length !== 3
      || props.properties[0]?.type !== 'SpreadElement' || props.properties[0].argument?.name !== 'e'
      || objectProperty(props, 'NativePopover')?.value?.name !== 'pr'
      || objectProperty(props, 'NativeButton')?.value?.object?.name !== 'LCOSNativeViewerParts'
      || objectProperty(props, 'NativeButton')?.value?.property?.name !== 'ActionButton') {
      throw new Error('Agent node seam changed: stable thought renderer no longer supplies the original Popover and Button.');
    }
  }
  return { imports: imports.length, registrations, panelCalls, hostCalls, thoughtRenderers };
}

function applyEdits(source, edits) {
  const ordered = [...edits].sort((left, right) => right.start - left.start || right.end - left.end);
  let output = source;
  let previousStart = Number.POSITIVE_INFINITY;
  for (const edit of ordered) {
    if (edit.end > previousStart) throw new Error('Agent node transform found overlapping AST edits.');
    output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
    previousStart = edit.start;
  }
  return output;
}

export function countAgentNodeReactFlowRoots(source, filename = TARGET) {
  return reactFlowRootCalls(parse(source, filename).program).length;
}

export function transformAgentNodeScript(filename, source) {
  if (typeof filename !== 'string' || typeof source !== 'string') {
    throw new TypeError('Agent node transform expects a filename and source text.');
  }
  if (filename.split(/[\\/]/).pop() !== TARGET) return source;

  const parsed = parse(source, filename).program;
  const sidebar = currentLFFunctionCall(parsed, source);
  const current = installedState(parsed);
  assertLFCaller(parsed);
  if (current.imports === 1 && current.registrations.length === 1 && current.panelCalls.length === 1
    && current.hostCalls.length === 1 && current.thoughtRenderers.length === 1) {
    professionalHostSlot(parsed, true);
    return source;
  }
  // During installation the host may be absent, or present exactly once after
  // the explicit preexisting NodeBridge child. Any other state is ambiguous.
  if (current.imports !== 0 || current.registrations.length !== 0 || current.panelCalls.length !== 0
    || current.hostCalls.length !== 0 || current.thoughtRenderers.length !== 0) {
    throw new Error('Agent node transform is partially installed; refusing an ambiguous source.');
  }

  const beforeRoots = reactFlowRootCalls(parsed).length;
  const { nodeTypes, mapName } = mapOwner(parsed);
  const hostSlot = professionalHostSlot(parsed, false);
  assertCanonicalAliases(parsed);
  const firstImport = parsed.body.find((node) => node.type === 'ImportDeclaration');
  if (!firstImport) throw new Error('Agent node seam changed: bundle imports are missing.');

  const map = `({...${mapName},"lcos-conversation":LCOSNativeConversationNodeWithParts,"lcos-execution":LCOSExecutionNode,"lcos-result-material":LCOSResultMaterialNode,"lcos-collection":LCOSCollectionNode})`;
  const beforeChildrenClose = hostSlot.children.end - 1;
  const childrenBody = source.slice(hostSlot.children.start + 1, beforeChildrenClose);
  const separator = hostSlot.children.elements.length > 0 && !childrenBody.trimEnd().endsWith(',') ? ',' : '';
  const transformed = applyEdits(source, [
    { start: nodeTypes.value.start, end: nodeTypes.value.end, text: map },
    { start: sidebar.lf.init.start, end: sidebar.lf.init.end, text: sidebar.expression },
    { start: beforeChildrenClose, end: beforeChildrenClose, text: `${separator}${hostSlot.runtime}.jsx(LCOSProfessionalHost,{NativeComposerParts:LCOSNativeComposerParts,NativeViewerRuntime:LCOSNativeMaterialViewerRuntime,NativeViewerParts:{...LCOSNativeViewerParts,Popover:pr}})` },
    { start: firstImport.start, end: firstImport.start, text: `import{LCOSConversationNode,LCOSExecutionNode,LCOSResultMaterialNode,LCOSCollectionNode,LCOSConnectedConversationPanel,LCOSProfessionalHost}from"${UI_IMPORT}";\nimport{LCOSNativeChatFrame,LCOSNativeMessages,LCOSNativeComposerParts}from"./agent-host-provider-uVo_bky5.js";\nimport{LCOSNativeMaterialViewerRuntime,LCOSNativeViewerParts}from"./course-api-base-url-CifxI1ia.js";\n${THOUGHT_RENDERER}\n` },
  ]);

  const after = parse(transformed, filename).program;
  const installed = installedState(after);
  assertLFCaller(after);
  const installedHost = professionalHostSlot(after, true);
  if (installed.imports !== 1 || installed.registrations.length !== 1 || installed.panelCalls.length !== 1
    || installed.hostCalls.length !== 1 || installed.thoughtRenderers.length !== 1 || installedHost.host !== installed.hostCalls[0]
    || installed.registrations[0].base !== mapName) {
    throw new Error('Agent node transform did not extend the original node map with the native leaves, restore the controlled LF panel, and mount the professional stage once.');
  }
  assertOriginalSidebarShape(after, findLFFunction(after), 'LCOSConnectedConversationPanel');
  const afterRoots = reactFlowRootCalls(after).length;
  if (afterRoots !== beforeRoots) {
    throw new Error('Agent node transform changed the original ReactFlow root count.');
  }
  return transformed;
}
