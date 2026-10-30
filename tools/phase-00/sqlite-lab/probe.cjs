'use strict';
// Fixed synthetic engine experiment. No renderer, user input SQL, or production schema.
const fs = require('node:fs');
const path = require('node:path');
const mode = process.env.FONESI_SQLITE_MODE;
const cases = Object.fromEntries(['runtime','module','engine','parameters','bigint','constraints','rollback','commit','wal_reopen','contention','extensions','finalization','no_renderer'].map(k=>[k,false]));
const report = {schemaVersion:1,mode,passed:false,node:process.versions.node,electron:process.versions.electron||null,sqlite:null,cases,failure:null,statementExecutions:0};
let app, db, second;
const root=process.env.FONESI_SQLITE_RUN;
const token=process.env.FONESI_SQLITE_TOKEN;
function check(ok){if(!ok)throw new Error('ASSERTION_FAILED');}
function statement(database,sql,operation){
  check(++report.statementExecutions < 64);
  const stmt=database.prepare(sql);
  check(typeof stmt.close==='function'); // No GC/fallback finalization.
  try{return operation(stmt);}finally{stmt.close();}
}
const one=(database,sql)=>statement(database,sql,s=>s.get());
function exec(database,sql){check(++report.statementExecutions<64);database.exec(sql);}
function denial(operation,code,errcode){
  try{operation();return false;}catch(error){return error instanceof Error && error.code===code && (errcode===undefined || error.errcode===errcode);}
}
async function main(){
 try{
  check(process.platform==='win32' && process.arch==='x64');
  check(['node','electron'].includes(mode));
  for(const key of ['NODE_OPTIONS','ELECTRON_RUN_AS_NODE','ELECTRON_FORCE_IS_PACKAGED'])check(process.env[key]===undefined);
  check(process.versions.node==='24.22.1' && (mode==='node' ? !process.versions.electron : process.versions.electron==='45.1.0'));
  cases.runtime=true;
  check(typeof root==='string' && path.dirname(root)===path.join(__dirname,'.lab-runs') && /^run-[a-f0-9-]{36}$/.test(path.basename(root)));
  check(!fs.lstatSync(root).isSymbolicLink() && fs.lstatSync(root).isDirectory());
  check(typeof token==='string' && /^[a-f0-9-]{36}$/.test(token) && fs.readFileSync(path.join(root,'.owner'),'utf8')===token);
  if(mode==='electron'){
    const electron=require('electron');app=electron.app;
    for(const [key,leaf] of [['userData','profile'],['sessionData','session'],['crashDumps','crashes']]){
      const dir=path.join(root,leaf);fs.mkdirSync(dir);app.setPath(key,dir);
    }
    app.setAppLogsPath(path.join(root,'logs'));
    await app.whenReady();check(electron.BrowserWindow.getAllWindows().length===0);
  }
  const {DatabaseSync}=require('node:sqlite');
  check(typeof DatabaseSync==='function');cases.module=true;
  const filename=path.join(root,'synthetic.db');check(!fs.existsSync(filename));
  const options={allowExtension:false,enableForeignKeyConstraints:true,timeout:100};
  db=new DatabaseSync(filename,options);
  report.sqlite=one(db,'SELECT sqlite_version() AS v').v;
  check(report.sqlite==='3.53.4');cases.engine=true;
  exec(db,'PRAGMA page_size=4096');exec(db,'PRAGMA max_page_count=128');exec(db,'PRAGMA journal_size_limit=524288');
  check(one(db,'PRAGMA page_size').page_size===4096 && one(db,'PRAGMA max_page_count').max_page_count===128);
  check(one(db,'PRAGMA journal_size_limit').journal_size_limit===524288);
  check(one(db,'PRAGMA journal_mode=WAL').journal_mode==='wal');
  exec(db,'PRAGMA foreign_keys=ON');check(one(db,'PRAGMA foreign_keys').foreign_keys===1);
  exec(db,'CREATE TABLE parent(id INTEGER PRIMARY KEY, label TEXT UNIQUE NOT NULL, wide INTEGER) STRICT');
  exec(db,'CREATE TABLE child(id INTEGER PRIMARY KEY, parent_id INTEGER REFERENCES parent(id)) STRICT');
  const corpus=['Tiếng Việt — kiểm tra','English 🙂',"value'); DROP TABLE parent; --"];
  corpus.forEach((value,i)=>statement(db,'INSERT INTO parent(id,label,wide) VALUES(?,?,?)',s=>s.run(i+1,value,9223372036854775807n)));
  cases.parameters=statement(db,'SELECT label FROM parent ORDER BY id',s=>JSON.stringify(s.all().map(r=>r.label))===JSON.stringify(corpus));check(cases.parameters);
  cases.bigint=statement(db,'SELECT wide FROM parent WHERE id=1',s=>{s.setReadBigInts(true);return s.get().wide===9223372036854775807n;});check(cases.bigint);
  check(denial(()=>statement(db,'INSERT INTO child VALUES(?,?)',s=>s.run(1,99)),'ERR_SQLITE_ERROR',787));
  check(denial(()=>statement(db,'INSERT INTO parent(id,label) VALUES(?,?)',s=>s.run(9,corpus[0])),'ERR_SQLITE_ERROR',2067));
  check(one(db,'SELECT count(*) AS n FROM parent').n===3 && one(db,'SELECT count(*) AS n FROM child').n===0);cases.constraints=true;
  const sentinel=new Error('CONTROLLED_ROLLBACK');
  exec(db,'BEGIN');
  try{exec(db,"INSERT INTO parent(id,label) VALUES(4,'rollback')");throw sentinel;}catch(error){exec(db,'ROLLBACK');check(error===sentinel);}
  check(one(db,'SELECT count(*) AS n FROM parent').n===3);cases.rollback=true;
  exec(db,'BEGIN');exec(db,"INSERT INTO parent(id,label) VALUES(4,'committed')");exec(db,'INSERT INTO child VALUES(1,4)');exec(db,'COMMIT');
  check(one(db,'SELECT count(*) AS n FROM parent').n===4 && one(db,'SELECT count(*) AS n FROM child').n===1);cases.commit=true;
  second=new DatabaseSync(filename,options);
  exec(db,'BEGIN IMMEDIATE');
  try{check(denial(()=>exec(second,"INSERT INTO parent(id,label) VALUES(5,'busy')"),'ERR_SQLITE_ERROR',5));}finally{exec(db,'ROLLBACK');}
  exec(second,"INSERT INTO parent(id,label) VALUES(5,'after-lock')");second.close();second=null;
  check(one(db,'SELECT count(*) AS n FROM parent').n===5);cases.contention=true;
  check(denial(()=>db.enableLoadExtension(true),'ERR_INVALID_STATE'));cases.extensions=true;
  db.close();db=null;
  db=new DatabaseSync(filename,options);
  check(one(db,'PRAGMA journal_mode').journal_mode==='wal' && one(db,'PRAGMA integrity_check').integrity_check==='ok');
  check(one(db,'SELECT count(*) AS n FROM parent').n===5 && one(db,'SELECT parent_id AS n FROM child WHERE id=1').n===4 && one(db,'SELECT count(*) AS n FROM child').n===1);
  check(statement(db,'SELECT label FROM parent ORDER BY id',s=>JSON.stringify(s.all().map(r=>r.label))===JSON.stringify([...corpus,'committed','after-lock'])));
  check(statement(db,'SELECT wide FROM parent WHERE id<=3 ORDER BY id',s=>{s.setReadBigInts(true);const rows=s.all();return rows.length===3 && rows.every(r=>r.wide===9223372036854775807n);}));cases.wal_reopen=true;
 }catch(error){report.failure=error?.code==='ERR_UNKNOWN_BUILTIN_MODULE'?'MODULE_UNAVAILABLE':'PROBE_FAILED';}
 finally{
  try{if(second)second.close();if(db)db.close();cases.finalization=true;}catch{report.failure='FINALIZATION_FAILED';}
  cases.no_renderer=mode==='node' ? !process.versions.electron : !!app && require('electron').BrowserWindow.getAllWindows().length===0;
 }
 report.passed=report.failure===null && Object.values(cases).every(v=>v===true);
 const output=JSON.stringify(report);check(Buffer.byteLength(output)<65536);
 process.stdout.write(output+'\n',()=>{if(app)app.exit(report.passed?0:1);else process.exitCode=report.passed?0:1;});
}
void main().catch(()=>{if(app)app.exit(1);else process.exitCode=1;});
