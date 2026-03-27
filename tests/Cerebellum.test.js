// tests/Cerebellum.test.js
import assert from 'node:assert';
import { Cerebellum } from '../core/regions/Cerebellum.js';
import { BrainDatabase } from '../core/storage/BrainDatabase.js';

async function testStoreAndMatch() {
  const db = new BrainDatabase();
  await db.open('test-cere-1');
  const cere = new Cerebellum(db);

  cere.storePattern({
    trigger: 'Jemand bedroht einen Freund',
    triggerKeywords: ['bedroht', 'freund', 'angriff'],
    response: 'Stellt sich schützend davor',
    examples: ['Er stellte sich vor den Heiler'],
  });

  const matches = cere.matchPatterns(['bedroht', 'feind', 'freund']);
  assert(matches.length >= 1, 'finds matching pattern');
  assert(matches[0].response.includes('schützend'), 'correct response');

  db.close();
  console.log('PASS: testStoreAndMatch');
}

async function testStrengthIncrease() {
  const db = new BrainDatabase();
  await db.open('test-cere-2');
  const cere = new Cerebellum(db);

  const id = cere.storePattern({
    trigger: 'Kampf beginnt',
    triggerKeywords: ['kampf', 'angriff'],
    response: 'Zieht Schwert',
    examples: [],
  });

  const before = cere.getPatternById(id);
  cere.activatePattern(id);
  cere.activatePattern(id);
  cere.activatePattern(id);
  const after = cere.getPatternById(id);
  assert(after.strength > before.strength, `strength grew: ${before.strength} → ${after.strength}`);
  assert.strictEqual(after.activation_count, 3);

  db.close();
  console.log('PASS: testStrengthIncrease');
}

async function testWeakenUnused() {
  const db = new BrainDatabase();
  await db.open('test-cere-3');
  const cere = new Cerebellum(db);

  const id = cere.storePattern({
    trigger: 'Old pattern',
    triggerKeywords: ['old'],
    response: 'Old response',
    examples: [],
  });
  db.run('UPDATE procedural_patterns SET strength = 0.5, last_activated = 0 WHERE id = ?', [id]);

  cere.weakenUnused(200);
  const after = cere.getPatternById(id);
  assert(after.strength < 0.5, `weakened: ${after.strength} < 0.5`);

  db.close();
  console.log('PASS: testWeakenUnused');
}

(async () => {
  await testStoreAndMatch();
  await testStrengthIncrease();
  await testWeakenUnused();
  console.log('\n✓ All Cerebellum tests passed');
})();
