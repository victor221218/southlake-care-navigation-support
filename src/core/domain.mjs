import { enums } from './catalog.mjs';

export class InputError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export function ensure(condition, message, status) {
  if (!condition) throw new InputError(message, status);
}

export function pickEnum(value, options, field) {
  ensure(options.includes(value), 'Choose a supported ' + field + '.');
  return value;
}

export function cleanContext(input = {}) {
  const context = {
    category: input.category || 'Transportation', region: input.region || 'Georgina', age_band: input.age_band || 'Unspecified',
    mobility: input.mobility || 'Unspecified', language: input.language || 'Unspecified', timing: input.timing || 'Flexible'
  };
  for (const [key, value] of Object.entries(context)) {
    const options = {
      category: enums.categories, region: enums.regions, age_band: enums.age_bands,
      mobility: enums.mobility, language: enums.languages, timing: enums.timing
    }[key];
    pickEnum(value, options, key.replaceAll('_', ' '));
  }
  return context;
}

export function validateKeys(input, allowed) {
  ensure(input && typeof input === 'object' && !Array.isArray(input), 'Provide an object of tool arguments.');
  ensure(Object.keys(input).every(key => allowed.includes(key)), 'Use the structured service fields. Remove patient identifiers and unsupported fields.');
}

function wilson(successes, total) {
  if (!total) return null;
  const z = 1.96;
  const p = successes / total;
  const divisor = 1 + z * z / total;
  const centre = (p + z * z / (2 * total)) / divisor;
  const margin = z * Math.sqrt(p * (1 - p) / total + z * z / (4 * total * total)) / divisor;
  return [Math.max(0, Math.round((centre - margin) * 100)), Math.min(100, Math.round((centre + margin) * 100))];
}

export function evidence(rows, now = new Date()) {
  const all = rows.filter(row => !row.deleted_at);
  const completed = all.filter(row => ['Received', 'Not received'].includes(row.delivery));
  const received = completed.filter(row => row.delivery === 'Received');
  const ratings = received.filter(row => Number.isInteger(row.satisfaction) && row.satisfaction >= 1 && row.satisfaction <= 5);
  const sentiments = received.filter(row => ['Happy', 'Unhappy', 'Mixed'].includes(row.satisfaction_sentiment));
  let weightTotal = 0;
  let deliveredWeight = 0;
  let ratingWeight = 0;
  let ratingTotal = 0;
  for (const row of completed) {
    const ageDays = Math.max(0, (now.getTime() - Date.parse(row.occurred_on + 'T12:00:00Z')) / 86400000);
    const weight = Math.pow(0.5, ageDays / 180);
    weightTotal += weight;
    if (row.delivery === 'Received') deliveredWeight += weight;
    if (row.delivery === 'Received' && Number.isInteger(row.satisfaction)) {
      ratingWeight += weight;
      ratingTotal += weight * (row.satisfaction - 1) / 4;
    } else if (row.delivery === 'Received' && ['Happy', 'Unhappy', 'Mixed'].includes(row.satisfaction_sentiment)) {
      ratingWeight += weight;
      ratingTotal += weight * ({ Happy: 1, Mixed: 0.5, Unhappy: 0 }[row.satisfaction_sentiment]);
    }
  }
  const average = ratings.length ? ratings.reduce((sum, row) => sum + row.satisfaction, 0) / ratings.length : null;
  return {
    attempts: all.length, completed: completed.length, received: received.length, failed: completed.length - received.length,
    pending: all.filter(row => row.delivery === 'Pending').length, declined: all.filter(row => row.delivery === 'Declined').length,
    delivery_rate: completed.length ? Math.round(received.length / completed.length * 100) : null,
    delivery_interval: wilson(received.length, completed.length),
    satisfaction: average === null ? null : Math.round(average * 10) / 10, satisfaction_count: ratings.length,
    sentiment_count: sentiments.length, happy_count: sentiments.filter(row => row.satisfaction_sentiment === 'Happy').length,
    unhappy_count: sentiments.filter(row => row.satisfaction_sentiment === 'Unhappy').length,
    confidence: completed.length >= 30 ? 'More history' : completed.length >= 5 ? 'Some history' : 'Limited history',
    delivery_component: (deliveredWeight + 2) / (weightTotal + 4),
    satisfaction_component: (ratingTotal + 2) / (ratingWeight + 4)
  };
}

export function comparable(row, context) {
  return row.region === context.region &&
    (context.mobility === 'Unspecified' || row.mobility === context.mobility) &&
    (context.age_band === 'Unspecified' || row.age_band === context.age_band);
}

