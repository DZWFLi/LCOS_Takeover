import { parseOriginalDonorScript } from './agent-node-transform.mjs';
import { nativeLightClassNames } from './native-light-theme-transform.mjs';

const COURSE_TARGET = 'course-api-base-url-CifxI1ia.js';
const PAGE_TARGET = 'page-Da_DfwiK.js';
const UI_IMPORT_SOURCE = '/lcos/native-pile-ui.js';
const SHELL = 'LCOSNativePileCollectionShell';
const DISPLAY = 'LCOSNativePileDisplay';
const OPERATION = 'LCOSNativePileOperation';
const TITLE_COMMIT = 'LCOSNativePileTitleCommit';
const TOOLS_PROP = 'lcosCollectionTools';
const COMMIT_PROP = 'lcosCollectionCommit';
const CHANGE_GUARD = 'LCOSNativePileChangeGuardNodes';
const CANONICAL_CHANGES = 'LCOSNativePileCanonicalChanges';
const PILE_FACE_PROP = 'lcosCollectionFace';
const GALLERY_PROP = 'lcosCollectionGallery';
const GALLERY_READ = 'LCOSUseNativePileGallery';
const PILE_WRAPPER = 'LCOSNativePileCollectionNodeRenderer';
const GROUP_WRAPPER = 'LCOSNativePileCollectionGroupRenderer';
const COURSE_IMPORT = `import{${SHELL},${DISPLAY},${TITLE_COMMIT},${CHANGE_GUARD},${CANONICAL_CHANGES},${GALLERY_READ}}from"${UI_IMPORT_SOURCE}";\n`;
const PAGE_IMPORT = `import{${OPERATION}}from"${UI_IMPORT_SOURCE}";\n`;
const WRAPPERS = `const ${PILE_WRAPPER}=d.memo(e=>a.jsx(${SHELL},{nativeProps:e,NativeRenderer:yFe,NativeTitle:h5,NativeToolbar:JT,nodeKind:"pile"}));\nconst ${GROUP_WRAPPER}=d.memo(e=>a.jsx(${SHELL},{nativeProps:e,NativeRenderer:i3,NativeTitle:h5,NativeToolbar:JT,nodeKind:"group"}));\n`;

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
  if (items.length !== 1) {
    throw new Error(`Native Pile Collection seam changed: expected one ${label}, got ${items.length}.`);
  }
  return items[0];
}

function ownedImport(program) {
  return matching(program, node => node.type === 'ImportDeclaration'
    && node.source?.value === UI_IMPORT_SOURCE);
}

function importNames(node) {
  return node.specifiers
    .filter(specifier => specifier.type === 'ImportSpecifier')
    .map(specifier => `${specifier.imported?.name}:${specifier.local?.name}`);
}

function assertOwnedImport(program, expectedNames) {
  const declaration = one(ownedImport(program), 'LCOS native Pile UI import');
  if (JSON.stringify(importNames(declaration)) !== JSON.stringify(expectedNames.map(name => `${name}:${name}`))) {
    throw new Error('Native Pile Collection seam changed: owned UI import specifiers drifted.');
  }
  return declaration;
}

function topLevelDeclaration(program, name, kind = 'VariableDeclarator') {
  return one(program.body.flatMap(statement => statement.type === 'VariableDeclaration'
    ? statement.declarations : []).filter(declaration => declaration.type === kind
    && declaration.id?.type === 'Identifier' && declaration.id.name === name), `top-level ${name}`);
}

function functionDeclaration(program, name) {
  return one(program.body.filter(statement => statement.type === 'FunctionDeclaration'
    && statement.id?.name === name), `function ${name}`);
}

function registryEntry(registry, typeName) {
  return one(registry.init.properties.filter(property => property.type === 'ObjectProperty'
    && property.computed && property.key?.type === 'MemberExpression'
    && property.key.object?.name === 'ye' && property.key.property?.name === typeName),
  `nodeTypes ${typeName} renderer`);
}

function wrapperCall(wrapper, renderer, kind) {
  const init = wrapper.init;
  if (init?.type !== 'CallExpression' || init.callee?.type !== 'MemberExpression'
    || init.callee.object?.name !== 'd' || init.callee.property?.name !== 'memo'
    || init.arguments[0]?.type !== 'ArrowFunctionExpression') {
    throw new Error(`Native Pile Collection seam changed: ${wrapper.id?.name} is not a stable memo wrapper.`);
  }
  const calls = matching(init.arguments[0].body, node => node.type === 'CallExpression'
    && node.callee?.type === 'MemberExpression' && node.callee.property?.name === 'jsx'
    && node.arguments[0]?.type === 'Identifier' && node.arguments[0].name === SHELL);
  const call = one(calls, `${kind} Collection shell call`);
  const props = call.arguments[1];
  const prop = key => props?.type === 'ObjectExpression'
    ? props.properties.find(item => item.type === 'ObjectProperty' && item.key?.name === key)?.value
    : undefined;
  if (prop('nativeProps')?.type !== 'Identifier' || prop('NativeRenderer')?.name !== renderer
    || prop('NativeTitle')?.name !== 'h5' || prop('NativeToolbar')?.name !== 'JT'
    || prop('nodeKind')?.type !== 'StringLiteral' || prop('nodeKind').value !== kind) {
    throw new Error(`Native Pile Collection seam changed: ${kind} wrapper lost its original renderer/title/toolbar.`);
  }
  return call;
}

function objectProperty(object, name) {
  return object?.type === 'ObjectExpression'
    ? object.properties.find(property => property.type === 'ObjectProperty' && property.key?.name === name)
    : undefined;
}

function stringLiteral(node, value) {
  return node?.type === 'StringLiteral' && node.value === value;
}

