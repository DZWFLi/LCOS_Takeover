import { parseOriginalDonorScript } from './agent-node-transform.mjs';

const TARGET = 'page-Da_DfwiK.js';
const IMPORT_SOURCE = '/lcos/agent-ui.js';
const OPEN_HELPER = 'LCOSNativeAssemblyOpen';
const TOOLS_COMPONENT = 'LCOSNativeAssemblyTools';
const PINNED_HELPER = 'LCOSIsPinnedAssemblyDetail';
const IMPORT = `import{${OPEN_HELPER},${TOOLS_COMPONENT}}from"${IMPORT_SOURCE}";\n`;
const PINNED_HELPER_SOURCE = 'function LCOSIsPinnedAssemblyDetail(detail){const asset=detail?.asset;const projection=asset?.lcos_projection;const nonEmpty=value=>typeof value==="string"&&value.trim().length>0;return !!asset&&!!projection&&projection.pinned_revision===true&&nonEmpty(projection.project_id)&&nonEmpty(projection.artifact_id)&&nonEmpty(projection.presented_revision_id)&&nonEmpty(projection.file_record_id)&&asset.id===projection.artifact_id}';

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

function nodesMatching(root, predicate) {
  const found = [];
  walk(root, node => { if (predicate(node)) found.push(node); });
  return found;
}

function one(items, label) {
  if (items.length !== 1) {
    throw new Error(`Native assembly Library seam changed: expected one ${label}, got ${items.length}.`);
  }
  return items[0];
}

function propertyName(property) {
  if (property?.type === 'Identifier') return property.name;
  if (property?.type === 'StringLiteral') return property.value;
  return undefined;
}

function objectProperty(object, name) {
  return object?.type === 'ObjectExpression'
    ? object.properties.find(property => property.type === 'ObjectProperty' && propertyName(property.key) === name)
    : undefined;
}

function member(node, objectName, property) {
  return node?.type === 'MemberExpression' && !node.computed
    && node.object?.type === 'Identifier' && node.object.name === objectName
    && propertyName(node.property) === property;
}

function call(node, objectName, property) {
  return node?.type === 'CallExpression' && member(node.callee, objectName, property);
}

function identifierCall(node, name) {
  return node?.type === 'CallExpression' && node.callee?.type === 'Identifier' && node.callee.name === name;
}

function jsxComponent(node, name) {
  return (call(node, 'r', 'jsx') || call(node, 'r', 'jsxs'))
    && node.arguments[0]?.type === 'Identifier' && node.arguments[0].name === name;
}

function variable(program, name) {
  return one(nodesMatching(program, node => node.type === 'VariableDeclarator'
    && node.id?.type === 'Identifier' && node.id.name === name), `module binding ${name}`);
}

function jFComponent(program) {
  const binding = variable(program, 'jF');
  if (binding.init?.type !== 'ArrowFunctionExpression') {
    throw new Error('Native assembly Library seam changed: jF is no longer the original panel component.');
  }
  return binding.init;
}

function openHandler(program) {
  const component = jFComponent(program);
  const binding = one(nodesMatching(component.body, node => node.type === 'VariableDeclarator'
    && node.id?.type === 'Identifier' && node.id.name === 'ut'
    && node.init?.type === 'CallExpression' && member(node.init.callee, 'l', 'useCallback')),
  'jF original Library onApply callback ut');
  const callback = binding.init.arguments[0];
  const dependencies = binding.init.arguments[1];
  if (callback?.type !== 'ArrowFunctionExpression' || callback.params[0]?.type !== 'Identifier'
    || callback.params.length !== 1 || dependencies?.type !== 'ArrayExpression') {
    throw new Error('Native assembly Library seam changed: ut is no longer a one-argument useCallback.');
  }
  return { component, binding, callback, dependencies, detailParam: callback.params[0].name };
}

