import { Voice } from './voice.mjs';
import { escapeHTML as e } from './render-text.mjs';
import { enums } from '../src/core/catalog.mjs';
import {PUBLIC_SERVICE_FORMAT, OWN_SERVICE_FORMAT, SERVICE_FILE_TYPES, isServiceSource, serviceFields,
  cleanServiceFields, serviceDraft, missingServiceDetails} from '../src/documents/service-sources.mjs';
import {directoryGroup,hasServiceResult,recommendationGroups} from '../src/documents/ranking.mjs';
const api=(method,args={})=>window.hive.request(method,args),$=id=>document.getElementById(id);
let state,query='',documentFilter='',libraryMode='workspace',navigationSequence=0,serviceChatOpen=false,assistantReturnFocus=null,memoryKind='all',category='',includeArchived=false,offset=0,messages=[],busy=false,importing=false,selected=null,preview=null,noteEditor=null,noteTimer,feedbackEditor=null,feedbackSaving=false,voicePrefix='',connectionBusy=false,cardLoadSequence=0,activeCase=null,activeOwner=null,caseChanging=false,caseSequence=0,caseHasMore=false,caseFilter='',caseDraftTimer,caseDraftQueue=Promise.resolve();
const modal=$('modal');
const feedbackDrafts=new Map();
const serviceFormDrafts = new Map();
const serviceAreaChoices = ['York Region', ...enums.regions.toSorted((a,b)=>a.localeCompare(b,'en-CA'))];
const basicServiceFields = new Set(['category','name','area','phone']);
const customServiceArea = '__custom__';
const feedbackLabels = {
  needed: 'Feedback needed',
  unselected: 'No service selected',
  recorded: 'Feedback recorded'
};
let caseHasNewer = false, caseMenuTrigger = null, caseListMarkup = '', cardHistory = null;
let expandedMemoryGroup = '', memoryHistoryOffset = 0;
let manualWrapUp = false;
let serviceEditor = null;
let documentCardEditor = null;
let showRemovedServices = false;
let trackingReview = null;
const keepChatHelp = 'Keep this conversation as one item in Manage memory.';
const deleteChatHelp = 'Discard a practice or inaccurate conversation.';
const date=value=>{try{return new Date(value).toLocaleString('en-CA',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});}catch{return value;}};
const icon=name=>({file:'▤',chat:'◌',plus:'+',search:'⌕',arrow:'↗',close:'×',mic:'◉',check:'✓'}[name]||'');
function notice(text,error=false){$('notice').textContent=text;$('notice').className=error?'visible error':'visible';clearTimeout(notice.timer);notice.timer=setTimeout(()=>$('notice').className='',6500);}
function textHTML(text){return e(text).replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/\*([^*\n]+)\*/g,'<em>$1</em>').replace(/\n/g,'<br>');}
function button(action,label,classes='',extra=''){return`<button class="${classes}" data-action="${action}" ${extra}>${label}</button>`;}
const isService=card=>isServiceSource(card.source_format);
const sourceName=format=>format===PUBLIC_SERVICE_FORMAT?'Public source':'Own source';
const sourceTag=format=>`<span class="source-tag${format===OWN_SERVICE_FORMAT?' own-source-tag':''}">(${sourceName(format)})</span>`;
const resultLabel=outcome=>outcome==='worked'?'Worked':"Didn't work";
function ratingTone(score) {
  return score <= 2 ? 'rating-low' : score >= 4 ? 'rating-high' : 'rating-mid';
}
function ratingOptions(selected) {
  return '<option value="">No rating</option>' + [1,2,3,4,5].map(score =>
    `<option value="${score}" class="${ratingTone(score)}" ${score===selected?'selected':''}>${score}/5${score===1?' · Poor':score===5?' · Excellent':''}</option>`
  ).join('');
}
function averageRatingBadge(summary, {label='', showCount=false}={}) {
  if (!summary?.rating_count) return '';
  const score = Number(summary.rating_average).toFixed(1);
  const count = `${summary.rating_count} rating${summary.rating_count===1?'':'s'}`;
  return `<span class="rating-badge ${ratingTone(Number(score))}" title="Average of ${count}">${label}${score}/5${showCount?' · '+count:''}</span>`;
}
function resultBadge(note) {
  if (!note.outcome) return '';
  const rated = note.rating != null;
  return `<span class="result-badge ${e(note.outcome)}${rated?' '+ratingTone(note.rating):''}">${e(resultLabel(note.outcome))}${rated?' · '+note.rating+'/5':''}</span>`;
}
function experienceHTML(summary, {showRating=true}={}) {
  if (!summary || (!summary.worked && !summary.not_worked)) return '';
  return `<span class="experience-summary"><span>${summary.worked} worked</span><span>${summary.not_worked} didn't work</span>
    ${showRating ? averageRatingBadge(summary,{label:'Your average rating ',showCount:true}) : ''}</span>`;
}
const fileLabel=card=>isService(card)
  ? [sourceName(card.source_format), card.source_format===OWN_SERVICE_FORMAT?card.filename:card.category, card.source_format===OWN_SERVICE_FORMAT?card.locator:''].filter(Boolean).join(' · ')
  : [sourceName(card.source_format), card.filename||'Personal memory', card.locator].filter(Boolean).join(' · ');
