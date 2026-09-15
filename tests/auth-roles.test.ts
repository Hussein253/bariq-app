import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { homeForRole, ROLE_LABELS, type AppRole } from '@/lib/roles'

const ROLES: AppRole[] = ['platform_owner', 'staff', 'merchant']

describe('نموذج الأدوار', () => {
  it('كل دور له وجهة بعد الدخول', () => {
    expect(homeForRole('platform_owner')).toBe('/admin')
    expect(homeForRole('staff')).toBe('/operations')
    expect(homeForRole('merchant')).toBe('/workspace')
  })

  it('كل دور له تسمية عربية معروضة', () => {
    for (const role of ROLES) {
      expect(ROLE_LABELS[role], `الدور ${role} بلا تسمية`).toBeTruthy()
    }
  })

  it('أدوار الكود هي نفسها المسموحة في قيد قاعدة البيانات', () => {
    // الدور يُفحص في مكانين: قيد profiles_role_check في القاعدة، ونوع AppRole
    // في الكود. افتراقهما يعني دوراً يقبله أحدهما ويرفضه الآخر — فيُنشأ حساب
    // لا يستطيع الدخول، أو أسوأ: دور يمرّ بلا وجهة ولا صلاحية معرّفة.
    const migration = readFileSync('supabase/migrations/011_auth_roles_and_profiles.sql', 'utf8')
    const match = migration.match(/check \(role in \(([^)]+)\)\)/)
    expect(match, 'تعذّر العثور على قيد الأدوار في الترحيل').toBeTruthy()

    const fromDb = match![1]
      .split(',')
      .map((s) => s.trim().replace(/^'|'$/g, ''))
      .sort()

    expect(fromDb).toEqual([...ROLES].sort())
  })

  it('الترحيل يمنع ربط موظفي برق بتاجر، ويلزم التاجر بواحد', () => {
    const migration = readFileSync('supabase/migrations/011_auth_roles_and_profiles.sql', 'utf8')
    expect(migration).toContain("role = 'merchant' and merchant_id is not null")
    expect(migration).toContain("role <> 'merchant' and merchant_id is null")
  })

  it('الترحيل يحذف سياستَي الكتابة الذاتية على profiles', () => {
    // كانتا تسمحان لأي مستخدم بكتابة صفّه وتعديله — أي رفع نفسه إلى
    // platform_owner أو ربط نفسه بأي تاجر. اختبار يحرس إغلاقها.
    const migration = readFileSync('supabase/migrations/011_auth_roles_and_profiles.sql', 'utf8')
    expect(migration).toContain('drop policy if exists "Users can insert own profile" on public.profiles')
    expect(migration).toContain('drop policy if exists "Users can update own profile" on public.profiles')
    expect(migration).not.toMatch(/create policy[^\n]*on public\.profiles for (insert|update)/)
  })
})

describe('عزل المحادثات بالتاجر', () => {
  const migration = readFileSync('supabase/migrations/012_scope_data_to_merchant.sql', 'utf8')

  it('تُحذف سياسة القراءة المفتوحة القديمة', () => {
    expect(migration).toContain('drop policy if exists "conversations_select_client"')
    expect(migration).toContain('drop policy if exists "messages_select_client"')
  })

  it('لا تبقى أي سياسة بشرط using (true)', () => {
    // التعليقات تُستبعد: رأس الملف يشرح السياسة القديمة ويقتبس شرطها،
    // وفحص النص الخام كان سيعتبر الشرح نفسه مخالفة.
    const statements = migration
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n')

    expect(statements).not.toMatch(/using \(true\)/)
  })

  it('تُسحب القراءة من anon على الجدولين', () => {
    expect(migration).toContain('revoke select on table public.conversations from anon')
    expect(migration).toContain('revoke select on table public.messages from anon')
  })
})
