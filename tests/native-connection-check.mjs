// Optional read-only integration probe using Hive's existing, explicitly granted
// connection. Never copies credentials, refreshes/revokes them, or reads the
// user's service-history database. Only harmless public-service prompts are sent.
import { app, safeStorage } from 'electron';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { ChatGPTConnection, Vault, RESOURCE } from '../src/auth.mjs';
import { openDatabase } from '../src/database.mjs';
import { catalog } from '../src/core/catalog.mjs';
import { Assistant, Memory } from '../src/assistant.mjs';

export async function checkConnection() {
  const directory = path.join(app.getPath('appData'), 'Southlake Hive', 'account');
  try { await access(path.join(directory, 'chatgpt.auth')); } catch { return { status: 'skipped', reason: 'No existing Hive connection.' }; }
  const encryption = { available: () => safeStorage.isAsyncEncryptionAvailable(), decrypt: async bytes => (await safeStorage.decryptStringAsync(bytes)).result };
  const vault = new Vault(directory, encryption);
  vault.save = async () => { throw new Error('The connection probe cannot modify credentials.'); };
  let db;
  try {
    const state = await vault.read();
    const profile = state.profiles.find(value => value.id === state.selected);
    if (!profile?.credentials || profile.pendingRefresh || profile.credentials.expires <= Date.now() + 180000) return { status: 'skipped', reason: 'A current token is needed; the probe does not refresh credentials.' };
    const connection = new ChatGPTConnection({ vault, openExternal: async () => { throw new Error('The probe cannot open sign-in.'); } });
    connection.token = async () => { throw new Error('Credential refresh is disabled for this read-only probe.'); };
    const originalAccess = connection.accessToken.bind(connection);
    connection.accessToken = async () => { if (profile.credentials.expires <= Date.now() + 90000) throw new Error('The probe stopped before credential refresh.'); return originalAccess(); };
    if (!(await connection.session()).sharing) return { status: 'skipped', reason: 'Plan permission was not granted.' };
    const root = app.getAppPath();
    db = await openDatabase({ filename: path.join(app.getPath('userData'), 'connection-probe.sqlite'), wasm: path.join(root, 'dist/sql-wasm.wasm'), migrations: path.join(root, 'drizzle'), catalog });
    const diagnostics = [];
    const memory = new Memory({ database: () => db, owner: () => 'connection-probe' });
    memory.propose = async () => { throw new Error('This probe is read-only.'); };
    let requests = 0;
    const assistant = new Assistant({ connection, memory, emit: event => { if (event.type === 'response-status') diagnostics.push(event.value); }, fetcher: async (url, options) => {
      if (![RESOURCE + '/models', RESOURCE + '/responses'].includes(url)) throw new Error('The probe only calls the documented OpenAI endpoints.');
      requests++; return fetch(url, options);
    } });
    const echo = await assistant.chat('Reply exactly: Hive connection is ready. Do not call tools or save anything.');
    const lookup = await assistant.chat('Look up the public contact for the Routes transportation program in Georgina using hive.get_service_details with service_id routes-rides. Include the phone number. Do not save anything.');
    return { status: echo.source === 'ai' && lookup.source === 'ai' && lookup.text.replace(/\D/g, '').includes('9057224616') ? 'passed' : 'needs-review', requests,
      echo_source: echo.source, echo_text_characters: echo.text.length, lookup_source: lookup.source, expected_contact_present: lookup.text.replace(/\D/g, '').includes('9057224616'), diagnostics };
  } catch (error) { return { status: 'needs-review', code: error.code || 'probe_error', reason: String(error.message || error).slice(0, 300) }; }
  finally { db?.close(); }
}
