/**
 * Service for fetching vocabulary data from the admin API.
 */

import { apiFetch } from './api';
import { getCached, setCache, TTL } from './cacheService';

export interface VocabWord {
  id: string;
  word: string;
  ipa: string | null;
  part_of_speech: string | null;
  translation_tr: string | null;
  example_sentence: string | null;
  example_translation_tr: string | null;
  frequency_rank: number | null;
  cefr_level: string | null;
}

export interface VocabSet {
  id: string;
  lesson_id: string | null;
  title: string;
  title_tr: string | null;
  word_count: number;
}

export interface VocabSetWithWords extends VocabSet {
  words: VocabWord[];
}

export async function fetchVocabSets(): Promise<VocabSet[]> {
  const cached = await getCached<VocabSet[]>('vocab-sets');
  if (cached) return cached;

  const data = await apiFetch<VocabSet[]>('/api/v1/vocab/sets');
  await setCache('vocab-sets', data, TTL.VOCAB);
  return data;
}

export async function fetchVocabSet(id: string): Promise<VocabSetWithWords> {
  const cacheKey = `vocab-set:${id}`;
  const cached = await getCached<VocabSetWithWords>(cacheKey);
  if (cached) return cached;

  const data = await apiFetch<VocabSetWithWords>(`/api/v1/vocab/sets/${id}`);
  await setCache(cacheKey, data, TTL.VOCAB);
  return data;
}
