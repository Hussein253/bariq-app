import { NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import {
  validateDeliverySettings,
  type DeliverySettings,
  type MerchantProfile,
} from '@/lib/merchant-settings'

export const dynamic = 'force-dynamic'

/**
 * معلومات نشاط التاجر وقواعد توصيله — يقرأها الموظف الذكي ليجيب الزبائن.
 * ⚠️ لا يوجد تسجيل دخول بعد: merchantId يصل من العميل بلا تحقق من ملكيته.
 */

/** GET /api/merchant-settings?merchant=<uuid> */
export async function GET(request: Request) {
  try {
    const merchantId = new URL(request.url).searchParams.get('merchant')
    if (!merchantId) {
      return NextResponse.json({ success: false, error: 'معرّف التاجر مطلوب' }, { status: 400 })
    }

    const [profileRes, deliveryRes] = await Promise.all([
      supabaseServer.from('merchant_profiles').select('*').eq('merchant_id', merchantId).maybeSingle(),
      supabaseServer
        .from('merchant_delivery_settings')
        .select('*')
        .eq('merchant_id', merchantId)
        .maybeSingle(),
    ])

    if (profileRes.error) {
      return NextResponse.json({ success: false, error: profileRes.error.message }, { status: 500 })
    }
    if (deliveryRes.error) {
      return NextResponse.json({ success: false, error: deliveryRes.error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      profile: (profileRes.data as MerchantProfile | null) ?? null,
      delivery: (deliveryRes.data as DeliverySettings | null) ?? null,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'تعذّر تحميل الإعدادات'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

/**
 * PUT /api/merchant-settings
 * يحفظ قسماً واحداً في كل نداء: { merchantId, section: 'profile' | 'delivery', data }
 */
export async function PUT(request: Request) {
  try {
    const { merchantId, section, data } = (await request.json()) as {
      merchantId?: string
      section?: 'profile' | 'delivery'
      data?: Record<string, unknown>
    }

    if (!merchantId || !data) {
      return NextResponse.json({ success: false, error: 'بيانات ناقصة' }, { status: 400 })
    }

    if (section === 'profile') {
      const text = (v: unknown) => {
        const s = typeof v === 'string' ? v.trim() : ''
        return s === '' ? null : s
      }

      const { data: saved, error } = await supabaseServer
        .from('merchant_profiles')
        .upsert(
          {
            merchant_id: merchantId,
            about: text(data.about),
            working_hours: text(data.working_hours),
            contact_phone: text(data.contact_phone),
            address: text(data.address),
            maps_url: text(data.maps_url),
            delivery_zone: text(data.delivery_zone),
            current_offers: text(data.current_offers),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'merchant_id' }
        )
        .select()
        .single()

      if (error) {
        console.error('[MERCHANT_SETTINGS][PROFILE_ERROR]', error.message)
        return NextResponse.json({ success: false, error: error.message }, { status: 500 })
      }
      return NextResponse.json({ success: true, profile: saved as MerchantProfile })
    }

    if (section === 'delivery') {
      const errors = validateDeliverySettings(data as Partial<DeliverySettings>)
      if (errors.length > 0) {
        return NextResponse.json(
          { success: false, error: errors[0].message, errors },
          { status: 422 }
        )
      }

      const { data: saved, error } = await supabaseServer
        .from('merchant_delivery_settings')
        .upsert(
          {
            merchant_id: merchantId,
            base_governorate: String(data.base_governorate).trim(),
            local_fee_iqd: Number(data.local_fee_iqd),
            local_days: Number(data.local_days),
            local_note: (data.local_note as string)?.trim() || null,
            other_fee_iqd: Number(data.other_fee_iqd),
            other_days: Number(data.other_days),
            other_note: (data.other_note as string)?.trim() || null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'merchant_id' }
        )
        .select()
        .single()

      if (error) {
        console.error('[MERCHANT_SETTINGS][DELIVERY_ERROR]', error.message)
        return NextResponse.json({ success: false, error: error.message }, { status: 500 })
      }
      return NextResponse.json({ success: true, delivery: saved as DeliverySettings })
    }

    return NextResponse.json({ success: false, error: 'قسم غير معروف' }, { status: 400 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'تعذّر حفظ الإعدادات'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
