import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { currentGen2Root, resolveCurrentGen2Resource } from './current-gen2-resources.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(currentGen2Root, 'package.json'));
const ts = require('typescript');
export const nativeLibraryDropRouterSource = 'lcos/huabu/apps/web/src/lcos/drop/dropCommitRouter.ts';
export const nativeLibraryDropStateSource = 'lcos/huabu/apps/web/src/lcos/lcosDropState.ts';
export const nativeLibraryDropOverlaySource = 'lcos/huabu/apps/web/src/lcos/LcosHostOverlay.tsx';
const ownerMarker = '/* Native Library exact-material owner inside original transaction */';
const stateMarker = '/* Native Library exact-material receipt; ordinary Assembly merge stays below. */';
const recoveryMarker = '/* Native Library exact-material readonly recovery */';
const feedbackMarker = '/* Native Library original-toast feedback; all other receipt callers remain original. */';
const receiptModule = path.join(root, 'lab/pilot/native-library-drop');
const key = value => path.resolve(value).replaceAll('\\', '/').toLowerCase();

function sourceContext(source, sourcePath, resourcePath, selected) {
  const copied = path.join(root, resourcePath);
  if (typeof sourcePath !== 'string' || key(sourcePath) !== key(copied))
    throw new Error('Native Library Drop transform requires its exact original copied module identity.');
  if (selected) {
    const resource = resolveCurrentGen2Resource(copied);
    if (!resource || key(resource.sourcePath) !== key(path.join(currentGen2Root, resourcePath.slice(5))))
      throw new Error('Native Library Drop Router must use its actual selected current source.');
  } else if (resolveCurrentGen2Resource(copied)) {
    throw new Error('Native Library Drop store source selection changed; review its actual owner first.');
  }
  if (typeof source !== 'string') throw new TypeError('Native Library Drop source must be text.');
  const ast = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  if (ast.parseDiagnostics.length) throw new Error('Native Library Drop original TypeScript could not be parsed.');
  return { ast, eol: source.includes('\r\n') ? '\r\n' : '\n' };
}
function find(root, predicate) { const result = []; const walk = node => { if (predicate(node)) result.push(node); ts.forEachChild(node, walk); }; walk(root); return result; }
function one(nodes, label) { if (nodes.length !== 1) throw new Error(`Native Library Drop ${label} seam changed (${nodes.length}).`); return nodes[0]; }
const named = (node, name) => node.name?.text === name;
const assemblyOnly = expression => ts.isBinaryExpression(expression)
  && expression.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken
  && ts.isPropertyAccessExpression(expression.left) && expression.left.expression.getText() === 'intent'
  && expression.left.name.text === 'kind' && ts.isStringLiteral(expression.right) && expression.right.text === 'assembly-apply';
function insert(source, edits) { let result = source; for (const edit of edits.sort((a,b) => b.at-a.at)) result = result.slice(0,edit.at)+edit.text+result.slice(edit.at); return result; }

export function transformNativeLibraryDropRouter(source, { sourcePath } = {}) {
  const { ast, eol } = sourceContext(source, sourcePath, nativeLibraryDropRouterSource, true);
  const owners = one(find(ast, n => ts.isInterfaceDeclaration(n) && named(n, 'DropCommitOwners')), 'owners');
  const router = one(find(ast, n => ts.isClassDeclaration(n) && named(n, 'DropCommitRouter')), 'Router');
  const execute = one(router.members.filter(n => ts.isMethodDeclaration(n) && named(n, 'execute')), 'execute');
  const branch = one(find(execute, n => ts.isIfStatement(n) && assemblyOnly(n.expression)
    && find(n.thenStatement, item => ts.isCallExpression(item) && item.expression.getText() === 'owners.applyAssembly').length === 1), 'ordinary Assembly branch');
  if (!ts.isBlock(branch.thenStatement)) throw new Error('Native Library Drop Assembly branch is no longer a block.');
  const originalApply = one(branch.thenStatement.statements.filter(n => ts.isVariableStatement(n)
    && n.declarationList.declarations.some(d => d.name.getText() === 'canonicalReceipt'
      && d.initializer?.getText() === 'await owners.applyAssembly(intent, signal)')), 'original Assembly owner');
  const preparation = one(find(execute, n => ts.isIfStatement(n) && ts.isBinaryExpression(n.expression)
    && n.expression.left.getText() === 'intent.kind' && ts.isStringLiteral(n.expression.right)
    && n.expression.right.text === 'prepare-material'), 'preparation branch');
  const declared = owners.members.filter(n => named(n, 'handleNativeLibraryMaterial'));
  const calls = find(execute, n => ts.isCallExpression(n) && n.expression.getText() === 'owners.handleNativeLibraryMaterial');
  if (source.includes(ownerMarker)) {
    if (declared.length !== 1 || calls.length !== 1 || source.split(ownerMarker).length !== 2)
      throw new Error('Native Library Drop owner is only partially installed.');
    return source;
  }
  if (declared.length || calls.length) throw new Error('Native Library Drop owner is only partially installed.');
  const members = `${eol}  /** Undefined is only for non-Library sources. Captured Library sources must return a receipt or throw. */${eol}  readonly handleNativeLibraryMaterial?: (intent: DropAssemblyApplyIntent, transactionId: string, signal?: AbortSignal) => Promise<DropCommitReceipt | undefined>;`;
  const delegation = `${ownerMarker}${eol}      if (intent.kind === 'assembly-apply') {${eol}`
    + `        const nativeLibraryReceipt = await owners.handleNativeLibraryMaterial?.(intent, transactionId, signal);${eol}`
    + `        if (nativeLibraryReceipt !== undefined) return nativeLibraryReceipt;${eol}      }${eol}      `;
  const result = insert(source, [
    { at: owners.members.pos, text: members },
    { at: preparation.getStart(ast), text: delegation },
  ]);
  sourceContext(result, sourcePath, nativeLibraryDropRouterSource, true);
  return result;
}

