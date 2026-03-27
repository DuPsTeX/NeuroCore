// tests/Hippocampus.test.js
import assert from 'node:assert';
import { Hippocampus } from '../core/regions/Hippocampus.js';
import { BrainDatabase } from '../core/storage/BrainDatabase.js';

async function testStoreAndRecall() {
  const db = new BrainDatabase();
  await db.open('test-hippo-1');
  const hippo = new Hippocampus(db);

  const id = hippo.storeEpisode({
    content: 'Der Drache Gor griff die Stadt an',
    participants: ['user', 'Gor'],
    emotionalValence: 0.8,
    messageCount: 1,
  });
  assert(id, 'returns episode id');

  const results = hippo.recall(['drache', 'gor'], 2);
  assert.strictEqual(results.length, 1);
  assert(results[0].content.includes('Drache'));
  assert.strictEqual(results[0].emotional_valence, 0.8);

  db.close();
  console.log('PASS: testStoreAndRecall');
}

async function testRetrievalCountUpdates() {
  const db = new BrainDatabase();
  await db.open('test-hippo-2');
  const hippo = new Hippocampus(db);

  hippo.storeEpisode({
    content: 'Thorin verkaufte ein Schwert',
    participants: ['user', 'Thorin'],
    emotionalValence: 0.4,
    messageCount: 1,
  });

  hippo.recall(['thorin'], 2);
  hippo.recall(['thorin'], 3);
  hippo.recall(['thorin'], 4);
  // Verify via direct DB query after all recalls
  const ep = db.get('SELECT retrieval_count FROM episodes LIMIT 1');
  assert.strictEqual(ep.retrieval_count, 3);

  db.close();
  console.log('PASS: testRetrievalCountUpdates');
}

async function testRecallOrderByRelevance() {
  const db = new BrainDatabase();
  await db.open('test-hippo-3');
  const hippo = new Hippocampus(db);

  hippo.storeEpisode({ content: 'Langweiliger Regen fiel', participants: ['user'], emotionalValence: 0.1, messageCount: 1 });
  hippo.storeEpisode({ content: 'Drachen Kampf episch feurig', participants: ['user'], emotionalValence: 0.9, messageCount: 2 });
  hippo.storeEpisode({ content: 'Drachen fliegen über Stadt', participants: ['user'], emotionalValence: 0.5, messageCount: 3 });

  const results = hippo.recall(['drachen'], 4);
  assert(results.length >= 2, 'finds dragon episodes');
  assert(results[0].emotional_valence >= results[1].emotional_valence, 'sorted by relevance');

  db.close();
  console.log('PASS: testRecallOrderByRelevance');
}

async function testGetUnconsolidated() {
  const db = new BrainDatabase();
  await db.open('test-hippo-4');
  const hippo = new Hippocampus(db);

  hippo.storeEpisode({ content: 'Episode eins hier', participants: ['user'], emotionalValence: 0.5, messageCount: 1 });
  hippo.storeEpisode({ content: 'Episode zwei dort', participants: ['user'], emotionalValence: 0.5, messageCount: 2 });

  const unconsolidated = hippo.getUnconsolidated();
  assert.strictEqual(unconsolidated.length, 2);

  hippo.markConsolidated([unconsolidated[0].id]);
  assert.strictEqual(hippo.getUnconsolidated().length, 1);

  db.close();
  console.log('PASS: testGetUnconsolidated');
}

(async () => {
  await testStoreAndRecall();
  await testRetrievalCountUpdates();
  await testRecallOrderByRelevance();
  await testGetUnconsolidated();
  console.log('\n✓ All Hippocampus tests passed');
})();
