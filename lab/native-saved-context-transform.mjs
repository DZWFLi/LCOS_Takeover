import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { installedRoot } from './pilot/build-pilot.mjs';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const nativeSavedContextAtlasSource = 'lcos/huabu/apps/web/src/lcos/surfaces/context/ContextAtlasStage.tsx';
const componentPath = path.join(workspaceRoot, 'lab/pilot/native-saved-context-action.tsx');
const dependencyRequire = createRequire(path.join(installedRoot, 'package.json'));
const ts = dependencyRequire('typescript');

function normalizedSourcePath(sourcePath) {
  if (typeof sourcePath !== 'string' || !sourcePath.trim()) {
    throw new Error('Native Saved Context transform requires the real copied ContextAtlasStage sourcePath.');
  }
  return path.relative(workspaceRoot, path.resolve(sourcePath)).split(path.sep).join('/').toLowerCase();
}

function assertExactSource(sourcePath) {
  const relative = normalizedSourcePath(sourcePath);
  if (relative !== nativeSavedContextAtlasSource.toLowerCase()) {
    throw new Error(`Native Saved Context transform only applies to ${nativeSavedContextAtlasSource}.`);
  }
}

function componentSpecifier(sourcePath) {
  const relative = path.relative(path.dirname(path.resolve(sourcePath)), componentPath).split(path.sep).join('/');
  return relative.startsWith('.') ? relative : `./${relative}`;
}

function sourceFile(source, sourcePath) {
  const file = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  if (file.parseDiagnostics.length > 0) {
    const diagnostic = file.parseDiagnostics[0];
    const detail = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
    throw new Error(`Native Saved Context transform cannot parse the donor TSX: ${detail}`);
  }
  return file;
}

function descendants(root, predicate) {
  const found = [];
  const visit = (node) => {
    if (predicate(node)) found.push(node);
    ts.forEachChild(node, visit);
  };
  visit(root);
  return found;
}

function one(found, label) {
  if (found.length !== 1) throw new Error(`Native Saved Context seam drift: expected one ${label}, found ${found.length}.`);
  return found[0];
}

function unwrapParentheses(node) {
  let current = node;
  while (current && ts.isParenthesizedExpression(current)) current = current.expression;
  return current;
}

function jsxTagName(node) {
  if (!node || (!ts.isJsxElement(node) && !ts.isJsxSelfClosingElement(node))) return undefined;
  const opening = ts.isJsxElement(node) ? node.openingElement : node;
  return ts.isIdentifier(opening.tagName) ? opening.tagName.text : undefined;
}

function stringAttribute(element, name) {
  const opening = ts.isJsxElement(element) ? element.openingElement : element;
  const attribute = opening.attributes.properties.find((entry) => ts.isJsxAttribute(entry)
    && ts.isIdentifier(entry.name) && entry.name.text === name);
  return attribute && ts.isStringLiteral(attribute.initializer) ? attribute.initializer.text : undefined;
}

function identifierAttribute(element, name) {
  const opening = ts.isJsxElement(element) ? element.openingElement : element;
  const attribute = opening.attributes.properties.find((entry) => ts.isJsxAttribute(entry)
    && ts.isIdentifier(entry.name) && entry.name.text === name);
  const initializer = attribute?.initializer;
  return initializer && ts.isJsxExpression(initializer) && initializer.expression && ts.isIdentifier(initializer.expression)
    ? initializer.expression.text : undefined;
}

function attributeExpressionText(element, name, file) {
  const opening = ts.isJsxElement(element) ? element.openingElement : element;
  const attribute = opening.attributes.properties.find((entry) => ts.isJsxAttribute(entry)
    && ts.isIdentifier(entry.name) && entry.name.text === name);
  const initializer = attribute?.initializer;
  return initializer && ts.isJsxExpression(initializer) && initializer.expression
    ? initializer.expression.getText(file) : undefined;
}

function findStage(file) {
  return one(descendants(file, (node) => ts.isFunctionDeclaration(node)
    && node.name?.text === 'ContextAtlasStage'), 'ContextAtlasStage function');
}

function findFocusedSummary(stage) {
  const candidates = descendants(stage, (node) => ts.isJsxElement(node)
    && jsxTagName(node) === 'div'
    && stringAttribute(node, 'className') === 'lcos-atlas-focus-summary');
  const summary = one(candidates, 'focused item summary');
  const text = summary.getText();
  if (!text.includes('已选中：') || !text.includes('focusedPreviewHint') || !text.includes('focusedActionHint')) {
    throw new Error('Native Saved Context seam drift: focused item title/preview/action summary changed.');
  }
  return summary;
}

function assertOriginalCardActions(stage) {
  const actions = descendants(stage, (node) => ts.isVariableDeclaration(node)
    && ts.isIdentifier(node.name) && node.name.text === 'action'
    && node.initializer && ts.isJsxElement(unwrapParentheses(node.initializer)));
  const action = one(actions, 'original Atlas card action');
  const text = unwrapParentheses(action.initializer).getText();
  if (!text.includes('data-semantic-drop-handle') || !text.includes('拿取')
    || !text.includes('进入') || !text.includes('定位') || !text.includes('focusOnCanvas(item)')) {
    throw new Error('Native Saved Context seam drift: original card take/enter/locate actions changed.');
  }
  return action;
}

