import { Voice } from './voice.mjs';
import { escapeHTML as e } from './render-text.mjs';
const api=(method,args={})=>window.hive.request(method,args),$=id=>document.getElementById(id);
let state,query='',documentFilter='',libraryMode='workspace',navigationSequence=0,serviceChatOpen=false,assistantReturnFocus=null,memoryKind='all',category='',includeArchived=false,offset=0,messages=[],busy=false,importing=false,selected=null,preview=null,noteEditor=null,noteTimer,feedbackEditor=null,feedbackSaving=false,voicePrefix='',connectionBusy=false,cardLoadSequence=0,activeCase=null,activeOwner=null,caseChanging=false,caseSequence=0,caseHasMore=false,caseFilter='',caseDraftTimer,caseDraftQueue=Promise.resolve();
const modal=$('modal');
const feedbackDrafts=new Map();
const date=value=>{try{return new Date(value).toLocaleString('en-CA',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});}catch{return value;}};
const icon=name=>({file:'▤',chat:'◌',plus:'+',search:'⌕',arrow:'↗',close:'×',mic:'◉',check:'✓'}[name]||'');
function notice(text,error=false){$('notice').textContent=text;$('notice').className=error?'visible error':'visible';clearTimeout(notice.timer);notice.timer=setTimeout(()=>$('notice').className='',6500);}
function textHTML(text){return e(text).replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/\*([^*\n]+)\*/g,'<em>$1</em>').replace(/\n/g,'<br>');}
function button(action,label,classes='',extra=''){return`<button class="${classes}" data-action="${action}" ${extra}>${label}</button>`;}
const isService=card=>card.source_format==='service-directory';
const resultLabel=outcome=>outcome==='worked'?'Worked':"Didn't work";
function resultBadge(note){return note.outcome?`<span class="result-badge ${e(note.outcome)}">${e(resultLabel(note.outcome))}${note.rating!=null?' · '+note.rating+'/5':''}</span>`:'';}
function experienceHTML(summary){if(!summary||!summary.worked&&!summary.not_worked)return'';return`<span class="experience-summary"><span>${summary.worked} worked</span><span>${summary.not_worked} didn't work</span>${summary.rating_count?`<span>Your average rating ${Number(summary.rating_average).toFixed(1)}/5 · ${summary.rating_count} rating${summary.rating_count===1?'':'s'}</span>`:''}</span>`;}
const fileLabel=card=>isService(card)?'Known service · '+(card.category||card.fields?.Category||'Public provider source'):card.filename?`${card.filename} · ${card.locator}`:card.kind==='message'?'Your saved message':'Your personal note';
function answerCardHTML(card, reply) {
  const contact = card.contacts?.[0];
  const summary = card.experience;
  const service = isService(card);
  const pickable = reply.id && !reply.error && activeCase?.status === 'active' &&
    !card.archived && card.document_id && (service || reply.presentation === 'service-options');
  const details = `data-id="${e(card.id)}"`;
  const content = `<span class="card-kicker">${e(card.category || card.filename || (card.kind === 'conversation' ? 'Saved case' : 'Saved information'))}</span>
    <strong>${e(card.title)}</strong>
    ${card.card_reason ? `<span class="card-reason"><b>Why consider</b>${e(card.card_reason)}</span>` :
      `<span class="card-excerpt">${e(card.body?.split('\n')[0]?.slice(0,120) || 'Open to see details')}</span>`}
    ${card.card_confirm || service ? `<span class="card-confirm"><b>Confirm</b>${e(card.card_confirm || 'Eligibility, service area, accessibility, fees and current capacity with intake.')}</span>` : ''}
    <span class="answer-card-bottom">${contact ? `<span>${e(contact.value)}</span>` : ''}
      ${summary?.rating_count ? `<small>${Number(summary.rating_average).toFixed(1)}/5 · ${summary.rating_count} rating${summary.rating_count === 1 ? '' : 's'}</small>` :
        card.comment_count ? `<small>${card.comment_count} saved note${card.comment_count === 1 ? '' : 's'}</small>` : ''}</span>`;
  if (!pickable) {
    return `<button class="memory-card answer-card" data-action="open-card" ${details}>${content}<span class="answer-card-open">View details →</span></button>`;
  }
  const tracked = messages.find(message => message.followup?.reply_sequence === reply.sequence &&
    message.followup.card_id === card.id)?.followup;
  const pickLabel = tracked?.result ? 'View result' : tracked ? 'Resume follow-up' : 'Use this service';
  return `<article class="memory-card answer-card pickable-answer" ${details}>${content}
    <div class="answer-card-actions">
      ${button('chat-followup-start',pickLabel,'answer-card-pick',`${details} data-reply-id="${e(reply.id)}" aria-label="${e(pickLabel)} for ${e(card.title)}"`)}
      ${button('open-card','View details','answer-card-details',`${details} data-reply-id="${e(reply.id)}" aria-label="View details for ${e(card.title)}"`)}
    </div></article>`;
}
function renderChatFollowup(message) {
  const followup = message.followup;
  const available = followup.card && !followup.unavailable;
  const archived = activeCase?.status === 'archived';
  const title = available ? followup.card.title : message.text;
  const cardId = `data-id="${e(followup.card_id)}"`;
  const stepButton = (step, label, style, extra = '') =>
    button('chat-followup-step', label, style, `data-step="${step}" ${extra}`);
  const viewDetails = available ? button('open-card','View details','quiet',cardId) : '';
  const otherOptions = messages.some(reply => reply.sequence === followup.reply_sequence && reply.cards?.length > 1)
    ? button('chat-followup-options','See other options','secondary',`data-sequence="${followup.reply_sequence}" ${cardId}`) : '';
  const listedContacts = available ? (followup.card.contacts || []) : [];
  const contactName = listedContacts.find(contact => contact.name)?.name;
  const contacts = listedContacts.length ? `<section class="followup-known-contact" aria-label="Known contact">
    <div class="followup-contact-heading"><h4>Known contact</h4>${contactName ? `<span>${e(contactName)}</span>` : ''}</div>
    <div class="followup-contact-list">${listedContacts.map(contact => {
      const label = contact.kind === 'email' ? 'Email' : 'Phone';
      return `<div class="followup-contact">
        <div><small>${label}</small><strong>${e(contact.value)}</strong></div>
        ${button('copy-contact','Copy','quiet',`${cardId} data-value="${e(contact.value)}" aria-label="Copy ${label.toLowerCase()}"`)}
      </div>`;
    }).join('')}</div>
  </section>` : '';
  const latestNote = followup.latest_note;
  const savedNote = available && latestNote ? `<div class="followup-note-preview" role="status">
    <h4>Latest note</h4><p>${textHTML(latestNote.body)}</p>
  </div>` : '';
  const editingNote = available && !archived && followup.note_open;
  const addNote = available && !archived && !editingNote ? stepButton('open-note','Add a note','secondary followup-add-note') : '';
  let content;
  if (!available) {
    content = '<p>This service card is no longer available.</p>';
  } else if (editingNote) {
    content = `<div class="followup-fields followup-note-editor">
      <label>Note for this service<textarea data-followup-field="note_draft" rows="2" maxlength="2000" placeholder="For example: Call intake again on Thursday.">${e(followup.note_draft || '')}</textarea></label>
    </div>
    <div class="followup-actions">${stepButton('save-note','Save note','primary')}${stepButton('cancel-note','Cancel','quiet')}</div>`;
  } else if (followup.result) {
    const result = followup.result;
    const note = result.body !== resultLabel(result.outcome) + '.' ? `<p class="followup-note">${textHTML(result.body)}</p>` : '';
    content = `<div class="followup-saved" role="status"><span>✓ Result saved</span>${resultBadge(result)}</div>${note}
      <div class="followup-actions">${result.outcome === 'not_worked' ? otherOptions : ''}${viewDetails}
      ${!archived ? button('new-chat','New topic','quiet') : ''}</div>`;
  } else if (archived) {
    content = `<p>Result pending. Reopen this topic to finish it.</p><div class="followup-actions">${viewDetails}</div>`;
  } else if (followup.deferred) {
    content = `<p>You can record the result after you follow up.</p><div class="followup-actions">
      ${stepButton('resume','Record result','primary')}${viewDetails}${otherOptions}</div>`;
  } else if (followup.outcome) {
    content = `<div class="followup-question"><p>How was your experience with this service?</p>
      ${resultBadge(followup)}</div>
      <div class="followup-fields">
        <label>Note (optional)<textarea data-followup-field="body" rows="2" maxlength="2000" placeholder="For example: They could take the walker, but needed two days' notice.">${e(followup.body || '')}</textarea></label>
        <label>Rating (optional)<select data-followup-field="rating"><option value="">No rating</option>
          ${[1,2,3,4,5].map(n => `<option value="${n}" ${followup.rating === n ? 'selected' : ''}>${n}/5${n === 1 ? ' · Poor' : n === 5 ? ' · Excellent' : ''}</option>`).join('')}
        </select></label>
      </div>
      <div class="followup-actions">${stepButton('save','Save result','primary')}${stepButton('change','Change result','quiet')}${stepButton('later','Finish later','quiet')}</div>`;
  } else {
    content = `<p class="followup-prompt">After you follow up, did this service work?</p>
      <div class="followup-actions">
        ${stepButton('choose','✓ Worked','primary','data-outcome="worked"')}
        ${stepButton('choose','Didn’t work','secondary','data-outcome="not_worked"')}
        ${stepButton('later','Not yet','quiet')}${viewDetails}
      </div>`;
  }
  return `<article class="message assistant followup-message" data-message-id="${e(message.id)}" data-message-sequence="${message.sequence}">
    <div class="message-label">ASSISTANT</div>
    <section class="chat-followup" aria-labelledby="followup-${e(message.id)}">
      <div class="followup-heading">
        <h3 id="followup-${e(message.id)}" tabindex="-1">${e(title)}</h3>${addNote}
      </div>
      ${contacts}${savedNote}${content}
    </section></article>`;
}
function renderModel(){const selected=state?.models?.selected,item=state?.models?.items?.find(m=>m.id===selected);$('model-status').textContent=selected?'AI model: '+(item?.name||selected):state?.account.sharing?'ChatGPT · model selected when you ask':'Connect ChatGPT for AI answers';}
function serviceRowHTML(card){const contact=card.contacts?.[0];return `<article class="service-row" data-service-id="${e(card.id)}"><div class="service-row-info">${card.comment_count?`<div class="service-experience-preview">${experienceHTML(card.experience)}<small>Your latest note: ${e(card.latest_note)}</small></div>`:''}<span class="card-kicker">${e(card.category||'Known service')}</span>${button('open-card',e(card.title),'service-title',`data-id="${e(card.id)}"`)}<p>${e(card.body?.split('\n')[0]||'')}</p><span class="service-area">${e(card.area||'Confirm the service area with intake')}</span></div><div class="service-row-contact"><strong>${e(contact?.name||'Program contact')}</strong><span>${e(contact?.value||'See provider details')}</span>${card.comment_count?`<small>${card.comment_count} saved note${card.comment_count===1?'':'s'} / result${card.comment_count===1?'':'s'}</small>`:''}</div><div class="service-row-actions">${button('open-card','View details','secondary',`data-id="${e(card.id)}"`)}${button('ask-service','Ask assistant','quiet',`data-id="${e(card.id)}"`)}</div></article>`;}
function memoryRowHTML(item){const label=item.kind==='conversation'?'Saved case chat':item.outcome?'Service result':item.entry_type==='comment'?'Feedback & notes':item.document_id?'Document card':item.kind==='message'?'Saved message':'Personal memory';return `<article class="memory-record" data-memory-id="${e(item.id)}"><button class="memory-record-main" data-action="open-card" data-id="${e(item.card_id)}"><span class="card-kicker">${label}${item.archived?' · PREVIOUS ROW':''}</span><strong>${e(item.title)}</strong>${resultBadge(item)}<p>${e(item.body)}</p><small>${e(item.filename||'Personal memory')} · ${e(date(item.updated_at))}</small></button><div class="memory-record-actions">${button('edit-memory',item.kind==='conversation'?'Case options':item.document_id&&item.entry_type==='card'?'Add correction':'Edit','secondary',`data-id="${e(item.id)}" data-card-id="${e(item.card_id)}" data-entry-type="${e(item.entry_type)}"`)}${button('delete-memory','Delete','quiet danger',`data-id="${e(item.id)}" data-card-id="${e(item.card_id)}" data-entry-type="${e(item.entry_type)}"`)}</div></article>`;}
function renderCases(){const items=(state?.cases?.items||[]).filter(c=>c.title.toLowerCase().includes(caseFilter.toLowerCase()));$('case-list').innerHTML=items.map(c=>`<div class="case-item ${activeCase?.id===c.id?'active':''}" data-case-row="${e(c.id)}"><button data-action="open-case" data-id="${e(c.id)}" title="${e(c.title)}" aria-current="${activeCase?.id===c.id?'true':'false'}"><strong>${e(c.title)}</strong><small>${c.message_count?c.message_count+' messages':'New topic'}</small></button>${button('case-options','⋯','case-more',`data-id="${e(c.id)}" aria-label="Options for ${e(c.title)}"`)}</div>`).join('')||'<p class="case-empty">No matching case chats.</p>';}
function renderUndo(){const history=state?.input_history||{};for(const direction of ['undo','redo'])document.querySelectorAll(`[data-action="${direction}-input"]`).forEach(b=>{b.disabled=busy||caseChanging||!history[direction];b.title=history[direction]?direction[0].toUpperCase()+direction.slice(1)+': '+history[direction]:'Nothing to '+direction;});}
function inputTools(){return`<div class="input-tools" aria-label="Correct saved inputs">${button('undo-input','↶ Undo','quiet')}${button('redo-input','↷ Redo','quiet')}</div>`;}
function renderCaseTitle(){if(!activeCase)return;$('assistant-title').textContent=activeCase.title;$('case-options-button').hidden=false;$('composer').hidden=activeCase.status==='archived';$('selected-context').hidden=activeCase.status==='archived';$('case-archived-banner').hidden=activeCase.status!=='archived';$('case-archived-banner').innerHTML=activeCase.status==='archived'?`<span>Saved in memory. Reopen this case to continue its chat.</span>${button('reopen-case','Reopen case','secondary',`data-id="${e(activeCase.id)}"`)}`:'';}
function scheduleCaseDraft() {
  clearTimeout(caseDraftTimer);
  caseDraftTimer = setTimeout(() => flushCaseDraft().catch(fail), 500);
}
async function flushCaseDraft() {
  clearTimeout(caseDraftTimer);
  if (!activeCase || activeCase.status !== 'active') return;
  const args = {id: activeCase.id, card_id: selected?.id || null, draft: $('message').value};
  const changedFeedback = [...feedbackDrafts.values()].filter(entry => entry.case_id === args.id);
  caseDraftQueue = caseDraftQueue.catch(() => {}).then(async () => {
    await api('case-context', args);
    const draftsPerRequest = 4;
    for (let start = 0; start < changedFeedback.length; start += draftsPerRequest) {
      const entries = changedFeedback.slice(start, start + draftsPerRequest);
      await api('save-followup-drafts', {case_id: args.id, drafts: entries});
      for (const entry of entries) {
        if (feedbackDrafts.get(entry.message_id) === entry) feedbackDrafts.delete(entry.message_id);
      }
    }
  });
  await caseDraftQueue;
}
const fromCaseMessage = message => ({
  id: message.id, sequence: message.sequence, role: message.role, text: message.body,
  ...message.payload, error: message.state === 'error'
});
function updateFollowupControls() {
  $('messages').querySelectorAll('[data-action="chat-followup-start"],[data-action="chat-followup-step"],[data-followup-field]').forEach(control => {
    control.disabled = busy || caseChanging;
  });
}
function rememberFeedbackDraft(target) {
  if (!target.matches('[data-followup-field]') || !activeCase || caseChanging || busy) return;
  const messageId = target.closest('[data-message-id]')?.dataset.messageId;
  const feedback = messages.find(message => message.id === messageId)?.followup;
  const field = target.dataset.followupField;
  if (!feedback) return;
  if (field === 'note_draft') {
    if (!feedback.note_open) return;
  } else if (!feedback.outcome || feedback.result || feedback.deferred) return;
  feedback[field] = field === 'rating' ? (Number(target.value) || null) : target.value.slice(0, 2000);
  feedbackDrafts.set(messageId, {
    case_id: activeCase.id, message_id: messageId,
    body: feedback.body, rating: feedback.rating, note_draft: feedback.note_draft
  });
  scheduleCaseDraft();
}
async function actOnFollowup(action, target) {
  if (busy || caseChanging || activeCase?.status !== 'active') return;
  const starting = action === 'chat-followup-start';
  const messageId = target.closest('[data-message-id]')?.dataset.messageId;
  const args = {case_id: activeCase.id};
  if (starting) {
    Object.assign(args, {reply_id: target.dataset.replyId, card_id: target.dataset.id});
  } else {
    const fields = target.closest('.chat-followup');
    if (target.dataset.step === 'save-note') {
      const textArea = fields.querySelector('[data-followup-field="note_draft"]');
      if (textArea) rememberFeedbackDraft(textArea);
    }
    Object.assign(args, {
      message_id: messageId, step: target.dataset.step, outcome: target.dataset.outcome,
      body: fields.querySelector('textarea[data-followup-field="body"]')?.value || '', rating: Number(fields.querySelector('select')?.value) || null
    });
  }
  lockCase(true);
  let result;
  try {
    await flushCaseDraft();
    result = await api(starting ? 'start-service-followup' : 'update-service-followup', args);
    if (activeCase?.id !== args.case_id) return;
    if (starting && selected) {
      selected = null;
      context();
      await flushCaseDraft();
    }
    const existing = messages.findIndex(message => message.id === result.id);
    if (existing >= 0) messages[existing] = fromCaseMessage(result);
    else messages.push(fromCaseMessage(result));
    if (args.step === 'save-note' || result.payload.followup.result) {
      state.input_history = await api('input-history');
    }
    renderMessages();
  } finally {
    lockCase(false);
  }
  const reply = $('messages').querySelector(`[data-message-id="${CSS.escape(result.id)}"]`);
  reply?.scrollIntoView({block:'nearest',behavior:'instant'});
  (reply?.querySelector('textarea') || reply?.querySelector('h3'))?.focus({preventScroll:true});
}
function showFollowupOptions(target) {
  const choices = $('messages').querySelector(`[data-message-sequence="${CSS.escape(target.dataset.sequence)}"] .answer-cards`);
  if (!choices) return;
  choices.scrollIntoView({block:'start',behavior:'instant'});
  const other = [...choices.querySelectorAll('[data-action="chat-followup-start"]')].find(option => option.dataset.id !== target.dataset.id);
  other?.focus({preventScroll:true});
}
function lockCase(value){caseChanging=value;document.body.dataset.caseChanging=String(value);$('chat-panel').setAttribute('aria-busy',String(value));$('send-button').disabled=value;$('message').disabled=busy||value;$('voice-button').disabled=busy||value;$('add-document').disabled=busy||value||importing;renderUndo();updateFollowupControls();}
async function loadCase(id,{activate=true}={}){if(busy)throw new Error('Choose Stop or wait for this answer before changing cases.');const sequence=++caseSequence;lockCase(true);try{await flushNote();await flushCaseDraft();await pauseVoice();const record=await api(activate?'select-case':'get-case',{id});if(sequence!==caseSequence)return;activeCase=record;caseHasMore=record.has_more;messages=record.messages.map(fromCaseMessage);selected=null;if(record.selected_card_id){try{selected=await api('get-card',{id:record.selected_card_id});}catch{}}$('message').value=record.draft||'';context();renderCaseTitle();renderMessages(true);renderCases();}finally{if(sequence===caseSequence)lockCase(false);}}
async function newCase(){if(busy)throw new Error('Choose Stop or wait for this answer before starting a new topic.');if(caseChanging)return;const navigation=navigationSequence;lockCase(true);try{await flushNote();await flushCaseDraft();const record=await api('new-case');if(navigation===navigationSequence)await changeLibraryMode('workspace');await loadCase(record.id);await refresh();$('message').focus();}finally{lockCase(false);}}
async function caseOptions(id=activeCase?.id){if(!id)return;const record=await api('get-case',{id});await openModal(modalHead('Case options',record.title)+`<div class="detail-body case-options"><label>Case title<input id="case-title-input" maxlength="80" value="${e(record.title)}" placeholder="For example: North York transport follow-up"></label><p class="subtle">Use a service need or non-identifying title.</p>${button('rename-case','Save title','primary',`data-id="${e(id)}" data-version="${record.version}"`)}<section class="detail-section"><h3>Keep the discussion for later</h3><p>Save the complete conversation in Manage memory and remove it from the sidebar. Separate service notes and results remain on their cards.</p>${record.status==='active'?button('archive-case','Save to memory & remove chat','secondary',`data-id="${e(id)}" data-version="${record.version}"`):button('reopen-case','Reopen case chat','secondary',`data-id="${e(id)}"`)}</section><section class="detail-section"><h3>Delete this case</h3><p>Remove the conversation and its automatically saved messages. Separately recorded service results and notes remain. Saved-input Undo cannot recover a deleted case.</p>${button('delete-case','Delete chat history','quiet danger',`data-id="${e(id)}" data-version="${record.version}"`)}</section></div>`,'case-options-dialog');}
async function applyInputHistory(direction){if(busy)throw new Error('Wait for the answer or choose Stop before correcting saved inputs.');const cardId=noteEditor?.cardId;if(modal.open&&!await closeModal())return;const result=await api(direction+'-input');await refresh();if(activeCase)await loadCase(activeCase.id,{activate:false});if(cardId){try{await openCard(cardId);}catch{}}renderUndo();notice((direction==='undo'?'Undid: ':'Redid: ')+result.label+'.');}
function renderAssistantSurface(){
  const services=libraryMode==='services',floating=services&&serviceChatOpen;
  $('chat-panel').hidden=libraryMode==='memory'||(services&&!floating);
  $('chat-panel').classList.toggle('floating-chat',services);
  $('chat-panel').setAttribute('role',floating?'dialog':'region');
  if(floating)$('chat-panel').setAttribute('aria-modal','false');else $('chat-panel').removeAttribute('aria-modal');
  $('service-chat-launcher').hidden=!services||floating;
  $('service-chat-launcher').setAttribute('aria-expanded',String(floating));
  $('service-chat-label').textContent=busy?'Answering…':'Ask assistant';
  $('expand-assistant').hidden=!floating;$('minimize-assistant').hidden=!floating;
  document.body.dataset.serviceChatOpen=String(floating);
}
async function pauseVoice(){if(voice.loading)voice.cancelPreparation();if(voice.listening)await voice.stop();$('voice-button').textContent='◉ Speak';}
function openServiceChat(origin){assistantReturnFocus=origin||document.activeElement;serviceChatOpen=true;renderAssistantSurface();if(busy)$('chat-panel').focus({preventScroll:true});else $('message').focus({preventScroll:true});}
async function closeServiceChat(){await pauseVoice();serviceChatOpen=false;renderAssistantSurface();const restore=assistantReturnFocus?.isConnected?assistantReturnFocus:$('service-chat-launcher');restore.focus({preventScroll:true});}
function renderLibraryMode(){
  const services=libraryMode==='services',memory=libraryMode==='memory',workspace=libraryMode==='workspace';
  document.body.dataset.view=libraryMode;$('workspace-grid').className='workspace-grid '+libraryMode+'-view';
  $('library-panel').hidden=workspace;$('workspace-heading').hidden=workspace;renderAssistantSurface();
  $('page-title').textContent=services?'Known services':'Manage memory';$('page-subtitle').textContent=services?'Find a contact or open Ask assistant for help without leaving the directory.':'Review saved messages, service feedback and document cards. Edit or delete what you no longer need.';
  $('library-title').textContent=services?'Service directory':'Memory library';$('view-label').textContent=services?'KNOWN SERVICES':memory?'MANAGE MEMORY':'WORKSPACE';
  $('file-count').textContent=services?(state?.services?.total||0)+' service cards':memory?'Saved information':'Chat';
  $('document-filter').hidden=!memory;$('memory-kind-filter').hidden=!memory;$('category-filter').hidden=!services;$('library-source-note').hidden=!services;$('manage-files').hidden=!memory;$('add-memory').hidden=!memory;
  $('search').placeholder=services?'Search a service, place or phone number':'Search saved memory';
  document.querySelectorAll('[data-library-mode]').forEach(b=>{const active=b.dataset.libraryMode===libraryMode;b.classList.toggle('active',active);b.setAttribute('aria-current',active?'page':'false');});
}
async function changeLibraryMode(mode){if(!['workspace','services','memory'].includes(mode))return;const sequence=++navigationSequence;if(mode==='memory'||(mode==='services'&&libraryMode!=='services'))await pauseVoice();if(sequence!==navigationSequence)return;serviceChatOpen=false;libraryMode=mode;query='';category='';documentFilter='';memoryKind='all';includeArchived=false;offset=0;$('search').value='';$('document-filter').value='';$('category-filter').value='';$('memory-kind-filter').value='all';renderLibraryMode();await loadCards();}
async function refresh(){state=await api('snapshot');if(activeOwner&&activeOwner!==(state.account.profileId||'device')){caseFilter='';$('case-search').value='';}if(caseFilter)state.cases=await api('list-cases',{query:caseFilter});$('account-label').textContent=state.account.connected?state.account.label:'Connect ChatGPT';$('connection-dot').className='connection-dot '+(state.account.sharing?'online':'');$('workspace-label').textContent=state.workspace;$('version-label').textContent='Windows · version '+state.version;
  $('document-filter').innerHTML='<option value="">All sources</option>'+state.documents.map(d=>`<option value="${e(d.id)}">${e(d.filename)} (${d.card_count})</option>`).join('');if(documentFilter&&!state.documents.some(d=>d.id===documentFilter))documentFilter='';$('document-filter').value=documentFilter;
  $('category-filter').innerHTML='<option value="">All service categories</option>'+(state.serviceCategories||[]).map(c=>`<option value="${e(c)}">${e(c)}</option>`).join('');$('category-filter').value=category;renderLibraryMode();renderModel();renderCases();renderUndo();await loadCards();const identity=state.account.profileId||'device';if(!activeCase||activeOwner!==identity){activeCase=null;activeOwner=identity;await loadCase(state.active_case.id,{activate:false});}else if(activeCase.id===state.active_case.id){activeCase={...activeCase,...state.active_case};renderCaseTitle();}}
