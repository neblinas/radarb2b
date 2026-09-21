import { brand } from "@/lib/brand";

/**
 * Símbolo de marca (SVG inline).
 *
 * Desenho próprio — não um ícone de biblioteca — para dar identidade:
 * três barras ascendentes (dados/mérito) sob uma "lupa de mercado",
 * com um acento de crescimento. Escala nítida em qualquer tamanho.
 */
export function BrandMark({ size = 24 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Barras de dados (ascendentes) */}
      <rect x="6" y="19" width="4.5" height="8" rx="1.5" fill="currentColor" opacity="0.55" />
      <rect x="13.75" y="14" width="4.5" height="13" rx="1.5" fill="currentColor" opacity="0.8" />
      <rect x="21.5" y="9" width="4.5" height="18" rx="1.5" fill="currentColor" />
      {/* Linha de crescimento / tendência */}
      <path
        d="M6.5 15.5L13.5 10L20 12.5L26 5.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.9"
      />
      {/* Ponto de valor no topo */}
      <circle cx="26" cy="5.5" r="2.4" fill="currentColor" />
    </svg>
  );
}

type BrandLogoProps = {
  /** Tamanho do símbolo (px). */
  size?: number;
  /** Mostra o subtítulo sob o nome. */
  tagline?: string | false;
  /** Variante de cor do símbolo/quadrado. */
  className?: string;
};

/**
 * Logótipo completo (símbolo + wordmark + tagline opcional), coeso em toda a app.
 * Usado na navbar, no back-office e no rodapé.
 */
export default function BrandLogo({ size = 36, tagline = "Procurement Intelligence", className = "" }: BrandLogoProps) {
  return (
    <span className={`flex items-center gap-3 ${className}`}>
      <span
        className="flex items-center justify-center rounded-xl border border-cyan-400/25 bg-gradient-to-br from-cyan-400/15 to-cyan-400/[0.04] text-cyan-300 shadow-[0_0_24px_rgba(34,211,238,0.12)]"
        style={{ width: size, height: size }}
      >
        <BrandMark size={Math.round(size * 0.62)} />
      </span>
      <span className="leading-tight">
        <span className="block text-sm font-bold tracking-[0.16em] text-white">{brand.wordmark}</span>
        {tagline ? (
          <span className="hidden text-[10px] uppercase tracking-[0.15em] text-slate-500 sm:block">{tagline}</span>
        ) : null}
      </span>
    </span>
  );
}
