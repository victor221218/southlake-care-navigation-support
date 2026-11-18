import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import initSqlJs from 'sql.js';
import { writeFile } from 'node:fs/promises';
import { openDatabase } from '../src/database.mjs';
import { catalog } from '../src/core/catalog.mjs';
import { Assistant, Memory } from '../src/assistant.mjs';
import { resultInClause } from '../src/feedback.mjs';
await mkdir('.runtime/tests', { recursive: true });
async function fixture() {
  const folder = await mkdtemp(path.resolve('.runtime/tests/auto-'));
  const config = { filename: path.join(folder, 'hive.sqlite'), wasm: path.resolve('node_modules/sql.js/dist/sql-wasm.wasm'), migrations: path.resolve('drizzle'), catalog };
  let db = await openDatabase(config), owner = 'karen';
  const memory = new Memory({ database: () => db, owner: () => owner });
  const assistant = new Assistant({ memory, connection: { session: async () => ({ sharing: false }) }, fetcher: () => { throw new Error('Common feedback must save without AI.'); } });
  return { assistant, memory, setOwner: value => { owner = value; assistant.reset(); }, restart: async () => { db.close(); db = await openDatabase(config); assistant.reset(); }, close: () => db.close(), rows: () => memory.read('list_memory', { limit: 100 }) };
}

test('one spoken-style turn allocates successes and failures to each provider, without confirmation', async () => {
  const f = await fixture();
  await f.assistant.chat('I need a ride in North York for an adult aged 40 using a walker.');
  assert.equal((await f.rows()).active_outcome_count, 0);
  assert.equal((await f.rows()).library.length, 1);
  const reply = await f.assistant.chat("Here is what worked: Circle of Care worked; the patient was happy, five out of five. Wheel-Trans did not work because they were at capacity. Better Living is still pending.");
  assert.equal(reply.source, 'memory'); assert.match(reply.text, /Saved: Circle of Care/); assert.match(reply.text, /Saved: TTC/);
  const saved = await f.rows(); assert.equal(saved.active_outcome_count, 3); assert.equal(f.memory.pending, null);
  const circle = saved.outcomes.find(row => row.service_id === 'circle-iride');
  assert.equal(circle.delivery, 'Received'); assert.equal(circle.satisfaction, 5); assert.equal(circle.satisfaction_sentiment, 'Happy');
  const ttc = saved.outcomes.find(row => row.service_id === 'ttc-wheeltrans'); assert.equal(ttc.delivery, 'Not received'); assert.equal(ttc.reason, 'Capacity');
  assert.equal(saved.outcomes.find(row => row.service_id === 'betterliving-transport').delivery, 'Pending');
  assert.ok(saved.outcomes.every(row => row.region === 'North York' && row.age_band === '40–64' && row.mobility === 'Walker' && row.share === 0));
  assert.equal(saved.library[0].feedback.length, 3);
  f.close();
});

test('new conversation and a database restart retain the library and change later recommendations', async () => {
  const f = await fixture();
  await f.assistant.chat('I need a ride in North York.');
  await f.assistant.chat('Circle of Care worked. Wheel-Trans did not work.');
  f.assistant.clearConversation();
  assert.equal(f.assistant.requestId, null);
  assert.match((await f.assistant.chat('What do you remember?')).text, /2 recorded attempts/);
  await f.restart();
  const reply = await f.assistant.chat('I need a ride in North York. Use my past experience.');
  assert.match(reply.text, /1\/1 received/);
  assert.equal(f.memory.latest.items.find(item => item.service.id === 'ttc-wheeltrans').evidence.delivery_rate, 0);
  assert.equal(f.memory.latest.items[0].service.id, 'circle-iride');
  assert.equal((await f.rows()).active_outcome_count, 2);
  f.close();
});

