import type { Metadata } from 'next'
import LegalPage from '@/components/LegalPage'
import { getTranslations } from '@/lib/i18n/server'

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslations()
  return { title: t.terms.metaTitle }
}

/**
 * تاريخ نفاذ النصّ المعروض. يُحدَّث يدوياً مع كل تعديل على t.terms في
 * القواميس الثلاثة — لا من تاريخ النشر: إعادة نشر لم تمسّ الشروط لا تغيّرها.
 */
const UPDATED_AT = '2026-09-24'

export default async function TermsPage() {
  const { locale, t } = await getTranslations()
  return <LegalPage locale={locale} t={t} doc="terms" updatedAt={UPDATED_AT} />
}
