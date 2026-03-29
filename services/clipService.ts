/**
 * Service for fetching video clips by structure or vocab word.
 */

import { apiFetch } from './api';
import { getCached, setCache, TTL } from './cacheService';
import type { LessonClip } from './curriculumService';

export async function fetchClipsByStructure(lessonId: string): Promise<LessonClip[]> {
  const cacheKey = `clips-structure:${lessonId}`;
  const cached = await getCached<LessonClip[]>(cacheKey);
  if (cached) return cached;

  const data = await apiFetch<LessonClip[]>(`/api/v1/clips/by-structure/${lessonId}`);
  await setCache(cacheKey, data, TTL.CLIPS);
  return data;
}

export async function fetchClipsByVocab(wordId: string): Promise<LessonClip[]> {
  const cacheKey = `clips-vocab:${wordId}`;
  const cached = await getCached<LessonClip[]>(cacheKey);
  if (cached) return cached;

  const data = await apiFetch<LessonClip[]>(`/api/v1/clips/by-vocab/${wordId}`);
  await setCache(cacheKey, data, TTL.CLIPS);
  return data;
}
