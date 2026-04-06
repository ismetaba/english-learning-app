/**
 * Add replacement clips for A1 lessons that dropped below 10 after validation.
 *
 * Run: npx tsx scripts/seed-a1-replacements.ts
 */

import { getDb, createVideo, createClip } from '../lib/db';

interface ClipDef {
  videoId: string;
  youtubeId: string;
  title: string;
  movieTitle: string;
  genre: string;
  difficulty: string;
  clips: {
    start: number;
    end: number;
    lines: { speaker: string; text: string; start: number; end: number }[];
  }[];
}

interface LessonReplacements {
  lessonId: string;
  newVideos: ClipDef[];
}

// ── Lesson 08: Wh- Questions (needs 3 more → 8 → 11) ──
const LESSON_08: LessonReplacements = {
  lessonId: 'lesson-08-wh-questions-to-be',
  newVideos: [
    {
      videoId: 'rush-hour-what-is-your-name',
      youtubeId: 'dU4lYcN6zEY',
      title: 'He Is Mi and I Am Yu',
      movieTitle: 'Rush Hour 3',
      genre: 'comedy',
      difficulty: 'beginner',
      clips: [{
        start: 0, end: 60,
        lines: [
          { speaker: 'Carter', text: 'What is your name?', start: 3, end: 5 },
          { speaker: 'Mi', text: 'I am Mi.', start: 6, end: 8 },
          { speaker: 'Carter', text: 'Who are you?', start: 10, end: 12 },
          { speaker: 'Yu', text: 'I am Yu.', start: 13, end: 15 },
          { speaker: 'Carter', text: 'What is your name?!', start: 18, end: 21 },
        ],
      }],
    },
    {
      videoId: 'hells-kitchen-lamb-sauce',
      youtubeId: 'zOXDcGq7Ohg',
      title: 'Where Is The Lamb Sauce',
      movieTitle: "Hell's Kitchen",
      genre: 'reality',
      difficulty: 'beginner',
      clips: [{
        start: 0, end: 30,
        lines: [
          { speaker: 'Gordon', text: "Where's the lamb sauce?!", start: 3, end: 6 },
          { speaker: 'Gordon', text: 'Where is the lamb sauce?!', start: 8, end: 11 },
        ],
      }],
    },
    {
      videoId: 'anger-mgmt-who-are-you',
      youtubeId: 'DzUc3Eqzzos',
      title: 'Rage on a Plane',
      movieTitle: 'Anger Management',
      genre: 'comedy',
      difficulty: 'beginner',
      clips: [{
        start: 0, end: 30,
        lines: [
          { speaker: 'Attendant', text: 'Who are you?', start: 3, end: 5 },
          { speaker: 'Dave', text: 'What is happening?', start: 8, end: 10 },
        ],
      }],
    },
  ],
};

// ── Lesson 10: Demonstratives (needs 3 more → 8 → 11) ──
const LESSON_10: LessonReplacements = {
  lessonId: 'lesson-10-demonstratives',
  newVideos: [
    {
      videoId: '300-this-is-sparta',
      youtubeId: '4Prc1UfuokY',
      title: 'This Is Sparta',
      movieTitle: '300',
      genre: 'action',
      difficulty: 'beginner',
      clips: [{
        start: 0, end: 20,
        lines: [
          { speaker: 'Leonidas', text: 'This is Sparta!', start: 5, end: 8 },
        ],
      }],
    },
    {
      videoId: 'star-wars-these-droids',
      youtubeId: 'ihyjXd2C-E8',
      title: 'These Arent The Droids',
      movieTitle: 'Star Wars',
      genre: 'scifi',
      difficulty: 'beginner',
      clips: [{
        start: 0, end: 30,
        lines: [
          { speaker: 'Obi-Wan', text: "These aren't the droids you're looking for.", start: 5, end: 9 },
          { speaker: 'Trooper', text: "These aren't the droids we're looking for.", start: 11, end: 15 },
        ],
      }],
    },
    {
      videoId: 'lionking-light-touches',
      youtubeId: 'JawCb15MWLc',
      title: 'Everything The Light Touches',
      movieTitle: 'The Lion King',
      genre: 'animation',
      difficulty: 'beginner',
      clips: [{
        start: 0, end: 30,
        lines: [
          { speaker: 'Mufasa', text: 'Look, Simba. Everything the light touches is our kingdom.', start: 3, end: 8 },
          { speaker: 'Simba', text: "What about that shadowy place?", start: 10, end: 13 },
          { speaker: 'Mufasa', text: "That is beyond our borders. You must never go there.", start: 14, end: 19 },
        ],
      }],
    },
  ],
};

