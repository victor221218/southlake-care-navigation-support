import { Worker } from 'node:worker_threads';
import { readFile, stat, mkdir, writeFile, rename, rm, realpath } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import {OWN_SERVICE_FORMAT, SERVICE_FILE_TYPES, cleanServiceFields, isInventoryWorkbook, serviceDraft, serviceSection} from './service-sources.mjs';
import {headerKey, INVENTORY_TEMPLATE, TRACKING_TEMPLATE} from './navigation-templates.mjs';
import {matchingServices} from './service-matching.mjs';
import {editDocumentContent,serviceFileDigest} from './store.mjs';

const trackerKey = (filename,row) => createHash('sha256')
  .update(JSON.stringify([headerKey(filename),row.locator,headerKey(row.provider),row.date])).digest('hex');
const documentCard = ({title,body,fields,locator}) => ({title,body,fields,locator});

export function parseInWorker({bytes,filename,worker,pdfWorker,timeoutMs=45000}) {
  return new Promise((resolve,reject)=>{
    const task=new Worker(worker,{workerData:{bytes,filename,pdfWorker},resourceLimits:{maxOldGenerationSizeMb:512}});
    let settled=false;
    const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);task.terminate().catch(()=>{});error?reject(error):resolve(value);};
    const timer=setTimeout(()=>finish(new Error('Reading took longer than 45 seconds. Split the file into smaller documents and retry.')),timeoutMs);
    task.once('message',result=>result.ok?finish(null,result.value):finish(new Error(result.error)));
    task.once('error',error=>finish(new Error('The document reader stopped: '+error.message)));
    task.once('exit',code=>{if(!settled)finish(new Error('The document reader stopped before completing ('+code+').'));});
  });
}
export class DocumentImporter {
  constructor({store,directory,worker,pdfWorker}){Object.assign(this,{store,directory,worker,pdfWorker});this.pending=null;this.busy=false;}
  cancel(){this.pending=null;}
  async removeManagedOriginal(document) {
    if (!document?.original_path) return;
    const root=path.resolve(this.directory), folder=path.resolve(root,document.owner_id), target=path.resolve(document.original_path);
    if (path.dirname(folder)!==root || path.dirname(target)!==folder ||
        !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\.[a-z0-9]+$/i.test(path.basename(target))) return;
    try {
      const [resolvedRoot,resolvedFolder]=await Promise.all([realpath(root),realpath(folder)]);
      if (resolvedFolder===path.join(resolvedRoot,path.basename(folder))) await rm(target,{force:true});
    } catch {}
  }
  async pruneEmptyImports() {
    const discarded=await this.store.pruneEmptyImports();
    await Promise.all(discarded.map(document=>this.removeManagedOriginal(document)));
  }
  async prepare(filename,{services=false}={}){
    if(this.busy)throw new Error('Wait for the current file to finish.');this.busy=true;const owner=this.store.owner();
    try{
      this.pending=null;
      if((await stat(filename)).size>20*1024*1024)throw new Error('Choose a document smaller than 20 MB.');
      const bytes=await readFile(filename),parsed=await parseInWorker({bytes,filename:path.basename(filename),worker:this.worker,pdfWorker:this.pdfWorker});
      if(owner!==this.store.owner())throw new Error('The active account changed. Import this file again.');
      await this.pruneEmptyImports();
      if(owner!==this.store.owner())throw new Error('The active account changed. Import this file again.');
      if (parsed.template===TRACKING_TEMPLATE) {
        const id=randomUUID();
        this.pending={id,owner,parsed};
        return await this.reviewTracking(id);
      }
      const inventory=SERVICE_FILE_TYPES.includes(parsed.format) &&
        (parsed.template===INVENTORY_TEMPLATE || isInventoryWorkbook(parsed.sections));
      if (inventory) await this.store.recoverServiceInventories();
      const review=services || inventory;
      const duplicate=review?null:await this.store.duplicate(parsed.digest),previous=review?null:await this.store.sameName(parsed.filename);
      if(owner!==this.store.owner())throw new Error('The active account changed. Import this file again.');
      if(duplicate)return{duplicate:true,document_id:duplicate.id,filename:duplicate.filename};
      const id=randomUUID();this.pending={id,owner,parsed,bytes,previous};
      if (review) return {...await this.reviewServices(id),service_inventory:inventory};
      return{id,filename:parsed.filename,format:parsed.format,count:parsed.sections.length,warnings:parsed.warnings,preview:parsed.sections.slice(0,8),previous:previous&&{...previous,can_update:parsed.stableKeys}};
    }finally{this.busy=false;}
  }
  preview(id) {
    const item=this.pending;
    if(!item||item.id!==id||item.owner!==this.store.owner())throw new Error('This import preview is no longer active. Choose the document again.');
    return item;
  }
  reviewDocumentCard(id,index) {
    const item=this.preview(id), section=item.parsed.sections[index];
    if (!Number.isInteger(index) || !section) throw new Error('Choose a document card from the preview.');
    return documentCard(section);
  }
  setDocumentRow({id,index,title,body,fields}) {
    if (this.busy) throw new Error('The import is already saving.');
    this.reviewDocumentCard(id,index);
    const item=this.preview(id), section=item.parsed.sections[index];
    const edited=editDocumentContent(section,{title,body,fields});
    item.parsed.sections[index]=edited;
    item.serviceRows=null;
    return documentCard(edited);
  }
  async reviewServices(id) {
    const item = this.preview(id), {parsed} = item;
    if (!SERVICE_FILE_TYPES.includes(parsed.format)) throw new Error('Choose an Excel .xlsx, CSV, or TSV file to add services.');
    const duplicate = await this.store.duplicate(serviceFileDigest(parsed.digest));
    if (duplicate) return {...duplicate, duplicate:true};
    item.serviceRows ||= parsed.sections.map(section => {
      const {values} = serviceDraft(section);
      return {values, include:Boolean(values.name), locator:section.locator};
    });
    item.previousService ||= await this.store.sameName(parsed.filename,{services:true});
    const canUpdate = parsed.sections.every((section,index)=>!item.serviceRows[index].include||section.stable);
    return {id, filename:parsed.filename, rows:item.serviceRows, warnings:parsed.warnings,
      previous:item.previousService&&{...item.previousService,can_update:canUpdate}};
  }
  setServiceRow({id,index,values,include}) {
    if (this.busy) throw new Error('The import is already saving.');
    const rows = this.preview(id).serviceRows;
    if (!rows || !Number.isInteger(index) || !rows[index]) throw new Error('Choose a row from the import review.');
    rows[index] = {...rows[index], values:cleanServiceFields(values), include:include===true};
  }
  async confirmServices(id, update=false) {
    const item = this.preview(id);
    if (!item.serviceRows) throw new Error('Review the service rows before saving.');
    const sections = item.serviceRows.flatMap((row,index) =>
      row.include ? [serviceSection(item.parsed.sections[index],row.values)] : []);
    if (!sections.length) throw new Error('Include at least one service row to save.');
    const stableKeys=sections.every(section=>section.stable);
    if (update && (!item.previousService || !stableKeys)) {
      throw new Error('Add a unique Service ID to rows with the same program and organization before updating this inventory.');
    }
    return this.confirm(id,false,{
      ...item.parsed, format:OWN_SERVICE_FORMAT, digest:serviceFileDigest(item.parsed.digest),
      sections, stableKeys
    },update?item.previousService.id:null);
  }
  async reviewTracking(id) {
    const item=this.preview(id);
    const services=await this.store.serviceIdentities();
    const rows=[];
    for (const row of item.parsed.tracking) {
      const key=trackerKey(item.parsed.filename,row);
      const {cards}=matchingServices(services,row.provider,{exactName:true});
      const duplicate=Boolean(await this.store.trackerResult(key));
      rows.push({...row,key,duplicate,options:cards.map(({id,title})=>({id,title})),
        card_id:cards.length===1 ? cards[0].id : '', include:!duplicate&&cards.length===1&&Boolean(row.outcome)});
    }
    item.trackingRows=rows;
    return {id,filename:item.parsed.filename,tracking:true,rows:rows.map(({key,...row})=>row)};
  }
  setTrackingRow({id,index,card_id,outcome,include}) {
    if(this.busy) throw new Error('The import is already saving.');
    const row=this.preview(id).trackingRows?.[index];
    if (!Number.isInteger(index)||!row||row.duplicate) throw new Error('Choose a new navigation row.');
    if (card_id && !row.options.some(card=>card.id===card_id)) throw new Error('Choose one of the matched service cards.');
    if (outcome && !['worked','not_worked'].includes(outcome)) throw new Error('Choose Worked or Didn’t work.');
    Object.assign(row,{card_id,outcome,include:include===true});
  }
  async confirmTracking(id) {
    const item=this.preview(id);
    if(this.busy) throw new Error('The import is already saving.');
    const rows=item.trackingRows?.filter(row=>row.include&&!row.duplicate)||[];
    if (!rows.length) throw new Error('Select at least one navigation outcome.');
    if (rows.some(row=>!row.options.some(card=>card.id===row.card_id)||!row.outcome)) {
      throw new Error('Choose the service and result for each selected row.');
    }
    this.busy=true;
    try {
      const result=await this.store.db().transaction(async()=>{
        let count=0;
        for (const row of rows) {
          const saved=await this.store.serviceResult({
            card_id:row.card_id,outcome:row.outcome,
            body:'Navigation tracker · '+row.locator+(row.date?' · inquiry '+row.date:'')
          },{trackerKey:row.key});
          if(saved.saved) count++;
        }
        return {count,duplicates:rows.length-count};
      });
      this.pending=null;
      return result;
    } finally { this.busy=false; }
  }
  async confirm(id,update=false,serviceDocument=null,serviceReplaceId=null){
    const item=this.preview(id);
    if(this.busy)throw new Error('The import is already saving.');this.busy=true;
    const folder=path.join(this.directory,item.owner),destination=path.join(folder,randomUUID()+'.'+item.parsed.format);
    try{
      if(!item.bytes)throw new Error('Use the navigation outcome review to save this worksheet.');
      await mkdir(folder,{recursive:true});await writeFile(destination+'.next',item.bytes,{flag:'wx',mode:0o600});await rename(destination+'.next',destination);
      this.preview(id);
      const replaceId=serviceReplaceId||(update?item.previous?.id:null);
      const previous=replaceId?await this.store.document(replaceId):null;
      this.preview(id);
      const {discarded_import,...result}=await this.store.import(serviceDocument||item.parsed,{originalPath:destination,replaceId});this.pending=null;
      if(result.duplicate)await rm(destination,{force:true}).catch(()=>{});
      else {
        await this.removeManagedOriginal(discarded_import);
        await this.removeManagedOriginal(previous);
      }
      return result;
    }catch(error){await rm(destination,{force:true}).catch(()=>{});await rm(destination+'.next',{force:true}).catch(()=>{});throw error;}
    finally{this.busy=false;}
  }
}
