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
