import { getLesson, getLessonSentences } from '@/lib/db';
import { notFound } from 'next/navigation';
import LessonPreview from '@/components/LessonPreview';

export const dynamic = 'force-dynamic';

export default async function LessonPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lesson = getLesson(Number(id));
  if (!lesson) notFound();
  const sentences = getLessonSentences(Number(id));

  const parsed = sentences.map(s => ({
    ...s,
    grammar_annotations: s.grammar_annotations ? JSON.parse(s.grammar_annotations) : [],
    translations: s.translations ? JSON.parse(s.translations) : [],
  }));

  return <LessonPreview lesson={{ ...lesson, sentences: parsed as any }} />;
}
