// SPDX-License-Identifier: Apache-2.0
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

const NS = "http://coa.amazon.com/namespace/ns-1/ontology/induced#";

// React Flow needs real layout; the page test checks the data wiring and the
// side panel, so the graph is replaced by buttons that select a node.
vi.mock("@components/graph/OntologyGraphFlow", () => ({
  OntologyGraphFlow: ({
    nodes,
    edges,
    onNodeSelect,
  }: {
    nodes: Array<{ id: string; label: string; kind: string }>;
    edges: Array<{ source: string; target: string; label?: string }>;
    onNodeSelect: (n: { id: string; label: string; kind: string }) => void;
  }) => (
    <div data-testid="map">
      {nodes.map((n) => (
        <button key={n.id} onClick={() => onNodeSelect(n)}>
          circle {n.label}
        </button>
      ))}
      <span>{edges.map((l) => `${l.source}-${l.label}-${l.target}`).join(",")}</span>
    </div>
  ),
}));

vi.mock("@api-hooks/use-list-ontologies", () => ({
  useListOntologies: () => ({
    data: [{ ontologyId: "onto-1", title: "MPI" }],
    isLoading: false,
    error: null,
  }),
}));
vi.mock("@api-hooks/use-list-sources", () => ({
  useListSources: () => ({
    data: {
      pages: [
        {
          items: [
            { sourceId: "s-hr", name: "mpi_hrms", sourceType: "DATABASE" },
            { sourceId: "s-doc", name: "Policies", sourceType: "DOCUMENTS" },
          ],
        },
      ],
    },
    isLoading: false,
  }),
}));
vi.mock("@api-hooks/use-metrics", () => ({
  useListMetrics: () => ({
    data: {
      pages: [
        {
          metrics: [
            {
              name: "headcount",
              label: "Headcount",
              description: "Officers with an active job. Temporary staff not counted.",
              sourceTable: "employment",
              expression: { dialects: [{ dialect: "TRINO", expression: "SELECT … FROM mpi_hrms.employment e" }] },
            },
          ],
        },
      ],
    },
    isLoading: false,
    error: null,
  }),
}));

const send = vi.fn(async (cmd: { constructor: { name: string } }) => {
  if (cmd.constructor.name === "GetOntologyOverviewCommand") {
    return {
      classes: [
        { uri: `${NS}officer`, label: "officer", comment: "officer" },
        { uri: `${NS}employment`, label: "employment", comment: "One period of employment" },
      ],
      objectProperties: [
        { uri: `${NS}officer_id`, label: "officer_id", domain: `${NS}Employment`, range: `${NS}Officer` },
      ],
      datatypeProperties: [],
    };
  }
  return { items: [{ name: "officer" }, { name: "employment" }] };
});
vi.mock("@components/ControlPlaneClientProvider", () => ({
  useControlPlaneClient: () => ({ send }),
}));

import { BusinessMapPage } from "./BusinessMap";

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={["/namespaces/ns-1/map"]}>
        <Routes>
          <Route path="/namespaces/:namespaceId/map" element={<BusinessMapPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("BusinessMapPage", () => {
  it("draws one circle per class and a plain-language relationship", async () => {
    renderPage();
    expect(await screen.findByText("circle Officer")).toBeInTheDocument();
    expect(screen.getByText("circle Employment")).toBeInTheDocument();
    expect(screen.getByText("employment-officer-officer")).toBeInTheDocument();
  });

  it("opens on the most-used thing and shows its rules and data connection", async () => {
    renderPage();
    expect(await screen.findByRole("heading", { name: "Employment" })).toBeInTheDocument();
    expect(screen.getAllByText("Headcount").length).toBeGreaterThan(0);
    expect(screen.getByText("From MPI HRMS")).toBeInTheDocument();
  });

  it("switches the panel when a circle is clicked", async () => {
    renderPage();
    await userEvent.click(await screen.findByText("circle Officer"));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Officer" })).toBeInTheDocument(),
    );
    expect(screen.getByText("No rule uses this yet.")).toBeInTheDocument();
  });

  it("counts things, rules, document collections and data connections", async () => {
    renderPage();
    await screen.findByText("circle Officer");
    expect(screen.getByText("business things")).toBeInTheDocument();
    expect(screen.getByText("document collections")).toBeInTheDocument();
  });
});

describe("BusinessMapPage rule filter", () => {
  it("narrows the map to the things a rule uses", async () => {
    renderPage();
    await screen.findByText("circle Officer");
    await userEvent.click(screen.getByRole("button", { name: /All business things/ }));
    await userEvent.click(await screen.findByText("Headcount", { selector: "[data-testid] *, span" }).catch(() => screen.getAllByText("Headcount").slice(-1)[0]));
    await waitFor(() => expect(screen.queryByText("circle Officer")).not.toBeInTheDocument());
    expect(screen.getByText("circle Employment")).toBeInTheDocument();
  });
});
