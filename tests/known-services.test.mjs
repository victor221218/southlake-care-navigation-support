import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { mkdir, mkdtemp, readFile, writeFile, copyFile } from 'node:fs/promises';
import { openDatabase } from '../src/database.mjs';
import { DocumentStore } from '../src/documents/store.mjs';
import { DocumentAssistant } from '../src/documents/assistant.mjs';
import { ensureKnownServices, knownServices, serviceDirectoryDocument, serviceCategories } from '../src/documents/services.mjs';
import { APP_NAME, windowsDataDirectory } from '../src/app-identity.mjs';
import { parseDocument } from '../src/documents/parse.mjs';
import { DocumentImporter } from '../src/documents/importer.mjs';
import { DocumentCases } from '../src/documents/cases.mjs';
import { CaseFollowups } from '../src/documents/case-followups.mjs';
import { InputHistory } from '../src/documents/input-history.mjs';
import { mayRequestServiceForm, missingServiceDetails, OWN_SERVICE_FORMAT, serviceFormFromMessage } from '../src/documents/service-sources.mjs';
import { writeServiceFixture } from './document-fixtures.mjs';

async function fixture(migrations=path.resolve('drizzle')) {
  await mkdir('.runtime/tests', { recursive: true });
  const folder = await mkdtemp(path.resolve('.runtime/tests/known-services-'));
  const options = { filename: path.join(folder, 'documents.sqlite'), wasm: path.resolve('node_modules/sql.js/dist/sql-wasm.wasm'), migrations, catalog: [] };
  let db = await openDatabase(options), owner = 'user-a';
  const store = new DocumentStore({ database: () => db, owner: () => owner });
  return { store, folder, switch(value) { owner = value; }, async reopen(updatedMigrations=options.migrations) { await db.close(); options.migrations=updatedMigrations; db = await openDatabase(options); }, close: () => db.close() };
}

function importerFor(f) {
  return new DocumentImporter({store:f.store,directory:path.join(f.folder,'files'),
    worker:path.resolve('dist/document-worker.cjs'),pdfWorker:path.resolve('dist/pdf.worker.mjs')});
}

test('inventory finds its real headers, combines repeated program rows and preserves feedback on update', async () => {
  const f=await fixture();
  try {
    const importer=importerFor(f);
    const filename=path.join(f.folder,'Fictional inventory.xlsx');
    const writeInventory=async phone=>{
      const book=new ExcelJS.Workbook();
      book.addWorksheet('Quick guide').addRows([['Service', 'Note'],['Example text', 'Not a program row']]);
      const sheet=book.addWorksheet('Service Inventory');
      sheet.addRows([
        ['Fictional inventory'],
        ['Service','','Referrals','Contacts'],
        ['Partner / organization','Program / clinic','Service type','Services offered','Georgina','Main contact phone',
          'Eligibility','Information source','Last verified date'],
        ['Example Birch','Respite','Caregiver support','In-person respite','Yes',phone,'Adults','Provider list','2026-11-24'],
        ['Example Birch','Respite','Caregiver support','Virtual respite','Yes','','Adults','Partner list','2026-11-24'],
        ['Example Fern','Check-in','Caregiver support']
      ]);
      await book.xlsx.writeFile(filename);
    };
    await writeInventory('905-555-0117');
    const review=await importer.prepare(filename,{services:true});
    assert.equal(review.rows.length,2);
    assert.equal(review.rows[0].values.area,'Georgina');
    assert.match(review.rows[0].values.details,/Virtual respite/);
    await importer.confirmServices(review.id);
    const [ready,missing]=(await f.store.list({collection:'services'})).items.sort((a,b)=>a.title.localeCompare(b.title));
    assert.equal(ready.title,'Example Birch · Respite');
    assert(missing.missing_details.includes('service area'));
    assert(missing.missing_details.includes('phone or email'));
    await f.store.serviceResult({card_id:ready.id,outcome:'worked',rating:4});
    await writeInventory('905-555-0197');
    const revision=await importer.prepare(filename,{services:true});
    assert.equal(revision.previous.can_update,true);
    const saved=await importer.confirmServices(revision.id,true);
    assert.equal(saved.updated,2);
    const updated=await f.store.get(ready.id);
    assert.equal(updated.contacts[0].value,'905-555-0197');
    assert.equal(updated.experience.rating_average,4);
    assert.match(updated.fields['Information source'],/Partner list/);
    assert.match(updated.fields['Source rows'],/row 5/);
  } finally { await f.close(); }
});

