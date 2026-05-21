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

  const handleSubmit = async (e: React.FormEvent) => {
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

      const currentUrl = new URL(window.location.href);
      const rawRedirect = currentUrl.searchParams.get('redirect') || '/';
      const redirect = rawRedirect.startsWith('/') && !rawRedirect.startsWith('//') ? rawRedirect : '/';
      window.location.href = redirect;
    } catch {
      setError('Connection error — please try again');
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {message === 'password-reset' && (
        <div className="pill pill--mint" style={{ height: 'auto', padding: '10px 14px', fontSize: 13 }}>
          Password updated — sign in with your new password
        </div>
      )}

      <div className="col gap-1">
        <label htmlFor="email" className="upper" style={{ fontSize: 10 }}>Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          autoFocus
          className="cp-input"
          style={{ height: 40, fontSize: 14 }}
          placeholder="you@example.com"
        />
      </div>

      <div className="col gap-1">
        <label htmlFor="password" className="upper" style={{ fontSize: 10 }}>Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          className="cp-input"
          style={{ height: 40, fontSize: 14 }}
          placeholder="••••••••"
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
          <Link href="/forgot-password" style={{ fontSize: 11, color: 'var(--amber)', textDecoration: 'none' }}>
            Forgot password?
          </Link>
        </div>
      </div>

      {error && (
        <div className="pill pill--rose" style={{ height: 'auto', padding: '10px 14px', fontSize: 13 }}>
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="btn btn--primary"
        style={{
          width: '100%',
          height: 42,
          justifyContent: 'center',
          fontSize: 14,
          opacity: loading ? 0.5 : 1,
          cursor: loading ? 'not-allowed' : 'pointer',
        }}
      >
        {loading ? 'Authenticating…' : 'Sign In'}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      position: 'relative',
    }}>
      <div style={{ position: 'relative', zIndex: 10, width: '100%', maxWidth: 380, padding: '0 24px' }}>
        {/* Branding */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{
            width: 50,
            height: 50,
            borderRadius: 12,
            background: 'linear-gradient(135deg, oklch(0.32 0.02 250), oklch(0.20 0.01 250))',
            border: '1px solid var(--line-2)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 16,
            boxShadow: 'inset 0 0 0 1px oklch(1 0 0 / 0.05)',
          }}>
            <svg width="24" height="24" viewBox="0 0 14 14" fill="none">
              <path d="M2 3 L7 11 L12 3 Z" stroke="var(--amber)" strokeWidth="1.4" strokeLinejoin="round" />
              <circle cx="7" cy="3" r="1.4" fill="var(--amber)" />
            </svg>
          </div>
          <h1 className="h1" style={{ fontSize: 24 }}>A2A Comms</h1>
          <div className="upper" style={{ marginTop: 6 }}>Control Plane</div>
        </div>

        {/* Login card */}
        <div className="card" style={{ padding: 28 }}>
          <Suspense fallback={
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 0' }}>
              <span className="dot dot--amber pulse" />
            </div>
          }>
            <LoginForm />
          </Suspense>
        </div>

        <p className="upper" style={{ textAlign: 'center', marginTop: 24, fontSize: 10 }}>
          Authorized operators only
        </p>
      </div>
    </div>
  );
}
