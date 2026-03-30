// core/KeywordExtractor.js — Keyword extraction, Jaccard similarity, recency

const STOPWORDS = new Set([
  // German
  'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einer', 'einem',
  'einen', 'und', 'oder', 'aber', 'ist', 'sind', 'war', 'hat', 'haben',
  'wird', 'werden', 'kann', 'nicht', 'auch', 'sich', 'mit', 'auf', 'für',
  'von', 'zu', 'an', 'in', 'aus', 'bei', 'nach', 'über', 'um', 'als',
  'wie', 'noch', 'nur', 'schon', 'dann', 'wenn', 'so', 'sehr', 'es',
  'ich', 'du', 'er', 'sie', 'wir', 'ihr', 'mein', 'dein', 'sein',
  'ihr', 'unser', 'euer', 'dass', 'diese', 'dieser', 'diesem', 'diesen',
  'zum', 'zur', 'ins', 'im', 'am', 'ans', 'vom', 'beim', 'aufs',
  'wurde', 'würde', 'hätte', 'könnte', 'sollte', 'möchte', 'müsste',
  'hier', 'dort', 'jetzt', 'nun', 'mal', 'doch', 'eben', 'ja', 'nein',
  'mehr', 'etwas', 'alles', 'nichts', 'was', 'wer', 'wo', 'wann',
  // English
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'not', 'and', 'but', 'or',
  'if', 'then', 'so', 'as', 'of', 'at', 'by', 'for', 'with', 'about',
  'to', 'from', 'in', 'on', 'up', 'out', 'it', 'its', 'he', 'she',
  'they', 'we', 'you', 'i', 'my', 'your', 'his', 'her', 'our', 'their',
  'this', 'that', 'these', 'those', 'what', 'which', 'who', 'whom',
  'there', 'here', 'when', 'where', 'how', 'all', 'each', 'every',
  'both', 'few', 'more', 'most', 'some', 'any', 'no', 'than', 'too',
  'very', 'just', 'because', 'into', 'through', 'during', 'before', 'after',
]);

// German common nouns that start uppercase (not proper nouns)
// Extensive list to avoid false positive proper noun detection, especially in RP contexts
const GERMAN_COMMON_NOUNS = new Set([
  // Körper & Aussehen
  'auge', 'augen', 'haar', 'haare', 'haut', 'kopf', 'hand', 'hände', 'arm', 'arme',
  'bein', 'beine', 'brust', 'brüste', 'schulter', 'schultern', 'rücken', 'bauch',
  'gesicht', 'mund', 'lippen', 'nase', 'ohr', 'ohren', 'finger', 'zähne', 'hals',
  'stirn', 'kinn', 'wange', 'wangen', 'körper', 'hüfte', 'hüften', 'taille',
  'muskel', 'muskeln', 'narbe', 'narben', 'tattoo', 'tattoos', 'schwanz',
  // Kleidung & Ausrüstung
  'kleidung', 'rüstung', 'helm', 'schild', 'schwert', 'dolch', 'axt', 'bogen',
  'stab', 'waffe', 'waffen', 'ring', 'kette', 'amulett', 'umhang', 'mantel',
  'hose', 'hemd', 'tunika', 'stiefel', 'gürtel', 'handschuhe', 'hut', 'kappe',
  'leder', 'stoff', 'seide', 'wolle', 'eisen', 'stahl', 'panzer', 'kettenhemd',
  'tasche', 'beutel', 'rucksack', 'geldbeutel', 'inventar', 'ausrüstung',
  // Materialien & Werte
  'gold', 'silber', 'kupfer', 'bronze', 'holz', 'stein', 'kristall', 'edelstein',
  'diamant', 'rubin', 'smaragd', 'saphir', 'perle', 'geld', 'münze', 'münzen',
  // Orte & Gebäude (generisch)
  'haus', 'stadt', 'dorf', 'land', 'berg', 'wald', 'fluss', 'see', 'meer',
  'weg', 'straße', 'gasse', 'brücke', 'tor', 'mauer', 'turm', 'burg',
  'schloss', 'tempel', 'kirche', 'taverne', 'herberge', 'laden', 'markt',
  'marktplatz', 'platz', 'schule', 'gilde', 'halle', 'kammer', 'kerker',
  'höhle', 'dungeon', 'treppe', 'tür', 'fenster', 'raum', 'zimmer',
  'gasthaus', 'wirtshaus', 'werkstatt', 'schmiede', 'bibliothek',
  // Natur
  'baum', 'blume', 'gras', 'wiese', 'fels', 'felsen', 'bach', 'quelle',
  'sonne', 'mond', 'stern', 'sterne', 'himmel', 'wolke', 'wolken',
  'regen', 'schnee', 'wind', 'feuer', 'wasser', 'erde', 'luft', 'licht',
  'schatten', 'dunkelheit', 'nacht', 'tag', 'morgen', 'abend', 'mittag',
  // Personen (generisch)
  'mann', 'frau', 'kind', 'kinder', 'mädchen', 'junge', 'krieger', 'magier',
  'magierin', 'heiler', 'heilerin', 'händler', 'wache', 'wachen', 'soldat',
  'ritter', 'priester', 'dieb', 'barde', 'könig', 'königin', 'prinz',
  'prinzessin', 'bauer', 'schmied', 'wirt', 'meister', 'lehrling',
  'abenteurer', 'gegner', 'feind', 'freund', 'gruppe', 'party', 'begleiter',
  'anführer', 'chef', 'boss', 'charakter', 'held', 'heldin', 'opfer',
  // Wesen & Kreaturen
  'drache', 'goblin', 'ork', 'troll', 'wolf', 'fuchs', 'pferd', 'hund',
  'katze', 'vogel', 'schlange', 'spinne', 'monster', 'bestie', 'tier',
  'dämon', 'geist', 'skelett', 'zombie', 'untote', 'werwolf', 'vampir',
  // Kampf & Abenteuer
  'kampf', 'angriff', 'verteidigung', 'schlag', 'hieb', 'stich', 'schuss',
  'treffer', 'schaden', 'heilung', 'zauber', 'magie', 'mana', 'fähigkeit',
  'level', 'erfahrung', 'quest', 'auftrag', 'mission', 'abenteuer',
  'beute', 'belohnung', 'flucht', 'sieg', 'niederlage', 'tod', 'blut',
  'wunde', 'verletzung', 'gift', 'trank', 'heiltrank', 'antidot',
  // Emotionen & Zustände
  'angst', 'wut', 'freude', 'trauer', 'hoffnung', 'mut', 'stolz', 'scham',
  'liebe', 'hass', 'furcht', 'schmerz', 'erregung', 'hunger', 'durst',
  'müdigkeit', 'erschöpfung', 'kraft', 'stärke', 'schwäche', 'status',
  // Abstrakt & Allgemein
  'welt', 'zeit', 'leben', 'ende', 'anfang', 'mitte', 'seite', 'teil',
  'art', 'weise', 'grund', 'ziel', 'plan', 'idee', 'frage', 'antwort',
  'stimme', 'blick', 'geruch', 'geschmack', 'geräusch', 'gefühl',
  'gedanke', 'erinnerung', 'wissen', 'geheimnis', 'wahrheit', 'lüge',
  'name', 'wort', 'sprache', 'geschichte', 'recht', 'gesetz', 'regel',
  'macht', 'kontrolle', 'freiheit', 'gefahr', 'schutz', 'hilfe',
  'richtung', 'entscheidung', 'erfolg', 'versagen', 'chance', 'risiko',
  // RPG-spezifisch
  'rang', 'lizenz', 'halsband', 'sklave', 'sklaven', 'verzauberung',
  'runenstein', 'runensteine', 'notizbuch', 'formular', 'papier',
  'verband', 'ration', 'wasserflasche', 'tagebuch', 'stift',
  'knochendolch', 'keule', 'faust', 'tritt', 'würfel',
]);

