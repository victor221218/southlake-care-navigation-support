import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdir,mkdtemp} from 'node:fs/promises';
import {openDatabase} from '../src/database.mjs';
import {DocumentStore} from '../src/documents/store.mjs';
import {DocumentCases} from '../src/documents/cases.mjs';
import {CaseFollowups} from '../src/documents/case-followups.mjs';
import {InputHistory} from '../src/documents/input-history.mjs';
import {DocumentAssistant} from '../src/documents/assistant.mjs';
import {ensureKnownServices} from '../src/documents/services.mjs';
import {groupServiceOptions,rankResponseCards} from '../src/documents/ranking.mjs';
import {parseDocument} from '../src/documents/parse.mjs';
async function fixture(){await mkdir('.runtime/tests',{recursive:true});const dir=await mkdtemp(path.resolve('.runtime/tests/cases-')),options={filename:path.join(dir,'memory.sqlite'),wasm:path.resolve('node_modules/sql.js/dist/sql-wasm.wasm'),migrations:path.resolve('drizzle'),catalog:[]};let db=await openDatabase(options),owner='one';const store=new DocumentStore({database:()=>db,owner:()=>owner}),cases=new DocumentCases({store}),inputs=new InputHistory({store});return{store,cases,inputs,switch:value=>owner=value,reopen:async()=>{await db.close();db=await openDatabase(options);},close:()=>db.close()};}
async function service(f){await ensureKnownServices(f.store);return(await f.store.list({collection:'services',query:'North York Seniors'})).items[0];}
const local=f=>new DocumentAssistant({store:f.store,cases:f.cases,connection:{session:async()=>({sharing:false})}});
const northYorkRequest = 'I need transportation in North York for an older adult who uses a walker. Show me suitable service cards.';
const followupsFor = fixture => new CaseFollowups({cases:fixture.cases,store:fixture.store,inputHistory:fixture.inputs});
const rideTitle = 'Transportation in North York · Walker access';
async function recommendedRide(fixture) {
  await ensureKnownServices(fixture.store);
  const topic = await fixture.cases.create();
  const reply = await local(fixture).chat({case_id:topic.id,text:northYorkRequest,remember:false});
  const service = reply.cards.find(card => card.source_format === 'service-directory');
  assert(service, 'The real test prompt must return a selectable service from the directory.');
  const args = {case_id:topic.id,reply_id:reply.turn_id,card_id:service.id};
  return {topic,reply,service,args,followups:followupsFor(fixture)};
}

test('unrated matching own sources lead the same public recommendations locally and with ChatGPT',async()=>{
  const f=await fixture();
  try {
    await ensureKnownServices(f.store);
    const ask=async assistant=>assistant.chat({case_id:(await f.cases.create()).id,
      text:'Can you recommend home services in North York?',remember:false});
    const localAssistant=local(f);
    const baseline=await ask(localAssistant);
    assert(baseline.cards.length>=2 && baseline.cards.every(card=>card.card_source_group==='public'));
    const publicOptions=baseline.cards.map(card=>option(card.id));
    const connected=online(f,async()=>streamed([showOptions(publicOptions)]));
    const connectedBaseline=await ask(connected);
    const fields={category:'Home supports',area:'North York'};
    const {card_id:ownId}=await f.store.addOwnService({...fields,name:'Example Neighbourhood Home Help'});
    const {card_id:wrongArea}=await f.store.addOwnService({...fields,area:'Aurora',name:'Example Aurora Housekeeping'});
    const {card_id:poorId}=await f.store.addOwnService({...fields,name:'Example Housekeeping'});
    await f.store.serviceResult({card_id:poorId,outcome:'not_worked',rating:2});
    for (const [assistant,original] of [[localAssistant,baseline],[connected,connectedBaseline]]) {
      const reply=await ask(assistant);
      assert.equal(reply.cards[0].id,ownId);
      assert.equal(reply.cards[0].card_source_group,'own');
      assert.equal(reply.cards[0].experience.rating_count,0);
      assert.equal(reply.cards[0].experience.rating_average,null);
      assert(!reply.cards.some(card=>card.id===wrongArea));
      assert.equal(reply.cards.at(-1).id,poorId);
      assert.equal(reply.cards.at(-1).card_source_group,'own-review');
      assert.equal(reply.cards.at(-1).experience.rating_average,2);
      const publicIds=reply.cards.filter(card=>card.card_source_group==='public').map(card=>card.id);
      assert.deepEqual(publicIds,original.cards.map(card=>card.id).slice(0,publicIds.length));
      assert(publicIds.length>0);
      const hydrated=await f.cases.hydrate(await f.cases.read(reply.case_id));
      assert.equal(hydrated.messages.at(-1).payload.cards[0].card_source_group,'own');
    }
  } finally { await f.close(); }
});

test('promoting an own source keeps a tried public service in a full shortlist',()=>{
  const publicCards=Array.from({length:6},(_,i)=>({id:'public-'+i,source_format:'service-directory'}));
  publicCards[5].experience={not_worked:1,rating_count:1,rating_average:2};
  const own={id:'own',source_format:'own-services'};
  const groups=groupServiceOptions([...publicCards,own],publicCards);
  assert.deepEqual(groups.map(card=>card.id),['own','public-0','public-1','public-2','public-3','public-5']);
  assert.equal(groups.at(-1).experience.rating_average,2);
});

test('a detailed service request has a short topic title and local category and area matches',async()=>{
  const f=await fixture();
  try {
    const {topic,reply}=await recommendedRide(f);
    const original=await f.cases.row(topic.id);
    assert.equal(original.title,rideTitle);
    assert(reply.cards.length>=3);
    assert(reply.cards.every(card=>card.category==='Transportation'));
    await f.cases.rename({id:topic.id,title:'Return trip planning',expected_version:original.version});
    await local(f).chat({case_id:topic.id,text:'Confirm a pickup with the operator.',remember:false});
    assert.equal((await f.cases.row(topic.id)).title,'Return trip planning');
    assert.equal(await f.cases.suggestedTitle(topic.id),rideTitle);
    const next=await f.cases.create();
    await local(f).chat({case_id:next.id,text:'Please find meal delivery in Aurora.',remember:false});
    assert.equal((await f.cases.row(next.id)).title,'Meal support in Aurora');
    assert.equal((await f.cases.read(topic.id)).message_count,4);
  } finally { await f.close(); }
});

test('the case queue sorts meaningful activity and reflects pending feedback, saved results and closed cases', async () => {
  const f = await fixture();
  try {
    const {topic,args,followups} = await recommendedRide(f);
    const other = await f.cases.create('Meal delivery');
    const oldTime = '2025-11-16T16:00:00.000Z', newTime = '2025-11-17T15:00:00.000Z';
    await f.store.db().prepare('UPDATE personal_case_messages SET updated_at=? WHERE case_id=?').bind(oldTime,topic.id).run();
    await f.store.db().prepare('UPDATE personal_cases SET created_at=? WHERE id=?').bind(newTime,other.id).run();
    await f.cases.activate(topic.id);
    const sorted = (await f.cases.list()).items;
    assert.deepEqual(sorted.map(item=>item.id),[other.id,topic.id]);
    assert.equal(sorted[1].activity_at,oldTime);
    assert.equal(sorted[1].feedback,'unselected');
    assert.equal((await f.cases.list({query:'north york',feedback:'unselected',limit:1})).items[0].id,topic.id);

    const followup = await followups.start(args);
    const step = {case_id:topic.id,message_id:followup.id};
    await followups.update({...step,step:'later'});
    assert.equal((await f.cases.list({feedback:'needed'})).items[0].feedback_sequence,followup.sequence);
    await followups.update({...step,step:'choose',outcome:'worked'});
    assert.equal((await f.cases.list({feedback:'needed'})).total,1);
    const finished = (await followups.update({...step,step:'save',rating:5})).payload.followup;
    assert.equal((await f.cases.list({feedback:'recorded'})).items[0].id,topic.id);
    const fullHistory = await f.cases.list({limit:1,all:true});
    assert.deepEqual(new Map(fullHistory.items.map(item=>[item.id,item.feedback])),
      new Map([[topic.id,'recorded'],[other.id,'unselected']]));
    const undone = (await followups.update({...step,step:'undo',change_id:finished.history.undo.id})).payload.followup;
    assert.equal((await f.cases.list({feedback:'needed'})).total,1);
    await followups.update({...step,step:'redo',change_id:undone.history.redo.id});
    assert.equal((await f.cases.list({feedback:'recorded'})).total,1);

    await f.cases.archive({id:topic.id,expected_version:(await f.cases.row(topic.id)).version});
    assert.equal((await f.cases.list({feedback:'recorded'})).total,0);
    assert.equal((await f.store.memories({kind:'chats'})).total,1);
    await f.cases.reopen(topic.id);
    assert.equal((await f.store.memories({kind:'chats'})).total,0);
    assert.equal((await f.cases.list({feedback:'recorded'})).total,1);
    f.switch('other-account');
    assert.equal((await f.cases.list({all:true})).total,0);
  } finally { await f.close(); }
});