test('tracker imports only reviewed provider outcomes and deduplicates after reimport and backup', async () => {
  const f=await fixture();
  try {
    await f.store.addOwnService({name:'Referral desk',organization:'Example Agency',category:'Home supports'});
    const [card]=(await f.store.list({collection:'services'})).items;
    const filename=path.join(f.folder,'Fictional navigation.csv'),importer=importerFor(f);
    await writeFile(filename,[
      'Date of Inquiry,Client Name / ID,Client Phone,Partner Agency,Status,Details / Discussion,Outcome / Next Steps,Case Closed',
      '2026-11-24,EXAMPLE-PRIVATE-ID,000-000-0000,Example Agency,Closed,DEMO-PRIVATE-NOTE,Did not work,Yes',
      '2026-11-24,EXAMPLE-PENDING-ID,,Example Agency,Closed,,Referral sent,Yes'
    ].join('\n'));
    const review=await importer.prepare(filename,{services:true});
    assert.equal(review.tracking,true);
    assert.deepEqual(review.rows.map(row=>row.include),[true,false]);
    assert(!JSON.stringify(review).includes('PRIVATE'));
    assert.equal((await importer.confirmTracking(review.id)).count,1);
    const saved=await f.store.get(card.id);
    assert.equal(saved.experience.not_worked,1);
    assert.equal(saved.experience.rating_count,0);
    assert.equal(saved.has_original,0);
    const repeated=await importer.prepare(filename,{services:true});
    assert.equal(repeated.rows[0].duplicate,true);
    assert.equal(repeated.rows[1].outcome,null);
    const backup=await f.store.export();
    assert(!JSON.stringify(backup).includes('PRIVATE'));
    f.switch('recipient');
    await f.store.restore(backup);
    const restored=await importer.prepare(filename,{services:true});
    assert.equal(restored.rows[0].duplicate,true);
    assert.equal((await f.store.list({collection:'personal'})).total,0);
  } finally { await f.close(); }
});

test('a spoken-style result is saved to the right card, ranks lower in a new case, and is explained', async () => {
  const f=await fixture();
  try {
    for (const organization of ['Example Alder Society of Sample County','Example Bay Society']) {
      await f.store.addOwnService({name:'Respite',organization,category:'Caregiver support',area:'Georgina',
        details:organization.includes('Alder')?'Supports caregivers in York Region.':''});
    }
    const cases=new DocumentCases({store:f.store});
    const inputHistory=new InputHistory({store:f.store});
    const followups=new CaseFollowups({cases,store:f.store,inputHistory});
    const assistant=new DocumentAssistant({store:f.store,cases,followups,
      connection:{session:async()=>{throw new Error('This demo should stay local');}}});
    const original=await cases.create();
    const ask='Find caregiver support in York Region. Show ranked service cards.';
    const before=await assistant.chat({case_id:original.id,text:ask,remember:false});
    const [alder,bay]=before.cards;
    assert.match(alder.title,/Example Alder/);
    const possible=await assistant.chat({case_id:original.id,
      text:'We tried Example Aldar Society of Sample County and it did not work.',remember:false});
    assert.match(possible.text,/Which service/);
    assert.equal((await f.store.get(alder.id)).experience.not_worked,0);
    const report='We tried Example Alder Society of Sample County and it did not work. Rating one out of five.';
    const saved=await assistant.chat({case_id:original.id,text:report,remember:false});
    assert.match(saved.text,/Saved Didn’t work · 1\/5/);
    assert.equal((await f.store.get(alder.id)).experience.rating_average,1);
    const repeat=await assistant.chat({case_id:original.id,text:report,remember:false});
    assert.match(repeat.text,/already has a result/);
    assert.equal((await f.store.get(alder.id)).experience.not_worked,1);
    await f.reopen();
    const fresh=await cases.create();
    const ranked=await assistant.chat({case_id:fresh.id,text:ask,remember:false});
    assert.deepEqual(ranked.cards.map(card=>card.id),[bay.id,alder.id]);
    assert.match(ranked.cards[1].card_rank_reason,/1\.0\/5/);
    const why=await assistant.chat({case_id:fresh.id,text:'How did you rank the options?',remember:false});
    assert.match(why.text,/1\. Example Bay Society/);
    assert.match(why.text,/2\. Example Alder Society.*1\.0\/5/);
    assert.equal((await f.store.list({collection:'services',directory:true})).items[0].id,alder.id);
  } finally { await f.close(); }
});

