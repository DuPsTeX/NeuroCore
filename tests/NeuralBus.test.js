// tests/NeuralBus.test.js
import assert from 'node:assert';
import { NeuralBus, SIGNALS } from '../core/NeuralBus.js';

async function testBasicEmitAndListen() {
  const bus = new NeuralBus();
  let received = null;
  bus.on(SIGNALS.SENSORY_INPUT, (data) => { received = data; });
  await bus.emit(SIGNALS.SENSORY_INPUT, { text: 'hello' });
  assert.deepStrictEqual(received, { text: 'hello' });
  console.log('PASS: testBasicEmitAndListen');
}

async function testMultipleHandlers() {
  const bus = new NeuralBus();
  const calls = [];
  bus.on(SIGNALS.MEMORY_STORE, () => calls.push('a'));
  bus.on(SIGNALS.MEMORY_STORE, () => calls.push('b'));
  await bus.emit(SIGNALS.MEMORY_STORE, {});
  assert.deepStrictEqual(calls, ['a', 'b']);
  console.log('PASS: testMultipleHandlers');
}

async function testErrorIsolation() {
  const bus = new NeuralBus();
  let secondCalled = false;
  bus.on(SIGNALS.DECAY_TICK, () => { throw new Error('intentional'); });
  bus.on(SIGNALS.DECAY_TICK, () => { secondCalled = true; });
  await bus.emit(SIGNALS.DECAY_TICK, {});
  assert.strictEqual(secondCalled, true, 'second handler runs despite first error');
  assert.strictEqual(bus.getErrors().length, 1);
  assert.strictEqual(bus.getErrors()[0].signal, SIGNALS.DECAY_TICK);
  console.log('PASS: testErrorIsolation');
}

async function testOff() {
  const bus = new NeuralBus();
  let count = 0;
  const handler = () => { count++; };
  bus.on(SIGNALS.EMOTION_TAG, handler);
  await bus.emit(SIGNALS.EMOTION_TAG, {});
  bus.off(SIGNALS.EMOTION_TAG, handler);
  await bus.emit(SIGNALS.EMOTION_TAG, {});
  assert.strictEqual(count, 1, 'handler removed after off()');
  console.log('PASS: testOff');
}

async function testSignalConstants() {
  assert.strictEqual(SIGNALS.SENSORY_INPUT, 'SENSORY_INPUT');
  assert.strictEqual(SIGNALS.CONTEXT_READY, 'CONTEXT_READY');
  assert(Object.keys(SIGNALS).length >= 9, 'at least 9 signals');
  console.log('PASS: testSignalConstants');
}

async function testNoListenersNoError() {
  const bus = new NeuralBus();
  await bus.emit('UNKNOWN_SIGNAL', { foo: 'bar' });
  assert.strictEqual(bus.getErrors().length, 0);
  console.log('PASS: testNoListenersNoError');
}

(async () => {
  await testBasicEmitAndListen();
  await testMultipleHandlers();
  await testErrorIsolation();
  await testOff();
  await testSignalConstants();
  await testNoListenersNoError();
  console.log('\n✓ All NeuralBus tests passed');
})();
