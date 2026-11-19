import { Voice } from './voice.mjs';
import { escapeHTML as e } from './render-text.mjs';
const api=(method,args={})=>window.hive.request(method,args),$=id=>document.getElementById(id);
let state,query='',documentFilter='',libraryMode='workspace',serviceChatOpen=false,assistantReturnFocus=null,memoryKind='all',category='',includeArchived=false,offset=0,messages=[],busy=false,importing=false,selected=null,preview=null,noteEditor=null,noteTimer,voicePrefix='',connectionBusy=false,cardLoadSequence=0;
const modal=$('modal');
const date=value=>{try{return new Date(value).toLocaleString('en-CA',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});}catch{return value;}};
const icon=name=>({file:'▤',chat:'◌',plus:'+',search:'⌕',arrow:'↗',close:'×',mic:'◉',check:'✓'}[name]||'');
function notice(text,error=false){$('notice').textContent=text;$('notice').className=error?'visible error':'visible';clearTimeout(notice.timer);notice.timer=setTimeout(()=>$('notice').className='',6500);}
function textHTML(text){return e(text).replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/\n/g,'<br>');}
function button(action,label,classes='',extra=''){return`<button class="${classes}" data-action="${action}" ${extra}>${label}</button>`;}
const isService=card=>card.source_format==='service-directory';
const fileLabel=card=>isService(card)?'Known service · '+(card.category||card.fields?.Category||'Public provider source'):card.filename?`${card.filename} · ${card.locator}`:card.kind==='message'?'Your saved message':'Your personal note';
function cardHTML(card,compact=false){const contact=card.contacts?.[0],service=isService(card);return`<button class="memory-card ${compact?'compact':''}" data-action="open-card" data-id="${e(card.id)}"><span class="card-kicker">${service?'KNOWN SERVICE'+(card.category?' · '+e(card.category):''):card.document_id?'SOURCE CARD':card.kind==='message'?'YOUR MESSAGE':'YOUR NOTE'}${card.archived?' · PREVIOUS ROW':''}</span><strong>${e(card.title)}</strong><span class="card-excerpt">${e((service?card.body?.split('\n')[0]:card.body)?.slice(0,160)||'')}</span>${contact?`<span class="card-contact">${contact.name?e(contact.name)+' · ':''}${e(contact.value)}</span>`:''}<span class="card-footer"><span>${service?'Public provider source':e(card.filename||'Personal memory')}${!service&&card.locator?' · '+e(card.locator):''}</span><span>${card.comment_count?e(card.comment_count)+' note'+(card.comment_count===1?'':'s'):'Open →'}</span></span></button>`;}
function renderModel(){const selected=state?.models?.selected,item=state?.models?.items?.find(m=>m.id===selected);$('model-status').textContent=selected?'AI model: '+(item?.name||selected):state?.account.sharing?'ChatGPT · model selected when you ask':'Connect ChatGPT for AI answers';}
function serviceRowHTML(card){const contact=card.contacts?.[0];return `<article class="service-row" data-service-id="${e(card.id)}"><div class="service-row-info"><span class="card-kicker">${e(card.category||'Known service')}</span>${button('open-card',e(card.title),'service-title',`data-id="${e(card.id)}"`)}<p>${e(card.body?.split('\n')[0]||'')}</p><span class="service-area">${e(card.area||'Confirm the service area with intake')}</span></div><div class="service-row-contact"><strong>${e(contact?.name||'Program contact')}</strong><span>${e(contact?.value||'See provider details')}</span>${card.comment_count?`<small>${card.comment_count} saved note${card.comment_count===1?'':'s'}</small>`:''}</div><div class="service-row-actions">${button('open-card','View details','secondary',`data-id="${e(card.id)}"`)}${button('ask-service','Ask assistant','quiet',`data-id="${e(card.id)}"`)}</div></article>`;}
function memoryRowHTML(item){const label=item.entry_type==='comment'?'Feedback & notes':item.document_id?'Document card':item.kind==='message'?'Saved message':'Personal memory';return `<article class="memory-record" data-memory-id="${e(item.id)}"><button class="memory-record-main" data-action="open-card" data-id="${e(item.card_id)}"><span class="card-kicker">${label}${item.archived?' · PREVIOUS ROW':''}</span><strong>${e(item.title)}</strong><p>${e(item.body)}</p><small>${e(item.filename||'Personal memory')} · ${e(date(item.updated_at))}</small></button><div class="memory-record-actions">${button('edit-memory',item.document_id&&item.entry_type==='card'?'Add correction':'Edit','secondary',`data-id="${e(item.id)}" data-card-id="${e(item.card_id)}" data-entry-type="${e(item.entry_type)}"`)}${button('delete-memory','Delete','quiet danger',`data-id="${e(item.id)}" data-card-id="${e(item.card_id)}" data-entry-type="${e(item.entry_type)}"`)}</div></article>`;}
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
async function changeLibraryMode(mode){if(!['workspace','services','memory'].includes(mode))return;if(mode==='memory'||(mode==='services'&&libraryMode!=='services'))await pauseVoice();serviceChatOpen=false;libraryMode=mode;query='';category='';documentFilter='';memoryKind='all';includeArchived=false;offset=0;$('search').value='';$('document-filter').value='';$('category-filter').value='';$('memory-kind-filter').value='all';renderLibraryMode();await loadCards();}
async function refresh(){state=await api('snapshot');$('account-label').textContent=state.account.connected?state.account.label:'Connect ChatGPT';$('connection-dot').className='connection-dot '+(state.account.sharing?'online':'');$('workspace-label').textContent=state.workspace;$('version-label').textContent='Windows · version '+state.version;
  $('document-filter').innerHTML='<option value="">All sources</option>'+state.documents.map(d=>`<option value="${e(d.id)}">${e(d.filename)} (${d.card_count})</option>`).join('');if(documentFilter&&!state.documents.some(d=>d.id===documentFilter))documentFilter='';$('document-filter').value=documentFilter;
  $('category-filter').innerHTML='<option value="">All service categories</option>'+(state.serviceCategories||[]).map(c=>`<option value="${e(c)}">${e(c)}</option>`).join('');$('category-filter').value=category;renderLibraryMode();renderModel();await loadCards();}
