// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Shared frame for every page scoped to one context graph (namespace).
 *
 * Renders the graph's name, status and a "Back to list" action, then a tab
 * row (Overview · Curation · Graph explorer · Settings) and, under Curation,
 * a sub-tab row (Ontology induction · Ontologies · Metrics). The tabs only
 * navigate between the existing routes; the page itself renders through the
 * nested <Outlet />, so no page behaviour changes.
 */
import React from "react";
import { Outlet, useLocation, useNavigate, useParams } from "react-router-dom";
import Button from "@cloudscape-design/components/button";
import Header from "@cloudscape-design/components/header";
import SegmentedControl from "@cloudscape-design/components/segmented-control";
import SpaceBetween from "@cloudscape-design/components/space-between";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import Tabs from "@cloudscape-design/components/tabs";
import { NamespaceStatus } from "@coa/control-plane-client";
import { useGetNamespace } from "@api-hooks/use-get-namespace";
import { PageErrorBoundary } from "@components/PageErrorBoundary";

export type ContextGraphTab = "overview" | "curation" | "explorer" | "settings";
export type CurationSubTab = "induction" | "ontologies" | "metrics";

/**
 * Map the part of the path after `/namespaces/:id` to the tab (and Curation
 * sub-tab) that owns it. Detail pages resolve to their parent tab.
 */
export function resolveContextGraphTab(rest: string): {
  tab: ContextGraphTab;
  sub?: CurationSubTab;
} {
  if (rest.startsWith("/ontology/graph")) return { tab: "explorer" };
  if (rest.startsWith("/metrics")) return { tab: "curation", sub: "metrics" };
  if (rest.startsWith("/ontologies") || rest.startsWith("/ontology/induced"))
    return { tab: "curation", sub: "ontologies" };
  if (rest.startsWith("/ontology"))
    return { tab: "curation", sub: "induction" };
  if (rest.startsWith("/settings") || rest.startsWith("/permissions"))
    return { tab: "settings" };
  return { tab: "overview" };
}

const TAB_PATHS: Record<ContextGraphTab, string> = {
  overview: "",
  curation: "/ontology",
  explorer: "/ontology/graph",
  settings: "/settings",
};

const SUB_TAB_PATHS: Record<CurationSubTab, string> = {
  induction: "/ontology",
  ontologies: "/ontologies",
  metrics: "/metrics",
};

function statusType(
  status: string | undefined,
): "success" | "error" | "in-progress" | "stopped" {
  if (status === NamespaceStatus.ACTIVE) return "success";
  if (
    status === NamespaceStatus.DELETE_FAILED ||
    status === NamespaceStatus.DELETED
  )
    return "error";
  if (status === NamespaceStatus.DELETING) return "in-progress";
  return "stopped";
}

export const ContextGraphShell: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { namespaceId = "" } = useParams<{ namespaceId: string }>();
  const { data } = useGetNamespace(namespaceId);
  const ns = data?.namespace;

  const base = `/namespaces/${namespaceId}`;
  const rest = location.pathname.startsWith(base)
    ? location.pathname.slice(base.length)
    : "";
  const { tab, sub } = resolveContextGraphTab(rest);

  return (
    <SpaceBetween size="m">
      <Header
        variant="h1"
        actions={
          <Button onClick={() => navigate("/namespaces")}>Back to list</Button>
        }
      >
        <SpaceBetween direction="horizontal" size="s" alignItems="center">
          <span>{ns?.displayName ?? ns?.name ?? namespaceId}</span>
          {ns?.status && (
            <StatusIndicator type={statusType(ns.status)}>
              {ns.status}
            </StatusIndicator>
          )}
        </SpaceBetween>
      </Header>

      <Tabs
        ariaLabel="Context graph sections"
        disableContentPaddings
        activeTabId={tab}
        onChange={({ detail }) =>
          navigate(base + TAB_PATHS[detail.activeTabId as ContextGraphTab])
        }
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "curation", label: "Curation" },
          { id: "explorer", label: "Graph explorer" },
          { id: "settings", label: "Settings" },
        ]}
      />

      {tab === "curation" && (
        <SegmentedControl
          label="Curation sections"
          selectedId={sub ?? "induction"}
          onChange={({ detail }) =>
            navigate(base + SUB_TAB_PATHS[detail.selectedId as CurationSubTab])
          }
          options={[
            { id: "induction", text: "Ontology induction" },
            { id: "ontologies", text: "Ontologies" },
            { id: "metrics", text: "Metrics" },
          ]}
        />
      )}

      {/* Keyed on the path so switching tab clears a previous page's error,
          and the header and tabs stay usable if one page fails to render. */}
      <PageErrorBoundary key={location.pathname}>
        <Outlet />
      </PageErrorBoundary>
    </SpaceBetween>
  );
};
