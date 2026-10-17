import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const TARGET = 'page-Da_DfwiK.js';
const MARKER = '/* __LCOS_HISTORY_INTENT_TRANSFORMED__ */';
let parser;

function getParser() {
  if (parser) return parser;
  const cache = path.join(process.env.LOCALAPPDATA || '', 'npm-cache', '_npx');
  const cachedParser = fs.existsSync(cache)
    ? fs.readdirSync(cache).sort().map(entry => path.join(cache, entry, 'node_modules/playwright/lib/transform/babelBundle.js')).find(file => fs.existsSync(file))
    : undefined;
  if (cachedParser) parser = require(cachedParser).babelParse;
  else {
    const store = 'E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926/huabu/node_modules/.pnpm';
    const installed = fs.existsSync(store) && fs.readdirSync(store).find(entry => entry.startsWith('@babel+parser@'));
    if (!installed) throw new Error('Installed Babel parser unavailable; no download attempted.');
    const babel = require(path.join(store, installed, 'node_modules/@babel/parser/lib/index.js'));
    parser = (source, filename) => babel.parse(source, { sourceType: 'module', sourceFilename: filename });
  }
  return parser;
}

function parse(source, filename) {
  const parseSource = getParser();
  return parseSource(source, filename, true);
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
      } else if (value?.type) pending.push(value);
    }
  }
}

const propertyName = property => property?.type === 'ObjectProperty' && !property.computed
  ? property.key.name ?? property.key.value
  : undefined;
const objectProperty = (object, name) => object?.properties?.find(property => propertyName(property) === name);
const identifierValue = (property, label) => {
  if (property?.value?.type !== 'Identifier') throw new Error('History seam changed: ' + label);
  return property.value.name;
};
const unique = (items, label) => {
  if (items.length !== 1) throw new Error('History seam changed: expected one ' + label + ', got ' + items.length);
  return items[0];
};

function editsApply(source, edits) {
  const sorted = [...edits].sort((a, b) => b.start - a.start || b.end - a.end);
  let result = source;
  let previousStart = Infinity;
  for (const edit of sorted) {
    if (edit.end > previousStart) throw new Error('History transform found overlapping source edits.');
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
    previousStart = edit.start;
  }
  return result;
}

function appendObjectProperty(source, object, property, edits) {
  if (!object || object.type !== 'ObjectExpression' && object.type !== 'ObjectPattern') throw new Error('History seam changed: expected object.');
  property = property.trim().replace(/,$/, '');
  const existing = object.properties.map(propertyName).filter(Boolean);
  const simpleKey = /^([A-Za-z_$][\w$]*)\s*:/.exec(property)?.[1];
  if (simpleKey && existing.includes(simpleKey)) return;
  const body = source.slice(object.start + 1, object.end - 1);
  const start = object.end - 1;
  let edit = edits.find(candidate => candidate.objectStart === object.start && candidate.objectEnd === object.end);
  if (edit) edit.text += ',' + property;
  else {
    const separator = body.trim().length && !body.trimEnd().endsWith(',') ? ',' : '';
    edit = { start, end: start, text: separator + property, objectStart: object.start, objectEnd: object.end };
    edits.push(edit);
  }
}

function functionValue(node) {
  return node?.type === 'ArrowFunctionExpression' || node?.type === 'FunctionExpression';
}

function containsNodeDataCreation(root, edge) {
  let found = false;
  walk(root, node => {
    if (node.type !== 'ObjectExpression') return;
    const operation = objectProperty(node, 'operationType')?.value;
    const value = operation?.type === 'StringLiteral' ? operation.value : undefined;
    if (value !== 'create') return;
    const keys = new Set(node.properties.map(propertyName));
    if (edge ? keys.has('source') && keys.has('target') : keys.has('position') && keys.has('data') && keys.has('type')) found = true;
  });
  return found;
}

function changeLoop(callback) {
  const loops = [];
  walk(callback.body, node => {
    if (node.type !== 'CallExpression' || node.callee?.type !== 'MemberExpression' || node.callee.computed
      || node.callee.property?.name !== 'forEach' || !functionValue(node.arguments[0])) return;
    const callbackArg = node.arguments[0];
    const params = callbackArg.params || [];
    const change = params[0]?.type === 'Identifier' ? params[0].name : undefined;
    if (!change) return;
    const matchingIfs = [];
    walk(callbackArg.body, child => {
      if (child.type !== 'IfStatement' || child.test?.type !== 'Identifier') return;
      let pushesChange = false;
      walk(child.consequent, nested => {
        if (nested.type === 'CallExpression' && nested.callee?.type === 'MemberExpression'
          && nested.callee.property?.name === 'push' && nested.arguments[0]?.type === 'Identifier'
          && nested.arguments[0].name === child.test.name) pushesChange = true;
      });
      if (pushesChange) matchingIfs.push(child);
    });
    if (matchingIfs.length === 1) loops.push({ callbackArg, change, queueItem: matchingIfs[0].test.name, pushIf: matchingIfs[0] });
  });
  return unique(loops, 'change queue callback');
}