function isProperNounAt(originalTokens, index) {
  const word = originalTokens[index].replace(/[.,!?;:'"()\[\]{}]/g, '');
  if (!word || word.length < 2) return false;
  if (word[0] !== word[0].toUpperCase()) return false;
  if (word === word.toUpperCase()) return false; // ALL CAPS is not proper noun
  // In German all nouns are capitalized. Use heuristic: if it's a known common noun, skip.
  // Otherwise treat mid-sentence uppercase as proper noun.
  // For sentence-start words: check if they look like names (not in common list)
  const lower = word.toLowerCase();
  if (GERMAN_COMMON_NOUNS.has(lower)) return false;
  // At sentence start, be more conservative: only if not a stopword and looks name-like
  if (index === 0 || (index > 0 && /[.!?]$/.test(originalTokens[index - 1]))) {
    // Likely proper if short and uncommon
    return !STOPWORDS.has(lower) && word.length <= 12;
  }
  return true;
}

export function extractKeywords(text) {
  if (!text || !text.trim()) return [];

  const originalTokens = text.split(/\s+/).filter(Boolean);
  const results = new Map(); // word -> {word, isProperNoun, frequency}

  for (let i = 0; i < originalTokens.length; i++) {
    const original = originalTokens[i].replace(/[.,!?;:'"()\[\]{}]/g, '');
    if (!original) continue;
    const lower = original.toLowerCase();
    if (STOPWORDS.has(lower)) continue;
    if (lower.length < 3 && !isProperNounAt(originalTokens, i)) continue;

    const isProper = isProperNounAt(originalTokens, i);
    const key = lower;
    if (results.has(key)) {
      const existing = results.get(key);
      existing.frequency++;
      existing.isProperNoun = existing.isProperNoun || isProper;
    } else {
      results.set(key, { word: lower, isProperNoun: isProper, frequency: 1 });
    }
  }

  // Sort by: proper nouns first, then by frequency, limit to 10
  const sorted = [...results.values()].sort((a, b) => {
    if (a.isProperNoun !== b.isProperNoun) return b.isProperNoun - a.isProperNoun;
    return b.frequency - a.frequency;
  });

  return sorted.slice(0, 10);
}

export function keywordMatch(kwsA, kwsB) {
  // Jaccard similarity with proper noun bonus (proper nouns count 2x)
  const setA = new Map();
  const setB = new Map();

  for (const k of kwsA) {
    setA.set(k.word, k.isProperNoun ? 2 : 1);
  }
  for (const k of kwsB) {
    setB.set(k.word, k.isProperNoun ? 2 : 1);
  }

  let intersectionWeight = 0;
  let unionWeight = 0;

  const allWords = new Set([...setA.keys(), ...setB.keys()]);
  for (const word of allWords) {
    const wA = setA.get(word) || 0;
    const wB = setB.get(word) || 0;
    intersectionWeight += Math.min(wA, wB);
    unionWeight += Math.max(wA, wB);
  }

  if (unionWeight === 0) return 0;
  return intersectionWeight / unionWeight;
}

export function computeRecency(messagesSince) {
  return 1 / (1 + messagesSince / 50);
}
