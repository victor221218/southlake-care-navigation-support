import { Voice } from './voice.mjs';
import { directoryLinks } from './directory-links.mjs';
import { customService } from '../src/core/service-records.mjs';
import { linkedMessage } from './render-text.mjs';
import { serviceCards } from './service-cards.mjs';
const api = window.hive;
const app = document.getElementById('app');
const modal = document.getElementById('modal');
const state = { page: 'assistant', data: null, results: null, context: { category: '', region: '', age_band: 'Unspecified', mobility: 'Unspecified', language: 'Unspecified', timing: 'Flexible' },
  query: '', goal: 'Balanced', messages: [], busy: false, connecting: false, draft: '', voiceStatus: 'English voice · processed on this computer', pending: null, setup: null, checking: false, servicePanel: null, noteDrafts: {}, closing: false };
const e = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const button = (label, action, style = '', attributes = '') => `<button class="button ${style}" data-action="${action}" ${attributes}>${e(label)}</button>`;
const nameFor = id => [...(state.data?.catalog || []), ...(state.data?.memory.added_services || [])].find(service => service.id === id)?.name || id;
let submitModal;
let toastTimer;
const voice = new Voice({ status: status => { state.voiceStatus = status; updateVoice(); }, transcript: text => { state.draft = text; const input = document.getElementById('message'); if (input) input.value = text; } });

