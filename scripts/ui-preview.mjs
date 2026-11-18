// Development-only renderer QA. No account sign-in or real credentials are exposed here.
import http from 'node:http';
import path from 'node:path';
import { readFile, mkdir } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { openDatabase } from '../src/database.mjs';
import { Assistant, Memory } from '../src/assistant.mjs';
import { catalog, enums, practiceCatalog, practiceOutcomes } from '../src/core/catalog.mjs';
const port = 43412;
const version = JSON.parse(await readFile('package.json', 'utf8')).version;
const previewFolder = '.runtime/renderer-preview-' + version;
await mkdir(previewFolder, { recursive: true });
const options = { wasm: path.resolve('node_modules/sql.js/dist/sql-wasm.wasm'), migrations: path.resolve('drizzle') };
const own = await openDatabase({ ...options, filename: path.resolve(previewFolder, 'personal.sqlite'), catalog });
const lab = await openDatabase({ ...options, filename: path.resolve(previewFolder, 'practice.sqlite'), catalog: practiceCatalog });
let practice = false;
let events = [];
const memory = new Memory({ database: () => practice ? lab : own, owner: () => practice ? 'practice' : 'preview', emit: event => events.push(event) });
const assistant = new Assistant({ memory, connection: { session: async () => ({ sharing: false }) }, emit: event => events.push(event) });
if (!(await lab.prepare('SELECT id FROM hive_outcomes LIMIT 1').first())) {
  for (const row of practiceOutcomes()) await lab.prepare('INSERT INTO hive_outcomes (id,owner_id,submission_id,service_id,category,region,age_band,mobility,language,timing,delivery,satisfaction,reason,share,occurred_on,created_at,updated_at,version) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(row.id,'practice',row.id,row.service_id,row.category,row.region,row.age_band,row.mobility,row.language,row.timing,row.delivery,row.satisfaction,row.reason,0,row.occurred_on,row.created_at,row.created_at,1).run();
}
async function snapshot() { return { account: { connected: false, sharing: false, label: 'Renderer preview', profiles: [] }, accountError: '', practice, enums,
  workspace: await assistant.workspace(),
  catalog: practice ? practiceCatalog : catalog, memory: await memory.read('list_memory', { limit: 50 }), models: { items: [] }, pending: memory.pending,
  version: version + ' · renderer QA', platform: 'win32' }; }
const bridge = `window.hive={request:async(method,args={})=>{const r=await fetch('/__qa',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({method,args})});const b=await r.json();for(const e of b.events||[])window.dispatchEvent(new CustomEvent('hive-qa',{detail:e}));if(b.error)throw new Error(b.error);return b.value;},subscribe:f=>{window.addEventListener('hive-qa',e=>f(e.detail));return()=>{};}};`;
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1:' + port);
    if (url.pathname === '/__qa' && req.method === 'POST') {
      if (req.headers.origin !== url.origin) { res.writeHead(403).end(); return; }
      const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks);if(body.length>24000)throw new Error('Too large');
      const {method,args}=JSON.parse(body.toString());events=[];let value;
      try {
        if(method==='snapshot')value=await snapshot();
        else if(method==='ui-ready')value={ready:true};
        else if(method==='mode'){practice=args.practice===true;memory.reset();value=await snapshot();}
        else if(method==='read')value=await memory.read(args.name,args.arguments);
        else if(method==='propose')value=await memory.propose(args.name,args.arguments);
        else if(method==='confirm')value=await memory.confirm(args.id);
        else if(method==='cancel'){memory.cancel();value={cancelled:true};}
        else if(method==='chat')value=await assistant.chat(args.text);
        else if(method==='clear-chat'){await assistant.clearConversation();value={cleared:true};}
        else if(method==='resume-request')value=await assistant.resumeRequest(args.id);
        else if(method==='select-service')value=await assistant.selectService(args.service_id,args.request_id);
        else if(method==='service-workspace')value=await assistant.serviceWorkspace(args.service_id,args.request_id,args.browse===true);
        else if(method==='quick-result')value=await assistant.quickResult(args);
        else if(method==='save-service-comment')value=await assistant.saveComment(args);
        else if(method==='check-storage')value={storage:'Ready',records:(await memory.read('list_memory')).active_outcome_count,chatgpt:'Not connected in renderer QA'};
        else throw new Error('This action is available in the installed desktop app.');
        res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({value,events}));
      }catch(error){res.writeHead(400,{'Content-Type':'application/json'}).end(JSON.stringify({error:error.message,events}));}
      return;
    }
    if(url.pathname==='/preview-bridge.js'){res.writeHead(200,{'Content-Type':'application/javascript'}).end(bridge);return;}
    if(url.pathname==='/'||url.pathname==='/index.html'){
      const html=(await readFile('dist/ui/index.html','utf8')).replace('<script src="vosk.js">','<script src="preview-bridge.js"></script><script src="vosk.js">');
      res.writeHead(200,{'Content-Type':'text/html'}).end(html);return;
    }
    const folder=path.resolve(url.pathname.startsWith('/voice/')?'assets':'dist/ui');
    const filename=path.resolve(folder,url.pathname.replace(/^\/voice\//,'').replace(/^\//,''));
    if(!filename.startsWith(folder+path.sep)){res.writeHead(404).end();return;}
    const types={'.css':'text/css','.js':'application/javascript','.gz':'application/gzip','.wav':'audio/wav'};
    res.writeHead(200,{'Content-Type':types[path.extname(filename)]||'application/octet-stream'});
    const stream=createReadStream(filename);stream.on('error',()=>res.destroy());stream.pipe(res);
  } catch { res.writeHead(500).end(); }
});
server.listen(port,'127.0.0.1',()=>console.log('Renderer QA http://127.0.0.1:'+port));
