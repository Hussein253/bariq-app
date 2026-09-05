import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * إدارة حسابات المروجين والمسوقين (Marketers / Promoters Management API)
 * ------------------------------------------------------------------
 * GET: جلب قائمة المروجين المعتمدين في المنصة
 * POST: إنشاء وتعيين حساب مروج جديد
 */

export async function GET() {
  const marketers = db.getMarketers()
  return NextResponse.json({
    success: true,
    count: marketers.length,
    marketers
  })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    if (!body.name || !body.phone) {
      return NextResponse.json({
        success: false,
        error: 'الحقول المطلوبة مفقودة: name, phone'
      }, { status: 400 })
    }

    const createdMarketer = db.createMarketer(body)

    return NextResponse.json({
      success: true,
      message: 'تم تسجيل حساب المروج بنجاح في الإدارة',
      marketer: createdMarketer
    }, { status: 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'حدث خطأ أثناء تسجيل المروج'
    return NextResponse.json({
      success: false,
      error: message
    }, { status: 500 })
  }
}
