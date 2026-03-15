export interface ReviewStation {
  id: string;
  title: string;
  coveredStructures: string[];
  coveredVocab: string[];
}

export const reviewStations: ReviewStation[] = [
  {
    id: 'review-1',
    title: 'Review Station 1',
    coveredStructures: ['alphabet-sounds', 'pronouns', 'to-be', 'svc'],
    coveredVocab: ['greetings', 'numbers-1-20', 'pronouns-vocab', 'basic-adjectives', 'emotions'],
  },
  {
    id: 'review-2',
    title: 'Review Station 2',
    coveredStructures: ['sv', 'articles', 'svo'],
    coveredVocab: ['common-verbs', 'daily-actions', 'common-nouns', 'food-basics'],
  },
  {
    id: 'review-3',
    title: 'Review Station 3',
    coveredStructures: ['there-is', 'sva'],
    coveredVocab: ['colors', 'home-items', 'family'],
  },
  {
    id: 'review-4',
    title: 'Review Station 4',
    coveredStructures: ['negative-svo', 'question-svo'],
    coveredVocab: ['weather', 'animals'],
  },
  {
    id: 'review-5',
    title: 'Review Station 5',
    coveredStructures: ['past-sv', 'savo'],
    coveredVocab: ['school'],
  },
  {
    id: 'review-6',
    title: 'Review Station 6',
    coveredStructures: ['future-svo', 'modal-svo'],
    coveredVocab: ['body-health', 'shopping', 'travel-basics'],
  },
  {
    id: 'review-7',
    title: 'Review Station 7',
    coveredStructures: ['comparative', 'svop', 'present-perfect', 'conditional'],
    coveredVocab: ['work-office'],
  },
];