function findHistorySeams(ast) {
  const program = ast.program ?? ast;
  const canvases = program.body.filter(node => node.type === 'FunctionDeclaration' && node.id?.name === 'bB');
  const canvas = unique(canvases, 'Canvas function bB');
  const canvasId = identifierValue(objectProperty(canvas.params[0], 'canvasId'), 'Canvas canvasId');
  const historyDeclarators = [];
  let historyDeclaration;
  let nodeApiGetter;
  walk(canvas.body, node => {
    if (node.type === 'VariableDeclaration' && node.declarations.some(declaration => declaration.init?.callee?.name === 'B8')) {
      historyDeclaration = node;
    }
    if (node.type === 'VariableDeclarator' && node.init?.callee?.name === 'B8'
      && objectProperty(node.id, 'undo') && objectProperty(node.id, 'redo')) historyDeclarators.push(node);
    if (node.type === 'VariableDeclarator' && node.init?.callee?.name === '$e'
      && objectProperty(node.id, 'getNodes') && objectProperty(node.id, 'deleteElements')) {
      nodeApiGetter = identifierValue(objectProperty(node.id, 'getNodes'), 'ReactFlow getNodes');
    }
  });
  const history = unique(historyDeclarators, 'B8 history binding');
  if (!historyDeclaration) throw new Error('History seam changed: B8 declaration is missing.');
  const undo = identifierValue(objectProperty(history.id, 'undo'), 'undo callback');
  const redo = identifierValue(objectProperty(history.id, 'redo'), 'redo callback');
  if (!nodeApiGetter) throw new Error('History seam changed: ReactFlow getNodes accessor is missing.');

  const bridgeCalls = [], historyCalls = [];
  walk(canvas.body, node => {
    if (node.type !== 'CallExpression') return;
    const first = node.arguments[0];
    if (node.callee?.type === 'MemberExpression' && node.callee.property?.name === 'jsx'
      && first?.type === 'Identifier' && first.name === 'LCOSOriginalNodeBridge') bridgeCalls.push(node);
    if (node.callee?.type === 'Identifier' && node.callee.name === 'qp'
      && objectProperty(first, 'onUndo') && objectProperty(first, 'onRedo')) historyCalls.push({ node, kind: 'keyboard', object: first });
    if (node.callee?.type === 'Identifier' && node.callee.name === 'y8'
      && objectProperty(first, 'undo') && objectProperty(first, 'redo')) historyCalls.push({ node, kind: 'host', object: first });
  });
  const bridge = unique(bridgeCalls, 'original-node bridge');
  if (!historyCalls.some(call => call.kind === 'keyboard')) throw new Error('History seam changed: native keyboard callback caller was not found.');
  if (!historyCalls.some(call => call.kind === 'host')) throw new Error('History seam changed: original host callback caller was not found.');

  const r6Declarators = [];
  for (const statement of program.body) {
    if (statement.type !== 'VariableDeclaration') continue;
    for (const declaration of statement.declarations) {
      if (declaration.id?.type === 'Identifier' && declaration.id.name === 'r6' && declaration.init?.type === 'ArrowFunctionExpression') {
        r6Declarators.push(declaration);
      }
    }
  }
  const r6 = unique(r6Declarators, 'r6 persistence hook');
  const r6Params = r6.init.params[0];
  if (r6Params?.type !== 'ObjectPattern') throw new Error('History seam changed: r6 parameters are not an object.');
  const nodesCallbackName = identifierValue(objectProperty(r6Params, 'onNodesChange'), 'r6 onNodesChange');
  const edgesCallbackName = identifierValue(objectProperty(r6Params, 'onEdgesChange'), 'r6 onEdgesChange');

  const nodeCallbacks = [], edgeCallbacks = [];
  walk(r6.init.body, node => {
    if (node.type !== 'VariableDeclarator' || node.init?.type !== 'CallExpression'
      || node.init.callee?.property?.name !== 'useCallback' || !functionValue(node.init.arguments[0])) return;
    const callback = node.init.arguments[0];
    if (!callback.params.length || callback.params[0].type !== 'Identifier' || callback.body.type !== 'BlockStatement') return;
    if (containsNodeDataCreation(callback.body, false)) nodeCallbacks.push(callback);
    if (containsNodeDataCreation(callback.body, true)) edgeCallbacks.push(callback);
  });
  const nodeCallback = unique(nodeCallbacks, 'native node change callback');
  const edgeCallback = unique(edgeCallbacks, 'native edge change callback');
  const nodeQueue = changeLoop(nodeCallback);
  const edgeQueue = changeLoop(edgeCallback);

  const r6Calls = [];
  walk(canvas.body, node => {
    if (node.type === 'CallExpression' && node.callee?.type === 'Identifier' && node.callee.name === 'r6'
      && node.arguments[0]?.type === 'ObjectExpression'
      && objectProperty(node.arguments[0], 'onNodesChange') && objectProperty(node.arguments[0], 'onEdgesChange')) r6Calls.push(node.arguments[0]);
  });
  const r6CallProps = unique(r6Calls, 'r6 call from Canvas');

  const pasteHooks = [];
  const pasteHookImplementations = [];
  for (const statement of program.body) {
    if (statement.type !== 'VariableDeclaration') continue;
    for (const declaration of statement.declarations) {
      if (declaration.id?.name !== 'sm' || declaration.init?.type !== 'ArrowFunctionExpression') continue;
      pasteHookImplementations.push(declaration);
      walk(declaration.init.body, node => {
        if (node.type === 'ReturnStatement' && node.argument?.type === 'ObjectExpression') {
          const property = objectProperty(node.argument, 'pasteCopiedNodes');
          if (property?.value?.type === 'Identifier') pasteHooks.push(property);
        }
      });
    }
  }
  const pasteHook = unique(pasteHookImplementations, 'paste hook sm');
  const hookParam = pasteHook.init.params[0]?.type === 'AssignmentPattern' ? pasteHook.init.params[0].left : pasteHook.init.params[0];
  if (hookParam?.type !== 'Identifier') throw new Error('History seam changed: sm input alias.');
  const hookCanvasDestructures = [];
  walk(pasteHook.init.body, node => {
    if (node.type === 'VariableDeclarator' && node.id?.type === 'ObjectPattern'
      && node.init?.type === 'Identifier' && node.init.name === hookParam.name
      && objectProperty(node.id, 'disableShortcuts')) hookCanvasDestructures.push(node.id);
  });
  const hookCanvasDestructure = unique(hookCanvasDestructures, 'sm hook options destructure');
  const paste = unique(pasteHooks, 'pasteCopiedNodes callback');
  const pasteName = identifierValue(paste, 'paste callback');
  const pasteCallbacks = [];
  for (const statement of program.body) {
    if (statement.type !== 'VariableDeclaration') continue;
    for (const declaration of statement.declarations) {
      if (declaration.id?.name !== 'sm' || declaration.init?.type !== 'ArrowFunctionExpression') continue;
      walk(declaration.init.body, node => {
        if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier' && node.id.name === pasteName
          && node.init?.type === 'CallExpression' && node.init.callee?.property?.name === 'useCallback'
          && functionValue(node.init.arguments[0])) pasteCallbacks.push(node.init.arguments[0]);
      });
    }
  }
  const pasteCallback = unique(pasteCallbacks, 'paste implementation callback');
  const pasteNodeDeclarators = [];
  walk(pasteCallback.body, node => {
    if (node.type !== 'VariableDeclarator' || node.id?.type !== 'ObjectPattern'
      || node.init?.type !== 'CallExpression' || node.init.callee?.type !== 'Identifier' || node.init.callee.name !== 'f8') return;
    const nodesProperty = objectProperty(node.id, 'nodes');
    if (nodesProperty?.value?.type === 'Identifier') pasteNodeDeclarators.push({ declarator: node, nodesName: nodesProperty.value.name });
  });
  const pasteNodes = unique(pasteNodeDeclarators, 'paste f8 cloned nodes');
  const pasteNodesStatements = [];
  walk(pasteCallback.body, node => {
    if (node.type === 'VariableDeclaration' && node.declarations.includes(pasteNodes.declarator)) pasteNodesStatements.push(node);
  });
  const pasteNodesStatement = unique(pasteNodesStatements, 'paste f8 node statement');
  const pasteHandlerDeclarators = [];
  walk(pasteHook.init.body, node => {
    if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier' && node.id.name === pasteName
      && node.init?.type === 'CallExpression' && node.init.callee?.property?.name === 'useCallback') pasteHandlerDeclarators.push(node);
  });
  const pasteHandlerDeclarator = unique(pasteHandlerDeclarators, 'native paste callback declaration');
  const pasteHandlerStatements = [];
  walk(pasteHook.init.body, node => {
    if (node.type === 'VariableDeclaration' && node.declarations.includes(pasteHandlerDeclarator)) pasteHandlerStatements.push(node);
  });
  const pasteHandlerStatement = unique(pasteHandlerStatements, 'native paste callback declaration statement');
  const pasteWrapperName = '__lcosNativePaste';
  const pasteReferences = [];
  walk(pasteHook.init.body, node => {
    if (node.type === 'Identifier' && node.name === pasteName && node.start > pasteHandlerStatement.end) pasteReferences.push(node);
  });

  const nodeMenus = program.body.flatMap(statement => statement.type === 'VariableDeclaration' ? statement.declarations : [])
    .filter(declaration => declaration.id?.name === 'g8' && declaration.init?.type === 'ArrowFunctionExpression');
  const nodeMenu = unique(nodeMenus, 'native node context menu g8');
  const nodeMenuCanvasIds = [];
  walk(nodeMenu.init.body, node => {
    if (node.type !== 'VariableDeclarator' || node.init?.type !== 'CallExpression' || node.init.callee?.name !== 'Hs') return;
    const property = objectProperty(node.id, 'canvasId');
    if (property?.value?.type === 'Identifier') nodeMenuCanvasIds.push(property.value.name);
  });
  const nodeMenuCanvasId = unique(nodeMenuCanvasIds, 'native context menu canvasId');
  const toolbars = program.body.flatMap(statement => statement.type === 'VariableDeclaration' ? statement.declarations : [])
    .filter(declaration => declaration.id?.name === 'x8' && declaration.init?.type === 'ArrowFunctionExpression');
  const toolbar = unique(toolbars, 'native pane toolbar x8');
  const toolbarCanvasId = identifierValue(objectProperty(toolbar.init.params[0], 'canvasId'), 'toolbar canvasId');
  function hookCall(root, label) {
    const calls = [];
    walk(root, node => {
      if (node.type === 'CallExpression' && node.callee?.type === 'Identifier' && node.callee.name === 'sm'
        && node.arguments[0]?.type === 'ObjectExpression') calls.push(node);
    });
    return unique(calls, label);
  }
  const pasteCallSites = [
    { call: hookCall(nodeMenu.init.body, 'node context menu sm call'), canvasId: nodeMenuCanvasId },
    { call: hookCall(toolbar.init.body, 'pane toolbar sm call'), canvasId: toolbarCanvasId },
    { call: hookCall(canvas.body, 'Canvas shortcut sm call'), canvasId },
  ];
  const duplicateCallbacks = [];
  const duplicateNodeClones = [];
  walk(nodeMenu.init.body, node => {
    if (node.type !== 'VariableDeclarator' || node.init?.type !== 'CallExpression'
      || node.init.callee?.property?.name !== 'useCallback' || !functionValue(node.init.arguments[0])) return;
    const callback = node.init.arguments[0];
    const calls = new Set();
    walk(callback.body, child => {
      if (child.type === 'CallExpression' && child.callee?.type === 'Identifier') calls.add(child.callee.name);
    });
    if (calls.has('sw') && calls.has('yw')) {
      duplicateCallbacks.push(callback);
      walk(callback.body, child => {
        if (child.type === 'VariableDeclarator' && child.id?.type === 'Identifier' && child.init?.type === 'CallExpression'
          && child.init.callee?.type === 'Identifier' && child.init.callee.name === 'm8'
          && child.init.arguments[0]?.type === 'CallExpression' && child.init.arguments[0].callee?.name === 'sw') {
          duplicateNodeClones.push({ declarator: child, nodeName: child.id.name });
        }
      });
    }
  });
  const duplicate = unique(duplicateCallbacks, 'explicit native duplicate callback');
  const duplicateClone = unique(duplicateNodeClones, 'explicit native duplicate node clone');
  const duplicateStatements = [];
  walk(duplicate.body, node => {
    if (node.type === 'VariableDeclaration' && node.declarations.includes(duplicateClone.declarator)) duplicateStatements.push(node);
  });
  const duplicateStatement = unique(duplicateStatements, 'explicit duplicate clone statement');
  const duplicateHooks = [];
  walk(nodeMenu.init.body, node => {
    if (node.type === 'VariableDeclarator' && node.init?.type === 'CallExpression'
      && node.init.callee?.property?.name === 'useCallback' && node.init.arguments[0] === duplicate
      && node.id?.type === 'Identifier') duplicateHooks.push(node);
  });
  const duplicateHook = unique(duplicateHooks, 'explicit duplicate callback hook');
  const duplicateHookStatements = [];
  const duplicateOnClickProps = [];
  walk(nodeMenu.init.body, node => {
    if (node.type === 'VariableDeclaration' && node.declarations.includes(duplicateHook)) duplicateHookStatements.push(node);
    if (['onClick', 'onSelect'].includes(propertyName(node)) && node.value?.type === 'Identifier' && node.value.name === duplicateHook.id.name) {
      duplicateOnClickProps.push(node);
    }
  });
  const duplicateHookStatement = unique(duplicateHookStatements, 'duplicate callback hook declaration');
  const duplicateOnClick = unique(duplicateOnClickProps, 'duplicate menu handler');
  return { program, canvas, canvasId, nodeApiGetter, historyDeclaration, history, undo, redo, historyCalls, bridge,
    r6, r6Params, nodesCallbackName, edgesCallbackName, nodeCallback, edgeCallback, nodeQueue, edgeQueue,
    r6CallProps, paste, pasteHook, pasteCallback, pasteNodes, pasteNodesStatement, pasteHandlerStatement,
    pasteWrapperName, pasteReferences, pasteCallSites, hookCanvasDestructure, nodeMenuCanvasId, duplicate,
    duplicateClone, duplicateStatement, duplicateHook, duplicateHookStatement, duplicateOnClick };
}

