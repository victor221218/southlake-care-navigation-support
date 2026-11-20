export const PUBLIC_SERVICE_FORMAT = 'service-directory';
export const OWN_SERVICE_FORMAT = 'own-services';
export const isServiceSource = format => format === PUBLIC_SERVICE_FORMAT || format === OWN_SERVICE_FORMAT;
export const SERVICE_FILE_TYPES = ['xlsx', 'csv', 'tsv'];

// These labels are used in the review form and stored with the card.
export const serviceFields = [
  ['name', 'Service or program', 180, 'service|service name|program|program name|service program|program title|name|title'],
  ['organization', 'Organization', 180, 'organisation|organization name|organisation name|provider|service provider|agency|agency name|company|company name'],
  ['category', 'Category', 100, 'service category|service type|type|program type'],
  ['area', 'Service area', 220, 'area|region|coverage|coverage area|catchment|catchment area|city|municipality|community|communities served|location'],
  ['person', 'Contact name', 100, 'contact|contact person|contact person name|intake contact|staff name|coordinator|representative'],
  ['phone', 'Phone', 180, 'phone number|telephone|telephone number|tel|contact phone|contact number|program phone|intake phone'],
  ['email', 'Email', 180, 'e mail|email address|contact email|intake email'],
  ['website', 'Provider page', 500, 'website|web site|url|provider url|website url|website link|program website'],
  ['details', 'Service details', 6000, 'details|description|summary|service description|program description|notes|about|information']
];

const header = value => value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const columns = new Map(serviceFields.flatMap(([key, label, , aliases]) =>
  [label, ...aliases.split('|')].map(name => [header(name), key])));
const text = (value, limit) => typeof value === 'number' || typeof value === 'string'
  ? String(value).replace(/\u0000/g, '').trim().slice(0, limit) : '';
const blank = /^(?:n\/?a|unknown|tbd|[—–-]+)$/i;
const emailPattern = /[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi;

export function cleanServiceFields(input = {}) {
  return Object.fromEntries(serviceFields.map(([key, , limit]) => {
    const value = text(input?.[key], limit);
    return [key, blank.test(value) ? '' : value];
  }));
}

export function serviceContacts(values) {
  const name = values.person || '';
  const phones = (values.phone || '').split(/\s*[;,\n]\s*/).filter(phone => phone.replace(/\D/g, '').length >= 7);
  return [...new Set(phones)].slice(0, 6).map(value => ({kind:'phone', value, name}))
    .concat([...new Set((values.email || '').match(emailPattern) || [])].slice(0, 6)
      .map(value => ({kind:'email', value, name})));
}

export function serviceDraft(section = {}) {
  const mapped = {};
  const other = [];
  for (const [label, value] of Object.entries(section.fields || {})) {
    const key = columns.get(header(label));
    if (key && !mapped[key] && !blank.test(String(value).trim())) mapped[key] = value;
    else other.push([label, value]);
  }
  const values = cleanServiceFields(mapped);
  values.name ||= values.organization;
  return {values, other};
}

export function missingServiceDetails(values) {
  const missing = [];
  if (!values.name) missing.push('What is this service or program called?');
  if (!serviceContacts(values).length) missing.push('Do you have a phone number or email for this service?');
  if (!values.area) missing.push('Which communities does this service cover?');
  return missing;
}

export function serviceSection(section, input) {
  const values = cleanServiceFields(input);
  if (!values.name) throw new Error('Enter a service or program name before saving.');
  const standard = serviceFields.flatMap(([key, label]) => values[key] ? [[label, values[key]]] : []);
  const fields = Object.fromEntries([...serviceDraft(section).other, ...standard]);
  const title = values.organization && header(values.organization) !== header(values.name)
    ? values.organization + ' · ' + values.name : values.name;
  const body = [values.details, ...Object.entries(fields).filter(([label]) => label !== 'Service details')
    .map(([label, value]) => label + ': ' + value)].filter(Boolean).join('\n');
  return {...section, title, fields, body};
}
