import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const cache = path.join(process.env.LOCALAPPDATA, 'npm-cache', '_npx');
const babelFile = fs.existsSync(cache)?fs.readdirSync(cache).map(entry => path.join(cache, entry, 'node_modules/playwright/lib/transform/babelBundle.js')).find(file => fs.existsSync(file)):null;
const parserStore='E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926/huabu/node_modules/.pnpm';
const parserPackage=fs.readdirSync(parserStore).find(name=>name.startsWith('@babel+parser@'));
const parse=babelFile?require(babelFile).babelParse:(source=>require(path.join(parserStore,parserPackage,'node_modules/@babel/parser/lib/index.js')).parse(source,{sourceType:'module'}));
const sourceFile = path.join(root, 'reference/tapnow-installed/resources/web/assets/course-api-base-url-CifxI1ia.js');
const source = fs.readFileSync(sourceFile, 'utf8');
const ast = parse(source, sourceFile, true);
const names = ['LX','OX','jX','CT','e4','vT','ZY','XY','_ie','d5','u5'];
const found = new Map();
function visit(node) {
  if (!node?.type) return;
  if (['VariableDeclarator','FunctionDeclaration'].includes(node.type) && names.includes(node.id?.name)) {
    if(found.has(node.id.name))throw new Error('Ambiguous donor symbol '+node.id.name);
    found.set(node.id.name,node);
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) { for (const child of value) if(child?.type) visit(child); }
    else if(value?.type) visit(value);
  }
}
visit(ast);
for (const name of names) if (!found.has(name)) throw new Error('Donor symbol missing: ' + name);
const definitions = names.map(name => { const node = found.get(name); return (node.type === 'VariableDeclarator' ? 'const ' : '') + source.slice(node.start,node.end) + ';'; });
const generated = `// Private local donor study. Direct AST slices, not recovered TSX.\n// TapNow Desktop 0.4.95 / course-api-base-url-CifxI1ia.js.\nexport function createRecoveredNodeLeaves({React:d,jsx:a,cn:ee,useTranslation:Me,Markdown:uW,Icon:c5,Review:xL,status:Oo}) {\nconst fn={CANVAS:{NODE:{TEXT:{TEXT_CONTENT:'canvas-node-text-content'}}}};\n${definitions.join('\n')}\nreturn {TextBody:e4,MarkdownBody:CT,Image:vT,Title:_ie};\n}\n`;
parse(generated, 'recovered-node-leaves.mjs', true);
const output = path.join(root, '.runtime/live-adoption/recovered-node-leaves.mjs');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, generated);
const postcss = createRequire('E:/TRAE项目/LCOS0.1收口/LCOS_GEN2_GUI_RECOVERY_20260926/huabu/apps/web/package.json')('postcss');
const css = postcss.parse(fs.readFileSync(path.join(root, 'reference/tapnow-installed/resources/web/assets/UnlimitedModeToggle-Bb-L28ZM.css'), 'utf8'));
const rules = [];
css.walkRules(rule => { if (rule.selector.includes('.canvas-text-markdown')) rules.push(rule.toString()); });
fs.writeFileSync(path.join(root, '.runtime/live-adoption/recovered-markdown.css'), rules.join('\n'));
const provenance = { owner: 'TapNow', version: 'Desktop 0.4.95', source: path.relative(root, sourceFile), redistributable: 'not-established-private-local-study-only',
  extracted: names.map(name => ({symbol:name,start:found.get(name).start,end:found.get(name).end,type:found.get(name).type})), output: '.runtime/live-adoption/recovered-node-leaves.mjs', bytes:Buffer.byteLength(generated), sameHostReactRequired:true, originalVendorBundleExecuted:false };
fs.writeFileSync(path.join(root, 'evidence/recovered-node-leaves.json'),JSON.stringify(provenance,null,2));
console.log(JSON.stringify({extracted:names,bytes:Buffer.byteLength(generated),markdownRules:rules.length,originalBundleExecuted:false}));
