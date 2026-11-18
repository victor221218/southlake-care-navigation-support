function normalized(value) {
  const raw = String(value), positions = []; let text = '';
  for (let index = 0; index < raw.length;) {
    const point = String.fromCodePoint(raw.codePointAt(index));
    const chars = point.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[’‘]/g, "'").replace(/[–—−·-]/g, ' ');
    for (const char of chars) {
      const next = /\s/.test(char) ? ' ' : char;
      if (next === ' ' && (!text || text.endsWith(' '))) continue;
      text += next; positions.push(index);
    }
    index += point.length;
  }
  if (text.endsWith(' ')) { text = text.slice(0, -1); positions.pop(); }
  return { text, positions, raw };
}
const fold = value => normalized(value).text;
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const aliases = {
  'chats-rides': ['chats', 'irideplus', 'iride plus', 'i ride plus', 'i rideplus', 'chats transportation'],
  'yrt-paratransit': ['yrt', 'mobility on request', 'yrt paratransit'],
  'routes-rides': ['routes', 'routes connecting communities'],
  'circle-iride': ['circle of care', 'circle of care iride'],
  'ttc-wheeltrans': ['ttc', 'wheel trans', 'wheeltrans', 'ttc wheel trans'],
  'nysc-transport': ['north york seniors centre', 'north york seniors center', 'nysc'],
  'betterliving-transport': ['better living', 'better living transportation'],
  'ohah-homecare': ['ontario health at home', 'ontario health athome', 'ontario health homecare'],
  'oco-caregiver': ['ontario caregiver organization', 'caregiver helpline']
};

export function providerMentions(message, services, category) {
  const { text, positions, raw } = normalized(message), found = [];
  const add = (service, expression, score) => {
    for (const match of text.matchAll(new RegExp('\\b(?:' + expression + ')\\b', 'g'))) found.push({ start: match.index, end: match.index + match[0].length, id: service.id, category: service.category, score });
  };
  for (const service of services) {
    const pieces = service.name.split('·').map(value => fold(value));
    add(service, escape(fold(service.name)), 120);
    for (const [index, name] of pieces.entries()) if (name.length >= 5 && !/^(transportation|home support|food support|language services|home help|iride)$/.test(name)) add(service, escape(name), index ? 70 : 40);
    for (const alias of aliases[service.id] || []) add(service, escape(alias), 40);
    if (service.id === 'chats-rides') { add(service, 'chats\\s*i\\s*ride(?:\\s*plus)?', 150); add(service, 'i\\s*ride\\s*plus', 90); }
    if (service.id === 'circle-iride') { add(service, 'circle of care(?:\\s+i\\s*ride(?:\\s*plus)?)?', 150); add(service, 'i\\s*ride(?!\\s*plus)', 20); }
  }
  // Explicit organization + program wins over a shared product name. In
  // particular, CHATS iRIDEplus can never be reassigned to Circle of Care.
  found.sort((a, b) => b.score - a.score || (b.end - b.start) - (a.end - a.start) || a.start - b.start);
  const groups = [];
  for (const match of found) {
    const overlapping = groups.find(item => match.start < item.end && match.end > item.start);
    if (overlapping) { if (match.start === overlapping.start && match.end === overlapping.end && match.score === overlapping.score) overlapping.matches.push(match); continue; }
    groups.push({ start: match.start, end: match.end, score: match.score, matches: [match] });
  }
  return groups.sort((a, b) => a.start - b.start).map(group => {
    const matching = category && group.matches.some(item => item.category === category) ? group.matches.filter(item => item.category === category) : group.matches;
    return { start: group.start, end: group.end, raw_start: positions[group.start], raw_end: positions[group.end] ?? raw.length, ids: [...new Set(matching.map(item => item.id))] };
  });
}

