/**
 * Tests for curriculum database operations.
 * Verifies schema, CRUD, prerequisites, and data integrity.
 */

import path from 'path';
import fs from 'fs';

// Use a temporary in-memory style DB for tests
const TEST_DB_PATH = path.join(__dirname, '..', 'admin', 'test-curriculum.db');

// We need to override the DB path before importing db functions
process.env.DATABASE_PATH = TEST_DB_PATH;

import {
  getDb,
  createCurriculumUnit,
  getAllCurriculumUnits,
  getCurriculumUnit,
  deleteCurriculumUnit,
  createCurriculumLesson,
  getCurriculumLesson,
  getLessonsForUnit,
  updateCurriculumLesson,
  deleteCurriculumLesson,
  getFullCurriculum,
  setPrerequisites,
  getPrerequisites,
  createVocabWord,
  getVocabWord,
  getAllVocabWords,
  createVocabSet,
  getVocabSet,
  addWordToVocabSet,
  getAllVocabSets,
  type CurriculumUnit,
  type CurriculumLesson,
  type VocabWord,
} from '../admin/lib/db';

// Clean up test DB before and after
beforeAll(() => {
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  // Force re-initialization
  (global as any).__db = null;
});

afterAll(() => {
  const db = getDb();
  db.close();
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  // Clean up WAL files
  const walPath = TEST_DB_PATH + '-wal';
  const shmPath = TEST_DB_PATH + '-shm';
  if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
  if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
});

describe('Curriculum Units', () => {
  const testUnit: Omit<CurriculumUnit, 'lesson_count'> = {
    id: 'test-a1',
    title: 'A1 - Beginner',
    title_tr: 'A1 - Başlangıç',
    description: 'Build Your First Sentences',
    cefr_level: 'a1',
    sort_order: 1,
    color: '#4CAF50',
  };

  test('creates and retrieves a curriculum unit', () => {
    createCurriculumUnit(testUnit);
    const unit = getCurriculumUnit('test-a1');
    expect(unit).toBeDefined();
    expect(unit!.title).toBe('A1 - Beginner');
    expect(unit!.cefr_level).toBe('a1');
    expect(unit!.title_tr).toBe('A1 - Başlangıç');
  });

  test('lists all units with lesson count', () => {
    createCurriculumUnit({ ...testUnit, id: 'test-a2', title: 'A2', cefr_level: 'a2', sort_order: 2 });
    const units = getAllCurriculumUnits();
    expect(units.length).toBeGreaterThanOrEqual(2);
    expect(units[0].sort_order).toBeLessThanOrEqual(units[1].sort_order);
  });

  test('deletes a unit', () => {
    createCurriculumUnit({ ...testUnit, id: 'test-delete', title: 'Delete Me', cefr_level: 'a1', sort_order: 99 });
    deleteCurriculumUnit('test-delete');
    expect(getCurriculumUnit('test-delete')).toBeUndefined();
  });
});

describe('Curriculum Lessons', () => {
  const testLesson: CurriculumLesson = {
    id: 'test-lesson-01',
    unit_id: 'test-a1',
    title: 'Greetings',
    title_tr: 'Selamlaşma',
    description: 'Hello, Hi, Good morning',
    sort_order: 1,
    lesson_type: 'grammar',
    grammar_pattern: 'Hello / Hi / Good [morning]',
    grammar_explanation: 'English greetings change based on time of day.',
    grammar_explanation_tr: 'İngilizce selamlaşmalar günün saatine göre değişir.',
    examples: JSON.stringify(['Hello!', 'Good morning!']),
    exercises: null,
    sections: null,
    status: 'published',
  };

  test('creates and retrieves a lesson', () => {
    createCurriculumLesson(testLesson);
    const lesson = getCurriculumLesson('test-lesson-01');
    expect(lesson).toBeDefined();
    expect(lesson!.title).toBe('Greetings');
    expect(lesson!.unit_id).toBe('test-a1');
    expect(lesson!.lesson_type).toBe('grammar');
    expect(JSON.parse(lesson!.examples!)).toEqual(['Hello!', 'Good morning!']);
  });

  test('lists lessons for a unit sorted by sort_order', () => {
    createCurriculumLesson({ ...testLesson, id: 'test-lesson-02', title: 'Pronouns', sort_order: 2 });
    createCurriculumLesson({ ...testLesson, id: 'test-lesson-03', title: 'To Be', sort_order: 3 });
    const lessons = getLessonsForUnit('test-a1');
    expect(lessons.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < lessons.length; i++) {
      expect(lessons[i].sort_order).toBeGreaterThanOrEqual(lessons[i - 1].sort_order);
    }
  });

  test('updates a lesson', () => {
    updateCurriculumLesson('test-lesson-01', { title: 'Updated Greetings', status: 'draft' });
    const lesson = getCurriculumLesson('test-lesson-01');
    expect(lesson!.title).toBe('Updated Greetings');
    expect(lesson!.status).toBe('draft');
    // Other fields unchanged
    expect(lesson!.grammar_pattern).toBe('Hello / Hi / Good [morning]');
  });

  test('deletes a lesson', () => {
    createCurriculumLesson({ ...testLesson, id: 'test-lesson-delete', title: 'Delete Me', sort_order: 99 });
    deleteCurriculumLesson('test-lesson-delete');
    expect(getCurriculumLesson('test-lesson-delete')).toBeUndefined();
  });
});