test('chat correction buttons target only their saved note or result, including a later rating change', async () => {
  const f = await fixture();
  try {
    const {topic,service,args,followups} = await recommendedRide(f);
    const {id} = await followups.start(args);
    const step = {case_id:topic.id,message_id:id};
    await followups.update({...step,step:'open-note'});
    await followups.saveDrafts({case_id:topic.id,drafts:[{message_id:id,note_draft:'Practice note for this selection.'}]});
    const saved = (await followups.update({...step,step:'save-note'})).payload.followup;
    const independent = await f.inputs.record({type:'comment',card_id:service.id,label:'Add note'},
      () => f.store.comment({card_id:service.id,body:'Independent note on the same service.'}));
    const otherChange = (await f.inputs.state({card_id:service.id})).undo;
    assert.equal(saved.history.undo.detail,'note');
    await assert.rejects(followups.update({...step,step:'undo',change_id:otherChange.id}),/out of date/);
    const undone = (await followups.update({...step,step:'undo',change_id:saved.history.undo.id})).payload.followup;
    assert.equal(undone.latest_note,null);
    assert.equal((await f.store.get(service.id)).comments[0].id,independent.id);
    await f.reopen();
    const redone = (await followups.update({...step,step:'redo',change_id:undone.history.redo.id})).payload.followup;
    assert.equal(redone.latest_note.id,saved.latest_note.id);

    await followups.update({...step,step:'choose',outcome:'worked'});
    const {result} = (await followups.update({...step,step:'save',rating:5})).payload.followup;
    await f.inputs.record({type:'comment',id:result.id,card_id:service.id,label:'Change service result or rating'},
      () => f.store.serviceResult({id:result.id,card_id:service.id,outcome:result.outcome,rating:1,
        body:result.body,expected_version:result.version}));
    const revised = (await followups.start(args)).payload.followup;
    assert.equal(revised.history.undo.detail,'rating change');
    const corrected = (await followups.update({...step,step:'undo',change_id:revised.history.undo.id})).payload.followup;
    assert.equal(corrected.result.rating,5);
    assert.equal(corrected.history.redo.detail,'rating change');
  } finally { await f.close(); }
});

test('opening pending feedback can jump to an older page without losing access to recent messages', async () => {
  const f = await fixture();
  try {
    const {topic,args,followups} = await recommendedRide(f);
    const {sequence} = await followups.start(args);
    for (let i=0;i<5;i++) {
      const turn = await f.cases.begin({id:topic.id,text:'Another service question '+i});
      await f.cases.finish(turn,{text:'Follow-up detail',source:'local'});
    }
    const latest = await f.cases.read(topic.id,{limit:4});
    assert(!latest.messages.some(message=>message.sequence===sequence));
    const focused = await f.cases.read(topic.id,{focus:sequence,limit:4});
    assert(focused.has_newer);
    assert(focused.messages.some(message=>message.sequence===sequence));
    assert(!latest.has_newer);
  } finally { await f.close(); }
});

test('directory selection starts follow-up and next steps wait for all results and note drafts', async () => {
  const f=await fixture();
  try {
    const firstProvider=await service(f);
    const {items}=await f.store.list({collection:'services',query:'Better Living'});
    const secondProvider=items.find(item=>item.id!==firstProvider.id);
    const chat=await f.cases.create();
    const followups=followupsFor(f);
    const first=await followups.start({case_id:chat.id,card_id:firstProvider.id});
    const second=await followups.start({case_id:chat.id,card_id:secondProvider.id});
    assert(first.payload.followup.card.contacts.length);
    assert.equal((await followups.start({case_id:chat.id,card_id:firstProvider.id})).id,first.id);
    const step=(message,action,args={})=>followups.update({case_id:chat.id,message_id:message.id,step:action,...args});
    await step(first,'choose',{outcome:'worked'});
    assert.equal((await step(first,'save',{rating:4})).completion,null);
    await step(second,'later');
    assert.equal((await f.cases.read(chat.id,{limit:1})).completion,null);
    await step(second,'resume');
    await step(second,'choose',{outcome:'not_worked'});
    const completed=await step(second,'save',{rating:2});
    assert.equal(completed.completion.message_id,second.id);
    assert.equal(completed.completion.rating,2);
    assert.equal((await step(first,'open-note')).completion,null);
    assert.equal((await step(first,'cancel-note')).completion.message_id,second.id);
    assert.equal((await step(second,'keep-chat')).completion,null);
    await f.reopen();
    assert.equal((await f.cases.read(chat.id)).completion,null);
    assert.equal((await f.store.get(secondProvider.id)).experience.not_worked,1);
  } finally { await f.close(); }
});

test('deleting a chat with notes removes linked feedback after archive and backup, with no effect on other notes', async () => {
  const f=await fixture();
  try {
    const provider=await service(f);
    await f.store.comment({card_id:provider.id,body:'Independent service guidance.'});
    const first=await f.cases.create('Practice conversation to discard');
    const other=await f.cases.create('Another conversation to keep');
    const assistant=local(f);
    const remember=(case_id,text,card_id=null)=>assistant.chat({case_id,text:'Remember that '+text,card_id,remember:false,capture_note:true});
    await remember(other.id,'Review eligibility with the intake team.',provider.id);
    await remember(first.id,'The practice note to discard.',provider.id);
    await remember(first.id,'The practice personal memory to discard.');
    const followups=followupsFor(f);
    const reply=await followups.start({case_id:first.id,card_id:provider.id});
    const step=(action,args={})=>followups.update({case_id:first.id,message_id:reply.id,step:action,...args});
    await step('choose',{outcome:'worked'});
    const result=(await step('save',{rating:5})).payload.followup.result;
    // Simulate a result saved by an older build that linked it through the follow-up only.
    await f.store.db().prepare('DELETE FROM personal_case_memory WHERE owner_id=? AND entry_id=?').bind(f.store.owner(),result.id).run();
    await step('open-note');
    await followups.saveDrafts({case_id:first.id,drafts:[{message_id:reply.id,note_draft:'Practice note recorded through the follow-up.'}]});
    const extra=(await step('save-note')).payload.followup;
    await step('undo',{change_id:extra.history.undo.id});
    const archive=await f.cases.archive({id:first.id,expected_version:(await f.cases.row(first.id)).version});
    const backup=await f.store.export();
    await f.cases.delete({id:first.id,expected_version:(await f.cases.row(first.id)).version,include_notes:true});
    assert.equal((await f.inputs.state()).redo,null);
    assert.equal((await f.store.get(provider.id)).experience.worked,0);
    assert.deepEqual((await f.store.get(provider.id)).comments.map(n=>n.body).sort(),
      ['Independent service guidance.','Review eligibility with the intake team.'].sort());
    await assert.rejects(f.store.get(archive.card_id),/active workspace/);
    assert.equal((await f.store.memories({query:'practice personal memory'})).total,0);

    f.switch('restored completion');
    await ensureKnownServices(f.store);
    await f.store.restore(backup);
    const restoredCard=(await f.store.memories({kind:'chats'})).items[0];
    const restored=(await f.store.get(restoredCard.id)).case_info;
    await f.cases.delete({id:restored.id,expected_version:restored.version,include_notes:true});
    const restoredProvider=await service(f);
    assert.equal((await f.store.get(restoredProvider.id)).experience.worked,0);
    assert.deepEqual((await f.store.get(restoredProvider.id)).comments.map(n=>n.body).sort(),
      ['Independent service guidance.','Review eligibility with the intake team.'].sort());
    assert.equal((await f.store.memories({query:'practice personal memory'})).total,0);
  } finally { await f.close(); }
});

