// tests/Consolidation.test.js
import assert from 'node:assert';
import { Consolidation } from '../core/processes/Consolidation.js';
import { Hippocampus } from '../core/regions/Hippocampus.js';
import { TemporalLobe } from '../core/regions/TemporalLobe.js';
import { BrainDatabase } from '../core/storage/BrainDatabase.js';

async function testDeepSleepConsolidation() {
  const db = new BrainDatabase();
  await db.open('test-consol-1');
  const hippo = new Hippocampus(db);
  const temporal = new TemporalLobe(db);

  // Store related episodes (share keywords)
  hippo.storeEpisode({ content: 'Drache Gor griff die Stadt an', participants: ['user', 'Gor'], emotionalValence: 0.8, messageCount: 1 });
  hippo.storeEpisode({ content: 'Drache Gor wurde verwundet', participants: ['user', 'Gor'], emotionalValence: 0.7, messageCount: 2 });
  hippo.storeEpisode({ content: 'Drache Gor floh in die Berge', participants: ['user', 'Gor'], emotionalValence: 0.6, messageCount: 3 });

  const consol = new Consolidation({ db, hippocampus: hippo, temporal });
  await consol.phase2DeepSleep(10);

  // Check consolidated memories were created
  const consolidated = db.all('SELECT * FROM consolidated_memories');
  assert(consolidated.length >= 1, `created consolidated memory: ${consolidated.length}`);
  assert(consolidated[0].summary.length > 0, 'has summary');

  // Source episodes should be marked consolidated
  const unconsolidated = hippo.getUnconsolidated();
  assert.strictEqual(unconsolidated.length, 0, 'all marked consolidated');

  db.close();
  console.log('PASS: testDeepSleepConsolidation');
}

async function testTooFewEpisodes() {
  const db = new BrainDatabase();
  await db.open('test-consol-2');
  const hippo = new Hippocampus(db);
  const temporal = new TemporalLobe(db);

  hippo.storeEpisode({ content: 'Einzelne Episode hier', participants: ['user'], emotionalValence: 0.5, messageCount: 1 });

  const consol = new Consolidation({ db, hippocampus: hippo, temporal });
  await consol.phase2DeepSleep(5);

  // Should not consolidate with only 1 episode
  const consolidated = db.all('SELECT * FROM consolidated_memories');
  assert.strictEqual(consolidated.length, 0);

  db.close();
  console.log('PASS: testTooFewEpisodes');
}

async function testFullCycle() {
  const db = new BrainDatabase();
  await db.open('test-consol-3');
  const hippo = new Hippocampus(db);
  const temporal = new TemporalLobe(db);

  hippo.storeEpisode({ content: 'Thorin schmiedete das Schwert', participants: ['user', 'Thorin'], emotionalValence: 0.6, messageCount: 1 });
  hippo.storeEpisode({ content: 'Thorin gab das Schwert weiter', participants: ['user', 'Thorin'], emotionalValence: 0.5, messageCount: 2 });
  hippo.storeEpisode({ content: 'Thorin verließ die Schmiede', participants: ['user', 'Thorin'], emotionalValence: 0.4, messageCount: 3 });

  const consol = new Consolidation({ db, hippocampus: hippo, temporal });
  await consol.runFullCycle(10);

  // Check consolidation log
  const logs = db.all('SELECT * FROM consolidation_log ORDER BY id');
  assert(logs.length >= 3, `3 phases logged: ${logs.length}`);

  db.close();
  console.log('PASS: testFullCycle');
}

async function testProperNounsAddedToGraph() {
  const db = new BrainDatabase();
  await db.open('test-consol-4');
  const hippo = new Hippocampus(db);
  const temporal = new TemporalLobe(db);

  hippo.storeEpisode({ content: 'Elara kämpfte neben Thorin', participants: ['Elara', 'Thorin'], emotionalValence: 0.7, messageCount: 1 });
  hippo.storeEpisode({ content: 'Elara rettete Thorin vor dem Drachen', participants: ['Elara', 'Thorin'], emotionalValence: 0.8, messageCount: 2 });
  hippo.storeEpisode({ content: 'Elara und Thorin flohen zusammen', participants: ['Elara', 'Thorin'], emotionalValence: 0.6, messageCount: 3 });

  const consol = new Consolidation({ db, hippocampus: hippo, temporal });
  await consol.phase2DeepSleep(10);

  // Proper nouns should have been added to the semantic graph
  const elara = temporal.getNodeByLabel('Elara');
  const thorin = temporal.getNodeByLabel('Thorin');
  assert(elara !== null, 'Elara added to graph');
  assert(thorin !== null, 'Thorin added to graph');

  db.close();
  console.log('PASS: testProperNounsAddedToGraph');
}

(async () => {
  await testDeepSleepConsolidation();
  await testTooFewEpisodes();
  await testFullCycle();
  await testProperNounsAddedToGraph();
  console.log('\n✓ All Consolidation tests passed');
})();
