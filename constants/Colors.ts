// ─── Dark Professional Design System ───────────────────────────
// A premium dark theme with neon accents and depth

const palette = {
  // Primary — Electric violet
  primary: '#7C6AFF',
  primaryLight: '#A594FF',
  primaryDark: '#5B4AE0',
  primarySoft: 'rgba(124, 106, 255, 0.12)',
  primaryGlow: 'rgba(124, 106, 255, 0.30)',

  // Accent — Neon cyan
  accent: '#00D4AA',
  accentLight: '#5DFFC8',
  accentSoft: 'rgba(0, 212, 170, 0.12)',

  // Success — Bright emerald
  success: '#00E59B',
  successLight: '#5DFFC8',
  successSoft: 'rgba(0, 229, 155, 0.12)',
  successGlow: 'rgba(0, 229, 155, 0.30)',

  // Warning — Warm amber
  warning: '#FFB84D',
  warningDark: '#E69A2E',
  warningSoft: 'rgba(255, 184, 77, 0.12)',

  // Error — Soft coral
  error: '#FF6B6B',
  errorSoft: 'rgba(255, 107, 107, 0.12)',

  // XP — Vivid orange-gold
  xp: '#FFB347',
  xpGlow: 'rgba(255, 179, 71, 0.20)',

  // Streak — Hot orange
  streak: '#FF6348',

  // ─── Dark Neutrals ───
  white: '#FFFFFF',

  // Background layers (darkest → lightest)
  bg: '#0B0D17',
  bgCard: '#141726',
  bgElevated: '#1A1E35',
  bgSurface: '#1F2440',
  bgInput: '#252A4A',

  // Text hierarchy
  textPrimary: '#ECEEF8',
  textSecondary: '#8B90B0',
  textMuted: '#5C6088',
  textDisabled: '#3D4168',

  // Borders
  border: '#252A4A',
  borderLight: '#1F2340',
  borderAccent: 'rgba(124, 106, 255, 0.3)',

  // Legacy aliases for compatibility
  gray50: '#0B0D17',
  gray100: '#141726',
  gray200: '#1F2440',
  gray300: '#252A4A',
  gray400: '#5C6088',
  gray500: '#8B90B0',
  gray600: '#A8ADCC',
  gray700: '#C8CCE8',
  gray800: '#DDDFF0',
  gray900: '#ECEEF8',
  bgPrimary: '#0B0D17',
  shadowColor: 'rgba(0, 0, 0, 0.4)',
  shadowDark: 'rgba(0, 0, 0, 0.3)',
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
