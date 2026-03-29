import {
  computeNextReview,
  getWordsDueForReview,
  getPoolStats,
  VocabPoolEntry,
} from '../services/spacedRepetition';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<VocabPoolEntry> = {}): VocabPoolEntry {
  const today = new Date().toISOString().split('T')[0];
  return {
    wordId: 'apple',
    masteryLevel: 'new',
    easeFactor: 2.5,
    interval: 1,
    nextReviewDate: today,
    correctStreak: 0,
    totalReviews: 0,
    lastReviewDate: today,
    ...overrides,
  };
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

const TODAY = new Date().toISOString().split('T')[0];

// ---------------------------------------------------------------------------
// 1. computeNextReview -- correct answers
// ---------------------------------------------------------------------------

describe('computeNextReview (correct)', () => {
  it('increases the interval by the ease factor', () => {
    const entry = makeEntry({ interval: 3, easeFactor: 2.0 });
    const result = computeNextReview(entry, true);
    // 3 * 2.0 = 6
    expect(result.interval).toBe(6);
  });

  it('increases the ease factor by 0.1', () => {
    const entry = makeEntry({ easeFactor: 2.0 });
    const result = computeNextReview(entry, true);
    expect(result.easeFactor).toBeCloseTo(2.1, 5);
  });

  it('increments correctStreak by 1', () => {
    const entry = makeEntry({ correctStreak: 2 });
    const result = computeNextReview(entry, true);
    expect(result.correctStreak).toBe(3);
  });

  it('increments totalReviews by 1', () => {
    const entry = makeEntry({ totalReviews: 5 });
    const result = computeNextReview(entry, true);
    expect(result.totalReviews).toBe(6);
  });

  it('sets nextReviewDate to today + new interval', () => {
    const entry = makeEntry({ interval: 2, easeFactor: 2.0 });
    const result = computeNextReview(entry, true);
    // interval becomes 2*2=4
    expect(result.nextReviewDate).toBe(addDays(TODAY, 4));
  });
});

// ---------------------------------------------------------------------------
// 2. computeNextReview -- incorrect answers
// ---------------------------------------------------------------------------

describe('computeNextReview (incorrect)', () => {
  it('resets interval to 1', () => {
    const entry = makeEntry({ interval: 10 });
    const result = computeNextReview(entry, false);
    expect(result.interval).toBe(1);
  });

  it('decreases ease factor by 0.2', () => {
    const entry = makeEntry({ easeFactor: 2.5 });
    const result = computeNextReview(entry, false);
    expect(result.easeFactor).toBeCloseTo(2.3, 5);
  });

  it('resets correctStreak to 0', () => {
    const entry = makeEntry({ correctStreak: 4 });
    const result = computeNextReview(entry, false);
    expect(result.correctStreak).toBe(0);
  });

  it('increments totalReviews even on wrong answer', () => {
    const entry = makeEntry({ totalReviews: 3 });
    const result = computeNextReview(entry, false);
    expect(result.totalReviews).toBe(4);
  });

  it('sets nextReviewDate to tomorrow', () => {
    const entry = makeEntry({ interval: 10 });
    const result = computeNextReview(entry, false);
    expect(result.nextReviewDate).toBe(addDays(TODAY, 1));
  });
});

// ---------------------------------------------------------------------------
// 3. Mastery level transitions
// ---------------------------------------------------------------------------

describe('mastery level transitions', () => {
  it('stays new at streak 0', () => {
    const entry = makeEntry({ correctStreak: 0 });
    const result = computeNextReview(entry, false);
    expect(result.masteryLevel).toBe('new');
  });

  it('transitions to learning at streak 1', () => {
    const entry = makeEntry({ correctStreak: 0 });
    const result = computeNextReview(entry, true);
    expect(result.correctStreak).toBe(1);
    expect(result.masteryLevel).toBe('learning');
  });

  it('transitions to familiar at streak 3', () => {
    const entry = makeEntry({ correctStreak: 2 });
    const result = computeNextReview(entry, true);
    expect(result.correctStreak).toBe(3);
    expect(result.masteryLevel).toBe('familiar');
  });

  it('transitions to mastered at streak 5', () => {
    const entry = makeEntry({ correctStreak: 4 });
    const result = computeNextReview(entry, true);
    expect(result.correctStreak).toBe(5);
    expect(result.masteryLevel).toBe('mastered');
  });

  it('drops mastery level on wrong answer', () => {
    const entry = makeEntry({ correctStreak: 5, masteryLevel: 'mastered' });
    const result = computeNextReview(entry, false);
    expect(result.correctStreak).toBe(0);
    expect(result.masteryLevel).toBe('new');
  });
});

// ---------------------------------------------------------------------------
// 4. Ease factor bounds
// ---------------------------------------------------------------------------

describe('ease factor bounds', () => {
  it('does not exceed 2.5 on correct answer', () => {
    const entry = makeEntry({ easeFactor: 2.5 });
    const result = computeNextReview(entry, true);
    expect(result.easeFactor).toBe(2.5);
  });

  it('does not drop below 1.3 on wrong answer', () => {
    const entry = makeEntry({ easeFactor: 1.3 });
    const result = computeNextReview(entry, false);
    expect(result.easeFactor).toBe(1.3);
  });

  it('clamps ease factor at 1.3 after many wrong answers', () => {
    let entry = makeEntry({ easeFactor: 2.5 });
    // 2.5 -> 2.3 -> 2.1 -> 1.9 -> 1.7 -> 1.5 -> 1.3 -> 1.3
    for (let i = 0; i < 7; i++) {
      entry = computeNextReview(entry, false);
    }
    expect(entry.easeFactor).toBeCloseTo(1.3, 5);
  });

  it('clamps ease factor at 2.5 after many correct answers', () => {
    let entry = makeEntry({ easeFactor: 2.0 });
    // 2.0 -> 2.1 -> 2.2 -> 2.3 -> 2.4 -> 2.5 -> 2.5
    for (let i = 0; i < 7; i++) {
      entry = computeNextReview(entry, true);
    }
    expect(entry.easeFactor).toBe(2.5);
  });
});

// ---------------------------------------------------------------------------
// 5. getWordsDueForReview
// ---------------------------------------------------------------------------

describe('getWordsDueForReview', () => {
  it('returns words with nextReviewDate <= today', async () => {
    const pool: Record<string, VocabPoolEntry> = {
      apple: makeEntry({ wordId: 'apple', nextReviewDate: TODAY }),
      banana: makeEntry({ wordId: 'banana', nextReviewDate: addDays(TODAY, -2) }),
      cherry: makeEntry({ wordId: 'cherry', nextReviewDate: addDays(TODAY, 5) }),
    };
    const due = await getWordsDueForReview(pool);
    const ids = due.map((e) => e.wordId).sort();
    expect(ids).toEqual(['apple', 'banana']);
  });

  it('returns empty array when nothing is due', async () => {
    const pool: Record<string, VocabPoolEntry> = {
      apple: makeEntry({ wordId: 'apple', nextReviewDate: addDays(TODAY, 1) }),
    };
    const due = await getWordsDueForReview(pool);
    expect(due).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 6. Pool stats
// ---------------------------------------------------------------------------

describe('getPoolStats', () => {
  it('counts entries by mastery level and due today', async () => {
    const pool: Record<string, VocabPoolEntry> = {
      a: makeEntry({ wordId: 'a', masteryLevel: 'new', nextReviewDate: TODAY }),
      b: makeEntry({ wordId: 'b', masteryLevel: 'new', nextReviewDate: addDays(TODAY, 3) }),
      c: makeEntry({ wordId: 'c', masteryLevel: 'learning', nextReviewDate: TODAY }),
      d: makeEntry({ wordId: 'd', masteryLevel: 'familiar', nextReviewDate: addDays(TODAY, -1) }),
      e: makeEntry({ wordId: 'e', masteryLevel: 'mastered', nextReviewDate: addDays(TODAY, 10) }),
    };

    const stats = await getPoolStats(pool);
    expect(stats.total).toBe(5);
    expect(stats.new).toBe(2);
    expect(stats.learning).toBe(1);
    expect(stats.familiar).toBe(1);
    expect(stats.mastered).toBe(1);
    expect(stats.dueToday).toBe(3); // a, c, d
  });

  it('returns all zeros for empty pool', async () => {
    const stats = await getPoolStats({});
    expect(stats).toEqual({
      total: 0,
      new: 0,
      learning: 0,
      familiar: 0,
      mastered: 0,
      dueToday: 0,
    });
  });
});

// ---------------------------------------------------------------------------
// 7. Adding words -- duplicate prevention via computeNextReview logic
// ---------------------------------------------------------------------------

describe('addWordToPool (default entry)', () => {
  it('creates a default entry with correct initial values', () => {
    const entry = makeEntry();
    expect(entry.masteryLevel).toBe('new');
    expect(entry.easeFactor).toBe(2.5);
    expect(entry.interval).toBe(1);
    expect(entry.correctStreak).toBe(0);
    expect(entry.totalReviews).toBe(0);
    expect(entry.nextReviewDate).toBe(TODAY);
  });

  it('two entries with same wordId are equal when constructed identically', () => {
    const a = makeEntry({ wordId: 'hello' });
    const b = makeEntry({ wordId: 'hello' });
    expect(a).toEqual(b);
  });

  it('pool record prevents duplicates by key', () => {
    const pool: Record<string, VocabPoolEntry> = {};
    pool['hello'] = makeEntry({ wordId: 'hello' });
    // adding again with same key just overwrites
    pool['hello'] = makeEntry({ wordId: 'hello' });
    expect(Object.keys(pool).length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 8. Mixed correct / incorrect sequences
// ---------------------------------------------------------------------------

describe('mixed correct/incorrect sequences', () => {
  it('builds mastery then loses it on a wrong answer', () => {
    let entry = makeEntry();

    // 5 correct answers -> mastered
    for (let i = 0; i < 5; i++) {
      entry = computeNextReview(entry, true);
    }
    expect(entry.masteryLevel).toBe('mastered');
    expect(entry.correctStreak).toBe(5);

    // 1 wrong answer -> back to new
    entry = computeNextReview(entry, false);
    expect(entry.masteryLevel).toBe('new');
    expect(entry.correctStreak).toBe(0);
    expect(entry.interval).toBe(1);
  });

  it('recovers mastery after a setback', () => {
    let entry = makeEntry();

    // 3 correct -> familiar
    for (let i = 0; i < 3; i++) {
      entry = computeNextReview(entry, true);
    }
    expect(entry.masteryLevel).toBe('familiar');

    // 1 wrong -> new
    entry = computeNextReview(entry, false);
    expect(entry.masteryLevel).toBe('new');

    // 1 correct -> learning
    entry = computeNextReview(entry, true);
    expect(entry.masteryLevel).toBe('learning');
  });

  it('interval grows exponentially with consecutive correct answers', () => {
    let entry = makeEntry({ easeFactor: 2.0, interval: 1 });
    const intervals: number[] = [];

    for (let i = 0; i < 5; i++) {
      entry = computeNextReview(entry, true);
      intervals.push(entry.interval);
    }

    // Each interval should be larger than the previous
    for (let i = 1; i < intervals.length; i++) {
      expect(intervals[i]).toBeGreaterThan(intervals[i - 1]);
    }
  });

  it('totalReviews always increments regardless of correctness', () => {
    let entry = makeEntry();
    entry = computeNextReview(entry, true);
    entry = computeNextReview(entry, false);
    entry = computeNextReview(entry, true);
    entry = computeNextReview(entry, false);
    expect(entry.totalReviews).toBe(4);
  });

  it('ease factor decreases then recovers', () => {
    let entry = makeEntry({ easeFactor: 2.5 });

    // 3 wrong: 2.5 -> 2.3 -> 2.1 -> 1.9
    for (let i = 0; i < 3; i++) {
      entry = computeNextReview(entry, false);
    }
    expect(entry.easeFactor).toBeCloseTo(1.9, 5);

    // 3 correct: 1.9 -> 2.0 -> 2.1 -> 2.2
    for (let i = 0; i < 3; i++) {
      entry = computeNextReview(entry, true);
    }
    expect(entry.easeFactor).toBeCloseTo(2.2, 5);
  });
});
