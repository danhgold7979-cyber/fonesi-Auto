const {test}=require('node:test');const assert=require('node:assert/strict');
const {classifyDecryptFailure:c}=require('./result-contract.cjs');
test('exact native rejection only',()=>assert.equal(c(new Error('Error while decrypting the ciphertext provided to safeStorage.decryptStringAsync.')),'DECRYPT_REJECTED'));
test('unavailable is not tamper denial',()=>assert.equal(c(new Error('safeStorage.decryptStringAsync is temporarily unavailable. Please try again.')),'UNAVAILABLE'));
test('unknown and raw data are not exported',()=>assert.equal(c(new Error('private path or secret')),'UNKNOWN'));
test('forged and wrong error types rejected',()=>{assert.equal(c({name:'Error',message:'Error while decrypting the ciphertext provided to safeStorage.decryptStringAsync.'}),'UNKNOWN');assert.equal(c(new TypeError('Error while decrypting the ciphertext provided to safeStorage.decryptStringAsync.')),'UNKNOWN');});
test('near match not accepted',()=>assert.equal(c(new Error('Error while decrypting the ciphertext provided to safeStorage.decryptStringAsync. ')),'UNKNOWN'));