test('plain-language feedback and a later rating attach to the one service added in the chat', async () => {
  const f=await fixture();
  try {
    const cases=new DocumentCases({store:f.store});
    const followups=new CaseFollowups({cases,store:f.store,inputHistory:new InputHistory({store:f.store})});
    const assistant=new DocumentAssistant({store:f.store,cases,followups,connection:{session:async()=>({sharing:false})}});
    const report=(caseId,text)=>assistant.chat({case_id:caseId,text,remember:false});
    const original=await cases.create();
    const form=await report(original.id,'Can you add a service for me?');
    const {card_id}=await cases.saveServiceForm({case_id:original.id,message_id:form.turn_id,values:{
      name:'Example Kinross Home Desk',category:'Home supports',area:'North York',phone:'416-555-0181'
    }});
    const outcome=await report(original.id,'I did not enjoy using the service.');
    assert.match(outcome.text,/Saved Didn’t work for Example Kinross/);
    assert.equal(outcome.cards[0].id,card_id);
    assert.equal(outcome.cards[0].experience.rating_average,null);
    const initial=(await f.store.get(card_id)).comments.find(comment=>comment.outcome);

    const bad=await report(original.id,'Rating -1/5.');
    assert.match(bad.text,/whole-number rating from 1 to 5/);
    assert.equal((await f.store.get(card_id)).experience.rating_count,0);
    const updated=await report(original.id,'Two out of five.');
    assert.match(updated.text,/Saved your 2\/5 rating for Example Kinross/);
    assert.equal(updated.cards[0].experience.rating_average,2);
    const repeat=await report(original.id,'I’d rate it 2/5.');
    assert.match(repeat.text,/already has a result/);
    const saved=(await f.store.get(card_id)).comments;
    assert.equal(saved.length,1);
    assert.equal(saved[0].id,initial.id);
    assert.equal(saved[0].body,initial.body);

    await f.reopen();
    const next=await cases.create();
    const rating=await report(next.id,'What rating did I save for Example Kinross Home Desk?');
    assert.equal(rating.presentation,'service-experience');
    assert.deepEqual(rating.cards.map(card=>card.id),[card_id]);
    assert.equal(rating.cards[0].experience.rating_average,2);
    const noGuess=await report(next.id,'I did not enjoy using the service.');
    assert.match(noGuess.text,/Which service/);
    assert.equal((await f.store.get(card_id)).experience.not_worked,1);
    await report(next.id,'Did I say Example Kinross Home Desk worked?');
    assert.equal((await f.store.get(card_id)).experience.worked,0);

    const historic=await followups.latestSelection(original.id,card_id);
    const beforeUndo=await followups.view(historic);
    const undone=await followups.update({case_id:original.id,message_id:historic.id,step:'undo',
      change_id:beforeUndo.payload.followup.history.undo.id});
    assert.equal(undone.payload.followup.result.rating,null);
    const redone=await followups.update({case_id:original.id,message_id:historic.id,step:'redo',
      change_id:undone.payload.followup.history.redo.id});
    assert.equal(redone.payload.followup.result.rating,2);
  } finally { await f.close(); }
});