function originalOpenHandler(program) {
  const found = openHandler(program);
  const { callback, dependencies, detailParam } = found;
  const body = callback.body;
  if (body?.type !== 'BlockStatement' || body.body.length !== 2
    || body.body[0]?.type !== 'VariableDeclaration' || body.body[0].declarations.length !== 3) {
    throw new Error('Native assembly Library seam changed: original ut body no longer inserts one selected asset.');
  }

  const [asset, viewport, node] = body.body[0].declarations;
  const insertStatement = body.body[1];
  const assetProperty = asset?.id?.type === 'ObjectPattern' ? asset.id.properties[0] : undefined;
  if (assetProperty?.type !== 'ObjectProperty' || propertyName(assetProperty.key) !== 'asset'
    || assetProperty.value?.name !== 'Oe' || asset.init?.name !== detailParam
    || viewport?.id?.name !== 'rt' || !identifierCall(viewport.init, 'ns')
    || viewport.init.arguments.length !== 1 || !identifierCall(viewport.init.arguments[0], 'n')
    || viewport.init.arguments[0].arguments.length !== 0
    || node?.id?.name !== 'bt' || node.init?.callee?.name !== 'Qe'
    || node.init.arguments[0]?.name !== 'Oe' || node.init.arguments[1]?.name !== 'rt'
    || insertStatement?.type !== 'ExpressionStatement'
    || insertStatement.expression?.type !== 'LogicalExpression' || insertStatement.expression.operator !== '&&'
    || insertStatement.expression.left?.name !== 'bt' || insertStatement.expression.right?.callee?.name !== 'Ye'
    || insertStatement.expression.right.arguments[0]?.name !== 'bt') {
    throw new Error('Native assembly Library seam changed: ut no longer follows asset → viewport → node → insert.');
  }

  if (dependencies.elements.length !== 3
    || dependencies.elements[0]?.name !== 'Ye'
    || dependencies.elements[1]?.name !== 'Qe'
    || dependencies.elements[2]?.name !== 'n') {
    throw new Error('Native assembly Library seam changed: ut dependencies drifted.');
  }
  return found;
}

function installedOpenHandler(program) {
  const found = openHandler(program);
  const { callback, dependencies, detailParam } = found;
  const guard = callback.body?.body?.[0];
  if (guard?.type !== 'IfStatement' || guard.test?.callee?.name !== OPEN_HELPER
    || guard.test.arguments.length !== 1 || guard.test.arguments[0]?.name !== detailParam
    || guard.consequent?.type !== 'ReturnStatement' || callback.body.body.length !== 3
    || dependencies.elements.map(item => item?.name).join(',') !== 'Ye,Qe,n') {
    throw new Error('Native assembly Library seam changed: jF ut no longer forwards the full detail to LCOSNativeAssemblyOpen.');
  }
  return found;
}

function librarySurface(program, installed) {
  const component = jFComponent(program);
  const surface = one(nodesMatching(component.body, node => (call(node, 'r', 'jsxs') || call(node, 'r', 'jsx'))
    && objectProperty(node.arguments[1], 'data-library-view')?.value?.value === 'library'),
  'jF original Library view');
  const children = objectProperty(surface.arguments[1], 'children')?.value;
  if (children?.type !== 'ArrayExpression') {
    throw new Error('Native assembly Library seam changed: original Library view children are no longer an array.');
  }
  const expected = ['iF', 'cw'];
  const actual = children.elements.slice(0, expected.length).map(element => {
    if (jsxComponent(element, 'iF')) return 'iF';
    if (jsxComponent(element, TOOLS_COMPONENT)) return TOOLS_COMPONENT;
    if (jsxComponent(element, 'cw')) return 'cw';
    return undefined;
  });
  if (actual.length !== expected.length || actual.some((name, index) => name !== expected[index])) {
    throw new Error('Native assembly Library seam changed: the header/space switch/tool leaf order drifted.');
  }
  if (nodesMatching(component.body, node => jsxComponent(node, TOOLS_COMPONENT)).length) {
    throw new Error('Native assembly Library seam changed: an inspector must not occupy the Library header or list.');
  }
  const passes = nodesMatching(component.body, node => node.type === 'ObjectProperty'
    && propertyName(node.key) === 'onApplyAsset' && node.value?.name === 'ut');
  if (passes.length !== 2) {
    throw new Error('Native assembly Library seam changed: expected the shared original/favorite onApplyAsset handoff.');
  }
  return { component, surface, children };
}

