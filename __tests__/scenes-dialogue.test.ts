import { scenes } from '../data/scenes';

/**
 * These tests verify that the dialogue lines for each scene contain actual,
 * well-known quotes from the respective movies/trailers rather than fabricated
 * educational sentences. The scene data comment says "lines are what the
 * characters actually say in the clip" so they must be accurate.
 *
 * Each test checks:
 * 1. Known real quotes ARE present (with correct wording)
 * 2. Known fabricated lines are NOT present
 * 3. Vocab coverage words still appear in the dialogue
 */

function getScene(id: string) {
  const scene = scenes.find(s => s.id === id);
  if (!scene) throw new Error(`Scene ${id} not found`);
  return scene;
}

function allDialogue(scene: ReturnType<typeof getScene>): string {
  return scene.lines.map(l => l.text).join(' ');
}

function hasLineContaining(scene: ReturnType<typeof getScene>, substring: string): boolean {
  return scene.lines.some(l => l.text.toLowerCase().includes(substring.toLowerCase()));
}

function vocabWordsAppearInDialogue(scene: ReturnType<typeof getScene>): string[] {
  const dialogue = allDialogue(scene).toLowerCase();
  return scene.vocabCoverage.filter(word => {
    const w = word.toLowerCase();
    // Check for exact word or common forms
    return dialogue.includes(w) || dialogue.includes(w + 's') || dialogue.includes(w + 'ing') || dialogue.includes(w + 'ed');
  });
}

