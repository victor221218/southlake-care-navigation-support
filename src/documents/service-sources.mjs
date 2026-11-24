import {headerKey as header} from './navigation-templates.mjs';
import {serviceTopic} from './topic.mjs';

export const PUBLIC_SERVICE_FORMAT = 'service-directory';
export const OWN_SERVICE_FORMAT = 'own-services';
export const isServiceSource = format => format === PUBLIC_SERVICE_FORMAT || format === OWN_SERVICE_FORMAT;
export const SERVICE_FILE_TYPES = ['xlsx', 'csv', 'tsv'];

// These labels are used in the review form and stored with the card.
export const serviceFields = [
  ['category', 'Category', 100, 'service category|service type|type|program type'],
  ['name', 'Service or program', 180, 'service|service name|program|program name|program clinic|service program|program title|name|title'],
  ['organization', 'Organization', 180, 'organisation|organization name|organisation name|partner organization|partner agency|provider|service provider|agency|agency name|company|company name'],
  ['area', 'Service area', 220, 'area|region|coverage|coverage area|catchment|catchment area|geographic coverage catchment|city|municipality|community|communities served|location'],
  ['person', 'Contact name', 100, 'contact|contact person|contact person name|main contact name|intake contact|staff name|coordinator|representative'],
  ['phone', 'Phone', 180, 'phone number|telephone|telephone number|tel|contact phone|main contact phone|contact number|program phone|intake phone'],
  ['email', 'Email', 180, 'e mail|email address|contact email|main contact email|intake email'],
  ['website', 'Provider page', 500, 'website|web site|url|provider url|website url|website link|program website'],
  ['details', 'Service details', 6000, 'details|description|summary|service description|program description|services offered|notes|about|information'],
  ['eligibility', 'Eligibility', 2000, 'eligibility criteria|who is eligible'],
  ['referral', 'How to refer in', 2000, 'referral instructions|intake instructions|how to access'],
  ['intake', 'Referral form / intake link', 500, 'referral form|intake link'],
  ['verified', 'Last verified date', 100, 'last verified|source reviewed|verification date']
];

const columns = new Map(serviceFields.flatMap(([key, label, , aliases]) =>
  [label, ...aliases.split('|')].map(name => [header(name), key])));
const text = (value, limit) => typeof value === 'number' || typeof value === 'string'
  ? String(value).replace(/\u0000/g, '').trim().slice(0, limit) : '';
const blank = /^(?:n\/?a|unknown|tbd|to be (?:confirmed|verified)|[—–-]+)$/i;
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

export function serviceDraft(section = {}, {nameFromOrganization = true} = {}) {
  const mapped = {};
  const other = [];
  for (const [label, value] of Object.entries(section.fields || {})) {
    const key = columns.get(header(label));
    if (key) {
      if (!mapped[key] && !blank.test(String(value).trim())) mapped[key] = value;
    } else other.push([label, value]);
  }
  const values = cleanServiceFields(mapped);
  const places = ['Georgina','East Gwillimbury','Bradford / West Gwillimbury','Newmarket','Aurora','Alliston / New Tecumseth']
    .filter(place=>/^(?:yes|y|true|1|x|✓|✔)$/i.test(String(section.fields?.[place]??'').trim()));
  if (!values.area && places.length) values.area=places.join(', ');
  if (nameFromOrganization) values.name ||= values.organization;
  return {values, other};
}

