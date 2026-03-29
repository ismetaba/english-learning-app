export interface DailyTaskItem {
  id: string;
  type: 'grammar-clip' | 'vocab-review' | 'new-content' | 'listening';
  clipId?: string;
  lessonId?: string;
  vocabWordId?: string;
  estimatedSeconds: number;
}

export interface DailyPlan {
  date: string;
  items: DailyTaskItem[];
  completedItemIds: string[];
}

export interface GeneratorInput {
  completedLessons: string[];
  lessonMastery: Record<string, {
    stage: string;
    lastPracticeDate: string;
    errorCount: number;
  }>;
  watchedClips: string[];
  dailyGoalMinutes: number;
  vocabWordsDue: string[];
  availableClipsByLesson: Record<string, string[]>;
  nextUncompletedLessonId: string | null;
}

const CLIP_SECONDS = 30;
const VOCAB_SECONDS = 15;

/**
 * Get lessons completed within the last N days.
 */
export function getRecentLessons(
  completedLessons: string[],
  lessonMastery: Record<string, { lastPracticeDate: string }>,
  daysAgo: number,
): string[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysAgo);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  return completedLessons.filter((id) => {
    const mastery = lessonMastery[id];
    if (!mastery) return false;
    return mastery.lastPracticeDate >= cutoffStr;
  });
}

/**
 * Calculate what percentage of the plan's items have been completed.
 */
export function calculateCompletionPercent(plan: DailyPlan): number {
  if (plan.items.length === 0) return 0;
  const completed = plan.items.filter((item) =>
    plan.completedItemIds.includes(item.id),
  ).length;
  return Math.round((completed / plan.items.length) * 100);
}

/**
 * Simple deterministic shuffle using Fisher-Yates with a seeded approach.
 * For production we just use Math.random, but the function is isolated for testability.
 */
function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Pick clips for grammar reinforcement, weighted by recency and error count.
 */
function pickGrammarClips(
  input: GeneratorInput,
  targetSeconds: number,
  date: string,
): DailyTaskItem[] {
  const now = new Date(date);
  const watchedSet = new Set(input.watchedClips);

  // Build weighted lesson list
  type WeightedLesson = { lessonId: string; weight: number };
  const weighted: WeightedLesson[] = [];

  for (const lessonId of input.completedLessons) {
    const mastery = input.lessonMastery[lessonId];
    if (!mastery) continue;

    const practiceDate = new Date(mastery.lastPracticeDate);
    const daysAgo = Math.floor(
      (now.getTime() - practiceDate.getTime()) / (1000 * 60 * 60 * 24),
    );

    let weight = 1;
    if (daysAgo <= 7) {
      weight = 3;
    } else if (daysAgo <= 30) {
      weight = 1.5;
    }

    if (mastery.errorCount > 3) {
      weight *= 2;
    }

    weighted.push({ lessonId, weight });
  }

  if (weighted.length === 0) return [];

  // Sort by weight descending so highest-weight lessons get picked first
  weighted.sort((a, b) => b.weight - a.weight);

  // Collect candidate clips, preferring unwatched
  const items: DailyTaskItem[] = [];
  let totalSeconds = 0;
  let index = 0;

  // Repeat through weighted lessons until we fill the budget
  let passes = 0;
  const maxPasses = 10;
  while (totalSeconds < targetSeconds && passes < maxPasses) {
    let addedAny = false;
    for (const { lessonId } of weighted) {
      if (totalSeconds >= targetSeconds) break;
      const clips = input.availableClipsByLesson[lessonId] || [];
      if (clips.length === 0) continue;

      // Prefer unwatched clips
      const unwatched = clips.filter((c) => !watchedSet.has(c));
      const pool = unwatched.length > 0 ? unwatched : clips;

      // Pick a clip we haven't already added
      const usedClipIds = new Set(items.map((i) => i.clipId));
      const available = pool.filter((c) => !usedClipIds.has(c));
      if (available.length === 0) continue;

      const clipId = available[Math.floor(Math.random() * available.length)];
      items.push({
        id: `grammar-clip-${date}-${index}`,
        type: 'grammar-clip',
        clipId,
        lessonId,
        estimatedSeconds: CLIP_SECONDS,
      });
      index++;
      totalSeconds += CLIP_SECONDS;
      addedAny = true;
    }
    if (!addedAny) break;
    passes++;
  }

  return shuffle(items);
}

/**
 * Pick vocab review items.
 */
function pickVocabItems(
  input: GeneratorInput,
  targetSeconds: number,
  date: string,
): DailyTaskItem[] {
  const maxItems = Math.floor(targetSeconds / VOCAB_SECONDS);
  const words = input.vocabWordsDue.slice(0, maxItems);

  const items: DailyTaskItem[] = words.map((wordId, i) => ({
    id: `vocab-review-${date}-${i}`,
    type: 'vocab-review' as const,
    vocabWordId: wordId,
    estimatedSeconds: VOCAB_SECONDS,
  }));

  return shuffle(items);
}

