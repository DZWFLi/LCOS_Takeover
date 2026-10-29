import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { installedRoot } from './pilot/build-pilot.mjs';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const nativeWorkflowCardPoolSource = 'lcos/huabu/apps/web/src/lcos/surfaces/workflow/WorkflowCardPool.tsx';
const dependencyRequire = createRequire(path.join(installedRoot, 'package.json'));
const ts = dependencyRequire('typescript');

function normalizedSourcePath(sourcePath) {
  if (typeof sourcePath !== 'string' || !sourcePath.trim()) {
    throw new Error('Native Workflow transform requires the real copied WorkflowCardPool sourcePath.');
  }
  return path.relative(workspaceRoot, path.resolve(sourcePath)).split(path.sep).join('/').toLowerCase();
}

function assertExactSource(sourcePath) {
  if (normalizedSourcePath(sourcePath) !== nativeWorkflowCardPoolSource.toLowerCase()) {
    throw new Error(`Native Workflow transform only applies to ${nativeWorkflowCardPoolSource}.`);
  }
}

function sourceFile(source, sourcePath) {
  const file = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  if (file.parseDiagnostics.length > 0) {
    const diagnostic = file.parseDiagnostics[0];
    throw new Error(`Native Workflow transform cannot parse copied WorkflowCardPool: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`);
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
  if (found.length !== 1) throw new Error(`Native Workflow seam drift: expected one ${label}, found ${found.length}.`);
  return found[0];
}

function propertyName(node) {
  return ts.isIdentifier(node.name) ? node.name.text : node.name.getText();
}

function findPoolProps(file) {
  return one(file.statements.filter((node) => ts.isInterfaceDeclaration(node)
    && node.name.text === 'WorkflowCardPoolProps'), 'WorkflowCardPoolProps interface');
}

function findProperty(owner, name, label = `WorkflowCardPoolProps.${name}`) {
  return one(owner.members.filter((node) => ts.isPropertySignature(node) && propertyName(node) === name), label);
}

function findPool(file) {
  return one(descendants(file, (node) => ts.isFunctionDeclaration(node) && node.name?.text === 'WorkflowCardPool'),
    'WorkflowCardPool function');
}

function findEnterCard(pool) {
  return one(descendants(pool, (node) => ts.isVariableDeclaration(node)
    && ts.isIdentifier(node.name) && node.name.text === 'enterCard' && node.initializer !== undefined),
  'original enterCard handler');
}

function findEnteredDeclaration(enterCard) {
  return one(descendants(enterCard, (node) => ts.isVariableDeclaration(node)
    && ts.isIdentifier(node.name) && node.name.text === 'entered' && node.initializer !== undefined),
  'original navigation result');
}

function findAssemblyTarget(pool) {
  return one(descendants(pool, (node) => ts.isVariableDeclaration(node)
    && ts.isIdentifier(node.name) && node.name.text === 'assemblyTarget' && node.initializer !== undefined),
  'empty-pool Assembly target');
}

function sourceSurfaceType(prop) {
  if (!prop.type || !ts.isUnionTypeNode(prop.type)) throw new Error('Native Workflow seam drift: sourceSurface union changed.');
  return prop.type;
}

function isNativeEnterProperty(node) {
  return ts.isPropertySignature(node) && propertyName(node) === 'onNativeEnter';
}

function objectBindingHas(pattern, name) {
  return pattern.elements.some((element) => ts.isBindingElement(element)
    && ts.isIdentifier(element.name) && element.name.text === name);
}

function findNativeNavigationCall(enterCard, file) {
  return one(descendants(enterCard, (node) => ts.isCallExpression(node)
    && ts.isIdentifier(node.expression) && node.expression.text === 'beginChildWorksiteNavigation'),
  'original child-worksite navigation call');
}

function getAwaitForCall(enterCard, call) {
  return one(descendants(enterCard, (node) => ts.isAwaitExpression(node) && node.expression === call),
    'awaited child-worksite navigation call');
}

function inspect(file) {
  const props = findPoolProps(file);
  const sourceSurface = findProperty(props, 'sourceSurface');
  const nativeEnterProperties = props.members.filter(isNativeEnterProperty);
  const pool = findPool(file);
  const parameter = pool.parameters[0];
  const binding = parameter && ts.isObjectBindingPattern(parameter.name) ? parameter.name : undefined;
  if (!binding) throw new Error('Native Workflow seam drift: WorkflowCardPool destructured props changed.');
  const enterCard = findEnterCard(pool);
  const entered = findEnteredDeclaration(enterCard);
  const assemblyTarget = findAssemblyTarget(pool);
  const childNavigation = findNativeNavigationCall(enterCard, file);
  const awaitedNavigation = getAwaitForCall(enterCard, childNavigation);
  return { props, sourceSurface, nativeEnterProperties, pool, binding, enterCard, entered, assemblyTarget, childNavigation, awaitedNavigation };
}

function assertOriginalSemanticCallers(file, pool, enterCard) {
  const text = pool.getText(file);
  if (!text.includes('readWorkflowMethodDraft(session, projectId, card, controller.signal)')
    || !text.includes('appendWorkflowMethodDraft(method, projectId)')
    || !text.includes('<WorkflowTaskCardView')
    || !text.includes('onPreview={() => previewCard(card, entryResolution)}')
    || !text.includes('onUse: (anchor: WorkflowCardActionAnchor) => takeCard(card, anchor)')) {
    throw new Error('Native Workflow seam drift: original warehouse/method/task-card callers changed.');
  }
  if (!enterCard.getText(file).includes('previewCard(card, resolution)')
    || !enterCard.getText(file).includes('if (entered) onLeaveHand?.()')) {
    throw new Error('Native Workflow seam drift: original preview or close-on-entry behavior changed.');
  }
}

function assertInstalledShape(file) {
  const shape = inspect(file);
  const sourceLiterals = sourceSurfaceType(shape.sourceSurface).types
    .map((type) => ts.isLiteralTypeNode(type) && ts.isStringLiteral(type.literal) ? type.literal.text : undefined);
  if (sourceLiterals.join('|') !== 'main|workflow|context') {
    throw new Error('Native Workflow seam drift: context is not the only additional sourceSurface.');
  }
  const nativeEnter = one(shape.nativeEnterProperties, 'native original-router callback prop');
  if (!nativeEnter.questionToken || !nativeEnter.type || !ts.isFunctionTypeNode(nativeEnter.type)
    || nativeEnter.type.parameters.length !== 1
    || !ts.isIdentifier(nativeEnter.type.parameters[0].name)
    || nativeEnter.type.parameters[0].name.text !== 'targetWorkspace'
    || nativeEnter.type.parameters[0].type?.getText(file) !== 'Workspace'
    || nativeEnter.type.type.getText(file) !== 'Promise<boolean>') {
    throw new Error('Native Workflow seam drift: callback must accept the canonical Workspace and return navigation acknowledgement.');
  }
  if (!objectBindingHas(shape.binding, 'onNativeEnter')) {
    throw new Error('Native Workflow seam drift: component does not receive onNativeEnter.');
  }
  const entered = shape.entered.initializer;
  if (!ts.isConditionalExpression(entered)
    || entered.condition.getText(file) !== 'onNativeEnter'
    || !ts.isAwaitExpression(entered.whenTrue)
    || !ts.isCallExpression(entered.whenTrue.expression)
    || entered.whenTrue.expression.expression.getText(file) !== 'onNativeEnter'
    || entered.whenTrue.expression.arguments.length !== 1
    || entered.whenTrue.expression.arguments[0].getText(file) !== 'resolution.targetWorkspace') {
    throw new Error('Native Workflow seam drift: native entry no longer receives the exact resolved Workspace.');
  }
  const fallback = entered.whenFalse;
  if (!ts.isConditionalExpression(fallback)
    || fallback.condition.getText(file).replace(/\s+/g, '') !== "sourceSurface==='context'"
    || fallback.whenTrue.kind !== ts.SyntaxKind.FalseKeyword
    || !ts.isAwaitExpression(fallback.whenFalse)
    || !ts.isCallExpression(fallback.whenFalse.expression)
    || fallback.whenFalse.expression.expression.getText(file) !== 'beginChildWorksiteNavigation') {
    throw new Error('Native Workflow seam drift: Context cannot fall through to a switchCanvas child-worksite navigation.');
  }
  const assemblyCondition = shape.assemblyTarget.initializer;
  if (!ts.isConditionalExpression(assemblyCondition)) throw new Error('Native Workflow seam drift: Assembly target branch changed.');
  const compact = assemblyCondition.condition.getText(file).replace(/\s+/g, '');
  if (compact !== "(sourceSurface==='workflow'||sourceSurface==='context')&&activeWorkspaceId!==null") {
    throw new Error('Native Workflow seam drift: context card-pool Assembly action is not scoped to its current Core Workspace.');
  }
  assertOriginalSemanticCallers(file, shape.pool, shape.enterCard);
}

/** Add a narrow original-router entry callback at the existing WorkflowCardPool navigation call. */
export function transformNativeWorkflowCardPool(source, { sourcePath } = {}) {
  assertExactSource(sourcePath);
  if (typeof source !== 'string') throw new TypeError('Native Workflow transform requires source text.');
  const file = sourceFile(source, sourcePath);
  const shape = inspect(file);
  assertOriginalSemanticCallers(file, shape.pool, shape.enterCard);

  const installedSourceLiterals = sourceSurfaceType(shape.sourceSurface).types
    .map((type) => ts.isLiteralTypeNode(type) && ts.isStringLiteral(type.literal) ? type.literal.text : undefined);
  const hasContextSurface = installedSourceLiterals.includes('context');
  const hasCallback = shape.nativeEnterProperties.length > 0;
  const hasCallbackBinding = objectBindingHas(shape.binding, 'onNativeEnter');
  const navExpression = shape.entered.initializer;
  const hasNativeBranch = ts.isConditionalExpression(navExpression)
    && navExpression.condition.getText(file) === 'onNativeEnter';
  const assemblyExpression = shape.assemblyTarget.initializer;
  const hasContextAssemblyBranch = ts.isConditionalExpression(assemblyExpression)
    && assemblyExpression.condition.getText(file).replace(/\s+/g, '')
      === "(sourceSurface==='workflow'||sourceSurface==='context')&&activeWorkspaceId!==null";

  if (hasContextSurface && hasCallback && hasCallbackBinding && hasNativeBranch && hasContextAssemblyBranch) {
    assertInstalledShape(file);
    return source;
  }
  if (hasContextSurface || hasCallback || hasCallbackBinding || hasNativeBranch || hasContextAssemblyBranch) {
    throw new Error('Native Workflow seam partially installed or duplicated.');
  }
  if (installedSourceLiterals.join('|') !== 'main|workflow') {
    throw new Error('Native Workflow seam drift: original sourceSurface must be exactly main|workflow.');
  }

  const sourceSurfaceTypeNode = sourceSurfaceType(shape.sourceSurface);
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const edits = [
    {
      start: sourceSurfaceTypeNode.getStart(file), end: sourceSurfaceTypeNode.getEnd(),
      text: `${sourceSurfaceTypeNode.getText(file)} | 'context'`,
    },
    {
      start: shape.sourceSurface.getEnd(), end: shape.sourceSurface.getEnd(),
      text: `${newline}  readonly onNativeEnter?: (targetWorkspace: Workspace) => Promise<boolean>;`,
    },
    {
      start: shape.binding.elements[shape.binding.elements.length - 1].getEnd(),
      end: shape.binding.elements[shape.binding.elements.length - 1].getEnd(),
      text: ', onNativeEnter',
    },
    {
      start: shape.awaitedNavigation.getStart(file), end: shape.awaitedNavigation.getEnd(),
      text: `onNativeEnter${newline}      ? await onNativeEnter(resolution.targetWorkspace)${newline}      : sourceSurface === 'context' ? false${newline}      : ${shape.awaitedNavigation.getText(file)}`,
    },
    {
      start: assemblyExpression.condition.getStart(file), end: assemblyExpression.condition.getEnd(),
      text: "(sourceSurface === 'workflow' || sourceSurface === 'context') && activeWorkspaceId !== null",
    },
  ];

  let transformed = source;
  for (const edit of edits.sort((left, right) => right.start - left.start)) {
    transformed = transformed.slice(0, edit.start) + edit.text + transformed.slice(edit.end);
  }
  const after = sourceFile(transformed, sourcePath);
  assertInstalledShape(after);
  return transformed;
}
