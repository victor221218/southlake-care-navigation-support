import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { openDatabase } from '../src/database.mjs';
import { Assistant, Memory } from '../src/assistant.mjs';
import { catalog } from '../src/core/catalog.mjs';
import { providerMentions, resultInClause } from '../src/feedback.mjs';
import { serviceCards } from '../ui/service-cards.mjs';
await mkdir('.runtime/tests', { recursive: true });
async function fixture() {
  const folder = await mkdtemp(path.resolve('.runtime/tests/cards-'));
  const config = { filename: path.join(folder, 'hive.sqlite'), wasm: path.resolve('node_modules/sql.js/dist/sql-wasm.wasm'), migrations: path.resolve('drizzle'), catalog };
  let db = await openDatabase(config), owner = 'karen';
  const events = [], memory = new Memory({ database: () => db, owner: () => owner, emit: event => events.push(event) });
  const assistant = new Assistant({ memory, connection: { session: async () => ({ sharing: false }) }, fetcher: () => { throw new Error('Common card work must not wait for an AI request.'); } });
  return { assistant, memory, events, db: () => db, rows: () => memory.read('list_memory', { limit: 100 }), restart: async () => { db.close(); db = await openDatabase(config); assistant.reset(); }, owner: value => { owner = value; assistant.reset(); }, close: () => db.close() };
}

test('the exact client screenshot phrase is recorded as a CHATS refusal, even when Circle of Care was selected', async () => {
  const f = await fixture(); const request = await f.assistant.chat('I need a ride in North York.');
  await f.assistant.selectService('circle-iride', request.request_id);
  const message = 'I tried chats iride plus and they said no';
  const answer = await f.assistant.chat(message), stored = await f.rows();
  assert.equal(stored.active_outcome_count, 1); assert.equal(stored.outcomes[0].service_id, 'chats-rides'); assert.equal(stored.outcomes[0].delivery, 'Not received');
  assert.equal(stored.comments[0].service_id, 'chats-rides'); assert.equal(stored.comments[0].body, message);
  assert.equal(answer.selected_service_id, 'chats-rides'); assert.equal(answer.cards.length, 3); assert.ok(!answer.summary.includes('Was the service actually'));
  assert.ok(!stored.outcomes.some(row => row.service_id === 'circle-iride'));
  f.close();
});

test('program-name spacing and ordinary refusal language preserve the actual provider and result', () => {
  for (const name of ['CHATS iRIDEplus', 'chats iride plus', 'chats i ride plus', 'CHATS i-ride-plus', 'CHATS i rideplus', 'CHATSirideplus']) assert.deepEqual(providerMentions('I tried ' + name + ' and they said no', catalog, 'Transportation').flatMap(item => item.ids), ['chats-rides']);
  assert.deepEqual(providerMentions('Circle of Care iRIDEplus', catalog, 'Transportation').flatMap(item => item.ids), ['circle-iride']);
  for (const phrase of ['they said no', 'they were fully booked', 'they had no drivers', 'they declined the referral', 'they couldnt provide the ride', 'this did not work', 'this didnt work', 'they dont cover that area']) assert.equal(resultInClause(phrase)?.delivery, 'Not received', phrase);
  assert.equal(resultInClause('the patient declined the ride').delivery, 'Declined');
  assert.equal(resultInClause('the patient request was declined by the provider').delivery, 'Not received');
  assert.equal(resultInClause('the ride is booked').delivery, 'Pending');
});

test('short feedback uses the selected card and immediately replaces the failed option with alternatives', async () => {
  const f = await fixture(); const initial = await f.assistant.chat('I need transportation in North York.');
  assert.equal(initial.cards.length, 3); assert.deepEqual(initial.cards.map(item => item.letter), ['A', 'B', 'C']);
  const selected = initial.cards[0].service.id;
  await f.assistant.selectService(selected, initial.request_id);
  const reply = await f.assistant.chat('This did not work.');
  assert.equal((await f.rows()).outcomes[0].service_id, selected); assert.equal(reply.feedback[0].delivery, 'Not received');
  assert.ok(reply.cards.length); assert.ok(!reply.cards.some(item => item.service.id === selected)); assert.match(reply.summary, /next options/);
  f.close();
});

