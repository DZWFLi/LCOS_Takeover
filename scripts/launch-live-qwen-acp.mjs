import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { prepareNativeProviderMcp } from './prepare-native-provider-mcp.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const runtime=path.join(root,'.runtime','isolated-node-carry-20261020');
const profile=path.join(runtime,'live-provider-profile');

function redactStderr(stream,secret,destination){
 const decoder=new StringDecoder('utf8');let pending='';
 stream.on('data',chunk=>{
  pending+=decoder.write(chunk);
  for(let at=pending.indexOf(secret);at>=0;at=pending.indexOf(secret)){
   destination.write(pending.slice(0,at)+'[REDACTED]');pending=pending.slice(at+secret.length);
  }
  const safeLength=Math.max(0,pending.length-secret.length+1);
  if(safeLength){destination.write(pending.slice(0,safeLength));pending=pending.slice(safeLength);}
 });
 stream.on('end',()=>destination.write((pending+decoder.end()).split(secret).join('[REDACTED]')));
 stream.on('error',()=>destination.write('Real ACP provider error output was unavailable.\n'));
}

function launch(){
 let apiKey;
 try{
  apiKey=JSON.parse(fs.readFileSync(path.join(runtime,'live-provider-private','credentials.json'),'utf8'))?.apiKey;
  if(typeof apiKey!=='string'||!apiKey.trim())throw new Error();
 }catch{
  // JSON parser and filesystem errors may quote private input. Keep them off
  // stderr as well as the ACP stdout channel.
  process.stderr.write('Authorized provider credential is unavailable.\n');process.exitCode=1;return;
 }
 const env={PATH:process.env.PATH,SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR,
  USERPROFILE:profile,HOME:profile,APPDATA:path.join(profile,'roaming'),LOCALAPPDATA:path.join(profile,'local'),
  TEMP:path.join(profile,'temp'),TMP:path.join(profile,'temp'),
  OPENAI_API_KEY:apiKey,OPENAI_BASE_URL:'https://api.deepseek.com/v1',OPENAI_MODEL:'deepseek-chat',NO_COLOR:'1',DO_NOT_TRACK:'1'};
 let child;
 try{
  prepareNativeProviderMcp();
  for(const dir of [profile,env.APPDATA,env.LOCALAPPDATA,env.TEMP])fs.mkdirSync(dir,{recursive:true});
  child=spawn(process.execPath,[path.join(runtime,'live-provider','node_modules','@qwen-code','qwen-code','cli-entry.js'),
   '--acp','--auth-type','openai','--model','deepseek-chat','--approval-mode','default','--telemetry=false'],
   {cwd:process.cwd(),env,stdio:['inherit','inherit','pipe'],windowsHide:true});
 }catch{
  process.stderr.write('Real ACP provider could not prepare or start.\n');process.exitCode=1;return;
 }
 redactStderr(child.stderr,apiKey,process.stderr);
 child.on('error',()=>{process.stderr.write('Real ACP provider could not start.\n');process.exitCode=1;});
 child.on('exit',code=>{process.exitCode=code??1;});
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
}
launch();
