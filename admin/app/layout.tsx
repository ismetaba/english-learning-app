import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Studio | English Learning",
  description: "Manage videos, subtitles, and lectures",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full`}>
      <body className="min-h-full bg-[#09090b] text-zinc-100 flex">
        {/* Sidebar */}
        <nav className="w-[220px] bg-[#0c0c0e] border-r border-zinc-800/40 flex flex-col shrink-0 h-screen sticky top-0">
          {/* Logo */}
          <div className="px-5 py-5 border-b border-zinc-800/30">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-violet-700 flex items-center justify-center text-white text-sm font-bold shadow-lg shadow-violet-600/25 group-hover:shadow-violet-600/40 transition-shadow">
                S
              </div>
              <div>
                <div className="text-[13px] font-semibold text-white tracking-tight">Studio</div>
                <div className="text-[9px] text-zinc-600 font-semibold tracking-[0.12em] uppercase">English Learning</div>
              </div>
            </Link>
          </div>

          {/* Navigation */}
          <div className="flex-1 px-3 py-5">
            <div className="px-3 mb-2 text-[9px] font-bold text-zinc-700 uppercase tracking-[0.14em]">Navigation</div>
            <div className="space-y-0.5">
              <NavLink href="/" icon={<DashboardIcon />} label="Dashboard" />
              <NavLink href="/videos" icon={<VideosIcon />} label="Videos" />
              <NavLink href="/tags" icon={<TagsIcon />} label="Tags" />
              <NavLink href="/lessons" icon={<LessonIcon />} label="Lessons" />
              <NavLink href="/curriculum" icon={<CurriculumIcon />} label="Curriculum" />
            </div>

            <div className="px-3 mt-8 mb-2 text-[9px] font-bold text-zinc-700 uppercase tracking-[0.14em]">Tools</div>
            <div className="space-y-0.5">
              <NavLink href="/videos" icon={<SubtitleIcon />} label="Subtitle Editor" />
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-zinc-800/30">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" />
              <span className="text-[10px] text-zinc-600">System Online</span>
            </div>
          </div>
        </nav>

        {/* Main content */}
        <main className="flex-1 overflow-auto min-h-screen">{children}</main>
      </body>
    </html>
  );
}

function NavLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] font-medium text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.04] transition-all group"
    >
      <span className="text-zinc-600 group-hover:text-violet-400 transition-colors w-4 flex items-center justify-center">{icon}</span>
      {label}
    </Link>
  );
}

function DashboardIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1.5" y="1.5" width="5" height="5" rx="1.5" />
      <rect x="9.5" y="1.5" width="5" height="5" rx="1.5" />
      <rect x="1.5" y="9.5" width="5" height="5" rx="1.5" />
      <rect x="9.5" y="9.5" width="5" height="5" rx="1.5" />
    </svg>
  );
}

function VideosIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1.5" y="3" width="13" height="10" rx="2" />
      <polygon points="6.5,5.5 11,8 6.5,10.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function TagsIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1.5 2.5h5.586a1 1 0 0 1 .707.293l6.414 6.414a1 1 0 0 1 0 1.414l-4.586 4.586a1 1 0 0 1-1.414 0L1.793 8.793a1 1 0 0 1-.293-.707V2.5z" />
      <circle cx="4.5" cy="5.5" r="1" fill="currentColor" />
    </svg>
  );
}

function LessonIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h12M2 7h8M2 11h10" />
      <circle cx="13" cy="11" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function CurriculumIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 2h4v4H2zM10 2h4v4h-4zM2 10h4v4H2z" />
      <path d="M10 12h4M12 10v4" />
    </svg>
  );
}

function SubtitleIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1.5" y="2.5" width="13" height="11" rx="2" />
      <line x1="4" y1="8" x2="12" y2="8" />
      <line x1="4" y1="11" x2="9" y2="11" />
    </svg>
  );
}
