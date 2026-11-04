'use strict';
// Test-only encodings: normalize first, including already-CRLF Windows checkouts.
function workflowEncodings(raw) {
  const lf = raw.replaceAll('\r\n', '\n');
  return [lf, lf.replaceAll('\n', '\r\n')];
}
module.exports = Object.freeze({ workflowEncodings });
