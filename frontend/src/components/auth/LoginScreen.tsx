import React, { useState } from 'react';
import { AlertCircle, ShieldCheck, Eye, EyeOff, Mail, Lock, Loader2 } from 'lucide-react';
import AuthShell from './AuthShell';

export default function LoginScreen({
  onLogin,
  onForgotPassword,
}: {
  onLogin: (email: string, password: string) => Promise<string | null>;
  /** Optional navigation callback; when omitted the link is inert (UI only). */
  onForgotPassword?: () => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setLoading(true);
    setError('');
    const err = await onLogin(email, password);
    if (err) setError(err);
    setLoading(false);
  }

  const inputClass =
    'w-full rounded-xl border border-slate-300 bg-white py-3 pl-11 text-sm text-slate-900 placeholder:text-slate-400 ' +
    'outline-none transition-all hover:border-slate-400 focus:border-[#ea580c] focus:ring-4 focus:ring-[#ea580c]/15';

  return (
    <AuthShell>
      <div className="mb-7">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#ea580c]">School staff sign in</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#3b2314] sm:text-3xl">Welcome back</h1>
        <p className="mt-1.5 text-sm text-stone-500">Enter your school credentials to continue.</p>
      </div>

      <form onSubmit={submit} className="space-y-5">
        <div>
          <label htmlFor="login-email" className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-[#451a03]">
            School approved email <span className="text-[#ea580c]" aria-hidden>*</span>
          </label>
          <div className="relative">
            <Mail size={17} aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@school.rw"
              autoComplete="username"
              required
              aria-invalid={!!error}
              className={`${inputClass} pr-3`}
            />
          </div>
        </div>

        <div>
          <label htmlFor="login-password" className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-[#451a03]">
            Password <span className="text-[#ea580c]" aria-hidden>*</span>
          </label>
          <div className="relative">
            <Lock size={17} aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              autoComplete="current-password"
              required
              aria-invalid={!!error}
              className={`${inputClass} pr-12`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ea580c]"
              title={showPassword ? 'Hide password' : 'Show password'}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
            >
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>

          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={onForgotPassword}
              className="rounded text-xs font-semibold text-[#ea580c] underline-offset-4 transition-colors hover:text-[#c2410c] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#ea580c]"
            >
              Forgot password?
            </button>
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
          disabled={loading || !email.trim() || !password}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-[#f97316] to-[#ea580c] px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-[#ea580c]/30 transition-all hover:-translate-y-0.5 hover:from-[#ea580c] hover:to-[#c2410c] hover:shadow-xl focus:outline-none focus-visible:ring-4 focus-visible:ring-[#ea580c]/30 active:translate-y-0 active:scale-[0.99] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </AuthShell>
  );
}