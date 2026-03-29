import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Language } from '@/i18n';

export type LessonStage = 'learn' | 'watch' | 'practice' | 'reinforce' | 'mastered' | 'review_needed';

export interface LessonMastery {
  stage: LessonStage;
  watchQuizScore: number;
  watchClipsCompleted: number;
  practiceScore: number;
  practiceAttempts: number;
  reinforceClipsWatched: number;
  lastPracticeDate: string;
  errorCount: number;
  errorSessionCount: number;
}

export interface CheckpointResult {
  score: number;
  perLessonScores: Record<string, number>;
  attemptCount: number;
  passedAt: string | null;
}

export interface DailyTaskItem {
  id: string;
  type: 'grammar-clip' | 'vocab-review' | 'new-content' | 'listening';
  clipId?: string;
  lessonId?: string;
  vocabWordId?: string;
  estimatedSeconds: number;
}

export interface SessionEntry {
  date: string;
  minutesWatched: number;
  xpEarned: number;
  clipsWatched: number;
  wordsReviewed: number;
}

export interface UserProgress {
  // Existing
  completedLessons: string[];
  learnedWords: string[];
  watchedScenes: string[];
  xp: number;
  level: number;
  streak: number;
  lastActiveDate: string;
  onboardingCompleted: boolean;
  onboardingLevel: 'beginner' | 'elementary' | 'intermediate' | '';
  learningGoal: 'travel' | 'work' | 'school' | 'personal' | '';
  dailyGoalMinutes: number;

  // NEW: Per-lesson mastery (5-stage gate system)
  lessonMastery: Record<string, LessonMastery>;

  // NEW: Checkpoint quiz results per CEFR level
  checkpointResults: Record<string, CheckpointResult>;

  // NEW: Session history for analytics
  sessionHistory: SessionEntry[];

  // NEW: Daily tasks
  dailyTasks: {
    date: string;
    items: DailyTaskItem[];
    completedItemIds: string[];
  } | null;

  // NEW: Achievements
  achievements: string[];

  // NEW: Watched clips (for analytics & avoiding repeats)
  watchedClips: string[];
}

const XP_PER_LESSON = 20;
const XP_PER_VOCAB = 15;
const XP_PER_SCENE = 10;
const XP_PER_QUIZ_CORRECT = 5;
const XP_PER_REVIEW = 25;

const LEVEL_THRESHOLDS = [0, 50, 150, 300, 500, 800, 1200];
const LEVEL_NAMES = ['Beginner', 'Elementary', 'Pre-Intermediate', 'Intermediate', 'Upper-Intermediate', 'Advanced', 'Expert'];

function getLevelFromXP(xp: number): number {
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (xp >= LEVEL_THRESHOLDS[i]) return i + 1;
  }
  return 1;
}

function getLevelProgress(xp: number): { current: number; next: number; percent: number; name: string } {
  const level = getLevelFromXP(xp);
  const idx = level - 1;
  const current = LEVEL_THRESHOLDS[idx] || 0;
  const next = LEVEL_THRESHOLDS[idx + 1] || LEVEL_THRESHOLDS[idx] + 500;
  const percent = Math.min(((xp - current) / (next - current)) * 100, 100);
  const name = LEVEL_NAMES[idx] || 'Expert';
  return { current, next, percent, name };
}

const DEFAULT_PROGRESS: UserProgress = {
  completedLessons: [],
  learnedWords: [],
  watchedScenes: [],
  xp: 0,
  level: 1,
  streak: 0,
  lastActiveDate: '',
  onboardingCompleted: false,
  onboardingLevel: '',
  learningGoal: '',
  dailyGoalMinutes: 10,
  lessonMastery: {},
  checkpointResults: {},
  sessionHistory: [],
  dailyTasks: null,
  achievements: [],
  watchedClips: [],
};

