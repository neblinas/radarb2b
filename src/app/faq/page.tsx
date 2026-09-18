import type { Metadata } from "next";
import PublicPage from "@/components/PublicPage";

export const metadata: Metadata = {
  title: "Perguntas frequentes",
  description: "Respostas sobre dados, pesquisas, alertas, subscrições e privacidade do Adjudata.",
};

const questions = [
  ["Quais são os planos e preços?", "Existem três planos: Free, sem custo para começar; Starter, 19 € por mês, com 200 pesquisas, 100 oportunidades, 25 pesquisas guardadas e 5 alertas; e Pro, 39 € por mês, com pesquisas ilimitadas, 500 oportunidades, 100 pesquisas guardadas e 20 alertas. Os impostos aplicáveis podem ser adicionados no pagamento."],
  ["De onde vêm os dados?", "A fonte principal é o Portal BASE, através dos recursos públicos disponibilizados para contratação pública portuguesa. A frequência indicada é semanal e cada procedimento mantém a referência e a data de publicação disponíveis."],
  ["O Adjudata é tempo real?", "Não. A informação depende da publicação e atualização da fonte pública. Deves confirmar sempre o procedimento e os documentos na fonte oficial antes de agir."],
  ["Posso pesquisar sem conta?", "Podes navegar pelo produto e consultar áreas públicas. A execução de pesquisas e as funcionalidades de guardar oportunidades, pesquisas e alertas exigem uma sessão autenticada."],
  ["Como funcionam os limites?", "Os limites dependem do plano e são aplicados pelo backend. A página Conta apresenta a utilização do período e o plano ativo."],
  ["Posso cancelar a subscrição?", "A gestão da subscrição, cancelamento e eventuais faturas é feita no portal seguro de faturação disponibilizado no produto. As condições aplicáveis constam dos Termos de utilização."],
  ["Como exerço os meus direitos de privacidade?", "Consulta a Política de privacidade e contacta o responsável pelo tratamento através do endereço de privacidade indicado pelo operador. A identidade jurídica e o contacto devem ser confirmados antes da publicação final."],
  ["Como posso reportar um erro nos dados?", "Envia a referência do procedimento, a fonte oficial e uma descrição objetiva do problema para o contacto de suporte publicado pelo operador. Não envies palavras-passe, tokens ou dados pessoais desnecessários."],
];

export default function FaqPage() {
  return <PublicPage><div className="max-w-3xl"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">Ajuda</p><h1 className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl">Perguntas frequentes</h1><p className="mt-5 text-lg leading-8 text-slate-400">Respostas diretas sobre dados, utilização e limites do Adjudata.</p></div><div className="mt-12 space-y-3">{questions.map(([question, answer]) => <details key={question} className="group rounded-2xl border border-slate-800 bg-slate-900/60 p-5"><summary className="cursor-pointer list-none pr-8 font-semibold text-white marker:hidden">{question}<span className="float-right text-cyan-300 transition group-open:rotate-45">+</span></summary><p className="mt-4 max-w-2xl text-sm leading-7 text-slate-400">{answer}</p></details>)}</div></PublicPage>;
}
