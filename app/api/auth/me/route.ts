import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'

export async function GET() {
  const session = await getSession()
  if (!session) return NextResponse.json(null)
  return NextResponse.json({ name: session.name, email: session.email, role: session.role })
}
