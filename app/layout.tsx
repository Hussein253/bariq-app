import type { Metadata } from "next";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import "./globals.css";

const ibmPlexArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-arabic",
  display: "swap",
});

export const metadata: Metadata = {
  title: "برق | المنصة اللوجستية الذكية وحلول التجارة الإلكترونية",
  description: "منصة إدارة التوصيل، البوتات الذكية، الحملات الإعلانية، وبوابات الدفع الإلكترونية العراقية (زين كاش وكي كارد)",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" className={`${ibmPlexArabic.variable} h-full`}>
      <body className="min-h-full flex flex-col bg-[#F8F9FA] text-[#0F172A] antialiased selection:bg-[#253765]/20 selection:text-[#253765]">
        {children}
      </body>
    </html>
  );
}
