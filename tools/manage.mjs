import {spawn} from 'node:child_process';import path from 'node:path';
const command=process.argv[2],names=['planbord','backoffice'];const children=[];
function run(name,args){return new Promise((resolve,reject)=>{const p=spawn(process.platform==='win32'?'npm.cmd':'npm',args,{cwd:path.resolve('apps',name),stdio:'inherit',env:{...process.env,NEXT_TELEMETRY_DISABLED:'1'}});children.push(p);p.on('exit',c=>c===0?resolve():reject(new Error(name+' exit '+c)));p.on('error',reject);});}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{for(const p of children)p.kill(signal);});
if(command==='start'){await Promise.all(names.map(n=>run(n,['start'])).concat(new Promise((resolve,reject)=>{const p=spawn(process.execPath,['tools/serve-website.mjs'],{stdio:'inherit'});children.push(p);p.on('exit',c=>c===0?resolve():reject(new Error('website exit '+c)));}))).catch(e=>{console.error(e.message);for(const p of children)p.kill();process.exitCode=1;});}
else{const args=command==='install'?['ci']:['run',command];for(const name of names)await run(name,args);}