test('chat opens a service form, saves a partial card once, and restores the link', async () => {
  const f = await fixture();
  try {
    await ensureKnownServices(f.store);
    const cases = new DocumentCases({store:f.store});
    const assistant = new DocumentAssistant({store:f.store,cases,connection:{
      session:async()=>assert.fail('The add-service form should be prepared locally')
    }});
    const record = await cases.create();
    const reply = await assistant.chat({case_id:record.id,text:'Can you add in a service for me'});
    assert.equal(reply.presentation,'service-form');
    assert.deepEqual(reply.cards,[]);
    assert.equal(await f.store.ownServiceCount(),0);
    for (const prompt of [
      'Can you add a service result?',
      'Can you add a service to this case?',
      'Add a note to a transportation service',
      'Add a phone number to the transportation service',
      'Open the transportation service',
      'Find transportation services in North York',
      'List transportation services in North York',
      'Put me in touch with a transportation provider'
    ]) {
      assert.equal(serviceFormFromMessage(prompt),null,prompt);
      assert.equal(mayRequestServiceForm(prompt),false,prompt);
    }
    assert.ok(serviceFormFromMessage('I have a new provider to add to Known services.'));
    assert.ok(serviceFormFromMessage('Um, I have a provider to add to Known services.'));
    assert.ok(serviceFormFromMessage('Can you show me a form to add a service?'));
    assert.equal(serviceFormFromMessage('Add Example Community Ride to my own services.').name,'Example Community Ride');
    assert.equal(serviceFormFromMessage('Can you add the following service?\nProgram / clinic: Example Access Line').name,'Example Access Line');
    const contextual=await assistant.chat({case_id:record.id,text:'Okay, could you help me add a new transportation service?'});
    assert.equal(contextual.presentation,'service-form');
    assert.equal(contextual.service_form.category,'Transportation');
    assert.deepEqual(contextual.cards,[]);
    const draft = serviceFormFromMessage('Please add a new service called Example Ride.\nPhone: 905-555-0129\nService area: Aurora');
    assert.equal(draft.name,'Example Ride');
    assert.equal(draft.phone,'905-555-0129');
    assert.equal(draft.area,'Aurora');

    const input = {case_id:record.id,message_id:reply.turn_id,values:{organization:'Example Intake Desk'}};
    await assert.rejects(cases.saveServiceForm({...input,values:{}}),/Enter at least one detail/);
    const [saved,retry] = await Promise.all([cases.saveServiceForm(input),cases.saveServiceForm(input)]);
    assert.equal(saved.card_id,retry.card_id);
    assert.equal(await f.store.ownServiceCount(),1);
    const entry = await f.store.get(saved.card_id);
    assert.equal(entry.title,'Example Intake Desk');
    assert.equal(entry.source_format,OWN_SERVICE_FORMAT);
    assert.equal(entry.fields['Service or program'],undefined);
    assert.ok(['service name','category','phone or email'].every(gap=>entry.missing_details.includes(gap)));
    assert.deepEqual(saved.completion,{message_id:reply.turn_id,title:entry.title,kind:'service-added'});
    await f.reopen();
    const savedChat = await cases.hydrate(await cases.read(record.id));
    const completedForm=savedChat.messages.find(message=>message.id===reply.turn_id);
    assert.equal(completedForm.payload.cards[0].id,entry.id);
    assert.equal(completedForm.body,'Added Example Intake Desk to Known services.');
    assert.equal(savedChat.completion.message_id,reply.turn_id);
    assert.equal((await cases.keepServiceFormChat({case_id:record.id,message_id:reply.turn_id})).completion,null);
    await f.reopen();
    assert.equal((await cases.read(record.id)).completion,null);

    const backup = await f.store.export();
    f.switch('restored-service-form');
    await f.store.restore(backup);
    const copy = (await cases.list()).items[0];
    const form = (await cases.hydrate(await cases.read(copy.id))).messages.find(message=>message.payload.cards?.length).payload;
    assert.equal(form.service_form.organization,'Example Intake Desk');
    assert.equal(form.cards[0].title,entry.title);
    assert.notEqual(form.cards[0].id,entry.id);
    assert.equal((await cases.read(copy.id)).completion,null);
  } finally { await f.close(); }
});

test('removed services are private to a workspace, stay out of new recommendations, and retain history on restore', async () => {
  const f=await fixture();
  try {
    await ensureKnownServices(f.store);
    const publicCard=(await f.store.list({collection:'services',query:'North York Seniors'})).items[0];
    const {card_id:ownId}=await f.store.addOwnService({
      name:'Example Neighbourhood Rides',category:'Transportation',area:'North York',phone:'905-555-0182'
    });
    await f.store.serviceResult({card_id:ownId,outcome:'worked',rating:4,body:'Fictional practice result'});
    const cases=new DocumentCases({store:f.store});
    const assistant=new DocumentAssistant({store:f.store,cases,connection:{session:async()=>({sharing:false})}});
    const prompt='Find transportation services in North York. Show ranked service cards.';
    const before=await assistant.chat({text:prompt,remember:false});
    assert(before.cards.some(card=>card.id===ownId));

    await f.store.setServiceRemoved({id:ownId,removed:true});
    await f.store.setServiceRemoved({id:publicCard.id,removed:true});
    assert.equal((await f.store.list({collection:'services',query:'Example Neighbourhood'})).total,0);
    assert.equal((await f.store.list({query:'Example Neighbourhood'})).total,0);
    assert.equal((await f.store.list({collection:'services',removed_services:true})).total,2);
    const fresh=await cases.create();
    const after=await assistant.chat({text:prompt,case_id:fresh.id,remember:false});
    assert(after.cards.length>0&&after.cards.every(card=>![ownId,publicCard.id].includes(card.id)));
    assert.equal((await f.store.get(ownId)).experience.rating_average,4);
    await f.reopen();
    await ensureKnownServices(f.store);
    assert.equal((await f.store.list({collection:'services',removed_services:true})).total,2);

    const backup=await f.store.export();
    f.switch('other-workspace');
    await ensureKnownServices(f.store);
    assert.equal((await f.store.list({collection:'services',removed_services:true})).total,0);
    await f.store.restore(backup);
    const removed=await f.store.list({collection:'services',removed_services:true});
    assert.equal(removed.total,2);
    const restored=removed.items.find(card=>card.title==='Example Neighbourhood Rides');
    assert(restored&&restored.id!==ownId);
    await f.store.setServiceRemoved({id:restored.id,removed:false});
    const visible=(await f.store.list({collection:'services',query:'Example Neighbourhood'})).items[0];
    assert.equal(visible.id,restored.id);
    assert.equal(visible.experience.worked,1);
    assert.equal(visible.experience.rating_average,4);
    assert.equal((await f.store.get(visible.id)).comments[0].body,'Fictional practice result');
  } finally { await f.close(); }
});

