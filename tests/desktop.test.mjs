import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet } from 'jose';
import { Vault, ChatGPTConnection, hasPlanPermission, ISSUER, SCOPES } from '../src/auth.mjs';
import { Memory, Assistant, readResponse } from '../src/assistant.mjs';
import { openDatabase } from '../src/database.mjs';
import { catalog } from '../src/core/catalog.mjs';

await mkdir('.runtime/tests', { recursive: true });
async function fixture() {
  const directory = await mkdtemp(path.resolve('.runtime/tests/case-'));
  const options = { filename: path.join(directory, 'hive.sqlite'), wasm: path.resolve('node_modules/sql.js/dist/sql-wasm.wasm'), migrations: path.resolve('drizzle'), catalog };
  let db = await openDatabase(options);
  let owner = 'a';
  const events = [];
  const memory = new Memory({ database: () => db, owner: () => owner, emit: value => events.push(value) });
  return { directory, options, events, memory, switch: value => { owner = value; }, restart: async () => { db.close(); db = await openDatabase(options); }, close: () => db.close() };
}
const context = { category: 'Transportation', region: 'Georgina', age_band: '40–64', mobility: 'Wheelchair', language: 'English', timing: 'Flexible' };
const outcome = extra => ({ ...context, service_id: 'yrt-paratransit', delivery: 'Received', satisfaction: 4, reason: 'None', ...extra });

test('local SQL memory survives restart and separates account identities', async () => {
  const f = await fixture();
  await f.memory.propose('record_outcome', outcome());
  const saved = await f.memory.confirm(f.memory.pending.id);
  await f.restart();
  assert.equal((await f.memory.read('list_memory')).outcomes[0].id, saved.record.id);
  f.switch('b'); assert.equal((await f.memory.read('list_memory')).active_outcome_count, 0);
  f.close();
});

test('model-provided confirmation cannot write until the app receives confirmation', async () => {
  const f = await fixture();
  await f.memory.propose('record_outcome', outcome({ confirmed: true }));
  assert.equal((await f.memory.read('list_memory')).active_outcome_count, 0);
  assert.equal(f.memory.pending.arguments.confirmed, false);
  f.switch('b'); await assert.rejects(f.memory.confirm(f.memory.pending.id), /no longer active/);
  f.switch('a'); const id = f.memory.pending.id;
  const saved = await f.memory.confirm(id); assert.equal(saved.saved, true);
  await assert.rejects(f.memory.confirm(id), /no longer active/);
  f.close();
});

test('pending correction, receipt denominator, retraction and hard access conflicts work', async () => {
  const f = await fixture();
  await f.memory.propose('record_outcome', outcome({ delivery: 'Pending', satisfaction: null }));
  const pending = await f.memory.confirm(f.memory.pending.id);
  assert.equal((await f.memory.read('recommend_services', context)).items[0].evidence.delivery_rate, null);
  await f.memory.propose('update_outcome', outcome({ record_id: pending.record.id, expected_version: 1 }));
  await f.memory.confirm(f.memory.pending.id);
  const result = await f.memory.read('recommend_services', context);
  assert.equal(result.items[0].evidence.completed, 1); assert.equal(result.items[0].evidence.delivery_rate, 100);
  assert(result.excluded.some(item => item.service_id === 'chats-rides'));
  await f.memory.propose('retract_memory', { record_id: pending.record.id, record_type: 'Outcome' });
  await f.memory.confirm(f.memory.pending.id);
  assert.equal((await f.memory.read('list_memory')).active_outcome_count, 0); f.close();
});

test('unsupported identity fields and satisfaction before receipt are rejected', async () => {
  const f = await fixture();
  await assert.rejects(f.memory.propose('record_outcome', outcome({ patient_name: 'Test person' })), /structured/);
  await f.memory.propose('record_outcome', outcome({ delivery: 'Pending' }));
  await assert.rejects(f.memory.confirm(f.memory.pending.id), /after/); f.close();
});

function encryption() {
  const key = randomBytes(32);
  return { available: async () => true,
    encrypt: async text => { const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key, iv); const data = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]); return Buffer.concat([iv, cipher.getAuthTag(), data]); },
    decrypt: async bytes => { const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12)); decipher.setAuthTag(bytes.subarray(12, 28)); return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString(); } };
}
test('credential vault encrypts tokens and permission checks use granted scopes', async () => {
  const directory = await mkdtemp(path.resolve('.runtime/tests/vault-'));
  const provider = encryption(); const vault = new Vault(directory, provider); const state = await vault.read();
  state.profiles.push({ id: 'a', credentials: { accessToken: 'DO-NOT-STORE-IN-PLAIN-TEXT' } }); await vault.save();
  assert.equal((await readFile(vault.filename)).includes(Buffer.from('DO-NOT-STORE-IN-PLAIN-TEXT')), false);
  assert.equal((await new Vault(directory, provider).read()).profiles[0].credentials.accessToken, 'DO-NOT-STORE-IN-PLAIN-TEXT');
  assert.equal(hasPlanPermission(['openid', 'email']), false); assert.equal(hasPlanPermission(['chatgpt.tokens.use.direct']), true);
});

