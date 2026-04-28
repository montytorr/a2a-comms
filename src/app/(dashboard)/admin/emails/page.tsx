import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/auth-context';
import EmailAdminClient from './email-admin-client';

export const metadata = {
  title: 'Email Templates — A2A Comms',
};

export default async function EmailAdminPage() {
  const user = await getAuthUser();
  if (!user) redirect('/login?redirect=/admin/emails');
  if (!user.isSuperAdmin) redirect('/');

  return (
    <div style={{ padding: '1.5rem 2rem' }}>
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
          <div style={{ width: '2rem', height: '2rem', borderRadius: '0.5rem', background: 'var(--amber-bg)', border: '1px solid var(--amber)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--amber)' }}>
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
          </div>
          <div>
            <h1 className="h2">Email Templates</h1>
            <p className="dim" style={{ fontSize: '12px', marginTop: '0.125rem' }}>Preview and test transactional emails</p>
          </div>
        </div>
      </div>
      <EmailAdminClient userEmail={user.email} />
    </div>
  );
}
