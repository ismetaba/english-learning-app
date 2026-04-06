/**
 * Wave 5b: 82 more clips WITHOUT subtitles (famous movie scenes).
 * Run:  cd admin && npx tsx scripts/seed-a1-wave5b-no-subs.ts
 */
import Database from 'better-sqlite3';
import path from 'path';

const db = new Database(path.join(__dirname, '..', 'data.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

interface E { youtubeId: string; videoId: string; title: string; movieTitle: string; genre: string; }
interface L { lessonId: string; clips: E[]; }

const s = {
  fv: db.prepare('SELECT id FROM videos WHERE youtube_video_id = ?'),
  fc: db.prepare('SELECT id FROM clips WHERE video_id = ? LIMIT 1'),
  iv: db.prepare("INSERT INTO videos (id, youtube_video_id, title, movie_title, genre, difficulty) VALUES (?, ?, ?, ?, ?, 'beginner')"),
  ic: db.prepare("INSERT INTO clips (video_id, start_time, end_time, status) VALUES (?, 0, 9999, 'approved')"),
  ll: db.prepare('INSERT OR IGNORE INTO clip_structures (clip_id, lesson_id) VALUES (?, ?)'),
  el: db.prepare('SELECT 1 FROM clip_structures WHERE clip_id = ? AND lesson_id = ?'),
};

const LESSONS: L[] = [
  // ─── lesson-01-greetings ───
  {
    lessonId: 'lesson-01-greetings',
    clips: [
      { youtubeId: '7T_968mJMqc', videoId: 'home-alone-kevin-scream', title: 'Kevin Screams', movieTitle: 'Home Alone', genre: 'comedy' },
    ],
  },
  // ─── lesson-02-courtesy-phrases ───
  {
    lessonId: 'lesson-02-courtesy-phrases',
    clips: [
      { youtubeId: 'niul8Hy-3wk', videoId: 'princess-bride-as-wish', title: 'As You Wish', movieTitle: 'The Princess Bride', genre: 'adventure' },
      { youtubeId: 'kHL5iQJLvNU', videoId: 'napoleon-vote-pedro', title: 'Vote For Pedro', movieTitle: 'Napoleon Dynamite', genre: 'comedy' },
    ],
  },
  // ─── lesson-03-subject-pronouns ───
  {
    lessonId: 'lesson-03-subject-pronouns',
    clips: [
      { youtubeId: 'ABpeLNCuE3w', videoId: 'shawshank-escape', title: 'Andy Escapes', movieTitle: 'The Shawshank Redemption', genre: 'drama' },
      { youtubeId: '-u5SiCCmVv0', videoId: 'avatar-i-see-you', title: 'I See You', movieTitle: 'Avatar', genre: 'scifi' },
      { youtubeId: 'BPaTaEN2wxY', videoId: 'monsters-inc-boo-kitty', title: 'Boo Kitty Goodbye', movieTitle: 'Monsters Inc', genre: 'animation' },
    ],
  },
  // ─── lesson-04-to-be-noun ───
  {
    lessonId: 'lesson-04-to-be-noun',
    clips: [
      { youtubeId: '2HTHPtoNJLk', videoId: 'superbad-mclovin', title: 'McLovin', movieTitle: 'Superbad', genre: 'comedy' },
      { youtubeId: 'z5SluxprhnA', videoId: 'princess-diaries-genovia', title: 'Princess of Genovia', movieTitle: 'The Princess Diaries', genre: 'comedy' },
      { youtubeId: 'LMycxm3fDyE', videoId: 'legally-blonde-elle', title: 'Elle Woods at Harvard', movieTitle: 'Legally Blonde', genre: 'comedy' },
      { youtubeId: 'G4Ym9zokSZo', videoId: 'braveheart-freedom', title: 'Freedom Speech', movieTitle: 'Braveheart', genre: 'action' },
      { youtubeId: 'xBIWvRCSjWM', videoId: 'cars-i-am-speed', title: 'I Am Speed', movieTitle: 'Cars', genre: 'animation' },
    ],
  },
  // ─── lesson-05-to-be-adjective ───
  {
    lessonId: 'lesson-05-to-be-adjective',
    clips: [
      { youtubeId: 'NB1qppAPxk4', videoId: 'despicable-me-fluffy', title: "It's So Fluffy!", movieTitle: 'Despicable Me', genre: 'animation' },
      { youtubeId: '6I1qP8w8DxE', videoId: 'hangover-cant-happening', title: "This Can't Be Happening", movieTitle: 'The Hangover', genre: 'comedy' },
      { youtubeId: 'S4AmLcBLZWY', videoId: 'dumb-dumber-annoying', title: 'Most Annoying Sound', movieTitle: 'Dumb and Dumber', genre: 'comedy' },
      { youtubeId: '0o4heKCLeTs', videoId: 'gone-girl-cool-girl', title: 'Cool Girl', movieTitle: 'Gone Girl', genre: 'thriller' },
    ],
  },
  // ─── lesson-06-to-be-negative ───
  {
    lessonId: 'lesson-06-to-be-negative',
    clips: [
      { youtubeId: 'dC1yHLp9bWA', videoId: 'fight-club-first-rule', title: 'First Rule of Fight Club', movieTitle: 'Fight Club', genre: 'thriller' },
      { youtubeId: 'uMRGjc-hUN8', videoId: 'million-dollar-baby-fight', title: 'Final Fight', movieTitle: 'Million Dollar Baby', genre: 'drama' },
    ],
  },
  // ─── lesson-07-to-be-questions ───
  {
    lessonId: 'lesson-07-to-be-questions',
    clips: [
      { youtubeId: 'LstIgtkEe50', videoId: 'batman-begins-fall', title: 'Why Do We Fall?', movieTitle: 'Batman Begins', genre: 'action' },
      { youtubeId: 'qyngj0M-LQk', videoId: 'catch-me-concur', title: 'Do You Concur?', movieTitle: 'Catch Me If You Can', genre: 'drama' },
      { youtubeId: 'ohegyFcDVlA', videoId: 'ghost-pottery', title: 'Pottery Scene', movieTitle: 'Ghost', genre: 'drama' },
    ],
  },
  // ─── lesson-08-wh-questions-to-be ───
  {
    lessonId: 'lesson-08-wh-questions-to-be',
    clips: [
      { youtubeId: 'IpwSXWq1wwU', videoId: 'jerry-maguire-show-money', title: 'Show Me the Money', movieTitle: 'Jerry Maguire', genre: 'drama' },
      { youtubeId: 'EJR1H5tf5wE', videoId: 'austin-powers-million', title: 'One Million Dollars', movieTitle: 'Austin Powers', genre: 'comedy' },
    ],
  },
  // ─── lesson-09-articles ───
  {
    lessonId: 'lesson-09-articles',
    clips: [
      { youtubeId: 'E8WaFvwtphY', videoId: 'jurassic-park-welcome', title: 'Welcome to Jurassic Park', movieTitle: 'Jurassic Park', genre: 'scifi' },
      { youtubeId: '2I91DJZKRxs', videoId: 'jaws-bigger-boat', title: "You're Gonna Need a Bigger Boat", movieTitle: 'Jaws', genre: 'thriller' },
      { youtubeId: '6xZif3WmG7I', videoId: 'et-phone-home', title: 'E.T. Phone Home', movieTitle: 'E.T.', genre: 'scifi' },
      { youtubeId: 'CH7UQQgJDzw', videoId: 'ghostbusters-slimed', title: 'He Slimed Me!', movieTitle: 'Ghostbusters', genre: 'comedy' },
      { youtubeId: 'EXTLJmYsaUQ', videoId: 'aladdin-new-world', title: 'A Whole New World', movieTitle: 'Aladdin', genre: 'animation' },
      { youtubeId: 'SXKlJuO07eM', videoId: 'little-mermaid-part-world', title: 'Part of Your World', movieTitle: 'The Little Mermaid', genre: 'animation' },
      { youtubeId: '7iZsOIKYd_w', videoId: 'beauty-beast-be-guest', title: 'Be Our Guest', movieTitle: 'Beauty and the Beast', genre: 'animation' },
      { youtubeId: '6BH-Rxd-NBo', videoId: 'jungle-book-necessities', title: 'Bare Necessities', movieTitle: 'The Jungle Book', genre: 'animation' },
      { youtubeId: '2Yq9Ebipbb8', videoId: 'mary-poppins-supercali', title: 'Supercalifragilisticexpialidocious', movieTitle: 'Mary Poppins', genre: 'musical' },
    ],
  },
  // ─── lesson-10-demonstratives ───
  {
    lessonId: 'lesson-10-demonstratives',
    clips: [
      { youtubeId: '4Prc1UfuokY', videoId: '300-this-is-sparta', title: 'This Is Sparta!', movieTitle: '300', genre: 'action' },
      { youtubeId: 'pQd1-4tqymo', videoId: 'inception-spinning-top', title: 'Spinning Top Ending', movieTitle: 'Inception', genre: 'scifi' },
      { youtubeId: 'X-KDt-G1pJ0', videoId: 'inception-hallway-fight', title: 'Hallway Fight', movieTitle: 'Inception', genre: 'scifi' },
      { youtubeId: 'thyJOnasHVE', videoId: 'waynes-world-bohemian', title: 'Bohemian Rhapsody', movieTitle: "Wayne's World", genre: 'comedy' },
    ],
  },
  // ─── lesson-11-possessive-adjectives ───
  {
    lessonId: 'lesson-11-possessive-adjectives',
    clips: [
      { youtubeId: 'mI0YlmqQqTg', videoId: 'sound-music-favorites', title: 'My Favorite Things', movieTitle: 'Sound of Music', genre: 'musical' },
      { youtubeId: '8GY3sO47YYo', videoId: 'gwh-park-bench', title: 'Park Bench Scene', movieTitle: 'Good Will Hunting', genre: 'drama' },
      { youtubeId: 'cgmgZmTMxms', videoId: 'coco-remember-me-final', title: 'Remember Me Final', movieTitle: 'Coco', genre: 'animation' },
    ],
  },
  // ─── lesson-12-basic-vocabulary ───
  {
    lessonId: 'lesson-12-basic-vocabulary',
    clips: [
      { youtubeId: 'ApuFuuCJc3s', videoId: 'madagascar-move-it', title: 'I Like to Move It', movieTitle: 'Madagascar', genre: 'animation' },
      { youtubeId: 'ZDyEERuK31Y', videoId: 'httyd-first-flight', title: 'First Flight', movieTitle: 'How to Train Your Dragon', genre: 'animation' },
      { youtubeId: '4ld9EP5yAX4', videoId: 'ratatouille-ego-review', title: 'Anton Ego Review', movieTitle: 'Ratatouille', genre: 'animation' },
      { youtubeId: 'XO77YuyMOek', videoId: 'up-married-life', title: 'Married Life Montage', movieTitle: 'Up', genre: 'animation' },
      { youtubeId: '_oxso1pWCHY', videoId: 'brave-merida-archery', title: 'Merida Archery', movieTitle: 'Brave', genre: 'animation' },
      { youtubeId: 'cPAbx5kgCJo', videoId: 'moana-how-far', title: "How Far I'll Go", movieTitle: 'Moana', genre: 'animation' },
      { youtubeId: 'ifJaW22bTXs', videoId: 'soul-spark', title: 'Your Spark Scene', movieTitle: 'Soul', genre: 'animation' },
      { youtubeId: 'aNokBlr7pLI', videoId: 'luca-sea-monster', title: 'Sea Monster Reveal', movieTitle: 'Luca', genre: 'animation' },
      { youtubeId: 'Ed_Gy26w_Tc', videoId: 'turning-red-panda', title: 'Panda Transformation', movieTitle: 'Turning Red', genre: 'animation' },
      { youtubeId: 'bvWRMAU6V-c', videoId: 'encanto-bruno', title: "We Don't Talk About Bruno", movieTitle: 'Encanto', genre: 'animation' },
      { youtubeId: 'wZFww62w4Wc', videoId: 'inside-out-2-anxiety', title: 'Anxiety Attack', movieTitle: 'Inside Out 2', genre: 'animation' },
      { youtubeId: '9cQgQIMlwWw', videoId: 'lego-movie-awesome', title: 'Everything Is Awesome', movieTitle: 'The Lego Movie', genre: 'animation' },
      { youtubeId: 'd3psto4Y0o4', videoId: 'minions-banana', title: 'Banana', movieTitle: 'Minions', genre: 'animation' },
      { youtubeId: '7TfJpwOWCdQ', videoId: 'monsters-u-scare-games', title: 'Scare Games Final', movieTitle: 'Monsters University', genre: 'animation' },
      { youtubeId: 'Hg2DBQNvLBQ', videoId: 'toy-story-3-incinerator', title: 'Incinerator Scene', movieTitle: 'Toy Story 3', genre: 'animation' },
      { youtubeId: 'DB19xgNSZ30', videoId: 'toy-story-4-forky', title: 'Forky Introduction', movieTitle: 'Toy Story 4', genre: 'animation' },
      { youtubeId: 'KAmIHa-Rztg', videoId: 'ice-age-scrat-acorn', title: 'Scrat Acorn', movieTitle: 'Ice Age', genre: 'animation' },
      { youtubeId: '4aUC1VZQE1E', videoId: 'zootopia-sloth', title: 'Sloth Laughing', movieTitle: 'Zootopia', genre: 'animation' },
      { youtubeId: 'c8a3K0HIKdA', videoId: 'tangled-see-light', title: 'I See the Light', movieTitle: 'Tangled', genre: 'animation' },
      { youtubeId: 'I-3K-uU9TL0', videoId: 'tangled-frying-pan', title: 'Frying Pan', movieTitle: 'Tangled', genre: 'animation' },
      { youtubeId: 'yV5a81odL8E', videoId: 'wreck-ralph-im-bad', title: "I'm Bad", movieTitle: 'Wreck It Ralph', genre: 'animation' },
      { youtubeId: 'YDGNmqa8hO8', videoId: 'ralph-breaks-princesses', title: 'Princesses Scene', movieTitle: 'Ralph Breaks Internet', genre: 'animation' },
      { youtubeId: 'zya40MmN9I4', videoId: 'finding-dory-swimming', title: 'Just Keep Swimming', movieTitle: 'Finding Dory', genre: 'animation' },
    ],
  },
  // ─── lesson-13-simple-commands ───
  {
    lessonId: 'lesson-13-simple-commands',
    clips: [
      { youtubeId: 'woXYTMLQuCQ', videoId: 'dark-knight-bank-rob', title: 'Opening Bank Robbery', movieTitle: 'The Dark Knight', genre: 'action' },
      { youtubeId: '8DajVKAkL50', videoId: 'matrix-dodge-this', title: 'Dodge This', movieTitle: 'The Matrix', genre: 'scifi' },
      { youtubeId: '-P11Bcpyw4g', videoId: 'karate-kid-wax-on', title: 'Wax On Wax Off', movieTitle: 'Karate Kid', genre: 'drama' },
      { youtubeId: '6jvGK8Z29f4', videoId: 'groundhog-day-clock', title: 'Smash Clock', movieTitle: 'Groundhog Day', genre: 'comedy' },
      { youtubeId: 'TmCXNMGkFho', videoId: 'dead-poets-standing', title: 'Standing on Desks', movieTitle: 'Dead Poets Society', genre: 'drama' },
    ],
  },
  // ─── Cross-links ───
  {
    lessonId: 'lesson-05-to-be-adjective',
    clips: [
      { youtubeId: 'Js5JpabUO28', videoId: 'titanic-hand-window', title: 'Hand Window Scene', movieTitle: 'Titanic', genre: 'drama' },
      { youtubeId: 'Tc7H9s4PdSI', videoId: 'rocky-adrian', title: 'Adrian!', movieTitle: 'Rocky', genre: 'drama' },
    ],
  },
  {
    lessonId: 'lesson-06-to-be-negative',
    clips: [
      { youtubeId: 'n-WMuNSr6PY', videoId: 'mrs-doubtfire-pool', title: 'Pool Scene', movieTitle: 'Mrs Doubtfire', genre: 'comedy' },
      { youtubeId: 'e7pX9IHTDn8', videoId: 'ace-ventura-alrighty', title: 'Alrighty Then', movieTitle: 'Ace Ventura', genre: 'comedy' },
    ],
  },
  {
    lessonId: 'lesson-07-to-be-questions',
    clips: [
      { youtubeId: 'JSkcCIeSTAU', videoId: 'anchorman-love-lamp', title: 'I Love Lamp', movieTitle: 'Anchorman', genre: 'comedy' },
      { youtubeId: 'pYq9g8aqRTM', videoId: 'step-brothers-friends', title: 'Best Friends', movieTitle: 'Step Brothers', genre: 'comedy' },
    ],
  },
  {
    lessonId: 'lesson-08-wh-questions-to-be',
    clips: [
      { youtubeId: 'iFgF2rN1f4o', videoId: 'terminal-krakozhia', title: 'Citizen of Nowhere', movieTitle: 'The Terminal', genre: 'drama' },
    ],
  },
  {
    lessonId: 'lesson-09-articles',
    clips: [
      { youtubeId: 'w3nKya1dQPk', videoId: 'bridesmaids-food-poison', title: 'Food Poisoning', movieTitle: 'Bridesmaids', genre: 'comedy' },
    ],
  },
  {
    lessonId: 'lesson-10-demonstratives',
    clips: [
      { youtubeId: '-rDTRuCOs9g', videoId: 'devil-prada-cerulean', title: 'Cerulean Scene', movieTitle: 'Devil Wears Prada', genre: 'comedy' },
    ],
  },
  {
    lessonId: 'lesson-11-possessive-adjectives',
    clips: [
      { youtubeId: 'MoLkabPK3YU', videoId: 'interstellar-messages', title: 'Years of Messages', movieTitle: 'Interstellar', genre: 'scifi' },
      { youtubeId: 'v2H1s9gj5DA', videoId: 'interstellar-docking', title: 'Docking Scene', movieTitle: 'Interstellar', genre: 'scifi' },
    ],
  },
  {
    lessonId: 'lesson-13-simple-commands',
    clips: [
      { youtubeId: 'C3J1AO9z0tA', videoId: 'apollo13-houston', title: 'Houston Problem', movieTitle: 'Apollo 13', genre: 'drama' },
      { youtubeId: 'LHtgKIFoQfE', videoId: 'cast-away-wilson', title: 'Wilson!', movieTitle: 'Cast Away', genre: 'drama' },
      { youtubeId: 'YD1rlE5tp_0', videoId: 'martian-do-math', title: "Let's Do the Math", movieTitle: 'The Martian', genre: 'scifi' },
      { youtubeId: 'A_hLdPRsssE', videoId: 'rocky4-training', title: 'Training Montage', movieTitle: 'Rocky IV', genre: 'drama' },
      { youtubeId: 'BejM1biN_8k', videoId: 'gravity-debris', title: 'Space Debris', movieTitle: 'Gravity', genre: 'scifi' },
    ],
  },
];

function run(): void {
  console.log('═══ Wave 5b: More no-subtitle clips ═══\n');
  let linked = 0, created = 0;
  for (const lesson of LESSONS) {
    console.log(`─── ${lesson.lessonId} ───`);
    for (const e of lesson.clips) {
      const ex = s.fv.get(e.youtubeId) as any;
      if (ex) {
        const clip = s.fc.get(ex.id) as any;
        if (!clip) continue;
        if (s.el.get(clip.id, lesson.lessonId)) { console.log(`  ↗ ${e.movieTitle} (already linked)`); }
        else { s.ll.run(clip.id, lesson.lessonId); console.log(`  ↗ ${e.movieTitle} — ${e.title} (linked #${clip.id})`); }
        linked++;
      } else {
        try {
          s.iv.run(e.videoId, e.youtubeId, e.title, e.movieTitle, e.genre);
          const r = s.ic.run(e.videoId);
          const cid = r.lastInsertRowid as number;
          s.ll.run(cid, lesson.lessonId);
          console.log(`  ★ ${e.movieTitle} — ${e.title} (new #${cid})`);
          created++;
        } catch (err: any) { console.log(`  ⚠ ${e.videoId}: ${err.message}`); }
      }
    }
  }
  console.log(`\n═══ Linked: ${linked}, New: ${created} ═══`);
  const res = db.prepare('SELECT cs.lesson_id, COUNT(DISTINCT cs.clip_id) as n FROM clip_structures cs GROUP BY cs.lesson_id ORDER BY cs.lesson_id').all() as any[];
  for (const r of res) console.log(`  ${r.lesson_id}: ${r.n} clips`);
  const total = (db.prepare('SELECT COUNT(*) as n FROM videos').get() as any).n;
  const newOnly = (db.prepare("SELECT COUNT(*) as n FROM videos v JOIN clips c ON c.video_id=v.id LEFT JOIN subtitle_lines sl ON sl.clip_id=c.id WHERE sl.id IS NULL").get() as any).n;
  console.log(`\nTotal videos: ${total} (${newOnly} without subtitles)`);
  db.close();
}
run();
