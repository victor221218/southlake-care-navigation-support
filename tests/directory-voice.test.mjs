import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import path from 'node:path';
import { openDatabase } from '../src/database.mjs';
import { Memory } from '../src/assistant.mjs';
import { catalog, enums } from '../src/core/catalog.mjs';
import { customService, publicURL } from '../src/core/service-records.mjs';
import { cspForPath } from '../src/security.mjs';
import { voiceAssets } from '../scripts/voice-assets.mjs';
import { loadVoiceModel, Voice } from '../ui/voice.mjs';
import { directoryLinks } from '../ui/directory-links.mjs';
import { linkedMessage } from '../ui/render-text.mjs';

await mkdir('.runtime/tests', { recursive: true });
async function fixture() {
  const folder = await mkdtemp(path.resolve('.runtime/tests/directory-'));
  const options = { filename: path.join(folder, 'hive.sqlite'), wasm: path.resolve('node_modules/sql.js/dist/sql-wasm.wasm'), migrations: path.resolve('drizzle'), catalog };
  let db = await openDatabase(options), owner = 'tester-a';
  const memory = new Memory({ database: () => db, owner: () => owner });
  return { memory, db: () => db, switch(value) { memory.reset(); owner = value; }, async restart() { db.close(); db = await openDatabase(options); }, close() { db.close(); } };
}
const service = () => ({ name: 'Test · Public Ride 26', category: 'Transportation', coverage: ['North York', 'Newmarket'],
  summary: 'Public program fixture for accessible local rides.', source_url: 'https://example.org/program?id=26',
  phone: '416-555-0126', email: 'intake@example.org', address: 'Public office', access: 'Public eligibility criteria.',
  fees: 'Ask intake for the current fare.', referral: 'Contact program intake.', referral_url: 'https://example.org/referral',
  booking_url: 'https://example.org/book', coverage_note: 'Confirm the pickup boundary.',
  minimum_age: 18, maximum_age: 64, wheelchair: 'Available', lifting: false,
  languages: ['English', 'French'], hours: 'Weekday daytime', hours_details: 'Call intake in office hours.', lead_days: 1,
  availability: 'Verify with provider', source_checked: null, keywords: ['shuttle', 'escort'] });

test('saved directory browses all categories, searches names, and excludes a verified incompatible vehicle', async () => {
  const f = await fixture();
  const all = await f.memory.read('search_services');
  assert.equal(all.mode, 'directory'); assert.equal(all.items.length, catalog.length); assert.ok(all.items.length >= 25);
  assert.ok(all.items.every(item => item.fit_score === null));
  const foods = await f.memory.read('search_services', { category: 'Food and nutrition', region: 'Newmarket' });
  assert.ok(foods.items.some(item => item.service.id === 'newmarket-food'));
  assert.ok(foods.items.some(item => item.service.id === 'chats-meals'));
  const rides = await f.memory.read('search_services', { category: 'Transportation', region: 'North York', mobility: 'Wheelchair' });
  assert.equal(rides.mode, 'ranked'); assert.ok(rides.items.some(item => item.service.id === 'ttc-wheeltrans'));
  assert.ok(rides.excluded.some(item => item.service_id === 'nysc-transport'));
  assert.equal((await f.memory.read('search_services', { query: 'North York Harvest' })).items.length, 1);
  assert.equal(new Set(catalog.map(item => item.id)).size, catalog.length);
  for (const item of catalog) { assert.ok(enums.categories.includes(item.category)); item.coverage.forEach(area => assert.ok(enums.regions.includes(area))); publicURL(item.source_url); }
  f.close();
});

test('full service details require confirmation, persist after restart, search immediately, and stay account-scoped', async () => {
  const f = await fixture();
  await f.memory.propose('add_service', service());
  assert.equal((await f.memory.read('list_memory')).added_services.length, 0);
  const { service: saved } = await f.memory.confirm(f.memory.pending.id);
  assert.equal(saved.version, 1); assert.equal(saved.source_checked, null);
  await f.restart();
  const { service: recalled } = await f.memory.read('get_service_details', { service_id: saved.id });
  for (const key of ['phone', 'email', 'fees', 'referral_url', 'booking_url', 'access']) assert.equal(recalled[key], service()[key]);
  assert.deepEqual(recalled.languages, ['English', 'French']);
  assert.ok((await f.memory.read('search_services', { query: 'escort' })).items.some(item => item.service.id === saved.id));
  const outsideAge = await f.memory.read('recommend_services', { category: 'Transportation', region: 'North York', age_band: '65+' });
  assert.ok(outsideAge.excluded.some(item => item.service_id === saved.id));
  f.switch('tester-b');
  assert.equal((await f.memory.read('list_memory')).added_services.length, 0);
  await assert.rejects(f.memory.read('get_service_details', { service_id: saved.id }), /Choose a service/);
  f.close();
});

