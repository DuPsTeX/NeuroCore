// tests/NeuroController.test.js
import assert from 'node:assert';
import { NeuroController } from '../core/NeuroController.js';

async function testBasicPipeline() {
  const neuro = new NeuroController();
  await neuro.initialize('test-integration-1');

  await neuro.processMessage('Der Drache Gor griff die Stadt an!', 'user', 0);
  await neuro.processMessage('Wir müssen ihn bekämpfen mit der Mondklinge!', 'user', 1);
  await neuro.processMessage('Der Kampf war hart aber wir haben gesiegt.', 'character', 2);

  const status = neuro.getStatus();
  assert.strictEqual(status.hippocampus.episodes, 3, '3 episodes stored');
  assert.strictEqual(status.messageCount, 3);

  const injection = neuro.getPromptInjection(4096);
  assert(injection.length > 0, 'prompt injection generated');
  assert(injection.includes('NeuroCore Memory Injection'), 'has injection markers');

  await neuro.shutdown();
  console.log('PASS: testBasicPipeline');
}

async function testEmotionalValenceStored() {
  const neuro = new NeuroController();
  await neuro.initialize('test-integration-2');

  await neuro.processMessage('HILFE!! Der DRACHE greift an!! FEUER!!!', 'user', 0);
  await neuro.processMessage('Es regnet leise.', 'user', 1);

  const episodes = neuro.db.all('SELECT * FROM episodes ORDER BY timestamp');
  assert(episodes[0].emotional_valence > episodes[1].emotional_valence,
    `dragon episode more intense: ${episodes[0].emotional_valence} > ${episodes[1].emotional_valence}`);

  await neuro.shutdown();
  console.log('PASS: testEmotionalValenceStored');
}

async function testSwitchChat() {
  const neuro = new NeuroController();
  await neuro.initialize('test-chat-a');
  await neuro.processMessage('Chat A content', 'user', 0);
  assert.strictEqual(neuro.getStatus().messageCount, 1);

  await neuro.switchChat('test-chat-b');
  assert.strictEqual(neuro.getStatus().messageCount, 0, 'new chat starts fresh');
  await neuro.processMessage('Chat B content', 'user', 0);
  assert.strictEqual(neuro.getStatus().messageCount, 1);

  await neuro.shutdown();
  console.log('PASS: testSwitchChat');
}

async function testMessageDeleted() {
  const neuro = new NeuroController();
  await neuro.initialize('test-integration-3');

  const epId = await neuro.processMessage('Diese Nachricht wird gelöscht', 'user', 0);
  assert.strictEqual(neuro.getStatus().hippocampus.episodes, 1);

  neuro.handleMessageDeleted(epId);
  assert.strictEqual(neuro.getStatus().hippocampus.episodes, 0, 'episode deleted');

  await neuro.shutdown();
  console.log('PASS: testMessageDeleted');
}

async function testPromptInjectionTruncation() {
  const neuro = new NeuroController();
  await neuro.initialize('test-integration-4');

  // Generate enough content
  for (let i = 0; i < 5; i++) {
    await neuro.processMessage(`Nachricht ${i}: Lorem ipsum dolor sit amet, Drache Gor kämpfte weiter`, 'user', i);
  }

  // Very tight token budget → should truncate
  const injection = neuro.getPromptInjection(100);
  const estimated = neuro.pfc.estimateTokens(injection);
  assert(estimated <= 100, `fits in budget: ${estimated} <= 100`);

  await neuro.shutdown();
  console.log('PASS: testPromptInjectionTruncation');
}

(async () => {
  await testBasicPipeline();
  await testEmotionalValenceStored();
  await testSwitchChat();
  await testMessageDeleted();
  await testPromptInjectionTruncation();
  console.log('\n✓ All NeuroController tests passed');
})();