function answerCardHTML(card, reply) {
  const contact = card.contacts?.[0];
  const summary = card.experience;
  const service = isService(card);
  const experienceOnly = reply.presentation === 'service-experience';
  const pickable = reply.id && !reply.error && activeCase?.status === 'active' &&
    !experienceOnly && !card.archived && !card.removed_from_directory && card.document_id && (service || reply.presentation === 'service-options');
  const details = `data-id="${e(card.id)}"`;
  const ranking = card.card_rank_reason ? ` data-rank-reason="${e(card.card_rank_reason)}"` : '';
  const outcomes = hasServiceResult(card) ? [summary.worked && `${summary.worked} worked`,
    summary.not_worked && `${summary.not_worked} didn't work`].filter(Boolean).join(' · ') : '';
  const content = `<span class="card-kicker">${e(card.category || card.filename || (card.kind === 'conversation' ? 'Saved case' : 'Saved information'))} ${sourceTag(card.source_format)}</span>
    <strong>${e(card.title)}</strong>
    ${outcomes ? `<span class="answer-card-experience">
      ${averageRatingBadge(summary,{label:'Your avg. ',showCount:true}) || '<small>No rating yet</small>'}
      <small>${e(outcomes)}</small></span>` : ''}
    ${card.card_reason ? `<span class="card-reason"><b>Why consider</b>${e(card.card_reason)}</span>` :
      `<span class="card-excerpt">${e(card.body?.split('\n')[0]?.slice(0,120) || 'Open to see details')}</span>`}
    ${(card.card_confirm || service) && !experienceOnly ? `<span class="card-confirm"><b>Confirm</b>${e(card.card_confirm || 'Eligibility, service area, accessibility, fees and current capacity with intake.')}</span>` : ''}
    <span class="answer-card-bottom">${contact && !service && !pickable ? `<span>${e(contact.value)}</span>` : ''}
      ${!outcomes && card.comment_count ? `<small>${card.comment_count} saved note${card.comment_count === 1 ? '' : 's'}</small>` : ''}</span>`;
  if (!pickable) {
    return `<button class="memory-card answer-card" data-action="open-card" ${details}${ranking}>${content}<span class="answer-card-open">View details →</span></button>`;
  }
  const tracked = messages.find(message => message.followup?.reply_sequence === reply.sequence &&
    message.followup.card_id === card.id)?.followup;
  const pickLabel = tracked?.result ? 'View result' : tracked ? 'Resume follow-up' : 'Use this service';
  return `<article class="memory-card answer-card pickable-answer" ${details}>${content}
    <div class="answer-card-actions">
      ${button('chat-followup-start',pickLabel,'answer-card-pick',`${details} data-reply-id="${e(reply.id)}" aria-label="${e(pickLabel)} for ${e(card.title)}"`)}
      ${button('open-card','View details','answer-card-details',`${details}${ranking} data-reply-id="${e(reply.id)}" aria-label="View details for ${e(card.title)}"`)}
    </div></article>`;
}
function completionMessage(completion) {
  const attrs = `data-id="${e(activeCase.id)}" data-version="${activeCase.version}"`;
  const added = completion?.kind==='service-added';
  const keepAttrs = `${attrs} data-message-id-for-completion="${e(completion?.message_id || '')}"`;
  const deleteAttrs = `${attrs} data-include-notes="true"`;
  const actions = added ? [
    button('archive-case','Close chat<small>Save this conversation in Manage memory.</small>','primary',attrs),
    button('keep-case-open','Continue chat<small>Keep working in this conversation.</small>','secondary',keepAttrs+' data-service-added="true"'),
    button('delete-case','Delete chat<small>Discard this conversation and its saved feedback.</small>','secondary danger',deleteAttrs)
  ] : [
    button('keep-case-open','Keep in chat history<small>Leave this chat in the sidebar.</small>','secondary',keepAttrs),
    button('archive-case','Add to memory library<small>File this chat in Manage memory.</small>','primary',attrs),
    button('delete-case','Delete chat and notes<small>Remove this chat and the feedback saved from it.</small>','secondary danger',deleteAttrs)
  ];
  return `<article class="message assistant completion-message" aria-labelledby="completion-title">
    <div class="message-label">ASSISTANT</div>
    <div class="case-next-steps">
      <h3 id="completion-title" tabindex="-1">What would you like to do next?</h3>
      ${completion && !added ? `<div class="completion-summary"><strong>${e(completion.title)}</strong>${resultBadge(completion)}</div>` : ''}
      <div class="case-next-actions">${actions.join('')}</div>
    </div>
  </article>`;
}
function focusCompletionMessage() {
  const heading = $('completion-title');
  if (!heading) return false;
  heading.closest('.completion-message').scrollIntoView({block:'end',behavior:'instant'});
  heading.focus({preventScroll:true});
  return true;
}
function renderChatFollowup(message) {
  const followup = message.followup;
  const available = followup.card && !followup.unavailable;
  const archived = activeCase?.status === 'archived';
  const title = available ? followup.card.title : message.text;
  const cardId = `data-id="${e(followup.card_id)}"`;
  const stepButton = (step, label, style, extra = '') =>
    button('chat-followup-step', label, style, `data-step="${step}" ${extra}`);
  const viewDetails = available ? button('open-card','View details','quiet',cardId+' data-from-followup="true"') : '';
  const otherOptions = messages.some(reply => reply.sequence === followup.reply_sequence && reply.cards?.length > 1)
    ? button('chat-followup-options','See other options','secondary',`data-sequence="${followup.reply_sequence}" ${cardId}`) : '';
  const listedContacts = available ? (followup.card.contacts || []) : [];
  const contactName = listedContacts.find(contact => contact.name)?.name;
  const contacts = listedContacts.length ? `<section class="followup-known-contact" aria-label="Known contact">
    <div class="followup-contact-heading"><h4>Known contact</h4>${sourceTag(followup.card?.source_format)}${contactName ? `<span>${e(contactName)}</span>` : ''}</div>
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
    const addRating = result.rating==null && !archived ? `<div class="followup-actions followup-add-rating">
      <label>Rating <select class="rating-select" data-followup-field="rating">${ratingOptions(followup.rating)}</select></label>
      ${stepButton('rate','Save rating','secondary')}</div>` : '';
    content = `<div class="followup-saved" role="status"><span>✓ Result saved</span>${resultBadge(result)}</div>${note}
      ${addRating}<div class="followup-actions">${result.outcome === 'not_worked' ? otherOptions : ''}${viewDetails}</div>`;
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
        <label>Rating (optional)<select class="rating-select" data-followup-field="rating">${ratingOptions(followup.rating)}</select></label>
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
      ${contacts}${savedNote}${content}${available && !archived ? followupInputTools(followup.history, stepButton) : ''}
    </section></article>`;
}
function renderModel(){const selected=state?.models?.selected,item=state?.models?.items?.find(m=>m.id===selected);$('model-status').textContent=selected?'AI model: '+(item?.name||selected):state?.account.sharing?'ChatGPT · model selected when you ask':'Connect ChatGPT for AI answers';}
function serviceRowHTML(card) {
  const own=card.source_format===OWN_SERVICE_FORMAT;
  const contacts=['phone','email'].map(kind=>card.contacts.find(contact=>contact.kind===kind)).filter(Boolean);
  const person=card.contact_name || card.contacts.find(contact=>contact.name)?.name;
  const score=averageRatingBadge(card.experience) || (hasServiceResult(card)?'<small>No rating yet</small>':'');
  const attrs=`data-id="${e(card.id)}"`;
  const manage=card.removed_from_directory
    ? button('restore-known-service','Restore','secondary',`${attrs} aria-label="Restore ${e(card.title)} to Known services"`)+
      button('delete-removed-service','Delete permanently','quiet danger',`${attrs} data-title="${e(card.title)}" aria-label="Permanently delete ${e(card.title)}"`)
    : button('remove-known-service','Remove','quiet danger',`${attrs} aria-label="Remove ${e(card.title)} from Known services"`);
  return `<article class="service-row" data-service-id="${e(card.id)}">
    <div class="service-row-info">
      ${card.comment_count ? `<div class="service-experience-preview">${experienceHTML(card.experience,{showRating:false})}
        <small>Your latest note: ${e(card.latest_note)}</small></div>` : ''}
      <span class="card-kicker">${e(card.category||'Known service')}</span>
      ${button('open-card',e(card.title),'service-title',attrs)}
      <p>${e(card.body?.split('\n')[0]||'')}</p><span class="service-area">${e(card.area||'Confirm the service area with intake')}</span>
      ${card.missing_details?.length ? `<small class="service-gaps">Needs details · ${e(card.missing_details.join(', '))}</small>` : ''}
    </div>
    <div class="service-row-contact">
      <div><strong>${e(own&&person?person:'Program contact')} ${sourceTag(card.source_format)}</strong>
      ${!own&&person?`<span>${e(person)}</span>`:''}
      ${contacts.length?contacts.map(contact=>`<span class="service-contact-value">${e(contact.value)}</span>`).join(''):
        `<small>${own?'Contact details needed':'See provider details'}</small>`}
      ${card.comment_count ? `<small>${card.comment_count} saved note${card.comment_count===1?'':'s'} / result${card.comment_count===1?'':'s'}</small>` : ''}</div>
      ${score ? `<div class="service-row-score"><strong>Avg. rating</strong>${score}</div>` : ''}
    </div>
    <div class="service-row-actions">${button('open-card','View details','secondary',attrs)}
      ${card.removed_from_directory?'':button('ask-service','Ask assistant','quiet',attrs)}
      ${manage}</div>
    </article>`;
}
function serviceDirectoryHTML(cards) {
  const groups=showRemovedServices?[[cards,'Removed services']]:['Services with recorded outcomes','Your services without recorded outcomes','Public services without recorded outcomes']
    .map((title,index)=>[cards.filter(card=>directoryGroup(card)===index),title]);
  return groups.filter(([items])=>items.length)
    .map(([items,title])=>`<section class="service-source-group" aria-label="${title}">
      <h3>${title}</h3>${items.map(serviceRowHTML).join('')}</section>`).join('');
}
function memoryEntry(item,group,expanded) {
  const conversation = item.kind === 'conversation';
  const serviceCard = item.entry_type==='card'&&item.source_format===OWN_SERVICE_FORMAT;
  const prefix = group.title + ' · ';
  const label = conversation ? 'Saved conversation' : serviceCard ? 'Imported service' : item.outcome ? 'Service result' :
    item.entry_type === 'comment' ? 'Note' : item.document_id ? 'Document card' : 'Saved note';
  const title = conversation ? item.title.replace(/^Saved case: /,'') :
    item.title.startsWith(prefix) ? item.title.slice(prefix.length) : item.title === group.title ? label : item.title;
  const body = (!expanded && conversation) || item.body.trim() === item.title.trim() ||
    (item.outcome && item.body === resultLabel(item.outcome)+'.') ? '' : item.body;
  const status = resultBadge(item);
  const attrs = `data-id="${e(item.id)}" data-card-id="${e(item.card_id)}" data-entry-type="${e(item.entry_type)}" ${item.outcome?'data-service-result="true"':''}`;
  const editLabel = conversation ? 'Rename' : 'Edit';
  const actionTitle = item.entry_type==='comment' ? label.toLowerCase()+' for '+title : title;
  const edit = button(serviceCard?'edit-own-service':'edit-memory',editLabel,'secondary',
    `${attrs} aria-label="${e(editLabel+' '+actionTitle)}"`);
  const remove = button('delete-memory','Delete','quiet danger',`${attrs} aria-label="${e('Delete '+actionTitle)}"`);
  const actions = `<div class="memory-record-actions">${edit}${remove}</div>`;
  if (!expanded) {
    return `<li data-preview-id="${e(item.id)}"><div class="memory-preview-row"><div><strong>${e(title)}</strong> ${sourceTag(serviceCard?item.source_format:undefined)}
      ${status}${!status && item.entry_type==='comment' ? '<span class="memory-entry-label">Note</span>' : ''}
      ${body ? `<p>${e(body)}</p>` : ''}</div>${actions}</div></li>`;
  }
  return `<li class="memory-record" data-memory-id="${e(item.id)}">
    <div class="memory-entry-content">
      <div class="memory-entry-heading">${button('open-card',e(title),'memory-record-main',
        `data-id="${e(item.card_id)}" aria-label="${e('Open '+title)}"`)}${sourceTag(serviceCard?item.source_format:undefined)}${status}</div>
      ${body ? `<p>${e(body)}</p>` : ''}
      <small>${label}${item.archived?' · Previous row':''} · ${e(date(item.updated_at))}</small>
    </div>
    ${actions}</li>`;
}
function memoryGroupHTML(group) {
  const open = Boolean(group.history);
  const items = open ? group.history : group.preview;
  const attrs = `data-group-id="${e(group.id)}"`;
  const groupName = e(group.title);
  const paging = open && (group.history_offset || group.has_more) ? `<div class="memory-history-paging">
    ${button('page-memory-history','← Previous','quiet',`${attrs} data-offset="${Math.max(0,group.history_offset-20)}" ${group.history_offset?'':'disabled'}`)}
    <small>${group.history_offset+1}–${group.history_offset+items.length} of ${group.total}</small>
    ${button('page-memory-history','Next →','quiet',`${attrs} data-offset="${group.history_offset+20}" ${group.has_more?'':'disabled'}`)}</div>` : '';
  return `<section class="memory-group" ${attrs} aria-label="${groupName}">
    <header><h3>${groupName}</h3><small>${group.total} saved item${group.total===1?'':'s'}</small></header>
    <ul class="${open?'memory-history':'memory-preview'}">${items.map(item=>memoryEntry(item,group,open)).join('')}</ul>
    ${paging}<div class="memory-group-footer">${button('toggle-memory-group',open?'Show less':'Expand history',
      'quiet',`${attrs} aria-expanded="${open}" aria-label="${open?'Collapse':'Expand'} history for ${groupName}"`)}</div>
  </section>`;
}
function weekLabel(value) {
  const start = new Date(value);
  if (Number.isNaN(start.getTime())) return 'Date unavailable';
  start.setDate(start.getDate() - (start.getDay() + 6) % 7);
  return 'Week of ' + start.toLocaleDateString('en-CA', {
    month:'short', day:'numeric', ...(start.getFullYear() !== new Date().getFullYear() ? {year:'numeric'} : {})
  });
}
function renderCases() {
  const groups = new Map(Object.keys(feedbackLabels).map(status => [status, new Map()]));
  const term = caseFilter.trim().toLowerCase();
  for (const chat of state?.cases?.items || []) {
    if (!chat.title.toLowerCase().includes(term)) continue;
    const weeks = groups.get(chat.feedback);
    const week = weekLabel(chat.activity_at);
    if (!weeks.has(week)) weeks.set(week, []);
    weeks.get(week).push(chat);
  }
  const content = [...groups].filter(([,weeks]) => weeks.size).map(([status,weeks]) => `
    <section class="case-group" data-feedback="${status}" aria-labelledby="case-group-${status}">
      <h3 id="case-group-${status}"><span class="case-status-dot" aria-hidden="true"></span>${feedbackLabels[status]}</h3>
      ${[...weeks].map(([week,chats]) => `<div class="case-week"><h4>${e(week)}</h4>${chats.map(chat => {
        const current = activeCase?.id === chat.id;
        return `<div class="case-item ${current?'active':''}" data-case-row="${e(chat.id)}" data-feedback="${status}">
          <button data-action="open-case" data-id="${e(chat.id)}" title="${e(chat.title)}" aria-current="${current}">
            <strong>${e(chat.title)}</strong>
          </button>
          ${button('case-menu','⋯','case-more',`data-id="${e(chat.id)}" aria-label="Actions for ${e(chat.title)}" aria-controls="case-action-menu" aria-expanded="false"`)}
        </div>`;
      }).join('')}</div>`).join('')}
    </section>`).join('') || `<p class="case-empty">${term ? 'No chats match your search.' : 'No chats yet.'}</p>`;
  const list = $('case-list');
  if (caseListMarkup === content) return;
  hideCaseMenu();
  const top = list.scrollTop;
  list.innerHTML = content;
  caseListMarkup = content;
  list.scrollTop = top;
}
async function refreshCaseList() {
  const snapshot = state;
  const result = await api('list-cases', {all:true});
  if (!snapshot || state !== snapshot) return;
  state.cases = result;
  renderCases();
}
function hideCaseMenu({restoreFocus=false}={}) {
  const menu = $('case-action-menu');
  const trigger = caseMenuTrigger;
  if (menu?.matches(':popover-open')) menu.hidePopover();
  if (restoreFocus) trigger?.focus({preventScroll:true});
}
function showCaseMenu(trigger) {
  const menu = $('case-action-menu');
  if (trigger === caseMenuTrigger && menu.matches(':popover-open')) return hideCaseMenu({restoreFocus:true});
  hideCaseMenu();
  const chat = state.cases.items.find(item => item.id === trigger.dataset.id);
  if (!chat) return;
  const attrs = `data-id="${e(chat.id)}" data-version="${chat.version}"`;
  menu.innerHTML = (chat.feedback_sequence
    ? button('review-case-feedback','Record feedback','',`${attrs} data-sequence="${chat.feedback_sequence}"`)
    : button('open-case','Open conversation','',attrs))
    + button('case-options','Rename conversation','',attrs+' data-rename-only="true"')
    + (chat.message_count ? button('finish-conversation','Finish conversation','',attrs) : '')
    + button('archive-case',`Add to memory library<small>${keepChatHelp}</small>`,'',attrs+(chat.message_count?'':' disabled'))
    + button('delete-case',`Delete chat history<small>${deleteChatHelp}</small>`,'case-menu-delete',attrs);
  const anchor = trigger.getBoundingClientRect();
  caseMenuTrigger = trigger;
  trigger.setAttribute('aria-expanded','true');
  menu.showPopover({source:trigger});
  menu.style.left = Math.max(8, Math.min(anchor.right + 4, window.innerWidth - menu.offsetWidth - 8)) + 'px';
  menu.style.top = Math.max(8, Math.min(anchor.top, window.innerHeight - menu.offsetHeight - 8)) + 'px';
  menu.querySelector('button').focus({preventScroll:true});
}
const correctionLabel = (direction, change) => (direction === 'undo' ? 'Undo ' : 'Redo ') + change.detail;
function followupInputTools(history, stepButton) {
  const controls = ['undo','redo'].map(direction => {
    const change = history?.[direction];
    return change ? stepButton(direction,correctionLabel(direction,change),'quiet',`data-change-id="${change.id}"`) : '';
  }).join('');
  return controls ? `<div class="input-tools followup-corrections" aria-label="Correct this service's saved feedback">${controls}</div>` : '';
}
function renderUndo() {
  for (const direction of ['undo','redo']) {
    const control = modal.querySelector(`[data-action="${direction}-input"]`);
    if (!control) continue;
    const change = cardHistory?.[direction];
    control.hidden = !change;
    control.disabled = busy || caseChanging || !change;
    control.textContent = change ? correctionLabel(direction,change) : '';
    control.dataset.changeId = change?.id || '';
  }
}
function inputTools(){return`<div class="input-tools" aria-label="Correct saved notes and results">${button('undo-input','','quiet','hidden')}${button('redo-input','','quiet','hidden')}</div>`;}
async function refreshCardHistoryControls(id=noteEditor?.cardId) {
  if (!id) return;
  const history = await api('input-history',{card_id:id});
  if (noteEditor?.cardId !== id) return;
  cardHistory = history;
  renderUndo();
}
function renderCaseTitle() {
  if (!activeCase) return;
  const archived = activeCase.status === 'archived';
  $('assistant-title').textContent = activeCase.title;
  $('chat-add-service').hidden = archived;
  $('composer').hidden = archived;
  $('selected-context').hidden = archived;
  const banner = $('case-archived-banner');
  banner.hidden = !archived;
  banner.innerHTML = archived
    ? `<span>Saved in the memory library</span>${button('reopen-case','Reopen conversation','secondary',`data-id="${e(activeCase.id)}"`)}`
    : '';
}
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
  $('chat-add-service').disabled = busy || caseChanging;
  $('messages').querySelectorAll('[data-action="chat-followup-start"],[data-action="chat-followup-step"],[data-followup-field]').forEach(control => {
    control.disabled = busy || caseChanging ||
      (control.dataset.step==='rate' && !control.closest('.followup-add-rating').querySelector('select').value);
  });
  for (const form of $('messages').querySelectorAll('[data-service-form]')) {
    form.querySelector('fieldset').disabled = busy || caseChanging || Boolean(serviceFormDrafts.get(form.dataset.serviceForm)?.saving);
  }
}
function rememberFeedbackDraft(target) {
  if (!target.matches('[data-followup-field]') || !activeCase || caseChanging || busy) return;
  const messageId = target.closest('[data-message-id]')?.dataset.messageId;
  const feedback = messages.find(message => message.id === messageId)?.followup;
  const field = target.dataset.followupField;
  if (!feedback) return;
  if (field==='rating' && feedback.result && feedback.result.rating==null) {
    feedback.rating=Number(target.value)||null;
    updateFollowupControls();
    return;
  }
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
function updateChatServiceExperience(id, card) {
  let changed=false;
  for (const message of messages) {
    for (const reference of message.cards||[]) {
      if (reference.id!==id) continue;
      reference.experience=card.experience;
      reference.comment_count=card.comment_count;
      changed=true;
    }
    if (message.followup?.card_id===id && message.followup.card && card.comments) {
      message.followup.card.experience=card.experience;
      if (message.followup.result_id) {
        message.followup.result=card.comments.find(note=>note.outcome&&note.id===message.followup.result_id)||null;
        if (!message.followup.result) message.followup.outcome=null;
      }
      changed=true;
    }
  }
  return changed;
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
      change_id: Number(target.dataset.changeId) || undefined,
      body: fields.querySelector('textarea[data-followup-field="body"]')?.value || '', rating: Number(fields.querySelector('select')?.value) || null
    });
  }
  lockCase(true);
  let result;
  try {
    await flushCaseDraft();
    result = await api(starting ? 'start-service-followup' : 'update-service-followup', args);
    if (activeCase?.id !== args.case_id) return;
    activeCase.completion = result.completion;
    if (starting) manualWrapUp = false;
    if (starting && selected) {
      selected = null;
      context();
      await flushCaseDraft();
    }
    const existing = messages.findIndex(message => message.id === result.id);
    if (existing >= 0) messages[existing] = fromCaseMessage(result);
    else messages.push(fromCaseMessage(result));
    const updated=result.payload.followup;
    if (updated?.card) updateChatServiceExperience(updated.card_id,updated.card);
    if (['save','save-note','rate'].includes(args.step)) {
      for (const message of messages) {
        if (message.id !== result.id && message.followup?.history) message.followup.history.redo = null;
      }
    }
    renderMessages();
  } finally {
    lockCase(false);
  }
  const reply = $('messages').querySelector(`[data-message-id="${CSS.escape(result.id)}"]`);
  if (['save','save-note','cancel-note','redo'].includes(args.step) && focusCompletionMessage()) return;
  reply?.scrollIntoView({block:'nearest',behavior:'instant'});
  const opposite = args.step === 'undo' ? 'redo' : args.step === 'redo' ? 'undo' : null;
  const correction = opposite && reply?.querySelector(`[data-step="${opposite}"]`);
  (correction || reply?.querySelector('textarea') || reply?.querySelector('h3'))?.focus({preventScroll:true});
}
function showFollowupOptions(target) {
  const choices = $('messages').querySelector(`[data-message-sequence="${CSS.escape(target.dataset.sequence)}"] .answer-cards`);
  if (!choices) return;
  choices.scrollIntoView({block:'start',behavior:'instant'});
  const other = [...choices.querySelectorAll('[data-action="chat-followup-start"]')].find(option => option.dataset.id !== target.dataset.id);
  other?.focus({preventScroll:true});
}
function lockCase(value){caseChanging=value;document.body.dataset.caseChanging=String(value);$('chat-panel').setAttribute('aria-busy',String(value));$('send-button').disabled=value;$('message').disabled=busy||value;$('voice-button').disabled=busy||value;$('add-document').disabled=busy||value||importing;renderUndo();updateFollowupControls();}
async function loadCase(id,{activate=true,focus=null}={}){if(busy)throw new Error('Choose Stop or wait for this answer before changing cases.');const sequence=++caseSequence;lockCase(true);try{await flushNote();await flushCaseDraft();await pauseVoice();const record=await api(activate?'select-case':'get-case',{id,focus});if(sequence!==caseSequence)return;activeCase=record;manualWrapUp=false;caseHasMore=record.has_more;caseHasNewer=record.has_newer;messages=record.messages.map(fromCaseMessage);selected=null;if(record.selected_card_id){try{selected=await api('get-card',{id:record.selected_card_id});}catch{}}$('message').value=record.draft||'';context();renderCaseTitle();renderMessages(true);renderCases();}finally{if(sequence===caseSequence)lockCase(false);}}
async function newCase(){if(busy)throw new Error('Choose Stop or wait for this answer before starting a new topic.');if(caseChanging)return;const navigation=navigationSequence;lockCase(true);try{await flushNote();await flushCaseDraft();const record=await api('new-case');if(navigation===navigationSequence)await changeLibraryMode('workspace');await loadCase(record.id);await refresh();$('message').focus();}finally{lockCase(false);}}
async function caseOptions(id=activeCase?.id,{renameOnly=false}={}) {
  if (!id) return;
  const record = await api('get-case',{id,limit:1});
  const attrs = `data-id="${e(id)}" data-version="${record.version}"`;
  const caseActions = renameOnly ? '' : `<section class="detail-section case-choices">
    ${record.status === 'active' && record.message_count
      ? `<div>${button('finish-conversation','Finish conversation','secondary',attrs)}<p>Review what to do with this chat.</p></div>` : ''}
    ${record.status === 'active'
      ? `<div>${button('archive-case','Add to memory library','secondary',attrs+(record.message_count?'':' disabled'))}
        <p>${record.message_count?keepChatHelp:'Send a message to save this conversation.'}</p></div>`
      : `<div>${button('reopen-case','Reopen conversation','secondary',attrs)}
        <p>Bring this conversation back to Chat history to continue.</p></div>`}
    <div>${button('delete-case','Delete chat history','quiet danger',attrs)}
      <p>${deleteChatHelp} You can manage separately recorded service notes and results in their organization’s history.</p></div></section>`;
  await openModal(modalHead(renameOnly?'Rename conversation':'Case options',record.title)+`<div class="detail-body case-options">
    <label>Conversation title<input id="case-title-input" maxlength="80" value="${e(record.title)}" placeholder="For example, North York transport follow-up"></label>
    <p class="subtle">Use a short title without patient names or identifiers.</p>
    <div class="case-title-actions">${button('rename-case','Save title','primary',attrs)}
    ${record.message_count ? button('suggest-case-title','Suggest a title','quiet',attrs) : ''}</div>
    ${caseActions}</div>`,'case-options-dialog');
  if (renameOnly) $('case-title-input').select();
}
async function finishConversation(id) {
  if (modal.open&&!await closeModal()) return;
  const navigation = navigationSequence;
  await loadCase(id);
  if (navigation !== navigationSequence) return;
  if (libraryMode !== 'workspace') await changeLibraryMode('workspace');
  manualWrapUp=true;
  renderMessages();
  focusCompletionMessage();
}
async function keepCaseOpen(target) {
  const id=target.dataset.id;
  if (busy||caseChanging||activeCase?.id!==id) return;
  lockCase(true);
  try {
    const messageId=target.dataset.messageIdForCompletion;
    if (messageId) {
      const args={case_id:id,message_id:messageId};
      const reply=target.dataset.serviceAdded==='true'
        ? await api('keep-service-form-chat',args)
        : await api('update-service-followup',{...args,step:'keep-chat'});
      activeCase.completion=reply.completion;
    }
    manualWrapUp=false;
    renderMessages();
  } finally {
    lockCase(false);
  }
  $('message').focus({preventScroll:true});
  notice('Chat kept in Chat history.');
}
async function applyInputHistory(direction, target) {
  if (busy || caseChanging || !noteEditor) return;
  const cardId = noteEditor.cardId;
  const changeId = Number(target.dataset.changeId);
  const label = target.textContent;
  if (!await closeModal()) return;
  const result = await api(direction+'-input',{card_id:cardId,change_id:changeId});
  await refresh();
  if (activeCase) await loadCase(activeCase.id,{activate:false});
  await openCard(cardId);
  modal.querySelector(`[data-action="${direction === 'undo' ? 'redo' : 'undo'}-input"]:enabled:not([hidden])`)?.focus({preventScroll:true});
  notice(label + ' applied.');
  return result;
}
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
  $('page-title').textContent=services?'Known services':'Manage memory';$('page-subtitle').textContent=services?'Find a contact or open Ask assistant for help without leaving the directory.':'Find saved conversations, service results and notes by organization.';
  $('library-title').textContent=services?'Service directory':'Memory library';$('view-label').textContent=services?'KNOWN SERVICES':memory?'MANAGE MEMORY':'WORKSPACE';
  $('file-count').textContent=services?(state?.services?.total||0)+' service cards':memory?'Saved information':'Chat';
  $('document-filter').hidden=!memory;$('memory-kind-filter').hidden=!memory;$('category-filter').hidden=!services;$('library-source-note').hidden=!services;$('manage-files').hidden=!memory;$('add-memory').hidden=!memory;
  $('add-service').hidden=!services;$('import-services').hidden=!services;$('service-visibility').hidden=!services;
  $('search').placeholder=services?'Search a service, place or phone number':'Search an organization, service or note';
  document.querySelectorAll('[data-library-mode]').forEach(b=>{const active=b.dataset.libraryMode===libraryMode;b.classList.toggle('active',active);b.setAttribute('aria-current',active?'page':'false');});
}
async function changeLibraryMode(mode){if(!['workspace','services','memory'].includes(mode))return;const sequence=++navigationSequence;if(mode==='memory'||(mode==='services'&&libraryMode!=='services'))await pauseVoice();if(sequence!==navigationSequence)return;serviceChatOpen=false;libraryMode=mode;query='';category='';documentFilter='';memoryKind='all';includeArchived=false;showRemovedServices=false;offset=0;expandedMemoryGroup='';memoryHistoryOffset=0;$('search').value='';$('document-filter').value='';$('category-filter').value='';$('service-visibility').value='active';$('memory-kind-filter').value='all';renderLibraryMode();await loadCards();}
async function refresh(){state=await api('snapshot');if(activeOwner&&activeOwner!==(state.account.profileId||'device')){caseFilter='';$('case-search').value='';serviceFormDrafts.clear();}$('account-label').textContent=state.account.connected?state.account.label:'Connect ChatGPT';$('connection-dot').className='connection-dot '+(state.account.sharing?'online':'');$('workspace-label').textContent=state.workspace;$('version-label').textContent=(state.platform==='darwin'?'macOS':'Windows')+' · version '+state.version;
  $('document-filter').innerHTML='<option value="">All sources</option>'+state.documents.map(d=>`<option value="${e(d.id)}">${e(d.filename)} (${d.card_count})</option>`).join('');if(documentFilter&&!state.documents.some(d=>d.id===documentFilter))documentFilter='';$('document-filter').value=documentFilter;
  $('category-filter').innerHTML='<option value="">All service categories</option>'+(state.serviceCategories||[]).map(c=>`<option value="${e(c)}">${e(c)}</option>`).join('');$('category-filter').value=category;renderLibraryMode();renderModel();renderCases();renderUndo();await loadCards();const identity=state.account.profileId||'device';if(!activeCase||activeOwner!==identity){activeCase=null;activeOwner=identity;await loadCase(state.active_case.id,{activate:false});}else if(activeCase.id===state.active_case.id){activeCase={...activeCase,...state.active_case};renderCaseTitle();}}