function galleryReadSeams(program, source, installed) {
  const pile = functionDeclaration(program, 'yFe'), view = functionDeclaration(program, 'LVe'), gallery = functionDeclaration(program, 'tFe');
  const declarator = (root, name) => one(matching(root, node => node.type === 'VariableDeclarator' && node.id?.name === name), name + ' Gallery owner');
  const open = declarator(pile, 'ae').init;
  const startGuard = open.arguments[0].body.body[0];
  const call = one(matching(open, node => node.type === 'CallExpression' && node.callee?.name === 'm'), 'original Gallery session open');
  const viewRead = declarator(view, 'r');
  const viewCall = one(matching(view, node => node.type === 'CallExpression' && node.arguments[0]?.name === 'tFe'), 'original Gallery instance');
  const transition = one(matching(view, node => node.type === 'CallExpression' && node.callee?.name === 'iFe'), 'original Gallery physical handoff');
  const drag = declarator(gallery, 'Mt').init;
  const escape = declarator(gallery, 'pe').init;
  const item = one(matching(gallery, node => node.type === 'CallExpression' && node.arguments[0]?.name === 'vDe'), 'original Gallery item');
  const root = one(matching(gallery, node => node.type === 'CallExpression' && node.arguments[0]?.value === 'div'
    && node.arguments[1]?.properties?.some(prop => prop.key?.value === 'data-pile-gallery-phase')), 'original Gallery dialog');
  const content = objectProperty(root.arguments[1], 'children').value;
  const viewport = one(matching(gallery, node => node.type === 'CallExpression' && node.arguments[0]?.value === 'div'
    && node.arguments[1]?.properties?.some(prop => prop.key?.value === 'data-pile-gallery-viewport')), 'original Gallery viewport');
  const viewportContent = objectProperty(viewport.arguments[1], 'children').value;
  const hit = one(matching(gallery, node => ['CallExpression', 'OptionalCallExpression'].includes(node.type)
    && node.callee?.property?.name === 'closest' && node.arguments[0]?.value === '[data-pile-gallery-item]'), 'original Gallery outside-click owner');
  if (startGuard?.type !== 'IfStatement' || !startGuard.consequent || content.type !== 'ArrayExpression')
    throw new Error('Native Pile Collection original Gallery guard/content changed.');
  if (installed) {
    if (!pile.params[0].properties.some(prop => prop.key?.name === GALLERY_PROP)
      || !objectProperty(call.arguments[0], GALLERY_PROP)
      || !matching(view, node => node.type === 'CallExpression' && node.callee?.name === GALLERY_READ).length
      || !objectProperty(viewCall.arguments[1], 'lcosCollectionContent')
      || !gallery.params[0].properties.some(prop => prop.key?.name === 'lcosCollectionSpatialReadOnly')
      || !matching(viewportContent, node => node?.name === 'lcosCollectionContent').length)
      throw new Error('Native Pile Collection original Gallery read slots are partially installed.');
    return [];
  }
  const text = node => source.slice(node.start, node.end), replace = (node, next) => ({ start: node.start, end: node.end, text: next });
  const slotProps = viewCall.arguments[1];
  const members = objectProperty(slotProps, 'members').value, snapshot = objectProperty(slotProps, 'snapshot').value;
  const eligible = objectProperty(transition.arguments[0], 'eligible').value;
  const canDrag = objectProperty(item.arguments[1], 'canDrag').value;
  return [
    replace(startGuard.test, `!B||(!${GALLERY_PROP}&&S.length===0)||g||!s.current`),
    { start: call.arguments[0].end - 1, end: call.arguments[0].end - 1, text: `,${GALLERY_PROP}` },
    { start: open.arguments[1].end - 1, end: open.arguments[1].end - 1, text: `,${GALLERY_PROP}` },
    { start: viewRead.end, end: viewRead.end,
      text: `,LCOSGalleryRead=${GALLERY_READ}(e,r),LCOSGalleryMembers=LCOSGalleryRead?LCOSGalleryRead.nodes.map(LCOSNode=>Ep(LCOSNode,e.sourceImageVariant)):r` },
    replace(members, 'LCOSGalleryMembers'),
    replace(snapshot, 'LCOSGalleryRead?{...e.snapshot,sources:_3(LCOSGalleryMembers,e.snapshot.sourceGeometry)}:e.snapshot'),
    replace(eligible, '(' + text(eligible) + ')&&!LCOSGalleryRead'),
    { start: slotProps.end - 1, end: slotProps.end - 1,
      text: ',lcosCollectionContent:LCOSGalleryRead?.content,lcosCollectionSpatialReadOnly:!!LCOSGalleryRead' },
    { start: gallery.params[0].end - 1, end: gallery.params[0].end - 1, text: ',lcosCollectionContent,lcosCollectionSpatialReadOnly' },
    replace(drag.arguments[0].body.body[0].test, 'lcosCollectionSpatialReadOnly||(' + text(drag.arguments[0].body.body[0].test) + ')'),
    { start: drag.arguments[1].end - 1, end: drag.arguments[1].end - 1, text: ',lcosCollectionSpatialReadOnly' },
    replace(canDrag, '!lcosCollectionSpatialReadOnly&&(' + text(canDrag) + ')'),
    replace(hit, '(' + text(hit) + '||(lcosCollectionContent&&Rt?.closest("[data-native-collection-gallery-info], [data-media-viewer]")))'),
    { start: escape.arguments[0].body.start + 1, end: escape.arguments[0].body.start + 1,
      text: 'if(lcosCollectionContent&&document.querySelector("[data-media-viewer]"))return;' },
    { start: escape.arguments[1].end - 1, end: escape.arguments[1].end - 1, text: ',!!lcosCollectionContent' },
    { start: viewportContent.start, end: viewportContent.start,
      text: '((LCOSWorld)=>lcosCollectionContent?[lcosCollectionContent,d.cloneElement(LCOSWorld,{key:"collection-world"})]:LCOSWorld)(' },
    { start: viewportContent.end, end: viewportContent.end, text: ')' },
  ];
}

