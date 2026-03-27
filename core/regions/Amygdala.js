// core/regions/Amygdala.js — Emotional valence scoring
import { randomUUID } from '../utils.js';

// Emotion keyword dictionaries — German + English
const EMOTION_WORDS = {
  joy: ['freude', 'glück', 'lachen', 'fröhlich', 'froh', 'wunderbar', 'fantastisch',
        'happy', 'joy', 'laugh', 'wonderful', 'great', 'amazing', 'celebrate',
        'glücklich', 'jubel', 'begeistert', 'herrlich', 'strahlend'],
  sadness: ['trauer', 'weinen', 'verlust', 'traurig', 'schmerz', 'einsam', 'tränen',
            'sad', 'cry', 'loss', 'grief', 'lonely', 'tears', 'sorrow', 'leid',
            'kummer', 'verzweiflung', 'elend', 'trost'],
  anger: ['wut', 'zorn', 'hass', 'wütend', 'rasend', 'vernichten', 'verräter',
          'anger', 'rage', 'hate', 'fury', 'destroy', 'traitor', 'revenge',
          'ärger', 'rache', 'fluch', 'verdammt', 'töten'],
  fear: ['angst', 'furcht', 'schrecken', 'terror', 'fliehen', 'panik', 'grauen',
         'fear', 'terror', 'dread', 'panic', 'flee', 'horror', 'scared',
         'entsetzen', 'gänsehaut', 'zittern', 'dunkelheit'],
  surprise: ['überraschung', 'plötzlich', 'unerwartet', 'schock', 'staunen',
             'surprise', 'suddenly', 'unexpected', 'shock', 'amazed',
             'verblüfft', 'fassungslos', 'unglaublich'],
  love: ['liebe', 'herz', 'küssen', 'umarmen', 'zärtlich', 'innig', 'geliebte',
         'love', 'heart', 'kiss', 'embrace', 'tender', 'beloved', 'darling',
         'zuneigung', 'hingabe', 'sehnsucht', 'verliebt'],
  tension: ['spannung', 'gefahr', 'bedrohung', 'lauert', 'droht', 'krise',
            'tension', 'danger', 'threat', 'lurking', 'crisis', 'suspense',
            'vorsicht', 'alarm', 'warnung', 'falle'],
  relief: ['erleichterung', 'rettung', 'sicher', 'gerettet', 'aufatmen', 'überstanden',
           'relief', 'saved', 'safe', 'rescued', 'survived', 'phew',
           'befreit', 'erlöst', 'entwarnung'],
};

const NARRATIVE_INTENSITY = new Set([
  'kampf', 'tod', 'liebe', 'verrat', 'krieg', 'blut', 'magie', 'drache',
  'schwert', 'feuer', 'gift', 'monster', 'battle', 'death', 'betrayal',
  'war', 'blood', 'magic', 'dragon', 'sword', 'fire', 'poison', 'beast',
  'explosion', 'opfer', 'fluch', 'dunkelheit', 'schicksal', 'prophezeiung',
  'sacrifice', 'curse', 'darkness', 'destiny', 'prophecy', 'demon', 'dämon',
]);

export class Amygdala {
  analyze(text) {
    if (!text || !text.trim()) {
      return { valence: 0, emotions: [], triggers: [] };
    }

    const lower = text.toLowerCase();
    const words = lower.split(/\s+/).filter(Boolean);
    const wordCount = words.length || 1;

    // 1. Exclamation density
    const exclamations = (text.match(/!/g) || []).length;
    const exclamationDensity = Math.min(exclamations / wordCount, 1.0);

    // 2. Caps ratio (words ALL CAPS with length > 1)
    const originalWords = text.split(/\s+/).filter(Boolean);
    const capsWords = originalWords.filter(w => w.length > 1 && w === w.toUpperCase() && /[A-Z]/.test(w));
    const capsRatio = capsWords.length / wordCount;

    // 3. Emotional keywords detection
    const emotions = [];
    const triggers = [];
    let emotionalKeywordScore = 0;

    for (const [type, keywords] of Object.entries(EMOTION_WORDS)) {
      const matched = [];
      for (const kw of keywords) {
        if (lower.includes(kw)) {
          matched.push(kw);
        }
      }
      if (matched.length > 0) {
        const intensity = Math.min(matched.length * 0.25, 1.0);
        emotions.push({ type, intensity, evidence: matched.join(', ') });
        triggers.push(...matched);
        emotionalKeywordScore += matched.length;
      }
    }
    emotionalKeywordScore = Math.min(emotionalKeywordScore / wordCount * 3, 1.0);

    // 4. Narrative intensity
    let narrativeHits = 0;
    for (const w of words) {
      const clean = w.replace(/[.,!?;:'"()\[\]{}]/g, '');
      if (NARRATIVE_INTENSITY.has(clean)) narrativeHits++;
    }
    const narrativeIntensity = Math.min(narrativeHits / wordCount * 5, 1.0);

    // 5. User engagement (message length heuristic)
    const userEngagement = Math.min(text.length / 300, 1.0);

    // Valence formula from spec
    const valence = Math.max(0, Math.min(1,
      (exclamationDensity * 0.15) +
      (capsRatio * 0.1) +
      (emotionalKeywordScore * 0.35) +
      (narrativeIntensity * 0.25) +
      (userEngagement * 0.15)
    ));

    return { valence, emotions, triggers: [...new Set(triggers)] };
  }

  saveEmotionalTags(db, episodeId, emotions) {
    for (const em of emotions) {
      db.run(
        'INSERT INTO emotional_tags (id, episode_id, type, intensity, evidence) VALUES (?, ?, ?, ?, ?)',
        [randomUUID(), episodeId, em.type, em.intensity, em.evidence]
      );
    }
  }
}
