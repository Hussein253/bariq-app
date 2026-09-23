import Link from 'next/link'
import { AlertCircle, ArrowLeft, ArrowRight, ShieldAlert, Users } from 'lucide-react'
import { requireRole } from '@/lib/auth'
import { listPlatformUsers, type PlatformUser } from '@/lib/users-server'
import { supabaseServer } from '@/lib/supabase-server'
import { localizeDigits } from '@/lib/formatters'
import { getTranslations } from '@/lib/i18n/server'
import { fill, type Dictionary } from '@/lib/i18n'
import { LOCALE_DIR, type Locale } from '@/lib/i18n/config'
import UsersClient, { type MerchantOption } from './UsersClient'

export const dynamic = 'force-dynamic'

const ROLE_STYLE: Record<string, string> = {
  platform_owner: 'bg-brand text-on-brand border-brand',
  staff: 'bg-info-bg text-info-ink border-info-line',
  merchant: 'bg-success-bg text-success-ink border-success-line',
}

function formatDate(iso: string | null, locale: Locale): string {
  if (!iso) return '—'
  return localizeDigits(new Date(iso).toISOString().slice(0, 10), locale)
}

function UserRow({
  user,
  locale,
  t,
  roleLabels,
}: {
  user: PlatformUser
  locale: Locale
  t: Dictionary['app']['users']
  roleLabels: Dictionary['session']['roles']
}) {
  return (
    <tr className="border-b border-line hover:bg-surface-2">
      <td className="p-3.5">
        <span className="font-mono text-xs text-ink break-all" dir="ltr">
          {user.email}
        </span>
        {user.storeName && (
          <div className="text-[10px] text-ink-muted mt-0.5">{user.storeName}</div>
        )}
      </td>
      <td className="p-3.5">
        {user.role ? (
          <span
            className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-black border ${ROLE_STYLE[user.role]}`}
          >
            {roleLabels[user.role]}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border bg-warn-bg text-warn-ink border-warn-line">
            <ShieldAlert size={11} />
            {t.noRole}
          </span>
        )}
      </td>
      <td className="p-3.5 text-xs text-ink-muted">{user.merchantName ?? '—'}</td>
      <td className="p-3.5 font-mono text-[11px] text-ink-muted">
        {user.lastSignInAt ? formatDate(user.lastSignInAt, locale) : t.neverSignedIn}
      </td>
    </tr>
  )
}

export default async function AdminUsersPage() {
  await requireRole(['platform_owner'])

  const { locale, t } = await getTranslations()
  const u = t.app.users
  const Back = LOCALE_DIR[locale] === 'rtl' ? ArrowLeft : ArrowRight

  let users: PlatformUser[] = []
  let merchants: MerchantOption[] = []
  let loadError: string | null = null

  try {
    users = await listPlatformUsers()
    const { data } = await supabaseServer.from('merchants').select('id, name').order('name')
    merchants = (data ?? []) as MerchantOption[]
  } catch (err: unknown) {
    loadError = err instanceof Error ? err.message : u.loadError
  }

  const orphans = users.filter((user) => !user.role).length

  return (
    <div className="min-h-screen bg-page">
      <header className="bg-brand text-on-brand">
        <div className="max-w-5xl mx-auto px-4 sm:px-8 py-5">
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 text-[11px] font-bold text-on-brand/70 hover:text-on-brand transition mb-2"
          >
            <Back size={13} />
            {u.backToAdmin}
          </Link>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight flex items-center gap-2">
            <Users size={22} />
            {u.title}
          </h1>
          <p className="text-[11px] sm:text-xs text-on-brand/70 mt-1 leading-relaxed">
            {u.subtitle}
          </p>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-6">
        {loadError ? (
          <div className="p-4 rounded-2xl bg-danger-bg border border-danger-line text-danger-ink text-xs font-semibold flex items-start gap-2">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>{loadError}</span>
          </div>
        ) : (
          <>
            <section>
              <h2 className="text-sm font-black text-ink mb-3">{u.newAccount}</h2>
              <UsersClient
                merchants={merchants}
                t={u}
                roleLabels={t.session.roles}
                optionalLabel={t.app.common.optional}
              />
            </section>

            <section>
              <div className="flex items-center justify-between gap-3 mb-3">
                <h2 className="text-sm font-black text-ink">
                  {fill(u.listTitle, { n: localizeDigits(users.length, locale) })}
                </h2>
                {orphans > 0 && (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-warn-ink bg-warn-bg border border-warn-line rounded-full px-2.5 py-1">
                    <ShieldAlert size={12} />
                    {fill(u.orphanBadge, { n: localizeDigits(orphans, locale) })}
                  </span>
                )}
              </div>

              <div className="rounded-2xl bg-surface border border-line overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-start text-xs">
                    <thead>
                      <tr className="text-ink-muted bg-surface-2 border-b border-line font-semibold">
                        <th className="p-3.5 text-start">{u.table.email}</th>
                        <th className="p-3.5 text-start">{u.table.role}</th>
                        <th className="p-3.5 text-start">{u.table.store}</th>
                        <th className="p-3.5 text-start">{u.table.lastSignIn}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((user) => (
                        <UserRow
                          key={user.userId}
                          user={user}
                          locale={locale}
                          t={u}
                          roleLabels={t.session.roles}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {orphans > 0 && (
                <p className="mt-3 text-[11px] text-warn-ink leading-relaxed flex items-start gap-1.5">
                  <ShieldAlert size={13} className="shrink-0 mt-0.5" />
                  {u.orphanNote}
                </p>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  )
}