test('a Pending update, correction, rating follow-up and repeated wording retain one denominator', async () => {
  const f = await fixture(); await f.assistant.chat('I need a ride in North York.');
  await f.assistant.chat('Wheel-Trans is pending.');
  assert.equal(f.memory.latest.items.find(item => item.service.id === 'ttc-wheeltrans').evidence.completed, 0);
  await f.assistant.chat('Wheel-Trans worked.');
  await f.assistant.chat('The patient was not happy.');
  const before = (await f.rows()).outcomes[0]; assert.equal(before.satisfaction_sentiment, 'Unhappy'); assert.equal(before.satisfaction, null);
  await f.assistant.chat('The patient was not happy.');
  assert.equal((await f.rows()).outcomes[0].version, before.version);
  await f.assistant.chat('Actually Wheel-Trans did not work.');
  const saved = await f.rows(); assert.equal(saved.active_outcome_count, 1); assert.equal(saved.outcomes[0].id, before.id);
  assert.equal(saved.outcomes[0].delivery, 'Not received'); assert.equal(saved.outcomes[0].satisfaction_sentiment, 'Unspecified');
  await f.assistant.chat('Another ride in North York: Wheel-Trans worked.');
  assert.equal((await f.rows()).active_outcome_count, 2);
  f.close();
});

test('missing area or provider is retained as a draft, then resolves on a short follow-up', async () => {
  const f = await fixture();
  const reply = await f.assistant.chat('Wheel-Trans worked.'); assert.match(reply.text, /Which community/);
  let saved = await f.rows(); assert.equal(saved.active_outcome_count, 0); assert.equal(saved.library[0].feedback[0].state, 'Needs detail');
  await f.assistant.chat('North York'); saved = await f.rows(); assert.equal(saved.active_outcome_count, 1); assert.equal(saved.outcomes[0].service_id, 'ttc-wheeltrans');
  f.assistant.clearConversation(); await f.assistant.chat('I need a ride in North York.');
  await f.assistant.chat('It did not work.');
  saved = await f.rows(); assert.equal(saved.active_outcome_count, 1);
  const pending = saved.library.find(card => card.feedback.some(item => item.state === 'Needs detail')); assert.ok(pending);
  f.assistant.clearConversation(); await f.assistant.resumeRequest(pending.id);
  await f.assistant.chat('Circle of Care');
  saved = await f.rows(); assert.equal(saved.active_outcome_count, 2);
  assert.equal(saved.library.find(card => card.id === pending.id).feedback.length, 1);
  assert.equal(saved.library.find(card => card.id === pending.id).feedback[0].state, 'Saved');
  f.close();
});

test('hypothetical, future, untried, private and question wording do not manufacture results', async () => {
  const f = await fixture(); await f.assistant.chat('I need a ride in North York.');
  for (const text of ['For example, Circle of Care worked.', 'Circle of Care might work.', "Circle of Care hasn't been tried.", 'Did Wheel-Trans work?', "Do not save this: Wheel-Trans worked.", 'Find a provider that worked for others.']) await f.assistant.chat(text);
  assert.equal((await f.rows()).active_outcome_count, 0);
  assert.equal(resultInClause('not received yet').delivery, 'Pending');
  f.close();
});

test('generic organizations are not assigned to the wrong program and accounts stay isolated', async () => {
  const f = await fixture();
  await f.assistant.chat('Better Living worked in North York.');
  let saved = await f.rows(); assert.equal(saved.active_outcome_count, 0); assert.ok(saved.library[0].feedback[0].missing.includes('Provider'));
  f.setOwner('another-tester'); assert.equal((await f.rows()).library.length, 0); assert.equal((await f.rows()).active_outcome_count, 0);
  f.setOwner('karen'); assert.equal((await f.rows()).library.length, 1);
  f.close();
});

test('AI-assisted capture requires current user evidence and cannot use suggested or external claims', async () => {
  const f = await fixture();
  await assert.rejects(f.assistant.captureFromAI({ service_id: 'circle-iride', delivery: 'Received', evidence_quote: 'Circle of Care worked.' }, 'Find a ride in North York.', catalog), /actual result/);
  await assert.rejects(f.assistant.captureFromAI({ service_id: 'ttc-wheeltrans', delivery: 'Received', evidence_quote: 'Circle of Care worked.' }, 'Circle of Care worked.', catalog), /Clarify the provider/);
  assert.equal((await f.rows()).active_outcome_count, 0);
  f.close();
});

