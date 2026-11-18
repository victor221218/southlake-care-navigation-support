import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { openDatabase } from '../src/database.mjs';
import { catalog } from '../src/core/catalog.mjs';
import { Assistant, Memory, readResponse } from '../src/assistant.mjs';
import { responseText } from '../src/responses.mjs';
import { guidePlan } from '../src/local-guide.mjs';

await mkdir('.runtime/tests', { recursive: true });
async function fixture(fetcher = async () => { throw new Error('An immediate directory answer must not require AI.'); }, connected = false) {
  const folder = await mkdtemp(path.resolve('.runtime/tests/answers-'));
  const db = await openDatabase({ filename: path.join(folder, 'hive.sqlite'), wasm: path.resolve('node_modules/sql.js/dist/sql-wasm.wasm'), migrations: path.resolve('drizzle'), catalog });
  const events = [], memory = new Memory({ database: () => db, owner: () => 'fresh-tester', emit: value => events.push(value) });
  const connection = { session: async () => ({ sharing: connected }), accessToken: async () => 'test-token' };
  const assistant = new Assistant({ connection, memory, fetcher, emit: event => events.push(event) }); assistant.model = 'account-model';
  return { assistant, memory, events, close: () => db.close() };
}
const example = 'Recommend transportation in Georgina for an adult aged 40–64 using a walker. Use my past experience.';
const stream = events => new Response(events.map(event => 'data: ' + JSON.stringify(event) + '\n\n').join(''));
const terminal = output => ({ type: 'response.completed', response: { status: 'completed', output } });

