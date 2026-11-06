// SPDX-License-Identifier: Apache-2.0

/**
 * Business map — the context graph drawn for business users: the things the
 * graph holds records about, how they relate, which data connection each comes
 * from, and the governed rules (metrics) that use them.
 *
 * Read-only. Built from data the console already loads elsewhere: the ontology
 * overview (classes + relationships), the data connections and their tables,
 * and the metric list. Nothing here writes.
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
import SegmentedControl from "@cloudscape-design/components/segmented-control";
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
import { OVERVIEW_PAGE_LIMIT } from "@api-hooks/use-ontology-overview";
import {
  BusinessMapChart,
  connectionColour,
} from "@components/business-map/BusinessMapChart";
import {
  buildBusinessMap,
  humanize,
  type MapClassInput,
  type MapPropertyInput,
} from "@components/business-map/model";

/** At most this many rule chips above the map; the rest stay in the panel. */
const MAX_RULE_CHIPS = 5;

export const BusinessMapPage: React.FC = () => {
  const { namespaceId = "" } = useParams<{ namespaceId: string }>();
  const navigate = useNavigate();
  const client = useControlPlaneClient();
  const base = `/namespaces/${namespaceId}`;

  const ontologies = useListOntologies(namespaceId);
  const sources = useListSources(namespaceId);
  const metrics = useListMetrics(namespaceId, 100);

  const ontologyIds = useMemo(
    () => (ontologies.data ?? []).map((o) => o.ontologyId).filter(Boolean) as string[],
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
  const docSourceCount = useMemo(
    () =>
      (sources.data?.pages ?? [])
        .flatMap((p) => p.items ?? [])
        .filter((s) => s.sourceType === "DOCUMENTS").length,
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
    return buildBusinessMap(classes, objectProps, dataProps, rules, tableConnections);
  }, [overviews, tableLists, dbSources, metrics.data]);

  const [selected, setSelected] = useState<string | null>(null);
  const [rule, setRule] = useState<string>("all");
  const current =
    model.entities.find((e) => e.id === selected) ??
    // Default to the most-used thing so the panel is never empty.
    [...model.entities].sort((a, b) => b.rules.length - a.rules.length)[0];

  const ruleChips = useMemo(
    () =>
      [...model.rules]
        .filter((r) => r.entities.length > 0)
        .sort((a, b) => b.entities.length - a.entities.length)
        .slice(0, MAX_RULE_CHIPS),
    [model.rules],
  );
  const ruleByName = Object.fromEntries(model.rules.map((r) => [r.name, r]));

  if (loading) {
    return (
      <Box textAlign="center" padding="xxl">
        <Spinner size="large" /> <Box variant="p">Drawing the business map…</Box>
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
          <Link onFollow={(e) => { e.preventDefault(); navigate(`${base}/ontology`); }} href={`${base}/ontology`}>
            Go to Curation
          </Link>
        </Box>
      </Container>
    );
  }

  return (
    <SpaceBetween size="m">
      <Box color="text-body-secondary">
        The things this context graph keeps records about and how they connect.
        Bigger circles are used by more rules. Hover a circle to trace its
        connections; click it for details.
      </Box>
      <Grid gridDefinition={[{ colspan: { default: 12, l: 8 } }, { colspan: { default: 12, l: 4 } }]}>
        <Container disableContentPaddings>
          <div style={{ padding: "12px 16px 0" }}>
            <SegmentedControl
              label="Show the things a rule uses"
              selectedId={rule}
              onChange={({ detail }) => setRule(detail.selectedId)}
              options={[
                { id: "all", text: "Everything" },
                ...ruleChips.map((r) => ({ id: r.name, text: r.label })),
              ]}
            />
          </div>
          <BusinessMapChart
            model={model}
            selected={current?.id ?? null}
            highlightRule={rule === "all" ? null : rule}
            onSelect={(id) => {
              setSelected(id);
              setRule("all");
            }}
          />
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 16,
              padding: "10px 16px",
              borderTop: "1px solid var(--color-border-divider-default, #e9ebed)",
              fontSize: 12,
            }}
          >
            {model.connections.map((c) => (
              <span key={c} style={{ color: "var(--color-text-body-secondary, #5f6b7a)" }}>
                <i
                  aria-hidden
                  style={{
                    display: "inline-block",
                    width: 11,
                    height: 11,
                    borderRadius: "50%",
                    marginRight: 6,
                    verticalAlign: -1,
                    background: connectionColour(model, c),
                  }}
                />
                {c}
              </span>
            ))}
            <span style={{ color: "var(--color-text-body-secondary, #5f6b7a)" }}>
              Number in a circle = rules that use it
            </span>
          </div>
        </Container>

        <SpaceBetween size="m">
          {current && (
            <Container
              header={
                <Header variant="h2" description={`From ${current.connection}`}>
                  {current.label}
                </Header>
              }
            >
              <SpaceBetween size="s">
                {current.description && <Box>{current.description}</Box>}
                <Box variant="awsui-key-label">Rules that use it</Box>
                {current.rules.length === 0 ? (
                  <Box color="text-body-secondary">No rule uses this yet.</Box>
                ) : (
                  current.rules.map((name) => {
                    const r = ruleByName[name];
                    return (
                      <div
                        key={name}
                        style={{
                          border: "1px solid var(--color-border-divider-default, #e9ebed)",
                          borderRadius: 8,
                          padding: "8px 10px",
                        }}
                      >
                        <Link
                          href={`${base}/metrics/${encodeURIComponent(name)}`}
                          onFollow={(e) => {
                            e.preventDefault();
                            navigate(`${base}/metrics/${encodeURIComponent(name)}`);
                          }}
                        >
                          <b>{r?.label ?? name}</b>
                        </Link>
                        {r?.description && (
                          <Box variant="small" color="text-body-secondary" display="block">
                            {r.description.length > 180
                              ? `${r.description.slice(0, 177)}…`
                              : r.description}
                          </Box>
                        )}
                      </div>
                    );
                  })
                )}
                <Box variant="awsui-key-label">Where the data lives</Box>
                <Box>
                  {current.connection} · <code>{current.table}</code>
                  {current.attributeCount > 0 && ` · ${current.attributeCount} fields`}
                </Box>
              </SpaceBetween>
            </Container>
          )}
          <Container header={<Header variant="h2">In this graph</Header>}>
            <Grid gridDefinition={[{ colspan: 6 }, { colspan: 6 }, { colspan: 6 }, { colspan: 6 }]}>
              <Count n={model.entities.length} label="business things" />
              <Count n={model.rules.length} label="rules" />
              <Count n={docSourceCount} label="document collections" />
              <Count n={dbSources.length} label="data connections" />
            </Grid>
          </Container>
        </SpaceBetween>
      </Grid>
    </SpaceBetween>
  );
};

function Count({ n, label }: { n: number; label: string }) {
  return (
    <div>
      <Box fontSize="heading-l" fontWeight="bold">
        {n}
      </Box>
      <Box variant="small" color="text-body-secondary">
        {label}
      </Box>
    </div>
  );
}
