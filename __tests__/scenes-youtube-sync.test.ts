import { scenes } from '../data/scenes';

/**
 * These tests verify that dialogue lines match what is ACTUALLY SPOKEN in the
 * specific YouTube trailer clips (identified by youtubeVideoId), NOT just
 * famous quotes from the movies in general.
 *
 * The app enables YouTube captions (cc_load_policy=1), so users see YouTube's
 * auto-captions on the video. The dialogue shown below the video must match
 * what's heard in the trailer — otherwise users see two different sets of text.
 *
 * Transcripts were fetched via youtube-transcript-api for each video ID.
 */

function getScene(id: string) {
  const scene = scenes.find(s => s.id === id);
  if (!scene) throw new Error(`Scene ${id} not found`);
  return scene;
}

function allDialogue(scene: ReturnType<typeof getScene>): string {
  return scene.lines.map(l => l.text).join(' ').toLowerCase();
}

function hasLineContaining(scene: ReturnType<typeof getScene>, substring: string): boolean {
  return scene.lines.some(l => l.text.toLowerCase().includes(substring.toLowerCase()));
}

/**
 * YouTube transcript for NgsQ8mVkN8w (Ratatouille trailer):
 * - Cheese trolley presentation, then Remy narrates about liking good food
 * - Key phrases: "I need to rethink my life", "I like good food",
 *   "good food is hard for a rat to find", "I don't want to eat garbage",
 *   "if you can sort of muscle your way past the gag reflex",
 *   "we happen to live in Paris France"
 * - Does NOT contain: "Anyone can cook", "You are one of us now",
 *   "the rat is the cook", "great artist can come from anywhere"
 */
