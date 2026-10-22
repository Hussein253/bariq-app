import { IRAQI_GOVERNORATES } from '@/lib/merchant-settings'
import { arNormalize } from './normalize'

/**
 * المحافظات المعتمدة في المنصة (IRAQI_GOVERNORATES — المستعملة في إعدادات التوصيل)
 * مفهرسةً بصيغتها المطبَّعة، فتُقارَن «الأنبار» و«الانبار» و«انبار» كأنها واحدة.
 */
const BY_NORMALIZED: ReadonlyMap<string, string> = new Map(
  IRAQI_GOVERNORATES.map((g) => [arNormalize(g), g] as const)
)

/** «محافظة البصرة» و«البصره» ← 'البصرة'. null إن لم تكن من المحافظات المعتمدة. */
export function canonicalGovernorate(text: string | null | undefined): string | null {
  const n = arNormalize(text).replace(/^محافظه\s+/, '')
  return BY_NORMALIZED.get(n) ?? null
}

/** هل النصّان محافظة واحدة (بعد التطبيع)؟ يُستعمل لمقارنة محافظة الزبون بمحافظة الانطلاق. */
export function sameGovernorate(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = arNormalize(a).replace(/^محافظه\s+/, '')
  const nb = arNormalize(b).replace(/^محافظه\s+/, '')
  return na !== '' && na === nb
}
