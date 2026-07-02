/**
 * Build "Beginner Mix 2": pick 100 family-friendly videos from the
 * scored candidate list, mark them POC=1, create the set, add them in
 * sort order. Set 1 is left untouched.
 *
 * Run in two passes:
 *   --select : pick & flag POC, create set with items
 *   --status : show coverage stats for the new set
 *
 * Run: cd admin && npx tsx scripts/build-set2.ts --select
 */
import Database from 'better-sqlite3';
import path from 'path';

const SET2_ID = 'beginner-mix-2';
const SET2_TITLE = 'Beginner Mix 2';
const SET2_TITLE_TR = 'Başlangıç: Karışık 2';
const SET2_DESCRIPTION =
  'A hundred more short scenes covering the same A2 vocabulary as Beginner Mix — fresh contexts for words you already know.';
const SET2_DESCRIPTION_TR =
  'Beginner Mix ile aynı A2 kelimeleri kapsayan 100 ek kısa sahne — bildiğiniz kelimeler için taze bağlamlar.';

// Curated 100 family-friendly picks from the scored candidate list
// (skipped: adult comedy, graphic violence, horror, heavy break-up monologues,
// extreme arguments, complex psychological).
const PICKS: string[] = [
  'the-dukes-of-hazzard-car-chase',
  'last-christmas-they-took-out-my-heart-scene-they-took-out-my-heart-scene-5-10',
  '13-going-on-30-jenna-mom-breakfast',
  'ant-man-and-the-wasp-quantumania-2023-movie-clip-4k-8wxc7jog',
  'obrother-constant-sorrow',
  'hit-the-road-jack-hit-the-road-jack',
  'shrek-swamp-question',
  'grumpier-old-men-max-and-maria-scene-67-movie-s',
  'aunt-may-s-motivational-speech-spider-man-2-blu-ray-sheitla',
  'madagascar-move-it',
  'the-office-michael',
  'kevin-flynn-clu-tron-legacy-final-confrontation-scene',
  'crazy-rich-not-enough',
  'interstellar-messages',
  'click-last-time-with-dad-scene-910-movie-s',
  'friday-night-lights-coach-gaines-on-being-perfect',
  'just-like-heaven-what-s-happening-to-me',
  '1917-2019-d4jmmbc28x8',
  'lifting-thor-s-hammer-scene-stan-lee-cameo-thor',
  'andor-andor-TKB67Kzj',
  'twilight-2008-vampire-baseball-scene-movieclips',
  'groot-i-am-groot-bomb',
  'iron-man-plane-rescue-iron-man-3',
  'la-la-land-not-good',
  'insideout-her-name',
  'shrek-2-an-awkward-dinner-scene-210-movie-s',
  'pursuit-of-happyness-job-interview-inspirational',
  'chocolat-taming-the-shrew',
  'monsters-inc-boo-kitty',
  'forrest-gump-name',
  'selena-i-love-you-scene-49-movie-s',
  'avengers-infinity-war-snap-zcwpreza9o4',
  'encanto-bruno',
  'the-terminal-2004-trailer',
  'emma-love-and-nosebleeds-scene-810-movie-s',
  'courageoushd-movie-trailer-christian-drama',
  'finding-dory-swimming',
  'margin-call-it-s-just-money',
  'central-intelligence-marriage-counseling-scene',
  'final-the-princess-bride-movie',
  'soul-spark',
  'the-magnificent-seven-goodnights-inspiration-scene-510-movie-s',
  'ice-age-scrat-acorn',
  'freedom-writers-you-are-not-failing',
  'zootopia-sloth',
  'now-you-see-me-2-hidden-card-heist-scene-711-movie-s',
  'she-hulk-attorney-at-law-2022-87ejhu4rej8',
  'elf-buddy-meets-dad',
  'mr-and-mrs-smith-dinner-scene',
  'friends-opening',
  'harry-osborn-learns-the-truth-spider-man-2-movie',
  'pitch-perfect-3-the-barden-bellas-reunion-movie',
  'identity-thief-dinner-with-a-sociopath',
  'anchorman-love-lamp',
  'mean-girls-plastics',
  'americas-sweethearts-kiki-eat-hyatt-breakfast-pancake-bacon-butter',
  'nemo-just-keep-swim',
  'happy-feet-leap',
  'bridesmaids-food-poison',
  'beauty-beast-be-guest',
  'the-man-in-the-moon-first-kiss-scene-712-movie-s',
  'incredibles2-dinner',
  'grumpy-old-men-not-so-friendly-neighbors',
  'rocky-pain-experience',
  'frozen-anna-olaf-scene',
  'elio-first-meet-with-aliens-movie-scene',
  'hawkeye-s-secret-safehouse-scene-avengers-age-of-ultron',
  'big-hero-6-car-chase-big-hero-6-movie',
  'the-bad-guys-how-to-be-good-scene-movie-s',
  'meet-the-parents-funny-dinner-mp4',
  'elf-angry-elf',
  'toystory-buzz-meets-toys',
  'f1-the-exclusive-last-thing-i-do-movie-s',
  'groot-blue-button',
  'the-mask-1994-the-mask-dog-scene-movieclips',
  'shark-tale-oscar-vs-lenny-scene-710-movie-s',
  'one-song-one-song',
  'reunion-trailer-paramount-movies',
  'plot-twist-prisonersfinal',
  'lionking-remember',
  'frozen-olaf-snowman',
  'big-business-the-reunion',
  'aftermath-2017-movie-official-clip-confrontation-arnold-schwarzenegger-aftermath',
  'jakes-training-avatar-movie',
  'maleficent-opening-frist-meet-up-king-stefan-movie',
  'meeting-meeting',
  'central-intelligence-bob-jet-arrive-at-their-school-reunion---the-rock-kevin-har',
  'the-office-fire-drill-stress-relief-go8n3l-aerg',
  'motivational-speech-being-perfect',
  'final-blue-velvet-movie',
  'aftermath-confrontation',
  'friends-joey-s-bad-birtay-gift-season-4',
  'lion-king-remember',
  'lionking-remember-your',
  'at-the-restaurant-conversation-clip',
  'breakup-to-all-the-boys-ps-i-still-love-you',
  'chocolat-your-favorite',
  'daddys-home-motorcycle-accident-scene',
  'english-drama-for-learning-english-re-clip',
  'joy-movie-clip-calls-jennifer-lawrence-dgar-ram-rez-drama',
  'popular-song-popular-song',
];

