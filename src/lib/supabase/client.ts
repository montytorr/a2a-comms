type AuthError = { message: string } | null;

async function request(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

export function createBrowserClient() {
  return {
    auth: {
      async signInWithPassword(credentials: { email: string; password: string }) {
        const { response, payload } = await request('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify(credentials),
        });
        return { error: response.ok ? null : { message: payload.error || 'Invalid credentials.' } as AuthError };
      },
      async signOut() {
        const { response, payload } = await request('/api/auth/logout', { method: 'POST' });
        return { error: response.ok ? null : { message: payload.error || 'Sign out failed.' } as AuthError };
      },
      async getSession() {
        const { response, payload } = await request('/api/auth/session');
        return {
          data: { session: response.ok && payload.user ? { user: payload.user } : null },
          error: response.ok ? null : { message: payload.error || 'Session lookup failed.' } as AuthError,
        };
      },
      onAuthStateChange(callback: (event: string, session: { user: unknown } | null) => void) {
        void callback;
        return { data: { subscription: { unsubscribe() {} } } };
      },
      async updateUser(input: { password: string }) {
        const { response, payload } = await request('/api/auth/password', {
          method: 'POST',
          body: JSON.stringify(input),
        });
        return { error: response.ok ? null : { message: payload.error || 'Password update failed.' } as AuthError };
      },
      async resetPasswordForEmail(email: string, options?: { redirectTo?: string }) {
        void options;
        const { response, payload } = await request('/api/auth/forgot-password', {
          method: 'POST',
          body: JSON.stringify({ email }),
        });
        return { error: response.ok ? null : { message: payload.error || 'Password reset failed.' } as AuthError };
      },
    },
  };
}
