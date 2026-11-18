import { enums } from './catalog.mjs';
import { ensure, InputError, pickEnum } from './domain.mjs';

export function publicURL(value, optional = false) {
  if (optional && (value === undefined || value === '')) return '';
  ensure(typeof value === 'string' && value.length <= 400, 'Use a public service URL of at most 400 characters.');
  let url;
  try { url = new URL(value); } catch { throw new InputError('Use the provider’s public HTTPS page.'); }
  ensure(url.protocol === 'https:' && !url.username && !url.password && !url.port && url.hostname.includes('.') &&
    !/^[\d.]+$|^\[|\.(local|localhost|internal|test|invalid|example)$/i.test(url.hostname),
    'Use a public HTTPS provider page, without credentials or a local network address.');
  return url.href;
}
export function sourceDate(value) {
  if (value === undefined || value === null || value === '') return null;
  const date = new Date(String(value) + 'T12:00:00Z');
  ensure(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value && value >= '2020-01-01' && value <= new Date().toISOString().slice(0, 10),
    'Use a valid source review date from 2020 through today.');
  return value;
}
export function customService(input) {
  const text = (key, maximum, fallback = '') => {
    const value = input[key] === undefined ? fallback : input[key];
    ensure(typeof value === 'string' && value.trim().length <= maximum && !/[\u0000-\u0008\u000b-\u001f\u007f]/.test(value), `Use plain public service information for ${key.replaceAll('_', ' ')} (up to ${maximum} characters).`);
    return value.trim() || fallback;
  };
  const integer = (key, maximum) => {
    const value = input[key];
    if (value === undefined || value === null) return null;
    ensure(Number.isInteger(value) && value >= 0 && value <= maximum, `Use a whole number from 0 to ${maximum} for ${key.replaceAll('_', ' ')}.`);
    return value;
  };
  const name = text('name', 100);
  ensure(name.length >= 3, 'Enter the public organization or program name.');
  const category = pickEnum(input.category, enums.categories, 'service category');
  ensure(Array.isArray(input.coverage) && input.coverage.length > 0 && input.coverage.length <= enums.regions.length, 'Choose at least one service area.');
  const coverage = [...new Set(input.coverage.map(region => pickEnum(region, enums.regions, 'service area')))];
  const languages = input.languages || ['Confirm with provider'];
  ensure(Array.isArray(languages) && languages.length > 0 && languages.length <= 15 && languages.every(item => typeof item === 'string' && item.trim().length > 0 && item.length <= 50 && !/[\r\n<>]/.test(item)), 'Add up to 15 public service languages.');
  const minimum_age = integer('minimum_age', 120), maximum_age = integer('maximum_age', 120);
  ensure(minimum_age === null || maximum_age === null || minimum_age <= maximum_age, 'Minimum age must not exceed maximum age.');
  const email = text('email', 160);
  ensure(!email || /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email), 'Enter the public program email address, or leave it blank.');
  const lifting = input.lifting ?? null;
  ensure(lifting === null || typeof lifting === 'boolean', 'Choose whether lifting assistance is available or unknown.');
  const keywords = input.keywords || [];
  ensure(Array.isArray(keywords) && keywords.length <= 15 && keywords.every(word => typeof word === 'string' && word.length > 0 && word.length <= 60), 'Use up to 15 short service search keywords.');
  return {
    name, category, coverage, source_url: publicURL(input.source_url),
    summary: text('summary', 600, 'Locally added pathway. Confirm the public program details.'),
    access: text('access', 1000, 'Confirm eligibility and access requirements with the provider.'),
    coverage_note: text('coverage_note', 400), phone: text('phone', 80), email,
    address: text('address', 250), fees: text('fees', 300), referral: text('referral', 600),
    referral_url: publicURL(input.referral_url, true), booking_url: publicURL(input.booking_url, true),
    wheelchair: pickEnum(input.wheelchair || 'Unknown', ['Unknown', 'Available', 'Unavailable'], 'wheelchair access'),
    lifting, minimum_age, maximum_age, lead_days: integer('lead_days', 365),
    languages: [...new Set(languages.map(value => value.trim()))], keywords,
    hours: pickEnum(input.hours || 'Confirm with provider', ['Confirm with provider', 'Weekday daytime', 'Daily', '24/7'], 'service hours'),
    hours_details: text('hours_details', 300),
    availability: pickEnum(input.availability || 'Verify with provider', ['Verify with provider', 'Accepting inquiries', 'At capacity', 'Waitlist'], 'availability'),
    source_checked: sourceDate(input.source_checked), evidence_origin: 'Locally added · verify with provider'
  };
}
