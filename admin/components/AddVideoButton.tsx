'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AddVideoButton() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);

    const youtubeUrl = form.get('youtube_url') as string;
    const match = youtubeUrl.match(/(?:v=|\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (!match) {
      alert('Invalid YouTube URL');
      setLoading(false);
      return;
    }

    const res = await fetch('/api/videos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        youtube_video_id: match[1],
        title: form.get('title'),
        movie_title: form.get('movie_title'),
        genre: form.get('genre'),
        difficulty: form.get('difficulty'),
      }),
    });

    if (res.ok) {
      const { id } = await res.json();
      setOpen(false);
      router.push(`/videos/${id}`);
      router.refresh();
    } else {
      const err = await res.json();
      alert(err.error || 'Failed to create video');
    }
    setLoading(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-600/20 hover:shadow-violet-500/30 transition-all active:scale-[0.98]"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="7" y1="2" x2="7" y2="12" /><line x1="2" y1="7" x2="12" y2="7" />
        </svg>
        Add Video
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 modal-backdrop flex items-center justify-center z-50" onClick={() => setOpen(false)}>
      <div className="bg-[#111113] rounded-2xl border border-zinc-800/60 w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Modal header */}
        <div className="px-6 py-4 border-b border-zinc-800/40 flex items-center justify-between">
          <h2 className="text-base font-semibold">Add Video</h2>
          <button onClick={() => setOpen(false)} className="text-zinc-600 hover:text-zinc-300 transition-colors p-1 rounded-lg hover:bg-zinc-800">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <line x1="4" y1="4" x2="12" y2="12" /><line x1="12" y1="4" x2="4" y2="12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <Field label="YouTube URL" name="youtube_url" required placeholder="https://youtube.com/watch?v=..." />
          <Field label="Title" name="title" required placeholder="Scene description..." />
          <Field label="Show / Movie" name="movie_title" required placeholder="The Office, Friends..." />
          <div className="grid grid-cols-2 gap-4">
            <Field label="Genre" name="genre" placeholder="Comedy, Drama..." />
            <div>
              <label className="block text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Difficulty</label>
              <select name="difficulty" defaultValue="intermediate" className="w-full px-3 py-2.5 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-300">
                <option value="beginner">Beginner</option>
                <option value="elementary">Elementary</option>
                <option value="intermediate">Intermediate</option>
                <option value="upper-intermediate">Upper-Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </div>
          </div>

          <div className="flex gap-3 pt-3">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex-1 px-4 py-2.5 text-sm rounded-lg border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-600/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Creating...
                </span>
              ) : 'Create Video'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, name, required, placeholder }: { label: string; name: string; required?: boolean; placeholder: string }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">{label}</label>
      <input
        name={name}
        required={required}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-700"
      />
    </div>
  );
}
