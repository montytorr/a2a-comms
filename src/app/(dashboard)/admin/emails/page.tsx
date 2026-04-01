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
    <div className="p-6 lg:p-8">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Email Templates</h1>
            <p className="text-[12px] text-gray-500 mt-0.5">Preview and test transactional emails</p>
          </div>
        </div>
      </div>
      <EmailAdminClient userEmail={user.email} />
    </div>
  );
}
