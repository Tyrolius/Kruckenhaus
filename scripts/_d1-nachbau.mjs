/* ============================================================
 * D1-NACHBAU FÜR TESTS
 * ============================================================
 * Minimaler Ersatz für die Cloudflare-D1-Schnittstelle auf Basis von
 * node:sqlite (D1 basiert auf SQLite): prepare/bind/first/all/run und
 * batch() als Transaktion. Nur für die Tests in scripts/.
 * ============================================================ */

import { DatabaseSync } from 'node:sqlite';

export function d1Nachbau() {
  const roh = new DatabaseSync(':memory:');
  roh.exec('PRAGMA foreign_keys = ON');
  const liefertZeilen = (sql) => /^\s*select/i.test(sql) || /returning/i.test(sql);
  const ausfuehren = (sql, args) => (liefertZeilen(sql)
    ? { results: roh.prepare(sql).all(...args) }
    : { results: [], meta: roh.prepare(sql).run(...args) });
  const db = {
    prepare(sql) {
      const stmt = {
        sql, args: [],
        bind(...a) { return { ...stmt, args: a }; },
        async first() { return roh.prepare(sql).get(...this.args) ?? null; },
        async all() { return { results: roh.prepare(sql).all(...this.args) }; },
        async run() { return { meta: roh.prepare(sql).run(...this.args) }; },
      };
      return stmt;
    },
    async batch(stmts) {
      roh.exec('BEGIN');
      try {
        const erg = stmts.map((s) => ausfuehren(s.sql, s.args));
        roh.exec('COMMIT');
        return erg;
      } catch (e) { roh.exec('ROLLBACK'); throw e; }
    },
  };
  return { roh, db };
}
