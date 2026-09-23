import { NextResponse } from 'next/server'
import { getPlatformStatus } from '@/lib/status'

// فحص حي في كل طلب — لا تخزين مؤقت لحالة قد تتغيّر خلال ثوانٍ
export const dynamic = 'force-dynamic'

export async function GET() {
  const status = await getPlatformStatus()
  return NextResponse.json(status, { status: status.overall === 'operational' ? 200 : 503 })
}
