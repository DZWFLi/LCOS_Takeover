import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root='E:/Codex 项目/LCOS夺舍计划_20261013';
const out=path.dirname(fileURLToPath(import.meta.url));
const skip=new Set(['.git','node_modules','.runtime','dist','build','.cache','.venv']);
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>skip.has(e.name)?[]:e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}
const rows=[];
for(const file of walk(root)){
 const rel=path.relative(root,file).replaceAll('\\','/');
 if(!/\.(?:[cm]?[jt]sx?|css|html|md|json)$/.test(file))continue;
 const stat=fs.statSync(file);
 const category=rel.startsWith('reference/')?'TapNow 原件':rel.startsWith('lcos/')?'LCOS 副本':rel.startsWith('lab/')?'接管实现':rel.startsWith('scripts/')?'脚本与验证':'文档及其他';
 const row={path:rel,category,bytes:stat.size,modified:stat.mtime.toISOString()};
 if(category==='接管实现'||category==='LCOS 副本'&&/\.(?:tsx|jsx)$/.test(file)){
  const lines=fs.readFileSync(file,'utf8').split(/\r?\n/);
  row.uiEvidence=lines.flatMap((s,i)=>/createPortal|createRoot|openWindow\(|openReader\(|role=["']dialog|ProfessionalWindowStage|ContextAtlasStage|WorkflowHandView|RailwayPeek|MindMapEditor|<NativeRenderer|<NativeToolbar|<NativePreview/.test(s)?[{line:i+1,text:s.trim().slice(0,260)}]:[]);
  row.imports=lines.flatMap((s,i)=>/from ['"].*(?:lcos|native-|professional|ui\/|nodes\/)/.test(s)?[{line:i+1,text:s.trim()}]:[]);
 }
 rows.push(row);
}
fs.writeFileSync(path.join(out,'workspace-file-census.json'),JSON.stringify({root,generatedAt:new Date().toISOString(),excluded:[...skip],note:'文件登记与命中索引，不等于每个函数均已运行或逐行审读。',files:rows},null,2));
const summary=Object.fromEntries([...new Set(rows.map(x=>x.category))].map(c=>[c,rows.filter(x=>x.category===c).length]));
const evidence=rows.filter(x=>x.uiEvidence?.length).map(x=>'## '+x.path+'\n\n'+x.uiEvidence.map(h=>'- L'+h.line+': `'+h.text.replaceAll('`','\\`')+'`').join('\n')).join('\n\n');
fs.writeFileSync(path.join(out,'GUI入口代码索引.md'),'# GUI 入口代码索引\n\n自动扫描范围：lab 与 LCOS 副本 TSX/JSX；不是运行通过声明。\n\n'+evidence+'\n');
fs.writeFileSync(path.join(out,'census-summary.json'),JSON.stringify(summary,null,2));
console.log(JSON.stringify(summary));
