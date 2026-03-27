// tests/DecayEngine.test.js
import assert from 'node:assert';
import { DecayEngine } from '../core/processes/DecayEngine.js';
import { BrainDatabase } from '../core/storage/BrainDatabase.js';

function testHighValenceDecaysSlowly() {
  const d = DecayEngine.computeDecay({ messagesSince: 50, valence: 0.9, retrievals: 2 });
  // importanceMultiplier = 1 + 1.8 + 1.0 = 3.8 → decay = e^(-50/(30*3.8)) = e^(-0.44) ≈ 0.64
  assert(d > 0.5, `high-valence decay at 50: ${d} > 0.5`);
  console.log('PASS: testHighValenceDecaysSlowly');
}

function testLowValenceDecaysFast() {
  const d = DecayEngine.computeDecay({ messagesSince: 50, valence: 0.1, retrievals: 0 });
  // importanceMultiplier = 1 + 0.2 + 0 = 1.2 → decay = e^(-50/36) ≈ 0.25
  assert(d < 0.4, `low-valence decay at 50: ${d} < 0.4`);
  console.log('PASS: testLowValenceDecaysFast');
}

function testFreshMemoryStrong() {
  const d = DecayEngine.computeDecay({ messagesSince: 0, valence: 0.5, retrievals: 0 });
  assert.strictEqual(d, 1.0, 'fresh memory = 1.0');
  console.log('PASS: testFreshMemoryStrong');
}

function testRetrievalSlowsDecay() {
  const noRetrieval = DecayEngine.computeDecay({ messagesSince: 100, valence: 0.5, retrievals: 0 });
  const withRetrieval = DecayEngine.computeDecay({ messagesSince: 100, valence: 0.5, retrievals: 5 });
  assert(withRetrieval > noRetrieval, `retrievals slow decay: ${withRetrieval} > ${noRetrieval}`);
  console.log('PASS: testRetrievalSlowsDecay');
}

async function testTickPrunes() {
  const db = new BrainDatabase();
  await db.open('test-decay-1');

  // Insert a very old, unimportant episode
  db.run(
    `INSERT INTO episodes (id, timestamp, content, keywords, participants, emotional_valence, decay_base_time)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['old-ep', Date.now(), 'Boring weather talk', '["weather"]', '["user"]', 0.05, 0]
  );

  // Insert a recent, important episode
  db.run(
    `INSERT INTO episodes (id, timestamp, content, keywords, participants, emotional_valence, decay_base_time)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['new-ep', Date.now(), 'Epic dragon battle', '["dragon"]', '["user"]', 0.9, 990]
  );

  const result = DecayEngine.tick(db, 1000, 0.1);
  assert(result.pruned >= 1, `pruned old episode: ${result.pruned}`);

  // Old ep should be gone
  const old = db.get('SELECT * FROM episodes WHERE id = ?', ['old-ep']);
  assert.strictEqual(old, null, 'old episode pruned');

  // New ep should still exist
  const newEp = db.get('SELECT * FROM episodes WHERE id = ?', ['new-ep']);
  assert(newEp !== null, 'new episode survived');

  db.close();
  console.log('PASS: testTickPrunes');
}

testHighValenceDecaysSlowly();
testLowValenceDecaysFast();
testFreshMemoryStrong();
testRetrievalSlowsDecay();
await testTickPrunes();
console.log('\n✓ All DecayEngine tests passed');
