import { NextResponse } from 'next/server'
import { sessionUser } from '@/lib/auth/session'

export const GET = async () => NextResponse.json({ user: await sessionUser() })
