export const INVENTORY_TEMPLATE = 'service-inventory';
export const TRACKING_TEMPLATE = 'navigation-tracker';
export const headerKey = value => String(value ?? '').normalize('NFKC').toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export function navigationTemplate(columns) {
  const keys = new Set(columns.map(headerKey));
  if (keys.has('partner organization') && keys.has('program clinic') && keys.has('service type')) {
    return INVENTORY_TEMPLATE;
  }
  if (keys.has('date of inquiry') && keys.has('partner agency') && keys.has('outcome next steps')) {
    return TRACKING_TEMPLATE;
  }
  return '';
}

const failure = /\b(?:did not work|didn't work|didnt work|never worked|not worked|unsuccessful|not successful|service failed)\b/gi;
const success = /\b(?:worked|successful|service received)\b/i;

export function explicitServiceOutcome(value) {
  const text = String(value ?? '').trim().replace(/[‘’]/g, "'");
  if (!text || /\?|^(?:if|whether|hopefully|try|could|would|can|will|did(?! not work)|does|has|have|was|were|is|what|why|how|show|find|remember|save a note)\b/i.test(text) ||
      /\b(?:not yet|waiting for|too soon to|might (?:have|not)|would have)\b/i.test(text)) return null;
  const remaining = text.replace(failure, '');
  const didNotWork = remaining !== text;
  const didWork = success.test(remaining);
  if (didNotWork === didWork) return null;
  return didNotWork ? 'not_worked' : 'worked';
}

export function trackingRow(fields, locator) {
  const values = new Map(Object.entries(fields).map(([label, value]) => [headerKey(label), value]));
  const provider = String(values.get('partner agency') ?? '').trim().slice(0, 180);
  if (!provider) return null;
  const inquiry = String(values.get('date of inquiry') ?? '').slice(0, 10);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(inquiry) ? inquiry : '';
  return {provider, date, locator, outcome:explicitServiceOutcome(values.get('outcome next steps'))};
}