describe('Scene dialogue matches YouTube trailer audio', () => {
  describe('Ratatouille trailer (NgsQ8mVkN8w)', () => {
    it('should contain lines actually spoken in the trailer, not just famous movie quotes', () => {
      const scene = getScene('ratatouille-trailer');
      const dialogue = allDialogue(scene);
      // The trailer is about Remy narrating his love of good food in Paris
      // At least some of these key trailer phrases must appear
      const trailerPhrases = [
        'rethink my life',
        'i like good food',
        'good food is hard for a rat to find',
        'i don\'t want to eat garbage',
        'gag reflex',
        'we happen to live in paris',
      ];
      const matchCount = trailerPhrases.filter(p => dialogue.includes(p)).length;
      expect(matchCount).toBeGreaterThanOrEqual(3);
    });

    it('should NOT contain "Anyone can cook" — not spoken in this trailer clip', () => {
      const scene = getScene('ratatouille-trailer');
      // "Anyone can cook" is from the movie but NOT in trailer NgsQ8mVkN8w
      expect(hasLineContaining(scene, 'Anyone can cook')).toBe(false);
    });

    it('should NOT contain "the rat is the cook" — not in this trailer clip', () => {
      const scene = getScene('ratatouille-trailer');
      expect(hasLineContaining(scene, 'the rat is the cook')).toBe(false);
    });

    it('should NOT contain "great artist can come from anywhere" — not in this trailer', () => {
      const scene = getScene('ratatouille-trailer');
      expect(hasLineContaining(scene, 'great artist can come from anywhere')).toBe(false);
    });

    it('should have vocab coverage words in dialogue', () => {
      const scene = getScene('ratatouille-trailer');
      const dialogue = allDialogue(scene);
      const found = scene.vocabCoverage.filter(w =>
        dialogue.includes(w) || dialogue.includes(w + 's') || dialogue.includes(w + 'ing') || dialogue.includes(w + 'ed')
      );
      expect(found.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('The Terminal trailer (iZqQRmhRvyg)', () => {
    it('should contain lines actually spoken in the trailer', () => {
      const scene = getScene('terminal-trailer');
      const dialogue = allDialogue(scene);
      // Key phrases from the actual YouTube transcript
      const trailerPhrases = [
        'military coup',
        'krakozhia',
        'not to leave this building',
        'walking around the terminal',
        'doesn\'t even speak english',
        'you are the kind of woman',
        'living in an airport',
      ];
      const matchCount = trailerPhrases.filter(p => dialogue.includes(p)).length;
      expect(matchCount).toBeGreaterThanOrEqual(3);
    });

    it('should NOT contain "I am simply... waiting" — not in this trailer clip', () => {
      const scene = getScene('terminal-trailer');
      expect(hasLineContaining(scene, 'I am simply... waiting')).toBe(false);
    });

    it('should NOT contain "I am afraid of ghosts" — not in this trailer clip', () => {
      const scene = getScene('terminal-trailer');
      expect(hasLineContaining(scene, 'I am afraid of ghosts')).toBe(false);
    });

    it('should have vocab coverage words in dialogue', () => {
      const scene = getScene('terminal-trailer');
      const dialogue = allDialogue(scene);
      const found = scene.vocabCoverage.filter(w =>
        dialogue.includes(w) || dialogue.includes(w + 's') || dialogue.includes(w + 'ing') || dialogue.includes(w + 'ed')
      );
      expect(found.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Finding Nemo trailer (2zLkasScy7A)', () => {
    it('should contain lines actually spoken in the trailer', () => {
      const scene = getScene('finding-nemo-trailer');
      const dialogue = allDialogue(scene);
      // Key phrases from the actual YouTube transcript
      const trailerPhrases = [
        'i see a light',
        'i\'m feeling happy',
        'fish are friends not food',
        'grab shell dude',
        'i got to find my son',
        'i speak whale',
      ];
      const matchCount = trailerPhrases.filter(p => dialogue.includes(p)).length;
      expect(matchCount).toBeGreaterThanOrEqual(3);
    });

    it('should NOT contain "I promised I would never let anything happen to him" — not in this trailer', () => {
      const scene = getScene('finding-nemo-trailer');
      expect(hasLineContaining(scene, 'I promised I would never let anything happen to him')).toBe(false);
    });

    it('should NOT contain "Just keep swimming" — not in this specific trailer clip', () => {
      const scene = getScene('finding-nemo-trailer');
      // Famous Dory quote but NOT in trailer 2zLkasScy7A
      expect(hasLineContaining(scene, 'Just keep swimming')).toBe(false);
    });

    it('should have vocab coverage words in dialogue', () => {
      const scene = getScene('finding-nemo-trailer');
      const dialogue = allDialogue(scene);
      const found = scene.vocabCoverage.filter(w =>
        dialogue.includes(w) || dialogue.includes(w + 's') || dialogue.includes(w + 'ing') || dialogue.includes(w + 'ed')
      );
      expect(found.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Home Alone trailer (jEDaVHmw7r4)', () => {
    it('should contain lines actually spoken in the trailer', () => {
      const scene = getScene('home-alone-trailer');
      const dialogue = allDialogue(scene);
      // Key phrases from the actual YouTube transcript
      const trailerPhrases = [
        'this is my house i have to defend',
        'what can a kid do',
        'i am going to get home to my son',
        'you\'re a stranger',
        'a family comedy without the family',
        'coming november 16th',
        'i\'m eight years old',
      ];
      const matchCount = trailerPhrases.filter(p => dialogue.includes(p)).length;
      expect(matchCount).toBeGreaterThanOrEqual(3);
    });

    it('should contain narrator/voiceover lines from the trailer', () => {
      const scene = getScene('home-alone-trailer');
      // The trailer has narrator lines about the McCallisters
      const dialogue = allDialogue(scene);
      const hasNarrator = dialogue.includes('mccallister') ||
        dialogue.includes('christmas vacation') ||
        dialogue.includes('wet bandits') ||
        dialogue.includes('forgot one small thing');
      expect(hasNarrator).toBe(true);
    });

    it('should have vocab coverage words in dialogue', () => {
      const scene = getScene('home-alone-trailer');
      const dialogue = allDialogue(scene);
      const found = scene.vocabCoverage.filter(w =>
        dialogue.includes(w) || dialogue.includes(w + 's') || dialogue.includes(w + 'ing') || dialogue.includes(w + 'ed')
      );
      expect(found.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Frozen trailer (TbQm5doF_Uc)', () => {
    it('should contain lines actually spoken in the trailer', () => {
      const scene = getScene('frozen-trailer');
      const dialogue = allDialogue(scene);
      // Key phrases from the actual YouTube transcript
      const trailerPhrases = [
        'arendelle',
        'completely frozen',
        'eternal snow',
        'freeze to death',
        'i sell ice for a living',
        'i\'m olaf',
        'some people are worth melting for',
        'grab my butt',
      ];
      const matchCount = trailerPhrases.filter(p => dialogue.includes(p)).length;
      expect(matchCount).toBeGreaterThanOrEqual(3);
    });

    it('should NOT contain "The cold never bothered me anyway" — not in this trailer clip', () => {
      const scene = getScene('frozen-trailer');
      // This famous line is NOT spoken in trailer TbQm5doF_Uc
      expect(hasLineContaining(scene, 'The cold never bothered me anyway')).toBe(false);
    });

    it('should NOT contain "Let it go" — not in this trailer clip', () => {
      const scene = getScene('frozen-trailer');
      expect(hasLineContaining(scene, 'Let it go')).toBe(false);
    });

    it('should have vocab coverage words in dialogue', () => {
      const scene = getScene('frozen-trailer');
      const dialogue = allDialogue(scene);
      const found = scene.vocabCoverage.filter(w =>
        dialogue.includes(w) || dialogue.includes(w + 's') || dialogue.includes(w + 'ing') || dialogue.includes(w + 'ed')
      );
      expect(found.length).toBeGreaterThanOrEqual(3);
    });
  });
});