function memberProperty(node, name) {
  return (node?.type === 'MemberExpression' || node?.type === 'OptionalMemberExpression')
    && !node.computed && node.property?.type === 'Identifier' && node.property.name === name;
}

function callProperty(node, name) {
  return node?.type === 'CallExpression' && memberProperty(node.callee, name);
}

function containsCall(root, name) {
  let found = false;
  walk(root, node => {
    if (node.type === 'CallExpression' && node.callee?.type === 'Identifier' && node.callee.name === name) found = true;
  });
  return found;
}

function historyArrayIndex(root, historyRefName) {
  let found;
  walk(root, node => {
    if (!memberProperty(node, 'state')) return;
    const arrayItem = node.object;
    if (arrayItem?.type !== 'MemberExpression' || !arrayItem.computed) return;
    const current = arrayItem.object;
    if (memberProperty(current, 'current') && current.object?.type === 'Identifier'
      && current.object.name === historyRefName) {
      if (arrayItem.property?.type === 'Identifier') found = arrayItem.property.name;
      else if (memberProperty(arrayItem.property, 'current') && arrayItem.property.object?.type === 'Identifier') {
        found = arrayItem.property.object.name;
      }
    }
  });
  return found;
}

function findHistoryOwnerSeams(program) {
  const owner = unique(program.body.filter(node => node.type === 'FunctionDeclaration' && node.id?.name === 'O8'), 'native local history owner O8');
  const optionPatterns = [];
  walk(owner.body, node => {
    if (node.type === 'VariableDeclarator' && node.id?.type === 'ObjectPattern'
      && node.init?.type === 'Identifier' && node.init.name === owner.params[2]?.name
      && objectProperty(node.id, 'defaultOnNodesChange')) optionPatterns.push(node.id);
  });
  const options = unique(optionPatterns, 'O8 history options destructure');
  const canvasId = '__lcosHistoryCanvasId';
  const setNodes = '__lcosHistorySetNodes';
  const hasInitialSnapshot = node => {
    let found = false;
    walk(node, child => {
      if (child.type !== 'ObjectExpression') return;
      const state = objectProperty(child, 'state')?.value;
      if (state?.type === 'ObjectExpression' && objectProperty(state, 'nodes') && objectProperty(state, 'edges')
        && objectProperty(child, 'timestamp')) found = true;
    });
    return found;
  };
  const historyStates = [];
  walk(owner.body, node => {
    if (node.type !== 'VariableDeclarator' || node.id?.type !== 'ArrayPattern'
      || node.init?.type !== 'CallExpression' || !memberProperty(node.init.callee, 'useState')
      || !hasInitialSnapshot(node.init.arguments[0])) return;
    const values = node.id.elements || [];
    if (values[0]?.type === 'Identifier' && values[1]?.type === 'Identifier') {
      historyStates.push({ state: values[0].name, setter: values[1].name });
    }
  });
  const historyState = unique(historyStates, 'O8 native history state pair');
  const historyRefs = [];
  walk(owner.body, node => {
    if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier'
      && node.init?.type === 'CallExpression' && memberProperty(node.init.callee, 'useRef')
      && node.init.arguments[0]?.type === 'Identifier' && node.init.arguments[0].name === historyState.state) {
      historyRefs.push(node.id.name);
    }
  });
  const historyRef = unique(historyRefs, 'O8 snapshot array ref');
  const stateLookupAliases = new Set();
  walk(owner.body, node => {
    if (memberProperty(node, 'state')) {
      const index = historyArrayIndex(node, historyRef);
      if (index) stateLookupAliases.add(index);
    }
  });
  const indexRefs = [];
  walk(owner.body, node => {
    if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier'
      && node.init?.type === 'CallExpression' && memberProperty(node.init.callee, 'useRef')
      && node.init.arguments[0]?.type === 'NumericLiteral' && node.init.arguments[0].value === 0
      && stateLookupAliases.has(node.id.name)) indexRefs.push(node.id.name);
  });
  const indexRef = unique(indexRefs, 'O8 current history index ref');

  const recordObjects = [];
  walk(owner.body, node => {
    if (!callProperty(node, 'push') || node.arguments[0]?.type !== 'ObjectExpression') return;
    const value = node.arguments[0];
    const state = objectProperty(value, 'state')?.value;
    if (state?.type === 'Identifier' && objectProperty(value, 'timestamp')) recordObjects.push(value);
  });
  const recordObject = unique(recordObjects, 'O8 history snapshot append record');
  const nextStates = [];
  walk(owner.body, node => {
    if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier'
      && node.init?.type === 'ObjectExpression' && objectProperty(node.init, 'nodes') && objectProperty(node.init, 'edges')) {
      const recordState = objectProperty(recordObject, 'state')?.value;
      if (recordState?.type === 'Identifier' && recordState.name === node.id.name) nextStates.push(node.id.name);
    }
  });
  const nextState = unique(nextStates, 'O8 next graph snapshot alias');
  const recordPosition = recordObject.start;
  const previousStates = [];
  walk(owner.body, node => {
    if (node.type !== 'VariableDeclarator' || node.start > recordPosition || node.id?.type !== 'Identifier'
      || !memberProperty(node.init, 'state')) return;
    const init = node.init;
    const arrayItem = init.object;
    if (arrayItem?.type !== 'MemberExpression' || !arrayItem.computed || arrayItem.object?.type !== 'Identifier'
      || arrayItem.object.name === historyRef) return;
    previousStates.push(node.id.name);
  });
  const previousState = unique(previousStates, 'O8 prior graph snapshot alias');

  const historyApplyCandidates = [];
  walk(owner.body, node => {
    if (node.type !== 'VariableDeclarator' || node.id?.type !== 'Identifier'
      || node.init?.type !== 'CallExpression' || !memberProperty(node.init.callee, 'useCallback')
      || !functionValue(node.init.arguments[0])) return;
    let hasP8 = false, hasMap = false;
    walk(node.init.arguments[0].body, child => {
      if (child.type === 'CallExpression' && child.callee?.type === 'Identifier' && child.callee.name === 'P8') hasP8 = true;
      if (child.type === 'NewExpression' && child.callee?.type === 'Identifier' && child.callee.name === 'Map') hasMap = true;
    });
    if (hasP8 && hasMap) historyApplyCandidates.push({ name: node.id.name, callback: node.init.arguments[0] });
  });
  const historyApply = unique(historyApplyCandidates, 'O8 snapshot application callback');
  if (historyApply.callback.params.length !== 1 || historyApply.callback.params[0]?.type !== 'Identifier') {
    throw new Error('History seam changed: O8 snapshot apply parameters.');
  }
  const remapVars = [];
  walk(historyApply.callback.body, node => {
    if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier'
      && node.init?.type === 'NewExpression' && node.init.callee?.type === 'Identifier' && node.init.callee.name === 'Map'
      && node.init.arguments.length === 0) {
      remapVars.push(node.id.name);
    }
  });
  const remap = unique(remapVars, 'O8 NodeID remap map');
  const remapNormalizeSites = [];
  walk(historyApply.callback.body, node => {
    if (node.type !== 'VariableDeclarator' || node.init?.type !== 'NewExpression'
      || node.init.callee?.type !== 'Identifier' || node.init.callee.name !== 'Set'
      || node.init.arguments.length !== 0) return;
    remapNormalizeSites.push(node.init);
  });
  const remapNormalizeSite = unique(remapNormalizeSites, 'O8 node-ID remap protection point');
  const defaultNodesChange = identifierValue(objectProperty(options, 'defaultOnNodesChange'), 'O8 native node apply callback');
  const defaultEdgesChange = identifierValue(objectProperty(options, 'defaultOnEdgesChange'), 'O8 native edge apply callback');
  const batchCallback = identifierValue(objectProperty(options, 'onBatchOperations'), 'O8 native batch persistence callback');
  const changeSetObjects = [];
  walk(historyApply.callback.body, node => {
    if (node.type !== 'VariableDeclarator' || node.id?.type !== 'ObjectPattern'
      || node.init?.type !== 'CallExpression' || node.init.callee?.type !== 'Identifier' || node.init.callee.name !== 'P8') return;
    const name = objectProperty(node.id, 'nodeChanges')?.value;
    if (name?.type === 'Identifier') changeSetObjects.push(name.name);
  });
  const batchNodeChanges = unique(changeSetObjects, 'O8 node history change diff');
  const historyBatchCalls = [];
  walk(historyApply.callback.body, node => {
    if (node.type === 'CallExpression' && node.callee?.type === 'Identifier' && node.callee.name === batchCallback
      && node.arguments.length === 2 && node.arguments[0]?.type === 'Identifier' && node.arguments[1]?.type === 'Identifier') {
      historyBatchCalls.push({ call: node, nodes: node.arguments[0].name });
    }
  });
  const historyBatchCall = unique(historyBatchCalls, 'O8 native history batch persistence call');

  const historyActionCallbacks = [];
  walk(owner.body, node => {
    if (node.type !== 'VariableDeclarator' || node.id?.type !== 'Identifier'
      || node.init?.type !== 'CallExpression' || !memberProperty(node.init.callee, 'useCallback')
      || !functionValue(node.init.arguments[0])) return;
    const callback = node.init.arguments[0];
    const applyCalls = [];
    walk(callback.body, child => {
      if (child.type === 'CallExpression' && child.callee?.type === 'Identifier' && child.callee.name === historyApply.name
        && child.arguments.length === 1 && child.arguments[0]?.type === 'Identifier') applyCalls.push(child);
    });
    if (applyCalls.length !== 1) return;
    const targetIndex = historyArrayIndex(callback.body, historyRef);
    if (!targetIndex) return;
    const currentIndexes = [];
    walk(callback.body, child => {
      if (child.type === 'VariableDeclarator' && child.id?.type === 'Identifier'
        && memberProperty(child.init, 'current') && child.init.object?.type === 'Identifier'
        && child.init.object.name === indexRef) currentIndexes.push(child.id.name);
    });
    if (currentIndexes.length !== 1) return;
    const arithmetic = [];
    walk(callback.body, child => {
      if (child.type === 'BinaryExpression' && ['+', '-'].includes(child.operator)
        && child.right?.type === 'NumericLiteral' && child.right.value === 1) arithmetic.push(child.operator);
    });
    if (!arithmetic.length) return;
    const phase = arithmetic.includes('+') ? 'redo' : 'undo';
    historyActionCallbacks.push({ callback, call: applyCalls[0], entryIndex: phase === 'undo' ? currentIndexes[0] : targetIndex, phase });
  });
  const undo = unique(historyActionCallbacks.filter(item => item.phase === 'undo'), 'O8 native undo callback');
  const redo = unique(historyActionCallbacks.filter(item => item.phase === 'redo'), 'O8 native redo callback');

  const suppressionResetters = [];
  const isFalse = value => value?.type === 'BooleanLiteral' && value.value === false
    || value?.type === 'UnaryExpression' && value.operator === '!' && value.argument?.type === 'NumericLiteral' && value.argument.value === 1;
  walk(owner.body, node => {
    if (node.type !== 'VariableDeclarator' || node.id?.type !== 'Identifier'
      || node.init?.type !== 'CallExpression' || !memberProperty(node.init.callee, 'useCallback')
      || !functionValue(node.init.arguments[0])) return;
    const callback = node.init.arguments[0];
    let usesTimer = false, suppressionRef;
    walk(callback.body, child => {
      if (child.type === 'CallExpression' && child.callee?.type === 'Identifier' && child.callee.name === 'setTimeout') usesTimer = true;
      if (child.type === 'AssignmentExpression' && child.left?.type === 'MemberExpression'
        && child.left.property?.name === 'current' && isFalse(child.right)
        && child.left.object?.type === 'Identifier') suppressionRef = child.left.object.name;
    });
    if (usesTimer && suppressionRef) suppressionResetters.push({ name: node.id.name, suppressionRef });
  });
  const suppressionResetter = unique(suppressionResetters, 'O8 native history suppression resetter');
  const historyDebounceRefs = [];
  walk(owner.body, node => {
    if (node.type !== 'CallExpression' || !memberProperty(node.callee, 'flush')
      || node.callee.object?.type !== 'Identifier') return;
    historyDebounceRefs.push(node.callee.object.name);
  });
  const historyDebounceRef = unique([...new Set(historyDebounceRefs)], 'O8 debounced native history S.flush owner');
  const currentNodeRefs = [];
  walk(owner.body, node => {
    if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier'
      && node.init?.type === 'CallExpression' && memberProperty(node.init.callee, 'useRef')
      && node.init.arguments[0]?.type === 'Identifier' && node.init.arguments[0].name === owner.params[0].name) {
      currentNodeRefs.push(node.id.name);
    }
  });
  const currentNodeRef = unique(currentNodeRefs, 'O8 current native nodes ref');
  const currentEdgeRefs = [];
  walk(owner.body, node => {
    if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier'
      && node.init?.type === 'CallExpression' && memberProperty(node.init.callee, 'useRef')
      && node.init.arguments[0]?.type === 'Identifier' && node.init.arguments[0].name === owner.params[1].name) currentEdgeRefs.push(node.id.name);
  });
  const currentEdgeRef = unique(currentEdgeRefs, 'O8 current native edges ref');
  const stateEffects = [];
  walk(owner.body, node => {
    if (node.type !== 'CallExpression' || !memberProperty(node.callee, 'useEffect') || !functionValue(node.arguments[0])) return;
    let writesNodes = false, writesEdges = false;
    walk(node.arguments[0].body, child => {
      if (child.type !== 'AssignmentExpression' || !memberProperty(child.left, 'current')) return;
      if (child.left.object?.name === currentNodeRef) writesNodes = true;
      if (child.left.object?.name === currentEdgeRef) writesEdges = true;
    });
    if (writesNodes && writesEdges) stateEffects.push(node.arguments[0]);
  });
  const stateEffect = unique(stateEffects, 'O8 native graph recording effect');

  const returns = [];
  walk(owner.body, node => {
    if (node.type !== 'ReturnStatement') return;
    const value = node.argument?.type === 'ObjectExpression' ? node.argument
      : node.argument?.type === 'SequenceExpression' ? node.argument.expressions.at(-1) : undefined;
    if (value?.type === 'ObjectExpression' && objectProperty(value, 'undo') && objectProperty(value, 'redo')
      && objectProperty(value, 'getCurrentState')) returns.push({ statement: node, object: value });
  });
  const returnObject = unique(returns, 'O8 native history API return');

  return { owner, options, canvasId, setNodes, historyRef, indexRef, nextState, previousState, recordObject,
    historyApply, remap, remapNormalizeSite, defaultNodesChange, defaultEdgesChange, batchCallback, batchNodeChanges, historyBatchCall, undo, redo, suppressionResetter,
    historyDebounceRef, currentNodeRef, currentEdgeRef, stateEffect, returnObject };
}