const args = process.argv.slice(2);
const ACTION = args.includes('--select') ? 'select' : args.includes('--status') ? 'status' : null;
if (!ACTION) {
  console.error('usage: --select | --status');
  process.exit(1);
}

const DB_PATH = path.join(__dirname, '..', '..', 'data.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

if (ACTION === 'select') {
  // Validate that all picks exist in DB and aren't already in set 1
  const existing = db
    .prepare(`SELECT video_id FROM video_set_items WHERE set_id='beginner-animation-1'`)
    .all() as { video_id: string }[];
  const set1Ids = new Set(existing.map(r => r.video_id));

  const valid: string[] = [];
  const missing: string[] = [];
  const inSet1: string[] = [];
  const checkVideo = db.prepare(`SELECT id FROM videos WHERE id = ?`);
  for (const id of PICKS) {
    if (set1Ids.has(id)) {
      inSet1.push(id);
      continue;
    }
    const r = checkVideo.get(id) as { id: string } | undefined;
    if (!r) {
      missing.push(id);
      continue;
    }
    valid.push(id);
  }

  console.log(`Picks total:      ${PICKS.length}`);
  console.log(`Valid (in DB, not in set 1): ${valid.length}`);
  console.log(`Missing in DB:    ${missing.length}`);
  console.log(`Already in set 1: ${inSet1.length}`);
  if (missing.length) {
    console.log('\nMissing IDs:');
    for (const m of missing) console.log(`  ${m}`);
  }
  if (inSet1.length) {
    console.log('\nAlready in set 1:');
    for (const m of inSet1) console.log(`  ${m}`);
  }

  if (valid.length < 100) {
    console.error(`\nNeed 100 valid picks, only ${valid.length} found. Aborting (no changes made).`);
    db.close();
    process.exit(1);
  }

  const picks100 = valid.slice(0, 100);

  const flag = db.prepare(`UPDATE videos SET poc = 1 WHERE id = ? AND poc = 0`);
  const upsertSet = db.prepare(
    `INSERT INTO video_sets (id, title, title_tr, description, description_tr, difficulty, sort_order)
     VALUES (?, ?, ?, ?, ?, 'beginner', 2)
     ON CONFLICT(id) DO UPDATE SET title=excluded.title, title_tr=excluded.title_tr, description=excluded.description, description_tr=excluded.description_tr`,
  );
  const insertItem = db.prepare(
    `INSERT OR IGNORE INTO video_set_items (set_id, video_id, sort_order) VALUES (?, ?, ?)`,
  );

  let flagged = 0;
  let inserted = 0;
  const tx = db.transaction(() => {
    upsertSet.run(SET2_ID, SET2_TITLE, SET2_TITLE_TR, SET2_DESCRIPTION, SET2_DESCRIPTION_TR);
    picks100.forEach((id, i) => {
      flagged += flag.run(id).changes;
      inserted += insertItem.run(SET2_ID, id, i + 1).changes;
    });
  });
  tx();

  console.log(`\nSet "${SET2_TITLE}" created/updated.`);
  console.log(`Newly flagged poc=1: ${flagged} videos.`);
  console.log(`Items inserted: ${inserted}.`);
}

if (ACTION === 'status') {
  const set = db.prepare(`SELECT * FROM video_sets WHERE id = ?`).get(SET2_ID);
  console.log('Set:', set);
  const cov = db
    .prepare(
      `SELECT
         COUNT(DISTINCT v.id) videos,
         (SELECT COUNT(*) FROM video_set_items WHERE set_id=?) items,
         (SELECT COUNT(*) FROM clips WHERE status='approved' AND video_id IN (SELECT video_id FROM video_set_items WHERE set_id=?)) approved_clips,
         (SELECT COUNT(*) FROM subtitle_lines sl JOIN clips c ON c.id=sl.clip_id WHERE c.status='approved' AND c.video_id IN (SELECT video_id FROM video_set_items WHERE set_id=?)) total_lines,
         (SELECT COUNT(*) FROM subtitle_lines sl JOIN clips c ON c.id=sl.clip_id WHERE c.status='approved' AND c.video_id IN (SELECT video_id FROM video_set_items WHERE set_id=?) AND sl.translation_tr IS NOT NULL AND length(trim(sl.translation_tr))>0) tr_lines,
         (SELECT COUNT(*) FROM subtitle_lines sl JOIN clips c ON c.id=sl.clip_id WHERE c.status='approved' AND c.video_id IN (SELECT video_id FROM video_set_items WHERE set_id=?) AND sl.structure IS NOT NULL) struct_lines
       FROM videos v
       WHERE v.id IN (SELECT video_id FROM video_set_items WHERE set_id=?)`,
    )
    .get(SET2_ID, SET2_ID, SET2_ID, SET2_ID, SET2_ID, SET2_ID);
  console.log('Coverage:', cov);
}

db.close();
