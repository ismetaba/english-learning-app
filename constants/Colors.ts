// ─── Dark Professional Design System ───────────────────────────
// A premium dark theme with refined accents and clear depth

const palette = {
  // Primary — Soft violet
  primary: '#8577FF',
  primaryLight: '#A99CFF',
  primaryDark: '#6A5CE0',
  primarySoft: 'rgba(133, 119, 255, 0.12)',
  primaryGlow: 'rgba(133, 119, 255, 0.25)',

  // Accent — Refined cyan
  accent: '#06D6B0',
  accentLight: '#5DFFC8',
  accentSoft: 'rgba(6, 214, 176, 0.12)',

  // Success — Muted emerald
  success: '#10B981',
  successLight: '#6EE7B7',
  successSoft: 'rgba(16, 185, 129, 0.12)',
  successGlow: 'rgba(16, 185, 129, 0.25)',

  // Warning — Warm amber
  warning: '#F59E0B',
  warningDark: '#D97706',
  warningSoft: 'rgba(245, 158, 11, 0.12)',

  // Error — Coral
  error: '#EF4444',
  errorSoft: 'rgba(239, 68, 68, 0.12)',

  // XP — Vivid orange-gold
  xp: '#FFB347',
  xpGlow: 'rgba(255, 179, 71, 0.18)',

  // Streak — Hot orange
  streak: '#FF6348',

  // ─── Dark Neutrals ───
  white: '#FFFFFF',

  // Background layers (darkest → lightest, ~10-12% steps)
  bg: '#080A14',
  bgCard: '#111827',
  bgElevated: '#1A2238',
  bgSurface: '#222D47',
  bgInput: '#2C3756',

  // Text hierarchy (clear contrast steps)
  textPrimary: '#F1F3FF',
  textSecondary: '#94A0C4',
  textMuted: '#5E6B8A',
  textDisabled: '#3E4A6A',

  // Borders
  border: '#1E2A42',
  borderLight: '#172035',
  borderAccent: 'rgba(133, 119, 255, 0.3)',

  // Legacy aliases for compatibility
  gray50: '#080A14',
  gray100: '#111827',
  gray200: '#222D47',
  gray300: '#2C3756',
  gray400: '#5E6B8A',
  gray500: '#94A0C4',
  gray600: '#A8ADCC',
  gray700: '#C8CCE8',
  gray800: '#DDDFF0',
  gray900: '#F1F3FF',
  bgPrimary: '#080A14',
  shadowColor: 'rgba(0, 0, 0, 0.5)',
  shadowDark: 'rgba(0, 0, 0, 0.35)',
};

const unitColors = {
  unit1: '#7C6AFF',
  unit2: '#00D4AA',
  unit3: '#FFB347',
  unit4: '#FF6B8A',
  unit5: '#47C9FF',
};

export { palette, unitColors };

export default {
  light: {
    text: palette.textPrimary,
    textSecondary: palette.textSecondary,
    background: palette.bg,
    tint: palette.primary,
    tabIconDefault: palette.textMuted,
    tabIconSelected: palette.primary,
    card: palette.bgCard,
    border: palette.border,
  },
  dark: {
    text: palette.textPrimary,
    textSecondary: palette.textSecondary,
    background: palette.bg,
    tint: palette.primaryLight,
    tabIconDefault: palette.textMuted,
    tabIconSelected: palette.primaryLight,
    card: palette.bgCard,
    border: palette.border,
  },
};

export const BlockColors: Record<string, string> = {
  subject: '#7C6AFF',
  verb: '#FF6B6B',
  object: '#00D4AA',
  adjective: '#FFB347',
  adverb: '#A594FF',
  preposition: '#47C9FF',
  article: '#7B82A8',
  conjunction: '#FF6B8A',
  pronoun: '#5EA8FF',
  complement: '#FF8ED4',
  auxiliary: '#FFB347',
  negative: '#8B90B0',
  question_word: '#5DFFC8',
};

export const LevelColors: Record<string, string> = {
  beginner: '#00D4AA',
  elementary: '#47C9FF',
  intermediate: '#FFB347',
  upperIntermediate: '#FF6B8A',
  advanced: '#FF6B6B',
};

export const Shadows = {
  card: {
    shadowColor: 'rgba(0, 0, 0, 0.5)',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 24,
    elevation: 8,
  },
  cardSmall: {
    shadowColor: 'rgba(0, 0, 0, 0.4)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 4,
  },
  button: {
    shadowColor: palette.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 6,
  },
  glow: (color: string) => ({
    shadowColor: color,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 6,
  }),
};

export const Radius = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  full: 999,
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};