function pileFaceShape(renderer, installed) {
  const params = renderer.params;
  const props = params[0];
  if (params.length !== 1 || props?.type !== 'ObjectPattern') {
    throw new Error('Native Pile Collection seam changed: yFe props are no longer one destructured object.');
  }
  const slotProps = props.properties.filter(property => property.type === 'ObjectProperty'
    && property.key?.name === PILE_FACE_PROP);
  let slotProp;
  if (installed) {
    slotProp = one(slotProps, 'optional yFe Collection face prop');
    if (slotProp.value?.type !== 'Identifier' || slotProp.value.name !== PILE_FACE_PROP || !slotProp.shorthand) {
      throw new Error('Native Pile Collection seam changed: yFe face slot is no longer an optional shorthand prop.');
    }
  } else if (slotProps.length !== 0) {
    throw new Error('Native Pile Collection seam changed: donor yFe already contains the Collection face slot.');
  }

  const roots = matching(renderer.body, node => node.type === 'CallExpression'
    && node.callee?.type === 'MemberExpression' && node.callee.object?.name === 'a'
    && node.callee.property?.name === 'jsxs' && stringLiteral(node.arguments[0], 'div')
    && objectProperty(node.arguments[1], 'role')?.value?.value === 'button'
    && objectProperty(node.arguments[1], 'onClick')?.value?.name === 'ae'
    && objectProperty(node.arguments[1], 'onKeyDown')?.value?.name === 'ke');
  const root = one(roots, 'original Pile role/button Gallery root');
  const rootProps = root.arguments[1];
  const rootChildren = objectProperty(rootProps, 'children')?.value;
  if (rootChildren?.type !== 'ArrayExpression') {
    throw new Error('Native Pile Collection seam changed: yFe outer toolbar/face children are no longer a stable array.');
  }
  const faceContainers = matching(root, node => node.type === 'CallExpression'
    && node.callee?.type === 'MemberExpression' && node.callee.object?.name === 'a'
    && node.callee.property?.name === 'jsxs' && stringLiteral(node.arguments[0], 'div')
    && objectProperty(node.arguments[1], 'className')?.value?.type === 'ConditionalExpression'
    && objectProperty(node.arguments[1], 'className').value.test?.type === 'LogicalExpression'
    && objectProperty(node.arguments[1], 'className').value.test.operator === '||'
    && objectProperty(node.arguments[1], 'className').value.test.left?.name === 'C'
    && objectProperty(node.arguments[1], 'className').value.test.right?.name === 'z');
  const faceContainer = one(faceContainers, 'original Pile card-face container');
  const faceProperty = objectProperty(faceContainer.arguments[1], 'children');
  const face = faceProperty?.value;
  let fallback = face;
  if (installed) {
    if (face?.type !== 'ConditionalExpression' || face.test?.type !== 'BinaryExpression'
      || face.test.operator !== '===' || face.test.left?.type !== 'Identifier'
      || face.test.left.name !== PILE_FACE_PROP || face.test.right?.type !== 'UnaryExpression'
      || face.test.right.operator !== 'void' || face.test.right.argument?.type !== 'NumericLiteral'
      || face.test.right.argument.value !== 0 || face.alternate?.type !== 'Identifier'
      || face.alternate.name !== PILE_FACE_PROP) {
      throw new Error('Native Pile Collection seam changed: optional face slot no longer selects only the original card-face children.');
    }
    fallback = face.consequent;
  }
  if (fallback?.type !== 'ArrayExpression' || fallback.elements.length !== 2
    || fallback.elements[0]?.type !== 'CallExpression'
    || fallback.elements[0].callee?.type !== 'MemberExpression'
    || fallback.elements[0].callee.object?.name !== 'U'
    || fallback.elements[0].callee.property?.name !== 'map'
    || fallback.elements[1]?.type !== 'LogicalExpression' || fallback.elements[1].operator !== '&&'
    || fallback.elements[1].left?.type !== 'BinaryExpression' || fallback.elements[1].left.operator !== '==='
    || fallback.elements[1].left.left?.type !== 'MemberExpression'
    || fallback.elements[1].left.left.object?.name !== '_'
    || fallback.elements[1].left.left.property?.name !== 'length'
    || fallback.elements[1].left.right?.type !== 'NumericLiteral'
    || fallback.elements[1].left.right.value !== 0) {
    throw new Error('Native Pile Collection seam changed: the exact original member-map/empty-Pile face fallback drifted.');
  }
  const outerRole = objectProperty(rootProps, 'role')?.value;
  const onClick = objectProperty(rootProps, 'onClick')?.value;
  const onKeyDown = objectProperty(rootProps, 'onKeyDown')?.value;
  if (!stringLiteral(outerRole, 'button') || onClick?.name !== 'ae' || onKeyDown?.name !== 'ke'
    || !rootChildren.elements.some(element => element === faceContainer)) {
    throw new Error('Native Pile Collection seam changed: face slot moved outside the original role/button Gallery shell.');
  }
  return { props, slotProp, root, onClick, onKeyDown, faceContainer, faceProperty, face, fallback };
}

function nativeToolbarSeams(program, installed) {
  const pile = functionDeclaration(program, 'yFe');
  const toolbar = functionDeclaration(program, 'gFe');
  const group = topLevelDeclaration(program, 'i3').init;
  const call = (root, name) => one(matching(root, node => node.type === 'CallExpression'
    && node.callee?.property?.name === 'jsx' && node.arguments[0]?.name === name), `original ${name} toolbar slot`);
  const pileCall = call(pile.body, 'gFe');
  const pileTools = objectProperty(call(toolbar.body, 'JT').arguments[1], 'tools').value;
  const groupTools = objectProperty(call(group.body, 'JT').arguments[1], 'tools').value;
  const props = [pile.params[0], toolbar.params[0], group.params[0]];
  for (const prop of props) {
    if (prop?.type !== 'ObjectPattern' || prop.properties.filter(p => p.key?.name === TOOLS_PROP).length !== (installed ? 1 : 0)) {
      throw new Error('Native Pile Collection seam changed: optional original toolbar props drifted.');
    }
  }
  if (installed) {
    if (objectProperty(pileCall.arguments[1], TOOLS_PROP)?.value?.name !== TOOLS_PROP
      || [pileTools, groupTools].some((value, index) => value?.type !== 'ConditionalExpression'
        || value.consequent?.callee?.name !== TOOLS_PROP || value.alternate?.name !== ['i', 'u'][index])) {
      throw new Error('Native Pile Collection seam changed: Collection tools escaped their original toolbar owner.');
    }
  } else if (pileTools?.name !== 'i' || groupTools?.name !== 'u') {
    throw new Error('Native Pile Collection seam changed: original Pile/Group tool arrays drifted.');
  }
  return { props, pileCall, pileTools, groupTools };
}

