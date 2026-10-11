import type { NextConfig } from "next";

/**
 * ترويسات الأمان — على كل استجابة
 * =================================
 * قبلها كان النشر يرسل HSTS وحده (من Vercel)، فكانت لوحات التحكم قابلة
 * للتضمين في إطار صفحة أخرى (Clickjacking): صفحة مزوَّرة تضع /admin أو
 * /workspace في iframe شفّاف وتستدرج الموظف إلى ضغطة لا يرى ما تفعله.
 *
 * ⚠️ CSP هنا لا يقيّد السكربتات عمداً: تطبيق Next يحقن سكربتات مضمَّنة، و
 * app/layout.tsx فيه سكربت تهيئة السِّمة. تقييدها يحتاج nonce لكل طلب، وتقييد
 * ناقص يكسر الواجهة بصمت. ما هنا يغلق التضمين وحقن <base> وإرسال النماذج إلى
 * نطاق آخر — بلا أثر على ما يعمل اليوم.
 */
const SECURITY_HEADERS = [
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  },
  // نظير frame-ancestors للمتصفّحات القديمة التي لا تقرأ CSP
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // روابط التتبّع الخارجة لا تحمل مسار الصفحة ولا استعلامها (قد يحمل رمزاً)
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  // لا داعي لإعلان إطار العمل ونسخته لمن يمسح الإنترنت بحثاً عن نسخة مصابة
  poweredByHeader: false,

  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