function rowPreview(program, installed) {
  const row = variable(program, 'Zp').init;
  const popover = one(nodesMatching(row.body, node => jsxComponent(node, 'pr')), 'Zp original preview Popover');
  const content = objectProperty(popover.arguments[1], 'content')?.value;
  const preview = installed && content?.type === 'ConditionalExpression' ? content.alternate : content;
  if (!jsxComponent(preview, installed ? TOOLS_COMPONENT : 'TS')
    || objectProperty(preview.arguments[1], 'detail')?.value?.name !== 'T'
    || objectProperty(preview.arguments[1], 'onApply')?.value?.name !== 'g') {
    throw new Error('Native assembly Library seam changed: Zp no longer hosts the original detail preview.');
  }
  if (installed && (objectProperty(preview.arguments[1], 'NativePreview')?.value?.name !== 'TS'
      || objectProperty(preview.arguments[1], 'NativeButton')?.value?.name !== 'em'
      || !jsxComponent(content.consequent, 'TS'))) {
    throw new Error('Native assembly Library seam changed: exact location previews must retain their native pinned preview.');
  }
  const actions = nodesMatching(row.body, node => node.type === 'CallExpression' && node.callee?.name === 'g'
    && node.arguments[0]?.type === 'ObjectExpression');
  if (actions.length !== 2) throw new Error('Native assembly Library seam changed: Zp click/keyboard actions drifted.');
  const menu = one(nodesMatching(row.body, node => jsxComponent(node, 'IS')), 'Zp original asset operations');
  const mouseEnter = objectProperty(popover.arguments[1], 'onMouseEnter')?.value;
  if (!mouseEnter) throw new Error('Native assembly Library seam changed: original row hover handler is missing.');
  return { row, popover, content, preview, actions, menu, mouseEnter };
}

function sUFunction(program) {
  return one(nodesMatching(program, node => node.type === 'FunctionDeclaration'
    && node.id?.name === 'sU'), 'original TS preview state hook sU');
}

function assetDetailRefreshEffect(program) {
  const hook = sUFunction(program);
  const effect = one(nodesMatching(hook.body, node => call(node, 'l', 'useEffect')
    && node.arguments[0]?.type === 'ArrowFunctionExpression'
    && nodesMatching(node.arguments[0].body, child => call(child, 'Ed', 'getAssetDetail')).length === 1),
  'TS getAssetDetail refresh effect');
  const callback = effect.arguments[0];
  if (callback.body?.type !== 'BlockStatement' || effect.arguments[1]?.type !== 'ArrayExpression'
    || effect.arguments[1].elements.length !== 1
    || effect.arguments[1].elements[0]?.type !== 'MemberExpression'
    || effect.arguments[1].elements[0].object?.name !== 't'
    || propertyName(effect.arguments[1].elements[0].property) !== 'id') {
    throw new Error('Native assembly Library seam changed: the original detail refresh effect or id dependency drifted.');
  }
  return { hook, effect, callback, detailParam: hook.params[0]?.name };
}

function originalAssetDetailRefresh(program) {
  const found = assetDetailRefreshEffect(program);
  if (found.detailParam !== 'e' || found.callback.body.body[0]?.type !== 'VariableDeclaration'
    || found.callback.body.body[0].declarations[0]?.id?.name !== 'o'
    || found.callback.body.body[0].declarations[0]?.init?.type !== 'UnaryExpression'
    || found.callback.body.body[0].declarations[0].init.operator !== '!'
    || found.callback.body.body[0].declarations[0].init.argument?.value !== 1) {
    throw new Error('Native assembly Library seam changed: original detail refresh no longer starts with its cancellation flag.');
  }
  return found;
}

