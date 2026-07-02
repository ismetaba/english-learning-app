import type { LessonSection } from '@/services/curriculumService';

export const WORD_TRANSLATIONS_TR: Record<string, string> = {
  'i': 'ben', 'you': 'sen', 'he': 'o (erkek)', 'she': 'o (kadın)', 'it': 'o (şey)',
  'we': 'biz', 'they': 'onlar', 'me': 'bana/beni', 'my': 'benim', 'your': 'senin',
  'his': 'onun (erkek)', 'her': 'onun (kadın)', 'our': 'bizim', 'their': 'onların',
  'this': 'bu', 'that': 'şu', 'these': 'bunlar', 'those': 'şunlar',
  'is': '-dır/dir', 'am': '-ım/yım', 'are': '-sınız/-lar', 'was': '-dı/-ydı', 'were': '-dılar',
  'the': '-', 'a': 'bir', 'an': 'bir',
  'and': 've', 'or': 'veya', 'but': 'ama', 'not': 'değil',
  'yes': 'evet', 'no': 'hayır', 'ok': 'tamam', 'okay': 'tamam',
  'hello': 'merhaba', 'hi': 'selam', 'hey': 'hey', 'bye': 'hoşça kal', 'goodbye': 'güle güle',
  'good': 'iyi', 'morning': 'sabah', 'afternoon': 'öğleden sonra', 'evening': 'akşam', 'night': 'gece',
  'please': 'lütfen', 'thank': 'teşekkür', 'thanks': 'teşekkürler', 'sorry': 'üzgünüm', 'excuse': 'affedersiniz',
  'welcome': 'hoş geldiniz', 'name': 'isim', 'nice': 'güzel', 'meet': 'tanışmak',
  'how': 'nasıl', 'what': 'ne', 'where': 'nerede', 'who': 'kim', 'when': 'ne zaman', 'why': 'neden',
  'here': 'burada', 'there': 'orada', 'come': 'gel', 'go': 'git',
  'want': 'istemek', 'just': 'sadece', 'very': 'çok', 'much': 'çok',
  'oh': 'oh', 'god': 'tanrım', 'well': 'şey/peki', 'right': 'doğru', 'sure': 'elbette',
  'friend': 'arkadaş', 'friends': 'arkadaşlar', 'brother': 'erkek kardeş', 'sister': 'kız kardeş',
  'room': 'oda', 'house': 'ev', 'school': 'okul', 'work': 'iş',
  'know': 'bilmek', 'remember': 'hatırlamak', 'think': 'düşünmek', 'see': 'görmek', 'look': 'bakmak',
  'everybody': 'herkes', 'everyone': 'herkes', 'something': 'bir şey', 'nothing': 'hiçbir şey',
  'million': 'milyon', 'dollars': 'dolar', 'coffee': 'kahve', 'water': 'su',
  'can': '-abilir', 'get': 'almak', 'some': 'biraz', 'with': 'ile', 'about': 'hakkında',
  'open': 'açmak', 'door': 'kapı', 'big': 'büyük', 'new': 'yeni', 'old': 'eski',
  'guy': 'adam', 'man': 'adam', 'woman': 'kadın', 'people': 'insanlar',
  'really': 'gerçekten', 'again': 'tekrar', 'never': 'asla', 'always': 'her zaman',
  'family': 'aile', 'baby': 'bebek', 'children': 'çocuklar', 'child': 'çocuk',
  'said': 'dedi', 'says': 'der/diyor', 'say': 'demek', 'tell': 'söylemek', 'told': 'söyledi',
  'like': 'gibi/sevmek', 'love': 'sevmek/aşk', 'hate': 'nefret',
  'do': 'yapmak', "don't": 'yapma', 'did': 'yaptı', "didn't": 'yapmadı',
  'have': 'sahip olmak', 'has': 'var', "haven't": 'yok',
  'will': '-ecek', "won't": '-meyecek', 'would': '-irdi',
  'could': '-ebilirdi', 'should': '-meli', 'might': 'belki',
  'up': 'yukarı', 'down': 'aşağı', 'in': 'içinde', 'on': 'üzerinde', 'at': '-de/-da',
  'from': '-den/-dan', 'to': '-e/-a', 'for': 'için', 'of': '-nın/-nin',
  "i'm": 'ben ...', "it's": 'o ...', "he's": 'o ...', "she's": 'o ...',
  "that's": 'o ...', "what's": 'ne ...', "there's": '... var',
  "doesn't": 'yapmaz', "isn't": 'değil', "aren't": 'değiller',
  "can't": 'yapamaz', "wasn't": 'değildi',
};

export function buildVocabDict(lessonSections?: LessonSection[] | null): Record<string, string> {
  const base = { ...WORD_TRANSLATIONS_TR };
  if (lessonSections) {
    for (const sec of lessonSections) {
      if (sec.type === 'vocab') {
        for (const w of sec.words) {
          base[w.word.toLowerCase()] = w.translation;
        }
      }
    }
  }
  return base;
}

export function translateLineWords(
  text: string,
  dict: Record<string, string>,
): { word: string; tr: string }[] {
  return text.split(' ').map(w => {
    const clean = w.replace(/[.,!?;:'"]/g, '').toLowerCase();
    const tr = dict[clean]
      || dict[clean.replace(/'s$/, '')]
      || dict[clean.replace(/'re$/, '')]
      || dict[clean.replace(/'t$/, '')]
      || '';
    return { word: w, tr };
  });
}

export function buildSentenceTr(translations: { word: string; tr: string }[]): string {
  return translations.map(t => t.tr).filter(Boolean).join(' ');
}
