import { enums } from './core/catalog.mjs';

const normal = value => String(value).normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[–—−-]/g, ' ').replace(/\s+/g, ' ').trim();
const escaped = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const positive = (text, expression) => [...text.matchAll(new RegExp(expression, 'g'))].some(match => !/\b(?:no|not|without|excluding|except|outside)(?:\s+(?:a|an|in|using|needing))?\s*$/.test(text.slice(Math.max(0, match.index - 35), match.index)));
const categories = {
  Transportation: '\\b(?:transport(?:ation)?|ride|rides|shuttle|transit)\\b',
  'Home supports': '\\b(?:home (?:care|help|support|supports)|housekeeping|cleaning|personal care|personal support)\\b',
  'Food and nutrition': '\\b(?:food|meals?|groceries|grocery|nutrition|food bank|pantry)\\b',
  'Language access': '\\b(?:interpret(?:er|ers|ation|ing)|translat(?:ion|or|ors)|language access)\\b',
  'Mental health': '\\b(?:mental health|counselling|counseling|addiction|addictions)\\b',
  'Caregiver support': '\\b(?:caregiver|caregivers|care partner|respite|caregiver relief)\\b',
  'Housing support': '\\b(?:housing|shelter|rent support|accommodation)\\b',
  'Financial assistance': '\\b(?:financial|income support|ontario works|benefits|help with bills)\\b',
  'Social connection': '\\b(?:lonely|loneliness|social connection|friendly calls?|friendly visits?|companionship)\\b'
};
const defaults = { age_band: 'Unspecified', mobility: 'Unspecified', language: 'Unspecified', timing: 'Flexible' };
export const guideHelp = 'I can find saved services right away, even before you have personal history. Tell me the service needed and the area—for example, “Find transportation in Georgina for an adult using a walker.” I’ll give options, contacts and the next access check. Tell me which provider worked or did not work; clear results save automatically in the memory library and refine future rankings. Connect ChatGPT for broader conversation and online research.';

export function needsInMessage(message, previous = {}) {
  const text = normal(message), context = { ...defaults, ...previous };
  const categoryMatches = Object.entries(categories).filter(([, expression]) => positive(text, expression)).map(([category]) => category);
  const regionMatches = enums.regions.filter(region => positive(text, '\\b' + escaped(normal(region)) + '\\b'));
  if (categoryMatches.length === 1) context.category = categoryMatches[0];
  if (regionMatches.length === 1) context.region = regionMatches[0];
  const range = /\b(18|40|65)\s+(?:to\s+)?(39|64)\b/.exec(text);
  const exact = /\b(?:age|aged)\s+(\d{1,3})\b/.exec(text) || /\b(\d{1,3})\s+(?:year|years|yr)\s+old\b/.exec(text);
  if (range && range[1] === '18' && range[2] === '39') context.age_band = '18–39';
  else if (range && range[1] === '40' && range[2] === '64') context.age_band = '40–64';
  else if (/\b(?:under 18|child|teenager)\b/.test(text)) context.age_band = 'Under 18';
  else if (/\b65\s*(?:\+|and over|or older|or over|plus)(?=\W|$)/.test(text)) context.age_band = '65+';
  else if (exact && Number(exact[1]) <= 120) { const age = Number(exact[1]); context.age_band = age < 18 ? 'Under 18' : age < 40 ? '18–39' : age < 65 ? '40–64' : '65+'; }
  if (positive(text, '\\b(?:wheelchair|wheel chair)\\b')) context.mobility = 'Wheelchair';
  else if (positive(text, '\\b(?:lifting assistance|lift assistance|needs lifting)\\b')) context.mobility = 'Lifting assistance';
  else if (positive(text, '\\b(?:walker|walking frame|rollator)\\b')) context.mobility = 'Walker';
  else if (positive(text, '\\bambulatory\\b')) context.mobility = 'Ambulatory';
  const languages = enums.languages.filter(language => !['Unspecified', 'Other'].includes(language) && positive(text, '\\b' + escaped(normal(language)) + '\\b'));
  if (languages.length === 1) context.language = languages[0];
  if (positive(text, '\\b(?:today|tomorrow|urgent|within (?:two|2) days)\\b')) context.timing = 'Within 2 days';
  else if (positive(text, '\\b(?:weekend|weekends|evening|evenings)\\b')) context.timing = 'Evenings or weekends';
  else if (positive(text, '\\b(?:within a week|this week)\\b')) context.timing = 'Within a week';
  return { context, categoryMatches, regionMatches };
}

