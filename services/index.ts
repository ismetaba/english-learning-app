export { apiFetch, ApiError } from './api';
export { getCached, setCache, invalidateCache, clearAllCache, TTL } from './cacheService';
export {
  fetchCurriculum,
  fetchLesson,
  fetchLessonClips,
  type CurriculumUnit,
  type CurriculumLesson,
  type LessonDetail,
  type LessonSection,
  type LessonClip,
  type ClipLine,
} from './curriculumService';
export { fetchClipsByStructure, fetchClipsByVocab } from './clipService';
export {
  fetchVocabSets,
  fetchVocabSet,
  type VocabWord,
  type VocabSet,
  type VocabSetWithWords,
} from './vocabService';
export {
  computeNextReview,
  getVocabPool,
  saveVocabPool,
  addWordToPool,
  processReview,
  getWordsDueForReview,
  getPoolStats,
  type VocabPoolEntry,
} from './spacedRepetition';
export {
  generateDailyPlan,
  getRecentLessons,
  calculateCompletionPercent,
  type DailyTaskItem,
  type DailyPlan,
  type GeneratorInput,
} from './dailyTaskGenerator';
