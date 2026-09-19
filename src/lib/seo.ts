import { brand } from "@/lib/brand";

/**
 * Helpers de dados estruturados (JSON-LD) e metadados partilhados.
 * Centralizados aqui para manter consistência entre páginas.
 */

export const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || brand.siteUrl;

/** Organization — deve ser injetado uma única vez no layout raiz. */
export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: brand.name,
    url: siteUrl,
    logo: `${siteUrl}/icon.svg`,
    description: brand.description,
    areaServed: "PT",
    sameAs: [] as string[],
  };
}

/** WebSite com SearchAction — ajuda na sitelinks searchbox do Google. */
export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: brand.name,
    url: siteUrl,
    inLanguage: "pt-PT",
    potentialAction: {
      "@type": "SearchAction",
      target: `${siteUrl}/pesquisa?query={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

export type FaqEntry = { question: string; answer: string };

/** FAQPage — aplicável à página /faq. */
export function faqJsonLd(entries: FaqEntry[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: entries.map((entry) => ({
      "@type": "Question",
      name: entry.question,
      acceptedAnswer: { "@type": "Answer", text: entry.answer },
    })),
  };
}

export type ProductPlan = {
  name: string;
  description: string;
  price: number;
  priceCurrency?: string;
};

/** Product/Offer por plano — aplicável à página /planos. */
export function productJsonLd(plan: ProductPlan) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: `${brand.name} ${plan.name}`,
    description: plan.description,
    brand: { "@type": "Brand", name: brand.name },
    offers: {
      "@type": "Offer",
      price: plan.price,
      priceCurrency: plan.priceCurrency || "EUR",
      availability: "https://schema.org/InStock",
      url: `${siteUrl}/planos`,
    },
  };
}
