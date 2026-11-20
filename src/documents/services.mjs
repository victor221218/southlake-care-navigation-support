import { createHash } from 'node:crypto';
import { catalog } from '../core/catalog.mjs';
import { PUBLIC_SERVICE_FORMAT as SERVICE_DIRECTORY_FORMAT } from './service-sources.mjs';

export { SERVICE_DIRECTORY_FORMAT };
// The previously researched public pathways, with targeted contact/source checks on 18 November.
const updates = {
  'chats-rides': { source_checked: '2026-11-18' },
  'chats-home-help': { source_checked: '2026-11-18' },
  'chats-personal-support': { source_checked: '2026-11-18' },
  'chats-caregiver-relief': { source_checked: '2026-11-18' },
  'chats-interpretation': { source_checked: '2026-11-18' },
  'chats-meals': { source_checked: '2026-11-18' },
  'yrt-paratransit': { source_checked: '2026-11-18' },
  'routes-rides': { source_checked: '2026-11-18' },
  'routes-food': { source_checked: '2026-11-18' },
  'routes-friendly': { source_url: 'https://www.routescc.org/services', source_checked: '2026-11-18', contact_name: 'Emily Leibovitch', email: 'emily@routescc.org' },
  'circle-iride': { source_checked: '2026-11-18' },
  'nysc-transport': { source_checked: '2026-11-18' },
  'betterliving-transport': { source_checked: '2026-11-18' },
  'betterliving-home': { source_checked: '2026-11-18' },
  'ttc-wheeltrans': { email: 'wteligibility@ttc.ca', source_checked: '2026-11-18' },
  'cmha-intake': { email: 'intake@cmha-yr.on.ca', source_checked: '2026-11-18' },
  'ohah-homecare': { source_url: 'https://www.ontariohealthathome.ca/making-a-referral/', source_checked: '2026-11-18' },
  'nyharvest-food': { source_checked: '2026-11-18' },
  'georgina-food': { source_checked: '2026-11-18' },
  'newmarket-food': { source_checked: '2026-11-18' },
  'accessalliance-language': { source_checked: '2026-11-18' },
  'oco-caregiver': { source_checked: '2026-11-18' },
  'alz-york-firstlink': { source_checked: '2026-11-18' },
  'yssn-access': { phone: '1-844-660-6602', source_checked: '2026-11-18' },
  'york-ontarioworks': { phone: '1-888-999-1142', source_checked: '2026-11-18' }
};
export const knownServices = catalog.map(service => ({ ...service, ...updates[service.id] }));
export const serviceCategories = [...new Set(knownServices.map(service => service.category))].sort();

export function serviceDirectoryDocument(services = knownServices) {
  const sections = services.map(service => {
    const fields = Object.fromEntries(Object.entries({
      Category: service.category,
      'Service area': service.coverage.join(' · '),
      ...(service.contact_name ? { 'Contact name': service.contact_name } : {}),
      Phone: service.phone || '', Email: service.email || '', Address: service.address || '',
      'How to access': service.access,
      'Coverage details': service.coverage_note || '',
      'Wheelchair access': service.wheelchair,
      Languages: service.languages?.join(' · '),
      Hours: service.hours_details || service.hours || '',
      Fees: service.fees || '',
      'Provider page': service.source_url,
      'Referral link': service.referral_url || '', 'Booking link': service.booking_url || '',
      'Source reviewed': service.source_checked,
      'Before referring': service.source_notice || 'Confirm eligibility, service boundaries, costs and current capacity with the provider.'
    }).filter(([, value]) => value));
    const body = service.summary + '\n\n' + Object.entries(fields).map(([key, value]) => key + ': ' + value).join('\n');
    return { key: service.id, title: service.name, body, fields, locator: 'Public provider directory · ' + service.category };
  });
  return { filename: 'Known services', format: SERVICE_DIRECTORY_FORMAT,
    digest: createHash('sha256').update(JSON.stringify(sections)).digest('hex'), stableKeys: true,
    warnings: ['Public service research is a starting directory, not live availability. Confirm current eligibility, coverage, fees and capacity with each provider. No success rates or user feedback are preloaded.'], sections };
}

export async function ensureKnownServices(store, document = serviceDirectoryDocument()) {
  const current = (await store.documents()).find(d => d.format === SERVICE_DIRECTORY_FORMAT && d.filename === document.filename);
  return store.import(document, { replaceId: current?.id || null });
}
