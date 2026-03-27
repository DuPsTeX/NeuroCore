// ESM wrapper for sql.js UMD/CJS build
// In Node.js: uses createRequire to load the CJS module
// In Browser: will use script-based loading

let initSqlJs;

if (typeof window !== 'undefined') {
  // Browser: sql.js sets initSqlJs as a global via the UMD pattern
  // SillyTavern loads scripts differently, we use dynamic import
  const scriptUrl = new URL('./sql-wasm.js', import.meta.url).href;
  try {
    const mod = await import(scriptUrl);
    initSqlJs = mod.default || mod.initSqlJs || window.initSqlJs;
  } catch {
    // Fallback: check global
    initSqlJs = window.initSqlJs;
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
