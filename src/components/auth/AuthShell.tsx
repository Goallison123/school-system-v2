import React from 'react';
import { Info, CheckCircle2 } from 'lucide-react';
import { SCHOOL_NAME } from '@/lib/constants';

interface AuthShellProps {
  children: React.ReactNode;
  /** Small text under the school name on mobile */
  subtitle?: string;
  /** Text shown in the light-blue information strip */
  infoText?: string;
}

const HIGHLIGHTS = ['Secure staff-only access', 'One system for the whole school', 'Excellence · Systemized'];

/**
 * Shared visual shell for all public auth screens (login, forgot password, ...).
 * Pure presentation: no auth logic lives here.
 */
export default function AuthShell({
  children,
  subtitle = 'School staff sign in',
  infoText = 'For school staff. Keep your password private.',
}: AuthShellProps) {
  return (
    <div
      className="relative flex min-h-screen flex-col justify-between overflow-hidden bg-[#faf8f5] p-4 font-sans sm:p-6"
      style={{ backgroundImage: 'radial-gradient(rgba(120,53,15,0.07) 1px, transparent 1px)', backgroundSize: '22px 22px' }}
    >
      <div aria-hidden className="pointer-events-none absolute -left-40 -top-40 h-[28rem] w-[28rem] rounded-full bg-[#ea580c]/20 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-48 -right-40 h-[28rem] w-[28rem] rounded-full bg-[#bae6fd]/60 blur-3xl" />

      <main className="relative mx-auto my-6 w-full max-w-5xl sm:my-auto">
        <header className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-amber-900/10 bg-white/70 px-4 py-2.5 shadow-sm backdrop-blur sm:px-5">
          <div className="flex min-w-0 items-center gap-2.5">
            <img src="/assets/school-community.jpg" alt="" aria-hidden className="h-7 w-7 shrink-0 rounded-lg object-cover ring-1 ring-[#ea580c]/40" />
            <span className="truncate text-xs font-bold uppercase tracking-[0.2em] text-[#78350f] sm:text-[13px]">Excellence · Systemized</span>
          </div>
          <span className="flex shrink-0 items-center gap-2 text-xs font-medium text-stone-600 sm:text-[13px]">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#ea580c]" />
            <span className="sm:hidden">Staff Portal</span>
            <span className="hidden sm:inline">Staff Portal · School Management System</span>
          </span>
        </header>

        <div className="grid overflow-hidden rounded-3xl border border-[#bae6fd] bg-white shadow-[0_24px_60px_-20px_rgba(59,35,20,0.35)] lg:grid-cols-[1.05fr_1fr]">
          {/* Brand panel */}
          <section className="relative isolate overflow-hidden border-b-[3px] border-[#ea580c] bg-[#3b2314] px-6 py-6 text-white lg:flex lg:min-h-[34rem] lg:flex-col lg:justify-between lg:border-b-0 lg:border-r-[3px] lg:p-10">
            <img src="/assets/school-community.jpg" alt="" aria-hidden className="absolute inset-0 -z-20 h-full w-full object-cover" />
            <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-br from-[#3b2314]/95 via-[#3b2314]/90 to-[#7c2d12]/85" />
            <div aria-hidden className="absolute -bottom-24 -right-24 -z-10 h-72 w-72 rounded-full bg-[#ea580c]/30 blur-3xl" />

            <div className="flex items-center gap-4 lg:block">
              <img
                src="/assets/school-community.jpg"
                alt="Students learning together"
                className="h-14 w-14 shrink-0 rounded-2xl object-cover shadow-lg ring-2 ring-[#fed7aa]/60 lg:h-20 lg:w-20"
              />
              <div className="lg:mt-6">
                <p className="text-lg font-bold leading-tight tracking-tight sm:text-xl lg:text-3xl">{SCHOOL_NAME}</p>
                <p className="mt-1 text-xs font-medium text-[#fed7aa] lg:hidden">{subtitle}</p>
                <div aria-hidden className="mt-4 hidden h-1 w-16 rounded-full bg-[#ea580c] lg:block" />
              </div>
            </div>

            <div className="hidden lg:block">
              <p className="max-w-xs text-2xl font-semibold leading-snug text-white/95">
                Where school staff <span className="text-[#fb923c]">get things done.</span>
              </p>
              <ul className="mt-6 space-y-3 text-sm text-[#fed7aa]">
                {HIGHLIGHTS.map((h) => (
                  <li key={h} className="flex items-center gap-2.5">
                    <CheckCircle2 size={16} className="shrink-0 text-[#fb923c]" aria-hidden />
                    {h}
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* Content panel */}
          <section className="flex flex-col">
            <div className="flex-1 p-6 sm:p-10">{children}</div>
            <div className="flex items-center justify-center gap-2 border-t border-[#bae6fd] bg-[#f0f9ff] px-4 py-4 text-center text-xs text-[#0369a1]">
              <Info size={14} aria-hidden className="shrink-0" />
              <span>{infoText}</span>
            </div>
          </section>
        </div>
      </main>

      <footer className="relative mx-auto w-full max-w-5xl py-4 text-center text-xs text-[#78350f]">
        All Rights Reserved by G.S Gacuba 2A
      </footer>
    </div>
  );
}