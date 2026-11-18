// Embind in the pinned Vosk build needs dynamic function construction. Permit it
// only in the static speech worker, which has no IPC bridge or Node integration.
export const rendererCSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' blob:; media-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'none'";
export const speechCSP = "default-src 'none'; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'; connect-src 'self' data:; worker-src 'none'; object-src 'none'; base-uri 'none'";
export const cspForPath = pathname => pathname === '/voice-worker.js' ? speechCSP : rendererCSP;
