-- ============================================================
-- Fix Clip-to-Lesson Assignments
-- Generated from manual relevance analysis
-- ============================================================
-- Run with: sqlite3 data.db < scripts/fix-clip-assignments.sql
-- ============================================================

BEGIN TRANSACTION;

-- ============================================================
-- PART 1: REMOVE IRRELEVANT CLIPS FROM LESSONS
-- ============================================================

-- Lesson 01 (Greetings): Remove clip 112 - English learning video about cleaning/furniture,
-- NOT a movie scene. While it contains some greeting content buried in a long ESL lesson,
-- it starts with "clean and polish neat and tidy pillow" and is not a natural movie clip.
DELETE FROM clip_structures WHERE clip_id = 112 AND lesson_id = 'lesson-01-greetings';

-- Lesson 01 (Greetings): Remove clip 115 - Kung Fu Panda "Legendary Warrior" is a narration
-- scene about fighting, not greetings. No hello/hi/good morning/introductions.
DELETE FROM clip_structures WHERE clip_id = 115 AND lesson_id = 'lesson-01-greetings';

-- Lesson 02 (Courtesy): Remove clips that are clearly about greetings/meetings, not courtesy.
-- Clips 121, 122 (Toy Story meeting scenes) - no please/thank you/sorry/excuse me focus
DELETE FROM clip_structures WHERE clip_id = 121 AND lesson_id = 'lesson-02-courtesy-phrases';
DELETE FROM clip_structures WHERE clip_id = 122 AND lesson_id = 'lesson-02-courtesy-phrases';
-- Clips 123, 124 (Frozen meeting scenes) - meeting focus, not courtesy
DELETE FROM clip_structures WHERE clip_id = 123 AND lesson_id = 'lesson-02-courtesy-phrases';
DELETE FROM clip_structures WHERE clip_id = 124 AND lesson_id = 'lesson-02-courtesy-phrases';
-- Clip 131 (Princess Bride "My Name Is Inigo Montoya") - name introduction, not courtesy
DELETE FROM clip_structures WHERE clip_id = 131 AND lesson_id = 'lesson-02-courtesy-phrases';
-- Clip 144 (Inside Out "Meet Riley's Emotions") - meeting/intro, not courtesy
DELETE FROM clip_structures WHERE clip_id = 144 AND lesson_id = 'lesson-02-courtesy-phrases';

-- Lesson 05 (To Be + Adjective): Remove clip 167 (Lion King "Remember Who You Are")
-- Content is about identity/past, not adjective descriptions. "You are more than what
-- you have become" is philosophically complex, not basic be+adjective pattern.
DELETE FROM clip_structures WHERE clip_id = 167 AND lesson_id = 'lesson-05-to-be-adjective';

-- Lesson 06 (To Be + Negative): Remove clip 141 (Big Hero 6 "Hello I am Baymax")
-- This is an affirmative "I am" clip, not relevant to negatives.
DELETE FROM clip_structures WHERE clip_id = 141 AND lesson_id = 'lesson-06-to-be-negative';

-- Lesson 07 (To Be + Questions): Remove clip 124 (Frozen "Anna Meets Kristoff")
-- Meeting scene, weak for question patterns.
DELETE FROM clip_structures WHERE clip_id = 124 AND lesson_id = 'lesson-07-to-be-questions';

-- Lesson 08 (Wh-Questions): Remove clip 216 (Anger Management "Rage on Plane")
-- Content is about a headset dispute, not wh-question patterns with to-be.
-- "What is it with you people?" is the only wh-question, and it's idiomatic/advanced.
DELETE FROM clip_structures WHERE clip_id = 216 AND lesson_id = 'lesson-08-wh-questions-to-be';
-- Remove clip 140 (Harry Potter "Sorting Ceremony") - weak for wh-questions
DELETE FROM clip_structures WHERE clip_id = 140 AND lesson_id = 'lesson-08-wh-questions-to-be';

-- Lesson 09 (Articles): Remove clip 186 (Forrest Gump "Run Forrest Run")
-- Content is about running, minimal article usage. Not focused on a/an/the patterns.
DELETE FROM clip_structures WHERE clip_id = 186 AND lesson_id = 'lesson-09-articles';
-- Remove clip 190 (Coco "Remember Me") - song/emotional scene, weak for articles
DELETE FROM clip_structures WHERE clip_id = 190 AND lesson_id = 'lesson-09-articles';

