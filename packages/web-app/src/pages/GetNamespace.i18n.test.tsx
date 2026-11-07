// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocaleProvider } from "../i18n/LocaleProvider";
import { GetNamespace } from "./GetNamespace";

// The context graph overview shows API values (namespace status, VKG health)
// as words in the UI language. The ontology list moved to Curation > Ontologies.

const mockNamespace: Record<string, unknown> = {
  namespaceId: "ns-1",
  name: "test-ns",
  displayName: "Test Namespace",
  status: "ACTIVE",
  vkgHealth: "DEGRADED",
  owner: "admin@example.com",
  sourceCount: 1,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-05-01T00:00:00Z",
};

// The Overview hides its technical rows behind a UX switch; pin it on so those
// rows stay covered, and flip it off in the test that checks they are hidden.
const mockUx = vi.hoisted(() => ({ showTechnical: true }));
vi.mock("@constants/ux", () => ({
  get SHOW_GRAPH_TECHNICAL_DETAILS() {
    return mockUx.showTechnical;
  },
}));

vi.mock("../api-hooks/use-get-namespace", () => ({
  useGetNamespace: () => ({
    data: {
      namespace: mockNamespace,
    },
    isLoading: false,
    error: null,
  }),
}));

vi.mock("../api-hooks/use-update-namespace", () => ({
  useUpdateNamespace: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("../api-hooks/use-list-sources", () => ({
  useListSources: () => ({
    data: {
      pages: [
        {
          items: [
            {
              sourceId: "src-1",
              name: "My Database",
              status: "APPROVED",
              tablesDiscovered: 5,
            },
          ],
        },
      ],
    },
    isLoading: false,
    error: null,
  }),
}));

vi.mock("../api-hooks/use-metrics", () => ({
  useListMetrics: () => ({
    data: { pages: [] },
    isLoading: false,
    error: null,
  }),
}));

vi.mock("../components/ApiClientProvider", () => ({
  useApiClient: () => ({ get: vi.fn().mockResolvedValue([]) }),
}));

vi.mock("../services/ontology-engine", () => ({
  listOntologies: vi.fn().mockResolvedValue([
    {
      ontologyId: "onto-1",
      title: "Retail",
      ontologyType: "user_created",
      classCount: 3,
      propertyCount: 4,
    },
  ]),
}));

vi.mock("@coa/control-plane-client", () => ({
  NamespaceStatus: {
    ACTIVE: "ACTIVE",
    ARCHIVED: "ARCHIVED",
    DELETING: "DELETING",
    DELETED: "DELETED",
    DELETE_FAILED: "DELETE_FAILED",
  },
  SourceStatus: { APPROVED: "APPROVED" },
  SourceType: { DATABASE: "DATABASE", DOCUMENTS: "DOCUMENTS" },
  VkgHealthStatus: {
    HEALTHY: "HEALTHY",
    DEGRADED: "DEGRADED",
    UNAVAILABLE: "UNAVAILABLE",
    PROVISIONING: "PROVISIONING",
    UNKNOWN: "UNKNOWN",
  },
}));

function renderIn(locale: "en" | "ja") {
  window.localStorage.setItem("scl.locale", locale);
  return render(
    <LocaleProvider>
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={["/namespaces/ns-1"]}>
          <Routes>
            <Route path="/namespaces/:namespaceId" element={<GetNamespace />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </LocaleProvider>,
  );
}

describe("GetNamespace — localized API values", () => {
  afterEach(() => {
    window.localStorage.clear();
    document.documentElement.lang = "";
  });

  it("shows status and VKG health in Japanese", async () => {
    renderIn("ja");
    expect(await screen.findByText("アクティブ")).toBeInTheDocument();
    expect(screen.getByText("機能低下")).toBeInTheDocument();
    expect(screen.queryByText("ACTIVE")).not.toBeInTheDocument();
    expect(screen.queryByText("DEGRADED")).not.toBeInTheDocument();
  });

  it("shows the same values as words in English", async () => {
    renderIn("en");
    expect(await screen.findByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Degraded")).toBeInTheDocument();
  });
});
