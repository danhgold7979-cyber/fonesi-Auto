'use strict';
// Disposable synthetic-only crypto probe; never log strings, ciphertext or key material.
const fs=require('node:fs');
const path=require('node:path');
const {classifyDecryptFailure}=require('./result-contract.cjs');
const stage=process.env.FONESI_SECRET_STAGE;
const root=process.env.FONESI_SECRET_RUN;
const token=process.env.FONESI_SECRET_TOKEN;
const corpus=['Synthetic English secret','Tiếng Việt thử nghiệm','Synthetic emoji 🙂'];
const cases=Object.fromEntries(['runtime','owned_profile','async_api','available','baseline','result_shape','no_renderer','orderly_quit'].map(k=>[k,false]));
if(stage==='tamper'){cases.tail_truncation=false;cases.tail_bitflip=false;}
const report={schemaVersion:1,stage,passed:false,electron:process.versions.electron||null,node:process.versions.node,cases,rotationHints:[],failure:null};
let app,emitted=false;
function check(ok){if(!ok)throw new Error('PROBE_ASSERTION_FAILED');}
function boundedRead(file,max){const fd=fs.openSync(file,'r');try{const bytes=Buffer.alloc(max+1);const count=fs.readSync(fd,bytes,0,max+1,0);check(count<=max);return bytes.subarray(0,count);}finally{fs.closeSync(fd);}}
function emit(){if(emitted)return;emitted=true;const json=JSON.stringify(report);check(Buffer.byteLength(json)<=65536);fs.writeSync(1,json+'\n');}
function plainDirectory(dir,create){if(create && !fs.existsSync(dir))fs.mkdirSync(dir);const s=fs.lstatSync(dir);check(s.isDirectory()&&!s.isSymbolicLink());}
async function main(){
 try{
  check(process.platform==='win32'&&process.arch==='x64'&&process.versions.electron==='45.1.0'&&process.versions.node==='24.22.1');
  check(['create','restart','tamper'].includes(stage));
  for(const key of ['NODE_OPTIONS','ELECTRON_RUN_AS_NODE','ELECTRON_FORCE_IS_PACKAGED'])check(process.env[key]===undefined);
  cases.runtime=true;
  check(typeof root==='string'&&path.dirname(root)===path.join(__dirname,'.lab-runs')&&/^run-[a-f0-9-]{36}$/.test(path.basename(root)));
  plainDirectory(root,false);check(typeof token==='string'&&/^[a-f0-9-]{36}$/.test(token)&&boundedRead(path.join(root,'.owner'),64).toString('utf8')===token);
  const electron=require('electron');app=electron.app;
  for(const [key,leaf] of [['userData','profile'],['sessionData','session'],['crashDumps','crashes']]){
   const dir=path.join(root,leaf);plainDirectory(dir,stage==='create');app.setPath(key,dir);
  }
  const logs=path.join(root,'logs');plainDirectory(logs,stage==='create');app.setAppLogsPath(logs);cases.owned_profile=true;
  await app.whenReady();check(electron.BrowserWindow.getAllWindows().length===0);cases.no_renderer=true;
  const ss=electron.safeStorage;
  check(['isAsyncEncryptionAvailable','encryptStringAsync','decryptStringAsync'].every(k=>typeof ss[k]==='function'));cases.async_api=true;
  check(await ss.isAsyncEncryptionAvailable()===true);cases.available=true;
  const ciphertexts=[];
  async function baseline(i,cipher){
   const value=await ss.decryptStringAsync(cipher);
   check(value!==null && typeof value==='object' && !Array.isArray(value) && Object.keys(value).sort().join(',')==='result,shouldReEncrypt');
   check(typeof value.result==='string'&&typeof value.shouldReEncrypt==='boolean'&&value.result===corpus[i]);
   return value.shouldReEncrypt;
  }
  for(let i=0;i<corpus.length;i++){
   const file=path.join(root,'synthetic-'+i+'.bin');let cipher;
   if(stage==='create'){
    check(Buffer.byteLength(corpus[i],'utf8')<=256);cipher=await ss.encryptStringAsync(corpus[i]);
    check(Buffer.isBuffer(cipher)&&cipher.length>=8&&cipher.length<=16384);fs.writeFileSync(file,cipher,{flag:'wx'});
   }else{check(fs.lstatSync(file).isFile()&&!fs.lstatSync(file).isSymbolicLink());cipher=boundedRead(file,16384);check(cipher.length>=8);}
   report.rotationHints.push(await baseline(i,cipher));ciphertexts.push(cipher);
  }
  cases.baseline=true;cases.result_shape=true;
  if(stage==='tamper'){
   for(const kind of ['tail_truncation','tail_bitflip']){
    for(let i=0;i<ciphertexts.length;i++){
     const cipher=ciphertexts[i];await baseline(i,cipher); // Positive control before EVERY negative.
     let altered=Buffer.from(cipher);
     if(kind==='tail_truncation')altered=altered.subarray(0,altered.length-1);else altered[altered.length-1]^=1;
     check(altered.length>0&&altered.subarray(0,3).equals(cipher.subarray(0,3)));
     let denied=false;
     try{await ss.decryptStringAsync(altered);}catch(error){const code=classifyDecryptFailure(error);if(code==='DECRYPT_REJECTED')denied=true;else{report.failure=code;throw new Error('NEGATIVE_NOT_PROVED');}}
     check(denied);
    }
    cases[kind]=true;
   }
  }
  check(electron.BrowserWindow.getAllWindows().length===0);
  // Output at normal lifecycle event, not before quit or an immediate app.exit.
  app.once('will-quit',()=>{cases.orderly_quit=true;report.passed=report.failure===null&&Object.values(cases).every(v=>v===true);emit();});
  app.quit();
 }catch{
  report.failure=report.failure||'PROBE_FAILED';report.passed=false;
  try{emit();}finally{if(app)app.exit(1);else process.exit(1);} // Failure only; never persistence evidence.
 }
}
void main().catch(()=>process.exit(1));
