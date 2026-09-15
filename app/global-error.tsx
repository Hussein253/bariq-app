'use client'

/**
 * حدّ الخطأ الجذري — يلتقط ما يسقط في app/layout.tsx نفسه.
 * لا يستطيع الاعتماد على التخطيط الجذري (وهو المعطوب أصلاً في هذه الحالة)،
 * فيرسم وسمَي html و body بنفسه بأنماط مضمّنة بلا Tailwind ولا خطوط.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="ar" dir="rtl">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#F8F9FA',
          color: '#0F172A',
          fontFamily: 'system-ui, sans-serif',
          padding: '1rem',
        }}
      >
        <div style={{ maxWidth: '26rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.125rem', marginBottom: '0.5rem' }}>
            المنصة متوقّفة مؤقتاً
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#475569', lineHeight: 1.7 }}>
            حدث خطأ جذري منع تحميل الواجهة. فريق برق يُشعَر تلقائياً.
          </p>
          {error.digest && (
            <p style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '1rem' }}>
              رمز الخطأ: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            style={{
              marginTop: '1.25rem',
              background: '#253765',
              color: '#fff',
              border: 0,
              borderRadius: '0.75rem',
              padding: '0.625rem 1.25rem',
              fontSize: '0.875rem',
              cursor: 'pointer',
            }}
          >
            إعادة المحاولة
          </button>
        </div>
      </body>
    </html>
  )
}
