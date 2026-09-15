import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

/**
 * اختبارات وحدة للدوال النقية فقط (بلا شبكة ولا قاعدة بيانات).
 * المسارات التي تلمس Supabase تحتاج بيئة اختبار منفصلة بقاعدة مؤقتة —
 * تُبنى لاحقاً. ما هنا يغطّي المنطق الذي يفسد بصمت إن انكسر: تطبيع الأرقام،
 * التحقق من التوقيع، آلة الحالات، ورفض المبالغ المفقودة.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
})
