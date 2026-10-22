import React, { useState } from 'react';
import { AlertCircle, ShieldCheck, Eye, EyeOff } from 'lucide-react';
import { SCHOOL_NAME } from '@/lib/constants';

export default function LoginScreen({ onLogin }: { onLogin: (email: string, password: string) => Promise<string | null> }) {
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

  return (
    <div className="min-h-screen bg-[#faf8f5] flex flex-col justify-between p-4 sm:p-6 font-sans">
      {/* Top minimal institutional strip */}
      <div className="w-full max-w-5xl mx-auto flex items-center justify-between text-xs text-amber-950/70 py-2 border-b border-amber-900/10">
        <span className="font-semibold text-[#78350f]">EXCELLENCE · SYSTEMIZED</span>
        <span className="text-stone-600">GS GACUBA 2A SCHOOL SYSTEM</span>
      </div>

      {/* Center login dialog */}
      <div className="w-full max-w-md mx-auto my-auto bg-white border border-[#bae6fd] rounded-lg shadow-md overflow-hidden">
        {/* Header bar in rich brown and warm orange */}
        <div className="bg-[#3b2314] text-white p-6 text-center border-b-2 border-[#ea580c]">
          <img src="/assets/school-community.jpg" alt="Students learning together" className="mx-auto mb-3 h-12 w-12 rounded-lg object-cover shadow-sm" />
          <h1 className="text-lg font-bold tracking-tight">{SCHOOL_NAME}</h1>
          <p className="text-xs text-[#fed7aa] mt-1 font-medium">School staff sign in</p>
        </div>

        {/* Form body */}
        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-[#451a03] uppercase tracking-wide mb-1">
              School email <span className="text-[#ea580c]">*</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@school.rw"
              autoComplete="username"
              required
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#ea580c] focus:ring-1 focus:ring-[#ea580c]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#451a03] uppercase tracking-wide mb-1">
              Password <span className="text-[#ea580c]">*</span>
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                autoComplete="current-password"
                required
                className="w-full border border-slate-300 rounded px-3 py-2 pr-10 text-sm text-slate-900 outline-none focus:border-[#ea580c] focus:ring-1 focus:ring-[#ea580c]"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded flex items-start gap-2">
              <AlertCircle size={16} className="shrink-0 mt-0.5 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !email.trim() || !password}
            className="w-full bg-[#ea580c] hover:bg-[#c2410c] text-white font-bold py-2.5 px-4 rounded text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50 shadow-sm"
          >
            <ShieldCheck size={16} />
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div className="bg-[#f0f9ff] border-t border-[#e0f2fe] p-3 text-center text-[11px] text-[#0369a1]">
          For school staff. Keep your password private.
        </div>
      </div>

      {/* Footer */}
      <footer className="w-full max-w-5xl mx-auto text-center text-xs text-[#78350f] py-4">
        All Rights Reserved by G.S Gacuba 2A
      </footer>
    </div>
  );
}