function collectPropertyCallsInBody(root, predicate) {
  const matches = [];
  walk(root, node => {
    if (node.type === 'CallExpression' && predicate(node)) matches.push(node);
  });
  return matches;
}

function findRoleGroupLoop(root) {
  const loops = [];
  walk(root, node => {
    if (node.type !== 'ForOfStatement' || node.left?.type !== 'VariableDeclaration') return;
    const item = node.left.declarations[0]?.id;
    if (item?.type !== 'Identifier') return;
    const objects = [];
    const templates = [];
    walk(node.body, child => {
      if (child.type === 'ObjectExpression' && objectProperty(child, 'role') && objectProperty(child, 'sessionId') && objectProperty(child, 'ops')) objects.push(child);
      if (child.type === 'TemplateLiteral') templates.push(child);
    });
    if (objects.length !== 1 || templates.length !== 1) return;
    const role = objectProperty(objects[0], 'role')?.value;
    const session = objectProperty(objects[0], 'sessionId')?.value;
    if (role?.type !== 'Identifier' || session?.type !== 'Identifier') return;
    const groupAliases = [];
    walk(node.body, child => {
      if (child.type === 'AssignmentExpression' && child.operator === '=' && child.left?.type === 'Identifier'
        && child.right?.type === 'ObjectExpression' && objectProperty(child.right, 'role')
        && objectProperty(child.right, 'sessionId') && objectProperty(child.right, 'ops')) groupAliases.push(child.left.name);
    });
    if (groupAliases.length !== 1) return;
    const mapAliases = [];
    walk(node.body, child => {
      if (child.type === 'CallExpression' && child.callee?.type === 'MemberExpression' && !child.callee.computed
        && child.callee.property?.name === 'set' && child.callee.object?.type === 'Identifier'
        && child.arguments[1]?.type === 'Identifier' && child.arguments[1].name === groupAliases[0]) mapAliases.push(child.callee.object.name);
    });
    if (mapAliases.length !== 1) return;
    loops.push({ loop: node, item: item.name, groupAlias: groupAliases[0], mapAlias: mapAliases[0], groupObject: objects[0], role: role.name, session: session.name, template: templates[0] });
  });
  return loops;
}

function sendPayloads(r6) {
  const matches = collectPropertyCallsInBody(r6.init.body, node => {
    const argument = node.arguments[0];
    return node.callee?.type === 'Identifier' && argument?.type === 'ObjectExpression'
      && objectProperty(argument, 'canvas_id') && objectProperty(argument, 'actions')
      && objectProperty(argument, 'created_by_role');
  });
  const sends = [];
  for (const call of matches) {
    const key = call.callee.name;
    const payload = call.arguments[0];
    const createdBy = objectProperty(payload, 'created_by_role')?.value;
    if (createdBy?.type !== 'MemberExpression' || createdBy.object?.type !== 'Identifier') continue;
    const aliases = [];
    walk(r6.init.body, node => {
      if (node.type !== 'VariableDeclarator' || node.id?.type !== 'ObjectPattern' || node.init?.type !== 'CallExpression') return;
      const send = objectProperty(node.id, 'send')?.value;
      if (send?.type !== 'Identifier' || send.name !== key) return;
      const route = node.init.arguments[0];
      if (route?.type === 'MemberExpression') aliases.push(route.property?.name);
    });
    const routeKind = unique(aliases, 'batch request kind for ' + key);
    sends.push({ call, payload, groupAlias: createdBy.object.name, routeKind });
  }
  if (sends.length !== 2 || sends.filter(item => item.routeKind === 'batchOperateNodes').length !== 1
    || sends.filter(item => item.routeKind === 'batchOperateLinks').length !== 1) {
    throw new Error('History seam changed: original node/link batch request callers were not found.');
  }
  return sends;
}

