import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import AppNavigation from "@/components/AppNavigation";
import CookieConsent from "@/components/CookieConsent";
import PublicFooter from "@/components/PublicFooter";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "https://radarb2b-iota.vercel.app",
  ),
  title: {
    default: "Radar B2B | Inteligência de contratação pública",
    template: "%s | Radar B2B",
  },
  description:
    "Pesquisa procedimentos, acompanha oportunidades e identifica padrões de contratação pública em Portugal.",
  applicationName: "Radar B2B",
  authors: [{ name: "Radar B2B" }],
  keywords: [
    "contratação pública",
    "procurement intelligence",
    "Portal BASE",
    "oportunidades comerciais",
    "Portugal",
  ],
  openGraph: {
    type: "website",
    locale: "pt_PT",
    siteName: "Radar B2B",
    title: "Radar B2B | Inteligência de contratação pública",
    description:
      "Inteligência comercial para pesquisar e acompanhar contratação pública portuguesa.",
  },
  alternates: {
    canonical: "/",
  },
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
    other: process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION
      ? { "msvalidate.01": process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION }
      : undefined,
  },
  category: "business",
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  themeColor: "#06101f",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: LayoutProps<"/">) {
  return (
    <html
      lang="pt-PT"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-slate-950">
        <AppNavigation />
        {children}
        <PublicFooter />
        <CookieConsent />
      </body>
    </html>
  );
}