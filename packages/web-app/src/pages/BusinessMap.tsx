// SPDX-License-Identifier: Apache-2.0

/**
 * Business map — the context graph drawn for business users: the things the
 * graph holds records about, how they relate, which data connection each comes
 * from, and the governed rules (metrics) that use them.
 *
 * Built from data the console already loads elsewhere: the ontology overview
 * (classes, relationships, kinds), the data connections and their tables, and
 * the metric list. Clicking a thing opens its data card; picking a rule shows
 * how it is worked out. The card's three actions write through existing COA
 * APIs only: table metadata (Edit description), the metric form (Add a rule)
 * and a one-class ontology (Add a kind).
 */
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQueries } from "@tanstack/react-query";
import Alert from "@cloudscape-design/components/alert";
import Box from "@cloudscape-design/components/box";
import Container from "@cloudscape-design/components/container";
import Grid from "@cloudscape-design/components/grid";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import FormField from "@cloudscape-design/components/form-field";
import Select from "@cloudscape-design/components/select";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Spinner from "@cloudscape-design/components/spinner";
import {
  GetOntologyOverviewCommand,
  ListSourceTablesCommand,
} from "@coa/control-plane-client";
import { useControlPlaneClient } from "@components/ControlPlaneClientProvider";
import { useListOntologies } from "@api-hooks/use-list-ontologies";
import { useListSources } from "@api-hooks/use-list-sources";
import { useListMetrics } from "@api-hooks/use-metrics";
import { useGetSourceTable } from "@api-hooks/use-get-source-table";
import { OVERVIEW_PAGE_LIMIT } from "@api-hooks/use-ontology-overview";
import {
  OntologyGraphFlow,
  type GraphEdgeData,
  type GraphNodeData,
} from "@components/graph/OntologyGraphFlow";
import {
  buildBusinessMap,
  humanize,
  type MapClassInput,
  type MapPropertyInput,
} from "@components/business-map/model";
import { DataCard, type TableRef } from "@components/business-map/DataCard";
import { LineageStrip } from "@components/business-map/LineageStrip";
import {
  AddKindModal,
  EditDescriptionModal,
} from "@components/business-map/EditModals";