function transformRegisteredTextRetry(source, seams, nodeSend, groupLoop, edits) {
  const r6 = seams.r6;
  const queuePushes = [];
  walk(seams.nodeQueue.pushIf.consequent, node => {
    if (node.type === 'CallExpression' && node.callee?.property?.name === 'push'
      && node.arguments[0]?.name === seams.nodeQueue.queueItem) queuePushes.push(node);
  });
  const queue = source.slice(unique(queuePushes, 'node queue push').callee.object.start,
    unique(queuePushes, 'node queue push').callee.object.end);
  const canvasId = identifierValue(objectProperty(seams.r6Params, 'canvasId'), 'text retry canvas');
  const ownerBody = r6.init.body;
  edits.push({ start: ownerBody.start + 1, end: ownerBody.start + 1, text:
    'const __lcosTextPolicy=__ops=>window.__LCOS_NATIVE_TEXT_SAVE_PORT__?.queueDisposition?.(' + canvasId + ',__ops)??"ordinary";'
    + 'const __lcosTextRunnable=__ops=>__ops.some(__op=>__lcosTextPolicy([__op])!=="hold");' });

  const asyncOwners = [], tries = [], retryLoops = [], coalescers = [];
  walk(ownerBody, node => {
    const containsSend = node.start < nodeSend.call.start && node.end > nodeSend.call.end;
    if (containsSend && node.type === 'ArrowFunctionExpression' && node.async) asyncOwners.push(node);
    if (containsSend && node.type === 'TryStatement') tries.push(node);
    if (containsSend && node.type === 'ForStatement' && source.slice(node.test?.start, node.test?.end).includes('maxRetries')) retryLoops.push(node);
    if (node.type === 'CallExpression' && node.callee?.name === 's6' && node.arguments.length === 1) coalescers.push(node);
  });
  const asyncOwner = unique(asyncOwners, 'node async flush owner');
  const retry = unique(retryLoops, 'node retry loop');
  const attemptTry = unique(tries.filter(node => node.handler && !node.finalizer), 'node retry try/catch');
  const flushTry = unique(tries.filter(node => node.finalizer), 'node flush finalizer');
  const coalesce = unique(coalescers, 'original node coalescer');
  const coalesceArgument = source.slice(coalesce.arguments[0].start, coalesce.arguments[0].end);
  const originalCoalesce = source.slice(coalesce.start, coalesce.end);
  const idleFinalizers = [];
  walk(ownerBody, node => {
    if (node.type !== 'CallExpression' || node.callee?.property?.name !== 'finally'
      || node.arguments[0]?.type !== 'ArrowFunctionExpression') return;
    const body = node.arguments[0].body;
    let clearsOwner = false;
    walk(body, child => {
      if (child.type === 'AssignmentExpression' && child.right?.type === 'NullLiteral'
        && child.left?.object?.type === 'Identifier' && ['S', 'E'].includes(child.left.object.name)
        && memberProperty(child.left, 'current')) clearsOwner = true;
    });
    if (clearsOwner) idleFinalizers.push(body);
  });
  if (idleFinalizers.length !== 2) throw new Error('History seam changed: native node/total queue idle finalizers.');
  for (const body of idleFinalizers) {
    if (body.type === 'BlockStatement') edits.push({ start: body.end - 1, end: body.end - 1,
      text: ';window.__LCOS_NATIVE_TEXT_SAVE_PORT__?.queueIdle?.(' + canvasId + ');' });
    else edits.push({ start: body.start, end: body.end,
      text: '(' + source.slice(body.start, body.end) + ',window.__LCOS_NATIVE_TEXT_SAVE_PORT__?.queueIdle?.(' + canvasId + '))' });
  }
  edits.push({ start: coalesce.start, end: coalesce.end,
    text: '(window.__LCOS_NATIVE_TEXT_SAVE_PORT__?.coalesceQueue?.(' + canvasId + ',' + coalesceArgument + ',s6)??' + originalCoalesce + ')' });
  edits.push({ start: asyncOwner.body.start + 1, end: asyncOwner.body.start + 1, text: 'let __lcosTextHeld=false;' });
  const ops = nodeSend.groupAlias + '.ops';
  edits.push({ start: retry.start, end: retry.start, text:
    'await window.__LCOS_NATIVE_TEXT_SAVE_PORT__?.prepareQueuedText?.(' + canvasId + ',' + ops + ',R.current);'
    + 'if(__lcosTextPolicy(' + ops + ')==="hold"){' + queue + '.push(...' + ops + ');__lcosTextHeld=true;continue;}'
    + 'window.__LCOS_NATIVE_TEXT_SAVE_PORT__?.queueStarted?.(' + canvasId + ',' + ops + ');' });

  // Keep the original 404 handling/redirect. The registered text branch then
  // exits this group's retry loop without changing ordinary node/link policy.
  const notFound = unique(attemptTry.handler.body.body.filter(node => node.type === 'IfStatement'
    && node.test?.type === 'CallExpression' && node.test.callee?.name === 'S0'), 'native canvas-not-found catch');
  const errorName = attemptTry.handler.param.name;
  const groupError = unique(groupLoop.body.body.flatMap(node => node.type === 'VariableDeclaration' ? node.declarations : [])
    .filter(node => node.init?.type === 'NullLiteral'), 'native group failure variable').id.name;
  edits.push({ start: notFound.end, end: notFound.end, text:
    'if(window.__LCOS_NATIVE_TEXT_SAVE_PORT__?.holdQueue?.(' + canvasId + ',' + ops + ',' + errorName + '))'
    + '{' + queue + '.push(...' + ops + ');__lcosTextHeld=true;' + groupError + '=null;Z(' + errorName + ');break;}' });
  const savedLoops = [];
  walk(attemptTry.block, node => {
    if (node.type === 'ForOfStatement' && source.slice(node.right.start, node.right.end) === ops) savedLoops.push(node);
  });
  const savedLoop = unique(savedLoops, 'native successful queue fingerprint update');
  edits.push({ start: savedLoop.start, end: savedLoop.start,
    text: 'if(window.__LCOS_NATIVE_TEXT_SAVE_PORT__?.holdAfterResponse?.(' + canvasId + ',' + ops + '))'
      + '{' + queue + '.push(...' + ops + ');__lcosTextHeld=true;break;}'
      + 'window.__LCOS_NATIVE_TEXT_SAVE_PORT__?.queueSucceeded?.(' + canvasId + ',' + ops + ');' });
  const finalReturn = asyncOwner.body.body.at(-1);
  if (finalReturn?.type !== 'ReturnStatement' || finalReturn.argument?.type !== 'Identifier') throw new Error('History seam changed: node flush result.');
  const result = finalReturn.argument.name;
  edits.push({ start: finalReturn.start, end: finalReturn.start,
    text: 'if(__lcosTextHeld&&' + result + '==="saved")' + result + '="held";' });
  const reschedules = [];
  walk(flushTry.finalizer, node => {
    if (node.type === 'IfStatement' && source.slice(node.test.start, node.test.end).includes(queue + '.length>0')) reschedules.push(node);
  });
  const reschedule = unique(reschedules, 'native node retry reschedule condition');
  edits.push({ start: reschedule.test.start, end: reschedule.test.end,
    text: '(' + source.slice(reschedule.test.start, reschedule.test.end) + ')&&__lcosTextRunnable(' + queue + ')' });

  const completions = [];
  walk(ownerBody, node => {
    if (node.type === 'IfStatement' && source.slice(node.test.start, node.test.end) === 'X(),g.current.length===0&&p.current.length===0&&S.current===null&&N.current===null') completions.push(node);
  });
  const complete = unique(completions, 'native all-queue flush completion');
  edits.push({ start: complete.end, end: complete.end, text:
    ';if(g.current.length>0&&!__lcosTextRunnable(g.current)&&p.current.length===0&&S.current===null&&N.current===null)return fe("failed");' });

  // Reconcile a recovered *original* receipt without flushing later edits.
  // PC and b0 remain the original DTO/fingerprint owners. This callback only
  // removes objects whose exact attempted DTO was confirmed by the port.
  const registrations = [];
  walk(ownerBody, node => {
    if (node.type === 'VariableDeclaration' && node.declarations.some(item => item.init?.callee?.name === 'qN')) registrations.push(node);
  });
  const registration = unique(registrations, 'native queue owner registration');
  const effectOwners = [];
  walk(ownerBody, node => {
    if (node.type === 'ArrowFunctionExpression' && node.start < registration.start && node.end > registration.end) effectOwners.push(node);
  });
  const effectOwner = unique(effectOwners, 'native queue registration effect');
  const cleanup = effectOwner.body.body.find(node => node.type === 'ReturnStatement')?.argument;
  if (cleanup?.type !== 'ArrowFunctionExpression' || cleanup.body.type !== 'BlockStatement') throw new Error('History seam changed: queue cleanup.');
  edits.push({ start: registration.end, end: registration.end, text:
    'const __lcosDetachTextQueue=window.__LCOS_NATIVE_TEXT_SAVE_PORT__?.registerQueueOwner?.(e,R.current,__operationId=>{'
    + 'if(v.current||S.current||E.current)return false;'
    + 'const __port=window.__LCOS_NATIVE_TEXT_SAVE_PORT__;'
    + 'const __accepted=g.current.filter(__op=>__port?.canAcknowledgeQueueItem?.(e,__op,PC(__op),__operationId));'
    + 'if(!__accepted.length)return false;'
    + 'g.current=g.current.filter(__op=>!__accepted.includes(__op));'
    + 'for(const __op of __accepted)x.current.set(`${e}:${__op.id}`,b0(__op));'
    + '$();U();if(!V()&&B())$N(e,R.current);return true;},'
    + '{readPending:()=>g.current,resume:()=>A.current?.()??Promise.resolve("failed"),isBusy:()=>!!(v.current||S.current||E.current)});' });
  edits.push({ start: cleanup.body.start + 1, end: cleanup.body.start + 1, text: '__lcosDetachTextQueue?.();' });
}

