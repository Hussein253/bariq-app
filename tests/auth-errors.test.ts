import { describe, expect, it } from 'vitest'
import { classifyResetError } from '@/lib/auth-errors'

/**
 * التصنيف قرار أمني: خطأٌ صُنّف account_probe يُكتم، وخطأٌ صُنّف service
 * يُعرض. فخطأ في الاتجاه الأول يُخفي عطلاً عن المستخدم (وهو ما وقع فعلاً في
 * ٢٠٢٦-٠٩-٢٠)، وفي الاتجاه الثاني يُسرّب وجود حساب. الحالتان مُغطّاتان هنا.
 */
describe('classifyResetError', () => {
  it('يعرض عطل الإعداد بدل كتمانه — العطل الذي أخفاه الكتمان الشامل', () => {
    expect(classifyResetError(401, 'Invalid API key')).toBe('service')
  })

  it('يعدّ أعطال الخدمة والشبكة أعطالاً عندنا', () => {
    expect(classifyResetError(500, 'Internal Server Error')).toBe('service')
    expect(classifyResetError(undefined, 'fetch failed')).toBe('service')
    expect(classifyResetError(503, 'Error sending recovery email')).toBe('service')
  })

  it('يميّز حدّ الإرسال بالحالة ٤٢٩', () => {
    expect(classifyResetError(429, 'email rate limit exceeded')).toBe('rate_limited')
  })

  it('يميّز حدّ الإرسال بالنصّ وحده إن غابت الحالة', () => {
    expect(classifyResetError(undefined, 'email rate limit exceeded')).toBe('rate_limited')
    expect(classifyResetError(null, 'Too Many Requests')).toBe('rate_limited')
    expect(
      classifyResetError(400, 'For security purposes, you can only request this after 18 seconds.')
    ).toBe('rate_limited')
  })

  it('يكتم كل نصّ يكشف وجود الحساب من عدمه', () => {
    for (const message of [
      'User not found',
      'user does not exist',
      'Unable to find user with that email',
      'Email not registered',
    ]) {
      expect(classifyResetError(400, message)).toBe('account_probe')
    }
  })

  it('لا يكتم خطأً مجهولاً — الافتراض أنه عطل عندنا لا تعداد حسابات', () => {
    expect(classifyResetError(undefined, '')).toBe('service')
    expect(classifyResetError(undefined, null)).toBe('service')
    expect(classifyResetError(418, 'something unexpected')).toBe('service')
  })

  it('الحدّ يسبق فحص الحساب: رسالة تحمل الاثنين تُصنَّف حدّاً', () => {
    expect(classifyResetError(429, 'user not found, rate limit')).toBe('rate_limited')
  })
})
