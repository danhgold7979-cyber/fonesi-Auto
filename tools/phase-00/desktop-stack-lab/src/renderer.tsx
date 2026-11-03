import { createRoot } from 'react-dom/client';
const target = document.getElementById('root');
if (!target) throw new Error('LAB_ROOT_MISSING');
createRoot(target).render(<main><h1>Disposable feasibility lab</h1>
  <p id="ready">Synthetic lab — not Fonesi-Auto UI</p></main>);