function transformR6(source, seams, edits) {
  const getNodeName = '__lcosHistoryGetNode';
  appendObjectProperty(source, seams.r6Params, 'getNode:' + getNodeName, edits);
  appendObjectProperty(source, seams.r6CallProps,
    'getNode:__lcosHistoryId=>__lcosBackfillNodeReceipt?.readCollectionHistoryNode?.('
      + seams.canvasId + ',__lcosHistoryId)??' + seams.nodeApiGetter + '().find(__lcosHistoryNode=>__lcosHistoryNode.id===__lcosHistoryId)', edits);

  edits.push({ start: seams.nodeCallback.body.start + 1, end: seams.nodeCallback.body.start + 1,
    text: 'window.__LCOS_NATIVE_INTENT__.tagChanges(' + seams.nodeCallback.params[0].name + ',' + getNodeName + ',e);' });

  function metadataCopy(queue, rememberNode) {
    const item = queue.queueItem;
    const changeName = queue.change;
    const insertion = queue.pushIf.consequent.start + 1;
    const lines = 'const __lcosChangeMeta=window.__LCOS_NATIVE_INTENT__.metadata(' + changeName + ');'
      + 'if(__lcosChangeMeta){if(__lcosChangeMeta.lcos_operation)' + item + '.lcos_operation=__lcosChangeMeta.lcos_operation;'
      + 'if(__lcosChangeMeta.lcos_ref)' + item + '.lcos_ref=__lcosChangeMeta.lcos_ref;'
      + 'if(__lcosChangeMeta.lcos_snapshot)' + item + '.lcos_snapshot=__lcosChangeMeta.lcos_snapshot;'
      + 'if(__lcosChangeMeta.unsupported)' + item + '.lcos_intent_unsupported=__lcosChangeMeta.reason||"HISTORY_OPERATION_ASSOCIATION_MISSING";}'
      + (rememberNode ? 'if(' + item + '.lcos_operation)window.__LCOS_NATIVE_INTENT__.rememberNodeRef(e,' + item + '.id,' + item + '.lcos_ref,' + item + '.lcos_operation);' : '');
    edits.push({ start: insertion, end: insertion, text: lines
      + (rememberNode ? 'window.__LCOS_NATIVE_TEXT_SAVE_PORT__?.captureQueuedAutosave?.(e,' + item + ');' : '') });
  }
  metadataCopy(seams.nodeQueue, true);

  const sends = sendPayloads(seams.r6);
  const nodeSend = unique(sends.filter(item => item.routeKind === 'batchOperateNodes'), 'node request');
  const r6CanvasId = identifierValue(objectProperty(seams.r6Params, 'canvasId'), 'r6 canvasId');
  // This ref points at the original in-flight group; it is not another queue.
  // A committed upload can replace its temporary carrier ID before the next
  // original measurement group is serialized, including already queued links.
  edits.push({ start: seams.r6.init.body.start + 1, end: seams.r6.init.body.start + 1, text:
    'const __lcosCreateReceiptGroup=l.useRef(null);'
      + 'const __lcosWithCreateReceiptGroup=async(__ops,__send)=>{const __before=__lcosCreateReceiptGroup.current;'
      + '__lcosCreateReceiptGroup.current=__ops;try{return await __send()}finally{'
      + 'if(__lcosCreateReceiptGroup.current===__ops)__lcosCreateReceiptGroup.current=__before}};' });
  edits.push({ start: nodeSend.call.start, end: nodeSend.call.start,
    text: '__lcosWithCreateReceiptGroup(' + nodeSend.groupAlias + '.ops,async()=>'});
  edits.push({ start: nodeSend.call.end, end: nodeSend.call.end, text: ')' });
  const queueReturns = [];
  walk(seams.r6.init.body, node => {
    if (node.type === 'ReturnStatement' && node.argument?.type === 'SequenceExpression') {
      const object = node.argument.expressions.at(-1);
      if (object?.type === 'ObjectExpression' && objectProperty(object, 'executeBatchOperations')) queueReturns.push({ statement: node, object });
    }
  });
  const queueReturn = unique(queueReturns, 'original r6 public queue return');
  const executeBatch = identifierValue(objectProperty(queueReturn.object, 'executeBatchOperations'), 'original batch executor');
  edits.push({ start: queueReturn.statement.start, end: queueReturn.statement.start, text:
    executeBatch + '.prepareNodeIdentityRemap=__input=>window.__LCOS_NATIVE_INTENT__.prepareCreateReceiptQueue({'
      + '...__input,ownerCanvasId:' + r6CanvasId + ',nodeQueue:g.current,edgeQueue:p.current,'
      + 'activeGroup:__lcosCreateReceiptGroup.current,fingerprints:x.current,stopped:I.current});' });
  appendObjectProperty(source, nodeSend.payload,
    '...(' + nodeSend.groupAlias + '.lcos_operation?{lcos_operation:' + nodeSend.groupAlias + '.lcos_operation}:{}),', edits);
  appendObjectProperty(source, nodeSend.payload,
    '...(await window.__LCOS_NATIVE_INTENT__.collectionSpaceVersion(' + r6CanvasId + ',' + nodeSend.groupAlias + '.lcos_operation)),', edits);
  appendObjectProperty(source, nodeSend.payload,
    '...(' + nodeSend.groupAlias + '.lcos_operation?{lcos_refs:Object.fromEntries(' + nodeSend.groupAlias + '.ops.filter(__lcosOp=>__lcosOp.lcos_ref).map(__lcosOp=>[__lcosOp.id,__lcosOp.lcos_ref]))}:{}),', edits);
  appendObjectProperty(source, nodeSend.payload,
    '...(' + nodeSend.groupAlias + '.lcos_operation?{lcos_snapshots:Object.fromEntries(' + nodeSend.groupAlias + '.ops.filter(__lcosOp=>__lcosOp.lcos_snapshot).map(__lcosOp=>[__lcosOp.id,__lcosOp.lcos_snapshot]))}:{}),', edits);

  let nodeCreateObjects = [];
  walk(seams.r6.init.body, node => {
    if (node.type !== 'ObjectExpression') return;
    const keys = new Set(node.properties.map(propertyName));
    if (keys.has('canvas_id') && keys.has('data') && keys.has('position') && keys.has('measured') && keys.has('type')) nodeCreateObjects.push(node);
  });
  const nodeDto = unique(nodeCreateObjects, 'native node create DTO');
  const idValue = objectProperty(nodeDto, 'id')?.value;
  if (idValue?.type !== 'MemberExpression' || idValue.object?.type !== 'Identifier') throw new Error('History seam changed: create DTO node ID alias.');
  appendObjectProperty(source, nodeDto,
    '...(' + idValue.object.name + '.lcos_ref?{lcos_ref:' + idValue.object.name + '.lcos_ref}:{})', edits);

  const flushLoops = findRoleGroupLoop(seams.r6.init.body);
  if (flushLoops.length !== 2) throw new Error('History seam changed: expected native node and edge request groups.');
  const sendLoops = [];
  walk(seams.r6.init.body, node => {
    if (node.type !== 'ForStatement' && node.type !== 'ForOfStatement') return;
    if (!(node.start < nodeSend.call.start && node.end > nodeSend.call.end)) return;
    const groupArrayAliases = [];
    walk(node.body, child => {
      if (child.type !== 'VariableDeclarator' || child.id?.type !== 'Identifier' || child.id.name !== nodeSend.groupAlias) return;
      if (child.init?.type === 'MemberExpression' && child.init.computed && child.init.object?.type === 'Identifier') {
        groupArrayAliases.push(child.init.object.name);
      }
    });
    if (groupArrayAliases.length !== 1) return;
    const mapAliases = [];
    walk(seams.r6.init.body, child => {
      if (child.type !== 'VariableDeclarator' || child.id?.type !== 'Identifier' || child.id.name !== groupArrayAliases[0]
        || child.init?.type !== 'CallExpression' || child.init.callee?.type !== 'MemberExpression'
        || child.init.callee.object?.name !== 'Array' || child.init.callee.property?.name !== 'from') return;
      const valuesCall = child.init.arguments[0];
      if (valuesCall?.type === 'CallExpression' && valuesCall.callee?.type === 'MemberExpression'
        && valuesCall.callee.property?.name === 'values' && valuesCall.callee.object?.type === 'Identifier') {
        mapAliases.push(valuesCall.callee.object.name);
      }
    });
    if (mapAliases.length === 1) sendLoops.push({ node, mapAlias: mapAliases[0] });
  });
  const sendLoop = unique(sendLoops, 'node send flush loop');
  const nodeGroup = unique(flushLoops.filter(group => group.mapAlias === sendLoop.mapAlias), 'node request grouping loop');
  if (nodeGroup.loop.right?.type !== 'Identifier') throw new Error('History seam changed: node request queue alias.');
  const rhs = nodeGroup.loop.right.name;
  edits.push({ start: nodeGroup.loop.start, end: nodeGroup.loop.start,
    text: 'await window.__LCOS_NATIVE_TEXT_SAVE_PORT__?.prepareQueuedText?.(' + r6CanvasId + ',' + rhs + ',R.current);' });
  const bucketName = '__lcosNativeBucket';
  edits.push({ start: nodeGroup.loop.right.start, end: nodeGroup.loop.right.end,
    text: 'window.__LCOS_NATIVE_INTENT__.partitionOperations(' + rhs + ').flatMap(' + bucketName + '=>' + bucketName + '.items)' });
  const keyText = '`' + '${' + nodeGroup.role + '}:' + '${' + nodeGroup.session + '??""}:'
    + '${window.__LCOS_NATIVE_INTENT__.operationKey(' + nodeGroup.item + ')}:'
    + '${window.__LCOS_NATIVE_TEXT_SAVE_PORT__?.queueKey?.(' + r6CanvasId + ',' + nodeGroup.item + ')??""}' + '`';
  edits.push({ start: nodeGroup.template.start, end: nodeGroup.template.end, text: keyText });
  appendObjectProperty(source, nodeGroup.groupObject,
    '...(' + nodeGroup.item + '.lcos_operation?{lcos_operation:' + nodeGroup.item + '.lcos_operation}:{}),', edits);
  transformRegisteredTextRetry(source, seams, nodeSend, sendLoop.node, edits);
}

