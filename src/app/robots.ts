import type { MetadataRoute } from "next";
import { brand } from "@/lib/brand";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || brand.siteUrl;

  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/backoffice", "/conta", "/alertas", "/oportunidades", "/pesquisas-guardadas"] }],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
