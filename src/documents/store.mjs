import { randomUUID } from 'node:crypto';
import {DocumentCases} from './cases.mjs';
import {compareHistory} from './ranking.mjs';

const now = () => new Date().toISOString();
const clean = (value, limit = 12000) => String(value ?? '').replace(/\u0000/g, '').trim().slice(0, limit);
const norm = value => String(value).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export const tokens = value => [...new Set(norm(value).split(' ').filter(t => t.length > 1 && !new Set(['the','and','for','can','you','please','what','with','from','that','this','have','about','find','show','tell','need','which','does','are','how','was','were','would','could','should','into','our','your','use']).has(t)))];
const unpack = row => row && ({ ...row, fields: JSON.parse(row.fields_json || '{}'), contacts: JSON.parse(row.contacts_json || '[]'), links: JSON.parse(row.links_json || '[]'), archived: Boolean(row.archived) });
const resultLabel = outcome => outcome === 'worked' ? 'Worked' : "Didn't work";
function validResult(outcome, rating) {
  if (!['worked','not_worked'].includes(outcome)) throw new Error('Choose Worked or Didn’t work.');
  if (rating != null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) throw new Error('Choose a rating from 1 to 5, or leave it blank.');
}
function experience(comments) {
  const results=comments.filter(n=>n.outcome),ratings=results.filter(n=>n.rating!=null);
  return { worked:results.filter(n=>n.outcome==='worked').length, not_worked:results.filter(n=>n.outcome==='not_worked').length,
    rating_count:ratings.length, rating_average:ratings.length?ratings.reduce((sum,n)=>sum+n.rating,0)/ratings.length:null };
}
export function contactsIn(body, fields = {}) {
  const combined = Object.values(fields).map(String).join('\n') + '\n' + body;
  const named = Object.entries(fields).find(([key]) => /^(contact(?: name| person(?: name)?)?|coordinator|intake contact|representative|staff name|name of contact)$/i.test(key.trim()))?.[1];
  const phoneFields = Object.entries(fields).filter(([key,value])=>/phone|telephone|\btel\b/i.test(key)&&/^\+?\d[\d\s().x+-]{8,30}$/i.test(String(value))).map(([,value])=>String(value));
  const phones = [...new Set([...phoneFields,...(combined.match(/(?:\+?1[ .-]?)?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}(?:\s*(?:ext\.?|x)\s*\d{1,6})?/gi) || [])])].slice(0,6);
  const emails = [...new Set((combined.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi) || []).slice(0, 6))];
  return [...phones.map(value => ({ kind: 'phone', value, name: named ? clean(named, 100) : '' })), ...emails.map(value => ({ kind: 'email', value, name: named ? clean(named, 100) : '' }))];
}
export function linksIn(body, fields = {}) {
  return [...new Set((Object.values(fields).map(String).join('\n') + '\n' + body).match(/https:\/\/[^\s<>"\[\]{}]+/g) || [])].map(value => value.replace(/[),.;]+$/, '')).filter(value => { try { const u = new URL(value); return !u.username && !u.password; } catch { return false; } }).slice(0, 12);
}

export class DocumentStore {
  constructor({ database, owner, emit = () => {} }) { Object.assign(this, { database, owner, emit }); }
  db() { return this.database(); }
  changed(value) { this.db().afterCommit(() => this.emit({ type: 'memory-changed', value })); return value; }
  async documents() { return (await this.db().prepare('SELECT d.*, (SELECT COUNT(*) FROM personal_cards c WHERE c.document_id=d.id AND c.archived=0) AS card_count FROM personal_documents d WHERE owner_id=? ORDER BY updated_at DESC').bind(this.owner()).all()).results.map(({ original_path, ...row }) => ({ ...row, warnings: JSON.parse(row.warnings) })); }
  async duplicate(digest) { return this.db().prepare('SELECT id, filename FROM personal_documents WHERE owner_id=? AND digest=?').bind(this.owner(), digest).first(); }
  async sameName(filename) { return this.db().prepare('SELECT id, filename, version FROM personal_documents WHERE owner_id=? AND filename=? ORDER BY updated_at DESC LIMIT 1').bind(this.owner(), filename).first(); }
  async document(id) { return this.db().prepare('SELECT * FROM personal_documents WHERE id=? AND owner_id=?').bind(id, this.owner()).first(); }
  async import(parsed, { originalPath = null, replaceId = null } = {}) {
    const owner = this.owner();
    if (!parsed.sections?.length || parsed.sections.length > 5000) throw new Error('Choose a document containing 1–5,000 readable cards.');
    return this.db().transaction(async () => {
      const duplicate = await this.duplicate(parsed.digest);
      if (duplicate) return { duplicate: true, document_id: duplicate.id, count: 0 };
      const old = replaceId ? await this.document(replaceId) : null;
      if (replaceId && (!old || old.filename !== parsed.filename || !parsed.stableKeys)) throw new Error('This file cannot safely update that document. Save it as a separate version.');
      const stamp = now(), id = old?.id || randomUUID();
      if (old) {
        await this.db().prepare('UPDATE personal_documents SET digest=?,original_path=?,updated_at=?,version=version+1,warnings=? WHERE id=? AND owner_id=?').bind(parsed.digest, originalPath, stamp, JSON.stringify(parsed.warnings), id, owner).run();
        await this.db().prepare('UPDATE personal_cards SET archived=1 WHERE document_id=? AND owner_id=?').bind(id, owner).run();
      } else await this.db().prepare('INSERT INTO personal_documents (id,owner_id,filename,digest,format,original_path,imported_at,updated_at,warnings) VALUES (?,?,?,?,?,?,?,?,?)').bind(id, owner, parsed.filename, parsed.digest, parsed.format, originalPath, stamp, stamp, JSON.stringify(parsed.warnings)).run();
      let added = 0, updated = 0;
      for (const section of parsed.sections) {
        const title = clean(section.title, 180), body = clean(section.body, 30000), fields = section.fields || {};
        const values = [title, body, clean(section.locator, 220), JSON.stringify(fields), JSON.stringify(contactsIn(body, fields)), JSON.stringify(linksIn(body, fields))];
        const previous = old ? await this.db().prepare('SELECT id,body,fields_json FROM personal_cards WHERE document_id=? AND source_key=? AND owner_id=?').bind(id, section.key, owner).first() : null;
        if (previous) {
          await this.db().prepare('UPDATE personal_cards SET title=?,body=?,locator=?,fields_json=?,contacts_json=?,links_json=?,archived=0,updated_at=?,version=version+1 WHERE id=? AND owner_id=?').bind(...values, stamp, previous.id, owner).run();
          updated++;
        } else {
          await this.db().prepare('INSERT INTO personal_cards (id,owner_id,document_id,source_key,kind,title,body,locator,fields_json,contacts_json,links_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(randomUUID(), owner, id, section.key, 'document', ...values, stamp, stamp).run();
          added++;
        }
      }
      return this.changed({ document_id: id, count: parsed.sections.length, added, updated, duplicate: false });
    });
  }
  async list({ query = '', document_id = null, collection = 'all', category = '', case_id = null, include_archived = false, limit = 60, offset = 0 } = {}) {
    if (!['all', 'services', 'personal'].includes(collection)) throw new Error('Choose a supported card collection.');
    const rows = (await this.db().prepare(`SELECT c.*,d.filename,d.format AS source_format, (SELECT COUNT(*) FROM personal_comments n WHERE n.card_id=c.id AND n.owner_id=c.owner_id) AS comment_count,
      (SELECT group_concat(body,' ') FROM personal_comments n WHERE n.card_id=c.id AND n.owner_id=c.owner_id) AS comment_text,
      (SELECT body FROM personal_comments n WHERE n.card_id=c.id AND n.owner_id=c.owner_id ORDER BY updated_at DESC,id DESC LIMIT 1) AS latest_note,
      (SELECT COUNT(*) FROM personal_comments n WHERE n.card_id=c.id AND n.owner_id=c.owner_id AND outcome='worked') AS worked,
      (SELECT COUNT(*) FROM personal_comments n WHERE n.card_id=c.id AND n.owner_id=c.owner_id AND outcome='not_worked') AS not_worked,
      (SELECT COUNT(rating) FROM personal_comments n WHERE n.card_id=c.id AND n.owner_id=c.owner_id AND outcome IS NOT NULL) AS rating_count,
      (SELECT AVG(rating) FROM personal_comments n WHERE n.card_id=c.id AND n.owner_id=c.owner_id AND outcome IS NOT NULL) AS rating_average
      FROM personal_cards c LEFT JOIN personal_documents d ON d.id=c.document_id
      WHERE c.owner_id=? ${include_archived ? '' : 'AND c.archived=0'} ${document_id ? 'AND c.document_id=?' : ''}
      ${case_id?'AND NOT EXISTS (SELECT 1 FROM personal_case_memory cm WHERE cm.owner_id=c.owner_id AND cm.entry_type=\'card\' AND cm.entry_id=c.id AND cm.case_id<>?)':''}
      ${collection === 'services' ? "AND d.format='service-directory'" : collection === 'personal' ? "AND (d.format IS NULL OR d.format<>'service-directory')" : ''}
      ORDER BY c.updated_at DESC,c.id`).bind(this.owner(), ...(document_id ? [document_id] : []),...(case_id?[case_id]:[])).all()).results;
    const terms = tokens(query);
    const matches = rows.map(row => {
      const title = norm(row.title), haystack = norm(row.title + ' ' + row.body + ' ' + (row.comment_text || '') + ' ' + (row.worked?'worked ':'') + (row.not_worked?"didn't work not worked ":'') + (row.filename || ''));
      return { row, matches: terms.every(term=>haystack.includes(term)), score: terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0) + (row.source_format!=='service-directory'&&title.includes(term) ? 2 : 0), 0) };
    }).filter(item => (!category || JSON.parse(item.row.fields_json || '{}').Category === category) && (!terms.length || item.matches)).sort((a, b) => b.score - a.score || (a.row.source_format==='service-directory'&&b.row.source_format==='service-directory'?compareHistory(a.row,b.row):0) || (collection === 'services' ? a.row.title.localeCompare(b.row.title) : 0));
    const total = matches.length;
    return { total, items: matches.slice(Math.max(0,offset), Math.max(0,offset) + Math.max(1, Math.min(100,limit))).map(({ row }) => {
      const card = unpack(row); delete card.fields_json; delete card.contacts_json; delete card.links_json; delete card.comment_text;
      const {worked,not_worked,rating_count,rating_average,...record}=card;
      return { ...record, experience:{worked,not_worked,rating_count,rating_average}, latest_note:card.latest_note?.slice(0,180)||'', body: card.body.slice(0, 650), category: card.fields.Category || '', area: card.fields['Service area'] || '', fields: undefined };
    }) };
  }
  async memories({query='',document_id=null,kind='all',include_archived=false,limit=30,offset=0}={}) {
    if(!['all','notes','documents','feedback','chats'].includes(kind))throw new Error('Choose a supported memory type.');
    const owner=this.owner();
    const cards=(await this.db().prepare(`SELECT c.id,c.id AS card_id,c.kind,c.title,c.body,c.document_id,c.archived,c.updated_at,c.version,d.filename,d.format AS source_format
      FROM personal_cards c LEFT JOIN personal_documents d ON d.id=c.document_id
      WHERE c.owner_id=? AND (d.format IS NULL OR d.format<>'service-directory')
      ${include_archived?'':'AND c.archived=0'} ${document_id?'AND c.document_id=?':''}`).bind(owner,...(document_id?[document_id]:[])).all()).results
      .map(card=>({...card,entry_type:'card',memory_type:card.kind==='conversation'?'chats':card.document_id?'documents':'notes'}));
    const notes=(await this.db().prepare(`SELECT n.id,n.card_id,n.body,n.outcome,n.rating,n.updated_at,n.version,c.title,c.document_id,c.archived,d.filename,d.format AS source_format
      FROM personal_comments n JOIN personal_cards c ON c.id=n.card_id AND c.owner_id=n.owner_id LEFT JOIN personal_documents d ON d.id=c.document_id
      WHERE n.owner_id=? ${include_archived?'':'AND c.archived=0'} ${document_id?'AND c.document_id=?':''}`).bind(owner,...(document_id?[document_id]:[])).all()).results
      .map(note=>({...note,entry_type:'comment',memory_type:'feedback'}));
    const terms=tokens(query);
    const items=[...cards,...notes].filter(item=>(kind==='all'||item.memory_type===kind)&&terms.every(term=>norm(item.title+' '+item.body+' '+(item.outcome?resultLabel(item.outcome):'')+' '+(item.filename||'')).includes(term)))
      .sort((a,b)=>b.updated_at.localeCompare(a.updated_at)||a.id.localeCompare(b.id));
    const start=Math.max(0,Number(offset)||0),count=Math.max(1,Math.min(100,Number(limit)||30));
    return{total:items.length,items:items.slice(start,start+count).map(item=>({...item,body:item.body.slice(0,650)}))};
  }
  async get(id,{case_id=null}={}) {
    const card = unpack(await this.db().prepare('SELECT c.*,d.filename,d.format AS source_format FROM personal_cards c LEFT JOIN personal_documents d ON d.id=c.document_id WHERE c.id=? AND c.owner_id=?').bind(id, this.owner()).first());
    if (!card) throw new Error('This card is not in your active workspace.');
    if(case_id&&await this.db().prepare("SELECT 1 FROM personal_case_memory WHERE owner_id=? AND entry_type='card' AND entry_id=? AND case_id<>?").bind(this.owner(),id,case_id).first())throw new Error('This automatically saved message belongs to another case.');
    const comments = (await this.db().prepare('SELECT id,body,outcome,rating,created_at,updated_at,version FROM personal_comments n WHERE card_id=? AND owner_id=? '+(case_id?"AND NOT EXISTS (SELECT 1 FROM personal_case_memory cm WHERE cm.owner_id=n.owner_id AND cm.entry_type='comment' AND cm.entry_id=n.id AND cm.case_id<>?) ":'')+'ORDER BY created_at').bind(id, this.owner(),...(case_id?[case_id]:[])).all()).results;
    delete card.fields_json; delete card.contacts_json; delete card.links_json;
    const latest=[...comments].sort((a,b)=>b.updated_at.localeCompare(a.updated_at)||b.id.localeCompare(a.id))[0];
    const case_info=card.kind==='conversation'?await this.db().prepare('SELECT id,title,status,version FROM personal_cases WHERE archive_card_id=? AND owner_id=?').bind(id,this.owner()).first():null;
    return { ...card, case_info, category: card.fields.Category || '', comments, comment_count:comments.length, latest_note:latest?.body.slice(0,180)||'', experience:experience(comments) };
  }
  async linkCaseMemory(case_id,type,id){if(!case_id)return;const value=await this.db().prepare("SELECT 1 FROM personal_cases WHERE id=? AND owner_id=? AND status='active'").bind(case_id,this.owner()).first();if(!value)throw new Error('This case is not available in your account.');await this.db().prepare('INSERT OR IGNORE INTO personal_case_memory(case_id,owner_id,entry_type,entry_id) VALUES (?,?,?,?)').bind(case_id,this.owner(),type,id).run();}
  async note({ title, body, id = null, expected_version = null, kind = 'note', case_id = null }) {
    body = clean(body, 12000); title = clean(title || body.split('\n')[0], 140);
    if (!body || !title) throw new Error('Add some text to save this note.');
    const stamp = now(), owner = this.owner();
    return this.db().transaction(async () => {
      if (id) {
        const old = await this.get(id);
        if (old.document_id) throw new Error('Keep the original source intact. Add a correction in the card notes.');
        if(old.kind==='conversation')throw new Error('Use the saved case controls to reopen or rename this conversation.');
        if (old.version !== expected_version) throw new Error('This card changed. Reopen it before editing.');
        await this.db().prepare('UPDATE personal_cards SET title=?,body=?,contacts_json=?,links_json=?,updated_at=?,version=version+1 WHERE id=? AND owner_id=? AND version=?').bind(title, body, JSON.stringify(contactsIn(body)), JSON.stringify(linksIn(body)), stamp, id, owner, expected_version).run();
      } else {
        id = randomUUID();
        await this.db().prepare('INSERT INTO personal_cards (id,owner_id,kind,title,body,contacts_json,links_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)').bind(id, owner, kind === 'message' ? 'message' : 'note', title, body, JSON.stringify(contactsIn(body)), JSON.stringify(linksIn(body)), stamp, stamp).run();
      }
      await this.linkCaseMemory(case_id,'card',id);this.changed({ card_id: id }); return this.get(id);
    });
  }
  async comment({ card_id, body, id = null, expected_version = null, case_id = null }) {
    body = clean(body); if (!body) throw new Error('Write a note before saving.');
    return this.db().transaction(async () => {
      await this.get(card_id); const stamp = now();
      if (id) {
        const old = await this.db().prepare('SELECT version,outcome FROM personal_comments WHERE id=? AND card_id=? AND owner_id=?').bind(id, card_id, this.owner()).first();
        if (!old || old.version !== expected_version) throw new Error('This note changed. Reopen the card first.');
        if (old.outcome) throw new Error('Edit this saved service result using its result form.');
        await this.db().prepare('UPDATE personal_comments SET body=?,updated_at=?,version=version+1 WHERE id=? AND owner_id=?').bind(body, stamp, id, this.owner()).run();
      } else { id = randomUUID(); await this.db().prepare('INSERT INTO personal_comments (id,owner_id,card_id,body,created_at,updated_at) VALUES (?,?,?,?,?,?)').bind(id,this.owner(),card_id,body,stamp,stamp).run(); }
      await this.db().prepare('UPDATE personal_cards SET updated_at=? WHERE id=? AND owner_id=?').bind(stamp,card_id,this.owner()).run();
      await this.linkCaseMemory(case_id,'comment',id);this.changed({ card_id }); return { saved: true, id, card_id };
    });
  }
  async serviceResult({card_id,outcome,rating=null,body='',id=null,expected_version=null}) {
    validResult(outcome,rating);body=clean(body)||resultLabel(outcome)+'.';
    return this.db().transaction(async()=>{
      const card=await this.get(card_id);
      if(card.source_format!=='service-directory')throw new Error('Choose a known service to record a service result.');
      const stamp=now(),owner=this.owner();
      if(id){
        const old=await this.db().prepare('SELECT version,outcome FROM personal_comments WHERE id=? AND card_id=? AND owner_id=?').bind(id,card_id,owner).first();
        if(!old?.outcome||old.version!==expected_version)throw new Error('This result changed. Reopen the card before editing.');
        await this.db().prepare('UPDATE personal_comments SET body=?,outcome=?,rating=?,updated_at=?,version=version+1 WHERE id=? AND owner_id=?').bind(body,outcome,rating,stamp,id,owner).run();
      }else{
        id=randomUUID();
        await this.db().prepare('INSERT INTO personal_comments (id,owner_id,card_id,body,outcome,rating,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)').bind(id,owner,card_id,body,outcome,rating,stamp,stamp).run();
      }
      await this.db().prepare('UPDATE personal_cards SET updated_at=? WHERE id=? AND owner_id=?').bind(stamp,card_id,owner).run();
      return this.changed({saved:true,id,card_id});
    });
  }
  async forgetCard(id) { await this.get(id); await this.db().prepare('DELETE FROM personal_cards WHERE id=? AND owner_id=?').bind(id,this.owner()).run(); return this.changed({ deleted: true }); }
  async forgetComment({id,card_id}) {await this.get(card_id);const result=await this.db().prepare('DELETE FROM personal_comments WHERE id=? AND card_id=? AND owner_id=?').bind(id,card_id,this.owner()).run();if(!result.meta.changes)throw new Error('This note is no longer available.');return this.changed({deleted:true,card_id});}
  async forgetDocument(id) { if (!await this.document(id)) throw new Error('This document is unavailable.'); await this.db().prepare('DELETE FROM personal_documents WHERE id=? AND owner_id=?').bind(id,this.owner()).run(); return this.changed({ deleted: true }); }
  async calculate({ document_id, sheet = '', column = '', operation = 'count', filters = [], group_by = '' }) {
    if (!await this.document(document_id)) throw new Error('Choose one of your imported documents.');
    if (!['count','sum','average','min','max','group_count'].includes(operation) || filters.length > 5) throw new Error('Choose a supported calculation.');
    const rows = (await this.db().prepare('SELECT fields_json,locator FROM personal_cards WHERE owner_id=? AND document_id=? AND archived=0').bind(this.owner(), document_id).all()).results.map(row => ({ fields: JSON.parse(row.fields_json), locator: row.locator })).filter(row => Object.keys(row.fields).length && (!sheet || row.locator.startsWith(sheet + ' · row ')));
    const columns = [...new Set(rows.flatMap(row => Object.keys(row.fields)))];
    for (const field of [column,group_by,...filters.map(f => f.column)].filter(Boolean)) if (!columns.includes(field)) throw new Error('Use an exact column name: ' + columns.join(', '));
    const filtered = rows.filter(({ fields }) => filters.every(f => f.op === 'equals' ? norm(fields[f.column] ?? '') === norm(f.value) : f.op === 'contains' ? norm(fields[f.column] ?? '').includes(norm(f.value)) : false));
    const base = { operation, document_id, sheet: sheet || 'All worksheets', column, filters, matched_rows: filtered.length, total_rows: rows.length, source: 'Calculated locally from imported cell values; Excel formulas use their saved cached results.' };
    if (operation === 'count') return { ...base, value: filtered.length };
    if (operation === 'group_count') { if (!group_by) throw new Error('Choose a grouping column.'); const groups = Object.create(null); for (const row of filtered) { const key = String(row.fields[group_by] ?? '(blank)'); groups[key] = (groups[key] || 0) + 1; } return { ...base, group_by, groups }; }
    if (!column) throw new Error('Choose a numeric column.');
    const values = filtered.map(row => row.fields[column]).filter(value => typeof value === 'number' && Number.isFinite(value));
    const value = !values.length ? null : operation === 'sum' ? values.reduce((a,b)=>a+b,0) : operation === 'average' ? values.reduce((a,b)=>a+b,0)/values.length : operation === 'min' ? Math.min(...values) : Math.max(...values);
    return { ...base, value, numeric_rows: values.length, excluded_non_numeric: filtered.length-values.length };
  }
  async export() {
    const docs = (await this.db().prepare('SELECT * FROM personal_documents WHERE owner_id=?').bind(this.owner()).all()).results.map(({ owner_id, original_path, ...row }) => row);
    const cards = (await this.db().prepare('SELECT * FROM personal_cards WHERE owner_id=?').bind(this.owner()).all()).results.map(({ owner_id, ...row }) => row);
    const comments = (await this.db().prepare('SELECT * FROM personal_comments WHERE owner_id=?').bind(this.owner()).all()).results.map(({ owner_id, ...row }) => row);
    return { format: 'southlake-personal-memory', version: 1, exported_at: now(), documents: docs, cards, comments,...await new DocumentCases({store:this}).export() };
  }
  async restore(data) {
    if (data?.format !== 'southlake-personal-memory' || data.version !== 1 || !Array.isArray(data.cards) || data.cards.length > 20000 || !Array.isArray(data.documents) || !Array.isArray(data.comments) || data.comments.length > 50000) throw new Error('Choose a valid Southlake personal-memory backup.');
    const owner = this.owner(), docs = new Map(), cards = new Map(), comments = new Map(); let added = 0, notesAdded = 0;
    return this.db().transaction(async () => {
      for (const doc of data.documents) {
        if (typeof doc.id !== 'string' || !/^[a-f0-9]{64}$/.test(doc.digest)) throw new Error('The backup contains an invalid document.');
        const duplicate = await this.duplicate(doc.digest); const id = duplicate?.id || randomUUID(); docs.set(doc.id, { id, duplicate: Boolean(duplicate) });
        if (!duplicate) await this.db().prepare('INSERT INTO personal_documents (id,owner_id,filename,digest,format,imported_at,updated_at,version,warnings) VALUES (?,?,?,?,?,?,?,?,?)').bind(id,owner,clean(doc.filename,220),doc.digest,clean(doc.format,20),clean(doc.imported_at,40),clean(doc.updated_at,40),Number(doc.version)||1,'["Restored from backup; the original file is not included."]').run();
      }
      for (const card of data.cards) {
        if (typeof card.id !== 'string' || card.document_id && !docs.has(card.document_id)) throw new Error('The backup has a card without its document.');
        const doc = docs.get(card.document_id);
        const existing = doc?.duplicate
          ? await this.db().prepare('SELECT id FROM personal_cards WHERE owner_id=? AND document_id=? AND source_key=?').bind(owner,doc.id,card.source_key).first()
          : !doc ? await this.db().prepare('SELECT id FROM personal_cards WHERE owner_id=? AND document_id IS NULL AND title=? AND body=? AND created_at=?').bind(owner,clean(card.title,180),clean(card.body,30000),clean(card.created_at,40)).first() : null;
        if (existing) { cards.set(card.id,existing.id); continue; }
        const id = randomUUID(); cards.set(card.id,id);
        const fields = JSON.parse(card.fields_json || '{}');
        if (!fields || Array.isArray(fields) || typeof fields !== 'object' || Object.keys(fields).length > 100) throw new Error('The backup has invalid column values.');
        const body = clean(card.body,30000);
        await this.db().prepare('INSERT INTO personal_cards (id,owner_id,document_id,source_key,kind,title,body,locator,fields_json,contacts_json,links_json,archived,created_at,updated_at,version) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,owner,doc?.id||null,card.source_key ? clean(card.source_key,500):null,doc?'document':card.kind==='conversation'?'conversation':card.kind==='message'?'message':'note',clean(card.title,180),body,clean(card.locator,220),JSON.stringify(fields),JSON.stringify(contactsIn(body,fields)),JSON.stringify(linksIn(body,fields)),card.archived?1:0,clean(card.created_at,40),clean(card.updated_at,40),Number(card.version)||1).run(); added++;
      }
      for (const note of data.comments) if (cards.has(note.card_id)) {
        const cardId=cards.get(note.card_id), body=clean(note.body), created=clean(note.created_at,40);
        const outcome=note.outcome??null,rating=note.rating??null;
        if(outcome!=null){validResult(outcome,rating);if((await this.get(cardId)).source_format!=='service-directory')throw new Error('A service result must belong to a known service.');}
        else if(rating!=null)throw new Error('A rating must belong to a reported service result.');
        const exists=await this.db().prepare('SELECT id FROM personal_comments WHERE owner_id=? AND card_id=? AND body=? AND created_at=? AND outcome IS ? AND rating IS ?').bind(owner,cardId,body,created,outcome,rating).first();
        const id=exists?.id||randomUUID();comments.set(note.id,id);
        if(!exists){await this.db().prepare('INSERT INTO personal_comments (id,owner_id,card_id,body,outcome,rating,created_at,updated_at,version) VALUES (?,?,?,?,?,?,?,?,?)').bind(id,owner,cardId,body,outcome,rating,created,clean(note.updated_at,40),Number(note.version)||1).run();notesAdded++;}
      }
      await new DocumentCases({store:this}).restore(data,{cards,comments});
      return this.changed({ restored: true, added, notes_added: notesAdded });
    });
  }
}
