import {mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import ExcelJS from 'exceljs';
export async function writeServiceFixture(directory) {
  await mkdir(directory,{recursive:true});
  const book=new ExcelJS.Workbook(), sheet=book.addWorksheet('Services');
  sheet.addRows([
    ['Program Name','Agency','Service type','City','Intake Contact','Phone Number','Email Address','Eligibility notes'],
    ['Fictional Clinic Rides','Example Community','Transportation','Newmarket','Alex Example','905-555-0104','rides@example.org','Call one day ahead'],
    ['Fictional Meal Drop','Example Food Centre','Meals and food','','','','','Weekday delivery'],
    ['', '', '', 'Aurora', '', '', '', 'Review this unlabelled row']
  ]);
  const filename=path.join(directory,'services.xlsx');
  await book.xlsx.writeFile(filename);
  return filename;
}
export async function writeParserFixtures(directory){
  await mkdir(directory,{recursive:true});
  const workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet('Example');sheet.addRows([['ID','Service','Slots'],['A','Fictional Rides',4],['B','Fictional Visits',{formula:'1+2',result:3}]]);await workbook.xlsx.writeFile(path.join(directory,'fixture.xlsx'));
  const require=createRequire(import.meta.url),JSZip=require('jszip'),zip=new JSZip();
  zip.file('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml','<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Fictional source contact: Alex Example.</w:t></w:r></w:p></w:body></w:document>');await writeFile(path.join(directory,'fixture.docx'),await zip.generateAsync({type:'nodebuffer'}));
  const content='BT /F1 12 Tf 30 120 Td (Fictional PDF contact 416-555-0101) Tj ET',objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${content.length} >>\nstream\n${content}\nendstream`];
  let pdf='%PDF-1.4\n',offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}
  const start=Buffer.byteLength(pdf);pdf+='xref\n0 6\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  await writeFile(path.join(directory,'fixture.pdf'),pdf);
  await writeServiceFixture(directory);
}
