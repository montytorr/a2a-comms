import { compare } from 'bcryptjs'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createSession } from '@/lib/auth/session'
import { pool } from '@/lib/db/client'

const bodySchema = z.object({ email: z.string().email(), password: z.string().min(1).max(1024) })
const attempts = new Map<string, { count: number; resetAt: number }>()

export const POST = async (request: Request) => {
  const key = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const now = Date.now()
  const current = attempts.get(key)
  if (current && current.resetAt > now && current.count >= 8) {
    return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 })
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid credentials.' }, { status: 401 })

  const { rows } = await pool().query<{
    id: string; email: string; encrypted_password: string
  }>(
    `select id, email, encrypted_password from app_users
      where lower(email) = lower($1) and deleted_at is null
        and coalesce(banned_until, '-infinity'::timestamptz) <= now()
      limit 1`,
    [parsed.data.email.trim()],
  )
  const user = rows[0]
  const valid = Boolean(user?.encrypted_password) && await compare(parsed.data.password, user!.encrypted_password)
  if (!valid) {
    attempts.set(key, { count: current && current.resetAt > now ? current.count + 1 : 1, resetAt: now + 15 * 60_000 })
    return NextResponse.json({ error: 'Invalid credentials.' }, { status: 401 })
  }
  attempts.delete(key)
  await createSession({ id: user!.id, email: user!.email })
  return NextResponse.json({ ok: true })
}

