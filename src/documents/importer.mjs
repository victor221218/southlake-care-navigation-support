import { Worker } from 'node:worker_threads';
import { readFile, stat, mkdir, writeFile, rename, rm } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import {OWN_SERVICE_FORMAT, SERVICE_FILE_TYPES, cleanServiceFields, serviceDraft, serviceSection} from './service-sources.mjs';

const serviceFileDigest = digest => createHash('sha256').update(OWN_SERVICE_FORMAT + ':' + digest).digest('hex');

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
  async prepare(filename,{services=false}={}){
    if(this.busy)throw new Error('Wait for the current file to finish.');this.busy=true;const owner=this.store.owner();
    try{
      this.pending=null;
      if((await stat(filename)).size>20*1024*1024)throw new Error('Choose a document smaller than 20 MB.');
      const bytes=await readFile(filename),parsed=await parseInWorker({bytes,filename:path.basename(filename),worker:this.worker,pdfWorker:this.pdfWorker});
      if(owner!==this.store.owner())throw new Error('The active account changed. Import this file again.');
      const duplicate=services?null:await this.store.duplicate(parsed.digest),previous=services?null:await this.store.sameName(parsed.filename);
      if(duplicate)return{duplicate:true,document_id:duplicate.id,filename:duplicate.filename};
      const id=randomUUID();this.pending={id,owner,parsed,bytes,previous};
      if (services) return await this.reviewServices(id);
      return{id,filename:parsed.filename,format:parsed.format,count:parsed.sections.length,warnings:parsed.warnings,preview:parsed.sections.slice(0,8),previous:previous&&{...previous,can_update:parsed.stableKeys}};
    }finally{this.busy=false;}
  }
  preview(id) {
    const item=this.pending;
    if(!item||item.id!==id||item.owner!==this.store.owner())throw new Error('This import preview is no longer active. Choose the document again.');
    return item;
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
    return {id, filename:parsed.filename, rows:item.serviceRows, warnings:parsed.warnings};
  }
  setServiceRow({id,index,values,include}) {
    if (this.busy) throw new Error('The import is already saving.');
    const rows = this.preview(id).serviceRows;
    if (!rows || !Number.isInteger(index) || !rows[index]) throw new Error('Choose a row from the import review.');
    rows[index] = {...rows[index], values:cleanServiceFields(values), include:include===true};
  }
  async confirmServices(id) {
    const item = this.preview(id);
    if (!item.serviceRows) throw new Error('Review the service rows before saving.');
    const sections = item.serviceRows.flatMap((row,index) =>
      row.include ? [serviceSection(item.parsed.sections[index],row.values)] : []);
    if (!sections.length) throw new Error('Include at least one service row to save.');
    return this.confirm(id,false,{
      ...item.parsed, format:OWN_SERVICE_FORMAT, digest:serviceFileDigest(item.parsed.digest),
      sections, stableKeys:false
    });
  }
  async confirm(id,update=false,serviceDocument=null){
    const item=this.preview(id);
    if(this.busy)throw new Error('The import is already saving.');this.busy=true;
    const folder=path.join(this.directory,item.owner),destination=path.join(folder,randomUUID()+'.'+item.parsed.format);
    try{
      await mkdir(folder,{recursive:true});await writeFile(destination+'.next',item.bytes,{flag:'wx',mode:0o600});await rename(destination+'.next',destination);
      const previous=update&&item.previous?await this.store.document(item.previous.id):null;
      const result=await this.store.import(serviceDocument||item.parsed,{originalPath:destination,replaceId:update?item.previous?.id:null});this.pending=null;
      if(result.duplicate)await rm(destination,{force:true}).catch(()=>{});
      if(previous?.original_path&&path.resolve(previous.original_path).startsWith(path.resolve(folder)+path.sep))await rm(previous.original_path,{force:true}).catch(()=>{});
      return result;
    }catch(error){await rm(destination,{force:true}).catch(()=>{});await rm(destination+'.next',{force:true}).catch(()=>{});throw error;}
    finally{this.busy=false;}
  }
}