test('the exact first-use screenshot request returns real options without history, sign-in or an AI request', async () => {
  const f = await fixture();
  const answer = await f.assistant.chat(example);
  assert.equal(answer.source, 'directory'); assert.match(answer.text, /Routes Connecting Communities/); assert.match(answer.text, /CHATS/);
  assert.match(answer.text, /905-722-4616/); assert.match(answer.text, /https:\/\//); assert.match(answer.text, /no comparable completed outcomes/);
  assert.ok(!answer.text.includes('completed without a text answer'));
  assert.equal((await f.memory.read('list_memory')).active_outcome_count, 0);
  assert.equal(f.memory.latest.context.age_band, '40–64'); assert.equal(f.memory.latest.context.mobility, 'Walker');
  assert.ok(f.events.some(event => event.type === 'recommendations'));
  f.close();
});

test('the initial answer changes after confirmed history, without invented success rates', async () => {
  const f = await fixture(); await f.assistant.chat(example);
  await f.memory.propose('record_outcome', { service_id: 'yrt-paratransit', category: 'Transportation', region: 'Georgina', age_band: '40–64', mobility: 'Walker', language: 'Unspecified', timing: 'Flexible', delivery: 'Received', reason: 'None', satisfaction: 5 });
  await f.assistant.chat('Confirm save');
  const answer = await f.assistant.chat(example);
  assert.match(answer.text, /1\/1 received/); assert.match(answer.text, /5\/5 from 1 rating/); assert.match(answer.text, /recorded completed attempts/);
  assert.equal(f.memory.latest.items[0].service.id, 'yrt-paratransit'); f.close();
});

test('missing and ambiguous needs receive a focused clarification and preserve a short follow-up', async () => {
  const f = await fixture();
  assert.match((await f.assistant.chat('Find transportation')).text, /Which community/);
  const answer = await f.assistant.chat('Georgina'); assert.equal(answer.source, 'directory');
  assert.equal(f.memory.latest.context.region, 'Georgina');
  await f.assistant.chat('What about wheelchair access?'); assert.equal(f.memory.latest.context.mobility, 'Wheelchair');
  f.assistant.clearConversation(); assert.deepEqual(f.assistant.guideState, {});
  assert.match((await f.assistant.chat('Find transportation in Georgina to Newmarket')).text, /pickup area/);
  assert.equal(guidePlan('Find transportation in Georgina for someone 65+').context.age_band, '65+');
  assert.equal(guidePlan('Record feedback about transportation in Georgina').kind, 'ai');
  assert.equal(guidePlan('Use web search to find transportation in Georgina').kind, 'ai');
  assert.equal(guidePlan('Find transportation in Georgina using a walker, not a wheelchair').context.mobility, 'Walker');
  f.close();
});

test('streamed text survives an empty terminal snapshot, split CRLF and a missing final blank line', async () => {
  const payload = [
    { type: 'response.output_item.added', output_index: 0, item: { id: 'msg-1', type: 'message', role: 'assistant', content: [] } },
    { type: 'response.output_text.delta', output_index: 0, content_index: 0, item_id: 'msg-1', delta: 'Useful ' },
    { type: 'response.output_text.delta', output_index: 0, content_index: 0, item_id: 'msg-1', delta: 'answer.' }, terminal([])
  ].map(event => 'data: ' + JSON.stringify(event) + '\r\n\r\n').join('').trimEnd();
  const bytes = new TextEncoder().encode(payload);
  const response = new Response(new ReadableStream({ start(controller) { for (const byte of bytes) controller.enqueue(new Uint8Array([byte])); controller.close(); } }));
  const completed = await readResponse(response); assert.equal(responseText(completed), 'Useful answer.');
});

test('completed output-item and text-done events are retained without duplicating terminal messages', async () => {
  const message = { id: 'msg', type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Here are the options.' }] };
  const itemOnly = await readResponse(stream([{ type: 'response.output_item.done', output_index: 0, item: message }, terminal([])]));
  assert.equal(responseText(itemOnly), 'Here are the options.');
  const textOnly = await readResponse(stream([{ type: 'response.output_text.done', output_index: 0, content_index: 0, item_id: 'msg', text: 'Final answer.' }, terminal([])]));
  assert.equal(responseText(textOnly), 'Final answer.');
  const duplicate = await readResponse(stream([{ type: 'response.output_item.done', output_index: 0, item: message }, terminal([message])]));
  assert.equal(duplicate.output.length, 1);
});

test('streamed function arguments execute the local tool even when terminal output is sparse', async () => {
  let calls = 0;
  const f = await fixture(async () => {
    calls++;
    if (calls > 1) return stream([{ type: 'response.output_text.done', output_index: 0, content_index: 0, item_id: 'reply', text: 'The program details are ready.' }, terminal([])]);
    return stream([
      { type: 'response.output_item.added', output_index: 0, item: { type: 'function_call', id: 'fc', call_id: 'call', name: 'hive.get_service_details', arguments: '' } },
      { type: 'response.function_call_arguments.delta', output_index: 0, item_id: 'fc', delta: '{"service_id":' },
      { type: 'response.function_call_arguments.done', output_index: 0, item_id: 'fc', arguments: '{"service_id":"routes-rides"}' }, terminal([])
    ]);
  }, true);
  const answer = await f.assistant.chat('Use web search to verify the Routes page.');
  assert.equal(answer.source, 'ai'); assert.equal(answer.text, 'The program details are ready.'); assert.equal(calls, 2);
  f.close();
});

test('an AI-only empty answer is retried once and becomes actionable guidance rather than blank success', async () => {
  let calls = 0;
  const f = await fixture(async (_, options) => { calls++; if (calls === 2) assert.equal(JSON.parse(options.body).tool_choice, 'none'); return stream([terminal([])]); }, true);
  const answer = await f.assistant.chat('Explain how this works in more detail.');
  assert.equal(calls, 2); assert.match(answer.text, /no usable text/); assert.match(answer.text, /Tell me the service/);
  assert.ok(!answer.text.includes('completed without a text answer')); f.close();
});

test('tool results still produce provider contacts if the final AI explanation stays empty', async () => {
  let count = 0;
  const f = await fixture(async () => ++count === 1 ? stream([terminal([{ type: 'function_call', name: 'hive.recommend_services', call_id: 'lookup', arguments: JSON.stringify({ category: 'Transportation', region: 'Georgina', mobility: 'Walker' }) }])]) : stream([terminal([])]), true);
  const answer = await f.assistant.chat('Use web search to compare transportation in Georgina.');
  assert.equal(answer.source, 'directory-fallback'); assert.match(answer.text, /saved directory matches/); assert.match(answer.text, /905-722-4616/); f.close();
});

test('partial or failed streams never become a completed AI answer', async () => {
  await assert.rejects(readResponse(stream([{ type: 'response.output_text.delta', output_index: 0, delta: 'partial' }])), /completion/);
  await assert.rejects(readResponse(stream([{ type: 'response.output_text.done', text: 'partial' }, { type: 'response.failed', response: { error: { code: 'subscription_sharing_usage_limit_exceeded' } } }])), /usage limit/);
});