function notify(text, error = false) {
  const notice = document.getElementById('notice'); notice.innerHTML = `<div class="toast ${error ? 'error' : ''}">${e(text)}</div>`;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => notice.replaceChildren(), 7000);
}
function select(key, label, values, value) {
  return `<label class="field"><span>${e(label)}</span><select name="${key}" aria-label="${e(label)}">${values.map(option => `<option value="${e(option)}"${option === value ? ' selected' : ''}>${e(option || (key === 'category' ? 'All service types' : key === 'region' ? 'All areas' : 'Unknown'))}</option>`).join('')}</select></label>`;
}
const input = (name, label, value = '', type = 'text', attributes = '') => `<label class="field"><span>${e(label)}</span><input name="${name}" type="${type}" value="${e(value)}" ${attributes}></label>`;
const areaText = (name, label, value = '', maximum = 600, required = false) => `<label class="field"><span>${e(label)}</span><textarea name="${name}" rows="2" maxlength="${maximum}"${required ? ' required' : ''}>${e(value)}</textarea></label>`;
const checkedOptions = (name, label, options, selected = []) => `<fieldset class="choice-field"><legend>${e(label)}</legend><div class="choices">${options.map(value => `<label><input type="checkbox" name="${name}" value="${e(value)}"${selected.includes(value) ? ' checked' : ''}>${e(value)}</label>`).join('')}</div></fieldset>`;
function fields(context) {
  const values = state.data.enums;
  return `<div class="fields">${select('category', 'Service need', values.categories, context.category)}${select('region', 'Area', values.regions, context.region)}${select('age_band', 'Age band', values.age_bands, context.age_band)}${select('mobility', 'Mobility', values.mobility, context.mobility)}${select('language', 'Language', values.languages, context.language)}${select('timing', 'Timing', values.timing, context.timing)}</div>`;
}
function render() {
  if (!state.data) { app.innerHTML = '<main class="startup"><div class="hive-mark">✳</div><h1>Opening Southlake Hive</h1><p>Loading your local service workspace.</p></main>'; return; }
  const account = state.data.account;
  app.innerHTML = `<aside class="sidebar"><a class="brand" href="#" data-action="navigate" data-page="assistant"><span class="hive-mark">✳</span><span><strong>Southlake Hive</strong><small>CARE NAVIGATION ASSISTANT</small></span></a>
    <nav aria-label="Workspace">${[['assistant', '◉', 'Assistant'], ['directory', '⌕', 'Find services'], ['memory', '◇', 'Memory library'], ['settings', '⚙', 'Connection & settings']].map(([key, icon, title]) => `<button class="nav ${state.page === key ? 'active' : ''}" data-action="navigate" data-page="${key}"><span>${icon}</span>${title}</button>`).join('')}</nav>
    <div class="sidebar-foot"><span class="local-dot"></span>Memory on this computer<p>${state.data.practice ? 'Fictional practice workspace' : 'Your saved service experience'}</p><small>Version ${e(state.data.version)}</small></div></aside>
    <div class="layout"><header class="topbar"><span>Care navigation <span class="muted">/</span> <strong>${e({ assistant: 'Assistant', directory: 'Find services', memory: 'Memory library', settings: 'Connection & settings' }[state.page])}</strong></span>
      <div class="account">${state.data.practice ? '<span class="pill amber">Practice</span>' : `<span class="pill ${account.sharing ? 'green' : ''}">${account.sharing ? 'ChatGPT connected' : 'Local workspace'}</span>`}<span class="account-name">${e(account.connected ? account.label : 'Karen’s service companion')}</span></div></header>
    <main>${state.data.practice ? `<div class="practice-banner"><span><strong>Practice workspace</strong> · 48 starting fictional attempts. Changes stay separate from personal history.</span>${button('Return to personal', 'personal', 'small')}</div>` : ''}
    ${{ assistant: assistantView, directory: directoryView, memory: memoryView, settings: settingsView }[state.page]()}</main></div>`;
  updateVoice(); renderReview();
}
function assistantView() {
  const connected = state.data.account.sharing;
  const workspace = state.data.workspace || {}, selected = workspace.selected_service_id;
  return `<section class="intro compact assistant-intro"><div><div class="eyebrow">Karen’s service assistant</div><h1>Find the next service that fits.</h1><p>Describe the need. Choose a card. Keep what you learn.</p></div>${button('Service library', 'navigate', 'small', 'data-page="memory"')}</section>
  <div class="assistant-simple"><section class="conversation card"><div class="conversation-head"><strong>Hive assistant</strong><div>${state.busy ? button('Stop', 'stop', 'small') : button('New conversation', 'clear-chat', 'small quiet')}</div></div>
    <div class="messages" id="messages">${state.messages.length ? state.messages.map(messageView).join('') : `<div class="welcome"><div class="orb"><span></span><span></span><span></span><span></span><span></span></div><h2>What support is needed?</h2><p>Try “I need a ride in North York for an adult using a walker.”</p>
      <div class="welcome-actions">${button('Try a transportation request', 'example', 'primary')}${workspace.request_id ? button('Continue ' + [workspace.context.category, workspace.context.region].filter(Boolean).join(' · '), 'resume-request', 'quiet', `data-id="${e(workspace.request_id)}"`) : ''}</div><p class="tiny">Saved services and clear feedback work immediately. ${connected ? 'ChatGPT is connected for broader questions.' : 'You can connect ChatGPT in settings for broader questions and online research.'}</p></div>`}</div>
    <div class="composer"><label class="sr-only" for="message">Message Hive</label><textarea id="message" rows="2" placeholder="Describe a service need, or tell Hive how a connection went…">${e(state.draft)}</textarea>
      ${selected ? `<div class="active-service"><span>Feedback for <strong>${e(nameFor(selected))}</strong></span>${button('Open card', 'open-service', 'small quiet', `data-id="${e(selected)}" data-request="${e(workspace.request_id)}"`)}</div>` : workspace.request_id && workspace.context.category ? `<p class="tiny muted active-need">${e(workspace.context.category)} · ${e(workspace.context.region || 'Choose an area')} · choose a service card before saying “this didn’t work”</p>` : ''}
      <div class="composer-bottom"><div class="voice-controls">${button('Speak', 'microphone', 'mic', `id="mic-button" aria-pressed="${voice.listening}"`)}<span class="tiny muted" id="voice-status">${e(state.voiceStatus)}</span></div>${button(state.busy ? 'Working…' : 'Send', 'send', 'primary', state.busy || state.data.practice ? 'disabled' : '')}</div>
      <p class="tiny muted">Review dictated words before sending. Use service requirements only; leave patient identifiers out.</p></div>
  </section></div>`;
}
function messageView(message) {
  const label = { directory: 'Saved directory', 'directory-fallback': 'Saved directory', ai: 'ChatGPT', guide: 'Hive guide', memory: 'Your memory', 'memory-review': 'Review before saving' }[message.source];
  const request = state.data.memory.library?.find(item => item.id === message.request_id);
  const active = state.data.workspace?.request_id === message.request_id;
  return `<article class="message ${message.role} ${message.cards?.length ? 'with-cards' : ''}"><span class="message-role">${message.role === 'user' ? 'You' : 'Hive'}${label ? ` <span class="answer-source">${e(label)}</span>` : ''}</span><div>${linkedMessage(message.summary || message.text)}</div>
    ${serviceCards(message.cards, { requestId: message.request_id, selectedId: active ? state.data.workspace?.selected_service_id : null, chooseProvider: message.choose_provider, currentFeedback: request?.feedback || [], liveItems: active ? state.results?.items || [] : [], commentCounts: state.data.memory.comment_counts || {} })}
    ${message.choices?.length ? `<div class="quick-choices">${message.choices.map(choice => button(choice.label, choice.text ? 'reply-choice' : 'navigate', 'small', choice.text ? `data-text="${e(choice.text)}"` : 'data-page="directory"')).join('')}</div>` : ''}
    ${message.cards?.length ? `<button class="more-options" data-action="more-options" data-request="${e(message.request_id || '')}">Show other options</button>` : ''}</article>`;
}
function directoryView() {
  const values = state.data.enums;
  const ranking = state.context.category && state.context.region;
  return `<section class="intro compact directory-intro"><div><div class="eyebrow">Your service connections, in one place</div><h1>Find the right service pathway.</h1><p>Browse every saved service, narrow the area, or calculate a match for a specific need.</p></div>${button('+ Add a service', 'add-service', 'primary')}</section>
    <section class="card pad"><form id="search-form"><div class="search-primary">${input('query', 'Provider or keyword', state.query, 'search', 'maxlength="160" placeholder="Search rides, home help, food, provider name…"')}${select('category', 'Service type', ['', ...values.categories], state.context.category)}${select('region', 'Area', ['', ...values.regions], state.context.region)}</div>
      <details class="practical-filters"><summary>Practical requirements & ranking</summary><p class="tiny muted" id="search-help">${ranking ? 'These requirements affect the fit calculation.' : 'Choose a service type and area to enable the fit calculation.'}</p><fieldset id="practical-fields"${ranking ? '' : ' disabled'}><div class="fields">${select('age_band', 'Age band', values.age_bands, state.context.age_band)}${select('mobility', 'Mobility', values.mobility, state.context.mobility)}${select('language', 'Language', values.languages, state.context.language)}${select('timing', 'Timing', values.timing, state.context.timing)}${select('goal', 'Prioritize', values.goals, state.goal)}</div></fieldset></details>
      <div class="form-bottom"><span class="tiny muted">${state.data.catalog.length} saved pathways · current capacity requires provider confirmation</span><div class="action-row compact-actions">${button('Clear filters', 'clear-filters', 'quiet', 'type="button"')}<button class="button primary" type="submit">Search services</button></div></div></form></section>
    ${!state.data.practice ? `<section class="wider-directory"><div class="wider-directory-head"><div><h2>Search beyond your saved directory</h2><p>Open a trusted directory, review a provider, then use Add a service to keep its details here.</p></div>${button(state.data.account.sharing ? 'Ask Hive to search online' : 'Connect ChatGPT for online search', state.data.account.sharing ? 'online-search' : 'navigate', 'small', state.data.account.sharing ? '' : 'data-page="settings"')}</div><div class="directory-links">${directoryLinks(state.context).map(link => `<button data-action="source" data-url="${e(link.url)}"><strong>${e(link.name)} ↗</strong><small>${e(link.detail)}</small></button>`).join('')}</div></section>` : ''}
    <div class="section-title"><h2>${state.results?.mode === 'directory' ? 'Saved service options' : 'Ranked service options'}</h2><span class="tiny muted">${state.results ? `${state.results.items.length} matches` : ''}${state.data.practice ? ' · Practice workspace' : ''}</span></div>${resultsView()}`;
}
function resultsView(limit = Infinity) {
  if (!state.results) return '<section class="card empty"><strong>Choose the support needed</strong><p>Search to see matching services and their recorded experience.</p></section>';
  const items = state.results.items.slice(0, limit);
  const card = item => {
    const { service, evidence: stats } = item;
    const custom = service.id.startsWith('custom-');
    const links = [['Provider source ↗', service.source_url], ['Referral ↗', service.referral_url], ['Booking info ↗', service.booking_url]].filter(([, url], index, all) => url && all.findIndex(([, other]) => other === url) === index);
    return `<article class="card service"><div class="service-title"><div><span class="eyebrow">${e(service.category)}</span><h2>${e(service.name)}</h2></div>${item.fit_score !== null && item.fit_score !== undefined ? `<span class="score"><strong>${item.fit_score}</strong><small>FIT / 100</small></span>` : ''}</div>
      <p class="service-area">${e(service.coverage.join(' · '))}</p><p class="summary">${e(service.summary)}</p>
      ${service.phone ? `<button class="program-contact" data-action="copy-contact" data-field="phone" data-id="${e(service.id)}" title="Copy public program phone">☎ ${e(service.phone)} <small>Copy</small></button>` : ''}
      ${stats.completed || stats.pending || stats.declined ? `<div class="metrics"><div><span>Service received</span><strong>${stats.delivery_rate === null ? '—' : stats.delivery_rate + '%'}</strong><small>${stats.received} / ${stats.completed} completed attempts</small></div><div><span>Satisfaction</span><strong>${stats.satisfaction === null ? 'Unrated' : stats.satisfaction + ' / 5'}</strong><small>${stats.satisfaction_count} numeric ratings${stats.sentiment_count ? ' · ' + stats.happy_count + ' happy / ' + stats.unhappy_count + ' unhappy' : ''}${stats.pending ? ' · ' + stats.pending + ' pending' : ''}${stats.declined ? ' · ' + stats.declined + ' declined' : ''}</small></div></div>` : '<p class="tiny muted">No recorded outcomes yet</p>'}
      <p class="source-meta">${custom ? 'Locally added' : service.evidence_origin === 'Fictional practice service' ? 'Fictional practice service' : 'Public provider source'} · ${service.source_checked ? 'Reviewed ' + e(service.source_checked) : 'Review date not recorded'}</p>
      ${item.checks.length ? `<p class="check"><strong>Check next</strong> · ${e(item.checks[0])}</p>` : ''}
      <div class="provider-links">${links.map(([label, url]) => button(label, 'source', 'small quiet', `data-url="${e(url)}"`)).join('')}</div>
      <div class="service-actions">${button('Details & comments', 'open-service', 'small', `data-id="${e(service.id)}"`)}${button('Record a result', 'record', 'small quiet', `data-id="${e(service.id)}"`)}${custom ? button('Edit service', 'edit-service', 'small quiet', `data-id="${e(service.id)}"`) : ''}</div>
      <details><summary>${item.fit_score === null ? 'Eligibility, costs & contact details' : 'Why this option & access details'}</summary>${[...item.reasons, ...item.checks].length ? `<ul>${[...item.reasons, ...item.checks].map(text => `<li>${e(text)}</li>`).join('')}</ul>` : ''}
        <p><strong>Eligibility & access</strong><br>${e(service.access)}</p>
        ${[['Area details', service.coverage_note], ['Age criteria', service.minimum_age != null || service.maximum_age != null ? `${service.minimum_age == null ? 'No minimum recorded' : 'Minimum ' + service.minimum_age}${service.maximum_age == null ? '' : ' · Maximum ' + service.maximum_age}` : 'Confirm with provider'], ['Fees', service.fees || 'Confirm with provider'], ['Referral process', service.referral], ['Hours', service.hours_details || service.hours], ['Booking lead time', service.lead_days != null ? service.lead_days + ' business days listed; confirm scheduling' : 'Confirm with provider'], ['Languages', service.languages?.join(', ')], ['Wheelchair compatibility', service.wheelchair], ['Lifting assistance', service.lifting === true ? 'Listed as available; confirm the required support' : service.lifting === false ? 'Unavailable' : 'Confirm with provider'], ['Last known availability', service.availability], ['Address', service.address], ['Provider notes', service.source_notice]].filter(([, value]) => value).map(([label, value]) => `<p><strong>${label}</strong><br>${e(value)}</p>`).join('')}
        ${service.email ? `<p>${button('Copy email: ' + service.email, 'copy-contact', 'small quiet', `data-field="email" data-id="${e(service.id)}"`)}</p>` : ''}
        ${stats.delivery_interval ? `<p>Recorded delivery · 95% interval ${stats.delivery_interval[0]}–${stats.delivery_interval[1]}%</p>` : ''}</details></article>`;
  };
  const grouped = state.results.mode === 'directory';
  const content = grouped ? state.data.enums.categories.map(category => {
    const entries = items.filter(item => item.service.category === category);
    return entries.length ? `<section class="service-category"><div class="category-heading"><h2>${e(category)}</h2><span>${entries.length} saved ${entries.length === 1 ? 'service' : 'services'}</span></div><div class="service-grid">${entries.map(card).join('')}</div></section>` : '';
  }).join('') : `<div class="service-grid">${items.map(card).join('')}</div>`;
  return `${content}
  ${!state.results.items.length ? `<div class="card empty"><strong>No saved service matches these filters</strong><p>Try a broader search, open a wider directory above, or add a public service you already know.</p>${button('Clear filters', 'clear-filters', 'small')}${button('Add a service', 'add-service', 'small')}</div>` : ''}
  ${state.results.items.length > limit ? `<p class="tiny muted methodology">Showing ${limit} of ${state.results.items.length} options. Open Find services to see all matches.</p>` : ''}
  ${state.results.excluded.length ? `<details class="excluded"><summary>${state.results.excluded.length} options have conflicting access requirements</summary>${state.results.excluded.map(item => `<p><strong>${e(item.name)}</strong> · ${e(item.reasons.join(' '))}</p>`).join('')}</details>` : ''}
  <p class="tiny muted methodology">${grouped ? 'Choose a service type and area to calculate fit. ' : 'A fit score ranks options. '}Delivery percentages describe recorded attempts. Pending and declined attempts stay outside that denominator.</p>`;
}
const noteKey = panel => panel.service.id + ':' + (panel.request_id || 'service');
function noteDraft(panel = state.servicePanel) {
  const key = noteKey(panel);
  return state.noteDrafts[key] ||= { id: crypto.randomUUID(), service_id: panel.service.id, request_id: panel.request_id, browse: panel.browse, body: '', saved: '', version: undefined, interpreted: '', status: '', chain: Promise.resolve() };
}
function savedCommentsMarkup(panel) {
  return panel.comments?.length ? panel.comments.map(note => `<article class="saved-comment" data-comment-id="${e(note.id)}"><p>${e(note.body)}</p><div><span>${e(note.updated_at.slice(0, 10))}${note.source === 'Chat' ? ' · from conversation' : ''}</span>${button('Edit', 'edit-comment', 'small quiet', `data-id="${e(note.id)}"`)}</div></article>`).join('') : '<p class="small muted">No service comments yet. What you save here will be here next time.</p>';
}
function renderServicePanel(focus = false) {
  const panel = state.servicePanel; if (!panel) return;
  const { service, personal_evidence: stats, feedback } = panel, draft = noteDraft(panel);
  const attrs = `data-id="${e(service.id)}" data-request="${e(panel.request_id || '')}"`;
  modal.classList.add('service-dialog');
  modal.innerHTML = `<section class="service-workspace"><header><div><span class="eyebrow">${e(service.category)}</span><h2 id="modal-title">${e(service.name)}</h2></div>${button('×', 'close', 'quiet', 'aria-label="Close service"')}</header>
    <div class="service-workspace-body"><div class="service-overview"><p class="service-intro">${e(service.summary)}</p><div class="action-row">${service.phone ? button('☎ ' + service.phone, 'copy-contact', 'small', `data-id="${e(service.id)}" data-field="phone"`) : ''}${button('Provider website ↗', 'source', 'small quiet', `data-url="${e(service.source_url)}"`)}</div>
      <h3>How to access</h3><p>${e(service.access)}</p>${service.fees ? `<p><strong>Fees:</strong> ${e(service.fees)}</p>` : ''}<p class="small muted">Confirm current eligibility and capacity with the provider.</p>
      <details class="service-extra"><summary>Area, eligibility & accessibility</summary>${[['Listed areas', service.coverage.join(' · ')], ['Area details', service.coverage_note], ['Age criteria', service.minimum_age != null ? 'Minimum age ' + service.minimum_age : 'Confirm with provider'], ['Wheelchair access', service.wheelchair], ['Languages', service.languages?.join(', ')], ['Hours', service.hours_details || service.hours], ['Booking lead time', service.lead_days != null ? service.lead_days + ' business days; confirm scheduling' : 'Confirm with provider']].filter(([, value]) => value).map(([label, value]) => `<p><strong>${e(label)}</strong><br>${e(value)}</p>`).join('')}</details>
      <div class="service-result-panel"><h3>${panel.browse ? 'Use this service' : 'Result for this request'}</h3><p class="small muted">${panel.browse ? 'Comments belong to this program. Start or choose a service need to record a new attempt.' : e([panel.context.category, panel.context.region || 'Area needed'].join(' · '))}</p>
      ${feedback ? `<span class="pill ${feedback.delivery === 'Received' ? 'green' : 'amber'}">${e(feedback.delivery || feedback.state)} · ${e(feedback.state)}</span>` : ''}
      ${panel.browse ? `<div class="action-row">${button('Use for a service need', 'use-service', 'primary', attrs)}</div>` : `<div class="action-row">${button('Worked', 'card-result', 'success', attrs + ' data-delivery="Received"')}${button('Didn’t work', 'card-result', '', attrs + ' data-delivery="Not received"')}${button('Still waiting', 'card-result', 'quiet', attrs + ' data-delivery="Pending"')}</div>`}
      ${feedback?.delivery === 'Not received' && !panel.browse ? `<p class="tiny muted spaced">Reason, if known · optional</p><div class="quick-choices">${['Capacity', 'Eligibility', 'Coverage', 'Unable to contact'].map(reason => button(reason, 'card-result', 'small', attrs + ` data-delivery="Not received" data-reason="${e(reason)}"`)).join('')}</div>` : ''}
      ${feedback?.delivery === 'Received' && !panel.browse ? `<p class="tiny muted spaced">How was the experience? · optional</p><div class="quick-choices">${['Happy', 'Unhappy', 'Mixed'].map(sentiment => button(sentiment, 'card-result', 'small', attrs + ` data-delivery="Received" data-sentiment="${e(sentiment)}"`)).join('')}${[1, 2, 3, 4, 5].map(rating => button(rating + '/5', 'card-result', 'small quiet', attrs + ` data-delivery="Received" data-rating="${rating}"`)).join('')}</div>` : ''}</div>
      <div class="service-history"><h3>Your recorded experience</h3><p>${stats.completed ? `${stats.received} of ${stats.completed} completed attempts received the service` : 'No completed personal attempts yet'}${stats.satisfaction_count ? ' · ' + stats.satisfaction + '/5 from ' + stats.satisfaction_count + ' ratings' : ''}</p>${panel.outcomes?.length ? `<details><summary>View recent attempts</summary>${panel.outcomes.slice(0, 12).map(row => `<p>${e(row.region)} · ${e(row.delivery)} · ${e(row.occurred_on)} ${button('Update', 'edit', 'small quiet', `data-id="${e(row.id)}"`)}</p>`).join('')}</details>` : ''}</div>
    </div><div class="service-comment-panel"><div class="section-title"><h3>Saved service comments</h3><span class="tiny muted">On this computer</span></div><div id="saved-service-comments" class="saved-comments">${savedCommentsMarkup(panel)}</div>
      <label class="field note-field"><span>${draft.saved ? 'Edit comment' : 'Add a service comment'}</span><textarea id="service-note" rows="4" maxlength="6000" placeholder="For example: intake said there was no driver available. Leave patient names and identifiers out.">${e(draft.body)}</textarea></label><div class="comment-save-row"><span id="note-status" role="status" class="tiny muted">${e(draft.status || 'Comments save automatically. Use service information only.')}</span>${button('Save comment', 'save-note', 'primary small')}</div><p class="tiny muted">Clear results on this request can update its outcome. General service comments stay as notes.</p></div></div></section>`;
  if (!modal.open) modal.showModal();
  if (focus) document.getElementById('service-note')?.focus();
}
function updateNoteStatus(draft) { if (state.servicePanel && noteDraft() === draft) { const status = document.getElementById('note-status'); if (status) status.textContent = draft.status; } }
async function flushNote(draft = state.servicePanel ? noteDraft() : null, interpret = true) {
  if (!draft) return;
  clearTimeout(draft.timer);
  const run = async () => {
    const body = draft.body.trim();
    if (!body || body === draft.saved && (!interpret || body === draft.interpreted)) return;
    draft.status = 'Saving…'; updateNoteStatus(draft);
    try {
      const result = await api.request('save-service-comment', { id: draft.id, service_id: draft.service_id, request_id: draft.request_id, browse: draft.browse, body, expected_version: draft.version, interpret });
      draft.saved = result.comment.body; draft.version = result.comment.version; if (interpret) draft.interpreted = body;
      draft.status = draft.body.trim() === draft.saved ? 'Saved on this service' : 'Saving changes…'; updateNoteStatus(draft);
      if (state.servicePanel?.service.id === draft.service_id) {
        const list = state.servicePanel.comments || []; state.servicePanel.comments = [result.comment, ...list.filter(note => note.id !== result.comment.id)];
        const saved = document.getElementById('saved-service-comments'); if (saved) saved.innerHTML = savedCommentsMarkup(state.servicePanel);
      }
      if (interpret && result.feedback?.some(item => item.changed)) { state.messages.push({ role: 'assistant', ...result }); state.results = result.result || state.results; }
      return result;
    } catch (error) { draft.status = 'Not saved: ' + error.message; updateNoteStatus(draft); throw error; }
  };
  const result = draft.chain.catch(() => {}).then(run); draft.chain = result; return result;
}
async function flushAllNotes() { for (const draft of Object.values(state.noteDrafts)) await flushNote(draft, true); }
async function closeModal() {
  if (state.servicePanel) { await flushNote(); delete state.noteDrafts[noteKey(state.servicePanel)]; state.servicePanel = null; await refresh(); }
  modal.close(); modal.classList.remove('service-dialog');
}
async function openService(target) {
  if (state.busy) return;
  if (state.servicePanel) { await flushNote(); delete state.noteDrafts[noteKey(state.servicePanel)]; }
  const panel = await api.request('service-workspace', { service_id: target.id, request_id: target.request || null, browse: target.browse === 'true' });
  state.servicePanel = panel;
  if (panel.selection?.feedback?.some(item => item.state === 'Saved')) state.messages.push({ role: 'assistant', ...panel.selection });
  await refresh(); renderServicePanel(target.focus === 'comment');
}
function libraryCard(card, compact = false) {
  const needs = card.feedback.filter(item => item.state === 'Needs detail').length;
  const saved = card.feedback.filter(item => item.state === 'Saved').length;
  return `<article class="library-card"><h3>${e(card.context.category || 'Service need')} · ${e(card.context.region || 'Area needed')}</h3><p class="tiny muted">${e([card.context.age_band, card.context.mobility, card.context.language, card.context.timing].filter(value => value && !['Unspecified', 'Flexible'].includes(value)).join(' · ') || 'Broad service requirements only')} · ${e(card.updated_at.slice(0, 10))}</p><div class="tag-row"><span class="pill green">${saved} saved result${saved === 1 ? '' : 's'}</span>${needs ? `<span class="pill amber">${needs} need detail</span>` : ''}</div>
    ${!compact && card.feedback.length ? `<ul class="library-feedback">${card.feedback.map(item => `<li><strong>${e(item.service_id ? nameFor(item.service_id) : item.candidate_ids?.length ? item.candidate_ids.map(nameFor).join(' / ') : 'Provider needed')}</strong><span>${e(item.delivery || 'Delivery result needed')}${item.satisfaction ? ' · ' + item.satisfaction + '/5' : ''}${item.satisfaction_sentiment && item.satisfaction_sentiment !== 'Unspecified' ? ' · ' + e(item.satisfaction_sentiment) : ''}</span><small class="${item.state === 'Needs detail' ? 'needs-detail' : ''}">${e(item.state)}${item.state === 'Needs detail' ? ' · ' + e(item.missing.join(', ')) : ''}</small></li>`).join('')}</ul>` : ''}<div class="action-row">${button(needs ? 'Complete missing details' : 'Continue this request', 'resume-request', 'small', `data-id="${e(card.id)}"`)}</div></article>`;
}
function memoryView() {
  const memory = state.data.memory;
  const library = memory.library || [];
  const needs = library.reduce((count, card) => count + card.feedback.filter(item => item.state === 'Needs detail').length, 0);
  return `<section class="intro compact"><div class="eyebrow">Experience that carries forward</div><h1>Your memory library.</h1><p>Service requests and automatically saved provider feedback for ${e(state.data.practice ? 'the practice workspace' : state.data.account.connected ? state.data.account.label : 'this computer’s local workspace')}. New conversation keeps these cards.</p></section>
    <div class="memory-counts"><div class="card pad"><strong>${memory.active_outcome_count}</strong><span>Recorded attempts</span></div><div class="card pad"><strong>${library.length}</strong><span>Recent request cards</span></div><div class="card pad"><strong>${needs}</strong><span>Feedback needing detail</span></div></div>
    <div class="section-title"><h2>Knowledge by service</h2><span class="tiny muted">Open a service to see its comments and history</span></div><section class="library-grid service-knowledge">${(memory.service_memory || []).map(row => `<button class="card knowledge-card" data-action="open-service" data-id="${e(row.service_id)}" data-browse="true"><strong>${e(nameFor(row.service_id))}</strong><span>${row.comments} comment${row.comments === 1 ? '' : 's'} · ${row.attempts} recorded attempt${row.attempts === 1 ? '' : 's'}</span><small>Updated ${e(row.updated_at.slice(0, 10))} · Open details ›</small></button>`).join('') || '<div class="card empty"><strong>Your service knowledge starts here</strong><p>Open a recommendation card, record what happened or leave a comment. It stays with that service.</p></div>'}</section>
    <details class="request-history"><summary>Requests & incomplete feedback · ${library.length} recent requests${needs ? ' · ' + needs + ' need detail' : ''}</summary><section class="library-grid">${library.map(card => `<div class="card pad">${libraryCard(card)}</div>`).join('')}</section></details>
    <section class="card"><div class="section-title pad"><div><h2>Service results</h2><p class="tiny muted">Latest 50 displayed · export includes up to 100</p></div>${button('Export memory', 'export', 'small')}</div>
    ${memory.outcomes.length ? `<ul class="records">${memory.outcomes.map(row => `<li><div><h3>${e(nameFor(row.service_id))}</h3><p>${e(row.region)} · ${e(row.age_band)} · ${e(row.mobility)} · ${e(row.occurred_on)}</p><div class="tag-row"><span class="pill ${row.delivery === 'Received' ? 'green' : ''}">${e(row.delivery)}</span>${row.satisfaction ? `<span class="pill">${row.satisfaction}/5 satisfaction</span>` : ''}${row.satisfaction_sentiment && row.satisfaction_sentiment !== 'Unspecified' ? `<span class="pill">${e(row.satisfaction_sentiment)} feedback</span>` : ''}</div></div><div class="record-actions">${button('Update', 'edit', 'small', `data-id="${e(row.id)}"`)}${button('Retract', 'retract', 'small quiet', `data-id="${e(row.id)}" data-type="Outcome"`)}</div></li>`).join('')}</ul>` : '<div class="empty"><strong>No completed results saved yet</strong><p>Tell Hive which provider worked or did not work. Clear results are saved automatically.</p></div>'}</section>
    <div class="section-title"><h2>Working preferences</h2>${button('Edit preferences', 'preferences', 'small')}</div><div class="note"><p>${e(memory.preferences.region)} · ${e(memory.preferences.language)} · ${e(memory.preferences.goal)}</p></div>
    ${memory.observations.length ? `<section class="card pad"><h2>Provider observations</h2>${memory.observations.map(row => `<div class="observation"><div><strong>${e(nameFor(row.service_id))}</strong><p>${e(row.attribute)} · ${e(row.value)} · ${e(row.observed_on)}</p></div>${button('Retract', 'retract', 'small', `data-id="${e(row.id)}" data-type="Observation"`)}</div>`).join('')}</section>` : ''}`;
}
function settingsView() {
  const account = state.data.account;
  return `<section class="intro compact"><div class="eyebrow">One connection, your own workspace</div><h1>Connection & settings.</h1><p>ChatGPT powers the conversation. Hive keeps service experience on this computer.</p></section>
    <div class="settings-grid"><section class="card pad"><h2>ChatGPT account</h2><p class="muted small spaced">${account.connected ? e(account.label) : 'Connect an account to enable AI recommendations and conversation.'}</p>
      ${account.sharing ? '<span class="pill green">Plan permission granted</span>' : '<p class="small muted spaced">An eligible account and permission to use its plan are required. Hive checks the connection rather than guessing your plan.</p>'}
      ${state.data.accountError ? `<p class="error-box">${e(state.data.accountError)}</p>` : ''}
      <div class="action-row">${button(state.connecting ? 'Complete sign-in in your browser…' : 'Continue with ChatGPT', 'connect', 'primary', state.connecting ? 'disabled' : '')}${state.connecting ? button('Cancel sign-in', 'cancel-connect') : ''}${account.connected ? button('Sign out', 'disconnect') : ''}</div>
      ${account.connected ? `<div class="action-row">${button('Enable plan usage', 'enable-plan', 'small')}${button('Manage usage', 'usage', 'small')}${button('Add account', 'add-account', 'small')}</div>` : ''}
      ${account.profiles.length ? `<div class="saved-accounts">${account.profiles.map(profile => `<button data-action="select-account" data-id="${e(profile.id)}" class="saved-account ${profile.id === account.profileId ? 'selected' : ''}">${e(profile.label)}${profile.id === account.profileId ? ' · Active' : ''}</button>`).join('')}</div>` : ''}
      ${state.data.models.items.length ? `<label class="field spaced"><span>Available model</span><select id="model" aria-label="Available model">${state.data.models.items.map(model => `<option value="${e(model.id)}"${model.id === state.data.models.selected ? ' selected' : ''}>${e(model.name)}</option>`).join('')}</select></label>` : ''}
      ${state.data.models.error ? `<p class="error-box">${e(state.data.models.error)}</p>` : ''}</section>
      <section class="card pad"><h2>Voice input</h2><p class="small muted spaced">Speak to dictate your message, review the words, then send. English recognition runs on this computer. Hive displays responses as text and does not read them aloud.</p><div class="action-row">${button(state.checking ? 'Checking…' : 'Check local setup', 'check', 'small', state.checking ? 'disabled' : '')}${button('Cancel voice setup', 'cancel-voice', 'small quiet', 'id="voice-cancel"')}</div><p class="tiny muted spaced" id="settings-voice-status" aria-live="polite">${e(state.voiceStatus)}</p>${state.setup ? `<div class="setup-result">${e(state.setup)}</div>` : ''}
        <hr><h2>Practice workspace</h2><p class="small muted spaced">Explore three fictional providers and 48 starting attempts before connecting ChatGPT.</p><div class="action-row">${button(state.data.practice ? 'Return to personal' : 'Open practice workspace', state.data.practice ? 'personal' : 'practice', 'small')}</div></section>
      <section class="note green"><strong>What Hive remembers</strong><p>Broad service needs, outcomes, ratings, dated observations and working preferences. Conversations are kept in memory while the app is open. Sign-in credentials use protected OS storage.</p></section>
      <section class="note"><strong>Share the installer, keep your own workspace</strong><p>Send the Windows Setup.exe through your usual file-sharing service or a USB drive. The recipient installs Hive and connects their own ChatGPT account. The installer contains the starting directory and voice model; your added services, history and sign-in are kept separately on your computer.</p><p>Each installation works independently. Sharing the installer does not create a shared team memory.</p></section></div>`;
}
function updateVoice() {
  const button = document.getElementById('mic-button'); if (button) { button.textContent = voice.listening ? 'Stop listening' : voice.loading ? 'Cancel setup' : voice.lastError ? 'Retry voice' : 'Speak'; button.setAttribute('aria-pressed', String(voice.listening)); }
  const status = document.getElementById('voice-status'); if (status) status.textContent = state.voiceStatus;
  const settingsStatus = document.getElementById('settings-voice-status'); if (settingsStatus) settingsStatus.textContent = state.voiceStatus;
  const cancel = document.getElementById('voice-cancel'); if (cancel) cancel.hidden = !voice.loading;
}
function renderReview() {
  const card = document.getElementById('review');
  if (!state.pending) { card.replaceChildren(); return; }
  const pending = state.pending;
  const rows = Object.entries(pending.arguments).filter(([key, value]) => !['confirmed', 'submission_id', 'share_with_hive', 'expected_version'].includes(key) && value !== '' && value !== null && value !== undefined && (!Array.isArray(value) || value.length));
  card.innerHTML = `<div class="review-card"><div class="eyebrow">Review before remembering</div><h2>${e(pending.title || pending.name.replaceAll('_', ' '))}</h2><dl>${rows.map(([key, value]) => `<div><dt>${e(key.replaceAll('_', ' '))}</dt><dd>${e(key === 'service_id' ? nameFor(value) : Array.isArray(value) ? value.join(', ') : value === null ? 'Unknown' : value)}</dd></div>`).join('')}</dl><p class="tiny muted">${state.data.account.sharing && !state.data.practice ? 'Say “Confirm save” in the conversation or use the button below.' : 'Use Confirm below to save this entry.'}</p><div class="action-row">${button('Confirm', 'confirm', 'primary')}${button('Cancel', 'cancel')}</div></div>`;
}
async function refresh() { state.data = await api.request('snapshot'); state.pending = state.data.pending; render(); }
async function search(values = {}) {
  if (Object.keys(values).length) { const { goal, query, ...context } = values; state.context = { ...state.context, ...context }; state.query = query || ''; state.goal = goal || state.goal; }
  const args = Object.fromEntries(Object.entries({ ...state.context, query: state.query, goal: state.goal }).filter(([, value]) => value !== ''));
  state.results = await api.request('read', { name: 'search_services', arguments: args }); render();
}
function openModal(title, body, onSubmit) {
  state.servicePanel = null; modal.classList.remove('service-dialog');
  modal.innerHTML = `<form><header><h2 id="modal-title">${e(title)}</h2>${button('×', 'close', 'quiet', 'aria-label="Close" type="button"')}</header><div class="modal-content">${body}<p class="form-error" role="alert"></p></div><footer>${button('Cancel', 'close', '', 'type="button"')}<button type="submit" class="button primary">Review entry</button></footer></form>`;
  submitModal = onSubmit; modal.showModal();
}
function serviceModal(service = null) {
  const values = state.data.enums;
  const languages = ['Confirm with provider', 'Interpretation available', ...values.languages.filter(value => value !== 'Unspecified')];
  const chosenLanguages = service?.languages || ['Confirm with provider'];
  openModal(service ? 'Edit your added service' : 'Add a service', `<div class="note"><strong>Public program information only</strong><p>Save to ${e(state.data.practice ? 'the separate practice workspace' : state.data.account.connected ? state.data.account.label + '’s local directory' : 'this computer’s local workspace')}. Leave patient names and identifiers out.</p></div>
    <div class="fields two">${input('name', 'Organization / program name *', service?.name || '', 'text', 'required minlength="3" maxlength="100"')}${select('category', 'Service type *', values.categories, service?.category || state.context.category || values.categories[0])}</div>
    ${areaText('summary', 'What does this service provide? *', service?.summary || '', 600, true)}
    ${input('source_url', 'Public provider or directory page (HTTPS) *', service?.source_url || '', 'url', 'required maxlength="400" placeholder="https://…"')}
    ${checkedOptions('coverage', 'Service areas *', values.regions, service?.coverage || (state.context.region ? [state.context.region] : []))}
    <details class="form-section" open><summary>Contact & referral information</summary><div class="section-fields"><div class="fields two">${input('phone', 'Public program phone', service?.phone || '', 'tel', 'maxlength="80"')}${input('email', 'Public program email', service?.email || '', 'email', 'maxlength="160"')}</div>
    ${input('address', 'Public service address', service?.address || '', 'text', 'maxlength="250"')}${areaText('referral', 'How to refer or register', service?.referral || '', 600)}<div class="fields two">${input('referral_url', 'Referral information link', service?.referral_url || '', 'url', 'maxlength="400"')}${input('booking_url', 'Booking information link', service?.booking_url || '', 'url', 'maxlength="400"')}</div></div></details>
    <details class="form-section"><summary>Eligibility, area details & cost</summary><div class="section-fields">${areaText('access', 'Eligibility & access requirements', service?.access || '', 1000)}${areaText('coverage_note', 'Catchment boundaries or area restrictions', service?.coverage_note || '', 400)}<div class="fields two">${input('minimum_age', 'Minimum age (blank if unknown)', service?.minimum_age ?? '', 'number', 'min="0" max="120" step="1"')}${input('maximum_age', 'Maximum age (blank if unknown)', service?.maximum_age ?? '', 'number', 'min="0" max="120" step="1"')}</div>${areaText('fees', 'Fees, funding or subsidy information', service?.fees || '', 300)}</div></details>
    <details class="form-section"><summary>Accessibility, languages & timing</summary><div class="section-fields"><div class="fields two">${select('wheelchair', 'Wheelchair compatibility', ['Unknown', 'Available', 'Unavailable'], service?.wheelchair || 'Unknown')}${select('lifting', 'Lifting assistance', ['Unknown', 'Available', 'Unavailable'], service?.lifting === true ? 'Available' : service?.lifting === false ? 'Unavailable' : 'Unknown')}</div>
    ${checkedOptions('languages', 'Languages', languages, chosenLanguages)}${input('other_languages', 'Other languages (comma separated)', chosenLanguages.filter(language => !languages.includes(language)).join(', '), 'text', 'maxlength="300"')}
    <div class="fields two">${select('hours', 'General hours', ['Confirm with provider', 'Weekday daytime', 'Daily', '24/7'], service?.hours || 'Confirm with provider')}${input('lead_days', 'Booking lead time (business days)', service?.lead_days ?? '', 'number', 'min="0" max="365" step="1"')}</div>${input('hours_details', 'Specific hours / scheduling notes', service?.hours_details || '', 'text', 'maxlength="300"')}</div></details>
    <details class="form-section"><summary>Availability, review date & keywords</summary><div class="section-fields"><div class="fields two">${select('availability', 'Last known availability', ['Verify with provider', 'Accepting inquiries', 'At capacity', 'Waitlist'], service?.availability || 'Verify with provider')}${input('source_checked', 'Source actually reviewed on (optional)', service?.source_checked || '', 'date', `max="${new Date().toISOString().slice(0, 10)}"`)}</div>${input('keywords', 'Search keywords (comma separated)', service?.keywords?.join(', ') || '', 'text', 'maxlength="500"')}<p class="tiny muted">Leave the review date blank if you have not checked the source. Saving an entry does not verify current capacity.</p></div></details>`, async (values, form) => {
      const args = { ...values, coverage: form.getAll('coverage'), languages: [...form.getAll('languages'), ...String(values.other_languages || '').split(',').map(value => value.trim()).filter(Boolean)], keywords: String(values.keywords || '').split(',').map(value => value.trim()).filter(Boolean),
        lifting: values.lifting === 'Available' ? true : values.lifting === 'Unavailable' ? false : null, source_checked: values.source_checked || null };
      for (const key of ['minimum_age', 'maximum_age', 'lead_days']) args[key] = values[key] === '' ? null : Number(values[key]);
      delete args.other_languages;
      if (!args.languages.length) args.languages = ['Confirm with provider'];
      customService(args);
      if (service) Object.assign(args, { service_id: service.id, expected_version: service.version || 1 });
      await api.request('propose', { name: service ? 'update_service' : 'add_service', arguments: args }); modal.close();
    });
}
function recordModal(service, row) {
  const base = row || { age_band: 'Unspecified', mobility: 'Unspecified', language: 'Unspecified', timing: 'Flexible', ...state.context };
  const context = { ...base, category: service.category, region: row ? row.region : service.coverage.includes(base.region) ? base.region : service.coverage[0] };
  const values = state.data.enums;
  openModal(row ? 'Update this attempt' : 'Record a service result', `<div class="note"><strong>${e(service.name)}</strong><p>${e(service.category)} · broad service requirements only</p></div>
    <div class="fields two">${select('region', 'Service area', values.regions, context.region)}${select('age_band', 'Age band', values.age_bands, context.age_band || 'Unspecified')}${select('mobility', 'Mobility', values.mobility, context.mobility)}${select('language', 'Language', values.languages, context.language)}${select('timing', 'Timing', values.timing, context.timing)}</div><div class="fields two">
    ${select('delivery', 'Was the service received?', state.data.enums.delivery, row?.delivery || 'Received')}${select('satisfaction', 'Satisfaction after receipt', ['', '1', '2', '3', '4', '5'], String(row?.satisfaction || ''))}${select('satisfaction_sentiment', 'Verbal satisfaction feedback', state.data.enums.sentiments, row?.satisfaction_sentiment || 'Unspecified')}
    ${select('reason', 'Reason if unresolved', state.data.enums.reasons, row?.reason || 'None')}<label class="field"><span>Observed on</span><input type="date" name="occurred_on" value="${row?.occurred_on || new Date().toISOString().slice(0, 10)}" max="${new Date().toISOString().slice(0, 10)}" required></label></div><p class="tiny muted">Satisfaction is optional and applies after receipt. Pending and declined attempts are counted separately.</p>`, async values => {
    const args = { service_id: service.id, category: service.category, ...Object.fromEntries(['region', 'age_band', 'mobility', 'language', 'timing'].map(key => [key, values[key]])),
      delivery: values.delivery, satisfaction: values.satisfaction ? Number(values.satisfaction) : null, satisfaction_sentiment: values.satisfaction_sentiment, reason: values.reason, occurred_on: values.occurred_on };
    if (row) Object.assign(args, { record_id: row.id, expected_version: row.version });
    await api.request('propose', { name: row ? 'update_outcome' : 'record_outcome', arguments: args }); modal.close();
  });
}
async function connect(options = {}) {
  await flushAllNotes();
  state.connecting = true; render();
  try { state.data = await api.request('sign-in', options); state.results = null; state.messages = []; state.noteDrafts = {}; state.servicePanel = null; notify(state.data.account.sharing ? 'Connected. Eligible requests will use your ChatGPT plan.' : 'Signed in. Plan usage was not enabled.'); }
  finally { state.connecting = false; render(); }
}
async function send() {
  const text = state.draft.trim(); if (!text || state.busy) return;
  state.messages.push({ role: 'user', text }); state.messages.push({ role: 'assistant', text: 'Checking the request…' }); state.draft = ''; state.busy = true; render();
  try { const answer = await api.request('chat', { text }); Object.assign(state.messages[state.messages.length - 1], answer); }
  catch (error) { state.messages[state.messages.length - 1].text = error.message; }
  finally { state.busy = false; await refresh(); document.getElementById('messages')?.scrollTo({ top: 100000 }); }
}
const actions = {
  navigate: target => { state.page = target.page; render(); if (state.page === 'directory' && !state.results) return search(); },
  connect: () => connect(), 'enable-plan': () => connect({ enablePlan: true }), 'add-account': () => connect({ addAccount: true }),
  'cancel-connect': () => api.request('cancel-sign-in'),
  disconnect: async () => { await flushAllNotes(); state.data = await api.request('sign-out'); state.messages = []; state.results = null; state.pending = null; state.noteDrafts = {}; state.servicePanel = null; render(); notify(state.data.revocationConfirmed ? 'Signed out. Local service history is retained for that account.' : 'Signed out locally. Remote revocation was not confirmed; review ChatGPT Settings.'); },
  'select-account': async target => { await flushAllNotes(); state.data = await api.request('select-account', { id: target.id }); state.results = null; state.messages = []; state.noteDrafts = {}; state.servicePanel = null; render(); },
  usage: () => api.request('open-usage'), source: target => api.request('open-source', { url: target.url }),
  'copy-contact': async target => { await api.request('copy-service-contact', { id: target.id, field: target.field }); notify('Public program contact copied.'); },
  'add-service': () => serviceModal(),
  'edit-service': async target => { const { service } = await api.request('read', { name: 'get_service_details', arguments: { service_id: target.id } }); serviceModal(service); },
  'clear-filters': async () => { state.page = 'directory'; state.query = ''; state.context = { category: '', region: '', age_band: 'Unspecified', mobility: 'Unspecified', language: 'Unspecified', timing: 'Flexible' }; state.goal = 'Balanced'; await search(); },
  'online-search': async () => {
    if (!state.context.category && !state.context.region && !state.query) { notify('Choose an area, service type or keyword to focus the online search.'); return; }
    state.draft = 'Use web search to find up to five additional services on official provider websites. Search requirements: ' + JSON.stringify({ ...state.context, keywords: state.query }) + '. Compare against my saved directory and recorded outcomes where available. Give the public program name, area restrictions, access route, contact and an HTTPS source for each. Distinguish published information from my history. Confirming an online listing does not establish current capacity. Do not save new services until I review and confirm them.';
    state.page = 'assistant'; await send();
  },
  practice: async () => { await flushAllNotes(); state.data = await api.request('mode', { practice: true }); state.noteDrafts = {}; state.servicePanel = null; state.page = 'directory'; state.messages = []; state.pending = null; state.results = null; await search(); },
  personal: async () => { await flushAllNotes(); state.data = await api.request('mode', { practice: false }); state.noteDrafts = {}; state.servicePanel = null; state.results = null; state.messages = []; state.pending = null; render(); if (state.page === 'directory') await search(); },
  microphone: async () => { if (voice.loading) voice.cancelPreparation(); else if (voice.listening) await voice.stop(); else { window.speechSynthesis?.cancel(); await voice.start(); } updateVoice(); },
  'cancel-voice': () => voice.cancelPreparation(),
  send, example: () => { state.draft = 'Recommend transportation in Georgina for an adult aged 40–64 using a walker. Use my past experience.'; return send(); },
  stop: () => api.request('stop'), 'clear-chat': async () => { await api.request('clear-chat'); state.messages = []; state.results = null; await refresh(); notify('New conversation started. Your memory library is retained.'); },
  'resume-request': async target => { const answer = await api.request('resume-request', { id: target.id }); state.messages = [{ role: 'assistant', ...answer }]; state.results = null; state.page = 'assistant'; await refresh(); },
  'open-service': openService,
  'choose-provider': async target => { const answer = await api.request('select-service', { service_id: target.id, request_id: target.request || null }); state.messages.push({ role: 'assistant', ...answer }); await refresh(); document.getElementById('messages')?.scrollTo({ top: 100000 }); },
  'reply-choice': target => { state.draft = target.text; return send(); },
  'more-options': async target => { if (target.request && target.request !== state.data.workspace?.request_id) await api.request('resume-request', { id: target.request }); state.draft = 'Show other options'; return send(); },
  'use-service': async target => { await flushNote(); await api.request('select-service', { service_id: target.id }); state.servicePanel = null; await openService({ id: target.id, focus: 'comment' }); },
  'card-result': async target => {
    if (state.busy) return;
    await flushNote(); state.busy = true; render();
    try {
      const answer = await api.request('quick-result', { service_id: target.id, request_id: target.request || null, delivery: target.delivery, reason: target.reason, satisfaction: target.rating ? Number(target.rating) : undefined, satisfaction_sentiment: target.sentiment });
      state.messages.push({ role: 'assistant', ...answer });
      if (state.servicePanel && state.servicePanel.service.id === target.id) {
        const panel = await api.request('service-workspace', { service_id: target.id, request_id: answer.request_id }); state.servicePanel = panel; renderServicePanel();
      }
    } finally { state.busy = false; await refresh(); document.getElementById('messages')?.scrollTo({ top: 100000 }); }
  },
  'save-note': async () => { await flushNote(); await refresh(); if (state.servicePanel) { const key = noteKey(state.servicePanel); delete state.noteDrafts[key]; state.servicePanel = await api.request('service-workspace', { service_id: state.servicePanel.service.id, request_id: state.servicePanel.request_id, browse: state.servicePanel.browse }); noteDraft().status = 'Saved. You can add another comment.'; renderServicePanel(); } },
  'edit-comment': async target => {
    await flushNote(); const note = state.servicePanel.comments.find(item => item.id === target.id); if (!note) return;
    const draft = noteDraft(); Object.assign(draft, { id: note.id, request_id: note.request_id, body: note.body, saved: note.body, version: note.version, interpreted: note.body, status: 'Saved on this service' }); renderServicePanel(true);
  },
  record: async target => { await flushNote(); const { service } = await api.request('read', { name: 'get_service_details', arguments: { service_id: target.id } }); recordModal(service); },
  edit: async target => { await flushNote(); const row = state.data.memory.outcomes.find(row => row.id === target.id) || state.servicePanel?.outcomes.find(row => row.id === target.id); if (!row) throw new Error('Reopen the service to update this attempt.'); const { service } = await api.request('read', { name: 'get_service_details', arguments: { service_id: row.service_id } }); recordModal(service, row); },
  retract: target => api.request('propose', { name: 'retract_memory', arguments: { record_id: target.id, record_type: target.type } }),
  confirm: async () => {
    const result = await api.request('confirm', { id: state.pending.id }); if (!result.saved) throw new Error('The entry was not saved.');
    state.pending = null;
    if (result.service) { state.page = 'directory'; state.query = ''; state.context.category = result.service.category; if (!result.service.coverage.includes(state.context.region)) state.context.region = ''; }
    await refresh(); if (state.results || result.service) await search();
    notify(result.service ? 'Service saved in your local directory.' : 'Confirmed result remembered.');
  },
  cancel: async () => { await api.request('cancel'); state.pending = null; renderReview(); },
  close: closeModal, export: async () => { const value = await api.request('export'); if (value.exported) notify('Memory exported.'); },
  preferences: () => { const pref = state.data.memory.preferences; openModal('Working preferences', `<div class="fields">${select('region', 'Preferred area', state.data.enums.regions, pref.region)}${select('language', 'Preferred language', state.data.enums.languages, pref.language)}${select('goal', 'Prioritize', state.data.enums.goals, pref.goal)}</div>`, async values => { await api.request('propose', { name: 'set_preferences', arguments: values }); modal.close(); }); },
  check: async () => {
    if (state.checking) return;
    state.checking = true; state.setup = 'Checking local storage and English speech recognition…'; render();
    let context;
    try {
      const result = await api.request('check-storage');
      const bytes = await fetch(new URL('voice/voice-check.wav', document.baseURI)).then(response => { if (!response.ok) throw new Error('The bundled voice sample is missing.'); return response.arrayBuffer(); });
      context = new AudioContext();
      const buffer = await context.decodeAudioData(bytes);
      const heard = await voice.transcribeSamples(buffer.getChannelData(0), buffer.sampleRate);
      if (!heard) throw new Error('The sample loaded but no speech was recognized. Please retry the voice check.');
      state.setup = `Storage: ${result.storage}. ${result.records} recorded attempts. Voice check heard: “${heard}”. ChatGPT: ${result.chatgpt}. This sample check does not open your microphone.`;
    } catch (error) { state.setup = 'Local setup check: ' + error.message; }
    finally { await context?.close(); state.checking = false; render(); }
  }
};
document.addEventListener('click', event => {
  const target = event.target.closest('[data-action]');
  if (!target || target.disabled) return;
  if (target.tagName === 'A') event.preventDefault();
  Promise.resolve(actions[target.dataset.action]?.(target.dataset)).catch(error => { if (error.code !== 'voice_cancelled') notify(error.message, true); });
});
document.addEventListener('input', event => {
  if (event.target.id === 'message') state.draft = event.target.value;
  if (event.target.id === 'service-note' && state.servicePanel) { const draft = noteDraft(); draft.body = event.target.value; draft.status = 'Saving…'; updateNoteStatus(draft); clearTimeout(draft.timer); draft.timer = setTimeout(() => flushNote(draft, false).catch(() => {}), 650); }
});
document.addEventListener('focusout', event => { if (event.target.id === 'service-note' && state.servicePanel) flushNote().catch(error => notify(error.message, true)); });
modal.addEventListener('cancel', event => { event.preventDefault(); closeModal().catch(error => notify(error.message, true)); });
document.addEventListener('change', event => {
  if (event.target.id === 'model') api.request('select-model', { id: event.target.value }).then(value => { state.data.models = value; }).catch(error => notify(error.message, true));
  if (event.target.closest('#search-form')) {
    const form = document.getElementById('search-form');
    const ready = form.elements.category.value && form.elements.region.value;
    document.getElementById('practical-fields').disabled = !ready;
    document.getElementById('search-help').textContent = ready ? 'These requirements affect the fit calculation.' : 'Choose a service type and area to enable the fit calculation.';
    const { goal, query, ...context } = Object.fromEntries(new FormData(form)); state.goal = goal || state.goal; state.query = query || ''; state.context = { ...state.context, ...context };
  }
});
document.addEventListener('keydown', event => { if (event.target.id === 'message' && event.key === 'Enter' && !event.shiftKey && !state.data.practice) { event.preventDefault(); send(); } });
document.addEventListener('submit', async event => {
  if (event.target.id === 'search-form') { event.preventDefault(); try { await search(Object.fromEntries(new FormData(event.target))); } catch (error) { notify(error.message, true); } }
});
modal.addEventListener('submit', async event => {
  event.preventDefault(); const submit = event.submitter; submit.disabled = true;
  try { const form = new FormData(event.target); await submitModal(Object.fromEntries(form), form); }
  catch (error) { modal.querySelector('.form-error').textContent = error.message; }
  finally { submit.disabled = false; }
});
api.subscribe(event => {
  if (event.type === 'closing-requested') { if (!state.closing) { state.closing = true; flushAllNotes().then(() => api.request('close-after-save')).catch(error => { state.closing = false; notify('Keep Hive open to save your comment: ' + error.message, true); }); } }
  if (event.type === 'recommendations') { state.results = event.value; state.context = { ...state.context, ...event.value.context }; state.query = event.value.query || ''; if (!state.busy) render(); }
  if (event.type === 'confirmation') { state.pending = event.value; renderReview(); }
  if (event.type === 'saved') { state.pending = null; renderReview(); }
  if (event.type === 'delta') {
    const message = state.messages[state.messages.length - 1];
    if (state.busy && message?.role === 'assistant') { if (message.text === 'Checking the request…') message.text = ''; message.text += event.value;
      const elements = document.querySelectorAll('.message.assistant > div'); if (elements.length) elements[elements.length - 1].textContent = message.text; }
  }
});
render(); refresh().then(() => api.request('ui-ready')).catch(error => { app.innerHTML = `<main class="startup"><h1>Hive could not open</h1><p>${e(error.message)}</p></main>`; });
