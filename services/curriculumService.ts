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
  translationTr: string | null;
  startTime: number;
  endTime: number;
  isTarget?: boolean;
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

// ── POC video (Feynman video-first) ──────────────────────────────

export interface PocStarterWord {
  id: string;
  word: string;
  tr: string;
  occurrences: number;
}

export interface PocVideo {
  id: string;
  youtube_video_id: string;
  title: string;
  movie_title: string;
  difficulty: string;
  wpm: number | null;
  a2_ratio: number | null;
  avg_sentence_len: number | null;
  clip_count: number;
  total_lines: number;
  tagged_lines: number;
  starter_words: PocStarterWord[];
}

// ── API calls with caching ───────────────────────────────────────

export async function fetchPocVideos(): Promise<PocVideo[]> {
  // No caching for now — POC is small and we want fresh data
  return apiFetch<PocVideo[]>('/api/v1/poc-videos');
}

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
  // No caching — server returns a random selection of 10 clips each time
  const data = await apiFetch<LessonClip[]>(`/api/v1/lessons/${lessonId}/clips`);
  return data;
}

export async function fetchAllLessonClips(lessonId: string): Promise<LessonClip[]> {
  const data = await apiFetch<LessonClip[]>(`/api/v1/lessons/${lessonId}/clips?all=true`);
  return data;
}

// ── Paginated clip fetching ─────────────────────────────────────

export interface PaginatedClipsResponse {
  clips: LessonClip[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

export async function fetchLessonClipsPaginated(
  lessonId: string,
  page: number = 1,
  perPage: number = 10,
  exclude: string[] = [],
): Promise<PaginatedClipsResponse> {
  const params = new URLSearchParams({
    page: String(page),
    per_page: String(perPage),
  });
  if (exclude.length > 0) {
    params.set('exclude', exclude.join(','));
  }
  return apiFetch<PaginatedClipsResponse>(
    `/api/v1/lessons/${lessonId}/clips?${params.toString()}`,
  );
}