test('permanent deletion clears removed service data and prevents automatic public reseeding for that workspace',async()=>{
  const f=await fixture();
  try {
    await ensureKnownServices(f.store);
    const publicCard=(await f.store.list({collection:'services',query:'North York Seniors'})).items[0];
    const cases=new DocumentCases({store:f.store});
    const assistant=new DocumentAssistant({store:f.store,cases,connection:{session:async()=>({sharing:false})}});
    const form=await assistant.chat({text:'Add a service',remember:false});
    const {card_id:ownId}=await cases.saveServiceForm({case_id:form.case_id,message_id:form.turn_id,
      values:{name:'Example Shuttles',phone:'905-555-0133'}});
    const inputs=new InputHistory({store:f.store});
    await inputs.record({type:'comment',card_id:ownId,label:'Record service result'},()=>f.store.serviceResult({
      card_id:ownId,outcome:'worked',rating:4,body:'Practice result'
    }));
    await assert.rejects(f.store.deleteRemovedService({id:ownId}),/Removed services/);
    await f.store.setServiceRemoved({id:publicCard.id,removed:true});
    await f.store.setServiceRemoved({id:ownId,removed:true});
    await f.store.deleteRemovedService({id:ownId});
    await f.store.deleteRemovedService({id:publicCard.id});
    assert.equal((await inputs.state({card_id:ownId})).undo,null);
    const chat=await cases.hydrate(await cases.read(form.case_id));
    assert.equal(chat.completion,null);
    const receipt=chat.messages.at(-1);
    assert.equal(receipt.payload.service_form_saved,true);
    assert.deepEqual(receipt.payload.cards,[]);
    assert.equal(receipt.payload.service_form,undefined);
    await assert.rejects(cases.saveServiceForm({case_id:form.case_id,message_id:form.turn_id,
      values:{name:'Duplicate service'}}),/already saved/);

    await f.reopen();
    await ensureKnownServices(f.store);
    const revised=knownServices.map(service=>service.id===publicCard.source_key ?
      {...service,summary:'Updated summary for the test catalogue.'} : service);
    await ensureKnownServices(f.store,serviceDirectoryDocument(revised));
    assert.equal((await f.store.list({collection:'services',query:'North York Seniors'})).total,0);
    assert.equal((await f.store.list({collection:'services',removed_services:true})).total,0);
    assert.equal((await f.store.export()).comments.length,0);
    for (const id of [ownId,publicCard.id]) await assert.rejects(f.store.get(id),/active workspace/);
    f.switch('different-profile');
    await ensureKnownServices(f.store);
    assert.equal((await f.store.list({collection:'services',query:'North York Seniors'})).total,1);
  } finally { await f.close(); }
});

test('own service contacts, changes and results stay attached to the same private directory card', async () => {
  const f=await fixture();
  try {
    await ensureKnownServices(f.store);
    const values={name:'Fictional Shuttle',organization:'Example Agency',category:'Transportation',
      area:'Newmarket',person:'Alex Example',phone:'905-555-0117',email:'trips@example.org',details:'Call to reserve a ride.'};
    await f.store.addOwnService(values);
    const {items,total}=await f.store.list({collection:'services',limit:1});
    const [own]=items;
    assert.equal(total,28);
    assert.equal(own.source_format,OWN_SERVICE_FORMAT);
    assert.equal((await f.store.list({collection:'personal'})).total,0);
    assert.deepEqual(own.contacts.map(contact=>contact.value),['905-555-0117','trips@example.org']);
    await f.store.comment({card_id:own.id,body:'Ask whether an escort can ride.'});
    await f.store.serviceResult({card_id:own.id,outcome:'worked',rating:4});
    await f.store.updateOwnService({id:own.id,expected_version:own.version,
      values:{...values,person:'Sam Example',phone:'905-555-0197'}});
    await assert.rejects(f.store.updateOwnService({id:own.id,expected_version:own.version,values}),/changed/);
    const revised=await f.store.get(own.id);
    assert.deepEqual(revised.contacts[0],{kind:'phone',name:'Sam Example',value:'905-555-0197'});
    assert.equal(revised.comments.length,2);
    assert.equal(revised.experience.rating_average,4);
    const grouped=await f.store.memories({grouped:true,query:'Example Agency'});
    assert.equal(grouped.items[0].title,'Example Agency');
    assert.equal(grouped.record_count,2);
    const backup=await f.store.export();
    f.switch('recipient');
    await ensureKnownServices(f.store);
    assert.equal((await f.store.list({collection:'services'})).total,27);
    await assert.rejects(f.store.get(own.id),/active workspace/);
    await f.store.restore(backup);
    const restored=(await f.store.list({collection:'services',limit:1})).items[0];
    assert.equal(restored.source_format,OWN_SERVICE_FORMAT);
    assert.equal(restored.contacts[0].value,'905-555-0197');
    assert.equal(restored.experience.rating_average,4);
  } finally { await f.close(); }
});

