/**
 * Service for fetching curriculum data from the admin API.
 * Caches the full curriculum tree and individual lesson details.
 */

import { apiFetch } from './api';
import { getCached, setCache, TTL } from './cacheService';

// ── Types ────────────────────────────────────────────────────────

export interface CurriculumLesson {
  id: string;
  unit_id: string;
  title: string;
  title_tr: string | null;
  description: string | null;
  sort_order: number;
  lesson_type: string;
  grammar_pattern: string | null;
  status: string;
}

export interface CurriculumUnit {
  id: string;
  title: string;
  title_tr: string | null;
  description: string | null;
  cefr_level: string;
  sort_order: number;
  color: string | null;
  lesson_count: number;
  lessons: CurriculumLesson[];
}

export type LessonSection =
  | { type: 'vocab'; title: string; title_tr: string; words: { word: string; translation: string; ipa?: string; example: string; example_tr: string }[] }
  | { type: 'rule'; title: string; title_tr: string; explanation: string; explanation_tr: string; pattern?: string; examples: { en: string; tr: string; highlight?: string }[] }
  | { type: 'tip'; title: string; content: string; content_tr: string }
  | { type: 'dialogue'; title: string; lines: { speaker: string; text: string; translation: string }[] }
  | { type: 'exercise'; title: string; items: { question: string; options: string[]; correct: number; hint?: string }[] };

export interface LessonDetail extends CurriculumLesson {
  grammar_explanation: string | null;
  grammar_explanation_tr: string | null;
  examples: string[];
  exercises: any[];
  sections: LessonSection[] | null;
  prerequisites: string[];
}

export interface ClipLine {
  id: number;
  speaker: string;
  text: string;
  startTime: number;
  endTime: number;
  words: { word: string; startTime: number; endTime: number }[];
}

export interface LessonClip {
  id: number;
  youtubeVideoId: string;
  movieTitle: string;
  startTime: number;
  endTime: number;
  lines: ClipLine[];
}

// ── API calls with caching ───────────────────────────────────────

export async function fetchCurriculum(): Promise<CurriculumUnit[]> {
  const cached = await getCached<CurriculumUnit[]>('curriculum');
  if (cached) return cached;

  const data = await apiFetch<CurriculumUnit[]>('/api/v1/curriculum');
  await setCache('curriculum', data, TTL.CURRICULUM);
  return data;
}

export async function fetchLesson(lessonId: string): Promise<LessonDetail> {
  const cacheKey = `lesson:${lessonId}`;
  const cached = await getCached<LessonDetail>(cacheKey);
  if (cached) return cached;

  const data = await apiFetch<LessonDetail>(`/api/v1/lessons/${lessonId}`);
  await setCache(cacheKey, data, TTL.LESSON);
  return data;
}

export async function fetchLessonClips(lessonId: string): Promise<LessonClip[]> {
  const cacheKey = `lesson-clips:${lessonId}`;
  const cached = await getCached<LessonClip[]>(cacheKey);
  if (cached) return cached;

  const data = await apiFetch<LessonClip[]>(`/api/v1/lessons/${lessonId}/clips`);
  await setCache(cacheKey, data, TTL.CLIPS);
  return data;
}
