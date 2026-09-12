import { createHash, randomBytes } from 'node:crypto'
import { cookies, headers } from 'next/headers'
import { pool } from '@/lib/db/client'
import { SESSION_COOKIE } from './cookie'

const SESSION_SECONDS = Number(process.env.AUTH_SESSION_SECONDS || 60 * 60 * 24 * 30)

export type SessionUser = { id: string; email: string }
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

export const createSession = async (user: SessionUser) => {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000)
  const requestHeaders = await headers()
  await pool().query(
    `insert into app_sessions (user_id, token_hash, expires_at, user_agent)
     values ($1, $2, $3, $4)`,
    [user.id, hashToken(token), expiresAt, requestHeaders.get('user-agent')?.slice(0, 500) ?? null],
  )
  const store = await cookies()
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  })
}

export const sessionUser = async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (!token) return null
  const { rows } = await pool().query<SessionUser>(
    `select u.id, u.email
       from app_sessions s join app_users u on u.id = s.user_id
      where s.token_hash = $1 and s.expires_at > now()
        and u.deleted_at is null
        and coalesce(u.banned_until, '-infinity'::timestamptz) <= now()
      limit 1`,
    [hashToken(token)],
  )
  return rows[0] ?? null
}

export const destroySession = async () => {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (token) await pool().query('delete from app_sessions where token_hash = $1', [hashToken(token)])
  store.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
}

