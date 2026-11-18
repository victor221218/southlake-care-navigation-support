import modelManifest from '../assets/voice-model-source.json' with { type: 'json' };

export function loadVoiceModel(Vosk, url, { timeoutMs = 60000, progress = () => {} } = {}) {
  let model, timer, settled = false, fail;
  const promise = new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      model?.removeEventListener('load', loaded);
      model?.removeEventListener('error', failed);
      model?.removeEventListener('hive-progress', progressed);
      model?.worker?.removeEventListener('error', workerFailed);
      model?.worker?.removeEventListener('messageerror', workerFailed);
    };
    fail = error => {
      if (settled) return;
      settled = true; cleanup();
      try { model?.terminate(); } catch {}
      model?.worker?.terminate();
      reject(error instanceof Error ? error : new Error(String(error || 'The voice engine could not load.')));
    };
    const loaded = event => {
      if (!event.detail?.result) return fail(new Error('The English voice model could not be opened. Please retry.'));
      if (settled) return;
      settled = true; cleanup(); resolve(model);
    };
    const failed = event => {
      const stage = event.detail?.stage;
      const labels = { 'engine-startup': 'The speech engine could not start', 'cache-open': 'The local voice cache could not open', 'model-unpack': 'The English voice model could not be unpacked', 'cache-save': 'The local voice cache could not be saved', 'model-open': 'The English voice model could not be initialized' };
      const reason = event.detail?.error;
      fail(new Error((labels[stage] || 'The voice engine could not load') + (stage ? ' [' + stage + ']' : '') + '. ' + (reason === undefined || reason === null || reason === '' ? 'No additional diagnostic was returned.' : String(reason))));
    };
    const workerFailed = event => fail(new Error(event.message || 'The speech worker could not start. Please update Hive and retry.'));
    const progressed = event => progress(event.detail?.stage || 'Preparing local speech recognition');
    try {
      if (!Vosk?.Model) throw new Error('The bundled voice engine is missing. Please reinstall this Hive build.');
      model = new Vosk.Model(url, -2);
      model.addEventListener('load', loaded);
      model.addEventListener('error', failed);
      model.addEventListener('hive-progress', progressed);
      model.worker?.addEventListener('error', workerFailed);
      model.worker?.addEventListener('messageerror', workerFailed);
      timer = setTimeout(() => fail(new Error('Voice setup took longer than one minute. Click Retry voice; the model is already included with Hive.')), timeoutMs);
    } catch (error) { fail(error); }
  });
  return { promise, cancel: () => fail(Object.assign(new Error('Voice setup cancelled.'), { code: 'voice_cancelled' })) };
}

export class Voice {
  constructor({ status, transcript, timeoutMs = 60000 }) {
    Object.assign(this, { status, transcript, timeoutMs });
    this.model = null; this.listening = false; this.loading = false; this.ready = null; this.lastError = null;
  }
  async prepare() {
    if (this.model) return this.model;
    if (this.ready) return this.ready;
    this.loading = true; this.lastError = null;
    this.status('Starting the local voice engine…');
    const modelURL = new URL('voice/english-model.tar.gz', document.baseURI);
    modelURL.searchParams.set('bundle', modelManifest.packaged_revision);
    const request = loadVoiceModel(window.Vosk, modelURL.href, {
      timeoutMs: this.timeoutMs, progress: text => this.status(text + '…')
    });
    this.cancelLoad = request.cancel;
    this.ready = request.promise.then(model => { this.model = model; this.status('Voice is ready'); return model; })
      .catch(error => { this.lastError = error.code === 'voice_cancelled' ? null : error.message; this.status(this.lastError || 'Voice setup cancelled. Click Speak to try again.'); throw error; })
      .finally(() => { this.loading = false; this.cancelLoad = null; this.ready = null; this.status(this.lastError || (this.model ? 'Voice is ready' : 'Click Speak to try again.')); });
    return this.ready;
  }
  cancelPreparation() { this.cancelLoad?.(); }
  async start() {
    if (this.listening) return;
    const model = await this.prepare();
    await window.hive.request('microphone');
    let stream, context, recognizer;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      context = new AudioContext(); await context.resume();
      recognizer = new model.KaldiRecognizer(context.sampleRate);
      const processor = context.createScriptProcessor(4096, 1, 1);
      const source = context.createMediaStreamSource(stream);
      const silent = context.createGain(); silent.gain.value = 0;
      this.segments = []; this.partial = ''; this.stopping = false;
      recognizer.on('result', message => {
        if (message.result?.text) this.segments.push(message.result.text);
        this.partial = ''; this.transcript(this.segments.join(' '));
        if (this.stopping && message.final) this.finish?.();
      });
      recognizer.on('partialresult', message => { this.partial = message.result?.partial || ''; this.transcript([...this.segments, this.partial].filter(Boolean).join(' ')); });
      recognizer.on('error', message => { this.status(message.error || 'Speech recognition stopped. Please retry.'); this.stop().catch(() => {}); });
      processor.onaudioprocess = event => { if (this.listening) recognizer.acceptWaveform(event.inputBuffer); };
      Object.assign(this, { stream, context, recognizer, processor, source, silent, listening: true });
      source.connect(processor); processor.connect(silent); silent.connect(context.destination);
      this.status('Listening · click Stop when finished');
    } catch (error) {
      stream?.getTracks().forEach(track => track.stop()); recognizer?.remove(); await context?.close();
      this.status(error.name === 'NotAllowedError' ? 'Microphone access was not granted. You can allow it in your computer settings or type.' : error.message);
      throw error;
    }
  }
  async stop() {
    if (!this.listening) return;
    this.listening = false; this.stopping = true;
    this.stream.getTracks().forEach(track => track.stop()); this.source.disconnect(); this.processor.disconnect(); this.silent.disconnect();
    let timer;
    await new Promise(resolve => { this.finish = resolve; this.recognizer.retrieveFinalResult(); timer = setTimeout(resolve, 3000); });
    clearTimeout(timer);
    const text = [...this.segments, this.partial].filter(Boolean).join(' ').trim();
    this.recognizer.remove(); await this.context.close(); this.finish = null;
    this.transcript(text); this.status(text ? 'Review your words, then send' : 'No speech detected. Try again or type.'); return text;
  }
  async transcribeSamples(samples, rate) {
    const model = await this.prepare();
    const recognizer = new model.KaldiRecognizer(rate);
    return new Promise((resolve, reject) => {
      const parts = []; let settled = false;
      const done = (error, text) => { if (settled) return; settled = true; clearTimeout(timer); recognizer.remove(); error ? reject(error) : resolve(text); };
      const timer = setTimeout(() => done(new Error('Voice recognition check timed out. Please retry.')), 30000);
      recognizer.on('result', message => { if (message.result?.text) parts.push(message.result.text); if (message.final) done(null, parts.join(' ')); });
      recognizer.on('error', message => done(new Error(message.error || 'Voice recognition failed.')));
      recognizer.acceptWaveformFloat(samples, rate); recognizer.retrieveFinalResult();
    });
  }
}