function installedCourseShape(program) {
  const importNode = assertOwnedImport(program, [SHELL, DISPLAY, TITLE_COMMIT, CHANGE_GUARD, CANONICAL_CHANGES, GALLERY_READ]);
  const pileWrapper = topLevelDeclaration(program, PILE_WRAPPER);
  const groupWrapper = topLevelDeclaration(program, GROUP_WRAPPER);
  const pileRenderer = functionDeclaration(program, 'yFe');
  const pileFace = pileFaceShape(pileRenderer, true);
  wrapperCall(pileWrapper, 'yFe', 'pile');
  wrapperCall(groupWrapper, 'i3', 'group');
  const registry = topLevelDeclaration(program, 'zVe');
  const pileEntry = registryEntry(registry, 'PILE');
  const groupEntry = registryEntry(registry, 'GROUP');
  for (const [entry, wrapper, label] of [[pileEntry, PILE_WRAPPER, 'PILE'], [groupEntry, GROUP_WRAPPER, 'GROUP']]) {
    if (entry.value?.type !== 'CallExpression' || entry.value.callee?.type !== 'MemberExpression'
      || entry.value.callee.object?.name !== 'd' || entry.value.callee.property?.name !== 'memo'
      || entry.value.arguments[0]?.type !== 'Identifier' || entry.value.arguments[0].name !== wrapper) {
      throw new Error(`Native Pile Collection seam changed: ${label} registry no longer uses its stable wrapper.`);
    }
  }

  const bve = functionDeclaration(program, 'BVe');
  const displayCalls = matching(bve.body, node => node.type === 'CallExpression'
    && node.callee?.type === 'Identifier' && node.callee.name === DISPLAY);
  const displayCall = one(displayCalls, 'display-only Pile projection modifier');
  const returnStatement = one(bve.body.body.filter(statement => statement.type === 'ReturnStatement'),
    'BVe display return');
  const originalProjection = displayCall.arguments[1];
  if (returnStatement.argument !== displayCall || displayCall.arguments.length !== 3 || displayCall.arguments[2]?.name !== 'Ep'
    || displayCall.arguments[0]?.type !== 'Identifier' || displayCall.arguments[0].name !== 'e'
    || originalProjection?.type !== 'CallExpression' || originalProjection.callee?.name !== 'wFe'
    || originalProjection.arguments[0]?.name !== 's' || originalProjection.arguments[1]?.name !== 'n') {
    throw new Error('Native Pile Collection seam changed: display modifier no longer wraps exact BVe→wFe output.');
  }
  const titleRenderer = topLevelDeclaration(program, 'Aie');
  const titleEditor = one(matching(titleRenderer.init.body, node => node.type === 'ConditionalExpression'
    && node.consequent?.type === 'CallExpression' && node.consequent.callee?.property?.name === 'jsx'
    && node.consequent.arguments[0]?.name === 'kie'), 'original title editor choice');
  const titleHook = objectProperty(titleEditor.consequent.arguments[1], COMMIT_PROP)?.value;
  if (titleEditor.test?.type !== 'LogicalExpression' || titleEditor.test.operator !== '&&'
    || titleEditor.test.left?.name !== 'n' || titleEditor.test.right?.type !== 'LogicalExpression'
    || titleEditor.test.right.operator !== '||' || titleEditor.test.right.left?.name !== 'p'
    || titleHook?.type !== 'CallExpression' || titleHook.callee?.name !== TITLE_COMMIT
    || titleHook.arguments[0]?.callee?.name !== 'c' || titleHook.arguments[0]?.arguments[0]?.name !== 't') {
    throw new Error('Native Pile Collection seam changed: original inline title editor lost its captured Core commit.');
  }
  const inlineEditor = topLevelDeclaration(program, 'kie');
  const commitProp = inlineEditor.init.params[0].properties.find(prop => prop.key?.name === COMMIT_PROP);
  const debounce = one(matching(inlineEditor.init.body, node => node.type === 'CallExpression'
    && node.callee?.name === 'hl'), 'original inline title debounce');
  const dispatch = debounce.arguments[1]?.body?.body[0];
  if (!commitProp || dispatch?.type !== 'IfStatement' || dispatch.test?.name !== COMMIT_PROP
    || !matching(dispatch, node => node.type === 'CallExpression' && node.callee?.name === COMMIT_PROP).length
    || !matching(dispatch, node => node.type === 'ReturnStatement').length) {
    throw new Error('Native Pile Collection seam changed: inline title no longer consumes the Core commit before local Canvas writes.');
  }
  nativeToolbarSeams(program, true);
  galleryReadSeams(program, '', true);
  const memberChangeGuard = functionDeclaration(program, 'jVe');
  const membershipMap = one(memberChangeGuard.body.body.flatMap(statement => statement.type === 'VariableDeclaration'
    ? statement.declarations : []).filter(declaration => declaration.id?.type === 'Identifier'
    && declaration.id.name === 's' && declaration.init?.type === 'MemberExpression'
    && declaration.init.property?.name === 'pileIdByNodeId'), 'original Pile member change-protection map');
  const mapCall = membershipMap.init.object;
  if (mapCall?.type !== 'CallExpression' || mapCall.callee?.name !== 'Ri' || mapCall.arguments.length !== 1
    || mapCall.arguments[0]?.type !== 'CallExpression' || mapCall.arguments[0].callee?.name !== CHANGE_GUARD
    || mapCall.arguments[0].arguments.length !== 2
    || mapCall.arguments[0].arguments[0]?.name !== memberChangeGuard.params[0]?.name
    || mapCall.arguments[0].arguments[1]?.name !== memberChangeGuard.params[1]?.name) {
    throw new Error('Native Pile Collection seam changed: jVe must derive only its pile-protection map from the Core-aware temporary guard input.');
  }
  const canonicalChangesLoop = one(memberChangeGuard.body.body.filter(statement => statement.type === 'ForOfStatement'
    && statement.left?.type === 'VariableDeclaration' && statement.left.declarations.length === 1
    && statement.left.declarations[0].id?.type === 'Identifier' && statement.left.declarations[0].id.name === 'o'),
  'original jVe node-change loop');
  const canonicalInput = canonicalChangesLoop.right;
  if (canonicalInput?.type !== 'CallExpression' || canonicalInput.callee?.name !== CANONICAL_CHANGES
    || canonicalInput.arguments.length !== 2
    || canonicalInput.arguments[0]?.name !== memberChangeGuard.params[0]?.name
    || canonicalInput.arguments[1]?.name !== memberChangeGuard.params[1]?.name) {
    throw new Error('Native Pile Collection seam changed: jVe must filter only its canonical change input with both original arguments.');
  }
  return { importNode, pileWrapper, groupWrapper, registry, bve, displayCall, titleHook, titleEditor,
    memberChangeGuard, membershipMap, canonicalChangesLoop, pileRenderer, pileFace };
}

function callbackDeclarator(canvas, name) {
  return one(canvas.body.body.flatMap(statement => statement.type === 'VariableDeclaration'
    ? statement.declarations : []).filter(node => node.type === 'VariableDeclarator'
    && node.id?.type === 'Identifier' && node.id.name === name), `original Pile ${name} callback`);
}

function callbackArrow(declarator, name) {
  const callback = declarator.init;
  if (callback?.type !== 'CallExpression' || callback.callee?.type !== 'MemberExpression'
    || callback.callee.property?.name !== 'useCallback'
    || callback.arguments[0]?.type !== 'ArrowFunctionExpression') {
    throw new Error(`Native Pile Collection seam changed: original ${name} callback is no longer useCallback.`);
  }
  return callback.arguments[0];
}

function earlyReturn(body, test, expectedValue, label) {
  return one(body.body.filter(statement => statement.type === 'IfStatement'
    && statement.test?.type === 'UnaryExpression' && statement.test.operator === '!'
    && statement.test.argument?.type === 'Identifier' && statement.test.argument.name === test
    && statement.consequent?.type === 'ReturnStatement'
    && (expectedValue === undefined ? statement.consequent.argument == null
      : statement.consequent.argument?.type === 'NullLiteral')),
  `${label} original enabled guard`);
}