export function transformNativeLibraryDropState(source, { sourcePath } = {}) {
  const { ast, eol } = sourceContext(source, sourcePath, nativeLibraryDropStateSource, false);
  const settle = one(find(ast, n => ts.isPropertyAssignment(n) && named(n, 'settle')), 'settle');
  const receipt = one(find(settle.initializer, n => ts.isVariableDeclaration(n) && named(n, 'receipt')), 'settle receipt');
  if (!receipt.initializer || !ts.isConditionalExpression(receipt.initializer)
    || receipt.initializer.whenTrue.getText() !== 'mergeAssemblyDropAttempt(originalIntent.intent, resolution.intent, incoming, feedback?.receipt)')
    throw new Error('Native Library Drop original Assembly merge changed.');
  const markerCalls = find(settle.initializer, n => ts.isCallExpression(n) && n.expression.getText() === 'isNativeLibraryPlacementReceipt');
  const storeInterface = one(find(ast, n => ts.isInterfaceDeclaration(n) && named(n, 'LcosDropState')), 'store interface');
  const railwayDeclaration = one(storeInterface.members.filter(n => named(n, 'confirmRailwayReceipt')), 'railway declaration');
  const railwayImplementation = one(find(ast, n => ts.isPropertyAssignment(n) && named(n, 'confirmRailwayReceipt')), 'railway implementation');
  const recoveryDeclarations = storeInterface.members.filter(n => named(n, 'confirmNativeLibraryPlacementReceipt'));
  const recoveryImplementations = find(ast, n => ts.isPropertyAssignment(n) && named(n, 'confirmNativeLibraryPlacementReceipt'));
  const relative = path.relative(path.dirname(sourcePath), receiptModule).replaceAll('\\', '/');
  const ownImport = `import { isNativeLibraryPlacementReceipt } from '${relative.startsWith('.') ? relative : './'+relative}';${eol}${stateMarker}${eol}`;
  if (source.includes(stateMarker)) {
    if (source.split(ownImport).length !== 2 || markerCalls.length !== 1 || source.split(recoveryMarker).length !== 2
      || recoveryDeclarations.length !== 1 || recoveryImplementations.length !== 1) throw new Error('Native Library Drop receipt is only partially installed.');
    return source;
  }
  if (markerCalls.length || source.includes('isNativeLibraryPlacementReceipt') || recoveryDeclarations.length || recoveryImplementations.length)
    throw new Error('Native Library Drop receipt is only partially installed.');
  const declaration = `confirmNativeLibraryPlacementReceipt(transactionId: string, incoming: DropCommitReceipt): boolean;${eol}  `;
  const recovery = `${recoveryMarker}${eol}  confirmNativeLibraryPlacementReceipt: (transactionId, incoming) => {${eol}`
    + `    const { feedback, state } = get();${eol}`
    + `    if (!feedback || (state.status !== 'failed' && state.status !== 'idle')${eol}`
    + `      || feedback.originalIntent.intent.kind !== 'assembly-apply'${eol}`
    + `      || transactionId !== feedback.attempt.transactionId || transactionId !== feedback.receipt.transactionId${eol}`
    + `      || incoming.transactionId !== transactionId || incoming.targetId !== feedback.originalIntent.intent.targetId${eol}`
    + `      || incoming.targetId !== feedback.receipt.targetId || incoming.projectId !== feedback.receipt.projectId${eol}`
    + `      || !isNativeLibraryPlacementReceipt(feedback.receipt, feedback.attempt.payload)${eol}`
    + `      || !isNativeLibraryPlacementReceipt(incoming, feedback.attempt.payload)${eol}`
    + `      || (feedback.receipt.status === 'success' && incoming.status !== 'success')) return false;${eol}`
    + `    set({ feedback: { ...feedback, receipt: incoming }, state: incoming.status === 'success' ? idleDrop() : state });${eol}`
    + `    return true;${eol}  },${eol}${eol}  `;
  const result = insert(source, [
    { at: 0, text: ownImport },
    { at: receipt.initializer.condition.getStart(ast), text: '!(isNativeLibraryPlacementReceipt(incoming, state.payload) && incoming.targetId === resolution.intent.targetId) && ' },
    { at: railwayDeclaration.getStart(ast), text: declaration },
    { at: railwayImplementation.getStart(ast), text: recovery },
  ]);
  sourceContext(result, sourcePath, nativeLibraryDropStateSource, false);
  return result;
}

