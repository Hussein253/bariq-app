/**
 * رقم الموبايل العراقي بأي صيغة (ماسنجر 2026-10-31): الزبون يكتب 07XXXXXXXXX، أو +964 / 00964 / 964 وبعدها الرقم.
 * قبل هالتعديل: بوابة الرقم ما تقبل إلا الصيغة اللي تبدي بـ 07، وسطر «رقم الهاتف» بالملخص كان يقبل 0 + 10 أرقام بس،
 * فالرقم الدولي يطلب من الزبون يعيده. الدالة تحوّل أي صيغة لـ 07 (11 رقم) للملخص وللحفظ.
 *
 * هذا الملف مصدر الكود: n8n/phone-formats.mjs يزرعه بعقدة «Clean Agent Reply»، وtests/phone-formats.test.ts يختبره.
 */

/** الأرقام الهندية والفارسية ← إنكليزية. */
const latinDigits = (s) => String(s ?? '').replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
  .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))

/**
 * @param {string} text رسالة الزبون (أي صيغة، ويا أو بدون مسافات وشرطات)
 * @returns {string} 07XXXXXXXXX (11 رقم)، أو '' إذا ما فيه رقم عراقي
 */
export function iraqiPhone(text) {
  const digits = latinDigits(text).replace(/[\s\-.()‎‏]/g, '')
  const m = digits.match(/(?:^|\D)(?:(?:\+|00)?964)?(0?7\d{9})(?!\d)/)
  return m ? '0' + m[1].replace(/^0/, '') : ''
}
