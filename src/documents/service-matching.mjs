import {headerKey} from './navigation-templates.mjs';
import {serviceDraft} from './service-sources.mjs';

const nameKey = value => headerKey(String(value ?? '').replace(/[’']s\b/gi, ''));
const includes = (text, phrase) => phrase && (' ' + text + ' ').includes(' ' + phrase + ' ');

function serviceNames(card) {
  const {values} = serviceDraft(card);
  return [...new Set([card.title, values.organization, card.title.split(' · ')[0], values.name]
    .map(nameKey).filter(name => name.length >= 4))];
}

export function matchingServices(cards, text, {exactName=false, suggest=false}={}) {
  const query = nameKey(text);
  const aliases = cards.map(card=>({card,names:serviceNames(card)}));
  const exact = new Set(aliases.flatMap(({names}) =>
    names.filter(name=>exactName ? query===name : includes(query,name))));
  if (exact.size) {
    const names=[...exact].filter(name=>![...exact].some(other=>other.length>name.length&&includes(other,name)));
    return {exact:true,cards:aliases.filter(entry=>names.some(name=>entry.names.includes(name))).map(entry=>entry.card)};
  }
  if (!suggest) return {exact:false,cards:[]};
  const ranked = aliases.map(({card,names}) => {
    const suffixes = names.map(name=>name.split(' ').slice(1)).filter(words=>words.length>=3)
      .map(words=>words.join(' '));
    const score = Math.max(0, ...suffixes.filter(name=>includes(query,name)).map(name=>name.length));
    return {card,score};
  }).filter(match=>match.score>0).sort((a,b)=>b.score-a.score);
  const best = ranked[0];
  if (!best) return {exact:false,cards:[]};
  return {exact:false,cards:ranked.filter(hit=>hit.score===best.score).map(hit=>hit.card)};
}
