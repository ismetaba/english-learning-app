/**
 * Wave 2: Add validated YouTube clips from search results.
 * All YouTube IDs below have been validated via oEmbed API.
 *
 * Run:  npx tsx scripts/seed-a1-wave2.ts
 * Then: npx tsx scripts/batch-whisperx.ts
 */

import Database from 'better-sqlite3';
import path from 'path';

const ROOT = path.join(__dirname, '..');
const DB_PATH = path.join(ROOT, 'data.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

interface ClipEntry {
  youtubeId: string;
  videoId: string;
  title: string;
  movieTitle: string;
  genre: string;
}

interface LessonDef {
  lessonId: string;
  clips: ClipEntry[];
}

const stmts = {
  findVideoByYt: db.prepare('SELECT id FROM videos WHERE youtube_video_id = ?'),
  findClipForVideo: db.prepare('SELECT id FROM clips WHERE video_id = ? LIMIT 1'),
  insertVideo: db.prepare(`
    INSERT INTO videos (id, youtube_video_id, title, movie_title, genre, difficulty, duration_seconds)
    VALUES (?, ?, ?, ?, ?, 'beginner', NULL)
  `),
  insertClip: db.prepare("INSERT INTO clips (video_id, start_time, end_time, status) VALUES (?, 0, 9999, 'approved')"),
  linkLesson: db.prepare('INSERT OR IGNORE INTO clip_structures (clip_id, lesson_id) VALUES (?, ?)'),
  existingLink: db.prepare('SELECT 1 FROM clip_structures WHERE clip_id = ? AND lesson_id = ?'),
};

const LESSONS: LessonDef[] = [
  // ─── LESSON 01: Greetings & Introductions ───────────────────
  {
    lessonId: 'lesson-01-greetings',
    clips: [
      { youtubeId: 'OvdQYzRHlO0', videoId: 'startrek-my-name-khan', title: 'My Name is Khan', movieTitle: 'Star Trek Into Darkness', genre: 'scifi' },
      { youtubeId: 'USS_p-4vo2w', videoId: 'gladiator-maximus-v2', title: 'My Name is Maximus (Movieclips)', movieTitle: 'Gladiator', genre: 'action' },
      { youtubeId: 'txHNcE_d7ro', videoId: 'bourne-identity-name', title: 'My Name Is Jason Bourne', movieTitle: 'The Bourne Identity', genre: 'action' },
      { youtubeId: 'vdtqSaJO-iM', videoId: 'forrest-box-full', title: 'Life Is Like A Box of Chocolates (Full)', movieTitle: 'Forrest Gump', genre: 'drama' },
      { youtubeId: 'ya0uliWzUTI', videoId: 'steve-jobs-hello', title: 'It Needs to Say Hello', movieTitle: 'Steve Jobs', genre: 'drama' },
      { youtubeId: 'VEB-OoUrNuk', videoId: 'strangelove-hello', title: 'Hello Dimitri', movieTitle: 'Dr. Strangelove', genre: 'comedy' },
      { youtubeId: 'qu4v5hB1dKk', videoId: 'singin-rain-morning', title: 'Good Morning', movieTitle: "Singin' in the Rain", genre: 'musical' },
      { youtubeId: 'JanwLiyFPAU', videoId: 'perfect-murder-meet', title: 'Nice to Meet You', movieTitle: 'A Perfect Murder', genre: 'drama' },
      { youtubeId: 'QuBQB_YKaFI', videoId: 'beautiful-day-meet', title: 'Nice to Meet You (Mr. Rogers)', movieTitle: 'A Beautiful Day in the Neighborhood', genre: 'drama' },
      { youtubeId: 'ELqdLvz60zA', videoId: 'fantastic-fox-wolf', title: 'Meeting the Wolf', movieTitle: 'Fantastic Mr. Fox', genre: 'animation' },
      { youtubeId: 'fNMtHosai08', videoId: 'elf-buddy-meets-dad', title: 'Buddy Meets His Dad', movieTitle: 'Elf', genre: 'comedy' },
      { youtubeId: 'nM0h6QXTpHQ', videoId: 'class-nice-meet', title: 'Nice to Meet You Mrs Burroughs', movieTitle: 'Class', genre: 'comedy' },
      { youtubeId: '8BI5jFyAdZ8', videoId: 'guess-dinner-pleased', title: 'Pleased to Meet You', movieTitle: "Guess Who's Coming to Dinner", genre: 'drama' },
      { youtubeId: 'C2J2y6-O4ww', videoId: 'hp-wizard-harry-v2', title: "You're a Wizard, Harry", movieTitle: 'Harry Potter', genre: 'fantasy' },
    ],
  },

  // ─── LESSON 02: Common Courtesy Phrases ─────────────────────
  {
    lessonId: 'lesson-02-courtesy-phrases',
    clips: [
      { youtubeId: 'yrxRCTUt6OY', videoId: 'thank-you-smoking-joan', title: 'The Joan Show', movieTitle: 'Thank You for Smoking', genre: 'comedy' },
      { youtubeId: 'xuaHRN7UhRo', videoId: 'thank-you-smoking-ice', title: 'Ice Cream Politics', movieTitle: 'Thank You for Smoking', genre: 'comedy' },
      { youtubeId: 'J-7LezqtuMY', videoId: 'impossible-thank-you', title: 'Thank You Scene', movieTitle: 'The Impossible', genre: 'drama' },
      { youtubeId: 'Wy4EfdnMZ5g', videoId: '2001-sorry-dave', title: "I'm Sorry Dave", movieTitle: '2001: A Space Odyssey', genre: 'scifi' },
      { youtubeId: '7m8_QLnRBFo', videoId: 'mrs-doubtfire-cake', title: "Mrs. Doubtfire's Cake Face", movieTitle: 'Mrs. Doubtfire', genre: 'comedy' },
      { youtubeId: 'dJU1SZIfK3Y', videoId: 'elf-realizes-human', title: 'Buddy Realizes He Is Human', movieTitle: 'Elf', genre: 'comedy' },
      { youtubeId: 'rHvCQEr_ETk', videoId: 'kfp-secret-ingredient', title: 'The True Secret Ingredient', movieTitle: 'Kung Fu Panda', genre: 'animation' },
      { youtubeId: 'aopdD9Cu-So', videoId: 'wizard-oz-melting', title: "I'm Melting!", movieTitle: 'The Wizard of Oz', genre: 'fantasy' },
      { youtubeId: 'em9lziI07M4', videoId: 'shrek-all-star-opening', title: 'All-Star Ogre Opening', movieTitle: 'Shrek', genre: 'animation' },
      { youtubeId: 'mFl8nzZuExE', videoId: 'shrek-muffin-man', title: 'Do You Know the Muffin Man?', movieTitle: 'Shrek', genre: 'animation' },
      { youtubeId: '37meAwQqPsE', videoId: 'gifted-mary-teacher', title: 'Teacher Finding Out Mary is Gifted', movieTitle: 'Gifted', genre: 'drama' },
    ],
  },

  // ─── LESSON 03: Subject Pronouns ────────────────────────────
  {
    lessonId: 'lesson-03-subject-pronouns',
    clips: [
      { youtubeId: 'RgDPi5WvC8M', videoId: 'starwars-i-am-father-hd', title: 'I Am Your Father (HD)', movieTitle: 'Star Wars: Episode V', genre: 'scifi' },
      { youtubeId: 'vi9m0JRo71I', videoId: 'venom-we-are-venom', title: 'We Are Venom', movieTitle: 'Venom', genre: 'action' },
      { youtubeId: 'USS_p-4vo2w', videoId: 'gladiator-maximus-v2', title: 'I Am Maximus (Movieclips)', movieTitle: 'Gladiator', genre: 'action' },
      { youtubeId: 'OvdQYzRHlO0', videoId: 'startrek-my-name-khan', title: 'I Am Khan', movieTitle: 'Star Trek Into Darkness', genre: 'scifi' },
      { youtubeId: 'Jy2_J5WCzDY', videoId: 'kfp-legendary-battle', title: 'Our Battle Will Be Legendary!', movieTitle: 'Kung Fu Panda', genre: 'animation' },
      { youtubeId: 'yRhRZB-nqOU', videoId: 'spiderman2-train', title: 'He Is Spider-Man - Stopping the Train', movieTitle: 'Spider-Man 2', genre: 'action' },
      { youtubeId: 'N_vFeAxFamw', videoId: 'spiderverse-chase', title: 'They Are Chasing Miles', movieTitle: 'Spider-Man: Across the Spider-Verse', genre: 'animation' },
      { youtubeId: '6PEQcK6G_4M', videoId: 'the-net-angela', title: 'I Am Angela Bennett', movieTitle: 'The Net', genre: 'drama' },
      { youtubeId: 'bSMxl1V8FSg', videoId: 'forrest-run-movieclips', title: 'Run, Forrest, Run!', movieTitle: 'Forrest Gump', genre: 'drama' },
      { youtubeId: 'txHNcE_d7ro', videoId: 'bourne-identity-name', title: 'I Am Jason Bourne', movieTitle: 'The Bourne Identity', genre: 'action' },
      { youtubeId: 'C2J2y6-O4ww', videoId: 'hp-wizard-harry-v2', title: 'You Are a Wizard', movieTitle: 'Harry Potter', genre: 'fantasy' },
    ],
  },

  // ─── LESSON 04: To Be + Noun ────────────────────────────────
  {
    lessonId: 'lesson-04-to-be-noun',
    clips: [
      { youtubeId: 'C2J2y6-O4ww', videoId: 'hp-wizard-harry-v2', title: 'You Are A Wizard, Harry', movieTitle: 'Harry Potter', genre: 'fantasy' },
      { youtubeId: 'USS_p-4vo2w', videoId: 'gladiator-maximus-v2', title: 'I Am A General, A Father', movieTitle: 'Gladiator', genre: 'action' },
      { youtubeId: 'OvdQYzRHlO0', videoId: 'startrek-my-name-khan', title: 'My Name is Khan', movieTitle: 'Star Trek Into Darkness', genre: 'scifi' },
      { youtubeId: '6PEQcK6G_4M', videoId: 'the-net-angela', title: 'I Am Angela Bennett', movieTitle: 'The Net', genre: 'drama' },
      { youtubeId: 'vi9m0JRo71I', videoId: 'venom-we-are-venom', title: 'We Are Venom', movieTitle: 'Venom', genre: 'action' },
      { youtubeId: 'em9lziI07M4', videoId: 'shrek-all-star-opening', title: 'I Am An Ogre', movieTitle: 'Shrek', genre: 'animation' },
      { youtubeId: 'fNMtHosai08', videoId: 'elf-buddy-meets-dad', title: 'I Am A Human / I Am An Elf', movieTitle: 'Elf', genre: 'comedy' },
      { youtubeId: 'Jy2_J5WCzDY', videoId: 'kfp-legendary-battle', title: 'I Am The Dragon Warrior', movieTitle: 'Kung Fu Panda', genre: 'animation' },
      { youtubeId: 'rHvCQEr_ETk', videoId: 'kfp-secret-ingredient', title: 'The Secret Ingredient', movieTitle: 'Kung Fu Panda', genre: 'animation' },
      { youtubeId: 'ELqdLvz60zA', videoId: 'fantastic-fox-wolf', title: 'He Is A Wolf', movieTitle: 'Fantastic Mr. Fox', genre: 'animation' },
    ],
  },

  // ─── LESSON 05: To Be + Adjective ──────────────────────────
  {
    lessonId: 'lesson-05-to-be-adjective',
    clips: [
      { youtubeId: 'Wy4EfdnMZ5g', videoId: '2001-sorry-dave', title: "I'm Sorry Dave (Calm Voice)", movieTitle: '2001: A Space Odyssey', genre: 'scifi' },
      { youtubeId: 'vi9m0JRo71I', videoId: 'venom-we-are-venom', title: 'Angry Transformation', movieTitle: 'Venom', genre: 'action' },
      { youtubeId: 'aopdD9Cu-So', videoId: 'wizard-oz-melting', title: 'Wicked Witch Is Melting!', movieTitle: 'The Wizard of Oz', genre: 'fantasy' },
      { youtubeId: 'QuBQB_YKaFI', videoId: 'beautiful-day-meet', title: 'It Is A Beautiful Day', movieTitle: 'A Beautiful Day in the Neighborhood', genre: 'drama' },
      { youtubeId: '37meAwQqPsE', videoId: 'gifted-mary-teacher', title: 'She Is Gifted', movieTitle: 'Gifted', genre: 'drama' },
      { youtubeId: 'em9lziI07M4', videoId: 'shrek-all-star-opening', title: 'He Is Happy', movieTitle: 'Shrek', genre: 'animation' },
    ],
  },

  // ─── LESSON 06: To Be + Negative ───────────────────────────
  {
    lessonId: 'lesson-06-to-be-negative',
    clips: [
      { youtubeId: 'vi9m0JRo71I', videoId: 'venom-we-are-venom', title: 'We Are Not Enemies', movieTitle: 'Venom', genre: 'action' },
      { youtubeId: '7m8_QLnRBFo', videoId: 'mrs-doubtfire-cake', title: "She Isn't Who You Think", movieTitle: 'Mrs. Doubtfire', genre: 'comedy' },
      { youtubeId: 'Wy4EfdnMZ5g', videoId: '2001-sorry-dave', title: "I'm Afraid I Can't Do That", movieTitle: '2001: A Space Odyssey', genre: 'scifi' },
      { youtubeId: 'mFl8nzZuExE', videoId: 'shrek-muffin-man', title: 'Not The Muffin Man!', movieTitle: 'Shrek', genre: 'animation' },
    ],
  },

  // ─── LESSON 07: To Be + Questions ──────────────────────────
  {
    lessonId: 'lesson-07-to-be-questions',
    clips: [
      { youtubeId: 'OvdQYzRHlO0', videoId: 'startrek-my-name-khan', title: 'Who Are You?', movieTitle: 'Star Trek Into Darkness', genre: 'scifi' },
      { youtubeId: 'N_vFeAxFamw', videoId: 'spiderverse-chase', title: 'Is He One of Us?', movieTitle: 'Spider-Man: Across the Spider-Verse', genre: 'animation' },
      { youtubeId: 'yRhRZB-nqOU', videoId: 'spiderman2-train', title: 'Is He Alive?', movieTitle: 'Spider-Man 2', genre: 'action' },
    ],
  },

  // ─── LESSON 08: Wh- Questions with To Be ───────���───────────
  {
    lessonId: 'lesson-08-wh-questions-to-be',
    clips: [
      { youtubeId: 'txHNcE_d7ro', videoId: 'bourne-identity-name', title: 'Who Am I?', movieTitle: 'The Bourne Identity', genre: 'action' },
      { youtubeId: '6PEQcK6G_4M', videoId: 'the-net-angela', title: 'Who Is She?', movieTitle: 'The Net', genre: 'drama' },
    ],
  },

  // ─── LESSON 09: Articles ───────────────────────────────────
  {
    lessonId: 'lesson-09-articles',
    clips: [
      { youtubeId: 'vdtqSaJO-iM', videoId: 'forrest-box-full', title: 'A Box of Chocolates', movieTitle: 'Forrest Gump', genre: 'drama' },
      { youtubeId: 'ELqdLvz60zA', videoId: 'fantastic-fox-wolf', title: 'A Wolf / The Fox', movieTitle: 'Fantastic Mr. Fox', genre: 'animation' },
      { youtubeId: 'Jy2_J5WCzDY', videoId: 'kfp-legendary-battle', title: 'The Dragon Warrior', movieTitle: 'Kung Fu Panda', genre: 'animation' },
    ],
  },

  // ─── LESSON 10: Demonstratives ─────────────────────────────
  {
    lessonId: 'lesson-10-demonstratives',
    clips: [
      { youtubeId: 'RgDPi5WvC8M', videoId: 'starwars-i-am-father-hd', title: 'That Is Not True!', movieTitle: 'Star Wars: Episode V', genre: 'scifi' },
      { youtubeId: 'vi9m0JRo71I', videoId: 'venom-we-are-venom', title: 'This Is Our Chance', movieTitle: 'Venom', genre: 'action' },
    ],
  },

  // ─── LESSON 11: Possessive Adjectives ────────────────���─────
  {
    lessonId: 'lesson-11-possessive-adjectives',
    clips: [
      { youtubeId: 'RgDPi5WvC8M', videoId: 'starwars-i-am-father-hd', title: 'Your Father', movieTitle: 'Star Wars: Episode V', genre: 'scifi' },
      { youtubeId: 'USS_p-4vo2w', videoId: 'gladiator-maximus-v2', title: 'My Name Is Maximus', movieTitle: 'Gladiator', genre: 'action' },
      { youtubeId: 'txHNcE_d7ro', videoId: 'bourne-identity-name', title: 'My Name Is Jason Bourne', movieTitle: 'The Bourne Identity', genre: 'action' },
    ],
  },

  // ─── LESSON 12: Basic Vocabulary ───────────────────────────
  {
    lessonId: 'lesson-12-basic-vocabulary',
    clips: [
      { youtubeId: 'fNMtHosai08', videoId: 'elf-buddy-meets-dad', title: 'Dad and Son (Family)', movieTitle: 'Elf', genre: 'comedy' },
      { youtubeId: '37meAwQqPsE', videoId: 'gifted-mary-teacher', title: 'Smart Girl (Vocabulary)', movieTitle: 'Gifted', genre: 'drama' },
    ],
  },

  // ─── LESSON 13: Simple Commands ────────────────────────────
  {
    lessonId: 'lesson-13-simple-commands',
    clips: [
      { youtubeId: 'bSMxl1V8FSg', videoId: 'forrest-run-movieclips', title: 'Run, Forrest, Run!', movieTitle: 'Forrest Gump', genre: 'drama' },
      { youtubeId: 'Jy2_J5WCzDY', videoId: 'kfp-legendary-battle', title: 'Come On! Fight!', movieTitle: 'Kung Fu Panda', genre: 'animation' },
      { youtubeId: 'N_vFeAxFamw', videoId: 'spiderverse-chase', title: 'Stop Him! Go!', movieTitle: 'Spider-Man: Across the Spider-Verse', genre: 'animation' },
      { youtubeId: 'yRhRZB-nqOU', videoId: 'spiderman2-train', title: 'Hold On!', movieTitle: 'Spider-Man 2', genre: 'action' },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════

function run(): void {
  console.log('═══ Wave 2: Adding validated YouTube clips ═══\n');

  let totalLinked = 0;
  let totalNew = 0;

  for (const lesson of LESSONS) {
    console.log(`\n─── ${lesson.lessonId} (${lesson.clips.length} clips) ───`);

    for (const entry of lesson.clips) {
      const existing = stmts.findVideoByYt.get(entry.youtubeId) as any;

      if (existing) {
        // Video exists — find clip and link
        const clip = stmts.findClipForVideo.get(existing.id) as any;
        if (!clip) continue;
        const already = stmts.existingLink.get(clip.id, lesson.lessonId);
        if (already) {
          console.log(`  ↗ ${entry.movieTitle} — ${entry.title} (already linked)`);
        } else {
          stmts.linkLesson.run(clip.id, lesson.lessonId);
          console.log(`  ↗ ${entry.movieTitle} — ${entry.title} (linked clip #${clip.id})`);
        }
        totalLinked++;
      } else {
        // New video
        try {
          stmts.insertVideo.run(entry.videoId, entry.youtubeId, entry.title, entry.movieTitle, entry.genre);
          const result = stmts.insertClip.run(entry.videoId);
          const clipId = result.lastInsertRowid as number;
          stmts.linkLesson.run(clipId, lesson.lessonId);
          console.log(`  ★ ${entry.movieTitle} — ${entry.title} (new clip #${clipId})`);
          totalNew++;
        } catch (e: any) {
          console.log(`  ⚠ ${entry.videoId}: ${e.message}`);
        }
      }
    }
  }

  console.log(`\n═══ SUMMARY ═══`);
  console.log(`  Linked: ${totalLinked}, New: ${totalNew}`);

  console.log('\n  Clips per lesson:');
  const results = db.prepare(`
    SELECT cs.lesson_id, COUNT(DISTINCT cs.clip_id) as clip_count
    FROM clip_structures cs
    GROUP BY cs.lesson_id
    ORDER BY cs.lesson_id
  `).all() as any[];
  for (const r of results) {
    console.log(`    ${r.lesson_id}: ${r.clip_count} clips`);
  }

  const needWhisperx = db.prepare(`
    SELECT COUNT(DISTINCT v.id) as n
    FROM videos v
    JOIN clips c ON c.video_id = v.id
    LEFT JOIN subtitle_lines sl ON sl.clip_id = c.id
    WHERE sl.id IS NULL
  `).get() as any;
  if (needWhisperx.n > 0) {
    console.log(`\n  ⚡ ${needWhisperx.n} videos need WhisperX. Run: npx tsx scripts/batch-whisperx.ts`);
  }

  db.close();
}

run();