test('reviewed workbook rows become own services while retaining their fields and source file', async () => {
  const f=await fixture();
  try {
    const filename=await writeServiceFixture(f.folder);
    await ensureKnownServices(f.store);
    const importer=new DocumentImporter({store:f.store,directory:path.join(f.folder,'files'),
      worker:path.resolve('dist/document-worker.cjs'),pdfWorker:path.resolve('dist/pdf.worker.mjs')});
    const preview=await importer.prepare(filename);
    const review=await importer.reviewServices(preview.id);
    assert.equal(review.rows.length,3);
    assert.deepEqual(review.rows.map(row=>row.include),[true,true,false]);
    assert.equal(review.rows[0].values.email,'rides@example.org');
    assert.equal(missingServiceDetails(review.rows[1].values).length,2);
    importer.setServiceRow({id:review.id,index:1,include:true,
      values:{...review.rows[1].values,area:'Aurora',email:'meals@example.org'}});
    const saved=await importer.confirmServices(review.id);
    assert.equal(saved.count,2);
    assert.equal(path.extname((await f.store.document(saved.document_id)).original_path),'.xlsx');
    assert.equal((await importer.prepare(filename,{services:true})).duplicate,true);
    assert.equal((await f.store.list({collection:'services'})).total,29);
    assert((await f.store.serviceCategories()).includes('Meals and food'));
    const [card]=(await f.store.list({collection:'services',query:'meals@example.org',category:'Meals and food'})).items;
    const info=await f.store.get(card.id);
    assert.equal(info.fields['Eligibility notes'],'Weekday delivery');
    assert.equal(info.fields['Service area'],'Aurora');
    assert.equal(info.has_original,1);
    const regular=await importer.prepare(filename);
    assert(!regular.previous);
    await importer.confirm(regular.id);
    assert.equal((await f.store.list({collection:'personal'})).total,3);
    assert.equal((await f.store.list({collection:'services'})).total,29);
    const backup=await f.store.export();
    f.switch('recipient');
    await f.store.restore(backup);
    const [restored]=(await f.store.list({collection:'services',query:'Fictional Meal Drop'})).items;
    assert.equal(restored.source_format,OWN_SERVICE_FORMAT);
    assert.equal(restored.contacts[0].value,'meals@example.org');
    assert.equal((await f.store.get(restored.id)).fields['Eligibility notes'],'Weekday delivery');
  } finally { await f.close(); }
});

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
  assert.equal(APP_NAME, 'Care Navigation Support');
  const appData = path.resolve('.runtime/test-appdata');
  assert.equal(windowsDataDirectory(appData), path.join(appData, 'Southlake Hive'));
  assert.equal(windowsDataDirectory(appData, 'relative/path'), path.join(appData, 'Southlake Hive'));
  const isolated = path.resolve('.runtime/test-profile'); assert.equal(windowsDataDirectory(appData, isolated), isolated);
});

