// ESM wrapper for sql.js
// Browser: loads sql-wasm.js which sets window.initSqlJs
// Node.js: uses createRequire to load the CJS module

let initSqlJs;

if (typeof window !== 'undefined') {
  // Browser: load the UMD sql-wasm.js via script tag (dynamic import won't work for UMD)
  await new Promise((resolve, reject) => {
    // Check if already loaded
    if (window.initSqlJs) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = new URL('./sql-wasm.js', import.meta.url).href;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Failed to load sql-wasm.js'));
    document.head.appendChild(script);
  });
  initSqlJs = window.initSqlJs;
  if (!initSqlJs) {
    throw new Error('[NeuroCore] sql-wasm.js loaded but window.initSqlJs not found');
  }
} else {
  // Node.js: use createRequire to load the CJS module
  const { createRequire } = await import('node:module');
  const { fileURLToPath } = await import('node:url');
  const path = await import('node:path');
  const thisFile = fileURLToPath(import.meta.url);
  const thisDir = path.dirname(thisFile);
  const require = createRequire(thisFile);
  const mod = require(path.join(thisDir, 'sql-wasm.cjs'));
  initSqlJs = mod.default || mod;
}

export default initSqlJs;