test('the memory library groups service notes, results and one saved conversation by organization', async () => {
  const f = await fixture();
  try {
    await ensureKnownServices(f.store);
    const {items:routes} = await f.store.list({collection:'services',query:'Routes Connecting Communities'});
    const food = routes.find(item => item.title.includes('Food Delivery'));
    const rides = routes.find(item => item.title.includes('Transportation'));
    const conversation = await f.cases.create('Aurora delivery and return ride');
    // Exercise the legacy auto-saved records that can exist in an upgraded profile.
    await local(f).chat({case_id:conversation.id,card_id:food.id,text:'What do they charge for practice deliveries?'});
    await local(f).chat({case_id:conversation.id,text:'Are there other days?'});
    assert.equal((await f.store.memories({grouped:true})).record_count,0);

    const note = await f.store.comment({card_id:food.id,body:'Intake can explain the delivery fee.'});
    const result = await f.store.serviceResult({card_id:rides.id,outcome:'worked',rating:5,body:'They called back on Tuesday.'});
    await f.store.note({title:'Billing contact',body:'Ask for the intake desk.',organization:'Routes Connecting Communities'});
    const archive = await f.cases.archive({id:conversation.id,expected_version:(await f.cases.row(conversation.id)).version});
    assert.equal((await f.cases.read(conversation.id)).message_count,4);
    const org = 'organization:routes connecting communities';
    const found = await f.store.memories({grouped:true,query:'Routes Connecting Communities',expanded:org});
    assert.equal(found.total,1);
    assert.equal(found.record_count,4);
    assert.equal(found.items[0].title,'Routes Connecting Communities');
    const ids=found.items[0].history.map(item=>item.id);
    assert(ids.includes(note.id) && ids.includes(result.id) && ids.includes(archive.card_id));
    assert.equal((await f.store.memories({grouped:true,query:'Routes delivery fee'})).record_count,1);
    const saved = await f.store.memories({grouped:true,kind:'chats',query:'Routes Connecting Communities'});
    assert.equal(saved.items[0].preview[0].id,archive.card_id);

    const backup=await f.store.export();
    f.switch('restored library');
    assert.equal((await f.store.memories({grouped:true})).total,0);
    await ensureKnownServices(f.store);
    await f.store.restore(backup);
    const restored = await f.store.memories({grouped:true,kind:'chats',query:'Routes Connecting Communities'});
    assert.equal(restored.record_count,1);
    assert.equal(restored.items[0].title,'Routes Connecting Communities');
  } finally { await f.close(); }
});

test('ordinary questions stay in the case and an explicit note is saved once', async () => {
  const f = await fixture();
  try {
    const provider=await service(f);
    const conversation=await f.cases.create();
    const assistant=local(f);
    const chat = {case_id:conversation.id,card_id:provider.id,remember:false,capture_note:true};
    for (const text of ['Who should I call?', 'How do fees work?', 'Remember what we talked about?', 'Is the service open?']) {
      assert.equal((await assistant.chat({...chat,text})).saved,false);
    }
    assert.equal((await f.cases.read(conversation.id)).message_count,8);
    assert.equal((await f.store.memories({grouped:true})).record_count,0);
    const explicit = await assistant.chat({...chat,text:'Remember that intake requested a callback on Thursday.'});
    assert.equal(explicit.saved,true);
    assert(explicit.text.startsWith('Note saved on'));
    const saved=await f.store.memories({grouped:true,query:'callback on Thursday'});
    assert.equal(saved.record_count,1);
    assert.equal(saved.items[0].title,'North York Seniors Centre');
    await f.cases.delete({id:conversation.id,expected_version:(await f.cases.row(conversation.id)).version});
    assert.equal((await f.store.memories({grouped:true})).record_count,1);
    assert.equal((await f.store.memories({grouped:true,kind:'chats'})).total,0);
  } finally { await f.close(); }
});

test('organization grouping pages full history and recognizes organization columns in imported rows', async () => {
  const f = await fixture();
  try {
    const imported=await f.store.import(await parseDocument(
      Buffer.from('ID,Service,Provider,Phone\nA,Practice shuttle,Example Outreach,416-555-0101'),
      'Practice directory.csv'
    ));
    const card = (await f.store.list({document_id:imported.document_id})).items[0];
    await f.store.db().transaction(async()=>{
      for (let i=0;i<21;i++) await f.store.comment({card_id:card.id,body:'Practice note '+i});
    });
    const expanded='organization:example outreach';
    const first=(await f.store.memories({grouped:true,expanded,query:'Example Outreach'})).items[0];
    assert.equal(first.title,'Example Outreach');
    assert.equal(first.total,22);
    assert.equal(first.history.length,20);
    assert(first.has_more);
    const last=(await f.store.memories({grouped:true,expanded,history_offset:20})).items[0];
    assert.equal(last.history.length,2);
    assert(!last.has_more);
    assert.equal(new Set([...first.history,...last.history].map(item=>item.id)).size,22);
  } finally { await f.close(); }
});

test('selecting, deferring and preparing a chat result retain the right provider and private draft after a restart',async()=>{
  const f=await fixture();
  try {
    const {topic,service,args,followups}=await recommendedRide(f);
    const first=await followups.start(args);
    const duplicate=await followups.start(args);
    assert.equal(duplicate.id,first.id);
    assert(first.payload.followup.card.contacts.length);
    const step={case_id:topic.id,message_id:first.id};
    assert((await followups.update({...step,step:'later'})).payload.followup.deferred);
    await followups.update({...step,step:'resume'});
    await followups.update({...step,step:'choose',outcome:'not_worked'});
    await followups.saveDrafts({case_id:topic.id,drafts:[{message_id:first.id,body:'Practice note to finish later.',rating:2}]});
    const next=await f.cases.create('Other topic');
    assert.equal((await f.store.get(service.id)).comments.length,0);
    await f.reopen();
    const saved=(await f.cases.hydrate(await f.cases.read(topic.id))).messages.at(-1).payload.followup;
    assert.equal(saved.outcome,'not_worked');
    assert.equal(saved.body,'Practice note to finish later.');
    assert.equal(saved.rating,2);
    await assert.rejects(followups.update({case_id:next.id,message_id:first.id,step:'save'}),/unavailable in this topic/);
    f.switch('another-account');
    await assert.rejects(followups.start(args),/active account/);
  } finally { await f.close(); }
});