interface AppStateContextType {
  nativeLanguage: Language;
  setNativeLanguage: (lang: Language) => void;
  progress: UserProgress;
  isLoaded: boolean;
  addXP: (amount: number) => void;
  markLessonComplete: (id: string) => void;
  markVocabLearned: (wordId: string) => void;
  markSceneWatched: (id: string) => void;
  markReviewComplete: (id: string) => void;
  completeOnboarding: (level: UserProgress['onboardingLevel'], goal: UserProgress['learningGoal'], minutes: number) => void;
  updateStreak: () => void;
  getLevelInfo: () => { current: number; next: number; percent: number; name: string; level: number };
  // NEW: Lesson mastery
  updateLessonMastery: (lessonId: string, updates: Partial<LessonMastery>) => void;
  getLessonStage: (lessonId: string) => LessonStage | null;
  // NEW: Checkpoint results
  saveCheckpointResult: (cefrLevel: string, result: CheckpointResult) => void;
  // NEW: Session tracking
  logSession: (entry: SessionEntry) => void;
  // NEW: Daily tasks
  setDailyTasks: (tasks: { date: string; items: DailyTaskItem[]; completedItemIds: string[] }) => void;
  completeDailyTaskItem: (itemId: string) => void;
  // NEW: Clips
  markClipWatched: (clipId: string) => void;
  // NEW: Record lesson error
  recordLessonError: (lessonId: string) => void;
  // Constants
  XP_PER_LESSON: number;
  XP_PER_VOCAB: number;
  XP_PER_SCENE: number;
  XP_PER_QUIZ_CORRECT: number;
  XP_PER_REVIEW: number;
}

const AppStateContext = createContext<AppStateContextType | null>(null);

