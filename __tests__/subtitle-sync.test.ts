import { scenes, DialogueLine, Scene } from '../data/scenes';

// Replicate the getActiveLineIndex logic from ScenePlayer
function getActiveLineIndex(lines: DialogueLine[], currentTime: number): number {
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (line.lineStartTime != null && line.lineEndTime != null) {
      if (currentTime >= line.lineStartTime && currentTime < line.lineEndTime) {
        return i;
      }
    }
  }
  return -1;
}

describe('Subtitle sync', () => {
  describe('All scenes have timestamps', () => {
    scenes.forEach((scene) => {
      test(`${scene.movieTitle} — every line has lineStartTime and lineEndTime`, () => {
        scene.lines.forEach((line, idx) => {
          expect(line.lineStartTime).toBeDefined();
          expect(line.lineEndTime).toBeDefined();
          expect(typeof line.lineStartTime).toBe('number');
          expect(typeof line.lineEndTime).toBe('number');
          expect(line.lineEndTime!).toBeGreaterThan(line.lineStartTime!);
        });
      });

      test(`${scene.movieTitle} — timestamps are within scene bounds`, () => {
        scene.lines.forEach((line) => {
          expect(line.lineStartTime!).toBeGreaterThanOrEqual(scene.startTime);
          expect(line.lineEndTime!).toBeLessThanOrEqual(scene.endTime);
        });
      });
    });
  });

  describe('getActiveLineIndex', () => {
    const testLines: DialogueLine[] = [
      { speaker: 'A', text: 'First line', lineStartTime: 5, lineEndTime: 10 },
      { speaker: 'B', text: 'Second line', lineStartTime: 10, lineEndTime: 20 },
      { speaker: 'C', text: 'Third line', lineStartTime: 25, lineEndTime: 35 },
    ];

    test('returns -1 before any line starts', () => {
      expect(getActiveLineIndex(testLines, 0)).toBe(-1);
      expect(getActiveLineIndex(testLines, 4.9)).toBe(-1);
    });

    test('returns correct index when time is within a line', () => {
      expect(getActiveLineIndex(testLines, 5)).toBe(0);
      expect(getActiveLineIndex(testLines, 7)).toBe(0);
      expect(getActiveLineIndex(testLines, 10)).toBe(1);
      expect(getActiveLineIndex(testLines, 15)).toBe(1);
      expect(getActiveLineIndex(testLines, 25)).toBe(2);
      expect(getActiveLineIndex(testLines, 34.9)).toBe(2);
    });

    test('returns -1 in gaps between lines', () => {
      expect(getActiveLineIndex(testLines, 20)).toBe(-1);
      expect(getActiveLineIndex(testLines, 22)).toBe(-1);
    });

    test('returns -1 after all lines end', () => {
      expect(getActiveLineIndex(testLines, 35)).toBe(-1);
      expect(getActiveLineIndex(testLines, 100)).toBe(-1);
    });
  });

  describe('Scenes with transcript-based timestamps match key moments', () => {
    test('Ratatouille — "This is me" starts around 50s', () => {
      const scene = scenes.find(s => s.id === 'ratatouille-trailer')!;
      const idx = getActiveLineIndex(scene.lines, 51);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(scene.lines[idx].text).toContain('This is me');
    });

    test('Finding Nemo — "Fish are friends" starts around 50s', () => {
      const scene = scenes.find(s => s.id === 'finding-nemo-trailer')!;
      const idx = getActiveLineIndex(scene.lines, 52);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(scene.lines[idx].text).toContain('Fish are friends');
    });

    test('Home Alone — "This is my house" starts around 50s', () => {
      const scene = scenes.find(s => s.id === 'home-alone-trailer')!;
      const idx = getActiveLineIndex(scene.lines, 51);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(scene.lines[idx].text).toContain('This is my house');
    });

    test('Frozen — narrator intro at start', () => {
      const scene = scenes.find(s => s.id === 'frozen-trailer')!;
      const idx = getActiveLineIndex(scene.lines, 10);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(scene.lines[idx].text).toContain('Summer in the city');
    });
  });
});
