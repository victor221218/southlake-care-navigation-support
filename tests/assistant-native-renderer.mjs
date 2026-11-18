// Production renderer/IPC acceptance check, using only isolated test data.
const closingComment = 'Follow-up: confirm the accessible vehicle before booking.';
const exactMessage = 'I tried chats iride plus and they said no';
async function until(check) { const end = Date.now() + 20000; while (!check()) { if (Date.now() > end) throw new Error('The renderer check timed out.'); await new Promise(resolve => setTimeout(resolve, 40)); } }
const snapshot = () => window.hive.request('snapshot');
async function send(text) {
  const before = document.querySelectorAll('.message').length;
  const input = document.getElementById('message'); input.value = text; input.dispatchEvent(new Event('input', { bubbles: true }));
  document.querySelector('[data-action="send"]').click();
  await until(() => document.querySelectorAll('.message').length >= before + 2 && document.querySelector('[data-action="send"]')?.disabled === false);
  return snapshot();
}
async function closePanel() { document.querySelector('#modal [data-action="close"]').click(); await until(() => !document.getElementById('modal').open); }
async function openCircle() {
  document.querySelector('.answer-card[data-service-id="circle-iride"] [data-action="open-service"]').click();
  await until(() => document.getElementById('modal').open && document.querySelector('#modal h2')?.textContent.includes('Circle of Care'));
}
function typeComment(body) { const input = document.getElementById('service-note'); input.value = body; input.dispatchEvent(new Event('input', { bubbles: true })); }
async function run() {
  try {
    await until(() => document.querySelector('[data-action="navigate"][data-page="memory"]'));
    const phase = await window.hiveSmoke.phase();
    if (phase === 'reopen') {
      const stored = await snapshot();
      if (stored.memory.active_outcome_count !== 2 || stored.workspace.selected_service_id !== 'chats-rides') throw new Error('A real app restart lost the results or current service.');
      const notes = stored.memory.comments.filter(note => note.service_id === 'chats-rides');
      if (notes.length !== 3 || !notes.some(note => note.body === closingComment)) throw new Error('The final unsaved-on-screen comment did not survive app close.');
      document.querySelector('[data-action="resume-request"]').click();
      await until(() => document.querySelectorAll('.answer-card').length === 3 && document.querySelector('[data-action="send"]')?.disabled === false);
      const messagesBottom = document.getElementById('messages').getBoundingClientRect().bottom;
      const cardActionsVisible = [...document.querySelectorAll('.card-bottom-actions')].every(item => item.getBoundingClientRect().bottom <= messagesBottom + 2);
      const cardsCapture = await window.hiveSmoke.capture('recommendation-cards');
      document.querySelector('[data-action="navigate"][data-page="memory"]').click();
      await until(() => document.querySelector('.knowledge-card[data-id="chats-rides"]'));
      document.querySelector('.knowledge-card[data-id="chats-rides"]').click();
      await until(() => document.getElementById('modal').open && document.querySelector('#saved-service-comments')?.textContent.includes(exactMessage));
      if (!document.getElementById('saved-service-comments').textContent.includes(closingComment) || document.getElementById('service-note').value !== '') throw new Error('Reopened comments are not on the correct service card.');
      const capture = await window.hiveSmoke.capture('service-comments');
      window.hiveSmoke.finish({ ok: true, real_app_reopen_verified: true, close_flush_verified: true, current_service_restored: true, reopened_service_comments: notes.length, library_program_view_verified: true, card_actions_visible: cardActionsVisible, cards_screenshot: cardsCapture, screenshot: capture });
      return;
    }
    const fresh = await snapshot(); if (fresh.memory.active_outcome_count !== 0) throw new Error('The acceptance profile must start empty.');
    document.querySelector('[data-action="navigate"][data-page="directory"]').click();
    await until(() => document.querySelector('.service-actions [data-action="record"]'));
    document.querySelector('[data-action="navigate"][data-page="assistant"]').click();
    let stored = await send('I need a ride in North York.');
    if (document.querySelectorAll('.answer-card').length !== 3) throw new Error('The answer did not render three clickable cards.');
    const requestId = stored.workspace.request_id;
    const cardsCapture = await window.hiveSmoke.capture('recommendation-cards');
    await openCircle();
    typeComment('Ask intake about the pickup boundary.');
    await until(() => document.getElementById('note-status').textContent.includes('Saved on this service'));
    stored = await snapshot(); if (stored.memory.comments.length !== 1 || stored.memory.active_outcome_count !== 0) throw new Error('Comment autosave invented an outcome or failed.');
    await closePanel(); await openCircle();
    if (!document.getElementById('saved-service-comments').textContent.includes('pickup boundary') || document.getElementById('service-note').value) throw new Error('A saved comment was lost or reused as a new editor draft.');
    await closePanel();
    stored = await send(exactMessage);
    if (stored.memory.active_outcome_count !== 1 || stored.memory.outcomes[0].service_id !== 'chats-rides' || stored.memory.outcomes[0].delivery !== 'Not received') throw new Error('The exact CHATS refusal was attributed incorrectly.');
    const last = document.querySelectorAll('.message.assistant');
    if (last[last.length-1].textContent.includes('Was the service actually') || last[last.length-1].querySelectorAll('.answer-card').length !== 3) throw new Error('The refusal did not move directly to alternatives.');
    document.querySelector('.active-service [data-action="open-service"]').click();
    await until(() => document.getElementById('modal').open && document.querySelector('#modal h2')?.textContent.includes('CHATS'));
    if (!document.getElementById('saved-service-comments').textContent.includes(exactMessage) || document.getElementById('saved-service-comments').textContent.includes('pickup boundary')) throw new Error('Comments crossed provider cards.');
    typeComment('They asked us to call the intake line again.');
    document.querySelector('#modal [data-action="save-note"]').click();
    await until(() => document.getElementById('service-note')?.value === '' && document.getElementById('saved-service-comments')?.querySelectorAll('.saved-comment').length === 2);
    await closePanel(); await openCircle(); await closePanel();
    stored = await send('This did not work.');
    if (stored.memory.active_outcome_count !== 2 || !stored.memory.outcomes.some(row => row.service_id === 'circle-iride' && row.delivery === 'Not received')) throw new Error('Short feedback did not use the selected service.');
    const replies = document.querySelectorAll('.message.assistant');
    if (replies[replies.length-1].querySelector('.answer-card[data-service-id="circle-iride"]')) throw new Error('The failed service was repeated as the next option.');
    document.querySelector('[data-action="clear-chat"]').click(); await until(() => !document.querySelector('.message'));
    stored = await send('What do you remember?'); if (stored.memory.active_outcome_count !== 2) throw new Error('New conversation discarded history.');
    await window.hive.request('select-service', { service_id: 'chats-rides', request_id: requestId });
    document.querySelector('[data-action="navigate"][data-page="memory"]').click(); await until(() => document.querySelector('.knowledge-card[data-id="chats-rides"]'));
    document.querySelector('.knowledge-card[data-id="chats-rides"]').click(); await until(() => document.getElementById('modal').open);
    await closePanel();
    await window.hive.request('service-workspace', { service_id: 'chats-rides', request_id: requestId });
    document.querySelector('[data-action="navigate"][data-page="assistant"]').click();
    // Open the selected-service card through the real UI, then close the app
    // immediately after typing. The production close handshake must save it.
    const update = await snapshot();
    if (update.workspace.selected_service_id !== 'chats-rides') throw new Error('The selected service was lost.');
    // A normal message refresh exposes the restored current-service chip.
    await send('Thanks');
    document.querySelector('.active-service [data-action="open-service"]').click();
    await until(() => document.getElementById('modal').open && document.querySelector('#modal h2')?.textContent.includes('CHATS'));
    const live = await window.hiveSmoke.checkConnection();
    typeComment(closingComment);
    window.hiveSmoke.finish({ ok: true, fresh_history: true, recommendation_cards: 3, exact_chats_refusal_verified: true, short_selected_feedback_verified: true, alternatives_exclude_failed_service: true, comment_autosave_verified: true, comments_scoped_to_program: true, new_conversation_preserves_memory: true, voice_input_only: !window.speechSynthesis?.speaking, cards_screenshot: cardsCapture, live_connection: live, microphone_opened: false });
  } catch (error) { window.hiveSmoke.finish({ ok: false, error: String(error.message || error) }); }
}
run();
