import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LeadFinder from "@/components/LeadFinder";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: mocks.from,
    rpc: mocks.rpc,
  },
}));

function queryResult(data: unknown) {
  const builder = {
    select: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
  };
  builder.select.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);
  builder.limit.mockResolvedValue({ data, error: null });
  return builder;
}

describe("LeadFinder", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("lista empresas analisadas com o tamanho inferido", async () => {
    mocks.from
      .mockReturnValueOnce(
        queryResult([
          {
            id: "company-1",
            name: "Empresa Alfa",
            nif: "500100100",
            award_count: 24,
            total_award_value: 480000,
            inferred_size: "medio",
          },
        ]),
      )
      .mockReturnValueOnce(queryResult([]));

    render(<LeadFinder />);

    expect(await screen.findByText("Empresa Alfa")).toBeInTheDocument();
    expect(screen.getByText(/24 adjudicações/)).toBeInTheDocument();
    expect(screen.getByText("Sem contacto registado")).toBeInTheDocument();
  });

  it("avisa quando a migração de leads empresariais falta", async () => {
    mocks.from
      .mockReturnValueOnce({
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: null, error: { message: "not found" } }),
      })
      .mockReturnValueOnce(queryResult([]));

    render(<LeadFinder />);

    expect(
      await screen.findByText(/migração de leads empresariais/i),
    ).toBeInTheDocument();
  });
});
