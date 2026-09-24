import type { Metadata } from 'next'
import LegalPage from '@/components/LegalPage'
import { getTranslations } from '@/lib/i18n/server'

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslations()
  return { title: t.privacy.metaTitle }
}

/**
 * تاريخ نفاذ النصّ المعروض. يُحدَّث يدوياً مع كل تعديل على t.privacy في
 * القواميس الثلاثة — وكذلك حين يتغيّر ما تصفه السياسة في الكود نفسه: جدول
 * جديد يحمل بيانات شخصية، أو مزوّد خدمة جديد، أو كوكي جديد.
 */
const UPDATED_AT = '2026-09-24'

export default async function PrivacyPage() {
  const { locale, t } = await getTranslations()
  return <LegalPage locale={locale} t={t} doc="privacy" updatedAt={UPDATED_AT} />
}
