import Link from 'next/link'
import { AlertCircle, ArrowLeft, ShieldAlert, Users } from 'lucide-react'
import { requireRole } from '@/lib/auth'
import { ROLE_LABELS } from '@/lib/roles'
import { listPlatformUsers, type PlatformUser } from '@/lib/users-server'
import { supabaseServer } from '@/lib/supabase-server'
import { toArabicDigits } from '@/lib/formatters'
import UsersClient, { type MerchantOption } from './UsersClient'

export const dynamic = 'force-dynamic'

const ROLE_STYLE: Record<string, string> = {
  platform_owner: 'bg-[#253765] text-white border-[#253765]',
  staff: 'bg-sky-50 text-sky-700 border-sky-200',
  merchant: 'bg-emerald-50 text-emerald-700 border-emerald-200',
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return toArabicDigits(new Date(iso).toISOString().slice(0, 10))
}

function UserRow({ user }: { user: PlatformUser }) {
  return (
    <tr className="border-b border-[#F1F5F9] hover:bg-[#F8FAFC]">
      <td className="p-3.5">
        <span className="font-mono text-xs text-[#0F172A] break-all" dir="ltr">
          {user.email}
        </span>
        {user.storeName && (
          <div className="text-[10px] text-slate-500 mt-0.5">{user.storeName}</div>
        )}
      </td>
      <td className="p-3.5">
        {user.role ? (
          <span
            className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-black border ${ROLE_STYLE[user.role]}`}
          >
            {ROLE_LABELS[user.role]}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border bg-amber-50 text-amber-800 border-amber-200">
            <ShieldAlert size={11} />
            بلا صلاحية
          </span>
        )}
      </td>
      <td className="p-3.5 text-xs text-slate-600">{user.merchantName ?? '—'}</td>
      <td className="p-3.5 font-mono text-[11px] text-slate-500">
        {user.lastSignInAt ? formatDate(user.lastSignInAt) : 'لم يدخل بعد'}
      </td>
    </tr>
  )
}

export default async function AdminUsersPage() {
  await requireRole(['platform_owner'])

  let users: PlatformUser[] = []
  let merchants: MerchantOption[] = []
  let loadError: string | null = null

  try {
    users = await listPlatformUsers()
    const { data } = await supabaseServer.from('merchants').select('id, name').order('name')
    merchants = (data ?? []) as MerchantOption[]
  } catch (err: unknown) {
    loadError = err instanceof Error ? err.message : 'تعذّر تحميل الحسابات'
  }

  const orphans = users.filter((u) => !u.role).length

  return (
    <div className="min-h-screen bg-[#F8F9FA]">
      <header className="bg-[#253765] text-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-8 py-5">
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-300 hover:text-white transition mb-2"
          >
            <ArrowLeft size={13} />
            لوحة مالك المنصة
          </Link>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight flex items-center gap-2">
            <Users size={22} />
            الحسابات والصلاحيات
          </h1>
          <p className="text-[11px] sm:text-xs text-slate-300 mt-1 leading-relaxed">
            لا تسجيل ذاتي في برق — الحسابات تُنشأ من هنا وحدها. الحساب يُنشأ مؤكَّداً
            ويدخل صاحبه فوراً بالبريد والرمز، بلا رسالة تأكيد ولا تغيير إجباري.
          </p>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-6">
        {loadError ? (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-start gap-2">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>{loadError}</span>
          </div>
        ) : (
          <>
            <section>
              <h2 className="text-sm font-black text-[#0F172A] mb-3">حساب جديد</h2>
              <UsersClient merchants={merchants} />
            </section>

            <section>
              <div className="flex items-center justify-between gap-3 mb-3">
                <h2 className="text-sm font-black text-[#0F172A]">
                  الحسابات ({toArabicDigits(users.length)})
                </h2>
                {orphans > 0 && (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1">
                    <ShieldAlert size={12} />
                    {toArabicDigits(orphans)} بلا صلاحية
                  </span>
                )}
              </div>

              <div className="rounded-2xl bg-white border border-[#E2E8F0] overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs">
                    <thead>
                      <tr className="text-[#64748B] bg-[#F8FAFC] border-b border-[#E2E8F0] font-semibold">
                        <th className="p-3.5">البريد</th>
                        <th className="p-3.5">الدور</th>
                        <th className="p-3.5">المتجر</th>
                        <th className="p-3.5">آخر دخول</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((u) => (
                        <UserRow key={u.userId} user={u} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {orphans > 0 && (
                <p className="mt-3 text-[11px] text-amber-800 leading-relaxed flex items-start gap-1.5">
                  <ShieldAlert size={13} className="shrink-0 mt-0.5" />
                  حساب بلا صلاحية موجود في نظام المصادقة لكنه بلا دور: يدخل ثم تُنهى جلسته
                  فوراً برسالة «حسابك غير مربوط بصلاحية بعد». امنحه دوراً أو احذفه من لوحة
                  Supabase.
                </p>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  )
}
