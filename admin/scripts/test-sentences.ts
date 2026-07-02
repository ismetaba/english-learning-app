import { tagSentence } from './rule-based-tagger';

const tests = [
  "Water has memory.",
  "Music could change the world.",
  "People love it.",
  "Donkey is so pure.",
  "Fashion could be a little bit faster.",
  "Time is money.",
  "The cat is running.",
  "She is running.",
  "You were real.",
  "That guy doesn't speak English.",
  "Riley felt sad.",
  "Mama said they took me.",
  "Headquarters got more crowded.",
  "Jenny came back.",
  "We are kind of tired.",
  "I will speak in span.",
  "He cares deeply.",
  "It tastes like flowers.",
];

for (const t of tests) {
  const words = t.split(/\s+/);
  const r = tagSentence(words);
  const cs = words.map((w, i) => {
    const tag = r.subject.includes(i) ? 'S' : r.aux_verb.includes(i) ? 'AV' : 'R';
    return `${w}=${tag}`;
  }).join(' ');
  console.log(cs);
}
