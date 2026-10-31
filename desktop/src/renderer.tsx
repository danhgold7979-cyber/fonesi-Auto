import { createRoot } from 'react-dom/client';
import { useState } from 'react';

declare global {
  interface Window {
    foundation: Readonly<{ health: () => Promise<string>; settings: () => Promise<string> }>;
  }
}
function Diagnostic() {
  const [status, setStatus] = useState('NOT_READY / UNAVAILABLE');
  async function read(kind: 'health' | 'settings') {
    try {
      // No auto-call/effect/retry. Main independently controls initial admission.
      const response: unknown = JSON.parse(await window.foundation[kind]());
      if (
        response !== null &&
        typeof response === 'object' &&
        'ok' in response &&
        response.ok === true
      )
        setStatus(
          kind === 'health'
            ? 'BRIDGE READY / SERVICES UNAVAILABLE'
            : 'LIGHT / NOT_PERSISTED / REVISION 0',
        );
      else setStatus('REQUEST UNAVAILABLE');
    } catch {
      setStatus('REQUEST UNAVAILABLE');
    }
  }
  return (
    <main>
      <h1>UNAVAILABLE</h1>
      <p>Foundation bridge diagnostic only. This is not the V9 product interface.</p>
      <button
        type="button"
        id="health-read"
        onClick={() => {
          void read('health');
        }}
      >
        Read public health
      </button>
      <button
        type="button"
        id="settings-read"
        onClick={() => {
          void read('settings');
        }}
      >
        Read public settings
      </button>
      <p id="bridge-status" aria-live="polite">
        {status}
      </p>
    </main>
  );
}
const root = document.getElementById('root');
if (root) createRoot(root).render(<Diagnostic />);