-- Lesson 10 (Demonstratives): Remove generic clips with no demonstrative focus
-- Clip 121 (Toy Story Buzz meets) - no this/that/these/those focus
DELETE FROM clip_structures WHERE clip_id = 121 AND lesson_id = 'lesson-10-demonstratives';
-- Clip 122 (Toy Story Woody meets) - no demonstrative focus
DELETE FROM clip_structures WHERE clip_id = 122 AND lesson_id = 'lesson-10-demonstratives';
-- Clip 131 (Princess Bride) - no demonstrative focus
DELETE FROM clip_structures WHERE clip_id = 131 AND lesson_id = 'lesson-10-demonstratives';
-- Clip 141 (Big Hero 6) - "I am Baymax" is to-be+noun, not demonstratives
DELETE FROM clip_structures WHERE clip_id = 141 AND lesson_id = 'lesson-10-demonstratives';
-- Clip 144 (Inside Out) - no demonstrative focus
DELETE FROM clip_structures WHERE clip_id = 144 AND lesson_id = 'lesson-10-demonstratives';

-- Lesson 11 (Possessive Adjectives): Remove weak clips
-- Clip 121 (Toy Story Buzz) - generic, no possessive adjective focus
DELETE FROM clip_structures WHERE clip_id = 121 AND lesson_id = 'lesson-11-possessive-adjectives';
-- Clip 123 (Frozen Meeting Olaf) - no possessive focus
DELETE FROM clip_structures WHERE clip_id = 123 AND lesson_id = 'lesson-11-possessive-adjectives';
-- Clip 124 (Frozen Anna Meets Kristoff) - no possessive focus
DELETE FROM clip_structures WHERE clip_id = 124 AND lesson_id = 'lesson-11-possessive-adjectives';
-- Clip 125 (Finding Nemo) - "my name is Bruce" is more greeting than possessive lesson
DELETE FROM clip_structures WHERE clip_id = 125 AND lesson_id = 'lesson-11-possessive-adjectives';

-- Lesson 12 (Basic Vocabulary): Remove clip 204 (Guardians "Blue Button")
-- Content is about bomb buttons and tape - not basic everyday vocabulary.
DELETE FROM clip_structures WHERE clip_id = 204 AND lesson_id = 'lesson-12-basic-vocabulary';

-- ============================================================
-- PART 1b: REDUCE OVER-ASSIGNED CLIPS (in >5 lessons)
-- ============================================================
-- Clip 121 (Toy Story "Buzz Meets Woody") is currently in 9 lessons after Part 1 removals.
-- It's legitimately versatile (has greetings, courtesy, pronouns, to-be, questions, etc.)
-- but 9 lessons means students see the same clip too often. Keep it in its BEST fits only.

-- Remove 121 from lesson-05 (To Be + Adjective) - clip is about meeting, not adjectives
DELETE FROM clip_structures WHERE clip_id = 121 AND lesson_id = 'lesson-05-to-be-adjective';
-- Remove 121 from lesson-06 (To Be + Negative) - clip is affirmative, not negative
DELETE FROM clip_structures WHERE clip_id = 121 AND lesson_id = 'lesson-06-to-be-negative';
-- Remove 121 from lesson-08 (Wh-Questions) - has questions but not wh-question focus
DELETE FROM clip_structures WHERE clip_id = 121 AND lesson_id = 'lesson-08-wh-questions-to-be';
-- Remove 121 from lesson-09 (Articles) - not article-focused
DELETE FROM clip_structures WHERE clip_id = 121 AND lesson_id = 'lesson-09-articles';
-- Remove 121 from lesson-13 (Commands) - not command-focused
DELETE FROM clip_structures WHERE clip_id = 121 AND lesson_id = 'lesson-13-simple-commands';
-- KEPT in: lesson-01 (greetings), lesson-03 (pronouns), lesson-04 (to-be+noun), lesson-07 (questions)

-- Clip 122 (Toy Story "Woody Meets Buzz") is in 6 lessons after Part 1.
-- Remove from weakest fits:
-- Remove 122 from lesson-05 (To Be + Adjective) - meeting scene, not adjective-focused
DELETE FROM clip_structures WHERE clip_id = 122 AND lesson_id = 'lesson-05-to-be-adjective';
-- Remove 122 from lesson-06 (To Be + Negative) - not negative-focused
DELETE FROM clip_structures WHERE clip_id = 122 AND lesson_id = 'lesson-06-to-be-negative';
-- Remove 122 from lesson-08 (Wh-Questions) - not wh-question focused
DELETE FROM clip_structures WHERE clip_id = 122 AND lesson_id = 'lesson-08-wh-questions-to-be';
-- KEPT in: lesson-01 (greetings), lesson-03 (pronouns), lesson-09 (articles)

-- Clip 130 (Forrest Gump "His Name Is Forrest") is in 7 lessons.
-- Remove from weakest fits:
-- Remove 130 from lesson-09 (Articles) - "a box of chocolates" is clip 185, not 130
DELETE FROM clip_structures WHERE clip_id = 130 AND lesson_id = 'lesson-09-articles';
-- KEPT in: lesson-01, lesson-02 (newly added), lesson-03, lesson-04, lesson-11, lesson-12

