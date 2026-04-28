'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createBrowserClient } from '@/lib/supabase/client';
import { Mail } from 'lucide-react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const supabase = createBrowserClient();
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || (() => {
        console.warn('[forgot-password] NEXT_PUBLIC_APP_URL is not set — falling back to playground domain');
        return 'https://a2a.playground.montytorr.tech';
      })();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${appUrl}/reset-password`,
      });

      if (resetError) {
        setError(resetError.message);
        setLoading(false);
        return;
      }

      setSent(true);
    } catch {
      setError('Connection error — please try again');
    } finally {
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
          <h1 className="h1" style={{ fontSize: 24 }}>Reset Password</h1>
          <div className="upper" style={{ marginTop: 6 }}>We&apos;ll send you a reset link</div>
        </div>

        <div className="card" style={{ padding: 28 }}>
          {sent ? (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 48, height: 48, borderRadius: 999, marginBottom: 16 }} className="card card--inset">
                <Mail size={24} style={{ color: 'var(--mint)' }} />
              </div>
              <div className="h3" style={{ marginBottom: 4 }}>Check your email</div>
              <div className="dim" style={{ fontSize: 12 }}>
                We sent a reset link to <span style={{ color: 'var(--amber)' }}>{email}</span>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div className="col gap-1">
                <label htmlFor="email" className="upper" style={{ fontSize: 10 }}>Email</label>
                <input
                  id="email" type="email" value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required autoComplete="email" autoFocus
                  className="cp-input" style={{ height: 40, fontSize: 14 }}
                  placeholder="you@example.com"
                />
              </div>

              {error && (
                <div className="pill pill--rose" style={{ height: 'auto', padding: '10px 14px', fontSize: 13 }}>{error}</div>
              )}

              <button type="submit" disabled={loading} className="btn btn--primary"
                style={{ width: '100%', height: 42, justifyContent: 'center', fontSize: 14, opacity: loading ? 0.5 : 1 }}>
                {loading ? 'Sending…' : 'Send Reset Link'}
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
