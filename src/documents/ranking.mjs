import {headerKey} from './navigation-templates.mjs';
import {isServiceSource, OWN_SERVICE_FORMAT} from './service-sources.mjs';

const searchNoise = new Set(['please','about','service','services','would','could','need','have','that','this',
  'with','what','show','find','recommend','recommended','rank','ranked','rankings','ranking','options','cards','for',
  'can','you','our','using','based','experience','history','your','the','who','use','uses','needs']);

export const rankingPolicy = 'I check that a service matches the category and area you asked for. Specific request details can move a closer match up. Among equally relevant cards, I compare your average ratings, then weigh recorded Worked and Didn’t work results. An unrated service starts at 3/5 for sorting only. Pending follow-ups and ordinary notes do not count as outcomes.';

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

export function rankResponseCards(cards, query='', topic=null) {
  const scopedTerms = new Set(headerKey(topic?.title).split(' '));
  const terms=[...new Set(headerKey(query).split(' '))]
    .filter(word=>word.length>=3&&!searchNoise.has(word)&&!scopedTerms.has(word));
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
