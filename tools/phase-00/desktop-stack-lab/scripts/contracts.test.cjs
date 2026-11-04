const test=require('node:test');
const assert=require('node:assert/strict');
// Import only the pure bundled contract; never require Electron main in Node.
const {isHealthRequest}=require('../build/contracts.cjs');
test('valid bounded request',()=>assert.equal(isHealthRequest({version:1,correlation:'lab-positive'}),true));
test('unknown version',()=>assert.equal(isHealthRequest({version:2,correlation:'lab-positive'}),false));
test('unknown privilege or operation fields',()=>{
  for(const extra of ['command','operation','path','secret']) assert.equal(isHealthRequest({version:1,correlation:'lab-test',[extra]:'x'}),false);
});
test('malformed values',()=>{
  for(const value of [null,[],{},true,1,'x']) assert.equal(isHealthRequest(value),false);
});
test('bounded exact correlation',()=>{
  for(const value of ['', 'x'.repeat(10000),'lab-','lab-has space','lab-\n']) assert.equal(isHealthRequest({version:1,correlation:value}),false);
});
test('no coercion',()=>{
  assert.equal(isHealthRequest({version:'1',correlation:'lab-test'}),false);
  assert.equal(isHealthRequest({version:1,correlation:12}),false);
});

const {evaluateRuntimeResult,EXPECTED_CASES}=require('./runtime-result.cjs');
function runtimeFixture(packaged=false){return {passed:true,electron:'45.1.0',mode:packaged?'package':'source',packaged,
  cases:Object.fromEntries(EXPECTED_CASES.map(key=>[key,true]))};}
test('complete failed runtime remains false but is observable',()=>{
  const result=runtimeFixture();result.cases.navigation_denied=false;result.passed=false;
  assert.equal(evaluateRuntimeResult(result,1,'source'),false);
});
test('aggregate requires source and package success',()=>{
  const source=evaluateRuntimeResult(runtimeFixture(),0,'source');
  const packaged=runtimeFixture(true);packaged.cases.navigation_denied=false;packaged.passed=false;
  assert.equal(source && evaluateRuntimeResult(packaged,1,'package'),false);
  assert.equal(source && evaluateRuntimeResult(runtimeFixture(true),0,'package'),true);
});
test('malformed incomplete or wrong runtime evidence stays fail-fast',()=>{
  for(const result of [null,{}, {...runtimeFixture(),electron:'0'}, {...runtimeFixture(),packaged:true},
    {...runtimeFixture(),cases:{}}, {...runtimeFixture(),cases:{...runtimeFixture().cases,navigation_denied:'true'}}]){
    assert.throws(()=>evaluateRuntimeResult(result,0,'source'),/RUNTIME_CHECK_FAILED/);
  }
  assert.throws(()=>evaluateRuntimeResult(runtimeFixture(),null,'source'),/RUNTIME_CHECK_FAILED/);
});
test('failed exit cannot become accepted from true booleans',()=>{
  assert.equal(evaluateRuntimeResult(runtimeFixture(),1,'source'),false);
  assert.equal(evaluateRuntimeResult({...runtimeFixture(),passed:false},0,'source'),false);
});

test('exact named case schema and explicit mode are required',()=>{
  assert.equal(EXPECTED_CASES.length,21);
  const renamed=runtimeFixture();delete renamed.cases.navigation_denied;renamed.cases.unknown=true;
  for(const result of [{...runtimeFixture(),mode:'package'},
    {...runtimeFixture(),cases:Array(21).fill(true)},renamed,
    {...runtimeFixture(),cases:Object.fromEntries(Array.from({length:21},(_,i)=>['unknown_'+i,true]))}]){
    assert.throws(()=>evaluateRuntimeResult(result,0,'source'),/RUNTIME_CHECK_FAILED/);
  }
});
