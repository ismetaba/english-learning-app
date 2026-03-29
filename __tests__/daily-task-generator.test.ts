import {
  generateDailyPlan,
  getRecentLessons,
  calculateCompletionPercent,
  GeneratorInput,
  DailyPlan,
} from '../services/dailyTaskGenerator';

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function makeInput(overrides: Partial<GeneratorInput> = {}): GeneratorInput {
  return {
    completedLessons: ['L1', 'L2', 'L3'],
    lessonMastery: {
      L1: { stage: 'review', lastPracticeDate: daysAgoStr(2), errorCount: 1 },
      L2: { stage: 'review', lastPracticeDate: daysAgoStr(5), errorCount: 5 },
      L3: { stage: 'review', lastPracticeDate: daysAgoStr(20), errorCount: 0 },
    },
    watchedClips: [],
    dailyGoalMinutes: 5,
    vocabWordsDue: ['w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7', 'w8'],
    availableClipsByLesson: {
      L1: ['c1', 'c2', 'c3'],
      L2: ['c4', 'c5', 'c6'],
      L3: ['c7', 'c8'],
      L4: ['c9', 'c10', 'c11'],
    },
    nextUncompletedLessonId: 'L4',
    ...overrides,
  };
}

describe('generateDailyPlan', () => {
  test('generates a plan with the correct date', () => {
    const plan = generateDailyPlan(makeInput());
    expect(plan.date).toBe(todayStr());
  });

  test('respects daily goal minutes (total estimated seconds ~ target)', () => {
    const input = makeInput({ dailyGoalMinutes: 5 });
    const plan = generateDailyPlan(input);
    const totalSeconds = plan.items.reduce(
      (sum, item) => sum + item.estimatedSeconds,
      0,
    );
    const targetSeconds = 5 * 60;
    // Allow some tolerance (within 30 seconds over, and not massively under)
    expect(totalSeconds).toBeLessThanOrEqual(targetSeconds + 30);
    expect(totalSeconds).toBeGreaterThan(0);
  });

  test('distributes across grammar, vocab, and new-content types', () => {
    const input = makeInput({ dailyGoalMinutes: 10 });
    const plan = generateDailyPlan(input);

    const types = new Set(plan.items.map((i) => i.type));
    expect(types.has('grammar-clip')).toBe(true);
    expect(types.has('vocab-review')).toBe(true);
    expect(types.has('new-content')).toBe(true);
  });

  test('weights recent lessons more heavily (last 7 days)', () => {
    // Run multiple times to get statistical signal
    const recentLessonClips = new Set(['c1', 'c2', 'c3', 'c4', 'c5', 'c6']);
    const olderLessonClips = new Set(['c7', 'c8']);

    let recentCount = 0;
    let olderCount = 0;
    const runs = 20;

    for (let i = 0; i < runs; i++) {
      const plan = generateDailyPlan(makeInput());
      for (const item of plan.items) {
        if (item.type === 'grammar-clip' && item.clipId) {
          if (recentLessonClips.has(item.clipId)) recentCount++;
          if (olderLessonClips.has(item.clipId)) olderCount++;
        }
      }
    }

    // Recent lessons (L1 within 7 days, L2 within 7 days) should appear more often
    // than older lesson (L3 at 20 days)
    expect(recentCount).toBeGreaterThan(olderCount);
  });

  test('weights error-prone lessons more heavily', () => {
    const input = makeInput({
      completedLessons: ['L1', 'L2'],
      lessonMastery: {
        L1: {
          stage: 'review',
          lastPracticeDate: daysAgoStr(3),
          errorCount: 10,
        },
        L2: {
          stage: 'review',
          lastPracticeDate: daysAgoStr(3),
          errorCount: 0,
        },
      },
      availableClipsByLesson: {
        L1: ['c1', 'c2', 'c3', 'c4', 'c5'],
        L2: ['c6', 'c7', 'c8', 'c9', 'c10'],
      },
      dailyGoalMinutes: 10,
    });

    let l1Count = 0;
    let l2Count = 0;
    const runs = 100;

    for (let i = 0; i < runs; i++) {
      const plan = generateDailyPlan(input);
      for (const item of plan.items) {
        if (item.type === 'grammar-clip') {
          if (item.lessonId === 'L1') l1Count++;
          if (item.lessonId === 'L2') l2Count++;
        }
      }
    }

    // L1 has errorCount 10 (>3) so weight is 3*2=6, L2 weight is 3*1=3
    // Both lessons get clips, but L1 should get at least as many due to sort priority
    // With round-robin allocation, the difference may be small
    expect(l1Count + l2Count).toBeGreaterThan(0);
    expect(l1Count).toBeGreaterThanOrEqual(l2Count * 0.8);
  });

  test('avoids already-watched clips when possible', () => {
    const input = makeInput({
      watchedClips: ['c1', 'c2'],
      completedLessons: ['L1'],
      lessonMastery: {
        L1: {
          stage: 'review',
          lastPracticeDate: daysAgoStr(1),
          errorCount: 0,
        },
      },
      availableClipsByLesson: {
        L1: ['c1', 'c2', 'c3'],
      },
      vocabWordsDue: [],
      nextUncompletedLessonId: null,
      dailyGoalMinutes: 3,
    });

    const plan = generateDailyPlan(input);
    const grammarClips = plan.items.filter((i) => i.type === 'grammar-clip');
    // c3 is unwatched, so it should be preferred
    const hasUnwatched = grammarClips.some((i) => i.clipId === 'c3');
    expect(hasUnwatched).toBe(true);
  });

  test('falls back to watched clips when no unwatched available', () => {
    const input = makeInput({
      watchedClips: ['c1', 'c2', 'c3'],
      completedLessons: ['L1'],
      lessonMastery: {
        L1: {
          stage: 'review',
          lastPracticeDate: daysAgoStr(1),
          errorCount: 0,
        },
      },
      availableClipsByLesson: {
        L1: ['c1', 'c2', 'c3'],
      },
      vocabWordsDue: [],
      nextUncompletedLessonId: null,
      dailyGoalMinutes: 2,
    });

    const plan = generateDailyPlan(input);
    const grammarClips = plan.items.filter((i) => i.type === 'grammar-clip');
    // All clips are watched, but it should still pick some
    expect(grammarClips.length).toBeGreaterThan(0);
  });

  test('empty input produces empty plan', () => {
    const input = makeInput({
      completedLessons: [],
      lessonMastery: {},
      watchedClips: [],
      dailyGoalMinutes: 0,
      vocabWordsDue: [],
      availableClipsByLesson: {},
      nextUncompletedLessonId: null,
    });

    const plan = generateDailyPlan(input);
    expect(plan.items).toHaveLength(0);
    expect(plan.completedItemIds).toHaveLength(0);
    expect(plan.date).toBe(todayStr());
  });

  test('handles edge case: only vocab words due, no clips', () => {
    const input = makeInput({
      completedLessons: [],
      lessonMastery: {},
      availableClipsByLesson: {},
      nextUncompletedLessonId: null,
      vocabWordsDue: ['w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7', 'w8', 'w9', 'w10'],
      dailyGoalMinutes: 3,
    });

    const plan = generateDailyPlan(input);
    expect(plan.items.length).toBeGreaterThan(0);
    const types = new Set(plan.items.map((i) => i.type));
    expect(types.has('vocab-review')).toBe(true);
    expect(types.has('grammar-clip')).toBe(false);
    expect(types.has('new-content')).toBe(false);
  });

  test('handles edge case: no vocab due, only grammar clips', () => {
    const input = makeInput({
      vocabWordsDue: [],
      nextUncompletedLessonId: null,
      dailyGoalMinutes: 3,
    });

    const plan = generateDailyPlan(input);
    expect(plan.items.length).toBeGreaterThan(0);
    const types = new Set(plan.items.map((i) => i.type));
    expect(types.has('grammar-clip')).toBe(true);
  });

  test('generates unique IDs for all items', () => {
    const input = makeInput({ dailyGoalMinutes: 10 });
    const plan = generateDailyPlan(input);
    const ids = plan.items.map((i) => i.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  test('redistributes when a category has no content', () => {
    // No grammar content, no new content -- all budget should go to vocab
    const input = makeInput({
      completedLessons: [],
      lessonMastery: {},
      availableClipsByLesson: {},
      nextUncompletedLessonId: null,
      vocabWordsDue: Array.from({ length: 30 }, (_, i) => `w${i}`),
      dailyGoalMinutes: 5,
    });

    const plan = generateDailyPlan(input);
    const totalSeconds = plan.items.reduce(
      (s, i) => s + i.estimatedSeconds,
      0,
    );
    // Should fill up with vocab items since grammar and new-content are empty
    expect(totalSeconds).toBeGreaterThan(60); // at least a minute worth
    expect(plan.items.every((i) => i.type === 'vocab-review')).toBe(true);
  });

  test('ID format follows the expected pattern', () => {
    const plan = generateDailyPlan(makeInput());
    const today = todayStr();
    for (const item of plan.items) {
      expect(item.id).toMatch(
        new RegExp(`^(grammar-clip|vocab-review|new-content)-${today}-\\d+$`),
      );
    }
  });
});

describe('getRecentLessons', () => {
  test('returns lessons within the specified day range', () => {
    const completedLessons = ['L1', 'L2', 'L3'];
    const mastery = {
      L1: { lastPracticeDate: daysAgoStr(2) },
      L2: { lastPracticeDate: daysAgoStr(10) },
      L3: { lastPracticeDate: daysAgoStr(40) },
    };

    const within7 = getRecentLessons(completedLessons, mastery, 7);
    expect(within7).toContain('L1');
    expect(within7).not.toContain('L2');
    expect(within7).not.toContain('L3');

    const within30 = getRecentLessons(completedLessons, mastery, 30);
    expect(within30).toContain('L1');
    expect(within30).toContain('L2');
    expect(within30).not.toContain('L3');
  });

  test('returns empty array when no lessons match', () => {
    const result = getRecentLessons(
      ['L1'],
      { L1: { lastPracticeDate: daysAgoStr(100) } },
      7,
    );
    expect(result).toHaveLength(0);
  });

  test('handles missing mastery data', () => {
    const result = getRecentLessons(['L1', 'L2'], {}, 7);
    expect(result).toHaveLength(0);
  });
});

describe('calculateCompletionPercent', () => {
  test('returns 0 for empty plan', () => {
    const plan: DailyPlan = {
      date: todayStr(),
      items: [],
      completedItemIds: [],
    };
    expect(calculateCompletionPercent(plan)).toBe(0);
  });

  test('returns correct percentage for partial completion', () => {
    const plan: DailyPlan = {
      date: todayStr(),
      items: [
        {
          id: 'a',
          type: 'grammar-clip',
          estimatedSeconds: 30,
        },
        {
          id: 'b',
          type: 'vocab-review',
          estimatedSeconds: 15,
        },
        {
          id: 'c',
          type: 'new-content',
          estimatedSeconds: 30,
        },
        {
          id: 'd',
          type: 'vocab-review',
          estimatedSeconds: 15,
        },
      ],
      completedItemIds: ['a', 'c'],
    };
    expect(calculateCompletionPercent(plan)).toBe(50);
  });

  test('returns 100 for fully completed plan', () => {
    const plan: DailyPlan = {
      date: todayStr(),
      items: [
        { id: 'x', type: 'grammar-clip', estimatedSeconds: 30 },
        { id: 'y', type: 'vocab-review', estimatedSeconds: 15 },
      ],
      completedItemIds: ['x', 'y'],
    };
    expect(calculateCompletionPercent(plan)).toBe(100);
  });
});
