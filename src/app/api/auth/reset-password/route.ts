import { createHash } from 'node:crypto';
import { hash } from 'bcryptjs';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { transaction } from '@/lib/db/client';

const bodySchema = z.object({ token: z.string().min(20).max(256), password: z.string().min(12).max(1024) });
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export const POST = async (request: Request) => {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid reset token or password.' }, { status: 400 });
  const encrypted = await hash(parsed.data.password, 12);
  const changed = await transaction(async (client) => {
    const { rows } = await client.query<{ id: string; user_id: string }>(
      `select id, user_id from app_password_resets
        where token_hash = $1 and used_at is null and expires_at > now()
        for update`,
      [hashToken(parsed.data.token)],
    );
    const reset = rows[0];
    if (!reset) return false;
    await client.query('update app_users set encrypted_password = $1, updated_at = now() where id = $2', [encrypted, reset.user_id]);
    await client.query('update app_password_resets set used_at = now() where id = $1', [reset.id]);
    await client.query('delete from app_sessions where user_id = $1', [reset.user_id]);
    return true;
  });
  if (!changed) return NextResponse.json({ error: 'This reset link is invalid or expired.' }, { status: 400 });
  return NextResponse.json({ ok: true });
};