function transformHistoryOwner(source, seams, owner, edits) {
  const { program } = seams;
  const nextStateInitializers = [];
  walk(owner.owner.body, node => {
    if (node.type === 'VariableDeclarator' && node.id?.name === owner.nextState
      && node.init?.type === 'ObjectExpression' && objectProperty(node.init, 'nodes')
      && objectProperty(node.init, 'edges')) nextStateInitializers.push(node.init);
  });
  const nextStateInitializer = unique(nextStateInitializers, 'O8 next snapshot receipt projection');
  edits.push({ start: nextStateInitializer.start, end: nextStateInitializer.start,
    text: 'window.__LCOS_NATIVE_INTENT__.normalizeTextReceiptHistoryState(' + owner.canvasId + ',' });
  edits.push({ start: nextStateInitializer.end, end: nextStateInitializer.end, text: ')' });
  const textReceiptState = '__lcosTextReceiptState';
  edits.push({ start: owner.owner.body.start + 1, end: owner.owner.body.start + 1,
    text: 'const ' + textReceiptState + '=l.useRef(null);' });
  const nativeNodes = owner.owner.params[0].name;
  const nativeEdges = owner.owner.params[1].name;
  edits.push({ start: owner.stateEffect.body.start + 1, end: owner.stateEffect.body.start + 1,
    text: 'const __lcosTextReceipt=' + textReceiptState + '.current;' + textReceiptState + '.current=null;'
      + 'const __lcosTextMetadataOnly=!!__lcosTextReceipt&&R8({nodes:' + nativeNodes + ',edges:' + nativeEdges + '},__lcosTextReceipt);' });
  const recordingConditions = [];
  walk(owner.stateEffect.body, node => {
    if (node.type === 'IfStatement' && node.test?.type === 'UnaryExpression' && node.test.operator === '!'
      && memberProperty(node.test.argument, 'current') && node.test.argument.object?.name === owner.suppressionResetter.suppressionRef) recordingConditions.push(node.test);
  });
  const recordingCondition = unique(recordingConditions, 'O8 native graph recording suppression condition');
  edits.push({ start: recordingCondition.start, end: recordingCondition.end,
    text: '(' + source.slice(recordingCondition.start, recordingCondition.end) + ')&&!__lcosTextMetadataOnly' });
  edits.push({ start: owner.remapNormalizeSite.start, end: owner.remapNormalizeSite.start,
    text: '(window.__LCOS_NATIVE_INTENT__.normalizeCollectionSpaceRedoRemaps(' + owner.remap
      + ',__lcosHistoryEntry,__lcosHistoryPhase,' + owner.canvasId + ',' + owner.currentNodeRef + '.current,'
      + owner.historyApply.callback.params[0].name + '.nodes),' });
  edits.push({ start: owner.remapNormalizeSite.end, end: owner.remapNormalizeSite.end, text: ')' });
  const b8 = unique(program.body.filter(node => node.type === 'FunctionDeclaration' && node.id?.name === 'B8'), 'B8 history hook');
  const o8Calls = [];
  walk(b8.body, node => {
    if (node.type === 'CallExpression' && node.callee?.type === 'Identifier' && node.callee.name === 'O8'
      && node.arguments[2]?.type === 'ObjectExpression') o8Calls.push(node.arguments[2]);
  });
  const o8Options = unique(o8Calls, 'B8 original O8 options');
  const b8CanvasId = identifierValue(objectProperty(b8.params[0], 'canvasId'), 'B8 canvasId');
  const b8SetNodes = identifierValue(objectProperty(b8.params[0], 'setNodes'), 'B8 original setNodes');
  const b8SetEdges = identifierValue(objectProperty(b8.params[0], 'setEdges'), 'B8 original setEdges');
  appendObjectProperty(source, o8Options, 'canvasId:' + b8CanvasId, edits);
  appendObjectProperty(source, o8Options, 'setNodes:' + b8SetNodes, edits);
  appendObjectProperty(source, o8Options, 'setEdges:' + b8SetEdges, edits);
  appendObjectProperty(source, owner.options, 'canvasId:' + owner.canvasId, edits);
  appendObjectProperty(source, owner.options, 'setNodes:' + owner.setNodes, edits);
  appendObjectProperty(source, owner.options, 'setEdges:__lcosHistorySetEdges', edits);
  appendObjectProperty(source, owner.recordObject,
    '...window.__LCOS_NATIVE_INTENT__.recordHistoryTransition(' + owner.canvasId + ',' + owner.previousState + ',' + owner.nextState + '),', edits);

  const appliedArgs = owner.historyApply.callback.params[0];
  edits.push({ start: appliedArgs.start, end: appliedArgs.end,
    text: '(' + source.slice(appliedArgs.start, appliedArgs.end) + ',__lcosHistoryEntry,__lcosHistoryPhase)' });
  for (const [callbackName, label] of [[owner.defaultNodesChange, 'O8 original node apply callback'],
    [owner.defaultEdgesChange, 'O8 original edge apply callback']]) {
    const calls = [];
    walk(owner.historyApply.callback.body, node => {
      if (node.type === 'CallExpression' && node.callee?.type === 'Identifier' && node.callee.name === callbackName) calls.push(node);
    });
    const call = unique(calls, label);
    const original = source.slice(call.start, call.end);
    edits.push({ start: call.start, end: call.end,
      text: 'window.__LCOS_NATIVE_INTENT__.withHistoryEntry(' + owner.canvasId + ',__lcosHistoryPhase,__lcosHistoryEntry,'
        + owner.remap + ',()=>' + original + ')' });
  }
  const batchPersistCall = owner.historyBatchCall.call;
  const batchPersistCallSource = source.slice(batchPersistCall.start, batchPersistCall.end);
  edits.push({ start: batchPersistCall.start, end: batchPersistCall.end,
    text: '(window.__LCOS_NATIVE_INTENT__.tagHistoryBatchOperations(' + owner.canvasId + ',__lcosHistoryPhase,__lcosHistoryEntry,'
      + owner.remap + ',' + owner.batchNodeChanges + ',' + owner.historyBatchCall.nodes + '),' + batchPersistCallSource + ')' });

  for (const item of [owner.undo, owner.redo]) {
    const call = item.call;
    const index = owner.historyRef + '.current[' + item.entryIndex + ']';
    const phase = JSON.stringify(item.phase);
    edits.push({ start: call.end - 1, end: call.end - 1, text: ',' + index + ',' + phase });
  }

  const inspectorName = '__lcosInspectNativeHistory';
  const inspectorMethod = 'const ' + inspectorName + '=l.useCallback(__lcosQuery=>window.__LCOS_NATIVE_INTENT__.inspectNativeHistory({canvasId:'
    + owner.canvasId + ',requestedCanvasId:__lcosQuery?.canvasId,nodeId:__lcosQuery?.nodeId,history:' + owner.historyRef
    + '.current,currentIndex:' + owner.indexRef + '.current}),[' + owner.canvasId + ']);';
  const backfillName = '__lcosBackfillNodeReceipt';
  const receiptMethod = 'const ' + backfillName + '=l.useCallback(__lcosReceipt=>window.__LCOS_NATIVE_INTENT__.backfillHistoryReceipt({...__lcosReceipt,canvasId:'
    + owner.canvasId + ',history:' + owner.historyRef + '.current,currentNodesRef:' + owner.currentNodeRef + ',setNodes:' + owner.setNodes
    + ',currentEdgesRef:' + owner.currentEdgeRef + ',setEdges:__lcosHistorySetEdges,prepareIdentityQueue:' + owner.batchCallback + '?.prepareNodeIdentityRemap'
    + ',setIdentityReceiptGraph:__graph=>{const __previous=' + textReceiptState + '.current;'
    + textReceiptState + '.current=__graph;try{' + owner.setNodes + '(__graph.nodes);'
    + '__lcosHistorySetEdges?.(__graph.edges)'
    + '}catch(__error){' + textReceiptState + '.current=__previous;throw __error}}'
    + ',setTextReceiptNodes:__nodes=>{const __previous=' + textReceiptState + '.current;'
    + textReceiptState + '.current={nodes:__nodes,edges:' + owner.currentEdgeRef + '.current};'
    + 'try{' + owner.setNodes + '(__nodes)}catch(__error){' + textReceiptState + '.current=__previous;throw __error}}'
    + ',isHistoryApplying:()=>'+ owner.suppressionResetter.suppressionRef + '.current'
    + ',suppress:()=>{' + owner.suppressionResetter.suppressionRef + '.current=!0;' + owner.suppressionResetter.name + '()},flushHistory:()=>'
    + owner.historyDebounceRef + '.flush(),getHistory:()=>'+ owner.historyRef + '.current}),['
    + owner.setNodes + ',__lcosHistorySetEdges,' + owner.batchCallback + ',' + owner.suppressionResetter.name + ',' + owner.historyDebounceRef + ']);';
  const prepareName = '__lcosPrepareCollectionGeometryHistory';
  const prepareMethod = 'const ' + prepareName + '=l.useCallback(()=>{try{' + owner.historyDebounceRef
    + '.flush();return{ok:true}}catch{return{ok:false,reason:"HISTORY_DEBOUNCE_FLUSH_FAILED"}}},['
    + owner.historyDebounceRef + ']);';
  const queueArrangeName = '__lcosQueueCollectionArrangeIntent';
  const queueArrangeMethod = 'const ' + queueArrangeName + '=l.useCallback(__lcosInput=>window.__LCOS_NATIVE_INTENT__.queueCollectionArrangeIntent({...__lcosInput,canvasId:'
    + owner.canvasId + '}),[' + owner.canvasId + ']);';
  const cancelArrangeName = '__lcosCancelCollectionArrangeIntent';
  const cancelArrangeMethod = 'const ' + cancelArrangeName + '=l.useCallback(__lcosOperationId=>window.__LCOS_NATIVE_INTENT__.cancelCollectionArrangeIntent(__lcosOperationId),['
    + owner.canvasId + ']);';
  edits.push({ start: owner.returnObject.statement.start, end: owner.returnObject.statement.start,
    text: inspectorMethod + receiptMethod + prepareMethod + queueArrangeMethod + cancelArrangeMethod
      + backfillName + '.prepareCollectionGeometryHistory=' + prepareName + ';'
      // Core Collection Piles are widened/repositioned by the donor's display
      // projection. Persistence must inspect the existing O8 raw node ref,
      // never that fan/gallery presentation. Ordinary nodes keep their getter.
      + backfillName + '.readCollectionHistoryNode=(__lcosCanvasId,__lcosNodeId)=>{if(__lcosCanvasId!==' + owner.canvasId
      + ')return;const __lcosNode=' + owner.currentNodeRef + '.current.find(n=>n.id===__lcosNodeId);return '
      + '(__lcosNode?.type==="pile"&&__lcosNode.data?.lcos_native_collection===true'
      + '||__lcosNode?.type==="group"&&__lcosNode.data?.lcosCollectionId)?__lcosNode:void 0};'
      + backfillName + '.queueCollectionArrangeIntent=' + queueArrangeName + ';'
      + backfillName + '.cancelCollectionArrangeIntent=' + cancelArrangeName + ';' });
  appendObjectProperty(source, owner.returnObject.object, 'backfillNodeReceipt:' + backfillName, edits);
  appendObjectProperty(source, owner.returnObject.object, 'inspectNativeHistory:' + inspectorName, edits);

  const b8Returns = [];
  walk(b8.body, node => {
    if (node.type !== 'ReturnStatement' || node.argument?.type !== 'ObjectExpression'
      || !objectProperty(node.argument, 'onNodesChange') || !objectProperty(node.argument, 'undo')) return;
    const undoValue = objectProperty(node.argument, 'undo').value;
    if (undoValue?.type === 'MemberExpression' && undoValue.object?.type === 'Identifier') {
      b8Returns.push({ statement: node, object: node.argument, historyAlias: undoValue.object.name });
    }
  });
  const b8Return = unique(b8Returns, 'B8 native history callback return');
  appendObjectProperty(source, b8Return.object, 'backfillNodeReceipt:' + b8Return.historyAlias + '.backfillNodeReceipt', edits);
  appendObjectProperty(source, b8Return.object, 'inspectNativeHistory:' + b8Return.historyAlias + '.inspectNativeHistory', edits);
  appendObjectProperty(source, seams.history.id, 'backfillNodeReceipt:__lcosBackfillNodeReceipt', edits);
  appendObjectProperty(source, seams.history.id, 'inspectNativeHistory:__lcosInspectNativeHistory', edits);
  appendObjectProperty(source, seams.bridge.arguments[1], 'backfillNodeReceipt:__lcosBackfillNodeReceipt', edits);
  appendObjectProperty(source, seams.bridge.arguments[1], 'inspectNativeHistory:__lcosInspectNativeHistory', edits);
}

