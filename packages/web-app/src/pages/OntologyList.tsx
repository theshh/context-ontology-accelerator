// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Curation › Ontologies — every ontology record in the context graph.
 * Moved unchanged from the old namespace detail page's "Ontologies" tab.
 *
 * Route: /namespaces/:namespaceId/ontologies
 */
import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import Table from "@cloudscape-design/components/table";
import type { TableProps } from "@cloudscape-design/components/table";
import { useApiClient } from "@components/ApiClientProvider";
import { listOntologies } from "../services/ontology-engine";
import type { OntologyRecord } from "../services/ontology-engine";

/** Formats an ISO timestamp into a localized short date+time string, or "—" if absent. */
function formatDate(iso: string | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export const OntologyList: React.FC = () => {
  const { namespaceId = "" } = useParams<{ namespaceId: string }>();
  return <OntologiesTable namespaceId={namespaceId} />;
};

const OntologiesTable: React.FC<{ namespaceId: string }> = ({
  namespaceId,
}) => {
  const navigate = useNavigate();
  const apiClient = useApiClient();
  const [items, setItems] = useState<OntologyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOntologies = React.useCallback(() => {
    if (!namespaceId) return;
    setLoading(true);
    setError(null);
    listOntologies(apiClient, namespaceId)
      .then((res) => {
        setItems(res);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Failed to load ontologies");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [apiClient, namespaceId]);

  useEffect(() => {
    fetchOntologies();
  }, [fetchOntologies]);

  const columns: TableProps.ColumnDefinition<OntologyRecord>[] = [
    {
      id: "title",
      header: "Ontology",
      isRowHeader: true,
      cell: (o) => (
        <Link
          href={`/namespaces/${namespaceId}/ontology`}
          onFollow={(e) => {
            e.preventDefault();
            navigate(`/namespaces/${namespaceId}/ontology`);
          }}
        >
          {o.title || o.ontologyId}
        </Link>
      ),
    },
    { id: "type", header: "Type", cell: (o) => o.ontologyType },
    { id: "classes", header: "Classes", cell: (o) => o.classCount },
    { id: "properties", header: "Properties", cell: (o) => o.propertyCount },
    {
      id: "created",
      header: "Created",
      cell: (o) => formatDate(o.createdAt),
    },
  ];

  return (
    <Table<OntologyRecord>
      variant="container"
      items={items}
      trackBy="ontologyId"
      loading={loading}
      loadingText="Loading ontologies…"
      columnDefinitions={columns}
      header={
        <Header
          variant="h2"
          counter={`(${items.length})`}
          actions={
            <Button
              iconName="refresh"
              loading={loading}
              onClick={() => fetchOntologies()}
            >
              Refresh
            </Button>
          }
        >
          Ontologies
        </Header>
      }
      empty={
        error ? (
          <StatusIndicator type="error">
            Failed to load ontologies: {error}
          </StatusIndicator>
        ) : (
          <Box textAlign="center" color="text-body-secondary">
            No ontologies in this context graph yet.
          </Box>
        )
      }
    />
  );
};
