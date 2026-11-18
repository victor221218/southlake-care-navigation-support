import { randomUUID, createHash } from 'node:crypto';
import { enums } from './core/catalog.mjs';
import { ensure, pickEnum, validateKeys } from './core/domain.mjs';

const contextEnums = { category: enums.categories, region: enums.regions, age_band: enums.age_bands, mobility: enums.mobility, language: enums.languages, timing: enums.timing };
const defaults = { age_band: 'Unspecified', mobility: 'Unspecified', language: 'Unspecified', timing: 'Flexible' };
const all = async (db, sql, args = []) => (await db.prepare(sql).bind(...args).all()).results;
const first = (db, sql, args = []) => db.prepare(sql).bind(...args).first();
const timestamp = () => new Date().toISOString();
const outcomeFields = row => ({ delivery: row.delivery, satisfaction: row.satisfaction, satisfaction_sentiment: row.satisfaction_sentiment, reason: row.reason });
const feedbackView = row => ({ id: row.id, ...JSON.parse(row.payload), ...(row.delivery && !row.retracted ? outcomeFields(row) : {}), outcome_id: row.outcome_id, state: row.retracted ? 'Retracted' : row.state, updated_at: row.updated_at });
export function libraryContext(value = {}) {
  validateKeys(value, Object.keys(contextEnums));
  const result = { ...defaults };
  for (const [key, item] of Object.entries(value)) if (item !== undefined && item !== null && item !== '') result[key] = pickEnum(item, contextEnums[key], key);
  return result;
}

export async function libraryCards(db, owner, limit = 50) {
  const requests = await all(db, 'SELECT id,context,selected_service_id,created_at,updated_at FROM hive_library_requests WHERE owner_id=? AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT ?', [owner, limit]);
  if (!requests.length) return [];
  const rows = await all(db, 'SELECT f.id,f.request_id,f.payload,f.outcome_id,f.state,f.updated_at,o.delivery,o.satisfaction,o.satisfaction_sentiment,o.reason,o.deleted_at AS retracted FROM hive_library_feedback f LEFT JOIN hive_outcomes o ON o.id=f.outcome_id AND o.owner_id=f.owner_id WHERE f.owner_id=? AND f.request_id IN (' + requests.map(() => '?').join(',') + ') ORDER BY f.created_at', [owner, ...requests.map(item => item.id)]);
  return requests.map(request => ({ ...request, context: JSON.parse(request.context), feedback: rows.filter(item => item.request_id === request.id).map(feedbackView) }));
}

export async function serviceComments(db, owner, serviceId = null, limit = 100) {
  return all(db, 'SELECT c.id,c.service_id,c.request_id,c.outcome_id,c.body,c.source,c.version,c.created_at,c.updated_at FROM hive_service_comments c LEFT JOIN hive_outcomes o ON o.id=c.outcome_id AND o.owner_id=c.owner_id WHERE c.owner_id=? AND c.deleted_at IS NULL AND (c.outcome_id IS NULL OR o.deleted_at IS NULL)' + (serviceId ? ' AND c.service_id=?' : '') + ' ORDER BY c.updated_at DESC LIMIT ?', [owner, ...(serviceId ? [serviceId] : []), limit]);
}

