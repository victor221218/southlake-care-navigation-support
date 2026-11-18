import { app, BrowserWindow, ipcMain, protocol, net, session, shell, safeStorage, dialog, Menu, systemPreferences, clipboard } from 'electron';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { openDatabase } from './database.mjs';
import { ChatGPTConnection, Vault } from './auth.mjs';
import { Assistant, Memory } from './assistant.mjs';
import { catalog, enums, practiceCatalog, practiceOutcomes } from './core/catalog.mjs';
import { cspForPath } from './security.mjs';
import { publicURL } from './core/service-records.mjs';

const root = app.getAppPath();
app.setName('Southlake Hive');
const uiOrigin = 'hive://app';
protocol.registerSchemesAsPrivileged([{ scheme: 'hive', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);
if (process.env.HIVE_QA_DATA_DIR && path.isAbsolute(process.env.HIVE_QA_DATA_DIR)) app.setPath('userData', process.env.HIVE_QA_DATA_DIR);
if (!app.requestSingleInstanceLock()) app.quit();
let window;
let privateDB, practiceDB, connection, assistant, memory;
let practice = false;
let cachedSession = { connected: false, sharing: false, profileId: null, profiles: [], label: 'This computer' };
let accountError = '';
let currentModels = { items: [], selected: null };
let micAllowedUntil = 0;
let uiReady = false, closingAfterSave = false;
const dataDir = app.getPath('userData');
const send = event => { if (window && !window.isDestroyed()) window.webContents.send('hive:event', event); };
const owner = () => practice ? 'practice' : cachedSession.connected ? cachedSession.profileId : 'device';
const chosenDB = () => practice ? practiceDB : privateDB;
const safeError = error => ({ message: error.message || 'The operation could not complete.', code: error.code || 'operation_failed', requestId: error.requestId });
const fromApp = event => event.sender === window?.webContents && event.senderFrame?.url.startsWith(uiOrigin + '/');

async function updateSession() {
  try { cachedSession = await connection.session(); accountError = ''; }
  catch (error) { cachedSession = { connected: false, sharing: false, profileId: null, profiles: [], label: 'This computer' }; accountError = error.message; }
  return cachedSession;
}
async function snapshot() {
  await updateSession();
  const stored = await memory.read('list_memory', { limit: 50 });
  return { account: cachedSession, accountError, practice, enums, catalog: [...(practice ? practiceCatalog : catalog), ...stored.added_services],
    workspace: await assistant.workspace(),
    memory: stored, pending: memory.pending ? { id: memory.pending.id, name: memory.pending.name, arguments: memory.pending.arguments } : null,
    models: currentModels, version: app.getVersion(), storage: 'Local to this computer', platform: process.platform };
}
async function invoke(method, args) {
  if (method === 'snapshot') return snapshot();
  if (method === 'ui-ready') { uiReady = true; return { ready: true }; }
  if (method === 'sign-in') {
    if (assistant.busy) throw new Error('Stop the conversation before changing accounts.');
    await connection.signIn(args); await updateSession(); practice = false; assistant.reset();
    currentModels = { items: [], selected: null };
    window?.focus(); return snapshot();
  }
  if (method === 'cancel-sign-in') { connection.cancelSignIn?.(); return { cancelled: true }; }
  if (method === 'select-account') { if (assistant.busy) throw new Error('Stop the conversation first.'); await connection.select(args.id); assistant.reset(); await updateSession(); currentModels = { items: [], selected: null }; return snapshot(); }
  if (method === 'sign-out') { assistant.reset(); const result = await connection.signOut(); currentModels = { items: [], selected: null }; return { ...await snapshot(), revocationConfirmed: result.revoked }; }
  if (method === 'models') { currentModels = await assistant.models(); return currentModels; }
  if (method === 'select-model') { if (!currentModels.items.some(model => model.id === args.id)) throw new Error('Choose a model returned for this account.'); assistant.model = args.id; currentModels.selected = args.id; return currentModels; }
  if (method === 'mode') { assistant.reset(); practice = args.practice === true; return snapshot(); }
  if (method === 'read') return memory.read(args.name, args.arguments);
  if (method === 'propose') return memory.propose(args.name, args.arguments);
  if (method === 'confirm') return memory.confirm(args.id);
  if (method === 'cancel') { memory.cancel(); return { cancelled: true }; }
  if (method === 'chat') {
    if (practice) throw new Error('The practice workbench uses fictional data. Connect ChatGPT and switch to personal mode for the AI conversation.');
    return assistant.chat(args.text);
  }
  if (method === 'stop') { assistant.abort?.abort(); return { stopped: true }; }
  if (method === 'clear-chat') { if (assistant.busy) throw new Error('Stop the current answer first.'); await assistant.clearConversation(); return { cleared: true }; }
  if (method === 'resume-request') { if (assistant.busy) throw new Error('Stop the current answer first.'); return assistant.resumeRequest(args.id); }
  if (method === 'select-service') { if (assistant.busy) throw new Error('Stop the current answer first.'); return assistant.selectService(args.service_id, args.request_id); }
  if (method === 'service-workspace') { if (assistant.busy) throw new Error('Stop the current answer first.'); return assistant.serviceWorkspace(args.service_id, args.request_id, args.browse === true); }
  if (method === 'quick-result') return assistant.quickResult(args);
  if (method === 'save-service-comment') return assistant.saveComment(args);
  if (method === 'close-after-save') { await privateDB?.flush(); await practiceDB?.flush(); closingAfterSave = true; window?.close(); return { closing: true }; }
  if (method === 'microphone') {
    if (process.platform === 'darwin' && !await systemPreferences.askForMediaAccess('microphone')) throw new Error('Microphone access was not granted. You can use the text box.');
    micAllowedUntil = Date.now() + 300000; return { ready: true };
  }
  if (method === 'open-usage') { await shell.openExternal('https://chatgpt.com/settings/usage'); return {}; }
  if (method === 'open-source') {
    await shell.openExternal(publicURL(args.url)); return {};
  }
  if (method === 'copy-service-contact') {
    if (!['phone', 'email'].includes(args.field)) throw new Error('Choose a public program contact.');
    const { service } = await memory.read('get_service_details', { service_id: args.id });
    if (!service[args.field]) throw new Error('No public contact is listed for this program.');
    clipboard.writeText(service[args.field]); return { copied: true };
  }
  if (method === 'export') {
    const selected = await dialog.showSaveDialog(window, { title: 'Export displayed Hive memory', defaultPath: 'Hive-memory.json', filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (selected.canceled) return { cancelled: true };
    const data = await memory.read('list_memory', { limit: 100 });
    await writeFile(selected.filePath, JSON.stringify({ purpose: practice ? 'Fictional practice data' : 'Personal service experience', ...data }, null, 2), { mode: 0o600 });
    return { exported: true };
  }
  if (method === 'check-storage') {
    const count = (await memory.read('list_memory', { limit: 1 })).active_outcome_count;
    return { storage: 'Ready', records: count, voice: 'English voice model included', chatgpt: cachedSession.sharing ? 'Plan permission granted; send a message to verify inference' : 'Not enabled', signedBuild: false };
  }
  throw new Error('Action unavailable.');
}

app.on('second-instance', () => { window?.show(); window?.focus(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => { connection?.cancelSignIn?.(); assistant?.abort?.abort(); });
app.on('will-quit', () => { privateDB?.close(); practiceDB?.close(); privateDB = practiceDB = null; });

async function boot() {
await app.whenReady();
try {
  await mkdir(dataDir, { recursive: true });
  const options = { wasm: path.join(root, 'dist/sql-wasm.wasm'), migrations: path.join(root, 'drizzle') };
  privateDB = await openDatabase({ ...options, filename: path.join(dataDir, 'hive.sqlite'), catalog });
  practiceDB = await openDatabase({ ...options, filename: path.join(dataDir, 'practice.sqlite'), catalog: practiceCatalog });
  const hasPractice = await practiceDB.prepare('SELECT id FROM hive_outcomes WHERE owner_id=? LIMIT 1').bind('practice').first();
  if (!hasPractice) {
    for (const row of practiceOutcomes()) await practiceDB.prepare('INSERT INTO hive_outcomes (id,owner_id,submission_id,service_id,category,region,age_band,mobility,language,timing,delivery,satisfaction,reason,share,occurred_on,created_at,updated_at,version) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(row.id, 'practice', row.id, row.service_id, row.category, row.region, row.age_band, row.mobility, row.language, row.timing, row.delivery, row.satisfaction, row.reason, 0, row.occurred_on, row.created_at, row.created_at, 1).run();
  }
  const encryption = { available: () => safeStorage.isAsyncEncryptionAvailable(), encrypt: value => safeStorage.encryptStringAsync(value),
    decrypt: async value => (await safeStorage.decryptStringAsync(value)).result };
  connection = new ChatGPTConnection({ vault: new Vault(path.join(dataDir, 'account'), encryption), openExternal: url => shell.openExternal(url),
    onChange: () => { assistant?.reset(); send({ type: 'account-changed' }); } });
  memory = new Memory({ database: chosenDB, owner, emit: send });
  assistant = new Assistant({ connection, memory, emit: send });
  protocol.handle('hive', async request => {
    const url = new URL(request.url);
    if (url.host !== 'app') return new Response('Unavailable', { status: 404 });
    const relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const folder = relative.startsWith('/voice/') ? path.join(root, 'assets') : path.join(root, 'dist/ui');
    const name = relative.startsWith('/voice/') ? relative.slice('/voice/'.length) : relative.slice(1);
    const target = path.resolve(folder, name);
    if (!target.startsWith(path.resolve(folder) + path.sep)) return new Response('Unavailable', { status: 404 });
    try {
      const result = await net.fetch(pathToFileURL(target).href);
      const headers = new Headers(result.headers);
      headers.set('Content-Security-Policy', cspForPath(relative));
      headers.set('X-Content-Type-Options', 'nosniff');
      if (relative.endsWith('.js')) headers.set('Content-Type', 'application/javascript; charset=utf-8');
      return new Response(result.body, { status: result.status, headers });
    } catch { return new Response('Unavailable', { status: 404 }); }
  });
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => callback({ responseHeaders: { ...details.responseHeaders,
    'Content-Security-Policy': [cspForPath(new URL(details.url).pathname)], 'X-Content-Type-Options': ['nosniff'] } }));
  session.defaultSession.setPermissionCheckHandler((contents, permission, origin, details) =>
    contents === window?.webContents && origin.startsWith(uiOrigin) && permission === 'media' && micAllowedUntil > Date.now() && details.mediaType !== 'video');
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => callback(
    contents === window?.webContents && permission === 'media' && micAllowedUntil > Date.now() && (details.mediaTypes || []).every(type => type === 'audio')));
  ipcMain.handle('hive:request', async (event, request) => {
    if (!fromApp(event) || !request || typeof request.method !== 'string' || JSON.stringify(request).length > 30000) return { ok: false, error: { message: 'Action unavailable.' } };
    try { return { ok: true, value: await invoke(request.method, request.args || {}) }; }
    catch (error) { return { ok: false, error: safeError(error) }; }
  });
  function createWindow() {
    uiReady = false; closingAfterSave = false;
    window = new BrowserWindow({ width: 1280, height: 860, minWidth: 850, minHeight: 650, title: 'Southlake Hive', backgroundColor: '#f5f9fa',
      autoHideMenuBar: true, webPreferences: { preload: path.join(root, 'dist/preload.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true } });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event, url) => { if (!url.startsWith(uiOrigin + '/')) event.preventDefault(); });
    window.loadURL(uiOrigin + '/index.html');
    window.on('close', event => { if (uiReady && !closingAfterSave && !window.webContents.isCrashed()) { event.preventDefault(); send({ type: 'closing-requested' }); } });
    window.on('closed', () => { window = null; });
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(process.platform === 'darwin' ? [{ label: 'Southlake Hive', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'quit' }] }] : []),
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'View', submenu: [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }] }
  ]));
  createWindow(); app.on('activate', () => { if (!window) createWindow(); });
} catch (error) {
  dialog.showErrorBox('Hive could not start', error.message + '\nYour saved data has been preserved.'); app.quit();
}
}
boot().catch(error => { dialog.showErrorBox('Hive could not start', error.message); app.quit(); });
