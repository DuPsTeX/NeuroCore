// tests/Amygdala.test.js
import assert from 'node:assert';
import { Amygdala } from '../core/regions/Amygdala.js';

function testHighIntensity() {
  const amygdala = new Amygdala();
  const r = amygdala.analyze('Der DRACHE hat uns ANGEGRIFFEN!! Wir müssen KÄMPFEN!!!');
  assert(r.valence > 0.3, `high-intensity → ${r.valence} > 0.3`);
  assert(r.emotions.length > 0, 'detects emotions');
  console.log('PASS: testHighIntensity');
}

function testLowIntensity() {
  const amygdala = new Amygdala();
  const r = amygdala.analyze('Es war ein ruhiger Tag. Das Wetter war angenehm.');
  assert(r.valence < 0.3, `calm text → ${r.valence} < 0.3`);
  console.log('PASS: testLowIntensity');
}

function testEmotionTypes() {
  const amygdala = new Amygdala();
  const r = amygdala.analyze('Ich liebe dich so sehr! Du machst mich glücklich!');
  const types = r.emotions.map(e => e.type);
  assert(types.includes('love') || types.includes('joy'), `detects love/joy in: ${types}`);
  console.log('PASS: testEmotionTypes');
}

function testAngerDetection() {
  const amygdala = new Amygdala();
  const r = amygdala.analyze('Dieser Verräter! Ich werde ihn vernichten! Mein Zorn kennt keine Grenzen!');
  const types = r.emotions.map(e => e.type);
  assert(types.includes('anger'), `detects anger in: ${types}`);
  console.log('PASS: testAngerDetection');
}

function testFearDetection() {
  const amygdala = new Amygdala();
  const r = amygdala.analyze('Ich habe solche Angst... Das Monster kommt näher...');
  const types = r.emotions.map(e => e.type);
  assert(types.includes('fear'), `detects fear in: ${types}`);
  console.log('PASS: testFearDetection');
}

function testClampedRange() {
  const amygdala = new Amygdala();
  const r = amygdala.analyze('AAAA!!!! HILFE!!!! TOD!!!! FEUER!!!!! BLUT!!!! AAAAA!!!!');
  assert(r.valence >= 0.0 && r.valence <= 1.0, `clamped: ${r.valence}`);
  console.log('PASS: testClampedRange');
}

function testEmptyInput() {
  const amygdala = new Amygdala();
  const r = amygdala.analyze('');
  assert.strictEqual(r.valence, 0);
  assert.strictEqual(r.emotions.length, 0);
  console.log('PASS: testEmptyInput');
}

testHighIntensity();
testLowIntensity();
testEmotionTypes();
testAngerDetection();
testFearDetection();
testClampedRange();
testEmptyInput();
console.log('\n✓ All Amygdala tests passed');
