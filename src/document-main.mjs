import { app, BrowserWindow, ipcMain, protocol, net, session, shell, safeStorage, dialog, Menu, clipboard } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdir, readFile, writeFile, stat, rm } from 'node:fs/promises';
import { openDatabase } from './database.mjs';
import { ChatGPTConnection, Vault } from './auth.mjs';
import { DocumentStore } from './documents/store.mjs';
import { DocumentImporter } from './documents/importer.mjs';
import { DocumentAssistant } from './documents/assistant.mjs';
import {DocumentCases} from './documents/cases.mjs';
import {CaseFollowups} from './documents/case-followups.mjs';
import {InputHistory} from './documents/input-history.mjs';
import { cspForPath } from './security.mjs';
import { APP_NAME, windowsDataDirectory } from './app-identity.mjs';
import { ensureKnownServices, serviceCategories, SERVICE_DIRECTORY_FORMAT } from './documents/services.mjs';

const root=app.getAppPath(),uiOrigin='hive://app';
app.setName(APP_NAME);
app.setPath('userData',windowsDataDirectory(app.getPath('appData'),process.env.HIVE_QA_DATA_DIR));
if(process.platform==='win32')app.setAppUserModelId('org.team26.southlakehive');
protocol.registerSchemesAsPrivileged([{scheme:'hive',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true,stream:true}}]);
const hasLock=app.requestSingleInstanceLock();if(!hasLock)app.quit();
const dataDir=app.getPath('userData');
let window,db,store,importer,assistant,cases,followups,inputHistory,connection,micAllowedUntil=0,ready=false,closing=false,pickerBusy=false;
let account={connected:false,sharing:false,profileId:null,profiles:[],label:'This computer'},accountError='',modelList={items:[],selected:null};
const owner=()=>account.connected?account.profileId:'device';
const emit=value=>{if(window&&!window.isDestroyed())window.webContents.send('hive:event',value);};
const safeError=error=>({message:error.message||'This action could not complete.',code:error.code||'operation_failed',requestId:error.requestId});
const fromApp=event=>event.sender===window?.webContents&&event.senderFrame?.url.startsWith(uiOrigin+'/');
const idle=()=>{if(assistant.busy||importer.busy||connection.busy||pickerBusy)throw new Error('Finish the current answer, file import, or sign-in first.');};
async function updateAccount(){try{account=await connection.session();accountError='';}catch(error){accountError=error.message;account={connected:false,sharing:false,profileId:null,profiles:[],label:'This computer'};}return account;}
async function snapshot(){await updateAccount();await ensureKnownServices(store);const allDocuments=await store.documents(),activeCase=await cases.current();return{account,accountError,documents:allDocuments.filter(d=>d.format!==SERVICE_DIRECTORY_FORMAT),cards:await store.list({collection:'personal',limit:60}),services:await store.list({collection:'services',limit:1}),cases:await cases.list(),active_case:activeCase,input_history:await inputHistory.state(),serviceCategories,version:app.getVersion(),models:{items:assistant.modelItems,selected:assistant.model},storage:'Saved on this Windows account',voice:'English voice model included',workspace:account.connected?account.label:'Your workspace'};}
async function allowedOriginal(document){
  if(!document?.original_path)return null;
  const base=path.resolve(dataDir,'documents',owner())+path.sep,target=path.resolve(document.original_path);
  if(!target.startsWith(base))throw new Error('The original file path is unavailable.');return target;
}
async function invoke(method,args){
  if(method==='snapshot')return snapshot();
  if(method==='ui-ready'){ready=true;return{ready:true};}
  if(method==='sign-in'){idle();await connection.signIn(args);await updateAccount();assistant.reset();importer.cancel();modelList={items:[],selected:null};window?.focus();return snapshot();}
  if(method==='cancel-sign-in'){connection.cancelSignIn?.();return{cancelled:true};}
  if(method==='sign-out'){idle();const result=await connection.signOut();await updateAccount();assistant.reset();importer.cancel();modelList={items:[],selected:null};return{...await snapshot(),revocationConfirmed:result.revoked};}
  if(method==='select-account'){idle();await connection.select(args.id);await updateAccount();assistant.reset();importer.cancel();modelList={items:[],selected:null};return snapshot();}
  if(method==='models'){modelList=await assistant.models();return modelList;}
  if(method==='select-model'){if(assistant.busy)throw new Error('Stop the current answer first.');if(!assistant.modelItems.some(m=>m.id===args.id))throw new Error('Choose an available model.');assistant.model=args.id;modelList={items:assistant.modelItems,selected:args.id};return modelList;}
  if(method==='list-cards')return store.list(args);
  if(method==='list-memory')return store.memories(args);
  if(method==='get-card')return store.get(args.id);
  if(method==='list-cases')return cases.list(args);
  if(method==='get-case'){idle();return cases.hydrate(await cases.read(args.id,args));}
  if(method==='select-case'){idle();assistant.clear();await cases.activate(args.id);return cases.hydrate(await cases.read(args.id,args));}
  if(method==='new-case'){idle();assistant.clear();return cases.create(args.title);}
  if(method==='rename-case'){idle();return cases.rename(args);}
  if(method==='suggest-case-title'){idle();return cases.suggestedTitle(args.id);}
  if(method==='case-context')return cases.context(args);
  if(method==='start-service-followup'){idle();return followups.start(args);}
  if(method==='update-service-followup'){
    idle();
    const reply = await followups.update(args);
    if(['save','save-note','undo','redo'].includes(args.step))assistant.clear();
    return reply;
  }
  if(method==='save-followup-drafts')return followups.saveDrafts(args);
  if(method==='archive-case'){idle();assistant.clear();return cases.archive(args);}
  if(method==='delete-case'){idle();assistant.clear();return cases.delete(args);}
  if(method==='reopen-case'){idle();assistant.clear();return cases.reopen(args.id);}
  if(method==='input-history')return inputHistory.state(args.card_id ? {card_id:args.card_id} : undefined);
  if(method==='undo-input'||method==='redo-input'){
    idle();
    const scope=args.card_id ? {card_id:args.card_id} : undefined;
    const result=await inputHistory.apply(method==='undo-input'?'undo':'redo',{scope,expected_id:args.change_id});
    assistant.clear();
    return result;
  }
  if(method==='save-note'){idle();const result=await inputHistory.record({type:'card',id:args.id,label:args.id?'Edit memory':'Add memory'},()=>store.note(args));assistant.clear();return result;}
  if(method==='save-comment'){idle();const result=await inputHistory.record({type:'comment',id:args.id,card_id:args.card_id,label:args.id?'Edit note':'Add note'},()=>store.comment(args));assistant.clear();return result;}
  if(method==='save-service-result'){idle();const result=await inputHistory.record({type:'comment',id:args.id,card_id:args.card_id,label:args.id?'Change service result or rating':'Record service result'},()=>store.serviceResult(args));assistant.clear();return result;}
  if(method==='forget-comment'){idle();const result=await inputHistory.record({type:'comment',id:args.id,card_id:args.card_id,label:'Delete note or result'},()=>store.forgetComment(args));assistant.clear();return result;}
  if(method==='forget-card'){idle();const card=await store.get(args.id);if(card.case_info)throw new Error('Use Delete case history to remove this saved case and its messages.');const result=card.document_id?await store.forgetCard(args.id):await inputHistory.record({type:'card',id:args.id,label:'Delete memory'},()=>store.forgetCard(args.id));assistant.clear();return result;}
  if(method==='forget-document'){
    idle();const source=await allowedOriginal(await store.document(args.id));const result=await store.forgetDocument(args.id);
    if(source)await rm(source,{force:true}).catch(()=>{});assistant.clear();return result;
  }
  if(method==='pick-document'){
    idle();pickerBusy=true;try{const chosen=await dialog.showOpenDialog(window,{title:'Add a document',properties:['openFile'],filters:[{name:'Supported documents',extensions:['xlsx','csv','tsv','docx','pdf','txt','md']}]});
    if(chosen.canceled)return{cancelled:true};return await importer.prepare(chosen.filePaths[0]);}finally{pickerBusy=false;}
  }
  if(method==='sample-document'){idle();return importer.prepare(path.join(root,'assets/SAMPLE-FICTIONAL-Services.csv'));}
  if(method==='confirm-import'){if(assistant.busy||connection.busy)throw new Error('Wait for the current answer or sign-in.');return importer.confirm(args.id,args.update===true);}
  if(method==='cancel-import'){importer.cancel();return{cancelled:true};}
  if(method==='open-original'){
    const document=await store.document(args.id),source=await allowedOriginal(document);
    if(!source)throw new Error('This document was restored from a text backup. The original file was not included.');
    const error=await shell.openPath(source);if(error)throw new Error('Windows could not open the original file. '+error);return{opened:true};
  }
  if(method==='chat')return assistant.chat(args);
  if(method==='stop'){assistant.abort?.abort();return{stopped:true};}
  if(method==='clear-chat')return assistant.clear();
  if(method==='calculate')return store.calculate(args);
  if(method==='export'){
    idle();pickerBusy=true;try{const selected=await dialog.showSaveDialog(window,{title:'Save a private memory backup',defaultPath:'Care-Navigation-Support-memory-'+new Date().toISOString().slice(0,10)+'.json',filters:[{name:'Personal memory backup',extensions:['json']}]});
    if(selected.canceled)return{cancelled:true};await writeFile(selected.filePath,JSON.stringify(await store.export(),null,2),{mode:0o600});return{exported:true};}finally{pickerBusy=false;}
  }
  if(method==='restore'){
    idle();pickerBusy=true;try{const selected=await dialog.showOpenDialog(window,{title:'Restore a private memory backup',properties:['openFile'],filters:[{name:'Personal memory backup',extensions:['json']}]});
    if(selected.canceled)return{cancelled:true};const size=(await stat(selected.filePaths[0])).size;
    if(size>100*1024*1024)throw new Error('This backup exceeds the 100 MB import limit.');
    return await store.restore(JSON.parse(await readFile(selected.filePaths[0],'utf8')));}finally{pickerBusy=false;}
  }
  if(method==='starter-count'){const starter=new DocumentStore({database:()=>db,owner:()=> 'device'});const notes=await db.prepare("SELECT COUNT(*) AS count FROM personal_comments n JOIN personal_cards c ON c.id=n.card_id JOIN personal_documents d ON d.id=c.document_id WHERE n.owner_id='device' AND d.format='service-directory'").first();return{count:(await starter.list({collection:'personal',limit:1})).total+(notes?.count||0)};}
  if(method==='copy-starter'){idle();if(!account.connected)throw new Error('Connect the account that should receive these starter cards.');const starter=new DocumentStore({database:()=>db,owner:()=> 'device'});return store.restore(await starter.export());}
  if(method==='open-link'){
    let url;try{url=new URL(args.url);}catch{throw new Error('This link is invalid.');}
    if(url.protocol!=='https:'||url.username||url.password)throw new Error('Only public HTTPS source links can be opened.');
    await shell.openExternal(url.href);return{opened:true};
  }
  if(method==='copy-contact'){
    const card=await store.get(args.id);const contact=card.contacts.find(c=>c.value===args.value);
    if(!contact)throw new Error('This contact is not on the selected card.');clipboard.writeText(contact.value);return{copied:true};
  }
  if(method==='microphone'){micAllowedUntil=Date.now()+300000;return{ready:true};}
  if(method==='close-after-save'){assistant.abort?.abort();await db.flush();closing=true;window?.close();return{closing:true};}
  throw new Error('This action is unavailable.');
}
app.on('second-instance',()=>{window?.show();window?.focus();});
app.on('window-all-closed',()=>app.quit());
app.on('before-quit',()=>{connection?.cancelSignIn?.();assistant?.abort?.abort();});
app.on('will-quit',()=>{db?.close();db=null;});
async function boot(){
  await app.whenReady();
  await mkdir(dataDir,{recursive:true});
  db=await openDatabase({filename:path.join(dataDir,'documents.sqlite'),wasm:path.join(root,'dist/sql-wasm.wasm'),migrations:path.join(root,'drizzle'),catalog:[]});
  const encryption={available:()=>safeStorage.isAsyncEncryptionAvailable(),encrypt:value=>safeStorage.encryptStringAsync(value),decrypt:async value=>(await safeStorage.decryptStringAsync(value)).result};
  connection=new ChatGPTConnection({vault:new Vault(path.join(dataDir,'account'),encryption),openExternal:url=>shell.openExternal(url),onChange:()=>{assistant?.reset();emit({type:'account-changed'});}});
  store=new DocumentStore({database:()=>db,owner,emit});
  cases=new DocumentCases({store});inputHistory=new InputHistory({store});
  followups = new CaseFollowups({cases, store, inputHistory});
  importer=new DocumentImporter({store,directory:path.join(dataDir,'documents'),worker:path.join(root,'dist/document-worker.cjs'),pdfWorker:path.join(root,'dist/pdf.worker.mjs')});
  assistant=new DocumentAssistant({store,connection,cases,emit});
  protocol.handle('hive',async request=>{
    const url=new URL(request.url);if(url.host!=='app')return new Response('Unavailable',{status:404});
    const relative=decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname),folder=relative.startsWith('/voice/')?path.join(root,'assets'):path.join(root,'dist/ui');
    const name=relative.startsWith('/voice/')?relative.slice(7):relative.slice(1),target=path.resolve(folder,name);
    if(!target.startsWith(path.resolve(folder)+path.sep))return new Response('Unavailable',{status:404});
    try{const response=await net.fetch(pathToFileURL(target).href),headers=new Headers(response.headers);headers.set('Content-Security-Policy',cspForPath(relative));headers.set('X-Content-Type-Options','nosniff');if(relative.endsWith('.js'))headers.set('Content-Type','application/javascript; charset=utf-8');return new Response(response.body,{status:response.status,headers});}catch{return new Response('Unavailable',{status:404});}
  });
  session.defaultSession.webRequest.onHeadersReceived((details,callback)=>callback({responseHeaders:{...details.responseHeaders,'Content-Security-Policy':[cspForPath(new URL(details.url).pathname)],'X-Content-Type-Options':['nosniff']}}));
  session.defaultSession.setPermissionCheckHandler((contents,permission,origin,details)=>contents===window?.webContents&&origin.startsWith(uiOrigin)&&permission==='media'&&micAllowedUntil>Date.now()&&details.mediaType!=='video');
  session.defaultSession.setPermissionRequestHandler((contents,permission,callback,details)=>callback(contents===window?.webContents&&permission==='media'&&micAllowedUntil>Date.now()&&(details.mediaTypes||[]).every(t=>t==='audio')));
  ipcMain.handle('hive:request',async(event,request)=>{
    if(!fromApp(event)||!request||typeof request.method!=='string'||JSON.stringify(request).length>100000)return{ok:false,error:{message:'This action is unavailable.'}};
    try{return{ok:true,value:await invoke(request.method,request.args||{})};}catch(error){return{ok:false,error:safeError(error)};}
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'Edit',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},{label:'View',submenu:[{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{role:'togglefullscreen'}]}]));
  window = new BrowserWindow({
    width: 1420,
    height: 920,
    minWidth: 980,
    minHeight: 720,
    title: APP_NAME,
    icon: path.join(root, 'assets', 'hive.ico'),
    backgroundColor: '#f4f8fa',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(root, 'dist/preload.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true
    }
  });
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith(uiOrigin+'/'))event.preventDefault();});
  window.on('close',event=>{if(ready&&!closing&&!window.webContents.isCrashed()){event.preventDefault();emit({type:'closing-requested'});}});
  window.on('closed',()=>{window=null;});await window.loadURL(uiOrigin+'/index.html');
}
if(hasLock)boot().catch(error=>{dialog.showErrorBox(APP_NAME+' could not start',error.message+'\nYour previous saved data has been preserved.');app.quit();});
