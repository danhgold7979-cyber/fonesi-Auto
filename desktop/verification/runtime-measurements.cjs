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
module.exports = { securePreferenceEvidence, preloadEvidence };
