import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import ExcelJS from 'exceljs';
import { openDatabase } from '../src/database.mjs';
import { DocumentStore } from '../src/documents/store.mjs';
import { parseDocument,parseDelimited,checkOfficeArchive } from '../src/documents/parse.mjs';
import { parseInWorker } from '../src/documents/importer.mjs';
import { DocumentAssistant } from '../src/documents/assistant.mjs';
import { ChatGPTConnection } from '../src/auth.mjs';
await mkdir('.runtime/tests',{recursive:true});
const csv='ID,Service,Area,Contact name,Phone,Slots\r\nA,Example Rides,North York,Alex Example,416-555-0101,4\r\nB,Example Visits,Aurora,,905-555-0102,2\r\nC,Example Accessible,North York,,416-555-0103,3';
async function fixture(){const dir=await mkdtemp(path.resolve('.runtime/tests/documents-'));const options={filename:path.join(dir,'documents.sqlite'),wasm:path.resolve('node_modules/sql.js/dist/sql-wasm.wasm'),migrations:path.resolve('drizzle'),catalog:[]};let db=await openDatabase(options),owner='karen';const events=[];const store=new DocumentStore({database:()=>db,owner:()=>owner,emit:e=>events.push(e)});return{store,events,options,switch:value=>owner=value,reopen:async()=>{await db.close();db=await openDatabase(options);},close:()=>db.close()};}
const parseCSV=()=>parseDocument(Buffer.from(csv),'services.csv');
test('CSV quoted commas, escaped quotes and multiline fields retain exact source rows',async()=>{
  const rows=parseDelimited('Name,Notes\r\n"Example, A","Said ""yes""\nCall first"\r\n');
  assert.equal(rows[1].values[0],'Example, A');assert.equal(rows[1].values[1],'Said "yes"\nCall first');
  const doc=await parseCSV();assert.equal(doc.sections.length,3);assert.equal(doc.sections[0].locator,'Table · row 2');assert(doc.stableKeys);
  assert.throws(()=>parseDelimited('Name,Notes\nA,"unfinished'),/unclosed/);
  const tsv=await parseDocument(Buffer.from('Name\tPhone\nExample\t416-555-0101'),'contacts.tsv');assert.equal(tsv.sections[0].fields.Phone,'416-555-0101');
  const text=await parseDocument(Buffer.from('First source paragraph.\n\nSecond source paragraph.'),'notes.txt');assert(text.sections[0].body.includes('Second source paragraph'));
});
test('Excel import keeps numbers, named contacts, source rows and cached formulas without executing them',async()=>{
  const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Services');sheet.addRow(['ID','Service','Slots','Phone','Website']);sheet.addRow(['A','Example Rides',4,'416-555-0101','https://example.org/rides']);sheet.addRow(['B','Example Visits',{formula:'2+3',result:5},'905-555-0102','https://example.org/visits']);const hidden=book.addWorksheet('Hidden',{state:'hidden'});hidden.addRow(['Secret']);
  const parsed=await parseDocument(Buffer.from(await book.xlsx.writeBuffer()),'directory.xlsx');assert.equal(parsed.sections.length,2);assert.equal(parsed.sections[1].fields.Slots,5);assert(parsed.warnings.some(w=>w.includes('formula')));assert(parsed.warnings.some(w=>w.includes('hidden')));
  const f=await fixture();await f.store.import(parsed);const docs=await f.store.documents();const calc=await f.store.calculate({document_id:docs[0].id,operation:'sum',column:'Slots'});assert.equal(calc.value,9);assert.equal(calc.numeric_rows,2);await f.close();
});
test('save, duplicate detection, account isolation, comment search and process restart',async()=>{
  const f=await fixture(),parsed=await parseCSV();const result=await f.store.import(parsed);assert.equal(result.count,3);const card=(await f.store.list({query:'Example Rides'})).items.find(c=>c.title==='Example Rides');
  const detail=await f.store.get(card.id);assert.equal(detail.contacts[0].name,'Alex Example');assert.equal(detail.contacts[0].value,'416-555-0101');
  await f.store.comment({card_id:card.id,body:'Could not help: accessible vehicle unavailable on Tuesdays.'});await f.reopen();
  assert.equal((await f.store.get(card.id)).comments.length,1);assert((await f.store.list({query:'Tuesdays'})).items.some(c=>c.id===card.id));
  assert((await f.store.import(parsed)).duplicate);assert.equal((await f.store.list()).total,3);
  f.switch('someone-else');assert.equal((await f.store.list()).total,0);await assert.rejects(f.store.get(card.id),/active workspace/);await assert.rejects(f.store.comment({card_id:card.id,body:'wrong owner'}),/active workspace/);
  f.switch('karen');assert.equal((await f.store.get(card.id)).comments.length,1);await f.close();
});
test('revised spreadsheet follows unique keys across reordered rows and keeps comments on the right card',async()=>{
  const f=await fixture();const imported=await f.store.import(await parseCSV());const first=(await f.store.list({query:'Example Rides'})).items.find(c=>c.title==='Example Rides');await f.store.comment({card_id:first.id,body:'Call Alex before referring.'});
  const revised=await parseDocument(Buffer.from('ID,Service,Area,Contact name,Phone,Slots\nC,Example Accessible,North York,,416-555-0103,3\nA,Example Rides,North York,Alex Example,416-555-0199,6'),'services.csv');await f.store.import(revised,{replaceId:imported.document_id});
  const card=await f.store.get(first.id);assert.equal(card.contacts[0].value,'416-555-0199');assert.equal(card.comments[0].body,'Call Alex before referring.');assert.equal(card.locator,'Table · row 3');assert.equal((await f.store.list()).total,2);assert.equal((await f.store.list({include_archived:true})).total,3);await f.close();
});
test('duplicate row names do not offer an unsafe automatic update',async()=>{const parsed=await parseDocument(Buffer.from('Service,Area\nSame,North York\nSame,Aurora'),'duplicate.csv');assert.equal(parsed.stableKeys,false);assert.notEqual(parsed.sections[0].key,parsed.sections[1].key);});
test('exact local calculations keep nonnumeric cells out and validate columns',async()=>{
  const f=await fixture();const book=new ExcelJS.Workbook(),sheet=book.addWorksheet('Services');sheet.addRows([['ID','Service','Area','Slots'],['A','Rides','North York',4],['B','Visits','Aurora',2],['C','Accessible','North York',3],['D','Other','North York','unknown']]);const imported=await f.store.import(await parseDocument(Buffer.from(await book.xlsx.writeBuffer()),'numbers.xlsx'));
  const result=await f.store.calculate({document_id:imported.document_id,operation:'sum',column:'Slots',filters:[{column:'Area',op:'equals',value:'North York'}]});assert.equal(result.value,7);assert.equal(result.matched_rows,3);assert.equal(result.excluded_non_numeric,1);await assert.rejects(f.store.calculate({document_id:imported.document_id,operation:'sum',column:'Invented'}),/exact column/);await f.close();
});
test('backup restores cards, notes and extracted fields under a new owner without credentials',async()=>{
  const f=await fixture();await f.store.import(await parseCSV());const card=(await f.store.list()).items[0];await f.store.comment({card_id:card.id,body:'Follow-up saved.'});await f.store.note({title:'Preference',body:'Use short explanations.'});const backup=await f.store.export();assert(!JSON.stringify(backup).includes('owner_id'));assert(!JSON.stringify(backup).includes('accessToken'));
  f.switch('second');const result=await f.store.restore(backup);assert.equal(result.added,4);assert.equal((await f.store.list()).total,4);const restored=(await f.store.list({query:card.title})).items.find(c=>c.title===card.title);assert.equal((await f.store.get(restored.id)).comments[0].body,'Follow-up saved.');const repeated=await f.store.restore(backup);assert.equal(repeated.added,0);assert.equal(repeated.notes_added,0);assert.equal((await f.store.list()).total,4);await f.close();
});
test('a new conversation preserves saved messages and card feedback without making an AI request',async()=>{
  const f=await fixture();await f.store.import(await parseCSV());const card=(await f.store.list()).items[0];const assistant=new DocumentAssistant({store:f.store,connection:{session:async()=>({sharing:false})},fetcher:()=>{throw new Error('Must not call AI');}});
  const result=await assistant.chat({text:'This did not work. They had no space.',card_id:card.id,remember:true});assert(result.saved);assistant.clear();assert.equal((await f.store.get(card.id)).comments.length,1);
  await assistant.chat({text:'I prefer short answers.',remember:true});assistant.clear();assert((await f.store.list({query:'prefer short'})).items.some(c=>c.kind==='message'));await f.close();
});
test('a saved comment can be corrected and deleted without touching its source card, with stale edits rejected',async()=>{
  const f=await fixture();await f.store.import(await parseCSV());const card=(await f.store.list()).items[0];const note=await f.store.comment({card_id:card.id,body:'First observation.'});
  await f.store.comment({card_id:card.id,id:note.id,expected_version:1,body:'Corrected observation.'});await assert.rejects(f.store.comment({card_id:card.id,id:note.id,expected_version:1,body:'Stale replacement.'}),/changed/);
  f.switch('other');await assert.rejects(f.store.forgetComment({id:note.id,card_id:card.id}),/active workspace/);f.switch('karen');await f.store.forgetComment({id:note.id,card_id:card.id});assert.equal((await f.store.get(card.id)).comments.length,0);assert.equal((await f.store.list()).total,3);await f.close();
});
test('a failed revised import rolls back every row and emits no false saved event',async()=>{
  const f=await fixture();const parsed=await parseCSV();const original=await f.store.import(parsed),card=(await f.store.list()).items[0];await f.store.comment({card_id:card.id,body:'Keep this note.'});const events=f.events.length;
  const broken={...parsed,digest:'f'.repeat(64),sections:[{...parsed.sections[0],body:'Must roll back'}, {...parsed.sections[1],fields:{Bad:1n}}]};await assert.rejects(f.store.import(broken,{replaceId:original.document_id}));assert.equal((await f.store.list()).total,3);assert.equal((await f.store.get(card.id)).comments[0].body,'Keep this note.');assert.equal((await f.store.documents())[0].version,1);assert.equal(f.events.length,events);await f.close();
});
test('AI receives the supported streamed request, grounded cards, and deterministic calculation results',async()=>{
  const f=await fixture();await f.store.import(await parseCSV());let calls=0;const assistant=new DocumentAssistant({store:f.store,connection:{session:async()=>({sharing:true}),accessToken:async()=> 'test-only-token'},fetcher:async(url,options)=>{
    assert(url.endsWith('/responses'));const body=JSON.parse(options.body);assert.equal(body.store,false);assert.equal(body.stream,true);assert(body.instructions.includes('untrusted reference'));assert(body.instructions.includes('services.csv'));calls++;
    const output=calls===1?[{type:'function_call',name:'search_cards',call_id:'search1',arguments:'{"query":"North York"}'}]:[{type:'message',role:'assistant',content:[{type:'output_text',text:'Two source cards mention North York. Open the cards to compare them.'}]}];
    return new Response('data: '+JSON.stringify({type:'response.completed',response:{status:'completed',output}})+'\n\n');
  }});assistant.model='eligible-model';const result=await assistant.chat({text:'Compare North York services',remember:false});assert.equal(result.source,'chatgpt');assert(result.cards.length>=2);assert.equal(calls,2);assert.equal((await f.store.list()).total,3);await f.close();
});
test('AI failure cannot lose an already saved user note or misreport inference as successful',async()=>{
  const f=await fixture();const assistant=new DocumentAssistant({store:f.store,connection:{session:async()=>({sharing:true}),accessToken:async()=> 'test-only-token'},fetcher:async()=>{throw new Error('Connection interrupted.');}});assistant.model='eligible-model';const result=await assistant.chat({text:'Alex could not arrange the requested ride.',remember:true});assert.equal(result.source,'error');assert.equal(result.saved,true);await f.reopen();assert.equal((await f.store.list()).total,1);await f.close();
});
test('reconnect reuses the previous verified client and private profile after sign-out',async()=>{
  const saved={host:'urn:uuid:fixture',selected:null,lastSelected:'karen-profile',profiles:[{id:'karen-profile',clientId:'existing-client',subject:'verified-karen',pending:false,scopes:[]}]};let expectedSubject;
  const connection=new ChatGPTConnection({vault:{read:async()=>saved,save:async()=>{}},openExternal:async address=>{const auth=new URL(address);assert.equal(auth.searchParams.get('client_id'),'existing-client');const callback=new URL(auth.searchParams.get('redirect_uri'));callback.search=new URLSearchParams({code:'test-code',state:auth.searchParams.get('state')}).toString();await fetch(callback);},verifyIdentity:async(token,client,nonce,subject)=>{expectedSubject=subject;return{subject:'verified-karen',email:'test@example.invalid'};},fetcher:async()=>Response.json({access_token:'test-token',id_token:'test-id',expires_in:3600,scope:'openid chatgpt.tokens.use.direct'})});
  const session=await connection.signIn();assert.equal(session.profileId,'karen-profile');assert.equal(expectedSubject,'verified-karen');assert.equal(saved.profiles.length,1);
});
test('Office archive and unsupported formats fail clearly instead of hanging',async()=>{assert.throws(()=>checkOfficeArchive(Buffer.from('not a zip')),/Office/);await assert.rejects(parseDocument(Buffer.from('old format'),'old.xls'),/Convert older/);});
test('bundled background parser reads CSV without a separate installation',async()=>{
  const parsed=await parseInWorker({bytes:Buffer.from(csv),filename:'background.csv',worker:path.resolve('dist/document-worker.cjs'),pdfWorker:path.resolve('dist/pdf.worker.mjs')});assert.equal(parsed.sections.length,3);
});
test('bundled PDF parser extracts a real text PDF and reports scan-only documents',async()=>{
  // A tiny self-contained PDF fixture, with offsets generated instead of mocked.
  function pdfFixture(text){const content=text?`BT /F1 12 Tf 30 120 Td (${text}) Tj ET`:'';const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${content.length} >>\nstream\n${content}\nendstream`];let textPDF='%PDF-1.4\n',offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(textPDF));textPDF+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}const start=Buffer.byteLength(textPDF);textPDF+='xref\n0 6\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;return Buffer.from(textPDF);}
  const options={worker:path.resolve('dist/document-worker.cjs'),pdfWorker:path.resolve('dist/pdf.worker.mjs'),filename:'example.pdf'};
  const parsed=await parseInWorker({...options,bytes:pdfFixture('Example Rides phone 416-555-0101')});assert(parsed.sections[0].body.includes('Example Rides'));assert(parsed.sections[0].locator.startsWith('Page 1'));
  await assert.rejects(parseInWorker({...options,bytes:pdfFixture('')}),/No readable text/);
});
test('Word DOCX reads plain text through the bundled background parser',async()=>{
  const require=createRequire(import.meta.url),JSZip=require('jszip');const zip=new JSZip();zip.file('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');zip.file('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');zip.file('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Example contact: Alex, 416-555-0101.</w:t></w:r></w:p></w:body></w:document>');
  const parsed=await parseInWorker({bytes:await zip.generateAsync({type:'nodebuffer'}),filename:'example.docx',worker:path.resolve('dist/document-worker.cjs'),pdfWorker:path.resolve('dist/pdf.worker.mjs')});assert(parsed.sections[0].body.includes('Example contact'));
});