export function useAppContext() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppContext must be used inside AppStateProvider');
  return ctx;
}

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [nativeLanguage, setNativeLanguageState] = useState<Language>('tr');
  const [progress, setProgress] = useState<UserProgress>(DEFAULT_PROGRESS);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [lang, prog] = await Promise.all([
          AsyncStorage.getItem('nativeLanguage'),
          AsyncStorage.getItem('progress'),
        ]);
        if (lang) setNativeLanguageState(lang as Language);
        if (prog) {
          const parsed = JSON.parse(prog);
          setProgress({ ...DEFAULT_PROGRESS, ...parsed });
        }
      } catch {}
      setIsLoaded(true);
    })();
  }, []);

  const persist = useCallback((next: UserProgress) => {
    AsyncStorage.setItem('progress', JSON.stringify(next));
  }, []);

  const setNativeLanguage = useCallback((lang: Language) => {
    setNativeLanguageState(lang);
    AsyncStorage.setItem('nativeLanguage', lang);
  }, []);

  const addXP = useCallback((amount: number) => {
    setProgress(prev => {
      const newXP = prev.xp + amount;
      const newLevel = getLevelFromXP(newXP);
      const next = { ...prev, xp: newXP, level: newLevel };
      persist(next);
      return next;
    });
  }, [persist]);

  const markLessonComplete = useCallback((id: string) => {
    setProgress(prev => {
      if (prev.completedLessons.includes(id)) return prev;
      const next = { ...prev, completedLessons: [...prev.completedLessons, id] };
      persist(next);
      return next;
    });
  }, [persist]);

  const markVocabLearned = useCallback((wordId: string) => {
    setProgress(prev => {
      if (prev.learnedWords.includes(wordId)) return prev;
      const next = { ...prev, learnedWords: [...prev.learnedWords, wordId] };
      persist(next);
      return next;
    });
  }, [persist]);

  const markSceneWatched = useCallback((id: string) => {
    setProgress(prev => {
      if (prev.watchedScenes.includes(id)) return prev;
      const next = { ...prev, watchedScenes: [...prev.watchedScenes, id] };
      persist(next);
      return next;
    });
  }, [persist]);

  const markReviewComplete = useCallback((id: string) => {
    setProgress(prev => {
      if (prev.completedLessons.includes(id)) return prev;
      const newXP = prev.xp + XP_PER_REVIEW;
      const newLevel = getLevelFromXP(newXP);
      const next = { ...prev, completedLessons: [...prev.completedLessons, id], xp: newXP, level: newLevel };
      persist(next);
      return next;
    });
  }, [persist]);

  const completeOnboarding = useCallback((
    level: UserProgress['onboardingLevel'],
    goal: UserProgress['learningGoal'],
    minutes: number,
  ) => {
    setProgress(prev => {
      const next = {
        ...prev,
        onboardingCompleted: true,
        onboardingLevel: level,
        learningGoal: goal,
        dailyGoalMinutes: minutes,
      };
      persist(next);
      return next;
    });
  }, [persist]);

  const updateStreak = useCallback(() => {
    const today = new Date().toISOString().split('T')[0];
    setProgress(prev => {
      if (prev.lastActiveDate === today) return prev;
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      const newStreak = prev.lastActiveDate === yesterday ? prev.streak + 1 : prev.lastActiveDate === '' ? 1 : 1;
      const next = { ...prev, streak: newStreak, lastActiveDate: today };
      persist(next);
      return next;
    });
  }, [persist]);

  const getLevelInfo = useCallback(() => {
    const info = getLevelProgress(progress.xp);
    return { ...info, level: getLevelFromXP(progress.xp) };
  }, [progress.xp]);

  const updateLessonMastery = useCallback((lessonId: string, updates: Partial<LessonMastery>) => {
    setProgress(prev => {
      const existing = prev.lessonMastery[lessonId] || {
        stage: 'learn' as LessonStage,
        watchQuizScore: 0,
        watchClipsCompleted: 0,
        practiceScore: 0,
        practiceAttempts: 0,
        reinforceClipsWatched: 0,
        lastPracticeDate: '',
        errorCount: 0,
        errorSessionCount: 0,
      };
      const next = {
        ...prev,
        lessonMastery: {
          ...prev.lessonMastery,
          [lessonId]: { ...existing, ...updates },
        },
      };
      persist(next);
      return next;
    });
  }, [persist]);

  const getLessonStage = useCallback((lessonId: string): LessonStage | null => {
    return progress.lessonMastery[lessonId]?.stage ?? null;
  }, [progress.lessonMastery]);

  const saveCheckpointResult = useCallback((cefrLevel: string, result: CheckpointResult) => {
    setProgress(prev => {
      const next = {
        ...prev,
        checkpointResults: { ...prev.checkpointResults, [cefrLevel]: result },
      };
      persist(next);
      return next;
    });
  }, [persist]);

  const logSession = useCallback((entry: SessionEntry) => {
    setProgress(prev => {
      const history = [...prev.sessionHistory, entry].slice(-90); // Keep last 90 days
      const next = { ...prev, sessionHistory: history };
      persist(next);
      return next;
    });
  }, [persist]);

  const setDailyTasks = useCallback((tasks: { date: string; items: DailyTaskItem[]; completedItemIds: string[] }) => {
    setProgress(prev => {
      const next = { ...prev, dailyTasks: tasks };
      persist(next);
      return next;
    });
  }, [persist]);

  const completeDailyTaskItem = useCallback((itemId: string) => {
    setProgress(prev => {
      if (!prev.dailyTasks) return prev;
      if (prev.dailyTasks.completedItemIds.includes(itemId)) return prev;
      const next = {
        ...prev,
        dailyTasks: {
          ...prev.dailyTasks,
          completedItemIds: [...prev.dailyTasks.completedItemIds, itemId],
        },
      };
      persist(next);
      return next;
    });
  }, [persist]);

  const markClipWatched = useCallback((clipId: string) => {
    setProgress(prev => {
      if (prev.watchedClips.includes(clipId)) return prev;
      const next = { ...prev, watchedClips: [...prev.watchedClips, clipId] };
      persist(next);
      return next;
    });
  }, [persist]);

  const recordLessonError = useCallback((lessonId: string) => {
    setProgress(prev => {
      const existing = prev.lessonMastery[lessonId];
      if (!existing) return prev;
      const today = new Date().toISOString().split('T')[0];
      const isNewSession = existing.lastPracticeDate !== today;
      const next = {
        ...prev,
        lessonMastery: {
          ...prev.lessonMastery,
          [lessonId]: {
            ...existing,
            errorCount: existing.errorCount + 1,
            errorSessionCount: isNewSession ? existing.errorSessionCount + 1 : existing.errorSessionCount,
            lastPracticeDate: today,
          },
        },
      };
      persist(next);
      return next;
    });
  }, [persist]);

  return (
    <AppStateContext.Provider value={{
      nativeLanguage,
      setNativeLanguage,
      progress,
      isLoaded,
      addXP,
      markLessonComplete,
      markVocabLearned,
      markSceneWatched,
      markReviewComplete,
      completeOnboarding,
      updateStreak,
      getLevelInfo,
      updateLessonMastery,
      getLessonStage,
      saveCheckpointResult,
      logSession,
      setDailyTasks,
      completeDailyTaskItem,
      markClipWatched,
      recordLessonError,
      XP_PER_LESSON,
      XP_PER_VOCAB,
      XP_PER_SCENE,
      XP_PER_QUIZ_CORRECT,
      XP_PER_REVIEW,
    }}>
      {children}
    </AppStateContext.Provider>
  );
}