async function loadCards(){const sequence=++cardLoadSequence;if(libraryMode==='workspace')return;
  const services=libraryMode==='services';
  const result=await api(services?'list-cards':'list-memory',services?{query,collection:'services',directory:true,category,removed_services:showRemovedServices,limit:30,offset}:
    {query,document_id:documentFilter||null,kind:memoryKind,include_archived:includeArchived,limit:30,offset,
      grouped:true,expanded:expandedMemoryGroup,history_offset:memoryHistoryOffset});
  if(sequence!==cardLoadSequence)return;
  if(offset && !result.items.length){offset=Math.max(0,Math.floor((result.total-1)/30)*30);return loadCards();}
  const count=services?result.total:result.record_count;
  $('card-count').textContent=count+(services?' service':' saved item')+(count===1?'':'s')+(includeArchived?' · including previous rows':'');
  const filters=Boolean(query||category||documentFilter||memoryKind!=='all');
  $('cards').className='cards-scroll '+(services?'service-rows':'memory-groups');
  $('cards').innerHTML=result.items.length?(services?serviceDirectoryHTML(result.items):result.items.map(memoryGroupHTML).join('')):
    `<div class="empty-library"><h3>${filters?'No matching items':services?(showRemovedServices?'No removed services':'No services available'):'No saved memory yet'}</h3>
    <p>${filters?'Try a shorter search or change the filter.':services?'':'Add a conversation to the library or save a service note to see it here.'}</p>
    ${!services&&!filters?button('sample','Try a sample spreadsheet','quiet'):''}</div>`;
  $('paging').innerHTML=result.total>30?button('previous','← Previous','quiet',offset===0?'disabled':'')+
    `<span>${offset+1}–${Math.min(offset+30,result.total)} of ${result.total}${services?'':' groups'}</span>`+
    button('next','Next →','quiet',offset+30>=result.total?'disabled':''):'';
}
async function setKnownServiceRemoved(target, removed) {
  const id=target.dataset.id;
  if (modal.open&&!await closeModal()) return;
  target.disabled=true;
  try {
    await api('set-service-removed',{id,removed});
    for (const message of messages) {
      for (const card of message.cards||[]) if (card.id===id) card.removed_from_directory=removed;
    }
    if (removed&&selected?.id===id) {
      selected=null;
      context();
      await flushCaseDraft();
    }
    renderMessages();
    await refresh();
    notice(removed?'Moved to Removed services.':'Restored to Known services.');
  } finally {
    target.disabled=false;
  }
}
async function deleteRemovedService(target) {
  const {id,title}=target.dataset;
  if (!confirm(`Permanently delete ${title} and its saved service notes, ratings and results? This cannot be undone.`)) return;
  target.disabled=true;
  try {
    await api('delete-removed-service',{id});
    if (selected?.id===id) {
      selected=null;
      context();
    }
    if (activeCase) await loadCase(activeCase.id,{activate:false});
    await refresh();
    notice('Service permanently deleted.');
  } finally {
    target.disabled=false;
  }
}
async function changeMemoryHistory(target) {
  const group = target.dataset.groupId;
  if (target.dataset.action==='toggle-memory-group') {
    expandedMemoryGroup = group === expandedMemoryGroup ? '' : group;
    memoryHistoryOffset = 0;
  } else {
    expandedMemoryGroup = group;
    memoryHistoryOffset = Number(target.dataset.offset);
  }
  await loadCards();
  const current = $('cards').querySelector(`[data-action="toggle-memory-group"][data-group-id="${CSS.escape(group)}"]`);
  current?.focus({preventScroll:true});
}
function shell(){
  $('app').innerHTML=`<aside class="sidebar"><div class="brand"><img class="brand-mark" src="care-navigation-logo.png" alt=""><div><strong>Care Navigation Support</strong><span>Personal assistant</span></div></div><nav>${button('workspace','◫ &nbsp; Workspace','nav-item active','data-library-mode="workspace"')}${button('known-services','▤ &nbsp; Known services','nav-item','data-library-mode="services"')}${button('manage-memory','▧ &nbsp; Manage memory','nav-item','data-library-mode="memory"')}</nav><section class="case-sidebar" aria-labelledby="chat-history-title">
      <h2 id="chat-history-title">Chat history</h2>
      ${button('new-chat','<span aria-hidden="true">+</span> New chat','case-new secondary')}
      <label class="sr-only" for="case-search">Search chat history</label>
      <input id="case-search" type="search" placeholder="Search chats">
      <div id="case-list" class="case-list"></div>
    </section><div class="sidebar-bottom">${button('settings','Connection & backup','nav-item')}<span class="version" id="version-label"></span></div></aside>
  <div id="case-action-menu" class="case-action-menu" popover="auto" aria-label="Conversation actions"></div>
  <div class="main"><header class="topbar"><div class="crumb"><b id="view-label">WORKSPACE</b><span> / </span><span id="file-count">Chat</span></div>${button('settings','<i id="connection-dot" class="connection-dot"></i><span id="account-label">Connect ChatGPT</span><span class="chevron">⌄</span>','account-button')}</header>
  <div class="workspace-heading" id="workspace-heading" hidden><div><h1 id="page-title">Workspace</h1><p id="page-subtitle"></p></div><button id="service-chat-launcher" class="service-chat-launcher" data-action="open-service-chat" aria-label="Open assistant chat" aria-controls="chat-panel" aria-haspopup="dialog" aria-expanded="false" hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M20 11.5a8 8 0 0 1-8 8H5l-4 3V11.5a9.5 9.5 0 1 1 19 0Z" transform="translate(1 -1) scale(.95)"/><path d="M7 9h9M7 13h6"/></svg><span id="service-chat-label">Ask assistant</span></button></div>
  <div class="workspace-grid workspace-view" id="workspace-grid"><section class="library-panel" id="library-panel" hidden><div class="panel-heading"><div><h2 id="library-title">Memory library</h2><span id="card-count" class="subtle"></span></div><div class="library-heading-actions">${button('add-own-service','Add a service','primary','id="add-service" hidden')}${button('import-services','Import services','secondary','id="import-services" hidden')}${button('new-note','Add memory','secondary','id="add-memory" hidden')}${button('documents','Manage files','quiet','id="manage-files" hidden')}</div></div><div class="library-tools"><label class="search"><span>⌕</span><input id="search" placeholder="Search saved memory" aria-label="Search saved cards"></label><select id="category-filter" aria-label="Filter services by category" hidden></select><select id="service-visibility" aria-label="Filter by service visibility" hidden><option value="active">Active services</option><option value="removed">Removed services</option></select><select id="document-filter" aria-label="Filter by source" hidden></select><select id="memory-kind-filter" aria-label="Filter memory type" hidden><option value="all">All memory</option><option value="notes">Personal notes</option><option value="feedback">Service results & notes</option><option value="chats">Saved conversations</option><option value="documents">Document cards</option></select><p class="library-source-note" id="library-source-note" hidden>Confirm current eligibility and capacity with the provider.</p></div><div id="cards" class="cards-scroll"></div><div id="paging" class="paging"></div></section>
  <section class="chat-panel" id="chat-panel" aria-labelledby="assistant-title" tabindex="-1"><div class="panel-heading"><div><h2 id="assistant-title">Ask your assistant</h2><span class="subtle" id="workspace-label"></span><span class="model-status" id="model-status"></span></div><div class="chat-header-actions">${button('add-chat-service','Add a service','secondary','id="chat-add-service" hidden')}${button('new-chat','New chat','secondary')}${button('expand-assistant','Open Workspace ↗','quiet','id="expand-assistant" hidden')}${button('minimize-assistant','×','icon-button','id="minimize-assistant" aria-label="Minimize assistant" hidden')}</div></div><div id="messages" class="messages"></div><div id="selected-context"></div><div id="case-archived-banner" class="case-archived-banner" hidden></div><form id="composer" class="composer"><label for="message" class="sr-only">Your message</label><textarea id="message" rows="3" placeholder="Ask about a service or document, or tell me what to remember…"></textarea><div class="composer-controls"><span class="automatic-memory">Type “Remember that …” to save a note.</span><div class="composer-actions">${button('import','＋ &nbsp; Add a document','secondary','id="add-document"')}${button('voice','◉ &nbsp; Speak','secondary','id="voice-button"')}${button('send','Send ↑','primary','id="send-button"')}</div></div><div class="composer-help" id="voice-status" role="status"></div></form><p class="privacy-line">AI questions send relevant text to OpenAI. Keep patient names and identifiers out.</p></section></div></div>`;
  $('case-search').addEventListener('input',()=>{
    caseFilter=$('case-search').value;
    $('case-list').scrollTop=0;
    renderCases();
  });
  $('case-action-menu').addEventListener('beforetoggle',event=>{
    if(event.newState==='closed'){
      caseMenuTrigger?.setAttribute('aria-expanded','false');
      caseMenuTrigger=null;
      event.currentTarget.replaceChildren();
    }
  });
  $('case-list').addEventListener('scroll',()=>hideCaseMenu());
  window.addEventListener('resize',()=>hideCaseMenu());
  $('message').addEventListener('input',scheduleCaseDraft);
  $('messages').addEventListener('input',event=>rememberFeedbackDraft(event.target));
  $('messages').addEventListener('change',event=>rememberFeedbackDraft(event.target));
  $('messages').addEventListener('input',event=>{
    const form=event.target.closest('[data-service-form]');
    if (form) updateInlineServiceForm(form,event.target.name);
  });
  $('messages').addEventListener('toggle',event=>{
    const form=event.target.closest('[data-service-form]');
    if (form?.isConnected&&event.target.matches('.inline-service-more')&&event.target.open!==Boolean(serviceFormDrafts.get(form.dataset.serviceForm)?.expanded)) {
      const id=form.dataset.serviceForm;
      const draft=inlineServiceDraft(id,messages.find(message=>message.id===id)?.service_form);
      draft.expanded=event.target.open;
      serviceFormDrafts.set(id,draft);
    }
  },true);
  $('messages').addEventListener('submit',event=>{
    if (!event.target.matches('[data-service-form]')) return;
    event.preventDefault();
    saveInlineServiceForm(event.target).catch(fail);
  });
  $('search').addEventListener('input',()=>{query=$('search').value;offset=0;memoryHistoryOffset=0;clearTimeout(shell.searchTimer);shell.searchTimer=setTimeout(()=>loadCards().catch(fail),150);});
  $('document-filter').addEventListener('change',()=>{documentFilter=$('document-filter').value;includeArchived=false;offset=0;memoryHistoryOffset=0;loadCards().catch(fail);});
  $('category-filter').addEventListener('change',()=>{category=$('category-filter').value;offset=0;loadCards().catch(fail);});
  $('service-visibility').addEventListener('change',()=>{
    showRemovedServices=$('service-visibility').value==='removed';
    offset=0;
    loadCards().catch(fail);
  });
  $('memory-kind-filter').addEventListener('change',()=>{memoryKind=$('memory-kind-filter').value;offset=0;memoryHistoryOffset=0;loadCards().catch(fail);});
  $('composer').addEventListener('submit',event=>{event.preventDefault();sendMessage().catch(fail);});
  $('message').addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendMessage().catch(fail);}});
  renderLibraryMode();renderMessages();
}
function inlineServiceDraft(messageId, fields) {
  const prior=serviceFormDrafts.get(messageId);
  if (prior) return prior;
  const values=cleanServiceFields(fields);
  const known=serviceAreaChoices.find(area=>area.toLowerCase()===values.area.toLowerCase());
  return {
    caseId:activeCase?.id, values, area:known||(values.area?customServiceArea:''), otherArea:known?'':values.area,
    expanded:false, error:'', saving:false
  };
}
function renderInlineServiceField([name,label,limit], draft, categoryList) {
  if (name==='area') {
    const options=[['','Choose an area'], ...serviceAreaChoices.map(area=>[area,area]), [customServiceArea,'Other or multiple areas']];
    return `<label>Service area<select name="area_choice">${options.map(([value,text])=>
      `<option value="${e(value)}" ${draft.area===value?'selected':''}>${e(text)}</option>`).join('')}</select></label>
      <label class="inline-service-wide" data-custom-service-area ${draft.area===customServiceArea?'':'hidden'}>Other or multiple areas
        <input name="area_other" maxlength="${limit}" value="${e(draft.otherArea)}" placeholder="Enter the area or communities served"></label>`;
  }
  const value=e(draft.values[name]||'');
  if (name==='details') return `<label class="inline-service-wide">${e(label)}<textarea name="${name}" rows="2" maxlength="${limit}">${value}</textarea></label>`;
  return `<label>${e(label)}<input name="${name}" maxlength="${limit}" value="${value}"
    ${name==='category'?`list="${categoryList}" placeholder="Choose or type a category"`:name==='phone'?'inputmode="tel"':name==='email'?'inputmode="email"':''}></label>`;
}
function renderChatServiceForm(message) {
  const saved=message.cards?.[0];
  if (saved || message.service_form_saved || activeCase?.status!=='active') {
    const receipt=saved ? 'Added '+saved.title+' to Known services.' : message.service_form_saved
      ? 'The service was added to Known services. The saved card is no longer available.'
      : 'Reopen this conversation to finish the service form.';
    const wrappingUp=activeCase?.completion?.kind==='service-added' && activeCase.completion.message_id===message.id;
    const use=saved && !wrappingUp && activeCase?.status==='active' && !saved.archived && !saved.removed_from_directory;
    return `<article class="message assistant" data-message-sequence="${message.sequence||''}">
      <div class="message-label">ASSISTANT</div>
      <div class="answer-summary service-form-reply">
        <p>${e(receipt)}</p>
        ${saved?button('open-card','View saved service','quiet',`data-id="${e(saved.id)}" data-service-form-saved="${e(message.id)}"`):''}
        ${use?button('chat-followup-start','Use this service','quiet',`data-id="${e(saved.id)}" data-reply-id="${e(message.id)}"`):''}
      </div>
    </article>`;
  }
  const draft=inlineServiceDraft(message.id,message.service_form);
  const formTitle=`service-form-title-${e(message.id)}`;
  const categoryList=`service-categories-${e(message.id)}`;
  const fields=basic=>serviceFields.filter(([name])=>basicServiceFields.has(name)===basic)
    .map(field=>renderInlineServiceField(field,draft,categoryList)).join('');
  const categories=(state?.serviceCategories||[]).map(category=>`<option value="${e(category)}"></option>`).join('');
  const content=`<form class="answer-summary service-form-reply inline-service-form" aria-labelledby="${formTitle}" data-service-form="${e(message.id)}">
        <h3 id="${formTitle}">Add a service</h3>
        <p>Fill in any one detail to save.</p>
        <fieldset>
          <div class="inline-service-fields">${fields(true)}<datalist id="${categoryList}">${categories}</datalist></div>
          <details class="inline-service-more" ${draft.expanded?'open':''}><summary>More details</summary>
            <div class="inline-service-fields">${fields(false)}</div>
          </details>
          <p class="inline-service-error" role="alert" ${draft.error?'':'hidden'}>${e(draft.error)}</p>
          <button type="submit" class="primary">${draft.saving?'Saving…':'Save service'}</button>
        </fieldset>
      </form>`;
  return `<article class="message assistant" data-message-sequence="${message.sequence||''}">
    <div class="message-label">ASSISTANT</div>${content}</article>`;
}
function rememberInlineServiceForm(form) {
  const id=form.dataset.serviceForm;
  const message=messages.find(item=>item.id===id);
  const draft=inlineServiceDraft(id,message?.service_form);
  const data=new FormData(form);
  draft.area=String(data.get('area_choice')||'');
  draft.otherArea=String(data.get('area_other')||'');
  draft.values=Object.fromEntries(serviceFields.map(([name])=>[name,String(data.get(name)||'')]));
  draft.values.area=draft.area===customServiceArea?draft.otherArea:draft.area;
  draft.expanded=form.querySelector('details').open;
  serviceFormDrafts.set(id,draft);
  return draft;
}
function updateInlineServiceForm(form, changedField) {
  if (form.querySelector('fieldset').disabled) return;
  const draft=rememberInlineServiceForm(form);
  if (changedField==='area_choice') form.querySelector('[data-custom-service-area]').hidden=draft.area!==customServiceArea;
  draft.error='';
  form.querySelector('.inline-service-error').hidden=true;
}
async function saveInlineServiceForm(form) {
  const messageId=form.dataset.serviceForm;
  const caseId=activeCase?.id;
  if (busy||caseChanging||activeCase?.status!=='active'||form.querySelector('fieldset').disabled) return;
  const draft=rememberInlineServiceForm(form);
  draft.error='';
  draft.saving=true;
  updateFollowupControls();
  form.querySelector('button[type="submit"]').textContent='Saving…';
  try {
    const {card_id,title,completion}=await api('save-service-form',{case_id:caseId,message_id:messageId,values:draft.values});
    serviceFormDrafts.delete(messageId);
    const reply=activeCase?.id===caseId&&messages.find(message=>message.id===messageId);
    if (reply) {
      reply.cards=[{id:card_id,title}];
      reply.service_form_saved=true;
      activeCase.completion=completion;
      manualWrapUp=false;
      renderMessages();
      if (!focusCompletionMessage()) {
        document.querySelector(`[data-service-form-saved="${CSS.escape(messageId)}"]`)?.focus({preventScroll:true});
      }
    }
  } catch(error) {
    draft.error=error.message;
    const current=$('messages').querySelector(`[data-service-form="${CSS.escape(messageId)}"]`);
    if (current) {
      const status=current.querySelector('.inline-service-error');
      status.textContent=draft.error;
      status.hidden=false;
    }
  } finally {
    draft.saving=false;
    const current=$('messages').querySelector(`[data-service-form="${CSS.escape(messageId)}"]`);
    if (current) current.querySelector('button[type="submit"]').textContent='Save service';
    updateFollowupControls();
  }
}
function answerCardsHTML(reply) {
  const cards = reply.cards;
  const grid = items => `<div class="answer-cards">${items.map(card=>answerCardHTML(card,reply)).join('')}</div>`;
  if (reply.presentation!=='service-options' || !cards.every(card=>Object.hasOwn(recommendationGroups,card.card_source_group))) {
    return grid(cards);
  }
  const groups = new Map();
  for (const card of cards) {
    const key = card.card_source_group;
    if (!groups.has(key)) groups.set(key,[]);
    groups.get(key).push(card);
  }
  return `<div class="answer-groups">${[...groups].map(([group,items])=>
    `<section class="answer-group" data-source-group="${group}" aria-label="${recommendationGroups[group]}">
      <h3>${recommendationGroups[group]}</h3>${grid(items)}
    </section>`).join('')}</div>`;
}
function renderMessages(forceScroll=false, {scrollToReply=false}={}){
  const viewport=$('messages'),follow=forceScroll||viewport.scrollHeight-viewport.scrollTop-viewport.clientHeight<80,previous=viewport.scrollTop;
  viewport.innerHTML=(caseHasMore?button('earlier-messages','↑ Earlier messages','quiet earlier-messages'):'')+(messages.length?messages.map((m,index)=>{
    if (m.followup) return renderChatFollowup(m);
    if (m.role==='assistant' && m.presentation==='service-form' && !m.error) return renderChatServiceForm(m);
    const pending=m.role==='assistant'&&busy&&index===messages.length-1&&!m.source;
    const cardsOnly=Boolean(m.cards?.length)&&m.role==='assistant'&&!m.error&&(m.presentation==='service-options'||!m.presentation&&!m.calculations?.length&&m.cards?.some(isService));
    const answer=pending?'<div class="answer-summary answer-pending" role="status">Finding the useful details…</div>':cardsOnly?'':`<div class="${m.role==='assistant'?'answer-summary'+(m.error?' answer-error':''):'message-text'}">${textHTML(m.text||'No answer is available. Please retry.')}</div>`;
    return `<article class="message ${m.role}" data-message-sequence="${m.sequence||''}"><div class="message-label">${m.role==='user'?'YOU':'ASSISTANT'}${m.source?`<span>${e(m.source==='chatgpt'?'ChatGPT':m.source==='local'?'Saved information':m.source==='error'?'Connection interrupted':m.source)}</span>`:''}${m.saved?'<span class="saved-marker">Saved to memory</span>':''}</div>${answer}${!pending&&m.cards?.length?answerCardsHTML(m):''}${!pending&&m.calculations?.length?`<div class="calculation-proof">${m.calculations.map(c=>`<div>Calculated from ${e(c.matched_rows)} matching row(s) · ${e(c.operation)}${c.column?' of '+e(c.column):''}${c.value!==undefined?' = '+e(c.value??'No numeric values'):''}</div>`).join('')}</div>`:''}${m.role==='assistant'&&m.error?button('retry','Retry question','quiet',`data-index="${index}"`):''}</article>`;
  }).join(''):`<div class="chat-welcome"><img class="welcome-icon" src="care-navigation-logo.png" alt=""><h2>A clearer way to work<br>with your information.</h2><p>Ask a question, add a document, or keep a case conversation for later.</p><div class="prompt-chips">${button('prompt','Find a local service','prompt',`data-prompt="Find transportation services in North York. Show the service cards and contact details."`)}${button('prompt','Summarize a document','prompt',`data-prompt="Summarize my latest imported document. Highlight anything I should follow up on."`)}${button('prompt','Recall my notes','prompt',`data-prompt="What have I saved in my personal notes? Show the matching cards."`)}</div><small>Use a case title without patient names or identifiers.</small></div>`)
    +(caseHasNewer ? button('latest-messages','↓ Latest messages','quiet latest-messages') : '')
    +(!busy && activeCase?.status === 'active' && (manualWrapUp || activeCase.completion)
      ? completionMessage(activeCase.completion) : '');
  updateFollowupControls();
  if (forceScroll) {
    const replies = viewport.querySelectorAll(scrollToReply ? '.message:not(.completion-message)' : '.message');
    const last = replies[replies.length - 1];
    const top = last ? last.getBoundingClientRect().top - viewport.getBoundingClientRect().top + viewport.scrollTop : viewport.scrollHeight;
    viewport.scrollTo({top,behavior:'instant'});
  } else {
    viewport.scrollTop=follow?viewport.scrollHeight:previous;
  }
}
function setBusy(value){busy=value;$('send-button').textContent=value?'Stop':'Send ↑';$('message').disabled=value||caseChanging;$('add-document').disabled=value||caseChanging||importing;$('voice-button').disabled=value||caseChanging;renderAssistantSurface();renderUndo();updateFollowupControls();}
async function sendMessage(retryText=null,retryTurnId=null,{keepDraft=false}={}){
  if(busy){await api('stop');return;}if(caseChanging)return;
  setBusy(true);let response=null;
  try{
    if(voice.listening)await voice.stop();
    const text=(retryText||$('message').value).trim();if(!text)return;
    if(activeCase?.status==='archived')throw new Error('Reopen this saved case to continue.');
    await flushCaseDraft();
    manualWrapUp=false;
    messages.push({role:'user',text});response={role:'assistant',text:''};messages.push(response);
    if (!keepDraft) $('message').value='';
    renderMessages(true);
    const answer=await api('chat',{text,case_id:activeCase?.id,retry_turn_id:retryTurnId,card_id:selected?.id||null});Object.assign(response,answer,{id:answer.turn_id});response.error=answer.source==='error';await refresh();
  }catch(error){if(response){response.text=error.message;response.error=true;response.source='error';}else fail(error);}
  finally{
    if(response?.turn_id&&activeCase){try{const result=await api('get-case',{id:activeCase.id});activeCase=result;caseHasMore=result.has_more;caseHasNewer=result.has_newer;messages=result.messages.map(fromCaseMessage);renderCaseTitle();}catch{}}
    setBusy(false);
    renderMessages(true,{scrollToReply:true});
    if (keepDraft) await flushCaseDraft();
    const form=response?.turn_id&&$('messages').querySelector(`[data-service-form="${CSS.escape(response.turn_id)}"]`);
    if (!$('chat-panel').hidden) (form?.elements.name||$('message')).focus({preventScroll:true});
  }
}
function context(){ $('selected-context').innerHTML=selected?`<div class="context-chip ${isService(selected)?'service-context':''}"><div class="context-main"><span>Working with <strong>${e(selected.title)}</strong></span>${button('clear-selection','×','icon-button','aria-label="Stop working with this card"')}</div></div>`:'';}
function resultDraft(){return feedbackEditor?{outcome:feedbackEditor.outcome,rating:$('result-rating')?.value||'',body:$('result-note')?.value||''}:null;}
function discardResult(){return !feedbackEditor||JSON.stringify(resultDraft())===feedbackEditor.initial||confirm('Discard this unsaved service result? Choose Cancel to keep editing.');}
async function openModal(content,kind=''){if(feedbackSaving)throw new Error('Wait for the service result to finish saving.');if(!discardResult())throw new Error('Save the result or choose Cancel result before leaving.');await flushNote();noteEditor=null;feedbackEditor=null;cardHistory=null;modal.className=kind;modal.innerHTML=content;if(!modal.open)modal.showModal();}
function modalHead(title,subtitle=''){return`<div class="modal-heading"><div><h2 id="modal-title">${e(title)}</h2>${subtitle?`<p>${e(subtitle)}</p>`:''}</div>${button('close-modal','×','icon-button','aria-label="Close panel"')}</div>`;}
async function closeModal(){
  if(feedbackSaving||serviceEditor?.saving||trackingReview?.saving||documentCardEditor?.saving)throw new Error('Wait for this change to finish saving.');
  if(!discardResult())return false;
  await flushNote();
  if(preview?.id||serviceEditor?.importId||trackingReview)await api('cancel-import');
  preview=null;
  documentCardEditor=null;
  trackingReview=null;
  serviceEditor=null;noteEditor=null;feedbackEditor=null;cardHistory=null;
  modal.close();modal.replaceChildren();return true;
}
async function openCard(id, {replyId=null,fromFollowup=false,rankReason=''}={}) {
  await flushNote();
  const card=await api('get-card',{id});
  if (card.case_info) {
    if (modal.open&&!await closeModal()) return;
    await loadCase(card.case_info.id,{activate:false});
    await changeLibraryMode('workspace');
    return;
  }
  const service=isService(card);
  const own=card.source_format===OWN_SERVICE_FORMAT;
  const servicePreview=service||Boolean(replyId)||fromFollowup;
  const addFromDetails=!replyId&&!fromFollowup;
  const hasResults=servicePreview||card.comments.some(note=>note.outcome);
  const idAttr=`data-id="${e(card.id)}"`;
  const fields=Object.entries(card.fields||{}).filter(([key])=>own
    ? !(card.contacts?.length && ['Phone','Email','Contact name'].includes(key))
    : !servicePreview||!/\b(?:phone|telephone|email|e-mail|fax|contact|tel)\b/i.test(key));
  const cardFields=fields.length?`<dl class="field-list" id="card-fields">${fields.map(([key,value])=>
    `<div><dt>${e(key)}</dt><dd>${e(value)}</dd></div>`).join('')}</dl>`:
    `<div class="source-text">${textHTML(servicePreview?card.body.split('\n')[0]:card.body)}</div>`;
  const notes=`<section class="detail-section ${servicePreview?'service-history':''}" id="card-history"
    ${addFromDetails||card.comments.length?'':'hidden'}>
    <div class="section-title"><div class="note-source-heading"><h3>${hasResults?'Your notes & results':'Your notes & corrections'}</h3> ${sourceTag()}</div>
    ${servicePreview&&addFromDetails?button('focus-card-note','Add a note','quiet'):''}</div>
    ${hasResults?`<div id="service-experience">${experienceHTML(card.experience)}</div>
      <p id="service-history-status" class="saved-status" role="status"></p>`:''}
    ${inputTools()}<div id="card-notes">${notesHTML(card.comments)}</div>
    ${hasResults?'<div id="service-result-editor" hidden></div>':''}
    <div id="card-note-editor" ${servicePreview?'hidden':''}>
      <label class="sr-only" for="card-note">Add a note or correction</label>
      <textarea id="card-note" rows="2" maxlength="12000" placeholder="Add a note"></textarea>
      <div class="note-status"><span id="note-status">Notes save automatically when you pause.</span>
      ${button('new-card-note','New note','quiet')}</div>
    </div></section>`;
  const contacts=(own||!servicePreview)&&card.contacts?.length?`<section class="detail-section" id="service-contacts">
    <div class="note-source-heading"><h3>Contacts in the source</h3> ${sourceTag(card.source_format)}</div>${card.contacts.map(contact=>`<div class="contact-row">
      <div><strong>${e(contact.name||'Listed '+contact.kind)}</strong><span>${e(contact.value)}</span></div>
      ${button('copy-contact','Copy','quiet',`${idAttr} data-value="${e(contact.value)}"`)}</div>`).join('')}</section>`:'';
  const links=card.links?.length?`<section class="detail-section"><h3>Source links</h3>${card.links.map(url=>
    button('open-link',e(url)+' ↗','source-link',`data-url="${e(url)}"`)).join('')}</section>`:'';
  const pick=servicePreview&&!fromFollowup&&!card.archived&&!card.removed_from_directory?button('use-service-from-details','Use this service','primary',
    `${idAttr} data-reply-id="${e(replyId||'')}"`):'';
  const provider=card.links?.find(url=>url===card.fields?.['Provider page']);
  const restore=service&&!card.archived&&card.removed_from_directory
    ? button('restore-known-service','Restore to Known services','secondary',idAttr):'';
  const footer=service?pick+button('use-card','Ask more about this card','secondary',idAttr)+
    (provider?button('open-link','Provider page ↗','secondary',`data-url="${e(provider)}"`):'')+restore:
    pick+button('use-card','Ask about this card',pick?'secondary':'primary',idAttr)+
    (addFromDetails?button('focus-card-note','Add a note','secondary'):'')+
    (card.document_id?button('open-original','Open original file ↗','secondary',`data-id="${e(card.document_id)}"`):
      button('edit-note','Edit note','secondary',idAttr))+button('delete-card','Delete card','danger quiet',idAttr);
  const missing=card.missing_details||[];
  const gaps=missing.length?`<p class="callout">Needs details · ${e(missing.join(', '))}</p>`:'';
  const ranking=rankReason?`<details class="card-ranking"><summary>Why this rank</summary><p>${e(rankReason)}</p></details>`:'';
  const ownDetails=own?`<section class="detail-section">
    <div class="section-title"><h3>Service details</h3>
      ${button('edit-own-service','Edit details','secondary',idAttr)}</div>
    ${cardFields}
    ${card.has_original?button('open-original','Open source file ↗','quiet',`data-id="${e(card.document_id)}"`):''}
    </section>`:'';
  await openModal(modalHead(card.title,fileLabel(card))+`<div class="detail-body">
    ${card.removed_from_directory?'<p class="callout">Removed from Known services. Use Restore to show it again.</p>':''}
    ${card.archived?'<p class="callout">This row was removed in a newer import. Its notes have been kept.</p>':''}
    ${gaps}${ranking}${own?notes+contacts+ownDetails:servicePreview?notes+cardFields:cardFields+contacts+notes}${links}</div><div class="modal-footer">${footer}</div>`,'card-dialog');
  noteEditor={cardId:id,id:null,version:null,body:'',saved:'',queue:Promise.resolve()};
  $('card-note').addEventListener('input',()=>{noteEditor.body=$('card-note').value;$('note-status').textContent='Saving…';clearTimeout(noteTimer);noteTimer=setTimeout(()=>flushNote().catch(fail),800);});
  await refreshCardHistoryControls(id);
}
function notesHTML(comments){return comments?.length?[...comments].sort((a,b)=>b.updated_at.localeCompare(a.updated_at)||b.id.localeCompare(a.id)).map(n=>`<div class="saved-note" data-note-id="${e(n.id)}">${resultBadge(n)}<p>${textHTML(n.body)}</p><div class="note-actions"><small>${e(date(n.updated_at))}</small>${button('edit-card-comment','Edit','quiet',`data-id="${e(n.id)}"`)}${button('delete-card-comment','Delete','quiet danger',`data-id="${e(n.id)}"`)}</div></div>`).join(''):'<p class="subtle no-notes">No notes yet.</p>';}
function updateCardHistory(card){
  $('card-notes').innerHTML=notesHTML(card.comments);
  if ($('service-experience')) $('service-experience').innerHTML=experienceHTML(card.experience);
  if (updateChatServiceExperience(card.id,card)&&!busy&&!caseChanging) renderMessages();
}
async function startServiceResult(id,editId) {
  if(busy)throw new Error('Wait for this answer or choose Stop before recording a result.');
  if(feedbackSaving)throw new Error('Wait for the current result to save.');
  if(!modal.open||noteEditor?.cardId!==id)await openCard(id);
  await flushNote();$('card-note-editor').hidden=true;const card=await api('get-card',{id}),note=card.comments.find(n=>n.id===editId&&n.outcome);
  if(!note)throw new Error('This service result is no longer available. Reopen the card.');
  if(feedbackEditor&&!discardResult())return;
  feedbackEditor={cardId:id,id:note.id,version:note.version,outcome:note.outcome};
  $('service-result-editor').innerHTML=`<div class="result-editor-heading"><h3>Edit service result</h3></div>
    <fieldset class="result-outcomes"><legend>What happened?</legend>
    ${button('choose-service-result','✓ Worked','secondary',`data-outcome="worked" aria-pressed="${note.outcome==='worked'}"`)}
    ${button('choose-service-result',"Didn't work",'secondary',`data-outcome="not_worked" aria-pressed="${note.outcome==='not_worked'}"`)}</fieldset>
    <label for="result-rating">Your rating (optional)<select id="result-rating" class="rating-select">${ratingOptions(note.rating)}</select></label>
    <label for="result-note">What happened? (optional)<textarea id="result-note" rows="3" maxlength="12000">${e(note.body===resultLabel(note.outcome)+'.'?'':note.body)}</textarea></label>
    <div class="result-editor-actions">${button('save-service-result','Save changes','primary','id="save-service-result"')}
    ${button('cancel-service-result','Cancel result','quiet')}</div><p id="result-status" class="saved-status" role="status"></p>`;
  $('service-result-editor').hidden=false;feedbackEditor.initial=JSON.stringify(resultDraft());
  $('service-result-editor').scrollIntoView({block:'center',behavior:'instant'});$('result-note').focus({preventScroll:true});
}
async function saveServiceResult(){
  if(!feedbackEditor||feedbackSaving)return;const draft=resultDraft(),editor=feedbackEditor;
  if(!draft.outcome){$('result-status').textContent='Choose Worked or Didn’t work before saving.';return;}
  feedbackSaving=true;$('save-service-result').disabled=true;$('result-status').textContent='Saving…';
  try{await flushNote();await api('save-service-result',{card_id:editor.cardId,id:editor.id,expected_version:editor.version,outcome:draft.outcome,rating:draft.rating?Number(draft.rating):null,body:draft.body});feedbackEditor=null;$('service-result-editor').hidden=true;
    const card=await api('get-card',{id:editor.cardId});updateCardHistory(card);await refreshCardHistoryControls(card.id);if(selected?.id===card.id){selected=card;context();}
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
      if(editor===noteEditor){const card=await api('get-card',{id:editor.cardId});updateCardHistory(card);await refreshCardHistoryControls(card.id);$('note-status').textContent='✓ Saved on this card';}
      await loadCards();
    }catch(error){if(editor===noteEditor)$('note-status').textContent='Not saved: '+error.message;throw error;}
  });await editor.queue;
}
function serviceEditorHTML(editor) {
  const row=editor.rows[editor.index];
  const list=editor.importId?`<div class="service-review-tools">
    <label>Source row<select id="service-review-row">${editor.rows.map((item,index)=>
      `<option value="${index}" ${index===editor.index?'selected':''}>${e(item.values.name||'Unnamed service')} · ${e(item.locator)}</option>`).join('')}</select></label>
    <label class="service-include"><input id="include-service-row" type="checkbox" ${row.include?'checked':''}> Include this row</label>
    <p id="service-review-count" role="status"></p>
    <p class="subtle">Rows without a name start unchecked. Give them a name and include them if they belong in the directory.</p>
    ${editor.previous?`<p class="callout">${editor.previous.can_update?
      'Update the saved inventory to keep feedback on matching cards. Rows removed from the workbook are kept as previous rows.':
      'Matching rows need unique Service IDs before this inventory can be updated.'}</p>`:''}
    ${editor.warnings.map(warning=>`<p class="callout">${e(warning)}</p>`).join('')}</div>`:'';
  const fields=serviceFields.map(([name,label,limit])=>{
    const value=e(row.values[name]||'');
    const property=`id="service-field-${name}" data-service-field="${name}" maxlength="${limit}"`;
    return `<label ${name==='details'?'class="service-description"':''}>${e(label)}
      ${name==='details'?`<textarea ${property} rows="3">${value}</textarea>`:
        `<input ${property} value="${value}" ${name==='category'?'list="service-category-choices" placeholder="Choose or type a category"':name==='name'&&editor.importId?'aria-required="true"':''}>`}</label>`;
  }).join('');
  const options=(state?.serviceCategories||[]).map(category=>`<option value="${e(category)}"></option>`).join('');
  return modalHead(editor.importId?'Review services':editor.card?'Edit service details':'Add a service',editor.filename||'Own source')+
    `<div class="detail-body service-editor-body">${list}
      ${editor.importId?'':'<p class="subtle">Enter one detail to save. You can fill in the rest later.</p>'}
      <div class="service-editor-fields">${fields}<datalist id="service-category-choices">${options}</datalist></div>
      <ul id="service-questions" class="service-questions" aria-live="polite"></ul>
      <p id="service-editor-error" class="callout" hidden></p>
    </div><div class="modal-footer">
      ${editor.previous?.can_update?button('update-service-inventory','Update saved inventory','primary'):''}
      ${button('save-own-service',editor.inventoryOverview?'Save to Known services':editor.importId?'Add selected services':'Save service',editor.previous?.can_update?'secondary':'primary')}
      ${editor.inventoryOverview ? button('back-to-inventory-preview','Back to preview','quiet') : button('close-modal','Cancel','quiet')}</div>`;
}
function importPreviewCard(section,index,action) {
  const title=section.title||'Untitled card';
  return `<div class="import-preview-row"><div><strong>${e(title)}</strong><span>${e(section.locator)}</span>
    ${section.body?`<p>${e(section.body)}</p>`:''}</div>
    ${button(action,'Edit','secondary',`data-index="${index}" aria-label="${e('Edit '+title)}"`)}</div>`;
}
function inventoryPreviewHTML(editor) {
  const included=editor.rows.filter(row=>row.include).length;
  const cards=editor.rows.slice(0,8).map((row,index)=>{
    const description=serviceFields.filter(([name])=>name!=='name'&&row.values[name])
      .map(([name,label])=>label+': '+row.values[name]);
    return importPreviewCard({title:row.values.name||'Unnamed service',locator:row.locator,
      body:description.slice(0,7).join('\n')+(row.include?'':'\nExcluded from this import')},index,'edit-inventory-preview-row');
  });
  return modalHead('Review your document',editor.filename)+`<div class="detail-body">
    <div class="import-count"><strong>${included}</strong><span>services ready to save</span></div>
    <p>Save these cards to Known services to use them in recommendations. You can also find the source in Manage memory.</p>
    <p class="subtle">The original file and extracted cards stay on this computer.</p>
    ${editor.warnings.map(warning=>`<p class="callout">${e(warning)}</p>`).join('')}
    <h3>Preview · first ${cards.length} cards</h3>
    <div class="import-preview">${cards.join('')}</div>
    ${editor.rows.length>cards.length?button('review-all-inventory-rows','Review all rows','secondary'):''}
    <p id="service-editor-error" class="callout" role="alert" hidden></p>
  </div><div class="modal-footer">
    ${editor.previous?.can_update?button('update-service-inventory','Update saved inventory','primary'):''}
    ${button('save-own-service','Save to Known services',editor.previous?.can_update?'secondary':'primary')}
    ${button('close-modal','Cancel','quiet')}</div>`;
}
function editInventoryPreviewRow(index) {
  const editor=serviceEditor;
  if (!editor?.importId||editor.saving||!editor.rows[index]) return;
  editor.index=index;
  modal.innerHTML=serviceEditorHTML(editor);
  modal.scrollTop=0;
  updateServiceEditor();
  $('service-field-name').focus({preventScroll:true});
}
function showInventoryPreview() {
  const editor=serviceEditor;
  if (!editor?.inventoryOverview||editor.saving) return;
  modal.innerHTML=inventoryPreviewHTML(editor);
  (modal.querySelector(`[data-action="edit-inventory-preview-row"][data-index="${editor.index}"]`)||
    modal.querySelector('[data-action="review-all-inventory-rows"]'))?.focus();
}
function updateServiceEditor() {
  const {rows,index,importId}=serviceEditor;
  const row=rows[index];
  const questions=missingServiceDetails(cleanServiceFields(row.values));
  $('service-questions').hidden=!questions.length;
  $('service-questions').innerHTML=questions.map(question=>`<li>${e(question)}</li>`).join('');
  if (importId) {
    const included=rows.filter(item=>item.include);
    row.incomplete=Boolean(questions.length);
    const incomplete=included.filter(item=>item.incomplete).length;
    $('service-review-count').textContent=included.length+' of '+rows.length+' rows selected'+(incomplete?' · '+incomplete+' need details':'');
    $('service-review-row').options[index].textContent=(row.values.name||'Unnamed service')+' · '+row.locator;
  }
}
async function openServiceEditor({card=null, review=null, inventoryOverview=false}={}) {
  const rows=review?review.rows.map(row=>({...row,incomplete:Boolean(missingServiceDetails(row.values).length)})):
    [{values:serviceDraft(card||{},{nameFromOrganization:false}).values,include:true}];
  const index=review?Math.max(0, rows.findIndex(row=>missingServiceDetails(row.values).length)):0;
  const editor={card, rows, index, importId:review?.id, filename:review?.filename, previous:review?.previous,
    warnings:review?.warnings||[], changed:new Set(), saving:false,inventoryOverview};
  await openModal(inventoryOverview?inventoryPreviewHTML(editor):serviceEditorHTML(editor),'service-editor-dialog');
  serviceEditor=editor;
  if (!inventoryOverview) updateServiceEditor();
}
async function reviewServiceFile(result) {
  if(result.duplicate){
    notice('These service cards are already in Known services.');
    return;
  }
  await openServiceEditor({review:result,inventoryOverview:result.service_inventory===true});
  preview=null;
}
async function saveOwnService(update=false) {
  const editor=serviceEditor;
  if(!editor||editor.saving)return;
  const {card,rows,importId,changed}=editor;
  const invalid=importId?rows.findIndex(row=>row.include&&!cleanServiceFields(row.values).name):-1;
  if (invalid>=0) {
    editor.index=invalid;
    modal.innerHTML=serviceEditorHTML(editor);
    updateServiceEditor();
    $('service-editor-error').textContent='Enter a name for this row, or uncheck it to skip it.';
    $('service-editor-error').hidden=false;
    $('service-field-name').focus();
    return;
  }
  if (!rows.some(row=>row.include)) {
    $('service-editor-error').textContent='Include at least one service row to save.';
    $('service-editor-error').hidden=false;
    return;
  }
  editor.saving=true;
  const controls=[...modal.querySelectorAll('button,input,select,textarea')];
  controls.forEach(control=>control.disabled=true);
  try {
    let count=1;
    if (importId) {
      // Keep each review update below the request size limit, even for large spreadsheets.
      for(const index of changed)await api('review-service-row',{id:importId,index,...rows[index]});
      count=(await api('confirm-service-import',{id:importId,update})).count;
    } else if (card) {
      await api('update-own-service',{id:card.id,expected_version:card.version,values:rows[0].values});
    } else {
      await api('add-own-service',{values:rows[0].values});
    }
    editor.saving=false;
    serviceEditor=null;
    await closeModal();
    if (card) {
      if (selected?.id===card.id) {selected=await api('get-card',{id:card.id});context();}
      await refresh();
      await openCard(card.id);
    } else {
      await changeLibraryMode('services');
      await refresh();
      $('cards').scrollTop=0;
    }
    notice(card?.archived?'Previous service row updated.':
      count?count===1?'Service saved in Known services.':count+' services saved in Known services.':'These service cards are already in Known services.');
  } catch(error) {
    if(serviceEditor===editor){
      $('service-editor-error').textContent=error.message;
      $('service-editor-error').hidden=false;
    }else throw error;
  } finally {
    editor.saving=false;
    controls.forEach(control=>control.disabled=false);
  }
}
async function reviewTrackingFile(review) {
  await openModal(modalHead('Review navigation outcomes',review.filename)+`<div class="detail-body">
    <p>Check the matching service and result against the Navigation worksheet. Only selected outcomes are saved.</p>
    <p class="subtle">The review shows the partner, inquiry date and source row. Case closure alone gives no service result.</p>
    ${review.rows.length ? `<div class="tracking-rows">${review.rows.map((row,index)=>{
      const available=!row.duplicate&&row.options.length>0;
      return `<fieldset data-tracking-row="${index}">
        <legend>${e(row.provider)} · ${e(row.locator)}${row.date?' · '+e(row.date):''}</legend>
        ${available ? `<label><input type="checkbox" data-tracker="include" ${row.include?'checked':''}> Include outcome</label>
          <label>Service<select data-tracker="card_id"><option value="">Choose service</option>${row.options.map(card=>
            `<option value="${e(card.id)}" ${row.card_id===card.id?'selected':''}>${e(card.title)}</option>`).join('')}</select></label>
          <label>Result<select data-tracker="outcome"><option value="">Review in workbook</option>
            <option value="worked" ${row.outcome==='worked'?'selected':''}>Worked</option>
            <option value="not_worked" ${row.outcome==='not_worked'?'selected':''}>Didn’t work</option></select></label>` :
          `<p class="subtle">${row.duplicate?'Already recorded. Edit the outcome in Manage memory.':'No matching service. Add the program to Known services and review the file again.'}</p>`}
      </fieldset>`;
    }).join('')}</div>` : '<p>No rows with a partner agency were found in Navigation.</p>'}
    <p id="tracking-import-error" class="callout" role="status" hidden></p>
    </div><div class="modal-footer">${review.rows.some(row=>!row.duplicate&&row.options.length)?button('save-tracking-results','Save selected outcomes','primary'):''}
    ${button('close-modal','Cancel','quiet')}</div>`,'service-editor-dialog');
  trackingReview={...review,saving:false};
}
async function saveTrackingResults() {
  const review=trackingReview;
  if(!review||review.saving)return;
  review.saving=true;
  const controls=[...modal.querySelectorAll('button,input,select')];
  controls.forEach(control=>control.disabled=true);
  try {
    for (const fieldset of modal.querySelectorAll('[data-tracking-row]')) {
      const include=fieldset.querySelector('[data-tracker="include"]');
      if(!include)continue;
      await api('review-tracking-row',{id:review.id,index:Number(fieldset.dataset.trackingRow),include:include.checked,
        card_id:fieldset.querySelector('[data-tracker="card_id"]').value,
        outcome:fieldset.querySelector('[data-tracker="outcome"]').value});
    }
    const result=await api('confirm-tracking-import',{id:review.id});
    trackingReview=null;
    await closeModal();
    await refresh();
    notice(result.count+' service outcome'+(result.count===1?'':'s')+' saved.');
  } catch(error) {
    const status=$('tracking-import-error');
    if(!status)throw error;
    status.textContent=error.message;
    status.hidden=false;
  } finally {
    review.saving=false;
    controls.forEach(control=>control.disabled=false);
  }
}
async function importDocument(sample=false,services=false){
  if(busy||importing)return;importing=true;$('add-document').disabled=true;$('add-document').textContent='Reading document…';
  try{const result=await api(sample?'sample-document':'pick-document',{services});if(result.cancelled)return;
    if(result.tracking){await reviewTrackingFile(result);return;}
    if(services||result.service_inventory){await reviewServiceFile(result);return;}
    if(result.duplicate){libraryMode='workspace';category='';query='';$('search').value='';documentFilter=result.document_id;await refresh();$('document-filter').value=documentFilter;notice('This document is already saved. Open Manage memory to review its cards.');return;}
    preview=result;
    await openModal(documentPreviewHTML(result),'import-dialog');
  }finally{importing=false;$('add-document').disabled=busy;$('add-document').textContent='＋ Add a document';}
}
function documentPreviewHTML(result) {
  return modalHead('Review your document',result.filename)+`<div class="detail-body">
    <div class="import-count"><strong>${result.count}</strong><span>cards ready to save</span></div>
    <p>The original file and extracted text will be kept on this computer. This import does not contact OpenAI.</p>
    ${result.warnings.map(warning=>`<p class="callout">${e(warning)}</p>`).join('')}
    ${result.previous?`<div class="callout"><strong>A document with this name is already saved.</strong>
      <p>Save separately to keep both. ${result.previous.can_update?'Or update matching rows using their unique ID or name. Attached notes are preserved and removed rows become previous rows.':'This file has no safe unique row keys, so it will be kept as a separate version.'}</p></div>`:''}
    <h3>Preview · first ${result.preview.length} cards</h3>
    <div class="import-preview">${result.preview.map((section,index)=>importPreviewCard({...section,body:section.body.slice(0,360)},index,'edit-document-preview-row')).join('')}</div>
  </div><div class="modal-footer">
    ${button('save-import','Save '+result.count+' cards','primary')}
    ${result.previous?.can_update?button('update-import','Update existing document','secondary'):''}
    ${SERVICE_FILE_TYPES.includes(result.format)?button('review-import-services','Add to Known services','secondary'):''}
    ${button('close-modal','Cancel','quiet')}</div>`;
}
function documentCardEditorHTML(card,fields,editingPreview) {
  return modalHead(editingPreview?'Edit card':'Edit document card',card.locator)+`<div class="detail-body">
    <label>Card title<input id="preview-card-title" maxlength="180" value="${e(card.title)}"></label>
    ${fields.length?fields.map(([key,value],position)=>`<label>${e(key)}
      <textarea id="preview-card-field-${position}" rows="2">${e(String(value??''))}</textarea></label>`).join(''):
      `<label>Card text<textarea id="preview-card-body" rows="9" maxlength="30000">${e(card.body)}</textarea></label>`}
    <p id="document-preview-error" class="callout" role="alert" hidden></p>
  </div><div class="modal-footer">
    ${editingPreview?button('save-document-preview-row','Apply changes','primary'):
      button('save-memory-document-card','Save changes','primary')}
    ${editingPreview?button('back-to-document-preview','Back to preview','quiet'):
      button('close-modal','Cancel','quiet')}</div>`;
}
async function editDocumentPreviewRow(index) {
  const pending=preview;
  if (!pending?.preview[index]||importing) return;
  const card=await api('review-document-card',{id:pending.id,index});
  if (preview!==pending) return;
  const fields=Object.entries(card.fields||{});
  documentCardEditor={index,card,fields,saving:false};
  modal.innerHTML=documentCardEditorHTML(card,fields,true);
  modal.scrollTop=0;
  $('preview-card-title').focus({preventScroll:true});
}
function showDocumentPreview() {
  if (!preview||documentCardEditor?.saving) return;
  const index=documentCardEditor?.index;
  documentCardEditor=null;
  modal.innerHTML=documentPreviewHTML(preview);
  modal.querySelector(`[data-action="edit-document-preview-row"][data-index="${index}"]`)?.focus();
}
async function applyDocumentCardEdit() {
  const editor=documentCardEditor;
  if (!editor||editor.saving) return;
  const {card,index}=editor;
  const editingPreview=index!==undefined;
  if (editingPreview&&!preview) return;
  const fields=Object.fromEntries(editor.fields.map(([key,value],position)=>{
    const input=$('preview-card-field-'+position).value;
    if (input===String(value??'')) return [key,value];
    const number=Number(input);
    return [key,typeof value==='number'&&input.trim()&&Number.isFinite(number)?number:input];
  }));
  editor.saving=true;
  const controls=[...modal.querySelectorAll('button,input,textarea')];
  controls.forEach(control=>control.disabled=true);
  try {
    const changes={title:$('preview-card-title').value,body:$('preview-card-body')?.value,fields};
    const updated=editingPreview
      ? await api('review-document-row',{id:preview.id,index,...changes})
      : await api('edit-document-card',{id:card.id,expected_version:card.version,...changes});
    editor.saving=false;
    if (editingPreview) {
      preview.preview[index]=updated;
      showDocumentPreview();
    } else {
      await closeModal();
      if (selected?.id===card.id) {selected=await api('get-card',{id:card.id});context();}
      await refresh();
      const editButton=$('cards').querySelector(`[data-action="edit-memory"][data-id="${CSS.escape(card.id)}"]`);
      (editButton || $('search')).focus({preventScroll:true});
      notice('Document card updated.');
    }
  } catch(error) {
    if (documentCardEditor!==editor) throw error;
    $('document-preview-error').textContent=error.message;
    $('document-preview-error').hidden=false;
  } finally {
    editor.saving=false;
    controls.forEach(control=>control.disabled=false);
  }
}
async function saveImport(update=false){if(!preview||importing)return;importing=true;modal.querySelectorAll('button').forEach(b=>b.disabled=true);
  try{const result=await api('confirm-import',{id:preview.id,update});libraryMode='workspace';category='';query='';$('search').value='';documentFilter=result.document_id;offset=0;preview=null;await closeModal();await refresh();$('document-filter').value=documentFilter;notice(result.updated?`${result.updated} matching cards updated. Notes kept.`:`${result.count} cards saved. You can ask about them now.`);$('message').focus();}
  finally{importing=false;modal.querySelectorAll('button').forEach(b=>b.disabled=false);}}
