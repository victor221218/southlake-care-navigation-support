import initSqlJs from 'sql.js';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { writeFile, rename } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';

export async function openDatabase({ filename, wasm, migrations, catalog }) {
  const SQL = await initSqlJs({ wasmBinary: readFileSync(wasm) });
  const database = existsSync(filename) ? new SQL.Database(readFileSync(filename)) : new SQL.Database();
  mkdirSync(path.dirname(filename), { recursive: true });
  let diskDirty = false;
  const retry = async work => { for (let attempt = 0;; attempt++) { try { return await work(); } catch (error) { if (!['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || attempt >= 7) throw error; await delay(10 * 2 ** attempt); } } };
  const persist = async () => {
    const temporary = filename + '.next';
    const bytes = database.export();
    await retry(() => writeFile(temporary, bytes, { mode: 0o600 }));
    await retry(() => rename(temporary, filename));
    diskDirty = false;
  };
  const scope = new AsyncLocalStorage();
  let queue = Promise.resolve(), persistenceCount = 0;
  const save = async () => { diskDirty = true; await persist(); persistenceCount++; };
  const enqueue = work => { const result = queue.then(work); queue = result.catch(() => {}); return result; };
  const schedule = work => scope.getStore() ? Promise.resolve().then(work) : enqueue(work);
  database.exec('PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS local_migrations (tag TEXT PRIMARY KEY)');
  const journal = JSON.parse(readFileSync(path.join(migrations, 'meta/_journal.json'), 'utf8'));
  for (const item of journal.entries) {
    const statement = database.prepare('SELECT tag FROM local_migrations WHERE tag=?');
    statement.bind([item.tag]); const applied = statement.step(); statement.free();
    if (!applied) {
      database.exec('BEGIN');
      let committed = false;
      try {
        database.exec(readFileSync(path.join(migrations, item.tag + '.sql'), 'utf8'));
        database.run('INSERT INTO local_migrations (tag) VALUES (?)', [item.tag]);
        database.exec('COMMIT'); committed = true; await persist();
      } catch (error) { if (!committed) database.exec('ROLLBACK'); throw error; }
    }
  }
  return {
    catalog,
    get persistenceCount() { return persistenceCount; },
    async transaction(work) {
      if (scope.getStore()) return work();
      return enqueue(async () => {
        const context = { callbacks: [], dirty: false };
        database.exec('BEGIN');
        let value;
        try { value = await scope.run(context, work); database.exec('COMMIT'); }
        catch (error) { database.exec('ROLLBACK'); throw error; }
        if (context.dirty) await save();
        for (const callback of context.callbacks) callback();
        return value;
      });
    },
    afterCommit(callback) { const context = scope.getStore(); context ? context.callbacks.push(callback) : callback(); },
    flush() { return enqueue(async () => { if (diskDirty) await persist(); }); },
    prepare(sql) {
      const bound = params => ({
        bind: (...values) => bound(values),
        async all() {
          return schedule(() => {
            const statement = database.prepare(sql);
            try { statement.bind(params); const results = []; while (statement.step()) results.push(statement.getAsObject()); return { results }; }
            finally { statement.free(); }
          });
        },
        async first() { return (await this.all()).results[0] || null; },
        async run() { return schedule(async () => { database.run(sql, params); const changes = database.getRowsModified(); const context = scope.getStore(); if (context) context.dirty ||= changes > 0; else await save(); return { success: true, meta: { changes } }; }); }
      });
      return bound([]);
    },
    close() { return enqueue(async () => { if (diskDirty) await persist(); database.close(); }); }
  };
}
