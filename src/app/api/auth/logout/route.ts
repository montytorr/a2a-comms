import { NextResponse } from 'next/server'
import { destroySession } from '@/lib/auth/session'

export const POST = async () => {
  await destroySession()
  return NextResponse.json({ ok: true })
}