function removeMissingMemberGuard(body, memberIdName) {
  const lookup = one(matching(body, node => node.type === 'VariableDeclarator'
    && node.id?.type === 'Identifier' && node.init?.type === 'CallExpression'
    && node.init.callee?.type === 'MemberExpression' && node.init.callee.property?.name === 'find'
    && node.init.arguments[0]?.type === 'ArrowFunctionExpression'
    && matching(node.init.arguments[0].body, child => child.type === 'BinaryExpression'
      && child.operator === '===' && child.left?.type === 'MemberExpression'
      && child.left.property?.name === 'id' && child.right?.type === 'Identifier'
      && child.right.name === memberIdName).length === 1),
  'removeMember current-node identity lookup');
  const lookupName = lookup.id.name;
  const guard = one(body.body.filter(statement => statement.type === 'IfStatement'
    && statement.test?.type === 'UnaryExpression' && statement.test.operator === '!'
    && statement.test.argument?.type === 'Identifier' && statement.test.argument.name === lookupName
    && statement.consequent?.type === 'ReturnStatement'
    && statement.consequent.argument?.type === 'NullLiteral'),
  'removeMember original missing-member refusal');
  return { guard, lookupName };
}

function removeMemberMutationDeclaration(body) {
  const declarations = body.body.flatMap(statement => statement.type === 'VariableDeclaration'
    ? statement.declarations : []);
  const statement = one(body.body.filter(node => node.type === 'VariableDeclaration'
    && node.declarations.some(declaration => declaration.id?.name === 'et')
    && node.declarations.some(declaration => declaration.id?.name === 'lt')),
  'removeMember original geometry/TVe declaration');
  const routeIndex = statement.declarations.findIndex(declaration => declaration.id?.name === 'lt');
  if (routeIndex < 1) throw new Error('Native Pile Collection seam changed: removeMember geometry no longer precedes TVe.');
  const position = one(statement.declarations.filter(declaration => declaration.id?.name === 'et'),
    'removeMember original top-left position');
  const transform = one(declarations.filter(declaration => declaration.id?.name === 'be'),
    'removeMember original flow-position transform');
  const list = one(declarations.filter(declaration => declaration.id?.name === 'De'),
    'removeMember original live node list');
  const tv = statement.declarations[routeIndex];
  if (transform.init?.type !== 'CallExpression' || transform.init.callee?.name !== 'W'
    || position.init?.type !== 'ObjectExpression' || list.init?.type !== 'MemberExpression'
    || list.init.object?.name !== 're' || list.init.property?.name !== 'current'
    || tv.init?.type !== 'CallExpression' || tv.init.callee?.name !== 'FA'
    || tv.init.arguments[0]?.name !== list.id.name || tv.init.arguments[1]?.name !== 'K'
    || tv.init.arguments[2]?.name !== 'ue' || tv.init.arguments[3]?.name !== position.id.name) {
    throw new Error('Native Pile Collection seam changed: removeMember no longer derives original TVe geometry before mutation.');
  }
  return { statement, routeIndex, position: position.id.name, nodes: list.id.name };
}

function installedRemoveMemberMutation(body) {
  const statements = body.body;
  const declarations = statements.flatMap(statement => statement.type === 'VariableDeclaration'
    ? statement.declarations : []);
  const pre = one(statements.filter(statement => statement.type === 'VariableDeclaration'
    && statement.declarations.some(declaration => declaration.id?.name === 'et')
    && !statement.declarations.some(declaration => declaration.id?.name === 'lt')),
  'Core-aware removeMember pre-mutation geometry');
  const position = one(pre.declarations.filter(declaration => declaration.id?.name === 'et'),
    'Core-aware removeMember derived position');
  const nodes = one(declarations.filter(declaration => declaration.id?.name === 'De'),
    'Core-aware removeMember current nodes');
  const preIndex = statements.indexOf(pre);
  const operationStatement = statements[preIndex + 1];
  if (operationStatement?.type !== 'IfStatement' || operationStatement.test?.type !== 'CallExpression'
    || operationStatement.test.callee?.name !== OPERATION) {
    throw new Error('Native Pile Collection seam changed: removeMember Core routing is not between original geometry and TVe.');
  }
  const post = one(statements.filter(statement => statement.type === 'VariableDeclaration'
    && statement.declarations.some(declaration => declaration.id?.name === 'lt')),
  'Core-aware removeMember original TVe call');
  const tv = one(post.declarations.filter(declaration => declaration.id?.name === 'lt'), 'original TVe result');
  const call = operationStatement.test;
  if (tv.init?.type !== 'CallExpression' || tv.init.callee?.name !== 'FA'
    || call.arguments.length !== 5 || call.arguments[0]?.value !== 'removeMember'
    || call.arguments[1]?.name !== nodes.id.name || call.arguments[2]?.name !== 'K'
    || call.arguments[3]?.name !== 'ue' || call.arguments[4]?.name !== position.id.name
    || operationStatement.consequent?.type !== 'ReturnStatement'
    || operationStatement.consequent.argument?.type !== 'NullLiteral') {
    throw new Error('Native Pile Collection seam changed: removeMember routing lost original identity/position or TVe fallback.');
  }
  return { pre, operationStatement, post, position: position.id.name, nodes: nodes.id.name };
}

function pileDropMutationDeclarations(body) {
  const candidates = matching(body, node => node.type === 'VariableDeclarator'
    && node.id?.type === 'Identifier' && node.id.name === 'Ct'
    && node.init?.type === 'ConditionalExpression');
  const merge = one(candidates.filter(declaration => declaration.init.consequent?.type === 'CallExpression'
    && declaration.init.consequent.callee?.name === 'KA'), 'original Pile merge application');
  const add = one(candidates.filter(declaration => declaration.init.consequent?.type === 'CallExpression'
    && declaration.init.consequent.callee?.name === 'ZA'), 'original Pile add-member application');
  const mergeCall = merge.init.consequent;
  const addCall = add.init.consequent;
  const mergeTest = merge.init.test;
  const addTest = add.init.test;
  if (mergeTest?.type !== 'LogicalExpression' || mergeTest.left?.name !== 'Ge'
    || mergeCall.arguments.length !== 4 || mergeCall.arguments[0]?.name !== 'et'
    || mergeCall.arguments[1]?.type !== 'MemberExpression' || mergeCall.arguments[1].object?.name !== 'be'
    || mergeCall.arguments[1].property?.name !== 'sourcePileId'
    || mergeCall.arguments[2]?.type !== 'MemberExpression' || mergeCall.arguments[2].object?.name !== 'Ge'
    || mergeCall.arguments[2].property?.name !== 'targetPileId'
    || addCall.arguments.length !== 4 || addCall.arguments[0]?.name !== 'et'
    || addCall.arguments[1]?.name !== 'lt' || addCall.arguments[2]?.name !== 'Re'
    || addTest?.type !== 'LogicalExpression' || addTest.right?.name !== 'lt') {
    throw new Error('Native Pile Collection seam changed: original add/merge drop identities or guards drifted.');
  }
  return { merge, add };
}

