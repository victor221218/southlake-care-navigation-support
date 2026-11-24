export async function runCaseChecks({request,click,type,filter,wait,assert,serviceCard,revealMemoryEntry}){
  const originalCase=(await request('snapshot')).active_case.id,originalConfirm=window.confirm;
  const row=id=>`[data-case-row="${id}"]`;
  const menu='#case-action-menu:popover-open';
  const send=async text=>{type('message',text);click('#send-button');await wait(()=>document.getElementById('send-button').textContent==='Send ↑'&&document.querySelector('.message.assistant'));};
  // Seed one isolated result and use the provider history's Undo and Redo controls.
  click('[data-action="known-services"]');await wait(()=>document.querySelector(`.service-row[data-service-id="${serviceCard.id}"]`));
  const rating=await request('save-service-result',{card_id:serviceCard.id,outcome:'worked',
    rating:5,body:'Practice score to correct with Undo and Redo.'});
  click(`.service-row[data-service-id="${serviceCard.id}"] [data-action="open-card"]`);await wait(()=>document.getElementById('card-note'));
  await wait(()=>document.querySelector('#card-history [data-action="undo-input"]:enabled:not([hidden])'));
  click('#card-history [data-action="undo-input"]');await wait(()=>document.querySelector('#card-history [data-action="redo-input"]:enabled:not([hidden])')&&!document.querySelector(`.saved-note[data-note-id="${rating.id}"]`));
  assert(!(await request('get-card',{id:serviceCard.id})).comments.some(n=>n.id===rating.id));
  click('#card-history [data-action="redo-input"]');await wait(()=>document.querySelector(`.saved-note[data-note-id="${rating.id}"]`));assert((await request('get-card',{id:serviceCard.id})).comments.find(n=>n.id===rating.id).rating===5);
  window.confirm=()=>true;click(`.saved-note[data-note-id="${rating.id}"] [data-action="delete-card-comment"]`);await wait(()=>!document.querySelector(`.saved-note[data-note-id="${rating.id}"]`));window.confirm=originalConfirm;
  click('#modal [data-action="close-modal"]');await wait(()=>!document.getElementById('modal').open);
  click('[data-action="new-chat"]');await wait(()=>document.body.dataset.caseChanging==='false'&&!document.querySelector('.message'));
  const a=(await request('snapshot')).active_case.id;
  await send('I need transportation in North York for an older adult who uses a walker. Show me suitable service cards.');
  const headerActions = [...document.querySelectorAll('.chat-header-actions button:not([hidden])')];
  assert(headerActions.map(button => button.dataset.action).join(',') === 'add-chat-service,new-chat',
    'The Workspace chat header should offer Add a service and New chat.');
  assert(document.getElementById('assistant-title').textContent==='Transportation in North York · Walker access','The topic title should summarize the need and area.');
  await wait(()=>document.querySelector(row(a)+'[data-feedback="unselected"]'));
  const week = new Date();
  week.setDate(week.getDate()-(week.getDay()+6)%7);
  const currentWeek='Week of '+week.toLocaleDateString('en-CA',{month:'short',day:'numeric'});
  assert(document.querySelector(row(a)).closest('.case-week').querySelector('h4').textContent===currentWeek,'Each status group must show the chat by its Monday week.');
  assert(!document.querySelector('.sidebar .input-tools'),'Saved-input corrections must not be in the sidebar.');
  const sidebar=document.querySelector('.case-sidebar');
  const controls=[sidebar.querySelector('h2'),sidebar.querySelector('[data-action="new-chat"]'),
    sidebar.querySelector('#case-search'),sidebar.querySelector('#case-list')];
  assert(controls[0]?.textContent==='Chat history'&&controls[1]?.textContent.includes('New chat')&&
    controls.every((control,index)=>control&&(!index||control.getBoundingClientRect().top>=controls[index-1].getBoundingClientRect().bottom))&&
    !sidebar.querySelector('select'),'Chat history, New chat, search and the list must be stacked in order without a dropdown.');
  let assistant=document.querySelector('.message.assistant:last-child'),cards=assistant.querySelectorAll('.answer-card');
  const savedReply=(await request('get-case',{id:a})).messages.at(-1);
  assert(cards.length===savedReply.payload.cards.length&&cards.length>2,'Show every returned choice without expanding.');
  assert(!assistant.querySelector('.message-text,.answer-summary,[data-action="toggle-response"],[data-action="toggle-answer-cards"]'),'Service answers must contain cards only, with no separate narrative or expansion buttons.');
  const boxes=[...cards].map(c=>c.getBoundingClientRect());assert(Math.abs(boxes[0].top-boxes[1].top)<2&&boxes.every(r=>r.height<=245),'Response cards must sit side by side and stay compact.');
  assert(boxes[0].top>=document.getElementById('messages').getBoundingClientRect().top,'Open a long reply at its first card, not halfway through the grid.');
  assert([...cards].filter(c=>c.querySelector('.card-confirm')).length>0,'Provider checks must remain inside their service cards.');
  await wait(()=>document.body.dataset.view==='workspace');assert([...cards].slice(0,2).every(c=>c.dataset.id!==serviceCard.id),'The low-rated matching service must follow unrated alternatives.');const compactChoicesCapture=await window.hiveSmoke.capture('compact-choices');
  const selectedOption=[...cards].find(card=>card.querySelector('strong')?.textContent.includes('Wheel-Trans')&&card.querySelector('[data-action="chat-followup-start"]'));
  assert(selectedOption,'There must be another selectable provider to try.');
  const chosenId=selectedOption.dataset.id;
  const previousResultCount=(await request('get-card',{id:chosenId})).experience.not_worked;
  click(`.answer-card[data-id="${chosenId}"] [data-action="open-card"]`);
  await wait(()=>document.querySelector('#modal [data-action="use-service-from-details"]'));
  assert(!document.querySelector('#modal #service-contacts,#modal [data-outcome]'),'Comparing a recommendation should not show early result controls.');
  const rankDetails=document.querySelector('#modal .card-ranking');
  assert(rankDetails&&!rankDetails.open&&rankDetails.querySelector('p')?.textContent,
    'Ranking details should be available on demand without adding length to every choice.');
  click('#modal .card-ranking summary');await wait(()=>rankDetails.open);
  click('#modal [data-action="use-service-from-details"]');
  await wait(()=>document.querySelector('.chat-followup .followup-contact')&&document.body.dataset.caseChanging==='false');
  assert(!document.getElementById('modal').open,'Choosing a card must start follow-up inside chat.');
  const contactSection=document.querySelector('.chat-followup .followup-known-contact');
  const labels=[...contactSection.querySelectorAll('.followup-contact small')].map(label=>label.textContent);
  assert(contactSection.querySelector('h4')?.textContent==='Known contact'&&labels.join(',')==='Phone,Email','Show the listed phone and email together.');
  assert(contactSection.getBoundingClientRect().top<document.querySelector('.followup-prompt').getBoundingClientRect().top,'Put known contacts above the result question.');
  click('.chat-followup [data-step="open-note"]');
  await wait(()=>document.querySelector('.chat-followup [data-followup-field="note_draft"]:enabled'));
  assert(document.querySelector('.chat-followup .followup-known-contact'),'Keep contacts visible while writing a note.');
  const standaloneNote='Practice note: call intake again on Thursday.';
  const noteField=document.querySelector('.chat-followup [data-followup-field="note_draft"]');
  noteField.value=standaloneNote;noteField.dispatchEvent(new Event('input',{bubbles:true}));
  click('.chat-followup [data-step="save-note"]');
  await wait(()=>document.querySelector('.followup-note-preview')?.textContent.includes(standaloneNote)&&document.body.dataset.caseChanging==='false');
  assert(document.querySelector('.chat-followup [data-step="choose"]'),'Saving a note must leave the result question available.');
  const withNote=await request('get-card',{id:chosenId});
  assert(withNote.comments.some(comment=>comment.body===standaloneNote&&!comment.outcome));
  assert(withNote.experience.not_worked===previousResultCount,'Saving a note must leave the provider result count unchanged.');
  assert(document.querySelector('.chat-followup [data-step="undo"]').textContent==='Undo note');
  const followupChoicesCapture=await window.hiveSmoke.capture('followup-choices');
  click('.chat-followup [data-step="later"]');await wait(()=>document.querySelector('.chat-followup [data-step="resume"]'));
  assert((await request('get-card',{id:chosenId})).experience.not_worked===previousResultCount,'Not yet must never record an outcome.');
  await wait(()=>document.querySelector('.case-group[data-feedback="needed"] '+row(a)));
  click(row(a)+' [data-action="case-menu"]');
  await wait(()=>document.querySelector(menu+' [data-action="review-case-feedback"]'));
  assert(document.querySelector(row(a)+' [data-action="case-menu"]').getAttribute('aria-expanded')==='true');
  click(menu+' [data-action="review-case-feedback"]');
  await wait(()=>document.activeElement.dataset.step==='resume');
  assert(!document.querySelector(menu),'The floating menu should close after jumping to feedback.');
  click('.chat-followup [data-step="resume"]');await wait(()=>document.querySelector('.chat-followup [data-outcome="not_worked"]'));
  click('.chat-followup [data-outcome="not_worked"]');
  await wait(()=>document.querySelector('.chat-followup textarea')&&!document.querySelector('.chat-followup textarea').disabled);
  const noteText='Practice feedback: no room for the walker on the requested trip.';
  const draftNote=document.querySelector('.chat-followup textarea');
  draftNote.value=noteText;draftNote.dispatchEvent(new Event('input',{bubbles:true}));
  const draftRating=document.querySelector('.chat-followup select');
  draftRating.value='2';draftRating.dispatchEvent(new Event('change',{bubbles:true}));
  assert((await request('get-card',{id:chosenId})).experience.not_worked===previousResultCount,'An unsaved choice or note must not affect service history.');
  click(row(a)+' [data-action="case-menu"]');
  click(menu+' [data-rename-only="true"]');
  await wait(()=>document.getElementById('case-title-input'));
  type('case-title-input','Temporary title');
  click('[data-action="suggest-case-title"]');
  await wait(()=>document.getElementById('case-title-input').value==='Transportation in North York · Walker access');
  type('case-title-input','Long transport follow-up');
  click('[data-action="rename-case"]');
  await wait(()=>!document.getElementById('modal').open&&document.getElementById('assistant-title').textContent==='Long transport follow-up');
  await send('Keep the walker requirement for the return trip.');type('message','Draft retained with the long-running case.');
  click('[data-action="new-chat"]');await wait(()=>document.body.dataset.caseChanging==='false'&&!document.querySelector('.message'));
  const b=(await request('snapshot')).active_case.id;await send('Meal support follow-up for a separate case.');
  type('case-search','Long transport');
  assert(document.querySelectorAll('.case-group').length===1&&
    document.querySelector('.case-group[data-feedback="needed"] '+row(a))&&
    document.querySelectorAll('.case-item').length===1,'Search must keep the matching chat under its status.');
  type('case-search','No matching practice topic');
  assert(document.querySelector('.case-empty')?.textContent==='No chats match your search.');
  type('case-search','');
  await wait(()=>document.querySelectorAll('.case-group').length===3);
  assert([...document.querySelectorAll('.case-group h3')].map(heading=>heading.textContent).join('|')===
    'Feedback needed|No service selected|Feedback recorded','All populated feedback categories must be visible in order.');
  assert(document.querySelector('.case-group[data-feedback="unselected"] '+row(b)));
  click(`[data-case-row="${a}"] [data-action="open-case"]`);await wait(()=>document.getElementById('assistant-title').textContent==='Long transport follow-up'&&document.getElementById('message').value==='Draft retained with the long-running case.');
  assert(document.getElementById('messages').textContent.includes('walker requirement')&&!document.getElementById('messages').textContent.includes('Meal support follow-up'),'Reopening a case must show only that discussion.');
  const returnedNote=document.querySelector('.chat-followup textarea');
  assert(returnedNote?.value===noteText&&document.querySelector('.chat-followup select')?.value==='2','Returning to the topic must restore the feedback draft.');
  const followupFeedbackCapture=await window.hiveSmoke.capture('followup-feedback');
  click('.chat-followup [data-step="save"]');await wait(()=>document.querySelector('.followup-saved')&&document.body.dataset.caseChanging==='false');
  const steps='.case-next-steps';
  const completion=document.querySelector('.completion-message');
  const heading=completion?.querySelector('#completion-title');
  assert(completion===document.getElementById('messages').lastElementChild&&
    !document.querySelector('.followup-message '+steps)&&heading?.textContent==='What would you like to do next?'&&
    document.activeElement===heading,'Saving must open a separate assistant message at the end and move focus to its choices.');
  assert(document.querySelectorAll(steps+' button').length===3);
  const recorded=(await request('get-card',{id:chosenId})).comments.find(note=>note.body===noteText);
  assert(recorded?.rating===2&&recorded.outcome==='not_worked','The note and rating must save to the selected provider.');
  click('.chat-followup [data-action="chat-followup-options"]');
  assert(document.activeElement.dataset.action==='chat-followup-start'&&document.activeElement.dataset.id!==chosenId,'Other options should return focus to a different provider in the original grid.');
  assert(document.querySelector('.chat-followup [data-step="undo"]').textContent==='Undo result');
  click('.chat-followup [data-step="undo"]');await wait(()=>document.querySelector('.chat-followup [data-outcome="not_worked"]')&&document.body.dataset.caseChanging==='false');
  assert(!(await request('get-card',{id:chosenId})).comments.some(note=>note.id===recorded.id));
  assert(!document.querySelector(steps),'Undo must return the service to follow-up.');
  await wait(()=>document.querySelector(row(a)+'[data-feedback="needed"]'));
  assert(document.querySelector('.chat-followup [data-step="redo"]').textContent==='Redo result');
  click('.chat-followup [data-step="redo"]');await wait(()=>document.querySelector('.followup-saved')&&document.body.dataset.caseChanging==='false');
  assert((await request('get-card',{id:chosenId})).comments.some(note=>note.id===recorded.id&&note.rating===2));
  await wait(()=>document.querySelector(row(a)+'[data-feedback="recorded"]'));
  const caseChatsCapture=await window.hiveSmoke.capture('case-chats');
  await send('Show me suitable service cards for transportation in North York.');
  const nextReply=document.querySelector('.completion-message').previousElementSibling;
  const firstChoice=nextReply.querySelector('.answer-card')?.getBoundingClientRect();
  const discussion=document.getElementById('messages').getBoundingClientRect();
  assert(firstChoice?.top>=discussion.top-1&&firstChoice.top<discussion.bottom,
    'A new question should open at its answer even with the completion choices waiting below.');
  type('message','Draft retained with the long-running case.');
  click(row(a)+' [data-action="case-menu"]');
  const saveChoice=document.querySelector(menu+' [data-action="archive-case"]');
  const deleteChoice=document.querySelector(menu+' [data-action="delete-case"]');
  assert(saveChoice?.textContent.startsWith('Add to memory library')&&saveChoice.querySelector('small')?.textContent.includes('one item'));
  assert(deleteChoice?.textContent.startsWith('Delete chat history')&&deleteChoice.querySelector('small')?.textContent.includes('inaccurate'));
  document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  click(steps+' [data-action="archive-case"]');await wait(()=>!document.querySelector(row(a))&&document.body.dataset.caseChanging==='false');
  const archived=(await request('get-case',{id:a}));assert(archived.status==='archived'&&archived.message_count===7);const archiveCard=archived.archive_card_id;
  assert(!(await request('list-memory',{query:'walker requirement'})).items.some(i=>i.kind==='message'),'Saving the case should consolidate its automatic message cards.');
  click(row(b)+' [data-action="case-menu"]');window.confirm=()=>false;click(menu+' [data-action="delete-case"]');assert((await request('get-case',{id:b})).status==='active');
  click(row(b)+' [data-action="case-menu"]');window.confirm=()=>true;click(menu+' [data-action="delete-case"]');await wait(()=>!document.querySelector(row(b))&&document.body.dataset.caseChanging==='false');window.confirm=originalConfirm;
  let deleted=false;try{await request('get-case',{id:b});}catch{deleted=true;}assert(deleted&&(await request('list-memory',{query:'Meal support follow-up'})).total===0,'Delete must remove both the conversation and its automatic memory.');
  assert((await request('get-card',{id:serviceCard.id})).comments.some(n=>n.outcome==='not_worked'),'Separately recorded service results must stay.');
  click('[data-action="manage-memory"]');await wait(()=>document.body.dataset.view==='memory');
  filter('memory-kind-filter','chats');
  await wait(()=>document.querySelector(`[data-preview-id="${archiveCard}"]`));
  assert(document.querySelector(`[data-preview-id="${archiveCard}"]`).closest('.memory-group').querySelector('h3').textContent==='TTC');
  await wait(()=>!document.getElementById('notice').classList.contains('visible'));
  const caseLibraryCapture=await window.hiveSmoke.capture('case-library');
  await revealMemoryEntry(archiveCard);
  click(`.memory-record[data-memory-id="${archiveCard}"] [data-action="open-card"]`);await wait(()=>document.body.dataset.view==='workspace'&&!document.getElementById('case-archived-banner').hidden);assert(document.getElementById('composer').hidden&&document.getElementById('messages').textContent.includes('walker requirement'));
  click('#case-archived-banner [data-action="reopen-case"]');await wait(()=>!document.getElementById('composer').hidden&&document.getElementById('message').value==='Draft retained with the long-running case.');
  assert((await request('list-memory',{kind:'chats'})).total===0,'Reopened conversations should return to Chat history.');
  click(row(a)+' [data-action="case-menu"]');click(menu+' [data-action="archive-case"]');
  await wait(()=>!document.querySelector(row(a))&&document.body.dataset.caseChanging==='false');
  assert((await request('get-case',{id:a})).archive_card_id===archiveCard,'Resaving a case must retain one library card.');

  click('[data-action="new-chat"]');await wait(()=>document.body.dataset.caseChanging==='false'&&!document.querySelector('.message'));
  const deletedWithNotes=(await request('snapshot')).active_case.id;
  const practiceNote='Isolated note for the delete chat and notes check.';
  await send('Remember that '+practiceNote);
  assert((await request('list-memory',{query:practiceNote,kind:'notes'})).total===1);
  const practiceCase = (await request('snapshot')).active_case.id;
  click('[data-action="known-services"]');
  await wait(() => document.body.dataset.view === 'services');
  click(row(practiceCase) + ' [data-action="case-menu"]');
  click(menu + ' [data-action="finish-conversation"]');
  await wait(() => document.body.dataset.view === 'workspace' &&
    document.querySelector(steps + ' [data-action="delete-case"][data-include-notes="true"]'));
  let confirmation='';
  window.confirm=message=>{confirmation=message;return false;};
  click(steps+' [data-action="delete-case"]');
  assert(confirmation.includes('notes, ratings and service results')&&document.querySelector(row(deletedWithNotes)));
  assert((await request('list-memory',{query:practiceNote,kind:'notes'})).total===1);
  window.confirm=()=>true;click(steps+' [data-action="delete-case"]');
  await wait(()=>!document.querySelector(row(deletedWithNotes))&&document.body.dataset.caseChanging==='false');
  window.confirm=originalConfirm;
  assert((await request('list-memory',{query:practiceNote,kind:'notes'})).total===0);
  assert((await request('get-case',{id:a})).status==='archived');
  click(`[data-case-row="${originalCase}"] [data-action="open-case"]`);await wait(()=>document.getElementById('assistant-title').textContent===(document.querySelector(`[data-case-row="${originalCase}"] strong`)?.textContent));
  return{weekly_case_sidebar:true,chat_history_status_groups:true,sidebar_feedback_jump:true,suggested_case_title:true,close_case_from_sidebar:true,
    simplified_chat_header:true,sidebar_case_completion:true,
    save_or_delete_case_choices:true,saved_conversation_grouped_by_organization:true,
    completion_actions_in_chat:true,completion_as_separate_message:true,archive_from_completion:true,delete_chat_with_notes:true,
    compact_response_choices:true,automatic_topic_titles:true,chat_service_followup:true,known_contacts_above_followup:true,independent_chat_note:true,chat_feedback_draft_retained:true,chat_feedback_undo_redo:true,followup_choices_capture:followupChoicesCapture,followup_feedback_capture:followupFeedbackCapture,all_response_cards_visible:true,service_responses_cards_only:true,confirmation_inside_service_cards:true,personal_history_ranking:true,case_sidebar:true,named_case_rename:true,case_messages_separate:true,case_draft_retained:true,case_archive_full_history:true,case_delete_auto_memory:true,case_delete_cancel:true,case_delete_preserves_results:true,case_library_reopen:true,case_archive_no_duplicates:true,saved_rating_undo_redo:true,compactChoicesCapture,caseChatsCapture,caseLibraryCapture,archived_case_id:a,archived_case_card:archiveCard};
}
