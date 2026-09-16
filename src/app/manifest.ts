import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Radar B2B",
    short_name: "Radar B2B",
    description: "Inteligência comercial para contratação pública portuguesa.",
    start_url: "/",
    display: "standalone",
    background_color: "#06101f",
    theme_color: "#06101f",
    lang: "pt-PT",
  };
}
