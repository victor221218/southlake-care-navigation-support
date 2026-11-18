// Packaging transformation of Apache-2.0 vosk-browser 0.0.8. Keep its engine
// unchanged, but serve its worker as a separate file with its own narrow CSP.
export function voiceAssets(source) {
  const factory = /var WorkerFactory = createBase64WorkerFactory\('([^']+)', null, false\);/;
  const match = source.match(factory);
  if (!match) throw new Error('The pinned Vosk worker format changed; review the voice packaging adapter.');
  let worker = Buffer.from(match[1], 'base64').toString('utf8');
  const startup = 'const storagePath = "/vosk";';
  if (!worker.includes(startup)) throw new Error('The pinned Vosk storage setup changed.');
  worker = worker.replace(startup, `this.hiveStage='engine-startup'; self.postMessage({event:'hive-progress',stage:'Starting the local speech engine'});\n${startup}`);
  const stages = [
    ['this.Vosk.FS.mkdir(storagePath);', 'Opening local voice cache', 'cache-open'],
    ['return this.Vosk.downloadAndExtract(fullModelUrl.toString(), modelPath);', 'Unpacking the bundled English model', 'model-unpack'],
    ['return this.Vosk.syncFilesystem(false);', 'Saving the local voice cache', 'cache-save'],
    ['this.model = new this.Vosk.Model(modelPath);', 'Starting English speech recognition', 'model-open']
  ];
  for (const [target, stage, key] of stages) {
    if (!worker.includes(target)) throw new Error('The pinned Vosk initialization changed.');
    worker = worker.replace(target, `this.hiveStage=${JSON.stringify(key)}; self.postMessage({event:'hive-progress',stage:${JSON.stringify(stage)}});\n${target}`);
  }
  const loadError = 'ctx.postMessage({ event: "error", error: error.message });';
  if (!worker.includes(loadError)) throw new Error('The pinned Vosk load-error handler changed.');
  worker = worker.replace(loadError, 'ctx.postMessage({event:"error",stage:this.hiveStage||"voice-worker",error:String(error?.message || error || "Unknown speech error")});');
  if (!worker.includes('result: JSON.parse(finalResult),')) throw new Error('The pinned Vosk final-result format changed.');
  worker = worker.replace('result: JSON.parse(finalResult),', 'result: JSON.parse(finalResult), final: true,');
  worker = `/* Vosk-Browser 0.0.8, Apache-2.0. Static worker packaging by Team 26. */
self.addEventListener('unhandledrejection', event => self.postMessage({event:'error',error:String(event.reason?.message || event.reason || 'Speech engine failed').slice(0,300)}));
` + worker;
  return { worker, client: source.replace(factory, "var WorkerFactory = function(options) { return new Worker(new URL('voice-worker.js', location.href), options); };") };
}
