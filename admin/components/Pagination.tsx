'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
}

export default function Pagination({ currentPage, totalPages, totalItems, pageSize }: PaginationProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const goToPage = useCallback((page: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (page <= 1) {
      params.delete('page');
    } else {
      params.set('page', String(page));
    }
    const qs = params.toString();
    router.push(`${pathname}${qs ? `?${qs}` : ''}`);
  }, [router, pathname, searchParams]);

  if (totalPages <= 1) return null;

  // Build page numbers: first, last, and 2 around current
  const pages: (number | '...')[] = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== '...') {
      pages.push('...');
    }
  }

  const start = (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalItems);

  return (
    <div className="flex items-center justify-between mt-6">
      <span className="text-[11px] text-zinc-600">
        {start}–{end} of {totalItems}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => goToPage(currentPage - 1)}
          disabled={currentPage <= 1}
          className="px-2.5 py-1.5 text-[11px] font-medium rounded-md bg-zinc-800/50 text-zinc-400 border border-zinc-800/50 hover:bg-zinc-700 hover:text-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          Prev
        </button>
        {pages.map((p, i) =>
          p === '...' ? (
            <span key={`dots-${i}`} className="px-1 text-zinc-600 text-[11px]">...</span>
          ) : (
            <button
              key={p}
              onClick={() => goToPage(p)}
              className={`px-2.5 py-1.5 text-[11px] font-medium rounded-md border transition-all ${
                p === currentPage
                  ? 'bg-violet-600/20 text-violet-400 border-violet-500/30'
                  : 'bg-zinc-800/50 text-zinc-400 border-zinc-800/50 hover:bg-zinc-700 hover:text-zinc-300'
              }`}
            >
              {p}
            </button>
          )
        )}
        <button
          onClick={() => goToPage(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="px-2.5 py-1.5 text-[11px] font-medium rounded-md bg-zinc-800/50 text-zinc-400 border border-zinc-800/50 hover:bg-zinc-700 hover:text-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          Next
        </button>
      </div>
    </div>
  );
}
