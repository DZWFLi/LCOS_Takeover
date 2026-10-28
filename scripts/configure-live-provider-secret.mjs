import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const label=process.argv.find(value=>value.startsWith('--runtime-label='))?.slice(16);
if(!label||!/^isolated-[a-z0-9][a-z0-9-]{0,100}$/.test(label))throw new Error('Use this workspace isolated runtime.');
const directory=path.join(root,'.runtime',label,'live-provider-private');await fs.mkdir(directory,{recursive:true});
const filename=path.join(directory,'credentials.json');
const probe=process.argv.includes('--probe-input');
if(process.stdin.isTTY){process.stdin.setRawMode(true);process.stdout.write('Credential input ready; echo disabled.\n');}
const value=await new Promise((resolve,reject)=>{let value='';const timeout=setTimeout(()=>reject(new Error('Private input timed out; no credential saved.')),30000);process.stdin.setEncoding('utf8');process.stdin.on('data',chunk=>{value+=chunk;if(value.length>1024){clearTimeout(timeout);reject(new Error('Unexpected credential length.'));return;}if(/[\r\n]/.test(value)){clearTimeout(timeout);process.stdin.pause();resolve(value.split(/[\r\n]/)[0].trim());}});process.stdin.on('end',()=>{clearTimeout(timeout);reject(new Error('No credential received.'));});});
if(probe){console.log(value==='codex-private-stdin-probe'?'Private stdin probe passed; no credential written.':'Private stdin probe failed.');process.exit(value==='codex-private-stdin-probe'?0:1);}
if(typeof value!=='string'||!/^sk-[A-Za-z0-9_-]{16,200}$/.test(value))throw new Error('Credential format was not accepted.');
await fs.writeFile(filename,JSON.stringify({apiKey:value})+'\n',{flag:'wx',mode:0o600});
console.log('Authorized provider credential saved in isolated runtime; value not logged.');
process.exit(0);
