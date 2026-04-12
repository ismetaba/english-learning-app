import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  StyleSheet,
  ScrollView,
  Pressable,
  Text,
  View,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Animated, { FadeInDown, FadeInUp, ZoomIn } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useAppContext, LessonStage } from '@/contexts/AppStateContext';
import { fetchLesson, fetchLessonClips, LessonDetail, LessonClip, LessonSection } from '@/services/curriculumService';
import { palette, Shadows, Radius } from '@/constants/Colors';
import { useAudioPlayer, AudioPlayer, createAudioPlayer } from 'expo-audio';
import CoursePlayer from '@/components/CoursePlayer/CoursePlayer';

// ── Helpers ──────────────────────────────────────────────────────

// Best voice selection for Web Speech API
let _bestVoice: SpeechSynthesisVoice | null = null;
const PREFERRED_VOICES = ['Samantha', 'Daniel', 'Karen', 'Moira', 'Tessa', 'Kathy'];

function getBestVoice(): SpeechSynthesisVoice | null {
  if (_bestVoice) return _bestVoice;
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  const english = voices.filter(v => v.lang.startsWith('en'));
  // Try preferred voices first (natural sounding)
  for (const name of PREFERRED_VOICES) {
    const match = english.find(v => v.name === name);
    if (match) { _bestVoice = match; return match; }
  }
  // Fallback to any English voice
  if (english.length > 0) { _bestVoice = english[0]; return english[0]; }
  return null;
}

// Preload voices (they load async on some browsers)
if (typeof window !== 'undefined' && window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => { _bestVoice = null; getBestVoice(); };
  getBestVoice();
}

let _currentPlayer: AudioPlayer | null = null;