const requestLeadIn = /^(?:(?:ok(?:ay)?|um|uh|hey|hi)[\s,.!]+|(?:please|(?:can|could|would|will) (?:you|we)|help (?:me|us)|i(?:['’]d| would) like (?:you )?to|i (?:want|need) (?:you )?to|let['’]s)\s+)*/i;
const addServiceAction = /^(?:add(?:\s+in)?|create|register|log|save|enter|put|file)\s+/i;
const showServiceForm = /^(?:open|show(?: me)?|bring up|give me|pop up)\s+(?:(?:an?|the|blank|new)\s+)*(?:service(?: entry)? form|form to add (?:an? )?(?:new )?service)\b/i;
const newServiceLead = /^(?:i|we)\s+(?:have|found|came across|know of)\s+(?:an?|another)\s+(?:new\s+)?/i;
const serviceReference = /^(?:services?|programs?|providers?|agenc(?:y|ies)|resources?|listings?)\b/i;
const serviceArticle = /^(?:a|an|the|this|that|another|one more)\s+/i;
const otherServiceAction = /^(?:requests?|results?|ratings?|notes?|feedback|follow[- ]?ups?|to (?:this|the|my) (?:case|request|chat))\b|^['’]s\b/i;
const editContactAction = /^(?:phone|email|website|contact (?:number|details|information)|opening hours)\b(?!\s*:)/i;
const intoDirectory = /\s+(?:to|in|into)\s+(?:(?:my|our|the)\s+)?(?:known services|own services|service (?:directory|library|list))\b/i;

function serviceFormFields(remainder) {
  const fragments = remainder.split(/\r?\n|;|[.,]\s+(?=[\p{L} /()]{2,50}:)/u);
  const fields = {};
  const named = fragments[0].match(/^(?:called|named)\s+(?:"([^"]+)"|“([^”]+)”|([^,?!]+))/i);
  if (named) fields['Service or program'] = (named[1] || named[2] || named[3]).replace(/[.?!]+$/, '');
  for (const fragment of fragments) {
    const parts = fragment.match(/^\s*([\p{L} /()]{2,50})\s*:\s*(.+)$/u);
    if (parts) fields[parts[1]] = parts[2];
  }
  return serviceDraft({fields}, {nameFromOrganization:false}).values;
}

export function serviceFormFromMessage(message) {
  const request = message.trim().replace(requestLeadIn, '');
  const requestedForm = request.match(showServiceForm);
  if (requestedForm) return serviceFormFields(request.slice(requestedForm[0].length).replace(/^\s*[:,]?\s*/, ''));
  const action = request.match(addServiceAction);
  const lead = action || request.match(newServiceLead);
  if (!lead) return null;
  const target = request.slice(lead[0].length).trim();
  const destination = action && target.match(intoDirectory);
  if (action && /^(?:put|file)\b/i.test(action[0]) && !destination) return null;
  const entry = destination ? target.slice(0,destination.index) : target;
  const afterDestination = destination ? target.slice(destination.index+destination[0].length).replace(/^\s*[:,]?\s*/, '') : '';
  const qualifiedSubject = entry.replace(serviceArticle, '');
  const subject = qualifiedSubject.replace(/^(?:(?:new|local|community|following)\s+)*/i, '');
  if (otherServiceAction.test(subject) || editContactAction.test(subject)) return null;

  // A short category descriptor can precede "service", as in "transportation service".
  const match = subject.match(serviceReference) ||
    subject.match(/^(?<descriptor>[\p{L}\p{N}&/ -]{1,48}?)\s+(?:services?|programs?|providers?|agenc(?:y|ies)|resources?|listings?)\b/iu);
  const descriptor = match?.groups?.descriptor;
  const category = serviceTopic(descriptor)?.category;
  if (match && (!descriptor || category || /^new\b/i.test(qualifiedSubject) || !action)) {
    const remainder = subject.slice(match[0].length).replace(/^\s*[:,]?\s*/, '');
    if (otherServiceAction.test(remainder) || editContactAction.test(remainder)) return null;
    if (!action && !/\b(?:add|save|log|register|enter)\b/i.test(remainder)) return null;
    const fields = serviceFormFields(remainder+'\n'+afterDestination);
    if (!fields.category && category) fields.category=category;
    return fields;
  }

  // An explicit directory destination also permits a named service without the word "service".
  if (!destination || !/^(?:add|save|put|file|enter|register|log)\b/i.test(action[0])) return null;
  const name = entry.trim().replace(/^["“]|["”]$/g, '');
  const fields = serviceFormFields(afterDestination);
  if (!/^(?:it|this|that|this one|that one)$/i.test(name) && !serviceReference.test(name)) {
    fields.name ||= cleanServiceFields({name}).name;
  }
  return fields;
}

export function mayRequestServiceForm(message) {
  const request = message.trim().replace(requestLeadIn, '');
  const object = request.replace(addServiceAction, '').replace(serviceArticle, '');
  if (otherServiceAction.test(object) || editContactAction.test(object) ||
    otherServiceAction.test(object.replace(serviceReference, '').trim())) return false;
  return /\b(?:service(?:s)?|provider|program|agency|directory|resource|listing)\b/i.test(message) &&
    /\b(?:add|create|register|log|save|enter|file|include|keep)\b/i.test(message);
}

export function confirmServiceFormFields(message, suggested) {
  const values = cleanServiceFields(suggested);
  const prompt = ' '+header(message)+' ';
  for (const [key,value] of Object.entries(values)) {
    // Advice from the model may prefill the form only when the user supplied the value.
    if (value && !prompt.includes(' '+header(value)+' ')) values[key]='';
  }
  return values;
}

export function directoryGaps(card) {
  const values=serviceDraft(card,{nameFromOrganization:false}).values;
  const missing=[];
  if (card.source_format===OWN_SERVICE_FORMAT && !values.name) missing.push('service name');
  if (card.source_format===OWN_SERVICE_FORMAT && !values.category) missing.push('category');
  if (!card.contacts?.length) missing.push('phone or email');
  if (!values.area) missing.push('service area');
  if (!values.eligibility) missing.push('eligibility');
  if (!values.referral && !values.intake) missing.push('intake or referral details');
  if (!values.verified) missing.push('verification date');
  return missing;
}

export function missingServiceDetails(values) {
  const missing = [];
  if (!values.name) missing.push('What is this service or program called?');
  if (!serviceContacts(values).length) missing.push('Do you have a phone number or email for this service?');
  if (!values.area) missing.push('Which communities does this service cover?');
  return missing;
}

export function serviceSection(section, input, {allowMissingName = false} = {}) {
  const values = cleanServiceFields(input);
  if (!allowMissingName && !values.name) throw new Error('Enter a service or program name before saving.');
  if (!Object.values(values).some(Boolean)) {
    throw new Error('Enter at least one detail, such as the organization, phone number, or a short description.');
  }
  const standard = serviceFields.flatMap(([key, label]) => values[key] ? [[label, values[key]]] : []);
  const fields = Object.fromEntries([...serviceDraft(section).other, ...standard]);
  const title = values.organization && values.name && header(values.organization) !== header(values.name)
    ? values.organization + ' · ' + values.name : values.name || values.organization || 'Unnamed service';
  const body = [values.details, ...Object.entries(fields).filter(([label]) => label !== 'Service details')
    .map(([label, value]) => label + ': ' + value)].filter(Boolean).join('\n');
  return {...section, title, fields, body};
}
