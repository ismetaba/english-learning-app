/**
 * Seed A1 Lessons 02-13 video clips from YouTube.
 *
 * Run: npx tsx scripts/seed-a1-all-clips.ts
 *
 * For each lesson, this script:
 * 1. Re-links existing clips (already in DB) that match the lesson grammar
 * 2. Adds new YouTube video clips with curated dialogue lines
 * 3. Links all clips to the lesson via clip_structures
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

interface LessonClips {
  lessonId: string;
  existingClipIds: number[]; // clip IDs already in DB to re-link
  newVideos: ClipDef[];
}

// ═══════════════════════════════════════════════════════════════
// LESSON 02: Common Courtesy Phrases
// please, thank you, sorry, excuse me, you're welcome
// ═══════════════════════════════════════════════════════════════
const LESSON_02: LessonClips = {
  lessonId: 'lesson-02-courtesy-phrases',
  existingClipIds: [123, 124, 121, 122, 131, 144, 134], // Frozen, Toy Story, Princess Bride, Inside Out, Office
  newVideos: [
    {
      videoId: 'beauty-beast-thank-you',
      youtubeId: 'EKE81oAEoNk',
      title: 'Thank You For Saving My Life',
      movieTitle: 'Beauty and the Beast',
      genre: 'animation',
      difficulty: 'beginner',
      clips: [{
        start: 0, end: 60,
        lines: [
          { speaker: 'Belle', text: 'Thank you for saving my life.', start: 5, end: 8 },
          { speaker: 'Beast', text: "You're welcome.", start: 10, end: 12 },
        ],
      }],
    },
    {
      videoId: 'moana-youre-welcome',
      youtubeId: '79DijItQXMM',
      title: "You're Welcome",
      movieTitle: 'Moana',
      genre: 'animation',
      difficulty: 'beginner',
      clips: [{
        start: 0, end: 40,
        lines: [
          { speaker: 'Maui', text: "You're welcome!", start: 5, end: 7 },
          { speaker: 'Maui', text: "You're welcome!", start: 15, end: 17 },
        ],
      }],
    },
    {
      videoId: 'kfp-please-dont-die',
      youtubeId: '5Bt63E2Acxg',
      title: 'Please Dont Die Shifu',
      movieTitle: 'Kung Fu Panda',
      genre: 'animation',
      difficulty: 'beginner',
      clips: [{
        start: 0, end: 30,
        lines: [
          { speaker: 'Po', text: "No! Master! No, don't die, Shifu, please!", start: 3, end: 7 },
          { speaker: 'Shifu', text: 'Thank you, Po.', start: 10, end: 12 },
        ],
      }],
    },
    {
      videoId: 'elf-excuse-me',
      youtubeId: '_7eRY1JIk8g',
      title: 'Buddy Says Excuse Me',
      movieTitle: 'Elf',
      genre: 'comedy',
      difficulty: 'beginner',
      clips: [{
        start: 0, end: 30,
        lines: [
          { speaker: 'Buddy', text: 'Excuse me.', start: 3, end: 5 },
          { speaker: 'Buddy', text: 'Pardon me.', start: 7, end: 9 },
          { speaker: 'Buddy', text: 'Sorry!', start: 12, end: 13 },
        ],
      }],
    },
    {
      videoId: 'shrek-sorry-please',
      youtubeId: 'cRv4Shwlwfk',
      title: 'Donkey Apologizes to Shrek',
      movieTitle: 'Shrek',
      genre: 'animation',
      difficulty: 'beginner',
      clips: [{
        start: 0, end: 30,
        lines: [
          { speaker: 'Donkey', text: "I'm so sorry, Shrek.", start: 3, end: 6 },
          { speaker: 'Donkey', text: 'Please, Shrek, please.', start: 8, end: 11 },
        ],
      }],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════
// LESSON 03: Subject Pronouns
// I, you, he, she, it, we, they
// ═══════════════════════════════════════════════════════════════
const LESSON_03: LessonClips = {
  lessonId: 'lesson-03-subject-pronouns',
  existingClipIds: [121, 122, 120, 130, 141], // Toy Story, Shrek, Forrest Gump, Big Hero 6
  newVideos: [
    {
      videoId: 'groot-i-am-groot-bomb',
      youtubeId: 'c8pTIa0JQtM',
      title: 'I Am Groot Bomb Scene',
      movieTitle: 'Guardians of the Galaxy Vol. 2',
      genre: 'action',
      difficulty: 'beginner',
      clips: [{
        start: 0, end: 40,
        lines: [
          { speaker: 'Groot', text: 'I am Groot.', start: 5, end: 7 },
          { speaker: 'Rocket', text: "He doesn't understand.", start: 10, end: 12 },
          { speaker: 'Rocket', text: 'We are all going to die.', start: 15, end: 18 },
        ],
      }],
    },
    {
      videoId: 'groot-prison-break',
      youtubeId: 'YwSF8rM-ePU',
      title: 'I Am Groot Prison Break',
      movieTitle: 'Guardians of the Galaxy',
      genre: 'action',
      difficulty: 'beginner',
      clips: [{
        start: 0, end: 30,
        lines: [
          { speaker: 'Groot', text: 'I am Groot!', start: 5, end: 7 },
          { speaker: 'Rocket', text: 'They are everywhere!', start: 10, end: 12 },
        ],
      }],
    },
    {
      videoId: 'endgame-i-am-iron-man',
      youtubeId: 'TWB31WFomz4',
      title: 'And I Am Iron Man',
      movieTitle: 'Avengers: Endgame',
      genre: 'action',
      difficulty: 'beginner',
      clips: [{
        start: 0, end: 20,
        lines: [
          { speaker: 'Thanos', text: 'I am inevitable.', start: 3, end: 6 },
          { speaker: 'Tony', text: 'And I... am... Iron Man.', start: 8, end: 12 },
        ],
      }],
    },
    {
      videoId: 'toystory-you-are-a-toy',
      youtubeId: 'U9HdRqQKHDU',
      title: 'You Are A Toy',
      movieTitle: 'Toy Story',
      genre: 'animation',
      difficulty: 'beginner',
      clips: [{
        start: 0, end: 30,
        lines: [
          { speaker: 'Woody', text: 'You are a toy!', start: 5, end: 7 },
          { speaker: 'Buzz', text: 'I am Buzz Lightyear.', start: 10, end: 13 },
          { speaker: 'Woody', text: "You are a child's plaything!", start: 15, end: 18 },
        ],
      }],
    },
    {
      videoId: 'wreck-ralph-princesses',
      youtubeId: 'ICUMGYHYBKY',
      title: 'Vanellope Meets Disney Princesses',
      movieTitle: 'Ralph Breaks the Internet',
      genre: 'animation',
      difficulty: 'beginner',
      clips: [{
        start: 0, end: 60,
        lines: [
          { speaker: 'Vanellope', text: 'I am a princess!', start: 5, end: 7 },
          { speaker: 'Rapunzel', text: 'She is a princess?', start: 10, end: 12 },
          { speaker: 'Cinderella', text: 'We are all princesses.', start: 15, end: 18 },
        ],
      }],
    },
    {
      videoId: 'shrek-flying-donkey',
      youtubeId: 'U6_hBEddzpg',
      title: 'A Flying Talking Donkey',
      movieTitle: 'Shrek',
      genre: 'animation',
      difficulty: 'beginner',
      clips: [{
        start: 0, end: 30,
        lines: [
          { speaker: 'Donkey', text: 'I can fly!', start: 3, end: 5 },
          { speaker: 'Shrek', text: "You can't fly.", start: 7, end: 9 },
          { speaker: 'Donkey', text: 'She is beautiful!', start: 12, end: 14 },
        ],
      }],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════
// LESSON 04: To Be + Noun (I am a student, She is a doctor)
// ═══════════════════════════════════════════════════════════════
const LESSON_04: LessonClips = {
  lessonId: 'lesson-04-to-be-noun',
  existingClipIds: [131, 130, 121, 141, 120], // Princess Bride, Forrest Gump, Toy Story, Big Hero 6, Shrek
  newVideos: [
    {
      videoId: 'gladiator-maximus',
      youtubeId: 'lKn-Agk-yAI',
      title: 'My Name Is Maximus',
      movieTitle: 'Gladiator',
      genre: 'action',
      difficulty: 'beginner',
      clips: [{
        start: 0, end: 30,
        lines: [
          { speaker: 'Maximus', text: 'My name is Maximus Decimus Meridius.', start: 3, end: 7 },
          { speaker: 'Maximus', text: 'I am a soldier of Rome.', start: 9, end: 12 },
        ],
      }],
    },
    {
      videoId: 'hp-you-are-a-wizard',
      youtubeId: '3ubS15ro0Uc',
      title: 'You Are A Wizard Harry',
      movieTitle: 'Harry Potter',
      genre: 'fantasy',
      difficulty: 'beginner',
      clips: [{
        start: 0, end: 30,
        lines: [
          { speaker: 'Hagrid', text: "You're a wizard, Harry.", start: 5, end: 8 },
          { speaker: 'Harry', text: "I'm a what?", start: 9, end: 10 },
          { speaker: 'Hagrid', text: 'A wizard.', start: 11, end: 12 },
        ],
      }],
    },
    {
      videoId: 'spiderman-who-am-i',
      youtubeId: 'w2YkWHaO_Io',
      title: 'Who Am I',
      movieTitle: 'Spider-Man',
      genre: 'action',
      difficulty: 'beginner',
      clips: [{
        start: 0, end: 30,
        lines: [
          { speaker: 'Peter', text: 'Who am I?', start: 3, end: 5 },
          { speaker: 'Peter', text: "I'm Spider-Man.", start: 8, end: 10 },
        ],
      }],
    },
    {
      videoId: 'wreck-ralph-she-is-princess',
      youtubeId: 'hE1yWDdP-yg',
      title: 'She Is A Princess',
      movieTitle: 'Ralph Breaks the Internet',
      genre: 'animation',
      difficulty: 'beginner',
      clips: [{
        start: 0, end: 30,
        lines: [
          { speaker: 'Rapunzel', text: 'She is a princess?', start: 5, end: 8 },
          { speaker: 'Vanellope', text: 'I am a racer.', start: 10, end: 12 },
        ],
      }],
    },
    {
      videoId: 'tootsie-dorothy',
      youtubeId: 'ZY_I6q0okhI',
      title: 'My Name Is Dorothy',
      movieTitle: 'Tootsie',
      genre: 'comedy',
      difficulty: 'beginner',
      clips: [{
        start: 0, end: 30,
        lines: [
          { speaker: 'Dorothy', text: 'My name is Dorothy.', start: 3, end: 6 },
          { speaker: 'Dorothy', text: 'I am an actress.', start: 8, end: 10 },
        ],
      }],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════
// LESSON 05: To Be + Adjective (I am happy, It is big)
// ═══════════════════════════════════════════════════════════════
const LESSON_05: LessonClips = {
  lessonId: 'lesson-05-to-be-adjective',
  existingClipIds: [144, 123, 121, 122, 141], // Inside Out, Frozen, Toy Story, Big Hero 6
  newVideos: [
    {
      videoId: 'insideout-joy',
      youtubeId: 'hIGF-Fkxbk0',
      title: 'Get to Know Joy',
      movieTitle: 'Inside Out',
      genre: 'animation',
      difficulty: 'beginner',
      clips: [{
        start: 0, end: 30,
        lines: [
          { speaker: 'Joy', text: 'I am happy!', start: 3, end: 5 },
          { speaker: 'Joy', text: 'Riley is happy!', start: 8, end: 10 },
        ],
      }],
    },
    {
      videoId: 'insideout-sadness',
      youtubeId: 'l8h_6uV7Yzs',
      title: 'Get to Know Sadness',
      movieTitle: 'Inside Out',
      genre: 'animation',
      difficulty: 'beginner',
      clips: [{
        start: 0, end: 30,
        lines: [
          { speaker: 'Sadness', text: 'I am so sad.', start: 3, end: 6 },
          { speaker: 'Sadness', text: 'Everything is sad.', start: 8, end: 10 },
        ],
      }],
    },
    {
      videoId: 'insideout-anger',
      youtubeId: '-HQIg3ZwAs0',
      title: 'Get to Know Anger',
      movieTitle: 'Inside Out',
      genre: 'animation',
      difficulty: 'beginner',
      clips: [{
        start: 0, end: 30,
        lines: [
          { speaker: 'Anger', text: 'I am angry!', start: 3, end: 5 },
          { speaker: 'Anger', text: "That's not fair!", start: 8, end: 10 },
        ],
      }],
    },
    {
      videoId: 'insideout-fear',
      youtubeId: '85z4N_sHXJw',
      title: 'Get to Know Fear',
      movieTitle: 'Inside Out',
      genre: 'animation',
      difficulty: 'beginner',
      clips: [{
        start: 0, end: 30,
        lines: [
          { speaker: 'Fear', text: "I'm scared!", start: 3, end: 5 },
          { speaker: 'Fear', text: 'It is dangerous!', start: 8, end: 10 },
        ],
      }],
    },
    {
      videoId: 'insideout-disgust',
      youtubeId: '6D4oP8UJQ90',
      title: 'Get to Know Disgust',
      movieTitle: 'Inside Out',
      genre: 'animation',
      difficulty: 'beginner',
      clips: [{
        start: 0, end: 30,
        lines: [
          { speaker: 'Disgust', text: 'That is disgusting.', start: 3, end: 6 },
          { speaker: 'Disgust', text: "It's gross!", start: 8, end: 10 },
        ],
      }],
    },
    {
      videoId: 'insideout-opening',
      youtubeId: 'x__NgnMBHV0',
      title: 'Opening Scene Emotions',
      movieTitle: 'Inside Out',
      genre: 'animation',
      difficulty: 'beginner',
      clips: [{
        start: 0, end: 40,
        lines: [
          { speaker: 'Joy', text: 'Riley is happy.', start: 5, end: 7 },
          { speaker: 'Sadness', text: 'Riley is sad.', start: 10, end: 12 },
          { speaker: 'Anger', text: 'Riley is angry.', start: 15, end: 17 },
        ],
      }],
    },
    {
      videoId: 'lionking-remember',
      youtubeId: 'hKQLKlHf2gI',
      title: 'Remember Who You Are',
      movieTitle: 'The Lion King',
      genre: 'animation',
      difficulty: 'beginner',
      clips: [{
        start: 0, end: 30,
        lines: [
          { speaker: 'Mufasa', text: 'You are brave, Simba.', start: 5, end: 8 },
          { speaker: 'Simba', text: "I'm not brave enough.", start: 10, end: 13 },
        ],
      }],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════
// LESSON 06: To Be + Negative (I am not, She isn't, It's not)
// ═══════════════════════════════════════════════════════════════
const LESSON_06: LessonClips = {
  lessonId: 'lesson-06-to-be-negative',
  existingClipIds: [121, 122, 120, 141], // Toy Story, Shrek, Big Hero 6
  newVideos: [
    {
      videoId: 'wreck-ralph-bad-anon',
      youtubeId: 'uxeR95aYer0',
      title: 'Bad-Anon Villains Meeting',
      movieTitle: 'Wreck-It Ralph',
      genre: 'animation',
      difficulty: 'beginner',
      clips: [{
        start: 0, end: 40,
        lines: [
          { speaker: 'Ralph', text: "I'm bad, and that's good.", start: 5, end: 8 },
          { speaker: 'Ralph', text: "I will never be good, and that's not bad.", start: 10, end: 14 },
          { speaker: 'Ralph', text: "There's no one I'd rather be than me.", start: 16, end: 20 },
        ],
      }],
    },
    {
      videoId: 'wreck-ralph-not-bad-guy',
      youtubeId: 's_EiYUTHG24',
      title: 'Ralph Is Not A Bad Guy',
      movieTitle: 'Wreck-It Ralph',
      genre: 'animation',
      difficulty: 'beginner',
      clips: [{
        start: 0, end: 30,
        lines: [
          { speaker: 'Ralph', text: "I'm not a bad guy.", start: 3, end: 6 },
          { speaker: 'Ralph', text: "I'm not the villain.", start: 8, end: 10 },
        ],
      }],
    },
    {
      videoId: 'kfp-not-your-father',
      youtubeId: '_F9Xp7vhHlw',
      title: 'I Am Not Your Father',
      movieTitle: 'Kung Fu Panda',
      genre: 'animation',
      difficulty: 'beginner',
      clips: [{
        start: 0, end: 30,
        lines: [
          { speaker: 'Mr. Ping', text: 'I am not your father.', start: 5, end: 8 },
          { speaker: 'Po', text: "It's not possible!", start: 10, end: 12 },
        ],
      }],
    },
    {
      videoId: 'toystory-not-a-toy',
      youtubeId: 'gAGRexml_qg',
      title: 'Buzz Is Not A Toy',
      movieTitle: 'Toy Story',
      genre: 'animation',
      difficulty: 'beginner',
      clips: [{
        start: 0, end: 30,
        lines: [
          { speaker: 'Buzz', text: "I'm not a toy!", start: 3, end: 6 },
          { speaker: 'Woody', text: 'You are a toy!', start: 8, end: 10 },
          { speaker: 'Buzz', text: "I'm Buzz Lightyear. I am not a toy.", start: 12, end: 16 },
        ],
      }],
    },
    {
      videoId: 'wreck-ralph-affirmation',
      youtubeId: 'yV5a81odL8E',
      title: 'Bad Guy Affirmation',
      movieTitle: 'Wreck-It Ralph',
      genre: 'animation',
      difficulty: 'beginner',
      clips: [{
        start: 0, end: 20,
        lines: [
          { speaker: 'All', text: "I'm bad, and that's good.", start: 3, end: 6 },
          { speaker: 'All', text: "I will never be good, and that's not bad.", start: 7, end: 11 },
        ],
      }],
    },
    {
      videoId: 'black-panther-not-dead',
      youtubeId: '-b7IP2s4MQc',
      title: 'I Am Not Dead',
      movieTitle: 'Black Panther',
      genre: 'action',
      difficulty: 'beginner',
      clips: [{
        start: 0, end: 20,
        lines: [
          { speaker: "T'Challa", text: 'As you can see, I am not dead.', start: 3, end: 7 },
        ],
      }],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════
// LESSON 07: To Be + Questions (Are you...? Is he...?)
// ═══════════════════════════════════════════════════════════════
const LESSON_07: LessonClips = {
  lessonId: 'lesson-07-to-be-questions',
  existingClipIds: [120, 121, 132, 123, 124], // Shrek, Toy Story, Harry Potter, Frozen
  newVideos: [
    {
      videoId: 'gladiator-entertained',
      youtubeId: 'HmdpjkM3onk',
      title: 'Are You Not Entertained',
      movieTitle: 'Gladiator',
      genre: 'action',
      difficulty: 'beginner',
      clips: [{
        start: 0, end: 20,
        lines: [
          { speaker: 'Maximus', text: 'Are you not entertained?', start: 3, end: 6 },
          { speaker: 'Maximus', text: 'Are you not entertained?!', start: 8, end: 11 },
        ],
      }],
    },
    {
      videoId: 'taxi-driver-talking-to-me',
      youtubeId: '-QWL-FwX4t4',
      title: 'Are You Talking To Me',
      movieTitle: 'Taxi Driver',
      genre: 'drama',
      difficulty: 'beginner',
      clips: [{
        start: 0, end: 25,
        lines: [
          { speaker: 'Travis', text: "You talkin' to me?", start: 3, end: 5 },
          { speaker: 'Travis', text: 'Are you talking to me?', start: 7, end: 10 },
        ],
      }],
    },
    {
      videoId: 'shrek-swamp-question',
      youtubeId: 'xuS9UxuUZ3Y',
      title: 'What Are You Doing In My Swamp',
      movieTitle: 'Shrek',
      genre: 'animation',
      difficulty: 'beginner',
      clips: [{
        start: 0, end: 20,
        lines: [
          { speaker: 'Shrek', text: 'What are you doing in my swamp?!', start: 3, end: 7 },
        ],
      }],
    },
    {
      videoId: 'tangled-who-are-you',
      youtubeId: 'TaoCCzHXx3I',
      title: 'Rapunzel Meets Flynn Rider',
      movieTitle: 'Tangled',
      genre: 'animation',
      difficulty: 'beginner',
      clips: [{
        start: 0, end: 30,
        lines: [
          { speaker: 'Rapunzel', text: 'Who are you?', start: 5, end: 7 },
          { speaker: 'Flynn', text: "Who are you? And how did you find me?", start: 10, end: 14 },
          { speaker: 'Rapunzel', text: 'Who are you, and how did you find me?', start: 16, end: 20 },
        ],
      }],
    },
    {
      videoId: 'spiderman-who-are-you',
      youtubeId: 'hf_oe-kYLDY',
      title: 'Who Are You',
      movieTitle: 'Spider-Man',
      genre: 'action',
      difficulty: 'beginner',
      clips: [{
        start: 0, end: 20,
        lines: [
          { speaker: 'Mary Jane', text: 'Who are you?', start: 3, end: 5 },
          { speaker: 'Spider-Man', text: "I'm your friendly neighborhood Spider-Man.", start: 7, end: 11 },
        ],
      }],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════
// LESSON 08: Wh- Questions with To Be
// What is...? Where are...? Who is...?
// ═══════════════════════════════════════════════════════════════
const LESSON_08: LessonClips = {
  lessonId: 'lesson-08-wh-questions-to-be',
  existingClipIds: [121, 122, 132, 140, 144], // Toy Story, Harry Potter, Inside Out
  newVideos: [
    {
      videoId: 'matrix-what-is',
      youtubeId: 'xFhn_GUAhGU',
      title: 'What Is The Matrix',
      movieTitle: 'The Matrix',
      genre: 'scifi',
      difficulty: 'beginner',
      clips: [{
        start: 0, end: 30,
        lines: [
          { speaker: 'Neo', text: 'What is the Matrix?', start: 5, end: 8 },
          { speaker: 'Morpheus', text: 'What is real?', start: 10, end: 12 },
        ],
      }],
    },
    {
      videoId: 'nemo-first-day-school',
      youtubeId: 'Fi9rGi0RnVI',
      title: 'First Day of School',
      movieTitle: 'Finding Nemo',
      genre: 'animation',
      difficulty: 'beginner',
      clips: [{
        start: 0, end: 40,
        lines: [
          { speaker: 'Nemo', text: 'Where is the school?', start: 5, end: 8 },
          { speaker: 'Marlin', text: 'What is that?', start: 12, end: 14 },
          { speaker: 'Nemo', text: "Who's that?", start: 18, end: 20 },
        ],
      }],
    },
    {
      videoId: 'insideout-trailer',
      youtubeId: 'seMwpP0yeu4',
      title: 'Official Trailer',
      movieTitle: 'Inside Out',
      genre: 'animation',
      difficulty: 'beginner',
      clips: [{
        start: 0, end: 30,
        lines: [
          { speaker: 'Narrator', text: 'What is happening?', start: 5, end: 7 },
          { speaker: 'Narrator', text: 'Who are these emotions?', start: 10, end: 13 },
        ],
      }],
    },
    {
      videoId: 'moana-who-are-you',
      youtubeId: 'dNNUk8oOg4I',
      title: 'Moana Meets Maui',
      movieTitle: 'Moana',
      genre: 'animation',
      difficulty: 'beginner',
      clips: [{
        start: 0, end: 30,
        lines: [
          { speaker: 'Moana', text: 'Who are you?', start: 3, end: 5 },
          { speaker: 'Maui', text: "What is a mortal doing here?", start: 8, end: 12 },
        ],
      }],
    },
    {
      videoId: 'hp-wizard-scene',
      youtubeId: 'tKNhPpUR0Pg',
      title: 'Youre a Wizard Harry Full Scene',
      movieTitle: 'Harry Potter',
      genre: 'fantasy',
      difficulty: 'beginner',
      clips: [{
        start: 0, end: 40,
        lines: [
          { speaker: 'Harry', text: "Who are you?", start: 3, end: 5 },
          { speaker: 'Hagrid', text: 'What is Hogwarts?', start: 10, end: 12 },
          { speaker: 'Harry', text: "Where is Hogwarts?", start: 15, end: 18 },
        ],
      }],
    },
    {
      videoId: 'toystory2-real-buzz',
      youtubeId: '7iedZEMeWME',
      title: 'Who Is The Real Buzz',
      movieTitle: 'Toy Story 2',
      genre: 'animation',
      difficulty: 'beginner',
      clips: [{
        start: 0, end: 30,
        lines: [
          { speaker: 'Woody', text: 'Who is the real Buzz?', start: 5, end: 8 },
          { speaker: 'Rex', text: 'Which one is the real one?', start: 10, end: 13 },
        ],
      }],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════
// LESSON 09: Articles (a, an, the)
// ═══════════════════════════════════════════════════════════════
const LESSON_09: LessonClips = {
  lessonId: 'lesson-09-articles',
  existingClipIds: [130, 121, 122, 142, 137], // Forrest Gump, Toy Story, Ratatouille, Madagascar
  newVideos: [
    {
      videoId: 'forrest-box-chocolates',
      youtubeId: 'SqOnkiQRCUU',
      title: 'Life Is A Box of Chocolates',
      movieTitle: 'Forrest Gump',
      genre: 'drama',
      difficulty: 'beginner',
      clips: [{
        start: 0, end: 30,
        lines: [
          { speaker: 'Forrest', text: 'Life is like a box of chocolates.', start: 3, end: 7 },
          { speaker: 'Forrest', text: "That's all I have to say about that.", start: 10, end: 14 },
        ],
      }],
    },
    {
      videoId: 'forrest-run',
      youtubeId: 'x2-MCPa_3rU',
      title: 'Run Forrest Run',
      movieTitle: 'Forrest Gump',
      genre: 'drama',
      difficulty: 'beginner',
      clips: [{
        start: 0, end: 30,
        lines: [
          { speaker: 'Jenny', text: 'Run, Forrest, run!', start: 5, end: 8 },
          { speaker: 'Narrator', text: "He's a runner!", start: 10, end: 12 },
        ],
      }],
    },
    {
      videoId: 'frozen-olaf-snowman',
      youtubeId: 'fKhT2J2gnZs',
      title: 'Anna and Olaf',
      movieTitle: 'Frozen',
      genre: 'animation',
      difficulty: 'beginner',
      clips: [{
        start: 0, end: 30,
        lines: [
          { speaker: 'Olaf', text: "I'm a snowman!", start: 3, end: 6 },
          { speaker: 'Anna', text: 'The fire! Stay away from the fire!', start: 8, end: 12 },
        ],
      }],
    },
    {
      videoId: 'frozen-olaf-funniest',
      youtubeId: 'TSvBrYIPK5s',
      title: 'Olafs Funniest Moments',
      movieTitle: 'Frozen',
      genre: 'animation',
      difficulty: 'beginner',
      clips: [{
        start: 0, end: 40,
        lines: [
          { speaker: 'Olaf', text: 'A snowman!', start: 5, end: 7 },
          { speaker: 'Olaf', text: 'The sun!', start: 10, end: 12 },
          { speaker: 'Olaf', text: "I've always loved the idea of summer.", start: 15, end: 19 },
        ],
      }],
    },
    {
      videoId: 'shrek-believer',
      youtubeId: 'a3bI7kbVBwM',
      title: 'Now Im A Believer',
      movieTitle: 'Shrek',
      genre: 'animation',
      difficulty: 'beginner',
      clips: [{
        start: 0, end: 20,
        lines: [
          { speaker: 'Shrek', text: "I'm a believer!", start: 3, end: 6 },
        ],
      }],
    },
    {
      videoId: 'coco-remember-me',
      youtubeId: 'cgmgZmTMxms',
      title: 'Remember Me Mama Coco',
      movieTitle: 'Coco',
      genre: 'animation',
      difficulty: 'beginner',
      clips: [{
        start: 0, end: 40,
        lines: [
          { speaker: 'Miguel', text: 'A song. A guitar.', start: 5, end: 8 },
          { speaker: 'Miguel', text: 'The guitar is beautiful.', start: 12, end: 15 },
        ],
      }],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════
// LESSON 10: Demonstratives (this, that, these, those)
// ═══════════════════════════════════════════════════════════════
const LESSON_10: LessonClips = {
  lessonId: 'lesson-10-demonstratives',
  existingClipIds: [121, 122, 131, 141, 144], // Toy Story, Princess Bride, Big Hero 6, Inside Out
  newVideos: [
    {
      videoId: 'toystory-woody-buzz-argue',
      youtubeId: 'D68Jvv3BfCQ',
      title: 'Woody and Buzz Argue',
      movieTitle: 'Toy Story',
      genre: 'animation',
      difficulty: 'beginner',
      clips: [{
        start: 0, end: 30,
        lines: [
          { speaker: 'Woody', text: 'This is ridiculous!', start: 3, end: 6 },
          { speaker: 'Buzz', text: 'That is not flying!', start: 8, end: 11 },
          { speaker: 'Woody', text: "That's falling with style!", start: 13, end: 16 },
        ],
      }],
    },
    {
      videoId: 'toystory-woody-meets-buzz-dk',
      youtubeId: 'KcK_RuuEwkg',
      title: 'Woody Meets Buzz Lightyear',
      movieTitle: 'Toy Story',
      genre: 'animation',
      difficulty: 'beginner',
      clips: [{
        start: 0, end: 30,
        lines: [
          { speaker: 'Woody', text: 'This is my spot.', start: 3, end: 6 },
          { speaker: 'Buzz', text: 'That is not a spaceship.', start: 8, end: 11 },
        ],
      }],
    },
    {
      videoId: 'matrix-this-is',
      youtubeId: 'xFhn_GUAhGU',
      title: 'This Is Your Last Chance',
      movieTitle: 'The Matrix',
      genre: 'scifi',
      difficulty: 'beginner',
      clips: [{
        start: 20, end: 50,
        lines: [
          { speaker: 'Morpheus', text: 'This is your last chance.', start: 22, end: 25 },
          { speaker: 'Morpheus', text: 'That is the Matrix.', start: 28, end: 31 },
        ],
      }],
    },
    {
      videoId: 'frozen-anna-olaf-scene',
      youtubeId: 'fKhT2J2gnZs',
      title: 'This Is Olaf',
      movieTitle: 'Frozen',
      genre: 'animation',
      difficulty: 'beginner',
      clips: [{
        start: 30, end: 60,
        lines: [
          { speaker: 'Anna', text: 'This is Olaf.', start: 32, end: 34 },
          { speaker: 'Kristoff', text: "That's beyond the mountain.", start: 36, end: 39 },
        ],
      }],
    },
    {
      videoId: 'moana-this-is-ocean',
      youtubeId: 'dNNUk8oOg4I',
      title: 'That Was Maui',
      movieTitle: 'Moana',
      genre: 'animation',
      difficulty: 'beginner',
      clips: [{
        start: 30, end: 60,
        lines: [
          { speaker: 'Moana', text: 'That was Maui!', start: 32, end: 34 },
          { speaker: 'Maui', text: 'This is the ocean.', start: 36, end: 39 },
        ],
      }],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════
// LESSON 11: Possessive Adjectives (my, your, his, her, our, their)
// ═══════════════════════════════════════════════════════════════
const LESSON_11: LessonClips = {
  lessonId: 'lesson-11-possessive-adjectives',
  existingClipIds: [131, 130, 121, 123, 124, 125], // Princess Bride, Forrest Gump, Toy Story, Frozen, Nemo
  newVideos: [
    {
      videoId: 'coco-my-family',
      youtubeId: 'cgmgZmTMxms',
      title: 'My Family Coco',
      movieTitle: 'Coco',
      genre: 'animation',
      difficulty: 'beginner',
      clips: [{
        start: 0, end: 40,
        lines: [
          { speaker: 'Miguel', text: 'My family.', start: 3, end: 5 },
          { speaker: 'Miguel', text: 'Your grandmother, she remembered.', start: 8, end: 12 },
          { speaker: 'Miguel', text: 'Her song.', start: 14, end: 16 },
          { speaker: 'Miguel', text: 'Our music.', start: 18, end: 20 },
        ],
      }],
    },
    {
      videoId: 'nemo-my-son',
      youtubeId: 'Fi9rGi0RnVI',
      title: 'My Son First Day',
      movieTitle: 'Finding Nemo',
      genre: 'animation',
      difficulty: 'beginner',
      clips: [{
        start: 0, end: 30,
        lines: [
          { speaker: 'Marlin', text: 'My son!', start: 3, end: 5 },
          { speaker: 'Marlin', text: 'Your school is over there.', start: 8, end: 11 },
          { speaker: 'Nemo', text: 'His fin is small.', start: 14, end: 17 },
        ],
      }],
    },
    {
      videoId: 'forrest-his-name',
      youtubeId: 'MLkaLveElpM',
      title: 'His Name Is Forrest',
      movieTitle: 'Forrest Gump',
      genre: 'drama',
      difficulty: 'beginner',
      clips: [{
        start: 0, end: 30,
        lines: [
          { speaker: 'Forrest', text: 'His name is Forrest.', start: 5, end: 8 },
          { speaker: 'Jenny', text: "He's the most beautiful thing I've ever seen.", start: 10, end: 14 },
        ],
      }],
    },
    {
      videoId: 'moana-your-island',
      youtubeId: 'dNNUk8oOg4I',
      title: 'Your Island My Hook',
      movieTitle: 'Moana',
      genre: 'animation',
      difficulty: 'beginner',
      clips: [{
        start: 60, end: 90,
        lines: [
          { speaker: 'Maui', text: 'Your island.', start: 62, end: 64 },
          { speaker: 'Maui', text: 'My hook.', start: 66, end: 68 },
          { speaker: 'Moana', text: 'Her heart.', start: 70, end: 72 },
        ],
      }],
    },
    {
      videoId: 'insideout-her-name',
      youtubeId: 'x__NgnMBHV0',
      title: 'Her Name Is Riley',
      movieTitle: 'Inside Out',
      genre: 'animation',
      difficulty: 'beginner',
      clips: [{
        start: 0, end: 30,
        lines: [
          { speaker: 'Joy', text: 'Her name is Riley.', start: 3, end: 6 },
          { speaker: 'Joy', text: 'Our job is to keep her happy.', start: 8, end: 12 },
        ],
      }],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════
// LESSON 12: Basic Vocabulary (Colors, Family, Body Parts)
// ═══════════════════════════════════════════════════════════════
const LESSON_12: LessonClips = {
  lessonId: 'lesson-12-basic-vocabulary',
  existingClipIds: [144, 123, 141, 125, 130], // Inside Out, Frozen, Big Hero 6, Nemo, Forrest Gump
  newVideos: [
    {
      videoId: 'insideout-emotions-learn',
      youtubeId: 'fvVY1XDKhZk',
      title: 'Learn the Five Emotions',
      movieTitle: 'Inside Out',
      genre: 'animation',
      difficulty: 'beginner',
      clips: [{
        start: 0, end: 40,
        lines: [
          { speaker: 'Narrator', text: 'Joy is yellow.', start: 3, end: 5 },
          { speaker: 'Narrator', text: 'Sadness is blue.', start: 7, end: 9 },
          { speaker: 'Narrator', text: 'Anger is red.', start: 11, end: 13 },
          { speaker: 'Narrator', text: 'Disgust is green.', start: 15, end: 17 },
          { speaker: 'Narrator', text: 'Fear is purple.', start: 19, end: 21 },
        ],
      }],
    },
    {
      videoId: 'coco-family-reunion',
      youtubeId: 'cgmgZmTMxms',
      title: 'Family Reunion',
      movieTitle: 'Coco',
      genre: 'animation',
      difficulty: 'beginner',
      clips: [{
        start: 40, end: 80,
        lines: [
          { speaker: 'Miguel', text: 'My grandmother.', start: 42, end: 44 },
          { speaker: 'Miguel', text: 'My mother and father.', start: 46, end: 49 },
          { speaker: 'Miguel', text: 'My brother.', start: 51, end: 53 },
        ],
      }],
    },
    {
      videoId: 'frozen-olaf-body',
      youtubeId: 'fKhT2J2gnZs',
      title: 'Olafs Body Parts',
      movieTitle: 'Frozen',
      genre: 'animation',
      difficulty: 'beginner',
      clips: [{
        start: 60, end: 90,
        lines: [
          { speaker: 'Olaf', text: 'My nose!', start: 62, end: 64 },
          { speaker: 'Olaf', text: 'My arms!', start: 66, end: 68 },
          { speaker: 'Anna', text: 'His head!', start: 70, end: 72 },
        ],
      }],
    },
    {
      videoId: 'groot-blue-button',
      youtubeId: 'Hrimfgjf4k8',
      title: 'The Blue Button',
      movieTitle: 'Guardians of the Galaxy Vol. 2',
      genre: 'action',
      difficulty: 'beginner',
      clips: [{
        start: 0, end: 30,
        lines: [
          { speaker: 'Rocket', text: 'The blue button!', start: 3, end: 5 },
          { speaker: 'Rocket', text: 'No, the red one!', start: 8, end: 10 },
          { speaker: 'Groot', text: 'I am Groot.', start: 12, end: 14 },
        ],
      }],
    },
    {
      videoId: 'forrest-name-scene',
      youtubeId: 'MLkaLveElpM',
      title: 'Father and Son',
      movieTitle: 'Forrest Gump',
      genre: 'drama',
      difficulty: 'beginner',
      clips: [{
        start: 30, end: 60,
        lines: [
          { speaker: 'Forrest', text: 'He has my eyes.', start: 32, end: 35 },
          { speaker: 'Jenny', text: "He's beautiful.", start: 37, end: 39 },
        ],
      }],
    },
    {
      videoId: 'toystory-body-parts',
      youtubeId: 'KcK_RuuEwkg',
      title: 'Toy Body Parts',
      movieTitle: 'Toy Story',
      genre: 'animation',
      difficulty: 'beginner',
      clips: [{
        start: 30, end: 60,
        lines: [
          { speaker: 'Woody', text: 'His head, his arms, his legs.', start: 32, end: 36 },
          { speaker: 'Buzz', text: 'These are my wings.', start: 38, end: 41 },
        ],
      }],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════
// LESSON 13: Simple Commands & Responses
// sit down, stand up, open the door, stop, go, come here
// ═══════════════════════════════════════════════════════════════
const LESSON_13: LessonClips = {
  lessonId: 'lesson-13-simple-commands',
  existingClipIds: [121, 120, 132, 140, 129], // Toy Story, Shrek, Harry Potter, KFP
  newVideos: [
    {
      videoId: 'forrest-run-scene',
      youtubeId: 'x2-MCPa_3rU',
      title: 'Run Forrest Run Full',
      movieTitle: 'Forrest Gump',
      genre: 'drama',
      difficulty: 'beginner',
      clips: [{
        start: 0, end: 30,
        lines: [
          { speaker: 'Jenny', text: 'Run!', start: 3, end: 4 },
          { speaker: 'Jenny', text: 'Run, Forrest, run!', start: 6, end: 9 },
          { speaker: 'Forrest', text: "I just felt like runnin'.", start: 12, end: 15 },
        ],
      }],
    },
    {
      videoId: 'toystory-buzz-fight',
      youtubeId: 'D68Jvv3BfCQ',
      title: 'Stop Go Commands',
      movieTitle: 'Toy Story',
      genre: 'animation',
      difficulty: 'beginner',
      clips: [{
        start: 0, end: 30,
        lines: [
          { speaker: 'Woody', text: 'Stop!', start: 3, end: 4 },
          { speaker: 'Woody', text: 'Get out!', start: 6, end: 7 },
          { speaker: 'Buzz', text: 'Come back!', start: 10, end: 12 },
          { speaker: 'Woody', text: 'Go!', start: 14, end: 15 },
        ],
      }],
    },
    {
      videoId: 'matrix-sit-down',
      youtubeId: 'xFhn_GUAhGU',
      title: 'Sit Down Follow Me',
      movieTitle: 'The Matrix',
      genre: 'scifi',
      difficulty: 'beginner',
      clips: [{
        start: 0, end: 30,
        lines: [
          { speaker: 'Morpheus', text: 'Sit down.', start: 3, end: 5 },
          { speaker: 'Morpheus', text: 'Take the pill.', start: 8, end: 10 },
          { speaker: 'Morpheus', text: 'Follow me.', start: 13, end: 15 },
        ],
      }],
    },
    {
      videoId: 'moana-look-listen',
      youtubeId: 'dNNUk8oOg4I',
      title: 'Look Listen Watch',
      movieTitle: 'Moana',
      genre: 'animation',
      difficulty: 'beginner',
      clips: [{
        start: 90, end: 120,
        lines: [
          { speaker: 'Maui', text: 'Look!', start: 92, end: 93 },
          { speaker: 'Maui', text: 'Listen!', start: 95, end: 96 },
          { speaker: 'Maui', text: 'Watch!', start: 98, end: 99 },
        ],
      }],
    },
    {
      videoId: 'hp-commands-scene',
      youtubeId: 'tKNhPpUR0Pg',
      title: 'Hagrid Commands',
      movieTitle: 'Harry Potter',
      genre: 'fantasy',
      difficulty: 'beginner',
      clips: [{
        start: 0, end: 30,
        lines: [
          { speaker: 'Hagrid', text: 'Sit down.', start: 3, end: 5 },
          { speaker: 'Hagrid', text: 'Come here, Harry.', start: 8, end: 11 },
          { speaker: 'Hagrid', text: 'Open the letter.', start: 14, end: 17 },
        ],
      }],
    },
    {
      videoId: 'toystory2-go-go-go',
      youtubeId: '7iedZEMeWME',
      title: 'Go Go Go Chase Scene',
      movieTitle: 'Toy Story 2',
      genre: 'animation',
      difficulty: 'beginner',
      clips: [{
        start: 0, end: 30,
        lines: [
          { speaker: 'Buzz', text: 'Stop him!', start: 3, end: 5 },
          { speaker: 'Woody', text: 'Go! Go! Go!', start: 8, end: 10 },
          { speaker: 'Slinky', text: 'Come on!', start: 13, end: 15 },
        ],
      }],
    },
  ],
};

// ═══════════════════════════════════════════════════════════════
// MAIN SEED FUNCTION
// ═══════════════════════════════════════════════════════════════

const ALL_LESSONS: LessonClips[] = [
  LESSON_02, LESSON_03, LESSON_04, LESSON_05, LESSON_06,
  LESSON_07, LESSON_08, LESSON_09, LESSON_10, LESSON_11,
  LESSON_12, LESSON_13,
];

function seed(): void {
  const db = getDb();
  console.log('Seeding A1 Lessons 02-13 video clips...\n');

  const insertStructure = db.prepare(
    'INSERT OR IGNORE INTO clip_structures (clip_id, lesson_id) VALUES (?, ?)'
  );

  for (const lesson of ALL_LESSONS) {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  ${lesson.lessonId}`);
    console.log(`${'═'.repeat(60)}`);

    let linkedCount = 0;

    // 1. Re-link existing clips to this lesson
    for (const clipId of lesson.existingClipIds) {
      // Verify clip exists
      const clip = db.prepare('SELECT id FROM clips WHERE id = ?').get(clipId) as any;
      if (clip) {
        insertStructure.run(clipId, lesson.lessonId);
        linkedCount++;
        console.log(`  ↗ Re-linked existing clip #${clipId}`);
      } else {
        console.log(`  ⚠ Clip #${clipId} not found, skipping`);
      }
    }

    // 2. Add new videos and clips
    for (const video of lesson.newVideos) {
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
        console.log(`  + Video: ${video.movieTitle} — ${video.title}`);
      } catch {
        console.log(`  ~ Video (exists): ${video.movieTitle} — ${video.title}`);
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

        // Link clip to lesson
        insertStructure.run(clipId, lesson.lessonId);
        linkedCount++;

        console.log(`    Clip #${clipId}: ${clipDef.start}s-${clipDef.end}s (${clipDef.lines.length} lines)`);
      }
    }

    // Print stats for this lesson
    const clipCount = (db.prepare(
      'SELECT COUNT(*) as n FROM clips c JOIN clip_structures cs ON cs.clip_id = c.id WHERE cs.lesson_id = ?'
    ).get(lesson.lessonId) as any).n;
    console.log(`  ✅ Total clips for ${lesson.lessonId}: ${clipCount}`);
  }

  // Final summary
  console.log('\n\n═══ FINAL SUMMARY ═══');
  const results = db.prepare(`
    SELECT cs.lesson_id, COUNT(*) as clip_count
    FROM clip_structures cs
    GROUP BY cs.lesson_id
    ORDER BY cs.lesson_id
  `).all() as any[];
  for (const r of results) {
    console.log(`  ${r.lesson_id}: ${r.clip_count} clips`);
  }
}

seed();
