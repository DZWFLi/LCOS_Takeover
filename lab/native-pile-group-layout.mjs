import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseOriginalDonorScript } from './agent-node-transform.mjs';

const WORKSPACE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = path.join(WORKSPACE_ROOT, 'reference/tapnow-installed/resources/web/assets');
const PAGE_FILE = 'page-Da_DfwiK.js';
const COURSE_FILE = 'course-api-base-url-CifxI1ia.js';
const GROUP_FILE = 'group-B4S7qHps.js';
const UNLIMITED_FILE = 'UnlimitedModeToggle-D4wysAbz.js';
const INDEX_FILE = 'index-BAQXnPag.js';

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

function matching(root, predicate) {
  const found = [];
  walk(root, node => { if (predicate(node)) found.push(node); });
  return found;
}

function one(items, label) {
  if (items.length !== 1) throw new Error(`TapNow original Group layout source changed: expected one ${label}, got ${items.length}.`);
  return items[0];
}

function readProgram(filename) {
  const source = fs.readFileSync(path.join(ASSETS, filename), 'utf8');
  return { source, program: parseOriginalDonorScript(source, filename) };
}

function declaration(program, name, type) {
  if (type === 'FunctionDeclaration') {
    return one(program.body.filter(node => node.type === type && node.id?.name === name), `function ${name}`);
  }
  return one(program.body.flatMap(statement => statement.type === 'VariableDeclaration'
    ? statement.declarations : []).filter(node => node.type === type && node.id?.name === name), `binding ${name}`);
}

function expression(source, node) {
  if (!node || typeof node.start !== 'number' || typeof node.end !== 'number') {
    throw new Error('TapNow original Group layout source changed: function boundary unavailable.');
  }
  return source.slice(node.start, node.end);
}

function compile(source, node, parameters = [], values = []) {
  const code = expression(source, node);
  return new Function(...parameters, `return (${code});`)(...values);
}

function currentGroupType(indexProgram) {
  const enumFactory = declaration(indexProgram, 'Jc', 'VariableDeclarator');
  const assignments = matching(enumFactory.init, node => node.type === 'AssignmentExpression'
    && node.left?.type === 'MemberExpression' && !node.left.computed
    && node.left.property?.name === 'GROUP' && node.right?.type === 'StringLiteral');
  return one(assignments, 'original GROUP enum value').right.value;
}

function assertOriginalCreateNewGroupShape(pageProgram) {
  const creator = declaration(pageProgram, 'jC', 'FunctionDeclaration');
  const callback = declaration(creator.body, 'i', 'VariableDeclarator');
  if (callback.init?.type !== 'CallExpression' || callback.init.callee?.type !== 'MemberExpression'
    || callback.init.callee.property?.name !== 'useCallback'
    || callback.init.arguments[0]?.type !== 'ArrowFunctionExpression') {
    throw new Error('TapNow original Group layout source changed: createNewGroup is no longer its original callback.');
  }
  const calls = matching(callback.init.arguments[0].body, node => node.type === 'CallExpression'
    && node.callee?.type === 'Identifier');
  const names = calls.sort((left, right) => left.start - right.start).map(call => call.callee.name);
  const ordered = ['h0', 'ma', 'p0', 'f0', 'm0'];
  let cursor = -1;
  for (const name of ordered) {
    cursor = names.findIndex((candidate, index) => index > cursor && candidate === name);
    if (cursor < 0) throw new Error(`TapNow original Group layout source changed: createNewGroup no longer calls ${name} in order.`);
  }
  return callback.init.arguments[0];
}

let cached;

