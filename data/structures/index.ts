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
    ],
  },
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
    ],
  },
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
    ],
  },
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
    ],
  },
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
    ],
  },
];
