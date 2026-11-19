import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, mkdtemp } from 'node:fs/promises';
import { openDatabase } from '../src/database.mjs';
import { DocumentStore } from '../src/documents/store.mjs';
import { DocumentAssistant } from '../src/documents/assistant.mjs';
import { ensureKnownServices, knownServices, serviceDirectoryDocument, serviceCategories } from '../src/documents/services.mjs';
import { APP_NAME, windowsDataDirectory } from '../src/app-identity.mjs';
import { parseDocument } from '../src/documents/parse.mjs';

async function fixture() {
  await mkdir('.runtime/tests', { recursive: true });
  const folder = await mkdtemp(path.resolve('.runtime/tests/known-services-'));
  const options = { filename: path.join(folder, 'documents.sqlite'), wasm: path.resolve('node_modules/sql.js/dist/sql-wasm.wasm'), migrations: path.resolve('drizzle'), catalog: [] };
  let db = await openDatabase(options), owner = 'user-a';
  const store = new DocumentStore({ database: () => db, owner: () => owner });
  return { store, switch(value) { owner = value; }, async reopen() { await db.close(); db = await openDatabase(options); }, close: () => db.close() };
}

test('researched directory starts with 27 dated public services and no invented contacts or outcomes', async () => {
  assert.equal(knownServices.length, 27);
  assert.equal(new Set(knownServices.map(s => s.id)).size, 27);
  assert.equal(serviceCategories.length, 9);
  for (const service of knownServices) {
    assert.equal(new URL(service.source_url).protocol, 'https:');
    assert(service.phone, service.name + ' needs a contact route');
    assert.match(service.source_checked, /^2026-11-(13|18)$/);
  }
  const parsed = serviceDirectoryDocument();
  assert(parsed.sections.every(s => s.fields['Provider page'] && s.fields['Source reviewed']));
  assert.equal(parsed.sections.filter(s => s.fields['Contact name']).length, 1);
  assert(!JSON.stringify(parsed).includes('555-'));
  const f = await fixture();
  try { await ensureKnownServices(f.store); assert.equal((await f.store.export()).comments.length, 0); } finally { await f.close(); }
});

test('first-run preload is idempotent and the public directory is separate from personal imports', async () => {
  const f = await fixture();
  try {
    const first = await ensureKnownServices(f.store), repeated = await ensureKnownServices(f.store);
    assert.equal(first.added, 27); assert.equal(repeated.duplicate, true);
    await f.store.note({ title: 'Follow up', body: 'Ask for a callback tomorrow.' });
    assert.equal((await f.store.list({ collection: 'services' })).total, 27);
    assert.equal((await f.store.list({ collection: 'personal' })).total, 1);
    const rides = await f.store.list({ collection: 'services', category: 'Transportation', query: 'North York' });
    assert(rides.total >= 3); assert(rides.items.every(s => s.category === 'Transportation'));
    await assert.rejects(f.store.list({ collection: 'invalid' }), /supported/);
  } finally { await f.close(); }
});

test('service feedback survives reopening, a new chat, and another user without crossing accounts', async () => {
  const f = await fixture();
  try {
    await ensureKnownServices(f.store);
    const service = (await f.store.list({ collection: 'services', query: 'CHATS iRIDEplus' })).items[0];
    const assistant = new DocumentAssistant({ store: f.store, connection: { session: async () => ({ sharing: false }) } });
    await assistant.chat({ text: 'They could not provide a ride on Tuesday.', card_id: service.id });
    assistant.clear(); await f.reopen(); await ensureKnownServices(f.store);
    assert.equal((await f.store.get(service.id)).comments.length, 1);
    f.switch('user-b'); await ensureKnownServices(f.store);
    const other = (await f.store.list({ collection: 'services', query: 'CHATS iRIDEplus' })).items[0];
    assert.notEqual(other.id, service.id); assert.equal((await f.store.get(other.id)).comments.length, 0);
    await assert.rejects(f.store.get(service.id), /active workspace/);
    f.switch('user-a'); assert.equal((await f.store.get(service.id)).comments.length, 1);
  } finally { await f.close(); }
});