async function loadCards(){const sequence=++cardLoadSequence;if(libraryMode==='workspace')return;
  const services=libraryMode==='services';
  const result=await api(services?'list-cards':'list-memory',services?{query,collection:'services',category,limit:30,offset}:{query,document_id:documentFilter||null,kind:memoryKind,include_archived:includeArchived,limit:30,offset});if(sequence!==cardLoadSequence)return;
  $('card-count').textContent=result.total+(services?' service'+(result.total===1?'':'s'):' saved item'+(result.total===1?'':'s'))+(includeArchived?' · including previous rows':'');
  $('cards').className='cards-scroll '+(services?'service-rows':'memory-records');
  $('cards').innerHTML=result.items.length?result.items.map(services?serviceRowHTML:memoryRowHTML).join(''):`<div class="empty-library"><div class="empty-symbol">▤</div><h3>${query||category||documentFilter||memoryKind!=='all'?'No matching items':'No saved memory yet'}</h3><p>${query||category||documentFilter||memoryKind!=='all'?'Try a shorter keyword or change the filter.':'Your messages, notes and imported information appear here automatically. You can edit or delete them at any time.'}</p>${services||query||documentFilter||memoryKind!=='all'?'':button('sample','Try a fictional sample','quiet')}</div>`;
  $('paging').innerHTML=result.total>30?button('previous','← Previous','quiet',offset===0?'disabled':'')+`<span>${offset+1}–${Math.min(offset+30,result.total)} of ${result.total}</span>`+button('next','Next →','quiet',offset+30>=result.total?'disabled':''):'';
}
function shell(){
  $('app').innerHTML=`<aside class="sidebar"><div class="brand"><img class="brand-mark" src="care-navigation-logo.png" alt=""><div><strong>Care Navigation Support</strong><span>Personal assistant</span></div></div><nav>${button('workspace','◫ &nbsp; Workspace','nav-item active','data-library-mode="workspace"')}${button('known-services','▤ &nbsp; Known services','nav-item','data-library-mode="services"')}${button('manage-memory','▧ &nbsp; Manage memory','nav-item','data-library-mode="memory"')}</nav>${inputTools()}<section class="case-sidebar"><div class="case-sidebar-heading"><h2>Case chats</h2>${button('new-chat','＋ New topic','quiet')}</div><label class="sr-only" for="case-search">Search case chats</label><input id="case-search" placeholder="Search all cases"><div id="case-list" class="case-list"></div></section><div class="sidebar-bottom">${button('settings','Connection & backup','nav-item')}<span class="version" id="version-label">Windows · version 2.10</span></div></aside>
  <div class="main"><header class="topbar"><div class="crumb"><b id="view-label">WORKSPACE</b><span> / </span><span id="file-count">Chat</span></div>${button('settings','<i id="connection-dot" class="connection-dot"></i><span id="account-label">Connect ChatGPT</span><span class="chevron">⌄</span>','account-button')}</header>
  <div class="workspace-heading" id="workspace-heading" hidden><div><h1 id="page-title">Workspace</h1><p id="page-subtitle"></p></div><button id="service-chat-launcher" class="service-chat-launcher" data-action="open-service-chat" aria-label="Open assistant chat" aria-controls="chat-panel" aria-haspopup="dialog" aria-expanded="false" hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M20 11.5a8 8 0 0 1-8 8H5l-4 3V11.5a9.5 9.5 0 1 1 19 0Z" transform="translate(1 -1) scale(.95)"/><path d="M7 9h9M7 13h6"/></svg><span id="service-chat-label">Ask assistant</span></button></div>
  <div class="workspace-grid workspace-view" id="workspace-grid"><section class="library-panel" id="library-panel" hidden><div class="panel-heading"><div><h2 id="library-title">Memory library</h2><span id="card-count" class="subtle"></span></div><div class="library-heading-actions">${button('new-note','Add memory','secondary','id="add-memory" hidden')}${button('documents','Manage files','quiet','id="manage-files" hidden')}</div></div><div class="library-tools"><label class="search"><span>⌕</span><input id="search" placeholder="Search saved memory" aria-label="Search saved cards"></label><select id="category-filter" aria-label="Filter services by category" hidden></select><select id="document-filter" aria-label="Filter by source" hidden></select><select id="memory-kind-filter" aria-label="Filter memory type" hidden><option value="all">All memory</option><option value="notes">Messages & personal notes</option><option value="feedback">Feedback & card notes</option><option value="chats">Saved case chats</option><option value="documents">Document cards</option></select><p class="library-source-note" id="library-source-note" hidden>Public service research · confirm current eligibility and capacity.</p></div><div id="cards" class="cards-scroll"></div><div id="paging" class="paging"></div></section>
  <section class="chat-panel" id="chat-panel" aria-labelledby="assistant-title" tabindex="-1"><div class="panel-heading"><div><h2 id="assistant-title">Ask your assistant</h2><span class="subtle" id="workspace-label"></span><span class="model-status" id="model-status"></span></div><div class="chat-header-actions">${button('case-options','Case options','quiet','id="case-options-button" hidden')}${button('new-chat','New topic','secondary')}${button('expand-assistant','Open Workspace ↗','quiet','id="expand-assistant" hidden')}${button('minimize-assistant','×','icon-button','id="minimize-assistant" aria-label="Minimize assistant" hidden')}</div></div><div id="messages" class="messages"></div><div id="selected-context"></div><div id="case-archived-banner" class="case-archived-banner" hidden></div><form id="composer" class="composer"><label for="message" class="sr-only">Your message</label><textarea id="message" rows="3" placeholder="Ask about a service or document, or tell me what to remember…"></textarea><div class="composer-controls"><span class="automatic-memory">Messages save automatically to your memory.</span><div class="composer-actions">${button('import','＋ &nbsp; Add a document','secondary','id="add-document"')}${button('voice','◉ &nbsp; Speak','secondary','id="voice-button"')}${button('send','Send ↑','primary','id="send-button"')}</div></div><div class="composer-help" id="voice-status">Review, edit or delete saved information in Manage memory.</div></form><p class="privacy-line">AI questions send relevant text to OpenAI. Keep patient names and identifiers out.</p></section></div></div>`;
  $('case-search').addEventListener('input',()=>{caseFilter=$('case-search').value;const current=caseFilter;clearTimeout(renderCases.searchTimer);renderCases.searchTimer=setTimeout(async()=>{try{const results=await api('list-cases',{query:current});if(current===caseFilter){state.cases=results;renderCases();}}catch(error){fail(error);}},120);});$('message').addEventListener('input',scheduleCaseDraft);
  $('messages').addEventListener('input',event=>rememberFeedbackDraft(event.target));
  $('messages').addEventListener('change',event=>rememberFeedbackDraft(event.target));
  $('search').addEventListener('input',()=>{query=$('search').value;offset=0;clearTimeout(shell.searchTimer);shell.searchTimer=setTimeout(()=>loadCards().catch(fail),150);});
  $('document-filter').addEventListener('change',()=>{documentFilter=$('document-filter').value;includeArchived=false;offset=0;loadCards().catch(fail);});
  $('category-filter').addEventListener('change',()=>{category=$('category-filter').value;offset=0;loadCards().catch(fail);});
  $('memory-kind-filter').addEventListener('change',()=>{memoryKind=$('memory-kind-filter').value;offset=0;loadCards().catch(fail);});
  $('composer').addEventListener('submit',event=>{event.preventDefault();sendMessage().catch(fail);});
  $('message').addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendMessage().catch(fail);}});
  renderLibraryMode();renderMessages();
}
function renderMessages(forceScroll=false){
  const viewport=$('messages'),follow=forceScroll||viewport.scrollHeight-viewport.scrollTop-viewport.clientHeight<80,previous=viewport.scrollTop;
  viewport.innerHTML=(caseHasMore?button('earlier-messages','↑ Earlier messages','quiet earlier-messages'):'')+(messages.length?messages.map((m,index)=>{
    if (m.followup) return renderChatFollowup(m);
    const pending=m.role==='assistant'&&busy&&index===messages.length-1&&!m.source;
    const cardsOnly=Boolean(m.cards?.length)&&m.role==='assistant'&&!m.error&&(m.presentation==='service-options'||!m.presentation&&!m.calculations?.length&&m.cards?.some(isService));
    const answer=pending?'<div class="answer-summary answer-pending" role="status">Finding the useful details…</div>':cardsOnly?'':`<div class="${m.role==='assistant'?'answer-summary'+(m.error?' answer-error':''):'message-text'}">${textHTML(m.text||'No answer is available. Please retry.')}</div>`;
    return `<article class="message ${m.role}" data-message-sequence="${m.sequence||''}"><div class="message-label">${m.role==='user'?'YOU':'ASSISTANT'}${m.source?`<span>${e(m.source==='chatgpt'?'ChatGPT':m.source==='local'?'Saved information':m.source==='error'?'Connection interrupted':m.source)}</span>`:''}${m.saved?'<span class="saved-marker">Saved to memory</span>':''}</div>${answer}${!pending&&m.cards?.length?`<div class="answer-cards">${m.cards.map(c=>answerCardHTML(c,m)).join('')}</div>`:''}${!pending&&m.calculations?.length?`<div class="calculation-proof">${m.calculations.map(c=>`<div>Calculated from ${e(c.matched_rows)} matching row(s) · ${e(c.operation)}${c.column?' of '+e(c.column):''}${c.value!==undefined?' = '+e(c.value??'No numeric values'):''}</div>`).join('')}</div>`:''}${m.role==='assistant'&&m.error?button('retry','Retry question','quiet',`data-index="${index}"`):''}</article>`;
  }).join(''):`<div class="chat-welcome"><img class="welcome-icon" src="care-navigation-logo.png" alt=""><h2>A clearer way to work<br>with your information.</h2><p>Ask a question, add a document, or keep a case conversation for later.</p><div class="prompt-chips">${button('prompt','Find a local service','prompt',`data-prompt="Find transportation services in North York. Show the service cards and contact details."`)}${button('prompt','Summarize a document','prompt',`data-prompt="Summarize my latest imported document. Highlight anything I should follow up on."`)}${button('prompt','Recall my notes','prompt',`data-prompt="What have I saved in my personal notes? Show the matching cards."`)}</div><small>Use a non-identifying case title. Saved conversations are available in Case chats.</small></div>`);
  updateFollowupControls();
  if(forceScroll){const last=viewport.querySelector('.message:last-child');viewport.scrollTo({top:last?last.getBoundingClientRect().top-viewport.getBoundingClientRect().top+viewport.scrollTop:viewport.scrollHeight,behavior:'instant'});}else viewport.scrollTop=follow?viewport.scrollHeight:previous;
}
function setBusy(value){busy=value;$('send-button').textContent=value?'Stop':'Send ↑';$('message').disabled=value||caseChanging;$('add-document').disabled=value||caseChanging||importing;$('voice-button').disabled=value||caseChanging;renderAssistantSurface();renderUndo();updateFollowupControls();}
async function sendMessage(retryText=null,retryTurnId=null){
  if(busy){await api('stop');return;}if(caseChanging)return;
  setBusy(true);let response=null;
  try{
    if(voice.listening)await voice.stop();
    const text=(retryText||$('message').value).trim();if(!text)return;
    if(activeCase?.status==='archived')throw new Error('Reopen this saved case to continue.');
    await flushCaseDraft();const remember=!retryText;
    messages.push({role:'user',text});response={role:'assistant',text:''};messages.push(response);$('message').value='';renderMessages(true);
    const answer=await api('chat',{text,remember,case_id:activeCase?.id,retry_turn_id:retryTurnId,card_id:selected?.id||null});Object.assign(response,answer);response.error=answer.source==='error';await refresh();
  }catch(error){if(response){response.text=error.message;response.error=true;response.source='error';}else fail(error);}
  finally{if(response&&response.turn_id&&activeCase){try{const result=await api('get-case',{id:activeCase.id});activeCase=result;caseHasMore=result.has_more;messages=result.messages.map(fromCaseMessage);renderCaseTitle();}catch{}}setBusy(false);renderMessages(true);$('message').focus();}
}
function context(){ $('selected-context').innerHTML=selected?`<div class="context-chip ${isService(selected)?'service-context':''}"><div class="context-main"><span>Working with <strong>${e(selected.title)}</strong><small>Your messages save as notes on this card.</small></span>${button('clear-selection','×','icon-button','aria-label="Stop working with this card"')}</div>${isService(selected)?`<div class="context-actions"><span>After following up:</span>${resultButtons(selected.id)}</div>`:''}</div>`:'';}
function resultButtons(id){return button('record-service-result','✓ Worked','secondary result-choice',`data-id="${e(id)}" data-outcome="worked"`)+button('record-service-result',"Didn't work",'secondary result-choice',`data-id="${e(id)}" data-outcome="not_worked"`);}
function resultDraft(){return feedbackEditor?{outcome:feedbackEditor.outcome,rating:$('result-rating')?.value||'',body:$('result-note')?.value||''}:null;}
function discardResult(){return !feedbackEditor||JSON.stringify(resultDraft())===feedbackEditor.initial||confirm('Discard this unsaved service result? Choose Cancel to keep editing.');}
async function openModal(content,kind=''){if(feedbackSaving)throw new Error('Wait for the service result to finish saving.');if(!discardResult())throw new Error('Save the result or choose Cancel result before leaving.');await flushNote();noteEditor=null;feedbackEditor=null;modal.className=kind;modal.innerHTML=content;if(!modal.open)modal.showModal();}
function modalHead(title,subtitle=''){return`<div class="modal-heading"><div><h2 id="modal-title">${e(title)}</h2>${subtitle?`<p>${e(subtitle)}</p>`:''}</div>${button('close-modal','×','icon-button','aria-label="Close panel"')}</div>`;}
async function closeModal(){if(feedbackSaving)throw new Error('Wait for the service result to finish saving.');if(!discardResult())return false;await flushNote();noteEditor=null;feedbackEditor=null;modal.close();modal.replaceChildren();return true;}
async function openCard(id, {replyId=null}={}){
  await flushNote();const card=await api('get-card',{id}),service=isService(card),hasResults=service||card.comments.some(note=>note.outcome);if(card.case_info){if(modal.open&&!await closeModal())return;await loadCase(card.case_info.id,{activate:false});await changeLibraryMode('workspace');return;}
  const notes=`<section class="detail-section ${service?'service-history':''}" id="card-history"><div class="section-title"><h3>${service?'Your notes & results':'Your notes & corrections'}</h3><span class="subtle">Saved on this card</span>${service?button('focus-card-note','Add a note','quiet'):''}</div>${hasResults?`<div id="service-experience">${experienceHTML(card.experience)}</div><p class="subtle history-help">Your observations and ratings, kept with this service.</p><p id="service-history-status" class="saved-status" role="status"></p>`:''}${inputTools()}<div id="card-notes">${notesHTML(card.comments)}</div><div id="card-note-editor" ${service?'hidden':''}><label class="sr-only" for="card-note">Add a note or correction</label><textarea id="card-note" rows="2" maxlength="12000" placeholder="Add a note. Your words stay with this card."></textarea><div class="note-status"><span id="note-status">Notes save automatically when you pause.</span>${button('new-card-note','New note','quiet')}</div></div></section>`;
  const contacts=`<section class="detail-section" id="service-contacts" tabindex="-1"><div class="section-title"><h3>${service?'Contact & follow up':'Contacts in the source'}</h3>${service?`<span id="service-use-state" class="subtle">${selected?.id===card.id?'Selected service':'Choose this service using the button below'}</span>`:''}</div>${card.contacts?.map(contact=>`<div class="contact-row"><div><strong>${e(contact.name||'Listed '+contact.kind)}</strong><span>${e(contact.value)}</span></div>${button('copy-contact','Copy','quiet',`data-id="${e(card.id)}" data-value="${e(contact.value)}"`)}</div>`).join('')||'<p class="subtle">Use the provider page to confirm the contact details.</p>'}${service?`<div class="service-result-prompt"><div><strong>Did this service work?</strong><p>Record what happened after following up.</p></div><div class="result-buttons">${resultButtons(card.id)}</div></div>`:''}${hasResults?'<div id="service-result-editor" hidden></div>':''}</section>`;
  const fields=Object.keys(card.fields||{}).length?`<dl class="field-list" id="card-fields">${Object.entries(card.fields).map(([key,value])=>`<div><dt>${e(key)}</dt><dd>${e(value)}</dd></div>`).join('')}</dl>`:`<div class="source-text">${textHTML(card.body)}</div>`;
  const links=card.links?.length?`<section class="detail-section"><h3>Source links</h3>${card.links.map(url=>button('open-link',e(url)+' ↗','source-link',`data-url="${e(url)}"`)).join('')}</section>`:'';
  const useFromChat = replyId ? button('use-service-from-details','Use this service','primary',
    `data-id="${e(card.id)}" data-reply-id="${e(replyId)}"`) : '';
  const pick = useFromChat || button('select-service',selected?.id===card.id?'Selected service ✓':'Select this service','primary',`data-id="${e(card.id)}"`);
  const footer=service?pick+button('use-card','Ask more about this card','secondary',`data-id="${e(card.id)}"`)+button('open-link','Provider page ↗','secondary',`data-url="${e(card.fields['Provider page'])}"`):useFromChat+button('use-card','Ask about this card',useFromChat?'secondary':'primary',`data-id="${e(card.id)}"`)+button('focus-card-note','Add a note','secondary')+(card.document_id?button('open-original','Open original file ↗','secondary',`data-id="${e(card.document_id)}"`):button('edit-note','Edit note','secondary',`data-id="${e(card.id)}"`))+button('delete-card','Delete card','danger quiet',`data-id="${e(card.id)}"`);
  await openModal(modalHead(card.title,fileLabel(card))+`<div class="detail-body">${card.archived?'<p class="callout">This row was removed in a newer import. Its notes have been kept.</p>':''}${service?notes+contacts+fields:fields+(card.contacts?.length||hasResults?contacts:'')}${links}${service?'':notes}</div><div class="modal-footer">${footer}</div>`,'card-dialog');
  noteEditor={cardId:id,id:null,version:null,body:'',saved:'',queue:Promise.resolve()};
  renderUndo();$('card-note').addEventListener('input',()=>{noteEditor.body=$('card-note').value;$('note-status').textContent='Saving…';clearTimeout(noteTimer);noteTimer=setTimeout(()=>flushNote().catch(fail),800);});
}
function notesHTML(comments){return comments?.length?[...comments].sort((a,b)=>b.updated_at.localeCompare(a.updated_at)||b.id.localeCompare(a.id)).map(n=>`<div class="saved-note" data-note-id="${e(n.id)}">${resultBadge(n)}<p>${textHTML(n.body)}</p><div class="note-actions"><small>${e(date(n.updated_at))}</small>${button('edit-card-comment','Edit','quiet',`data-id="${e(n.id)}"`)}${button('delete-card-comment','Delete','quiet danger',`data-id="${e(n.id)}"`)}</div></div>`).join(''):'<p class="subtle no-notes">No notes yet.</p>';}
function updateCardHistory(card){$('card-notes').innerHTML=notesHTML(card.comments);if($('service-experience'))$('service-experience').innerHTML=experienceHTML(card.experience);}
async function startServiceResult(id,outcome=null,editId=null){
  if(busy)throw new Error('Wait for this answer or choose Stop before recording a result.');
  if(feedbackSaving)throw new Error('Wait for the current result to save.');
  if(!modal.open||noteEditor?.cardId!==id)await openCard(id);
  await flushNote();$('card-note-editor').hidden=true;const card=await api('get-card',{id}),note=editId?card.comments.find(n=>n.id===editId&&n.outcome):null;
  if(editId?!note:!isService(card))throw new Error('This service result is no longer available. Reopen the card.');
  if(feedbackEditor&&!discardResult())return;
  feedbackEditor={cardId:id,id:note?.id||null,version:note?.version||null,outcome:note?.outcome||outcome||null};
  $('service-result-editor').innerHTML=`<div class="result-editor-heading"><h3>${note?'Edit service result':'Record a service result'}</h3><small>Choose a result, then Save result.</small></div><fieldset class="result-outcomes"><legend>What happened?</legend>${button('choose-service-result','✓ Worked','secondary',`data-outcome="worked" aria-pressed="${feedbackEditor.outcome==='worked'}"`)}${button('choose-service-result',"Didn't work",'secondary',`data-outcome="not_worked" aria-pressed="${feedbackEditor.outcome==='not_worked'}"`)}</fieldset><label for="result-rating">Your rating (optional)<select id="result-rating"><option value="">No rating</option>${[1,2,3,4,5].map(n=>`<option value="${n}" ${note?.rating===n?'selected':''}>${n}/5${n===1?' · Poor':n===5?' · Excellent':''}</option>`).join('')}</select></label><label for="result-note">What happened? (optional)<textarea id="result-note" rows="3" maxlength="12000" placeholder="For example: no accessible vehicle for Tuesday, or the ride was completed.">${e(note?.body===resultLabel(note?.outcome)+'.'?'':note?.body||'')}</textarea></label><div class="result-editor-actions">${button('save-service-result',note?'Save changes':'Save result','primary','id="save-service-result"')}${button('cancel-service-result','Cancel result','quiet')}</div><p id="result-status" class="saved-status" role="status">This result has not been saved yet.</p>`;
  $('service-result-editor').hidden=false;feedbackEditor.initial=JSON.stringify(resultDraft());
  // A new result with a preselected outcome still needs an explicit save.
  if(!note)feedbackEditor.initial=JSON.stringify({outcome:null,rating:'',body:''});
  $('service-result-editor').scrollIntoView({block:'center',behavior:'instant'});$('result-note').focus({preventScroll:true});
}
async function saveServiceResult(){
  if(!feedbackEditor||feedbackSaving)return;const draft=resultDraft(),editor=feedbackEditor;
  if(!draft.outcome){$('result-status').textContent='Choose Worked or Didn’t work before saving.';return;}
  feedbackSaving=true;$('save-service-result').disabled=true;$('result-status').textContent='Saving…';
  try{await flushNote();await api('save-service-result',{card_id:editor.cardId,id:editor.id,expected_version:editor.version,outcome:draft.outcome,rating:draft.rating?Number(draft.rating):null,body:draft.body});feedbackEditor=null;$('service-result-editor').hidden=true;
    const card=await api('get-card',{id:editor.cardId});updateCardHistory(card);if(selected?.id===card.id){selected=card;context();}
    await refresh();feedbackSaving=false;$('service-history-status').textContent='✓ '+resultLabel(draft.outcome)+' saved on this service.';$('card-history').scrollIntoView({block:'start',behavior:'smooth'});notice('Service result saved. You can edit or delete it in the card or Manage memory.');
  }catch(error){$('result-status').textContent='Not saved: '+error.message;throw error;}finally{feedbackSaving=false;if($('save-service-result'))$('save-service-result').disabled=false;}
}
async function flushNote(){
  clearTimeout(noteTimer);const editor=noteEditor;if(!editor)return;
  editor.queue=editor.queue.catch(()=>{}).then(async()=>{
    if(!editor.body.trim()){if(editor===noteEditor&&$('note-status'))$('note-status').textContent=editor.id?'Earlier saved text is kept. Choose New note to start another.':'Write a note to save it automatically.';return;}
    if(editor.body===editor.saved)return;
    const body=editor.body;try{
      const result=await api('save-comment',{card_id:editor.cardId,body,id:editor.id,expected_version:editor.version});editor.id=result.id;editor.version=(editor.version||0)+1;editor.saved=body;
      if(editor===noteEditor){const card=await api('get-card',{id:editor.cardId});updateCardHistory(card);$('note-status').textContent='✓ Saved on this card';}
      await loadCards();
    }catch(error){if(editor===noteEditor)$('note-status').textContent='Not saved: '+error.message;throw error;}
  });await editor.queue;
}
async function importDocument(sample=false){
  if(busy||importing)return;importing=true;$('add-document').disabled=true;$('add-document').textContent='Reading document…';
  try{const result=await api(sample?'sample-document':'pick-document');if(result.cancelled)return;
    if(result.duplicate){libraryMode='workspace';category='';query='';$('search').value='';documentFilter=result.document_id;await refresh();$('document-filter').value=documentFilter;notice('This document is already saved. Open Manage memory to review its cards.');return;}
    preview=result;
    await openModal(modalHead('Review your document',result.filename)+`<div class="detail-body"><div class="import-count"><strong>${result.count}</strong><span>cards ready to save</span></div><p>The original file and extracted text will be kept on this computer. This import does not contact OpenAI.</p>${result.warnings.map(w=>`<p class="callout">${e(w)}</p>`).join('')}${result.previous?`<div class="callout"><strong>A document with this name is already saved.</strong><p>Save separately to keep both. ${result.previous.can_update?'Or update matching rows using their unique ID or name; attached notes are preserved. Removed rows become previous rows.':'This file has no safe unique row keys, so it will be kept as a separate version.'}</p></div>`:''}<h3>Preview · first ${result.preview.length} cards</h3><div class="import-preview">${result.preview.map(s=>`<div><strong>${e(s.title)}</strong><span>${e(s.locator)}</span><p>${e(s.body.slice(0,240))}</p></div>`).join('')}</div></div><div class="modal-footer">${button('save-import','Save '+result.count+' cards','primary')}${result.previous?.can_update?button('update-import','Update existing document','secondary'):''}${button('cancel-import','Cancel','quiet')}</div>`,'import-dialog');
  }finally{importing=false;$('add-document').disabled=busy;$('add-document').textContent='＋ Add a document';}
}
async function saveImport(update=false){if(!preview||importing)return;importing=true;modal.querySelectorAll('button').forEach(b=>b.disabled=true);
  try{const result=await api('confirm-import',{id:preview.id,update});libraryMode='workspace';category='';query='';$('search').value='';documentFilter=result.document_id;offset=0;preview=null;await closeModal();await refresh();$('document-filter').value=documentFilter;notice(result.updated?`${result.updated} matching cards updated. Notes kept.`:`${result.count} cards saved. You can ask about them now.`);$('message').focus();}
  finally{importing=false;modal.querySelectorAll('button').forEach(b=>b.disabled=false);}}
