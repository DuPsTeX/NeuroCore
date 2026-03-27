// core/storage/BrainDatabase.js
import initSqlJs from '../../lib/sql-wasm-esm.js';

const SCHEMA_VERSION = 1;
const IDB_PREFIX = 'neurocore-brain-';

export class BrainDatabase {
  constructor() {
    this.db = null;
    this.chatId = null;
    this.SQL = null;
  }

  async open(chatId) {
    this.chatId = chatId;

    // Initialize sql.js WASM engine
    if (!this.SQL) {
      this.SQL = await initSqlJs({
        locateFile: (file) => {
          if (typeof window !== 'undefined') {
            return `/scripts/extensions/third-party/neurocore/lib/${file}`;
          }
          // Node.js: use fileURLToPath to get a proper OS path (avoids double C:\ on Windows)
          const url = new URL(`../../lib/${file}`, import.meta.url);
          if (url.protocol === 'file:') {
            // Convert file:///C:/... to C:\... properly
            return decodeURIComponent(url.pathname.replace(/^\/([A-Z]:)/, '$1'));
          }
          return url.pathname;
        },
      });
    }

    // Try to load existing DB from IndexedDB (browser) or memory (tests)
    const savedData = await this._loadFromStorage(chatId);
    if (savedData) {
      this.db = new this.SQL.Database(savedData);
    } else {
      this.db = new this.SQL.Database();
      await this._runMigrations();
    }

    // Enable foreign key enforcement
    this.db.run('PRAGMA foreign_keys = ON;');

    // Check schema version and migrate if needed
    const version = this._getMetaValue('schema_version');
    if (version && parseInt(version) < SCHEMA_VERSION) {
      await this._runMigrations(parseInt(version));
    }

    return this;
  }

  async _runMigrations(fromVersion = 0) {
    if (fromVersion < 1) {
      const sql = await this._loadMigration('001_initial.sql');
      this.db.exec(sql);
      this._setMeta('schema_version', String(SCHEMA_VERSION));
      this._setMeta('message_count', '0');
      this._setMeta('created_at', String(Date.now()));
      this._setMeta('last_consolidation', '0');
    }
  }

  async _loadMigration(filename) {
    if (typeof window !== 'undefined') {
      const resp = await fetch(
        `/scripts/extensions/third-party/neurocore/core/storage/migrations/${filename}`
      );
      return resp.text();
    }
    // Node.js
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const path = await import('node:path');
    const dir = path.dirname(fileURLToPath(import.meta.url));
    return readFileSync(path.join(dir, 'migrations', filename), 'utf-8');
  }

  async _loadFromStorage(chatId) {
    if (typeof window !== 'undefined' && typeof indexedDB !== 'undefined') {
      return this._idbGet(IDB_PREFIX + chatId);
    }
    return null; // Node.js tests: always start fresh
  }

  async save() {
    if (!this.db) return;
    const data = this.db.export(); // Uint8Array
    if (typeof window !== 'undefined' && typeof indexedDB !== 'undefined') {
      await this._idbSet(IDB_PREFIX + this.chatId, data);
    }
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  // --- IndexedDB helpers ---
  _idbOpen() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('neurocore', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('brains');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async _idbGet(key) {
    const idb = await this._idbOpen();
    return new Promise((resolve, reject) => {
      const tx = idb.transaction('brains', 'readonly');
      const req = tx.objectStore('brains').get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async _idbSet(key, value) {
    const idb = await this._idbOpen();
    return new Promise((resolve, reject) => {
      const tx = idb.transaction('brains', 'readwrite');
      tx.objectStore('brains').put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async _idbDelete(key) {
    const idb = await this._idbOpen();
    return new Promise((resolve, reject) => {
      const tx = idb.transaction('brains', 'readwrite');
      tx.objectStore('brains').delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // --- Query helpers ---
  run(sql, params = []) {
    this.db.run(sql, params);
  }

  get(sql, params = []) {
    const stmt = this.db.prepare(sql);
    stmt.bind(params);
    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return row;
    }
    stmt.free();
    return null;
  }

  all(sql, params = []) {
    const results = [];
    const stmt = this.db.prepare(sql);
    stmt.bind(params);
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  }

  // --- Meta helpers ---
  _getMetaValue(key) {
    const row = this.get('SELECT value FROM brain_meta WHERE key = ?', [key]);
    return row ? row.value : null;
  }

  _setMeta(key, value) {
    this.run('INSERT OR REPLACE INTO brain_meta (key, value) VALUES (?, ?)', [key, value]);
  }

  getMessageCount() {
    return parseInt(this._getMetaValue('message_count') || '0');
  }

  incrementMessageCount() {
    const count = this.getMessageCount() + 1;
    this._setMeta('message_count', String(count));
    return count;
  }

  getDbSizeBytes() {
    const data = this.db.export();
    return data.length;
  }
}