test('updated public research retains the same service card and attached feedback', async () => {
  const f = await fixture();
  try {
    await ensureKnownServices(f.store);
    const card = (await f.store.list({ collection: 'services', query: 'CHATS iRIDEplus' })).items[0];
    await f.store.comment({ card_id: card.id, body: 'Call intake before arranging the next visit.' });
    const revised = knownServices.map(s => s.id === 'chats-rides' ? { ...s, source_notice: 'Updated public-source test note.' } : s);
    await ensureKnownServices(f.store, serviceDirectoryDocument(revised));
    assert.equal((await f.store.list({ collection: 'services' })).total, 27);
    const after = await f.store.get(card.id);
    assert(after.body.includes('Updated public-source test note.')); assert.equal(after.comments.length, 1);
  } finally { await f.close(); }
});

test('backup restores feedback onto preloaded services without duplicating the directory', async () => {
  const f = await fixture();
  try {
    await ensureKnownServices(f.store);
    const card = (await f.store.list({ collection: 'services', query: 'Routes Transportation' })).items[0];
    await f.store.comment({ card_id: card.id, body: 'Useful intake contact.' });
    const backup = await f.store.export(); f.switch('restored-user'); await ensureKnownServices(f.store);
    await f.store.restore(backup); await f.store.restore(backup);
    assert.equal((await f.store.list({ collection: 'services' })).total, 27);
    const restored = (await f.store.list({ collection: 'services', query: 'Routes Transportation' })).items[0];
    assert.equal((await f.store.get(restored.id)).comments.length, 1);
  } finally { await f.close(); }
});

test('service details expose sourced named contacts and phone-only contacts without inventing a person', async () => {
  const f = await fixture();
  try {
    await ensureKnownServices(f.store);
    const named = await f.store.get((await f.store.list({ collection: 'services', query: 'Friendly Calls' })).items[0].id);
    assert(named.contacts.some(c => c.name === 'Emily Leibovitch'));
    const phone = await f.store.get((await f.store.list({ collection: 'services', query: 'YSSN' })).items[0].id);
    assert(phone.contacts.some(c => c.value === '1-844-660-6602' && c.name === ''));
    assert(phone.links.includes('https://yssn.ca/access-services/streamlined-access/'));
  } finally { await f.close(); }
});

test('renaming the Windows app retains the previous data location and supports isolated QA', () => {
  assert.equal(APP_NAME, 'Southlake Care Navigation Support');
  const appData = path.resolve('.runtime/test-appdata');
  assert.equal(windowsDataDirectory(appData), path.join(appData, 'Southlake Hive'));
  assert.equal(windowsDataDirectory(appData, 'relative/path'), path.join(appData, 'Southlake Hive'));
  const isolated = path.resolve('.runtime/test-profile'); assert.equal(windowsDataDirectory(appData, isolated), isolated);
});

test('model selection reflects the actual eligible account list and resets between accounts', async () => {
  const assistant = new DocumentAssistant({ store: {}, connection: { accessToken: async () => 'test-only' }, fetcher: async () => Response.json({ models: [
    { slug: 'eligible-standard', display_name: 'Account standard' }, { slug: 'eligible-instant', display_name: 'Account instant' }, { slug: 'hidden-model', visibility: 'hidden' }
  ] }) });
  const result = await assistant.models();
  assert.equal(result.selected, 'eligible-instant'); assert.equal(assistant.modelItems.length, 2);
  assistant.model = 'eligible-standard'; assert.equal((await assistant.models()).selected, 'eligible-standard');
  assistant.reset(); assert.equal(assistant.model, null); assert.equal(assistant.modelItems.length, 0);
});

