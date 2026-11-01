import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * صلاحيات الجداول لدورَي anon و authenticated — الترحيل ٠٣٥
 * ==========================================================
 * الترحيل يسحب منح Supabase الافتراضية ويُبقي ما تقابله سياسة RLS ومسار
 * متصفح. شقّان منه يكسران الواجهة إن انكسرا، وهذا الملف يحرسهما:
 *   • SELECT لـ authenticated: البث الحي وقراءة الرسائل وسياسات القراءة.
 *   • عميل anon المجرّد (lib/supabase.ts) لا يقرأ إلا plans — وحدها تبقى لـ anon.
 */

const MIGRATION = 'supabase/migrations/035_lock_down_table_grants.sql'

/** ما يُسحب من authenticated على كل جدول، وعلى كل جدول جديد */
const AUTHENTICATED_REVOKED = ['delete', 'insert', 'maintain', 'references', 'trigger', 'truncate', 'update']

/** كتابة authenticated التي تقابلها سياسة على القاعدة الحية (2026-10-31) */
const POLICY_BACKED_WRITES: Record<string, string[]> = {
  'public.match_runs': ['delete', 'insert'],
  'public.uploads': ['delete', 'insert', 'update'],
}

interface Acl {
  defaults: boolean
  verb: string
  privileges: string[]
  objects: string
  roles: string[]
}

const list = (s: string) => s.split(',').map((x) => x.trim()).sort()

/** جمل الترحيل بلا تعليقات، بأحرف صغيرة ومسافات موحّدة */
const statements = readFileSync(MIGRATION, 'utf8')
  .replace(/--.*$/gm, '')
  .replace(/do \$\$[\s\S]*?\$\$;/g, '')
  .split(';')
  .map((s) => s.replace(/\s+/g, ' ').trim().toLowerCase())
  .filter(Boolean)

function parse(stmt: string): Acl | null {
  const m = stmt.match(
    /^(alter default privileges for role postgres in schema public )?(grant|revoke) (.+?) on (.+?) (?:to|from) (.+)$/
  )
  if (!m) return null
  return {
    defaults: Boolean(m[1]),
    verb: m[2],
    privileges: list(m[3]),
    objects: m[4].replace(/^table /, ''),
    roles: list(m[5]),
  }
}

const parsed = statements.map(parse)
const acls = parsed.filter((a): a is Acl => a !== null)

describe('صلاحيات الجداول لأدوار الـ API (الترحيل ٠٣٥)', () => {
  it('لا يحوي الترحيل إلا منحاً وسحباً، وتحديثاً واحداً لمخطط PostgREST', () => {
    // لا تعريف ولا بيانات: تطبيقه وإعادته لا يمسّان صفاً
    expect(statements.filter((_, i) => !parsed[i])).toEqual(["notify pgrst, 'reload schema'"])
  })

  it('دالة المُحفِّز الحية تُسحب منها EXECUTE بشرط وجودها، ولا يعرّفها الترحيل', () => {
    // قاعدة لا تحمل الدالة (المستودع وحده) لا تفشل عند الترحيل، والقاعدة الحية تُسحب منها
    const migration = readFileSync(MIGRATION, 'utf8')
    expect(migration).toContain("to_regprocedure('public.sync_live_n8n_message_update()') is not null")
    expect(migration).toContain(
      'revoke execute on function public.sync_live_n8n_message_update() from anon, authenticated, public;'
    )
    expect(migration).not.toMatch(/create\s+(or\s+replace\s+)?function\s+public\.sync_live_n8n_message_update/i)
  })

  it('anon لا يبقى له على الجداول القائمة إلا قراءة plans', () => {
    expect(acls).toContainEqual({
      defaults: false,
      verb: 'revoke',
      privileges: ['all'],
      objects: 'all tables in schema public',
      roles: ['anon'],
    })
    expect(acls.filter((a) => a.verb === 'grant' && a.roles.includes('anon'))).toEqual([
      { defaults: false, verb: 'grant', privileges: ['select'], objects: 'public.plans', roles: ['anon'] },
    ])
  })

  it('authenticated تُسحب منه الكتابة والتفريغ والتعريف والصيانة على كل جدول', () => {
    const revoke = acls.find(
      (a) => !a.defaults && a.verb === 'revoke' && a.objects === 'all tables in schema public' && a.roles.includes('authenticated')
    )
    expect(revoke?.privileges).toEqual(AUTHENTICATED_REVOKED)
  })

  it('لا جملة تسحب SELECT من authenticated', () => {
    // البث الحي (components/LiveConversations.tsx) وقراءة الرسائل يحتاجانها، وسحبها
    // عن جدول بلا سياسة يحوّل نتيجة التضمين الفارغة في PostgREST إلى خطأ
    for (const a of acls.filter((x) => x.verb === 'revoke' && x.roles.includes('authenticated'))) {
      expect(a.privileges).not.toContain('select')
      expect(a.privileges).not.toContain('all')
    }
  })

  it('الكتابة تعود لـ authenticated حيث تقابلها سياسة فقط', () => {
    const grants = acls.filter((a) => a.verb === 'grant' && a.roles.includes('authenticated'))
    expect(Object.fromEntries(grants.map((a) => [a.objects, a.privileges]))).toEqual(POLICY_BACKED_WRITES)
  })

  it('الجدول الجديد يبدأ بما ينتهي إليه الجدول الذي بلا سياسة', () => {
    expect(acls.filter((a) => a.defaults)).toEqual([
      { defaults: true, verb: 'revoke', privileges: ['all'], objects: 'tables', roles: ['anon'] },
      { defaults: true, verb: 'revoke', privileges: AUTHENTICATED_REVOKED, objects: 'tables', roles: ['authenticated'] },
    ])
  })
})

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(name) ? [path] : []
  })
}

describe('عميل anon المجرّد', () => {
  it('لا يقرأ إلا plans — وحدها تبقى لـ anon بعد الترحيل ٠٣٥', () => {
    const users = ['app', 'components', 'lib']
      .flatMap(sourceFiles)
      .filter((file) => /from ['"]@\/lib\/supabase['"]/.test(readFileSync(file, 'utf8')))

    // فحصٌ لا يجد ملفاً لا يحرس شيئاً
    expect(users).toContain(join('lib', 'plans-server.ts'))

    for (const file of users) {
      const source = readFileSync(file, 'utf8')
      const tables = [...source.matchAll(/\.from\(\s*['"`]([^'"`]+)['"`]/g)].map((m) => m[1])
      expect(tables.filter((t) => t !== 'plans'), file).toEqual([])
      expect(source, file).not.toMatch(/\.(rpc|channel)\(/)
    }
  })
})