test('editing a service keeps its outcome identity and rejects stale edits, foreign edits and duplicate additions', async () => {
  const f = await fixture();
  await f.memory.propose('add_service', service()); const saved = (await f.memory.confirm(f.memory.pending.id)).service;
  await f.memory.propose('record_outcome', { service_id: saved.id, category: 'Transportation', region: 'North York', age_band: '40–64', mobility: 'Wheelchair', language: 'English', timing: 'Flexible', delivery: 'Received', reason: 'None', satisfaction: 5 });
  const attempt = (await f.memory.confirm(f.memory.pending.id)).record;
  const update = { ...service(), service_id: saved.id, expected_version: 1, phone: '416-555-0199' };
  await f.memory.propose('update_service', update); const changed = (await f.memory.confirm(f.memory.pending.id)).service;
  assert.equal(changed.id, saved.id); assert.equal(changed.version, 2);
  await f.restart();
  const memory = await f.memory.read('list_memory'); assert.equal(memory.outcomes.length, 1); assert.equal(memory.outcomes[0].id, attempt.id);
  const matching = await f.memory.read('recommend_services', { category: 'Transportation', region: 'North York', age_band: '40–64', mobility: 'Wheelchair' });
  assert.equal(matching.items.find(item => item.service.id === saved.id).evidence.delivery_rate, 100);
  await f.memory.propose('update_service', update); await assert.rejects(f.memory.confirm(f.memory.pending.id), /service changed/); f.memory.cancel();
  await f.memory.propose('add_service', service()); await assert.rejects(f.memory.confirm(f.memory.pending.id), /already saved/); f.memory.cancel();
  f.switch('tester-b'); await f.memory.propose('update_service', { ...update, expected_version: 2 }); await assert.rejects(f.memory.confirm(f.memory.pending.id), /Only your own/);
  f.close();
});

test('an existing version 1.1 directory entry remains readable and editable after upgrade', async () => {
  const f = await fixture();
  const legacy = { name: 'Legacy program', category: 'Home supports', coverage: ['Aurora'], source_url: 'https://example.org/legacy', source_checked: null,
    summary: 'Previously saved program.', access: 'Existing intake requirement.', wheelchair: 'Unknown', languages: ['Confirm with provider'], availability: 'Verify with provider', evidence_origin: 'Personal service · verification needed', phone: '' };
  await f.db().prepare('INSERT INTO hive_custom_services (id,owner_id,submission_id,payload,created_at) VALUES (?,?,?,?,?)').bind('custom-legacy', 'tester-a', 'legacy-operation', JSON.stringify(legacy), '2026-11-01T12:00:00Z').run();
  await f.restart();
  assert.equal((await f.memory.read('list_memory')).added_services[0].name, legacy.name);
  await f.memory.propose('update_service', { service_id: 'custom-legacy', expected_version: 1, name: legacy.name, category: legacy.category, coverage: legacy.coverage, source_url: legacy.source_url, access: legacy.access, summary: legacy.summary, phone: '905-555-0126' });
  const updated = (await f.memory.confirm(f.memory.pending.id)).service;
  assert.equal(updated.id, 'custom-legacy'); assert.equal(updated.version, 2); assert.equal(updated.access, legacy.access); assert.equal(updated.phone, '905-555-0126');
  f.close();
});

test('service validation accepts public directory query URLs and rejects unsafe links and invalid requirements', () => {
  assert.equal(publicURL('https://www.centralhealthline.ca/displayService.aspx?id=123'), 'https://www.centralhealthline.ca/displayService.aspx?id=123');
  for (const source_url of ['http://example.org/a', 'https://127.0.0.1/a', 'https://user:password@example.org/a', 'https://machine.local/a', 'https://example.org:8443/a']) assert.throws(() => customService({ ...service(), source_url }));
  assert.throws(() => customService({ ...service(), maximum_age: 10 }), /Minimum age/);
  assert.throws(() => customService({ ...service(), source_checked: '2026-02-30' }), /review date/);
  assert.throws(() => customService({ ...service(), email: 'not an email' }), /email/);
  assert.throws(() => customService({ ...service(), coverage: [] }), /service area/);
  assert.throws(() => customService({ ...service(), lead_days: -1 }), /whole number/);
  const links = directoryLinks({ category: 'Transportation', region: 'North York', mobility: 'Wheelchair' });
  assert.equal(new URL(links[0].url).searchParams.get('id'), '10109');
  assert.equal(new URL(links[0].url).searchParams.get('region'), 'NorthYork');
  links.forEach(link => publicURL(link.url));
});

