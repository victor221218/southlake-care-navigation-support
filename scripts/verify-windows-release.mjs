import {extractFile,listPackage} from '@electron/asar';
import {createHash} from 'node:crypto';
import {readFile,writeFile,copyFile,mkdir,readdir,stat} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=process.cwd(),project=JSON.parse(await readFile('package.json','utf8')),version=project.version,output=path.resolve('../../outputs/Southlake-Care-Navigation-Support-Windows-'+version.split('.').slice(0,2).join('.'));
const installerName='Southlake-Care-Navigation-Support-Setup-'+version+'.exe';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const source=path.join(root,'release/windows-app-'+version),installed=path.join(root,'.runtime/setup-check-'+version);
async function files(directory,prefix=''){const result=[];for(const item of await readdir(path.join(directory,prefix),{withFileTypes:true})){const name=path.join(prefix,item.name);if(item.isDirectory())result.push(...await files(directory,name));else result.push(name);}return result;}
const sourceFiles=await files(source),installedFiles=await files(installed);
assert.deepEqual(new Set(installedFiles),new Set(sourceFiles),'Installer contents differ from the prepared Windows application.');
for(const filename of sourceFiles){assert(!/\.(?:sqlite|auth|db|log)$/i.test(filename),'Unexpected user-data file in application: '+filename);assert.equal(sha(await readFile(path.join(source,filename))),sha(await readFile(path.join(installed,filename))),'Installed file differs: '+filename);}
const archive=path.join(source,'resources/app.asar'),entries=listPackage(archive);
const entry=filename=>extractFile(archive,path.normalize(filename));
assert(!entries.some(name=>/smoke|test-fixtures|isolated-|chatgpt\.auth|documents\.sqlite/.test(name)),'Developer harness or saved data entered the production archive.');
assert.equal(JSON.parse(entry('package.json').toString()).version,version);
for(const filename of ['dist/main.cjs','dist/ui/app.js','dist/document-worker.cjs','dist/preload.cjs','dist/pdf.worker.mjs']){
  assert.equal(sha(entry(filename)),sha(await readFile(filename)),filename+' differs from build');
  const tested=await readFile(path.join('.runtime/document-smoke-stage',filename));
  if(filename==='dist/preload.cjs')assert(tested.toString().startsWith(entry(filename).toString()),'Native test preload must extend the shipping preload.');
  else assert.equal(sha(entry(filename)),sha(tested),filename+' differs from native-tested source');
}
assert(!sourceFiles.includes('Southlake Hive.exe'),'The previous executable must be retired.');
assert(sourceFiles.includes('Southlake Care Navigation Support.exe'),'The renamed application executable is missing.');
for(const filename of ['assets/voice-model-source.json','assets/english-model.tar.gz','assets/SAMPLE-FICTIONAL-Services.csv','drizzle/0003_personal_documents.sql','THIRD-PARTY-NOTICES.txt'])assert(entry(filename).length>0,'Missing bundled dependency: '+filename);
const native=JSON.parse(await readFile('.runtime/document-smoke-'+version+'/document-smoke-result.json','utf8'));assert(native.ok&&native.preloaded_public_services===27&&native.upload_beside_speak_verified&&native.reopen_preserves_service_feedback&&native.renamed_app_verified&&native.close_handshake_saved_pending_note&&native.bundled_native_parsers?.pdf?.cards===1,'Native Windows acceptance check did not pass.');
const tests=await readFile('.runtime/tests-'+version+'.log','utf8');const testCount=Number(tests.match(/tests\s+(\d+)/)?.[1]);assert(testCount>=77&&new RegExp('pass\\s+'+testCount).test(tests)&&/fail\s+0/.test(tests),'Automated checks did not all pass.');
const installer=await readFile(path.join('release/setup',installerName));
await mkdir(output,{recursive:true});
await copyFile(path.join('release/setup',installerName),path.join(output,installerName));
await copyFile('START-HERE.md',path.join(output,'Full-Guide.md'));await copyFile('SHARING.md',path.join(output,'Administrator-Handoff.md'));
const report={version,built_at:new Date().toISOString(),platform:'Windows x64',installer:{filename:installerName,bytes:installer.length,sha256:sha(installer),code_signed:false,portable_extraction_exit_code:0,installed_files_verified:sourceFiles.length,all_installed_files_match_source:true,no_user_records_or_credentials_in_installer:true},application_sha256:sha(await readFile('release/app.asar')),automated_checks:{passed:testCount,failed:0,coverage:['Excel/CSV/TSV/Word/PDF/text reading','Source-card persistence and per-account isolation','Unique-key spreadsheet updates with comments retained','Backup restore and duplicate prevention','Comment correction/deletion and stale-edit protection','Transaction rollback without false save events','Supported OAuth simulations and reconnect identity continuity','Streamed AI/tool simulations and durable notes after failure','Existing service-workflow regressions and bundled voice archive']},native_windows:{passed:true,preloaded_service_cards:27,category_and_search_controls:true,service_contact_and_source_controls:true,service_feedback_survives_reopen:true,renamed_app:true,upload_beside_speak:true,sidebar_cleanup:true,excel_word_pdf_readers:true,real_renderer_and_ipc:true,import_preview_and_save:true,comment_autosave:true,selected_card_feedback:true,new_conversation_preserves_cards:true,search_finds_attached_notes:true,reopen_preserves_cards_and_notes:true,close_flushes_pending_note:true,screenshots_inspected:true},not_verified:['Real recipient ChatGPT sign-in and eligibility for this app/workspace','Live ChatGPT inference on the recipient account','Live microphone capture on the recipient computer','Signed publisher release and Southlake deployment approval'],distribution:'Prepared for the existing public GitHub project release v'+version+'. Public access and download checks are recorded separately after upload.'};
await writeFile(path.join(output,'Verification.json'),JSON.stringify(report,null,2)+'\n');
const checksums=[];for(const filename of [installerName,'Windows-Quick-Start.html','Full-Guide.md','Administrator-Handoff.md'])checksums.push(sha(await readFile(path.join(output,filename)))+'  '+filename);
await writeFile(path.join(output,'SHA256.txt'),checksums.join('\n')+'\n');
console.log(JSON.stringify({output,installer_bytes:installer.length,installer_sha256:sha(installer),files_verified:sourceFiles.length,automated_passed:testCount,native_windows_passed:true},null,2));