export function recommend(services, rows, observations, contextInput, goal = 'Balanced', now = new Date()) {
  const context = cleanContext(contextInput);
  pickEnum(goal, enums.goals, 'ranking goal');
  const weights = { Balanced: [0.65, 0.25, 0.10], 'Service delivery': [0.55, 0.35, 0.10], 'Patient satisfaction': [0.55, 0.15, 0.30] }[goal];
  const items = [];
  const excluded = [];
  for (const service of services.filter(item => item.category === context.category)) {
    const reasons = [];
    const checks = [];
    const disqualifications = [];
    let fit = 0;
    if (service.coverage.includes(context.region)) {
      fit += 0.35;
      reasons.push('Listed service coverage includes ' + context.region + '.');
    } else disqualifications.push('The listed coverage does not include ' + context.region + '.');

    const ageLimits = { 'Under 18': [0, 17], '18–39': [18, 39], '40–64': [40, 64], '65+': [65, 120] };
    const age = ageLimits[context.age_band];
    if (service.minimum_age && age && age[1] < service.minimum_age) disqualifications.push('The published minimum age is ' + service.minimum_age + '.');
    else if (service.minimum_age && age && age[0] >= service.minimum_age) fit += 0.15;
    else { fit += 0.075; checks.push('Confirm age and program-specific eligibility with intake.'); }
    if (service.maximum_age !== null && service.maximum_age !== undefined && age) {
      if (age[0] > service.maximum_age) disqualifications.push('The listed maximum age is ' + service.maximum_age + '.');
      else if (age[1] > service.maximum_age) checks.push('Part of this age band exceeds the listed maximum age of ' + service.maximum_age + '; confirm exact eligibility with the provider.');
    }
    if (service.coverage_note) checks.push(service.coverage_note);

    const recent = observations.filter(row => row.service_id === service.id && !row.deleted_at &&
      Date.parse(row.observed_on + 'T12:00:00Z') >= now.getTime() - 90 * 86400000)
      .sort((a, b) => b.observed_on.localeCompare(a.observed_on) || b.created_at.localeCompare(a.created_at));
    const mobilityFact = recent.find(row => row.attribute === 'Wheelchair access');
    const wheelchair = mobilityFact && mobilityFact.value !== 'Unknown' ? mobilityFact.value : service.wheelchair;
    if (context.mobility === 'Wheelchair' && service.wheelchair_excluded_regions?.includes(context.region)) {
      disqualifications.push('The provider source excludes wheelchair transport in this region.');
    } else if (context.mobility === 'Wheelchair' && wheelchair === 'Unavailable') disqualifications.push('The recorded wheelchair requirement is unsupported.');
    else if (context.mobility === 'Lifting assistance' && service.lifting === false) disqualifications.push('The service cannot provide lifting assistance.');
    else if (context.mobility === 'Lifting assistance' && service.lifting !== true) { fit += 0.10; checks.push('Confirm that trained lifting assistance can be provided.'); }
    else if (context.mobility === 'Unspecified' || wheelchair === 'Unknown') {
      fit += 0.10;
      checks.push('Confirm the mobility assistance required and available.');
    } else {
      fit += 0.20;
      reasons.push(context.mobility === 'Wheelchair' ? 'Wheelchair access is listed.' : 'No recorded mobility restriction conflicts with this need.');
    }
    if (context.timing === 'Within 2 days' && service.lead_days >= 3) {
      disqualifications.push('The stated lead time is at least three business days, beyond the requested two-day window.');
    } else if (context.timing === 'Evenings or weekends' && service.hours === 'Weekday daytime') {
      disqualifications.push('Published operating hours are on weekdays, outside the requested evening or weekend window.');
    } else fit += context.timing === 'Flexible' ? 0.15 : 0.075;
    if (context.language === 'Unspecified' || service.languages.includes(context.language) || service.languages.includes('Interpretation available')) fit += 0.15;
    else { fit += 0.075; checks.push('Confirm support for ' + context.language + '.'); }

    const availability = recent.find(row => row.attribute === 'Availability');
    if (availability && ['At capacity', 'Waitlist'].includes(availability.value)) {
      checks.push('Personal observation on ' + availability.observed_on + ' recorded ' + availability.value.toLowerCase() + '.');
      fit = Math.max(0, fit - 0.15);
    } else if (['At capacity', 'Waitlist'].includes(service.availability)) {
      checks.push('The directory entry notes ' + service.availability.toLowerCase() + (service.source_checked ? ' as reviewed on ' + service.source_checked : ' without a review date') + '. Confirm current capacity.');
      if (service.source_checked && Date.parse(service.source_checked + 'T12:00:00Z') >= now.getTime() - 90 * 86400000) fit = Math.max(0, fit - 0.15);
    }
    if (disqualifications.length) { excluded.push({ service_id: service.id, name: service.name, reasons: disqualifications }); continue; }
    const ownRows = rows.filter(row => row.service_id === service.id && !row.deleted_at);
    const matched = ownRows.filter(row => comparable(row, context));
    const stats = evidence(matched, now);
    const overall = evidence(ownRows, now);
    const score = Math.round(100 * (weights[0] * fit + weights[1] * stats.delivery_component + weights[2] * stats.satisfaction_component));
    items.push({
      service, fit_score: score, reasons, checks, evidence: stats, overall,
      score_description: 'A ranking score combining access fit and recorded experience.',
      history_label: stats.completed ? stats.completed + ' comparable completed attempts' : 'No comparable completed outcomes',
      shared_used: matched.filter(row => row.shared_contribution).length
    });
  }
  items.sort((a, b) => b.fit_score - a.fit_score || a.service.name.localeCompare(b.service.name));
  return { context, goal, items, excluded, methodology: {
    version: '1.0', weights: { fit: weights[0], delivery: weights[1], satisfaction: weights[2] },
    denominator: 'Received plus Not received. Pending and Declined are excluded.',
    satisfaction: 'Explicit 1–5 ratings from received services. For an unrated received service, explicit Happy/Unhappy/Mixed feedback influences ranking without creating a numeric rating. Missing feedback stays unknown.',
    recency: 'Historical weight halves every 180 days. A neutral Beta(2,2) prior limits small-sample extremes.',
    comparison: 'Same municipal area, with age band and mobility matched when specified.',
    interpretation: 'Fit scores rank access options. Delivery percentages describe recorded attempts.'
  } };
}
