'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createBrowserClient } from '@/lib/supabase/client';

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const searchParams = useSearchParams();
  const message = searchParams.get('message');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const supabase = createBrowserClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError) {
        setError(authError.message);
        setLoading(false);
        return;
      }

      const redirect = searchParams.get('redirect') || '/';
      window.location.href = redirect;
    } catch {
      setError('Connection error — please try again');
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {message === 'password-reset' && (
        <div className="px-4 py-3 rounded-xl bg-emerald-500/[0.06] border border-emerald-500/10 text-emerald-400 text-[13px] font-medium">
          Password updated — sign in with your new password
        </div>
      )}

      <div>
        <label htmlFor="email" className="block text-[9px] font-bold text-gray-600 mb-2 uppercase tracking-[0.2em]">
          Email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          autoFocus
          className="w-full px-4 py-3 bg-white/[0.03] border border-white/[0.06] rounded-xl text-white text-sm placeholder-white/15 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500/30 transition-all duration-300"
          placeholder="you@example.com"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-[9px] font-bold text-gray-600 mb-2 uppercase tracking-[0.2em]">
          Password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          className="w-full px-4 py-3 bg-white/[0.03] border border-white/[0.06] rounded-xl text-white text-sm placeholder-white/15 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500/30 transition-all duration-300"
          placeholder="••••••••"
        />
        <div className="flex justify-end mt-2">
          <Link href="/forgot-password" className="text-[11px] text-cyan-500/70 hover:text-cyan-400 transition-colors">
            Forgot password?
          </Link>
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl bg-red-500/[0.06] border border-red-500/10 text-red-400 text-[13px] font-medium">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full py-3.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl transition-all duration-300 shadow-lg shadow-cyan-500/15 hover:shadow-cyan-500/25 hover:scale-[1.01] active:scale-[0.99]"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Authenticating…
          </span>
        ) : (
          'Sign In'
        )}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="flex items-center justify-center min-h-screen relative">
      {/* Content */}
      <div className="relative z-10 w-full max-w-sm px-6">
        {/* Branding */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500/15 to-blue-600/15 border border-white/[0.06] mb-5 shadow-lg shadow-cyan-500/10 animate-breathe">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-400 font-black text-xl">A2A</span>
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">A2A Comms</h1>
          <p className="text-[12px] text-gray-600 mt-1.5">Agent-to-Agent Communication Platform</p>
        </div>

        {/* Login card */}
        <div className="glass-card rounded-2xl p-7 shadow-2xl">
          {/* Top accent */}
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyan-500/20 to-transparent rounded-t-2xl" />
          <Suspense fallback={
            <div className="flex items-center justify-center py-12">
              <div className="w-5 h-5 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
            </div>
          }>
            <LoginForm />
          </Suspense>
        </div>

        <p className="text-center text-[10px] text-gray-700 mt-6 tracking-wide font-medium">
          Authorized operators only
        </p>
      </div>
    </div>
  );
}
