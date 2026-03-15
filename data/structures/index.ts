export interface SentencePart {
  type: 'subject' | 'verb' | 'object' | 'adjective' | 'adverb' | 'preposition' | 'article' | 'conjunction' | 'pronoun' | 'complement' | 'auxiliary' | 'negative' | 'question_word';
  word: string;
}

export interface StructureExample {
  parts: SentencePart[];
  translations: Record<string, string>;
}

export interface SentenceStructure {
  id: string;
  level: number;
  title: string;
  description: string;
  pattern: string[];
  examples: StructureExample[];
}

export const structures: SentenceStructure[] = [
  // ===== LEVEL 0 =====
  {
    id: 'alphabet-sounds',
    level: 0,
    title: 'English Alphabet & Sounds',
    description: 'Learn the letters and basic sounds of English.',
    pattern: ['subject', 'verb', 'complement'],
    examples: [
      {
        parts: [
          { type: 'subject', word: 'A B C' },
          { type: 'verb', word: 'are' },
          { type: 'complement', word: 'the first letters' },
        ],
        translations: { tr: 'A B C ilk harflerdir', es: 'A B C son las primeras letras', ar: 'A B C هي الحروف الأولى', zh: 'A B C 是最前面的字母', pt: 'A B C são as primeiras letras' },
      },
      {
        parts: [
          { type: 'subject', word: 'D E F' },
          { type: 'verb', word: 'come' },
          { type: 'complement', word: 'after A B C' },
        ],
        translations: { tr: 'D E F, A B C\'den sonra gelir', es: 'D E F vienen después de A B C', ar: 'D E F تأتي بعد A B C', zh: 'D E F 在 A B C 之后', pt: 'D E F vêm depois de A B C' },
      },
      {
        parts: [
          { type: 'subject', word: 'G H I' },
          { type: 'verb', word: 'are' },
          { type: 'complement', word: 'the next three letters' },
        ],
        translations: { tr: 'G H I sonraki üç harftir', es: 'G H I son las siguientes tres letras', ar: 'G H I هي الحروف الثلاثة التالية', zh: 'G H I 是接下来的三个字母', pt: 'G H I são as próximas três letras' },
      },
      {
        parts: [
          { type: 'subject', word: 'J K L M' },
          { type: 'verb', word: 'are' },
          { type: 'complement', word: 'in the middle' },
        ],
        translations: { tr: 'J K L M ortadadır', es: 'J K L M están en el medio', ar: 'J K L M في المنتصف', zh: 'J K L M 在中间', pt: 'J K L M estão no meio' },
      },
      {
        parts: [
          { type: 'subject', word: 'N O P Q' },
          { type: 'verb', word: 'come' },
          { type: 'complement', word: 'after M' },
        ],
        translations: { tr: 'N O P Q, M\'den sonra gelir', es: 'N O P Q vienen después de M', ar: 'N O P Q تأتي بعد M', zh: 'N O P Q 在 M 之后', pt: 'N O P Q vêm depois de M' },
      },
      {
        parts: [
          { type: 'subject', word: 'R S T U' },
          { type: 'verb', word: 'are' },
          { type: 'complement', word: 'common letters' },
        ],
        translations: { tr: 'R S T U yaygın harflerdir', es: 'R S T U son letras comunes', ar: 'R S T U هي حروف شائعة', zh: 'R S T U 是常见的字母', pt: 'R S T U são letras comuns' },
      },
      {
        parts: [
          { type: 'subject', word: 'V W X' },
          { type: 'verb', word: 'are' },
          { type: 'complement', word: 'near the end' },
        ],
        translations: { tr: 'V W X sona yakındır', es: 'V W X están cerca del final', ar: 'V W X قريبة من النهاية', zh: 'V W X 接近末尾', pt: 'V W X estão perto do fim' },
      },
      {
        parts: [
          { type: 'subject', word: 'Y Z' },
          { type: 'verb', word: 'are' },
          { type: 'complement', word: 'the last letters' },
        ],
        translations: { tr: 'Y Z son harflerdir', es: 'Y Z son las últimas letras', ar: 'Y Z هما الحرفان الأخيران', zh: 'Y Z 是最后的字母', pt: 'Y Z são as últimas letras' },
      },
    ],
  },
  {
    id: 'pronouns',
    level: 0,
    title: 'Personal Pronouns',
    description: 'Learn the words for people: I, you, he, she, it, we, they.',
    pattern: ['pronoun', 'verb', 'complement'],
    examples: [
      {
        parts: [
          { type: 'pronoun', word: 'I' },
          { type: 'verb', word: 'am' },
          { type: 'complement', word: 'a student' },
        ],
        translations: { tr: 'Ben bir öğrenciyim', es: 'Yo soy un estudiante', ar: 'أنا طالب', zh: '我是一个学生', pt: 'Eu sou um estudante' },
      },
      {
        parts: [
          { type: 'pronoun', word: 'You' },
          { type: 'verb', word: 'are' },
          { type: 'complement', word: 'my friend' },
        ],
        translations: { tr: 'Sen benim arkadaşımsın', es: 'Tú eres mi amigo', ar: 'أنت صديقي', zh: '你是我的朋友', pt: 'Você é meu amigo' },
      },
      {
        parts: [
          { type: 'pronoun', word: 'He' },
          { type: 'verb', word: 'is' },
          { type: 'complement', word: 'tall' },
        ],
        translations: { tr: 'O uzun', es: 'Él es alto', ar: 'هو طويل', zh: '他很高', pt: 'Ele é alto' },
      },
      {
        parts: [
          { type: 'pronoun', word: 'She' },
          { type: 'verb', word: 'is' },
          { type: 'complement', word: 'a teacher' },
        ],
        translations: { tr: 'O bir öğretmen', es: 'Ella es una profesora', ar: 'هي معلمة', zh: '她是一位老师', pt: 'Ela é uma professora' },
      },
      {
        parts: [
          { type: 'pronoun', word: 'It' },
          { type: 'verb', word: 'is' },
          { type: 'complement', word: 'a cat' },
        ],
        translations: { tr: 'O bir kedi', es: 'Es un gato', ar: 'إنها قطة', zh: '它是一只猫', pt: 'É um gato' },
      },
      {
        parts: [
          { type: 'pronoun', word: 'We' },
          { type: 'verb', word: 'are' },
          { type: 'complement', word: 'happy' },
        ],
        translations: { tr: 'Biz mutluyuz', es: 'Nosotros estamos felices', ar: 'نحن سعداء', zh: '我们很开心', pt: 'Nós estamos felizes' },
      },
      {
        parts: [
          { type: 'pronoun', word: 'They' },
          { type: 'verb', word: 'are' },
          { type: 'complement', word: 'students' },
        ],
        translations: { tr: 'Onlar öğrenci', es: 'Ellos son estudiantes', ar: 'هم طلاب', zh: '他们是学生', pt: 'Eles são estudantes' },
      },
      {
        parts: [
          { type: 'pronoun', word: 'You' },
          { type: 'verb', word: 'are' },
          { type: 'complement', word: 'welcome' },
        ],
        translations: { tr: 'Rica ederim', es: 'De nada', ar: 'على الرحب والسعة', zh: '不客气', pt: 'De nada' },
      },
    ],
  },
  // ===== LEVEL 1 =====
  {
    id: 'to-be',
    level: 1,
    title: 'To Be (am/is/are)',
    description: 'The most important verb in English: am, is, are.',
    pattern: ['subject', 'auxiliary', 'complement'],
    examples: [
      {
        parts: [
          { type: 'subject', word: 'I' },
          { type: 'auxiliary', word: 'am' },
          { type: 'complement', word: 'happy' },
        ],
        translations: { tr: 'Ben mutluyum', es: 'Yo estoy feliz', ar: 'أنا سعيد', zh: '我很开心', pt: 'Eu estou feliz' },
      },
      {
        parts: [
          { type: 'subject', word: 'You' },
          { type: 'auxiliary', word: 'are' },
          { type: 'complement', word: 'smart' },
        ],
        translations: { tr: 'Sen akıllısın', es: 'Tú eres inteligente', ar: 'أنت ذكي', zh: '你很聪明', pt: 'Você é inteligente' },
      },
      {
        parts: [
          { type: 'subject', word: 'He' },
          { type: 'auxiliary', word: 'is' },
          { type: 'complement', word: 'a doctor' },
        ],
        translations: { tr: 'O bir doktor', es: 'Él es un doctor', ar: 'هو طبيب', zh: '他是一位医生', pt: 'Ele é um médico' },
      },
      {
        parts: [
          { type: 'subject', word: 'She' },
          { type: 'auxiliary', word: 'is' },
          { type: 'complement', word: 'beautiful' },
        ],
        translations: { tr: 'O güzel', es: 'Ella es hermosa', ar: 'هي جميلة', zh: '她很漂亮', pt: 'Ela é bonita' },
      },
      {
        parts: [
          { type: 'subject', word: 'It' },
          { type: 'auxiliary', word: 'is' },
          { type: 'complement', word: 'cold today' },
        ],
        translations: { tr: 'Bugün soğuk', es: 'Hoy hace frío', ar: 'الجو بارد اليوم', zh: '今天很冷', pt: 'Está frio hoje' },
      },
      {
        parts: [
          { type: 'subject', word: 'We' },
          { type: 'auxiliary', word: 'are' },
          { type: 'complement', word: 'friends' },
        ],
        translations: { tr: 'Biz arkadaşız', es: 'Nosotros somos amigos', ar: 'نحن أصدقاء', zh: '我们是朋友', pt: 'Nós somos amigos' },
      },
      {
        parts: [
          { type: 'subject', word: 'They' },
          { type: 'auxiliary', word: 'are' },
          { type: 'complement', word: 'tired' },
        ],
        translations: { tr: 'Onlar yorgun', es: 'Ellos están cansados', ar: 'هم متعبون', zh: '他们很累', pt: 'Eles estão cansados' },
      },
      {
        parts: [
          { type: 'subject', word: 'The book' },
          { type: 'auxiliary', word: 'is' },
          { type: 'complement', word: 'interesting' },
        ],
        translations: { tr: 'Kitap ilginç', es: 'El libro es interesante', ar: 'الكتاب مثير للاهتمام', zh: '这本书很有趣', pt: 'O livro é interessante' },
      },
    ],
  },
  {
    id: 'articles',
    level: 1,
    title: 'Articles (a, an, the)',
    description: 'Learn when to use a, an, and the before nouns.',
    pattern: ['subject', 'verb', 'article', 'object'],
    examples: [
      {
        parts: [
          { type: 'subject', word: 'I' },
          { type: 'verb', word: 'see' },
          { type: 'article', word: 'a' },
          { type: 'object', word: 'dog' },
        ],
        translations: { tr: 'Bir köpek görüyorum', es: 'Yo veo un perro', ar: 'أنا أرى كلباً', zh: '我看见一只狗', pt: 'Eu vejo um cachorro' },
      },
      {
        parts: [
          { type: 'subject', word: 'She' },
          { type: 'verb', word: 'has' },
          { type: 'article', word: 'an' },
          { type: 'object', word: 'apple' },
        ],
        translations: { tr: 'Onun bir elması var', es: 'Ella tiene una manzana', ar: 'لديها تفاحة', zh: '她有一个苹果', pt: 'Ela tem uma maçã' },
      },
      {
        parts: [
          { type: 'article', word: 'The' },
          { type: 'subject', word: 'cat' },
          { type: 'verb', word: 'is' },
          { type: 'complement', word: 'sleeping' },
        ],
        translations: { tr: 'Kedi uyuyor', es: 'El gato está durmiendo', ar: 'القطة نائمة', zh: '那只猫在睡觉', pt: 'O gato está dormindo' },
      },
      {
        parts: [
          { type: 'subject', word: 'He' },
          { type: 'verb', word: 'reads' },
          { type: 'article', word: 'a' },
          { type: 'object', word: 'book' },
        ],
        translations: { tr: 'O bir kitap okur', es: 'Él lee un libro', ar: 'هو يقرأ كتاباً', zh: '他读一本书', pt: 'Ele lê um livro' },
      },
      {
        parts: [
          { type: 'subject', word: 'I' },
          { type: 'verb', word: 'eat' },
          { type: 'article', word: 'an' },
          { type: 'object', word: 'orange' },
        ],
        translations: { tr: 'Bir portakal yerim', es: 'Yo como una naranja', ar: 'أنا آكل برتقالة', zh: '我吃一个橙子', pt: 'Eu como uma laranja' },
      },
      {
        parts: [
          { type: 'article', word: 'The' },
          { type: 'subject', word: 'sun' },
          { type: 'verb', word: 'is' },
          { type: 'complement', word: 'bright' },
        ],
        translations: { tr: 'Güneş parlak', es: 'El sol es brillante', ar: 'الشمس ساطعة', zh: '太阳很明亮', pt: 'O sol é brilhante' },
      },
      {
        parts: [
          { type: 'subject', word: 'She' },
          { type: 'verb', word: 'needs' },
          { type: 'article', word: 'a' },
          { type: 'object', word: 'pen' },
        ],
        translations: { tr: 'Onun bir kaleme ihtiyacı var', es: 'Ella necesita un bolígrafo', ar: 'هي تحتاج قلماً', zh: '她需要一支笔', pt: 'Ela precisa de uma caneta' },
      },
      {
        parts: [
          { type: 'article', word: 'The' },
          { type: 'subject', word: 'children' },
          { type: 'verb', word: 'play' },
          { type: 'complement', word: 'outside' },
        ],
        translations: { tr: 'Çocuklar dışarıda oynar', es: 'Los niños juegan afuera', ar: 'الأطفال يلعبون في الخارج', zh: '孩子们在外面玩', pt: 'As crianças brincam lá fora' },
      },
    ],
  },
  {
    id: 'sv',
    level: 1,
    title: 'Subject + Verb',
    description: 'The simplest English sentence: someone does something.',
    pattern: ['subject', 'verb'],
    examples: [
      {
        parts: [
          { type: 'subject', word: 'I' },
          { type: 'verb', word: 'run' },
        ],
        translations: { tr: 'Koşarım', es: 'Yo corro', ar: 'أنا أركض', zh: '我跑步', pt: 'Eu corro' },
      },
      {
        parts: [
          { type: 'subject', word: 'She' },
          { type: 'verb', word: 'sleeps' },
        ],
        translations: { tr: 'O uyur', es: 'Ella duerme', ar: 'هي تنام', zh: '她睡觉', pt: 'Ela dorme' },
      },
      {
        parts: [
          { type: 'subject', word: 'Birds' },
          { type: 'verb', word: 'fly' },
        ],
        translations: { tr: 'Kuşlar uçar', es: 'Los pájaros vuelan', ar: 'الطيور تطير', zh: '鸟飞', pt: 'Pássaros voam' },
      },
      {
        parts: [
          { type: 'subject', word: 'He' },
          { type: 'verb', word: 'reads' },
        ],
        translations: { tr: 'O okur', es: 'Él lee', ar: 'هو يقرأ', zh: '他阅读', pt: 'Ele lê' },
      },
      {
        parts: [
          { type: 'subject', word: 'We' },
          { type: 'verb', word: 'play' },
        ],
        translations: { tr: 'Biz oynarız', es: 'Nosotros jugamos', ar: 'نحن نلعب', zh: '我们玩', pt: 'Nós jogamos' },
      },
      {
        parts: [
          { type: 'subject', word: 'They' },
          { type: 'verb', word: 'swim' },
        ],
        translations: { tr: 'Onlar yüzer', es: 'Ellos nadan', ar: 'هم يسبحون', zh: '他们游泳', pt: 'Eles nadam' },
      },
    ],
  },
  {
    id: 'svo',
    level: 1,
    title: 'Subject + Verb + Object',
    description: 'Someone does something to something else.',
    pattern: ['subject', 'verb', 'object'],
    examples: [
      {
        parts: [
          { type: 'subject', word: 'I' },
          { type: 'verb', word: 'eat' },
          { type: 'object', word: 'apples' },
        ],
        translations: { tr: 'Elma yerim', es: 'Yo como manzanas', ar: 'أنا آكل التفاح', zh: '我吃苹果', pt: 'Eu como maçãs' },
      },
      {
        parts: [
          { type: 'subject', word: 'She' },
          { type: 'verb', word: 'reads' },
          { type: 'object', word: 'books' },
        ],
        translations: { tr: 'O kitap okur', es: 'Ella lee libros', ar: 'هي تقرأ الكتب', zh: '她读书', pt: 'Ela lê livros' },
      },
      {
        parts: [
          { type: 'subject', word: 'They' },
          { type: 'verb', word: 'play' },
          { type: 'object', word: 'football' },
        ],
        translations: { tr: 'Onlar futbol oynar', es: 'Ellos juegan fútbol', ar: 'هم يلعبون كرة القدم', zh: '他们踢足球', pt: 'Eles jogam futebol' },
      },
      {
        parts: [
          { type: 'subject', word: 'He' },
          { type: 'verb', word: 'writes' },
          { type: 'object', word: 'letters' },
        ],
        translations: { tr: 'O mektup yazar', es: 'Él escribe cartas', ar: 'هو يكتب رسائل', zh: '他写信', pt: 'Ele escreve cartas' },
      },
      {
        parts: [
          { type: 'subject', word: 'We' },
          { type: 'verb', word: 'cook' },
          { type: 'object', word: 'dinner' },
        ],
        translations: { tr: 'Biz akşam yemeği pişiririz', es: 'Nosotros cocinamos la cena', ar: 'نحن نطبخ العشاء', zh: '我们做晚饭', pt: 'Nós cozinhamos o jantar' },
      },
      {
        parts: [
          { type: 'subject', word: 'The dog' },
          { type: 'verb', word: 'eats' },
          { type: 'object', word: 'food' },
        ],
        translations: { tr: 'Köpek yemek yer', es: 'El perro come comida', ar: 'الكلب يأكل الطعام', zh: '狗吃食物', pt: 'O cachorro come comida' },
      },
    ],
  },
  {
    id: 'svc',
    level: 1,
    title: 'Subject + Verb + Complement',
    description: 'Describe what someone or something is using a complement.',
    pattern: ['subject', 'verb', 'complement'],
    examples: [
      {
        parts: [
          { type: 'subject', word: 'I' },
          { type: 'verb', word: 'am' },
          { type: 'complement', word: 'a student' },
        ],
        translations: { tr: 'Ben bir öğrenciyim', es: 'Yo soy un estudiante', ar: 'أنا طالب', zh: '我是一个学生', pt: 'Eu sou um estudante' },
      },
      {
        parts: [
          { type: 'subject', word: 'She' },
          { type: 'verb', word: 'is' },
          { type: 'complement', word: 'beautiful' },
        ],
        translations: { tr: 'O güzel', es: 'Ella es hermosa', ar: 'هي جميلة', zh: '她很漂亮', pt: 'Ela é bonita' },
      },
      {
        parts: [
          { type: 'subject', word: 'They' },
          { type: 'verb', word: 'are' },
          { type: 'complement', word: 'teachers' },
        ],
        translations: { tr: 'Onlar öğretmen', es: 'Ellos son profesores', ar: 'هم معلمون', zh: '他们是老师', pt: 'Eles são professores' },
      },
      {
        parts: [
          { type: 'subject', word: 'He' },
          { type: 'verb', word: 'is' },
          { type: 'complement', word: 'a doctor' },
        ],
        translations: { tr: 'O bir doktor', es: 'Él es un doctor', ar: 'هو طبيب', zh: '他是一位医生', pt: 'Ele é um médico' },
      },
      {
        parts: [
          { type: 'subject', word: 'The weather' },
          { type: 'verb', word: 'is' },
          { type: 'complement', word: 'nice' },
        ],
        translations: { tr: 'Hava güzel', es: 'El clima es agradable', ar: 'الطقس جميل', zh: '天气很好', pt: 'O tempo está bom' },
      },
      {
        parts: [
          { type: 'subject', word: 'We' },
          { type: 'verb', word: 'are' },
          { type: 'complement', word: 'friends' },
        ],
        translations: { tr: 'Biz arkadaşız', es: 'Nosotros somos amigos', ar: 'نحن أصدقاء', zh: '我们是朋友', pt: 'Nós somos amigos' },
      },
    ],
  },
  {
    id: 'there-is',
    level: 1,
    title: 'There is / There are',
    description: 'Talk about the existence or presence of something.',
    pattern: ['subject', 'verb', 'complement', 'preposition'],
    examples: [
      {
        parts: [
          { type: 'subject', word: 'There' },
          { type: 'verb', word: 'is' },
          { type: 'complement', word: 'a book' },
          { type: 'preposition', word: 'on the table' },
        ],
        translations: { tr: 'Masanın üstünde bir kitap var', es: 'Hay un libro en la mesa', ar: 'هناك كتاب على الطاولة', zh: '桌子上有一本书', pt: 'Há um livro na mesa' },
      },
      {
        parts: [
          { type: 'subject', word: 'There' },
          { type: 'verb', word: 'are' },
          { type: 'complement', word: 'cats' },
          { type: 'preposition', word: 'in the garden' },
        ],
        translations: { tr: 'Bahçede kediler var', es: 'Hay gatos en el jardín', ar: 'هناك قطط في الحديقة', zh: '花园里有猫', pt: 'Há gatos no jardim' },
      },
      {
        parts: [
          { type: 'subject', word: 'There' },
          { type: 'verb', word: 'is' },
          { type: 'complement', word: 'water' },
          { type: 'preposition', word: 'in the glass' },
        ],
        translations: { tr: 'Bardakta su var', es: 'Hay agua en el vaso', ar: 'هناك ماء في الكأس', zh: '杯子里有水', pt: 'Há água no copo' },
      },
      {
        parts: [
          { type: 'subject', word: 'There' },
          { type: 'verb', word: 'is' },
          { type: 'complement', word: 'a park' },
          { type: 'preposition', word: 'nearby' },
        ],
        translations: { tr: 'Yakında bir park var', es: 'Hay un parque cerca', ar: 'هناك حديقة قريبة', zh: '附近有一个公园', pt: 'Há um parque perto' },
      },
      {
        parts: [
          { type: 'subject', word: 'There' },
          { type: 'verb', word: 'are' },
          { type: 'complement', word: 'students' },
          { type: 'preposition', word: 'in class' },
        ],
        translations: { tr: 'Sınıfta öğrenciler var', es: 'Hay estudiantes en la clase', ar: 'هناك طلاب في الصف', zh: '教室里有学生', pt: 'Há estudantes na aula' },
      },
      {
        parts: [
          { type: 'subject', word: 'There' },
          { type: 'verb', word: 'is' },
          { type: 'complement', word: 'a bird' },
          { type: 'preposition', word: 'on the tree' },
        ],
        translations: { tr: 'Ağaçta bir kuş var', es: 'Hay un pájaro en el árbol', ar: 'هناك طائر على الشجرة', zh: '树上有一只鸟', pt: 'Há um pássaro na árvore' },
      },
    ],
  },
  // ===== LEVEL 2 =====
  {
    id: 'sva',
    level: 2,
    title: 'Subject + Verb + Adjective',
    description: 'Describe what someone or something is like.',
    pattern: ['subject', 'verb', 'adjective'],
    examples: [
      {
        parts: [
          { type: 'subject', word: 'The cake' },
          { type: 'verb', word: 'is' },
          { type: 'adjective', word: 'delicious' },
        ],
        translations: { tr: 'Pasta lezzetli', es: 'El pastel es delicioso', ar: 'الكعكة لذيذة', zh: '蛋糕很好吃', pt: 'O bolo é delicioso' },
      },
      {
        parts: [
          { type: 'subject', word: 'He' },
          { type: 'verb', word: 'looks' },
          { type: 'adjective', word: 'happy' },
        ],
        translations: { tr: 'O mutlu görünüyor', es: 'Él se ve feliz', ar: 'هو يبدو سعيداً', zh: '他看起来很高兴', pt: 'Ele parece feliz' },
      },
      {
        parts: [
          { type: 'subject', word: 'She' },
          { type: 'verb', word: 'feels' },
          { type: 'adjective', word: 'tired' },
        ],
        translations: { tr: 'O yorgun hissediyor', es: 'Ella se siente cansada', ar: 'هي تشعر بالتعب', zh: '她感到累了', pt: 'Ela se sente cansada' },
      },
      {
        parts: [
          { type: 'subject', word: 'The weather' },
          { type: 'verb', word: 'looks' },
          { type: 'adjective', word: 'nice' },
        ],
        translations: { tr: 'Hava güzel görünüyor', es: 'El clima se ve agradable', ar: 'الطقس يبدو جميلاً', zh: '天气看起来不错', pt: 'O tempo parece bom' },
      },
      {
        parts: [
          { type: 'subject', word: 'They' },
          { type: 'verb', word: 'seem' },
          { type: 'adjective', word: 'happy' },
        ],
        translations: { tr: 'Onlar mutlu görünüyor', es: 'Ellos parecen felices', ar: 'هم يبدون سعداء', zh: '他们看起来很高兴', pt: 'Eles parecem felizes' },
      },
      {
        parts: [
          { type: 'subject', word: 'The music' },
          { type: 'verb', word: 'sounds' },
          { type: 'adjective', word: 'beautiful' },
        ],
        translations: { tr: 'Müzik güzel duyuluyor', es: 'La música suena hermosa', ar: 'الموسيقى تبدو جميلة', zh: '音乐听起来很美', pt: 'A música soa bonita' },
      },
    ],
  },
  {
    id: 'savo',
    level: 2,
    title: 'Subject + Adjective + Verb + Object',
    description: 'Add description to your sentences.',
    pattern: ['subject', 'adverb', 'verb', 'object'],
    examples: [
      {
        parts: [
          { type: 'subject', word: 'She' },
          { type: 'adverb', word: 'quickly' },
          { type: 'verb', word: 'eats' },
          { type: 'object', word: 'lunch' },
        ],
        translations: { tr: 'O hızla öğle yemeği yer', es: 'Ella come rápidamente el almuerzo', ar: 'هي تأكل الغداء بسرعة', zh: '她快速吃午餐', pt: 'Ela come o almoço rapidamente' },
      },
      {
        parts: [
          { type: 'subject', word: 'He' },
          { type: 'adverb', word: 'quickly' },
          { type: 'verb', word: 'reads' },
          { type: 'object', word: 'the book' },
        ],
        translations: { tr: 'O hızla kitabı okur', es: 'Él lee rápidamente el libro', ar: 'هو يقرأ الكتاب بسرعة', zh: '他快速读书', pt: 'Ele lê o livro rapidamente' },
      },
      {
        parts: [
          { type: 'subject', word: 'They' },
          { type: 'adverb', word: 'always' },
          { type: 'verb', word: 'play' },
          { type: 'object', word: 'music' },
        ],
        translations: { tr: 'Onlar her zaman müzik çalar', es: 'Ellos siempre tocan música', ar: 'هم دائماً يعزفون الموسيقى', zh: '他们总是播放音乐', pt: 'Eles sempre tocam música' },
      },
      {
        parts: [
          { type: 'subject', word: 'We' },
          { type: 'adverb', word: 'carefully' },
          { type: 'verb', word: 'write' },
          { type: 'object', word: 'letters' },
        ],
        translations: { tr: 'Biz dikkatli mektup yazarız', es: 'Nosotros escribimos cartas cuidadosamente', ar: 'نحن نكتب الرسائل بعناية', zh: '我们仔细写信', pt: 'Nós escrevemos cartas cuidadosamente' },
      },
      {
        parts: [
          { type: 'subject', word: 'I' },
          { type: 'adverb', word: 'slowly' },
          { type: 'verb', word: 'eat' },
          { type: 'object', word: 'dinner' },
        ],
        translations: { tr: 'Ben yavaşça akşam yemeği yerim', es: 'Yo como la cena lentamente', ar: 'أنا آكل العشاء ببطء', zh: '我慢慢吃晚饭', pt: 'Eu como o jantar devagar' },
      },
    ],
  },
  {
    id: 'negative-svo',
    level: 2,
    title: 'Negative Sentences',
    description: 'Say what someone does not do using do not / does not.',
    pattern: ['subject', 'auxiliary', 'negative', 'verb', 'object'],
    examples: [
      {
        parts: [
          { type: 'subject', word: 'I' },
          { type: 'auxiliary', word: 'do' },
          { type: 'negative', word: 'not' },
          { type: 'verb', word: 'like' },
          { type: 'object', word: 'spiders' },
        ],
        translations: { tr: 'Örümcekleri sevmem', es: 'No me gustan las arañas', ar: 'أنا لا أحب العناكب', zh: '我不喜欢蜘蛛', pt: 'Eu não gosto de aranhas' },
      },
      {
        parts: [
          { type: 'subject', word: 'She' },
          { type: 'auxiliary', word: 'does' },
          { type: 'negative', word: 'not' },
          { type: 'verb', word: 'eat' },
          { type: 'object', word: 'meat' },
        ],
        translations: { tr: 'O et yemez', es: 'Ella no come carne', ar: 'هي لا تأكل اللحم', zh: '她不吃肉', pt: 'Ela não come carne' },
      },
      {
        parts: [
          { type: 'subject', word: 'They' },
          { type: 'auxiliary', word: 'do' },
          { type: 'negative', word: 'not' },
          { type: 'verb', word: 'play' },
          { type: 'object', word: 'tennis' },
        ],
        translations: { tr: 'Onlar tenis oynamaz', es: 'Ellos no juegan tenis', ar: 'هم لا يلعبون التنس', zh: '他们不打网球', pt: 'Eles não jogam tênis' },
      },
      {
        parts: [
          { type: 'subject', word: 'He' },
          { type: 'auxiliary', word: 'does' },
          { type: 'negative', word: 'not' },
          { type: 'verb', word: 'drink' },
          { type: 'object', word: 'coffee' },
        ],
        translations: { tr: 'O kahve içmez', es: 'Él no bebe café', ar: 'هو لا يشرب القهوة', zh: '他不喝咖啡', pt: 'Ele não bebe café' },
      },
      {
        parts: [
          { type: 'subject', word: 'We' },
          { type: 'auxiliary', word: 'do' },
          { type: 'negative', word: 'not' },
          { type: 'verb', word: 'watch' },
          { type: 'object', word: 'TV' },
        ],
        translations: { tr: 'Biz televizyon izlemeyiz', es: 'Nosotros no vemos televisión', ar: 'نحن لا نشاهد التلفاز', zh: '我们不看电视', pt: 'Nós não assistimos TV' },
      },
      {
        parts: [
          { type: 'subject', word: 'I' },
          { type: 'auxiliary', word: 'do' },
          { type: 'negative', word: 'not' },
          { type: 'verb', word: 'speak' },
          { type: 'object', word: 'French' },
        ],
        translations: { tr: 'Ben Fransızca konuşmam', es: 'Yo no hablo francés', ar: 'أنا لا أتحدث الفرنسية', zh: '我不说法语', pt: 'Eu não falo francês' },
      },
    ],
  },
  {
    id: 'question-svo',
    level: 2,
    title: 'Questions (Do/Does)',
    description: 'Ask yes/no questions using do or does.',
    pattern: ['auxiliary', 'subject', 'verb', 'object'],
    examples: [
      {
        parts: [
          { type: 'auxiliary', word: 'Do' },
          { type: 'subject', word: 'you' },
          { type: 'verb', word: 'like' },
          { type: 'object', word: 'coffee?' },
        ],
        translations: { tr: 'Kahve sever misin?', es: '¿Te gusta el café?', ar: 'هل تحب القهوة؟', zh: '你喜欢咖啡吗？', pt: 'Você gosta de café?' },
      },
      {
        parts: [
          { type: 'auxiliary', word: 'Does' },
          { type: 'subject', word: 'she' },
          { type: 'verb', word: 'speak' },
          { type: 'object', word: 'English?' },
        ],
        translations: { tr: 'O İngilizce konuşur mu?', es: '¿Ella habla inglés?', ar: 'هل تتحدث الإنجليزية؟', zh: '她说英语吗？', pt: 'Ela fala inglês?' },
      },
      {
        parts: [
          { type: 'auxiliary', word: 'Do' },
          { type: 'subject', word: 'they' },
          { type: 'verb', word: 'play' },
          { type: 'object', word: 'football?' },
        ],
        translations: { tr: 'Onlar futbol oynar mı?', es: '¿Ellos juegan fútbol?', ar: 'هل يلعبون كرة القدم؟', zh: '他们踢足球吗？', pt: 'Eles jogam futebol?' },
      },
      {
        parts: [
          { type: 'auxiliary', word: 'Do' },
          { type: 'subject', word: 'you' },
          { type: 'verb', word: 'have' },
          { type: 'object', word: 'a car?' },
        ],
        translations: { tr: 'Bir araban var mı?', es: '¿Tienes un coche?', ar: 'هل لديك سيارة؟', zh: '你有车吗？', pt: 'Você tem um carro?' },
      },
      {
        parts: [
          { type: 'auxiliary', word: 'Does' },
          { type: 'subject', word: 'he' },
          { type: 'verb', word: 'work' },
          { type: 'object', word: 'here?' },
        ],
        translations: { tr: 'O burada çalışır mı?', es: '¿Él trabaja aquí?', ar: 'هل يعمل هنا؟', zh: '他在这里工作吗？', pt: 'Ele trabalha aqui?' },
      },
      {
        parts: [
          { type: 'auxiliary', word: 'Do' },
          { type: 'subject', word: 'we' },
          { type: 'verb', word: 'need' },
          { type: 'object', word: 'more time?' },
        ],
        translations: { tr: 'Daha fazla zamana ihtiyacımız var mı?', es: '¿Necesitamos más tiempo?', ar: 'هل نحتاج المزيد من الوقت؟', zh: '我们需要更多时间吗？', pt: 'Precisamos de mais tempo?' },
      },
    ],
  },
  {
    id: 'past-sv',
    level: 2,
    title: 'Past Tense',
    description: 'Talk about things that already happened.',
    pattern: ['subject', 'verb', 'object'],
    examples: [
      {
        parts: [
          { type: 'subject', word: 'She' },
          { type: 'verb', word: 'walked' },
          { type: 'preposition', word: 'to school' },
        ],
        translations: { tr: 'O okula yürüdü', es: 'Ella caminó a la escuela', ar: 'هي مشت إلى المدرسة', zh: '她走路去了学校', pt: 'Ela caminhou para a escola' },
      },
      {
        parts: [
          { type: 'subject', word: 'I' },
          { type: 'verb', word: 'cooked' },
          { type: 'object', word: 'dinner' },
        ],
        translations: { tr: 'Akşam yemeği pişirdim', es: 'Yo cociné la cena', ar: 'أنا طبخت العشاء', zh: '我做了晚饭', pt: 'Eu cozinhei o jantar' },
      },
      {
        parts: [
          { type: 'subject', word: 'They' },
          { type: 'verb', word: 'played' },
          { type: 'object', word: 'music' },
        ],
        translations: { tr: 'Onlar müzik çaldı', es: 'Ellos tocaron música', ar: 'هم عزفوا الموسيقى', zh: '他们演奏了音乐', pt: 'Eles tocaram música' },
      },
      {
        parts: [
          { type: 'subject', word: 'He' },
          { type: 'verb', word: 'studied' },
          { type: 'complement', word: 'all night' },
        ],
        translations: { tr: 'O bütün gece çalıştı', es: 'Él estudió toda la noche', ar: 'هو درس طوال الليل', zh: '他学习了一整夜', pt: 'Ele estudou a noite toda' },
      },
      {
        parts: [
          { type: 'subject', word: 'We' },
          { type: 'verb', word: 'visited' },
          { type: 'object', word: 'Paris' },
        ],
        translations: { tr: 'Biz Paris\'i ziyaret ettik', es: 'Nosotros visitamos París', ar: 'نحن زرنا باريس', zh: '我们参观了巴黎', pt: 'Nós visitamos Paris' },
      },
      {
        parts: [
          { type: 'subject', word: 'She' },
          { type: 'verb', word: 'wrote' },
          { type: 'object', word: 'a letter' },
        ],
        translations: { tr: 'O bir mektup yazdı', es: 'Ella escribió una carta', ar: 'هي كتبت رسالة', zh: '她写了一封信', pt: 'Ela escreveu uma carta' },
      },
    ],
  },
  // ===== LEVEL 3 =====
  {
    id: 'svop',
    level: 3,
    title: 'Subject + Verb + Object + Preposition Phrase',
    description: 'Add location or time to your sentences.',
    pattern: ['subject', 'verb', 'object', 'preposition'],
    examples: [
      {
        parts: [
          { type: 'subject', word: 'I' },
          { type: 'verb', word: 'eat' },
          { type: 'object', word: 'breakfast' },
          { type: 'preposition', word: 'in the morning' },
        ],
        translations: { tr: 'Sabahları kahvaltı yerim', es: 'Yo desayuno por la mañana', ar: 'أنا أتناول الفطور في الصباح', zh: '我早上吃早餐', pt: 'Eu tomo café da manhã de manhã' },
      },
      {
        parts: [
          { type: 'subject', word: 'They' },
          { type: 'verb', word: 'study' },
          { type: 'object', word: 'English' },
          { type: 'preposition', word: 'at school' },
        ],
        translations: { tr: 'Onlar okulda İngilizce çalışır', es: 'Ellos estudian inglés en la escuela', ar: 'هم يدرسون الإنجليزية في المدرسة', zh: '他们在学校学英语', pt: 'Eles estudam inglês na escola' },
      },
      {
        parts: [
          { type: 'subject', word: 'She' },
          { type: 'verb', word: 'reads' },
          { type: 'object', word: 'books' },
          { type: 'preposition', word: 'in the library' },
        ],
        translations: { tr: 'O kütüphanede kitap okur', es: 'Ella lee libros en la biblioteca', ar: 'هي تقرأ الكتب في المكتبة', zh: '她在图书馆看书', pt: 'Ela lê livros na biblioteca' },
      },
      {
        parts: [
          { type: 'subject', word: 'He' },
          { type: 'verb', word: 'plays' },
          { type: 'object', word: 'football' },
          { type: 'preposition', word: 'in the park' },
        ],
        translations: { tr: 'O parkta futbol oynar', es: 'Él juega fútbol en el parque', ar: 'هو يلعب كرة القدم في الحديقة', zh: '他在公园踢足球', pt: 'Ele joga futebol no parque' },
      },
      {
        parts: [
          { type: 'subject', word: 'We' },
          { type: 'verb', word: 'eat' },
          { type: 'object', word: 'lunch' },
          { type: 'preposition', word: 'at noon' },
        ],
        translations: { tr: 'Biz öğlen yemek yeriz', es: 'Nosotros almorzamos al mediodía', ar: 'نحن نأكل الغداء عند الظهر', zh: '我们中午吃午饭', pt: 'Nós almoçamos ao meio-dia' },
      },
    ],
  },
  {
    id: 'future-svo',
    level: 3,
    title: 'Future Tense (Will)',
    description: 'Talk about things that will happen in the future.',
    pattern: ['subject', 'auxiliary', 'verb', 'object'],
    examples: [
      {
        parts: [
          { type: 'subject', word: 'I' },
          { type: 'auxiliary', word: 'will' },
          { type: 'verb', word: 'buy' },
          { type: 'object', word: 'a car' },
        ],
        translations: { tr: 'Bir araba satın alacağım', es: 'Yo compraré un coche', ar: 'سأشتري سيارة', zh: '我会买一辆车', pt: 'Eu vou comprar um carro' },
      },
      {
        parts: [
          { type: 'subject', word: 'She' },
          { type: 'auxiliary', word: 'will' },
          { type: 'verb', word: 'travel' },
          { type: 'adverb', word: 'tomorrow' },
        ],
        translations: { tr: 'O yarın seyahat edecek', es: 'Ella viajará mañana', ar: 'هي ستسافر غداً', zh: '她明天会旅行', pt: 'Ela vai viajar amanhã' },
      },
      {
        parts: [
          { type: 'subject', word: 'They' },
          { type: 'auxiliary', word: 'will' },
          { type: 'verb', word: 'study' },
          { type: 'object', word: 'English' },
        ],
        translations: { tr: 'Onlar İngilizce çalışacak', es: 'Ellos estudiarán inglés', ar: 'هم سيدرسون الإنجليزية', zh: '他们会学英语', pt: 'Eles vão estudar inglês' },
      },
      {
        parts: [
          { type: 'subject', word: 'We' },
          { type: 'auxiliary', word: 'will' },
          { type: 'verb', word: 'finish' },
          { type: 'object', word: 'the project' },
        ],
        translations: { tr: 'Biz projeyi bitireceğiz', es: 'Nosotros terminaremos el proyecto', ar: 'سننهي المشروع', zh: '我们会完成这个项目', pt: 'Nós vamos terminar o projeto' },
      },
      {
        parts: [
          { type: 'subject', word: 'He' },
          { type: 'auxiliary', word: 'will' },
          { type: 'verb', word: 'call' },
          { type: 'object', word: 'you later' },
        ],
        translations: { tr: 'O seni sonra arayacak', es: 'Él te llamará más tarde', ar: 'هو سيتصل بك لاحقاً', zh: '他稍后会给你打电话', pt: 'Ele vai te ligar depois' },
      },
      {
        parts: [
          { type: 'subject', word: 'I' },
          { type: 'auxiliary', word: 'will' },
          { type: 'verb', word: 'learn' },
          { type: 'object', word: 'English' },
        ],
        translations: { tr: 'Ben İngilizce öğreneceğim', es: 'Yo aprenderé inglés', ar: 'سأتعلم الإنجليزية', zh: '我会学英语', pt: 'Eu vou aprender inglês' },
      },
    ],
  },
  {
    id: 'modal-svo',
    level: 3,
    title: 'Modal Verbs (Can/Should/Must)',
    description: 'Express ability, advice, or obligation.',
    pattern: ['subject', 'auxiliary', 'verb', 'object'],
    examples: [
      {
        parts: [
          { type: 'subject', word: 'She' },
          { type: 'auxiliary', word: 'can' },
          { type: 'verb', word: 'speak' },
          { type: 'object', word: 'French' },
        ],
        translations: { tr: 'O Fransızca konuşabilir', es: 'Ella puede hablar francés', ar: 'هي تستطيع التحدث بالفرنسية', zh: '她会说法语', pt: 'Ela sabe falar francês' },
      },
      {
        parts: [
          { type: 'subject', word: 'You' },
          { type: 'auxiliary', word: 'should' },
          { type: 'verb', word: 'study' },
          { type: 'adverb', word: 'more' },
        ],
        translations: { tr: 'Daha çok çalışmalısın', es: 'Deberías estudiar más', ar: 'يجب أن تدرس أكثر', zh: '你应该多学习', pt: 'Você deveria estudar mais' },
      },
      {
        parts: [
          { type: 'subject', word: 'We' },
          { type: 'auxiliary', word: 'must' },
          { type: 'verb', word: 'finish' },
          { type: 'adverb', word: 'today' },
        ],
        translations: { tr: 'Bugün bitirmeliyiz', es: 'Debemos terminar hoy', ar: 'يجب أن ننتهي اليوم', zh: '我们必须今天完成', pt: 'Nós devemos terminar hoje' },
      },
      {
        parts: [
          { type: 'subject', word: 'I' },
          { type: 'auxiliary', word: 'can' },
          { type: 'verb', word: 'swim' },
        ],
        translations: { tr: 'Ben yüzebilirim', es: 'Yo puedo nadar', ar: 'أنا أستطيع السباحة', zh: '我会游泳', pt: 'Eu sei nadar' },
      },
      {
        parts: [
          { type: 'subject', word: 'They' },
          { type: 'auxiliary', word: 'should' },
          { type: 'verb', word: 'rest' },
        ],
        translations: { tr: 'Onlar dinlenmeli', es: 'Ellos deberían descansar', ar: 'يجب أن يستريحوا', zh: '他们应该休息', pt: 'Eles deveriam descansar' },
      },
      {
        parts: [
          { type: 'subject', word: 'He' },
          { type: 'auxiliary', word: 'must' },
          { type: 'verb', word: 'leave' },
          { type: 'adverb', word: 'now' },
        ],
        translations: { tr: 'O şimdi ayrılmalı', es: 'Él debe irse ahora', ar: 'يجب أن يغادر الآن', zh: '他必须现在离开', pt: 'Ele deve sair agora' },
      },
    ],
  },
  {
    id: 'comparative',
    level: 3,
    title: 'Comparatives',
    description: 'Compare two things using adjectives.',
    pattern: ['subject', 'verb', 'adjective', 'conjunction', 'object'],
    examples: [
      {
        parts: [
          { type: 'subject', word: 'This' },
          { type: 'verb', word: 'is' },
          { type: 'adjective', word: 'bigger' },
          { type: 'conjunction', word: 'than' },
          { type: 'object', word: 'that' },
        ],
        translations: { tr: 'Bu ondan daha büyük', es: 'Esto es más grande que eso', ar: 'هذا أكبر من ذلك', zh: '这个比那个大', pt: 'Isto é maior do que aquilo' },
      },
      {
        parts: [
          { type: 'subject', word: 'She' },
          { type: 'verb', word: 'runs' },
          { type: 'adjective', word: 'faster' },
          { type: 'conjunction', word: 'than' },
          { type: 'object', word: 'him' },
        ],
        translations: { tr: 'O ondan daha hızlı koşar', es: 'Ella corre más rápido que él', ar: 'هي تركض أسرع منه', zh: '她跑得比他快', pt: 'Ela corre mais rápido do que ele' },
      },
      {
        parts: [
          { type: 'subject', word: 'English' },
          { type: 'verb', word: 'is' },
          { type: 'adjective', word: 'easier' },
          { type: 'conjunction', word: 'than' },
          { type: 'object', word: 'Chinese' },
        ],
        translations: { tr: 'İngilizce Çinceden daha kolay', es: 'El inglés es más fácil que el chino', ar: 'الإنجليزية أسهل من الصينية', zh: '英语比中文容易', pt: 'Inglês é mais fácil do que chinês' },
      },
      {
        parts: [
          { type: 'subject', word: 'He' },
          { type: 'verb', word: 'is' },
          { type: 'adjective', word: 'taller' },
          { type: 'conjunction', word: 'than' },
          { type: 'object', word: 'me' },
        ],
        translations: { tr: 'O benden daha uzun', es: 'Él es más alto que yo', ar: 'هو أطول مني', zh: '他比我高', pt: 'Ele é mais alto do que eu' },
      },
      {
        parts: [
          { type: 'subject', word: 'This' },
          { type: 'verb', word: 'is' },
          { type: 'adjective', word: 'more expensive' },
          { type: 'conjunction', word: 'than' },
          { type: 'object', word: 'that' },
        ],
        translations: { tr: 'Bu ondan daha pahalı', es: 'Esto es más caro que eso', ar: 'هذا أغلى من ذلك', zh: '这个比那个贵', pt: 'Isto é mais caro do que aquilo' },
      },
      {
        parts: [
          { type: 'subject', word: 'She' },
          { type: 'verb', word: 'sings' },
          { type: 'adjective', word: 'better' },
          { type: 'conjunction', word: 'than' },
          { type: 'object', word: 'him' },
        ],
        translations: { tr: 'O ondan daha iyi şarkı söyler', es: 'Ella canta mejor que él', ar: 'هي تغني أفضل منه', zh: '她唱得比他好', pt: 'Ela canta melhor do que ele' },
      },
    ],
  },
  // ===== LEVEL 4 =====
  {
    id: 'present-perfect',
    level: 4,
    title: 'Present Perfect (Have/Has)',
    description: 'Talk about experiences or actions completed at an unspecified time.',
    pattern: ['subject', 'auxiliary', 'verb', 'object'],
    examples: [
      {
        parts: [
          { type: 'subject', word: 'I' },
          { type: 'auxiliary', word: 'have' },
          { type: 'verb', word: 'visited' },
          { type: 'object', word: 'Paris' },
        ],
        translations: { tr: 'Paris\'i ziyaret ettim', es: 'Yo he visitado París', ar: 'لقد زرت باريس', zh: '我去过巴黎', pt: 'Eu visitei Paris' },
      },
      {
        parts: [
          { type: 'subject', word: 'She' },
          { type: 'auxiliary', word: 'has' },
          { type: 'verb', word: 'learned' },
          { type: 'object', word: 'English' },
        ],
        translations: { tr: 'O İngilizce öğrendi', es: 'Ella ha aprendido inglés', ar: 'لقد تعلمت الإنجليزية', zh: '她学会了英语', pt: 'Ela aprendeu inglês' },
      },
      {
        parts: [
          { type: 'subject', word: 'They' },
          { type: 'auxiliary', word: 'have' },
          { type: 'verb', word: 'finished' },
          { type: 'object', word: 'the project' },
        ],
        translations: { tr: 'Onlar projeyi bitirdi', es: 'Ellos han terminado el proyecto', ar: 'لقد أنهوا المشروع', zh: '他们完成了这个项目', pt: 'Eles terminaram o projeto' },
      },
      {
        parts: [
          { type: 'subject', word: 'I' },
          { type: 'auxiliary', word: 'have' },
          { type: 'verb', word: 'eaten' },
          { type: 'object', word: 'lunch' },
        ],
        translations: { tr: 'Öğle yemeği yedim', es: 'Yo he almorzado', ar: 'لقد أكلت الغداء', zh: '我吃过午饭了', pt: 'Eu almocei' },
      },
      {
        parts: [
          { type: 'subject', word: 'We' },
          { type: 'auxiliary', word: 'have' },
          { type: 'verb', word: 'seen' },
          { type: 'object', word: 'this movie' },
        ],
        translations: { tr: 'Bu filmi gördük', es: 'Nosotros hemos visto esta película', ar: 'لقد شاهدنا هذا الفيلم', zh: '我们看过这部电影', pt: 'Nós vimos este filme' },
      },
      {
        parts: [
          { type: 'subject', word: 'They' },
          { type: 'auxiliary', word: 'have' },
          { type: 'verb', word: 'lived' },
          { type: 'object', word: 'here for years' },
        ],
        translations: { tr: 'Onlar yıllardır burada yaşıyor', es: 'Ellos han vivido aquí por años', ar: 'لقد عاشوا هنا لسنوات', zh: '他们在这里住了很多年', pt: 'Eles moram aqui há anos' },
      },
    ],
  },
  // ===== LEVEL 5 =====
  {
    id: 'conditional',
    level: 5,
    title: 'Conditionals (If...)',
    description: 'Express conditions and their results.',
    pattern: ['conjunction', 'subject', 'verb', 'subject', 'auxiliary', 'verb', 'object'],
    examples: [
      {
        parts: [
          { type: 'conjunction', word: 'If' },
          { type: 'subject', word: 'it' },
          { type: 'verb', word: 'rains,' },
          { type: 'subject', word: 'I' },
          { type: 'auxiliary', word: 'will' },
          { type: 'verb', word: 'stay' },
          { type: 'complement', word: 'home' },
        ],
        translations: { tr: 'Yağmur yağarsa evde kalacağım', es: 'Si llueve, me quedaré en casa', ar: 'إذا أمطرت، سأبقى في المنزل', zh: '如果下雨，我会待在家里', pt: 'Se chover, eu vou ficar em casa' },
      },
      {
        parts: [
          { type: 'conjunction', word: 'If' },
          { type: 'subject', word: 'you' },
          { type: 'verb', word: 'study,' },
          { type: 'subject', word: 'you' },
          { type: 'auxiliary', word: 'will' },
          { type: 'verb', word: 'pass' },
        ],
        translations: { tr: 'Çalışırsan geçersin', es: 'Si estudias, aprobarás', ar: 'إذا درست، ستنجح', zh: '如果你学习，你会通过', pt: 'Se você estudar, vai passar' },
      },
      {
        parts: [
          { type: 'conjunction', word: 'If' },
          { type: 'subject', word: 'she' },
          { type: 'verb', word: 'calls,' },
          { type: 'verb', word: 'tell' },
          { type: 'object', word: 'her' },
          { type: 'subject', word: 'I' },
          { type: 'verb', word: 'am' },
          { type: 'complement', word: 'busy' },
        ],
        translations: { tr: 'Eğer ararsa, meşgul olduğumu söyle', es: 'Si ella llama, dile que estoy ocupado', ar: 'إذا اتصلت، أخبرها أنني مشغول', zh: '如果她打电话，告诉她我很忙', pt: 'Se ela ligar, diga que estou ocupado' },
      },
      {
        parts: [
          { type: 'conjunction', word: 'If' },
          { type: 'subject', word: 'I' },
          { type: 'verb', word: 'have' },
          { type: 'object', word: 'time,' },
          { type: 'subject', word: 'I' },
          { type: 'auxiliary', word: 'will' },
          { type: 'verb', word: 'call' },
          { type: 'object', word: 'you' },
        ],
        translations: { tr: 'Zamanım olursa seni ararım', es: 'Si tengo tiempo, te llamaré', ar: 'إذا كان لدي وقت، سأتصل بك', zh: '如果我有时间，我会给你打电话', pt: 'Se eu tiver tempo, vou te ligar' },
      },
      {
        parts: [
          { type: 'conjunction', word: 'If' },
          { type: 'subject', word: 'they' },
          { type: 'verb', word: 'win,' },
          { type: 'subject', word: 'they' },
          { type: 'auxiliary', word: 'will' },
          { type: 'verb', word: 'celebrate' },
        ],
        translations: { tr: 'Kazanırlarsa kutlayacaklar', es: 'Si ganan, celebrarán', ar: 'إذا فازوا، سيحتفلون', zh: '如果他们赢了，他们会庆祝', pt: 'Se eles ganharem, vão comemorar' },
      },
    ],
  },
];
