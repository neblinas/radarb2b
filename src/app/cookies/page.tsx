import type { Metadata } from "next";
import Link from "next/link";
import PublicPage from "@/components/PublicPage";
import { legalOperator } from "@/lib/legal";

export const metadata: Metadata = { title: "Política de cookies", description: "Preferências e categorias de armazenamento utilizadas pelo Adjudata." };

export default function CookiesPage() {
  return <PublicPage><article className="prose prose-invert max-w-3xl prose-headings:font-semibold prose-headings:tracking-tight prose-headings:text-white prose-p:text-slate-400 prose-li:text-slate-400"><p className="not-prose text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">Preferências</p><h1>Política de cookies</h1><p className="lead">Última atualização: {legalOperator.lastUpdated}</p><p>Esta política explica como o Adjudata utiliza cookies e outras tecnologias de armazenamento, em conformidade com a Lei n.º 41/2004, na redação em vigor. As categorias opcionais só são ativadas após o teu consentimento.</p>

<h2>1. O que são</h2>
<p>Cookies e tecnologias similares (como o armazenamento local) permitem guardar informação no teu dispositivo. Utilizamos apenas o necessário para autenticação e funcionamento, e categorias opcionais que controlas no banner de consentimento.</p>

<h2>2. Categorias e prazos</h2>
<table><thead><tr><th>Categoria</th><th>Finalidade</th><th>Base legal</th><th>Conservação</th></tr></thead><tbody><tr><td><strong>Necessários</strong></td><td>Sessão, autenticação e segurança</td><td>Estritamente necessário (isenção de consentimento)</td><td>Duração da sessão / até 12 meses</td></tr><tr><td><strong>Análise</strong></td><td>Métricas agregadas de utilização</td><td>Consentimento</td><td>Até 12 meses</td></tr><tr><td><strong>Marketing</strong></td><td>Campanhas e comunicações</td><td>Consentimento</td><td>Até 12 meses</td></tr></tbody></table>
<p>As chaves de armazenamento essenciais incluem as preferências de consentimento (<code>radar_cookie_consent</code>) e os tokens de sessão geridos pelo serviço de autenticação.</p>

<h2>3. Gerir ou retirar consentimento</h2>
<p>Podes alterar a tua escolha a qualquer momento através do botão <strong>Gerir cookies</strong> disponível no rodapé do site, que reabre o painel de preferências. Também podes apagar as preferências e os dados de armazenamento através das definições do teu navegador. A retirada de consentimento não afeta a licitude do tratamento realizado antes da retirada.</p>

<h2>4. Contacto</h2>
<p>Para questões sobre cookies e privacidade, contacta {legalOperator.privacyEmail || "o contacto de privacidade indicado na Política de privacidade"} ou consulta a <Link href="/privacidade">Política de privacidade</Link>.</p>
</article></PublicPage>;
}