async function loadCards(){const sequence=++cardLoadSequence;if(libraryMode==='workspace')return;
  const services=libraryMode==='services';
  const result=await api(services?'list-cards':'list-memory',services?{query,collection:'services',category,limit:30,offset}:{query,document_id:documentFilter||null,kind:memoryKind,include_archived:includeArchived,limit:30,offset});if(sequence!==cardLoadSequence)return;
  $('card-count').textContent=result.total+(services?' service'+(result.total===1?'':'s'):' saved item'+(result.total===1?'':'s'))+(includeArchived?' · including previous rows':'');
  $('cards').className='cards-scroll '+(services?'service-rows':'memory-records');
  $('cards').innerHTML=result.items.length?result.items.map(services?serviceRowHTML:memoryRowHTML).join(''):`<div class="empty-library"><div class="empty-symbol">▤</div><h3>${query||category||documentFilter||memoryKind!=='all'?'No matching items':'No saved memory yet'}</h3><p>${query||category||documentFilter||memoryKind!=='all'?'Try a shorter keyword or change the filter.':'Your messages, notes and imported information appear here automatically. You can edit or delete them at any time.'}</p>${services||query||documentFilter||memoryKind!=='all'?'':button('sample','Try a fictional sample','quiet')}</div>`;
  $('paging').innerHTML=result.total>30?button('previous','← Previous','quiet',offset===0?'disabled':'')+`<span>${offset+1}–${Math.min(offset+30,result.total)} of ${result.total}</span>`+button('next','Next →','quiet',offset+30>=result.total?'disabled':''):'';
}
function shell(){
  $('app').innerHTML=`<aside class="sidebar"><div class="brand"><span class="brand-mark">S</span><div><strong>Southlake Care<br>Navigation Support</strong><span>Personal assistant</span></div></div><nav>${button('workspace','◫ &nbsp; Workspace','nav-item active','data-library-mode="workspace"')}${button('known-services','▤ &nbsp; Known services','nav-item','data-library-mode="services"')}${button('manage-memory','▧ &nbsp; Manage memory','nav-item','data-library-mode="memory"')}</nav><div class="sidebar-bottom">${button('settings','Connection & backup','nav-item')}<span class="version" id="version-label">Windows · version 2.4</span></div></aside>
  <div class="main"><header class="topbar"><div class="crumb"><b id="view-label">WORKSPACE</b><span> / </span><span id="file-count">Chat</span></div>${button('settings','<i id="connection-dot" class="connection-dot"></i><span id="account-label">Connect ChatGPT</span><span class="chevron">⌄</span>','account-button')}</header>
  <div class="workspace-heading" id="workspace-heading" hidden><div><h1 id="page-title">Workspace</h1><p id="page-subtitle"></p></div><button id="service-chat-launcher" class="service-chat-launcher" data-action="open-service-chat" aria-label="Open assistant chat" aria-controls="chat-panel" aria-haspopup="dialog" aria-expanded="false" hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M20 11.5a8 8 0 0 1-8 8H5l-4 3V11.5a9.5 9.5 0 1 1 19 0Z" transform="translate(1 -1) scale(.95)"/><path d="M7 9h9M7 13h6"/></svg><span id="service-chat-label">Ask assistant</span></button></div>
  <div class="workspace-grid workspace-view" id="workspace-grid"><section class="library-panel" id="library-panel" hidden><div class="panel-heading"><div><h2 id="library-title">Memory library</h2><span id="card-count" class="subtle"></span></div><div class="library-heading-actions">${button('new-note','Add memory','secondary','id="add-memory" hidden')}${button('documents','Manage files','quiet','id="manage-files" hidden')}</div></div><div class="library-tools"><label class="search"><span>⌕</span><input id="search" placeholder="Search saved memory" aria-label="Search saved cards"></label><select id="category-filter" aria-label="Filter services by category" hidden></select><select id="document-filter" aria-label="Filter by source" hidden></select><select id="memory-kind-filter" aria-label="Filter memory type" hidden><option value="all">All memory</option><option value="notes">Messages & personal notes</option><option value="feedback">Feedback & card notes</option><option value="documents">Document cards</option></select><p class="library-source-note" id="library-source-note" hidden>Public service research · confirm current eligibility and capacity.</p></div><div id="cards" class="cards-scroll"></div><div id="paging" class="paging"></div></section>
  <section class="chat-panel" id="chat-panel" aria-labelledby="assistant-title" tabindex="-1"><div class="panel-heading"><div><h2 id="assistant-title">Ask your assistant</h2><span class="subtle" id="workspace-label"></span><span class="model-status" id="model-status"></span></div><div class="chat-header-actions">${button('new-chat','New conversation','quiet')}${button('expand-assistant','Open Workspace ↗','quiet','id="expand-assistant" hidden')}${button('minimize-assistant','×','icon-button','id="minimize-assistant" aria-label="Minimize assistant" hidden')}</div></div><div id="messages" class="messages"></div><div id="selected-context"></div><form id="composer" class="composer"><label for="message" class="sr-only">Your message</label><textarea id="message" rows="3" placeholder="Ask about a service or document, or tell me what to remember…"></textarea><div class="composer-controls"><span class="automatic-memory">Messages save automatically to your memory.</span><div class="composer-actions">${button('import','＋ &nbsp; Add a document','secondary','id="add-document"')}${button('voice','◉ &nbsp; Speak','secondary','id="voice-button"')}${button('send','Send ↑','primary','id="send-button"')}</div></div><div class="composer-help" id="voice-status">Review, edit or delete saved information in Manage memory.</div></form><p class="privacy-line">AI questions send relevant text to OpenAI. Keep patient names and identifiers out.</p></section></div></div>`;
  $('search').addEventListener('input',()=>{query=$('search').value;offset=0;clearTimeout(shell.searchTimer);shell.searchTimer=setTimeout(()=>loadCards().catch(fail),150);});
  $('document-filter').addEventListener('change',()=>{documentFilter=$('document-filter').value;includeArchived=false;offset=0;loadCards().catch(fail);});
  $('category-filter').addEventListener('change',()=>{category=$('category-filter').value;offset=0;loadCards().catch(fail);});
  $('memory-kind-filter').addEventListener('change',()=>{memoryKind=$('memory-kind-filter').value;offset=0;loadCards().catch(fail);});
  $('composer').addEventListener('submit',event=>{event.preventDefault();sendMessage().catch(fail);});
  $('message').addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendMessage().catch(fail);}});
  renderLibraryMode();renderMessages();
}
function renderMessages(){
  $('messages').innerHTML=messages.length?messages.map((m,index)=>`<article class="message ${m.role}"><div class="message-label">${m.role==='user'?'YOU':'ASSISTANT'}${m.source?`<span>${e(m.source==='chatgpt'?'ChatGPT':m.source==='local'?'Saved information':m.source==='error'?'Connection interrupted':m.source)}</span>`:''}${m.saved?'<span class="saved-marker">Saved to memory</span>':''}</div><div class="message-text">${textHTML(m.text||'Looking through your information…')}</div>${m.cards?.length?`<div class="answer-cards">${m.cards.map(c=>cardHTML(c,true)).join('')}</div>`:''}${m.calculations?.length?`<div class="calculation-proof">${m.calculations.map(c=>`<div>Calculated from ${e(c.matched_rows)} matching row(s) · ${e(c.operation)}${c.column?' of '+e(c.column):''}${c.value!==undefined?' = '+e(c.value??'No numeric values'):''}</div>`).join('')}</div>`:''}${m.role==='user'?'':m.error?button('retry','Retry question','quiet',`data-index="${index}"`):''}</article>`).join(''):`<div class="chat-welcome"><span class="welcome-icon">✳</span><h2>A clearer way to work<br>with your information.</h2><p>Find local services, compare your documents, and keep notes with the right card.</p><div class="prompt-chips">${button('prompt','Find a local service','prompt',`data-prompt="Find transportation services in North York. Show the service cards and contact details."`)}${button('prompt','Summarize a document','prompt',`data-prompt="Summarize my latest imported document. Highlight anything I should follow up on."`)}${button('prompt','Recall my notes','prompt',`data-prompt="What have I saved in my personal notes? Show the matching cards."`)}</div><small>No need to repeat saved information in a new conversation.</small></div>`;
  $('messages').scrollTop=$('messages').scrollHeight;
}
function setBusy(value){busy=value;$('send-button').textContent=value?'Stop':'Send ↑';$('message').disabled=value;$('add-document').disabled=value||importing;$('voice-button').disabled=value;renderAssistantSurface();}
async function sendMessage(retryText=null){
  if(busy){await api('stop');return;}
  if(voice.listening)await voice.stop();
  const text=(retryText||$('message').value).trim();if(!text)return;
  const remember=!retryText;
  messages.push({role:'user',text});const response={role:'assistant',text:''};messages.push(response);$('message').value='';setBusy(true);renderMessages();
  try{const answer=await api('chat',{text,remember,card_id:selected?.id||null});Object.assign(response,answer);response.error=answer.source==='error';await refresh();}
  catch(error){response.text=error.message;response.error=true;response.source='error';}
  finally{setBusy(false);renderMessages();$('message').focus();}
}
function context(){ $('selected-context').innerHTML=selected?`<div class="context-chip"><span>Working with <strong>${e(selected.title)}</strong><small>Your messages save as notes on this card.</small></span>${button('clear-selection','×','icon-button','aria-label="Stop working with this card"')}</div>`:'';}
async function openModal(content,kind=''){await flushNote();noteEditor=null;modal.className=kind;modal.innerHTML=content;if(!modal.open)modal.showModal();}
function modalHead(title,subtitle=''){return`<div class="modal-heading"><div><h2 id="modal-title">${e(title)}</h2>${subtitle?`<p>${e(subtitle)}</p>`:''}</div>${button('close-modal','×','icon-button','aria-label="Close panel"')}</div>`;}
async function closeModal(){await flushNote();noteEditor=null;modal.close();modal.replaceChildren();}
async function openCard(id){
  const card=await api('get-card',{id});
  await openModal(modalHead(card.title,fileLabel(card))+`<div class="detail-body">${card.archived?'<p class="callout">This row was removed in a newer import. Its notes have been kept.</p>':''}${Object.keys(card.fields||{}).length?`<dl class="field-list">${Object.entries(card.fields).map(([key,value])=>`<div><dt>${e(key)}</dt><dd>${e(value)}</dd></div>`).join('')}</dl>`:`<div class="source-text">${textHTML(card.body)}</div>`}${card.contacts?.length?`<section class="detail-section"><h3>Contacts in the source</h3>${card.contacts.map(contact=>`<div class="contact-row"><div><strong>${e(contact.name||'Listed '+contact.kind)}</strong><span>${e(contact.value)}</span></div>${button('copy-contact','Copy','quiet',`data-id="${e(card.id)}" data-value="${e(contact.value)}"`)}</div>`).join('')}</section>`:''}${card.links?.length?`<section class="detail-section"><h3>Source links</h3>${card.links.map(url=>button('open-link',e(url)+' ↗','source-link',`data-url="${e(url)}"`)).join('')}</section>`:''}
  <section class="detail-section"><div class="section-title"><h3>Your notes & corrections</h3><span class="subtle">Saved on this card</span></div><div id="card-notes">${notesHTML(card.comments)}</div><label class="sr-only" for="card-note">Add a note or correction</label><textarea id="card-note" rows="3" placeholder="Add feedback or a correction. Your words stay with this card."></textarea><div class="note-status"><span id="note-status">Notes save automatically when you pause.</span>${button('new-card-note','New note','quiet')}</div></section></div>
  <div class="modal-footer">${button('use-card','Ask about this card','primary',`data-id="${e(card.id)}"`)}${button('focus-card-note','Add a note','secondary')}${isService(card)?button('open-link','Provider page ↗','secondary',`data-url="${e(card.fields['Provider page'])}"`):card.document_id?button('open-original','Open original file ↗','secondary',`data-id="${e(card.document_id)}"`):button('edit-note','Edit note','secondary',`data-id="${e(card.id)}"`)}${isService(card)?'':button('delete-card','Delete card','danger quiet',`data-id="${e(card.id)}"`)}</div>`,'card-dialog');
  noteEditor={cardId:id,id:null,version:null,body:'',saved:'',queue:Promise.resolve()};
  $('card-note').addEventListener('input',()=>{noteEditor.body=$('card-note').value;$('note-status').textContent='Saving…';clearTimeout(noteTimer);noteTimer=setTimeout(()=>flushNote().catch(fail),800);});
}
function notesHTML(comments){return comments?.length?comments.map(n=>`<div class="saved-note"><p>${textHTML(n.body)}</p><div class="note-actions"><small>${e(date(n.updated_at))}</small>${button('edit-card-comment','Edit','quiet',`data-id="${e(n.id)}"`)}${button('delete-card-comment','Delete','quiet danger',`data-id="${e(n.id)}"`)}</div></div>`).join(''):'<p class="subtle no-notes">No notes yet.</p>';}
async function flushNote(){
  clearTimeout(noteTimer);const editor=noteEditor;if(!editor)return;
  editor.queue=editor.queue.catch(()=>{}).then(async()=>{
    if(!editor.body.trim()){if(editor===noteEditor&&$('note-status'))$('note-status').textContent=editor.id?'Earlier saved text is kept. Choose New note to start another.':'Write a note to save it automatically.';return;}
    if(editor.body===editor.saved)return;
    const body=editor.body;try{
      const result=await api('save-comment',{card_id:editor.cardId,body,id:editor.id,expected_version:editor.version});editor.id=result.id;editor.version=(editor.version||0)+1;editor.saved=body;
      if(editor===noteEditor){const card=await api('get-card',{id:editor.cardId});$('card-notes').innerHTML=notesHTML(card.comments);$('note-status').textContent='✓ Saved on this card';}
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
  const card=await api('get-card',{id:target.dataset.cardId});
  if(target.dataset.entryType==='comment'){
    const note=card.comments.find(n=>n.id===target.dataset.id);if(!note)throw new Error('This memory is no longer available. Refresh the list.');
    await openModal(modalHead('Edit saved feedback',card.title)+`<form class="detail-body"><label>Saved information<textarea id="memory-comment-body" rows="8" maxlength="12000" required>${e(note.body)}</textarea></label><p class="subtle">This changes your saved note. The provider or document source stays intact.</p><div class="modal-footer">${button('save-memory-comment','Save changes','primary',`data-id="${e(note.id)}" data-card-id="${e(card.id)}" data-version="${note.version}"`)}</div></form>`);$('memory-comment-body').focus();
  }else if(card.document_id){await openCard(card.id);$('card-note').scrollIntoView({block:'center'});$('card-note').focus();}
  else await noteForm(card.id);
}
async function deleteMemory(target){
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
  $('saved-accounts')?.addEventListener('change',async event=>{if(!event.target.value)return;try{await flushNote();const result=await api('select-account',{id:event.target.value});state=result;messages=[];selected=null;context();renderMessages();await settings();}catch(error){fail(error);}});
}
async function signIn(addAccount=false){if(connectionBusy)return;connectionBusy=true;await openModal(modalHead('Continue in your browser','Sign in on the official OpenAI page, then return to the app.')+`<div class="detail-body"><p>The app is waiting for the sign-in response. Your password stays with OpenAI.</p>${button('cancel-sign-in','Cancel sign-in','secondary')}</div>`);
  try{await api('sign-in',{addAccount,enablePlan:true});messages=[];selected=null;context();renderMessages();await refresh();await settings();notice('Connection updated. Your account has its own saved cards.');}
  catch(error){notice(error.message,true);await settings();}finally{connectionBusy=false;}}
const voice=new Voice({status:text=>{if($('voice-status'))$('voice-status').textContent=text;},transcript:text=>{if($('message'))$('message').value=[voicePrefix,text].filter(Boolean).join(' ');}});
function fail(error){notice(error.message||String(error),true);}
document.addEventListener('click',async event=>{const target=event.target.closest('[data-action]');if(!target)return;event.preventDefault();const action=target.dataset.action;
  try{
    if(action==='send')await sendMessage();
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
    else if(action==='open-card')await openCard(target.dataset.id);
    else if(action==='clear-selection'){selected=null;context();}
    else if(action==='focus-card-note'){$('card-note').scrollIntoView({block:'center',behavior:'smooth'});$('card-note').focus({preventScroll:true});}
    else if(action==='use-card'||action==='ask-service'){if(busy)throw new Error('Wait for this answer or choose Stop before switching cards.');const id=target.dataset.id;if(modal.open)await closeModal();selected=await api('get-card',{id});context();if(libraryMode==='memory')await changeLibraryMode('workspace');if(libraryMode==='services')openServiceChat(target);else $('message').focus({preventScroll:true});}
    else if(action==='new-card-note'){await flushNote();noteEditor={cardId:noteEditor.cardId,id:null,version:null,body:'',saved:'',queue:Promise.resolve()};$('card-note').value='';$('note-status').textContent='Notes save automatically when you pause.';$('card-note').focus();}
    else if(action==='edit-card-comment'){await flushNote();const card=await api('get-card',{id:noteEditor.cardId}),note=card.comments.find(n=>n.id===target.dataset.id);if(!note)throw new Error('This note is no longer available.');noteEditor={cardId:card.id,id:note.id,version:note.version,body:note.body,saved:note.body,queue:Promise.resolve()};$('card-note').value=note.body;$('note-status').textContent='Editing saved note. Changes save when you pause.';$('card-note').focus();}
    else if(action==='delete-card-comment'){if(!confirm('Delete this saved note? This cannot be undone.'))return;await flushNote();const cardId=noteEditor.cardId;await api('forget-comment',{id:target.dataset.id,card_id:cardId});if(noteEditor.id===target.dataset.id){noteEditor={cardId,id:null,version:null,body:'',saved:'',queue:Promise.resolve()};$('card-note').value='';}$('card-notes').innerHTML=notesHTML((await api('get-card',{id:cardId})).comments);$('note-status').textContent='Note deleted.';await refresh();}
    else if(action==='documents')await manageDocuments();
    else if(action==='filter-document'||action==='previous-rows'){libraryMode='memory';documentFilter=target.dataset.id;includeArchived=action==='previous-rows';offset=0;await closeModal();$('document-filter').value=documentFilter;renderLibraryMode();await loadCards();}
    else if(action==='open-original')await api('open-original',{id:target.dataset.id});
    else if(action==='open-link')await api('open-link',{url:target.dataset.url});
    else if(action==='copy-contact'){await api('copy-contact',{id:target.dataset.id,value:target.dataset.value});notice('Contact copied.');}
    else if(action==='new-chat'){await flushNote();await api('clear-chat');messages=[];selected=null;context();renderMessages();notice('New conversation. Saved information remains in Manage memory.');}
    else if(action==='new-note')await noteForm();
    else if(action==='edit-note')await noteForm(target.dataset.id);
    else if(action==='save-personal-note'){await api('save-note',{id:target.dataset.id||null,expected_version:Number(target.dataset.version)||null,title:$('note-title').value,body:$('note-body').value});await closeModal();await refresh();notice('Memory saved. Future answers will use the updated information.');}
    else if(action==='delete-card'){if(!confirm('Delete this card and its attached notes? This cannot be undone.'))return;await flushNote();await api('forget-card',{id:target.dataset.id});await closeModal();if(selected?.id===target.dataset.id){selected=null;context();}await refresh();notice('Card deleted.');}
    else if(action==='delete-document'){if(!confirm('Delete this imported document, its cards and their notes? This cannot be undone.'))return;await api('forget-document',{id:target.dataset.id});if(documentFilter===target.dataset.id){documentFilter='';offset=0;}await manageDocuments();await refresh();}
    else if(action==='sign-in')await signIn();
    else if(action==='add-account')await signIn(true);
    else if(action==='cancel-sign-in')await api('cancel-sign-in');
    else if(action==='sign-out'){await flushNote();const result=await api('sign-out');messages=[];selected=null;context();renderMessages();await settings();if(!result.revocationConfirmed)notice('Signed out on this computer. OpenAI could not confirm remote token revocation.',true);}
    else if(action==='load-models'){const result=await api('models');state.models=result;renderModel();$('model-picker').innerHTML=`<select id="model-select" aria-label="AI model">${result.items.map(m=>`<option value="${e(m.id)}" ${m.id===result.selected?'selected':''}>${e(m.name)}</option>`).join('')}</select>`;$('model-select').onchange=async event=>{try{state.models=await api('select-model',{id:event.target.value});renderModel();}catch(error){fail(error);}};}
    else if(action==='copy-starter'){const result=await api('copy-starter');notice(result.added+' cards copied into this account.');await settings();}
    else if(action==='export'){await flushNote();const result=await api('export');if(result.exported)notice('Private memory backup saved.');}
    else if(action==='restore'){const result=await api('restore');if(result.restored){notice(result.added+' cards and '+result.notes_added+' notes restored. Existing matching records were kept.');await settings();}}
    else if(action==='prompt'){$('message').value=target.dataset.prompt;$('message').focus();}
    else if(action==='retry'){const previous=messages[Number(target.dataset.index)-1];if(previous?.role==='user')await sendMessage(previous.text);}
    else if(action==='next'){offset+=30;await loadCards();}
    else if(action==='previous'){offset=Math.max(0,offset-30);await loadCards();}
    else if(action==='voice'){
      if(voice.loading){voice.cancelPreparation();return;}
      if(voice.listening){await voice.stop();$('voice-button').textContent='◉ Speak';}
      else{voicePrefix=$('message').value.trim();$('voice-button').textContent='Cancel voice';try{await voice.start();$('voice-button').textContent='■ Stop listening';}catch(error){$('voice-button').textContent='◉ Retry voice';throw error;}}
    }
  }catch(error){fail(error);}
});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&libraryMode==='services'&&serviceChatOpen&&!modal.open){event.preventDefault();closeServiceChat().catch(fail);}});
modal.addEventListener('cancel',event=>{event.preventDefault();closeModal().catch(fail);});
window.hive.subscribe(event=>{
  if(event.type==='delta'){const last=messages.at(-1);if(last?.role==='assistant'&&busy){last.text+=event.value;renderMessages();}}
  if(event.type==='message-kept'){const lastUser=messages.findLast(m=>m.role==='user');if(lastUser)lastUser.saved=true;}
  if(event.type==='memory-changed'){clearTimeout(refresh.timer);refresh.timer=setTimeout(()=>refresh().catch(fail),120);}
  if(event.type==='closing-requested'){
    (async()=>{try{await flushNote();if(voice.listening)await voice.stop();await api('close-after-save');}catch(error){notice('The app stayed open because a note has not saved: '+error.message,true);}})();
  }
});
shell();refresh().then(()=>api('ui-ready')).catch(error=>{$('cards').innerHTML=`<p class="callout">${e(error.message)}</p>`;fail(error);});
