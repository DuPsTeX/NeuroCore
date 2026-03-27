// core/regions/BasalGanglia.js — Habit formation + reward learning
import { randomUUID } from '../utils.js';

export class BasalGanglia {
  constructor(db) {
    this.db = db;
  }

  computeReward({ userResponseLength, avgResponseLength, conversationContinued, emotionalEngagement }) {
    const lengthRatio = avgResponseLength > 0 ? userResponseLength / avgResponseLength : 1;
    return (lengthRatio * 0.4) +
           (conversationContinued ? 0.3 : 0.0) +
           (emotionalEngagement * 0.3);
  }

  createHabit({ context, behavior }) {
    if (!this.db) return null;
    const id = randomUUID();
    this.db.run(
      'INSERT INTO habits (id, context, behavior, reward_history, average_reward, strength) VALUES (?, ?, ?, ?, 0, 0)',
      [id, context, behavior, '[]']
    );
    return id;
  }

  recordReward(habitId, reward) {
    if (!this.db) return;
    const habit = this.db.get('SELECT * FROM habits WHERE id = ?', [habitId]);
    if (!habit) return;

    const history = JSON.parse(habit.reward_history);
    history.push(reward);
    // Keep last 20
    while (history.length > 20) history.shift();

    const avg = history.reduce((s, r) => s + r, 0) / history.length;
    const strength = Math.min(avg * 0.8, 1.0); // Strength grows with consistent reward
    const isAutomatic = strength > 0.7;

    this.db.run(
      'UPDATE habits SET reward_history = ?, average_reward = ?, strength = ? WHERE id = ?',
      [JSON.stringify(history), avg, strength, habitId]
    );
  }

  getHabitById(id) {
    if (!this.db) return null;
    return this.db.get('SELECT * FROM habits WHERE id = ?', [id]);
  }

  getAutomaticHabits() {
    if (!this.db) return [];
    return this.db.all('SELECT * FROM habits WHERE strength > 0.7 ORDER BY strength DESC');
  }

  getAllHabits() {
    if (!this.db) return [];
    return this.db.all('SELECT * FROM habits ORDER BY strength DESC');
  }

  decayUnrewardedHabits() {
    if (!this.db) return;
    const habits = this.db.all('SELECT * FROM habits WHERE strength > 0');
    for (const h of habits) {
      const history = JSON.parse(h.reward_history);
      // If last 5 rewards are below 0.3, decay
      const recent = history.slice(-5);
      if (recent.length >= 5 && recent.every(r => r < 0.3)) {
        const newStrength = Math.max(h.strength - 0.05, 0);
        this.db.run('UPDATE habits SET strength = ? WHERE id = ?', [newStrength, h.id]);
      }
    }
  }
}
