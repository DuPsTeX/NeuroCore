// tests/TemporalLobe.test.js
import assert from 'node:assert';
import { TemporalLobe } from '../core/regions/TemporalLobe.js';
import { BrainDatabase } from '../core/storage/BrainDatabase.js';

async function testAddAndGetNode() {
  const db = new BrainDatabase();
  await db.open('test-temp-1');
  const tl = new TemporalLobe(db);

  const id = tl.addNode({ type: 'character', label: 'Thorin', properties: { role: 'Schmied' } });
  assert(id, 'returns node id');

  const node = tl.getNodeByLabel('Thorin');
  assert.strictEqual(node.type, 'character');
  assert.deepStrictEqual(JSON.parse(node.properties), { role: 'Schmied' });

  db.close();
  console.log('PASS: testAddAndGetNode');
}

async function testDuplicateNodeIncreasesConfidence() {
  const db = new BrainDatabase();
  await db.open('test-temp-2');
  const tl = new TemporalLobe(db);

  tl.addNode({ type: 'character', label: 'Gor' });
  const before = tl.getNodeByLabel('Gor');
  tl.addNode({ type: 'character', label: 'Gor' });
  const after = tl.getNodeByLabel('Gor');
  assert(after.confidence > before.confidence, 'confidence increased');

  db.close();
  console.log('PASS: testDuplicateNodeIncreasesConfidence');
}

async function testEdges() {
  const db = new BrainDatabase();
  await db.open('test-temp-3');
  const tl = new TemporalLobe(db);

  const a = tl.addNode({ type: 'character', label: 'User' });
  const b = tl.addNode({ type: 'item', label: 'Mondklinge' });
  tl.addEdge(a, b, 'besitzt', 0.9);

  const edges = tl.getEdgesFrom(a);
  assert.strictEqual(edges.length, 1);
  assert.strictEqual(edges[0].relation, 'besitzt');
  assert.strictEqual(edges[0].weight, 0.9);

  db.close();
  console.log('PASS: testEdges');
}

async function testFindByKeyword() {
  const db = new BrainDatabase();
  await db.open('test-temp-4');
  const tl = new TemporalLobe(db);

  tl.addNode({ type: 'location', label: 'Taverne Zum Goldenen Kessel' });
  tl.addNode({ type: 'character', label: 'Harald der Wirt' });
  tl.addNode({ type: 'item', label: 'Mondklinge' });

  const results = tl.findNodes(['Taverne']);
  assert(results.length >= 1);
  assert(results[0].label.includes('Taverne'));

  db.close();
  console.log('PASS: testFindByKeyword');
}

async function testGetAllForVisualization() {
  const db = new BrainDatabase();
  await db.open('test-temp-5');
  const tl = new TemporalLobe(db);

  const a = tl.addNode({ type: 'character', label: 'A' });
  const b = tl.addNode({ type: 'item', label: 'B' });
  tl.addEdge(a, b, 'owns', 0.5);

  const { nodes, edges } = tl.getAllNodesAndEdges();
  assert.strictEqual(nodes.length, 2);
  assert.strictEqual(edges.length, 1);

  db.close();
  console.log('PASS: testGetAllForVisualization');
}

(async () => {
  await testAddAndGetNode();
  await testDuplicateNodeIncreasesConfidence();
  await testEdges();
  await testFindByKeyword();
  await testGetAllForVisualization();
  console.log('\n✓ All TemporalLobe tests passed');
})();
