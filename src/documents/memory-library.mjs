import {isServiceInventory,isServiceSource} from './service-sources.mjs';

const organizationField = /^(?:organi[sz]ation|company|provider)(?: name)?$/i;
const historyPageSize = 20;

export function organizationOf(record) {
  const fields = JSON.parse(record.fields_json || '{}') || {};
  const named = Object.entries(fields).find(([key, value]) =>
    organizationField.test(key.trim()) && typeof value === 'string' && value.trim());
  if (named) return named[1].trim().slice(0, 180);
  if (isServiceSource(record.source_format)) return record.title.split(' · ')[0].trim();
  return '';
}

function groupsFor(item, organizations) {
  if (organizations.size) return [...organizations].map(title => ({
    id: 'organization:' + title.normalize('NFKC').toLowerCase().replace(/\s+/g, ' '),
    title, type: 'organization'
  }));
  if (item.document_id) return [{id:'document:' + item.document_id, title:item.filename, type:'document'}];
  if (item.kind === 'conversation') return [{id:'conversations', title:'Other saved conversations', type:'personal'}];
  if (item.kind === 'message') return [{id:'earlier-messages', title:'Earlier saved messages', type:'personal'}];
  return [{id:'personal-notes', title:'Personal notes', type:'personal'}];
}

function preview({fields_json, ...item}, length) {
  const body = item.kind === 'conversation'
    ? item.body.replace(/^Saved case conversation\. Use Reopen case chat for the complete history\.\s*/,'')
    : item.body;
  return {...item, body:body.slice(0,length)};
}

export function groupMemory(items, relatedOrganizations, matches, {offset, limit, expanded, historyOffset}) {
  const groups = new Map(), matchedIds = new Set();
  for (const item of items) {
    const organization = item.memory_type==='documents' && isServiceInventory(item.source_format,item.filename)
      ? '' : organizationOf(item);
    const names = relatedOrganizations.get(item.id) || new Set(organization ? [organization] : []);
    for (const {id,title,type} of groupsFor(item,names)) {
      if (!matches(item,title)) continue;
      if (!groups.has(id)) groups.set(id,{id,title,type,entries:new Map()});
      groups.get(id).entries.set(item.id,item);
      matchedIds.add(item.id);
    }
  }
  const sorted = [...groups.values()].sort((a,b) =>
    Number(b.type === 'organization') - Number(a.type === 'organization') ||
    a.title.localeCompare(b.title,'en-CA'));
  const page = sorted.slice(offset,offset + limit).map(({entries, ...group}) => {
    const records = [...entries.values()];
    const total = records.length;
    if (group.id !== expanded) return {...group,total,preview:records.slice(0,3).map(item=>preview(item,180))};
    const start = Math.min(historyOffset, Math.floor((total - 1) / historyPageSize) * historyPageSize);
    return {...group,total,history_offset:start,has_more:start + historyPageSize < total,
      history:records.slice(start,start + historyPageSize).map(item=>preview(item,650))};
  });
  return {total:sorted.length,record_count:matchedIds.size,items:page};
}