function inspectInstalled(summary, file, specifier) {
  const imports = file.statements.filter((statement) => ts.isImportDeclaration(statement)
    && ts.isStringLiteral(statement.moduleSpecifier) && statement.moduleSpecifier.text === specifier
    && statement.importClause?.namedBindings && ts.isNamedImports(statement.importClause.namedBindings)
    && statement.importClause.namedBindings.elements.some((element) => element.name.text === 'NativeSavedContextAction'));
  const uses = descendants(summary, (node) => ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node))
    .filter((node) => jsxTagName(node) === 'NativeSavedContextAction');
  return { imports, uses };
}

function assertInstalledShape(source, file, summary, specifier) {
  const { imports, uses } = inspectInstalled(summary, file, specifier);
  one(imports, 'NativeSavedContextAction import');
  const call = one(uses, 'focused NativeSavedContextAction caller');
  if (identifierAttribute(call, 'projectId') !== 'projectId'
    || identifierAttribute(call, 'item') !== 'focusedItem'
    || attributeExpressionText(call, 'key', file) !== 'focusedItem.entityRef.id') {
    throw new Error('Native Saved Context seam drift: component props/key no longer follow the focused canonical scope.');
  }
  const guardedContainers = descendants(summary, (node) => ts.isJsxExpression(node) && node.expression
    && descendants(node.expression, (child) => child === call).length > 0);
  const guard = one(guardedContainers, 'Context Atlas mode/scope guard');
  const condition = ts.isConditionalExpression(guard.expression) ? guard.expression.condition : undefined;
  const compactGuard = condition?.getText(file).replace(/\s+/g, '');
  if (compactGuard !== "mode==='context'&&focusedItem?.kind==='context'&&focusedItem.entityRef.type==='context'") {
    throw new Error('Native Saved Context seam drift: action is not limited to a canonical Context card in Context mode.');
  }
  if (!ts.isConditionalExpression(guard.expression)
    || guard.expression.whenFalse.kind !== ts.SyntaxKind.NullKeyword) {
    throw new Error('Native Saved Context seam drift: focused-card insertion no longer has an inert fallback.');
  }
}

const SUMMARY_JSX = "{mode === 'context' && focusedItem?.kind === 'context' && focusedItem.entityRef.type === 'context' ? <NativeSavedContextAction key={focusedItem.entityRef.id} projectId={projectId} item={focusedItem} /> : null}";

/** Add the local Saved Context action only to the original focused-card summary. */
export function transformNativeSavedContextAtlas(source, { sourcePath } = {}) {
  assertExactSource(sourcePath);
  if (typeof source !== 'string') throw new TypeError('Native Saved Context transform requires source text.');
  const specifier = componentSpecifier(sourcePath);
  const file = sourceFile(source, sourcePath);
  const stage = findStage(file);
  const summary = findFocusedSummary(stage);
  assertOriginalCardActions(stage);
  const installed = inspectInstalled(summary, file, specifier);
  const allImports = file.statements.filter((statement) => ts.isImportDeclaration(statement)
    && ts.isStringLiteral(statement.moduleSpecifier) && statement.moduleSpecifier.text === specifier);
  const allUses = descendants(stage, (node) => ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node))
    .filter((node) => jsxTagName(node) === 'NativeSavedContextAction');
  if (installed.imports.length === 1 && installed.uses.length === 1 && allImports.length === 1 && allUses.length === 1) {
    assertInstalledShape(source, file, summary, specifier);
    return source;
  }
  if (allImports.length > 0 || allUses.length > 0) {
    throw new Error('Native Saved Context seam partially installed or duplicated.');
  }

  const firstImport = file.statements.find(ts.isImportDeclaration);
  if (firstImport === undefined) throw new Error('Native Saved Context seam drift: module has no original import.');
  const closingStart = summary.closingElement?.getStart(file);
  if (closingStart === undefined) throw new Error('Native Saved Context seam drift: focused summary has no closing element.');
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const importEdit = {
    start: firstImport.getStart(file), end: firstImport.getStart(file),
    text: `import { NativeSavedContextAction } from '${specifier}';${newline}`,
  };
  const actionEdit = { start: closingStart, end: closingStart, text: SUMMARY_JSX };
  let transformed = source;
  for (const edit of [importEdit, actionEdit].sort((left, right) => right.start - left.start)) {
    transformed = transformed.slice(0, edit.start) + edit.text + transformed.slice(edit.end);
  }

  const after = sourceFile(transformed, sourcePath);
  const afterSummary = findFocusedSummary(findStage(after));
  assertInstalledShape(transformed, after, afterSummary, specifier);
  return transformed;
}

