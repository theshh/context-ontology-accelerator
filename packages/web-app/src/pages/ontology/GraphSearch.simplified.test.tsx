// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * The simplified Explorer (flags in @constants/ux off): Graph view only, no
 * Inducted sources tab. Mirrors GraphSearch.tabs.test.tsx's harness. The two inventory views are stubbed
 * to a marker element — their contents have dedicated tests in
 * `explorer/*.test.tsx`; here we only prove which tab body the page mounts.
 */
import {
  render,
  waitFor,
  cleanup,
  within,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GraphSearchPage } from "./GraphSearch";
import { BreadcrumbProvider } from "@components/BreadcrumbProvider";
import type {
  GraphSearchHit,
  GraphSearchResult,
  OntologyOverviewResult,
  OntologyRecord,
} from "../../services/ontology-engine";

// The SHIPPED (simplified) flag values: List view and Inducted sources tab hidden.
vi.mock("@constants/ux", () => ({
  SHOW_TECHNICAL_VIEWS: false,
  SHOW_EXPLORER_LIST_VIEW: false,
  SHOW_INDUCTED_SOURCES_TAB: false,
}));

const CLAIM = "http://ex.org/o#Claim";
const CLASSES: GraphSearchHit[] = [
  { uri: CLAIM, label: "Claim", kind: "class", graph_uris: ["wb/ns/o"] },
];
const CLASS_PAGE: GraphSearchResult = { hits: CLASSES, total_count: 1 };
const ONTOLOGY_RECORDS: OntologyRecord[] = [
  {
    ontologyId: "o",
    uri: "o",
    title: "Insurance",
    ontologyType: "induced",
    format: "turtle",
    domainTags: [],
    classCount: 1,
    propertyCount: 0,
    axiomCount: 0,
    embeddingCount: 1,
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
  },
];
const OVERVIEW: OntologyOverviewResult = {
  ontology_id: "o",
  classes: [
    { uri: CLAIM, label: "Claim", comment: "A claim.", subClassOf: [] },
  ],
};

const searchEntitiesPaged = vi.fn();
const getOntologyOverview = vi.fn();
const listOntologies = vi.fn();

vi.mock("../../services/ontology-engine", () => ({
  searchEntities: vi.fn(),
  searchEntitiesPaged: (...args: unknown[]) => searchEntitiesPaged(...args),
  getClass: vi.fn(),
  getObjectProperty: vi.fn(),
  getDatatypeProperty: vi.fn(),
  getOntologyOverview: (...args: unknown[]) => getOntologyOverview(...args),
  listOntologies: (...args: unknown[]) => listOntologies(...args),
}));

vi.mock("@components/ontology/PendingReviewBanner", () => ({
  PendingReviewBanner: () => null,
}));

vi.mock("../../components/graph/OntologyGraphFlow", () => ({
  OntologyGraphFlow: () => <div data-testid="graph-flow" />,
}));

// Stub the two inventory views: this file asserts tab WIRING, not their content
// (each has its own test file). A marker element per view makes "which tab body
// is mounted" unambiguous — the real views' headers would collide with the tab
// labels themselves.
vi.mock("./explorer/OntologyInventoryView", () => ({
  OntologyInventoryView: ({ namespace }: { namespace?: string }) => (
    <div data-testid="ontology-inventory">inventory:{namespace}</div>
  ),
}));
vi.mock("./explorer/InductedSourcesView", () => ({
  InductedSourcesView: ({ namespace }: { namespace?: string }) => (
    <div data-testid="inducted-sources">sources:{namespace}</div>
  ),
}));

// A STABLE client instance — the real useApiClient is useMemo-memoized, so its
// reference is stable across renders. A fresh object per render would re-trigger
// every apiClient-dependent effect.
const stableApiClient = { get: vi.fn(), getText: vi.fn() };
vi.mock("@components/ApiClientProvider", () => ({
  useApiClient: () => stableApiClient,
}));

function renderPage(search = "") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const result = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/namespaces/ns/ontology/graph${search}`]}>
        <BreadcrumbProvider>
          <Routes>
            <Route
              path="/namespaces/:namespaceId/ontology/graph"
              element={<GraphSearchPage />}
            />
          </Routes>
        </BreadcrumbProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  // Scope queries to THIS render's container — a prior test's tree can linger
  // briefly before cleanup(), and the page re-renders as its fetches resolve.
  return within(result.container);
}

/** The Cloudscape tab whose panel is currently active (aria-selected). */
function activeTabLabel(view: ReturnType<typeof renderPage>): string | null {
  const selected = view
    .getAllByRole("tab")
    .find((t) => t.getAttribute("aria-selected") === "true");
  return selected?.textContent?.trim() ?? null;
}

describe("GraphSearchPage — simplified Explorer", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    searchEntitiesPaged.mockResolvedValue(CLASS_PAGE);
    getOntologyOverview.mockResolvedValue(OVERVIEW);
    listOntologies.mockResolvedValue(ONTOLOGY_RECORDS);
  });

  it("opens straight on the Graph view with no List/Graph toggle", async () => {
    const view = renderPage();
    await waitFor(() =>
      expect(view.getByTestId("graph-flow")).toBeInTheDocument(),
    );
    expect(view.queryByTestId("list")).toBeNull();
    // The List view's paged class query is never issued.
    expect(searchEntitiesPaged).not.toHaveBeenCalled();
  });

  it("shows only the Classes and Ontologies tabs", async () => {
    const view = renderPage();
    await waitFor(() => expect(activeTabLabel(view)).toBe("Classes"));
    const labels = view.getAllByRole("tab").map((t) => t.textContent?.trim());
    expect(labels).toEqual(["Classes", "Ontologies"]);
  });

  it("falls back to Classes for a ?tab=sources deep link", async () => {
    const view = renderPage("?tab=sources");
    await waitFor(() => expect(activeTabLabel(view)).toBe("Classes"));
    expect(view.queryByTestId("inducted-sources")).toBeNull();
  });
});
