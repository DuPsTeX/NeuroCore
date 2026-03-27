// tests/PrefrontalCortex.test.js
import assert from 'node:assert';
import { PrefrontalCortex } from '../core/regions/PrefrontalCortex.js';

function testRelevanceFormula() {
  const pfc = new PrefrontalCortex();
  const score = pfc.computeRelevance({
    keywordMatch: 0.8,
    emotionalValence: 0.6,
    recency: 0.5,
    retrievalFrequency: 0.2,
  });
  // 0.8*0.4 + 0.6*0.3 + 0.5*0.2 + 0.2*0.1 = 0.32 + 0.18 + 0.10 + 0.02 = 0.62
  assert(Math.abs(score - 0.62) < 0.01, `expected ~0.62, got ${score}`);
  console.log('PASS: testRelevanceFormula');
}

function testSlotLimiting() {
  const pfc = new PrefrontalCortex({ maxSlots: 3 });
  const candidates = [
    { source: 'episodic', content: 'A', relevanceScore: 0.9, tokenCost: 20 },
    { source: 'episodic', content: 'B', relevanceScore: 0.5, tokenCost: 20 },
    { source: 'semantic', content: 'C', relevanceScore: 0.7, tokenCost: 20 },
    { source: 'episodic', content: 'D', relevanceScore: 0.3, tokenCost: 20 },
  ];
  const selected = pfc.selectSlots(candidates);
  assert.strictEqual(selected.length, 3, 'respects maxSlots');
  // Semantic C gets +0.1 bonus → 0.8, so order: A(0.9), C(0.8), B(0.5)
  assert.strictEqual(selected[0].content, 'A');
  assert.strictEqual(selected[1].content, 'C');
  assert.strictEqual(selected[2].content, 'B');
  console.log('PASS: testSlotLimiting');
}

function testTokenBudgetTruncation() {
  const pfc = new PrefrontalCortex({ maxSlots: 10, tokenBudget: 30 });
  const candidates = [
    { source: 'episodic', content: 'High relevance item', relevanceScore: 0.9, tokenCost: 20 },
    { source: 'episodic', content: 'Medium item', relevanceScore: 0.7, tokenCost: 20 },
    { source: 'episodic', content: 'Low item', relevanceScore: 0.3, tokenCost: 20 },
  ];
  const selected = pfc.selectSlots(candidates);
  assert.strictEqual(selected.length, 1, 'respects token budget');
  assert.strictEqual(selected[0].content, 'High relevance item');
  console.log('PASS: testTokenBudgetTruncation');
}

function testPromptAssembly() {
  const pfc = new PrefrontalCortex();
  const prompt = pfc.assemblePromptInjection({
    episodes: [{ content: 'Kampf gegen den Drachen', emotional_valence: 0.8 }],
    semanticFacts: [{ label: 'Mondklinge', type: 'item', properties: '{"art":"Schwert"}' }],
    patterns: [{ trigger_desc: 'Bedrohung', response: 'Schützend davor stellen' }],
    emotionalState: { valence: 0.6, emotions: [{ type: 'tension', intensity: 0.7 }] },
  });
  assert(prompt.includes('[NeuroCore Memory Injection — START]'), 'has start marker');
  assert(prompt.includes('[NeuroCore Memory Injection — ENDE]'), 'has end marker');
  assert(prompt.includes('Kampf gegen den Drachen'), 'includes episode');
  assert(prompt.includes('Mondklinge'), 'includes semantic fact');
  assert(prompt.includes('Schützend davor stellen'), 'includes pattern');
  console.log('PASS: testPromptAssembly');
}

function testEstimateTokens() {
  const pfc = new PrefrontalCortex();
  const tokens = pfc.estimateTokens('Hello World');
  assert.strictEqual(tokens, Math.ceil('Hello World'.length / 3.5));
  console.log('PASS: testEstimateTokens');
}

function testEmptyAssembly() {
  const pfc = new PrefrontalCortex();
  const prompt = pfc.assemblePromptInjection({
    episodes: [],
    semanticFacts: [],
    patterns: [],
    emotionalState: null,
  });
  assert(prompt.includes('[NeuroCore Memory Injection — START]'), 'markers even when empty');
  console.log('PASS: testEmptyAssembly');
}

testRelevanceFormula();
testSlotLimiting();
testTokenBudgetTruncation();
testPromptAssembly();
testEstimateTokens();
testEmptyAssembly();
console.log('\n✓ All PrefrontalCortex tests passed');
