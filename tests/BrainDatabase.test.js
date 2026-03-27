// tests/BrainDatabase.test.js
import assert from 'node:assert';
import { BrainDatabase } from '../core/storage/BrainDatabase.js';

async function testOpenCreatesSchema() {
  const db = new BrainDatabase();
  await db.open('test-1');

  // Check that brain_meta table exists and has schema_version
  const version = db._getMetaValue('schema_version');
  assert.strictEqual(version, '1', `schema_version should be 1, got ${version}`);

  // Check message_count initialized
  assert.strictEqual(db.getMessageCount(), 0);

  db.close();
  console.log('PASS: testOpenCreatesSchema');
}

async function testRunAndQuery() {
  const db = new BrainDatabase();
  await db.open('test-2');

  db.run('INSERT INTO brain_meta (key, value) VALUES (?, ?)', ['test_key', 'test_value']);
  const row = db.get('SELECT value FROM brain_meta WHERE key = ?', ['test_key']);
  assert.strictEqual(row.value, 'test_value');

  db.close();
  console.log('PASS: testRunAndQuery');
}

async function testAllReturnsMultipleRows() {
  const db = new BrainDatabase();
  await db.open('test-3');

  // brain_meta should have schema_version, message_count, created_at, last_consolidation
  const rows = db.all('SELECT * FROM brain_meta');
  assert(rows.length >= 4, `expected >= 4 meta rows, got ${rows.length}`);

  db.close();
  console.log('PASS: testAllReturnsMultipleRows');
}

async function testIncrementMessageCount() {
  const db = new BrainDatabase();
  await db.open('test-4');

  assert.strictEqual(db.getMessageCount(), 0);
  assert.strictEqual(db.incrementMessageCount(), 1);
  assert.strictEqual(db.incrementMessageCount(), 2);
  assert.strictEqual(db.getMessageCount(), 2);

  db.close();
  console.log('PASS: testIncrementMessageCount');
}

async function testEpisodesTableExists() {
  const db = new BrainDatabase();
  await db.open('test-5');

  // Insert a test episode
  db.run(
    `INSERT INTO episodes (id, timestamp, content, keywords, participants, emotional_valence, decay_base_time)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['ep-1', Date.now(), 'Test episode', '["test"]', '["user"]', 0.5, 1]
  );

  const ep = db.get('SELECT * FROM episodes WHERE id = ?', ['ep-1']);
  assert.strictEqual(ep.content, 'Test episode');
  assert.strictEqual(ep.emotional_valence, 0.5);

  db.close();
  console.log('PASS: testEpisodesTableExists');
}

async function testCascadeDelete() {
  const db = new BrainDatabase();
  await db.open('test-6');

  // Insert episode + keyword
  db.run(
    `INSERT INTO episodes (id, timestamp, content, keywords, participants, emotional_valence, decay_base_time)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['ep-cascade', Date.now(), 'Cascade test', '["test"]', '["user"]', 0.5, 1]
  );
  db.run(
    'INSERT INTO episode_keywords (episode_id, keyword, is_proper_noun) VALUES (?, ?, ?)',
    ['ep-cascade', 'test', 0]
  );

  // Delete episode — keywords should cascade
  db.run('DELETE FROM episodes WHERE id = ?', ['ep-cascade']);
  const keywords = db.all('SELECT * FROM episode_keywords WHERE episode_id = ?', ['ep-cascade']);
  assert.strictEqual(keywords.length, 0, 'keywords cascaded on delete');

  db.close();
  console.log('PASS: testCascadeDelete');
}

(async () => {
  await testOpenCreatesSchema();
  await testRunAndQuery();
  await testAllReturnsMultipleRows();
  await testIncrementMessageCount();
  await testEpisodesTableExists();
  await testCascadeDelete();
  console.log('\n✓ All BrainDatabase tests passed');
})();
