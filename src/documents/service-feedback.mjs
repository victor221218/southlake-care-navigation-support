import {explicitServiceOutcome} from './navigation-templates.mjs';

const spokenScores = {one:1,two:2,three:3,four:4,five:5};
const statement = /^(?:i|we)\s+/i;
const negativeExperience = /\b(?:i|we)\s+(?:did not|didn't)\s+(?:enjoy|like)\b|\b(?:i|we)\s+had a (?:bad|poor|negative) experience\b/i;
const positiveExperience = /\b(?:i|we)\s+(?:enjoyed|liked)\s+(?:using|trying|working with|it\b|them\b|(?:this|that|the) service\b)|\b(?:i|we)\s+had a (?:good|positive|great) experience\b/i;
const standaloneScore = /^(?:[+-]?\d+(?:\.\d+)?|one|two|three|four|five)\s*(?:\/\s*5\b|out of (?:5|five)\b)/i;
const scoreStatement = /^(?:(?:my\s+)?(?:rating|score)\b|(?:i|we)(?:'d\s+|\s+(?:would\s+)?)(?:rate|rated|give|gave)\b|(?:rate|give)\b)/i;

export function serviceFeedbackFromMessage(value) {
  const text = value.trim().replace(/[‘’]/g,"'");
  if (text.includes('?') || /^(?:if|whether|could|can|how|should|would)\b/i.test(text)) return null;
  const ratings = [...text.matchAll(/(?<![\w.+-])([+-]?\d+(?:\.\d+)?)\s*(?:\/\s*5\b|out of (?:5|five)\b)|\b(one|two|three|four|five)\s+out of (?:five|5)\b/gi)]
    .map(match=>match[1] ? Number(match[1]) : spokenScores[match[2].toLowerCase()]);
  let outcome=explicitServiceOutcome(text);
  if (!outcome && statement.test(text) && !/\b(?:if|might|maybe|not sure|hypothetically)\b/i.test(text)) {
    const negative=negativeExperience.test(text), positive=positiveExperience.test(text);
    if (negative!==positive) outcome=negative?'not_worked':'worked';
  }
  if (!outcome && (!ratings.length || !(standaloneScore.test(text)||scoreStatement.test(text)) || /\b(?:if|might|maybe)\b/i.test(text))) return null;
  return {outcome, rating:ratings[0]??null,
    invalidRating:ratings.some(score=>!Number.isInteger(score)||score<1||score>5)||new Set(ratings).size>1};
}

export function refersToServiceInCase(value, ratingOnly=false) {
  const text=value.trim().replace(/[‘’]/g,"'");
  return /^(?:(?:please\s+)?(?:record|log|mark)\s+(?:that\s+)?|(?:i|we)\s+tried\s+)?(?:it|they|this service|that service|worked|didn't work|did not work)\b/i.test(text) ||
    /\b(?:using|trying|with|enjoy|enjoyed|like|liked)\s+(?:it|them|(?:this|that|the)\s+(?:service|program))\s*(?=[.,!?]|$|because\b|since\b)/i.test(text) ||
    (ratingOnly && (standaloneScore.test(text) ||
      /^(?:(?:my\s+)?(?:rating|score)\s*[:=]?\s*(?:is\s+)?(?:[+-]?\d|one\b|two\b|three\b|four\b|five\b)|(?:i(?:'d\s+|\s+(?:would\s+)?))?(?:rate|rated|give|gave)\s+(?:it|them|this service|that service)\s)/i.test(text)));
}
