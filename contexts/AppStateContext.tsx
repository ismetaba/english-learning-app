import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Language } from '@/i18n';

export interface UserProgress {
  completedLessons: string[];
  learnedWords: string[];
  watchedScenes: string[];
  xp: number;
  level: number;
  streak: number;
  lastActiveDate: string;
}

const XP_PER_LESSON = 20;
const XP_PER_VOCAB = 15;
const XP_PER_SCENE = 10;
const XP_PER_QUIZ_CORRECT = 5;

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
  updateStreak: () => void;
  getLevelInfo: () => { current: number; next: number; percent: number; name: string; level: number };
  XP_PER_LESSON: number;
  XP_PER_VOCAB: number;
  XP_PER_SCENE: number;
  XP_PER_QUIZ_CORRECT: number;
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
      updateStreak,
      getLevelInfo,
      XP_PER_LESSON,
      XP_PER_VOCAB,
      XP_PER_SCENE,
      XP_PER_QUIZ_CORRECT,
    }}>
      {children}
    </AppStateContext.Provider>
  );
}