function installedPileDropMutations(body) {
  const candidates = matching(body, node => node.type === 'VariableDeclarator'
    && node.id?.type === 'Identifier' && node.id.name === 'Ct'
    && node.init?.type === 'ConditionalExpression');
  const merge = one(candidates.filter(declaration => declaration.init.test?.type === 'LogicalExpression'
    && declaration.init.test.right?.type === 'CallExpression' && declaration.init.test.right.callee?.name === OPERATION), 'Core-aware merge fallback');
  const add = one(candidates.filter(declaration => declaration.init.test?.type === 'LogicalExpression'
    && declaration.init.consequent?.type === 'ConditionalExpression'), 'Core-aware add fallback');
  const opCalls = [merge, add].flatMap(declaration => matching(declaration.init, node => node.type === 'CallExpression'
    && node.callee?.type === 'Identifier' && node.callee.name === OPERATION));
  const mergeOperationCalls = opCalls.filter(call => call.arguments[0]?.value === 'merge');
  const addOperationCall = one(opCalls.filter(call => call.arguments[0]?.value === 'addMember'),
    'Core-bound add refusal');
  const mergeOperationCall = one(mergeOperationCalls, 'Core merge with source and target');
  if (mergeOperationCall.arguments.length !== 4 || mergeOperationCall.arguments[2]?.object?.name !== 'Ge'
    || mergeOperationCall.arguments[2]?.property?.name !== 'targetPileId'
    || mergeOperationCall.arguments[3]?.object?.name !== 'be' || mergeOperationCall.arguments[3]?.property?.name !== 'sourcePileId'
    || addOperationCall.arguments[2]?.name !== 'lt' || addOperationCall.arguments[3]?.name !== 'Re') {
    throw new Error('Native Pile Collection seam changed: Core add/merge lost its complete original identities.');
  }
  return { merge, add, mergeOperationCalls, addOperationCall };
}

function installedPageShape(program) {
  const importNode = assertOwnedImport(program, [OPERATION]);
  const canvas = functionDeclaration(program, 'bB');
  const unpile = callbackArrow(callbackDeclarator(canvas, 'It'), 'It');
  const remove = callbackArrow(callbackDeclarator(canvas, 'ht'), 'ht');
  const drop = callbackArrow(callbackDeclarator(canvas, 'Rm'), 'Rm');
  const unpileCalls = matching(unpile.body, node => node.type === 'CallExpression'
    && node.callee?.type === 'Identifier' && node.callee.name === OPERATION);
  const removeCalls = matching(remove.body, node => node.type === 'CallExpression'
    && node.callee?.type === 'Identifier' && node.callee.name === OPERATION);
  const unpileCall = one(unpileCalls, 'Core-aware unpile callback');
  const removeCall = one(removeCalls, 'Core-aware removeMember callback');
  const unpileGuard = earlyReturn(unpile.body, 'Oe', undefined, 'unpile');
  const removeGuard = earlyReturn(remove.body, 'Oe', 'null', 'removeMember');
  const unpileStatement = one(unpile.body.body.filter(statement => statement.type === 'IfStatement'
    && statement.test === unpileCall && statement.consequent?.type === 'ReturnStatement'
    && !statement.consequent.argument), 'unpile Core dispatch branch');
  const { guard: removeGuardStatement, lookupName: memberLookupName } = removeMissingMemberGuard(remove.body, remove.params[1]?.name);
  const mutation = installedRemoveMemberMutation(remove.body);
  const removeStatement = mutation.operationStatement;
  const [pileId] = unpile.params;
  const [removePileId, memberId] = remove.params;
  if (unpileGuard.start > unpileStatement.start || unpileStatement.start > unpile.body.end
    || unpileCall.arguments.length !== 3 || unpileCall.arguments[0]?.value !== 'unpile'
    || unpileCall.arguments[1]?.type !== 'MemberExpression'
    || unpileCall.arguments[1].object?.name !== 're' || unpileCall.arguments[1].property?.name !== 'current'
    || unpileCall.arguments[2]?.name !== pileId?.name
    || removeGuard.start > removeGuardStatement.start || removeGuardStatement.start > removeStatement.start
    || removeCall.arguments.length !== 5 || removeCall.arguments[0]?.value !== 'removeMember'
    || removeCall.arguments[1]?.name !== mutation.nodes || removeCall.arguments[2]?.name !== removePileId?.name
    || removeCall.arguments[3]?.name !== memberId?.name || removeCall.arguments[4]?.name !== mutation.position
    || memberLookupName.length === 0) {
    throw new Error('Native Pile Collection seam changed: Core callbacks moved before native guards or lost exact identities.');
  }
  const mutationIndex = remove.body.body.indexOf(mutation.pre);
  if (remove.body.body[mutationIndex + 1] !== removeStatement
    || remove.body.body[mutationIndex + 2] !== mutation.post
    || removeStatement.start <= removeGuardStatement.start) {
    throw new Error('Native Pile Collection seam changed: Core remove dispatch is not after the original position calculation.');
  }
  const dropMutations = installedPileDropMutations(drop.body);
  if (matching(drop.body, node => node.type === 'CallExpression' && node.callee?.name === OPERATION).length !== 2) {
    throw new Error('Native Pile Collection seam changed: add/merge Core dispatch count drifted.');
  }
  return { importNode, canvas, unpile, remove, drop, unpileCall, removeCall, dropMutations };
}

function applyEdits(source, edits) {
  let result = source;
  for (const edit of edits.sort((left, right) => right.start - left.start)) {
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  }
  return result;
}

