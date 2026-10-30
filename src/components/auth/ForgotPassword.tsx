import React, { useState } from 'react';
import { AlertCircle, ArrowLeft, KeyRound, Loader2, Mail, MailCheck, Send } from 'lucide-react';
import AuthShell from './AuthShell';

interface ForgotPasswordProps {
  /** Returns an error message, or null on success (same contract as onLogin). */
  onRequestReset: (email: string) => Promise<string | null>;
  /** Navigate back to the login screen. */
  onBack: () => void;
}

export default function ForgotPassword({ onRequestReset, onBack }: ForgotPasswordProps) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError('');
    const err = await onRequestReset(email.trim());
    if (err) setError(err);
    else setSent(true);
    setLoading(false);
  }

  const backLink = (
    <button
      type="button"
      onClick={onBack}
      className="inline-flex items-center gap-1.5 rounded text-sm font-semibold text-[#78350f] transition-colors hover:text-[#ea580c] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ea580c]"
    >
      <ArrowLeft size={16} aria-hidden />
      Back to sign in
    </button>
  );

  return (
    <AuthShell subtitle="Password recovery" infoText="Didn't get the email? Check your spam folder or contact the school administrator.">
      {sent ? (
        <div className="flex h-full flex-col justify-center" role="status">
          <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f0f9ff] text-[#0369a1] ring-1 ring-[#bae6fd]">
            <MailCheck size={26} aria-hidden />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[#3b2314] sm:text-3xl">Check your email</h1>
          <p className="mt-2 text-sm leading-relaxed text-stone-600">
            If an account exists for <span className="font-semibold text-[#451a03] break-all">{email.trim()}</span>, we've sent a link to reset your password.
          </p>
          <div className="mt-8 flex flex-col gap-4">
            <button
              type="button"
              onClick={onBack}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-[#f97316] to-[#ea580c] px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-[#ea580c]/30 transition-all hover:-translate-y-0.5 hover:from-[#ea580c] hover:to-[#c2410c] hover:shadow-xl focus:outline-none focus-visible:ring-4 focus-visible:ring-[#ea580c]/30 active:translate-y-0"
            >
              <ArrowLeft size={16} aria-hidden />
              Back to sign in
            </button>
            <button
              type="button"
              onClick={() => { setSent(false); setEmail(''); }}
              className="self-center rounded text-xs font-semibold text-[#ea580c] underline-offset-4 hover:text-[#c2410c] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ea580c]"
            >
              Use a different email
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-6">{backLink}</div>

          <div className="mb-7">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#fff7ed] text-[#ea580c] ring-1 ring-[#fed7aa]">
              <KeyRound size={22} aria-hidden />
            </div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#ea580c]">Password recovery</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#3b2314] sm:text-3xl">Forgot your password?</h1>
            <p className="mt-1.5 text-sm text-stone-500">
              Enter your school email and we'll send you a link to reset it.
            </p>
          </div>

          <form onSubmit={submit} className="space-y-5">
            <div>
              <label htmlFor="reset-email" className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-[#451a03]">
                School approved email <span className="text-[#ea580c]" aria-hidden>*</span>
              </label>
              <div className="relative">
                <Mail size={17} aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  id="reset-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@school.rw"
                  autoComplete="username"
                  required
                  autoFocus
                  aria-invalid={!!error}
                  className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-11 pr-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-all hover:border-slate-400 focus:border-[#ea580c] focus:ring-4 focus:ring-[#ea580c]/15"
                />
              </div>
            </div>

            {error && (
              <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                <AlertCircle size={16} className="mt-0.5 shrink-0 text-red-600" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !email.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-[#f97316] to-[#ea580c] px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-[#ea580c]/30 transition-all hover:-translate-y-0.5 hover:from-[#ea580c] hover:to-[#c2410c] hover:shadow-xl focus:outline-none focus-visible:ring-4 focus-visible:ring-[#ea580c]/30 active:translate-y-0 active:scale-[0.99] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              {loading ? 'Sending link…' : 'Send reset link'}
            </button>
          </form>
        </>
      )}
    </AuthShell>
  );
}