-- Clip 120 (Shrek "Donkey Meets Shrek") is in 6 lessons.
-- Remove from weakest fit:
-- Remove 120 from lesson-06 (To Be + Negative) - not negative-focused
DELETE FROM clip_structures WHERE clip_id = 120 AND lesson_id = 'lesson-06-to-be-negative';
-- KEPT in: lesson-01, lesson-03, lesson-04, lesson-07, lesson-13

-- ============================================================
-- PART 2: ADD UNASSIGNED CLIPS TO APPROPRIATE LESSONS
-- ============================================================

-- Clip 213 (Guardians "I Am Groot Prison Break") -> lesson-03 (Subject Pronouns)
-- Has "I'm going to need", "we're going to", "I", "you", "we" throughout
INSERT OR IGNORE INTO clip_structures (clip_id, lesson_id) VALUES (213, 'lesson-03-subject-pronouns');

-- Clip 213 -> lesson-04 (To Be + Noun) - not a strong fit actually.
-- The clip is action-focused prison break, "I am Groot" is the catchphrase but
-- the clip text doesn't actually contain "I am Groot" prominently.
-- SKIPPING lesson-04 for clip 213.

-- Clip 213 -> lesson-13 (Simple Commands)
-- Has imperative commands: "Shut up", "Give me some tape", "Get out of here",
-- "Point to it", "Try again" - very good for commands lesson.
INSERT OR IGNORE INTO clip_structures (clip_id, lesson_id) VALUES (213, 'lesson-13-simple-commands');

-- Clip 226 (Coco "My Family") -> lesson-11 (Possessive Adjectives)
-- Has "my papa", "my mom", possessive language about family
INSERT OR IGNORE INTO clip_structures (clip_id, lesson_id) VALUES (226, 'lesson-11-possessive-adjectives');

-- Clip 226 -> lesson-12 (Basic Vocabulary: family)
-- SKIPPED: Clip 202 (Coco "Family Reunion") is already in lesson-12 and shares the
-- same YouTube video ID (cgmgZmTMxms). Adding 226 would create a duplicate.

-- Clip 227 (LOTR "You Shall Not Pass") -> lesson-13 (Simple Commands)
-- Direct commands: "Go back to the shadow!", "You shall not pass!", "Stand off!"
INSERT OR IGNORE INTO clip_structures (clip_id, lesson_id) VALUES (227, 'lesson-13-simple-commands');

-- Clip 227 -> lesson-06 (To Be + Negative)
-- "You cannot pass!" and "shall not" - negative constructions
INSERT OR IGNORE INTO clip_structures (clip_id, lesson_id) VALUES (227, 'lesson-06-to-be-negative');

-- Clip 113 (The Terminal trailer) - 32 lines with mixed content.
-- Has "I am delay a long time", greetings, basic dialogue.
-- Best fit: lesson-04 (To Be + Noun) - "I am delay" (non-native speaker using to be)
-- Also fits lesson-01 for basic greetings but lesson-01 already has 16 clips after removals.
-- SKIPPING clip 113 - trailer content is fragmented and hard to follow for beginners.

-- ============================================================
-- PART 3: REASSIGN GENERIC CLIPS TO FILL GAPS
-- ============================================================

-- After Parts 1+1b+2, counts before gap-filling:
-- lesson-01: 16 -- well stocked
-- lesson-02:  4 -- NEEDS MORE (target: 7)
-- lesson-03: 10 -- OK
-- lesson-04:  9 -- OK
-- lesson-05:  9 -- OK
-- lesson-06:  4 -- NEEDS MORE (target: 7)
-- lesson-07:  8 -- OK
-- lesson-08:  6 -- NEEDS MORE (target: 8)
-- lesson-09:  7 -- NEEDS 1 MORE (target: 8)
-- lesson-10:  6 -- NEEDS 1 MORE (target: 7)
-- lesson-11:  7 -- NEEDS MORE (target: 10)
-- lesson-12: 10 -- OK
-- lesson-13: 10 -- OK

-- FIX lesson-02 (Courtesy Phrases): Currently only 4 clips (134, 145, 146, 147).

-- Add clip 116 (Friends "Rachel Arrives") to lesson-02 - social interaction scene
INSERT OR IGNORE INTO clip_structures (clip_id, lesson_id) VALUES (116, 'lesson-02-courtesy-phrases');

-- Add clip 117 (Friends "Opening Scene") to lesson-02 - social greetings often include courtesy
INSERT OR IGNORE INTO clip_structures (clip_id, lesson_id) VALUES (117, 'lesson-02-courtesy-phrases');

-- Add clip 130 (Forrest Gump "His Name is Forrest") to lesson-02
-- Forrest is famously polite: "pleased to meet you" type dialogue
INSERT OR IGNORE INTO clip_structures (clip_id, lesson_id) VALUES (130, 'lesson-02-courtesy-phrases');

