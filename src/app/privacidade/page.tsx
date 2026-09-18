import type { Metadata } from "next";
import Link from "next/link";
import PublicPage from "@/components/PublicPage";
import { dataProcessors, legalOperator, retentionPeriods } from "@/lib/legal";

export const metadata: Metadata = { title: "Política de privacidade", description: "Como o Radar B2B trata dados pessoais e assegura os direitos dos titulares." };

export default function PrivacyPage() {
  return <PublicPage><article className="prose prose-invert max-w-3xl prose-headings:font-semibold prose-headings:tracking-tight prose-headings:text-white prose-p:text-slate-400 prose-li:text-slate-400"><p className="not-prose text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">RGPD</p><h1>Política de privacidade</h1><p className="lead">Última atualização: {legalOperator.lastUpdated}</p><p>Esta política explica como o Radar B2B trata dados pessoais, em conformidade com o Regulamento (UE) 2016/679 (RGPD) e a legislação portuguesa aplicável.</p>

<h2>1. Responsável pelo tratamento</h2>
<p><strong>Responsável:</strong> {legalOperator.legalName || "a publicar com a designação legal definitiva"}{legalOperator.legalName ? ` (${legalOperator.legalForm.toLowerCase()}), nome comercial ${legalOperator.brand}` : ""}, estabelecido em {legalOperator.country}.<br /><strong>NIF:</strong> {legalOperator.nif || "a publicar com a designação legal definitiva"}<br /><strong>Estabelecimento (sede):</strong> {legalOperator.address || "a publicar com a designação legal definitiva"}<br /><strong>Contacto de privacidade:</strong> {legalOperator.privacyEmail || "disponível através da página de contacto"}; podes também usar a categoria Privacidade/RGPD em <Link href="/contacto">contacto</Link>.<br /><strong>Encarregado de Proteção de Dados (DPO):</strong> {legalOperator.dpo || "não designado; os pedidos de privacidade são tratados pelo responsável através dos canais indicados"}</p>

<h2>2. Dados pessoais tratados</h2>
<ul><li>Dados de conta: email, identificador de utilizador e credenciais (armazenadas de forma cifrada).</li><li>Dados de utilização: pesquisas, oportunidades e alertas guardados, quotas e registos necessários à segurança.</li><li>Dados de faturação: plano, estado da subscrição e referências de pagamento (os dados de cartão são tratados diretamente pelo processador de pagamentos).</li><li>Dados técnicos mínimos de segurança e diagnóstico (por exemplo, registo de erros).</li><li>Dados fornecidos em pedidos de suporte, incluindo o email de resposta.</li></ul>

<h2>3. Finalidades e bases legais</h2>
<ul><li><strong>Prestação do serviço e gestão da conta</strong> — execução do contrato (art. 6.º, n.º 1, alínea b).</li><li><strong>Segurança, prevenção de abuso e integridade do serviço</strong> — interesse legítimo (art. 6.º, n.º 1, alínea f).</li><li><strong>Faturação e cumprimento de obrigações legais e fiscais</strong> — obrigação legal (art. 6.º, n.º 1, alínea c).</li><li><strong>Resposta a pedidos de suporte</strong> — execução do contrato ou interesse legítimo.</li><li><strong>Comunicações opcionais e cookies não essenciais</strong> — consentimento (art. 6.º, n.º 1, alínea a), que pode ser retirado a qualquer momento.</li></ul>

<h2>4. Subcontratantes e destinatários</h2>
<p>Recorremos a prestadores que tratam dados por nossa conta e sob contrato, apenas na medida necessária:</p>
<ul>{dataProcessors.map((processor) => <li key={processor.name}><strong>{processor.name}</strong> — {processor.role} ({processor.location}).</li>)}</ul>

<h2>5. Transferências internacionais</h2>
<p>Quando um prestador se situe fora do Espaço Económico Europeu, a transferência é enquadrada por garantias adequadas, designadamente cláusulas contratuais-tipo aprovadas pela Comissão Europeia e medidas suplementares quando necessárias.</p>

<h2>6. Prazo de conservação</h2>
<p>Conservamos os dados apenas pelo tempo necessário às finalidades indicadas e às obrigações legais:</p>
<ul>{retentionPeriods.map((item) => <li key={item.data}><strong>{item.data}</strong> — {item.period}.</li>)}</ul>

<h2>7. Os teus direitos</h2>
<p>Nos termos dos artigos 15.º a 22.º do RGPD, podes exercer os direitos de acesso, retificação, apagamento, limitação, oposição e portabilidade, bem como retirar o consentimento a qualquer momento, sem afetar a licitude do tratamento anterior. Para o efeito, contacta {legalOperator.privacyEmail || "o contacto de privacidade indicado no ponto 1"} ou abre um ticket com a categoria Privacidade/RGPD na página de <Link href="/contacto">contacto</Link>.</p>

<h2>8. Reclamações</h2>
<p>Tens o direito de apresentar reclamação à autoridade de controlo competente. Em Portugal, a Comissão Nacional de Proteção de Dados (CNPD), em <a href="https://www.cnpd.pt" target="_blank" rel="noreferrer">cnpd.pt</a>.</p>

<h2>9. Cookies e tecnologias similares</h2>
<p>Utilizamos armazenamento estritamente necessário para autenticação e funcionamento. As categorias opcionais (análise e marketing) só são ativadas com o teu consentimento, gerido através do banner de cookies. Consulta a <Link href="/cookies">Política de cookies</Link> para mais detalhes.</p>

<h2>10. Alterações</h2>
<p>Esta política pode ser atualizada por motivos legais ou de evolução do serviço. A versão aplicável é a publicada nesta página, com indicação da data da última atualização.</p>
</article></PublicPage>;
}
