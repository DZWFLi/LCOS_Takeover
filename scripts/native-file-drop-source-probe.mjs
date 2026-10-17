import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { parseOriginalDonorScript as parse } from '../lab/agent-node-transform.mjs';
import { currentGen2Root } from '../lab/current-gen2-resources.mjs';
const root = path.resolve(import.meta.dirname,'..'), assets = path.join(root,'reference/tapnow-installed/resources/web/assets');
const output = path.join(root,'output/原生文件Drop整合_20261017i/原上传源码摘录.json');
const report = {mode:'local static source only; no donor execution/browser/Core/product mutation',files:{}};
const requests = {
  'page-Da_DfwiK.js':['fH','jF','TF','bB','sm','Sb','n7','o7','r7','a7','J9','Z9','Y9','q9','K9','X9','$9','Fl'],
  'course-api-base-url-CifxI1ia.js':['r4','s4','n4','t4','o4','dBe','iBe','rBe','FFe','kFe','GFe','zfe','DFe','GVe','O3','$O','AFe','MFe','IFe','PFe','zO','UO','HO','fT','LFe'],
  'index-BAQXnPag.js':['DFl','Tor','Ior','Eor'],
  'UnlimitedModeToggle-D4wysAbz.js':[],
  'upload-data-url-DMB2tNMR.js':[],
  'use-chat-attachment-file-input-ajTygSPP.js':[],
};
for (const [name,names] of Object.entries(requests)) {
  const source=await fs.readFile(path.join(assets,name),'utf8'),ast=parse(source,name);
  const declarations=ast.body.flatMap(node=>['FunctionDeclaration','ClassDeclaration'].includes(node.type)?[node]:node.type==='VariableDeclaration'?node.declarations:[]);
  const imports=ast.body.filter(node=>node.type==='ImportDeclaration').flatMap(node=>node.specifiers.map(spec=>({local:spec.local.name,imported:spec.imported?.name,from:node.source.value})));
  const exports=Object.fromEntries(ast.body.filter(node=>node.type==='ExportNamedDeclaration').flatMap(node=>node.specifiers.map(spec=>[spec.exported?.name,spec.local?.name])));
  const needles=['openUploadPicker','uploadFiles','uploadManager','image/*','onDrop','onPaste','clipboardData','readAsText','file.type','upload-urls'];
  const selected=new Set(names),matches={};
  for(const needle of needles){ const found=name==='index-BAQXnPag.js'?[]:declarations.filter(node=>source.slice(node.start,node.end).includes(needle));matches[needle]=found.map(node=>node.id?.name);for(const node of found)selected.add(node.id?.name); }
  const extra=process.argv.find(arg=>arg.startsWith('--extra='))?.slice(8).split(',')??[];extra.forEach(value=>selected.add(value));
  report.files[name]={imports,exports,matches,entries:Object.fromEntries([...selected].flatMap(wanted=>{
    const node=declarations.find(node=>node.id?.name===wanted);return node?[[wanted,{start:node.start,end:node.end,line:node.loc?.start.line,source:source.slice(node.start,node.end)}]]:[];
  }))};
}
const dependencyRequire=createRequire(path.join(currentGen2Root,'package.json'));
try{report.acorn=dependencyRequire.resolve('acorn');}catch{}
await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,JSON.stringify(report,null,2));
console.log(JSON.stringify({output,acorn:report.acorn,files:Object.fromEntries(Object.entries(report.files).map(([name,data])=>[name,{selectedImports:data.imports.filter(value=>['dw','vc','TF'].includes(value.local)),matches:data.matches,entries:Object.keys(data.entries)}]))}));