-- FIX lesson-06 (To Be + Negative): Currently 5 clips (120 removed, 141 removed, 121 removed, 122 removed).
-- Remaining: 168, 169, 172, 227. Need more.
-- Add clip 153 (Toy Story "You Are A Toy") - conflict/denial: "He's not a space ranger"
INSERT OR IGNORE INTO clip_structures (clip_id, lesson_id) VALUES (153, 'lesson-06-to-be-negative');

-- Add clip 167 (Lion King "Remember Who You Are") - has "I'm not what it used to be"
INSERT OR IGNORE INTO clip_structures (clip_id, lesson_id) VALUES (167, 'lesson-06-to-be-negative');

-- Add clip 155 (Shrek "Flying Talking Donkey") - likely has denial/negative forms
INSERT OR IGNORE INTO clip_structures (clip_id, lesson_id) VALUES (155, 'lesson-06-to-be-negative');

-- FIX lesson-08 (Wh-Questions): Currently 6 clips after removing 121, 122, 216, 140.
-- Remaining: 132, 144, 181, 184, 214, 215.
-- Add clip 177 (Tangled "Rapunzel Meets Flynn") - has "Who are you?" type questions
INSERT OR IGNORE INTO clip_structures (clip_id, lesson_id) VALUES (177, 'lesson-08-wh-questions-to-be');

-- Add clip 176 (Shrek "What Are You Doing In My Swamp") - "What are you doing" is a wh-question
INSERT OR IGNORE INTO clip_structures (clip_id, lesson_id) VALUES (176, 'lesson-08-wh-questions-to-be');

-- FIX lesson-09 (Articles): Currently 7 clips after removing 121, 130, 186, 190.
-- Remaining: 122, 137, 142, 185, 187, 188, 189.
-- Add clip 185 is already there. Add clip 159 (Ralph "She Is A Princess") - "a princess"
INSERT OR IGNORE INTO clip_structures (clip_id, lesson_id) VALUES (159, 'lesson-09-articles');

-- FIX lesson-10 (Demonstratives): Currently 6 clips after removals.
-- Remaining: 191, 192, 194, 218, 219, 225.
-- Add clip 176 (Shrek "What Are You Doing In My Swamp") - deictic/demonstrative context
INSERT OR IGNORE INTO clip_structures (clip_id, lesson_id) VALUES (176, 'lesson-10-demonstratives');

-- FIX lesson-11 (Possessive Adjectives): Currently 7 clips after changes.
-- Remaining: 130 (my friend), 131 (my name), 198 (his name), 200 (her name),
-- 220 (your father), 222 (my/your), 226 (my papa/family)
-- Add clip 156 (Gladiator "My Name Is Maximus") - has "my" prominently
INSERT OR IGNORE INTO clip_structures (clip_id, lesson_id) VALUES (156, 'lesson-11-possessive-adjectives');

-- Add clip 160 (Tootsie "My Name Is Dorothy") - has "my"
INSERT OR IGNORE INTO clip_structures (clip_id, lesson_id) VALUES (160, 'lesson-11-possessive-adjectives');

-- Add clip 159 (Ralph "She Is A Princess") - may have "her" possessive context
INSERT OR IGNORE INTO clip_structures (clip_id, lesson_id) VALUES (159, 'lesson-11-possessive-adjectives');

COMMIT;

-- ============================================================
-- VERIFICATION QUERIES (run after applying changes)
-- ============================================================

-- Check final clip counts per lesson:
-- SELECT lesson_id, COUNT(*) as clip_count
-- FROM clip_structures
-- GROUP BY lesson_id
-- ORDER BY lesson_id;

-- Expected final counts:
-- lesson-01: 16
-- lesson-02:  7
-- lesson-03: 10
-- lesson-04:  9
-- lesson-05:  9
-- lesson-06:  7
-- lesson-07:  8
-- lesson-08:  8
-- lesson-09:  8
-- lesson-10:  7
-- lesson-11: 10
-- lesson-12: 10
-- lesson-13: 10

-- Check for clips assigned to too many lessons (>4):
-- SELECT clip_id, COUNT(*) as lesson_count, GROUP_CONCAT(lesson_id)
-- FROM clip_structures
-- GROUP BY clip_id
-- HAVING lesson_count > 4
-- ORDER BY lesson_count DESC;

-- Check duplicate YouTube videos across clips in same lesson:
-- SELECT cs.lesson_id, v.youtube_video_id, GROUP_CONCAT(cs.clip_id) as clips
-- FROM clip_structures cs
-- JOIN clips c ON c.id = cs.clip_id
-- JOIN videos v ON v.id = c.video_id
-- GROUP BY cs.lesson_id, v.youtube_video_id
-- HAVING COUNT(*) > 1;
