import { catalog } from '../src/core/catalog.mjs';
import { writeFile } from 'node:fs/promises';
const urls = [...new Set(catalog.flatMap(service => [service.source_url, service.referral_url, service.booking_url]).filter(Boolean))];
const rows = [];
let index = 0;
async function worker() {
  while (index < urls.length) {
    const url = urls[index++];
    try {
      let response = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(18000) });
      if (response.status === 405 || response.status === 501) {
        await response.body?.cancel();
        response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(18000) });
      }
      rows.push({ url, status: response.status, final_url: response.url });
      await response.body?.cancel();
    } catch (error) { rows.push({ url, status: 'unverified', reason: error.name }); }
  }
}
await Promise.all(Array.from({ length: 4 }, worker));
await writeFile('.runtime/provider-link-check.json', JSON.stringify(rows, null, 2));
console.log(JSON.stringify({ checked: rows.length, successful: rows.filter(row => typeof row.status === 'number' && row.status < 400).length, needs_review: rows.filter(row => typeof row.status !== 'number' || row.status >= 400) }));