test('unselected feedback asks for a card once and a card click resolves it without another result question', async () => {
  const f = await fixture(); const initial = await f.assistant.chat('I need a ride in North York.');
  const draft = await f.assistant.chat('This did not work.'); assert.equal(draft.choose_provider, true); assert.equal((await f.rows()).active_outcome_count, 0);
  const chosen = await f.assistant.selectService(initial.cards[1].service.id, initial.request_id);
  assert.equal(chosen.feedback[0].state, 'Saved'); assert.equal(chosen.feedback[0].delivery, 'Not received'); assert.ok(!chosen.summary.includes('Delivery result'));
  assert.equal((await f.rows()).active_outcome_count, 1);
  await f.assistant.selectService(initial.cards[1].service.id, initial.request_id); assert.equal((await f.rows()).active_outcome_count, 1);
  f.close();
});

test('comments and selected context survive restart, stay on their own service and remain after a new conversation', async () => {
  const f = await fixture(); const initial = await f.assistant.chat('I need a ride in North York.');
  await f.assistant.serviceWorkspace('circle-iride', initial.request_id);
  const note = await f.assistant.saveComment({ id: 'comment-test-0001', service_id: 'circle-iride', request_id: initial.request_id, body: 'Ask intake about the pickup boundary.', interpret: false });
  assert.equal((await f.rows()).active_outcome_count, 0);
  await f.restart(); assert.equal((await f.assistant.workspace()).selected_service_id, 'circle-iride');
  await f.assistant.chat('This did not work.'); assert.equal((await f.rows()).outcomes[0].service_id, 'circle-iride');
  let panel = await f.assistant.serviceWorkspace('circle-iride', initial.request_id); assert.equal(panel.comments.length, 2); assert.ok(panel.comments.some(item => item.id === note.comment.id));
  const other = await f.assistant.serviceWorkspace('ttc-wheeltrans', initial.request_id); assert.equal(other.comments.length, 0);
  await f.assistant.clearConversation(); panel = await f.assistant.serviceWorkspace('circle-iride', null, true); assert.equal(panel.comments.length, 2); assert.equal((await f.assistant.workspace()).request_id, null);
  await f.assistant.saveComment({ id: 'general-comment-0001', service_id: 'circle-iride', body: 'Public intake details were easy to find.', browse: true });
  assert.equal((await f.assistant.workspace()).request_id, null); assert.equal((await f.rows()).active_outcome_count, 1);
  f.close();
});

test('autosave and comment submission update one note and one attempt, with stale edits rejected', async () => {
  const f = await fixture(); const initial = await f.assistant.chat('I need a ride in North York.');
  const input = { id: 'stable-comment-0001', service_id: 'ttc-wheeltrans', request_id: initial.request_id, body: 'They said no because they were fully booked.' };
  const draft = await f.assistant.saveComment({ ...input, interpret: false }); assert.equal((await f.rows()).active_outcome_count, 0);
  const committed = await f.assistant.saveComment({ ...input, expected_version: draft.comment.version });
  assert.equal((await f.rows()).active_outcome_count, 1); assert.equal((await f.rows()).comments.length, 1); assert.equal(committed.feedback[0].delivery, 'Not received');
  const edited = await f.assistant.saveComment({ ...input, body: 'Actually the ride worked.', expected_version: committed.comment.version });
  assert.equal((await f.rows()).active_outcome_count, 1); assert.equal((await f.rows()).comments.length, 1); assert.equal((await f.rows()).outcomes[0].delivery, 'Received');
  await assert.rejects(f.assistant.saveComment({ ...input, expected_version: draft.comment.version }), /changed/);
  assert.equal((await f.rows()).comments[0].version, edited.comment.version);
  f.owner('another-tester'); assert.equal((await f.rows()).comments.length, 0);
  await assert.rejects(f.assistant.saveComment({ ...input, browse: true }), /unavailable/);
  f.close();
});

