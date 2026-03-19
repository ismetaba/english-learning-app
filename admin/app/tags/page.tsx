import { getAllTags } from '@/lib/db';
import TagManager from '@/components/TagManager';

export const dynamic = 'force-dynamic';

export default function TagsPage() {
  const tags = getAllTags();

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-xl font-semibold tracking-tight">Tags</h1>
        <p className="text-sm text-zinc-500 mt-1">Organize clips by vocabulary, grammar, and topic</p>
      </div>
      <TagManager initialTags={tags} />
    </div>
  );
}
