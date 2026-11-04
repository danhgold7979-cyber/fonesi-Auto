// Pure evidence-completeness gate; no Electron import or process execution.
const EXPECTED_CASES=Object.freeze([
  'secure_runtime_state','expected_electron_version','package_mode','react_rendered',
  'no_require','no_process','no_preload_canary','bridge_allowlist','no_privileged_methods',
  'spawn_denied','typed_roundtrip',
  ...Array.from({length:7},(_,i)=>'invalid_payload_'+i),
  'window_open_denied','navigation_denied','untrusted_sender_denied',
]);
function evaluateRuntimeResult(result, code, mode) {
  if (!['source','package'].includes(mode) || ![0,1].includes(code) ||
      !result || Array.isArray(result) || typeof result.passed!=='boolean' || result.mode!==mode ||
      !result.cases || Array.isArray(result.cases) || Object.getPrototypeOf(result.cases)!==Object.prototype ||
      Object.keys(result.cases).length!==EXPECTED_CASES.length ||
      !EXPECTED_CASES.every(key=>Object.hasOwn(result.cases,key) && typeof result.cases[key]==='boolean') ||
      result.electron!=='45.1.0' || result.packaged!==(mode==='package')) {
    throw new Error('RUNTIME_CHECK_FAILED');
  }
  return code===0 && result.passed===true && Object.values(result.cases).every(value=>value===true);
}
module.exports={evaluateRuntimeResult,EXPECTED_CASES};
