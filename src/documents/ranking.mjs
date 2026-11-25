import {headerKey} from './navigation-templates.mjs';
import {isServiceSource, OWN_SERVICE_FORMAT, PUBLIC_SERVICE_FORMAT} from './service-sources.mjs';

const searchNoise = new Set(['please','about','service','services','would','could','need','have','that','this',
  'with','what','show','find','recommend','recommended','rank','ranked','rankings','ranking','options','cards','for',
  'can','you','our','using','based','experience','history','your','the','who','use','uses','needs',
  'previous','previously','tried','rating','ratings','scores','last',
  'help','want','looking','look','suggest','list','choices','some','get','getting','finding']);

export const rankingPolicy = 'I check the service category and area first. Matching own-source leads appear first, even without a rating. Public options follow. Own-source leads with an average of 2/5 or lower, or more Didn’t work than Worked results, appear after public options. Within each group, I consider the details of the request, your average ratings and recorded outcomes. Unrated services use 3/5 for sorting only. Pending follow-ups and ordinary notes do not count as outcomes.';

export const hasServiceResult = card => Boolean(card.experience?.worked || card.experience?.not_worked);

export function keepServiceExperience(ranked, choices=ranked.slice(0,6)) {
  if (choices.some(hasServiceResult)) return choices;
  const tried = ranked.find(hasServiceResult);
  return tried ? [...choices.slice(0,5), tried] : choices;
}

export function historyScore(card) {
  const stats = card.experience || card;
  return Number(stats.rating_count)>0 ? Number(stats.rating_average) : 3;
}

function outcomeBalance(card) {
  const stats = card.experience || card;
  const worked = Number(stats.worked || 0), failed = Number(stats.not_worked || 0);
  return (worked-failed)/(worked+failed+2);
}

export function compareHistory(a,b) {
  return historyScore(b)-historyScore(a) || outcomeBalance(b)-outcomeBalance(a);
}

export const recommendationGroups = {
  'own': 'Own-source leads',
  'public': 'Public options',
  'own-review': 'Own-source leads to review'
};

export function groupServiceOptions(ranked, choices = keepServiceExperience(ranked)) {
  const chosen = new Map(choices.map(card => [card.id, card]));
  const publicCards = ranked.filter(card => card.source_format === PUBLIC_SERVICE_FORMAT);
  const own = [], review = [];
  for (const candidate of ranked) {
    if (candidate.source_format !== OWN_SERVICE_FORMAT) continue;
    const card = chosen.get(candidate.id) || candidate;
    const history = card.experience || card;
    const poor = historyScore(card) <= 2 || Number(history.not_worked || 0) > Number(history.worked || 0);
    const reason = poor ? (publicCards.length ? 'Your saved ratings or outcomes put this lead after public options.'
      : 'Review your saved ratings or outcomes before using this lead again.')
      : 'Your matching own-source lead is shown first, even without a rating.';
    (poor ? review : own).push({...card, card_source_group:poor?'own-review':'own',
      card_rank_reason:[reason, card.card_rank_reason].filter(Boolean).join(' ')});
  }
  const publicCard = card => ({...card, card_source_group:'public'});
  if (!own.length && !review.length) return choices.map(card =>
    card.source_format === PUBLIC_SERVICE_FORMAT ? publicCard(card) : card);
  const publicOptions = choices.filter(card => card.source_format === PUBLIC_SERVICE_FORMAT);
  const alternatives = (publicOptions.length ? publicOptions : publicCards).map(publicCard);
  // Leave room for a relevant public alternative and an own lead with poor history when available.
  const reserveReview = Number(review.length > 0);
  const first = own.slice(0, 6 - Number(alternatives.length > 0) - reserveReview);
  const next = alternatives.slice(0, 6 - first.length - reserveReview);
  if (!reserveReview && !first.some(hasServiceResult) && !next.some(hasServiceResult)) {
    const tried = alternatives.find(hasServiceResult);
    if (tried) next[next.length - 1] = tried;
  }
  return [...first, ...next, ...review.slice(0, 6 - first.length - next.length)];
}

export function directoryGroup(card) {
  const stats=card.experience||card;
  if (Number(stats.worked||0)+Number(stats.not_worked||0)>0) return 0;
  return card.source_format===OWN_SERVICE_FORMAT ? 1 : 2;
}

function historyReason(card) {
  const stats=card.experience||card;
  const worked=Number(stats.worked||0), failed=Number(stats.not_worked||0);
  if (!worked && !failed) return 'No recorded outcomes yet.';
  const rating=stats.rating_count
    ? 'Your average is '+Number(stats.rating_average).toFixed(1)+'/5 from '+stats.rating_count+' rating'+(stats.rating_count===1?'':'s')+'. '
    : 'No rating recorded. ';
  return rating+worked+' worked, '+failed+' didn’t work in your records.';
}

export function serviceSearchTerms(query, topic) {
  const scopedTerms = new Set(headerKey(topic?.title).split(' '));
  return [...new Set(headerKey(query).split(' '))]
    .filter(word=>word.length>=3&&!searchNoise.has(word)&&!scopedTerms.has(word));
}

export function rankResponseCards(cards, query='', topic=null) {
  const terms=serviceSearchTerms(query,topic);
  const matched=card=>{
    const searchable=new Set(headerKey([card.title,card.category,card.fields?.Category,card.area,card.fields?.['Service area'],card.body].join(' ')).split(' '));
    return terms.filter(word=>searchable.has(word)||searchable.has(word+'s'));
  };
  return cards.map(card=>({card,words:matched(card)}))
    .sort((a,b)=>b.words.length-a.words.length||compareHistory(a.card,b.card))
    .map(({card,words})=>isServiceSource(card.source_format)?{
      ...card,card_rank_reason:(words.length?'Matched '+words.slice(0,6).join(', ')+'. ':'')+historyReason(card)
    }:card);
}
