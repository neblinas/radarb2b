import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://radarb2b-iota.vercel.app";

  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/backoffice", "/conta", "/alertas", "/oportunidades", "/pesquisas-guardadas"] }],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