async function manageDocuments(){await refresh();await openModal(modalHead('Your documents','Originals and extracted cards stay on this computer.')+`<div class="detail-body document-list">${state.documents.length?state.documents.map(d=>`<article><div><strong>${e(d.filename)}</strong><p>${d.card_count} current cards · version ${d.version} · ${e(date(d.updated_at))}</p></div><div>${button('filter-document','Show cards','secondary',`data-id="${e(d.id)}"`)}${d.version>1?button('previous-rows','Include previous rows','quiet',`data-id="${e(d.id)}"`):''}${button('open-original','Open file ↗','quiet',`data-id="${e(d.id)}"`)}${button('delete-document','Delete','danger quiet',`data-id="${e(d.id)}"`)}</div></article>`).join(''):'<p>No documents imported yet.</p>'}</div>`);}
async function noteForm(id=null){const card=id?await api('get-card',{id}):null;await openModal(modalHead(id?'Edit saved memory':'Add memory','Keep useful details without importing a file.')+`<form id="note-form" class="detail-body"><label>Title<input id="note-title" maxlength="140" value="${e(card?.title||'')}" placeholder="A short, useful title"></label><label>Information to remember<textarea id="note-body" rows="9" maxlength="12000" required>${e(card?.body||'')}</textarea></label><div class="modal-footer">${button('save-personal-note','Save memory','primary',`data-id="${e(id||'')}" data-version="${card?.version||''}"`)}</div></form>`);$('note-body').focus();}
async function editMemory(target){
  const card=await api('get-card',{id:target.dataset.cardId});if(card.case_info){await caseOptions(card.case_info.id);return;}
  if(target.dataset.entryType==='comment'){
    const note=card.comments.find(n=>n.id===target.dataset.id);if(!note)throw new Error('This memory is no longer available. Refresh the list.');
    if(note.outcome){await startServiceResult(card.id,null,note.id);return;}
    await openModal(modalHead('Edit saved feedback',card.title)+`<form class="detail-body"><label>Saved information<textarea id="memory-comment-body" rows="8" maxlength="12000" required>${e(note.body)}</textarea></label><p class="subtle">This changes your saved note. The provider or document source stays intact.</p><div class="modal-footer">${button('save-memory-comment','Save changes','primary',`data-id="${e(note.id)}" data-card-id="${e(card.id)}" data-version="${note.version}"`)}</div></form>`);$('memory-comment-body').focus();
  }else if(card.document_id){await openCard(card.id);$('card-note').scrollIntoView({block:'center'});$('card-note').focus();}
  else await noteForm(card.id);
}
async function deleteMemory(target){
  const value=await api('get-card',{id:target.dataset.cardId});if(value.case_info){if(!confirm('Permanently delete this saved case and its chat history? Separate service notes and results stay.'))return;await api('delete-case',{id:value.case_info.id,expected_version:value.case_info.version});if(activeCase?.id===value.case_info.id)activeCase=null;await refresh();notice('Saved case history deleted.');return;}
  const comment=target.dataset.entryType==='comment';
  if(!confirm(comment?'Delete this saved note? Its service or source card will stay.':'Delete this saved card and its attached notes? This cannot be undone.'))return;
  await flushNote();
  await api(comment?'forget-comment':'forget-card',comment?{id:target.dataset.id,card_id:target.dataset.cardId}:{id:target.dataset.id});
  if(!comment&&selected?.id===target.dataset.cardId){selected=null;context();}
  await refresh();notice('Memory deleted. Future answers will use the remaining saved information.');
}
async function settings(){await refresh();const starter=state.account.connected?await api('starter-count'):{count:0};await openModal(modalHead('Connection & backup','One Windows app. Your own saved information.')+`<div class="detail-body settings-body"><section><h3>ChatGPT connection</h3><p><strong>${e(state.account.connected?state.account.label:'Connect your own ChatGPT account')}</strong></p><p>${state.account.sharing?'Plan permission is enabled. Send a question to verify this account can complete an answer.':'AI answers use an eligible ChatGPT account and its allowed plan usage. Sign-in opens the official OpenAI page in your browser. Account and app eligibility are decided by OpenAI.'}</p>${state.accountError?`<p class="callout">${e(state.accountError)}</p>`:''}<div class="button-row">${button('sign-in',state.account.connected?'Reconnect ChatGPT':'Continue with ChatGPT','primary')}${state.account.connected?button('sign-out','Sign out','secondary'):''}${button('add-account','Use a different account','quiet')}</div>${state.account.profiles.length?`<label class="saved-accounts">Saved connections<select id="saved-accounts"><option value="">Choose a saved connection…</option>${state.account.profiles.map(p=>`<option value="${e(p.id)}">${e(p.label)}${p.connected?'':' · reconnect'}</option>`).join('')}</select></label>`:''}<p class="subtle">This app cannot read your ChatGPT chat history or ChatGPT Memory. It keeps its own document cards. There is no shared team database.</p>${state.account.sharing?button('load-models','Choose an available AI model','quiet'):''}<div id="model-picker"></div></section>
    ${starter.count?`<section class="callout"><h3>${starter.count} saved starter items on this computer</h3><p>These cards or service notes were saved before sign-in. Copy them into this account to use them with ChatGPT.</p>${button('copy-starter','Copy starter cards into this account','secondary')}</section>`:''}
    <section><h3>Private memory backup</h3><p>Back up all cards, extracted information and notes. Restore the backup on another Windows computer. Original files and ChatGPT credentials are not included. Keep the backup private.</p><div class="button-row">${button('export','Save a backup','secondary')}${button('restore','Restore a backup','secondary')}</div><p class="subtle">Saved records use the Windows app-data folder. The database and exported backups are not encrypted by the app. Account credentials use Windows protected storage. Signing out hides that account’s cards but keeps them for reconnecting.</p></section><section><h3>What works without ChatGPT</h3><p>Import Excel, CSV, TSV, Word, text PDFs and text files. Search cards, open contacts, add notes and back up your memory. AI answers need internet and an eligible ChatGPT connection.</p><p class="subtle">Version ${e(state.version)} · Windows 10/11 (64-bit). This pilot installer is unsigned; organization approval is needed before Southlake rollout.</p></section></div>`,'settings-dialog');
  $('saved-accounts')?.addEventListener('change',async event=>{if(!event.target.value)return;try{await flushNote();await flushCaseDraft();const result=await api('select-account',{id:event.target.value});state=result;messages=[];selected=null;context();renderMessages();await settings();}catch(error){fail(error);}});
}
async function signIn(addAccount=false){if(connectionBusy)return;await flushNote();await flushCaseDraft();connectionBusy=true;await openModal(modalHead('Continue in your browser','Sign in on the official OpenAI page, then return to the app.')+`<div class="detail-body"><p>The app is waiting for the sign-in response. Your password stays with OpenAI.</p>${button('cancel-sign-in','Cancel sign-in','secondary')}</div>`);
  try{await api('sign-in',{addAccount,enablePlan:true});messages=[];selected=null;context();renderMessages();await refresh();await settings();notice('Connection updated. Your account has its own saved cards.');}
  catch(error){notice(error.message,true);await settings();}finally{connectionBusy=false;}}