async function speak(text: string, lang: string = 'en') {
  // On web: use Web Speech API with best voice
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel(); // Stop any current speech
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 0.9;
    utterance.pitch = 1.0;
    const voice = getBestVoice();
    if (voice) utterance.voice = voice;
    window.speechSynthesis.speak(utterance);
    return;
  }

  // On native: use Google TTS via audio (no CORS issues)
  try {
    if (_currentPlayer) {
      _currentPlayer.release();
      _currentPlayer = null;
    }
    const encoded = encodeURIComponent(text);
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${lang}&q=${encoded}`;
    const player = createAudioPlayer(url);
    _currentPlayer = player;
    player.play();
  } catch {
    // Silent fail
  }
}

const STAGES: LessonStage[] = ['learn', 'watch', 'practice', 'reinforce', 'mastered'];

const STAGE_LABELS: Record<string, string> = {
  learn: 'Learn',
  watch: 'Watch',
  practice: 'Practice',
  reinforce: 'Reinforce',
  mastered: 'Mastered',
};

/** Generate a fill-in-the-blank quiz from example sentences. */
function buildQuiz(examples: string[]) {
  return examples
    .filter((s) => s.trim().length > 0)
    .map((sentence) => {
      const words = sentence.replace(/[.!?,"]/g, '').split(/\s+/).filter(Boolean);
      // Pick a word to blank out (prefer longer, more meaningful words)
      const candidates = words.filter((w) => w.length > 2);
      const pool = candidates.length > 0 ? candidates : words;
      const answer = pool[Math.floor(Math.random() * pool.length)];
      const blanked = sentence.replace(new RegExp(`\\b${answer}\\b`, 'i'), '______');

      // Build distractors
      const distractors = generateDistractors(answer, words);
      const options = shuffle([answer, ...distractors]);

      return { sentence, blanked, answer, options };
    });
}

function generateDistractors(answer: string, contextWords: string[]): string[] {
  const pool = [
    'always', 'never', 'often', 'quickly', 'slowly',
    'happy', 'large', 'small', 'going', 'making',
    'their', 'which', 'could', 'would', 'should',
    'about', 'after', 'before', 'between', 'under',
    'every', 'these', 'those', 'might', 'being',
  ].filter((w) => w.toLowerCase() !== answer.toLowerCase());

  // Also add context words that are not the answer
  contextWords
    .filter((w) => w.toLowerCase() !== answer.toLowerCase() && w.length > 2)
    .forEach((w) => pool.push(w));

  const unique = [...new Set(pool.map((w) => w.toLowerCase()))];
  const shuffled = shuffle(unique);
  return shuffled.slice(0, 3);
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// ── Component ────────────────────────────────────────────────────

export default function LearnLessonScreen() {
  const params = useLocalSearchParams<{ lessonId: string; mode?: string }>();
  const lessonId = params.lessonId;
  const modeParam = params.mode as 'learn' | 'vocab' | 'watch' | 'test' | 'bonus' | undefined;
  const router = useRouter();
  const {
    getLessonStage,
    updateLessonMastery,
    getLessonProgress,
    updateSubProgress,
    addXP,
    markLessonComplete,
    XP_PER_LESSON,
  } = useAppContext();

  const [lesson, setLesson] = useState<LessonDetail | null>(null);
  const [clips, setClips] = useState<LessonClip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Determine the current stage from mode param or saved progress
  const subProgress = getLessonProgress(lessonId ?? '');
  const initialStage: LessonStage = modeParam === 'learn' ? 'learn'
    : modeParam === 'vocab' ? 'learn'  // vocab uses learn stage renderer with vocab-only sections
    : modeParam === 'watch' ? 'watch'
    : modeParam === 'test' ? 'practice'
    : modeParam === 'bonus' ? 'reinforce'
    : (getLessonStage(lessonId ?? '') ?? 'learn');
  const [stage, setStage] = useState<LessonStage>(initialStage);
  const [activeMode, setActiveMode] = useState<string>(modeParam || 'auto');

  // Section-based learn state
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const [stepIndex, setStepIndex] = useState(0); // step within a section
  const scrollViewRef = useRef<ScrollView>(null);

  // Watch stage state
  const [watchClipIndex, setWatchClipIndex] = useState(0);

  // Practice state
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizScore, setQuizScore] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [quizDone, setQuizDone] = useState(false);

  // Sync saved stage when it changes externally (only in auto mode)
  const currentSavedStage = getLessonStage(lessonId ?? '');
  useEffect(() => {
    if (activeMode === 'auto' && currentSavedStage && currentSavedStage !== stage) {
      setStage(currentSavedStage);
    }
  }, [currentSavedStage]);

  // Fetch data
  useEffect(() => {
    if (!lessonId) return;
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);
        const [lessonData, clipsData] = await Promise.all([
          fetchLesson(lessonId),
          fetchLessonClips(lessonId).catch(() => [] as LessonClip[]),
        ]);
        if (cancelled) return;
        setLesson(lessonData);
        setClips(clipsData);
      } catch (e: any) {
        if (!cancelled) setError(e.message ?? 'Failed to load lesson');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [lessonId]);

  // Build quiz questions: prefer section exercises, fallback to auto-generated from examples
  const sectionExercises = useMemo(() => {
    if (!lesson?.sections) return null;
    const exerciseSections = lesson.sections.filter((s): s is Extract<LessonSection, { type: 'exercise' }> => s.type === 'exercise');
    if (exerciseSections.length === 0) return null;
    const items = exerciseSections.flatMap((s) => s.items);
    if (items.length === 0) return null;
    return items;
  }, [lesson?.sections]);

  const quiz = useMemo(() => {
    if (!lesson?.examples?.length) return [];
    return buildQuiz(lesson.examples);
  }, [lesson?.examples]);

  // ── Section-based learn data (must be before early returns) ────

  const learnSections = useMemo(() => {
    if (!lesson?.sections?.length) return [];
    if (activeMode === 'vocab') {
      // Vocab mode: only show vocab sections
      return lesson.sections.filter((s: LessonSection) => s.type === 'vocab');
    }
    if (activeMode === 'learn') {
      // Learn mode: show everything except vocab and exercise
      return lesson.sections.filter((s: LessonSection) => s.type !== 'exercise' && s.type !== 'vocab');
    }
    // Auto/default: show all non-exercise sections
    return lesson.sections.filter((s: LessonSection) => s.type !== 'exercise');
  }, [lesson?.sections, activeMode]);

  const hasSectionBasedLearn = learnSections.length > 0;



  // Build word translations — vocab sections + basic English→Turkish dictionary
  const wordTranslations = useMemo(() => {
    // Common English→Turkish dictionary for A1 level
    const base: Record<string, string> = {
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
      "don't": 'yapma', "doesn't": 'yapmaz', "isn't": 'değil', "aren't": 'değiller',
      "can't": 'yapamaz', "won't": 'yapmayacak', "wasn't": 'değildi',
    };
    // Override with lesson vocab (more specific translations)
    if (lesson?.sections) {
      for (const sec of lesson.sections) {
        if (sec.type === 'vocab') {
          for (const w of sec.words) {
            base[w.word.toLowerCase()] = w.translation;
          }
        }
      }
    }
    return base;
  }, [lesson?.sections]);

  // Build CourseData for the EXACT same CoursePlayer used in "Dersler"
  // Combines nearby targets from the same video into one clip, deduplicates sentences
  const courseData = useMemo(() => {
    if (!lesson || clips.length === 0) return null;
    const CONTEXT_BEFORE = 15; // seconds before first target
    const CONTEXT_AFTER = 10; // seconds after last target
    const MERGE_GAP = 30; // merge targets within 30s of each other

    const courseClips: any[] = [];
    const seenSentences = new Set<string>(); // deduplicate by text

    // Sort clips: prefer clips with more subtitle lines (better quality admin data first)
    const sortedClips = [...clips].sort((a, b) => (b.lines?.length || 0) - (a.lines?.length || 0));

    // Check if any clip has server-provided isTarget flags
    const hasServerTargets = clips.some(c => c.lines?.some(l => l.isTarget));

    for (const clip of sortedClips) {
      if (!clip.lines || clip.lines.length === 0) continue;

      // Use server-provided isTarget flag; if none exist, treat all lines as targets
      const allTargets = clip.lines.filter(l => {
        if (hasServerTargets && !l.isTarget) return false;
        const key = l.text.toLowerCase().replace(/[.,!?;:'"]/g, '').trim();
        if (seenSentences.has(key)) return false;
        seenSentences.add(key);
        return true;
      });
      if (allTargets.length === 0) continue;

      // Sort by time
      allTargets.sort((a, b) => a.startTime - b.startTime);

      // Merge nearby targets into groups
      const groups: typeof allTargets[] = [];
      let currentGroup = [allTargets[0]];

      for (let i = 1; i < allTargets.length; i++) {
        const prev = currentGroup[currentGroup.length - 1];
        if (allTargets[i].startTime - prev.endTime < MERGE_GAP) {
          currentGroup.push(allTargets[i]);
        } else {
          groups.push(currentGroup);
          currentGroup = [allTargets[i]];
        }
      }
      groups.push(currentGroup);

      // Create one clip per group
      for (const group of groups) {
        const firstTarget = group[0];
        const lastTarget = group[group.length - 1];
        // Window: start 15s before first target (or from 0 if near start), end 10s after last
        const rawStart = firstTarget.startTime - CONTEXT_BEFORE;
        const windowStart = rawStart < 5 ? 0 : rawStart; // if less than 5s from start, just start from 0
        const windowEnd = lastTarget.endTime + CONTEXT_AFTER;

        // Collect target texts for matching
        const targetTexts = new Set(group.map(t => t.text));

        // Get all lines in the window
        const windowLines = clip.lines
          .filter(l => l.endTime > windowStart && l.startTime < windowEnd)
          .map(l => {
            const isTarget = targetTexts.has(l.text);
            const translations = isTarget
              ? l.text.split(' ').map(w => {
                  const clean = w.replace(/[.,!?;:'"]/g, '').toLowerCase();
                  // Try exact match, then without apostrophe parts
                  const tr = wordTranslations[clean]
                    || wordTranslations[clean.replace(/'s$/, '')]
                    || wordTranslations[clean.replace(/'re$/, '')]
                    || wordTranslations[clean.replace(/'t$/, '')]
                    || '';
                  return { word: w, tr };
                })
              : null;

            return {
              id: l.id || Math.random() * 100000 | 0,
              text: l.text,
              speaker: l.speaker || 'Speaker',
              start_time: l.startTime,
              end_time: l.endTime,
              words: l.words?.map((w, wi) => ({
                word: w.word,
                word_index: wi,
                start_time: w.startTime,
                end_time: w.endTime,
              })) || [],
              is_target: isTarget,
              grammar_annotations: null,
              translations,
            };
          });

        const targetCount = windowLines.filter(l => l.is_target).length;
        if (targetCount === 0) continue;

        // Ensure clip doesn't end right on the last target —
        // if the last line IS a target, add a silent padding line 10s later
        // so the video keeps playing after the target pause
        const lastLine = windowLines[windowLines.length - 1];
        if (lastLine && lastLine.is_target) {
          windowLines.push({
            id: Math.random() * 100000 | 0,
            text: '',
            speaker: '',
            start_time: lastLine.end_time + 9,
            end_time: lastLine.end_time + 10,
            words: [],
            is_target: false,
            grammar_annotations: null,
            translations: null,
          });
        }

        courseClips.push({
          clip_id: clip.id * 1000 + courseClips.length,
          youtube_video_id: clip.youtubeVideoId,
          movie_title: clip.movieTitle,
          start_time: windowStart,
          end_time: windowEnd,
          target_count: targetCount,
          lines: windowLines,
        });
      }
    }

    if (courseClips.length === 0) return null;

    return {
      id: 0,
      title: lesson.title,
      title_tr: lesson.title_tr,
      level: 'beginner',
      grammar_focus: lesson.grammar_pattern,
      total_targets: courseClips.length,
      clips: courseClips,
    };
  }, [lesson, clips, wordTranslations]);

  // ── Stage navigation ───────────────────────────────────────────

  function advanceTo(nextStage: LessonStage) {
    if (!lessonId) return;

    // Sub-task completion: mark the sub-task done and go back to learning path
    if (activeMode === 'learn' && nextStage === 'watch') {
      // Learn sub-task completed
      updateSubProgress(lessonId, { learnCompleted: true });
      router.back();
      return;
    }
    if (activeMode === 'vocab' && nextStage === 'watch') {
      // Vocab sub-task completed (uses same "advance to watch" trigger)
      updateSubProgress(lessonId, { vocabCompleted: true });
      router.back();
      return;
    }
    if (activeMode === 'watch' && nextStage === 'practice') {
      // Watch sub-task completed
      updateSubProgress(lessonId, { watchCompleted: true });
      router.back();
      return;
    }

    // Auto mode: advance through stages normally
    setStage(nextStage);
    updateLessonMastery(lessonId, { stage: nextStage });

    if (nextStage === 'mastered') {
      updateSubProgress(lessonId, { testPassed: true });
      addXP(XP_PER_LESSON);
      markLessonComplete(lessonId);
    }
  }

  // ── Render helpers ─────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={palette.primary} />
        <Text style={styles.loadingText}>Loading lesson...</Text>
      </View>
    );
  }

  if (error || !lesson) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.errorEmoji}>!</Text>
        <Text style={styles.errorText}>{error ?? 'Lesson not found'}</Text>
        <Pressable style={styles.primaryButton} onPress={() => router.back()}>
          <Text style={styles.primaryButtonText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  // ── Progress dots ──────────────────────────────────────────────

  const currentIndex = STAGES.indexOf(stage);

  function handleStageTap(targetStage: LessonStage) {
    if (targetStage === stage) return;
    setStage(targetStage);
    setActiveMode('manual');
    // Reset sub-state when jumping stages
    if (targetStage === 'learn') {
      setCurrentSectionIndex(0);
      setStepIndex(0);
    } else if (targetStage === 'watch') {
      setWatchClipIndex(0);
    } else if (targetStage === 'practice') {
      setQuizIndex(0);
      setQuizScore(0);
      setSelectedOption(null);
      setQuizDone(false);
    }
  }

  function renderProgressDots() {
    return (
      <View style={styles.progressDots}>
        {STAGES.map((s, i) => {
          const isActive = i === currentIndex;
          const isComplete = i < currentIndex;
          return (
            <Pressable key={s} style={styles.dotWrapper} onPress={() => handleStageTap(s)}>
              {isComplete ? (
                <Ionicons name="checkmark-circle" size={32} color={palette.success} />
              ) : isActive ? (
                <Ionicons name="radio-button-on" size={32} color={palette.primary} />
              ) : (
                <Ionicons name="ellipse-outline" size={32} color={palette.textDisabled} />
              )}
              <Text
                style={[
                  styles.dotLabel,
                  isActive && styles.dotLabelActive,
                  isComplete && styles.dotLabelComplete,
                ]}
              >
                {STAGE_LABELS[s]}
              </Text>
              {i < STAGES.length - 1 && (
                <View
                  style={[
                    styles.dotConnector,
                    isComplete && styles.dotConnectorComplete,
                  ]}
                />
              )}
            </Pressable>
          );
        })}
      </View>
    );
  }

  // ── Stage 1: LEARN ─────────────────────────────────────────────

  function getStepsForSection(section: LessonSection): number {
    switch (section.type) {
      case 'vocab': return section.words.length;
      case 'rule': return 1 + section.examples.length; // explanation + each example
      case 'dialogue': return section.lines.length;
      case 'tip': return 1;
      case 'exercise': return 1;
      default: return 1;
    }
  }

  function advanceStepOrSection() {
    const section = learnSections[currentSectionIndex];
    const totalSteps = getStepsForSection(section);

    if (stepIndex < totalSteps - 1) {
      // Advance within current section
      setStepIndex((i) => i + 1);
      scrollViewRef.current?.scrollTo({ y: 0, animated: true });
    } else if (currentSectionIndex < learnSections.length - 1) {
      // Move to next section
      setCurrentSectionIndex((i) => i + 1);
      setStepIndex(0);
      scrollViewRef.current?.scrollTo({ y: 0, animated: true });
    } else {
      // All sections done — advance to WATCH stage
      advanceTo('watch');
    }
  }

  function renderVocabSection(section: Extract<LessonSection, { type: 'vocab' }>) {
    const total = section.words.length;
    const current = Math.min(stepIndex, total - 1);
    const w = section.words[current];

    return (
      <View>
        <Text style={styles.sectionTitle}>{section.title || 'Key Vocabulary'}</Text>
        <Text style={styles.stepCounter}>{current + 1} / {total} words</Text>

        <Animated.View key={current} entering={FadeInDown.duration(300)} style={styles.vocabSingle}>
          <Text style={styles.vocabWordLarge}>{w.word}</Text>
          {w.ipa ? <Text style={styles.vocabIpa}>{w.ipa}</Text> : null}
          <Pressable onPress={() => speak(w.word)} style={styles.speakButton} hitSlop={12}>
            <Ionicons name="volume-high" size={24} color={palette.primary} />
          </Pressable>
          <View style={styles.vocabDivider} />
          <Text style={styles.vocabTranslationLarge}>{w.translation}</Text>
          {w.example ? (
            <View style={styles.vocabExampleBox}>
              <Text style={styles.vocabExampleLarge}>{w.example}</Text>
              {w.example_tr ? <Text style={styles.vocabExampleTrLarge}>{w.example_tr}</Text> : null}
            </View>
          ) : null}
        </Animated.View>

        {/* Mini dots showing progress */}
        <View style={styles.miniDots}>
          {section.words.map((_, i) => (
            <View key={i} style={[styles.miniDot, i <= current && styles.miniDotActive]} />
          ))}
        </View>
      </View>
    );
  }

  function renderRuleSection(section: Extract<LessonSection, { type: 'rule' }>) {
    // Step 0 = explanation, steps 1..N = examples one by one
    const totalSteps = 1 + section.examples.length; // 1 for explanation + N examples
    const current = Math.min(stepIndex, totalSteps - 1);
    const showingExplanation = current === 0;
    const exampleIdx = current - 1; // which example to show (-1 means none yet)

    return (
      <View>
        <Text style={styles.sectionTitle}>{section.title}</Text>

        {section.pattern ? (
          <View style={styles.patternBox}>
            <Text style={styles.patternLabel}>Pattern</Text>
            <Text style={styles.patternText}>{section.pattern}</Text>
          </View>
        ) : null}

        {showingExplanation ? (
          <Animated.View key="explanation" entering={FadeInDown.duration(300)}>
            <Text style={styles.ruleExplanation}>{section.explanation}</Text>
            {section.explanation_tr ? (
              <Text style={styles.ruleExplanationTr}>{section.explanation_tr}</Text>
            ) : null}
          </Animated.View>
        ) : (
          <>
            {/* Show the current example */}
            <Text style={styles.stepCounter}>Example {exampleIdx + 1} / {section.examples.length}</Text>
            <Animated.View key={exampleIdx} entering={FadeInDown.duration(300)} style={styles.ruleExampleSingle}>
              <Text style={styles.ruleExampleEnLarge}>
                {section.examples[exampleIdx].highlight
                  ? section.examples[exampleIdx].en.split(new RegExp(`(${section.examples[exampleIdx].highlight})`, 'i')).map((part, pi) =>
                      part.toLowerCase() === section.examples[exampleIdx].highlight!.toLowerCase() ? (
                        <Text key={pi} style={styles.ruleHighlight}>{part}</Text>
                      ) : (
                        <Text key={pi}>{part}</Text>
                      ),
                    )
                  : section.examples[exampleIdx].en}
              </Text>
              <Text style={styles.ruleExampleTrLarge}>{section.examples[exampleIdx].tr}</Text>
              <Pressable onPress={() => speak(section.examples[exampleIdx].en)} style={styles.speakButtonSmall} hitSlop={12}>
                <Ionicons name="volume-high" size={20} color={palette.primary} />
              </Pressable>
            </Animated.View>

            {/* Mini dots for examples */}
            <View style={styles.miniDots}>
              {section.examples.map((_, i) => (
                <View key={i} style={[styles.miniDot, i <= exampleIdx && styles.miniDotActive]} />
              ))}
            </View>
          </>
        )}
      </View>
    );
  }

  function renderTipSection(section: Extract<LessonSection, { type: 'tip' }>) {
    return (
      <View style={styles.tipCard}>
        <View style={styles.tipHeader}>
          <Ionicons name="bulb" size={20} color={palette.warning} />
          <Text style={styles.tipTitle}>{section.title}</Text>
        </View>
        <Text style={styles.tipContent}>{section.content}</Text>
        {section.content_tr ? (
          <Text style={styles.tipContentTr}>{section.content_tr}</Text>
        ) : null}
      </View>
    );
  }

  function renderDialogueSection(section: Extract<LessonSection, { type: 'dialogue' }>) {
    const total = section.lines.length;
    const visibleCount = Math.min(stepIndex + 1, total); // reveal up to stepIndex

    return (
      <View>
        <Text style={styles.sectionTitle}>{section.title}</Text>
        <Text style={styles.stepCounter}>{visibleCount} / {total} lines</Text>
        {section.lines.slice(0, visibleCount).map((line, i) => {
          const isRight = i % 2 === 1;
          const isNewest = i === visibleCount - 1;
          return (
            <Animated.View
              key={i}
              entering={isNewest ? FadeInDown.duration(300) : undefined}
              style={[styles.dialogueRow, isRight && styles.dialogueRowRight]}
            >
              <Text style={styles.dialogueSpeaker}>{line.speaker}</Text>
              <View style={[styles.dialogueBubble, isRight && styles.dialogueBubbleRight]}>
                <Text style={styles.dialogueText}>{line.text}</Text>
                <Pressable onPress={() => speak(line.text)} style={styles.speakButtonInline} hitSlop={8}>
                  <Ionicons name="volume-medium" size={16} color={isRight ? palette.primaryLight : palette.textMuted} />
                </Pressable>
              </View>
              <Text style={[styles.dialogueTranslation, isRight && { textAlign: 'right' }]}>
                {line.translation}
              </Text>
            </Animated.View>
          );
        })}
      </View>
    );
  }

  function renderExercisePlaceholder() {
    return (
      <View style={styles.exercisePlaceholder}>
        <Ionicons name="create-outline" size={20} color={palette.textMuted} />
        <Text style={styles.exercisePlaceholderText}>
          Exercises for this lesson will be in the Practice stage.
        </Text>
      </View>
    );
  }

  function renderSection(section: LessonSection) {
    switch (section.type) {
      case 'vocab':
        return renderVocabSection(section);
      case 'rule':
        return renderRuleSection(section);
      case 'tip':
        return renderTipSection(section);
      case 'dialogue':
        return renderDialogueSection(section);
      case 'exercise':
        return renderExercisePlaceholder();
      default:
        return null;
    }
  }

  function renderLearnStage() {
    // NEW: Section-based rendering
    if (hasSectionBasedLearn) {
      const section = learnSections[currentSectionIndex];
      const totalSections = learnSections.length;
      const isLastSection = currentSectionIndex >= totalSections - 1;

      return (
        <>
          {/* Section progress bar */}
          <View style={styles.sectionProgressContainer}>
            <Text style={styles.sectionProgressText}>
              {currentSectionIndex + 1}/{totalSections}
            </Text>
            <View style={styles.sectionProgressBar}>
              <View
                style={[
                  styles.sectionProgressFill,
                  { width: `${((currentSectionIndex + 1) / totalSections) * 100}%` },
                ]}
              />
            </View>
          </View>

          {/* Lesson title on first section */}
          {currentSectionIndex === 0 && (
            <Animated.View entering={FadeInDown.delay(100).duration(400)} style={styles.titleSection}>
              <Text style={styles.title}>{lesson!.title}</Text>
              {lesson!.title_tr && (
                <Text style={styles.titleTr}>{lesson!.title_tr}</Text>
              )}
            </Animated.View>
          )}

          {/* Section content */}
          <Animated.View
            key={`section-${currentSectionIndex}`}
            entering={FadeInDown.delay(100).duration(400)}
            style={styles.sectionContent}
          >
            {renderSection(section)}
          </Animated.View>

          {/* Navigation button */}
          <Animated.View entering={FadeInUp.delay(200).duration(400)}>
            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                { width: '100%', flexDirection: 'row', justifyContent: 'center', gap: 8 },
                pressed && { transform: [{ scale: 0.97 }] },
              ]}
              onPress={advanceStepOrSection}
            >
              <Text style={styles.primaryButtonText}>
                {(() => {
                  const sec = learnSections[currentSectionIndex];
                  const totalSteps = getStepsForSection(sec);
                  const isLastStep = stepIndex >= totalSteps - 1;
                  if (isLastStep && isLastSection) return 'Continue to Watch';
                  if (isLastStep) return 'Next Section';
                  if (sec.type === 'vocab') return 'Next Word';
                  if (sec.type === 'rule') return stepIndex === 0 ? 'Show Examples' : 'Next Example';
                  if (sec.type === 'dialogue') return 'Next Line';
                  return 'Next';
                })()}
              </Text>
              <Ionicons name="arrow-forward" size={20} color="#fff" />
            </Pressable>
          </Animated.View>
        </>
      );
    }

    // FALLBACK: Old rendering (no sections)
    return (
      <>
        <Animated.View entering={FadeInDown.delay(100).duration(400)} style={styles.titleSection}>
          <Text style={styles.title}>{lesson!.title}</Text>
          {lesson!.title_tr && (
            <Text style={styles.titleTr}>{lesson!.title_tr}</Text>
          )}
        </Animated.View>

        {lesson!.grammar_pattern && (
          <Animated.View entering={FadeInDown.delay(200).duration(400)} style={styles.patternBox}>
            <Text style={styles.patternLabel}>Grammar Pattern</Text>
            <Text style={styles.patternText}>{lesson!.grammar_pattern}</Text>
          </Animated.View>
        )}

        {lesson!.grammar_explanation && (
          <Animated.View entering={FadeInDown.delay(300).duration(400)} style={styles.explanationCard}>
            <Text style={styles.explanationLabel}>Explanation</Text>
            <Text style={styles.explanationText}>{lesson!.grammar_explanation}</Text>
            {lesson!.grammar_explanation_tr && (
              <>
                <View style={styles.divider} />
                <Text style={styles.explanationLabel}>Aciklama (TR)</Text>
                <Text style={styles.explanationTextTr}>{lesson!.grammar_explanation_tr}</Text>
              </>
            )}
          </Animated.View>
        )}

        {lesson!.examples && lesson!.examples.length > 0 && (
          <Animated.View entering={FadeInDown.delay(400).duration(400)} style={styles.examplesCard}>
            <Text style={styles.sectionLabel}>Examples</Text>
            {lesson!.examples.map((ex, i) => (
              <View key={i} style={styles.exampleRow}>
                <Text style={styles.exampleBullet}>{i + 1}.</Text>
                <Text style={styles.exampleText}>{ex}</Text>
              </View>
            ))}
          </Animated.View>
        )}

        <Animated.View entering={FadeInUp.delay(500).duration(400)}>
          <Pressable
            style={({ pressed }) => [styles.primaryButton, { width: '100%', flexDirection: 'row', justifyContent: 'center', gap: 8 }, pressed && { transform: [{ scale: 0.97 }] }]}
            onPress={() => advanceTo('watch')}
          >
            <Text style={styles.primaryButtonText}>I understand, show me examples</Text>
            <Ionicons name="arrow-forward" size={20} color="#fff" />
          </Pressable>
        </Animated.View>
      </>
    );
  }

  // ── Stage 2: WATCH ─────────────────────────────────────────────

  function renderWatchStage() {
    if (clips.length === 0 || !courseData) {
      return (
        <>
          <Animated.View entering={FadeInDown.delay(100).duration(400)} style={styles.placeholderCard}>
            <Ionicons name="videocam" size={32} color={palette.primary} />
            <Text style={styles.placeholderTitle}>No Clips Yet</Text>
            <Text style={styles.placeholderText}>
              Video clips for this lesson haven't been added yet.
            </Text>
          </Animated.View>
          <Pressable
            style={({ pressed }) => [styles.primaryButton, { width: '100%' }, pressed && { transform: [{ scale: 0.97 }] }]}
            onPress={() => advanceTo('practice')}
          >
            <Text style={styles.primaryButtonText}>Continue to Practice</Text>
          </Pressable>
        </>
      );
    }

    // Use the full CoursePlayer component — same experience as "Dersler" tab
    return null; // CoursePlayer renders as a full-screen component, handled below
  }

  // ── Stage 3: PRACTICE ──────────────────────────────────────────

  // Use section exercises if available, else fallback quiz
  const useSectionExercises = sectionExercises !== null && sectionExercises.length > 0;
  const practiceItems = useSectionExercises ? sectionExercises : null;
  const practiceTotal = useSectionExercises ? practiceItems!.length : quiz.length;

  function handleOptionSelect(option: string) {
    if (selectedOption !== null) return; // Already answered
    setSelectedOption(option);

    let isCorrect = false;
    if (useSectionExercises) {
      const currentItem = practiceItems![quizIndex];
      isCorrect = option === currentItem.options[currentItem.correct];
    } else {
      const currentQ = quiz[quizIndex];
      isCorrect = option.toLowerCase() === currentQ.answer.toLowerCase();
    }

    if (isCorrect) {
      setQuizScore((s) => s + 1);
    }

    // Auto-advance after a short delay
    setTimeout(() => {
      if (quizIndex + 1 < practiceTotal) {
        setQuizIndex((i) => i + 1);
        setSelectedOption(null);
      } else {
        setQuizDone(true);
      }
    }, 800);
  }

  function renderPracticeStage() {
    if (practiceTotal === 0) {
      return (
        <>
          <Animated.View entering={FadeInDown.delay(100).duration(400)} style={styles.placeholderCard}>
            <Ionicons name="create" size={32} color={palette.primary} />
            <Text style={styles.placeholderTitle}>No Exercises Yet</Text>
            <Text style={styles.placeholderText}>
              This lesson does not have example sentences to generate exercises from.
            </Text>
          </Animated.View>
          <Pressable
            style={({ pressed }) => [styles.primaryButton, pressed && { transform: [{ scale: 0.97 }] }]}
            onPress={() => advanceTo('reinforce')}
          >
            <Text style={styles.primaryButtonText}>Continue</Text>
          </Pressable>
        </>
      );
    }

    if (quizDone) {
      const percent = Math.round((quizScore / practiceTotal) * 100);
      const passed = percent >= 80;

      return (
        <>
          <Animated.View entering={ZoomIn.duration(400)} style={styles.resultCard}>
            {passed ? (
              <Ionicons name="checkmark-circle" size={48} color={palette.success} style={{ marginBottom: 12 }} />
            ) : (
              <Ionicons name="refresh" size={48} color={palette.warning} style={{ marginBottom: 12 }} />
            )}
            <Text style={[styles.resultTitle, !passed && { color: palette.warning }]}>
              {passed ? 'Great job!' : 'Keep practicing!'}
            </Text>
            <Text style={styles.resultScore}>
              {quizScore}/{practiceTotal} correct ({percent}%)
            </Text>
            {!passed && (
              <Text style={styles.resultHint}>
                You need 80% or higher to advance. Try again!
              </Text>
            )}
          </Animated.View>

          {passed ? (
            <Pressable
              style={({ pressed }) => [styles.primaryButton, pressed && { transform: [{ scale: 0.97 }] }]}
              onPress={() => {
                updateLessonMastery(lessonId!, { practiceScore: percent, practiceAttempts: 1 });
                advanceTo('reinforce');
              }}
            >
              <Text style={styles.primaryButtonText}>Continue</Text>
            </Pressable>
          ) : (
            <Pressable
              style={({ pressed }) => [styles.secondaryButton, pressed && { transform: [{ scale: 0.97 }] }]}
              onPress={() => {
                setQuizIndex(0);
                setQuizScore(0);
                setSelectedOption(null);
                setQuizDone(false);
              }}
            >
              <Text style={styles.secondaryButtonText}>Try Again</Text>
            </Pressable>
          )}
        </>
      );
    }

    // Section-based exercises
    if (useSectionExercises) {
      const currentItem = practiceItems![quizIndex];

      return (
        <>
          <Animated.View entering={FadeInDown.delay(100).duration(400)} style={styles.titleSection}>
            <Text style={styles.title}>Practice</Text>
            <Text style={styles.description}>Choose the correct answer.</Text>
          </Animated.View>

          <View style={styles.quizProgress}>
            <View style={[styles.quizProgressFill, { width: `${(quizIndex / practiceTotal) * 100}%` }]} />
          </View>
          <Text style={styles.quizCounter}>
            Question {quizIndex + 1} of {practiceTotal}
          </Text>

          <Animated.View
            key={quizIndex}
            entering={FadeInDown.duration(300)}
            style={styles.quizCard}
          >
            <Text style={styles.quizSentence}>{currentItem.question}</Text>
            {currentItem.hint && (
              <Text style={styles.quizHint}>{currentItem.hint}</Text>
            )}
          </Animated.View>

          <View style={styles.optionsGrid}>
            {currentItem.options.map((opt, i) => {
              const isSelected = selectedOption === opt;
              const isCorrect = i === currentItem.correct;
              const showResult = selectedOption !== null;

              let optionStyle = styles.optionButton;
              let textStyle = styles.optionText;

              if (showResult && isCorrect) {
                optionStyle = { ...styles.optionButton, ...styles.optionCorrect };
                textStyle = { ...styles.optionText, ...styles.optionTextCorrect };
              } else if (showResult && isSelected && !isCorrect) {
                optionStyle = { ...styles.optionButton, ...styles.optionWrong };
                textStyle = { ...styles.optionText, ...styles.optionTextWrong };
              }

              return (
                <Pressable
                  key={i}
                  style={optionStyle}
                  onPress={() => handleOptionSelect(opt)}
                  disabled={selectedOption !== null}
                >
                  <Text style={textStyle}>{opt}</Text>
                </Pressable>
              );
            })}
          </View>
        </>
      );
    }

    // Fallback: auto-generated quiz from examples
    const currentQ = quiz[quizIndex];

    return (
      <>
        <Animated.View entering={FadeInDown.delay(100).duration(400)} style={styles.titleSection}>
          <Text style={styles.title}>Practice</Text>
          <Text style={styles.description}>Fill in the blank with the correct word.</Text>
        </Animated.View>

        <View style={styles.quizProgress}>
          <View style={[styles.quizProgressFill, { width: `${((quizIndex) / quiz.length) * 100}%` }]} />
        </View>
        <Text style={styles.quizCounter}>
          Question {quizIndex + 1} of {quiz.length}
        </Text>

        <Animated.View
          key={quizIndex}
          entering={FadeInDown.duration(300)}
          style={styles.quizCard}
        >
          <Text style={styles.quizSentence}>{currentQ.blanked}</Text>
        </Animated.View>

        <View style={styles.optionsGrid}>
          {currentQ.options.map((opt, i) => {
            const isSelected = selectedOption === opt;
            const isCorrect = opt.toLowerCase() === currentQ.answer.toLowerCase();
            const showResult = selectedOption !== null;

            let optionStyle = styles.optionButton;
            let textStyle = styles.optionText;

            if (showResult && isCorrect) {
              optionStyle = { ...styles.optionButton, ...styles.optionCorrect };
              textStyle = { ...styles.optionText, ...styles.optionTextCorrect };
            } else if (showResult && isSelected && !isCorrect) {
              optionStyle = { ...styles.optionButton, ...styles.optionWrong };
              textStyle = { ...styles.optionText, ...styles.optionTextWrong };
            }

            return (
              <Pressable
                key={i}
                style={optionStyle}
                onPress={() => handleOptionSelect(opt)}
                disabled={selectedOption !== null}
              >
                <Text style={textStyle}>{opt}</Text>
              </Pressable>
            );
          })}
        </View>
      </>
    );
  }

  // ── Stage 4: REINFORCE ─────────────────────────────────────────

  function renderReinforceStage() {
    return (
      <>
        <Animated.View entering={FadeInDown.delay(100).duration(400)} style={styles.titleSection}>
          <Text style={styles.title}>Reinforce</Text>
          <Text style={styles.description}>
            Strengthen your understanding by watching more examples.
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(200).duration(400)} style={styles.placeholderCard}>
          <Ionicons name="refresh" size={32} color={palette.primary} />
          <Text style={styles.placeholderTitle}>Free Watching</Text>
          <Text style={styles.placeholderText}>
            Watch more clips to reinforce this pattern.
          </Text>
        </Animated.View>

        <Animated.View entering={FadeInUp.delay(300).duration(400)}>
          <Pressable
            style={({ pressed }) => [styles.primaryButton, pressed && { transform: [{ scale: 0.97 }] }]}
            onPress={() => advanceTo('mastered')}
          >
            <Text style={styles.primaryButtonText}>Complete Lesson</Text>
          </Pressable>
        </Animated.View>
      </>
    );
  }

  // ── Stage 5: MASTERED ──────────────────────────────────────────

  function retakeLesson() {
    setStage('learn');
    setCurrentSectionIndex(0);
    setStepIndex(0);
    setWatchClipIndex(0);
    setQuizIndex(0);
    setQuizScore(0);
    setSelectedOption(null);
    setQuizDone(false);
    if (lessonId) {
      updateLessonMastery(lessonId, { stage: 'learn' });
    }
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
  }

  function renderMasteredStage() {
    return (
      <View style={styles.centered}>
        <Animated.View entering={ZoomIn.duration(500)} style={styles.completionCard}>
          <Ionicons name="trophy" size={48} color={palette.xp} style={{ marginBottom: 16 }} />
          <Text style={styles.completedTitle}>Lesson Mastered!</Text>
          <Text style={styles.completedSubtitle}>{lesson!.title}</Text>
          <Animated.View entering={ZoomIn.delay(200).duration(400)} style={styles.xpPill}>
            <Text style={styles.xpPillText}>+{XP_PER_LESSON} XP</Text>
          </Animated.View>
          <Pressable
            style={({ pressed }) => [styles.primaryButton, { width: '100%' }, pressed && { transform: [{ scale: 0.97 }] }]}
            onPress={() => router.back()}
          >
            <Text style={styles.primaryButtonText}>Back to Lessons</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.secondaryButton, { width: '100%', marginTop: 12 }, pressed && { transform: [{ scale: 0.97 }] }]}
            onPress={retakeLesson}
          >
            <Ionicons name="refresh" size={18} color={palette.primary} style={{ marginRight: 6 }} />
            <Text style={styles.secondaryButtonText}>Retake Lesson</Text>
          </Pressable>
        </Animated.View>
      </View>
    );
  }

  // ── Main render ────────────────────────────────────────────────

  function renderStageContent() {
    switch (stage) {
      case 'learn':
        return renderLearnStage();
      case 'watch':
        return renderWatchStage();
      case 'practice':
        return renderPracticeStage();
      case 'reinforce':
        return renderReinforceStage();
      case 'mastered':
        return renderMasteredStage();
      default:
        return renderLearnStage();
    }
  }

  // WATCH stage — uses the EXACT same CoursePlayer as "Dersler" tab
  if (stage === 'watch' && courseData) {
    return (
      <CoursePlayer
        course={courseData}
        onComplete={() => advanceTo('practice')}
        onBack={() => {
          setStage('learn');
          if (lessonId) updateLessonMastery(lessonId, { stage: 'learn' });
        }}
      />
    );
  }

  if (stage === 'mastered') {
    return (
      <View style={[styles.container, styles.content]}>
        <Animated.View entering={FadeInDown.duration(400)} style={styles.topBar}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Text style={styles.backBtn}>{'←'}</Text>
          </Pressable>
          <View style={styles.modeBadge}>
            <Text style={styles.modeBadgeText}>{activeMode === 'vocab' ? 'VOCAB' : activeMode === 'learn' ? 'LEARN' : activeMode === 'watch' ? 'WATCH' : STAGE_LABELS[stage]}</Text>
          </View>
          <View style={{ width: 24 }} />
        </Animated.View>
        {renderProgressDots()}
        {renderMasteredStage()}
      </View>
    );
  }

  return (
    <ScrollView ref={scrollViewRef} style={styles.container} contentContainerStyle={styles.content}>
      <Animated.View entering={FadeInDown.duration(400)} style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.backBtn}>{'←'}</Text>
        </Pressable>
        <View style={styles.modeBadge}>
          <Text style={styles.modeBadgeText}>{activeMode === 'vocab' ? 'VOCAB' : activeMode === 'learn' ? 'LEARN' : activeMode === 'watch' ? 'WATCH' : STAGE_LABELS[stage]}</Text>
        </View>
        <View style={{ width: 24 }} />
      </Animated.View>

      {renderProgressDots()}
      {renderStageContent()}
    </ScrollView>
  );
}

// ── Styles ───────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.bg,
  },
  content: {
    padding: 20,
    paddingTop: Platform.OS === 'web' ? 20 : 56,
    paddingBottom: 40,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 15,
    color: palette.textSecondary,
  },

  // Top bar
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  backBtn: {
    fontSize: 24,
    color: palette.primary,
    fontWeight: '600',
  },
  modeBadge: {
    backgroundColor: palette.primarySoft,
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: Radius.full,
  },
  modeBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: palette.primary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },

  // Progress dots
  progressDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-start',
    marginBottom: 24,
    gap: 0,
  },
  dotWrapper: {
    alignItems: 'center',
    position: 'relative',
    width: 60,
  },
  dot: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: palette.bgSurface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: palette.border,
  },
  dotActive: {
    backgroundColor: palette.primarySoft,
    borderColor: palette.primary,
  },
  dotComplete: {
    backgroundColor: palette.success,
    borderColor: palette.success,
  },
  dotCheck: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '700',
  },
  dotNumber: {
    fontSize: 13,
    fontWeight: '700',
    color: palette.textMuted,
  },
  dotNumberActive: {
    color: palette.primary,
  },
  dotLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: palette.textMuted,
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  dotLabelActive: {
    color: palette.primary,
  },
  dotLabelComplete: {
    color: palette.success,
  },
  dotConnector: {
    position: 'absolute',
    top: 15,
    left: 46,
    width: 28,
    height: 3,
    backgroundColor: palette.border,
  },
  dotConnectorComplete: {
    backgroundColor: palette.success,
  },

  // Title section
  titleSection: {
    marginBottom: 20,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: palette.textPrimary,
    marginBottom: 4,
    letterSpacing: -0.3,
  },
  titleTr: {
    fontSize: 16,
    color: palette.textSecondary,
    fontStyle: 'italic',
    marginBottom: 4,
  },
  description: {
    fontSize: 15,
    color: palette.textSecondary,
    lineHeight: 22,
  },

  // Grammar pattern box
  patternBox: {
    backgroundColor: palette.primarySoft,
    borderRadius: Radius.md,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: palette.borderAccent,
    borderLeftWidth: 4,
    borderLeftColor: palette.primary,
  },
  patternLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: palette.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  patternText: {
    fontSize: 20,
    fontWeight: '700',
    color: palette.textPrimary,
    lineHeight: 28,
  },

  // Explanation card
  explanationCard: {
    backgroundColor: palette.bgCard,
    borderRadius: Radius.lg,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: palette.border,
  },
  explanationLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: palette.accent,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  explanationText: {
    fontSize: 15,
    color: palette.textPrimary,
    lineHeight: 24,
  },
  explanationTextTr: {
    fontSize: 15,
    color: palette.textSecondary,
    lineHeight: 24,
    fontStyle: 'italic',
  },
  divider: {
    height: 1,
    backgroundColor: palette.border,
    marginVertical: 16,
  },

  // Examples card
  examplesCard: {
    backgroundColor: palette.bgCard,
    borderRadius: Radius.lg,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: palette.border,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: palette.xp,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  exampleRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  exampleBullet: {
    fontSize: 14,
    color: palette.textMuted,
    fontWeight: '600',
    width: 24,
  },
  exampleText: {
    fontSize: 15,
    color: palette.textPrimary,
    lineHeight: 22,
    flex: 1,
  },

  // Placeholder card (Watch / Reinforce)
  placeholderCard: {
    backgroundColor: palette.bgCard,
    borderRadius: Radius.xl,
    padding: 32,
    marginBottom: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: palette.border,
  },
  placeholderIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  placeholderTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: palette.textPrimary,
    marginBottom: 8,
  },
  placeholderText: {
    fontSize: 14,
    color: palette.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 16,
  },

  // Watch stage
  videoContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: Radius.md,
    overflow: 'hidden',
    backgroundColor: '#000',
    marginBottom: 16,
  },
  nativePlayerPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.bgElevated,
  },
  movieBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: palette.bgSurface,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
    marginBottom: 12,
  },
  movieBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: palette.textSecondary,
  },
  subtitleCard: {
    backgroundColor: palette.bgCard,
    borderRadius: Radius.md,
    padding: 16,
    borderWidth: 1,
    borderColor: palette.border,
    marginBottom: 16,
  },
  subtitleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  subtitleHeaderText: {
    fontSize: 12,
    fontWeight: '700',
    color: palette.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  subtitleLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
  },
  subtitleSpeaker: {
    fontSize: 11,
    fontWeight: '700',
    color: palette.primary,
    width: 60,
    marginRight: 8,
  },
  subtitleText: {
    flex: 1,
    fontSize: 14,
    color: palette.textPrimary,
    lineHeight: 20,
  },
  watchNav: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  clipCountBadge: {
    backgroundColor: palette.bgSurface,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: Radius.full,
  },
  clipCountText: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.textSecondary,
  },

  // Quiz / Practice
  quizProgress: {
    height: 4,
    backgroundColor: palette.bgSurface,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 8,
  },
  quizProgressFill: {
    height: '100%',
    backgroundColor: palette.primary,
    borderRadius: 2,
  },
  quizCounter: {
    fontSize: 13,
    color: palette.textMuted,
    fontWeight: '600',
    marginBottom: 20,
    textAlign: 'center',
  },
  quizCard: {
    backgroundColor: palette.bgCard,
    borderRadius: Radius.lg,
    padding: 24,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: 'center',
  },
  quizSentence: {
    fontSize: 18,
    fontWeight: '600',
    color: palette.textPrimary,
    lineHeight: 28,
    textAlign: 'center',
  },
  optionsGrid: {
    gap: 12,
    marginBottom: 24,
  },
  optionButton: {
    backgroundColor: palette.bgElevated,
    borderRadius: Radius.sm,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderWidth: 1.5,
    borderColor: palette.border,
    alignItems: 'center',
  },
  optionText: {
    fontSize: 16,
    fontWeight: '600',
    color: palette.textPrimary,
  },
  optionCorrect: {
    backgroundColor: palette.successSoft,
    borderColor: palette.success,
  },
  optionTextCorrect: {
    color: palette.success,
  },
  optionWrong: {
    backgroundColor: palette.errorSoft,
    borderColor: palette.error,
  },
  optionTextWrong: {
    color: palette.error,
  },

  // Results
  resultCard: {
    backgroundColor: palette.bgCard,
    borderRadius: Radius.xl,
    padding: 32,
    marginBottom: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: palette.border,
  },
  resultEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  resultTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: palette.success,
    marginBottom: 8,
  },
  resultScore: {
    fontSize: 18,
    fontWeight: '600',
    color: palette.textPrimary,
    marginBottom: 8,
  },
  resultHint: {
    fontSize: 14,
    color: palette.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Completion (Mastered)
  completionCard: {
    backgroundColor: palette.bgCard,
    borderRadius: Radius.xxl,
    padding: 36,
    alignItems: 'center',
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
    borderColor: palette.border,
  },
  completedEmoji: {
    fontSize: 56,
    marginBottom: 16,
  },
  completedTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: palette.success,
    marginBottom: 8,
  },
  completedSubtitle: {
    fontSize: 16,
    color: palette.textSecondary,
    marginBottom: 20,
    textAlign: 'center',
  },
  xpPill: {
    backgroundColor: palette.xpGlow,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: Radius.full,
    marginBottom: 28,
  },
  xpPillText: {
    fontSize: 18,
    fontWeight: '800',
    color: palette.xp,
  },

  // Buttons
  primaryButton: {
    paddingVertical: 16,
    minHeight: 52,
    borderRadius: Radius.sm,
    backgroundColor: palette.primary,
    alignItems: 'center',
    ...Shadows.button,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  secondaryButton: {
    paddingVertical: 16,
    borderRadius: Radius.sm,
    backgroundColor: palette.bgSurface,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: palette.border,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: palette.primary,
  },

  // Error
  errorEmoji: {
    fontSize: 48,
    marginBottom: 12,
    color: palette.error,
    fontWeight: '800',
  },
  errorText: {
    fontSize: 18,
    color: palette.error,
    textAlign: 'center',
    fontWeight: '600',
    marginBottom: 24,
  },

  // ── Section-based Learn styles ─────────────────────────────────

  // Section progress
  sectionProgressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 10,
  },
  sectionProgressText: {
    fontSize: 12,
    fontWeight: '700',
    color: palette.textMuted,
    minWidth: 28,
  },
  sectionProgressBar: {
    flex: 1,
    height: 3,
    backgroundColor: palette.bgSurface,
    borderRadius: 2,
    overflow: 'hidden',
  },
  sectionProgressFill: {
    height: '100%',
    backgroundColor: palette.primary,
    borderRadius: 2,
  },

  sectionContent: {
    marginBottom: 24,
  },

  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: palette.textPrimary,
    marginBottom: 16,
  },

  // Vocab section
  vocabGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  vocabCard: {
    backgroundColor: palette.bgElevated,
    borderRadius: Radius.md,
    padding: 16,
    borderWidth: 1,
    borderColor: palette.border,
    width: '47%',
    flexGrow: 1,
  },
  vocabWord: {
    fontSize: 18,
    fontWeight: '700',
    color: palette.primary,
    marginBottom: 4,
  },
  vocabTranslation: {
    fontSize: 14,
    color: palette.textSecondary,
    marginBottom: 8,
  },
  vocabExample: {
    fontSize: 13,
    color: palette.textMuted,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  vocabExampleTr: {
    fontSize: 12,
    color: palette.textMuted,
    fontStyle: 'italic',
    lineHeight: 16,
    marginTop: 2,
  },

  // Vocab single-card (step-by-step)
  vocabSingle: {
    backgroundColor: palette.bgElevated,
    borderRadius: Radius.xl,
    padding: 28,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: 'center',
    marginBottom: 16,
  },
  vocabWordLarge: {
    fontSize: 32,
    fontWeight: '800',
    color: palette.primary,
    marginBottom: 4,
    textAlign: 'center',
  },
  vocabIpa: {
    fontSize: 16,
    color: palette.textMuted,
    fontStyle: 'italic',
    marginBottom: 12,
  },
  vocabDivider: {
    width: 40,
    height: 2,
    backgroundColor: palette.border,
    borderRadius: 1,
    marginBottom: 12,
  },
  vocabTranslationLarge: {
    fontSize: 22,
    fontWeight: '600',
    color: palette.textSecondary,
    marginBottom: 16,
    textAlign: 'center',
  },
  vocabExampleBox: {
    backgroundColor: palette.bgSurface,
    borderRadius: Radius.md,
    padding: 16,
    width: '100%',
  },
  vocabExampleLarge: {
    fontSize: 15,
    color: palette.textPrimary,
    fontStyle: 'italic',
    lineHeight: 22,
    textAlign: 'center',
  },
  vocabExampleTrLarge: {
    fontSize: 13,
    color: palette.textMuted,
    fontStyle: 'italic',
    lineHeight: 18,
    textAlign: 'center',
    marginTop: 4,
  },
  speakButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: palette.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 8,
  },
  speakButtonSmall: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: palette.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  speakButtonInline: {
    marginLeft: 8,
    padding: 4,
  },
  stepCounter: {
    fontSize: 13,
    fontWeight: '600',
    color: palette.textMuted,
    textAlign: 'center',
    marginBottom: 16,
  },
  miniDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  miniDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.bgSurface,
  },
  miniDotActive: {
    backgroundColor: palette.primary,
  },

  // Rule single example (step-by-step)
  ruleExampleSingle: {
    backgroundColor: palette.bgElevated,
    borderRadius: Radius.lg,
    padding: 24,
    borderWidth: 1,
    borderColor: palette.border,
    alignItems: 'center',
    marginBottom: 12,
  },
  ruleExampleEnLarge: {
    fontSize: 20,
    fontWeight: '600',
    color: palette.textPrimary,
    lineHeight: 30,
    textAlign: 'center',
    marginBottom: 8,
  },
  ruleExampleTrLarge: {
    fontSize: 15,
    color: palette.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
  },

  // Rule section
  ruleExplanation: {
    fontSize: 15,
    color: palette.textPrimary,
    lineHeight: 24,
    marginBottom: 4,
  },
  ruleExplanationTr: {
    fontSize: 14,
    color: palette.textSecondary,
    fontStyle: 'italic',
    lineHeight: 22,
    marginBottom: 8,
  },
  ruleExampleRow: {
    marginBottom: 12,
  },
  ruleExampleEn: {
    fontSize: 15,
    color: palette.textPrimary,
    lineHeight: 22,
  },
  ruleHighlight: {
    color: palette.primary,
    fontWeight: '700',
  },
  ruleExampleTr: {
    fontSize: 13,
    color: palette.textSecondary,
    fontStyle: 'italic',
    lineHeight: 20,
  },

  // Tip section
  tipCard: {
    backgroundColor: palette.bgElevated,
    borderRadius: Radius.md,
    padding: 16,
    borderWidth: 1,
    borderColor: palette.border,
    borderLeftWidth: 4,
    borderLeftColor: palette.warning,
  },
  tipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  tipTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: palette.warning,
  },
  tipContent: {
    fontSize: 15,
    color: palette.textPrimary,
    lineHeight: 22,
  },
  tipContentTr: {
    fontSize: 14,
    color: palette.textSecondary,
    fontStyle: 'italic',
    lineHeight: 20,
    marginTop: 6,
  },

  // Dialogue section
  dialogueRow: {
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  dialogueRowRight: {
    alignItems: 'flex-end',
  },
  dialogueSpeaker: {
    fontSize: 11,
    fontWeight: '700',
    color: palette.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  dialogueBubble: {
    backgroundColor: palette.bgElevated,
    borderRadius: Radius.md,
    padding: 12,
    maxWidth: '80%',
    borderWidth: 1,
    borderColor: palette.border,
    flexDirection: 'row',
    alignItems: 'center',
  },
  dialogueBubbleRight: {
    backgroundColor: palette.primarySoft,
    borderColor: palette.borderAccent,
  },
  dialogueText: {
    flex: 1,
    fontSize: 15,
    color: palette.textPrimary,
    lineHeight: 22,
  },
  dialogueTranslation: {
    fontSize: 12,
    color: palette.textMuted,
    fontStyle: 'italic',
    marginTop: 4,
  },

  // Exercise placeholder
  exercisePlaceholder: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: palette.bgSurface,
    borderRadius: Radius.sm,
    padding: 14,
  },
  exercisePlaceholderText: {
    fontSize: 13,
    color: palette.textMuted,
    flex: 1,
  },

  // Quiz hint (for section exercises)
  quizHint: {
    fontSize: 13,
    color: palette.textMuted,
    fontStyle: 'italic',
    marginTop: 8,
    textAlign: 'center',
  },
});
