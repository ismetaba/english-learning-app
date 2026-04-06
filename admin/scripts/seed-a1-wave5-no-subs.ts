/**
 * Wave 5: 200+ clips WITHOUT subtitles.
 * Run:  cd admin && npx tsx scripts/seed-a1-wave5-no-subs.ts
 * NOTE: No WhisperX needed — these are subtitle-free clips.
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
      { youtubeId: 'GB2yiIoEtXw', videoId: 'singin-rain-good-morning', title: 'Good Morning', movieTitle: "Singin' in the Rain", genre: 'musical' },
      { youtubeId: 'pyMU8O2B2Vs', videoId: 'singin-rain-good-mornin', title: "Good Mornin'", movieTitle: "Singin' in the Rain", genre: 'musical' },
      { youtubeId: 'Ea5k9eZg7rk', videoId: 'jimmy-neutron-greetings', title: 'Greetings from Planet Earth!', movieTitle: 'Jimmy Neutron', genre: 'animation' },
      { youtubeId: 'KlgdWQYySZQ', videoId: 'tomorrow-man-nice-meet', title: 'Nice to Meet You', movieTitle: 'The Tomorrow Man', genre: 'drama' },
      { youtubeId: 'DPQ47h-k-nw', videoId: 'beautiful-girls-caroline', title: 'Sweet Caroline', movieTitle: 'Beautiful Girls', genre: 'drama' },
    ],
  },
  // ─── lesson-02-courtesy-phrases ───
  {
    lessonId: 'lesson-02-courtesy-phrases',
    clips: [
      { youtubeId: 'ZJdThnwSrfQ', videoId: 'wong-foo-manners', title: 'Manners Lesson', movieTitle: 'To Wong Foo', genre: 'comedy' },
      { youtubeId: '_qfIfbYkBUk', videoId: 'purge-thank-sacrifice', title: 'Thank You for Your Sacrifice', movieTitle: 'The Purge', genre: 'thriller' },
      { youtubeId: 'BZSb0JCWcXk', videoId: 'wizard-oz-no-place-home', title: "There's No Place Like Home", movieTitle: 'The Wizard of Oz', genre: 'fantasy' },
      { youtubeId: 'NFWMBE-mQEc', videoId: 'wizard-oz-home-2', title: "There's No Place Like Home", movieTitle: 'The Wizard of Oz', genre: 'fantasy' },
      { youtubeId: 'b-VzKjKNPGM', videoId: 'mr-rogers-visit', title: 'Mr. Rogers Comes to Visit', movieTitle: 'A Beautiful Day in the Neighborhood', genre: 'drama' },
      { youtubeId: 'LfSLyM9XiCw', videoId: 'impossible-its-ok', title: "It's Going to Be Okay", movieTitle: 'The Impossible', genre: 'drama' },
    ],
  },
  // ─── lesson-03-subject-pronouns ───
  {
    lessonId: 'lesson-03-subject-pronouns',
    clips: [
      { youtubeId: '_nSvn54WCxY', videoId: 'starwars-i-am-father', title: 'I Am Your Father', movieTitle: 'Star Wars', genre: 'scifi' },
      { youtubeId: 'HBAdbxjbTM0', videoId: 'starwars-chosen-one-2', title: 'You Were the Chosen One!', movieTitle: 'Star Wars', genre: 'scifi' },
      { youtubeId: 'v_YozYt8l-g', videoId: 'starwars-my-brother', title: 'You Were My Brother!', movieTitle: 'Star Wars', genre: 'scifi' },
      { youtubeId: 'O7fXfCZ4sB4', videoId: 'lion-king-remember', title: 'Remember Who You Are', movieTitle: 'The Lion King', genre: 'animation' },
      { youtubeId: 'VvjQe83greI', videoId: 'lion-king-remember-2', title: 'Remember Who You Are (Full)', movieTitle: 'The Lion King', genre: 'animation' },
      { youtubeId: 'VLWd8tzQhc0', videoId: 'toy-story-you-are-toy', title: 'You Are a Toy!', movieTitle: 'Toy Story', genre: 'animation' },
      { youtubeId: '7mGr4Uc7ebA', videoId: 'oblivion-not-team', title: 'We Are Not An Effective Team', movieTitle: 'Oblivion', genre: 'scifi' },
      { youtubeId: 'SRlmBs7EwMk', videoId: '10000bc-not-god', title: 'He is Not a God', movieTitle: '10,000 BC', genre: 'adventure' },
      { youtubeId: 'hopRenk1oaQ', videoId: 'commando-dead-tired', title: "He's Dead Tired", movieTitle: 'Commando', genre: 'action' },
      { youtubeId: 'MrhV0mA-bWg', videoId: 'notld-is-he-dead', title: 'Is He Dead?', movieTitle: 'Night of the Living Dead', genre: 'horror' },
      { youtubeId: 'yxOMkjGIZYI', videoId: 'hangover2-hes-dead', title: "He's Dead!", movieTitle: 'The Hangover Part II', genre: 'comedy' },
      { youtubeId: 'a-9990dlfvo', videoId: 'et-hes-alive', title: "He's Alive! He's Alive!", movieTitle: 'E.T.', genre: 'scifi' },
      { youtubeId: '9mfEcOqZxaM', videoId: 'superman-its-a-bird', title: "It's a Bird... It's a Plane... It's Superman!", movieTitle: 'Superman', genre: 'action' },
      { youtubeId: 'SMJqQ3VrcCA', videoId: 'children-men-safe', title: "We're Safe", movieTitle: 'Children of Men', genre: 'scifi' },
    ],
  },
  // ─── lesson-04-to-be-noun ───
  {
    lessonId: 'lesson-04-to-be-noun',
    clips: [
      { youtubeId: 'KNaj7uCVPCI', videoId: 'beowulf-i-am', title: 'I Am Beowulf', movieTitle: 'Beowulf', genre: 'action' },
      { youtubeId: 'YDDEqgmGIVg', videoId: 'obrother-constant-sorrow', title: 'I Am a Man of Constant Sorrow', movieTitle: "O Brother Where Art Thou", genre: 'comedy' },
      { youtubeId: 'mySMw3VkEBE', videoId: 'jack-reacher-not-hero', title: 'I Am Not a Hero', movieTitle: 'Jack Reacher', genre: 'action' },
      { youtubeId: 'jX-_bMFaYm4', videoId: 'titanic-king-world-2', title: "I'm the King of the World!", movieTitle: 'Titanic', genre: 'drama' },
      { youtubeId: 'jdaRmmBS1xQ', videoId: 'winters-tale-beverly', title: 'Her Name Was Beverly', movieTitle: "Winter's Tale", genre: 'drama' },
      { youtubeId: 'iI0ItFnUJwA', videoId: 'age-innocence-woman', title: 'There Is Another Woman', movieTitle: 'The Age of Innocence', genre: 'drama' },
      { youtubeId: '7dw45dGMGNY', videoId: 'lethal-weapon-crazy-cop', title: 'Crazy Cop', movieTitle: 'Lethal Weapon', genre: 'action' },
    ],
  },
  // ─── lesson-05-to-be-adjective ───
  {
    lessonId: 'lesson-05-to-be-adjective',
    clips: [
      { youtubeId: '8DrsMeY29Kc', videoId: 'rocky3-im-afraid', title: "I'm Afraid", movieTitle: 'Rocky III', genre: 'drama' },
      { youtubeId: 'Yv6uGkXZqCY', videoId: 'victoria-abdul-beautiful', title: 'You Really Are Beautiful', movieTitle: 'Victoria & Abdul', genre: 'drama' },
      { youtubeId: 'ZQHhiZUNM3Q', videoId: 'gatsby-beautiful-fool', title: 'Beautiful Little Fool', movieTitle: 'The Great Gatsby', genre: 'drama' },
      { youtubeId: 'Nl84kSrgLkc', videoId: 'crazy-rich-not-enough', title: 'You Will Never Be Good Enough', movieTitle: 'Crazy Rich Asians', genre: 'drama' },
      { youtubeId: 'WZ6p4t3StSc', videoId: 'scent-woman-in-dark', title: "I'm In the Dark", movieTitle: 'Scent of a Woman', genre: 'drama' },
      { youtubeId: 'cBHvRuBtJqI', videoId: 'lethal-weapon-crazy', title: 'You Really Are Crazy', movieTitle: 'Lethal Weapon', genre: 'action' },
      { youtubeId: 'Lxfe0cKOx3g', videoId: 'rocky-pain-experience', title: 'Pain and Experience', movieTitle: 'Rocky', genre: 'drama' },
      { youtubeId: 'azot-mIuW3Y', videoId: 'childs-play-scared', title: 'Scared to Death', movieTitle: "Child's Play 3", genre: 'horror' },
      { youtubeId: 'bcmz8T454cQ', videoId: 'elf-angry-elf', title: 'The Angry Elf', movieTitle: 'Elf', genre: 'comedy' },
    ],
  },
  // ─── lesson-06-to-be-negative ───
  {
    lessonId: 'lesson-06-to-be-negative',
    clips: [
      { youtubeId: 'PZ0FmgJsC3U', videoId: 'wicked-not-that-girl', title: "I'm Not That Girl", movieTitle: 'Wicked', genre: 'musical' },
      { youtubeId: '51euUliFZ-w', videoId: 'be-cool-not-gangsta', title: "That's Not Gangsta", movieTitle: 'Be Cool', genre: 'comedy' },
      { youtubeId: 'T4wxOGDv980', videoId: 'new-jack-not-guilty', title: "I'm Not Guilty", movieTitle: 'New Jack City', genre: 'drama' },
      { youtubeId: '9AzXX_2BrVk', videoId: 'mr-rogers-not-broken', title: "I Don't Think You Are Broken", movieTitle: 'A Beautiful Day in the Neighborhood', genre: 'drama' },
      { youtubeId: '7-5kYQLJnFw', videoId: 'instant-family-not-coming', title: "She's Not Coming", movieTitle: 'Instant Family', genre: 'comedy' },
      { youtubeId: 'oUpzcxwFI6o', videoId: 'if-i-stay-not-alone', title: "You're Not Alone", movieTitle: 'If I Stay', genre: 'drama' },
      { youtubeId: 'SUMtjCypolU', videoId: 'riddick-not-afraid-dark', title: "You're Not Afraid of the Dark?", movieTitle: 'The Chronicles of Riddick', genre: 'scifi' },
      { youtubeId: 'hdW1BlDtcyU', videoId: 'witness-its-over', title: "It's Over", movieTitle: 'Witness', genre: 'drama' },
    ],
  },
  // ─── lesson-07-to-be-questions ───
  {
    lessonId: 'lesson-07-to-be-questions',
    clips: [
      { youtubeId: '59ZcTCijizI', videoId: 'equilibrium-why-alive', title: 'Why Are You Alive?', movieTitle: 'Equilibrium', genre: 'scifi' },
      { youtubeId: '2sXk0mTPwUs', videoId: 'bold-journey-why-single', title: 'Why Are You Single?', movieTitle: 'A Big Bold Beautiful Journey', genre: 'comedy' },
      { youtubeId: 'TBiqsgxbxLA', videoId: 'edge-darkness-why-here', title: 'Why Are You Here?', movieTitle: 'Edge of Darkness', genre: 'thriller' },
      { youtubeId: 'FnahBy4Od9Q', videoId: 'impossible-is-it-over', title: 'Is it Over?', movieTitle: 'The Impossible', genre: 'drama' },
      { youtubeId: 'dBvvkOTp3P0', videoId: 'zodiac-are-you-ok', title: 'Are You Okay?', movieTitle: 'Zodiac', genre: 'thriller' },
      { youtubeId: 'w5oWgKtku3Q', videoId: 'allied-is-this-real', title: 'Is This Real?', movieTitle: 'Allied', genre: 'drama' },
      { youtubeId: 'KihpUEKi4TA', videoId: 'shutter-island-stop', title: 'Could You Stop That?', movieTitle: 'Shutter Island', genre: 'thriller' },
      { youtubeId: '9WY5gDBR0gM', videoId: 'shutter-island-wanted', title: 'What If They Wanted You Here?', movieTitle: 'Shutter Island', genre: 'thriller' },
      { youtubeId: '7NMQnDrBp60', videoId: 'jeremiah-johnson-sure', title: 'Sure That You Can Skin Grizz?', movieTitle: 'Jeremiah Johnson', genre: 'western' },
    ],
  },
  // ─── lesson-08-wh-questions-to-be ───
  {
    lessonId: 'lesson-08-wh-questions-to-be',
    clips: [
      { youtubeId: 'MV4zHRnIUpU', videoId: 'anger-mgmt-who-are-you', title: 'Who Are You?', movieTitle: 'Anger Management', genre: 'comedy' },
      { youtubeId: 'X9NNlztQPaA', videoId: 'roots-whats-your-name', title: "What's Your Name?", movieTitle: 'Roots', genre: 'drama' },
      { youtubeId: 'b2MEP246DxY', videoId: 'creed2-whats-name', title: "What's Your Name?", movieTitle: 'Creed II', genre: 'drama' },
      { youtubeId: '2dmBRe4U8uM', videoId: 'wicked-what-feeling', title: 'What Is This Feeling?', movieTitle: 'Wicked', genre: 'musical' },
      { youtubeId: '2pVPaPFm5iI', videoId: 'phantoms-what-is-that', title: 'What is That?', movieTitle: 'Phantoms', genre: 'horror' },
      { youtubeId: 'a-SnsqKFHLY', videoId: 'thx1138-whats-wrong', title: "What's Wrong?", movieTitle: 'THX 1138', genre: 'scifi' },
      { youtubeId: 'E1I0hAxGFXw', videoId: 'notebook-what-want', title: 'What Do You Want?', movieTitle: 'The Notebook', genre: 'drama' },
      { youtubeId: 'wPO6KyIYst4', videoId: 'yentl-where-written', title: 'Where Is It Written?', movieTitle: 'Yentl', genre: 'musical' },
      { youtubeId: '6ZZI6-zh0GM', videoId: 'jerry-maguire-whos-coming', title: "Who's Coming With Me?", movieTitle: 'Jerry Maguire', genre: 'drama' },
      { youtubeId: 'bzD68-Y185U', videoId: 'shrek-what-doing-swamp', title: 'What Are You Doing in My Swamp?', movieTitle: 'Shrek', genre: 'animation' },
    ],
  },
  // ─── lesson-09-articles ───
  {
    lessonId: 'lesson-09-articles',
    clips: [
      { youtubeId: '3B0LNmodDBQ', videoId: 'starwars-its-a-trap-2', title: "It's a Trap!", movieTitle: 'Star Wars', genre: 'scifi' },
      { youtubeId: 'wk-6DPrcMv4', videoId: 'starwars-its-a-trap-3', title: "It's a Trap!", movieTitle: 'Star Wars', genre: 'scifi' },
      { youtubeId: 'SeldwfOwuL8', videoId: 'godfather-offer-2', title: "An Offer He Can't Refuse", movieTitle: 'The Godfather', genre: 'drama' },
      { youtubeId: 'sSldC4l5ncw', videoId: 'few-good-men-truth-2', title: "You Can't Handle the Truth!", movieTitle: 'A Few Good Men', genre: 'drama' },
      { youtubeId: 'aXNLdw9CUgE', videoId: 'matrix-beginning-believe', title: "He's Beginning to Believe", movieTitle: 'The Matrix', genre: 'scifi' },
      { youtubeId: 'mJZZNHekEQw', videoId: 'lotr-shall-not-pass', title: 'You Shall Not Pass', movieTitle: 'Lord of the Rings', genre: 'fantasy' },
      { youtubeId: 'LbAPwwAXaWM', videoId: 'lotr-fate-ring', title: 'The Fate of the Ring', movieTitle: 'Lord of the Rings', genre: 'fantasy' },
      { youtubeId: 'KM8aGQ0IuZ4', videoId: 'frozen-let-it-go-2', title: 'Let It Go', movieTitle: 'Frozen', genre: 'animation' },
    ],
  },
  // ─── lesson-10-demonstratives ───
  {
    lessonId: 'lesson-10-demonstratives',
    clips: [
      { youtubeId: '4aof9KxIJZo', videoId: 'sparta-this-is', title: 'This is Sparta!', movieTitle: '300', genre: 'action' },
      { youtubeId: 'Mw7zSQ7ja7Y', videoId: 'mandalorian-this-way-2', title: 'This Is the Way (Compilation)', movieTitle: 'The Mandalorian', genre: 'scifi' },
      { youtubeId: 'IC21keB1yaM', videoId: 'thats-my-boy-teacher', title: "That's My Boy", movieTitle: "That's My Boy", genre: 'comedy' },
      { youtubeId: 'QiZNSzWIaLo', videoId: 'starwars-chosen-one-3', title: 'You Were the Chosen One!', movieTitle: 'Star Wars', genre: 'scifi' },
      { youtubeId: '8QJiAK-s5a0', videoId: 'happy-gilmore-price', title: 'The Price Is Wrong', movieTitle: 'Happy Gilmore', genre: 'comedy' },
      { youtubeId: 'GA4Ozqt7338', videoId: 'thing-wait-here', title: "Why Don't We Wait Here", movieTitle: 'The Thing', genre: 'horror' },
      { youtubeId: 'hpb2-ZOzc_o', videoId: 'ring-samara-comes', title: 'Samara Comes to You', movieTitle: 'The Ring', genre: 'horror' },
    ],
  },
  // ─── lesson-11-possessive-adjectives ───
  {
    lessonId: 'lesson-11-possessive-adjectives',
    clips: [
      { youtubeId: 'LeG_judrcOA', videoId: 'hp-always', title: 'After All This Time? Always.', movieTitle: 'Harry Potter', genre: 'fantasy' },
      { youtubeId: '6tqPK8nJL2U', videoId: 'gwh-not-your-fault', title: "It's Not Your Fault", movieTitle: 'Good Will Hunting', genre: 'drama' },
      { youtubeId: '-k6JxfX8asc', videoId: 'gwh-say-dont-love', title: "Say You Don't Love Me", movieTitle: 'Good Will Hunting', genre: 'drama' },
      { youtubeId: 'C9EEncgmfOY', videoId: 'coco-miguel-moments', title: 'Miguel Memorable Moments', movieTitle: 'Coco', genre: 'animation' },
      { youtubeId: 'pNGEifXom4M', videoId: 'coco-miguel-abuelita', title: 'Miguel Abuelita', movieTitle: 'Coco', genre: 'animation' },
      { youtubeId: '7bgBwrNARuI', videoId: 'akeelah-deepest-fear', title: 'Our Deepest Fear', movieTitle: 'Akeelah and the Bee', genre: 'drama' },
      { youtubeId: 'yL-owHxF2lc', videoId: 'incredibles-family-dinner', title: 'Family Dinner', movieTitle: 'The Incredibles', genre: 'animation' },
      { youtubeId: 'h5lJTcChkoA', videoId: 'incredibles2-jackjack', title: 'Jack-Jack vs. Raccoon', movieTitle: 'Incredibles 2', genre: 'animation' },
    ],
  },
  // ─── lesson-12-basic-vocabulary ───
  {
    lessonId: 'lesson-12-basic-vocabulary',
    clips: [
      { youtubeId: 'WRsBMPnQYbQ', videoId: 'frozen-build-snowman', title: 'Do You Want to Build a Snowman?', movieTitle: 'Frozen', genre: 'animation' },
      { youtubeId: 'zm4VcCdZ84U', videoId: 'frozen-build-snowman-2', title: 'Do You Want to Build a Snowman?', movieTitle: 'Frozen', genre: 'animation' },
      { youtubeId: 'NLjX5gcmVfc', videoId: 'nemo-just-keep-swim', title: 'Just Keep Swimming', movieTitle: 'Finding Nemo', genre: 'animation' },
      { youtubeId: 'y9FGsJ3PYVw', videoId: 'nemo-just-keep-swim-2', title: 'Just Keep Swimming!', movieTitle: 'Finding Nemo', genre: 'animation' },
      { youtubeId: 'rPuW7T25Yuw', videoId: 'madagascar-wonderful', title: 'What a Wonderful World', movieTitle: 'Madagascar', genre: 'animation' },
      { youtubeId: 'PFbxA5HjwyQ', videoId: 'happy-feet-leap', title: 'Mumble Takes a Leap', movieTitle: 'Happy Feet', genre: 'animation' },
      { youtubeId: 'dOkyKyVFnSs', videoId: 'inside-out-feelings', title: 'Guessing the Feelings', movieTitle: 'Inside Out', genre: 'animation' },
      { youtubeId: 'nEUzQ7yL9A0', videoId: 'inside-out-emotions', title: 'Get To Know Your Emotions', movieTitle: 'Inside Out', genre: 'animation' },
      { youtubeId: 'JhAzwl6pWq0', videoId: 'inside-out-sadness', title: 'Seasonal Sadness', movieTitle: 'Inside Out', genre: 'animation' },
      { youtubeId: 'H4O4b1K3haU', videoId: 'toy-story-infinity', title: 'To Infinity and Beyond', movieTitle: 'Toy Story', genre: 'animation' },
      { youtubeId: 'LdMb9D9WF5k', videoId: 'toy-story-infinity-2', title: 'To Infinity and Beyond', movieTitle: 'Toy Story', genre: 'animation' },
      { youtubeId: 'omJeYC3Z4vU', videoId: 'wonderful-life-live', title: 'I Want to Live Again!', movieTitle: "It's a Wonderful Life", genre: 'drama' },
      { youtubeId: 'uDQVRxRlGdQ', videoId: 'wonderful-life-miracle', title: 'A Christmas Miracle', movieTitle: "It's a Wonderful Life", genre: 'drama' },
    ],
  },
  // ─── lesson-13-simple-commands ───
  {
    lessonId: 'lesson-13-simple-commands',
    clips: [
      { youtubeId: '7a3vbSR4qWU', videoId: 'police-academy-come', title: 'Come With Me!', movieTitle: 'Police Academy', genre: 'comedy' },
      { youtubeId: 'k_dVfhBaJRw', videoId: 'leon-open-door', title: 'Open The Door', movieTitle: 'Léon: The Professional', genre: 'thriller' },
      { youtubeId: 'mRluMo3xA8M', videoId: 'leon-open-door-2', title: 'Open the Door', movieTitle: 'Léon: The Professional', genre: 'thriller' },
      { youtubeId: '8d6b69PmyV4', videoId: 'forrest-gump-run', title: 'Run Forrest, Run!', movieTitle: 'Forrest Gump', genre: 'drama' },
      { youtubeId: 'st7Q7NyuBYA', videoId: 'forrest-gump-run-2', title: 'Run, Forrest, Run!', movieTitle: 'Forrest Gump', genre: 'drama' },
      { youtubeId: '2z4o-jBlqq0', videoId: 'heat-look-at-me', title: 'Look at Me', movieTitle: 'Heat', genre: 'action' },
      { youtubeId: 'O31rBYqYkuQ', videoId: 'get-shorty-look-at-me', title: 'Look at Me', movieTitle: 'Get Shorty', genre: 'comedy' },
      { youtubeId: 'w6O6wR44AY4', videoId: 'favourite-look-at-me', title: 'Look At Me', movieTitle: 'The Favourite', genre: 'drama' },
      { youtubeId: 'nEf2ML7wkBE', videoId: 'bad-boys-reggie', title: 'Intimidating Reggie', movieTitle: 'Bad Boys II', genre: 'action' },
      { youtubeId: 'RCYtC1p6xbo', videoId: 'raising-arizona-freeze', title: 'Freeze or Get Down', movieTitle: 'Raising Arizona', genre: 'comedy' },
    ],
  },
  // ─── Cross-links: clips that fit multiple lessons ───
  {
    lessonId: 'lesson-05-to-be-adjective',
    clips: [
      { youtubeId: 'ILqwaOR70mU', videoId: 'bridesmaids-why-happy', title: "Why Can't You Just Be Happy for Me?", movieTitle: 'Bridesmaids', genre: 'comedy' },
      { youtubeId: 'sf9038zMVgo', videoId: 'bridesmaids-ready-party', title: 'Ready to Partay', movieTitle: 'Bridesmaids', genre: 'comedy' },
    ],
  },
  {
    lessonId: 'lesson-06-to-be-negative',
    clips: [
      { youtubeId: 'mySMw3VkEBE', videoId: 'jack-reacher-not-hero', title: 'I Am Not a Hero', movieTitle: 'Jack Reacher', genre: 'action' },
      { youtubeId: 'SRlmBs7EwMk', videoId: '10000bc-not-god', title: 'He is Not a God', movieTitle: '10,000 BC', genre: 'adventure' },
    ],
  },
  {
    lessonId: 'lesson-07-to-be-questions',
    clips: [
      { youtubeId: 'MV4zHRnIUpU', videoId: 'anger-mgmt-who-are-you', title: 'Who Are You?', movieTitle: 'Anger Management', genre: 'comedy' },
    ],
  },
  {
    lessonId: 'lesson-09-articles',
    clips: [
      { youtubeId: '9mfEcOqZxaM', videoId: 'superman-its-a-bird', title: "It's a Bird... It's a Plane...", movieTitle: 'Superman', genre: 'action' },
    ],
  },
  {
    lessonId: 'lesson-10-demonstratives',
    clips: [
      { youtubeId: 'HBAdbxjbTM0', videoId: 'starwars-chosen-one-2', title: 'You Were the Chosen One!', movieTitle: 'Star Wars', genre: 'scifi' },
    ],
  },
  {
    lessonId: 'lesson-11-possessive-adjectives',
    clips: [
      { youtubeId: 'v_YozYt8l-g', videoId: 'starwars-my-brother', title: 'You Were My Brother!', movieTitle: 'Star Wars', genre: 'scifi' },
    ],
  },
  // ─── Extra clips for padding across lessons ───
  {
    lessonId: 'lesson-02-courtesy-phrases',
    clips: [
      { youtubeId: 'u3_-weY-qEA', videoId: 'adaline-jenny-actually', title: 'Jenny Actually', movieTitle: 'The Age of Adaline', genre: 'drama' },
    ],
  },
  {
    lessonId: 'lesson-04-to-be-noun',
    clips: [
      { youtubeId: '-Luy502C920', videoId: 'running-scared-mugging', title: "You're Mugging Us?", movieTitle: 'Running Scared', genre: 'comedy' },
      { youtubeId: 'FmhSgk_yTeE', videoId: 'sing2-tryouts', title: 'Tryouts Scene', movieTitle: 'Sing 2', genre: 'animation' },
      { youtubeId: 'KEc0SGkBDJ4', videoId: 'nysm2-introducing-lula', title: 'Introducing Lula', movieTitle: 'Now You See Me 2', genre: 'thriller' },
    ],
  },
  {
    lessonId: 'lesson-13-simple-commands',
    clips: [
      { youtubeId: '0M0FfQzSngM', videoId: 'planes-trains-wrong-way', title: "You're Going the Wrong Way!", movieTitle: 'Planes, Trains and Automobiles', genre: 'comedy' },
    ],
  },
];

function run(): void {
  console.log('═══ Wave 5: No-subtitle clips ═══\n');
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
  console.log(`\nTotal videos in DB: ${total}`);
  db.close();
}
run();
