import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * إدارة واستعلام الحملات الإعلانية لمنصات التواصل (Instagram, Facebook, TikTok, Snapchat, Google)
 * ------------------------------------------------------------------------------------------
 * GET: جلب الحملات مع إمكانية التصفية حسب التاجر
 * POST: إنشاء حملة إعلانية جديدة من قبل المروج
 */

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const merchantId = searchParams.get('merchant_id') || undefined

  const campaigns = db.getCampaigns(merchantId)

  return NextResponse.json({
    success: true,
    count: campaigns.length,
    campaigns
  })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    if (!body.name || !body.merchant_name || !body.platform) {
      return NextResponse.json({
        success: false,
        error: 'الحقول المطلوبة مفقودة: name, merchant_name, platform'
      }, { status: 400 })
    }

    const createdCampaign = db.createCampaign(body)

    return NextResponse.json({
      success: true,
      message: 'تم إنشاء الحملة الإعلانية بنجاح',
      campaign: createdCampaign
    }, { status: 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'خطأ أثناء إنشاء الحملة الإعلانية'
    return NextResponse.json({
      success: false,
      error: message
    }, { status: 500 })
  }
}
