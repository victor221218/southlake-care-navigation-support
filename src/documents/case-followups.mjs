import { randomUUID } from 'node:crypto';
import { InputHistory } from './input-history.mjs';
import { isServiceSource } from './service-sources.mjs';

export const CHAT_NOTE_LIMIT = 2000;
const outcomes = ['worked', 'not_worked'];
const timestamp = () => new Date().toISOString();
const validRating = rating => Number.isInteger(rating) && rating >= 1 && rating <= 5;
const noteText = body => typeof body === 'string' ? body.replace(/\u0000/g, '').slice(0, CHAT_NOTE_LIMIT) : '';
const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 100;
const recentNoteIds = ids => Array.isArray(ids) ? [...new Set(ids.filter(validId))].slice(-20) : [];
const historyScope = followup => ({
  card_id: followup.card_id,
  entry_ids: [followup.result_id, ...followup.note_ids].filter(Boolean)
});

function followupData(value) {
  if (!validId(value?.card_id) || !Number.isInteger(value.reply_sequence) || value.reply_sequence < 0) return null;
  return {
    card_id: value.card_id,
    reply_sequence: value.reply_sequence,
    deferred: value.deferred === true,
    outcome: outcomes.includes(value.outcome) ? value.outcome : null,
    body: noteText(value.body),
    rating: validRating(value.rating) ? value.rating : null,
    result_id: validId(value.result_id) ? value.result_id : null,
    keep_chat: value.keep_chat === true,
    note_open: value.note_open === true,
    note_draft: noteText(value.note_draft),
    note_ids: recentNoteIds(value.note_ids)
  };
}

export function restoreFollowup(value, {cards, comments}) {
  const followup = followupData(value);
  if (!followup || !cards.has(followup.card_id)) return undefined;
  const resultId = comments.get(followup.result_id) || null;
  return {
    ...followup, card_id: cards.get(followup.card_id), result_id: resultId,
    outcome: followup.result_id && !resultId ? null : followup.outcome,
    note_ids: followup.note_ids.map(id => comments.get(id)).filter(Boolean)
  };
}

export async function hydrateFollowup(value, store, caseId) {
  const followup = followupData(value);
  if (!followup) return null;
  let card;
  try {
    card = await store.get(followup.card_id, {case_id: caseId});
  } catch {
    return {...followup, unavailable: true};
  }
  const result = card.comments.find(comment => comment.id === followup.result_id && comment.outcome);
  const latestNote = followup.note_ids.slice().reverse()
    .map(id => card.comments.find(comment => comment.id === id && !comment.outcome))
    .find(Boolean);
  const contacts = ['phone', 'email']
    .map(kind => card.contacts?.find(contact => contact.kind === kind && contact.value))
    .filter(Boolean);
  return {
    ...followup,
    ...(followup.result_id && !result ? {outcome: null, deferred: false} : {}),
    card: {title: card.title, contacts},
    latest_note: latestNote || null,
    result: result || null,
    history: card.archived ? null : await new InputHistory({store}).state(historyScope(followup)),
    unavailable: card.archived
  };
}

// Explicit note and result saves update the provider card and the chat together.
export class CaseFollowups {
  constructor({cases, store, inputHistory}) {
    Object.assign(this, {cases, store, inputHistory});
  }

  db() { return this.store.db(); }

  async activeCase(id) {
    const current = await this.cases.row(id);
    if (current.status !== 'active') throw new Error('Reopen this saved topic to record a result.');
    return current;
  }

  async message(caseId, messageId, owner) {
    return this.db().prepare(
      "SELECT * FROM personal_case_messages WHERE id=? AND case_id=? AND owner_id=? AND role='assistant' AND state='complete'"
    ).bind(messageId, caseId, owner).first();
  }

  async latestSelection(caseId, cardId=null) {
    return this.db().prepare(`SELECT * FROM personal_case_messages
      WHERE case_id=? AND owner_id=? AND role='assistant' AND state='complete'
        AND json_type(payload_json,'$.followup')='object'
        ${cardId?"AND json_extract(payload_json,'$.followup.card_id')=?":''}
      ORDER BY sequence DESC LIMIT 1`).bind(caseId,this.store.owner(),...(cardId?[cardId]:[])).first();
  }