describe('Scene dialogue accuracy', () => {
  describe('Ratatouille', () => {
    it('should contain the actual famous Ratatouille quote with correct wording', () => {
      const scene = getScene('ratatouille-trailer');
      // "Anyone can cook" is a real Gusteau quote
      expect(hasLineContaining(scene, 'Anyone can cook')).toBe(true);
    });

    it('should NOT contain fabricated lines about bread and water', () => {
      const scene = getScene('ratatouille-trailer');
      // "The bread needs to be fresh. The water must be clean." is fabricated to include vocab words
      expect(hasLineContaining(scene, 'The bread needs to be fresh')).toBe(false);
    });

    it('should contain the real Ego quote with correct wording (great artist, not great cook)', () => {
      const scene = getScene('ratatouille-trailer');
      // Real quote: "Not everyone can become a great artist" (not "great cook")
      expect(hasLineContaining(scene, 'great artist')).toBe(true);
      expect(hasLineContaining(scene, 'great cook')).toBe(false);
    });

    it('should have vocab coverage words in dialogue', () => {
      const scene = getScene('ratatouille-trailer');
      const found = vocabWordsAppearInDialogue(scene);
      expect(found.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Forrest Gump', () => {
    it('should use "was like" not "is like" for the box of chocolates quote', () => {
      const scene = getScene('forrest-gump-trailer');
      // Real quote: "life WAS like a box of chocolates" (past tense)
      expect(hasLineContaining(scene, 'life was like a box of chocolates')).toBe(true);
      expect(hasLineContaining(scene, 'life is like a box of chocolates')).toBe(false);
    });

    it('should contain "Run, Forrest! Run!" from Jenny', () => {
      const scene = getScene('forrest-gump-trailer');
      expect(hasLineContaining(scene, 'Run, Forrest')).toBe(true);
    });

    it('should NOT contain fabricated lines about writing to Jenny every day', () => {
      const scene = getScene('forrest-gump-trailer');
      // "Dear Jenny, I write to you every day" is fabricated to include vocab word "write"
      expect(hasLineContaining(scene, 'Dear Jenny, I write to you every day')).toBe(false);
    });

    it('should have vocab coverage words in dialogue', () => {
      const scene = getScene('forrest-gump-trailer');
      const found = vocabWordsAppearInDialogue(scene);
      expect(found.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('The Terminal', () => {
    it('should NOT contain fabricated "Can I see your passport" officer dialogue', () => {
      const scene = getScene('terminal-trailer');
      // These lines are fabricated textbook-style dialogue
      expect(hasLineContaining(scene, 'Can I see your passport and ticket, please')).toBe(false);
    });

    it('should NOT contain fabricated "Is there a hotel" dialogue', () => {
      const scene = getScene('terminal-trailer');
      expect(hasLineContaining(scene, 'Is there a hotel')).toBe(false);
    });

    it('should have vocab coverage words in dialogue', () => {
      const scene = getScene('terminal-trailer');
      const found = vocabWordsAppearInDialogue(scene);
      expect(found.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Finding Nemo', () => {
    it('should contain the real Dory quote "Just keep swimming"', () => {
      const scene = getScene('finding-nemo-trailer');
      expect(hasLineContaining(scene, 'Just keep swimming')).toBe(true);
    });

    it('should NOT contain fabricated "I look at you and I am happy"', () => {
      const scene = getScene('finding-nemo-trailer');
      // "I look at you and I am happy" is fabricated
      expect(hasLineContaining(scene, 'I look at you and I am happy')).toBe(false);
    });

    it('should NOT contain fabricated Nemo line "Dad, I am not angry"', () => {
      const scene = getScene('finding-nemo-trailer');
      expect(hasLineContaining(scene, 'Dad, I am not angry')).toBe(false);
    });

    it('should have vocab coverage words in dialogue', () => {
      const scene = getScene('finding-nemo-trailer');
      const found = vocabWordsAppearInDialogue(scene);
      expect(found.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Home Alone', () => {
    it('should contain the real Kevin quote "I made my family disappear"', () => {
      const scene = getScene('home-alone-trailer');
      expect(hasLineContaining(scene, 'I made my family disappear')).toBe(true);
    });

    it('should NOT contain fabricated "There is a lamp on the table"', () => {
      const scene = getScene('home-alone-trailer');
      // "There is a lamp on the table. I will turn it on." is fabricated textbook-style
      expect(hasLineContaining(scene, 'There is a lamp on the table')).toBe(false);
    });

    it('should have vocab coverage words in dialogue', () => {
      const scene = getScene('home-alone-trailer');
      const found = vocabWordsAppearInDialogue(scene);
      expect(found.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Frozen', () => {
    it('should contain the real Elsa quote "The cold never bothered me anyway"', () => {
      const scene = getScene('frozen-trailer');
      expect(hasLineContaining(scene, 'The cold never bothered me anyway')).toBe(true);
    });

    it('should NOT contain fabricated "The cloud is dark. I think it will rain soon"', () => {
      const scene = getScene('frozen-trailer');
      expect(hasLineContaining(scene, 'The cloud is dark')).toBe(false);
    });

    it('should NOT contain fabricated Olaf line about sunny days that is wrong', () => {
      const scene = getScene('frozen-trailer');
      // Olaf's actual line is "Hi, I'm Olaf and I like warm hugs!" not "hot sunny days"
      expect(hasLineContaining(scene, 'I like hot sunny days')).toBe(false);
    });

    it('should have vocab coverage words in dialogue', () => {
      const scene = getScene('frozen-trailer');
      const found = vocabWordsAppearInDialogue(scene);
      expect(found.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Harry Potter', () => {
    it('should contain the real Hagrid quote "You\'re a wizard, Harry"', () => {
      const scene = getScene('harry-potter-trailer');
      expect(hasLineContaining(scene, "a wizard, Harry")).toBe(true);
    });

    it('should NOT contain fabricated "The exam is tomorrow! I did not study!"', () => {
      const scene = getScene('harry-potter-trailer');
      // This is fabricated textbook-style dialogue
      expect(hasLineContaining(scene, 'The exam is tomorrow! I did not study')).toBe(false);
    });

    it('should NOT contain fabricated "I finished my homework. Did you finish yours?"', () => {
      const scene = getScene('harry-potter-trailer');
      expect(hasLineContaining(scene, 'I finished my homework')).toBe(false);
    });

    it('should have vocab coverage words in dialogue', () => {
      const scene = getScene('harry-potter-trailer');
      const found = vocabWordsAppearInDialogue(scene);
      expect(found.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('The Devil Wears Prada', () => {
    it('should NOT contain fabricated "Tell my colleague to call me before the deadline"', () => {
      const scene = getScene('devil-wears-prada-trailer');
      expect(hasLineContaining(scene, 'Tell my colleague to call me before the deadline')).toBe(false);
    });

    it('should NOT contain fabricated "Your colleague sent you an email about the project"', () => {
      const scene = getScene('devil-wears-prada-trailer');
      expect(hasLineContaining(scene, 'Your colleague sent you an email about the project')).toBe(false);
    });

    it('should have vocab coverage words in dialogue', () => {
      const scene = getScene('devil-wears-prada-trailer');
      const found = vocabWordsAppearInDialogue(scene);
      expect(found.length).toBeGreaterThanOrEqual(3);
    });
  });
});
