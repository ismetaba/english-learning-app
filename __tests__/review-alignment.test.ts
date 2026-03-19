import { buildAutoReview, AlignmentReview, SceneReview } from '../scripts/review-alignment';

interface AlignedLine {
  speaker: string;
  text: string;
  lineStartTime: number;
  lineEndTime: number;
  wordTimestamps: [];
  confidence: number;
  source: 'youtube-auto' | 'manual';
}

interface AlignedScene {
  sceneId: string;
  movieTitle: string;
  videoId: string;
  lines: AlignedLine[];
  avgConfidence: number;
  alignedAt: string;
}

function makeScene(id: string, title: string, avgConfidence: number): AlignedScene {
  return {
    sceneId: id,
    movieTitle: title,
    videoId: 'vid-' + id,
    lines: [
      {
        speaker: 'A',
        text: 'Hello world',
        lineStartTime: 1,
        lineEndTime: 3,
        wordTimestamps: [],
        confidence: avgConfidence,
        source: 'youtube-auto',
      },
    ],
    avgConfidence,
    alignedAt: '2026-01-01T00:00:00Z',
  };
}

describe('review-alignment', () => {
  describe('buildAutoReview', () => {
    const highScene = makeScene('high-conf', 'High Confidence Movie', 0.85);
    const medScene = makeScene('med-conf', 'Medium Confidence Movie', 0.55);
    const lowScene = makeScene('low-conf', 'Low Confidence Movie', 0.30);

    test('auto-approves scenes above threshold', () => {
      const review = buildAutoReview([highScene, medScene, lowScene], 0.7, null);

      const high = review.scenes.find(s => s.sceneId === 'high-conf')!;
      expect(high.decision).toBe('approved');
      expect(high.reviewedBy).toBe('auto');
    });

    test('marks scenes below threshold as pending', () => {
      const review = buildAutoReview([highScene, medScene, lowScene], 0.7, null);

      const med = review.scenes.find(s => s.sceneId === 'med-conf')!;
      const low = review.scenes.find(s => s.sceneId === 'low-conf')!;
      expect(med.decision).toBe('pending');
      expect(low.decision).toBe('pending');
    });

    test('preserves existing non-pending decisions for scenes below threshold', () => {
      const existing: AlignmentReview = {
        scenes: [
          {
            sceneId: 'med-conf',
            movieTitle: 'Medium Confidence Movie',
            decision: 'rejected',
            avgConfidence: 0.55,
            reviewedAt: '2026-01-01T00:00:00Z',
            reviewedBy: 'human',
          },
        ],
        reviewedAt: '2026-01-01T00:00:00Z',
      };

      const review = buildAutoReview([highScene, medScene, lowScene], 0.7, existing);

      const med = review.scenes.find(s => s.sceneId === 'med-conf')!;
      expect(med.decision).toBe('rejected');
      expect(med.reviewedBy).toBe('human');
    });

    test('overrides existing decision when scene is above threshold', () => {
      const existing: AlignmentReview = {
        scenes: [
          {
            sceneId: 'high-conf',
            movieTitle: 'High Confidence Movie',
            decision: 'rejected',
            avgConfidence: 0.85,
            reviewedAt: '2026-01-01T00:00:00Z',
            reviewedBy: 'human',
          },
        ],
        reviewedAt: '2026-01-01T00:00:00Z',
      };

      const review = buildAutoReview([highScene], 0.7, existing);

      const high = review.scenes.find(s => s.sceneId === 'high-conf')!;
      expect(high.decision).toBe('approved');
      expect(high.reviewedBy).toBe('auto');
    });

    test('with threshold 0, approves all scenes', () => {
      const review = buildAutoReview([highScene, medScene, lowScene], 0, null);

      expect(review.scenes.every(s => s.decision === 'approved')).toBe(true);
    });

    test('with threshold 1, no scenes auto-approved', () => {
      const review = buildAutoReview([highScene, medScene, lowScene], 1, null);

      expect(review.scenes.every(s => s.decision === 'pending')).toBe(true);
    });

    test('returns all scenes in result', () => {
      const review = buildAutoReview([highScene, medScene, lowScene], 0.7, null);
      expect(review.scenes).toHaveLength(3);
    });
  });

  describe('ScenePlayer subtitleStatus gating', () => {
    test('scenes without subtitleStatus default to undefined', () => {
      const { scenes } = require('../data/scenes');
      // All scenes currently lack subtitleStatus (not yet approved)
      for (const scene of scenes) {
        // subtitleStatus is optional, so either undefined or a valid value
        if (scene.subtitleStatus) {
          expect(['draft', 'approved']).toContain(scene.subtitleStatus);
        }
      }
    });
  });
});
