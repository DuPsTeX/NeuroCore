// tests/BasalGanglia.test.js
import assert from 'node:assert';
import { BasalGanglia } from '../core/regions/BasalGanglia.js';
import { BrainDatabase } from '../core/storage/BrainDatabase.js';

function testRewardComputation() {
  const bg = new BasalGanglia(null);
  const reward = bg.computeReward({
    userResponseLength: 200,
    avgResponseLength: 100,
    conversationContinued: true,
    emotionalEngagement: 0.8,
  });
  // (200/100)*0.4 + 0.3 + 0.8*0.3 = 0.8 + 0.3 + 0.24 = 1.34
  assert(reward > 1.0, `high engagement → reward ${reward} > 1.0`);
  console.log('PASS: testRewardComputation');
}

async function testHabitCreationAndReward() {
  const db = new BrainDatabase();
  await db.open('test-basal-1');
  const bg = new BasalGanglia(db);

  const id = bg.createHabit({ context: 'User ist traurig', behavior: 'Charakter bietet Trost' });
  assert(id, 'creates habit');

  bg.recordReward(id, 0.9);
  bg.recordReward(id, 0.8);
  bg.recordReward(id, 0.85);

  const habit = bg.getHabitById(id);
  assert(habit.average_reward > 0.7, `avg reward: ${habit.average_reward}`);
  assert(habit.strength > 0, `strength > 0: ${habit.strength}`);

  db.close();
  console.log('PASS: testHabitCreationAndReward');
}

async function testAutomaticHabits() {
  const db = new BrainDatabase();
  await db.open('test-basal-2');
  const bg = new BasalGanglia(db);

  const id = bg.createHabit({ context: 'Kampf', behavior: 'Schwert ziehen' });
  // Give it many high rewards to make it automatic
  for (let i = 0; i < 10; i++) bg.recordReward(id, 0.95);

  const automatic = bg.getAutomaticHabits();
  assert(automatic.length >= 1, 'has automatic habits');
  assert(automatic[0].strength > 0.7, `strong: ${automatic[0].strength}`);

  db.close();
  console.log('PASS: testAutomaticHabits');
}

async function testLowRewardKeepsWeak() {
  const db = new BrainDatabase();
  await db.open('test-basal-3');
  const bg = new BasalGanglia(db);

  const id = bg.createHabit({ context: 'Test', behavior: 'Weak behavior' });
  bg.recordReward(id, 0.1);
  bg.recordReward(id, 0.2);
  bg.recordReward(id, 0.15);

  const habit = bg.getHabitById(id);
  assert(habit.strength < 0.3, `weak: ${habit.strength}`);

  db.close();
  console.log('PASS: testLowRewardKeepsWeak');
}

testRewardComputation();
await testHabitCreationAndReward();
await testAutomaticHabits();
await testLowRewardKeepsWeak();
console.log('\n✓ All BasalGanglia tests passed');