function transformCourse(source, filename) {
  const program = parseOriginalDonorScript(source, filename);
  const imports = ownedImport(program);
  const hasMarkers = source.includes(SHELL) || source.includes(DISPLAY) || source.includes(CHANGE_GUARD)
    || source.includes(CANONICAL_CHANGES)
    || source.includes(PILE_WRAPPER) || source.includes(GROUP_WRAPPER) || source.includes(PILE_FACE_PROP);
  if (imports.length || hasMarkers) {
    if (imports.length !== 1 || !hasMarkers) throw new Error('Native Pile Collection course seam is partially installed.');
    installedCourseShape(program);
    return source;
  }

  const pile = functionDeclaration(program, 'yFe');
  const pileFace = pileFaceShape(pile, false);
  const group = topLevelDeclaration(program, 'i3');
  if (group.init?.type !== 'ArrowFunctionExpression') {
    throw new Error('Native Pile Collection seam changed: original i3 Group renderer is not an arrow component.');
  }
  const registry = topLevelDeclaration(program, 'zVe');
  const pileEntry = registryEntry(registry, 'PILE');
  const groupEntry = registryEntry(registry, 'GROUP');
  const originalRenderer = (entry, expected) => {
    const value = entry.value;
    if (value?.type !== 'CallExpression' || value.callee?.type !== 'MemberExpression'
      || value.callee.object?.name !== 'd' || value.callee.property?.name !== 'memo'
      || value.arguments[0]?.type !== 'Identifier' || value.arguments[0].name !== expected) {
      throw new Error(`Native Pile Collection seam changed: original ${expected} registry renderer drifted.`);
    }
    return value.arguments[0];
  };
  originalRenderer(pileEntry, 'yFe');
  originalRenderer(groupEntry, 'i3');
  const bve = functionDeclaration(program, 'BVe');
  const bveReturn = one(bve.body.body.filter(statement => statement.type === 'ReturnStatement'), 'original BVe return');
  if (bveReturn.argument?.type !== 'CallExpression' || bveReturn.argument.callee?.name !== 'wFe'
    || bveReturn.argument.arguments.length !== 2 || bveReturn.argument.arguments[0]?.name !== 's'
    || bveReturn.argument.arguments[1]?.name !== 'n') {
    throw new Error('Native Pile Collection seam changed: original BVe→wFe display projection drifted.');
  }
  const memberChangeGuard = functionDeclaration(program, 'jVe');
  const [changeListParam, rawNodesParam] = memberChangeGuard.params;
  if (changeListParam?.type !== 'Identifier' || rawNodesParam?.type !== 'Identifier') {
    throw new Error('Native Pile Collection seam changed: original jVe change/raw-node inputs are unavailable.');
  }
  const membershipMap = one(memberChangeGuard.body.body.flatMap(statement => statement.type === 'VariableDeclaration'
    ? statement.declarations : []).filter(declaration => declaration.id?.type === 'Identifier'
    && declaration.id.name === 's' && declaration.init?.type === 'MemberExpression'
    && declaration.init.property?.name === 'pileIdByNodeId'), 'original jVe Pile member protection map');
  const mapCall = membershipMap.init.object;
  if (mapCall?.type !== 'CallExpression' || mapCall.callee?.name !== 'Ri' || mapCall.arguments.length !== 1
    || mapCall.arguments[0]?.type !== 'Identifier' || mapCall.arguments[0].name !== rawNodesParam.name) {
    throw new Error('Native Pile Collection seam changed: jVe original Pile protection must be derived from Ri(rawNodes).');
  }
  const canonicalChangesLoop = one(memberChangeGuard.body.body.filter(statement => statement.type === 'ForOfStatement'
    && statement.left?.type === 'VariableDeclaration' && statement.left.declarations.length === 1
    && statement.left.declarations[0].id?.type === 'Identifier' && statement.left.declarations[0].id.name === 'o'),
  'original jVe node-change loop');
  if (canonicalChangesLoop.right?.type !== 'Identifier'
    || canonicalChangesLoop.right.name !== changeListParam.name) {
    throw new Error('Native Pile Collection seam changed: original jVe loop no longer iterates the caller change list.');
  }
  const titleRenderer = topLevelDeclaration(program, 'Aie');
  const titleEditor = one(matching(titleRenderer.init.body, node => node.type === 'ConditionalExpression'
    && node.consequent?.type === 'CallExpression' && node.consequent.callee?.property?.name === 'jsx'
    && node.consequent.arguments[0]?.name === 'kie'), 'original selected title editor conditional');
  const originalTitleTest = titleEditor.test;
  if (originalTitleTest?.type !== 'LogicalExpression' || originalTitleTest.operator !== '&&'
    || originalTitleTest.left?.name !== 'n' || originalTitleTest.right?.name !== 'p') {
    throw new Error('Native Pile Collection seam changed: original selected/read-only title gate drifted.');
  }
  const inlineEditor = topLevelDeclaration(program, 'kie');
  const debounce = one(matching(inlineEditor.init.body, node => node.type === 'CallExpression'
    && node.callee?.name === 'hl'), 'original inline title debounce');
  const commit = debounce.arguments[1];
  if (commit?.type !== 'ArrowFunctionExpression' || commit.params[0]?.name !== 'f'
    || commit.body?.type !== 'BlockStatement') throw new Error('Native Pile Collection seam changed: original inline title commit drifted.');
  const toolSeams = nativeToolbarSeams(program, false);
  const importAnchor = one(program.body.filter(node => node.type === 'ImportDeclaration').slice(0, 1), 'first course import');
  const registryDeclaration = one(program.body.filter(statement => statement.type === 'VariableDeclaration'
    && statement.declarations.includes(registry)), 'top-level nodeTypes declaration');

  const edits = [
    { start: pileFace.face.start, end: pileFace.face.end,
      text: `${PILE_FACE_PROP}===void 0?${source.slice(pileFace.fallback.start, pileFace.fallback.end)}:${PILE_FACE_PROP}` },
    { start: pileFace.props.end - 1, end: pileFace.props.end - 1, text: `,${PILE_FACE_PROP},${GALLERY_PROP}` },
    { start: bveReturn.argument.start, end: bveReturn.argument.end,
      text: `${DISPLAY}(e,wFe(s,n),Ep)` },
    { start: pileEntry.value.arguments[0].start, end: pileEntry.value.arguments[0].end, text: PILE_WRAPPER },
    { start: groupEntry.value.arguments[0].start, end: groupEntry.value.arguments[0].end, text: GROUP_WRAPPER },
    { start: titleEditor.test.start, end: titleEditor.test.end,
      text: `n&&(p||${TITLE_COMMIT}(c(t))!==void 0)` },
    { start: titleEditor.consequent.arguments[1].end - 1, end: titleEditor.consequent.arguments[1].end - 1,
      text: `,${COMMIT_PROP}:${TITLE_COMMIT}(c(t))` },
    { start: inlineEditor.init.params[0].end - 1, end: inlineEditor.init.params[0].end - 1, text: `,${COMMIT_PROP}` },
    { start: commit.body.start + 1, end: commit.body.start + 1,
      text: `if(${COMMIT_PROP}){void ${COMMIT_PROP}(f);return}` },
    ...toolSeams.props.map(prop => ({ start: prop.end - 1, end: prop.end - 1, text: `,${TOOLS_PROP}` })),
    { start: toolSeams.pileCall.arguments[1].end - 1, end: toolSeams.pileCall.arguments[1].end - 1,
      text: `,${TOOLS_PROP}` },
    ...[toolSeams.pileTools, toolSeams.groupTools].map(value => ({ start: value.start, end: value.end,
      text: `typeof ${TOOLS_PROP}==="function"?${TOOLS_PROP}(${value.name}):${value.name}` })),
    { start: mapCall.arguments[0].start, end: mapCall.arguments[0].end,
      text: `${CHANGE_GUARD}(${changeListParam.name},${rawNodesParam.name})` },
    { start: canonicalChangesLoop.right.start, end: canonicalChangesLoop.right.end,
      text: `${CANONICAL_CHANGES}(${changeListParam.name},${rawNodesParam.name})` },
    ...galleryReadSeams(program, source, false),
    { start: registryDeclaration.start, end: registryDeclaration.start, text: WRAPPERS },
    { start: importAnchor.start, end: importAnchor.start, text: COURSE_IMPORT },
  ];
  const transformed = applyEdits(source, edits);
  installedCourseShape(parseOriginalDonorScript(transformed, filename));
  return transformed;
}

