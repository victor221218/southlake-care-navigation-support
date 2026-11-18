const e = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const short = text => String(text || '').length > 145 ? String(text).slice(0, 142).replace(/\s+\S*$/, '') + '…' : String(text || '');

export function serviceCards(items, { requestId = '', selectedId = null, chooseProvider = false, currentFeedback = [], liveItems = [], commentCounts = {} } = {}) {
  if (!items?.length) return '';
  return `<div class="chat-card-grid" aria-label="Service options">${items.map((original, index) => {
    const item = liveItems.find(value => value.service.id === original.service.id) || original;
    const service = item.service, stats = item.evidence || {}, letter = original.letter || String.fromCharCode(65 + index);
    const feedback = currentFeedback.find(value => value.service_id === service.id && value.state === 'Saved');
    const attrs = `data-id="${e(service.id)}" data-request="${e(requestId || '')}"`;
    const notes = commentCounts[service.id] ?? original.comment_count ?? 0;
    return `<article class="answer-card ${selectedId === service.id ? 'selected' : ''}" data-service-id="${e(service.id)}">
      <button class="answer-card-title" data-action="open-service" ${attrs}><span class="option-letter">${e(letter)}</span><span><small>${e(service.category)}</small><strong>${e(service.name)}</strong></span><span class="card-chevron" aria-hidden="true">›</span></button>
      <p class="answer-card-summary">${e(short(service.summary))}</p>
      <div class="answer-card-facts"><span>${e(service.phone || 'Contact on provider page')}</span><span>${stats.completed ? `${stats.received} of ${stats.completed} recorded connections received` : 'No comparable completed history yet'}</span>${feedback ? `<span class="pill ${feedback.delivery === 'Received' ? 'green' : 'amber'}">${e(feedback.delivery)} · saved for this request</span>` : ''}</div>
      ${chooseProvider ? `<button class="button primary choose-program" data-action="choose-provider" ${attrs}>This is the service</button>` : `<div class="card-result-actions"><button class="button small success" data-action="card-result" data-delivery="Received" ${attrs}>Worked</button><button class="button small" data-action="card-result" data-delivery="Not received" ${attrs}>Didn’t work</button></div>`}
      <div class="card-bottom-actions"><button data-action="open-service" ${attrs}>Details & access</button><button data-action="open-service" data-focus="comment" ${attrs}>${notes ? `${notes} comment${notes === 1 ? '' : 's'}` : 'Add comment'}</button></div>
    </article>`;
  }).join('')}</div>`;
}
