import type { Metadata } from "next";
import PublicPage from "@/components/PublicPage";
import { legalOperator } from "@/lib/legal";

export const metadata: Metadata = { title: "Termos de utilização", description: "Termos de utilização do Radar B2B." };

export default function TermsPage() {
  return <PublicPage><article className="prose prose-invert max-w-3xl prose-headings:font-semibold prose-headings:tracking-tight prose-headings:text-white prose-p:text-slate-400 prose-li:text-slate-400"><p className="not-prose text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">Condições</p><h1>Termos de utilização</h1><p className="lead">Última atualização: {legalOperator.lastUpdated}</p><p>Estes termos regulam o acesso e a utilização do Radar B2B, uma plataforma de pesquisa e análise de informação pública sobre contratação pública.</p>

<h2>1. Operador e contacto</h2>
<p><strong>Operador:</strong> {legalOperator.legalName || "a publicar"}{legalOperator.legalName ? `, ${legalOperator.legalForm.toLowerCase()}, ${legalOperator.country}` : ""}. <strong>Nome comercial:</strong> {legalOperator.brand}.<br /><strong>NIF:</strong> {legalOperator.nif || "a publicar com a designação legal definitiva"}<br /><strong>Estabelecimento (sede):</strong> {legalOperator.address || "a publicar com a designação legal definitiva"}<br /><strong>Contactos:</strong> {legalOperator.supportEmail || "email de suporte a publicar"} · {legalOperator.privacyEmail || "email de privacidade a publicar"}</p>
<p>Estas informações são disponibilizadas nos termos do artigo 10.º do Decreto-Lei n.º 7/2004, relativo ao comércio eletrónico, e demais legislação aplicável. A identificação completa do operador está reunida na página de <a href="/informacao-legal">informação legal</a>.</p>

<h2>2. Objeto e aceitação</h2>
<p>Ao criar conta ou utilizar a plataforma, o utilizador declara ter lido e aceite estes termos. Se não concordar, não deve utilizar o serviço. A criação de conta exige a aceitação expressa destes termos.</p>

<h2>3. Utilização permitida</h2>
<p>O utilizador deve fornecer informação verdadeira, manter as credenciais seguras e utilizar o serviço de forma lícita. Não é permitido contornar quotas, aceder a contas de terceiros, extrair dados por meios abusivos, introduzir software malicioso ou interferir com o funcionamento do serviço.</p>

<h2>4. Conta e segurança</h2>
<p>O utilizador é responsável pela confidencialidade das suas credenciais e por todas as atividades realizadas na sua conta. Deve comunicar de imediato qualquer utilização não autorizada. Podemos suspender ou encerrar contas que violem estes termos ou comprometam a segurança do serviço.</p>

<h2>5. Dados e limitações</h2>
<p>Os dados têm origem em fontes públicas e podem conter omissões, atrasos ou erros. A referência oficial prevalece sempre. O Radar B2B não garante adjudicação, elegibilidade, disponibilidade de documentos ou atualização instantânea, nem substitui a consulta das fontes oficiais.</p>

<h2>6. Planos, pagamento e faturação</h2>
<p>Algumas funcionalidades dependem de autenticação, quota e plano. Os planos pagos são faturados de forma mensal ou anual e os preços apresentados não incluem IVA, que é adicionado quando aplicável. Os pagamentos e a gestão da subscrição são processados pelo fornecedor de faturação indicado no produto, através de checkout seguro.</p>

<h2>7. Direito de livre resolução</h2>
<p>Quando o utilizador tenha a qualidade de consumidor, dispõe do direito de livre resolução do contrato no prazo de 14 dias a contar da celebração, nos termos do Decreto-Lei n.º 24/2014. O exercício deste direito pode ser efetuado através dos contactos indicados no ponto 1. Este direito não prejudica a legislação aplicável a conteúdos digitais fornecidos de imediato com consentimento expresso do consumidor.</p>

<h2>8. Propriedade intelectual</h2>
<p>A plataforma, a sua marca, a estrutura e o software são protegidos por direitos de propriedade intelectual. Não é concedida qualquer licença para além da utilização do serviço. Os dados públicos de origem mantêm o regime legal da respetiva fonte.</p>

<h2>9. Responsabilidade</h2>
<p>O serviço é disponibilizado no estado em que se encontra. Na medida permitida por lei, o Radar B2B não é responsável por decisões comerciais tomadas com base na informação apresentada, por interrupções do serviço ou por danos indiretos. Nada nestes termos exclui responsabilidades que não possam ser limitadas por lei, incluindo as decorrentes da legislação de defesa do consumidor.</p>

<h2>10. Suspensão e rescisão</h2>
<p>O utilizador pode cessar a utilização e encerrar a conta a qualquer momento. Podemos suspender ou cessar o acesso em caso de violação destes termos, exigência legal ou descontinuação do serviço, com aviso sempre que possível. As obrigações de pagamento já vencidas e as disposições que pela sua natureza devam subsistir mantêm-se após a rescisão.</p>

<h2>11. Alterações</h2>
<p>Estes termos podem ser atualizados por motivos de segurança, evolução do serviço ou obrigações legais. A versão aplicável será a publicada nesta página, com indicação da data da última atualização.</p>

<h2>12. Lei aplicável e resolução de litígios</h2>
<p>Estes termos regem-se pela lei portuguesa. Em caso de litígio, o consumidor pode recorrer às entidades de resolução alternativa de litígios de consumo competentes, cuja lista está disponível em <a href="https://www.consumidor.gov.pt" target="_blank" rel="noreferrer">consumidor.gov.pt</a>, sem prejuízo do recurso aos tribunais. Contacto para litígios: {legalOperator.disputeEmail || legalOperator.supportEmail || "a publicar com a designação legal definitiva"}.</p>
</article></PublicPage>;
}