// Conservative routing for common directory questions. Ambiguous areas/types
// are clarified; unsupported or complex requests can go to the connected model.
// It never writes experience or stores raw patient descriptions.
export function guidePlan(message, state = {}) {
  const text = normal(message);
  const write = /\b(?:remember|save|record|update|correct|retract|forget|delete|add a service|add service|edit service|feedback|rate|rating|received|declined)\b/.test(text);
  const online = /\b(?:search online|web search|use web search|search the web|look online|official provider websites|latest information|beyond (?:the |my |your )?saved)\b/.test(text);
  if (/^(?:hi|hello|hey|good morning|good afternoon|help|how do i start|what can you do)[.!?]*$/.test(text)) return { kind: 'help', text: guideHelp, state };
  const categoryMatches = Object.entries(categories).filter(([, expression]) => positive(text, expression)).map(([category]) => category);
  const regionMatches = enums.regions.filter(region => positive(text, '\\b' + escaped(normal(region)) + '\\b'));
  const followup = Boolean(state.pending || state.context && /^(?:use|what does|how does).*(?:past experience|my history|recorded results)/.test(text) || /^(?:what about|how about|and |instead|same person|same need|now with|change (?:it |the )?to|use (?:a |an )?wheelchair)/.test(text) ||
    state.context && regionMatches.length === 1 && text === normal(regionMatches[0]));
  const request = !write && (categoryMatches.length > 0 || followup || /\b(?:recommend|recommendation|recommendations|find services|service options|suggest a service|past experience)\b/.test(text));
  if (!request || online) return { kind: 'ai', online, write, state };
  const { context } = needsInMessage(message, followup ? state.context || {} : {});
  if (categoryMatches.length > 1) return { kind: 'question', text: 'I heard more than one service need: ' + categoryMatches.join(', ') + '. Which should we start with?', state: { context: { ...context, category: undefined }, pending: 'category' } };
  if (regionMatches.length > 1) return { kind: 'question', text: 'Which community should I use as the service or pickup area: ' + regionMatches.join(' or ') + '?', state: { context: { ...context, region: undefined }, pending: 'region' } };
  if (!context.category) return { kind: 'question', text: 'What support should I find—for example transportation, home help, meals, language access or caregiver support?', state: { context, pending: 'category' } };
  if (!context.region) return { kind: 'question', text: 'Which community is the service or pickup for? For example, Georgina, Newmarket, Aurora, Bradford, Innisfil or North York.', state: { context, pending: 'region' } };
  return { kind: 'recommend', context, state: { context, pending: null } };
}

const short = (text, length = 260) => String(text || '').length > length ? String(text).slice(0, length).replace(/\s+\S*$/, '') + '…' : String(text || '');
export function recommendationAnswer(result, { fallback = false } = {}) {
  const context = { ...defaults, ...result.context };
  const { items } = result;
  const needs = [context.category, context.region, context.age_band !== 'Unspecified' ? 'age ' + context.age_band : '', context.mobility !== 'Unspecified' ? context.mobility.toLowerCase() : '', context.language !== 'Unspecified' ? context.language : '', context.timing !== 'Flexible' ? context.timing : ''].filter(Boolean).join(' · ');
  if (!items.length) return `I could not find a saved service meeting all of these requirements: ${needs}.\n\n${(result.excluded || []).slice(0, 3).map(item => item.name + ': ' + item.reasons.join(' ')).join('\n')}\n\nSearch the wider community directory at https://211ontario.ca/search/ or ask Hive to search online for additional providers. You can also adjust the requirements in Find services.`;
  const completed = items.reduce((sum, item) => sum + item.evidence.completed, 0);
  const intro = (fallback ? 'The AI connection did not return a usable explanation. Here are the saved directory matches.\n\n' : '') + (needs || 'Saved service options') + '\n' +
    (completed ? 'Ranked using access fit and your comparable recorded outcomes where available.' : 'You have no comparable completed outcomes for these matches yet. These starting options use service requirements from the saved directory.');
  const options = items.slice(0, 3).map((item, index) => {
    const { service, evidence } = item;
    const lines = [`${index + 1}. ${service.name}`, short(service.summary), service.phone ? 'Contact: ' + service.phone : 'Contact: use the provider page below.',
      'Access: ' + short(service.access), service.fees ? 'Fees: ' + short(service.fees, 160) : '',
      item.checks.find(check => check !== service.access) ? 'Confirm: ' + short(item.checks[0], 180) : '',
      evidence.completed ? `Your comparable results: ${evidence.received}/${evidence.completed} received (${evidence.delivery_rate}% of recorded completed attempts).` : 'Personal completed-outcome history: none yet.',
      evidence.satisfaction_count ? `Satisfaction: ${evidence.satisfaction}/5 from ${evidence.satisfaction_count} rating${evidence.satisfaction_count === 1 ? '' : 's'}.` : '',
      evidence.sentiment_count ? `Verbal satisfaction feedback: ${evidence.happy_count} happy, ${evidence.unhappy_count} unhappy, ${evidence.sentiment_count - evidence.happy_count - evidence.unhappy_count} mixed.` : '',
      !evidence.completed && item.overall?.completed ? `${item.overall.completed} recorded completed attempt${item.overall.completed === 1 ? '' : 's'} in other contexts; not counted as comparable to these requirements.` : '',
      service.source_url || ''];
    return lines.filter(Boolean).join('\n');
  }).join('\n\n');
  return intro + '\n\n' + options + '\n\nNext step: confirm eligibility, pickup/service boundaries, required assistance, fees and current capacity with the provider before arranging a connection.\n\nAfterwards, tell Hive which provider worked or did not work and whether the person was happy. Clear results save automatically in your memory library. Missing details remain as library drafts; you can update or retract saved results.';
}

export function serviceAnswer(value) {
  const service = value.service;
  return [service.name, service.summary, 'Listed areas: ' + service.coverage.join(', '), service.phone ? 'Contact: ' + service.phone : '', service.email ? 'Email: ' + service.email : '',
    'Access: ' + service.access, service.fees ? 'Fees: ' + service.fees : '',
    value.personal_evidence?.completed ? `Your recorded results for this program: ${value.personal_evidence.received}/${value.personal_evidence.completed} completed attempts received.` : 'No completed personal outcomes are recorded for this program yet.',
    service.source_url, 'Confirm current eligibility, availability and costs with the provider.'].filter(Boolean).join('\n');
}
