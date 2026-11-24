import { enums } from '../core/catalog.mjs';

const categories = [
  ['Transportation', /\b(?:transport(?:ation)?|rides?|shuttles?|wheel[- ]?trans|paratransit)\b/],
  ['Meal support', /\b(?:meals?|food|pantr(?:y|ies)|grocer(?:y|ies))\b/, 'Food and nutrition'],
  ['Home support', /\b(?:home (?:care|help|supports?)|personal support|housekeeping)\b/, 'Home supports'],
  ['Language support', /\b(?:interpreters?|interpretation|translation|language access)\b/, 'Language access'],
  ['Mental health support', /\b(?:mental health|counselling|counseling|addiction)\b/, 'Mental health'],
  ['Caregiver support', /\b(?:caregivers?|respite|dementia|alzheimer)\b/],
  ['Housing support', /\b(?:housing|shelter|rent(?:al)?)\b/],
  ['Financial assistance', /\b(?:financial (?:help|support|assistance)|income support|ontario works)\b/],
  ['Social connection', /\b(?:friendly visiting|social connection|loneliness)\b/]
];
const regions = [...enums.regions, 'York Region'].sort((a, b) => b.length - a.length);
const fold = value => String(value ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const transportNeeds = [
  [/\b(?:wheelchairs?|mobility scooters?)\b/, 'Wheelchair access'],
  [/\b(?:walkers?|rollators?)\b/, 'Walker access'],
  [/\b(?:hospital|medical|clinic|specialist) (?:appointments?|visits?)\b/, 'Medical appointment'],
  [/\b(?:older (?:adults?|person|man|woman)|seniors?|elderly)\b/, 'Older adult']
];

export function serviceTopic(text) {
  const request = fold(String(text ?? '').slice(0, 12000));
  const match = categories.map(([label, pattern, category]) => ({
    label, category: category || label, index: request.search(pattern)
  })).filter(topic => topic.index >= 0).sort((a, b) => a.index - b.index)[0];
  if (!match) return null;
  const region = regions.find(place => (' ' + request + ' ').includes(' ' + fold(place) + ' '));
  return {
    category: match.category,
    region,
    title: region ? match.label + ' in ' + region : match.label
  };
}

export function matchesServiceTopic(card, topic) {
  const fields=card.fields||{};
  if (/^(?:closed|inactive|discontinued|retired)$/i.test(String(fields['Service status']||'').trim())) return false;
  const pattern=categories.find(([label,,category])=>(category||label)===topic.category)?.[1];
  const category=fields.Category||card.category||'';
  if (fold(category)!==fold(topic.category) &&
      !pattern?.test(fold([category,fields['Service Subcategory'],card.title,fields['Service details']].join(' ')))) return false;
  if (!topic.region) return true;
  const coverage=' '+fold([fields['Service area'],fields['Geographic Coverage / Catchment']].join(' '))+' ';
  if (coverage.includes(' '+fold(topic.region)+' ')) return true;
  if (topic.region!=='York Region') return false;
  return ['Aurora','East Gwillimbury','Georgina','King','Markham','Newmarket','Richmond Hill','Vaughan','Whitchurch Stouffville']
    .some(place=>coverage.includes(' '+fold(place)+' '));
}

export function summarizeTopic(text) {
  const prompt = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!prompt || /^(?:hi|hey|hello|thanks|thank you)[.!? ]*$/i.test(prompt)) return 'New topic';
  const service = serviceTopic(prompt);
  if (service) {
    const need = service.category === 'Transportation' && transportNeeds.find(([pattern]) => pattern.test(fold(prompt)));
    return need ? service.title + ' · ' + need[1] : service.title;
  }
  const firstThought = prompt
    .replace(/^(?:please\s+)?(?:can you\s+|could you\s+|i (?:need|want) (?:help with |to )?)/i, '')
    .split(/[.!?]\s|\s[—–]\s/)[0];
  const short = firstThought.split(/\s+/).slice(0, 8).join(' ').slice(0, 60).replace(/[.,;!? ]+$/, '');
  return short ? short[0].toUpperCase() + short.slice(1) : 'New topic';
}
