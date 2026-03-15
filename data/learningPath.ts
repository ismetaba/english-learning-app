export interface LessonNode {
  id: string;
  type: 'structure' | 'vocab' | 'scene' | 'review';
  contentId: string;
  title: string;
  icon: string;
  requiredLessonIds: string[];
}

export interface LearningUnit {
  id: string;
  title: string;
  description: string;
  color: string;
  lessons: LessonNode[];
}

export const learningPath: LearningUnit[] = [
  // UNIT 0: Welcome & Foundations
  {
    id: 'unit-0',
    title: 'Welcome & Foundations',
    description: 'Learn the building blocks before your first sentence',
    color: '#2ECC71',
    lessons: [
      { id: 'l-alphabet', type: 'structure', contentId: 'alphabet-sounds', title: 'English Alphabet & Sounds', icon: 'ABC', requiredLessonIds: [] },
      { id: 'l-greetings', type: 'vocab', contentId: 'greetings', title: 'Common Greetings', icon: '👋', requiredLessonIds: ['l-alphabet'] },
      { id: 'l-numbers', type: 'vocab', contentId: 'numbers-1-20', title: 'Numbers 1-20', icon: '🔢', requiredLessonIds: ['l-alphabet'] },
      { id: 'l-pronouns', type: 'structure', contentId: 'pronouns', title: 'Personal Pronouns', icon: '👤', requiredLessonIds: ['l-greetings'] },
      { id: 'l-pronouns-vocab', type: 'vocab', contentId: 'pronouns-vocab', title: 'Pronoun Words', icon: '💬', requiredLessonIds: ['l-pronouns'] },
    ],
  },
  // UNIT 1: My First Sentences
  {
    id: 'unit-1',
    title: 'My First Sentences',
    description: 'Say who you are and describe things',
    color: '#9B59B6',
    lessons: [
      { id: 'l-basic-adj', type: 'vocab', contentId: 'basic-adjectives', title: 'Basic Adjectives', icon: '📝', requiredLessonIds: ['l-pronouns'] },
      { id: 'l-tobe', type: 'structure', contentId: 'to-be', title: 'To Be (am/is/are)', icon: '🔤', requiredLessonIds: ['l-basic-adj'] },
      { id: 'l-svc', type: 'structure', contentId: 'svc', title: 'Subject + To Be + Adjective', icon: 'SVC', requiredLessonIds: ['l-tobe'] },
      { id: 'l-emotions', type: 'vocab', contentId: 'emotions', title: 'Emotions', icon: '😊', requiredLessonIds: ['l-svc'] },
      { id: 'l-review-1', type: 'review', contentId: 'review-1', title: 'Review Station 1', icon: '⭐', requiredLessonIds: ['l-emotions'] },
      { id: 'l-finding-nemo', type: 'scene', contentId: 'finding-nemo-trailer', title: 'Finding Nemo', icon: '🐠', requiredLessonIds: ['l-emotions'] },
    ],
  },
  // UNIT 2: Actions & Things
  {
    id: 'unit-2',
    title: 'Actions & Things',
    description: 'Learn verbs and make simple sentences',
    color: '#4A90D9',
    lessons: [
      { id: 'l-common-verbs', type: 'vocab', contentId: 'common-verbs', title: 'Common Verbs', icon: '🏃', requiredLessonIds: ['l-review-1'] },
      { id: 'l-sv', type: 'structure', contentId: 'sv', title: 'Subject + Verb', icon: 'S V', requiredLessonIds: ['l-common-verbs'] },
      { id: 'l-daily-actions', type: 'vocab', contentId: 'daily-actions', title: 'Daily Actions', icon: '☀️', requiredLessonIds: ['l-sv'] },
      { id: 'l-articles', type: 'structure', contentId: 'articles', title: 'Articles: a, an, the', icon: '📰', requiredLessonIds: ['l-sv'] },
      { id: 'l-common-nouns', type: 'vocab', contentId: 'common-nouns', title: 'Common Nouns', icon: '📦', requiredLessonIds: ['l-articles'] },
      { id: 'l-svo', type: 'structure', contentId: 'svo', title: 'Subject + Verb + Object', icon: 'SVO', requiredLessonIds: ['l-common-nouns'] },
      { id: 'l-food-basics', type: 'vocab', contentId: 'food-basics', title: 'Food Basics', icon: '🍎', requiredLessonIds: ['l-svo'] },
      { id: 'l-review-2', type: 'review', contentId: 'review-2', title: 'Review Station 2', icon: '⭐', requiredLessonIds: ['l-food-basics'] },
      { id: 'l-forrest-gump', type: 'scene', contentId: 'forrest-gump-trailer', title: 'Forrest Gump', icon: '🏃', requiredLessonIds: ['l-daily-actions'] },
      { id: 'l-ratatouille', type: 'scene', contentId: 'ratatouille-trailer', title: 'Ratatouille', icon: '🍳', requiredLessonIds: ['l-food-basics'] },
    ],
  },
  // UNIT 3: Describe the World
  {
    id: 'unit-3',
    title: 'Describe the World',
    description: 'Talk about places, things, and feelings',
    color: '#2ECC71',
    lessons: [
      { id: 'l-colors', type: 'vocab', contentId: 'colors', title: 'Colors', icon: '🎨', requiredLessonIds: ['l-review-2'] },
      { id: 'l-there-is', type: 'structure', contentId: 'there-is', title: 'There is / There are', icon: 'TH', requiredLessonIds: ['l-svo'] },
      { id: 'l-home-items', type: 'vocab', contentId: 'home-items', title: 'Home Items', icon: '🏠', requiredLessonIds: ['l-there-is'] },
      { id: 'l-sva', type: 'structure', contentId: 'sva', title: 'Subject + Verb + Adjective', icon: 'SVA', requiredLessonIds: ['l-there-is'] },
      { id: 'l-family', type: 'vocab', contentId: 'family', title: 'Family Members', icon: '👨‍👩‍👧‍👦', requiredLessonIds: ['l-sva'] },
      { id: 'l-review-3', type: 'review', contentId: 'review-3', title: 'Review Station 3', icon: '⭐', requiredLessonIds: ['l-family'] },
      { id: 'l-home-alone', type: 'scene', contentId: 'home-alone-trailer', title: 'Home Alone', icon: '🏠', requiredLessonIds: ['l-home-items'] },
    ],
  },
  // UNIT 4: Ask & Deny
  {
    id: 'unit-4',
    title: 'Ask & Deny',
    description: 'Learn to ask questions and say no',
    color: '#E67E22',
    lessons: [
      { id: 'l-negative', type: 'structure', contentId: 'negative-svo', title: 'Negative Sentences', icon: '🚫', requiredLessonIds: ['l-sva'] },
      { id: 'l-weather', type: 'vocab', contentId: 'weather', title: 'Weather', icon: '🌤️', requiredLessonIds: ['l-negative'] },
      { id: 'l-question', type: 'structure', contentId: 'question-svo', title: 'Questions: Do/Does', icon: '❓', requiredLessonIds: ['l-negative'] },
      { id: 'l-animals', type: 'vocab', contentId: 'animals', title: 'Animals', icon: '🐾', requiredLessonIds: ['l-question'] },
      { id: 'l-review-4', type: 'review', contentId: 'review-4', title: 'Review Station 4', icon: '⭐', requiredLessonIds: ['l-animals'] },
      { id: 'l-frozen', type: 'scene', contentId: 'frozen-trailer', title: 'Frozen', icon: '❄️', requiredLessonIds: ['l-weather'] },
    ],
  },
  // UNIT 5: Time & Past
  {
    id: 'unit-5',
    title: 'Time & Past',
    description: 'Talk about what happened',
    color: '#9B59B6',
    lessons: [
      { id: 'l-past', type: 'structure', contentId: 'past-sv', title: 'Past Tense', icon: '⏪', requiredLessonIds: ['l-question'] },
      { id: 'l-school', type: 'vocab', contentId: 'school', title: 'School', icon: '🏫', requiredLessonIds: ['l-past'] },
      { id: 'l-savo', type: 'structure', contentId: 'savo', title: 'Adverbs', icon: 'ADV', requiredLessonIds: ['l-past'] },
      { id: 'l-review-5', type: 'review', contentId: 'review-5', title: 'Review Station 5', icon: '⭐', requiredLessonIds: ['l-savo'] },
      { id: 'l-harry-potter', type: 'scene', contentId: 'harry-potter-trailer', title: 'Harry Potter', icon: '⚡', requiredLessonIds: ['l-school'] },
    ],
  },
  // UNIT 6: Future & Abilities
  {
    id: 'unit-6',
    title: 'Future & Abilities',
    description: 'Talk about what will happen and what you can do',
    color: '#E74C3C',
    lessons: [
      { id: 'l-future', type: 'structure', contentId: 'future-svo', title: 'Future Tense: Will', icon: '⏩', requiredLessonIds: ['l-past'] },
      { id: 'l-body-health', type: 'vocab', contentId: 'body-health', title: 'Body & Health', icon: '💪', requiredLessonIds: ['l-future'] },
      { id: 'l-modal', type: 'structure', contentId: 'modal-svo', title: 'Modal Verbs: Can/Should/Must', icon: 'MOD', requiredLessonIds: ['l-future'] },
      { id: 'l-shopping', type: 'vocab', contentId: 'shopping', title: 'Shopping', icon: '🛍️', requiredLessonIds: ['l-modal'] },
      { id: 'l-travel', type: 'vocab', contentId: 'travel-basics', title: 'Travel', icon: '✈️', requiredLessonIds: ['l-modal'] },
      { id: 'l-review-6', type: 'review', contentId: 'review-6', title: 'Review Station 6', icon: '⭐', requiredLessonIds: ['l-travel'] },
      { id: 'l-terminal', type: 'scene', contentId: 'terminal-trailer', title: 'The Terminal', icon: '🛫', requiredLessonIds: ['l-travel'] },
    ],
  },
  // UNIT 7: Complex Ideas
  {
    id: 'unit-7',
    title: 'Complex Ideas',
    description: 'Compare, describe experiences, and express conditions',
    color: '#4A90D9',
    lessons: [
      { id: 'l-comparative', type: 'structure', contentId: 'comparative', title: 'Comparatives', icon: '⚖️', requiredLessonIds: ['l-savo'] },
      { id: 'l-svop', type: 'structure', contentId: 'svop', title: 'Preposition Phrases', icon: 'SVP', requiredLessonIds: ['l-comparative'] },
      { id: 'l-present-perfect', type: 'structure', contentId: 'present-perfect', title: 'Present Perfect', icon: 'PP', requiredLessonIds: ['l-svop'] },
      { id: 'l-work-office', type: 'vocab', contentId: 'work-office', title: 'Work & Office', icon: '💼', requiredLessonIds: ['l-present-perfect'] },
      { id: 'l-conditional', type: 'structure', contentId: 'conditional', title: 'Conditionals', icon: 'IF', requiredLessonIds: ['l-present-perfect'] },
      { id: 'l-review-7', type: 'review', contentId: 'review-7', title: 'Review Station 7', icon: '⭐', requiredLessonIds: ['l-conditional'] },
      { id: 'l-devil-wears-prada', type: 'scene', contentId: 'devil-wears-prada-trailer', title: 'Devil Wears Prada', icon: '👠', requiredLessonIds: ['l-work-office'] },
    ],
  },
];