export function createNativeLibraryDropOwnerSourceTransforms() {
  return { [nativeLibraryDropRouterSource]: transformNativeLibraryDropRouter,
    [nativeLibraryDropStateSource]: transformNativeLibraryDropState };
}

export function restoreNativeLibraryDropOwnerForComparison(source, original, context) {
  const transform = key(context?.sourcePath ?? '.') === key(path.join(root, nativeLibraryDropRouterSource))
    ? transformNativeLibraryDropRouter : transformNativeLibraryDropState;
  if (source !== transform(original, context)) throw new Error('Native Library Drop restore requires its exact original input and output.');
  return original;
}

/** Only the existing receipt call is wrapped. Legacy sources still render
 * the exact original LcosDropReceipt child; Library sources use the supplied
 * donor toast and the same store's readonly recovery adoption. */
export function transformNativeLibraryDropFeedbackOverlay(source, { sourcePath } = {}) {
  const copied = path.join(root, nativeLibraryDropOverlaySource), selected = resolveCurrentGen2Resource(copied);
  if (typeof sourcePath !== 'string' || key(sourcePath) !== key(copied) || !selected
    || key(selected.sourcePath) !== key(path.join(currentGen2Root, nativeLibraryDropOverlaySource.slice(5))))
    throw new Error('Native Library feedback requires the exact selected original Overlay module.');
  const ast = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  if (ast.parseDiagnostics.length) throw new Error('Native Library feedback original Overlay cannot be parsed.');
  const receipt = one(find(ast, n => ts.isJsxSelfClosingElement(n) && n.tagName.getText() === 'LcosDropReceipt'), 'original receipt call');
  const wrappers = find(ast, n => ts.isJsxElement(n) && n.openingElement.tagName.getText() === 'NativeLibraryDropFeedback');
  const relative = path.relative(path.dirname(sourcePath), path.join(root, 'lab/pilot/native-library-drop-feedback')).replaceAll('\\', '/');
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const ownImport = `import { NativeLibraryDropFeedback } from '${relative.startsWith('.') ? relative : './'+relative}';${eol}${feedbackMarker}${eol}`;
  if (source.includes(feedbackMarker)) {
    if (source.split(ownImport).length !== 2 || wrappers.length !== 1 || receipt.parent !== wrappers[0])
      throw new Error('Native Library original-toast feedback is partially installed.');
    return source;
  }
  if (wrappers.length) throw new Error('Native Library original-toast feedback is partially installed.');
  const result = ownImport + source.slice(0, receipt.getStart(ast)) + '<NativeLibraryDropFeedback>'
    + source.slice(receipt.getStart(ast), receipt.end) + '</NativeLibraryDropFeedback>' + source.slice(receipt.end);
  const checked = ts.createSourceFile(sourcePath, result, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  if (checked.parseDiagnostics.length) throw new Error('Native Library original-toast feedback cannot be parsed.');
  return result;
}

export function restoreNativeLibraryDropFeedbackOverlayForComparison(source, original, context) {
  if (source !== transformNativeLibraryDropFeedbackOverlay(original, context)) throw new Error('Native Library feedback restore needs its exact original input and output.');
  return original;
}
