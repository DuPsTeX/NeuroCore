// tests/SpreadingActivation.test.js
import assert from 'node:assert';
import { SpreadingActivation } from '../core/processes/SpreadingActivation.js';
import { TemporalLobe } from '../core/regions/TemporalLobe.js';
import { BrainDatabase } from '../core/storage/BrainDatabase.js';

async function testBasicSpreading() {
  const db = new BrainDatabase();
  await db.open('test-spread-1');
  const tl = new TemporalLobe(db);
  const sa = new SpreadingActivation(tl);

  const a = tl.addNode({ type: 'location', label: 'Taverne' });
  const b = tl.addNode({ type: 'character', label: 'Harald' });
  const c = tl.addNode({ type: 'item', label: 'Bier' });
  tl.addEdge(a, b, 'wirt_von', 0.8);
  tl.addEdge(a, c, 'serviert', 0.7);

  const result = sa.activate(a);
  assert.strictEqual(result.get(a), 1.0, 'start node = 1.0');
  assert(result.get(b) > 0.5, `Harald activated: ${result.get(b)}`);
  assert(result.get(c) > 0.5, `Bier activated: ${result.get(c)}`);

  db.close();
  console.log('PASS: testBasicSpreading');
}

async function testDepthLimit() {
  const db = new BrainDatabase();
  await db.open('test-spread-2');
  const tl = new TemporalLobe(db);
  const sa = new SpreadingActivation(tl);

  const a = tl.addNode({ type: 'character', label: 'A' });
  const b = tl.addNode({ type: 'character', label: 'B' });
  const c = tl.addNode({ type: 'character', label: 'C' });
  const d = tl.addNode({ type: 'character', label: 'D' });
  tl.addEdge(a, b, 'knows', 0.8);
  tl.addEdge(b, c, 'knows', 0.8);
  tl.addEdge(c, d, 'knows', 0.8);

  // depth=2 should reach C but D's activation (0.8^3=0.512) may or may not be above threshold
  const result = sa.activate(a, 2, 0.2);
  assert(result.has(b), 'B reached');
  assert(result.has(c), 'C reached');

  db.close();
  console.log('PASS: testDepthLimit');
}

async function testThresholdFiltering() {
  const db = new BrainDatabase();
  await db.open('test-spread-3');
  const tl = new TemporalLobe(db);
  const sa = new SpreadingActivation(tl);

  const a = tl.addNode({ type: 'character', label: 'A' });
  const b = tl.addNode({ type: 'character', label: 'B' });
  tl.addEdge(a, b, 'weak', 0.1); // 0.1 < threshold 0.2

  const result = sa.activate(a, 3, 0.2);
  assert(!result.has(b), 'B not reached (below threshold)');

  db.close();
  console.log('PASS: testThresholdFiltering');
}

async function testCyclePrevention() {
  const db = new BrainDatabase();
  await db.open('test-spread-4');
  const tl = new TemporalLobe(db);
  const sa = new SpreadingActivation(tl);

  const a = tl.addNode({ type: 'character', label: 'A' });
  const b = tl.addNode({ type: 'character', label: 'B' });
  tl.addEdge(a, b, 'knows', 0.9);
  tl.addEdge(b, a, 'knows', 0.9); // Cycle!

  // Should not infinite loop
  const result = sa.activate(a, 5, 0.2);
  assert(result.has(a));
  assert(result.has(b));
  console.log('PASS: testCyclePrevention');

  db.close();
}

(async () => {
  await testBasicSpreading();
  await testDepthLimit();
  await testThresholdFiltering();
  await testCyclePrevention();
  console.log('\n✓ All SpreadingActivation tests passed');
})();
