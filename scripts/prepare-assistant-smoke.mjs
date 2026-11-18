// Isolated, nonshipping IPC smoke bundle. Existing-account check is opt-in.
import { createPackage } from '@electron/asar';
import { build } from 'esbuild';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const stage = path.resolve('.runtime/assistant-smoke-stage');
await mkdir(stage, { recursive: true }); await cp('.runtime/app-stage', stage, { recursive: true });
const project = JSON.parse(await readFile(path.join(stage, 'package.json'), 'utf8')); project.main = 'assistant-smoke-bootstrap.cjs';
await writeFile(path.join(stage, 'package.json'), JSON.stringify(project));
await writeFile(path.join(stage, 'dist/ui/index.html'), (await readFile('dist/ui/index.html', 'utf8')).replace('</body>', '<script src="assistant-smoke.js"></script></body>'));
await build({ entryPoints: ['tests/assistant-native-renderer.mjs'], bundle: true, format: 'iife', target: 'chrome136', outfile: path.join(stage, 'dist/ui/assistant-smoke.js') });
await build({ entryPoints: ['tests/native-connection-check.mjs'], bundle: true, platform: 'node', format: 'cjs', external: ['electron'], outfile: path.join(stage, 'connection-check.cjs') });
await writeFile(path.join(stage, 'dist/preload.cjs'), (await readFile('src/preload.cjs', 'utf8')) + '\nrequire("electron").contextBridge.exposeInMainWorld("hiveSmoke",{finish:result=>require("electron").ipcRenderer.send("hive:assistant-smoke",result),checkConnection:()=>require("electron").ipcRenderer.invoke("hive:connection-probe"),phase:()=>require("electron").ipcRenderer.invoke("hive:test-phase"),capture:label=>require("electron").ipcRenderer.invoke("hive:test-capture",label)});\n');
const live = process.argv.includes('--check-existing-connection');
await writeFile(path.join(stage, 'assistant-smoke-bootstrap.cjs'), `const path=require('node:path'),fs=require('node:fs');const{app,ipcMain}=require('electron');
const base=path.dirname(process.execPath),report=path.join(base,'assistant-smoke-result.json'),pointer=path.join(base,'test-profile.txt'),reopen=process.argv.includes('--hive-reopen-check');
const profile=reopen?fs.readFileSync(pointer,'utf8'):fs.mkdtempSync(path.join(base,'isolated-test-'));if(!path.resolve(profile).startsWith(path.resolve(base)+path.sep))throw new Error('Unexpected test profile');if(!reopen)fs.writeFileSync(pointer,profile);process.env.HIVE_QA_DATA_DIR=profile;
let finished=false,testWindow;async function finish(result){if(finished)return;finished=true;
if(result.ok&&!reopen){fs.writeFileSync(path.join(base,'assistant-cold-result.json'),JSON.stringify(result,null,2));app.once('will-quit',()=>app.relaunch({args:process.argv.slice(1).filter(value=>value!=='--hive-reopen-check').concat('--hive-reopen-check')}));app.quit();return;}
const cold=reopen?JSON.parse(fs.readFileSync(path.join(base,'assistant-cold-result.json'),'utf8')):{};fs.writeFileSync(report,JSON.stringify({...cold,...result,version:app.getVersion(),native_electron:true},null,2));if(!result.ok)testWindow?.destroy();app.quit();}
app.on('browser-window-created',(_,window)=>{testWindow=window;window.hide();window.webContents.on('render-process-gone',(_,details)=>finish({ok:false,error:details.reason}));});
ipcMain.handle('hive:connection-probe',async event=>{if(!event.senderFrame.url.startsWith('hive://app/'))throw new Error('Unavailable');return ${live} ? require('./connection-check.cjs').checkConnection() : {status:'skipped',reason:'Not enabled for this build.'};});
ipcMain.handle('hive:test-phase',()=>reopen?'reopen':'cold');
ipcMain.handle('hive:test-capture',async(event,label)=>{if(!event.senderFrame.url.startsWith('hive://app/')||!['recommendation-cards','service-comments'].includes(label))throw new Error('Unavailable');try{testWindow.showInactive();await new Promise(resolve=>setTimeout(resolve,350));let capture;for(let attempt=0;attempt<2;attempt++){try{capture=await testWindow.webContents.capturePage();break;}catch(error){if(attempt)throw error;await new Promise(resolve=>setTimeout(resolve,500));}}fs.writeFileSync(path.join(base,label+'.png'),capture.toPNG());testWindow.hide();return{ok:true};}catch(error){testWindow.hide();return{ok:false,error:String(error.message)};}});
ipcMain.on('hive:assistant-smoke',(event,result)=>{if(event.senderFrame.url.startsWith('hive://app/'))finish(result);});setTimeout(()=>finish({ok:false,error:'Assistant smoke check timed out.'}),150000).unref();require('./dist/main.cjs');\n`);
await createPackage(stage, '.runtime/assistant-smoke.asar');
console.log('Prepared isolated assistant smoke test; existing connection probe: ' + live);