/**
 * Pick new content clips from the next uncompleted lesson.
 */
function pickNewContent(
  input: GeneratorInput,
  targetSeconds: number,
  date: string,
): DailyTaskItem[] {
  if (!input.nextUncompletedLessonId) return [];

  const clips =
    input.availableClipsByLesson[input.nextUncompletedLessonId] || [];
  if (clips.length === 0) return [];

  const watchedSet = new Set(input.watchedClips);
  const unwatched = clips.filter((c) => !watchedSet.has(c));
  const pool = unwatched.length > 0 ? unwatched : clips;

  const maxItems = Math.floor(targetSeconds / CLIP_SECONDS);
  const selected = pool.slice(0, maxItems);

  const items: DailyTaskItem[] = selected.map((clipId, i) => ({
    id: `new-content-${date}-${i}`,
    type: 'new-content' as const,
    clipId,
    lessonId: input.nextUncompletedLessonId!,
    estimatedSeconds: CLIP_SECONDS,
  }));

  return shuffle(items);
}

/**
 * Generate a personalized daily plan. Pure function with no side effects.
 */
export function generateDailyPlan(input: GeneratorInput): DailyPlan {
  const date = new Date().toISOString().slice(0, 10);
  const targetSeconds = input.dailyGoalMinutes * 60;

  if (targetSeconds === 0) {
    return { date, items: [], completedItemIds: [] };
  }

  // Initial budget split: 40% grammar, 40% vocab, 20% new content
  const grammarBudget = targetSeconds * 0.4;
  const vocabBudget = targetSeconds * 0.4;
  const newContentBudget = targetSeconds * 0.2;

  // Generate items for each category
  let grammarItems = pickGrammarClips(input, grammarBudget, date);
  let vocabItems = pickVocabItems(input, vocabBudget, date);
  let newContentItems = pickNewContent(input, newContentBudget, date);

  const grammarActual = grammarItems.reduce(
    (s, i) => s + i.estimatedSeconds,
    0,
  );
  const vocabActual = vocabItems.reduce((s, i) => s + i.estimatedSeconds, 0);
  const newContentActual = newContentItems.reduce(
    (s, i) => s + i.estimatedSeconds,
    0,
  );

  // Redistribute unused budget
  const grammarShortfall = grammarBudget - grammarActual;
  const vocabShortfall = vocabBudget - vocabActual;
  const newContentShortfall = newContentBudget - newContentActual;

  // If grammar has shortfall, give to vocab then new content
  if (grammarShortfall > 0) {
    const extraVocab = pickVocabItems(
      {
        ...input,
        vocabWordsDue: input.vocabWordsDue.slice(vocabItems.length),
      },
      grammarShortfall,
      date,
    );
    // Re-index extra vocab items
    const reindexed = extraVocab.map((item, i) => ({
      ...item,
      id: `vocab-review-${date}-${vocabItems.length + i}`,
    }));
    vocabItems = [...vocabItems, ...reindexed];
  }

  // If vocab has shortfall, give to grammar then new content
  if (vocabShortfall > 0) {
    const existingClipIds = new Set(grammarItems.map((i) => i.clipId));
    const extraGrammar = pickGrammarClips(input, vocabShortfall, date);
    const filtered = extraGrammar.filter(
      (item) => !existingClipIds.has(item.clipId),
    );
    const reindexed = filtered.map((item, i) => ({
      ...item,
      id: `grammar-clip-${date}-${grammarItems.length + i}`,
    }));
    grammarItems = [...grammarItems, ...reindexed];
  }

  // If new content has shortfall, give to grammar
  if (newContentShortfall > 0) {
    const existingClipIds = new Set(grammarItems.map((i) => i.clipId));
    const extraGrammar = pickGrammarClips(input, newContentShortfall, date);
    const filtered = extraGrammar.filter(
      (item) => !existingClipIds.has(item.clipId),
    );
    const reindexed = filtered.map((item, i) => ({
      ...item,
      id: `grammar-clip-${date}-${grammarItems.length + i}`,
    }));
    grammarItems = [...grammarItems, ...reindexed];
  }

  // Combine all items, capping at target duration
  let allItems = [...grammarItems, ...vocabItems, ...newContentItems];
  let runningTotal = 0;
  const capped: DailyTaskItem[] = [];
  for (const item of allItems) {
    if (runningTotal + item.estimatedSeconds > targetSeconds + 30) break; // small tolerance
    capped.push(item);
    runningTotal += item.estimatedSeconds;
  }

  return {
    date,
    items: capped,
    completedItemIds: [],
  };
}