test('a standalone chat note saves once to its provider without recording an outcome', async () => {
  const f = await fixture();
  try {
    const {topic, service, args, followups} = await recommendedRide(f);
    const {id} = await followups.start(args);
    const step = {case_id: topic.id, message_id: id};
    const noteBody = 'Practice note: call intake on Thursday.';
    await followups.update({...step, step: 'open-note'});
    await followups.saveDrafts({case_id: topic.id, drafts: [{message_id: id, note_draft: noteBody}]});
    await f.reopen();
    const draft = (await followups.start(args)).payload.followup;
    assert(draft.note_open);
    assert.equal(draft.note_draft, noteBody);
    assert.equal((await f.store.get(service.id)).comments.length, 0);

    const save = {...step, step: 'save-note'};
    const [one, two] = await Promise.all([followups.update(save), followups.update(save)]);
    const note = one.payload.followup.latest_note;
    assert.equal(note.id, two.payload.followup.latest_note.id);
    assert.equal(note.body, noteBody);
    assert.equal(one.payload.followup.outcome, null);
    assert.equal(one.payload.followup.result, null);
    assert.equal((await f.store.get(service.id)).comments.length, 1);
    await f.inputs.apply('undo');
    assert.equal((await followups.start(args)).payload.followup.latest_note, null);
    await f.inputs.apply('redo');
    assert.equal((await followups.start(args)).payload.followup.latest_note.body, noteBody);

    await followups.update({...step, step: 'choose', outcome: 'worked'});
    await followups.update({...step, step: 'save'});
    await followups.update({...step, step: 'open-note'});
    await followups.saveDrafts({case_id: topic.id, drafts: [{message_id: id, note_draft: 'Practice note after the result.'}]});
    const completed = (await followups.update(save)).payload.followup;
    assert.equal(completed.result.outcome, 'worked');
    assert.equal(completed.latest_note.body, 'Practice note after the result.');
    const backup = await f.store.export();
    await f.cases.delete({id: topic.id, expected_version: (await f.cases.row(topic.id)).version});
    assert((await f.store.get(service.id)).comments.some(comment => comment.id === note.id));
    f.switch('note-backup');
    await f.store.restore(backup);
    const restored = (await f.cases.list()).items.find(item => item.title === 'Transportation in North York · Walker access');
    const restoredFollowup = (await f.cases.hydrate(await f.cases.read(restored.id))).messages.at(-1).payload.followup;
    assert.equal(restoredFollowup.latest_note.body, completed.latest_note.body);
    assert.notEqual(restoredFollowup.latest_note.id, completed.latest_note.id);
  } finally { await f.close(); }
});

test('a second phone entry does not crowd the provider email out of the chat card', async () => {
  const f = await fixture();
  try {
    const csv = 'ID,Service,Phone,Alternate Phone,Email,Contact name\nA,Practice ride,416-555-0101,416-555-0102,intake@example.invalid,Practice Intake';
    const imported = await f.store.import(await parseDocument(Buffer.from(csv), 'practice-contacts.csv'));
    const card = (await f.store.list({document_id: imported.document_id})).items[0];
    assert.equal((await f.store.get(card.id)).contacts.filter(contact => contact.kind === 'phone').length, 2);
    const topic = await f.cases.create('Practice contacts');
    const turn = await f.cases.begin({id: topic.id, text: 'Recommend a ride.'});
    await f.cases.finish(turn, {text: 'Practice ride.', source: 'chatgpt', cards: [card], presentation: 'service-options'});
    const message = await followupsFor(f).start({case_id: topic.id, reply_id: turn.assistant_id, card_id: card.id});
    assert.deepEqual(message.payload.followup.card.contacts, [
      {kind: 'phone', value: '416-555-0101', name: 'Practice Intake'},
      {kind: 'email', value: 'intake@example.invalid', name: 'Practice Intake'}
    ]);
  } finally { await f.close(); }
});

test('saving a chat result twice records one outcome that follows Undo, Redo and a memory backup',async()=>{
  const f=await fixture();
  try {
    const {topic,service,args,followups}=await recommendedRide(f);
    const {id}=await followups.start(args);
    const step={case_id:topic.id,message_id:id};
    await followups.update({...step,step:'choose',outcome:'worked'});
    const save={...step,step:'save',body:'Boarding with a walker went smoothly in this practice case.',rating:5};
    const [one,two]=await Promise.all([followups.update(save),followups.update(save)]);
    assert.equal(one.payload.followup.result.id,two.payload.followup.result.id);
    assert.equal((await f.store.get(service.id)).experience.worked,1);
    const last=async caseId=>(await f.cases.hydrate(await f.cases.read(caseId))).messages.at(-1).payload.followup;
    await f.inputs.apply('undo');
    assert.equal((await last(topic.id)).result,null);
    assert.equal((await last(topic.id)).outcome,null);
    await f.inputs.apply('redo');
    assert.equal((await last(topic.id)).result.rating,5);
    const backup=await f.store.export();
    await f.cases.delete({id:topic.id,expected_version:(await f.cases.row(topic.id)).version});
    assert.equal((await f.store.get(service.id)).experience.worked,1,'Deleting a chat must retain an explicit provider result.');
    f.switch('restored');
    await ensureKnownServices(f.store);
    await f.store.restore(backup);
    const restored=(await f.cases.list()).items.find(item=>item.title==='Transportation in North York · Walker access');
    const saved=await last(restored.id);
    assert.notEqual(saved.card_id,service.id);
    assert.equal(saved.result.body,save.body);
    assert.equal(saved.result.rating,5);
    assert.equal((await f.store.get(saved.card_id)).experience.worked,1);
  } finally { await f.close(); }
});

test('only service recommendations can add chat results to imported cards, with an optional note and rating',async()=>{
  const f=await fixture();
  try {
    const imported=await f.store.import(await parseDocument(Buffer.from('ID,Service,Area\nA,Practice ride,Practice area'),'practice.csv'));
    const card=(await f.store.list({document_id:imported.document_id})).items[0];
    const topic=await f.cases.create('Imported directory');
    const first=await f.cases.begin({id:topic.id,text:'Summarize the document.'});
    await f.cases.finish(first,{text:'A practice ride.',source:'chatgpt',cards:[card],presentation:'answer'});
    const followups=followupsFor(f);
    const args={case_id:topic.id,card_id:card.id};
    await assert.rejects(followups.start({...args,reply_id:first.assistant_id}),/service recommendation/);
    const next=await f.cases.begin({id:topic.id,text:'Recommend a ride in the practice area.'});
    await f.cases.finish(next,{text:'Practice ride.',source:'chatgpt',cards:[card],presentation:'service-options'});
    const selected=await followups.start({...args,reply_id:next.assistant_id});
    const step={case_id:topic.id,message_id:selected.id};
    await followups.update({...step,step:'choose',outcome:'worked'});
    const saved=(await followups.update({...step,step:'save'})).payload.followup.result;
    assert.equal(saved.body,'Worked.');
    assert.equal(saved.rating,null);
    const edit=await f.store.serviceResult({card_id:card.id,id:saved.id,expected_version:saved.version,outcome:'not_worked',body:'Corrected practice result.'});
    assert.equal(edit.id,saved.id);
    assert.equal((await f.store.get(card.id)).experience.not_worked,1);
  } finally { await f.close(); }
});
const streamed=output=>new Response('data: '+JSON.stringify({type:'response.completed',response:{output}})+'\n\n');
const showOptions=options=>({type:'function_call',name:'present_service_options',call_id:'present',arguments:JSON.stringify({options})});
const option=id=>({id,reason:'A possible match for this request.',confirm:'Confirm the pickup address and boarding help with intake.'});
function online(f,fetcher){const assistant=new DocumentAssistant({store:f.store,cases:f.cases,connection:{session:async()=>({sharing:true}),accessToken:async()=> 'test-only'},fetcher});assistant.model='fixture';return assistant;}

