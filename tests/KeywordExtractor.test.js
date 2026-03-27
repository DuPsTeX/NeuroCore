// tests/KeywordExtractor.test.js
import assert from 'node:assert';
import { extractKeywords, keywordMatch, computeRecency } from '../core/KeywordExtractor.js';

function testBasicExtraction() {
  const result = extractKeywords('Der große Drache Gor griff die Taverne an');
  const words = result.map(k => k.word);
  assert(words.includes('drache'), 'includes "drache"');
  assert(words.includes('taverne'), 'includes "taverne"');
  assert(!words.includes('der'), 'excludes stopword "der"');
  assert(!words.includes('die'), 'excludes stopword "die"');
  console.log('PASS: testBasicExtraction');
}

function testProperNouns() {
  const result = extractKeywords('Thorin ging zum Marktplatz in Gondor');
  const proper = result.filter(k => k.isProperNoun).map(k => k.word);
  assert(proper.includes('thorin'), 'detects Thorin');
  assert(proper.includes('gondor'), 'detects Gondor');
  console.log('PASS: testProperNouns');
}

function testJaccardSimilarity() {
  const a = extractKeywords('Der Drache Gor griff an');
  const b = extractKeywords('Gor der Drache wurde besiegt');
  const score = keywordMatch(a, b);
  assert(score > 0.3, `shared drache+gor → score ${score} > 0.3`);
  assert(score < 1.0, `not identical → score ${score} < 1.0`);
  console.log('PASS: testJaccardSimilarity');
}

function testProperNounBonus() {
  const a = extractKeywords('Thorin ist stark');
  const b = extractKeywords('Thorin kämpfte gut');
  const score = keywordMatch(a, b);
  assert(score >= 0.4, `proper noun bonus → score ${score} >= 0.4`);
  console.log('PASS: testProperNounBonus');
}

function testMaxKeywords() {
  const longText = 'Alpha Beta Gamma Delta Epsilon Zeta Eta Theta Iota Kappa Lambda Mu';
  const result = extractKeywords(longText);
  assert(result.length <= 10, `max 10 keywords, got ${result.length}`);
  console.log('PASS: testMaxKeywords');
}

function testEmptyInput() {
  assert.deepStrictEqual(extractKeywords(''), []);
  assert.deepStrictEqual(extractKeywords('   '), []);
  console.log('PASS: testEmptyInput');
}

function testRecency() {
  assert.strictEqual(computeRecency(0), 1.0);
  assert(Math.abs(computeRecency(50) - 0.5) < 0.01);
  assert(computeRecency(200) < 0.25);
  console.log('PASS: testRecency');
}

testBasicExtraction();
testProperNouns();
testJaccardSimilarity();
testProperNounBonus();
testMaxKeywords();
testEmptyInput();
testRecency();
console.log('\n✓ All KeywordExtractor tests passed');
