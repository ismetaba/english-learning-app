'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  endpoint: string;
  id: string | number;
  label?: string;
  confirmMessage?: string;
  className?: string;
}

export default function DeleteButton({ endpoint, id, label = '✕', confirmMessage, className }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  const handleDelete = async () => {
    if (!confirming) {
      setConfirming(true);
      setTimeout(() => setConfirming(false), 3000);
      return;
    }
    setDeleting(true);
    try {
      await fetch(endpoint, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      router.refresh();
    } catch {}
    setDeleting(false);
    setConfirming(false);
  };

  const defaultClass = 'p-1 rounded text-[10px] transition-all';
  const stateClass = confirming
    ? 'bg-red-500/15 text-red-400 hover:bg-red-500/25'
    : 'text-zinc-700 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100';

  return (
    <button
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(); }}
      disabled={deleting}
      className={className || `${defaultClass} ${stateClass}`}
      title={confirming ? 'Click again to confirm' : 'Delete'}
    >
      {deleting ? '...' : confirming ? 'Sure?' : label}
    </button>
  );
}
