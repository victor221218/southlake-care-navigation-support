import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import ExcelJS from 'exceljs';
import mammoth from 'mammoth';
import DOMMatrix from '@thednp/dommatrix';
import {headerKey, INVENTORY_TEMPLATE, navigationTemplate, TRACKING_TEMPLATE, trackingRow} from './navigation-templates.mjs';

export const supportedExtensions = ['xlsx','csv','tsv','docx','pdf','txt','md'];
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
const clean = text => String(text ?? '').replace(/\u0000/g,'').trim();
const stable = value => clean(value).normalize('NFKC').toLowerCase();

// Check ZIP metadata before Office libraries decompress anything. Reject ZIP64,
// encrypted archives, huge expanded archives, and malformed central directories.
export function checkOfficeArchive(bytes) {
  let end = -1;
  for (let i=bytes.length-22; i>=Math.max(0,bytes.length-65557); i--) if (bytes.readUInt32LE(i)===0x06054b50) { end=i; break; }
  if (end<0 || bytes.length<22) throw new Error('This Office file is incomplete or is not a readable ZIP-based document.');
  const count=bytes.readUInt16LE(end+10), offset=bytes.readUInt32LE(end+16);
  if (count===65535 || count>5000 || offset===0xffffffff || offset>=end) throw new Error('This Office document is too large or uses an unsupported archive format.');
  let cursor=offset, expanded=0;
  for (let i=0;i<count;i++) {
    if (cursor+46>end || bytes.readUInt32LE(cursor)!==0x02014b50) throw new Error('The Office archive directory is damaged.');
    const flags=bytes.readUInt16LE(cursor+8), size=bytes.readUInt32LE(cursor+24);
    expanded+=size;
    if (flags&1 || size===0xffffffff || expanded>80*1024*1024) throw new Error('This Office document is encrypted or expands beyond the 80 MB reading limit.');
    cursor+=46+bytes.readUInt16LE(cursor+28)+bytes.readUInt16LE(cursor+30)+bytes.readUInt16LE(cursor+32);
    if (cursor>end) throw new Error('The Office archive directory is damaged.');
  }
}
function cellValue(cell) {
  const value=cell.value;
  if (value===null || value===undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value!=='object') return value;
  if ('formula' in value || 'sharedFormula' in value) return value.result ?? '[Formula has no saved result]';
  if (value.richText) return value.richText.map(x=>x.text||'').join('');
  if (value.hyperlink) return String(value.text||'')+(value.hyperlink.startsWith('https://')?' '+value.hyperlink:'');
  if (value.error) return value.error;
  return cell.text || '';
}
function tableSections(rows, name, warnings, numericCSV=false) {
  const nonempty=rows.filter(row=>row.values.some(value=>String(value??'').trim()));
  if (!nonempty.length) return {sections:[]};
  let headerIndex=nonempty.findIndex(row=>navigationTemplate(row.values));
  const template=headerIndex>=0 ? navigationTemplate(nonempty[headerIndex].values) : '';
  if (headerIndex<0) headerIndex=nonempty.findIndex(row=>row.values.filter(v=>String(v??'').trim()).length>=2);
  if (headerIndex<0) headerIndex=0;
  if (headerIndex>0 && !template) warnings.push(name+': introductory rows above the table are kept as notes.');
  const first=nonempty[headerIndex], seen=new Set();
  const columns=first.values.map((value,i)=>{ let title=clean(value).slice(0,100)||'Column '+(i+1); if(seen.has(title))title+=' ('+(i+1)+')'; seen.add(title);return title; });
  if(columns.length>100)throw new Error('Limit the table to 100 columns per worksheet.');
  const titleIndex=Math.max(0,columns.findIndex(c=>/^(?:service|program|organisation|organization|provider|name|title|service name|program name|program \/ clinic)$/i.test(c)));
  const idIndex=columns.findIndex(c=>/^(?:id|service id|service_id|program id|record id|reference|code)$/i.test(c));
  const result=[];
  const tracking=[];
  if (!template) for(const row of nonempty.slice(0,headerIndex)) result.push({title:name+' · introduction',body:row.values.join(' | '),fields:{},locator:name+' · row '+row.number,key:name+'/intro/'+row.number,stable:false});
  for(const row of nonempty.slice(headerIndex+1)) {
    const fields={};
    row.values.forEach((value,i)=>{ if(i>=100)throw new Error('Limit the table to 100 columns per worksheet.'); const column=columns[i]||'Column '+(i+1);if(numericCSV&&typeof value==='string'&&!/id|code|phone|postal|zip|reference/i.test(column)&&/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value.trim())&&Math.abs(Number(value))<=Number.MAX_SAFE_INTEGER)value=Number(value);if(String(value??'').trim())fields[column]=value; });
    if (template===TRACKING_TEMPLATE) {
      const item=trackingRow(fields,name+' · row '+row.number);
      if (item) tracking.push(item);
      continue;
    }
    const organization=template===INVENTORY_TEMPLATE ? fields[columns.find(c=>headerKey(c)==='partner organization')] : '';
    const title=clean(row.values[titleIndex])||clean(organization)||name+' · row '+row.number;
    const program=clean(row.values[titleIndex]);
    const identity=idIndex>=0&&(template!==INVENTORY_TEMPLATE||clean(row.values[idIndex])) ? row.values[idIndex] :
      template===INVENTORY_TEMPLATE && (organization || program)
        ? JSON.stringify([organization,program,fields['Service type'],fields['Service Subcategory'],fields['Service location']].map(headerKey))
        : row.values[titleIndex];
    result.push({title:title.slice(0,180),body:Object.entries(fields).map(([key,value])=>key+': '+value).join('\n'),fields,locator:name+' · row '+row.number,key:name+'/key/'+stable(identity),stable:Boolean(clean(identity))});
  }
  // A single-column sheet still keeps every row; its first row is a label.
  if(!template && !result.length && nonempty.length===1)result.push({title:name,body:first.values.join(' | '),fields:{},locator:name+' · row '+first.number,key:name+'/single',stable:false});
  const merged = new Map();
  for (const section of result) {
    if (!merged.has(section.key)) merged.set(section.key, []);
    merged.get(section.key).push(section);
  }
  const sections = [...merged.values()].flatMap(group => {
    if (group.length===1) {
      const [first]=group;
      return first.stable ? [first] : [{...first,key:first.key+'/row/'+first.locator}];
    }
    if (template!==INVENTORY_TEMPLATE || !group[0].stable || idIndex>=0) {
      return group.map(section=>({...section,key:section.key+'/row/'+section.locator,stable:false}));
    }
    const fields={};
    for (const label of new Set(group.flatMap(section=>Object.keys(section.fields)))) {
      const values=[...new Set(group.map(section=>section.fields[label]).filter(value=>String(value??'').trim()))];
      fields[label]=values.length===1 ? values[0] : values.join('\n');
    }
    fields['Source rows']=group.map(section=>section.locator).join(', ');
    return [{...group[0],fields,body:Object.entries(fields).map(([key,value])=>key+': '+value).join('\n')}];
  });
  if (template===INVENTORY_TEMPLATE && sections.length<result.length) {
    warnings.push('Rows for the same organization, program, service type and location were combined. The source rows are listed on the card.');
  }
  return {template,tracking,sections};
}
export function parseDelimited(text, separator=',') {
  const rows=[];let row=[],field='',quoted=false;
  text=text.replace(/^\uFEFF/,'');
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(c==='"') { if(quoted&&text[i+1]==='"'){field+='"';i++;}else if(quoted||!field)quoted=!quoted;else field+=c; }
    else if(c===separator&&!quoted){row.push(field);field='';}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);rows.push({number:rows.length+1,values:row});row=[];field='';}
    else field+=c;
    if(field.length>30000||row.length>100||rows.length>5001)throw new Error('The text table exceeds the 5,000-row, 100-column, or 30,000-character cell limit.');
  }
  if(quoted)throw new Error('The CSV has an unclosed quoted field.');
  if(field||row.length){row.push(field);rows.push({number:rows.length+1,values:row});}
  return rows;
}
function textSections(text, prefix) {
  const blocks=clean(text).split(/\n\s*\n/).filter(Boolean), result=[];
  let body='';
  const push=()=>{if(body.trim()){const index=result.length+1;result.push({title:body.trim().split('\n')[0].slice(0,120),body:body.trim(),fields:{},locator:prefix+' · section '+index,key:prefix+'/section/'+index,stable:false});body='';}};
  for(const block of blocks) { if(body.length+block.length>3500)push();for(let i=0;i<block.length;i+=3500){body+=(body?'\n\n':'')+block.slice(i,i+3500);if(body.length>=3500)push();} }push();return result;
}
export async function parseDocument(bytes, filename, { pdfWorker }={}) {
  bytes=Buffer.from(bytes);
  const extension=path.extname(filename).slice(1).toLowerCase(),warnings=[];
  if(!supportedExtensions.includes(extension))throw new Error('Use an Excel .xlsx, CSV, TSV, Word .docx, text PDF, TXT, or Markdown file. Convert older .xls or .doc files first.');
  if(bytes.length>MAX_FILE_BYTES)throw new Error('Choose a file smaller than 20 MB.');
  let sections=[], tables=[];
  if(['xlsx','docx'].includes(extension))checkOfficeArchive(bytes);
  if(extension==='xlsx') {
    const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(bytes, { ignoreNodes: ['drawing','picture','extLst'] });let formulas=0;
    for(const sheet of workbook.worksheets) {
      if(sheet.state==='hidden'||sheet.state==='veryHidden'){warnings.push(sheet.name+': hidden worksheet was not imported.');continue;}
      if(sheet.actualRowCount>5001||sheet.actualColumnCount>100)throw new Error('Limit each worksheet to 5,000 data rows and 100 columns.');
      const rows=[];sheet.eachRow((row,number)=>{const values=[];row.eachCell({includeEmpty:true},(cell,index)=>{if(cell.formula)formulas++;values[index-1]=cellValue(cell);});rows.push({number,values:Array.from(values,v=>v??'')});});
      tables.push(tableSections(rows,sheet.name,warnings));
    }
    if(formulas)warnings.push(formulas+' formula cell(s) use the last saved Excel results. Hive does not recalculate Excel formulas.');
  } else if(['csv','tsv'].includes(extension)) {
    let text=bytes[0]===0xff&&bytes[1]===0xfe?bytes.subarray(2).toString('utf16le'):bytes.toString('utf8');
    const first=text.split(/\r?\n/)[0];const separator=extension==='tsv'?'\t':first.includes(';')&&!first.includes(',')?';':',';
    tables=[tableSections(parseDelimited(text,separator),'Table',warnings,true)];
  } else if(extension==='docx') {
    const result=await mammoth.extractRawText({buffer:bytes},{externalFileAccess:false});
    sections=textSections(result.value,'Word');warnings.push(...result.messages.filter(m=>m.type==='warning').map(m=>m.message).slice(0,5));
    warnings.push('Word content is imported as plain text. Layout, images and embedded files are not included.');
  } else if(extension==='pdf') {
    globalThis.DOMMatrix ||= DOMMatrix;
    const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
    if(pdfWorker)pdfjs.GlobalWorkerOptions.workerSrc=pathToFileURL(pdfWorker).href;
    const pdfAssets=pdfWorker?path.join(path.dirname(pdfWorker),'pdf-assets'):null;
    const assetURL=folder=>path.join(pdfAssets,folder).replaceAll('\\','/')+'/';
    const task=pdfjs.getDocument({data:Uint8Array.from(bytes),isEvalSupported:false,useSystemFonts:false,disableFontFace:true,useWorkerFetch:false,stopAtErrors:true,...(pdfAssets?{cMapUrl:assetURL('cmaps'),cMapPacked:true,standardFontDataUrl:assetURL('standard_fonts'),wasmUrl:assetURL('wasm')}:{})});
    let pdf;
    try {
      pdf=await task.promise;if(pdf.numPages>300)throw new Error('Split PDFs longer than 300 pages before importing.');
      const empty=[];
      for(let pageNumber=1;pageNumber<=pdf.numPages;pageNumber++){
        const page=await pdf.getPage(pageNumber), content=await page.getTextContent();
        const text=content.items.map(item=>item.str+(item.hasEOL?'\n':' ')).join('').trim();
        if(!text)empty.push(pageNumber);
        else sections.push(...textSections(text,'Page '+pageNumber));page.cleanup();
      }
      if(empty.length)warnings.push('No readable text on page(s) '+empty.slice(0,25).join(', ')+(empty.length>25?'…':'')+'. Scanned images need OCR before import.');
      warnings.push('PDF text order may differ from the visual layout. Check the source before relying on table values.');
    } finally {await task.destroy();}
  } else sections=textSections(bytes.toString('utf8'),extension==='md'?'Markdown':'Text');
  const template=tables.some(t=>t.template===TRACKING_TEMPLATE)?TRACKING_TEMPLATE:
    tables.some(t=>t.template===INVENTORY_TEMPLATE)?INVENTORY_TEMPLATE:'';
  if (tables.length) sections=tables.filter(t=>!template||t.template===template).flatMap(t=>t.sections);
  const digest=createHash('sha256').update(bytes).digest('hex');
  if (template===TRACKING_TEMPLATE) {
    const tracking=tables.filter(t=>t.template===template).flatMap(t=>t.tracking);
    if (tracking.length>5000) throw new Error('Limit the tracker to 5,000 navigation rows.');
    return {filename:path.basename(filename),digest,format:extension,template,tracking,sections:[],warnings:[]};
  }
  if(!sections.length)throw new Error('No readable text was found. If this is a scan, use a searchable PDF or paste its text.');
  if(sections.length>5000||sections.reduce((sum,s)=>sum+s.body.length,0)>5000000)throw new Error('This document contains too much text. Split it into smaller files before importing.');
  if(sections.some(s=>s.body.length>30000))throw new Error('One row contains more than 30,000 characters. Split that row before importing.');
  return {filename:path.basename(filename),digest,format:extension,template,sections,warnings:[...new Set(warnings)],stableKeys:sections.every(s=>s.stable)};
}
