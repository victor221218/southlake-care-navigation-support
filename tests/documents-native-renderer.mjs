import {runCaseChecks} from './cases-native-renderer.mjs';
const wait=async check=>{const end=Date.now()+25000;while(!check()){if(Date.now()>end)throw new Error('Windows interface check timed out: '+String(check).slice(0,300));await new Promise(resolve=>setTimeout(resolve,60));}};
const click=selector=>{const target=document.querySelector(selector);if(!target)throw new Error('Missing interface control: '+selector);target.click();};
const type=(id,value)=>{const input=document.getElementById(id);input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));};
const filter=(id,value)=>{const input=document.getElementById(id);input.value=value;input.dispatchEvent(new Event('change',{bubbles:true}));};
const request=(method,args={})=>window.hive.request(method,args);
const latestServiceForm=()=>Array.from(document.querySelectorAll('#messages form[data-service-form]')).at(-1);
function fillServiceField(name,value) {
  const field=latestServiceForm().elements.namedItem(name);
  field.value=value;
  field.dispatchEvent(new Event('input',{bubbles:true}));
}
const firstNote='Practice observation: phone ahead to check accessible capacity.';
const feedback='This did not work. They had no space on Tuesday.';
const closingNote='Closing check: call the listed contact before referring.';
const serviceNote='Isolated acceptance check: call the provider to confirm the next booking.';
const editedServiceNote='Corrected acceptance note: confirm the provider callback time.';
const preference='Initial acceptance preference: show phone contacts.';
const editedPreference='Revised acceptance preference: show email contacts.';
const memoryRow=id=>`.memory-record[data-memory-id="${id}"]`;
async function revealMemoryEntry(id) {
  const preview=`[data-preview-id="${id}"]`;
  await wait(()=>document.querySelector(memoryRow(id))||document.querySelector(preview));
  if (!document.querySelector(memoryRow(id))) {
    document.querySelector(preview).closest('.memory-group').querySelector('[data-action="toggle-memory-group"]').click();
    await wait(()=>document.querySelector(memoryRow(id)));
  }
}
const assert=(condition,message='The current interface does not match the expected layout.')=>{if(!condition)throw new Error(message);};
const contentWidth=element=>element.clientWidth-parseFloat(getComputedStyle(element).paddingLeft)-parseFloat(getComputedStyle(element).paddingRight);
async function run(){try{
  const phase=await window.hiveSmoke.phase();
  await wait(()=>document.getElementById('version-label')?.textContent.endsWith('version '+phase.version));
  const title='Care Navigation Support';
  assert(phase.windowTitle===title&&document.title===title&&document.querySelector('.brand strong')?.textContent===title,'The current name must appear in the Windows title and sidebar.');
  assert(document.body.dataset.view==='workspace'&&document.getElementById('library-panel').hidden&&!document.getElementById('chat-panel').hidden);
  assert(!document.getElementById('remember')&&!document.querySelector('.remember')&&document.querySelector('.composer-actions #add-document'));
  if(phase.reopen){
    const snapshot=await request('snapshot');if(snapshot.documents.length!==1||snapshot.cards.total!==6||snapshot.services.total!==31)throw new Error('Documents or service cards changed after reopening.');
    const removed=await request('list-cards',{collection:'services',removed_services:true});
    assert(removed.items.some(card=>card.id===phase.cold.removed_service_id&&card.area==='Aurora'),'The removed service and its chosen area must survive restart.');
    const rated=await request('get-card',{id:phase.cold.removed_service_id});
    assert(rated.experience.rating_average===2&&rated.experience.not_worked===1,
      'The result and later rating on the chat-created service must survive restart.');
    const partial=await request('get-card',{id:phase.cold.chat_service_id});
    assert(partial.contacts.some(contact=>contact.value==='905-555-0191')&&partial.missing_details.includes('service name'),
      'The partial service saved from chat must survive restart.');
    const permanentlyDeleted=await request('get-card',{id:phase.cold.deleted_public_service_id}).then(()=>false,()=>true);
    assert(permanentlyDeleted&&!removed.items.some(card=>card.id===phase.cold.deleted_public_service_id),
      'A permanently deleted public service must stay out of the app after reopening.');
    const closedAfterSave=await request('get-case',{id:phase.cold.closed_service_case_id});
    assert(closedAfterSave.status==='archived'&&closedAfterSave.messages.at(-1).body.includes('Added Example Mobility Dispatch'),
      'Closing after Save service must archive the confirmation.');
    const own=await request('get-card',{id:phase.cold.own_service_id});
    assert(own.source_format==='own-services'&&own.contacts.some(contact=>contact.value==='intake@example.org')&&
      own.comments.some(note=>note.body==='Practice note: call intake before referring.'),'The own service, edited contact and note must survive restart.');
    const card=await request('get-card',{id:phase.cold.card_id});
    for(const text of [firstNote,feedback,closingNote])if(!card.comments.some(n=>n.body===text))throw new Error('A document note was lost on reopening.');
    const archived=await request('get-case',{id:phase.cold.archived_case_id});assert(archived.status==='archived'&&archived.message_count===7&&archived.messages.some(m=>m.body.includes('walker requirement'))&&archived.messages.some(m=>m.body==='Show me suitable service cards for transportation in North York.'),'Saved case history was lost after reopening.');
    const service=await request('get-card',{id:phase.cold.service_card_id});if(!service.comments.some(n=>n.body===serviceNote))throw new Error('Service memory was lost on reopening.');
    assert(service.experience.not_worked===1&&service.experience.worked===0&&service.experience.rating_average===2&&service.comments.some(n=>n.body==='No vehicle for the requested Tuesday.'),'Reported service outcome/rating was lost after reopening.');
    click('[data-action="manage-memory"]');await revealMemoryEntry(card.id);
    click(memoryRow(card.id)+' [data-action="open-card"]');await wait(()=>document.getElementById('card-notes')?.textContent.includes(closingNote));
    document.getElementById('card-notes').scrollIntoView({block:'center'});
    const sourceCapture=await window.hiveSmoke.capture('card-notes');
    click('[data-action="close-modal"]');await wait(()=>!document.getElementById('modal').open);

    // Use the isolated workspace to recreate the transportation example after verifying the earlier results.
    const centreResult=service.comments.find(note=>note.outcome==='not_worked');
    await request('save-service-result',{id:centreResult.id,card_id:service.id,expected_version:centreResult.version,
      outcome:'worked',rating:3,body:'Isolated ranking check.'});
    const rides=(await request('list-cards',{collection:'services',category:'Transportation',limit:100})).items;
    const ridePlus=rides.find(card=>card.title==='CHATS · iRIDEplus');
    assert(ridePlus);
    await request('save-service-result',{card_id:ridePlus.id,outcome:'worked',rating:5,body:'Isolated ranking check.'});
    for (const ownRide of rides.filter(card=>card.source_format==='own-services')) {
      await request('set-service-removed',{id:ownRide.id,removed:true});
    }
    const cab=await request('add-own-service',{values:{name:'Example Cab',category:'Transportation'}});

    click('[data-action="workspace"]');
    click('.chat-header-actions [data-action="new-chat"]');
    await wait(()=>document.body.dataset.view==='workspace'&&document.body.dataset.caseChanging==='false'&&!document.querySelector('.message'));
    type('message','Can you help me with a transportation service?');
    click('#send-button');
    await wait(()=>document.querySelectorAll('#messages .answer-card').length>=3&&document.getElementById('send-button').textContent==='Send ↑');
    const choices=[...document.querySelectorAll('#messages .answer-card')];
    assert(choices.slice(0,3).map(choice=>choice.dataset.id).join('|')===[cab.card_id,ridePlus.id,service.id].join('|')&&
      choices[0].querySelector('.own-source-tag')&&choices[0].closest('[data-source-group="own"]').querySelectorAll('.answer-card').length===1&&
      choices[1].querySelector('.rating-badge')?.textContent.includes('5.0/5')&&choices[2].querySelector('.rating-badge')?.textContent.includes('3.0/5')&&
      !document.getElementById('messages').textContent.includes('Saved case:')&&!document.querySelector('#messages .answer-summary'),
      'The own cab appears alone first, followed by the two rated public providers and only provider cards.');
    const transportationCapture=await window.hiveSmoke.capture('transportation-ranking');
    assert(transportationCapture.ok,'Capture the checked transportation ranking.');

    click('[data-action="manage-memory"]');
    await wait(()=>document.body.dataset.view==='memory');
    filter('memory-kind-filter','chats');
    await revealMemoryEntry(archived.archive_card_id);
    click(memoryRow(archived.archive_card_id)+' [data-action="open-card"]');
    await wait(()=>document.body.dataset.view==='workspace'&&document.getElementById('messages').textContent.includes('walker requirement'));
    assert(!document.getElementById('case-archived-banner').hidden,'The closed chat opens from Manage memory.');
    window.hiveSmoke.finish({ok:true,default_workspace_after_reopen:true,reopen_preserves_document:true,reopen_preserves_card_notes:true,reopen_preserves_service_feedback:true,reopen_preserves_service_result:true,reopen_preserves_chat_rating:true,reopen_preserves_saved_case:true,close_handshake_saved_pending_note:true,source_capture:sourceCapture,transportation_recommendation_order:true,archived_transcript_in_memory:true,transportation_capture:transportationCapture});return;
  }
  const initial=await request('snapshot');assert(initial.services.total===27&&initial.cards.total===0&&initial.documents.length===0);
  const grid=document.getElementById('workspace-grid').getBoundingClientRect(),chat=document.getElementById('chat-panel').getBoundingClientRect();assert(chat.width>=contentWidth(document.getElementById('workspace-grid'))-4,'Workspace chat must fill the content width.');
  const brandLogo=document.querySelector('.brand img.brand-mark');
  const welcomeLogo=document.querySelector('.chat-welcome img.welcome-icon');
  assert(brandLogo&&welcomeLogo,'The supplied logo must replace both the sidebar mark and welcome asterisk.');
  await Promise.all([brandLogo.decode(),welcomeLogo.decode()]);
  assert(brandLogo.currentSrc===welcomeLogo.currentSrc&&brandLogo.naturalWidth>0,'Both displayed logos must load the bundled artwork.');
  const workspaceCapture=await window.hiveSmoke.capture('workspace-home');
  await window.hiveSmoke.viewport({width:1000,height:740});
  await new Promise(resolve=>setTimeout(resolve,250));
  const compose=document.getElementById('composer').getBoundingClientRect(),send=document.getElementById('send-button').getBoundingClientRect();
  assert(compose.left>=0&&compose.right<=innerWidth&&send.bottom<=innerHeight&&send.right<=innerWidth,'Compact composer bounds: '+JSON.stringify({compose:compose.toJSON(),send:send.toJSON(),width:innerWidth,height:innerHeight}));
  const compactCapture=await window.hiveSmoke.capture('workspace-compact');await window.hiveSmoke.viewport({width:1420,height:920});
  click('[data-action="known-services"]');await wait(()=>document.querySelectorAll('.service-row').length===27);
  filter('category-filter','Transportation');type('search','North York');await wait(()=>document.querySelectorAll('.service-row').length===4);
  const gridElement=document.getElementById('workspace-grid'),library=document.getElementById('library-panel').getBoundingClientRect();
  const gridStyle=getComputedStyle(gridElement),availableHeight=gridElement.clientHeight-parseFloat(gridStyle.paddingTop)-parseFloat(gridStyle.paddingBottom);
  assert(library.width>=contentWidth(gridElement)-4&&library.height>=availableHeight-4,'Known services must fill the available page.');
  assert(document.getElementById('chat-panel').hidden&&!document.getElementById('service-chat-launcher').hidden,'The assistant should start as a floating launcher.');
  const knownNav=document.querySelector('.sidebar nav [data-action="known-services"]'),memoryNav=document.querySelector('.sidebar nav [data-action="manage-memory"]');
  assert(knownNav.nextElementSibling===memoryNav,'Manage memory must be directly underneath Known services.');
  const checkHeaderLauncher=()=>{const key=document.getElementById('service-chat-launcher'),r=key.getBoundingClientRect(),heading=document.getElementById('workspace-heading').getBoundingClientRect(),list=document.getElementById('library-panel').getBoundingClientRect();assert(key.closest('#workspace-heading')&&getComputedStyle(key).position!=='fixed'&&r.top>=heading.top-1&&r.bottom<=list.top&&r.right<=heading.right+1&&r.right<=innerWidth,'Ask assistant must sit in the heading without covering the directory.');};
  checkHeaderLauncher();await window.hiveSmoke.viewport({width:1000,height:740});await new Promise(resolve=>setTimeout(resolve,250));checkHeaderLauncher();await window.hiveSmoke.viewport({width:1420,height:920});
  const serviceCard=(await request('list-cards',{collection:'services',query:'North York Seniors'})).items[0];
  const row=`.service-row[data-service-id="${serviceCard.id}"]`;
  const details=document.querySelector(row+' .service-row-actions [data-action="open-card"]').getBoundingClientRect(),ask=document.querySelector(row+' [data-action="ask-service"]').getBoundingClientRect();
  assert(ask.top>=details.bottom,'Ask assistant must remain underneath View details.');
  let serviceCapture=await window.hiveSmoke.capture('known-services');
  click('#service-chat-launcher');await wait(()=>document.body.dataset.serviceChatOpen==='true');
  type('message','Draft retained while browsing services.');
  const overlay=document.getElementById('chat-panel').getBoundingClientRect();
  assert(getComputedStyle(document.getElementById('chat-panel')).position==='fixed'&&overlay.right<=innerWidth&&overlay.bottom<=innerHeight,'The service chat must float inside the app.');
  assert(Math.abs(document.getElementById('library-panel').getBoundingClientRect().width-library.width)<2,'Opening chat must not shrink the directory.');
  click('[data-action="minimize-assistant"]');await wait(()=>document.getElementById('chat-panel').hidden);
  assert(document.getElementById('message').value==='Draft retained while browsing services.'&&document.getElementById('search').value==='North York'&&document.getElementById('category-filter').value==='Transportation','Minimizing must retain the draft and directory filters.');
  type('message','');click(row+' [data-action="ask-service"]');await wait(()=>document.body.dataset.serviceChatOpen==='true'&&document.getElementById('selected-context').textContent.includes('North York Seniors'));
  assert(document.body.dataset.view==='services'&&document.getElementById('chat-panel').getAttribute('role')==='dialog');
  const floatingCapture=await window.hiveSmoke.capture('floating-assistant');
  document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await wait(()=>document.getElementById('chat-panel').hidden);
  assert(document.activeElement===document.querySelector(row+' [data-action="ask-service"]'),'Escape should restore focus to the originating service.');
  click(row+' [data-action="ask-service"]');await wait(()=>!document.getElementById('chat-panel').hidden);
  await window.hiveSmoke.viewport({width:1000,height:740});await new Promise(resolve=>setTimeout(resolve,250));
  const compactFloating=document.getElementById('chat-panel').getBoundingClientRect(),compactSend=document.getElementById('send-button').getBoundingClientRect();
  assert(compactFloating.left>=0&&compactFloating.top>=0&&compactFloating.right<=innerWidth&&compactFloating.bottom<=innerHeight&&compactSend.bottom<=compactFloating.bottom,'Floating chat controls must fit a compact window.');
  const floatingCompactCapture=await window.hiveSmoke.capture('floating-compact');
  type('message','Draft retained when opening Workspace.');click('[data-action="expand-assistant"]');await wait(()=>document.body.dataset.view==='workspace');
  assert(document.getElementById('message').value==='Draft retained when opening Workspace.'&&document.getElementById('selected-context').textContent.includes('North York Seniors')&&document.getElementById('service-chat-launcher').hidden,'Open Workspace must retain the draft and selected service.');
  type('message','');await window.hiveSmoke.viewport({width:1420,height:920});
  click('[data-action="known-services"]');await wait(()=>document.querySelectorAll('.service-row').length===27);filter('category-filter','Transportation');type('search','North York');await wait(()=>document.querySelectorAll('.service-row').length===4);
  click(row+' [data-action="ask-service"]');await wait(()=>document.body.dataset.serviceChatOpen==='true');
  type('message','Remember that '+serviceNote);click('[data-action="send"]');await wait(()=>document.getElementById('send-button').textContent==='Send ↑'&&document.querySelector('.message.assistant'));
  const service=(await request('get-card',{id:serviceCard.id}));const note=service.comments.find(n=>n.body===serviceNote);if(!note)throw new Error('The requested service note was not saved.');
  click('[data-action="manage-memory"]');await revealMemoryEntry(note.id);
  assert(document.querySelector(memoryRow(note.id)).closest('.memory-group').querySelector('h3').textContent==='North York Seniors Centre');
  assert(document.getElementById('chat-panel').hidden&&!document.getElementById('library-panel').hidden);
  click(memoryRow(note.id)+' [data-action="edit-memory"]');await wait(()=>document.getElementById('memory-comment-body'));
  type('memory-comment-body',editedServiceNote);click('[data-action="save-memory-comment"]');await wait(()=>!document.getElementById('modal').open&&document.querySelector(memoryRow(note.id))?.textContent.includes(editedServiceNote));
  if(!(await request('get-card',{id:serviceCard.id})).comments.some(n=>n.body===editedServiceNote))throw new Error('Edited feedback was not persisted.');
  const sibling=await request('save-comment',{card_id:serviceCard.id,body:'Independent practice note to keep.'});
  const previewRow=id=>`[data-preview-id="${id}"]`;
  const deleteButton=' [data-action="delete-memory"]';
  document.querySelector(memoryRow(note.id)).closest('.memory-group').querySelector('[data-action="toggle-memory-group"]').click();
  await wait(()=>document.querySelector(previewRow(note.id)+deleteButton)&&document.querySelector(previewRow(sibling.id)));
  const removePreview=document.querySelector(previewRow(note.id)+deleteButton);
  const previewText=document.querySelector(previewRow(note.id)+' strong');
  assert(removePreview.getBoundingClientRect().left>previewText.getBoundingClientRect().right&&
    !removePreview.closest('.memory-group').querySelector('.memory-history'),'Each collapsed note must offer its own Delete button on the right.');
  const memoryCapture=await window.hiveSmoke.capture('memory-library');
  const originalConfirm=window.confirm;
  window.confirm=()=>false;
  click(previewRow(note.id)+deleteButton);
  assert(document.querySelector(previewRow(note.id)),'Cancel must preserve the note.');
  window.confirm=()=>true;
  click(previewRow(note.id)+deleteButton);
  await wait(()=>!document.querySelector(previewRow(note.id))&&document.querySelector(previewRow(sibling.id)));
  assert((await request('get-card',{id:serviceCard.id})).comments.map(item=>item.id).join('')===sibling.id,
    'Deleting from the preview must leave the service and the other note.');
  await revealMemoryEntry(sibling.id);
  click(memoryRow(sibling.id)+deleteButton);
  await wait(()=>!document.querySelector(memoryRow(sibling.id)));
  window.confirm=originalConfirm;
  assert((await request('get-card',{id:serviceCard.id})).comments.length===0&&(await request('snapshot')).services.total===27);
  // Restore an isolated note via the real service-card editor for the reopening check.
  click('[data-action="known-services"]');await wait(()=>document.querySelector(`.service-row[data-service-id="${serviceCard.id}"]`));
  click(`.service-row[data-service-id="${serviceCard.id}"] [data-action="open-card"]`);await wait(()=>document.getElementById('card-note'));
  assert(!document.getElementById('modal').textContent.includes('416-733-4111')&&
    !document.querySelector('#modal #service-contacts,[data-action="open-original"]'),'The service preview must leave contact and follow-up for selection.');
  click('#modal [data-action="focus-card-note"]');type('card-note',serviceNote);await wait(()=>document.getElementById('note-status')?.textContent.includes('✓ Saved'));
  const footer=document.querySelector('#modal .modal-footer');
  assert(footer.querySelectorAll('button').length===3&&footer.querySelector('button').dataset.action==='use-service-from-details'&&[...footer.querySelectorAll('button')].slice(1).map(b=>b.textContent).join('|')==='Ask more about this card|Provider page ↗','Service footer must offer the three requested actions.');
  assert(Boolean(document.getElementById('card-history').compareDocumentPosition(document.getElementById('card-fields'))&Node.DOCUMENT_POSITION_FOLLOWING),'Saved history must precede Category/provider fields.');
  await window.hiveSmoke.viewport({width:1000,height:740});await new Promise(resolve=>setTimeout(resolve,250));
  const resultFooter=footer.getBoundingClientRect();
  assert(resultFooter.right<=innerWidth&&resultFooter.bottom<=innerHeight,'Service actions must fit a compact window.');
  const followup='.chat-followup';
  click('#modal [data-action="use-service-from-details"]');
  await wait(()=>!document.getElementById('modal').open&&document.body.dataset.serviceChatOpen==='true'&&document.querySelector(followup+' .followup-contact'));
  assert(document.querySelector(followup).textContent.includes('416-733-4111')&&document.querySelector(followup+' [data-step="choose"]'));
  assert((await request('get-card',{id:serviceCard.id})).experience.worked===0,'Selecting a service must not record success.');
  click(followup+' [data-action="copy-contact"]');await wait(()=>document.getElementById('notice').textContent==='Contact copied.');
  assert((await request('get-card',{id:serviceCard.id})).experience.worked===0,'Copying a contact must not record success.');
  click(followup+' [data-outcome="worked"]');await wait(()=>document.querySelector(followup+' [data-followup-field="body"]:enabled'));
  const resultNote=document.querySelector(followup+' [data-followup-field="body"]');
  const ratingField=document.querySelector(followup+' [data-followup-field="rating"]');
  resultNote.value='Completed the requested ride.';resultNote.dispatchEvent(new Event('input',{bubbles:true}));
  const low='rgb(255, 240, 239)', mid='rgb(255, 246, 220)', high='rgb(234, 246, 238)';
  for(const [score,color] of [[1,low],[2,low],[3,mid],[4,high],[5,high]]){
    ratingField.value=String(score);ratingField.dispatchEvent(new Event('change',{bubbles:true}));
    assert(getComputedStyle(ratingField).backgroundColor===color,`Selected rating ${score} must use its rating color.`);
  }
  ratingField.value='1';ratingField.dispatchEvent(new Event('change',{bubbles:true}));
  assert(!document.querySelector('.case-next-steps'),'A draft result must not open the end prompt.');
  const resultFormCapture=await window.hiveSmoke.capture('service-result-form');
  click(followup+' [data-step="save"]');click(followup+' [data-step="save"]');
  await wait(()=>document.querySelector('.followup-saved')&&document.querySelector('.case-next-steps'));
  const chatViewport=document.getElementById('messages').getBoundingClientRect();
  const completionChoices=[...document.querySelectorAll('.completion-message .case-next-actions button')];
  assert(document.activeElement.id==='completion-title'&&completionChoices.length===3&&completionChoices.every(button=>{
    const bounds=button.getBoundingClientRect();
    return bounds.top>=chatViewport.top-1&&bounds.bottom<=chatViewport.bottom+1;
  }),'The separate end prompt must bring all three choices into the compact floating chat.');
  const experienceCard=await request('get-card',{id:serviceCard.id});
  const worked=experienceCard.comments.find(n=>n.outcome==='worked');
  assert(experienceCard.experience.worked===1&&worked.rating===1,'One save must create one result with the chosen rating.');
  const workedBadge=document.querySelector(followup+' .followup-saved .result-badge');
  assert(workedBadge?.textContent==='Worked · 1/5'&&getComputedStyle(workedBadge).backgroundColor===low,
    'A low score stays red even when the service worked.');
  const directoryRating=row+' .service-row-score .rating-badge';
  await wait(()=>document.querySelector(directoryRating)?.textContent==='1.0/5');
  const scoreBadge=document.querySelector(directoryRating);
  assert(getComputedStyle(scoreBadge).backgroundColor===low&&
    scoreBadge.getBoundingClientRect().left>document.querySelector(row+' .service-contact-value').getBoundingClientRect().left,
    'Show the saved average to the right of the program contact.');
  click('.case-next-steps [data-action="keep-case-open"]');
  await wait(()=>!document.querySelector('.case-next-steps')&&document.body.dataset.caseChanging==='false');
  assert(!(await request('get-case',{id:(await request('snapshot')).active_case.id})).completion&&
    document.getElementById('notice').textContent==='Chat kept in Chat history.',
    'Keeping the chat must dismiss the prompt durably and confirm where to find it.');
  click(followup+' [data-action="open-card"]');await wait(()=>document.querySelector(`.saved-note[data-note-id="${worked.id}"]`));
  click(`.saved-note[data-note-id="${worked.id}"] [data-action="edit-card-comment"]`);await wait(()=>!document.getElementById('service-result-editor')?.hidden&&document.getElementById('result-note')?.value==='Completed the requested ride.');
  click('.result-outcomes [data-outcome="not_worked"]');filter('result-rating','2');type('result-note','No vehicle for the requested Tuesday.');click('#save-service-result');await wait(()=>document.getElementById('service-history-status').textContent.includes("Didn't work saved"));
  assert((await request('get-card',{id:serviceCard.id})).experience.worked===0,'Editing a result must update the summary.');
  const removable=await request('save-service-result',{card_id:serviceCard.id,outcome:'worked'});
  click('#modal [data-action="close-modal"]');await wait(()=>!document.getElementById('modal').open);
  click(followup+' [data-action="open-card"]');await wait(()=>document.querySelector(`.saved-note[data-note-id="${removable.id}"]`));
  click(`.saved-note[data-note-id="${removable.id}"] [data-action="edit-card-comment"]`);await wait(()=>!document.getElementById('service-result-editor').hidden&&document.getElementById('result-note').value==='');
  click('.result-outcomes [data-outcome="not_worked"]');click('#save-service-result');await wait(()=>document.getElementById('service-history-status').textContent.includes("Didn't work saved"));
  assert((await request('get-card',{id:serviceCard.id})).comments.find(n=>n.id===removable.id).body==="Didn't work.",'Changing a result without a comment must not retain a contradictory default note.');

  window.confirm=()=>false;click(`.saved-note[data-note-id="${removable.id}"] [data-action="delete-card-comment"]`);assert(document.querySelector(`.saved-note[data-note-id="${removable.id}"]`));
  window.confirm=()=>true;click(`.saved-note[data-note-id="${removable.id}"] [data-action="delete-card-comment"]`);await wait(()=>!document.querySelector(`.saved-note[data-note-id="${removable.id}"]`));window.confirm=originalConfirm;
  click(`.saved-note[data-note-id="${worked.id}"] [data-action="edit-card-comment"]`);await wait(()=>!document.getElementById('service-result-editor').hidden);
  type('result-note','Unsaved draft stays in this form.');window.confirm=()=>false;click('#modal [data-action="close-modal"]');assert(document.getElementById('modal').open);assert(document.getElementById('result-note').value.includes('Unsaved draft'));
  window.confirm=()=>true;click('[data-action="cancel-service-result"]');await wait(()=>document.getElementById('service-result-editor').hidden);window.confirm=originalConfirm;
  await window.hiveSmoke.viewport({width:1420,height:920});document.getElementById('card-history').scrollIntoView({block:'start'});await new Promise(resolve=>setTimeout(resolve,300));
  const serviceCardCapture=await window.hiveSmoke.capture('service-card');
  click('[data-action="close-modal"]');await wait(()=>!document.getElementById('modal').open);
  await wait(()=>document.querySelector(row+' .service-experience-preview')?.textContent.includes('No vehicle for the requested Tuesday.'));
  const directoryWithHistory=await window.hiveSmoke.capture('known-services');
  click(row+' [data-action="ask-service"]');await wait(()=>document.getElementById('selected-context').textContent.includes('North York Seniors'));
  assert(!document.querySelector('#selected-context [data-outcome]'),'Asking about the service must keep the result question on the follow-up card.');
  click('[data-action="manage-memory"]');
  await wait(()=>document.body.dataset.view==='memory');
  type('search','North York Seniors Centre');
  await wait(()=>document.querySelectorAll('.memory-group').length===1&&document.querySelector('.memory-group h3')?.textContent==='North York Seniors Centre'&&document.querySelector('[data-preview-id="'+worked.id+'"]'));
  await revealMemoryEntry(worked.id);
  click(memoryRow(worked.id)+' [data-action="edit-memory"]');await wait(()=>!document.getElementById('service-result-editor')?.hidden&&document.getElementById('result-note')?.value==='No vehicle for the requested Tuesday.');click('[data-action="cancel-service-result"]');await wait(()=>document.getElementById('service-result-editor').hidden);click('#modal [data-action="close-modal"]');await wait(()=>!document.getElementById('modal').open);
  click('[data-action="workspace"]');click('[data-action="new-chat"]');await wait(()=>document.body.dataset.caseChanging==='false'&&!document.querySelector('.message'));
  const ordinaryChat=(await request('snapshot')).active_case.id;
  for (const text of ['Is there a contact number?', 'Do they publish their hours?', 'Are there booking forms?', 'What are their intake steps?']) {
    type('message',text);click('[data-action="send"]');
    await wait(()=>document.getElementById('send-button').textContent==='Send ↑'&&document.querySelector('.message.assistant'));
  }
  const normal=(await request('get-case',{id:ordinaryChat}));
  assert(normal.message_count===8&&normal.messages.every(message=>!message.payload.saved),'Ordinary turns belong in the conversation.');
  assert((await request('list-memory',{grouped:true,kind:'notes'})).record_count===0,'Ordinary turns must not become separate memory cards.');
  type('message','Remember that '+preference);click('[data-action="send"]');
  await wait(()=>document.getElementById('send-button').textContent==='Send ↑'&&document.getElementById('messages').textContent.includes('Note saved in Manage memory.'));
  const personal=(await request('list-memory',{kind:'notes',query:'Initial acceptance preference'})).items[0];if(!personal)throw new Error('An explicitly requested note was not saved.');
  click('[data-action="manage-memory"]');await revealMemoryEntry(personal.id);
  click(memoryRow(personal.id)+' [data-action="edit-memory"]');await wait(()=>document.getElementById('note-body'));
  type('note-title','Contact preference');type('note-body',editedPreference);click('[data-action="save-personal-note"]');await wait(()=>!document.getElementById('modal').open&&document.querySelector(memoryRow(personal.id))?.textContent.includes(editedPreference));
  assert((await request('list-memory',{query:'Initial acceptance preference'})).total===0);
  window.confirm=()=>true;click(memoryRow(personal.id)+' [data-action="delete-memory"]');await wait(()=>!document.querySelector(memoryRow(personal.id)));window.confirm=originalConfirm;
  // The isolated file-picker fixture returns a fictional CSV; the shipping button/IPC/importer are exercised.
  click('[data-action="workspace"]');click('#add-document');await wait(()=>document.querySelector('[data-action="save-import"]'));
  click('[data-action="save-import"]');await wait(()=>!document.getElementById('modal').open&&document.body.dataset.view==='workspace');
  const snapshot=await request('snapshot');assert(snapshot.documents.length===1&&snapshot.cards.total===4);
  const card=snapshot.cards.items.find(c=>c.title==='Example Community Rides');if(!card)throw new Error('The imported document card is missing.');
  const parserChecks=await window.hiveSmoke.parsers();assert(parserChecks.xlsx.cards===2&&parserChecks.xlsx.fields[1].Slots===3&&parserChecks.docx.body.includes('Alex Example')&&parserChecks.pdf.body.includes('416-555-0101'));
  click('[data-action="manage-memory"]');await revealMemoryEntry(card.id);
  click(memoryRow(card.id)+' [data-action="open-card"]');await wait(()=>document.getElementById('card-note'));
  type('card-note',firstNote);await wait(()=>document.getElementById('note-status')?.textContent.includes('✓ Saved'));
  click('[data-action="use-card"]');await wait(()=>!document.getElementById('modal').open&&document.body.dataset.view==='workspace');
  type('message','Remember that '+feedback);click('[data-action="send"]');await wait(()=>document.getElementById('send-button').textContent==='Send ↑'&&document.querySelector('.message.assistant'));
  assert((await request('get-card',{id:card.id})).comments.some(n=>n.body===feedback));
  click('[data-action="new-chat"]');await wait(()=>document.body.dataset.caseChanging==='false'&&!document.querySelector('.message'));
  const searchableNote=(await request('get-card',{id:card.id})).comments.find(note=>note.body===firstNote);
  click('[data-action="manage-memory"]');await wait(()=>document.body.dataset.view==='memory');
  type('search','Practice observation');
  await wait(()=>document.getElementById('card-count').textContent==='1 saved item'&&document.getElementById('cards').textContent.includes(firstNote));
  await revealMemoryEntry(searchableNote.id);
  assert(document.querySelectorAll('.memory-record').length===1);
  assert(document.querySelector('.memory-record-main').dataset.id===card.id);
  type('search','');filter('memory-kind-filter','documents');await wait(()=>document.querySelectorAll('.memory-record').length===4);
  const caseChecks=await runCaseChecks({request,click,type,filter,wait,assert,serviceCard,revealMemoryEntry});
  const publicGroup='[aria-label="Public services without recorded outcomes"]';
  const ownGroup='[aria-label="Your services without recorded outcomes"]';
  click('[data-action="known-services"]');
  await wait(()=>document.querySelector(publicGroup+' .source-tag')?.textContent==='(Public source)');
  click('#add-service');await wait(()=>document.getElementById('service-field-name'));
  assert(document.getElementById('service-questions').textContent.includes('phone number or email')&&
    document.getElementById('service-questions').textContent.includes('communities'));
  type('service-field-name','Fictional Intake Desk');
  type('service-field-organization','Example Access');
  type('service-field-area','Newmarket');
  type('service-field-person','Jordan Example');
  type('service-field-phone','905-555-0176');
  click('[data-action="save-own-service"]');
  await wait(()=>!document.getElementById('modal').open&&document.querySelector(ownGroup+' .service-row'));
  const ownRow=document.querySelector(ownGroup+' .service-row');
  const ownId=ownRow.dataset.serviceId;
  assert(document.querySelector(ownGroup).compareDocumentPosition(document.querySelector(publicGroup))&Node.DOCUMENT_POSITION_FOLLOWING);
  assert(
    ownRow.querySelector('.service-row-contact').textContent.includes('Jordan Example (Own source)')&&
    ownRow.querySelector('.service-contact-value').textContent==='905-555-0176');
  ownRow.querySelector('.service-row-actions [data-action="open-card"]').click();
  await wait(()=>document.querySelector('#modal [data-action="edit-own-service"]'));
  click('#modal [data-action="focus-card-note"]');type('card-note','Practice note: call intake before referring.');
  await wait(()=>document.getElementById('card-notes').textContent.includes('Practice note: call intake before referring.'));
  click('#modal [data-action="edit-own-service"]');await wait(()=>document.getElementById('service-field-email'));
  type('service-field-email','intake@example.org');
  click('[data-action="save-own-service"]');
  await wait(()=>document.querySelector('#modal #service-contacts')?.textContent.includes('intake@example.org'));
  assert(document.getElementById('card-notes').textContent.includes('Practice note: call intake before referring.')&&
    document.querySelector('#card-history .source-tag').textContent==='(Own source)');
  click('#modal [data-action="close-modal"]');
  await wait(()=>!document.getElementById('modal').open);
  click('#import-services');
  await wait(()=>document.getElementById('service-review-row')?.options.length===3);
  assert(document.getElementById('service-review-count').textContent.includes('2 of 3 rows selected')&&
    document.getElementById('service-field-name').value==='Fictional Meal Drop'&&
    document.getElementById('service-questions').textContent.includes('phone number or email'));
  type('service-field-email','meals@example.org');type('service-field-area','Aurora');
  filter('service-review-row','0');
  assert(document.getElementById('service-field-person').value==='Alex Example');
  click('[data-action="save-own-service"]');
  await wait(()=>!document.getElementById('modal').open&&document.querySelectorAll(ownGroup+' .service-row').length===3);
  const [meal]=(await request('list-cards',{collection:'services',query:'meals@example.org'})).items;
  assert(meal.source_format==='own-services'&&(await request('get-card',{id:meal.id})).fields['Eligibility notes']==='Weekday delivery');
  serviceCapture=await window.hiveSmoke.capture('known-services');
  click('[data-action="new-chat"]');
  await wait(()=>document.body.dataset.view==='workspace'&&document.body.dataset.caseChanging==='false'&&!document.querySelector('.message'));
  type('message','Draft question for later.');
  click('#chat-add-service');
  await wait(()=>latestServiceForm()?.elements.namedItem('area_choice'));
  const firstForm=latestServiceForm();
  const firstFormId=firstForm.dataset.serviceForm;
  const areaChoice=firstForm.elements.namedItem('area_choice');
  assert(!document.getElementById('modal').open&&firstForm.querySelectorAll(':scope > fieldset > .inline-service-fields > label:not([hidden])').length===4&&
    !firstForm.querySelector('.inline-service-more').open&&[...areaChoice.options].some(option=>option.value==='Aurora'),
    'Show a short form in chat with a service-area dropdown and extra fields collapsed.');
  assert((await window.hiveSmoke.capture('add-service-form')).ok,'Capture the inline form for review.');
  firstForm.querySelector('summary').click();
  await wait(()=>firstForm.querySelector('details').open);
  fillServiceField('organization','Example Service Form Desk');
  fillServiceField('category','Home supports');
  fillServiceField('area_choice','Aurora');
  firstForm.querySelector('button[type="submit"]').click();
  await wait(()=>document.querySelector('[data-service-form-saved="'+firstFormId+'"]'));
  const deskId=document.querySelector('[data-service-form-saved="'+firstFormId+'"]').dataset.id;
  assert((await request('get-card',{id:deskId})).fields['Service area']==='Aurora');
  assert(document.body.dataset.view==='workspace'&&document.getElementById('message').value==='Draft question for later.'&&
    !document.getElementById('modal').open,'Saving the form in chat keeps the unsent draft and avoids a modal.');

  const deskCaseId=(await request('snapshot')).active_case.id;
  const wrapUp=document.querySelector('.completion-message');
  assert(wrapUp===document.getElementById('messages').lastElementChild&&
    document.activeElement.id==='completion-title'&&
    [...wrapUp.querySelectorAll('button')].map(button=>button.firstChild.textContent).join('|')==='Close chat|Continue chat|Delete chat'&&
    document.querySelector('.service-form-reply p').textContent==='Added Example Service Form Desk to Known services.',
    'Saving a service confirms the addition and focuses a separate message with all three choices.');
  click('.completion-message [data-action="keep-case-open"]');
  await wait(()=>!document.querySelector('.completion-message')&&document.body.dataset.caseChanging==='false');
  assert(document.querySelector('.service-form-reply [data-action="chat-followup-start"][data-id="'+deskId+'"]'),
    'Continue chat keeps the saved service and its follow-up action.');
  click('.chat-header-actions [data-action="new-chat"]');
  await wait(()=>document.body.dataset.caseChanging==='false'&&!document.querySelector('.message'));
  type('message','Can you recommend home services in Aurora?');click('#send-button');
  await wait(()=>document.querySelector('[data-source-group="own"] .answer-card')&&document.getElementById('send-button').textContent==='Send ↑');
  const firstOwn=document.querySelector('#messages .answer-card');
  const publicLabel=document.querySelector('[data-source-group="public"] .source-tag');
  const ownLabel=firstOwn.querySelector('.own-source-tag');
  assert(firstOwn.dataset.id===deskId&&!firstOwn.querySelector('.rating-badge')&&ownLabel&&publicLabel&&
    getComputedStyle(ownLabel).color!==getComputedStyle(publicLabel).color,
    'An unrated own-source match leads the public cards and has a distinct label.');
  click(`[data-case-row="${deskCaseId}"] [data-action="open-case"]`);
  await wait(()=>document.querySelector('[data-service-form-saved="'+firstFormId+'"]')&&document.body.dataset.caseChanging==='false');
  assert(!document.querySelector('.completion-message')&&document.getElementById('message').value==='Draft question for later.');
  type('message','I did not enjoy using the service.');
  click('#send-button');
  await wait(()=>document.querySelector('.followup-add-rating select')&&document.getElementById('send-button').textContent==='Send ↑');
  assert(document.querySelector('.followup-saved').textContent.includes("Didn't work"));
  const ratingSelect=document.querySelector('.followup-add-rating select');
  ratingSelect.value='2';
  ratingSelect.dispatchEvent(new Event('change',{bubbles:true}));
  click('.followup-add-rating [data-step="rate"]');
  await wait(()=>document.querySelector('.followup-saved .result-badge')?.textContent.includes('2/5'));
  assert((await request('get-card',{id:deskId})).experience.rating_average===2);
  click('.chat-header-actions [data-action="new-chat"]');
  await wait(()=>document.body.dataset.caseChanging==='false'&&!document.querySelector('.message'));
  type('message','can you recommend home service for me');
  click('#send-button');
  const ratedAnswer='#messages .answer-card[data-id="'+deskId+'"]';
  await wait(()=>document.querySelector(ratedAnswer+' .rating-badge.rating-low'));
  const recommendationCards=[...document.querySelectorAll('#messages .answer-cards .answer-card')];
  assert(recommendationCards.length>1&&recommendationCards.at(-1).dataset.id===deskId&&
    recommendationCards.at(-1).textContent.includes("1 didn't work")&&
    !document.querySelector('#messages .message.assistant .answer-summary'),
    'A fresh home service request shows service cards, with the tried low-rated service last.');
  assert((await window.hiveSmoke.capture('home-service-rating')).ok,'Capture the ranked service cards and rating.');

  type('message','can you help me add in a service');click('[data-action="send"]');
  await wait(()=>latestServiceForm()&&latestServiceForm().dataset.serviceForm!==firstFormId);
  const emptyForm=latestServiceForm();
  const phoneFormId=emptyForm.dataset.serviceForm;
  assert(!document.querySelector('.message.assistant:last-child .answer-cards')&&!document.getElementById('modal').open);
  emptyForm.querySelector('button[type="submit"]').click();
  await wait(()=>!latestServiceForm().querySelector('.inline-service-error').hidden);
  assert(latestServiceForm().querySelector('.inline-service-error').textContent.includes('at least one detail'));
  fillServiceField('phone','905-555-0191');
  latestServiceForm().querySelector('button[type="submit"]').click();
  await wait(()=>document.querySelector('[data-service-form-saved="'+phoneFormId+'"]'));
  const savedForm=document.querySelector('[data-service-form-saved="'+phoneFormId+'"]');
  const chatServiceId=savedForm.dataset.id;
  savedForm.click();
  await wait(()=>document.querySelector('#modal[open] #service-contacts')?.textContent.includes('905-555-0191'));
  assert(document.querySelector('#modal .callout').textContent.includes('service name'));
  click('#modal [data-action="close-modal"]');
  await wait(()=>!document.getElementById('modal').open);
  const discardCaseId=(await request('snapshot')).active_case.id;
  const deleteChat='.completion-message [data-action="delete-case"]';
  assert(document.querySelector(deleteChat)?.firstChild.textContent==='Delete chat');
  window.confirm=()=>false;
  click(deleteChat);
  assert(document.querySelector(deleteChat),'Cancel keeps the newly completed chat.');
  window.confirm=()=>true;
  click(deleteChat);
  await wait(()=>document.getElementById('notice').textContent.includes('Conversation and saved feedback deleted')||
    (!document.querySelector('[data-case-row="'+discardCaseId+'"]')&&document.body.dataset.caseChanging==='false'));
  window.confirm=originalConfirm;
  const gone=await request('get-case',{id:discardCaseId}).then(()=>false,()=>true);
  assert(gone&&(await request('get-card',{id:chatServiceId})).id===chatServiceId,
    'Delete chat removes the conversation and keeps the directory service.');

  click('[data-action="known-services"]');await wait(()=>document.body.dataset.view==='services');
  type('search','905-555-0191');
  const savedServiceRow='[data-service-id="'+chatServiceId+'"]';
  await wait(()=>document.querySelector(savedServiceRow+' .service-gaps')?.textContent.includes('service name'));
  click(savedServiceRow+' [data-action="remove-known-service"]');
  await wait(()=>!document.querySelector(savedServiceRow));
  filter('service-visibility','removed');
  await wait(()=>document.querySelector(savedServiceRow+' [data-action="restore-known-service"]'));
  click(savedServiceRow+' [data-action="restore-known-service"]');
  await wait(()=>!document.querySelector(savedServiceRow));
  filter('service-visibility','active');
  await wait(()=>document.querySelector(savedServiceRow+' [data-action="remove-known-service"]'));

  click('#service-chat-launcher');
  await wait(()=>document.body.dataset.serviceChatOpen==='true');
  type('message','Okay, could you help me add a new transportation service?\nService area: Aurora and Newmarket');click('[data-action="send"]');
  await wait(()=>latestServiceForm()?.elements.namedItem('area_other').value==='Aurora and Newmarket');
  assert(latestServiceForm().elements.namedItem('category').value==='Transportation'&&
    !latestServiceForm().querySelector('[data-custom-service-area]').hidden&&
    document.body.dataset.view==='services'&&document.getElementById('search').value==='905-555-0191'&&!document.getElementById('modal').open,
    'The floating chat shows the same form with an editable multi-area value and preserves the directory filter.');
  const closedServiceCaseId=(await request('snapshot')).active_case.id;
  fillServiceField('name','Example Mobility Dispatch');
  latestServiceForm().querySelector('button[type="submit"]').click();
  await wait(()=>document.querySelector('.completion-message [data-action="archive-case"]')?.firstChild.textContent==='Close chat');
  click('.completion-message [data-action="archive-case"]');
  await wait(()=>document.getElementById('notice').textContent==='Conversation added to the memory library.');
  const archivedService=await request('get-case',{id:closedServiceCaseId});
  const archivedServiceCard=archivedService.messages.at(-1).payload.cards[0];
  assert(archivedService.status==='archived'&&archivedServiceCard?.title==='Example Mobility Dispatch'&&
    (await request('list-memory',{query:'Example Mobility Dispatch',kind:'chats'})).total>0,
    'Close chat archives the saved conversation under the added service.');
  click('#minimize-assistant');
  type('search','Example Service Form Desk');
  const deskRow='[data-service-id="'+deskId+'"]';
  await wait(()=>document.querySelector(deskRow+' [data-action="remove-known-service"]'));
  click(deskRow+' [data-action="remove-known-service"]');
  await wait(()=>!document.querySelector(deskRow));
  type('search','Access Alliance');
  await wait(()=>document.querySelector('.service-row [data-action="remove-known-service"]'));
  const publicId=document.querySelector('.service-row').dataset.serviceId;
  const publicRow=`[data-service-id="${publicId}"]`;
  click(publicRow+' [data-action="remove-known-service"]');
  await wait(()=>!document.querySelector(publicRow));
  filter('service-visibility','removed');
  const hardDelete=publicRow+' [data-action="delete-removed-service"]';
  await wait(()=>document.querySelector(hardDelete)&&document.querySelector(publicRow+' [data-action="restore-known-service"]'));
  window.confirm=()=>false;
  click(hardDelete);
  assert(document.querySelector(hardDelete),'Cancel keeps the service in Removed services.');
  window.confirm=()=>true;
  click(hardDelete);
  await wait(()=>!document.querySelector(publicRow));
  window.confirm=originalConfirm;
  assert(await request('get-card',{id:publicId}).then(()=>false,()=>true),'Permanent deletion makes the public service unavailable.');
  const serviceChecks={chat_service_id:chatServiceId, removed_service_id:deskId, chat_service_form_verified:true,
    known_service_removal_verified:true, conversational_home_service_feedback:true, live_chat_rating:true, ranked_home_cards:true,
    unrated_own_source_first:true, service_added_wrap_up_verified:true, permanent_service_removal_verified:true,
    closed_service_case_id:closedServiceCaseId,deleted_public_service_id:publicId};
  click('[data-action="manage-memory"]');await wait(()=>document.body.dataset.view==='memory');
  filter('memory-kind-filter','documents');await revealMemoryEntry(card.id);
  click(memoryRow(card.id)+' [data-action="open-card"]');await wait(()=>document.getElementById('card-note'));type('card-note',closingNote);
  window.hiveSmoke.finish({ok:true,own_service_review:true,own_service_id:ownId,...serviceChecks,card_id:card.id,service_card_id:serviceCard.id,...caseChecks,bundled_native_parsers:parserChecks,preloaded_public_services:27,service_card_three_actions:true,service_history_before_category:true,service_result_save_rating:true,service_result_edit_delete:true,service_result_no_double_save:true,service_result_default_note_correction:true,service_result_draft_guard:true,service_selection_no_outcome:true,service_contact_after_selection:true,keep_chat_open_after_completion:true,service_result_memory_edit:true,service_navigation_retains_latest_view:true,serviceCardCapture,resultFormCapture,directoryWithHistory,default_workspace:true,full_width_chat:true,compact_window_composer_visible:true,no_keep_message_checkbox:true,ordinary_turns_stay_in_chat:true,explicit_note_saving:true,organization_memory_search_and_expand:true,service_rows_full_width:true,known_services_full_page:true,assistant_in_services_heading:true,header_button_does_not_cover_rows:true,manage_memory_under_known_services:true,floating_assistant:true,floating_launcher:true,floating_chat_keeps_directory_width:true,floating_draft_and_filters_retained:true,floating_escape_restores_focus:true,floating_compact_window:true,floating_open_workspace_preserves_context:true,ask_assistant_under_details:true,memory_manager_edit_feedback:true,memory_manager_edit_note:true,memory_preview_delete:true,service_score_coloring:true,memory_manager_delete:true,delete_cancel_preserves_memory:true,service_filter_and_search:true,service_contact_and_source_controls:true,service_note_autosave:true,renamed_app_verified:true,logo_in_sidebar_and_welcome:true,upload_beside_speak_verified:true,sidebar_cleanup_verified:true,workspace_capture:workspaceCapture,compact_capture:compactCapture,known_services_capture:serviceCapture,floating_capture:floatingCapture,floating_compact_capture:floatingCompactCapture,memory_capture:memoryCapture,import_preview_verified:true,import_saved_four_cards:true,card_note_autosave_verified:true,selected_card_feedback_verified:true,new_conversation_keeps_cards:true,notes_searchable_on_correct_card:true,no_live_ai_request:true,no_live_microphone_opened:true});
}catch(error){const capture=await window.hiveSmoke.capture('failure');window.hiveSmoke.finish({ok:false,error:error.message||String(error),stack:error.stack,debug_text:document.body.innerText.slice(0,6000),notice_text:document.getElementById('notice')?.textContent,modal_text:document.getElementById('modal')?.innerText.slice(0,3500),failure_capture:capture});}}
run();
