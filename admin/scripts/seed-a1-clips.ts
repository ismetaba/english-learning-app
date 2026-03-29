/**
 * Seed A1 Lesson 1 (Greetings & Introductions) video clips from YouTube.
 *
 * Run: npx tsx scripts/seed-a1-clips.ts
 *
 * These clips contain real movie/TV scenes demonstrating:
 * - Hello / Hi greetings
 * - Good morning / Good evening
 * - My name is... / I'm...
 * - Nice to meet you / How are you?
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

const LESSON_ID = 'lesson-01-greetings';

const VIDEOS: ClipDef[] = [
  // ── Kung Fu Panda ──────────────────────────────────────────────
  {
    videoId: 'kfp1-dragon-warrior',
    youtubeId: 'iRUiM7kVBXA',
    title: 'The Dragon Warrior Tournament',
    movieTitle: 'Kung Fu Panda',
    genre: 'animation',
    difficulty: 'beginner',
    clips: [
      {
        start: 0, end: 30,
        lines: [
          { speaker: 'Oogway', text: 'I see you have found the Dragon Warrior.', start: 2, end: 5 },
          { speaker: 'Po', text: 'Hi.', start: 6, end: 7 },
          { speaker: 'Po', text: 'Hello.', start: 8, end: 9 },
        ],
      },
    ],
  },
  {
    videoId: 'kfp1-legendary-warrior',
    youtubeId: 'STqJ_Up4iFg',
    title: 'The Legendary Warrior Scene',
    movieTitle: 'Kung Fu Panda',
    genre: 'animation',
    difficulty: 'beginner',
    clips: [
      {
        start: 0, end: 40,
        lines: [
          { speaker: 'Po', text: 'Good morning!', start: 5, end: 7 },
          { speaker: 'Mr. Ping', text: 'Good morning, Po!', start: 8, end: 10 },
        ],
      },
    ],
  },

  // ── Friends ────────────────────────────────────────────────────
  {
    videoId: 'friends-rachel-arrives',
    youtubeId: 'Q7yhlOOPZTM',
    title: 'Rachel Arrives At Central Perk',
    movieTitle: 'Friends',
    genre: 'comedy',
    difficulty: 'beginner',
    clips: [
      {
        start: 0, end: 45,
        lines: [
          { speaker: 'Monica', text: 'Oh my God. Rachel!', start: 5, end: 7 },
          { speaker: 'Rachel', text: 'Hi!', start: 8, end: 9 },
          { speaker: 'Monica', text: "Hi! How are you?", start: 10, end: 12 },
          { speaker: 'Rachel', text: "Hi, I'm fine.", start: 13, end: 14 },
          { speaker: 'Monica', text: 'Everybody, this is Rachel.', start: 16, end: 18 },
          { speaker: 'All', text: 'Hi!', start: 19, end: 20 },
        ],
      },
    ],
  },
  {
    videoId: 'friends-opening',
    youtubeId: 'sIZ91tq8Lr0',
    title: 'The Opening Scene of Friends',
    movieTitle: 'Friends',
    genre: 'comedy',
    difficulty: 'beginner',
    clips: [
      {
        start: 0, end: 30,
        lines: [
          { speaker: 'Monica', text: "Hi. How are you?", start: 3, end: 5 },
          { speaker: 'Joey', text: "How you doin'?", start: 7, end: 8 },
        ],
      },
    ],
  },
  {
    videoId: 'friends-joey-how-you-doin',
    youtubeId: 'CLvXFVbb82Q',
    title: "Joey's Best 'How you doin?' Moments",
    movieTitle: 'Friends',
    genre: 'comedy',
    difficulty: 'beginner',
    clips: [
      {
        start: 0, end: 25,
        lines: [
          { speaker: 'Joey', text: "How you doin'?", start: 3, end: 5 },
        ],
      },
      {
        start: 26, end: 50,
        lines: [
          { speaker: 'Joey', text: "Hey. How you doin'?", start: 28, end: 30 },
        ],
      },
    ],
  },

  // ── Shrek ──────────────────────────────────────────────────────
  {
    videoId: 'shrek-donkey-meets',
    youtubeId: 'yGE_TWz-ZLw',
    title: 'Donkey Meets Shrek for the First Time',
    movieTitle: 'Shrek',
    genre: 'animation',
    difficulty: 'beginner',
    clips: [
      {
        start: 0, end: 40,
        lines: [
          { speaker: 'Donkey', text: "Hi! I'm Donkey!", start: 5, end: 7 },
          { speaker: 'Shrek', text: 'What are you doing in my swamp?', start: 10, end: 13 },
          { speaker: 'Donkey', text: "My name is Donkey.", start: 15, end: 17 },
          { speaker: 'Donkey', text: "Nice to meet you!", start: 18, end: 19 },
        ],
      },
    ],
  },

  // ── Toy Story ──────────────────────────────────────────────────
  {
    videoId: 'toystory-buzz-meets-toys',
    youtubeId: 'EBCs92XtRkI',
    title: 'Buzz Lightyear Meets Woody & The Toys',
    movieTitle: 'Toy Story',
    genre: 'animation',
    difficulty: 'beginner',
    clips: [
      {
        start: 0, end: 50,
        lines: [
          { speaker: 'Buzz', text: 'Hello. I am Buzz Lightyear.', start: 5, end: 8 },
          { speaker: 'Buzz', text: 'I come in peace.', start: 9, end: 11 },
          { speaker: 'Rex', text: "Oh, I'm Rex! Nice to meet you!", start: 15, end: 18 },
        ],
      },
    ],
  },
  {
    videoId: 'toystory-woody-meets-buzz',
    youtubeId: 'g2IF5NG2vU4',
    title: 'Woody Meets Buzz',
    movieTitle: 'Toy Story',
    genre: 'animation',
    difficulty: 'beginner',
    clips: [
      {
        start: 0, end: 40,
        lines: [
          { speaker: 'Woody', text: "Hi there. My name is Woody.", start: 5, end: 8 },
          { speaker: 'Buzz', text: 'I am Buzz Lightyear, Space Ranger.', start: 10, end: 13 },
        ],
      },
    ],
  },

  // ── Frozen ─────────────────────────────────────────────────────
  {
    videoId: 'frozen-meeting-olaf',
    youtubeId: 'H-_Wx7VETxE',
    title: 'Meeting Olaf',
    movieTitle: 'Frozen',
    genre: 'animation',
    difficulty: 'beginner',
    clips: [
      {
        start: 0, end: 35,
        lines: [
          { speaker: 'Olaf', text: "Hi! I'm Olaf, and I like warm hugs!", start: 5, end: 9 },
          { speaker: 'Anna', text: 'Olaf?', start: 10, end: 11 },
          { speaker: 'Olaf', text: "And you are...?", start: 12, end: 13 },
          { speaker: 'Anna', text: "I'm Anna.", start: 14, end: 15 },
        ],
      },
    ],
  },
  {
    videoId: 'frozen-anna-meets-kristoff',
    youtubeId: 'FZnRioNJu6I',
    title: 'Anna Meets Kristoff',
    movieTitle: 'Frozen',
    genre: 'animation',
    difficulty: 'beginner',
    clips: [
      {
        start: 0, end: 30,
        lines: [
          { speaker: 'Anna', text: "Hi! I'm Anna.", start: 3, end: 5 },
          { speaker: 'Kristoff', text: "Nice to meet you.", start: 7, end: 9 },
        ],
      },
    ],
  },

  // ── Finding Nemo ───────────────────────────────────────────────
  {
    videoId: 'nemo-hello-bruce',
    youtubeId: '7lucm7esMa8',
    title: "Hello, My Name is Bruce",
    movieTitle: 'Finding Nemo',
    genre: 'animation',
    difficulty: 'beginner',
    clips: [
      {
        start: 0, end: 30,
        lines: [
          { speaker: 'Bruce', text: "Hello! My name is Bruce.", start: 3, end: 6 },
          { speaker: 'Sharks', text: "Hello, Bruce!", start: 7, end: 9 },
          { speaker: 'Dory', text: "Hi, Bruce! My name is Dory.", start: 11, end: 14 },
          { speaker: 'Marlin', text: "I'm Marlin. Nice to meet you.", start: 15, end: 18 },
        ],
      },
    ],
  },
];

function seed(): void {
  const db = getDb();
  console.log('Seeding A1 Lesson 1 video clips...\n');

  for (const video of VIDEOS) {
    // Insert video (skip if exists)
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
      console.log(`  Video: ${video.movieTitle} — ${video.title}`);
    } catch {
      console.log(`  Video (exists): ${video.movieTitle} — ${video.title}`);
    }

    // Insert clips with subtitle lines
    for (const clipDef of video.clips) {
      const clipId = createClip(video.videoId, clipDef.start, clipDef.end);

      // Approve the clip
      db.prepare("UPDATE clips SET status = 'approved' WHERE id = ?").run(clipId);

      // Insert subtitle lines
      const insertLine = db.prepare(
        'INSERT INTO subtitle_lines (clip_id, line_index, speaker, text, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?)'
      );
      for (let i = 0; i < clipDef.lines.length; i++) {
        const line = clipDef.lines[i];
        insertLine.run(clipId, i, line.speaker, line.text, line.start, line.end);
      }

      // Link clip to lesson via clip_structures
      try {
        db.prepare(
          'INSERT OR IGNORE INTO clip_structures (clip_id, lesson_id) VALUES (?, ?)'
        ).run(clipId, LESSON_ID);
      } catch {
        // Already linked
      }

      console.log(`    Clip #${clipId}: ${clipDef.start}s-${clipDef.end}s (${clipDef.lines.length} lines)`);
    }
  }

  // Print stats
  const clipCount = (db.prepare(
    "SELECT COUNT(*) as n FROM clips c JOIN clip_structures cs ON cs.clip_id = c.id WHERE cs.lesson_id = ?"
  ).get(LESSON_ID) as any).n;
  console.log(`\nDone! ${clipCount} clips linked to ${LESSON_ID}`);
}

seed();
