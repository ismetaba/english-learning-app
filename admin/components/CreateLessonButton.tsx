'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function CreateLessonButton() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [titleTr, setTitleTr] = useState('');
  const [description, setDescription] = useState('');
  const [level, setLevel] = useState('elementary');
  const [grammarFocus, setGrammarFocus] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleCreate = async () => {
    if (!title.trim()) return;
    setLoading(true);
    const res = await fetch('/api/lessons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, title_tr: titleTr, description, level, grammar_focus: grammarFocus }),
    });
    if (res.ok) {
      const { id } = await res.json();
      router.push(`/lessons/${id}`);
    }
    setLoading(false);
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-600/20 transition-all active:scale-[0.98]">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="7" y1="2" x2="7" y2="12" /><line x1="2" y1="7" x2="12" y2="7" />
        </svg>
        New Lesson
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setOpen(false)}>
      <div className="bg-[#111113] border border-zinc-800 rounded-xl w-[480px] p-6" onClick={e => e.stopPropagation()}>
        <h2 className="text-base font-semibold mb-4">Create Lesson</h2>

        <div className="space-y-3">
          <div>
            <label className="block text-[10px] font-semibold text-zinc-600 uppercase tracking-wider mb-1">Title (EN)</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Simple Adjective Sentences"
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-white placeholder-zinc-600 outline-none focus:border-violet-500" />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-zinc-600 uppercase tracking-wider mb-1">Title (TR)</label>
            <input value={titleTr} onChange={e => setTitleTr(e.target.value)} placeholder="Basit Sifat Cumleleri"
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-white placeholder-zinc-600 outline-none focus:border-violet-500" />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-zinc-600 uppercase tracking-wider mb-1">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="Learn adjective usage through movie clips..."
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-white placeholder-zinc-600 outline-none focus:border-violet-500 resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-semibold text-zinc-600 uppercase tracking-wider mb-1">Level</label>
              <select value={level} onChange={e => setLevel(e.target.value)}
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-white outline-none focus:border-violet-500">
                <option value="beginner">Beginner</option>
                <option value="elementary">Elementary (A2)</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-zinc-600 uppercase tracking-wider mb-1">Grammar Focus</label>
              <input value={grammarFocus} onChange={e => setGrammarFocus(e.target.value)} placeholder="adjectives"
                className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-white placeholder-zinc-600 outline-none focus:border-violet-500" />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={() => setOpen(false)} className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors">Cancel</button>
          <button onClick={handleCreate} disabled={loading || !title.trim()}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-50 transition-all">
            {loading ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