// ── Lesson 11: Possessive Adjectives (needs 3 more → 8 → 11) ──
const LESSON_11: LessonReplacements = {
  lessonId: 'lesson-11-possessive-adjectives',
  newVideos: [
    {
      videoId: 'star-wars-your-father',
      youtubeId: 'GLheiLGZ1k8',
      title: 'I Am Your Father',
      movieTitle: 'Star Wars',
      genre: 'scifi',
      difficulty: 'beginner',
      clips: [{
        start: 0, end: 20,
        lines: [
          { speaker: 'Vader', text: 'I am your father.', start: 5, end: 8 },
          { speaker: 'Luke', text: "No... that's not true!", start: 10, end: 13 },
        ],
      }],
    },
    {
      videoId: 'godfather-my-boy',
      youtubeId: '3sIYe74sczE',
      title: 'Look How They Massacred My Boy',
      movieTitle: 'The Godfather',
      genre: 'drama',
      difficulty: 'beginner',
      clips: [{
        start: 0, end: 20,
        lines: [
          { speaker: 'Vito', text: 'Look how they massacred my boy.', start: 3, end: 7 },
        ],
      }],
    },
    {
      videoId: 'lionking-remember-your',
      youtubeId: 'o6lP7AKRG74',
      title: 'Remember Who You Are',
      movieTitle: 'The Lion King',
      genre: 'animation',
      difficulty: 'beginner',
      clips: [{
        start: 0, end: 30,
        lines: [
          { speaker: 'Mufasa', text: 'Remember who you are.', start: 5, end: 8 },
          { speaker: 'Mufasa', text: 'You are my son.', start: 10, end: 13 },
          { speaker: 'Simba', text: "Father! Don't leave me!", start: 15, end: 18 },
        ],
      }],
    },
  ],
};

// ── Lesson 13: Simple Commands (needs 2 more → 9 → 11) ──
const LESSON_13: LessonReplacements = {
  lessonId: 'lesson-13-simple-commands',
  newVideos: [
    {
      videoId: 'lotr-you-shall-not-pass',
      youtubeId: '3bReJswiMGM',
      title: 'You Shall Not Pass',
      movieTitle: 'Lord of the Rings',
      genre: 'fantasy',
      difficulty: 'beginner',
      clips: [{
        start: 0, end: 30,
        lines: [
          { speaker: 'Gandalf', text: 'Go back to the shadow!', start: 3, end: 6 },
          { speaker: 'Gandalf', text: 'You shall not pass!', start: 8, end: 11 },
          { speaker: 'Aragorn', text: 'Run!', start: 14, end: 15 },
        ],
      }],
    },
    {
      videoId: 't2-come-with-me',
      youtubeId: 'XTzTkRU6mRY',
      title: 'Come With Me If You Want To Live',
      movieTitle: 'Terminator 2',
      genre: 'action',
      difficulty: 'beginner',
      clips: [{
        start: 0, end: 20,
        lines: [
          { speaker: 'T-800', text: 'Come with me if you want to live.', start: 3, end: 7 },
        ],
      }],
    },
  ],
};

const ALL: LessonReplacements[] = [LESSON_08, LESSON_10, LESSON_11, LESSON_13];

function seed(): void {
  const db = getDb();
  console.log('Adding replacement clips for lessons below 10...\n');

  const insertStructure = db.prepare(
    'INSERT OR IGNORE INTO clip_structures (clip_id, lesson_id) VALUES (?, ?)'
  );

  for (const lesson of ALL) {
    console.log(`\n── ${lesson.lessonId} ──`);

    for (const video of lesson.newVideos) {
      try {
        createVideo({
          id: video.videoId,
          youtube_video_id: video.youtubeId,
          title: video.title,
          movie_title: video.movieTitle,
          genre: video.genre,
          difficulty: video.difficulty,
          duration_seconds: null,
        });
        console.log(`  + Video: ${video.movieTitle} — ${video.title}`);
      } catch {
        console.log(`  ~ Video (exists): ${video.movieTitle} — ${video.title}`);
      }

      for (const clipDef of video.clips) {
        const clipId = createClip(video.videoId, clipDef.start, clipDef.end);
        db.prepare("UPDATE clips SET status = 'approved' WHERE id = ?").run(clipId);

        const insertLine = db.prepare(
          'INSERT INTO subtitle_lines (clip_id, line_index, speaker, text, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?)'
        );
        for (let i = 0; i < clipDef.lines.length; i++) {
          const line = clipDef.lines[i];
          insertLine.run(clipId, i, line.speaker, line.text, line.start, line.end);
        }

        // Add word timestamps via linear interpolation
        const insertWord = db.prepare(
          'INSERT INTO word_timestamps (line_id, word_index, word, start_time, end_time) VALUES (?, ?, ?, ?, ?)'
        );
        const getLines = db.prepare('SELECT id, text, start_time, end_time FROM subtitle_lines WHERE clip_id = ?');
        const lines = getLines.all(clipId) as any[];
        for (const line of lines) {
          const words = line.text.split(/\s+/).filter((w: string) => w.length > 0);
          const dur = line.end_time - line.start_time;
          const wordDur = dur / words.length;
          for (let wi = 0; wi < words.length; wi++) {
            insertWord.run(line.id, wi, words[wi], line.start_time + wi * wordDur, line.start_time + (wi + 1) * wordDur);
          }
        }

        insertStructure.run(clipId, lesson.lessonId);
        console.log(`    Clip #${clipId}: ${clipDef.start}s-${clipDef.end}s (${clipDef.lines.length} lines)`);
      }
    }

    const count = (db.prepare(
      'SELECT COUNT(*) as n FROM clips c JOIN clip_structures cs ON cs.clip_id = c.id WHERE cs.lesson_id = ?'
    ).get(lesson.lessonId) as any).n;
    console.log(`  ✅ Total: ${count} clips`);
  }
}

seed();
