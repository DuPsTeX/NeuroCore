// tests/PlotGenerator.test.js
import assert from 'node:assert';
import { PlotGenerator } from '../core/PlotGenerator.js';
import { BrainDatabase } from '../core/storage/BrainDatabase.js';
import { Hippocampus } from '../core/regions/Hippocampus.js';
import { TemporalLobe } from '../core/regions/TemporalLobe.js';
import { Amygdala } from '../core/regions/Amygdala.js';
import { Cerebellum } from '../core/regions/Cerebellum.js';
import { BasalGanglia } from '../core/regions/BasalGanglia.js';
import { SpreadingActivation } from '../core/processes/SpreadingActivation.js';

async function setupTestEnvironment(chatId) {
  const db = new BrainDatabase();
  await db.open(chatId);
  
  const hippocampus = new Hippocampus(db);
  const temporalLobe = new TemporalLobe(db);
  const amygdala = new Amygdala();
  const cerebellum = new Cerebellum(db);
  const basalGanglia = new BasalGanglia(db);
  const spreadingActivation = new SpreadingActivation(temporalLobe);
  
  // Mock LLM callback for testing
  const llmCallback = async (prompt) => {
    // Return a simple mock plot
    return `Der User und der Charakter haben über das Wetter gesprochen. 
Es war ein freundliches Gespräch mit positiver Stimmung.`;
  };
  
  const plotGenerator = new PlotGenerator({
    db,
    hippocampus,
    temporalLobe,
    cerebellum,
    basalGanglia,
    amygdala,
    spreadingActivation,
    llmCallback,
  });
  
  return { db, hippocampus, temporalLobe, amygdala, plotGenerator };
}

async function testBasicPlotGeneration() {
  const { db, hippocampus, temporalLobe, plotGenerator } = 
    await setupTestEnvironment('test-plot-1');
  
  // Setup some test data
  hippocampus.storeEpisode({
    content: 'User fragt nach dem Wetter',
    participants: ['user'],
    emotionalValence: 0.5,
    messageCount: 1,
  });
  
  hippocampus.storeEpisode({
    content: 'Charakter sagt es ist sonnig',
    participants: ['character'],
    emotionalValence: 0.7,
    messageCount: 2,
  });
  
  temporalLobe.addNode({
    type: 'character',
    label: 'Emma',
    properties: { rolle: 'Freundin', trait: 'freundlich' },
    confidence: 0.8,
  });
  
  // Generate plot
  const plot = await plotGenerator.generatePlot(['wetter', 'sonnig'], 3);
  
  assert(plot, 'plot should be generated');
  assert(plot.length > 0, 'plot should not be empty');
  assert(plot.includes('[NeuroCore Plot Memory'), 'plot should have markers');
  
  db.close();
  console.log('PASS: testBasicPlotGeneration');
}

async function testPlotWithoutLLM() {
  const { db, hippocampus, temporalLobe } = 
    await setupTestEnvironment('test-plot-2');
  
  // Create PlotGenerator without LLM callback (fallback mode)
  const plotGenerator = new PlotGenerator({
    db,
    hippocampus,
    temporalLobe,
    cerebellum: { matchPatterns: () => [] },
    basalGanglia: db,
    amygdala: new Amygdala(),
    spreadingActivation: new SpreadingActivation(temporalLobe),
    llmCallback: null, // No LLM
  });
  
  // Setup test data
  hippocampus.storeEpisode({
    content: 'User erwähnt den Park',
    participants: ['user'],
    emotionalValence: 0.6,
    messageCount: 1,
  });
  
  temporalLobe.addNode({
    type: 'location',
    label: 'Park',
    properties: {},
    confidence: 0.9,
  });
  
  // Generate plot (should use fallback)
  const plot = await plotGenerator.generatePlot(['park'], 2);
  
  assert(plot, 'fallback plot should be generated');
  assert(plot.includes('Plot Memory'), 'should contain plot memory marker');
  
  db.close();
  console.log('PASS: testPlotWithoutLLM');
}

