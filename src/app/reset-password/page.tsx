'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { HollowayMark } from '@/components/holloway-mark';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [linkInvalid, setLinkInvalid] = useState(false);
  const [token, setToken] = useState('');
  const router = useRouter();

  useEffect(() => {
    const value = new URL(window.location.href).searchParams.get('token') || '';
    const timer = window.setTimeout(() => {
      setToken(value);
      setReady(Boolean(value));
      setLinkInvalid(!value);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 12) { setError('Password must be at least 12 characters'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }

    setLoading(true);
    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) { setError(payload.error || 'Password update failed.'); setLoading(false); return; }
      router.push('/login?message=password-reset');
    } catch {
      setError('Connection error — please try again');
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', minHeight: '100dvh', position: 'relative' }}>
      <div style={{ position: 'relative', zIndex: 10, width: '100%', maxWidth: 380, padding: '0 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ display: 'inline-flex', marginBottom: 16 }}>
            <HollowayMark size={44} />
          </div>
          <h1 className="h1 text-xl">New Password</h1>
          <div className="upper" style={{ marginTop: 6 }}>Choose a strong password</div>
        </div>

        <div className="card" style={{ padding: 28 }}>
          {linkInvalid ? (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <div className="pill pill--rose text-sm" style={{ height: 'auto', padding: '10px 14px' }}>
                This password reset link is invalid or has expired. Please request a new one.
              </div>
            </div>
          ) : !ready ? (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <span className="dot dot--amber pulse" />
              <div className="dim text-xs" style={{ marginTop: 12 }}>Verifying reset link…</div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div className="col gap-1">
                <label htmlFor="password" className="upper text-2xs">New Password</label>
                <input
                  id="password" type="password" value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required minLength={12} autoComplete="new-password" autoFocus
                  className="cp-input text-sm" style={{ height: 40 }}
                  placeholder="Minimum 12 characters"
                />
              </div>

              <div className="col gap-1">
                <label htmlFor="confirmPassword" className="upper text-2xs">Confirm Password</label>
                <input
                  id="confirmPassword" type="password" value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required minLength={12} autoComplete="new-password"
                  className="cp-input text-sm" style={{ height: 40 }}
                  placeholder="Re-enter your password"
                />
              </div>

              {error && (
                <div className="pill pill--rose text-sm" style={{ height: 'auto', padding: '10px 14px' }}>{error}</div>
              )}

              <button type="submit" disabled={loading} className="btn btn--primary text-sm"
                style={{ width: '100%', height: 42, justifyContent: 'center', opacity: loading ? 0.5 : 1 }}>
                {loading ? 'Updating…' : 'Update Password'}
              </button>
            </form>
          )}
        </div>

        <p style={{ textAlign: 'center', marginTop: 24 }}>
          <Link href="/login" className="text-2xs" style={{ color: 'var(--brand)', textDecoration: 'none' }}>
            ← Back to login
          </Link>
        </p>
      </div>
    </div>
  );
}
