export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
export function linkedMessage(text) {
  return String(text).split(/(https:\/\/[^\s<>"']+)/gu).map(part => {
    if (!part.startsWith('https://')) return escapeHTML(part);
    const url = part.replace(/[.,;!?)\]]+$/u, '');
    const tail = part.slice(url.length);
    try {
      if (new URL(url).protocol !== 'https:') return escapeHTML(part);
      return `<button class="text-link" data-action="source" data-url="${escapeHTML(url)}">Provider source ↗</button>${escapeHTML(tail)}`;
    } catch { return escapeHTML(part); }
  }).join('').replaceAll('\n', '<br>');
}