  async recordFromChat({case_id,card_id,outcome,body,rating}) {
    return this.db().transaction(async()=>{
      const previous=await this.latestSelection(case_id,card_id);
      const messageId=previous?.id || (await this.start({case_id,card_id})).id;
      const already=previous && JSON.parse(previous.payload_json||'{}').followup?.result_id;
      const saved=await this.update({case_id,message_id:messageId,step:'record',outcome,body,rating});
      return {...saved,alreadyRecorded:Boolean(already&&already===saved.payload.followup?.result?.id)};
    });
  }

  async start({case_id, reply_id, card_id}) {
    const row = await this.db().transaction(async () => {
      const current = await this.activeCase(case_id);
      const reply = reply_id ? await this.message(case_id, reply_id, current.owner_id) : null;
      const payload = JSON.parse(reply?.payload_json || '{}');
      if (reply_id && !payload.cards?.some(card => card.id === card_id)) throw new Error('Choose a service card from this topic.');
      const card = await this.store.get(card_id, {case_id});
      if (!card.document_id || card.archived ||
          (!isServiceSource(card.source_format) && payload.presentation !== 'service-options')) {
        throw new Error('Choose a current service recommendation.');
      }
      // Sequence zero identifies selections that started in Known services.
      const replySequence = reply?.sequence ?? 0;
      const existing = await this.db().prepare(
        "SELECT * FROM personal_case_messages WHERE case_id=? AND owner_id=? AND json_extract(payload_json,'$.followup.card_id')=? AND json_extract(payload_json,'$.followup.reply_sequence')=? ORDER BY sequence DESC LIMIT 1"
      ).bind(case_id, current.owner_id, card_id, replySequence).first();
      if (existing) return existing;
      const {next} = await this.db().prepare(
        'SELECT COALESCE(MAX(sequence),0)+1 AS next FROM personal_case_messages WHERE case_id=? AND owner_id=?'
      ).bind(case_id, current.owner_id).first();
      const id = randomUUID(), time = timestamp();
      const followup = followupData({card_id, reply_sequence: replySequence});
      const body = 'Service selected for follow-up: ' + card.title;
      await this.db().prepare(
        "INSERT INTO personal_case_messages(id,owner_id,case_id,origin_id,sequence,role,body,payload_json,created_at,updated_at) VALUES (?,?,?,?,?,'assistant',?,?,?,?)"
      ).bind(id, current.owner_id, case_id, id, next, body, JSON.stringify({followup}), time, time).run();
      await this.touch(current, time);
      return this.message(case_id, id, current.owner_id);
    });
    return this.view(row);
  }