function installedAssetDetailRefresh(program) {
  const found = assetDetailRefreshEffect(program);
  const guard = found.callback.body.body[0];
  if (guard?.type !== 'IfStatement' || guard.test?.type !== 'CallExpression'
    || guard.test.callee?.name !== PINNED_HELPER || guard.test.arguments[0]?.name !== found.detailParam
    || guard.consequent?.type !== 'ReturnStatement' || guard.consequent.argument) {
    throw new Error('Native assembly Library seam changed: pinned detail refresh guard drifted.');
  }
  if (found.callback.body.body[1]?.type !== 'VariableDeclaration'
    || found.callback.body.body[1].declarations[0]?.id?.name !== 'o') {
    throw new Error('Native assembly Library seam changed: ordinary asset refresh path was replaced.');
  }
  return found;
}

function detailButton(program, installed) {
  const preview = variable(program, 'TS');
  if (preview.init?.type !== 'ArrowFunctionExpression') {
    throw new Error('Native assembly Library seam changed: TS is no longer the original detail preview.');
  }
  const detailProperty = preview.init.params[0]?.properties?.find(property => propertyName(property.key) === 'detail');
  const applyProperty = preview.init.params[0]?.properties?.find(property => propertyName(property.key) === 'onApply');
  const detailParam = detailProperty?.value?.name;
  const applyParam = applyProperty?.value?.name;
  if (detailParam !== 'e' || applyParam !== 't') {
    throw new Error('Native assembly Library seam changed: TS detail/onApply prop bindings drifted.');
  }
  const button = one(nodesMatching(preview.init.body, node => call(node, 'r', 'jsx')
    && node.arguments[0]?.type === 'StringLiteral' && node.arguments[0].value === 'button'
    && isApplyToCanvasButton(node.arguments[1], detailParam, applyParam)),
  'original TS Apply to Canvas button');
  const conditional = installed ? one(nodesMatching(preview.init.body, node => node.type === 'ConditionalExpression'
    && node.alternate === button), 'pinned-only TS Apply suppression') : undefined;
  const children = nodesMatching(preview.init.body, node => node.type === 'ArrayExpression'
    && node.elements.includes(installed ? conditional : button));
  if (children.length !== 1 || children[0].elements.at(-1) !== (installed ? conditional : button)) {
    throw new Error('Native assembly Library seam changed: TS Apply button is no longer the final preview action.');
  }
  if (installed) {
    if (conditional.test?.type !== 'CallExpression' || conditional.test.callee?.name !== PINNED_HELPER
      || conditional.test.arguments[0]?.name !== detailParam || conditional.consequent?.name !== 'LCOSActions'
      || !preview.init.params[0].properties.some(property => propertyName(property.key) === 'lcosActions' && property.value?.name === 'LCOSActions')) {
      throw new Error('Native assembly Library seam changed: pinned TS Apply suppression drifted.');
    }
  } else {
    const conditionals = nodesMatching(preview.init.body, node => node.type === 'ConditionalExpression'
      && node.alternate === button);
    if (conditionals.length) throw new Error('Native assembly Library seam changed: TS Apply button is already conditional.');
  }
  return { preview, button, detailParam, applyParam };
}

function isApplyToCanvasButton(props, detailParam, applyParam) {
  const click = objectProperty(props, 'onClick')?.value;
  const title = objectProperty(props, 'children')?.value;
  const clickObject = click?.type === 'ArrowFunctionExpression' ? click.body?.arguments?.[0] : undefined;
  const spread = clickObject?.type === 'ObjectExpression' ? clickObject.properties[0] : undefined;
  const assetProperty = clickObject?.type === 'ObjectExpression' ? clickObject.properties[1] : undefined;
  return click?.type === 'ArrowFunctionExpression'
    && click.body?.type === 'CallExpression' && click.body.callee?.name === applyParam
    && click.body.arguments.length === 1 && spread?.type === 'SpreadElement'
    && spread.argument?.name === detailParam
    && assetProperty?.type === 'ObjectProperty' && propertyName(assetProperty.key) === 'asset'
    && assetProperty.value?.name === 'n'
    && title?.type === 'CallExpression' && title.callee?.name === 's'
    && title.arguments[0]?.value === 'library.applyToCanvas';
}

