const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawn} = require('node:child_process');
const {evaluateRuntimeResult} = require('./runtime-result.cjs');
if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('WINDOWS_X64_LAB_ONLY');
if (process.env.ELECTRON_RUN_AS_NODE || process.env.NODE_OPTIONS) throw new Error('UNSAFE_RUNTIME_OVERRIDE');
const root = path.resolve(__dirname,'..');
process.chdir(root);
// The PowerShell supervisor owns this root and the suspended Windows Job.
const runRoot=process.env.FONESI_LAB_RUN;
const token=process.env.FONESI_LAB_TOKEN;
if (!runRoot || !token || !/^run-[a-f0-9-]{36}$/.test(path.basename(runRoot)) ||
    path.dirname(runRoot)!==path.join(root,'.lab-runs') ||
    fs.readFileSync(path.join(runRoot,'.owner'),'utf8')!==token) throw new Error('SUPERVISOR_REQUIRED');
const report={scope:'HOSTED_RUNNER_ONLY',passed:false,results:[],cleanup:false};
function hash(file){return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');}
function launch(executable,args,mode){
  return new Promise((resolve,reject)=>{
    const child=spawn(executable,args,{shell:false,stdio:'ignore',windowsHide:true,
      env:{...process.env,FONESI_LAB_RUN:runRoot,FONESI_LAB_TOKEN:token,FONESI_LAB_MODE:mode}});
    let settled=false;
    const fail=code=>{if(!settled){settled=true;clearTimeout(timer);reject(new Error(code));}};
    const timer=setTimeout(()=>{
      // Reject immediately; outer Job supervisor bounds and verifies all descendants.
      fail('LAUNCH_TIMEOUT');
      try{child.kill();}catch{} // Best effort only, never evidence of tree cleanup.
    },30_000);
    child.once('error',()=>fail('LAUNCH_ERROR'));
    child.once('close',code=>{
      clearTimeout(timer);
      if(settled)return;
      settled=true;
      try{
        const result=JSON.parse(fs.readFileSync(path.join(runRoot,mode+'-result.json'),'utf8'));
        report.results.push(result);
        // A complete, well-formed failed assertion set may still inform the package
        // experiment. Launch/parse/version/schema failures remain fail-fast.
        resolve(evaluateRuntimeResult(result,code,mode));
      }catch{reject(new Error('RUNTIME_CHECK_FAILED'));}
    });
  });
}
(async()=>{
  try{
    const dist=path.join(root,'node_modules','electron','dist');
    const sourcePassed=await launch(path.join(dist,'electron.exe'),[root],'source');
    const packaged=path.join(runRoot,'package');
    fs.cpSync(dist,packaged,{recursive:true,errorOnExist:true,force:false});
    const appDir=path.join(packaged,'resources','app');
    fs.mkdirSync(appDir,{recursive:false});
    fs.writeFileSync(path.join(appDir,'package.json'),JSON.stringify({
      name:'fonesi-auto-disposable-lab',version:'0.0.0',main:'build/main.cjs',private:true}));
    fs.cpSync(path.join(root,'build'),path.join(appDir,'build'),{recursive:true,errorOnExist:true,force:false});
    for(const file of ['main.cjs','preload.cjs','renderer.js','index.html','untrusted.html','THIRD_PARTY_NOTICES.txt']){
      if(hash(path.join(root,'build',file))!==hash(path.join(appDir,'build',file))) throw new Error('PACKAGE_COPY_MISMATCH');
    }
    for(const file of ['LICENSE','LICENSES.chromium.html']){
      if(hash(path.join(dist,file))!==hash(path.join(packaged,file))) throw new Error('NOTICE_COPY_MISMATCH');
    }
    report.electronExecutableSha256=hash(path.join(packaged,'electron.exe'));
    const packagePassed=await launch(path.join(packaged,'electron.exe'),[],'package');
    report.passed=sourcePassed && packagePassed;
    if(!report.passed){report.failure='RUNTIME_CHECK_FAILED';process.exitCode=1;}
  }catch(error){
    const codes=['LAUNCH_ERROR','LAUNCH_TIMEOUT','RUNTIME_CHECK_FAILED','PACKAGE_COPY_MISMATCH','NOTICE_COPY_MISMATCH'];
    report.failure=codes.includes(error.message)?error.message:'LAB_IO_FAILED'; process.exitCode=1;
  }
  finally{
    // Supervisor removes this directory only after verified Job cleanup.
    fs.mkdirSync('.lab-results',{recursive:true});
    fs.writeFileSync('.lab-results/results.json',JSON.stringify(report,null,2));
    console.log(JSON.stringify(report));
  }
})();
