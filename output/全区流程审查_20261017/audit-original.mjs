import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const root='E:/Codex 项目/LCOS夺舍计划_20261013';
const out=path.dirname(fileURLToPath(import.meta.url));
const {parseOriginalDonorScript}=await import(pathToFileURL(root+'/lab/agent-node-transform.mjs'));
const file=root+'/reference/tapnow-installed/resources/web/assets/page-Da_DfwiK.js';
const source=fs.readFileSync(file,'utf8');
const program=parseOriginalDonorScript(source,path.basename(file));
const wanted=new Set(['LF','YT','jF','TS','sU','iF','cw','yFe','yBe','YCe','TFe','oF','Ke','CU','LS','Zp','IS','yk','eP']);
const results=[];const stack=[program];
while(stack.length){const n=stack.pop();if(!n||typeof n.type!=='string')continue;let name=n.type==='FunctionDeclaration'?n.id?.name:n.type==='VariableDeclarator'?n.id?.name:null; if(name&&wanted.has(name)){const code=source.slice(n.start,n.end);results.push({name,type:n.type,start:n.start,end:n.end,bytes:code.length,code});}
 for(const [k,v] of Object.entries(n)){if(k==='loc'||k==='tokens'||k==='comments')continue;if(Array.isArray(v))for(const x of v){if(x?.type)stack.push(x);}else if(v?.type)stack.push(v);}}
fs.writeFileSync(path.join(out,'original-page-components.json'),JSON.stringify(results,null,2));
for(const name of wanted){const r=results.filter(r=>r.name===name).sort((a,b)=>b.bytes-a.bytes)[0];if(r){fs.writeFileSync(path.join(out,'original-'+r.name+'.js'),r.code);console.log(JSON.stringify({name:r.name,bytes:r.bytes,head:r.code.slice(0,360)}));}}
for(const [asset,names] of [['agent-host-provider-uVo_bky5.js',['hD','wM','U5','uv','Bl','Gy','FM','Dy']],['course-api-base-url-CifxI1ia.js',['yFe','i3','h5','JT','yBe','UVe']]]){
 const content=fs.readFileSync(root+'/reference/tapnow-installed/resources/web/assets/'+asset,'utf8');
 const ast=parseOriginalDonorScript(content,asset);const todo=[ast];const found=[];
 while(todo.length){const n=todo.pop();if(!n?.type)continue;const name=n.type==='FunctionDeclaration'?n.id?.name:n.type==='VariableDeclarator'?n.id?.name:null;
 if(names.includes(name))found.push({name,bytes:n.end-n.start,code:content.slice(n.start,n.end)});
 for(const [k,v] of Object.entries(n)){if(['loc','tokens','comments'].includes(k))continue;if(Array.isArray(v)){for(const x of v)if(x?.type)todo.push(x);}else if(v?.type)todo.push(v);}}
 for(const name of names){const r=found.filter(r=>r.name===name).sort((a,b)=>b.bytes-a.bytes)[0];if(r){fs.writeFileSync(path.join(out,'original-'+name+'.js'),r.code);console.log(JSON.stringify({asset,name,bytes:r.bytes,head:r.code.slice(0,200)}));}}
}