const voice=new Voice({status:text=>{if($('voice-status'))$('voice-status').textContent=text;},transcript:text=>{if($('message'))$('message').value=[voicePrefix,text].filter(Boolean).join(' ');}});
function fail(error){notice(error.message||String(error),true);}
document.addEventListener('click',async event=>{const target=event.target.closest('[data-action]');if(!target)return;event.preventDefault();const action=target.dataset.action;
  if(caseChanging && ['open-case','case-options','settings','archive-case','delete-case','reopen-case'].includes(action))return;
  try{
    if(action==='send')await sendMessage();
    else if(action==='open-case'){const navigation=navigationSequence;await loadCase(target.dataset.id);if(navigation===navigationSequence)await changeLibraryMode('workspace');await refresh();}
    else if(action==='case-options')await caseOptions(target.dataset.id||activeCase?.id);
    else if(action==='rename-case'){await api('rename-case',{id:target.dataset.id,title:$('case-title-input').value,expected_version:Number(target.dataset.version)});await closeModal();await refresh();notice('Case title updated.');}
    else if(action==='archive-case'||action==='delete-case'){const id=target.dataset.id;if(action==='delete-case'&&!confirm('Permanently delete this case, its conversation and its automatically saved messages? Separate service results and notes stay. This cannot be undone.'))return;await flushCaseDraft();await api(action,{id,expected_version:Number(target.dataset.version)});await closeModal();if(activeCase?.id===id){activeCase=null;selected=null;messages=[];context();}await refresh();notice(action==='archive-case'?'Conversation saved in Manage memory.':'Case and automatically saved messages deleted.');}
    else if(action==='reopen-case'){if(modal.open&&!await closeModal())return;await api('reopen-case',{id:target.dataset.id});await loadCase(target.dataset.id);await changeLibraryMode('workspace');await refresh();}
    else if(action==='undo-input'||action==='redo-input')await applyInputHistory(action==='undo-input'?'undo':'redo');
    else if(action==='earlier-messages'){if(busy)throw new Error('Wait for the answer or choose Stop.');const view=$('messages'),height=view.scrollHeight,top=view.scrollTop,result=await api('get-case',{id:activeCase.id,before:messages[0]?.sequence});const known=new Set(messages.map(m=>m.id));messages=[...result.messages.filter(m=>!known.has(m.id)).map(fromCaseMessage),...messages];caseHasMore=result.has_more;renderMessages();view.scrollTop=top+view.scrollHeight-height;}
    else if(action==='workspace'){await changeLibraryMode('workspace');}
    else if(action==='known-services'){await changeLibraryMode('services');}
    else if(action==='manage-memory'){await changeLibraryMode('memory');}
    else if(action==='open-service-chat'){openServiceChat(target);}
    else if(action==='minimize-assistant'){await closeServiceChat();}
    else if(action==='expand-assistant'){await changeLibraryMode('workspace');$('message').focus({preventScroll:true});}
    else if(action==='edit-memory')await editMemory(target);
    else if(action==='delete-memory')await deleteMemory(target);
    else if(action==='save-memory-comment'){await api('save-comment',{id:target.dataset.id,card_id:target.dataset.cardId,expected_version:Number(target.dataset.version),body:$('memory-comment-body').value});await closeModal();await refresh();notice('Memory updated. Future answers will use the revised note.');}
    else if(action==='settings')await settings();
    else if(action==='import')await importDocument();
    else if(action==='sample')await importDocument(true);
    else if(action==='save-import')await saveImport();
    else if(action==='update-import')await saveImport(true);
    else if(action==='cancel-import'){await api('cancel-import');preview=null;await closeModal();}
    else if(action==='close-modal')await closeModal();
    else if(action==='chat-followup-start'||action==='chat-followup-step')await actOnFollowup(action,target);
    else if(action==='chat-followup-options')showFollowupOptions(target);
    else if(action==='use-service-from-details'){
      if(!caseChanging&&!busy&&await closeModal())await actOnFollowup('chat-followup-start',target);
    }
    else if(action==='open-card')await openCard(target.dataset.id,{replyId:target.dataset.replyId});
    else if(action==='select-service'){if(busy)throw new Error('Wait for the answer or choose Stop before selecting a service.');$('service-use-state').textContent='Selecting service…';await flushNote();selected=await api('get-card',{id:target.dataset.id});context();await flushCaseDraft();$('card-note-editor').hidden=true;target.textContent='Selected service ✓';$('service-use-state').textContent='Selected service';$('service-contacts').scrollIntoView({block:'start',behavior:'smooth'});$('service-contacts').focus({preventScroll:true});notice('Service selected. Use the contact details, then record whether it worked.');}
    else if(action==='record-service-result')await startServiceResult(target.dataset.id,target.dataset.outcome);
    else if(action==='choose-service-result'){if(feedbackSaving)return;feedbackEditor.outcome=target.dataset.outcome;document.querySelectorAll('.result-outcomes [data-outcome]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.outcome===feedbackEditor.outcome)));}
    else if(action==='save-service-result')await saveServiceResult();
    else if(action==='cancel-service-result'){if(feedbackSaving)return;if(!discardResult())return;feedbackEditor=null;$('service-result-editor').hidden=true;}
    else if(action==='clear-selection'){selected=null;context();await flushCaseDraft();}
    else if(action==='focus-card-note'){$('card-note-editor').hidden=false;$('card-note').scrollIntoView({block:'center',behavior:'smooth'});$('card-note').focus({preventScroll:true});}
    else if(action==='use-card'||action==='ask-service'){if(busy)throw new Error('Wait for this answer or choose Stop before switching cards.');const id=target.dataset.id,sequence=navigationSequence;if(modal.open&&!await closeModal())return;const card=await api('get-card',{id});if(sequence!==navigationSequence)return;selected=card;context();await flushCaseDraft();if(sequence!==navigationSequence)return;if(libraryMode==='memory')await changeLibraryMode('workspace');if(libraryMode==='services')openServiceChat(target);else if(libraryMode==='workspace')$('message').focus({preventScroll:true});}
    else if(action==='new-card-note'){await flushNote();$('card-note-editor').hidden=false;noteEditor={cardId:noteEditor.cardId,id:null,version:null,body:'',saved:'',queue:Promise.resolve()};$('card-note').value='';$('note-status').textContent='Notes save automatically when you pause.';$('card-note').focus();}
    else if(action==='edit-card-comment'){await flushNote();const card=await api('get-card',{id:noteEditor.cardId}),note=card.comments.find(n=>n.id===target.dataset.id);if(!note)throw new Error('This note is no longer available.');if(note.outcome){await startServiceResult(card.id,null,note.id);return;}noteEditor={cardId:card.id,id:note.id,version:note.version,body:note.body,saved:note.body,queue:Promise.resolve()};$('card-note-editor').hidden=false;$('card-note').value=note.body;$('note-status').textContent='Editing saved note. Changes save when you pause.';$('card-note').focus();}
    else if(action==='delete-card-comment'){if(feedbackEditor?.id===target.dataset.id){notice('Finish or cancel editing this result before deleting it.',true);return;}if(!confirm('Delete this saved note or result? This cannot be undone.'))return;await flushNote();const cardId=noteEditor.cardId;await api('forget-comment',{id:target.dataset.id,card_id:cardId});if(noteEditor.id===target.dataset.id){noteEditor={cardId,id:null,version:null,body:'',saved:'',queue:Promise.resolve()};$('card-note').value='';}updateCardHistory(await api('get-card',{id:cardId}));$('note-status').textContent='Note or result deleted.';if($('service-history-status'))$('service-history-status').textContent='Saved note or result deleted.';await refresh();}
    else if(action==='documents')await manageDocuments();
    else if(action==='filter-document'||action==='previous-rows'){libraryMode='memory';documentFilter=target.dataset.id;includeArchived=action==='previous-rows';offset=0;await closeModal();$('document-filter').value=documentFilter;renderLibraryMode();await loadCards();}
    else if(action==='open-original')await api('open-original',{id:target.dataset.id});
    else if(action==='open-link')await api('open-link',{url:target.dataset.url});
    else if(action==='copy-contact'){await api('copy-contact',{id:target.dataset.id,value:target.dataset.value});notice('Contact copied.');}
    else if(action==='new-chat')await newCase();
    else if(action==='new-note')await noteForm();
    else if(action==='edit-note')await noteForm(target.dataset.id);
    else if(action==='save-personal-note'){await api('save-note',{id:target.dataset.id||null,expected_version:Number(target.dataset.version)||null,title:$('note-title').value,body:$('note-body').value});await closeModal();await refresh();notice('Memory saved. Future answers will use the updated information.');}
    else if(action==='delete-card'){if(!confirm('Delete this card and its attached notes? This cannot be undone.'))return;await flushNote();await api('forget-card',{id:target.dataset.id});await closeModal();if(selected?.id===target.dataset.id){selected=null;context();}await refresh();notice('Card deleted.');}
    else if(action==='delete-document'){if(!confirm('Delete this imported document, its cards and their notes? This cannot be undone.'))return;await api('forget-document',{id:target.dataset.id});if(documentFilter===target.dataset.id){documentFilter='';offset=0;}await manageDocuments();await refresh();}
    else if(action==='sign-in')await signIn();
    else if(action==='add-account')await signIn(true);
    else if(action==='cancel-sign-in')await api('cancel-sign-in');
    else if(action==='sign-out'){await flushNote();await flushCaseDraft();const result=await api('sign-out');messages=[];selected=null;context();renderMessages();await settings();if(!result.revocationConfirmed)notice('Signed out on this computer. OpenAI could not confirm remote token revocation.',true);}
    else if(action==='load-models'){const result=await api('models');state.models=result;renderModel();$('model-picker').innerHTML=`<select id="model-select" aria-label="AI model">${result.items.map(m=>`<option value="${e(m.id)}" ${m.id===result.selected?'selected':''}>${e(m.name)}</option>`).join('')}</select>`;$('model-select').onchange=async event=>{try{state.models=await api('select-model',{id:event.target.value});renderModel();}catch(error){fail(error);}};}
    else if(action==='copy-starter'){const result=await api('copy-starter');notice(result.added+' cards copied into this account.');await settings();}
    else if(action==='export'){await flushNote();await flushCaseDraft();const result=await api('export');if(result.exported)notice('Private memory backup saved.');}
    else if(action==='restore'){const result=await api('restore');if(result.restored){notice(result.added+' cards and '+result.notes_added+' notes restored. Existing matching records were kept.');await settings();}}
    else if(action==='prompt'){$('message').value=target.dataset.prompt;$('message').focus();}
    else if(action==='retry'){const index=Number(target.dataset.index),previous=messages[index-1];if(previous?.role==='user')await sendMessage(previous.text,messages[index].id);}
    else if(action==='next'){offset+=30;await loadCards();}
    else if(action==='previous'){offset=Math.max(0,offset-30);await loadCards();}
    else if(action==='voice'){
      if(voice.loading){voice.cancelPreparation();return;}
      if(voice.listening){await voice.stop();$('voice-button').textContent='◉ Speak';}
      else{voicePrefix=$('message').value.trim();$('voice-button').textContent='Cancel voice';try{await voice.start();$('voice-button').textContent='■ Stop listening';}catch(error){$('voice-button').textContent='◉ Retry voice';throw error;}}
    }
  }catch(error){fail(error);}
});
document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&!event.target.closest('input,textarea,[contenteditable=true]')&&['z','y'].includes(event.key.toLowerCase())){event.preventDefault();applyInputHistory(event.key.toLowerCase()==='y'||event.shiftKey?'redo':'undo').catch(fail);}if(event.key==='Escape'&&libraryMode==='services'&&serviceChatOpen&&!modal.open){event.preventDefault();closeServiceChat().catch(fail);}});
modal.addEventListener('cancel',event=>{event.preventDefault();closeModal().catch(fail);});
window.hive.subscribe(event=>{
  if(event.type==='delta'){const last=messages.at(-1);if(last?.role==='assistant'&&busy)last.text+=event.value;}
  if(event.type==='message-kept'){const lastUser=messages.findLast(m=>m.role==='user');if(lastUser)lastUser.saved=true;}
  if(event.type==='memory-changed'){clearTimeout(refresh.timer);refresh.timer=setTimeout(()=>refresh().catch(fail),120);}
  if(event.type==='cases-changed'){clearTimeout(renderCases.timer);renderCases.timer=setTimeout(async()=>{try{if(state){state.cases=await api('list-cases',{query:caseFilter});renderCases();}}catch(error){fail(error);}},150);}
  if(event.type==='closing-requested'){
    (async()=>{try{if(feedbackSaving||caseChanging){notice('Wait for the current change to finish before closing.',true);return;}if(!discardResult())return;await flushNote();await flushCaseDraft();if(voice.listening)await voice.stop();await api('close-after-save');}catch(error){notice('The app stayed open because a note has not saved: '+error.message,true);}})();
  }
});
shell();refresh().then(()=>api('ui-ready')).catch(error=>{$('cards').innerHTML=`<p class="callout">${e(error.message)}</p>`;fail(error);});