function transformPage(source, filename) {
  const program = parseOriginalDonorScript(source, filename);
  const imports = ownedImport(program);
  const hasMarkers = source.includes(OPERATION);
  if (imports.length || hasMarkers) {
    if (imports.length !== 1 || !hasMarkers) throw new Error('Native Pile Collection page seam is partially installed.');
    installedPageShape(program);
    return source;
  }

  const canvas = functionDeclaration(program, 'bB');
  const unpileArrow = callbackArrow(callbackDeclarator(canvas, 'It'), 'It');
  const removeArrow = callbackArrow(callbackDeclarator(canvas, 'ht'), 'ht');
  const dropArrow = callbackArrow(callbackDeclarator(canvas, 'Rm'), 'Rm');
  const unpileGuard = earlyReturn(unpileArrow.body, 'Oe', undefined, 'unpile');
  const removeGuard = earlyReturn(removeArrow.body, 'Oe', 'null', 'removeMember');
  removeMissingMemberGuard(removeArrow.body, removeArrow.params[1]?.name);
  const mutation = removeMemberMutationDeclaration(removeArrow.body);
  const dropMutations = pileDropMutationDeclarations(dropArrow.body);
  const mergeCondition = source.slice(dropMutations.merge.init.test.start, dropMutations.merge.init.test.end);
  const mergeCall = source.slice(dropMutations.merge.init.consequent.start, dropMutations.merge.init.consequent.end);
  const addCondition = source.slice(dropMutations.add.init.test.start, dropMutations.add.init.test.end);
  const addCall = source.slice(dropMutations.add.init.consequent.start, dropMutations.add.init.consequent.end);
  const addFallback = source.slice(dropMutations.add.init.alternate.start, dropMutations.add.init.alternate.end);
  const importAnchor = one(program.body.filter(node => node.type === 'ImportDeclaration').slice(0, 1), 'first page import');
  const edits = [
    { start: unpileGuard.end, end: unpileGuard.end,
      text: `if(${OPERATION}("unpile",re.current,${unpileArrow.params[0]?.name}))return;` },
    { start: mutation.statement.start, end: mutation.statement.end,
      text: `${source.slice(mutation.statement.start, mutation.statement.declarations[mutation.routeIndex - 1].end)};`
        + `if(${OPERATION}("removeMember",${mutation.nodes},${removeArrow.params[0]?.name},${removeArrow.params[1]?.name},${mutation.position}))return null;`
        + `const ${source.slice(mutation.statement.declarations[mutation.routeIndex].start, mutation.statement.end)}` },
    { start: dropMutations.merge.init.start, end: dropMutations.merge.init.end,
      text: `(${mergeCondition}&&${OPERATION}("merge",et,Ge.targetPileId,be.sourcePileId)?`
        + `(Be=!0,null):${mergeCondition}?${mergeCall}:null)` },
    { start: dropMutations.add.init.start, end: dropMutations.add.init.end,
      text: `(${addCondition}?(${OPERATION}("addMember",et,lt,Re)?(Be=!0,et):${addCall}):${addFallback})` },
    { start: importAnchor.start, end: importAnchor.start, text: PAGE_IMPORT },
  ];
  const transformed = applyEdits(source, edits);
  installedPageShape(parseOriginalDonorScript(transformed, filename));
  return transformed;
}

/** Repaint only the shipped Gallery surface and explicitly marked Gallery
 * chrome. Original portals, media, geometry, animation and close/navigation
 * handlers stay byte-identical; no second Gallery or global inversion. */
export function transformNativePileGalleryPaintScript(filename, source) {
  const asset = filename.split(/[\\/]/).pop();
  if (asset !== COURSE_TARGET && asset !== PAGE_TARGET) return source;
  const program = parseOriginalDonorScript(source, filename), scopes = [];
  if (asset === COURSE_TARGET) {
    const gallery = functionDeclaration(program, 'tFe');
    const backdrop = one(matching(gallery, node => node.type === 'ObjectProperty' && node.key?.name === 'className'
      && node.value?.type === 'StringLiteral'
      && /^pointer-events-none absolute inset-0 bg-(?:black|background)$/.test(node.value.value)), 'original Gallery backdrop paint');
    if (!matching(gallery, node => node.type === 'ObjectProperty' && node.key?.value === 'data-pile-gallery-phase').length)
      throw new Error('Native Pile Gallery phase/portal owner changed.');
    scopes.push(gallery, functionDeclaration(program, 'bDe'), functionDeclaration(program, 'aDe'));
    if (!backdrop) throw new Error('Native Pile Gallery backdrop unavailable.');
  } else {
    for (const [name, expected] of [['MF', 1], ['H7', 3], ['bW', 1]]) {
      const owner = name === 'bW' ? functionDeclaration(program, name) : topLevelDeclaration(program, name);
      const chrome = matching(owner, node => node.type === 'CallExpression'
        && node.callee?.type === 'MemberExpression' && ['jsx', 'jsxs'].includes(node.callee.property?.name)
        && node.arguments[1]?.type === 'ObjectExpression' && node.arguments[1].properties.some(property =>
          property.type === 'ObjectProperty' && (property.key?.name ?? property.key?.value) === 'data-pile-gallery-chrome'));
      if (chrome.length !== expected) throw new Error(`Native Pile Gallery ${name} chrome paint owner changed.`);
      scopes.push(...chrome);
    }
  }
  const edits = new Map();
  for (const scope of scopes) walk(scope, node => {
    if (node.type !== 'ObjectProperty' || !['className', 'containerClassName', 'contentClassName', 'overlayClassName']
      .includes(node.key?.name ?? node.key?.value)) return;
    walk(node.value, value => {
      if (value.type !== 'StringLiteral') return;
      const next = nativeLightClassNames(value.value);
      if (next !== value.value) edits.set(value.start, { start: value.start, end: value.end, text: JSON.stringify(next) });
    });
  });
  return applyEdits(source, [...edits.values()]);
}

/** Wire original Pile/Group renderers and operation callbacks to the isolated native Collection UI. */
export function transformNativePileCollectionScript(filename, source) {
  if (typeof source !== 'string') throw new TypeError('Native Pile Collection transform expects source text.');
  const basename = filename.split(/[\\/]/).pop();
  if (basename === COURSE_TARGET) return transformNativePileGalleryPaintScript(filename, transformCourse(source, filename));
  if (basename === PAGE_TARGET) return transformNativePileGalleryPaintScript(filename, transformPage(source, filename));
  return source;
}