test('memory manager excludes public starting cards and includes personal messages and attached service feedback', async () => {
  const f=await fixture();
  try{
    await ensureKnownServices(f.store);assert.equal((await f.store.memories()).total,0);
    const service=(await f.store.list({collection:'services',query:'YSSN'})).items[0];
    await f.store.comment({card_id:service.id,body:'Ask intake for the next appointment.'});
    await f.store.note({body:'Use short answers.',kind:'message'});
    const result=await f.store.memories();assert.equal(result.total,2);
    assert(result.items.some(item=>item.entry_type==='comment'&&item.card_id===service.id&&item.title.includes('YSSN')));
    assert.equal((await f.store.memories({kind:'notes'})).total,1);
    assert.equal((await f.store.memories({kind:'feedback'})).total,1);
    assert.equal((await f.store.memories({query:'next appointment'})).items[0].card_id,service.id);
    f.switch('another-user');await ensureKnownServices(f.store);assert.equal((await f.store.memories()).total,0);
  }finally{await f.close();}
});

test('memory edits and deletions affect future searches, persist after restart, and retain the source service', async () => {
  const f=await fixture();
  try{
    await ensureKnownServices(f.store);
    const service=(await f.store.list({collection:'services',query:'YSSN'})).items[0];
    const note=await f.store.comment({card_id:service.id,body:'Old callback detail.'});
    await f.store.comment({id:note.id,card_id:service.id,expected_version:1,body:'Corrected callback detail.'});
    assert.equal((await f.store.memories({query:'Old callback'})).total,0);
    assert.equal((await f.store.memories({query:'Corrected callback'})).total,1);
    await assert.rejects(f.store.comment({id:note.id,card_id:service.id,expected_version:1,body:'Stale detail.'}),/changed/);
    await f.store.forgetComment({id:note.id,card_id:service.id});await f.reopen();await ensureKnownServices(f.store);
    assert.equal((await f.store.memories()).total,0);assert.equal((await f.store.get(service.id)).comments.length,0);
    assert.equal((await f.store.list({collection:'services'})).total,27);
  }finally{await f.close();}
});

test('memory manager filters document cards, paginates, and keeps full text available for editing', async () => {
  const f=await fixture();
  try{
    const imported=await f.store.import(await parseDocument(Buffer.from('ID,Service,Area\nA,Example Rides,North York\nB,Example Visits,Aurora'),'test.csv'));
    const long='Full editable information. '.repeat(80),personal=await f.store.note({title:'Preference',body:long});
    const source=(await f.store.list({document_id:imported.document_id})).items[0];
    await f.store.comment({card_id:source.id,body:'Check this document row again.'});
    assert.equal((await f.store.memories()).total,4);
    assert.equal((await f.store.memories({kind:'documents'})).total,2);
    assert.equal((await f.store.memories({document_id:imported.document_id})).total,3);
    const page1=await f.store.memories({limit:2}),page2=await f.store.memories({limit:2,offset:2});
    assert.equal(new Set([...page1.items,...page2.items].map(item=>item.id)).size,4);
    const item=(await f.store.memories({kind:'notes'})).items[0];assert(item.body.length<=650);
    assert.equal((await f.store.get(personal.id)).body,long.trim());
    await assert.rejects(f.store.memories({kind:'unsupported'}),/supported/);
  }finally{await f.close();}
});

test('automatic message saving is editable without duplicating a retry or training a reported outcome', async () => {
  const f=await fixture();
  try{
    const assistant=new DocumentAssistant({store:f.store,connection:{session:async()=>({sharing:false})}});
    await assistant.chat({text:'Please remember I prefer a phone contact.'});
    const saved=(await f.store.memories({kind:'notes'})).items[0];assert.equal(saved.kind,'message');
    await assistant.chat({text:'Please remember I prefer a phone contact.',remember:false});assert.equal((await f.store.memories()).total,1);
    await f.store.note({id:saved.id,expected_version:saved.version,title:'Contact preference',body:'Prefer email contacts.'});
    assert.equal((await f.store.memories({query:'phone contact'})).total,0);
    assert.equal((await f.store.memories({query:'email contacts'})).total,1);
    await f.store.forgetCard(saved.id);await f.reopen();assert.equal((await f.store.memories()).total,0);
  }finally{await f.close();}
});
