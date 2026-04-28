'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createBrowserClient } from '@/lib/supabase/client';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const supabase = createBrowserClient();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }

    setLoading(true);
    try {
      const supabase = createBrowserClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) { setError(updateError.message); setLoading(false); return; }
      await supabase.auth.signOut();
      router.push('/login?message=password-reset');
    } catch {
      setError('Connection error — please try again');
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', position: 'relative' }}>
      <div style={{ position: 'relative', zIndex: 10, width: '100%', maxWidth: 380, padding: '0 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{
            width: 50, height: 50, borderRadius: 12,
            background: 'linear-gradient(135deg, oklch(0.32 0.02 250), oklch(0.20 0.01 250))',
            border: '1px solid var(--line-2)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
          }}>
            <svg width="24" height="24" viewBox="0 0 14 14" fill="none">
              <path d="M2 3 L7 11 L12 3 Z" stroke="var(--amber)" strokeWidth="1.4" strokeLinejoin="round" />
              <circle cx="7" cy="3" r="1.4" fill="var(--amber)" />
            </svg>
          </div>
          <h1 className="h1" style={{ fontSize: 24 }}>New Password</h1>
          <div className="upper" style={{ marginTop: 6 }}>Choose a strong password</div>
        </div>

        <div className="card" style={{ padding: 28 }}>
          {!ready ? (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <span className="dot dot--amber pulse" />
              <div className="dim" style={{ fontSize: 12, marginTop: 12 }}>Verifying reset link…</div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div className="col gap-1">
                <label htmlFor="password" className="upper" style={{ fontSize: 10 }}>New Password</label>
                <input
                  id="password" type="password" value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required minLength={8} autoComplete="new-password" autoFocus
                  className="cp-input" style={{ height: 40, fontSize: 14 }}
                  placeholder="Minimum 8 characters"
                />
              </div>

              <div className="col gap-1">
                <label htmlFor="confirmPassword" className="upper" style={{ fontSize: 10 }}>Confirm Password</label>
                <input
                  id="confirmPassword" type="password" value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required minLength={8} autoComplete="new-password"
                  className="cp-input" style={{ height: 40, fontSize: 14 }}
                  placeholder="Re-enter your password"
                />
              </div>

              {error && (
                <div className="pill pill--rose" style={{ height: 'auto', padding: '10px 14px', fontSize: 13 }}>{error}</div>
              )}

              <button type="submit" disabled={loading} className="btn btn--primary"
                style={{ width: '100%', height: 42, justifyContent: 'center', fontSize: 14, opacity: loading ? 0.5 : 1 }}>
                {loading ? 'Updating…' : 'Update Password'}
              </button>
            </form>
          )}
        </div>

        <p style={{ textAlign: 'center', marginTop: 24 }}>
          <Link href="/login" style={{ fontSize: 11, color: 'var(--amber)', textDecoration: 'none' }}>
            ← Back to login
          </Link>
        </p>
      </div>
    </div>
  );
}
