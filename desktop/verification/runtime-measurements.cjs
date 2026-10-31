'use strict';
// Pure evidence predicates, not a service or a substitute for native observations.
function securePreferenceEvidence(saved, configured, state) {
  return (
    saved.sandbox === true &&
    saved.contextIsolation === true &&
    saved.webSecurity === true &&
    saved.nodeIntegration === false &&
    saved.nodeIntegrationInWorker === false &&
    saved.nodeIntegrationInSubFrames === false &&
    saved.webviewTag === false &&
    saved.allowRunningInsecureContent === false &&
    configured.devTools === false &&
    state.eventObserved === false &&
    state.opened === false &&
    state.contentsAbsent === true
  );
}
function preloadEvidence(configured, registered) {
  return (
    !Object.hasOwn(configured, 'preload') && Array.isArray(registered) && registered.length === 0
  );
}
const VISIBLE_UNAVAILABLE =
  "(() => { const banner=document.querySelector('.top-demo'); return banner !== null && banner.textContent === 'Dịch vụ chưa khả dụng' && banner.getClientRects().length > 0; })()";
const MOUNT_DIAGNOSTICS =
  "(() => { if (!document.getElementById('health-read')) document.getElementById('help-top')?.click(); const read=document.getElementById('health-read'), status=document.getElementById('bridge-status'); return read !== null && status !== null && read.getClientRects().length > 0 && status.getClientRects().length > 0; })()";
module.exports = {
  securePreferenceEvidence,
  preloadEvidence,
  VISIBLE_UNAVAILABLE,
  MOUNT_DIAGNOSTICS,
};
