// tests/JsonExporter.test.js
import assert from 'node:assert';
import { JsonExporter } from '../core/storage/JsonExporter.js';
import { BrainDatabase } from '../core/storage/BrainDatabase.js';
import { NeuroController } from '../core/NeuroController.js';

async function testExportAndImport() {
  // Create a brain with some data
  const neuro = new NeuroController();
  await neuro.initialize('test-export-1');
  await neuro.processMessage('Der Drache Gor griff die Taverne an!', 'user', 0);
  await neuro.processMessage('Thorin zog sein Schwert und kämpfte.', 'user', 1);

  // Export
  const exporter = new JsonExporter(neuro.db);
  const exported = exporter.exportAll();

  assert.strictEqual(exported.version, 1);
  assert(exported.episodes.length >= 2, `exported ${exported.episodes.length} episodes`);
  assert(exported.meta.message_count === '2', `message count: ${exported.meta.message_count}`);
  assert(exported.episodeKeywords.length > 0, 'has keywords');

  // Import into fresh database
  const db2 = new BrainDatabase();
  await db2.open('test-export-2');
  const importer = new JsonExporter(db2);
  importer.importAll(exported);

  // Verify imported data matches
  const episodes = db2.all('SELECT * FROM episodes');
  assert.strictEqual(episodes.length, exported.episodes.length, 'same episode count');
  const meta = db2.get("SELECT value FROM brain_meta WHERE key = 'message_count'");
  assert.strictEqual(meta.value, '2');

  await neuro.shutdown();
  db2.close();
  console.log('PASS: testExportAndImport');
}

async function testInvalidFormat() {
  const db = new BrainDatabase();
  await db.open('test-export-3');
  const exporter = new JsonExporter(db);

  try {
    exporter.importAll({ version: 99 });
    assert.fail('should throw');
  } catch (e) {
    assert(e.message.includes('unsupported version'));
  }

  db.close();
  console.log('PASS: testInvalidFormat');
}

async function testRoundtripPreservesGraph() {
  const neuro = new NeuroController();
  await neuro.initialize('test-export-4');

  // Add semantic data directly
  neuro.temporalLobe.addNode({ type: 'character', label: 'Elara', properties: { klasse: 'Heilerin' } });
  neuro.temporalLobe.addNode({ type: 'item', label: 'Mondklinge', properties: { art: 'Schwert' } });
  const n1 = neuro.temporalLobe.getNodeByLabel('Elara');
  const n2 = neuro.temporalLobe.getNodeByLabel('Mondklinge');
  neuro.temporalLobe.addEdge(n1.id, n2.id, 'besitzt', 0.9);

  const exporter = new JsonExporter(neuro.db);
  const exported = exporter.exportAll();
  assert.strictEqual(exported.semanticNodes.length, 2);
  assert.strictEqual(exported.semanticEdges.length, 1);

  // Import into fresh DB
  const db2 = new BrainDatabase();
  await db2.open('test-export-5');
  new JsonExporter(db2).importAll(exported);

  const nodes = db2.all('SELECT * FROM semantic_nodes');
  const edges = db2.all('SELECT * FROM semantic_edges');
  assert.strictEqual(nodes.length, 2, 'nodes preserved');
  assert.strictEqual(edges.length, 1, 'edges preserved');
  assert.strictEqual(edges[0].relation, 'besitzt');

  await neuro.shutdown();
  db2.close();
  console.log('PASS: testRoundtripPreservesGraph');
}

(async () => {
  await testExportAndImport();
  await testInvalidFormat();
  await testRoundtripPreservesGraph();
  console.log('\n✓ All JsonExporter tests passed');
})();