// Request/outcome tables contain broad structured needs. Explicit service
// comments live separately, attached to one program and the active owner.
export class Library {
  constructor({ database, owner, write, emit = () => {} }) { Object.assign(this, { database, owner, write, emit }); }
  async request(id, input = {}) {
    const db = this.database(), owner = this.owner(), now = timestamp();
    const context = libraryContext(input);
    if (id) {
      ensure(await first(db, 'SELECT id FROM hive_library_requests WHERE id=? AND owner_id=? AND deleted_at IS NULL', [id, owner]), 'This library card is unavailable.');
      await db.prepare('UPDATE hive_library_requests SET context=?,updated_at=? WHERE id=? AND owner_id=?').bind(JSON.stringify(context), now, id, owner).run();
    } else {
      id = randomUUID();
      await db.prepare('INSERT INTO hive_library_requests (id,owner_id,context,created_at,updated_at) VALUES (?,?,?,?,?)').bind(id, owner, JSON.stringify(context), now, now).run();
    }
    return { id, context };
  }
  async get(id) {
    const db = this.database(), owner = this.owner();
    const row = await first(db, 'SELECT id,context,selected_service_id,created_at,updated_at FROM hive_library_requests WHERE id=? AND owner_id=? AND deleted_at IS NULL', [id, owner]);
    if (!row) return null;
    const feedback = await all(db, 'SELECT f.id,f.payload,f.outcome_id,f.state,f.updated_at,o.delivery,o.satisfaction,o.satisfaction_sentiment,o.reason,o.deleted_at AS retracted FROM hive_library_feedback f LEFT JOIN hive_outcomes o ON o.id=f.outcome_id AND o.owner_id=f.owner_id WHERE f.request_id=? AND f.owner_id=? ORDER BY f.created_at', [id, owner]);
    return { ...row, context: JSON.parse(row.context), feedback: feedback.map(feedbackView) };
  }
  async active() {
    const row = await first(this.database(), 'SELECT request_id FROM hive_active_workspace WHERE owner_id=?', [this.owner()]);
    return row?.request_id ? this.get(row.request_id) : null;
  }
  async setActive(id) {
    const db = this.database(), owner = this.owner();
    await db.prepare('INSERT INTO hive_active_workspace (owner_id,request_id,updated_at) VALUES (?,?,?) ON CONFLICT(owner_id) DO UPDATE SET request_id=excluded.request_id,updated_at=excluded.updated_at').bind(owner, id, timestamp()).run();
  }
  async select(requestId, serviceId) {
    ensure(await this.get(requestId), 'This request is unavailable.');
    await this.database().prepare('UPDATE hive_library_requests SET selected_service_id=?,updated_at=? WHERE id=? AND owner_id=?').bind(serviceId, timestamp(), requestId, this.owner()).run();
    await this.setActive(requestId);
  }
  async comment({ id = randomUUID(), service_id, request_id = null, outcome_id = null, body, source = 'Comment', expected_version }, services) {
    ensure(services.some(service => service.id === service_id), 'Choose a service from your directory.');
    ensure(typeof id === 'string' && /^[a-zA-Z0-9_-]{8,100}$/.test(id), 'Use a valid service-comment ID.');
    ensure(typeof body === 'string' && body.trim().length > 0 && body.length <= 6000, 'Use a service comment of 1–6,000 characters.');
    ensure(!/\b(?:MRN|patient\s*ID|health\s*card|OHIP)\s*(?:number|no\.?|#|:)?\s*[A-Z0-9-]{4,}/i.test(body), 'Remove patient identifiers from the service comment before saving.');
    pickEnum(source, ['Chat', 'Comment'], 'comment source');
    if (request_id) ensure(await this.get(request_id), 'This request is unavailable.');
    const db = this.database(), owner = this.owner(), now = timestamp();
    if (outcome_id) ensure(await first(db, 'SELECT id FROM hive_outcomes WHERE owner_id=? AND id=? AND service_id=?', [owner, outcome_id, service_id]), 'This result is unavailable.');
    const prior = await first(db, 'SELECT * FROM hive_service_comments WHERE id=?', [id]);
    if (prior) {
      ensure(prior.owner_id === owner && prior.service_id === service_id && prior.request_id === request_id && !prior.deleted_at, 'This comment is unavailable in this workspace.');
      ensure(expected_version === undefined || expected_version === prior.version, 'This comment changed. Reopen the service before editing.');
      if (prior.body !== body.trim() || outcome_id && prior.outcome_id !== outcome_id) await db.prepare('UPDATE hive_service_comments SET body=?,outcome_id=?,version=version+1,updated_at=? WHERE id=? AND owner_id=?').bind(body.trim(), outcome_id || prior.outcome_id, now, id, owner).run();
    } else await db.prepare('INSERT INTO hive_service_comments (id,owner_id,service_id,request_id,outcome_id,body,source,version,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(id, owner, service_id, request_id, outcome_id, body.trim(), source, 1, now, now).run();
    return first(db, 'SELECT id,service_id,request_id,outcome_id,body,source,version,created_at,updated_at FROM hive_service_comments WHERE id=? AND owner_id=?', [id, owner]);
  }
  async capture(requestId, input, services) { return this.database().transaction(() => this.captureInternal(requestId, input, services)); }
  async captureInternal(requestId, input, services) {
    validateKeys(input, ['service_id', 'candidate_ids', 'delivery', 'satisfaction', 'satisfaction_sentiment', 'reason', 'comment', 'comment_id']);
    const { comment, comment_id, ...fields } = input;
    const request = await this.get(requestId); ensure(request, 'Start or resume a service request first.');
    const candidates = input.candidate_ids || [];
    ensure(Array.isArray(candidates) && candidates.length <= 20 && candidates.every(id => services.some(service => service.id === id)), 'Choose known service candidates.');
    const service = input.service_id ? services.find(service => service.id === input.service_id) : null;
    ensure(!input.service_id || service, 'Choose a service in your directory.');
    const slot = service?.id || 'unassigned:' + [...candidates].sort().join(',');
    const db = this.database(), owner = this.owner(), now = timestamp();
    let row = await first(db, 'SELECT * FROM hive_library_feedback WHERE owner_id=? AND request_id=? AND slot=?', [owner, requestId, slot]);
    const linked = row?.outcome_id ? await first(db, 'SELECT * FROM hive_outcomes WHERE id=? AND owner_id=?', [row.outcome_id, owner]) : null;
    const old = row ? { ...JSON.parse(row.payload), ...(linked && !linked.deleted_at ? outcomeFields(linked) : {}) } : {};
    const value = { ...old, ...Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)), service_id: service?.id || null, candidate_ids: service ? [] : candidates };
    if (comment) { ensure(typeof comment === 'string' && comment.length <= 6000, 'Keep each service comment within 6,000 characters.'); value.draft_comments = [...new Set([...(value.draft_comments || []), comment])].slice(-10); }
    if (value.delivery) pickEnum(value.delivery, enums.delivery, 'service result');
    if (value.reason) pickEnum(value.reason, enums.reasons, 'barrier');
    if (value.satisfaction !== undefined && value.satisfaction !== null) ensure(Number.isInteger(value.satisfaction) && value.satisfaction >= 1 && value.satisfaction <= 5, 'Use a satisfaction rating from 1 to 5.');
    if (value.satisfaction_sentiment) pickEnum(value.satisfaction_sentiment, enums.sentiments, 'satisfaction feedback');
    if (value.delivery && value.delivery !== 'Received') { value.satisfaction = null; value.satisfaction_sentiment = 'Unspecified'; }
    value.reason = value.delivery === 'Received' ? 'None' : value.delivery === 'Declined' ? 'Patient choice' : value.reason && value.reason !== 'None' ? value.reason : 'Other';
    value.satisfaction ??= null; value.satisfaction_sentiment ||= 'Unspecified';
    const missing = [];
    if (!service) missing.push('Provider');
    if (!request.context.region) missing.push('Area');
    if (!value.delivery) missing.push('Delivery result');
    if (service && request.context.category && service.category !== request.context.category) missing.push('Service type');
    value.missing = missing;
    if (!row) {
      row = { id: randomUUID(), outcome_id: null };
      await db.prepare('INSERT INTO hive_library_feedback (id,owner_id,request_id,slot,payload,outcome_id,state,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(row.id, owner, requestId, slot, JSON.stringify(value), null, 'Needs detail', now, now).run();
    }
    let state = 'Needs detail', changed = false, outcome = null;
    if (!missing.length) {
      const prior = linked;
      if (prior?.deleted_at) { state = 'Retracted'; value.missing = ['Start a new request for a new attempt']; }
      else {
        const args = { ...request.context, category: service.category, service_id: service.id, delivery: value.delivery, reason: value.reason, satisfaction: value.satisfaction,
          satisfaction_sentiment: value.satisfaction_sentiment, share_with_hive: false, occurred_on: prior?.occurred_on || now.slice(0, 10) };
        const same = prior && Object.entries(args).every(([key, item]) => key === 'share_with_hive' ? prior.share === 0 : prior[key] === item);
        const result = same ? { record: prior } : await this.write(prior ? 'update_outcome' : 'record_outcome', { ...args, ...(prior ? { record_id: prior.id, expected_version: prior.version } : { submission_id: row.id }), confirmed: true });
        outcome = result.record; row.outcome_id = outcome.id; state = 'Saved'; changed = !same;
      }
    }
    if (service && state !== 'Retracted') {
      for (const body of value.draft_comments || []) await this.comment({ id: comment_id || 'chat-' + createHash('sha256').update(requestId + service.id + body).digest('hex').slice(0, 48), service_id: service.id, request_id: requestId, outcome_id: row.outcome_id, body, source: 'Chat' }, services);
      delete value.draft_comments;
    }
    await db.prepare('UPDATE hive_library_feedback SET payload=?,outcome_id=?,state=?,updated_at=? WHERE id=? AND owner_id=?').bind(JSON.stringify(value), row.outcome_id, state, now, row.id, owner).run();
    await db.prepare('UPDATE hive_library_requests SET updated_at=? WHERE id=? AND owner_id=?').bind(now, requestId, owner).run();
    const result = { id: row.id, ...value, state, outcome_id: row.outcome_id, changed, service_name: service?.name || 'Unassigned provider', record: outcome };
    db.afterCommit(() => this.emit({ type: 'library-saved', value: { request_id: requestId, feedback: result } }));
    return result;
  }
  async resolve(requestId, services, selectedId = null) {
    const request = await this.get(requestId); if (!request) return [];
    const pending = request.feedback.filter(item => item.state === 'Needs detail');
    const unassigned = pending.filter(item => !item.service_id);
    const results = [];
    for (const item of pending) {
      if (selectedId && item.service_id && item.service_id !== selectedId) continue;
      let serviceId = item.service_id;
      if (!serviceId && selectedId && unassigned.length === 1) serviceId = selectedId;
      if (!serviceId) continue;
      const input = { service_id: serviceId, delivery: item.delivery, satisfaction: item.satisfaction, satisfaction_sentiment: item.satisfaction_sentiment, reason: item.reason, ...(item.draft_comments?.length ? { comment: item.draft_comments.join('\n').slice(0, 6000) } : {}) };
      // Moving an unassigned draft keeps only its resolved, provider-specific card.
      const result = await this.capture(requestId, input, services);
      if (!item.service_id && result.id !== item.id) await this.database().prepare('DELETE FROM hive_library_feedback WHERE id=? AND owner_id=? AND outcome_id IS NULL').bind(item.id, this.owner()).run();
      results.push(result);
    }
    return results;
  }
}