function loadOriginalHelpers() {
  if (cached) return cached;
  const page = readProgram(PAGE_FILE);
  const course = readProgram(COURSE_FILE);
  const group = readProgram(GROUP_FILE);
  const unlimited = readProgram(UNLIMITED_FILE);
  const index = readProgram(INDEX_FILE);
  const createNewGroup = assertOriginalCreateNewGroupShape(page.program);

  const boundsHelper = declaration(page.program, 'h0', 'FunctionDeclaration');
  const selectionHelper = declaration(page.program, 'f0', 'FunctionDeclaration');
  const groupProjectionHelper = declaration(page.program, 'p0', 'FunctionDeclaration');
  const childProjectionHelper = declaration(page.program, 'm0', 'FunctionDeclaration');
  const numberHelper = declaration(unlimited.program, 'Ms', 'FunctionDeclaration');
  const originalBoundsHelper = declaration(unlimited.program, 'Uh', 'FunctionDeclaration');
  const groupConstructor = declaration(group.program, 'o', 'VariableDeclarator');
  const groupType = currentGroupType(index.program);

  const expectedBoundsImport = page.program.body.some(node => node.type === 'ImportDeclaration'
    && node.source?.value === './UnlimitedModeToggle-D4wysAbz.js'
    && node.specifiers.some(specifier => specifier.type === 'ImportSpecifier'
      && specifier.imported?.name === 'bY' && specifier.local?.name === 'Yn'));
  const expectedConstructorImport = page.program.body.some(node => node.type === 'ImportDeclaration'
    && node.source?.value === './group-B4S7qHps.js'
    && node.specifiers.some(specifier => specifier.type === 'ImportSpecifier'
      && specifier.imported?.name === 'c' && specifier.local?.name === 'ma'));
  const constructorExports = group.program.body.filter(node => node.type === 'ExportNamedDeclaration')
    .flatMap(node => node.specifiers ?? []);
  if (!expectedBoundsImport || !expectedConstructorImport
    || !constructorExports.some(specifier => specifier.local?.name === 'o' && specifier.exported?.name === 'c')) {
    throw new Error('TapNow original Group layout source changed: original bounds or Group constructor import/export drifted.');
  }

  const parsedNumber = compile(unlimited.source, numberHelper);
  const bounds = compile(unlimited.source, originalBoundsHelper, ['Ms'], [parsedNumber]);
  const groupBounds = compile(page.source, boundsHelper, ['Yn'], [bounds]);
  const selection = compile(page.source, selectionHelper);
  const groupProjection = compile(page.source, groupProjectionHelper, ['ee'], [{ GROUP: groupType }]);
  const childProjection = compile(page.source, childProjectionHelper);
  const constructor = compile(group.source, groupConstructor.init, ['e', 'd'], [
    { GROUP: groupType }, () => 'native-layout-id',
  ]);
  cached = {
    createNewGroup,
    groupBounds,
    selection,
    groupProjection,
    childProjection,
    constructor,
  };
  return cached;
}

/**
 * Use the installed TapNow createNewGroup geometry/parent projection without
 * mounting React or reproducing its canvas editor. The caller supplies the
 * already-owned frame ID; only the source helper's random ID is substituted.
 */
export function planOriginalTapNowGroupLayout(allNodes, selectedNodes, groupId, { title = 'New Group' } = {}) {
  if (!Array.isArray(allNodes) || !Array.isArray(selectedNodes) || !selectedNodes.length
    || typeof groupId !== 'string' || !groupId.trim()) {
    throw new TypeError('TapNow original Group layout needs allNodes, selectedNodes and an owned groupId.');
  }
  const helpers = loadOriginalHelpers();
  const bounds = helpers.groupBounds(selectedNodes);
  const sourceFrame = helpers.constructor({
    title: typeof title === 'string' && title ? title : 'New Group',
    loading: false,
    layoutType: 'horizontal',
    createdBy: 'client',
  }, { x: bounds.x, y: bounds.y });
  const frame = helpers.groupProjection({ ...sourceFrame, id: groupId }, bounds);
  const nodes = helpers.childProjection(allNodes, helpers.selection(selectedNodes), groupId, bounds);
  return { frame: { ...frame, selected: true }, nodes, bounds };
}