async function manageDocuments(){await refresh();await openModal(modalHead('Your documents','Originals and extracted cards stay on this computer.')+`<div class="detail-body document-list">${state.documents.length?state.documents.map(d=>`<article><div><strong>${e(d.filename)}</strong><p>${d.card_count} current cards · version ${d.version} · ${e(date(d.updated_at))}</p></div><div>${button('filter-document','Show cards','secondary',`data-id="${e(d.id)}"`)}${d.version>1?button('previous-rows','Include previous rows','quiet',`data-id="${e(d.id)}"`):''}${button('open-original','Open file ↗','quiet',`data-id="${e(d.id)}"`)}${button('delete-document','Delete','danger quiet',`data-id="${e(d.id)}"`)}</div></article>`).join(''):'<p>No documents imported yet.</p>'}</div>`);}
async function noteForm(id=null) {
  const card=id?await api('get-card',{id}):null;
  await openModal(modalHead(id?'Edit saved memory':'Add memory','')+`<form id="note-form" class="detail-body">
    <label>Title<input id="note-title" maxlength="140" value="${e(card?.title||'')}" placeholder="A short, useful title"></label>
    <label>Organization (optional)<input id="note-organization" maxlength="180" value="${e(card?.fields?.Organization||'')}"
      placeholder="For example, Routes Connecting Communities"></label>
    <label>Information to remember<textarea id="note-body" rows="7" maxlength="12000" required>${e(card?.body||'')}</textarea></label>
    <div class="modal-footer">${button('save-personal-note','Save memory','primary',`data-id="${e(id||'')}" data-version="${card?.version||''}"`)}</div></form>`);
  $('note-body').focus();
}
async function editMemory(target){
  const card=await api('get-card',{id:target.dataset.cardId});
  if (target.dataset.entryType==='comment') {
    const note=card.comments.find(n=>n.id===target.dataset.id);
    if (!note) throw new Error('This memory is no longer available. Refresh the list.');
    if (note.outcome) {await startServiceResult(card.id,note.id);return;}
    await openModal(modalHead('Edit saved feedback',card.title)+`<form class="detail-body"><label>Saved information<textarea id="memory-comment-body" rows="8" maxlength="12000" required>${e(note.body)}</textarea></label><div class="modal-footer">${button('save-memory-comment','Save changes','primary',`data-id="${e(note.id)}" data-card-id="${e(card.id)}" data-version="${note.version}"`)}</div></form>`);
    $('memory-comment-body').focus();
  } else if (card.case_info) {
    await caseOptions(card.case_info.id,{renameOnly:true});
  } else if (card.document_id){
    const fields=Object.entries(card.fields||{});
    await openModal(documentCardEditorHTML(card,fields,false));
    documentCardEditor={card,fields,saving:false};
    $('preview-card-title').focus({preventScroll:true});
  } else await noteForm(card.id);
}
async function deleteMemory(target){
  const comment=target.dataset.entryType==='comment';
  const {cardId,id}=target.dataset;
  const group=target.closest('.memory-group')?.dataset.groupId;
  target.disabled=true;
  try {
    const card=comment?null:await api('get-card',{id:cardId});
    const service=card&&isService(card);
    if (card?.case_info) {
      if(!confirm('Permanently delete this saved case and its chat history? Separate service notes and results stay.'))return;
      await api('delete-case',{id:card.case_info.id,expected_version:card.case_info.version});
      if(activeCase?.id===card.case_info.id)activeCase=null;
    } else {
      const item=target.dataset.serviceResult==='true'?'service result':'note';
      const question=comment?`Delete this saved ${item}?`:service
        ? `Permanently delete “${card.title}” and its saved notes, ratings and results? This removes the service from Manage memory, Known services and recommendations.`
        : `${card.document_id?'Permanently delete':'Delete'} “${card.title}” and its attached notes?`;
      if(!confirm(question))return;
      await flushNote();
      if (comment) {
        await api('forget-comment',{id,card_id:cardId});
        if (target.dataset.serviceResult==='true') {
          const serviceCard=await api('get-card',{id:cardId});
          if (updateChatServiceExperience(cardId,serviceCard)) renderMessages();
        }
      } else {
        await flushCaseDraft();
        const inChat=selected?.id===cardId||messages.some(message=>
          message.followup?.card_id===cardId||message.cards?.some(reference=>reference.id===cardId));
        await api('forget-card',{id});
        if (selected?.id===cardId) {selected=null;context();}
        if (inChat&&activeCase) await loadCase(activeCase.id,{activate:false});
      }
    }
    await refresh();
    const remaining=group && $('cards').querySelector(`.memory-group[data-group-id="${CSS.escape(group)}"] [data-action="toggle-memory-group"]`);
    (remaining || $('search')).focus({preventScroll:true});
    notice(card?.case_info?'Saved case history deleted.':service?'Imported service deleted.':'Memory deleted.');
  } finally {
    target.disabled=false;
  }
}
async function settings(){await refresh();const starter=state.account.connected?await api('starter-count'):{count:0};await openModal(modalHead('Connection & backup','Manage your connection and saved information.')+`<div class="detail-body settings-body"><section><h3>ChatGPT connection</h3><p><strong>${e(state.account.connected?state.account.label:'Connect your own ChatGPT account')}</strong></p><p>${state.account.sharing?'Plan permission is enabled. Send a question to verify this account can complete an answer.':'AI answers use an eligible ChatGPT account and its allowed plan usage. Sign-in opens the official OpenAI page in your browser. Account and app eligibility are decided by OpenAI.'}</p>${state.accountError?`<p class="callout">${e(state.accountError)}</p>`:''}<div class="button-row">${button('sign-in',state.account.connected?'Reconnect ChatGPT':'Continue with ChatGPT','primary')}${state.account.connected?button('sign-out','Sign out','secondary'):''}${button('add-account','Use a different account','quiet')}</div>${state.account.profiles.length?`<label class="saved-accounts">Saved connections<select id="saved-accounts"><option value="">Choose a saved connection…</option>${state.account.profiles.map(p=>`<option value="${e(p.id)}">${e(p.label)}${p.connected?'':' · reconnect'}</option>`).join('')}</select></label>`:''}<p class="subtle">This app cannot read your ChatGPT chat history or ChatGPT Memory. It keeps its own document cards. There is no shared team database.</p>${state.account.sharing?button('load-models','Choose an available AI model','quiet'):''}<div id="model-picker"></div></section>
    ${starter.count?`<section class="callout"><h3>${starter.count} saved starter items on this computer</h3><p>These cards or service notes were saved before sign-in. Copy them into this account to use them with ChatGPT.</p>${button('copy-starter','Copy starter cards into this account','secondary')}</section>`:''}
    <section><h3>Private memory backup</h3><p>Back up all cards, extracted information and notes. Restore the backup on another computer with the app installed. Original files and ChatGPT credentials are not included. Keep the backup private.</p><div class="button-row">${button('export','Save a backup','secondary')}${button('restore','Restore a backup','secondary')}</div><p class="subtle">Saved records use the app-data folder on this computer. The database and exported backups are not encrypted by the app. Account credentials use your system’s protected storage. Signing out hides that account’s cards but keeps them for reconnecting.</p></section><section><h3>What works without ChatGPT</h3><p>Import Excel, CSV, TSV, Word, text PDFs and text files. Search cards, open contacts, add notes and back up your memory. AI answers need internet and an eligible ChatGPT connection.</p><p class="subtle">Version ${e(state.version)} · ${state.platform==='darwin'?'macOS':'Windows 10/11 (64-bit)'}.</p></section></div>`,'settings-dialog');
  $('saved-accounts')?.addEventListener('change',async event=>{if(!event.target.value)return;try{await flushNote();await flushCaseDraft();const result=await api('select-account',{id:event.target.value});state=result;messages=[];selected=null;context();renderMessages();await settings();}catch(error){fail(error);}});
}
async function signIn(addAccount=false){if(connectionBusy)return;await flushNote();await flushCaseDraft();connectionBusy=true;await openModal(modalHead('Continue in your browser','Sign in on the official OpenAI page, then return to the app.')+`<div class="detail-body"><p>The app is waiting for the sign-in response. Your password stays with OpenAI.</p>${button('cancel-sign-in','Cancel sign-in','secondary')}</div>`);
  try{await api('sign-in',{addAccount,enablePlan:true});messages=[];selected=null;context();renderMessages();await refresh();await settings();notice('Connection updated. Your account has its own saved cards.');}
  catch(error){notice(error.message,true);await settings();}finally{connectionBusy=false;}}
