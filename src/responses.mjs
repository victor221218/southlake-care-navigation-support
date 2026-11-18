import { connectionError } from './auth.mjs';

export const responseText = response => (response.output || []).filter(item => item.type === 'message' && item.role !== 'user' && item.channel !== 'analysis')
  .flatMap(item => item.content || []).map(part => part.type === 'output_text' ? part.text || '' : part.type === 'refusal' ? part.refusal || '' : '').filter(Boolean).join('\n');

// A completed event confirms success; text and function items are assembled from
// their lifecycle events as well as the terminal snapshot. Never discard an
// answer just because the terminal snapshot omits already streamed content.
export async function readResponse(response, onDelta = () => {}, signal) {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw connectionError(body.error?.code || (response.status === 403 ? 'permission_denied' : 'connection_failed'), response.headers.get('x-request-id'));
  }
  if (!response.body) throw connectionError('invalid_stream');
  let buffer = '', data = [], eventName = '', final = null, bytes = 0, textSize = 0;
  const items = new Map(), parts = new Map(), argumentsByIndex = new Map(), completedArguments = new Set();
  const eventCounts = {};
  const indexFor = event => Number.isInteger(event.output_index) ? event.output_index : [...items].find(([, item]) => item.id === event.item_id)?.[0] ?? 0;
  const putItem = (index, value) => {
    if (!value || typeof value !== 'object') return;
    const previous = items.get(index) || {};
    items.set(index, { ...previous, ...value, content: value.content?.length ? value.content : previous.content || value.content });
  };
  const putPart = (event, part) => {
    const index = indexFor(event), contentIndex = event.content_index ?? 0;
    if (!parts.has(index)) parts.set(index, new Map());
    parts.get(index).set(contentIndex, part);
    if (!items.has(index)) putItem(index, { type: 'message', role: 'assistant', ...(event.item_id ? { id: event.item_id } : {}), content: [] });
  };
  function dispatch() {
    if (!data.length) { eventName = ''; return; }
    const value = data.join('\n'); data = [];
    if (value === '[DONE]') { eventName = ''; return; }
    let event;
    try { event = JSON.parse(value); } catch { throw connectionError('invalid_stream'); }
    const type = event.type || eventName; eventName = '';
    eventCounts[type] = (eventCounts[type] || 0) + 1;
    const index = indexFor(event);
    if (type === 'error' || type === 'response.failed') throw connectionError(event.error?.code || event.response?.error?.code || 'connection_failed');
    if (type === 'response.incomplete' || type === 'response.cancelled') throw connectionError('invalid_stream');
    if (type === 'response.output_item.added' || type === 'response.output_item.done') putItem(index, event.item);
    if (type === 'response.output_text.delta' || type === 'response.refusal.delta') {
      const delta = typeof event.delta === 'string' ? event.delta : '';
      textSize += delta.length;
      if (textSize > 500000) throw new Error('The response was too long. Please narrow the request.');
      const prior = parts.get(index)?.get(event.content_index ?? 0);
      if (type === 'response.output_text.delta') { putPart(event, { type: 'output_text', text: (prior?.text || '') + delta }); onDelta(delta); }
      else putPart(event, { type: 'refusal', refusal: (prior?.refusal || '') + delta });
    }
    if (type === 'response.output_text.done') putPart(event, { type: 'output_text', text: event.text || '' });
    if (type === 'response.refusal.done') putPart(event, { type: 'refusal', refusal: event.refusal || '' });
    if (type === 'response.content_part.done' && ['output_text', 'refusal'].includes(event.part?.type)) putPart(event, event.part);
    if (type === 'response.function_call_arguments.delta') argumentsByIndex.set(index, (argumentsByIndex.get(index) || '') + (event.delta || ''));
    if (type === 'response.function_call_arguments.done') { argumentsByIndex.set(index, event.arguments || argumentsByIndex.get(index) || ''); completedArguments.add(index); }
    if (type === 'response.completed') final = event.response;
  }
  function line(value) {
    if (!value) return dispatch();
    if (value.startsWith('data:')) data.push(value.slice(5).replace(/^ /, ''));
    else if (value.startsWith('event:')) eventName = value.slice(6).trim();
  }
  function drain(done = false) {
    let match;
    while ((match = /\r\n|\r|\n/.exec(buffer))) {
      if (!done && match[0] === '\r' && match.index === buffer.length - 1) break;
      const value = buffer.slice(0, match.index); buffer = buffer.slice(match.index + match[0].length); line(value);
    }
    if (done) { if (buffer) { line(buffer); buffer = ''; } dispatch(); }
  }
  const reader = response.body.getReader(), decoder = new TextDecoder();
  try {
    while (true) {
      signal?.throwIfAborted();
      const chunk = await reader.read();
      bytes += chunk.value?.byteLength || 0;
      if (bytes > 16000000) throw new Error('The response was too large. Please narrow the request.');
      buffer += decoder.decode(chunk.value || new Uint8Array(), { stream: !chunk.done });
      drain(chunk.done);
      if (chunk.done) break;
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  if (!final || final.status && final.status !== 'completed') throw connectionError('invalid_stream');
  if (final.error) throw connectionError(final.error.code || 'connection_failed');
  for (const [index, item] of (final.output || []).entries()) {
    const existing = [...items].find(([, value]) => item.id && value.id === item.id || item.call_id && value.call_id === item.call_id)?.[0];
    putItem(existing ?? index, item);
  }
  for (const [index, values] of parts) {
    const item = items.get(index);
    if (item?.type !== 'message') continue;
    const content = [...(item.content || [])];
    for (const [contentIndex, part] of values) if (!content[contentIndex]?.text && !content[contentIndex]?.refusal) content[contentIndex] = part;
    item.content = content.filter(Boolean);
  }
  for (const [index, args] of argumentsByIndex) {
    const item = items.get(index);
    if (item?.type === 'function_call' && (completedArguments.has(index) || !item.arguments)) item.arguments = args;
  }
  const output = [...items].sort(([a], [b]) => a - b).map(([, item]) => item);
  if (!output.length && typeof final.output_text === 'string' && final.output_text.trim()) output.push({ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: final.output_text }] });
  return { ...final, output, hive_diagnostics: { event_counts: eventCounts, output_types: output.map(item => item.type), text_characters: responseText({ output }).length } };
}
