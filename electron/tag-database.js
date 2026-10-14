import { compose } from 'node:stream';
import { DatabaseSync } from 'node:sqlite';
import { createReadStream } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { parse } from 'csv-parse';

export const normalize = value => String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
export class TagDatabase {
  constructor(file) {
    this.db = new DatabaseSync(file);
    this.db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS tags(name TEXT PRIMARY KEY, category INTEGER, post_count INTEGER);
      CREATE TABLE IF NOT EXISTS aliases(name TEXT PRIMARY KEY, target TEXT);
      CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY, value TEXT);
      CREATE VIRTUAL TABLE IF NOT EXISTS tag_search USING fts5(name, tokenize='unicode61');`);
  }
  close() { this.db.close(); }
  status() {
    return { tags: this.db.prepare('SELECT count(*) AS n FROM tags').get().n,
      aliases: this.db.prepare('SELECT count(*) AS n FROM aliases').get().n,
      importedAt: this.db.prepare("SELECT value FROM metadata WHERE key='importedAt'").get()?.value };
  }
  resolve(value) {
    let name = normalize(value);
    const seen = new Set();
    for (let i = 0; i < 20 && !seen.has(name); i++) {
      seen.add(name);
      const alias = this.db.prepare('SELECT target FROM aliases WHERE name=?').get(name);
      if (alias) { name = alias.target; continue; }
      const tag = this.db.prepare('SELECT * FROM tags WHERE name=?').get(name);
      return tag ? { ...tag, alias: normalize(value) !== name ? normalize(value) : null } : null;
    }
    return null;
  }
  candidates(terms) {
    const found = new Map();
    for (const term of terms.slice(0, 12)) {
      const exact = this.resolve(term);
      if (exact) found.set(exact.name, exact);
      const tokens = normalize(term).match(/[\p{L}\p{N}]+/gu) || [];
      if (!tokens.length) continue;
      const match = tokens.slice(0, 8).map(t => `"${t}"`).join(' AND ');
      const rows = this.db.prepare(`SELECT tags.* FROM tag_search JOIN tags ON tags.name=tag_search.name
        WHERE tag_search MATCH ? ORDER BY rank LIMIT 12`).all(match);
      for (const row of rows) found.set(row.name, row);
    }
    return [...found.values()].slice(0, 80);
  }
  async importFiles(tagsFile, aliasesFile) {
    const read = file => {
      return compose(createReadStream(file), ...(file.endsWith('.gz') ? [createGunzip()] : []), parse({ columns: true, bom: true, max_record_size: 1024 * 1024 }));
    };
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.exec('DELETE FROM tags; DELETE FROM aliases; DELETE FROM tag_search;');
      const tagInsert = this.db.prepare('INSERT OR REPLACE INTO tags VALUES(?,?,?)');
      const aliasInsert = this.db.prepare('INSERT OR REPLACE INTO aliases VALUES(?,?)');
      let count = 0;
      for await (const row of read(tagsFile)) {
        if (!row.name || !/^\d+$/.test(row.category) || !/^\d+$/.test(row.post_count)) throw new Error('Tags CSV 需要 name/category/post_count 列');
        if (['true', 't', '1'].includes(row.is_deprecated)) continue;
        tagInsert.run(normalize(row.name), Number(row.category), Number(row.post_count)); count++;
      }
      if (!count) throw new Error('标签文件为空');
      for await (const row of read(aliasesFile)) {
        if (!row.antecedent_name || !row.consequent_name || !row.status) throw new Error('Aliases CSV 需要 antecedent_name/consequent_name/status 列');
        if (row.status === 'active') aliasInsert.run(normalize(row.antecedent_name), normalize(row.consequent_name));
      }
      this.db.exec('INSERT INTO tag_search(name) SELECT name FROM tags;');
      this.db.prepare('INSERT OR REPLACE INTO metadata VALUES(?,?)').run('importedAt', new Date().toISOString());
      this.db.exec('COMMIT');
      return this.status();
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
}

export function validateSelection(db, selection, candidates) {
  if (!selection || !Array.isArray(selection.tags) || selection.tags.length > 12) throw new Error('模型返回格式错误，请尝试其他模型');
  const allowed = new Set(candidates.map(t => t.name));
  const tags = [], rejected = [];
  for (const name of selection.tags) {
    const tag = typeof name === 'string' ? db.resolve(name) : null;
    if (!tag || !allowed.has(tag.name)) rejected.push(String(name));
    else if (!tags.some(t => t.name === tag.name)) tags.push(tag);
  }
  // Never present a partial combination as a complete translation.
  if (rejected.length) return { kind: 'not-found', tags: [], rejected };
  return { kind: tags.length > 1 ? 'combination' : tags.length ? 'suggestion' : 'not-found', tags, rejected };
}

