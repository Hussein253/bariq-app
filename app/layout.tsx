import type { Metadata } from "next";
import { cookies } from "next/headers";
import { IBM_Plex_Sans_Arabic, Libre_Barcode_39_Text, Noto_Sans_Arabic } from "next/font/google";
import "./globals.css";
import SessionBar from "@/components/SessionBar";
import { getLocale } from "@/lib/i18n/server";
import { HTML_LANG, LOCALE_DIR } from "@/lib/i18n/config";
import { normalizeTheme, THEME_COOKIE, THEME_INIT_SCRIPT } from "@/lib/theme";

const ibmPlexArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-arabic",
  display: "swap",
});

// خط الكردية السورانية.
// ⚠️ ليس ترفاً طباعياً: السورانية تستعمل ڕ ڵ ێ ۆ ڤ، وهي حروف لا يغطّيها خط
// الواجهة العربي كاملةً — فتظهر مربّعات فارغة وسط الكلمة لمن اختار الكردية.
// يُطبَّق على lang="ckb" وحده (app/globals.css) فلا يزن شيئاً على غيره.
const notoKurdish = Noto_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-kurdish",
  display: "swap",
});

// خط باركود Code 39 لستيكر الشحنات.
// يُحمَّل عبر next/font لا عبر <link> إلى Google Fonts: الخط يُستضاف ذاتياً
// مع الحزمة، فيكون حاضراً لحظة window.print() بلا انتظار شبكة — وطباعة
// ملصق قبل وصول الخط تُنتج نصاً بدل باركود، وهو ملصق غير قابل للمسح.
// display:"block" يمنع عرض خط احتياطي مؤقت مكان الباركود.
const barcodeFont = Libre_Barcode_39_Text({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-barcode",
  display: "block",
});

export const metadata: Metadata = {
  title: "برق | المنصة اللوجستية الذكية وحلول التجارة الإلكترونية",
  description: "منصة إدارة التوصيل، البوتات الذكية، الحملات الإعلانية، وبوابات الدفع الإلكترونية العراقية (زين كاش وكي كارد)",
};

/**
 * ⚠️ لغة الصفحة واتجاهها لم يعودا ثابتين على العربية.
 * السمتان تُشتقّان من كوكي اللغة (lib/i18n/server)، فالإنجليزية تُرسم من
 * اليسار إلى اليمين بحقّ لا بمظهر معكوس، والكردية تُرسم من اليمين إلى
 * اليسار بخطّها الذي يغطّي حروفها.
 *
 * وصنف dark يُكتب هنا من الكوكي قبل أن يصل أي جافاسكربت: من اختار الوضع
 * الداكن يجب ألّا تُصفَع عينه بشاشة بيضاء لجزء من الثانية في كل تنقّل.
 * ومن لم يختر شيئاً يتولّاه سكربت ما قبل الرسم فيتبع إعداد جهازه.
 */
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const cookieStore = await cookies();
  const theme = normalizeTheme(cookieStore.get(THEME_COOKIE)?.value);

  return (
    <html
      lang={HTML_LANG[locale]}
      dir={LOCALE_DIR[locale]}
      className={`${ibmPlexArabic.variable} ${notoKurdish.variable} ${barcodeFont.variable} h-full${
        theme === "dark" ? " dark" : ""
      }`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col bg-page text-ink antialiased selection:bg-brand-soft selection:text-brand-text">
        <SessionBar />
        {children}
      </body>
    </html>
  );
}
