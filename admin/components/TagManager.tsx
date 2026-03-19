'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Tag {
  id: number;
  name: string;
  category: string;
}

const categoryConfig: Record<string, { label: string; color: string; bg: string }> = {
  vocab: { label: 'Vocabulary', color: 'text-violet-400', bg: 'bg-violet-500/10 border-violet-500/20' },
  grammar: { label: 'Grammar', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
  topic: { label: 'Topics', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
};

export default function TagManager({ initialTags }: { initialTags: Tag[] }) {
  const [tags, setTags] = useState(initialTags);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('vocab');
  const router = useRouter();

  const addTag = async () => {
    if (!name.trim()) return;
    const res = await fetch('/api/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim().toLowerCase(), category }),
    });
    if (res.ok) {
      const tag = await res.json();
      setTags(prev => [...prev, tag]);
      setName('');
      router.refresh();
    }
  };

  const removeTag = async (tagId: number) => {
    const res = await fetch('/api/tags', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: tagId }),
    });
    if (res.ok) {
      setTags(prev => prev.filter(t => t.id !== tagId));
      router.refresh();
    }
  };

  const grouped = tags.reduce<Record<string, Tag[]>>((acc, t) => {
    (acc[t.category] = acc[t.category] || []).push(t);
    return acc;
  }, {});

  return (
    <div className="space-y-8">
      {/* Add tag form */}
      <div className="bg-[#111113] rounded-xl border border-zinc-800/60 p-5">
        <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-3">Add New Tag</div>
        <div className="flex gap-3">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Enter tag name..."
            onKeyDown={e => e.key === 'Enter' && addTag()}
            className="flex-1 px-3 py-2.5 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-700"
          />
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            className="px-3 py-2.5 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-300"
          >
            <option value="vocab">Vocabulary</option>
            <option value="grammar">Grammar</option>
            <option value="topic">Topic</option>
          </select>
          <button
            onClick={addTag}
            className="px-5 py-2.5 text-sm font-medium rounded-lg bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-600/20 transition-all active:scale-[0.98]"
          >
            Add Tag
          </button>
        </div>
      </div>

      {/* Tag groups */}
      {Object.entries(categoryConfig).map(([cat, config]) => {
        const catTags = grouped[cat] || [];
        return (
          <div key={cat}>
            <div className="flex items-center gap-2 mb-3">
              <h3 className={`text-sm font-semibold ${config.color}`}>{config.label}</h3>
              <span className="text-[11px] text-zinc-600 font-mono">{catTags.length}</span>
            </div>
            {catTags.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {catTags.map(tag => (
                  <span
                    key={tag.id}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border ${config.bg} ${config.color} transition-colors hover:brightness-110 group/tag`}
                  >
                    {tag.name}
                    <button
                      onClick={() => removeTag(tag.id)}
                      className="opacity-0 group-hover/tag:opacity-100 ml-0.5 w-4 h-4 flex items-center justify-center rounded-full hover:bg-red-500/20 hover:text-red-400 transition-all text-[10px]"
                      title="Delete tag"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-zinc-700 italic">No {config.label.toLowerCase()} tags yet</p>
            )}
          </div>
        );
      })}

      {tags.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-zinc-600">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mb-3 text-zinc-700">
            <path d="M2 4h8.586a1 1 0 0 1 .707.293l10.414 10.414a1 1 0 0 1 0 1.414l-6.586 6.586a1 1 0 0 1-1.414 0L3.293 12.293A1 1 0 0 1 3 11.586V4z" />
            <circle cx="7" cy="8" r="1.5" fill="currentColor" />
          </svg>
          <p className="text-sm font-medium text-zinc-500">No tags yet</p>
          <p className="text-xs text-zinc-600 mt-1">Add tags to organize your clips by vocabulary, grammar, or topic</p>
        </div>
      )}
    </div>
  );
}
