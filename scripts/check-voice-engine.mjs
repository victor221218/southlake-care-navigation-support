// Exercise the real bundled WASM engine and model without accessing a microphone,
// a user account, or a desktop UI. Browser permissions and CSP are separate checks.
import vm from 'node:vm';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { voiceAssets } from './voice-assets.mjs';

async function run() {
const { worker } = voiceAssets(await readFile('node_modules/vosk-browser/dist/vosk.js', 'utf8'));
assert.ok(worker.includes('new RecognizerWorker();'));
const source = worker.replace('new RecognizerWorker();', 'globalThis.engineFactory = LoadVosk;');
const archiveBytes = await readFile(process.argv[2] || 'assets/english-model.tar.gz');
const assetURL = 'hive://app/voice/english-model.tar.gz';
const context = vm.createContext({
  self: { addEventListener() {}, postMessage() {} }, location: { href: 'https://hive.invalid/voice-worker.js' },
  importScripts() {}, console, URL, fetch: (url, options) => String(url) === assetURL ? Promise.resolve(new Response(archiveBytes, { headers: { 'Content-Type': 'application/gzip', 'Content-Length': String(archiveBytes.length) } })) : fetch(url, options), atob, btoa, setTimeout, clearTimeout,
  performance, TextDecoder, TextEncoder, WebAssembly, Uint8Array, Float32Array, ArrayBuffer, crypto: globalThis.crypto,
  addEventListener() {}, postMessage() {}
}, { codeGeneration: { strings: true, wasm: true } });
vm.runInContext('globalThis.self=globalThis;', context);
vm.runInContext(source, context, { timeout: 15000 });
console.log('Loading the bundled speech engine.');
let timer;
const engine = await Promise.race([vm.runInContext('engineFactory({print:()=>{},printErr:()=>{}})', context), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Speech engine initialization timed out.')), 30000); })]).finally(() => clearTimeout(timer));
engine.SetLogLevel(-2);
console.log('Downloading and extracting the bundled archive using the real browser loader.');
await engine.downloadAndExtract(assetURL, '/voice-model');
const model = new engine.Model('/voice-model');
const wav = await readFile('assets/voice-check.wav');
assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
let rate, channels, bits, pcm;
for (let offset = 12; offset + 8 <= wav.length;) {
  const id = wav.toString('ascii', offset, offset + 4), size = wav.readUInt32LE(offset + 4), data = offset + 8;
  if (id === 'fmt ') { assert.equal(wav.readUInt16LE(data), 1); channels = wav.readUInt16LE(data + 2); rate = wav.readUInt32LE(data + 4); bits = wav.readUInt16LE(data + 14); }
  if (id === 'data') pcm = wav.subarray(data, data + size);
  offset = data + size + size % 2;
}
assert.equal(channels, 1); assert.equal(bits, 16); assert.ok(pcm);
const recognizer = new engine.Recognizer(model, rate);
const size = pcm.length / 2;
const pointer = engine._malloc(size * 4);
const floats = new Float32Array(size);
for (let index = 0; index < size; index++) floats[index] = pcm.readInt16LE(index * 2);
engine.HEAPF32.set(floats, pointer / 4);
const completed = recognizer.AcceptWaveform(pointer, size);
const pieces = completed ? [JSON.parse(recognizer.Result()).text] : [];
pieces.push(JSON.parse(recognizer.FinalResult()).text);
const heard = pieces.filter(Boolean).join(' ');
assert.match(heard, /find home support in aurora/i);
engine._free(pointer); recognizer.delete(); model.delete();
const report = { engine: 'Real bundled Vosk WebAssembly', archive_loader_checked: true, sample_rate: rate, heard, microphone_opened: false, browser_runtime_checked: false };
await mkdir('.runtime', { recursive: true });
await writeFile('.runtime/voice-engine-check.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
}
run().catch(error => { console.error(String(error).slice(0, 1000)); process.exitCode = 1; });