describe('Prerequisites', () => {
  test('sets and retrieves prerequisites', () => {
    setPrerequisites('test-lesson-02', ['test-lesson-01']);
    setPrerequisites('test-lesson-03', ['test-lesson-01', 'test-lesson-02']);

    const prereqs1 = getPrerequisites('test-lesson-01');
    expect(prereqs1).toEqual([]);

    const prereqs2 = getPrerequisites('test-lesson-02');
    expect(prereqs2).toEqual(['test-lesson-01']);

    const prereqs3 = getPrerequisites('test-lesson-03');
    expect(prereqs3).toHaveLength(2);
    expect(prereqs3).toContain('test-lesson-01');
    expect(prereqs3).toContain('test-lesson-02');
  });

  test('replaces prerequisites on re-set', () => {
    setPrerequisites('test-lesson-03', ['test-lesson-02']); // Only lesson 2 now
    const prereqs = getPrerequisites('test-lesson-03');
    expect(prereqs).toEqual(['test-lesson-02']);
  });

  test('cascade deletes prerequisites when lesson is deleted', () => {
    createCurriculumLesson({
      id: 'test-lesson-cascade',
      unit_id: 'test-a1',
      title: 'Cascade Test',
      title_tr: null,
      description: null,
      sort_order: 50,
      lesson_type: 'grammar',
      grammar_pattern: null,
      grammar_explanation: '',
      grammar_explanation_tr: '',
      examples: null,
      exercises: null,
      sections: null,
      status: 'draft',
    });
    setPrerequisites('test-lesson-cascade', ['test-lesson-01']);
    deleteCurriculumLesson('test-lesson-cascade');
    // No dangling prerequisites
    const db = getDb();
    const count = (db.prepare("SELECT COUNT(*) as n FROM lesson_prerequisites WHERE lesson_id = 'test-lesson-cascade'").get() as any).n;
    expect(count).toBe(0);
  });
});

describe('Full Curriculum', () => {
  test('returns units with nested lessons', () => {
    const curriculum = getFullCurriculum();
    expect(curriculum.length).toBeGreaterThan(0);
    const a1Unit = curriculum.find(u => u.id === 'test-a1');
    expect(a1Unit).toBeDefined();
    expect(a1Unit!.lessons.length).toBeGreaterThan(0);
    expect(a1Unit!.lessons[0]).toHaveProperty('title');
    expect(a1Unit!.lessons[0]).toHaveProperty('grammar_pattern');
  });
});

describe('Vocab Words', () => {
  const testWord: VocabWord = {
    id: 'hello',
    word: 'hello',
    ipa: '/həˈloʊ/',
    part_of_speech: 'interjection',
    translation_tr: 'merhaba',
    example_sentence: 'Hello, how are you?',
    example_translation_tr: 'Merhaba, nasılsın?',
    frequency_rank: 1,
    cefr_level: 'a1',
  };

  test('creates and retrieves a vocab word', () => {
    createVocabWord(testWord);
    const word = getVocabWord('hello');
    expect(word).toBeDefined();
    expect(word!.word).toBe('hello');
    expect(word!.translation_tr).toBe('merhaba');
    expect(word!.ipa).toBe('/həˈloʊ/');
  });

  test('lists all vocab words', () => {
    createVocabWord({ ...testWord, id: 'goodbye', word: 'goodbye', translation_tr: 'hoşça kal', frequency_rank: 2 });
    const words = getAllVocabWords();
    expect(words.length).toBeGreaterThanOrEqual(2);
  });
});

describe('Vocab Sets', () => {
  test('creates a vocab set and adds words', () => {
    createVocabSet({ id: 'greetings-set', lesson_id: 'test-lesson-01', title: 'Greetings', title_tr: 'Selamlaşma' });
    addWordToVocabSet('greetings-set', 'hello', 0);
    addWordToVocabSet('greetings-set', 'goodbye', 1);

    const set = getVocabSet('greetings-set');
    expect(set).toBeDefined();
    expect(set!.title).toBe('Greetings');
    expect(set!.words.length).toBe(2);
    expect(set!.words[0].word).toBe('hello');
    expect(set!.words[1].word).toBe('goodbye');
  });

  test('lists all vocab sets with word count', () => {
    const sets = getAllVocabSets();
    expect(sets.length).toBeGreaterThan(0);
    const greetingsSet = sets.find(s => s.id === 'greetings-set');
    expect(greetingsSet).toBeDefined();
    expect(greetingsSet!.word_count).toBe(2);
  });
});

describe('Curriculum Data Integrity', () => {
  test('unit cascade deletes lessons', () => {
    createCurriculumUnit({ id: 'test-cascade-unit', title: 'Cascade', title_tr: null, description: null, cefr_level: 'a1', sort_order: 100, color: null });
    createCurriculumLesson({
      id: 'test-cascade-lesson', unit_id: 'test-cascade-unit', title: 'Should Be Deleted',
      title_tr: null, description: null, sort_order: 1, lesson_type: 'grammar',
      grammar_pattern: null, grammar_explanation: '', grammar_explanation_tr: '',
      examples: null, exercises: null, sections: null, status: 'draft',
    });
    deleteCurriculumUnit('test-cascade-unit');
    expect(getCurriculumLesson('test-cascade-lesson')).toBeUndefined();
  });
});
