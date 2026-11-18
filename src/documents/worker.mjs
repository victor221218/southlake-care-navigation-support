import { parentPort, workerData } from 'node:worker_threads';
import { parseDocument } from './parse.mjs';
(async()=>{
  try { parentPort.postMessage({ok:true,value:await parseDocument(workerData.bytes,workerData.filename,{pdfWorker:workerData.pdfWorker})}); }
  catch(error){parentPort.postMessage({ok:false,error:error.message||'This document could not be read.'});}
})();
