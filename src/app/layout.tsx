import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import AppNavigation from "@/components/AppNavigation";
import CookieConsent from "@/components/CookieConsent";
import GoogleAnalytics from "@/components/GoogleAnalytics";
import PublicFooter from "@/components/PublicFooter";
import { brand } from "@/lib/brand";
import { organizationJsonLd, websiteJsonLd } from "@/lib/seo";
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
    process.env.NEXT_PUBLIC_SITE_URL || brand.siteUrl,
  ),
  title: {
    default: `${brand.name} | ${brand.slogan}`,
    template: `%s | ${brand.name}`,
  },
  description:
    "Pesquisa procedimentos, acompanha oportunidades e identifica padrões de contratação pública em Portugal.",
  applicationName: brand.name,
  authors: [{ name: brand.name }],
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
    siteName: brand.name,
    title: `${brand.name} | ${brand.slogan}`,
    description: brand.description,
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd()) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd()) }}
        />
        <AppNavigation />
        {children}
        <PublicFooter />
        <CookieConsent />
        <GoogleAnalytics />
      </body>
    </html>
  );
}