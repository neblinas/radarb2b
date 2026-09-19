import type { MetadataRoute } from "next";
import { brand } from "@/lib/brand";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || brand.siteUrl;
  const now = new Date();

  // Páginas públicas com prioridade própria.
  const routes: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[0]["changeFrequency"] }[] = [
    { path: "/", priority: 1, changeFrequency: "weekly" },
    { path: "/planos", priority: 0.9, changeFrequency: "monthly" },
    { path: "/pesquisa", priority: 0.9, changeFrequency: "daily" },
    { path: "/programa-comercial", priority: 0.7, changeFrequency: "monthly" },
    { path: "/recrutamento", priority: 0.7, changeFrequency: "monthly" },
    { path: "/sobre", priority: 0.6, changeFrequency: "monthly" },
    { path: "/faq", priority: 0.6, changeFrequency: "monthly" },
    { path: "/contacto", priority: 0.6, changeFrequency: "monthly" },
    { path: "/acesso-comercial", priority: 0.5, changeFrequency: "monthly" },
    { path: "/login", priority: 0.5, changeFrequency: "monthly" },
    { path: "/termos", priority: 0.3, changeFrequency: "yearly" },
    { path: "/privacidade", priority: 0.3, changeFrequency: "yearly" },
    { path: "/cookies", priority: 0.3, changeFrequency: "yearly" },
    { path: "/informacao-legal", priority: 0.3, changeFrequency: "yearly" },
  ];

  return routes.map((route) => ({
    url: `${baseUrl}${route.path}`,
    lastModified: now,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}