const numbers = { one: 1, two: 2, three: 3, four: 4, five: 5 };
export function resultInClause(message) {
  const text = fold(message).replace(/\b(didnt|doesnt|couldnt|wasnt|werent|havent|hasnt|dont|cant)\b/g, word => ({ didnt: "didn't", doesnt: "doesn't", couldnt: "couldn't", wasnt: "wasn't", werent: "weren't", havent: "haven't", hasnt: "hasn't", dont: "don't", cant: "can't" })[word]);
  // Questions, future plans, quoted examples, and untried programs are not
  // evidence of a service connection. They must not enter the denominator.
  if (/\?|\b(?:if |might |may |will |would |could work|should work|hopefully|for example|example:|pretend|hypothetical|haven't tried|have not tried|never tried|haven't used|have not used|never used|not tried|didn't try|did not try)\b/.test(text)) return null;
  let delivery;
  if (/^(?:it was |the service was )?received[.!]*$/.test(text)) delivery = 'Received';
  if (/\b(?:patient|person|client)\s+(?:has |had |politely )?(?:declined|chose not|refused)\b/.test(text)) delivery = 'Declined';
  else if (/\b(?:not yet|not received yet|not delivered yet|not arrived yet|hasn't arrived yet|has not arrived yet)\b/.test(text)) delivery = 'Pending';
  else if (/\b(?:said no|told (?:me|us) no|declined|turned (?:me|us|them|the referral) down|refused (?:the |our )?(?:ride|referral|service)|couldn't (?:provide|offer|get)|could not (?:provide|offer|get)|can't help|cannot help|didn't work|did not work|doesn't work|does not work|didn't help|did not help|couldn't help|could not help|couldn't take|could not take|unable to (?:help|provide|take)|not received|didn't receive|did not receive|no ride|no capacity|no drivers?|no vehicles?|fully booked|all booked|at capacity|unsuccessful|not successful|failed|not eligible|ineligible|too young|too old|out of area|(?:don't|do not|doesn't|does not) (?:cover|serve)|didn't answer|did not answer|(?:never|didn't|did not) (?:called|call|get) (?:me |us |them )?back|no answer|no response|unavailable|not available|fell through|didn't show up|did not show up|failed to arrive|cancelled|canceled)\b/.test(text) || /^(?:did not|didn't|no)[.!]*$/.test(text.trim())) delivery = 'Not received';
  else if (/\b(?:worked|went well|successful|got (?:the |a )?(?:ride|service|support)|received (?:the |a |their )?(?:ride|service|support|meals?)|(?:ride|service|support) (?:was )?(?:received|delivered|completed)|provided (?:the |a )?(?:ride|service|support)|picked (?:them|him|her|me|the person) up|took (?:the |a )?ride)\b/.test(text)) delivery = 'Received';
  else if (/\b(?:waiting|pending|waitlist|wait list|booked|scheduled|said yes|accepted the referral)\b/.test(text)) delivery = 'Pending';
  const rating = /\b([1-5]|one|two|three|four|five)\s*(?:\/|out of)\s*(?:5|five)\b/.exec(text) || /\b(?:rated?|rating|satisfaction(?: was)?)\s*(?:it |was |of )?([1-5]|one|two|three|four|five)(?:\b|$)/.exec(text) || /\b([1-5]|one|two|three|four|five)\s+stars?\b/.exec(text);
  let sentiment;
  if (/\b(?:unhappy|not (?:very |really )?happy|wasn't happy|weren't happy|dissatisfied|not (?:very |really )?satisfied|wasn't satisfied|very disappointed|poor experience)\b/.test(text)) sentiment = 'Unhappy';
  else if (/\b(?:mixed feedback|mixed experience|mixed feelings)\b/.test(text)) sentiment = 'Mixed';
  else if (/\b(?:happy|satisfied|pleased|great experience|excellent experience)\b/.test(text)) sentiment = 'Happy';
  if (!delivery && !rating && !sentiment) return null;
  let reason = 'Other';
  if (/\b(?:capacity|full|fully booked|all booked|no space|no driver|no drivers|no vehicle|no vehicles)\b/.test(text)) reason = 'Capacity';
  else if (/\b(?:eligib|ineligible|age criteria|age requirement|too young|too old)\w*/.test(text)) reason = 'Eligibility';
  else if (/\b(?:out of area|coverage|catchment|outside.*area|(?:don't|do not|doesn't|does not) (?:cover|serve))\b/.test(text)) reason = 'Coverage';
  else if (/\b(?:wheelchair|walker|lifting|accessibility|accessible)\b/.test(text)) reason = 'Access requirement';
  else if (/\b(?:contact|answer|called back|callback)\b/.test(text)) reason = 'Unable to contact';
  return { ...(delivery ? { delivery } : {}), ...(rating ? { satisfaction: Number(rating[1]) || numbers[rating[1]] } : {}), ...(sentiment ? { satisfaction_sentiment: sentiment } : {}), reason: delivery === 'Received' ? 'None' : delivery === 'Declined' ? 'Patient choice' : reason };
}

export function feedbackFromMessage(message, services, { category, lastProviders = [] } = {}) {
  const text = fold(message), mentions = providerMentions(message, services, category), entries = [];
  // Ignore copied/tool-like instructions and explicit requests not to retain it.
  if (/\b(?:do not save|don't save|do not remember|don't remember|do not record|don't record)\b/.test(text)) return { entries, mentions, private: true };
  if (/\b(?:maybe|not sure|not certain|can't remember|cannot remember|can't recall|don't know if)\b/.test(text) || /^(?:can|could|should|would|will|do|does|did|is|are|was|were|what|which|how|why)\b/.test(text)) return { entries, mentions, private: true };
  if (/\b(?:for example|example:|pretend|hypothetical|imagine|a fictional|fictional example|for others|other people's|people say|i heard|you said|you suggested|you recommended|the website says)\b/.test(text)) return { entries, mentions, private: true };
  if (mentions.length) {
    for (let index = 0; index < mentions.length; index++) {
      const mention = mentions[index];
      let end = mentions[index + 1]?.start ?? text.length;
      let clause = text.slice(mention.end, end), result = resultInClause(clause);
      // “Circle of Care and Wheel-Trans worked” shares an explicit predicate.
      if (!result && /^\s*(?:,|and|both|\s)+$/.test(clause) && mentions[index + 1]) {
        let next = index + 1;
        while (mentions[next + 1] && /^\s*(?:,|and|both|\s)+$/.test(text.slice(mentions[next].end, mentions[next + 1].start))) next++;
        result = resultInClause(text.slice(mentions[next].end, mentions[next + 1]?.start ?? text.length));
      }
      // A provider at the end of “the ride was received from X” has a prefix.
      if (!result && index === 0 && !mentions[index + 1]) result = resultInClause(text.slice(0, mention.start));
      if (result) entries.push({ ...(mention.ids.length === 1 ? { service_id: mention.ids[0] } : { candidate_ids: mention.ids }), ...result, comment: String(message).slice(index ? mention.raw_start : 0, mentions[index + 1]?.raw_start ?? String(message).length).trim().replace(/(?:[,;]|\band)\s*$/i, '').trim() });
    }
    if (!entries.length && /\b(?:i|we) (?:tried|called|contacted|used|tested|attempted)\b/.test(text) && !/\?|\b(?:haven't|have not|never|didn't|did not) (?:tried|try|called|call|contacted|contact|used|use)\b/.test(text)) for (const mention of mentions) entries.push(mention.ids.length === 1 ? { service_id: mention.ids[0] } : { candidate_ids: mention.ids });
  } else {
    const result = /\b(?:find|recommend|suggest|which provider|what provider)\b/.test(text) ? null : resultInClause(text);
    const unresolved = /\b(?:tried|called|contacted|tested|used)\s+(?!(?:it|them|that|this|the (?:service|provider|program))\b)[a-z]/.test(text);
    if (result && !unresolved && lastProviders.length > 1 && /\b(?:both|all of them|all those providers|all these providers)\b/.test(text)) for (const id of lastProviders) entries.push({ service_id: id, ...result, comment: String(message).trim() });
    else if (result) entries.push({ ...(!unresolved && lastProviders.length === 1 ? { service_id: lastProviders[0] } : { candidate_ids: unresolved ? [] : lastProviders }), ...result, comment: String(message).trim() });
  }
  return { entries, mentions, private: false };
}

export const isNewAttempt = message => /\b(?:another (?:person|patient|client|ride|trip|attempt|request)|new (?:person|patient|client|request|trip|attempt)|different (?:person|patient|client)|next (?:person|patient|client)|second (?:ride|trip|attempt))\b/i.test(message);
export const isMemoryQuestion = message => /^\s*(?:(?:please|can you|could you)\s+)?(?:what (?:do you|have you) (?:remember|saved|recorded)|what(?:'s| is) (?:saved|in (?:my |the )?(?:memory|library))|show (?:me )?(?:my |the )?(?:memory|library|history|saved|recorded)|review (?:my |the )?(?:memory|history|library)|what worked|what (?:didn't|did not) work|previous results)\b/i.test(message);
export function feedbackAnswer(results) {
  const saved = results.filter(item => item.state === 'Saved');
  const pending = results.filter(item => item.state !== 'Saved');
  const lines = saved.map(item => `${item.changed ? 'Saved' : 'Already saved'}: ${item.service_name} — ${item.delivery}${item.reason !== 'None' ? ' · ' + item.reason : ''}${item.satisfaction ? ' · ' + item.satisfaction + '/5 satisfaction' : ''}${item.satisfaction_sentiment && item.satisfaction_sentiment !== 'Unspecified' ? ' · ' + item.satisfaction_sentiment.toLowerCase() + ' feedback' : ''}.`);
  for (const item of pending) lines.push(`Kept in the library as needs detail: ${item.service_name}${item.delivery ? ' · ' + item.delivery : ''}. Missing: ${item.missing.join(', ')}.`);
  if (saved.length) lines.push('These provider results are in your local memory library and will be used in future matching. Updating the same attempt does not count it twice.');
  if (pending.length) {
    const missing = new Set(pending.flatMap(item => item.missing));
    lines.push(missing.has('Provider') ? 'Which exact provider or program was this? Name it, or add it in Find services if it is new.' : missing.has('Area') ? 'Which community was this service attempt for?' : missing.has('Delivery result') ? 'Was the service actually received, still pending, declined, or not received?' : 'Please clarify the service type, or start a new request for a different attempt.');
  }
  return lines.join('\n\n');
}
