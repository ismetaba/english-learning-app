'use client';

import { useState } from 'react';

export default function ProcessButton() {
  const [starting, setStarting] = useState(false);

  const handleStart = async () => {
    setStarting(true);
    try {
      const res = await fetch('/api/process', { method: 'POST' });
      const data = await res.json();
      if (data.error) {
        alert(data.error);
      }
      // PipelineStatus component in layout will pick up the running state
    } catch (err: any) {
      alert(`Failed: ${err.message}`);
    }
    setStarting(false);
  };

  return (
    <button
      onClick={handleStart}
      disabled={starting}
      className="px-4 py-2.5 text-[14px] font-medium rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white transition-all"
    >
      {starting ? 'Starting...' : 'Process Existing'}
    </button>
  );
}