test('a conversational transportation request shows the unrated cab first and the two rated public services next',async()=>{
  const f=await fixture();
  try {
    await ensureKnownServices(f.store);
    const lookup=async query=>(await f.store.list({collection:'services',query})).items[0];
    const ridePlus=await lookup('iRIDEplus');
    const seniorsCentre=await lookup('North York Seniors Centre');
    const other=await lookup('Circle of Care');
    await f.store.serviceResult({card_id:ridePlus.id,outcome:'worked',rating:5});
    await f.store.serviceResult({card_id:seniorsCentre.id,outcome:'worked',rating:3});
    const {card_id:ownId}=await f.store.addOwnService({name:'Example Cab',category:'Transportation'});
    const oldUserText='Can you help me with a transportation service?';
    const archived=[];
    for (const text of [oldUserText,'Can you find me transportation service']) {
      const earlier=await f.cases.create('Transportation');
      const turn=await f.cases.begin({id:earlier.id,text});
      await f.cases.finish(turn,{text:'Fictional ride follow-up.',source:'local'});
      archived.push(await f.cases.archive({id:earlier.id,expected_version:earlier.version}));
    }
    const expected=[ownId,ridePlus.id,seniorsCentre.id];
    const clarification={type:'message',content:[{type:'output_text',text:'Where are you travelling from?'}]};
    const connected=(output)=>online(f,async(_,request)=>{
      const body=JSON.parse(request.body);
      assert(archived.every(item=>!body.instructions.includes(item.card_id)));
      return streamed(output);
    });
    for (const [assistant,prompt] of [
      [local(f),oldUserText],
      [connected([clarification]),oldUserText],
      [connected([showOptions([option(other.id)])]),'Can you find me transportation service'],
      [connected([clarification]),'Transportation']
    ]) {
      const fresh=await f.cases.create();
      const answer=await assistant.chat({case_id:fresh.id,text:prompt,remember:false});
      assert.equal(answer.presentation,'service-options',prompt);
      assert.deepEqual(answer.cards.slice(0,3).map(card=>card.id),expected,prompt);
      assert.deepEqual(answer.cards.slice(0,3).map(card=>card.card_source_group),['own','public','public']);
      assert.deepEqual(answer.cards.slice(0,3).map(card=>card.experience.rating_average),[null,5,3]);
      assert(answer.cards.every(card=>card.document_id && card.kind!=='conversation'));
    }
    assert.equal((await f.store.memories({kind:'chats'})).total,2);
  } finally { await f.close(); }
});

test('archived conversations are available in memory and excluded from assistant retrieval and older reply cards',async()=>{
  const f=await fixture();
  try {
    const text='Fictional appointment archive marker periwinkle';
    const earlier=await f.cases.create('Practice conversation');
    const turn=await f.cases.begin({id:earlier.id,text});
    await f.cases.finish(turn,{text:'Fictional transcript.',source:'local'});
    const archive=await f.cases.archive({id:earlier.id,expected_version:earlier.version});
    const archiveCard=await f.store.get(archive.card_id);
    const note=await f.store.note({body:'Personal note about periwinkle.'});
    const fresh=await f.cases.create('Notes check');
    const previous=await f.cases.begin({id:fresh.id,text:'What do I have about periwinkle?' });
    await f.cases.finish(previous,{text:'Earlier reply.',source:'chatgpt',cards:[archiveCard,note]});
    await f.reopen();
    const hydrated=await f.cases.hydrate(await f.cases.read(fresh.id));
    assert.deepEqual(hydrated.messages.at(-1).payload.cards.map(card=>card.id),[note.id]);

    let calls=0;
    const assistant=online(f,async(_,request)=>{
      const body=JSON.parse(request.body);
      assert(!body.instructions.includes(archive.card_id));
      assert(!body.instructions.includes(text));
      if (++calls===1) return streamed([
        {type:'function_call',name:'search_cards',call_id:'search',arguments:'{"query":"periwinkle"}'},
        {type:'function_call',name:'read_card',call_id:'read',arguments:JSON.stringify({id:archive.card_id})}
      ]);
      const output=id=>JSON.parse(body.input.find(item=>item.call_id===id && item.type==='function_call_output').output);
      assert.deepEqual(output('search').items.map(card=>card.id),[note.id]);
      assert.match(output('read').error,/Manage memory/);
      return streamed([{type:'message',content:[{type:'output_text',text:'Here is your personal note.'}]}]);
    });
    const result=await assistant.chat({case_id:fresh.id,text:'Show my notes about periwinkle.',remember:false});
    assert.equal(calls,2);
    assert.equal(result.source,'chatgpt');
    assert.deepEqual(result.cards.map(card=>card.id),[note.id]);
    const memory=await f.store.memories({kind:'chats',query:'periwinkle'});
    assert.equal(memory.items[0].id,archive.card_id);
    assert((await f.cases.read(earlier.id)).messages.some(message=>message.body===text));
  } finally { await f.close(); }
});

test('connected home-service requests surface relevant service cards and their feedback even after a prose reply',async()=>{
  const f=await fixture();
  try {
    const add=(name,area='North York',category='Home supports')=>f.store.addOwnService({
      name,category,area,details:'Housekeeping visits for local residents.'
    });
    const tried=await add('Example Brook Home Help');
    await f.store.serviceResult({card_id:tried.card_id,outcome:'not_worked',rating:2,body:'No visit available.'});
    const other=[];
    for (const location of ['Birch','Cedar','Elm','Pine','Spruce','Willow','Yew']) {
      other.push((await add('Example '+location+' Home Desk')).card_id);
    }
    const outside=await add('Example Aurora Home Desk','Aurora');
    const unrelated=await add('Example Pantry Route','North York','Food and nutrition');
    const earlier=await f.cases.create('Add in a new service for me');
    const old=await f.cases.begin({id:earlier.id,text:'can you recommend home service for me'});
    await f.cases.finish(old,{text:'Previous practice response',source:'local'});
    const saved=await f.cases.archive({id:earlier.id,expected_version:(await f.cases.row(earlier.id)).version});
    for (const modelChooses of [false,true]) {
      const assistant=online(f,async(url,request)=>{
        const body=JSON.parse(request.body);
        assert(body.instructions.includes(tried.card_id),'Include the matching service with feedback in the model context.');
        assert(!body.instructions.includes(saved.card_id),'A saved case is never a provider candidate.');
        return streamed(modelChooses ? [showOptions([option(other[0])])] :
          [{type:'message',content:[{type:'output_text',text:'Which town are you asking about?'}]}]);
      });
      const fresh=await f.cases.create();
      const result=await assistant.chat({case_id:fresh.id,text:'can you recommend home service for me',remember:false});
      assert.equal(result.presentation,'service-options');
      assert(result.cards.every(card=>card.source_format==='own-services'&&card.id!==unrelated.card_id));
      assert(result.cards.length>1);
      const rated=result.cards.at(-1);
      assert.equal(rated.id,tried.card_id);
      assert.equal(rated.experience.rating_average,2);
      assert.match(rated.card_rank_reason,/2\.0\/5/);
      const reply=(await f.cases.hydrate(await f.cases.read(fresh.id))).messages.at(-1);
      assert.equal(reply.payload.cards.at(-1).experience.not_worked,1);
    }
    const scoped=await local(f).chat({text:'Find home services in North York. Show ranked cards.',remember:false});
    assert(scoped.cards.every(card=>card.id!==outside.card_id));
    const absent=await local(f).chat({text:'Find home services in Georgina.',remember:false});
    assert.deepEqual(absent.cards,[]);
    assert.match(absent.text,/couldn’t find an active service card/);
  } finally { await f.close(); }
});