export function transformHistoryIntentScript(filename, source) {
  if (typeof filename !== 'string' || typeof source !== 'string') throw new TypeError('History transform expects a filename and source text.');
  if (filename.split(/[\\/]/).pop() !== TARGET) return source;
  if (source.includes(MARKER)) return source;

  const seams = findHistorySeams(parse(source, filename));
  const owner = findHistoryOwnerSeams(seams.program);
  const edits = [];
  const undoWrapper = '__lcosNativeUndo';
  const redoWrapper = '__lcosNativeRedo';
  edits.push({ start: seams.historyDeclaration.end, end: seams.historyDeclaration.end,
    text: 'const ' + undoWrapper + '=window.__LCOS_NATIVE_INTENT__.wrapHistory("undo",' + seams.undo + ', ' + seams.canvasId + ');'
      + 'const ' + redoWrapper + '=window.__LCOS_NATIVE_INTENT__.wrapHistory("redo",' + seams.redo + ', ' + seams.canvasId + ');' });

  for (const call of seams.historyCalls) {
    const undoKey = call.kind === 'keyboard' ? 'onUndo' : 'undo';
    const redoKey = call.kind === 'keyboard' ? 'onRedo' : 'redo';
    edits.push({ start: objectProperty(call.object, undoKey).value.start, end: objectProperty(call.object, undoKey).value.end, text: undoWrapper });
    edits.push({ start: objectProperty(call.object, redoKey).value.start, end: objectProperty(call.object, redoKey).value.end, text: redoWrapper });
  }
  const bridgeProps = seams.bridge.arguments[1];
  for (const [key, wrapper] of [['undo', undoWrapper], ['redo', redoWrapper]]) {
    const property = objectProperty(bridgeProps, key);
    if (!property || property.value.type !== 'Identifier') throw new Error('History seam changed: bridge ' + key + ' prop.');
    edits.push({ start: property.value.start, end: property.value.end, text: wrapper });
  }
  transformHistoryOwner(source, seams, owner, edits);
  const pasteCallback = identifierValue(seams.paste, 'paste callback');
  appendObjectProperty(source, seams.hookCanvasDestructure, 'lcosCanvasId:__lcosCanvasId', edits);
  for (const site of seams.pasteCallSites) {
    appendObjectProperty(source, site.call.arguments[0], 'lcosCanvasId:' + site.canvasId, edits);
  }
  const wrapperPrefix = source[seams.pasteHandlerStatement.end - 1] === ';' ? '' : ';';
  edits.push({ start: seams.pasteHandlerStatement.end, end: seams.pasteHandlerStatement.end,
    text: wrapperPrefix + 'const ' + seams.pasteWrapperName + '=l.useMemo(()=>window.__LCOS_NATIVE_INTENT__.wrapPaste('
      + pasteCallback + ',__lcosCanvasId),[' + pasteCallback + ',__lcosCanvasId]);' });
  for (const reference of seams.pasteReferences) {
    edits.push({ start: reference.start, end: reference.end, text: seams.pasteWrapperName });
  }
  const duplicateWrapperName = '__lcosNativeDuplicate';
  edits.push({ start: seams.duplicateHookStatement.end, end: seams.duplicateHookStatement.end,
    text: ';const ' + duplicateWrapperName + '=window.__LCOS_NATIVE_INTENT__.wrapPaste(' + seams.duplicateHook.id.name + ',' + seams.nodeMenuCanvasId + ');' });
  edits.push({ start: seams.duplicateOnClick.value.start, end: seams.duplicateOnClick.value.end, text: duplicateWrapperName });
  const afterStatement = (statement, text) => {
    const prefix = source[statement.end - 1] === ';' ? '' : ';';
    edits.push({ start: statement.end, end: statement.end, text: prefix + text + ';' });
  };
  afterStatement(seams.pasteNodesStatement, 'window.__LCOS_NATIVE_INTENT__.tagCreatedNodes(' + seams.pasteNodes.nodesName + ')');
  afterStatement(seams.duplicateStatement, 'window.__LCOS_NATIVE_INTENT__.tagCreatedNode(' + seams.duplicateClone.nodeName + ')');

  transformR6(source, seams, edits);
  const transformed = editsApply(source, edits);
  const output = MARKER + '\n' + transformed;
  try { parse(output, filename); }
  catch (error) {
    const offset = Number.isInteger(error?.pos) ? error.pos : 0;
    throw new Error((error instanceof Error ? error.message : String(error)) + '\nNear: ' + output.slice(Math.max(0, offset - 180), offset + 220));
  }
  const checks = ['wrapHistory("undo"', 'wrapHistory("redo"', 'wrapPaste(', 'tagChanges(',
    'partitionOperations(', 'recordHistoryTransition(', 'withHistoryEntry(', 'backfillHistoryReceipt(',
    'backfillNodeReceipt:', 'inspectNativeHistory:', 'inspectNativeHistory({canvasId:',
    '.prepareCollectionGeometryHistory=__lcosPrepareCollectionGeometryHistory',
    'lcos_operation', 'lcos_refs', 'lcos_snapshots', 'lcos_ref'];
  for (const check of checks) if (!output.includes(check)) throw new Error('History transform postcondition failed: ' + check);
  return output;
}