  async update({case_id, message_id, step, outcome, body, rating, change_id}) {
    const row = await this.db().transaction(async () => {
      const current = await this.activeCase(case_id);
      const message = await this.message(case_id, message_id, current.owner_id);
      const followup = followupData(JSON.parse(message?.payload_json || '{}').followup);
      if (!followup) throw new Error('This service follow-up is unavailable in this topic.');
      const card = await this.store.get(followup.card_id, {case_id});
      if (!card.document_id || card.archived) throw new Error('This service card is no longer available.');
      if (step === 'keep-chat') {
        const completion = await this.cases.completion(current);
        if (completion?.message_id !== message_id) return message;
        followup.keep_chat = true;
        await this.write(message,followup,message.updated_at);
        return this.message(case_id,message_id,current.owner_id);
      }
      if (step === 'undo' || step === 'redo') {
        await this.inputHistory.apply(step, {scope:historyScope(followup), expected_id:change_id});
        const time = timestamp();
        await this.write(message, followup, time);
        await this.touch(current, time);
        return message;
      }
      const editingNote = ['open-note', 'cancel-note', 'save-note'].includes(step);
      if (followup.result_id && !editingNote) {
        if (card.comments.some(note => note.id === followup.result_id && note.outcome)) return message;
        followup.result_id = null;
        followup.outcome = null;
      }
      switch (step) {
        case 'open-note':
          followup.note_open = true;
          break;
        case 'cancel-note':
          followup.note_open = false;
          followup.note_draft = '';
          break;
        case 'save-note': {
          if (!followup.note_open) return message;
          if (!followup.note_draft.trim()) throw new Error('Write a note before saving.');
          const note = await this.inputHistory.record(
            {type: 'comment', card_id: card.id, label: 'Add service note'},
            () => this.store.comment({card_id: card.id, body: followup.note_draft})
          );
          await this.store.linkCaseMemory(case_id,'comment',note.id,'explicit');
          followup.note_ids = recentNoteIds([...followup.note_ids, note.id]);
          followup.note_open = false;
          followup.note_draft = '';
          break;
        }
        case 'choose':
          if (!outcomes.includes(outcome)) throw new Error('Choose Worked or Didn’t work.');
          followup.outcome = outcome;
          followup.deferred = false;
          break;
        case 'later':
          followup.deferred = true;
          break;
        case 'resume':
          followup.deferred = false;
          break;
        case 'change':
          followup.outcome = null;
          break;
        case 'record':
        case 'save': {
          if (step==='record') {
            if (!outcomes.includes(outcome)) throw new Error('Choose Worked or Didn’t work.');
            followup.outcome=outcome;
            followup.deferred=false;
          }
          if (!followup.outcome || followup.deferred) throw new Error('Choose an outcome before saving.');
          const serviceResult = {
            card_id: card.id,
            outcome: followup.outcome,
            body: body === undefined ? followup.body : noteText(body),
            rating: rating === undefined ? followup.rating : rating
          };
          const saved = await this.inputHistory.record(
            {type: 'comment', card_id: card.id, label: 'Record service result'},
            () => this.store.serviceResult(serviceResult, {fromCaseSuggestion: true})
          );
          await this.store.linkCaseMemory(case_id,'comment',saved.id,'explicit');
          followup.result_id = saved.id;
          followup.keep_chat = false;
          followup.body = '';
          followup.rating = null;
          break;
        }
        default:
          throw new Error('Choose a supported follow-up action.');
      }
      const time = timestamp();
      await this.write(message, followup, time);
      await this.touch(current, time);
      return this.message(case_id, message_id, current.owner_id);
    });
    return this.view(row);
  }

  async saveDrafts({case_id, drafts}) {
    if (!Array.isArray(drafts) || drafts.length > 40) throw new Error('Too many feedback drafts to save at once.');
    await this.db().transaction(async () => {
      const current = await this.activeCase(case_id);
      const time = timestamp();
      for (const draft of drafts) {
        const message = await this.message(case_id, draft.message_id, current.owner_id);
        const followup = followupData(JSON.parse(message?.payload_json || '{}').followup);
        if (!followup) continue;
        if (followup.note_open && typeof draft.note_draft === 'string') {
          followup.note_draft = noteText(draft.note_draft);
        }
        if (followup.outcome && !followup.result_id && typeof draft.body === 'string') {
          followup.body = noteText(draft.body);
          followup.rating = validRating(draft.rating) ? draft.rating : null;
        }
        if (message.payload_json !== JSON.stringify({followup})) {
          await this.write(message, followup, time);
          this.cases.changed({case_id:case_id});
        }
      }
    });
  }

  async write(message, followup, time) {
    await this.db().prepare(
      'UPDATE personal_case_messages SET payload_json=?,updated_at=? WHERE id=? AND case_id=? AND owner_id=?'
    ).bind(JSON.stringify({followup}), time, message.id, message.case_id, message.owner_id).run();
  }

  async touch(current, time) {
    await this.db().prepare('UPDATE personal_cases SET updated_at=? WHERE id=? AND owner_id=?')
      .bind(time, current.id, current.owner_id).run();
    this.cases.changed({case_id: current.id});
  }

  async view(row) {
    const value = JSON.parse(row.payload_json).followup;
    return {
      id: row.id, role: row.role, body: row.body, sequence: row.sequence, state: row.state,
      payload: {followup: await hydrateFollowup(value, this.store, row.case_id)},
      completion: await this.cases.completion(await this.cases.row(row.case_id))
    };
  }
}
