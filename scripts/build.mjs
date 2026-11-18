import { build } from 'esbuild';
import { copyFile, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { voiceAssets } from './voice-assets.mjs';
await mkdir('dist/ui', { recursive: true });
await build({ entryPoints: ['src/document-main.mjs'], platform: 'node', format: 'cjs', target: 'node24', bundle: true, outfile: 'dist/main.cjs', external: ['electron'],
  banner: { js: '/* Southlake Hive desktop. Auth implementation follows the public SIWC protocol. */\nif(process.env.HIVE_QA_DATA_DIR){try{require("node:fs").mkdirSync(process.env.HIVE_QA_DATA_DIR,{recursive:true});require("node:fs").appendFileSync(require("node:path").join(process.env.HIVE_QA_DATA_DIR,"startup-check.log"),"Main JavaScript started\\n");}catch{}}' } });
await copyFile('src/preload.cjs', 'dist/preload.cjs');
await build({ entryPoints: ['src/documents/worker.mjs'], bundle: true, platform: 'node', format: 'cjs', target: 'node24', external: ['@napi-rs/canvas'], outfile: 'dist/document-worker.cjs' });
await copyFile('node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs', 'dist/pdf.worker.mjs');
for (const folder of ['cmaps','standard_fonts','wasm']) await cp('node_modules/pdfjs-dist/'+folder,'dist/pdf-assets/'+folder,{recursive:true});
await build({ entryPoints: ['ui/documents.mjs'], bundle: true, format: 'iife', target: 'chrome136', outfile: 'dist/ui/app.js' });
await copyFile('ui/index.html', 'dist/ui/index.html');
await copyFile('ui/documents.css', 'dist/ui/styles.css');
const speech = voiceAssets(await readFile('node_modules/vosk-browser/dist/vosk.js', 'utf8'));
await writeFile('dist/ui/vosk.js', speech.client);
await writeFile('dist/ui/voice-worker.js', speech.worker);
await copyFile('node_modules/sql.js/dist/sql-wasm.wasm', 'dist/sql-wasm.wasm');
console.log('Built the standalone Hive application.');
