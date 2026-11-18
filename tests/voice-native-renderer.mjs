// Packaged Electron smoke test. No user interaction, sign-in, or microphone.
import { Voice } from '../ui/voice.mjs';
const results = [];
let context;
async function run() {
  try {
    context = new AudioContext();
    const response = await fetch(new URL('voice/voice-check.wav', document.baseURI));
    if (!response.ok) throw new Error('The packaged voice sample could not be read.');
    const audio = await context.decodeAudioData(await response.arrayBuffer());
    for (const pass of ['cold', 'warm']) {
      const stages = [];
      const voice = new Voice({ status: message => stages.push(message), transcript() {} });
      try {
        const heard = await voice.transcribeSamples(audio.getChannelData(0), audio.sampleRate);
        if (!/find home support in aurora/i.test(heard)) throw new Error('Unexpected recognition: ' + heard);
        results.push({ pass, heard, stages });
      } finally { voice.model?.terminate(); voice.model?.worker?.terminate(); }
    }
    window.hive.finish({ ok: true, results, microphone_opened: false });
  } catch (error) { window.hive.finish({ ok: false, error: String(error?.message || error), results, microphone_opened: false }); }
  finally { await context?.close(); }
}
run();