function assertBindings(program, source) {
  variable(program, 'em');
  variable(program, 'TS');
  const helper = one(nodesMatching(program, node => node.type === 'FunctionDeclaration'
    && node.id?.name === PINNED_HELPER), 'pinned detail validator');
  if (source.slice(helper.start, helper.end) !== PINNED_HELPER_SOURCE) {
    throw new Error('Native assembly Library seam is partially installed: pinned detail validator changed.');
  }
  return helper;
}

function ownImport(program) {
  return nodesMatching(program, node => node.type === 'ImportDeclaration'
    && node.source?.value === IMPORT_SOURCE
    && node.specifiers?.some(specifier => specifier.type === 'ImportSpecifier'
      && [OPEN_HELPER, TOOLS_COMPONENT].includes(specifier.imported?.name)));
}

function helperCalls(program, name = OPEN_HELPER) {
  return nodesMatching(program, node => node.type === 'CallExpression'
    && node.callee?.type === 'Identifier' && node.callee.name === name);
}

function assertInstalled(program, source) {
  const imports = ownImport(program);
  const importNode = one(imports, 'owned agent-ui import');
  if (importNode.specifiers.length !== 2
    || importNode.specifiers[0]?.imported?.name !== OPEN_HELPER || importNode.specifiers[0]?.local?.name !== OPEN_HELPER
    || importNode.specifiers[1]?.imported?.name !== TOOLS_COMPONENT || importNode.specifiers[1]?.local?.name !== TOOLS_COMPONENT
    || source.slice(importNode.start, importNode.end) !== IMPORT.trim()) {
    throw new Error('Native assembly Library seam is partially installed: owned import bytes/specifiers changed.');
  }
  assertBindings(program, source);
  const handler = installedOpenHandler(program);
  if (helperCalls(handler.callback.body, OPEN_HELPER).length !== 1 || helperCalls(program, OPEN_HELPER).length !== 3) {
    throw new Error('Native assembly Library seam changed: open helper call escaped the original onApply callback.');
  }
  librarySurface(program, true);
  rowPreview(program, true);
  installedAssetDetailRefresh(program);
  detailButton(program, true);
  if (helperCalls(program, PINNED_HELPER).length !== 2) {
    throw new Error('Native assembly Library seam changed: pinned validator must guard refresh and Apply only.');
  }
  return { importNode, handler, helper: one(nodesMatching(program, node => node.type === 'FunctionDeclaration'
    && node.id?.name === PINNED_HELPER), 'pinned detail validator') };
}

function assertOriginal(program) {
  const imports = ownImport(program);
  const helper = nodesMatching(program, node => node.type === 'FunctionDeclaration' && node.id?.name === PINNED_HELPER);
  const calls = helperCalls(program).concat(helperCalls(program, PINNED_HELPER));
  const leafCalls = nodesMatching(program, node => jsxComponent(node, TOOLS_COMPONENT));
  if (imports.length || helper.length || calls.length || leafCalls.length) {
    throw new Error('Native assembly Library seam is partially installed.');
  }
  originalOpenHandler(program);
  librarySurface(program, false);
  originalAssetDetailRefresh(program);
  detailButton(program, false);
  const helperImportAnchor = one(program.body.filter(node => node.type === 'ImportDeclaration').slice(0, 1), 'first module import');
  return {
    open: openHandler(program),
    surface: librarySurface(program, false),
    row: rowPreview(program, false),
    refresh: originalAssetDetailRefresh(program),
    button: detailButton(program, false),
    importAnchor: helperImportAnchor,
    helperAnchor: sUFunction(program),
  };
}

