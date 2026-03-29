import AsyncStorage from '@react-native-async-storage/async-storage';

const VOCAB_POOL_KEY = 'vocabPool';

export interface VocabPoolEntry {
  wordId: string;
  masteryLevel: 'new' | 'learning' | 'familiar' | 'mastered';
  easeFactor: number;
  interval: number;
  nextReviewDate: string;
  correctStreak: number;
  totalReviews: number;
  lastReviewDate: string;
}

function getTodayISO(): string {
  return new Date().toISOString().split('T')[0];
}

function addDays(dateStr: string, days: number): string {
  const date = new Date(dateStr + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().split('T')[0];
}

function getMasteryLevel(streak: number): VocabPoolEntry['masteryLevel'] {
  if (streak >= 5) return 'mastered';
  if (streak >= 3) return 'familiar';
  if (streak >= 1) return 'learning';
  return 'new';
}

function createDefaultEntry(wordId: string): VocabPoolEntry {
  const today = getTodayISO();
  return {
    wordId,
    masteryLevel: 'new',
    easeFactor: 2.5,
    interval: 1,
    nextReviewDate: today,
    correctStreak: 0,
    totalReviews: 0,
    lastReviewDate: today,
  };
}

/**
 * Pure function: applies the SM-2 algorithm to compute the next review state.
 * No side effects -- suitable for testing without AsyncStorage.
 */
export function computeNextReview(
  entry: VocabPoolEntry,
  correct: boolean,
): VocabPoolEntry {
  const today = getTodayISO();
  const updated = { ...entry, totalReviews: entry.totalReviews + 1, lastReviewDate: today };

  if (correct) {
    updated.correctStreak = entry.correctStreak + 1;
    updated.interval = Math.max(1, Math.round(entry.interval * entry.easeFactor));
    updated.easeFactor = Math.min(2.5, entry.easeFactor + 0.1);
  } else {
    updated.correctStreak = 0;
    updated.interval = 1;
    updated.easeFactor = Math.max(1.3, entry.easeFactor - 0.2);
  }

  updated.masteryLevel = getMasteryLevel(updated.correctStreak);
  updated.nextReviewDate = addDays(today, updated.interval);

  return updated;
}

/**
 * Load the entire vocab pool from AsyncStorage.
 */
export async function getVocabPool(): Promise<Record<string, VocabPoolEntry>> {
  const raw = await AsyncStorage.getItem(VOCAB_POOL_KEY);
  if (!raw) return {};
  return JSON.parse(raw) as Record<string, VocabPoolEntry>;
}

/**
 * Save the entire vocab pool to AsyncStorage.
 */
export async function saveVocabPool(
  pool: Record<string, VocabPoolEntry>,
): Promise<void> {
  await AsyncStorage.setItem(VOCAB_POOL_KEY, JSON.stringify(pool));
}

/**
 * Add a new word to the pool with default values.
 * If the word already exists, the existing entry is returned unchanged.
 */
export async function addWordToPool(wordId: string): Promise<VocabPoolEntry> {
  const pool = await getVocabPool();

  if (pool[wordId]) {
    return pool[wordId];
  }

  const entry = createDefaultEntry(wordId);
  pool[wordId] = entry;
  await saveVocabPool(pool);
  return entry;
}

/**
 * Process a review for a word: apply SM-2, persist, and return the updated entry.
 */
export async function processReview(
  wordId: string,
  correct: boolean,
): Promise<VocabPoolEntry> {
  const pool = await getVocabPool();
  const entry = pool[wordId];

  if (!entry) {
    throw new Error(`Word "${wordId}" not found in vocab pool`);
  }

  const updated = computeNextReview(entry, correct);
  pool[wordId] = updated;
  await saveVocabPool(pool);
  return updated;
}

/**
 * Get all words whose nextReviewDate is today or earlier.
 */
export async function getWordsDueForReview(
  pool?: Record<string, VocabPoolEntry>,
): Promise<VocabPoolEntry[]> {
  const resolved = pool ?? (await getVocabPool());
  const today = getTodayISO();

  return Object.values(resolved).filter(
    (entry) => entry.nextReviewDate <= today,
  );
}

/**
 * Get aggregate stats for the vocab pool.
 */
export async function getPoolStats(
  pool?: Record<string, VocabPoolEntry>,
): Promise<{
  total: number;
  new: number;
  learning: number;
  familiar: number;
  mastered: number;
  dueToday: number;
}> {
  const resolved = pool ?? (await getVocabPool());
  const today = getTodayISO();
  const entries = Object.values(resolved);

  return {
    total: entries.length,
    new: entries.filter((e) => e.masteryLevel === 'new').length,
    learning: entries.filter((e) => e.masteryLevel === 'learning').length,
    familiar: entries.filter((e) => e.masteryLevel === 'familiar').length,
    mastered: entries.filter((e) => e.masteryLevel === 'mastered').length,
    dueToday: entries.filter((e) => e.nextReviewDate <= today).length,
  };
}