test('a connected service-form response takes priority over recommendations and prefills supplied details only', async()=>{
  const f=await fixture();
  try {
    const existing=await service(f);
    let requests=0;
    const assistant=online(f,async(_url,request)=>{
      requests++;
      const body=JSON.parse(request.body);
      assert(body.tools.some(tool=>tool.name==='open_service_form'&&tool.parameters.properties.category));
      assert(body.instructions.includes('call open_service_form first'));
      return streamed([
        showOptions([option(existing.id)]),
        {type:'function_call',name:'open_service_form',call_id:'new-service',
          arguments:JSON.stringify({name:'Example Community Support',area:'Aurora',phone:'905-555-0199'})}
      ]);
    });
    const answer=await assistant.chat({
      text:'Could we keep Example Community Support in the service directory? They serve Aurora.',
      card_id:existing.id,remember:false
    });
    assert.equal(requests,1);
    assert.equal(answer.presentation,'service-form');
    assert.deepEqual(answer.cards,[]);
    assert.equal(answer.service_form.name,'Example Community Support');
    assert.equal(answer.service_form.area,'Aurora');
    assert.equal(answer.service_form.phone,'');
    assert.equal(await f.store.ownServiceCount(),0);
    const persisted=(await f.cases.hydrate(await f.cases.read(answer.case_id))).messages.at(-1).payload;
    assert.deepEqual(persisted.service_form,answer.service_form);
    assert.deepEqual(persisted.cards,[]);
  } finally { await f.close(); }
});

test('a provider question without a service presentation keeps its actual answer readable after reopening',async()=>{const f=await fixture();try{const card=await service(f),assistant=online(f,async()=>streamed([{type:'message',content:[{type:'output_text',text:'The source says riders must enter the vehicle with minimal assistance. Confirm the boarding help with intake.'}]}]));const result=await assistant.chat({text:'Explain this provider’s boarding requirements.',card_id:card.id,remember:false});assert.equal(result.presentation,'answer');assert.equal(result.cards[0].id,card.id);await f.reopen();const reply=(await f.cases.hydrate(await f.cases.read(result.case_id))).messages.at(-1);assert.equal(reply.payload.presentation,'answer');assert(reply.body.includes('minimal assistance'));}finally{await f.close();}});

test('service presentation finishes with only chosen cards and keeps the reason and checks inside each card',async()=>{const f=await fixture();try{await ensureKnownServices(f.store);const services=(await f.store.list({collection:'services',category:'Transportation'})).items,chosen=services.slice(0,3);let calls=0;const assistant=online(f,async(url,request)=>{calls++;const body=JSON.parse(request.body);assert(body.instructions.includes('no separate text above or below'));assert(body.tools.some(t=>t.name==='present_service_options'));return streamed([{type:'function_call',name:'search_cards',call_id:'search',arguments:JSON.stringify({query:'Transportation',limit:12})},showOptions(chosen.map(c=>option(c.id)))]);});const result=await assistant.chat({text:'Find transportation.',remember:false});assert.equal(calls,1,'A presentation should not need another prose-generating round.');assert.equal(result.presentation,'service-options');assert.equal(result.source,'chatgpt');assert.deepEqual(new Set(result.cards.map(c=>c.id)),new Set(chosen.map(c=>c.id)));assert(!result.cards.some(c=>c.id===services[3].id));for(const card of result.cards){assert.equal(card.card_reason,option(card.id).reason);assert.equal(card.card_confirm,option(card.id).confirm);}assert.equal((await f.store.get(chosen[0].id)).comments.length,0,'Formatting must never fabricate a service outcome.');assert((await f.cases.read(result.case_id)).messages.at(-1).body.includes('Confirm the pickup address'));}finally{await f.close();}});

test('all six chosen cards survive presentation and equally relevant low scores still appear later',async()=>{const f=await fixture();try{await ensureKnownServices(f.store);const services=(await f.store.list({collection:'services',category:'Transportation'})).items.slice(0,6),low=services[0];await f.store.serviceResult({card_id:low.id,outcome:'not_worked',rating:1});const assistant=online(f,async()=>streamed([{type:'function_call',name:'search_cards',call_id:'search',arguments:'{"query":"Transportation","limit":12}'},showOptions(services.map(c=>option(c.id)))]));const result=await assistant.chat({text:'Transportation',remember:false});assert.equal(result.cards.length,6);assert.equal(result.cards.at(-1).id,low.id);assert.equal((await f.cases.hydrate(await f.cases.read(result.case_id))).messages.at(-1).payload.cards.length,6);}finally{await f.close();}});

test('presentation rejects invented, unread, duplicate, foreign and personal-memory choices before accepting a correction',async()=>{const f=await fixture();try{const card=await service(f),unread=(await f.store.list({collection:'services'})).items.find(c=>c.id!==card.id),personal=await f.store.note({body:'Private preference.'});f.switch('other');const foreign=await f.store.note({body:'Other account.'});f.switch('one');for(const invalid of [[option('invented')],[option(unread.id)],[option(card.id),option(card.id)],[option(foreign.id)],[option(personal.id)],[],Array(7).fill(option(card.id)),[{...option(card.id),reason:'x'.repeat(221)}],[{...option(card.id),confirm:''}]]){let calls=0;const assistant=online(f,async(url,request)=>{calls++;if(calls===1)return streamed([showOptions(invalid)]);const outputs=JSON.parse(request.body).input.filter(i=>i.type==='function_call_output');assert(outputs.some(i=>JSON.parse(i.output).error),'Invalid presentation must return a repairable tool error.');return streamed([showOptions([option(card.id)])]);});const result=await assistant.chat({text:'North York Seniors',card_id:card.id,remember:false});assert.equal(result.source,'chatgpt');assert.equal(calls,2);assert.deepEqual(result.cards.map(c=>c.id),[card.id]);}}finally{await f.close();}});

test('card reasons and confirmation checks survive restart and backup remapping without leaking another case notes',async()=>{const f=await fixture();try{const card=await service(f),a=await f.cases.create('Card presentation backup'),assistant=online(f,async()=>streamed([showOptions([option(card.id)])]));await assistant.chat({case_id:a.id,text:'Compare this ride.',card_id:card.id,remember:false});const b=await f.cases.create('Different need');await local(f).chat({case_id:b.id,text:'Other case secret violet zebra.',card_id:card.id});await f.reopen();const restored=await f.cases.hydrate(await f.cases.read(a.id)),reply=restored.messages.at(-1);assert.equal(reply.payload.presentation,'service-options');assert.equal(reply.payload.cards[0].card_confirm,option(card.id).confirm);assert(!JSON.stringify(reply.payload.cards).includes('violet zebra'));const backup=await f.store.export();f.switch('restored');await ensureKnownServices(f.store);await f.store.restore(backup);const copy=(await f.cases.list()).items.find(c=>c.title==='Card presentation backup'),copyReply=(await f.cases.hydrate(await f.cases.read(copy.id))).messages.at(-1);assert.equal(copyReply.payload.presentation,'service-options');assert.equal(copyReply.payload.cards[0].card_reason,option(card.id).reason);assert.notEqual(copyReply.payload.cards[0].id,card.id);assert(copyReply.payload.cards[0].title.includes('North York'));}finally{await f.close();}});

test('a lookup and presentation in the same response work even when presentation appears first',async()=>{const f=await fixture();try{const card=await service(f);const assistant=online(f,async()=>streamed([showOptions([option(card.id)]),{type:'function_call',name:'read_card',call_id:'read',arguments:JSON.stringify({id:card.id})}]));const result=await assistant.chat({text:'Compare the source.',remember:false});assert.equal(result.source,'chatgpt');assert.equal(result.cards[0].id,card.id);assert.equal(result.presentation,'service-options');}finally{await f.close();}});

