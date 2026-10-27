-- Copies the Spanish content database (built by build-content.ts) into
-- the production database, next to the English corpus, without touching
-- any English row.
--
-- Run on the Fly machine, after the language migration has run (the
-- deployed admin adds videos.language, vocab_words.language and
-- word_translations_es on its first request), with the content database
-- uploaded to /tmp/es-content.db and a backup taken:
--
--   sqlite3 /data/admin.db ".backup /data/admin.db.bak-<date>"
--   sqlite3 /data/admin.db < merge-es.sql
--
-- One transaction, stopped at the first error (.bail), so a failure
-- leaves the database as it was. Re-runnable: it first removes the
-- previous Spanish import. Row ids are shifted past production's current
-- maximum at the moment it runs, so concurrent admin edits can't collide.
.bail on
.timeout 15000
PRAGMA foreign_keys = ON;
ATTACH DATABASE '/tmp/es-content.db' AS es;
BEGIN IMMEDIATE;

-- ── Remove the previous Spanish import ─────────────────────────────
DELETE FROM main.video_set_items
 WHERE set_id IN (SELECT id FROM es.video_sets)
    OR video_id IN (SELECT id FROM main.videos WHERE language = 'es');
DELETE FROM main.video_sets WHERE id IN (SELECT id FROM es.video_sets);
DELETE FROM main.clip_vocab
 WHERE clip_id IN (SELECT c.id FROM main.clips c JOIN main.videos v ON v.id = c.video_id WHERE v.language = 'es')
    OR word_id IN (SELECT id FROM main.vocab_words WHERE language = 'es');
DELETE FROM main.word_timestamps WHERE line_id IN (
  SELECT sl.id FROM main.subtitle_lines sl JOIN main.clips c ON c.id = sl.clip_id
  JOIN main.videos v ON v.id = c.video_id WHERE v.language = 'es');
DELETE FROM main.subtitle_lines WHERE clip_id IN (
  SELECT c.id FROM main.clips c JOIN main.videos v ON v.id = c.video_id WHERE v.language = 'es');
DELETE FROM main.clips WHERE video_id IN (SELECT id FROM main.videos WHERE language = 'es');
DELETE FROM main.videos WHERE language = 'es';
DELETE FROM main.vocab_words WHERE language = 'es';
DELETE FROM main.word_translations_es;

-- ── Id offsets, taken now ──────────────────────────────────────────
CREATE TEMP TABLE es_offset AS SELECT
  (SELECT COALESCE(MAX(id), 0) FROM main.clips)           AS clip,
  (SELECT COALESCE(MAX(id), 0) FROM main.subtitle_lines)  AS line,
  (SELECT COALESCE(MAX(id), 0) FROM main.word_timestamps) AS word;

-- ── Copy ───────────────────────────────────────────────────────────
INSERT INTO main.videos (id, youtube_video_id, title, movie_title, genre, difficulty, duration_seconds, poc, language)
SELECT id, youtube_video_id, title, movie_title, genre, difficulty, duration_seconds, poc, language
  FROM es.videos;

INSERT INTO main.clips (id, video_id, start_time, end_time, status, wpm, a2_ratio, avg_sentence_len)
SELECT id + (SELECT clip FROM es_offset), video_id, start_time, end_time, status, wpm, a2_ratio, avg_sentence_len
  FROM es.clips;

INSERT INTO main.subtitle_lines (id, clip_id, line_index, speaker, text, start_time, end_time, translation_tr, structure)
SELECT id + (SELECT line FROM es_offset), clip_id + (SELECT clip FROM es_offset),
       line_index, speaker, text, start_time, end_time, translation_tr, structure
  FROM es.subtitle_lines;

INSERT INTO main.word_timestamps (id, line_id, word_index, word, start_time, end_time, starter_word_id)
SELECT id + (SELECT word FROM es_offset), line_id + (SELECT line FROM es_offset),
       word_index, word, start_time, end_time, starter_word_id
  FROM es.word_timestamps;

INSERT INTO main.vocab_words (id, word, ipa, part_of_speech, translation_tr, example_sentence,
                              example_translation_tr, frequency_rank, cefr_level, language)
SELECT id, word, ipa, part_of_speech, translation_tr, example_sentence,
       example_translation_tr, frequency_rank, cefr_level, language
  FROM es.vocab_words;

INSERT INTO main.clip_vocab (clip_id, word_id, line_id, occurrence_count)
SELECT clip_id + (SELECT clip FROM es_offset), word_id, line_id + (SELECT line FROM es_offset), occurrence_count
  FROM es.clip_vocab;

INSERT INTO main.word_translations_es (word_lower, translation_tr)
SELECT word_lower, translation_tr FROM es.word_translations_es;

INSERT INTO main.video_sets (id, title, title_tr, description, description_tr, difficulty, sort_order)
SELECT id, title, title_tr, description, description_tr, difficulty, sort_order FROM es.video_sets;

INSERT INTO main.video_set_items (set_id, video_id, sort_order)
SELECT set_id, video_id, sort_order FROM es.video_set_items;

COMMIT;
DETACH DATABASE es;

SELECT 'merged', (SELECT COUNT(*) FROM videos WHERE language = 'es') AS es_videos,
       (SELECT COUNT(*) FROM videos WHERE language = 'en') AS en_videos;