test('ID-token signature, audience, nonce and returning identity are verified', async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const token = await new SignJWT({ nonce: 'correct-nonce', email: 'test@example.invalid' }).setProtectedHeader({ alg: 'RS256', kid: 'key' })
    .setSubject('subject').setIssuer(ISSUER).setAudience('client').setExpirationTime('5m').sign(privateKey);
  const connection = new ChatGPTConnection({ vault: {}, openExternal: () => {} });
  connection.metadata = { issuer: ISSUER }; connection.keys = createLocalJWKSet({ keys: [{ ...await exportJWK(publicKey), kid: 'key' }] });
  assert.equal((await connection.verify(token, 'client', 'correct-nonce')).subject, 'subject');
  await assert.rejects(connection.verify(token, 'other-client', 'correct-nonce'), /verified/);
  await assert.rejects(connection.verify(token, 'client', 'wrong-nonce'), /verified/);
  await assert.rejects(connection.verify(token, 'client', 'correct-nonce', 'someone-else'), /returning account/);
});

test('OAuth callback rejects wrong state, uses PKCE, retains issued client and does not expose tokens', async () => {
  const directory = await mkdtemp(path.resolve('.runtime/tests/oauth-'));
  const vault = new Vault(directory, encryption());
  let exchange;
  const connection = new ChatGPTConnection({ vault,
    openExternal: async address => {
      const url = new URL(address);
      assert.equal(url.searchParams.get('client_id'), 'dynamic_agent_client');
      assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
      assert.equal(url.searchParams.get('scope'), SCOPES);
      const callback = new URL(url.searchParams.get('redirect_uri'));
      callback.search = new URLSearchParams({ code: 'fake-code', state: 'wrong-state', client_id: 'issued-client' }).toString();
      assert.equal((await fetch(callback)).status, 400);
      callback.searchParams.set('state', url.searchParams.get('state'));
      assert.equal((await fetch(callback)).status, 200);
    },
    verifyIdentity: async (_token, client, nonce) => { assert.equal(client, 'issued-client'); assert(nonce); return { subject: 'verified', email: 'test@example.invalid' }; },
    fetcher: async (_url, options) => { exchange = new URLSearchParams(options.body); return Response.json({ access_token: 'fake-access', refresh_token: 'fake-refresh', id_token: 'fake-id', expires_in: 3600, scope: SCOPES }); }
  });
  const session = await connection.signIn();
  assert.equal(session.sharing, true); assert.equal(exchange.get('client_id'), 'issued-client'); assert(exchange.get('code_verifier'));
  assert.equal(JSON.stringify(session).includes('fake-access'), false);
  assert.equal((await vault.read()).profiles[0].clientId, 'issued-client');
});

test('concurrent requests rotate a refresh token once and persist the replacement', async () => {
  const directory = await mkdtemp(path.resolve('.runtime/tests/refresh-')); const vault = new Vault(directory, encryption());
  const stored = await vault.read(); stored.selected = 'a'; stored.profiles.push({ id: 'a', clientId: 'issued', subject: 'subject', scopes: SCOPES.split(' '), credentials: { accessToken: 'old', refreshToken: 'old-refresh', expires: 1 } }); await vault.save();
  let calls = 0;
  const connection = new ChatGPTConnection({ vault, openExternal: () => {}, fetcher: async () => { calls++; await new Promise(resolve => setTimeout(resolve, 15)); return Response.json({ access_token: 'new', refresh_token: 'new-refresh', expires_in: 3600, scope: SCOPES }); } });
  assert.deepEqual(await Promise.all([connection.accessToken(), connection.accessToken()]), ['new', 'new']); assert.equal(calls, 1);
  assert.equal((await vault.read()).profiles[0].credentials.refreshToken, 'new-refresh');
});

function events(items) { return new Response(items.map(item => 'data: ' + JSON.stringify(item) + '\n\n').join(''), { headers: { 'Content-Type': 'text/event-stream' } }); }
test('stream processing requires completed inference and surfaces usage errors', async () => {
  await assert.rejects(readResponse(events([{ type: 'response.output_text.delta', delta: 'partial' }])), /completion/);
  await assert.rejects(readResponse(events([{ type: 'response.failed', response: { error: { code: 'subscription_sharing_usage_limit_exceeded' } } }])), /usage limit/);
  const complete = await readResponse(events([{ type: 'response.completed', response: { status: 'completed', output: [] } }]));
  assert.equal(complete.status, 'completed');
});

test('AI tool loop uses the approved route and holds writes for a separate confirmation', async () => {
  const f = await fixture(); let turn = 0;
  const connection = { session: async () => ({ sharing: true }), accessToken: async () => 'fake-token' };
  const assistant = new Assistant({ connection, memory: f.memory, fetcher: async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    const body = JSON.parse(options.body); assert.equal(body.store, false); assert.equal(body.stream, true); assert.equal(body.tools[0].type, 'namespace');
    turn++;
    const output = turn === 1 ? [{ type: 'function_call', name: 'hive.record_outcome', call_id: 'call', arguments: JSON.stringify(outcome({ confirmed: true })) }] :
      [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Review the card and confirm save.' }] }];
    return events([{ type: 'response.completed', response: { status: 'completed', output } }]);
  } });
  assistant.model = 'model-from-account';
  await assistant.chat('Remember an outcome'); assert.equal((await f.memory.read('list_memory')).active_outcome_count, 0);
  await assistant.chat('Confirm save'); assert.equal((await f.memory.read('list_memory')).active_outcome_count, 1); assert.equal(turn, 2); f.close();
});