test('document-sourced service cards can be presented and deleted sources disappear safely from saved replies',async()=>{const f=await fixture();try{const imported=await f.store.import(await parseDocument(Buffer.from('ID,Service,Area,Phone\nA,Practice ride,Practice area,416-555-0101'),'practice.csv')),card=(await f.store.list({document_id:imported.document_id})).items[0],assistant=online(f,async()=>streamed([showOptions([option(card.id)])]));const result=await assistant.chat({text:'Practice ride',remember:false});assert.equal(result.presentation,'service-options');await f.store.forgetDocument(imported.document_id);const reply=(await f.cases.hydrate(await f.cases.read(result.case_id))).messages.at(-1);assert.equal(reply.payload.cards.length,0);assert(reply.body.includes('Practice ride'),'The historical answer stays readable when its source was deleted.');}finally{await f.close();}});

test('named cases preserve separate messages, selection and drafts across restart and account changes',async()=>{const f=await fixture();try{const card=await service(f),a=await f.cases.create('North York ride'),assistant=local(f);await assistant.chat({case_id:a.id,text:'Needs a walker-compatible ride.',card_id:card.id});await f.cases.context({id:a.id,card_id:card.id,draft:'Ask about the return trip.'});const b=await f.cases.create('Meal delivery follow-up');await assistant.chat({case_id:b.id,text:'Needs meals next week.'});await f.reopen();assert.equal((await f.cases.current()).id,b.id);const old=await f.cases.read(a.id);assert.equal(old.title,'North York ride');assert.equal(old.selected_card_id,card.id);assert.equal(old.draft,'Ask about the return trip.');assert(old.messages.some(m=>m.body.includes('walker-compatible')));assert(!(await f.cases.read(b.id)).messages.some(m=>m.body.includes('walker-compatible')));f.switch('two');const other=await f.cases.current();assert.notEqual(other.id,a.id);await assert.rejects(f.cases.read(a.id),/active account/);await assert.rejects(f.cases.activate(a.id),/active account/);assert.equal((await f.cases.list()).total,1);}finally{await f.close();}});

test('case-scoped AI retrieval excludes other cases automatic messages but keeps separately recorded service results',async()=>{const f=await fixture();try{const card=await service(f),a=await f.cases.create('First need'),assistant=local(f);await assistant.chat({case_id:a.id,text:'Private first-case requirement violet zebra.',card_id:card.id});await assistant.chat({case_id:a.id,text:'First-case personal message violet zebra.'});await f.store.serviceResult({card_id:card.id,outcome:'worked',rating:4,body:'Intake returned the call.'});const b=await f.cases.create('Second need');const visible=await f.store.get(card.id,{case_id:b.id});assert(!visible.comments.some(n=>n.body.includes('violet zebra')));assert(visible.comments.some(n=>n.outcome==='worked'));const other=(await f.store.list({query:'violet zebra',case_id:b.id})).items;assert(!other.some(c=>c.kind==='message'));const own=(await f.store.list({query:'violet zebra',case_id:a.id})).items;assert(own.some(c=>c.kind==='message'));}finally{await f.close();}});

test('saving a case to the library retains its complete transcript without duplicate automatic memory cards',async()=>{const f=await fixture();try{const card=await service(f),a=await f.cases.create('Long transport follow-up');const assistant=local(f);for(let i=0;i<6;i++)await assistant.chat({case_id:a.id,text:'Follow-up '+i+': '+('Extra detail. '.repeat(350)),card_id:i%2?card.id:null});await f.store.comment({card_id:card.id,body:'Separate service note to keep.'});await f.store.serviceResult({card_id:card.id,outcome:'not_worked',rating:2,body:'No vehicle for that date.'});const before=await f.cases.read(a.id),result=await f.cases.archive({id:a.id,expected_version:before.version});assert.equal((await f.cases.list()).items.some(c=>c.id===a.id),false);const saved=await f.store.get(result.card_id);assert.equal(saved.kind,'conversation');assert.equal(saved.case_info.id,a.id);assert(saved.body.length<=12000);const transcript=await f.cases.read(a.id);assert.equal(transcript.message_count,12);assert(transcript.messages.filter(m=>m.role==='user').at(-1).body.includes('Follow-up 5'));assert.equal((await f.store.memories({kind:'chats'})).total,1);assert.equal((await f.store.list({collection:'personal'})).items.filter(c=>c.kind==='message').length,0);assert.equal((await f.store.get(card.id)).comments.length,2);await f.cases.reopen(a.id);assert.equal((await f.cases.current()).id,a.id);await assistant.chat({case_id:a.id,text:'Continue the same discussion.'});assert.equal((await f.cases.read(a.id)).message_count,14);}finally{await f.close();}});

test('deleting a case removes its conversation and automatic messages while retaining explicit notes and ratings',async()=>{const f=await fixture();try{const card=await service(f),a=await f.cases.create('Delete this case'),assistant=local(f);await assistant.chat({case_id:a.id,text:'Auto note from this case.',card_id:card.id});await assistant.chat({case_id:a.id,text:'Auto message from this case.'});const auto=(await f.store.get(card.id)).comments[0];await f.inputs.record({type:'comment',id:auto.id,card_id:card.id,label:'Edit auto note'},()=>f.store.comment({id:auto.id,card_id:card.id,body:'Corrected auto note.',expected_version:1}));await f.store.comment({card_id:card.id,body:'Separately saved service note.'});await f.store.serviceResult({card_id:card.id,outcome:'worked',rating:5});await f.cases.delete({id:a.id,expected_version:(await f.cases.row(a.id)).version});await assert.rejects(f.cases.read(a.id),/active account/);assert.equal((await f.store.list({collection:'personal'})).items.filter(c=>c.kind==='message').length,0);const retained=await f.store.get(card.id);assert.equal(retained.comments.length,2);assert.equal(retained.experience.worked,1);assert.equal((await f.inputs.state()).undo,null);await f.reopen();assert.equal((await f.store.get(card.id)).comments.length,2);}finally{await f.close();}});

test('case backups restore transcript references, selected cards and archived cases without duplicating repeated restores',async()=>{const f=await fixture();try{const card=await service(f),a=await f.cases.create('Backup transport'),assistant=local(f);await assistant.chat({case_id:a.id,text:'Saved case contact question.',card_id:card.id});await f.cases.context({id:a.id,card_id:card.id,draft:'Draft to retain.'});const b=await f.cases.create('Backup saved case');await assistant.chat({case_id:b.id,text:'Save this discussion.'});await f.cases.archive({id:b.id,expected_version:(await f.cases.row(b.id)).version});const backup=await f.store.export();assert(!JSON.stringify(backup).includes('owner_id'));f.switch('restored');await ensureKnownServices(f.store);await f.store.restore(backup);const counts=await f.cases.list();assert(counts.items.some(c=>c.title==='Backup transport'));const restored=counts.items.find(c=>c.title==='Backup transport');assert.notEqual(restored.id,a.id);assert.equal((await f.cases.read(restored.id)).draft,'Draft to retain.');assert((await f.store.get((await f.cases.row(restored.id)).selected_card_id)).title.includes('North York'));const memory=(await f.store.memories({kind:'chats'})).items[0],archive=await f.store.get(memory.id);assert.equal((await f.cases.read(archive.case_info.id)).message_count,2);const repeated=await f.store.restore(backup);assert.equal(repeated.added,0);assert.equal(repeated.notes_added,0);assert.equal((await f.cases.read(restored.id)).message_count,2);}finally{await f.close();}});

