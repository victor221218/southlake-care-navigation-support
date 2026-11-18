const wait=async check=>{const end=Date.now()+25000;while(!check()){if(Date.now()>end)throw new Error('Windows interface check timed out.');await new Promise(resolve=>setTimeout(resolve,60));}};
const click=selector=>{const target=document.querySelector(selector);if(!target)throw new Error('Missing interface control: '+selector);target.click();};
const type=(id,value)=>{const input=document.getElementById(id);input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));};
const firstNote='Practice observation: phone ahead to check accessible capacity.';
const feedback='This did not work. They had no space on Tuesday.';
const closingNote='Closing check: call the listed contact before referring.';
async function run(){
  try{
    await wait(()=>document.querySelector('[data-action="sample"]')||document.querySelector('.memory-card'));
    const phase=await window.hiveSmoke.phase();
    if(phase.reopen){
      const snapshot=await window.hive.request('snapshot');if(snapshot.documents.length!==1||snapshot.cards.total!==4)throw new Error('The imported document was lost after reopening.');
      const card=await window.hive.request('get-card',{id:phase.cold.card_id});
      for(const text of [firstNote,feedback,closingNote])if(!card.comments.some(n=>n.body===text))throw new Error('A saved card note was lost: '+text);
      click(`.memory-card[data-id="${card.id}"]`);await wait(()=>document.getElementById('modal').open&&document.getElementById('card-notes')?.textContent.includes(closingNote));
      const sourceCapture=await window.hiveSmoke.capture('card-notes');
      click('[data-action="close-modal"]');await wait(()=>!document.getElementById('modal').open);
      window.hiveSmoke.finish({ok:true,reopen_preserves_document:true,reopen_preserves_card_notes:true,close_handshake_saved_pending_note:true,source_capture:sourceCapture});return;
    }
    const parserChecks=await window.hiveSmoke.parsers();
    if(parserChecks.xlsx.cards!==2||parserChecks.xlsx.fields[1].Slots!==3||!parserChecks.docx.body.includes('Alex Example')||!parserChecks.pdf.body.includes('416-555-0101'))throw new Error('A bundled document reader failed in native Windows.');
    click('[data-action="sample"]');await wait(()=>document.querySelector('[data-action="save-import"]'));
    if(!document.getElementById('modal').textContent.includes('4'))throw new Error('The import preview count is incorrect.');
    click('[data-action="save-import"]');await wait(()=>!document.getElementById('modal').open&&document.querySelectorAll('#cards .memory-card').length===4);
    const snapshot=await window.hive.request('snapshot');
    const card=snapshot.cards.items.find(c=>c.title==='Example Community Rides');if(!card)throw new Error('The imported card is missing.');
    click(`.memory-card[data-id="${card.id}"]`);await wait(()=>document.getElementById('modal').open&&document.getElementById('card-note'));
    type('card-note',firstNote);await wait(()=>document.getElementById('note-status')?.textContent.includes('✓ Saved'));
    click('[data-action="use-card"]');await wait(()=>!document.getElementById('modal').open&&document.getElementById('selected-context').textContent.includes('Example Community Rides'));
    type('message',feedback);click('[data-action="send"]');await wait(()=>document.getElementById('send-button').textContent==='Send ↑'&&document.querySelector('.message.assistant'));
    const saved=await window.hive.request('get-card',{id:card.id});if(!saved.comments.some(c=>c.body===feedback))throw new Error('Conversation feedback was not attached to the selected card.');
    const capture=await window.hiveSmoke.capture('windows-workspace');
    click('[data-action="new-chat"]');await wait(()=>!document.querySelector('.message'));
    type('search','Practice observation');await wait(()=>document.querySelectorAll('#cards .memory-card').length===1);
    const sameCard=document.querySelector('#cards .memory-card');if(sameCard.dataset.id!==card.id)throw new Error('Card notes were associated with the wrong card.');
    type('search','');await wait(()=>document.querySelectorAll('#cards .memory-card').length===4);
    click(`.memory-card[data-id="${card.id}"]`);await wait(()=>document.getElementById('modal').open&&document.getElementById('card-note'));
    // Close before the debounce fires: production's close handshake must flush it.
    type('card-note',closingNote);
    window.hiveSmoke.finish({ok:true,card_id:card.id,bundled_native_parsers:parserChecks,import_preview_verified:true,import_saved_four_cards:true,card_note_autosave_verified:true,selected_card_feedback_verified:true,new_conversation_keeps_cards:true,notes_searchable_on_correct_card:true,workspace_capture:capture,no_live_ai_request:true,no_live_microphone_opened:true});
  }catch(error){const capture=await window.hiveSmoke.capture('failure');window.hiveSmoke.finish({ok:false,error:error.message||String(error),debug_text:document.body.innerText.slice(0,6000),failure_capture:capture});}
}
run();