export const BusinessMapPage: React.FC = () => {
  const { namespaceId = "" } = useParams<{ namespaceId: string }>();
  const navigate = useNavigate();
  const client = useControlPlaneClient();
  const base = `/namespaces/${namespaceId}`;

  const ontologies = useListOntologies(namespaceId);
  const sources = useListSources(namespaceId);
  const metrics = useListMetrics(namespaceId, 100);

  const ontologyIds = useMemo(
    () =>
      (ontologies.data ?? [])
        .map((o) => o.ontologyId)
        .filter(Boolean) as string[],
    [ontologies.data],
  );
  const overviews = useQueries({
    queries: ontologyIds.map((ontologyId) => ({
      queryKey: ["ontology-overview", namespaceId, ontologyId],
      queryFn: () =>
        client.send(
          new GetOntologyOverviewCommand({
            namespaceId,
            ontologyId,
            limit: OVERVIEW_PAGE_LIMIT,
          }),
        ),
      staleTime: 5 * 60_000,
    })),
  });

  const dbSources = useMemo(
    () =>
      (sources.data?.pages ?? [])
        .flatMap((p) => p.items ?? [])
        .filter((s) => s.sourceType === "DATABASE" && s.sourceId),
    [sources.data],
  );
  const tableLists = useQueries({
    queries: dbSources.map((s) => ({
      queryKey: ["sourceTables-firstPage", namespaceId, s.sourceId],
      queryFn: () =>
        client.send(
          new ListSourceTablesCommand({
            namespaceId,
            sourceId: s.sourceId!,
            maxResults: 50,
          }),
        ),
      staleTime: 5 * 60_000,
    })),
  });

  const loading =
    ontologies.isLoading ||
    sources.isLoading ||
    metrics.isLoading ||
    overviews.some((q) => q.isLoading) ||
    tableLists.some((q) => q.isLoading);
  const error =
    ontologies.error ?? metrics.error ?? overviews.find((q) => q.error)?.error;

  // Table name → where it lives, so the card can read and edit its metadata.
  const tableRefs = useMemo(() => {
    const refs: Record<string, TableRef> = {};
    tableLists.forEach((q, i) => {
      const sourceId = dbSources[i]?.sourceId;
      if (!sourceId) return;
      for (const t of q.data?.items ?? []) {
        if (t.name && t.tableId)
          refs[t.name.toLowerCase()] = { sourceId, tableId: t.tableId };
      }
    });
    return refs;
  }, [tableLists, dbSources]);

  const model = useMemo(() => {
    const classes: MapClassInput[] = [];
    const objectProps: MapPropertyInput[] = [];
    const dataProps: MapPropertyInput[] = [];
    for (const q of overviews) {
      const ov = q.data;
      if (!ov) continue;
      classes.push(...((ov.classes ?? []) as MapClassInput[]));
      objectProps.push(...((ov.objectProperties ?? []) as MapPropertyInput[]));
      dataProps.push(...((ov.datatypeProperties ?? []) as MapPropertyInput[]));
    }
    const tableConnections: Record<string, string> = {};
    tableLists.forEach((q, i) => {
      const name = humanize(dbSources[i]?.name ?? "Data connection");
      for (const t of q.data?.items ?? []) {
        if (t.name) tableConnections[t.name.toLowerCase()] = name;
      }
    });
    const rules = (metrics.data?.pages ?? [])
      .flatMap((p) => p.metrics ?? [])
      .filter((m) => !!m.name)
      .map((m) => ({
        name: m.name ?? "",
        label: m.label,
        description: m.description,
        sourceTable: m.sourceTable,
        unit: m.unit,
        sql: (m.expression?.dialects ?? [])
          .map((d) => d.expression ?? "")
          .join("\n"),
      }));
    return buildBusinessMap(
      classes,
      objectProps,
      dataProps,
      rules,
      tableConnections,
    );
  }, [overviews, tableLists, dbSources, metrics.data]);

  const [selected, setSelected] = useState<string | null>(null);
  const [rule, setRule] = useState<string>("all");
  const current =
    model.entities.find((e) => e.id === selected) ??
    // Default to the most-used thing so the panel is never empty.
    [...model.entities].sort((a, b) => b.rules.length - a.rules.length)[0];

  const ruleByName = Object.fromEntries(model.rules.map((r) => [r.name, r]));
  const currentRef =
    current && !current.members && !current.kindOf
      ? tableRefs[current.table]
      : undefined;
  const currentTable = useGetSourceTable(
    namespaceId,
    currentRef?.sourceId ?? "",
    currentRef?.tableId ?? "",
  );
  const [editing, setEditing] = useState(false);
  const [addingKind, setAddingKind] = useState(false);
  const ruleOptions = useMemo(
    () => [
      { value: "all", label: "All business things" },
      ...[...model.rules]
        .filter((r) => r.entities.length > 0)
        .sort((a, b) => a.label.localeCompare(b.label))
        .map((r) => ({
          value: r.name,
          label: r.label,
          description: `Uses ${r.entities.length} ${r.entities.length === 1 ? "thing" : "things"}`,
        })),
    ],
    [model.rules],
  );

  // The same graph the Graph explorer draws: one class node per business
  // thing, one labelled relationship edge per link. Choosing a rule narrows
  // the picture to the things that rule reads.
  const graph = useMemo(() => {
    const keep =
      rule === "all"
        ? null
        : new Set(
            model.entities
              .filter((e) => e.rules.includes(rule))
              .map((e) => e.id),
          );
    const nodes: GraphNodeData[] = model.entities
      .filter((e) => !keep || keep.has(e.id))
      .map((e) => ({
        id: e.id,
        label: e.label,
        kind: "class",
        // Shown as a ring of small nodes when the circle is hovered.
        attributes: e.fields.map((f) => ({ label: humanize(f) })),
      }));
    const edges: GraphEdgeData[] = model.links
      .filter((l) => !keep || (keep.has(l.source) && keep.has(l.target)))
      .map((l) => ({
        id: `${l.source}|${l.label}|${l.target}`,
        source: l.source,
        target: l.target,
        label: l.label,
        kind: l.kind === "kind" ? "subClassOf" : "objectProperty",
      }));
    return { nodes, edges };
  }, [model, rule]);

  if (loading) {
    return (
      <Box textAlign="center" padding="xxl">
        <Spinner size="large" />{" "}
        <Box variant="p">Drawing the business map…</Box>
      </Box>
    );
  }
  if (error) {
    return (
      <Alert type="error" header="Could not load the business map">
        {error.message}
      </Alert>
    );
  }
  if (model.entities.length === 0) {
    return (
      <Container>
        <Box textAlign="center" padding="l">
          <b>No business map yet</b>
          <Box variant="p" color="text-body-secondary">
            Connect data and build the ontology first. The map appears once the
            graph knows what things it holds.
          </Box>
          <Link
            onFollow={(e) => {
              e.preventDefault();
              navigate(`${base}/ontology`);
            }}
            href={`${base}/ontology`}
          >
            Go to Curation
          </Link>
        </Box>
      </Container>
    );
  }

  return (
    <SpaceBetween size="m">
      {/* Map and data card side by side at every width. */}
      <Grid
        gridDefinition={[
          { colspan: { default: 7, l: 8 } },
          { colspan: { default: 5, l: 4 } },
        ]}
      >
        <SpaceBetween size="m">
          <Container
            header={
              <Header
                variant="h2"
                description="Hover a circle to see its fields. Click it for details."
                actions={
                  <Link
                    href={`${base}/ontology/graph`}
                    onFollow={(e) => {
                      e.preventDefault();
                      navigate(`${base}/ontology/graph`);
                    }}
                  >
                    View the full ontology
                  </Link>
                }
              >
                Business map
              </Header>
            }
          >
            <SpaceBetween size="s">
              <FormField label="Show only what a rule uses">
                <Select
                  selectedOption={
                    ruleOptions.find((o) => o.value === rule) ?? ruleOptions[0]
                  }
                  onChange={({ detail }) =>
                    setRule(detail.selectedOption.value ?? "all")
                  }
                  options={ruleOptions}
                  filteringType={ruleOptions.length > 8 ? "auto" : "none"}
                />
              </FormField>
              <div style={{ height: 600 }}>
                <OntologyGraphFlow
                  key={rule}
                  nodes={graph.nodes}
                  edges={graph.edges}
                  layout="force"
                  collapseStandalone={false}
                  refitAfterLayout
                  onNodeSelect={(n) => n && setSelected(n.id)}
                />
              </div>
            </SpaceBetween>
          </Container>
          {rule !== "all" && ruleByName[rule] && (
            <LineageStrip
              rule={ruleByName[rule]}
              model={model}
              onSelect={setSelected}
              onOpenRule={() =>
                navigate(`${base}/metrics/${encodeURIComponent(rule)}`)
              }
              onAsk={() => navigate("/playground")}
              onClose={() => setRule("all")}
            />
          )}
        </SpaceBetween>

        {/* Stays in view while the map scrolls; long cards scroll inside. */}
        <div
          style={{
            position: "sticky",
            top: 16,
            maxHeight: "calc(100vh - 32px)",
            overflowY: "auto",
          }}
        >
          {current && (
            <DataCard
              namespaceId={namespaceId}
              entity={current}
              model={model}
              tableRef={currentRef}
              onSelect={setSelected}
              onPickRule={setRule}
              onEditDescription={() => setEditing(true)}
              onAddKind={() => setAddingKind(true)}
              onAddRule={() =>
                currentRef &&
                navigate(
                  `${base}/metrics/create?dataSourceId=${encodeURIComponent(currentRef.sourceId)}&sourceTable=${encodeURIComponent(current.table)}`,
                )
              }
            />
          )}
        </div>
      </Grid>
      {editing && current && currentRef && (
        <EditDescriptionModal
          namespaceId={namespaceId}
          entity={current}
          tableRef={currentRef}
          current={{
            description:
              currentTable.data?.businessMetadata?.description ||
              current.description,
            synonyms: currentTable.data?.businessMetadata?.synonyms ?? [],
          }}
          onClose={() => setEditing(false)}
        />
      )}
      {addingKind && current && (
        <AddKindModal
          namespaceId={namespaceId}
          parent={current}
          onClose={() => setAddingKind(false)}
        />
      )}
    </SpaceBetween>
  );
};
