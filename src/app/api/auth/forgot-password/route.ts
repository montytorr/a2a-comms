import { createHash, randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { pool } from '@/lib/db/client';
import { sendEmail } from '@/lib/email';

const bodySchema = z.object({ email: z.string().email() });
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export const POST = async (request: Request) => {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: true });

  const { rows } = await pool().query<{ id: string; email: string }>(
    `select id, email from app_users
      where lower(email) = lower($1) and deleted_at is null
        and coalesce(banned_until, '-infinity'::timestamptz) <= now()
      limit 1`,
    [parsed.data.email.trim()],
  );
  const user = rows[0];
  if (user) {
    const token = randomBytes(32).toString('base64url');
    await pool().query('delete from app_password_resets where user_id = $1 or expires_at <= now()', [user.id]);
    await pool().query(
      `insert into app_password_resets (user_id, token_hash, expires_at)
       values ($1, $2, now() + interval '1 hour')`,
      [user.id, hashToken(token)],
    );
    const base = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
    const result = await sendEmail(user.email, 'password-reset', {
      resetLink: `${base}/reset-password?token=${encodeURIComponent(token)}`,
    });
    if (result.error) console.error('[auth] password reset email failed:', result.error);
  }
  return NextResponse.json({ ok: true });
};
