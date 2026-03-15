import { useAppContext } from '@/contexts/AppStateContext';
import { uiTranslations, Language } from '@/i18n';

export function useTranslation() {
  const { nativeLanguage } = useAppContext();

  const t = (key: string): string => {
    const translations = uiTranslations[nativeLanguage];
    if (translations && translations[key]) return translations[key];
    // Fallback to Turkish, then return the key itself
    const fallback = uiTranslations['tr'];
    if (fallback && fallback[key]) return fallback[key];
    return key;
  };

  return { t, language: nativeLanguage };
}
