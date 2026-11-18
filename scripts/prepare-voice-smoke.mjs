// Isolated developer test bundle. Its bootstrap/preload/page are NEVER shipped.
// Runs the shipping main process, scheme handler, CSP, speech worker, archive
// extraction, IndexedDB cache and recognition in an actual Electron renderer.
import { createPackage } from '@electron/asar';
import { build } from 'esbuild';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const stage = path.resolve('.runtime/voice-smoke-stage');
await mkdir(stage, { recursive: true });
await cp('.runtime/app-stage', stage, { recursive: true });
const project = JSON.parse(await readFile(path.join(stage, 'package.json'), 'utf8'));
project.main = 'voice-smoke-bootstrap.cjs';
await writeFile(path.join(stage, 'package.json'), JSON.stringify(project));
await writeFile(path.join(stage, 'dist/ui/index.html'), '<!doctype html><meta charset="utf-8"><title>Hive voice smoke check</title><script src="vosk.js"></script><script src="voice-smoke.js"></script>');
await build({ entryPoints: ['tests/voice-native-renderer.mjs'], bundle: true, format: 'iife', target: 'chrome136', outfile: path.join(stage, 'dist/ui/voice-smoke.js') });
await writeFile(path.join(stage, 'dist/preload.cjs'), `const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('hive',{request(){throw new Error('The smoke check must not request a microphone or account.');},finish(result){ipcRenderer.send('hive:voice-smoke',result);}});\n`);
await writeFile(path.join(stage, 'voice-smoke-bootstrap.cjs'), `const path=require('node:path'),fs=require('node:fs');
const {app,ipcMain,session}=require('electron');
const base=path.dirname(process.execPath),report=path.join(base,'voice-smoke-result.json');
process.env.HIVE_QA_DATA_DIR=fs.mkdtempSync(path.join(base,'isolated-test-'));
let completed=false;const consoleErrors=[];
function finish(result){if(completed)return;completed=true;fs.writeFileSync(report,JSON.stringify({...result,version:app.getVersion(),native_electron:true,fresh_test_profile:true,console_errors:consoleErrors},null,2));app.quit();}
app.on('browser-window-created',(_,window)=>{window.hide();window.webContents.on('console-message',(_,level,message)=>{if(level>=2)consoleErrors.push(String(message).slice(0,500));});window.webContents.on('render-process-gone',(_,details)=>finish({ok:false,error:'Renderer exited: '+details.reason}));});
ipcMain.on('hive:voice-smoke',(event,result)=>{if(!event.senderFrame.url.startsWith('hive://app/'))return;finish(result);});
setTimeout(()=>finish({ok:false,error:'Native voice smoke check timed out.'}),110000).unref();
require('./dist/main.cjs');\n`);
await createPackage(stage, '.runtime/voice-smoke.asar');
console.log('Prepared the native offline voice smoke test.');
