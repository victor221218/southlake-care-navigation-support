const tables={card:'personal_cards',comment:'personal_comments'};
const content=value=>value==null?null:JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).filter(([k])=>!['updated_at','version'].includes(k)).sort(([a],[b])=>a.localeCompare(b))):v);
function describe(item) {
  if (!item) return null;
  const before = JSON.parse(item.before_json || 'null')?.row;
  const after = JSON.parse(item.after_json || 'null')?.row;
  const subject = (before || after)?.outcome ? 'result' : 'note';
  const ratingOnly = before && after && subject === 'result' &&
    before.outcome === after.outcome && before.body === after.body && before.rating !== after.rating;
  const detail = ratingOnly ? 'rating change' : !after ? subject + ' deletion' :
    before ? subject + ' edit' : subject;
  return {id:item.id, detail};
}
export class InputHistory {
  constructor({store}){this.store=store;}
  db(){return this.store.db();}owner(){return this.store.owner();}
  async capture(type,id){if(!tables[type])throw new Error('Unsupported saved-input type.');if(!id)return null;const row=await this.db().prepare('SELECT * FROM '+tables[type]+' WHERE id=? AND owner_id=?').bind(id,this.owner()).first();if(!row)return null;if(type==='card'&&(row.document_id||row.kind==='conversation'))throw new Error('Undo supports personal notes, messages and service feedback. Source files and saved case archives have separate controls.');const comments=type==='card'?(await this.db().prepare('SELECT * FROM personal_comments WHERE card_id=? AND owner_id=? ORDER BY id').bind(id,this.owner()).all()).results:[];return{row,comments};}
  async record({type,id=null,card_id=null,label},mutation){return this.db().transaction(async()=>{const before=await this.capture(type,id),result=await mutation(),entryId=id||result.id,after=await this.capture(type,entryId);if(content(before)===content(after))return result;await this.db().prepare('DELETE FROM personal_input_history WHERE owner_id=? AND applied=0').bind(this.owner()).run();await this.db().prepare('INSERT INTO personal_input_history(owner_id,entry_type,entry_id,card_id,label,before_json,after_json,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(this.owner(),type,entryId,card_id||after?.row.card_id||before?.row.card_id||null,label,before?JSON.stringify(before):null,after?JSON.stringify(after):null,new Date().toISOString()).run();await this.db().prepare('DELETE FROM personal_input_history WHERE owner_id=? AND id NOT IN (SELECT id FROM personal_input_history WHERE owner_id=? ORDER BY id DESC LIMIT 100)').bind(this.owner(),this.owner()).run();return result;});}
  async latest(direction, scope) {
    const undo = direction === 'undo';
    const params = [this.owner(), undo ? 1 : 0];
    let clause = '';
    if (scope?.entry_ids) {
      if (!scope.entry_ids.length) return null;
      clause = " AND entry_type='comment' AND card_id=? AND entry_id IN ("+scope.entry_ids.map(()=>'?').join(',')+")";
      params.push(scope.card_id, ...scope.entry_ids);
    } else if (scope?.card_id) {
      clause = " AND (card_id=? OR (entry_type='card' AND entry_id=?))";
      params.push(scope.card_id, scope.card_id);
    }
    return this.db().prepare('SELECT * FROM personal_input_history WHERE owner_id=? AND applied=?'+clause+
      ' ORDER BY id '+(undo?'DESC':'ASC')+' LIMIT 1').bind(...params).first();
  }
  async state(scope) {
    const undo = await this.latest('undo', scope);
    const redo = await this.latest('redo', scope);
    return scope ? {undo:describe(undo), redo:describe(redo)} : {undo:undo?.label||null, redo:redo?.label||null};
  }
  async apply(direction,{scope,expected_id}={}) {
    if (!['undo','redo'].includes(direction)) throw new Error('Choose Undo or Redo.');
    return this.db().transaction(async()=>{
    const undo = direction==='undo', item = await this.latest(direction, scope);
    if (scope && (!item || item.id !== expected_id)) throw new Error('This correction is out of date. Reopen the item and try again.');
    if (!item) throw new Error('There is nothing to '+direction+'.');
    const expected=JSON.parse((undo?item.after_json:item.before_json)||'null'),target=JSON.parse((undo?item.before_json:item.after_json)||'null'),current=await this.capture(item.entry_type,item.entry_id);
    if(content(current)!==content(expected))throw new Error('That saved item changed again. Reopen it to correct the current value.');
    const table=tables[item.entry_type],revision=Math.max(item.revision,current?.row.version||0,target?.row.version||0)+1,time=new Date().toISOString();
    if(target){if(target.row.owner_id!==this.owner()||target.row.id!==item.entry_id)throw new Error('This saved change is unavailable in your account.');if(item.entry_type==='comment')await this.store.get(target.row.card_id);const row={...target.row,version:revision,updated_at:time};if(current){const columns=Object.keys(row).filter(k=>!['id','owner_id'].includes(k));await this.db().prepare('UPDATE '+table+' SET '+columns.map(k=>k+'=?').join(',')+' WHERE id=? AND owner_id=?').bind(...columns.map(k=>row[k]),row.id,this.owner()).run();}else{const columns=Object.keys(row);await this.db().prepare('INSERT INTO '+table+' ('+columns.join(',')+') VALUES ('+columns.map(()=>'?').join(',')+')').bind(...columns.map(k=>row[k])).run();}
      if(item.entry_type==='card'){await this.db().prepare('DELETE FROM personal_comments WHERE card_id=? AND owner_id=?').bind(row.id,this.owner()).run();for(const note of target.comments){const values={...note,version:Math.max(note.version||0,revision),updated_at:time};const keys=Object.keys(values);await this.db().prepare('INSERT INTO personal_comments ('+keys.join(',')+') VALUES ('+keys.map(()=>'?').join(',')+')').bind(...keys.map(k=>values[k])).run();}}
    }else await this.db().prepare('DELETE FROM '+table+' WHERE id=? AND owner_id=?').bind(item.entry_id,this.owner()).run();
    await this.db().prepare('UPDATE personal_input_history SET applied=?,revision=? WHERE id=? AND owner_id=?').bind(undo?0:1,revision,item.id,this.owner()).run();this.store.changed({[direction]:true,card_id:item.card_id||item.entry_id});return{changed:true,label:item.label,entry_type:item.entry_type,entry_id:item.entry_id,card_id:item.card_id||item.entry_id,...await this.state(scope)};
  });}
}