test('case history search and message pagination stay within the selected case and treat wildcard input literally',async()=>{const f=await fixture();try{const a=await f.cases.create('Many follow-ups'),assistant=local(f);for(let i=0;i<8;i++)await assistant.chat({case_id:a.id,text:i===0?'A literal 50% request.':'Follow-up number '+i});const last=await f.cases.read(a.id,{limit:5});assert.equal(last.messages.length,5);assert(last.has_more);const older=await f.cases.read(a.id,{limit:5,before:last.messages[0].sequence});assert(older.messages.at(-1).sequence<last.messages[0].sequence);const hits=await f.cases.search(a.id,{query:'50%'});assert.equal(hits.length,1);assert(hits[0].body.includes('50%'));const b=await f.cases.create('Other discussion');assert.equal((await f.cases.search(b.id,{query:'50%'})).length,0);f.switch('other');await assert.rejects(f.cases.search(a.id,{query:'50%'}),/active account/);}finally{await f.close();}});

test('interrupted case answers persist and retry updates the same turn without duplicating automatic memory',async()=>{const f=await fixture();try{const a=await f.cases.create('Connection check');let fail=true;const assistant=new DocumentAssistant({store:f.store,cases:f.cases,connection:{session:async()=>({sharing:true}),accessToken:async()=> 'test-only'},fetcher:async()=>{if(fail)throw new Error('Offline for test.');return new Response('data: '+JSON.stringify({type:'response.completed',response:{output:[{type:'message',content:[{type:'output_text',text:'The retry completed.'}]}]}})+'\n\n');}});assistant.model='fixture';const first=await assistant.chat({case_id:a.id,text:'Keep this one question.'});assert.equal(first.source,'error');await f.reopen();fail=false;const retry=await assistant.chat({case_id:a.id,text:'Keep this one question.',remember:false,retry_turn_id:first.turn_id});assert.equal(retry.text,'The retry completed.');assert.equal((await f.cases.read(a.id)).message_count,2);assert.equal((await f.store.list({collection:'personal'})).total,1);}finally{await f.close();}});

test('AI reconstructs only the current case discussion and can search its earlier history after restart',async()=>{const f=await fixture();try{const a=await f.cases.create('Ride planning'),offline=local(f);await offline.chat({case_id:a.id,text:'Use a walker for the return ride.'});const b=await f.cases.create('Other case');await offline.chat({case_id:b.id,text:'Unrelated case: orange penguin.'});await f.reopen();let calls=0;const assistant=new DocumentAssistant({store:f.store,cases:f.cases,connection:{session:async()=>({sharing:true}),accessToken:async()=> 'test-only'},fetcher:async(url,options)=>{const request=JSON.parse(options.body);assert(request.tools.some(t=>t.name==='search_case_history'));assert(!JSON.stringify(request.input).includes('orange penguin'));assert(JSON.stringify(request.input).includes('Use a walker'));calls++;const output=calls===1?[{type:'function_call',name:'search_case_history',call_id:'earlier',arguments:'{"query":"walker"}'}]:[{type:'message',content:[{type:'output_text',text:'The earlier case discussion mentions a walker.'}]}];return new Response('data: '+JSON.stringify({type:'response.completed',response:{output}})+'\n\n');}});assistant.model='fixture';assert.equal((await assistant.chat({case_id:a.id,text:'What did we need for the return trip?',remember:false})).source,'chatgpt');assert.equal(calls,2);}finally{await f.close();}});

test('saved-input Undo and Redo correct a rating, survive restart, and clear the redo branch after another edit',async()=>{const f=await fixture();try{const card=await service(f),create=()=>f.store.serviceResult({card_id:card.id,outcome:'worked',rating:5});const saved=await f.inputs.record({type:'comment',card_id:card.id,label:'Record result'},create);await f.inputs.record({type:'comment',id:saved.id,card_id:card.id,label:'Change rating'},()=>f.store.serviceResult({id:saved.id,card_id:card.id,expected_version:1,outcome:'not_worked',rating:1}));await f.inputs.apply('undo');assert.equal((await f.store.get(card.id)).experience.rating_average,5);await f.reopen();await f.inputs.apply('redo');assert.equal((await f.store.get(card.id)).experience.rating_average,1);await f.inputs.apply('undo');const version=(await f.store.get(card.id)).comments.find(n=>n.id===saved.id).version;await f.inputs.record({type:'comment',id:saved.id,card_id:card.id,label:'Correct rating'},()=>f.store.serviceResult({id:saved.id,card_id:card.id,expected_version:version,outcome:'worked',rating:4}));assert.equal((await f.inputs.state()).redo,null);await assert.rejects(f.store.serviceResult({id:saved.id,card_id:card.id,expected_version:1,outcome:'worked',rating:2}),/changed/);f.switch('other');assert.equal((await f.inputs.state()).undo,null);}finally{await f.close();}});

test('Undo and Redo cover adding and deleting notes and results without changing the public service card',async()=>{const f=await fixture();try{const card=await service(f);const result=await f.inputs.record({type:'comment',card_id:card.id,label:'Add result'},()=>f.store.serviceResult({card_id:card.id,outcome:'not_worked',rating:2}));await f.inputs.apply('undo');assert.equal((await f.store.get(card.id)).comments.length,0);await f.inputs.apply('redo');assert.equal((await f.store.get(card.id)).experience.not_worked,1);await f.inputs.record({type:'comment',id:result.id,card_id:card.id,label:'Delete result'},()=>f.store.forgetComment({id:result.id,card_id:card.id}));await f.inputs.apply('undo');assert.equal((await f.store.get(card.id)).experience.rating_average,2);await f.inputs.apply('redo');assert.equal((await f.store.get(card.id)).comments.length,0);const note=await f.inputs.record({type:'card',label:'Add note'},()=>f.store.note({body:'A saved preference.'}));await f.inputs.apply('undo');await assert.rejects(f.store.get(note.id));await f.inputs.apply('redo');assert.equal((await f.store.get(note.id)).body,'A saved preference.');assert.equal((await f.store.list({collection:'services'})).total,27);}finally{await f.close();}});

test('failed saved-input mutations add no undo action and conflicting changes prevent destructive replay',async()=>{const f=await fixture();try{const card=await service(f);await assert.rejects(f.inputs.record({type:'comment',card_id:card.id,label:'Invalid score'},()=>f.store.serviceResult({card_id:card.id,outcome:'worked',rating:9})));assert.equal((await f.inputs.state()).undo,null);const note=await f.inputs.record({type:'card',label:'Add note'},()=>f.store.note({body:'Original input.'}));await f.store.note({id:note.id,expected_version:1,body:'A newer change.'});await assert.rejects(f.inputs.apply('undo'),/changed again/);assert.equal((await f.store.get(note.id)).body,'A newer change.');}finally{await f.close();}});

test('low-rated services move below unrated alternatives while query relevance and explicit filters take priority',async()=>{const f=await fixture();try{const card=await service(f);await f.store.serviceResult({card_id:card.id,outcome:'not_worked',rating:1});const matches=(await f.store.list({collection:'services',category:'Transportation',query:'North York'})).items;assert(matches.findIndex(c=>c.id===card.id)>0);const exact=(await f.store.list({collection:'services',query:'North York Seniors'})).items;assert.equal(exact[0].id,card.id);assert.equal((await f.store.list({collection:'services'})).total,27);const low=await f.store.get(card.id),housing=(await f.store.list({collection:'services',category:'Housing support'})).items[0];if(housing){const ordered=rankResponseCards([housing,low],'transportation North York');assert.equal(ordered[0].id,low.id);}const high={...low,id:'high',experience:{worked:1,not_worked:0,rating_count:1,rating_average:5}},unknown={...low,id:'unknown',experience:{worked:0,not_worked:0,rating_count:0,rating_average:null}};assert.deepEqual(rankResponseCards([low,unknown,high],'transportation').map(c=>c.id),['high','unknown',low.id]);const imported={...unknown,id:'imported',source_format:'csv'};assert.equal(rankResponseCards([low,imported,unknown,high],'transportation').at(-1).id,low.id,'Imported cards must not break low-score ordering.');}finally{await f.close();}});