const voice=new Voice({status:text=>{if($('voice-status'))$('voice-status').textContent=text;},transcript:text=>{if($('message'))$('message').value=[voicePrefix,text].filter(Boolean).join(' ');}});
function fail(error){notice(error.message||String(error),true);}
document.addEventListener('click',async event=>{const target=event.target.closest('[data-action]');if(!target)return;event.preventDefault();const action=target.dataset.action;
  if(target.closest('#case-action-menu'))hideCaseMenu();
  if(caseChanging && ['open-case','case-menu','review-case-feedback','case-options','settings','archive-case','delete-case','reopen-case','latest-messages','finish-conversation','keep-case-open'].includes(action))return;
  try{
    if(action==='send')await sendMessage();
    else if(action==='case-menu')showCaseMenu(target);
    else if(action==='open-case'||action==='review-case-feedback'){
      const navigation=navigationSequence, sequence=Number(target.dataset.sequence)||null;
      await loadCase(target.dataset.id,{focus:sequence});
      if(navigation===navigationSequence)await changeLibraryMode('workspace');
      if(sequence){
        const reply=$('messages').querySelector(`[data-message-sequence="${sequence}"].followup-message`);
        reply?.scrollIntoView({block:'start',behavior:'instant'});
        (reply?.querySelector('[data-step="resume"],[data-outcome],[data-followup-field]')||reply?.querySelector('h3'))?.focus({preventScroll:true});
      }
    }
    else if(action==='case-options')await caseOptions(target.dataset.id||activeCase?.id,{renameOnly:target.dataset.renameOnly==='true'});
    else if(action==='suggest-case-title'){
      const suggestion=await api('suggest-case-title',{id:target.dataset.id});
      if(!$('case-title-input')||!target.isConnected)return;
      if(!suggestion){notice('Send a request in this conversation to get a title suggestion.');return;}
      $('case-title-input').value=suggestion;
      $('case-title-input').focus();
    }
    else if(action==='rename-case'){
      const updated=await api('rename-case',{id:target.dataset.id,title:$('case-title-input').value,expected_version:Number(target.dataset.version)});
      if(activeCase?.id===updated.id){activeCase={...activeCase,...updated};renderCaseTitle();}
      await closeModal();
      await refresh();
      notice('Conversation title updated.');
    }
    else if(action==='finish-conversation')await finishConversation(target.dataset.id);
    else if(action==='keep-case-open')await keepCaseOpen(target);
    else if(action==='archive-case'||action==='delete-case'){
      const id=target.dataset.id;
      const include_notes=target.dataset.includeNotes==='true';
      if(action==='delete-case'&&!confirm(include_notes?
        'Permanently delete this conversation and the notes, ratings and service results saved from it?':
        'Permanently delete this conversation and any messages it saved automatically? You can manage separately recorded notes and results in the memory library.'))return;
      if(busy)throw new Error('Wait for the answer or choose Stop before choosing what to do with this conversation.');
      lockCase(true);
      try{
        await flushCaseDraft();
        await api(action,{id,expected_version:Number(target.dataset.version),include_notes});
        if (action==='delete-case') for (const [messageId,draft] of serviceFormDrafts) {
          if (draft.caseId===id) serviceFormDrafts.delete(messageId);
        }
        if(modal.open)await closeModal();
        if(activeCase?.id===id){activeCase=null;selected=null;messages=[];context();}
        await refresh();
        notice(action==='archive-case'?'Conversation added to the memory library.':
          include_notes?'Conversation and its saved notes and results deleted.':'Chat history deleted.');
      }finally{lockCase(false);}
    }
    else if(action==='reopen-case'){if(modal.open&&!await closeModal())return;await api('reopen-case',{id:target.dataset.id});await loadCase(target.dataset.id);await changeLibraryMode('workspace');await refresh();}
    else if(action==='undo-input'||action==='redo-input')await applyInputHistory(action==='undo-input'?'undo':'redo',target);
    else if(action==='latest-messages')await loadCase(activeCase.id,{activate:false});
    else if(action==='earlier-messages'){if(busy)throw new Error('Wait for the answer or choose Stop.');const view=$('messages'),height=view.scrollHeight,top=view.scrollTop,result=await api('get-case',{id:activeCase.id,before:messages[0]?.sequence});const known=new Set(messages.map(m=>m.id));messages=[...result.messages.filter(m=>!known.has(m.id)).map(fromCaseMessage),...messages];caseHasMore=result.has_more;renderMessages();view.scrollTop=top+view.scrollHeight-height;}
    else if(action==='workspace'){await changeLibraryMode('workspace');}
    else if(action==='known-services'){await changeLibraryMode('services');}
    else if(action==='manage-memory'){await changeLibraryMode('memory');}
    else if(action==='toggle-memory-group'||action==='page-memory-history')await changeMemoryHistory(target);
    else if(action==='open-service-chat'){openServiceChat(target);}
    else if(action==='minimize-assistant'){await closeServiceChat();}
    else if(action==='expand-assistant'){await changeLibraryMode('workspace');$('message').focus({preventScroll:true});}
    else if(action==='edit-memory')await editMemory(target);
    else if(action==='delete-memory')await deleteMemory(target);
    else if(action==='save-memory-comment'){await api('save-comment',{id:target.dataset.id,card_id:target.dataset.cardId,expected_version:Number(target.dataset.version),body:$('memory-comment-body').value});await closeModal();await refresh();notice('Memory updated. Future answers will use the revised note.');}
    else if(action==='settings')await settings();
    else if(action==='import')await importDocument();
    else if(action==='import-services')await importDocument(false,true);
    else if(action==='review-import-services'&&preview)await reviewServiceFile(await api('review-service-import',{id:preview.id}));
    else if(action==='edit-document-preview-row')await editDocumentPreviewRow(Number(target.dataset.index));
    else if(action==='save-document-preview-row'||action==='save-memory-document-card')await applyDocumentCardEdit();
    else if(action==='back-to-document-preview')showDocumentPreview();
    else if(action==='edit-inventory-preview-row')editInventoryPreviewRow(Number(target.dataset.index));
    else if(action==='review-all-inventory-rows')editInventoryPreviewRow(serviceEditor?.index);
    else if(action==='back-to-inventory-preview')showInventoryPreview();
    else if(action==='add-own-service')await openServiceEditor();
    else if(action==='remove-known-service'||action==='restore-known-service')await setKnownServiceRemoved(target,action==='remove-known-service');
    else if(action==='delete-removed-service')await deleteRemovedService(target);
    else if(action==='add-chat-service'){await pauseVoice();await sendMessage('Add a service',null,{keepDraft:true});}
    else if(action==='edit-own-service')await openServiceEditor({card:await api('get-card',{id:target.dataset.id})});
    else if(action==='save-own-service')await saveOwnService();
    else if(action==='update-service-inventory')await saveOwnService(true);
    else if(action==='save-tracking-results')await saveTrackingResults();
    else if(action==='sample')await importDocument(true);
    else if(action==='save-import')await saveImport();
    else if(action==='update-import')await saveImport(true);
    else if(action==='close-modal')await closeModal();
    else if(action==='chat-followup-start'||action==='chat-followup-step')await actOnFollowup(action,target);
    else if(action==='chat-followup-options')showFollowupOptions(target);
    else if(action==='use-service-from-details'){
      if(caseChanging||busy||!await closeModal())return;
      if(activeCase?.status!=='active')await loadCase(state.active_case.id);
      if(libraryMode==='memory')await changeLibraryMode('workspace');
      if(libraryMode==='services'&&!serviceChatOpen)openServiceChat($('service-chat-launcher'));
      await actOnFollowup('chat-followup-start',target);
    }
    else if(action==='open-card')await openCard(target.dataset.id,{replyId:target.dataset.replyId,fromFollowup:target.dataset.fromFollowup==='true',rankReason:target.dataset.rankReason});
    else if(action==='choose-service-result'){if(feedbackSaving)return;feedbackEditor.outcome=target.dataset.outcome;document.querySelectorAll('.result-outcomes [data-outcome]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.outcome===feedbackEditor.outcome)));}
    else if(action==='save-service-result')await saveServiceResult();
    else if(action==='cancel-service-result'){if(feedbackSaving)return;if(!discardResult())return;feedbackEditor=null;$('service-result-editor').hidden=true;}
    else if(action==='clear-selection'){selected=null;context();await flushCaseDraft();}
    else if(action==='focus-card-note'){$('card-note-editor').hidden=false;$('card-note').scrollIntoView({block:'center',behavior:'smooth'});$('card-note').focus({preventScroll:true});}
    else if(action==='use-card'||action==='ask-service'){if(busy)throw new Error('Wait for this answer or choose Stop before switching cards.');const id=target.dataset.id,sequence=navigationSequence;if(modal.open&&!await closeModal())return;const card=await api('get-card',{id});if(sequence!==navigationSequence)return;selected=card;context();await flushCaseDraft();if(sequence!==navigationSequence)return;if(libraryMode==='memory')await changeLibraryMode('workspace');if(libraryMode==='services')openServiceChat(target);else if(libraryMode==='workspace')$('message').focus({preventScroll:true});}
    else if(action==='new-card-note'){await flushNote();$('card-note-editor').hidden=false;noteEditor={cardId:noteEditor.cardId,id:null,version:null,body:'',saved:'',queue:Promise.resolve()};$('card-note').value='';$('note-status').textContent='Notes save automatically when you pause.';$('card-note').focus();}
    else if(action==='edit-card-comment'){await flushNote();const card=await api('get-card',{id:noteEditor.cardId}),note=card.comments.find(n=>n.id===target.dataset.id);if(!note)throw new Error('This note is no longer available.');if(note.outcome){await startServiceResult(card.id,note.id);return;}noteEditor={cardId:card.id,id:note.id,version:note.version,body:note.body,saved:note.body,queue:Promise.resolve()};$('card-note-editor').hidden=false;$('card-note').value=note.body;$('note-status').textContent='Editing saved note. Changes save when you pause.';$('card-note').focus();}
    else if(action==='delete-card-comment'){if(feedbackEditor?.id===target.dataset.id){notice('Finish or cancel editing this result before deleting it.',true);return;}if(!confirm('Delete this saved note or result?'))return;await flushNote();const cardId=noteEditor.cardId;await api('forget-comment',{id:target.dataset.id,card_id:cardId});if(noteEditor.id===target.dataset.id){noteEditor={cardId,id:null,version:null,body:'',saved:'',queue:Promise.resolve()};$('card-note').value='';}updateCardHistory(await api('get-card',{id:cardId}));await refreshCardHistoryControls(cardId);$('note-status').textContent='Note or result deleted.';if($('service-history-status'))$('service-history-status').textContent='Saved note or result deleted.';await refresh();}
    else if(action==='documents')await manageDocuments();
    else if(action==='filter-document'||action==='previous-rows'){libraryMode='memory';documentFilter=target.dataset.id;includeArchived=action==='previous-rows';offset=0;await closeModal();$('document-filter').value=documentFilter;renderLibraryMode();await loadCards();}
    else if(action==='open-original')await api('open-original',{id:target.dataset.id});
    else if(action==='open-link')await api('open-link',{url:target.dataset.url});
    else if(action==='copy-contact'){await api('copy-contact',{id:target.dataset.id,value:target.dataset.value});notice('Contact copied.');}
    else if(action==='new-chat')await newCase();
    else if(action==='new-note')await noteForm();
    else if(action==='edit-note')await noteForm(target.dataset.id);
    else if(action==='save-personal-note'){await api('save-note',{id:target.dataset.id||null,expected_version:Number(target.dataset.version)||null,title:$('note-title').value,organization:$('note-organization').value,body:$('note-body').value});await closeModal();await refresh();notice('Memory saved.');}
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
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&$('case-action-menu').matches(':popover-open')){
    event.preventDefault();
    hideCaseMenu({restoreFocus:true});
  }else if(event.key==='Escape'&&libraryMode==='services'&&serviceChatOpen&&!modal.open){
    event.preventDefault();
    closeServiceChat().catch(fail);
  }
});
modal.addEventListener('input',event=>{
  const editor=serviceEditor;
  if(!editor||editor.saving)return;
  const {target}=event, row=editor.rows[editor.index];
  if(target.dataset.serviceField)row.values[target.dataset.serviceField]=target.value;
  else if(target.id==='include-service-row')row.include=target.checked;
  else return;
  editor.changed.add(editor.index);
  $('service-editor-error').hidden=true;
  updateServiceEditor();
});
modal.addEventListener('change',event=>{
  if(event.target.id!=='service-review-row'||!serviceEditor||serviceEditor.saving)return;
  serviceEditor.index=Number(event.target.value);
  modal.innerHTML=serviceEditorHTML(serviceEditor);
  updateServiceEditor();
  $('service-review-row').focus({preventScroll:true});
});
modal.addEventListener('cancel',event=>{event.preventDefault();closeModal().catch(fail);});
window.hive.subscribe(event=>{
  if(event.type==='delta'){const last=messages.at(-1);if(last?.role==='assistant'&&busy)last.text+=event.value;}
  if(event.type==='message-kept'){const lastUser=messages.findLast(m=>m.role==='user');if(lastUser)lastUser.saved=true;}
  if(event.type==='memory-changed'){clearTimeout(refresh.timer);refresh.timer=setTimeout(()=>refresh().catch(fail),120);}
  if(event.type==='cases-changed'){clearTimeout(refreshCaseList.timer);refreshCaseList.timer=setTimeout(()=>refreshCaseList().catch(fail),150);}
  if(event.type==='closing-requested'){
    (async()=>{try{if(feedbackSaving||caseChanging||Array.from(serviceFormDrafts.values()).some(draft=>draft.saving)){notice('Wait for the current change to finish before closing.',true);return;}if(!discardResult())return;await flushNote();await flushCaseDraft();if(voice.listening)await voice.stop();await api('close-after-save');}catch(error){notice('The app stayed open because a note has not saved: '+error.message,true);}})();
  }
});
shell();refresh().then(()=>api('ui-ready')).catch(error=>{$('cards').innerHTML=`<p class="callout">${e(error.message)}</p>`;fail(error);});
