import { getLesson, getLessonSentences } from '@/lib/db';
import { notFound } from 'next/navigation';
import LessonEditor from '@/components/LessonEditor';

export const dynamic = 'force-dynamic';

export default async function LessonDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lesson = getLesson(Number(id));
  if (!lesson) notFound();
  const sentences = getLessonSentences(Number(id));
  return <LessonEditor lesson={lesson} initialSentences={sentences} />;
}
