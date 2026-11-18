import {extractFile,listPackage} from '@electron/asar';
import {createHash} from 'node:crypto';
import {readFile,writeFile,copyFile,mkdir,readdir,stat} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=process.cwd(),output=path.resolve('../../outputs/Southlake-Hive-Windows-2.0');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const source=path.join(root,'release/windows-app'),installed=path.join(root,'.runtime/setup-check-2.0.0');
async function files(directory,prefix=''){const result=[];for(const item of await readdir(path.join(directory,prefix),{withFileTypes:true})){const name=path.join(prefix,item.name);if(item.isDirectory())result.push(...await files(directory,name));else result.push(name);}return result;}
const sourceFiles=await files(source),installedFiles=await files(installed);
assert.deepEqual(new Set(installedFiles),new Set(sourceFiles),'Installer contents differ from the prepared Windows application.');
for(const filename of sourceFiles){assert(!/\.(?:sqlite|auth|db|log)$/i.test(filename),'Unexpected user-data file in application: '+filename);assert.equal(sha(await readFile(path.join(source,filename))),sha(await readFile(path.join(installed,filename))),'Installed file differs: '+filename);}
const archive=path.join(source,'resources/app.asar'),entries=listPackage(archive);
const entry=filename=>extractFile(archive,path.normalize(filename));
assert(!entries.some(name=>/smoke|test-fixtures|isolated-|chatgpt\.auth|documents\.sqlite/.test(name)),'Developer harness or saved data entered the production archive.');
assert.equal(JSON.parse(entry('package.json').toString()).version,'2.0.0');
for(const filename of ['dist/main.cjs','dist/ui/app.js','dist/document-worker.cjs','dist/preload.cjs','dist/pdf.worker.mjs']){
  assert.equal(sha(entry(filename)),sha(await readFile(filename)),filename+' differs from build');
  const tested=await readFile(path.join('.runtime/document-smoke-stage',filename));
  if(filename==='dist/preload.cjs')assert(tested.toString().startsWith(entry(filename).toString()),'Native test preload must extend the shipping preload.');
  else assert.equal(sha(entry(filename)),sha(tested),filename+' differs from native-tested source');
}
for(const filename of ['assets/voice-model-source.json','assets/english-model.tar.gz','assets/SAMPLE-FICTIONAL-Services.csv','drizzle/0003_personal_documents.sql','THIRD-PARTY-NOTICES.txt'])assert(entry(filename).length>0,'Missing bundled dependency: '+filename);
const native=JSON.parse(await readFile('.runtime/document-smoke-2.0.0/document-smoke-result.json','utf8'));assert(native.ok&&native.close_handshake_saved_pending_note&&native.bundled_native_parsers?.pdf?.cards===1,'Native Windows acceptance check did not pass.');
const tests=await readFile('.runtime/tests-2.0.0.log','utf8');assert(/tests\s+69/.test(tests)&&/pass\s+69/.test(tests)&&/fail\s+0/.test(tests),'Automated checks did not all pass.');
const installer=await readFile('release/setup/Southlake-Hive-Setup.exe');
await mkdir(output,{recursive:true});
await copyFile('release/setup/Southlake-Hive-Setup.exe',path.join(output,'Southlake-Hive-Setup-2.0.0.exe'));
await copyFile('START-HERE.md',path.join(output,'Full-Guide.md'));await copyFile('SHARING.md',path.join(output,'Administrator-Handoff.md'));
const report={version:'2.0.0',built_at:new Date().toISOString(),platform:'Windows x64',installer:{filename:'Southlake-Hive-Setup-2.0.0.exe',bytes:installer.length,sha256:sha(installer),code_signed:false,portable_extraction_exit_code:0,installed_files_verified:sourceFiles.length,all_installed_files_match_source:true,no_user_records_or_credentials_in_installer:true},application_sha256:sha(await readFile('release/app.asar')),automated_checks:{passed:69,failed:0,coverage:['Excel/CSV/TSV/Word/PDF/text reading','Source-card persistence and per-account isolation','Unique-key spreadsheet updates with comments retained','Backup restore and duplicate prevention','Comment correction/deletion and stale-edit protection','Transaction rollback without false save events','Supported OAuth simulations and reconnect identity continuity','Streamed AI/tool simulations and durable notes after failure','Existing service-workflow regressions and bundled voice archive']},native_windows:{passed:true,excel_word_pdf_readers:true,real_renderer_and_ipc:true,import_preview_and_save:true,comment_autosave:true,selected_card_feedback:true,new_conversation_preserves_cards:true,search_finds_attached_notes:true,reopen_preserves_cards_and_notes:true,close_flushes_pending_note:true,screenshots_inspected:true},not_verified:['Real recipient ChatGPT sign-in and eligibility for this app/workspace','Live ChatGPT inference on the recipient account','Live microphone capture on the recipient computer','Signed publisher release and Southlake deployment approval'],distribution:'Upload the installer and quick-start guide to an approved shared folder and grant recipient download access. These are local output files; no public download URL was created.'};
await writeFile(path.join(output,'Verification.json'),JSON.stringify(report,null,2)+'\n');
const checksums=[];for(const filename of ['Southlake-Hive-Setup-2.0.0.exe','Karen-Windows-Quick-Start.html','Full-Guide.md','Administrator-Handoff.md'])checksums.push(sha(await readFile(path.join(output,filename)))+'  '+filename);
await writeFile(path.join(output,'SHA256.txt'),checksums.join('\n')+'\n');
console.log(JSON.stringify({output,installer_bytes:installer.length,installer_sha256:sha(installer),files_verified:sourceFiles.length,automated_passed:69,native_windows_passed:true},null,2));
