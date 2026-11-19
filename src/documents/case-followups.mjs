import { randomUUID } from 'node:crypto';

export const CHAT_NOTE_LIMIT = 2000;
const outcomes = ['worked', 'not_worked'];
const timestamp = () => new Date().toISOString();
const validRating = rating => Number.isInteger(rating) && rating >= 1 && rating <= 5;
const noteText = body => typeof body === 'string' ? body.replace(/\u0000/g, '').slice(0, CHAT_NOTE_LIMIT) : '';
const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 100;

function followupData(value) {
  if (!validId(value?.card_id) || !Number.isInteger(value.reply_sequence) || value.reply_sequence < 1) return null;
  return {
    card_id: value.card_id,
    reply_sequence: value.reply_sequence,
    deferred: value.deferred === true,
    outcome: outcomes.includes(value.outcome) ? value.outcome : null,
    body: noteText(value.body),
    rating: validRating(value.rating) ? value.rating : null,
    result_id: validId(value.result_id) ? value.result_id : null
  };
}

export function restoreFollowup(value, {cards, comments}) {
  const followup = followupData(value);
  if (!followup || !cards.has(followup.card_id)) return undefined;
  const resultId = comments.get(followup.result_id) || null;
  return {
    ...followup, card_id: cards.get(followup.card_id), result_id: resultId,
    outcome: followup.result_id && !resultId ? null : followup.outcome
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
  return {
    ...followup,
    ...(followup.result_id && !result ? {outcome: null, deferred: false} : {}),
    card: {title: card.title, contacts: card.contacts?.slice(0, 2) || []},
    result: result || null,
    unavailable: card.archived
  };
}

// Follow-up controls belong to the case transcript. Only the final save writes to
// the provider's experience history, using the same Undo/Redo as the detail form.
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

  async start({case_id, reply_id, card_id}) {
    const row = await this.db().transaction(async () => {
      const current = await this.activeCase(case_id);
      const reply = await this.message(case_id, reply_id, current.owner_id);
      const payload = JSON.parse(reply?.payload_json || '{}');
      if (!payload.cards?.some(card => card.id === card_id)) throw new Error('Choose a service card from this topic.');
      const card = await this.store.get(card_id, {case_id});
      if (!card.document_id || card.archived ||
          (card.source_format !== 'service-directory' && payload.presentation !== 'service-options')) {
        throw new Error('Choose a current service recommendation.');
      }
      const existing = await this.db().prepare(
        "SELECT * FROM personal_case_messages WHERE case_id=? AND owner_id=? AND json_extract(payload_json,'$.followup.card_id')=? AND json_extract(payload_json,'$.followup.reply_sequence')=?"
      ).bind(case_id, current.owner_id, card_id, reply.sequence).first();
      if (existing) return existing;
      const {next} = await this.db().prepare(
        'SELECT COALESCE(MAX(sequence),0)+1 AS next FROM personal_case_messages WHERE case_id=? AND owner_id=?'
      ).bind(case_id, current.owner_id).first();
      const id = randomUUID(), time = timestamp();
      const followup = followupData({card_id, reply_sequence: reply.sequence});
      const body = 'Service selected for follow-up: ' + card.title;
      await this.db().prepare(
        "INSERT INTO personal_case_messages(id,owner_id,case_id,origin_id,sequence,role,body,payload_json,created_at,updated_at) VALUES (?,?,?,?,?,'assistant',?,?,?,?)"
      ).bind(id, current.owner_id, case_id, id, next, body, JSON.stringify({followup}), time, time).run();
      await this.touch(current, time);
      return this.message(case_id, id, current.owner_id);
    });
    return this.view(row);
  }

  async update({case_id, message_id, step, outcome, body, rating}) {
    const row = await this.db().transaction(async () => {
      const current = await this.activeCase(case_id);
      const message = await this.message(case_id, message_id, current.owner_id);
      const followup = followupData(JSON.parse(message?.payload_json || '{}').followup);
      if (!followup) throw new Error('This service follow-up is unavailable in this topic.');
      const card = await this.store.get(followup.card_id, {case_id});
      if (!card.document_id || card.archived) throw new Error('This service card is no longer available.');
      if (followup.result_id) {
        if (card.comments.some(note => note.id === followup.result_id && note.outcome)) return message;
        followup.result_id = null;
        followup.outcome = null;
      }
      switch (step) {
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
        case 'save': {
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
          followup.result_id = saved.id;
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
        if (!followup?.outcome || followup.result_id) continue;
        await this.write(message, {...followup, body: noteText(draft.body), rating: validRating(draft.rating) ? draft.rating : null}, time);
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
      payload: {followup: await hydrateFollowup(value, this.store, row.case_id)}
    };
  }
}