async function testRelevanceScoring() {
  const { db, hippocampus, plotGenerator } = 
    await setupTestEnvironment('test-plot-3');
  
  // Store episodes with varying relevance
  const id1 = hippocampus.storeEpisode({
    content: 'Drache greift die Stadt an',
    participants: ['user', 'Drache'],
    emotionalValence: 0.9, // High emotional
    messageCount: 1,
  });
  
  const id2 = hippocampus.storeEpisode({
    content: 'User kauft Brot',
    participants: ['user'],
    emotionalValence: 0.2, // Low emotional
    messageCount: 2,
  });
  
  // Mark first episode as retrieved multiple times
  for (let i = 0; i < 5; i++) {
    db.run('UPDATE episodes SET retrieval_count = retrieval_count + 1 WHERE id = ?', [id1]);
  }
  
  // Generate plot with 'drache' keyword
  const plot = await plotGenerator.generatePlot(['drache', 'angriff'], 3);
  
  assert(plot, 'plot should be generated');
  // The plot should prefer the high-relevance dragon episode
  assert(plot.toLowerCase().includes('drache') || plot.toLowerCase().includes('stadt'),
    'plot should include relevant content');
  
  db.close();
  console.log('PASS: testRelevanceScoring');
}

async function testCaching() {
  const { db, hippocampus, plotGenerator } = 
    await setupTestEnvironment('test-plot-4');
  
  hippocampus.storeEpisode({
    content: 'Test episode für Cache',
    participants: ['user'],
    emotionalValence: 0.5,
    messageCount: 1,
  });
  
  // Generate plot
  const plot1 = await plotGenerator.generatePlot(['test'], 2);
  assert(plotGenerator.isCacheValid(), 'cache should be valid after generation');
  
  // Get cached plot
  const cachedPlot = plotGenerator.getCachedPlot();
  assert.strictEqual(cachedPlot, plot1, 'cached plot should match original');
  
  // Invalidate cache
  plotGenerator.invalidateCache();
  assert(!plotGenerator.isCacheValid(), 'cache should be invalid after invalidation');
  
  db.close();
  console.log('PASS: testCaching');
}

async function testOldSignificantMemories() {
  const { db, hippocampus, plotGenerator } = 
    await setupTestEnvironment('test-plot-5');
  
  // Create an old, highly emotional memory
  hippocampus.storeEpisode({
    content: 'Wichtiges Ereignis aus der Vergangenheit',
    participants: ['user', 'character'],
    emotionalValence: 0.95, // Very high
    messageCount: 1,
  });
  
  // Create recent, less important memories
  for (let i = 50; i < 60; i++) {
    hippocampus.storeEpisode({
      content: `Unwichtige Nachricht ${i}`,
      participants: ['user'],
      emotionalValence: 0.3,
      messageCount: i,
    });
  }
  
  // Generate plot - should include old significant memory
  const plot = await plotGenerator.generatePlot(['ereignis'], 60, {
    timeSpanMessages: 100,
  });
  
  assert(plot, 'plot should be generated');
  // Old memory should be included due to high emotional valence
  
  db.close();
  console.log('PASS: testOldSignificantMemories');
}

async function testStructureAnalysis() {
  const { db, hippocampus, temporalLobe, plotGenerator } = 
    await setupTestEnvironment('test-plot-6');
  
  // Create episodes with timeline
  for (let i = 1; i <= 30; i += 10) {
    hippocampus.storeEpisode({
      content: `Ereignis zur Zeit ${i}`,
      participants: ['user'],
      emotionalValence: 0.6,
      messageCount: i,
    });
  }
  
  // Add characters and locations
  temporalLobe.addNode({
    type: 'character',
    label: 'Anna',
    properties: { rolle: 'Heldin' },
    confidence: 0.9,
  });
  
  temporalLobe.addNode({
    type: 'location',
    label: 'Wald',
    properties: {},
    confidence: 0.8,
  });
  
  // Generate plot
  const plot = await plotGenerator.generatePlot(['ereignis'], 31);
  
  assert(plot, 'plot should be generated');
  
  db.close();
  console.log('PASS: testStructureAnalysis');
}

// Run all tests
async function runAll() {
  console.log('\n=== PlotGenerator Tests ===\n');
  try {
    await testBasicPlotGeneration();
    await testPlotWithoutLLM();
    await testRelevanceScoring();
    await testCaching();
    await testOldSignificantMemories();
    await testStructureAnalysis();
    console.log('\n✓ All PlotGenerator tests passed\n');
  } catch (err) {
    console.error('\n✗ Test failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

runAll();
