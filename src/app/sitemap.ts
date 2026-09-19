import type { MetadataRoute } from "next";
import { brand } from "@/lib/brand";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || brand.siteUrl;
  const routes = ["/", "/login", "/planos", "/recrutamento", "/sobre", "/faq", "/contacto", "/termos", "/privacidade", "/cookies", "/informacao-legal"];

  return routes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: route === "/" ? "weekly" : "monthly",
    priority: route === "/" ? 1 : 0.6,
  }));
}

