import { useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Language } from '@/i18n';

export interface UserProgress {
  structuresCompleted: string[];
  vocabLearned: string[];
  scenesWatched: string[];
  currentLevel: number;
  streak: number;
  lastActiveDate: string;
}

const DEFAULT_PROGRESS: UserProgress = {
  structuresCompleted: [],
  vocabLearned: [],
  scenesWatched: [],
  currentLevel: 1,
  streak: 0,
  lastActiveDate: '',
};

export function useAppState() {
  const [nativeLanguage, setNativeLanguageState] = useState<Language>('tr');
  const [progress, setProgressState] = useState<UserProgress>(DEFAULT_PROGRESS);
  const [isLoaded, setIsLoaded] = useState(false);

  const loadState = useCallback(async () => {
    try {
      const [lang, prog] = await Promise.all([
        AsyncStorage.getItem('nativeLanguage'),
        AsyncStorage.getItem('progress'),
      ]);
      if (lang) setNativeLanguageState(lang as Language);
      if (prog) setProgressState(JSON.parse(prog));
      setIsLoaded(true);
    } catch {
      setIsLoaded(true);
    }
  }, []);

  const setNativeLanguage = useCallback(async (lang: Language) => {
    setNativeLanguageState(lang);
    await AsyncStorage.setItem('nativeLanguage', lang);
  }, []);

  const updateProgress = useCallback(async (updates: Partial<UserProgress>) => {
    setProgressState((prev) => {
      const next = { ...prev, ...updates };
      AsyncStorage.setItem('progress', JSON.stringify(next));
      return next;
    });
  }, []);

  const markStructureComplete = useCallback(async (structureId: string) => {
    setProgressState((prev) => {
      if (prev.structuresCompleted.includes(structureId)) return prev;
      const next = {
        ...prev,
        structuresCompleted: [...prev.structuresCompleted, structureId],
      };
      AsyncStorage.setItem('progress', JSON.stringify(next));
      return next;
    });
  }, []);

  const markVocabLearned = useCallback(async (wordId: string) => {
    setProgressState((prev) => {
      if (prev.vocabLearned.includes(wordId)) return prev;
      const next = {
        ...prev,
        vocabLearned: [...prev.vocabLearned, wordId],
      };
      AsyncStorage.setItem('progress', JSON.stringify(next));
      return next;
    });
  }, []);

  const markSceneWatched = useCallback(async (sceneId: string) => {
    setProgressState((prev) => {
      if (prev.scenesWatched.includes(sceneId)) return prev;
      const next = {
        ...prev,
        scenesWatched: [...prev.scenesWatched, sceneId],
      };
      AsyncStorage.setItem('progress', JSON.stringify(next));
      return next;
    });
  }, []);

  return {
    nativeLanguage,
    setNativeLanguage,
    progress,
    updateProgress,
    markStructureComplete,
    markVocabLearned,
    markSceneWatched,
    loadState,
    isLoaded,
  };
}
