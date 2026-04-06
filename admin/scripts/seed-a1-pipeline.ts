/**
 * Smart A1 clip pipeline — reuses existing WhisperX subtitles.
 *
 * Run:  npx tsx scripts/seed-a1-pipeline.ts
 * Then: npx tsx scripts/batch-whisperx.ts   (for new videos without subtitles)
 *
 * For each clip definition:
 * 1. If the YouTube video already exists in DB with subtitles → create a new
 *    clip and COPY overlapping subtitle_lines + word_timestamps.
 * 2. If the video exists but has NO subtitles → just create the clip (batch-whisperx
 *    will process it later).
 * 3. If the video is brand new → create video + clip (batch-whisperx processes later).
 * 4. Link every clip to its lesson via clip_structures.
 */

import Database from 'better-sqlite3';
import path from 'path';

const ROOT = path.join(__dirname, '..');
const DB_PATH = path.join(ROOT, 'data.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Types ──────────────────────────────────────────────────────

interface ClipEntry {
  youtubeId: string;
  videoId: string;       // slug for videos.id
  title: string;
  movieTitle: string;
  genre: string;
  start?: number;        // clip start time (default 0)
  end?: number;          // clip end time (default 9999)
}

interface LessonDef {
  lessonId: string;
  clips: ClipEntry[];
}

// ── DB Helpers ─────────────────────────────────────────────────

const stmts = {
  findVideoByYt: db.prepare('SELECT id FROM videos WHERE youtube_video_id = ?'),
  findClipForVideo: db.prepare('SELECT id FROM clips WHERE video_id = ? LIMIT 1'),
  getSubLines: db.prepare(`
    SELECT sl.*, c.start_time as clip_start, c.end_time as clip_end
    FROM subtitle_lines sl
    JOIN clips c ON c.id = sl.clip_id
    WHERE c.video_id = ?
    ORDER BY sl.start_time
  `),
  getWords: db.prepare('SELECT * FROM word_timestamps WHERE line_id = ? ORDER BY word_index'),
  insertVideo: db.prepare(`
    INSERT INTO videos (id, youtube_video_id, title, movie_title, genre, difficulty, duration_seconds)
    VALUES (?, ?, ?, ?, ?, 'beginner', NULL)
  `),
  insertClip: db.prepare("INSERT INTO clips (video_id, start_time, end_time, status) VALUES (?, ?, ?, 'approved')"),
  insertLine: db.prepare(`
    INSERT INTO subtitle_lines (clip_id, line_index, speaker, text, start_time, end_time)
    VALUES (?, ?, ?, ?, ?, ?)
  `),
  insertWord: db.prepare(`
    INSERT INTO word_timestamps (line_id, word_index, word, start_time, end_time)
    VALUES (?, ?, ?, ?, ?)
  `),
  linkLesson: db.prepare('INSERT OR IGNORE INTO clip_structures (clip_id, lesson_id) VALUES (?, ?)'),
  countLines: db.prepare('SELECT COUNT(*) as n FROM subtitle_lines WHERE clip_id = ?'),
  approveClip: db.prepare("UPDATE clips SET status = 'approved' WHERE id = ?"),
  existingLink: db.prepare('SELECT 1 FROM clip_structures WHERE clip_id = ? AND lesson_id = ?'),
};

function videoExistsByYt(ytId: string): string | null {
  const row = stmts.findVideoByYt.get(ytId) as any;
  return row ? row.id : null;
}

function getExistingClipId(videoId: string): number | null {
  const row = stmts.findClipForVideo.get(videoId) as any;
  return row ? row.id : null;
}

function copySubtitlesForTimeRange(sourceVideoId: string, targetClipId: number, startTime: number, endTime: number): number {
  const lines = stmts.getSubLines.all(sourceVideoId) as any[];
  let copied = 0;
  let lineIdx = 0;

  for (const line of lines) {
    // Check if this subtitle overlaps with the target time range
    if (line.end_time < startTime || line.start_time > endTime) continue;

    const result = stmts.insertLine.run(targetClipId, lineIdx, line.speaker, line.text, line.start_time, line.end_time);
    const newLineId = result.lastInsertRowid as number;

    // Copy word timestamps
    const words = stmts.getWords.all(line.id) as any[];
    for (const w of words) {
      stmts.insertWord.run(newLineId, w.word_index, w.word, w.start_time, w.end_time);
    }

    lineIdx++;
    copied++;
  }
  return copied;
}

// ═══════════════════════════════════════════════════════════════
// CLIP DATA — organized by lesson
// ═══════════════════════════════════════════════════════════════

const LESSONS: LessonDef[] = [
  // ─── LESSON 01: Greetings & Introductions ───────────────────
  {
    lessonId: 'lesson-01-greetings',
    clips: [
      { youtubeId: 'WzV6mXIOVl4', videoId: 'elf-hello-buddy', title: 'Buddy the Elf Hello', movieTitle: 'Elf', genre: 'comedy' },
      { youtubeId: 'fv2GVRKI0bE', videoId: 'mean-girls-intro', title: 'New Student Introduction', movieTitle: 'Mean Girls', genre: 'comedy' },
      { youtubeId: 'k2h-GBCn4M4', videoId: 'pulp-fiction-hello', title: 'Vincent and Jules Introduction', movieTitle: 'Pulp Fiction', genre: 'drama' },
      { youtubeId: 'FApbkER6SDo', videoId: 'enchanted-how-you-know', title: 'How Do You Know', movieTitle: 'Enchanted', genre: 'animation' },
      { youtubeId: '2IjHfsIPKhM', videoId: 'cars-lightning-intro', title: 'Lightning McQueen Introduction', movieTitle: 'Cars', genre: 'animation' },
      { youtubeId: 'k-0geBnYpHM', videoId: 'up-meet-russell', title: 'Carl Meets Russell', movieTitle: 'Up', genre: 'animation' },
      { youtubeId: 'f0LGPSbasLo', videoId: 'monsters-inc-boo', title: 'Sulley Meets Boo', movieTitle: 'Monsters Inc.', genre: 'animation' },
      { youtubeId: 'ngJGRALkoys', videoId: 'wall-e-meets-eve', title: 'WALL-E Meets EVE', movieTitle: 'WALL-E', genre: 'animation' },
      { youtubeId: 'oL9LwJNmkX0', videoId: 'brave-intro-merida', title: 'My Name Is Merida', movieTitle: 'Brave', genre: 'animation' },
      { youtubeId: 'JQRtuxdfQHg', videoId: 'how-i-met-mother-intro', title: 'How I Met Your Mother', movieTitle: 'How I Met Your Mother', genre: 'comedy' },
      { youtubeId: 'sq5zcOUyc9I', videoId: 'brooklyn-nine-nine-intro', title: 'Jake Peralta Introduction', movieTitle: 'Brooklyn Nine-Nine', genre: 'comedy' },
      { youtubeId: '_OBlgSz8sSM', videoId: 'titanic-jack-intro', title: 'Jack Meets Rose', movieTitle: 'Titanic', genre: 'drama' },
    ],
  },

  // ─── LESSON 02: Common Courtesy Phrases ─────────────────────
  {
    lessonId: 'lesson-02-courtesy-phrases',
    clips: [
      { youtubeId: 'EKE81oAEoNk', videoId: 'beauty-beast-thank-you', title: 'Thank You For Saving My Life', movieTitle: 'Beauty and the Beast', genre: 'animation' },
      { youtubeId: '79DijItQXMM', videoId: 'moana-youre-welcome', title: "You're Welcome", movieTitle: 'Moana', genre: 'animation' },
      { youtubeId: '5Bt63E2Acxg', videoId: 'kfp-please-dont-die', title: 'Please Don\'t Die Shifu', movieTitle: 'Kung Fu Panda', genre: 'animation' },
      { youtubeId: 'Pqsy7V0wphI', videoId: 'mr-bean-sorry', title: 'Mr. Bean Sorry Scene', movieTitle: 'Mr. Bean', genre: 'comedy' },
      { youtubeId: 'W2Zs6KgRBpc', videoId: 'big-bang-sorry', title: 'Sheldon Apologizes', movieTitle: 'The Big Bang Theory', genre: 'comedy' },
      { youtubeId: '0CGaFnNHv-g', videoId: 'liar-liar-excuse-me', title: 'Excuse Me Scene', movieTitle: 'Liar Liar', genre: 'comedy' },
      { youtubeId: 'HQ7bC1_mBSk', videoId: 'frozen-thank-you-scene', title: 'Thank You Kristoff', movieTitle: 'Frozen', genre: 'animation' },
      { youtubeId: 'gzbKmBCR_ig', videoId: 'minions-thank-you', title: 'Minions Thank You', movieTitle: 'Despicable Me', genre: 'animation' },
      { youtubeId: 'pBk4NYhWNMM', videoId: 'ratatouille-thank-you', title: 'Thank You Chef', movieTitle: 'Ratatouille', genre: 'animation' },
      { youtubeId: 'Bum4KrT290o', videoId: 'friends-sorry-scenes', title: 'Friends Sorry Compilation', movieTitle: 'Friends', genre: 'comedy' },
      { youtubeId: 'SxwMTAOmMf4', videoId: 'inside-out-sorry-scene', title: 'Joy Apologizes', movieTitle: 'Inside Out', genre: 'animation' },
      { youtubeId: 'W62vlKqIsb4', videoId: 'zootopia-excuse-me', title: 'Judy Hopps Excuse Me', movieTitle: 'Zootopia', genre: 'animation' },
      { youtubeId: 'L8GdSAeHv4g', videoId: 'tangled-please-scene', title: 'Please Rapunzel', movieTitle: 'Tangled', genre: 'animation' },
      { youtubeId: 'hZ1Rb9hC4JY', videoId: 'office-sorry-michael', title: 'Michael Scott Sorry', movieTitle: 'The Office', genre: 'comedy' },
      { youtubeId: 'kIBdpFJyFkc', videoId: 'home-alone-excuse', title: 'Excuse Me Scene', movieTitle: 'Home Alone', genre: 'comedy' },
    ],
  },

  // ─── LESSON 03: Subject Pronouns ────────────────────────────
  {
    lessonId: 'lesson-03-subject-pronouns',
    clips: [
      { youtubeId: 'c8pTIa0JQtM', videoId: 'groot-i-am-groot-bomb', title: 'I Am Groot Bomb Scene', movieTitle: 'Guardians of the Galaxy Vol. 2', genre: 'action' },
      { youtubeId: 'YwSF8rM-ePU', videoId: 'groot-prison-break', title: 'I Am Groot Prison Break', movieTitle: 'Guardians of the Galaxy', genre: 'action' },
      { youtubeId: 'U9HdRqQKHDU', videoId: 'toystory-you-are-a-toy', title: 'You Are A Toy', movieTitle: 'Toy Story', genre: 'animation' },
      { youtubeId: 'ICUMGYHYBKY', videoId: 'wreck-ralph-princesses', title: 'Vanellope Meets Disney Princesses', movieTitle: 'Ralph Breaks the Internet', genre: 'animation' },
      { youtubeId: 'U6_hBEddzpg', videoId: 'shrek-flying-donkey', title: 'A Flying Talking Donkey', movieTitle: 'Shrek', genre: 'animation' },
      { youtubeId: 'TWB31WFomz4', videoId: 'endgame-i-am-iron-man', title: 'And I Am Iron Man', movieTitle: 'Avengers: Endgame', genre: 'action' },
      { youtubeId: 'Hrimfgjf4k8', videoId: 'groot-blue-button', title: 'Groot Blue Button', movieTitle: 'Guardians of the Galaxy Vol. 2', genre: 'action' },
      { youtubeId: 'yV5a81odL8E', videoId: 'wreck-ralph-affirmation', title: 'Bad Guy Affirmation', movieTitle: 'Wreck-It Ralph', genre: 'animation' },
      { youtubeId: 'dU4lYcN6zEY', videoId: 'rush-hour-what-is-your-name', title: 'What Is Your Name', movieTitle: 'Rush Hour 3', genre: 'comedy' },
      { youtubeId: '1S0RKRRyqhQ', videoId: 'inside-out-emotions', title: 'Meet The Emotions', movieTitle: 'Inside Out', genre: 'animation' },
      { youtubeId: 'GLheiLGZ1k8', videoId: 'star-wars-your-father', title: 'I Am Your Father', movieTitle: 'Star Wars', genre: 'scifi' },
      { youtubeId: 'lKn-Agk-yAI', videoId: 'gladiator-maximus', title: 'My Name Is Maximus', movieTitle: 'Gladiator', genre: 'action' },
      { youtubeId: 'b9434BoGkNQ', videoId: 'avatar-i-see-you', title: 'I See You', movieTitle: 'Avatar', genre: 'scifi' },
      { youtubeId: 'r8S6bOjFJMY', videoId: 'braveheart-freedom', title: 'They May Take Our Lives', movieTitle: 'Braveheart', genre: 'action' },
      { youtubeId: 'FKbQnNc5_D0', videoId: 'seinfeld-he-she-they', title: 'He Said She Said', movieTitle: 'Seinfeld', genre: 'comedy' },
    ],
  },

  // ─── LESSON 04: To Be + Noun ────────────────────────────────
  {
    lessonId: 'lesson-04-to-be-noun',
    clips: [
      { youtubeId: '3ubS15ro0Uc', videoId: 'hp-you-are-a-wizard', title: 'You Are A Wizard Harry', movieTitle: 'Harry Potter', genre: 'fantasy' },
      { youtubeId: 'lKn-Agk-yAI', videoId: 'gladiator-maximus', title: 'My Name Is Maximus', movieTitle: 'Gladiator', genre: 'action' },
      { youtubeId: 'hE1yWDdP-yg', videoId: 'wreck-ralph-she-is-princess', title: 'She Is A Princess', movieTitle: 'Ralph Breaks the Internet', genre: 'animation' },
      { youtubeId: 'ZY_I6q0okhI', videoId: 'tootsie-dorothy', title: 'My Name Is Dorothy', movieTitle: 'Tootsie', genre: 'comedy' },
      { youtubeId: 'I73sP93-0xA', videoId: 'princess-bride-inigo', title: 'My Name Is Inigo Montoya', movieTitle: 'The Princess Bride', genre: 'adventure' },
      { youtubeId: 'Gs7SIiRHQfs', videoId: 'harry-potter-first-meet', title: 'Harry Potter First Meet', movieTitle: 'Harry Potter', genre: 'fantasy' },
      { youtubeId: 'EBCs92XtRkI', videoId: 'toystory-buzz-meets-toys', title: 'Buzz Lightyear Meets Toys', movieTitle: 'Toy Story', genre: 'animation' },
      { youtubeId: 'w2YkWHaO_Io', videoId: 'spiderman-who-am-i', title: 'Who Am I - Spider-Man', movieTitle: 'Spider-Man', genre: 'action' },
      { youtubeId: 'DzUc3Eqzzos', videoId: 'anger-mgmt-who-are-you', title: 'Who Are You', movieTitle: 'Anger Management', genre: 'comedy' },
      { youtubeId: 'uxeR95aYer0', videoId: 'wreck-ralph-bad-anon', title: 'I Am A Bad Guy', movieTitle: 'Wreck-It Ralph', genre: 'animation' },
      { youtubeId: 'z4K2F_OALPQ', videoId: 'harry-potter-sorting', title: 'Sorting Hat Scene', movieTitle: 'Harry Potter', genre: 'fantasy' },
      { youtubeId: '99RzToAF55Y', videoId: 'big-hero-6-baymax', title: 'I Am Baymax', movieTitle: 'Big Hero 6', genre: 'animation' },
      { youtubeId: 'SqOnkiQRCUU', videoId: 'forrest-box-chocolates', title: 'Life Is Like A Box', movieTitle: 'Forrest Gump', genre: 'drama' },
      { youtubeId: 'OPR3GlpQQJA', videoId: 'batman-i-am-batman', title: 'I Am Batman', movieTitle: 'Batman', genre: 'action' },
      { youtubeId: 'Wji-BZ0oCwg', videoId: 'django-i-am-django', title: 'The D Is Silent', movieTitle: 'Django Unchained', genre: 'drama' },
    ],
  },

  // ─── LESSON 05: To Be + Adjective ──────────────────────────
  {
    lessonId: 'lesson-05-to-be-adjective',
    clips: [
      { youtubeId: '1S0RKRRyqhQ', videoId: 'inside-out-emotions', title: 'Meet The Emotions', movieTitle: 'Inside Out', genre: 'animation' },
      { youtubeId: '-HQIg3ZwAs0', videoId: 'insideout-anger', title: 'Anger Is Angry', movieTitle: 'Inside Out', genre: 'animation' },
      { youtubeId: 'l8h_6uV7Yzs', videoId: 'insideout-sadness', title: 'Sadness Is Sad', movieTitle: 'Inside Out', genre: 'animation' },
      { youtubeId: 'hIGF-Fkxbk0', videoId: 'insideout-joy', title: 'Joy Is Happy', movieTitle: 'Inside Out', genre: 'animation' },
      { youtubeId: '6D4oP8UJQ90', videoId: 'insideout-disgust', title: 'Disgust Is Disgusted', movieTitle: 'Inside Out', genre: 'animation' },
      { youtubeId: '85z4N_sHXJw', videoId: 'insideout-fear', title: 'Fear Is Afraid', movieTitle: 'Inside Out', genre: 'animation' },
      { youtubeId: 'HmdpjkM3onk', videoId: 'gladiator-entertained', title: 'Are You Not Entertained', movieTitle: 'Gladiator', genre: 'action' },
      { youtubeId: 'seMwpP0yeu4', videoId: 'insideout-trailer', title: 'Inside Out Trailer', movieTitle: 'Inside Out', genre: 'animation' },
      { youtubeId: 'fKhT2J2gnZs', videoId: 'frozen-anna-olaf-scene', title: 'Olaf Is Funny', movieTitle: 'Frozen', genre: 'animation' },
      { youtubeId: 'Dod-OBCuJ9Q', videoId: 'madagascar-zoo', title: 'Madagascar Zoo Scene', movieTitle: 'Madagascar', genre: 'animation' },
      { youtubeId: 'CLvXFVbb82Q', videoId: 'friends-joey-how-you-doin', title: 'How You Doin', movieTitle: 'Friends', genre: 'comedy' },
      { youtubeId: 'iRUiM7kVBXA', videoId: 'kfp1-dragon-warrior', title: 'You Are The Dragon Warrior', movieTitle: 'Kung Fu Panda', genre: 'animation' },
      { youtubeId: 'yGE_TWz-ZLw', videoId: 'shrek-donkey-meets', title: 'Donkey Meets Shrek', movieTitle: 'Shrek', genre: 'animation' },
      { youtubeId: 'QNR6j0GVTWE', videoId: 'happy-feet-happy', title: 'Happy Feet Dance', movieTitle: 'Happy Feet', genre: 'animation' },
      { youtubeId: 'hZ1OgAT5cSo', videoId: 'anchorman-im-kind-big-deal', title: "I'm Kind Of A Big Deal", movieTitle: 'Anchorman', genre: 'comedy' },
    ],
  },

  // ─── LESSON 06: To Be + Negative ───────────────────────────
  {
    lessonId: 'lesson-06-to-be-negative',
    clips: [
      { youtubeId: 's_EiYUTHG24', videoId: 'wreck-ralph-not-bad-guy', title: "I'm Not A Bad Guy", movieTitle: 'Wreck-It Ralph', genre: 'animation' },
      { youtubeId: 'U9HdRqQKHDU', videoId: 'toystory-you-are-a-toy', title: 'You Are NOT A Space Ranger', movieTitle: 'Toy Story', genre: 'animation' },
      { youtubeId: 'D68Jvv3BfCQ', videoId: 'toystory-buzz-fight', title: 'Buzz and Woody Argue', movieTitle: 'Toy Story', genre: 'animation' },
      { youtubeId: 'TSvBrYIPK5s', videoId: 'frozen-olaf-funniest', title: "I'm Not Crying", movieTitle: 'Frozen', genre: 'animation' },
      { youtubeId: 'DzUc3Eqzzos', videoId: 'anger-mgmt-who-are-you', title: 'Who Are You Not', movieTitle: 'Anger Management', genre: 'comedy' },
      { youtubeId: 'x__NgnMBHV0', videoId: 'insideout-her-name', title: 'She Is Not Happy', movieTitle: 'Inside Out', genre: 'animation' },
      { youtubeId: 'JMNyDtib6Y4', videoId: 'the-office-michael', title: 'Michael Scott Denial', movieTitle: 'The Office', genre: 'comedy' },
      { youtubeId: 'xuS9UxuUZ3Y', videoId: 'shrek-swamp-question', title: 'This Is Not Your Swamp', movieTitle: 'Shrek', genre: 'animation' },
      { youtubeId: 'K-60AfWHvBw', videoId: 'shrek3-morning', title: "It's Not Easy Being King", movieTitle: 'Shrek the Third', genre: 'animation' },
      { youtubeId: '-QWL-FwX4t4', videoId: 'taxi-driver-talking-to-me', title: 'You Talking To Me?', movieTitle: 'Taxi Driver', genre: 'drama' },
      { youtubeId: 'g2IF5NG2vU4', videoId: 'toystory-woody-meets-buzz', title: "That's Not Flying", movieTitle: 'Toy Story', genre: 'animation' },
      { youtubeId: 'wNfvA_3sOss', videoId: 'big-bang-theory-apology', title: "I'm Not Crazy", movieTitle: 'The Big Bang Theory', genre: 'comedy' },
      { youtubeId: 'ihyjXd2C-E8', videoId: 'star-wars-these-droids', title: 'These Are Not The Droids', movieTitle: 'Star Wars', genre: 'scifi' },
      { youtubeId: 'LTJvdGcb7Fs', videoId: 'shes-the-man-not-girl', title: "I'm Not A Girl", movieTitle: "She's the Man", genre: 'comedy' },
      { youtubeId: 'dQw4w9WgXcQ', videoId: 'never-gonna-give', title: 'Never Gonna Give You Up', movieTitle: 'Rick Astley', genre: 'music' },
    ],
  },

  // ─── LESSON 07: To Be + Questions ──────────────────────────
  {
    lessonId: 'lesson-07-to-be-questions',
    clips: [
      { youtubeId: 'DzUc3Eqzzos', videoId: 'anger-mgmt-who-are-you', title: 'Are You Okay?', movieTitle: 'Anger Management', genre: 'comedy' },
      { youtubeId: 'HmdpjkM3onk', videoId: 'gladiator-entertained', title: 'Are You Not Entertained?', movieTitle: 'Gladiator', genre: 'action' },
      { youtubeId: 'dU4lYcN6zEY', videoId: 'rush-hour-what-is-your-name', title: 'Are You Deaf?', movieTitle: 'Rush Hour 3', genre: 'comedy' },
      { youtubeId: 'FZnRioNJu6I', videoId: 'frozen-anna-meets-kristoff', title: 'Are You Some Sort Of Love Expert?', movieTitle: 'Frozen', genre: 'animation' },
      { youtubeId: 'TaoCCzHXx3I', videoId: 'tangled-who-are-you', title: 'Who Are You?', movieTitle: 'Tangled', genre: 'animation' },
      { youtubeId: 'H-_Wx7VETxE', videoId: 'frozen-meeting-olaf', title: 'Are You A Snowman?', movieTitle: 'Frozen', genre: 'animation' },
      { youtubeId: '-QWL-FwX4t4', videoId: 'taxi-driver-talking-to-me', title: 'Are You Talking To Me?', movieTitle: 'Taxi Driver', genre: 'drama' },
      { youtubeId: 'CLvXFVbb82Q', videoId: 'friends-joey-how-you-doin', title: 'Are You Okay Joey?', movieTitle: 'Friends', genre: 'comedy' },
      { youtubeId: 'yGE_TWz-ZLw', videoId: 'shrek-donkey-meets', title: 'Is That Your Swamp?', movieTitle: 'Shrek', genre: 'animation' },
      { youtubeId: 'pBk4NYhWNMM', videoId: 'ratatouille-thank-you', title: 'Is He A Chef?', movieTitle: 'Ratatouille', genre: 'animation' },
      { youtubeId: 'JMNyDtib6Y4', videoId: 'the-office-michael', title: 'Is He Serious?', movieTitle: 'The Office', genre: 'comedy' },
      { youtubeId: 'iRUiM7kVBXA', videoId: 'kfp1-dragon-warrior', title: 'Is He The Dragon Warrior?', movieTitle: 'Kung Fu Panda', genre: 'animation' },
      { youtubeId: 'sIZ91tq8Lr0', videoId: 'friends-opening', title: 'Are You Serious Right Now?', movieTitle: 'Friends', genre: 'comedy' },
      { youtubeId: '0YGF5yEoSmg', videoId: 'avengers-is-he-always', title: 'Is He Always Like This?', movieTitle: 'The Avengers', genre: 'action' },
      { youtubeId: 'Q7yhlOOPZTM', videoId: 'friends-rachel-arrives', title: 'Are You Here Alone?', movieTitle: 'Friends', genre: 'comedy' },
    ],
  },

  // ─── LESSON 08: Wh- Questions with To Be ───────────────────
  {
    lessonId: 'lesson-08-wh-questions-to-be',
    clips: [
      { youtubeId: 'dU4lYcN6zEY', videoId: 'rush-hour-what-is-your-name', title: 'What Is Your Name?', movieTitle: 'Rush Hour 3', genre: 'comedy' },
      { youtubeId: 'TaoCCzHXx3I', videoId: 'tangled-who-are-you', title: 'Who Are You?', movieTitle: 'Tangled', genre: 'animation' },
      { youtubeId: 'DzUc3Eqzzos', videoId: 'anger-mgmt-who-are-you', title: 'Who Are You?', movieTitle: 'Anger Management', genre: 'comedy' },
      { youtubeId: 'iRUiM7kVBXA', videoId: 'kfp1-dragon-warrior', title: 'Who Is The Dragon Warrior?', movieTitle: 'Kung Fu Panda', genre: 'animation' },
      { youtubeId: 'I73sP93-0xA', videoId: 'princess-bride-inigo', title: 'Who Are You?', movieTitle: 'The Princess Bride', genre: 'adventure' },
      { youtubeId: 'xuS9UxuUZ3Y', videoId: 'shrek-swamp-question', title: 'What Are You Doing In My Swamp?', movieTitle: 'Shrek', genre: 'animation' },
      { youtubeId: 'H-_Wx7VETxE', videoId: 'frozen-meeting-olaf', title: 'What Is Your Name?', movieTitle: 'Frozen', genre: 'animation' },
      { youtubeId: 'x__NgnMBHV0', videoId: 'insideout-her-name', title: 'What Is Her Name?', movieTitle: 'Inside Out', genre: 'animation' },
      { youtubeId: 'zOXDcGq7Ohg', videoId: 'hells-kitchen-lamb-sauce', title: "Where's The Lamb Sauce?", movieTitle: "Hell's Kitchen", genre: 'reality' },
      { youtubeId: 'Gs7SIiRHQfs', videoId: 'harry-potter-first-meet', title: 'What Is Your Name?', movieTitle: 'Harry Potter', genre: 'fantasy' },
      { youtubeId: 'Q7yhlOOPZTM', videoId: 'friends-rachel-arrives', title: 'Where Are You From?', movieTitle: 'Friends', genre: 'comedy' },
      { youtubeId: 'sIZ91tq8Lr0', videoId: 'friends-opening', title: 'What Is Wrong?', movieTitle: 'Friends', genre: 'comedy' },
      { youtubeId: '7lucm7esMa8', videoId: 'nemo-hello-bruce', title: 'What Is Your Name?', movieTitle: 'Finding Nemo', genre: 'animation' },
      { youtubeId: 'g2IF5NG2vU4', videoId: 'toystory-woody-meets-buzz', title: 'What Are You?', movieTitle: 'Toy Story', genre: 'animation' },
      { youtubeId: 'wNfvA_3sOss', videoId: 'big-bang-theory-apology', title: 'What Is Wrong With You?', movieTitle: 'The Big Bang Theory', genre: 'comedy' },
    ],
  },

  // ─── LESSON 09: Articles a, an, the ────────────────────────
  {
    lessonId: 'lesson-09-articles',
    clips: [
      { youtubeId: 'SqOnkiQRCUU', videoId: 'forrest-box-chocolates', title: 'A Box Of Chocolates', movieTitle: 'Forrest Gump', genre: 'drama' },
      { youtubeId: '3ubS15ro0Uc', videoId: 'hp-you-are-a-wizard', title: 'You Are A Wizard', movieTitle: 'Harry Potter', genre: 'fantasy' },
      { youtubeId: 'I73sP93-0xA', videoId: 'princess-bride-inigo', title: 'The Six-Fingered Man', movieTitle: 'The Princess Bride', genre: 'adventure' },
      { youtubeId: 'EBCs92XtRkI', videoId: 'toystory-buzz-meets-toys', title: 'I Am A Space Ranger', movieTitle: 'Toy Story', genre: 'animation' },
      { youtubeId: 'uxeR95aYer0', videoId: 'wreck-ralph-bad-anon', title: 'The Bad Guy Meeting', movieTitle: 'Wreck-It Ralph', genre: 'animation' },
      { youtubeId: 'NvM3nMbyeM8', videoId: 'ratatouille-soup', title: 'A Rat In The Kitchen', movieTitle: 'Ratatouille', genre: 'animation' },
      { youtubeId: 'iRUiM7kVBXA', videoId: 'kfp1-dragon-warrior', title: 'The Dragon Warrior', movieTitle: 'Kung Fu Panda', genre: 'animation' },
      { youtubeId: 'STqJ_Up4iFg', videoId: 'kfp1-legendary-warrior', title: 'A Legendary Warrior', movieTitle: 'Kung Fu Panda', genre: 'animation' },
      { youtubeId: '99RzToAF55Y', videoId: 'big-hero-6-baymax', title: 'A Personal Healthcare Companion', movieTitle: 'Big Hero 6', genre: 'animation' },
      { youtubeId: 'z4K2F_OALPQ', videoId: 'harry-potter-sorting', title: 'The Sorting Hat', movieTitle: 'Harry Potter', genre: 'fantasy' },
      { youtubeId: 'Dod-OBCuJ9Q', videoId: 'madagascar-zoo', title: 'The Central Park Zoo', movieTitle: 'Madagascar', genre: 'animation' },
      { youtubeId: 'yGE_TWz-ZLw', videoId: 'shrek-donkey-meets', title: 'An Ogre In The Swamp', movieTitle: 'Shrek', genre: 'animation' },
      { youtubeId: 'hKQLKlHf2gI', videoId: 'lionking-remember', title: 'The Circle Of Life', movieTitle: 'The Lion King', genre: 'animation' },
      { youtubeId: 'ihyjXd2C-E8', videoId: 'star-wars-these-droids', title: 'The Droids We Are Looking For', movieTitle: 'Star Wars', genre: 'scifi' },
      { youtubeId: 'H-_Wx7VETxE', videoId: 'frozen-meeting-olaf', title: 'A Snowman Named Olaf', movieTitle: 'Frozen', genre: 'animation' },
    ],
  },

  // ─── LESSON 10: Demonstratives (this, that, these, those) ──
  {
    lessonId: 'lesson-10-demonstratives',
    clips: [
      { youtubeId: '4Prc1UfuokY', videoId: '300-this-is-sparta', title: 'This Is Sparta!', movieTitle: '300', genre: 'action' },
      { youtubeId: 'ihyjXd2C-E8', videoId: 'star-wars-these-droids', title: 'These Are Not The Droids', movieTitle: 'Star Wars', genre: 'scifi' },
      { youtubeId: 'JawCb15MWLc', videoId: 'lionking-light-touches', title: 'That Is The Shadow Land', movieTitle: 'The Lion King', genre: 'animation' },
      { youtubeId: 'hKQLKlHf2gI', videoId: 'lionking-remember', title: 'That Is Your Father', movieTitle: 'The Lion King', genre: 'animation' },
      { youtubeId: 'o6lP7AKRG74', videoId: 'lionking-remember-your', title: 'Remember Who You Are', movieTitle: 'The Lion King', genre: 'animation' },
      { youtubeId: 'D68Jvv3BfCQ', videoId: 'toystory-buzz-fight', title: 'This Is My Spot', movieTitle: 'Toy Story', genre: 'animation' },
      { youtubeId: 'KcK_RuuEwkg', videoId: 'toystory-body-parts', title: 'That Is A Good Look', movieTitle: 'Toy Story', genre: 'animation' },
      { youtubeId: 'xuS9UxuUZ3Y', videoId: 'shrek-swamp-question', title: 'This Is My Swamp', movieTitle: 'Shrek', genre: 'animation' },
      { youtubeId: 'a3bI7kbVBwM', videoId: 'shrek-believer', title: 'That Was Fun', movieTitle: 'Shrek', genre: 'animation' },
      { youtubeId: 'iRUiM7kVBXA', videoId: 'kfp1-dragon-warrior', title: 'This Is The Dragon Warrior?', movieTitle: 'Kung Fu Panda', genre: 'animation' },
      { youtubeId: 'HmdpjkM3onk', videoId: 'gladiator-entertained', title: 'Is That Not Why You Are Here?', movieTitle: 'Gladiator', genre: 'action' },
      { youtubeId: 'SqOnkiQRCUU', videoId: 'forrest-box-chocolates', title: 'That Is All I Have To Say About That', movieTitle: 'Forrest Gump', genre: 'drama' },
      { youtubeId: 'NvM3nMbyeM8', videoId: 'ratatouille-soup', title: 'This Is Very Good', movieTitle: 'Ratatouille', genre: 'animation' },
      { youtubeId: 'wNfvA_3sOss', videoId: 'big-bang-theory-apology', title: "That's My Spot", movieTitle: 'The Big Bang Theory', genre: 'comedy' },
      { youtubeId: '3bReJswiMGM', videoId: 'lotr-you-shall-not-pass', title: 'You Shall Not Pass', movieTitle: 'Lord of the Rings', genre: 'fantasy' },
    ],
  },

  // ─── LESSON 11: Possessive Adjectives ──────────────────────
  {
    lessonId: 'lesson-11-possessive-adjectives',
    clips: [
      { youtubeId: 'GLheiLGZ1k8', videoId: 'star-wars-your-father', title: 'I Am Your Father', movieTitle: 'Star Wars', genre: 'scifi' },
      { youtubeId: 'lKn-Agk-yAI', videoId: 'gladiator-maximus', title: 'My Name Is Maximus', movieTitle: 'Gladiator', genre: 'action' },
      { youtubeId: 'I73sP93-0xA', videoId: 'princess-bride-inigo', title: 'You Killed My Father', movieTitle: 'The Princess Bride', genre: 'adventure' },
      { youtubeId: 'cgmgZmTMxms', videoId: 'coco-family-reunion', title: 'My Family', movieTitle: 'Coco', genre: 'animation' },
      { youtubeId: 'xuS9UxuUZ3Y', videoId: 'shrek-swamp-question', title: 'My Swamp', movieTitle: 'Shrek', genre: 'animation' },
      { youtubeId: 'hKQLKlHf2gI', videoId: 'lionking-remember', title: 'Your Father Is Watching', movieTitle: 'The Lion King', genre: 'animation' },
      { youtubeId: 'o6lP7AKRG74', videoId: 'lionking-remember-your', title: 'Remember Who You Are', movieTitle: 'The Lion King', genre: 'animation' },
      { youtubeId: 'H-_Wx7VETxE', videoId: 'frozen-meeting-olaf', title: 'My Name Is Olaf', movieTitle: 'Frozen', genre: 'animation' },
      { youtubeId: 'd5GDFLt6Z8I', videoId: 'forrest-gump-name', title: 'His Name Is Forrest', movieTitle: 'Forrest Gump', genre: 'drama' },
      { youtubeId: 'MLkaLveElpM', videoId: 'forrest-his-name', title: 'His Name Is Forrest', movieTitle: 'Forrest Gump', genre: 'drama' },
      { youtubeId: '7lucm7esMa8', videoId: 'nemo-hello-bruce', title: 'My Name Is Bruce', movieTitle: 'Finding Nemo', genre: 'animation' },
      { youtubeId: 'EBCs92XtRkI', videoId: 'toystory-buzz-meets-toys', title: 'His Name Is Buzz', movieTitle: 'Toy Story', genre: 'animation' },
      { youtubeId: 'sCgnuhb45ik', videoId: 'paddington-meets-browns', title: 'Our Home', movieTitle: 'Paddington', genre: 'comedy' },
      { youtubeId: 'yGE_TWz-ZLw', videoId: 'shrek-donkey-meets', title: 'My Name Is Donkey', movieTitle: 'Shrek', genre: 'animation' },
      { youtubeId: 'Gs7SIiRHQfs', videoId: 'harry-potter-first-meet', title: 'My Name Is Harry', movieTitle: 'Harry Potter', genre: 'fantasy' },
    ],
  },

  // ─── LESSON 12: Basic Vocabulary (Colors, Family, Body) ────
  {
    lessonId: 'lesson-12-basic-vocabulary',
    clips: [
      { youtubeId: 'KcK_RuuEwkg', videoId: 'toystory-body-parts', title: 'Body Parts Scene', movieTitle: 'Toy Story', genre: 'animation' },
      { youtubeId: 'cgmgZmTMxms', videoId: 'coco-family-reunion', title: 'Family Reunion', movieTitle: 'Coco', genre: 'animation' },
      { youtubeId: '1S0RKRRyqhQ', videoId: 'inside-out-emotions', title: 'Colors Of Emotions', movieTitle: 'Inside Out', genre: 'animation' },
      { youtubeId: 'fvVY1XDKhZk', videoId: 'insideout-emotions-learn', title: 'Learning Emotions', movieTitle: 'Inside Out', genre: 'animation' },
      { youtubeId: 'TSvBrYIPK5s', videoId: 'frozen-olaf-funniest', title: "Olaf's Body Parts", movieTitle: 'Frozen', genre: 'animation' },
      { youtubeId: 'FZnRioNJu6I', videoId: 'frozen-anna-meets-kristoff', title: 'Anna and Her Sister', movieTitle: 'Frozen', genre: 'animation' },
      { youtubeId: 'Dod-OBCuJ9Q', videoId: 'madagascar-zoo', title: 'Animal Friends', movieTitle: 'Madagascar', genre: 'animation' },
      { youtubeId: 'hKQLKlHf2gI', videoId: 'lionking-remember', title: 'Father And Son', movieTitle: 'The Lion King', genre: 'animation' },
      { youtubeId: 'JawCb15MWLc', videoId: 'lionking-light-touches', title: 'Colors Of The Savanna', movieTitle: 'The Lion King', genre: 'animation' },
      { youtubeId: '99RzToAF55Y', videoId: 'big-hero-6-baymax', title: 'Baymax Body Scan', movieTitle: 'Big Hero 6', genre: 'animation' },
      { youtubeId: 'ZZIMJ9aCTUY', videoId: 'elf-buddy', title: 'Buddy And His Dad', movieTitle: 'Elf', genre: 'comedy' },
      { youtubeId: 'd5GDFLt6Z8I', videoId: 'forrest-gump-name', title: 'Named After His Father', movieTitle: 'Forrest Gump', genre: 'drama' },
      { youtubeId: '0-ccV-rm2nw', videoId: 'spongebob-morning', title: "SpongeBob's Morning", movieTitle: 'SpongeBob', genre: 'animation' },
      { youtubeId: 'sCgnuhb45ik', videoId: 'paddington-meets-browns', title: 'The Brown Family', movieTitle: 'Paddington', genre: 'comedy' },
      { youtubeId: 'NvM3nMbyeM8', videoId: 'ratatouille-soup', title: 'Kitchen Vocabulary', movieTitle: 'Ratatouille', genre: 'animation' },
    ],
  },

  // ─── LESSON 13: Simple Commands & Responses ────────────────
  {
    lessonId: 'lesson-13-simple-commands',
    clips: [
      { youtubeId: 'x2-MCPa_3rU', videoId: 'forrest-run', title: 'Run Forrest Run!', movieTitle: 'Forrest Gump', genre: 'drama' },
      { youtubeId: '3bReJswiMGM', videoId: 'lotr-you-shall-not-pass', title: 'You Shall Not Pass!', movieTitle: 'Lord of the Rings', genre: 'fantasy' },
      { youtubeId: 'XTzTkRU6mRY', videoId: 't2-come-with-me', title: 'Come With Me If You Want To Live', movieTitle: 'Terminator 2', genre: 'action' },
      { youtubeId: '7iedZEMeWME', videoId: 'toystory2-go-go-go', title: 'Go Go Go!', movieTitle: 'Toy Story 2', genre: 'animation' },
      { youtubeId: 'zOXDcGq7Ohg', videoId: 'hells-kitchen-lamb-sauce', title: 'Get Out!', movieTitle: "Hell's Kitchen", genre: 'reality' },
      { youtubeId: 'D68Jvv3BfCQ', videoId: 'toystory-buzz-fight', title: 'Stop! Wait!', movieTitle: 'Toy Story', genre: 'animation' },
      { youtubeId: 'yGE_TWz-ZLw', videoId: 'shrek-donkey-meets', title: 'Go Away!', movieTitle: 'Shrek', genre: 'animation' },
      { youtubeId: 'iRUiM7kVBXA', videoId: 'kfp1-dragon-warrior', title: 'Stand Up!', movieTitle: 'Kung Fu Panda', genre: 'animation' },
      { youtubeId: 'STqJ_Up4iFg', videoId: 'kfp1-legendary-warrior', title: 'Come On!', movieTitle: 'Kung Fu Panda', genre: 'animation' },
      { youtubeId: 'KcK_RuuEwkg', videoId: 'toystory-body-parts', title: 'Look At This!', movieTitle: 'Toy Story', genre: 'animation' },
      { youtubeId: '4Prc1UfuokY', videoId: '300-this-is-sparta', title: 'Stand Your Ground!', movieTitle: '300', genre: 'action' },
      { youtubeId: 'NvM3nMbyeM8', videoId: 'ratatouille-soup', title: 'Stop Cooking!', movieTitle: 'Ratatouille', genre: 'animation' },
      { youtubeId: 'a3bI7kbVBwM', videoId: 'shrek-believer', title: 'Open The Door!', movieTitle: 'Shrek', genre: 'animation' },
      { youtubeId: 'CLvXFVbb82Q', videoId: 'friends-joey-how-you-doin', title: 'Come Here!', movieTitle: 'Friends', genre: 'comedy' },
      { youtubeId: 'r8S6bOjFJMY', videoId: 'braveheart-freedom', title: 'Hold! Hold!', movieTitle: 'Braveheart', genre: 'action' },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════
// MAIN PIPELINE
// ═══════════════════════════════════════════════════════════════

function run(): void {
  console.log('═══ A1 Smart Clip Pipeline ═══\n');

  let totalLinked = 0;
  let totalNew = 0;
  let totalReused = 0;
  let totalSkipped = 0;

  for (const lesson of LESSONS) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`  ${lesson.lessonId} (${lesson.clips.length} clips)`);
    console.log(`${'─'.repeat(60)}`);

    for (const entry of lesson.clips) {
      const existingVideoId = videoExistsByYt(entry.youtubeId);

      if (existingVideoId) {
        // Video already in DB
        const existingClipId = getExistingClipId(existingVideoId);
        if (!existingClipId) {
          console.log(`  ⚠ Video ${entry.movieTitle} exists but no clip, skipping`);
          totalSkipped++;
          continue;
        }

        // Check if already linked to this lesson
        const alreadyLinked = stmts.existingLink.get(existingClipId, lesson.lessonId);
        if (alreadyLinked) {
          console.log(`  ↗ ${entry.movieTitle} — ${entry.title} (already linked)`);
          totalLinked++;
          continue;
        }

        // Check if video has subtitles
        const lineCount = (stmts.countLines.get(existingClipId) as any).n;

        if (lineCount > 0 && (entry.start || entry.end)) {
          // Has subtitles and specific time range — create sub-clip with copied subs
          const start = entry.start ?? 0;
          const end = entry.end ?? 9999;
          const result = stmts.insertClip.run(existingVideoId, start, end);
          const newClipId = result.lastInsertRowid as number;
          const copied = copySubtitlesForTimeRange(existingVideoId, newClipId, start, end);
          stmts.linkLesson.run(newClipId, lesson.lessonId);
          console.log(`  + ${entry.movieTitle} — sub-clip #${newClipId} (${copied} lines copied)`);
          totalReused++;
        } else {
          // Just link existing clip to this lesson
          stmts.linkLesson.run(existingClipId, lesson.lessonId);
          console.log(`  ↗ ${entry.movieTitle} — ${entry.title} (linked clip #${existingClipId})`);
          totalLinked++;
        }
      } else {
        // Brand new video — create video + full clip
        try {
          stmts.insertVideo.run(entry.videoId, entry.youtubeId, entry.title, entry.movieTitle, entry.genre);
        } catch {
          // videoId might already exist with different youtubeId
          console.log(`  ⚠ Video ID ${entry.videoId} conflict, skipping`);
          totalSkipped++;
          continue;
        }

        const start = entry.start ?? 0;
        const end = entry.end ?? 9999;
        const result = stmts.insertClip.run(entry.videoId, start, end);
        const newClipId = result.lastInsertRowid as number;
        stmts.linkLesson.run(newClipId, lesson.lessonId);
        console.log(`  ★ ${entry.movieTitle} — ${entry.title} (new video + clip #${newClipId})`);
        totalNew++;
      }
    }
  }

  // ── Summary ────────────────────────────────────────────────

  console.log(`\n\n${'═'.repeat(60)}`);
  console.log('  PIPELINE SUMMARY');
  console.log(`${'═'.repeat(60)}`);
  console.log(`  Linked existing:   ${totalLinked}`);
  console.log(`  Reused subtitles:  ${totalReused}`);
  console.log(`  New (need whisperx): ${totalNew}`);
  console.log(`  Skipped:           ${totalSkipped}`);

  console.log('\n  Clips per lesson:');
  const results = db.prepare(`
    SELECT cs.lesson_id, COUNT(*) as clip_count
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
    console.log(`\n  ⚡ ${needWhisperx.n} videos need WhisperX processing.`);
    console.log('  Run: npx tsx scripts/batch-whisperx.ts');
  }

  db.close();
}

run();