/** Keep the original Library/list; adapt only its row Popover and preview action slot. */
export function transformNativeAssemblyLibraryScript(filename, source) {
  if (filename.split(/[\\/]/).pop() !== TARGET) return source;
  const program = parseOriginalDonorScript(source, filename);
  const imports = ownImport(program);
  const hasPinnedHelper = nodesMatching(program, node => node.type === 'FunctionDeclaration'
    && node.id?.name === PINNED_HELPER).length > 0;
  const hasOpenCalls = helperCalls(program).length > 0;
  const hasToolCalls = nodesMatching(program, node => jsxComponent(node, TOOLS_COMPONENT)).length > 0;
  if (imports.length || hasPinnedHelper || hasOpenCalls || hasToolCalls) {
    assertInstalled(program, source);
    return source;
  }

  const seams = assertOriginal(program);
  const bodyText = `{if(${OPEN_HELPER}(${seams.open.detailParam}))return;${source.slice(seams.open.callback.body.start + 1, seams.open.callback.body.end - 1)}}`;
  const originalPreview = source.slice(seams.row.content.start, seams.row.content.end);
  const leafText = `T.asset?.lcos_projection?.pinned_revision?${originalPreview}:r.jsx(${TOOLS_COMPONENT},{detail:T,onApply:g,onClose:()=>C(!1),NativeButton:em,NativePreview:TS})`;
  const guardText = `if(${PINNED_HELPER}(${seams.refresh.detailParam}))return;`;
  const applyText = `${PINNED_HELPER}(${seams.button.detailParam})?LCOSActions:${source.slice(seams.button.button.start, seams.button.button.end)}`;
  const edits = [
    { start: seams.open.callback.body.start, end: seams.open.callback.body.end, text: bodyText },
    { start: seams.row.content.start, end: seams.row.content.end, text: leafText },
    ...seams.row.actions.map(action => ({ start: action.start, end: action.end,
      text: `e.lcos_projection&&!e.lcos_projection.pinned_revision?(C(!0),${OPEN_HELPER}(${source.slice(action.arguments[0].start, action.arguments[0].end)})):${source.slice(action.start, action.end)}` })),
    { start: seams.row.menu.start, end: seams.row.menu.end, text: `e.lcos_projection?.pinned_revision?null:${source.slice(seams.row.menu.start, seams.row.menu.end)}` },
    { start: seams.row.mouseEnter.start, end: seams.row.mouseEnter.end, text: `e.lcos_projection&&!e.lcos_projection.pinned_revision?void 0:${source.slice(seams.row.mouseEnter.start, seams.row.mouseEnter.end)}` },
    { start: seams.row.popover.arguments[1].end - 1, end: seams.row.popover.arguments[1].end - 1,
      text: ',trigger:e.lcos_projection&&!e.lcos_projection.pinned_revision?"click":"hover",closeOnOpenOthers:e.lcos_projection?.pinned_revision?!1:void 0' },
    { start: seams.button.preview.init.params[0].end - 1, end: seams.button.preview.init.params[0].end - 1, text: ',lcosActions:LCOSActions' },
    { start: seams.refresh.callback.body.start + 1, end: seams.refresh.callback.body.start + 1, text: guardText },
    { start: seams.button.button.start, end: seams.button.button.end, text: applyText },
    { start: seams.helperAnchor.start, end: seams.helperAnchor.start, text: `${PINNED_HELPER_SOURCE}\n` },
    { start: seams.importAnchor.start, end: seams.importAnchor.start, text: IMPORT },
  ];
  let transformed = source;
  for (const edit of edits.sort((left, right) => right.start - left.start)) {
    transformed = transformed.slice(0, edit.start) + edit.text + transformed.slice(edit.end);
  }
  assertInstalled(parseOriginalDonorScript(transformed, filename), transformed);
  return transformed;
}

/** Restore byte-for-byte to the exact pre-transform page source supplied by the caller. */
export function restoreNativeAssemblyLibraryScriptForComparison(filename, transformed, originalSource) {
  if (filename.split(/[\\/]/).pop() !== TARGET) return transformed;
  if (typeof originalSource !== 'string') {
    throw new TypeError('Native assembly Library restore requires the exact pre-transform source.');
  }
  const expected = transformNativeAssemblyLibraryScript(filename, originalSource);
  if (expected !== transformed) {
    throw new Error('Native assembly Library restore refused: transformed source differs from the exact reversible output.');
  }
  return originalSource;
}
