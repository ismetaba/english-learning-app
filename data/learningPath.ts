export interface LessonNode {
  id: string;
  type: 'structure' | 'vocab' | 'scene';
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
  {
    id: 'unit-1',
    title: 'First Words',
    description: 'Learn the basics of English sentences',
    color: '#4A90D9',
    lessons: [
      { id: 'l-sv', type: 'structure', contentId: 'sv', title: 'Subject + Verb', icon: 'S V', requiredLessonIds: [] },
      { id: 'l-daily-actions', type: 'vocab', contentId: 'daily-actions', title: 'Daily Actions', icon: 'A B', requiredLessonIds: ['l-sv'] },
      { id: 'l-svo', type: 'structure', contentId: 'svo', title: 'Subject + Verb + Object', icon: 'SVO', requiredLessonIds: ['l-sv'] },
      { id: 'l-food-basics', type: 'vocab', contentId: 'food-basics', title: 'Food Basics', icon: 'A B', requiredLessonIds: ['l-svo'] },
      { id: 'l-svc', type: 'structure', contentId: 'svc', title: 'Subject + Verb + Complement', icon: 'SVC', requiredLessonIds: ['l-svo'] },
      { id: 'l-forrest-gump', type: 'scene', contentId: 'forrest-gump-trailer', title: 'Forrest Gump', icon: 'F G', requiredLessonIds: ['l-daily-actions'] },
    ],
  },
  {
    id: 'unit-2',
    title: 'Describe the World',
    description: 'Learn to describe things and places',
    color: '#2ECC71',
    lessons: [
      { id: 'l-there-is', type: 'structure', contentId: 'there-is', title: 'There is / There are', icon: 'TH', requiredLessonIds: ['l-svc'] },
      { id: 'l-home-items', type: 'vocab', contentId: 'home-items', title: 'Home Items', icon: 'A B', requiredLessonIds: ['l-there-is'] },
      { id: 'l-sva', type: 'structure', contentId: 'sva', title: 'Adjectives', icon: 'SVA', requiredLessonIds: ['l-there-is'] },
      { id: 'l-emotions', type: 'vocab', contentId: 'emotions', title: 'Emotions', icon: 'A B', requiredLessonIds: ['l-sva'] },
      { id: 'l-home-alone', type: 'scene', contentId: 'home-alone-trailer', title: 'Home Alone', icon: 'H A', requiredLessonIds: ['l-home-items'] },
      { id: 'l-finding-nemo', type: 'scene', contentId: 'finding-nemo-trailer', title: 'Finding Nemo', icon: 'F N', requiredLessonIds: ['l-emotions'] },
    ],
  },
  {
    id: 'unit-3',
    title: 'Ask & Answer',
    description: 'Questions, negatives, and the past',
    color: '#E67E22',
    lessons: [
      { id: 'l-negative', type: 'structure', contentId: 'negative-svo', title: 'Negative Sentences', icon: 'NO', requiredLessonIds: ['l-sva'] },
      { id: 'l-weather', type: 'vocab', contentId: 'weather', title: 'Weather', icon: 'A B', requiredLessonIds: ['l-negative'] },
      { id: 'l-question', type: 'structure', contentId: 'question-svo', title: 'Questions', icon: '? ?', requiredLessonIds: ['l-negative'] },
      { id: 'l-past', type: 'structure', contentId: 'past-sv', title: 'Past Tense', icon: 'PST', requiredLessonIds: ['l-question'] },
      { id: 'l-school', type: 'vocab', contentId: 'school', title: 'School', icon: 'A B', requiredLessonIds: ['l-past'] },
      { id: 'l-frozen', type: 'scene', contentId: 'frozen-trailer', title: 'Frozen', icon: 'FR', requiredLessonIds: ['l-weather'] },
      { id: 'l-harry-potter', type: 'scene', contentId: 'harry-potter-trailer', title: 'Harry Potter', icon: 'HP', requiredLessonIds: ['l-school'] },
    ],
  },
  {
    id: 'unit-4',
    title: 'Future & Possibilities',
    description: 'Talk about the future and abilities',
    color: '#9B59B6',
    lessons: [
      { id: 'l-future', type: 'structure', contentId: 'future-svo', title: 'Future Tense', icon: 'FUT', requiredLessonIds: ['l-past'] },
      { id: 'l-modal', type: 'structure', contentId: 'modal-svo', title: 'Modal Verbs', icon: 'MOD', requiredLessonIds: ['l-future'] },
      { id: 'l-savo', type: 'structure', contentId: 'savo', title: 'Adverbs', icon: 'ADV', requiredLessonIds: ['l-modal'] },
      { id: 'l-shopping', type: 'vocab', contentId: 'shopping', title: 'Shopping', icon: 'A B', requiredLessonIds: ['l-modal'] },
      { id: 'l-travel', type: 'vocab', contentId: 'travel-basics', title: 'Travel', icon: 'A B', requiredLessonIds: ['l-savo'] },
      { id: 'l-body-health', type: 'vocab', contentId: 'body-health', title: 'Body & Health', icon: 'A B', requiredLessonIds: ['l-future'] },
      { id: 'l-ratatouille', type: 'scene', contentId: 'ratatouille-trailer', title: 'Ratatouille', icon: 'RT', requiredLessonIds: ['l-shopping'] },
      { id: 'l-terminal', type: 'scene', contentId: 'terminal-trailer', title: 'The Terminal', icon: 'TM', requiredLessonIds: ['l-travel'] },
    ],
  },
  {
    id: 'unit-5',
    title: 'Complex Ideas',
    description: 'Master advanced sentence patterns',
    color: '#E74C3C',
    lessons: [
      { id: 'l-comparative', type: 'structure', contentId: 'comparative', title: 'Comparatives', icon: 'CMP', requiredLessonIds: ['l-savo'] },
      { id: 'l-svop', type: 'structure', contentId: 'svop', title: 'Preposition Phrases', icon: 'SVP', requiredLessonIds: ['l-comparative'] },
      { id: 'l-present-perfect', type: 'structure', contentId: 'present-perfect', title: 'Present Perfect', icon: 'PP', requiredLessonIds: ['l-svop'] },
      { id: 'l-work-office', type: 'vocab', contentId: 'work-office', title: 'Work & Office', icon: 'A B', requiredLessonIds: ['l-present-perfect'] },
      { id: 'l-conditional', type: 'structure', contentId: 'conditional', title: 'Conditionals', icon: 'IF', requiredLessonIds: ['l-present-perfect'] },
      { id: 'l-devil-wears-prada', type: 'scene', contentId: 'devil-wears-prada-trailer', title: 'Devil Wears Prada', icon: 'DW', requiredLessonIds: ['l-work-office'] },
    ],
  },
];
