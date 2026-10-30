'use strict';
function classifyDecryptFailure(error){
 if(!(error instanceof Error) || error.name!=='Error')return 'UNKNOWN';
 if(error.message==='Error while decrypting the ciphertext provided to safeStorage.decryptStringAsync.')return 'DECRYPT_REJECTED';
 if(error.message==='safeStorage.decryptStringAsync is temporarily unavailable. Please try again.')return 'UNAVAILABLE';
 return 'UNKNOWN';
}
module.exports={classifyDecryptFailure};