test('model selection prefers eligible Astra then Sol, respects manual choice and resets between accounts', async () => {
  let models=[
    {slug:'eligible-instant',display_name:'Account instant'},
    {slug:'gpt-6.2-sol',display_name:'GPT-6.2 Sol'},
    {slug:'gpt-6.2-astra',display_name:'GPT-6.2 Astra'}
  ];
  const assistant = new DocumentAssistant({store:{},connection:{accessToken:async()=>'test-only'},
    fetcher:async()=>Response.json({models})});
  const result = await assistant.models();
  assert.equal(result.selected,'gpt-6.2-astra');
  assistant.model='eligible-instant';
  assert.equal((await assistant.models()).selected,'eligible-instant');
  assistant.reset();
  assert.equal(assistant.model,null); assert.equal(assistant.modelItems.length,0);
  models[2]={...models[2],visibility:'hidden'};
  assert.equal((await assistant.models()).selected,'gpt-6.2-sol');
  assert.equal(assistant.modelItems.length,2);
  models=models.slice(0,1);
  assert.equal((await assistant.models()).selected,'eligible-instant');
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


test('explicit service results keep personal counts and optional ratings accurate through edits, deletion and restart', async()=>{
  const f=await fixture();try{
    await ensureKnownServices(f.store);const card=(await f.store.list({collection:'services',query:'North York Seniors'})).items[0];
    await f.store.comment({card_id:card.id,body:'Did it work? This is a question, not a result.'});
    assert.deepEqual((await f.store.get(card.id)).experience,{worked:0,not_worked:0,rating_count:0,rating_average:null});
    const first=await f.store.serviceResult({card_id:card.id,outcome:'worked',rating:5,body:'Completed the requested ride.'});
    const second=await f.store.serviceResult({card_id:card.id,outcome:'not_worked',body:'No vehicle for Tuesday.'});
    let value=await f.store.get(card.id);assert.deepEqual(value.experience,{worked:1,not_worked:1,rating_count:1,rating_average:5});
    assert.equal(value.comments.find(n=>n.id===second.id).rating,null);
    const list=(await f.store.list({collection:'services',query:'North York Seniors'})).items[0];assert.deepEqual(list.experience,value.experience);assert.equal(list.latest_note,'No vehicle for Tuesday.');
    await f.store.serviceResult({id:first.id,expected_version:1,card_id:card.id,outcome:'not_worked',rating:2,body:'Correction: booking cancelled.'});
    await assert.rejects(f.store.serviceResult({id:first.id,expected_version:1,card_id:card.id,outcome:'worked'}),/changed/);
    await assert.rejects(f.store.comment({id:first.id,expected_version:2,card_id:card.id,body:'Bypass result editing.'}),/result form/);
    await f.store.forgetComment({id:second.id,card_id:card.id});await f.reopen();
    value=await f.store.get(card.id);assert.deepEqual(value.experience,{worked:0,not_worked:1,rating_count:1,rating_average:2});
    const memory=await f.store.memories({kind:'feedback',query:'cancelled'});assert.equal(memory.items[0].outcome,'not_worked');assert.equal(memory.items[0].rating,2);
    await f.store.forgetComment({id:first.id,card_id:card.id});assert.equal((await f.store.get(card.id)).experience.worked,0);assert.equal((await f.store.get(card.id)).experience.not_worked,0);
    assert.equal((await f.store.list({collection:'services'})).total,27);
  }finally{await f.close();}
});

test('service results reject invalid values and stay with the correct service and signed-in owner',async()=>{
  const f=await fixture();try{
    await ensureKnownServices(f.store);const card=(await f.store.list({collection:'services'})).items[0],personal=await f.store.note({body:'Ordinary private note.'});
    for(const input of [{outcome:'pending'},{outcome:'worked',rating:0},{outcome:'worked',rating:6},{outcome:'worked',rating:2.5},{outcome:'worked',rating:'5'}])await assert.rejects(f.store.serviceResult({card_id:card.id,...input}));
    await assert.rejects(f.store.serviceResult({card_id:personal.id,outcome:'worked'}),/known service/);
    const saved=await f.store.serviceResult({card_id:card.id,outcome:'worked'});assert.equal((await f.store.get(card.id)).comments[0].body,'Worked.');
    f.switch('user-b');await ensureKnownServices(f.store);await assert.rejects(f.store.serviceResult({card_id:card.id,outcome:'not_worked'}),/active workspace/);
    await assert.rejects(f.store.forgetComment({card_id:card.id,id:saved.id}),/active workspace/);
    const other=(await f.store.list({collection:'services',query:card.title})).items.find(n=>n.title===card.title);assert.equal((await f.store.get(other.id)).comments.length,0);
    f.switch('user-a');assert.equal((await f.store.get(card.id)).experience.worked,1);
  }finally{await f.close();}
});

test('service-result backups retain ratings without duplication and still accept older note-only backups',async()=>{
  const f=await fixture();try{
    await ensureKnownServices(f.store);const card=(await f.store.list({collection:'services',query:'North York Seniors'})).items[0];
    await f.store.serviceResult({card_id:card.id,outcome:'not_worked',rating:1,body:'No appointment ride available.'});
    const backup=await f.store.export();assert.equal(backup.comments[0].outcome,'not_worked');assert.equal(backup.comments[0].rating,1);
    f.switch('restored');await ensureKnownServices(f.store);await f.store.restore(backup);const repeated=await f.store.restore(backup);assert.equal(repeated.notes_added,0);
    const restored=(await f.store.list({collection:'services',query:'North York Seniors'})).items[0];assert.deepEqual(restored.experience,{worked:0,not_worked:1,rating_count:1,rating_average:1});
    const bad=structuredClone(backup);bad.comments[0].rating=9;await assert.rejects(f.store.restore(bad),/rating/);assert.equal((await f.store.get(restored.id)).comments.length,1);
    const legacy=structuredClone(backup);delete legacy.comments[0].outcome;delete legacy.comments[0].rating;
    f.switch('old-backup');await ensureKnownServices(f.store);await f.store.restore(legacy);
    const old=(await f.store.list({collection:'services',query:'North York Seniors'})).items[0];assert.equal(old.experience.not_worked,0);assert.equal((await f.store.get(old.id)).comments[0].body,'No appointment ride available.');
  }finally{await f.close();}
});

test('upgrading an existing version 2.4 database preserves source cards and notes before recording results',async()=>{
  const folder=await mkdtemp(path.resolve('.runtime/tests/previous-migrations-'));await mkdir(path.join(folder,'meta'));
  const journal=JSON.parse(await readFile('drizzle/meta/_journal.json','utf8'));journal.entries=journal.entries.filter(n=>n.idx<=3);
  await writeFile(path.join(folder,'meta/_journal.json'),JSON.stringify(journal));for(const entry of journal.entries)await copyFile('drizzle/'+entry.tag+'.sql',path.join(folder,entry.tag+'.sql'));
  const f=await fixture(folder);try{
    const legacy=serviceDirectoryDocument(knownServices.slice(0,1));
    const [section]=legacy.sections;
    const time='2026-11-18T12:00:00Z',cardId='legacy-card',docId='legacy-directory',owner='user-a';
    const db=f.store.db();
    await db.prepare(`INSERT INTO personal_documents (id,owner_id,filename,digest,format,imported_at,updated_at,warnings)
      VALUES (?,?,?,?,?,?,?,?)`).bind(docId,owner,legacy.filename,legacy.digest,legacy.format,time,time,'[]').run();
    await db.prepare(`INSERT INTO personal_cards (id,owner_id,document_id,source_key,kind,title,body,locator,fields_json,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(cardId,owner,docId,section.key,'document',section.title,section.body,
        section.locator,JSON.stringify(section.fields),time,time).run();
    await db.prepare('INSERT INTO personal_comments (id,owner_id,card_id,body,created_at,updated_at) VALUES (?,?,?,?,?,?)')
      .bind('legacy-note',owner,cardId,'Retain this existing contact note.',time,time).run();
    await f.reopen(path.resolve('drizzle'));
    await ensureKnownServices(f.store);
    const upgraded=await f.store.get(cardId);
    assert.equal(upgraded.comments[0].body,'Retain this existing contact note.');
    assert.equal(upgraded.comments[0].outcome,null);
    await f.store.serviceResult({card_id:cardId,outcome:'worked',rating:4});
    assert.equal((await f.store.get(cardId)).experience.worked,1);
    await f.reopen();
    assert.equal((await f.store.get(cardId)).comments.length,2);
    assert.equal((await f.store.list({collection:'services'})).total,27);
  }finally{await f.close();}
});

test('AI receives dated personal service results and limits them to the user’s own reported experience',async()=>{
  const f=await fixture();try{
    await ensureKnownServices(f.store);const card=(await f.store.list({collection:'services',query:'North York Seniors'})).items[0];
    await f.store.serviceResult({card_id:card.id,outcome:'not_worked',rating:2,body:'No accessible vehicle on Tuesday.'});let checked=false;
    const assistant=new DocumentAssistant({store:f.store,connection:{session:async()=>({sharing:true}),accessToken:async()=> 'fixture-token'},fetcher:async(url,options)=>{
      const payload=JSON.parse(options.body);assert(payload.instructions.includes('not provider-wide success rates'));assert(payload.instructions.includes('not_worked'));assert(payload.instructions.includes('No accessible vehicle on Tuesday.'));assert(payload.instructions.includes('"rating":2'));checked=true;
      return new Response('data: '+JSON.stringify({type:'response.completed',response:{status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'Your saved note says no accessible vehicle was available on Tuesday. Confirm the new date with intake or compare another service.'}]}]}})+'\n\n');
    }});assistant.model='fixture-model';const answer=await assistant.chat({text:'What happened last time?',card_id:card.id,remember:false});assert(checked);assert.equal(answer.source,'chatgpt');assert(answer.cards.some(n=>n.id===card.id));
  }finally{await f.close();}
});
