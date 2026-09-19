import type { Metadata } from "next";
import DashboardClient from "./DashboardClient";

export const metadata: Metadata = {
  title: "Painel",
  description:
    "O teu painel de trabalho no Adjudata: procedimentos, contratos, empresas e entidades num só espaço.",
  robots: { index: false, follow: false },
};

export default function PainelPage() {
  return <DashboardClient />;
}