test('a whole feedback turn commits once, and a failed batch rolls back without false saved events', async () => {
  const f = await fixture(); await f.assistant.chat('I need a ride in North York.');
  let before = f.db().persistenceCount;
  await f.assistant.chat('Circle of Care worked. Wheel-Trans did not work. Better Living is pending.');
  assert.equal(f.db().persistenceCount - before, 1);
  await f.assistant.clearConversation(); await f.assistant.chat('I need a ride in North York.'); f.events.length = 0;
  before = f.db().persistenceCount;
  await assert.rejects(f.assistant.chat('Circle of Care worked. Wheel-Trans failed for patient ID: ABCD12345.'), /identifiers/);
  assert.equal(f.db().persistenceCount, before); assert.equal((await f.rows()).active_outcome_count, 3); assert.ok(!f.events.some(item => item.type === 'library-saved'));
  await f.assistant.chat('Wheel-Trans worked.'); assert.equal((await f.rows()).active_outcome_count, 4);
  f.close();
});

test('card markup is clickable, request-scoped and escapes service text', () => {
  const html = serviceCards([{ service: { id: 'test-service', name: '<img src=x onerror=alert(1)>', category: 'Transportation', summary: 'A <script>bad</script> summary' }, evidence: { completed: 0 } }], { requestId: 'request-1' });
  assert.ok(html.includes('data-request="request-1"')); assert.ok(html.includes('data-action="open-service"')); assert.ok(html.includes('data-action="card-result"')); assert.ok(html.includes('&lt;img')); assert.ok(!html.includes('<script>'));
});

test('an unrecognized named provider is never silently replaced by the current selection', async () => {
  const f = await fixture(); const initial = await f.assistant.chat('I need a ride in North York.');
  await f.assistant.selectService('circle-iride', initial.request_id);
  const answer = await f.assistant.chat('I tried a different provider and they said no.');
  assert.equal(answer.choose_provider, true); assert.equal((await f.rows()).active_outcome_count, 0);
  await f.assistant.chat('I mean CHATS iRIDEplus');
  assert.equal((await f.rows()).outcomes[0].service_id, 'chats-rides'); assert.equal((await f.rows()).outcomes[0].delivery, 'Not received');
  f.close();
});

test('asking for other options advances the cards and offers a wider directory when the saved set is exhausted', async () => {
  const f = await fixture(); const first = await f.assistant.chat('I need a ride in North York.');
  const next = await f.assistant.chat('Show other options');
  assert.ok(next.cards.every(item => !first.cards.some(previous => previous.service.id === item.service.id)));
  const last = await f.assistant.chat('Show other options'); assert.equal(last.cards.length, 0); assert.equal(last.choices[0].action, 'directory');
  f.close();
});

test('local recommendation and feedback latency is measured with 5,000 prior attempts and no AI dependency', async () => {
  const f = await fixture();
  await f.db().transaction(async () => { for (let index = 0; index < 5000; index++) await f.db().prepare('INSERT INTO hive_outcomes (id,owner_id,submission_id,service_id,category,region,age_band,mobility,language,timing,delivery,satisfaction,reason,share,occurred_on,created_at,updated_at,version) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind('bench-'+index,'karen','bench-'+index,index%2?'circle-iride':'ttc-wheeltrans','Transportation','North York','Unspecified','Unspecified','Unspecified','Flexible','Received',null,'None',0,'2026-11-12','2026-11-12','2026-11-12',1).run(); });
  const measurements = [];
  for (let index = 0; index < 12; index++) {
    await f.assistant.clearConversation(); let start = performance.now(); const request = await f.assistant.chat('I need a ride in North York.'); const recommendation_ms = performance.now()-start;
    await f.assistant.selectService('circle-iride', request.request_id); start = performance.now(); await f.assistant.chat('This did not work.'); measurements.push({ recommendation_ms, feedback_ms: performance.now()-start });
  }
  const stats = key => { const values = measurements.map(item => item[key]).sort((a,b)=>a-b); return { median_ms: Math.round(values[Math.floor(values.length/2)]), p95_ms: Math.round(values[Math.ceil(values.length*.95)-1]), max_ms: Math.round(values.at(-1)) }; };
  await writeFile('.runtime/performance-1.5.0.json', JSON.stringify({ seeded_isolated_attempts:5000,samples:measurements.length,recommendation:stats('recommendation_ms'),feedback:stats('feedback_ms'),ai_requests:0 },null,2));
  assert.equal((await f.rows()).active_outcome_count, 5012);
  f.close();
});
