import Link from "next/link";
import CookieSettingsButton from "@/components/CookieSettingsButton";

const legalLinks = [
  ["Sobre nós", "/sobre"],
  ["Perguntas frequentes", "/faq"],
  ["Termos de utilização", "/termos"],
  ["Privacidade", "/privacidade"],
  ["Cookies", "/cookies"],
  ["Informação legal", "/informacao-legal"],
  ["Contacto", "/contacto"],
  ["Acesso comercial", "/acesso-comercial"],
] as const;

export default function PublicFooter() {
  return (
    <footer className="border-t border-slate-800/80 bg-[#06101f]">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-6 px-4 py-8 sm:px-6 lg:flex-row lg:items-end lg:justify-between lg:px-8">
        <div>
          <p className="text-sm font-bold tracking-[0.16em] text-white">RADAR B2B</p>
          <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">Inteligência comercial para contratação pública portuguesa.</p>
          <p className="mt-4 text-xs text-slate-600">© {new Date().getFullYear()} Radar B2B · Portugal</p>
        </div>
        <nav aria-label="Informação legal" className="flex flex-wrap gap-x-5 gap-y-3 text-sm text-slate-400">
          {legalLinks.map(([label, href]) => <Link key={href} href={href} className="transition hover:text-cyan-300">{label}</Link>)}
          <CookieSettingsButton />
        </nav>
      </div>
    </footer>
  );
}