test('voice responses remain text only and no transcript or patient fields are persisted', async () => {
  const source = await readFile('ui/app.mjs', 'utf8'); assert.ok(!source.includes('speak(answer.text)')); assert.ok(!source.includes('readAloud'));
  const f = await fixture(); await f.assistant.chat('A person named Example Person, age 40, needs a ride in North York.'); await f.assistant.chat('Circle of Care worked.');
  const stored = JSON.stringify(await f.rows()); assert.ok(!stored.includes('Example Person')); assert.ok(!stored.includes('A person named'));
  f.close();
});

test('upgrading an existing database keeps previous outcomes and adds the new library schema', async () => {
  const folder = await mkdtemp(path.resolve('.runtime/tests/upgrade-'));
  const filename = path.join(folder, 'hive.sqlite'), wasm = path.resolve('node_modules/sql.js/dist/sql-wasm.wasm');
  const SQL = await initSqlJs({ wasmBinary: await readFile(wasm) }), old = new SQL.Database();
  old.exec(await readFile('drizzle/0000_cultured_timeslip.sql', 'utf8'));
  old.exec("CREATE TABLE local_migrations (tag TEXT PRIMARY KEY); INSERT INTO local_migrations VALUES ('0000_cultured_timeslip')");
  old.run('INSERT INTO hive_outcomes (id,owner_id,submission_id,service_id,category,region,age_band,mobility,language,timing,delivery,satisfaction,reason,share,occurred_on,created_at,updated_at,version) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', ['old-attempt','karen','old-submission','circle-iride','Transportation','North York','Unspecified','Unspecified','Unspecified','Flexible','Received',4,'None',0,'2026-11-12','2026-11-12','2026-11-12',1]);
  await writeFile(filename, old.export()); old.close();
  const db = await openDatabase({ filename, wasm, migrations: path.resolve('drizzle'), catalog });
  const memory = new Memory({ database: () => db, owner: () => 'karen' });
  const rows = await memory.read('list_memory'); assert.equal(rows.active_outcome_count, 1); assert.equal(rows.outcomes[0].satisfaction, 4); assert.equal(rows.outcomes[0].satisfaction_sentiment, 'Unspecified'); assert.deepEqual(rows.library, []);
  db.close();
});

test('manual correction and retraction stay consistent with the library and are never silently restored', async () => {
  const f = await fixture(); await f.assistant.chat('I need a ride in North York.'); await f.assistant.chat('Circle of Care worked.');
  const original = (await f.rows()).outcomes[0];
  await f.memory.propose('update_outcome', { record_id: original.id, expected_version: original.version, service_id: original.service_id, category: original.category, region: original.region, delivery: 'Not received', reason: 'Capacity' });
  await f.memory.confirm(f.memory.pending.id);
  assert.equal((await f.rows()).library[0].feedback[0].delivery, 'Not received');
  await f.memory.propose('retract_memory', { record_id: original.id, record_type: 'Outcome' }); await f.memory.confirm(f.memory.pending.id);
  assert.equal((await f.rows()).library[0].feedback[0].state, 'Retracted');
  await f.assistant.chat('Circle of Care worked.'); assert.equal((await f.rows()).active_outcome_count, 0);
  f.close();
});

test('connected AI can capture grounded feedback with no extra confirmation even if its final text is empty', async () => {
  const f = await fixture(); let calls = 0;
  f.assistant.connection = { session: async () => ({ sharing: true }), accessToken: async () => 'test-token' }; f.assistant.model = 'test-model';
  const text = 'Circle of Care connected us successfully in North York.';
  f.assistant.fetcher = async () => {
    calls++; const output = calls === 1 ? [{ type: 'function_call', name: 'hive.capture_feedback', call_id: 'capture', arguments: JSON.stringify({ service_id: 'circle-iride', delivery: 'Received', reason: 'None', evidence_quote: text }) }] : [];
    return new Response('data: ' + JSON.stringify({ type: 'response.completed', response: { status: 'completed', output } }) + '\n\n');
  };
  const result = await f.assistant.chat(text); assert.equal(result.source, 'memory'); assert.match(result.text, /Saved: Circle of Care/); assert.equal((await f.rows()).active_outcome_count, 1); assert.equal(f.memory.pending, null);
  f.close();
});