test('provider links preserve query parameters and cannot introduce HTML into the conversation', () => {
  const html = linkedMessage('See https://www.centralhealthline.ca/displayService.aspx?id=123&region=NorthYork.\n<script>alert(1)</script>');
  assert.match(html, /data-url="https:\/\/www.centralhealthline.ca\/displayService.aspx\?id=123&amp;region=NorthYork"/);
  assert.ok(!html.includes('<script>')); assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!linkedMessage('https://example.org/" onclick="bad()').includes('data-url="https://example.org/" onclick='));
});

class FakeModel extends EventTarget {
  static latest;
  constructor() { super(); FakeModel.latest = this; this.worker = new EventTarget(); this.worker.terminate = () => { this.killed = true; }; }
  terminate() { this.terminated = true; }
  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
}
test('speech loading reports engine errors, terminates stalled workers and permits a fresh retry', async () => {
  const failed = loadVoiceModel({ Model: FakeModel }, 'hive://app/voice/model.gz');
  FakeModel.latest.emit('error', { error: 'Engine could not initialize' });
  await assert.rejects(failed.promise, /Engine could not initialize/); assert.equal(FakeModel.latest.killed, true);
  const stalled = loadVoiceModel({ Model: FakeModel }, 'hive://app/voice/model.gz', { timeoutMs: 15 });
  await assert.rejects(stalled.promise, /longer than one minute/); assert.equal(FakeModel.latest.killed, true);
  const progress = [];
  const retry = loadVoiceModel({ Model: FakeModel }, 'hive://app/voice/model.gz', { progress: value => progress.push(value) });
  const model = FakeModel.latest; model.emit('hive-progress', { stage: 'Loading the bundled English model' }); model.emit('load', { result: true });
  assert.equal(await retry.promise, model); assert.deepEqual(progress, ['Loading the bundled English model']);
  const cancelled = loadVoiceModel({ Model: FakeModel }, 'hive://app/voice/model.gz'); cancelled.cancel(); await assert.rejects(cancelled.promise, error => error.code === 'voice_cancelled');
});

test('speech errors preserve the failing stage and non-Error diagnostic values', async () => {
  const failed = loadVoiceModel({ Model: FakeModel }, 'hive://app/voice/model.gz');
  FakeModel.latest.emit('error', { stage: 'model-unpack', error: 5851704 });
  await assert.rejects(failed.promise, error => /model-unpack/.test(error.message) && /5851704/.test(error.message));
});

test('speech worker failures do not leave preparation pending and multi-segment checks wait for the final result', async () => {
  const loading = loadVoiceModel({ Model: FakeModel }, 'hive://app/voice/model.gz');
  FakeModel.latest.worker.dispatchEvent(Object.assign(new Event('error'), { message: 'Worker blocked by policy' }));
  await assert.rejects(loading.promise, /Worker blocked/);
  let removed = false;
  const voice = new Voice({ status() {}, transcript() {} });
  const handlers = {};
  voice.model = { KaldiRecognizer: class {
    on(name, fn) { handlers[name] = fn; }
    acceptWaveformFloat() { queueMicrotask(() => handlers.result({ result: { text: 'find home' } })); }
    retrieveFinalResult() { queueMicrotask(() => handlers.result({ final: true, result: { text: 'support in aurora' } })); }
    remove() { removed = true; }
  } };
  assert.equal(await voice.transcribeSamples(new Float32Array(1), 16000), 'find home support in aurora'); assert.equal(removed, true);
});

test('pinned speech engine uses a separate worker and its dynamic compilation stays outside the renderer', async () => {
  const output = voiceAssets(await readFile('node_modules/vosk-browser/dist/vosk.js', 'utf8'));
  assert.match(output.client, /new Worker\(new URL\('voice-worker.js'/);
  assert.ok(!output.client.includes('var WorkerFactory = createBase64WorkerFactory('));
  assert.match(output.worker, /new Function/); assert.match(output.worker, /JSON.parse\(finalResult\), final: true/);
  assert.match(cspForPath('/voice-worker.js'), /'unsafe-eval'/);
  assert.ok(!cspForPath('/index.html').includes("'unsafe-eval'"));
  assert.ok(!cspForPath('/app.js').includes("'unsafe-eval'"));
});
