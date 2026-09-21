import type { AnchorHTMLAttributes, ReactNode } from "react";
import { Suspense, act } from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProspectManagementDetailPage from "@/app/backoffice/prospeccao/gestao/[id]/page";

/**
 * O componente usa `use(params)` (React 19), que suspende até a Promise
 * resolver. Cada teste usa uma Promise nova (estável durante o seu render) e o
 * render é feito dentro de `act` para que o React conclua o suspense.
 */
async function renderPage() {
  const params = Promise.resolve({ id: "prospect-1" });
  let result: ReturnType<typeof render> | undefined;
  await act(async () => {
    result = render(
      <Suspense fallback={<span>loading</span>}>
        <ProspectManagementDetailPage params={params} />
      </Suspense>,
    );
  });
  return result!;
}

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/backoffice/prospeccao/gestao/prospect-1",
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: { getUser: mocks.getUser, signOut: vi.fn() },
    rpc: mocks.rpc,
  },
}));

const detail = {
  id: "prospect-1",
  name: "Empresa Alfa",
  nif: "500100100",
  cae: "62010",
  activity_description: "Software",
  district: "Lisboa",
  municipality: "Lisboa",
  localidade: "Lisboa",
  estimated_size: "medio",
  website: "https://alfa.pt",
  domain: "alfa.pt",
  email: "geral@alfa.pt",
  email_type: "geral",
  phone: null,
  enrichment_status: "CONTACT_FOUND",
  commercial_status: "ELIGIBLE",
  commercial_score: 72,
  score_reason: "Bom encaixe",
  matching_opportunities: 3,
  estimated_opportunity_value: 250000,
  cpv_codes: ["72000000"],
  categories: ["SOFTWARE"],
  opt_out: false,
  opt_out_at: null,
  opt_out_reason: null,
  contact_count: 1,
  last_contacted_at: null,
  created_at: "2026-09-01T10:00:00Z",
  updated_at: "2026-09-10T10:00:00Z",
  radar: {
    company_id: "company-1",
    participation_count: 9,
    participation_12m: 4,
    award_count: 3,
    total_award_value: 500000,
    last_participation: "2026-08-01",
    competitor_count: 2,
  },
  contacts: [
    {
      id: "c1",
      contacto: "geral@alfa.pt",
      normalizado: "geral@alfa.pt",
      source_url: "https://alfa.pt/contactos",
      domain: "alfa.pt",
      contact_type: "email",
      classification: "GENERIC_BUSINESS",
      confidence: 80,
      method: "official_website_crawl",
      collected_at: "2026-09-10T10:00:00Z",
      note: null,
      is_opt_out: false,
    },
  ],
  enrichment_history: [
    {
      id: "r1",
      status: "COMPLETED",
      website: "https://alfa.pt",
      domain: "alfa.pt",
      website_confidence: 90,
      website_method: "official",
      pages_crawled: 4,
      contacts_found: 2,
      emails_found: 1,
      phones_found: 1,
      skipped_reason: null,
      error: null,
      created_at: "2026-09-10T10:00:00Z",
    },
  ],
  activities: [],
};

describe("ProspectManagementDetailPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "user-1", email: "gestor@example.com", app_metadata: { role: "commercial_manager" } } },
    });
    mocks.rpc.mockResolvedValue({ data: detail, error: null });
  });

  it("bloqueia utilizadores sem role comercial", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "user-x", email: "cliente@example.com", app_metadata: { role: "customer" } } },
    });


    await renderPage();

    expect(await screen.findByText("Área reservada.", {}, { timeout: 3000 })).toBeInTheDocument();
  });

  it("mostra o detalhe consolidado e o contexto do Radar", async () => {

    await renderPage();

    expect(await screen.findByText("Empresa Alfa")).toBeInTheDocument();
    expect(mocks.rpc).toHaveBeenCalledWith("prospect_management_detail", { p_id: "prospect-1" });
    expect(screen.getByText("Contexto e oportunidades")).toBeInTheDocument();
    expect(screen.getByText("Histórico de enriquecimento")).toBeInTheDocument();
    expect(screen.getAllByText("geral@alfa.pt").length).toBeGreaterThan(0);
    expect(screen.getByText("Ações administrativas")).toBeInTheDocument();
  });

  it("apresenta as ações administrativas ao gestor", async () => {

    await renderPage();

    expect(await screen.findByText("Aprovar")).toBeInTheDocument();
    expect(screen.getByText("Preparar para Autopilot")).toBeInTheDocument();
    expect(screen.getByText("Aplicar opt-out")).toBeInTheDocument();
  });

  it("não mostra ações destrutivas a um utilizador só de leitura (commercial)", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "user-2", email: "comercial@example.com", app_metadata: { role: "commercial" } } },
    });


    await renderPage();

    expect(await screen.findByText(/Só admin e gestor comercial podem executar ações/i)).toBeInTheDocument();
  });

  it("avisa quando a migração não está disponível", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "function does not exist" } });


    await renderPage();

    expect(await screen.findByText(/migração `20261002090000_prospecting_management.sql`/i)).toBeInTheDocument();
  });
});
