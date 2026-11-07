// SPDX-License-Identifier: Apache-2.0

/**
 * Data card — what one business thing is, in business words: its definition,
 * where its data lives, what it records (fields with their meaning and code
 * values), how it connects, its kinds, and the rules that use it. Three
 * actions let a business user extend it: edit the description, add a rule,
 * add a kind.
 */
import { useState } from "react";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Spinner from "@cloudscape-design/components/spinner";
import { useGetSourceTable } from "@api-hooks/use-get-source-table";
import {
  humanize,
  kindsOf,
  relationshipSentence,
  type BusinessMapModel,
  type MapEntity,
} from "./model";

/** Where a business thing's table lives, so the card can read and edit it. */
export interface TableRef {
  sourceId: string;
  tableId: string;
}

const FIELDS_SHOWN = 6;
const CODES_SHOWN = 8;

const divider = "1px solid var(--color-border-divider-default, #e9ebed)";

interface Props {
  namespaceId: string;
  entity: MapEntity;
  model: BusinessMapModel;
  tableRef?: TableRef;
  onSelect: (id: string) => void;
  onPickRule: (name: string) => void;
  onEditDescription: () => void;
  onAddRule: () => void;
  onAddKind: () => void;
}

export function DataCard({
  namespaceId,
  entity,
  model,
  tableRef,
  onSelect,
  onPickRule,
  onEditDescription,
  onAddRule,
  onAddKind,
}: Props) {
  const [allFields, setAllFields] = useState(false);
  const table = useGetSourceTable(namespaceId, tableRef?.sourceId ?? "", tableRef?.tableId ?? "");
  const biz = table.data?.businessMetadata;
  const description = biz?.description || entity.description;
  const synonyms = biz?.synonyms ?? [];
  const columns = table.data?.columns ?? [];
  const shown = allFields ? columns : columns.slice(0, FIELDS_SHOWN);

  const ruleByName = Object.fromEntries(model.rules.map((r) => [r.name, r]));
  const parent = entity.kindOf ? model.entities.find((e) => e.id === entity.kindOf) : undefined;
  const kinds = kindsOf(model, entity.id);
  const links = model.links.filter(
    (l) => l.kind !== "kind" && (l.source === entity.id || l.target === entity.id),
  );

  return (
    <Container
      header={
        <Header
          variant="h2"
          description={parent ? `A kind of ${parent.label}` : `From ${entity.connection}`}
          actions={
            <SpaceBetween direction="horizontal" size="xs">
              <Button
                onClick={onEditDescription}
                disabled={!tableRef}
                disabledReason="Only things backed by one table can be edited here."
              >
                Edit description
              </Button>
            </SpaceBetween>
          }
        >
          {entity.label}
        </Header>
      }
    >
      <SpaceBetween size="m">
        <div>
          {description ? (
            <Box>{description}</Box>
          ) : (
            <Box color="text-body-secondary">
              No description yet. Use <b>Edit description</b> to say what this is in business words.
            </Box>
          )}
          {synonyms.length > 0 && (
            <Box variant="small" color="text-body-secondary" margin={{ top: "xxs" }}>
              Also called: {synonyms.join(", ")}
            </Box>
          )}
          {entity.members && (
            <Box variant="small" color="text-body-secondary" margin={{ top: "xxs" }}>
              Groups {entity.members.length} similar datasets: {entity.members.join(", ")}.
            </Box>
          )}
        </div>

        {!parent && (
          <Section title="Where the data lives">
            <div
              style={{
                background: "var(--color-background-container-header, #f4f6f8)",
                borderRadius: 8,
                padding: "8px 12px",
              }}
            >
              <b>{entity.connection}</b>
              {columns.length > 0 && ` · ${columns.length} fields`}
              <Box variant="small" color="text-body-secondary">
                table <code>{table.data?.tableId ?? entity.table}</code>
              </Box>
            </div>
          </Section>
        )}

        {tableRef && (
          <Section title="What's recorded">
            {table.isLoading ? (
              <Spinner />
            ) : columns.length === 0 ? (
              <Box color="text-body-secondary">No fields found.</Box>
            ) : (
              <div>
                {shown.map((c) => {
                  const meaning = c.businessMetadata?.description || c.description || "";
                  const codes = (c.distinctValues ?? []).slice(0, CODES_SHOWN);
                  return (
                    <div key={c.name} style={{ padding: "6px 0", borderBottom: divider }}>
                      <b>{humanize(c.name ?? "")}</b>
                      {meaning && <Box variant="small">{meaning}</Box>}
                      {codes.length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                          {codes.map((v) => (
                            <span
                              key={v}
                              style={{
                                border: "1px solid var(--color-border-input-default, #c6c6cd)",
                                borderRadius: 10,
                                padding: "0 7px",
                                fontSize: 12,
                              }}
                            >
                              {v}
                            </span>
                          ))}
                        </div>
                      )}
                      <Box variant="small" color="text-body-secondary">
                        <code>{c.name}</code>
                      </Box>
                    </div>
                  );
                })}
                {columns.length > FIELDS_SHOWN && (
                  <Box margin={{ top: "xs" }}>
                    <Link variant="secondary" onFollow={() => setAllFields((v) => !v)}>
                      {allFields ? "Show fewer fields" : `Show all ${columns.length} fields`}
                    </Link>
                  </Box>
                )}
              </div>
            )}
          </Section>
        )}

        {links.length > 0 && (
          <Section title="Connected to">
            {links.map((l) => {
              const other = l.source === entity.id ? l.target : l.source;
              return (
                <div key={`${l.source}|${l.label}|${l.target}`} style={{ padding: "3px 0" }}>
                  <Link onFollow={() => onSelect(other)}>
                    {model.entities.find((e) => e.id === other)?.label ?? other}
                  </Link>
                  <Box variant="small" color="text-body-secondary" display="inline">
                    {" · "}
                    {relationshipSentence(l, model)}
                  </Box>
                </div>
              );
            })}
          </Section>
        )}

        <Section
          title={`Kinds of ${entity.label.toLowerCase()}`}
          action={
            <Button variant="inline-link" iconName="add-plus" onClick={onAddKind}>
              Add a kind
            </Button>
          }
        >
          {kinds.length === 0 ? (
            <Box variant="small" color="text-body-secondary">
              None yet. A kind is a business category of {entity.label.toLowerCase()}, such as
              "Resignation" as a kind of "Leaving".
            </Box>
          ) : (
            kinds.map((k) => (
              <div key={k.id} style={{ padding: "3px 0" }}>
                <Link onFollow={() => onSelect(k.id)}>{k.label}</Link>
                {k.description && (
                  <Box variant="small" color="text-body-secondary" display="inline">
                    {" · "}
                    {k.description}
                  </Box>
                )}
              </div>
            ))
          )}
        </Section>

        <Section
          title={`Rules that use it (${entity.rules.length})`}
          action={
            <Button
              variant="inline-link"
              iconName="add-plus"
              onClick={onAddRule}
              disabled={!tableRef}
              disabledReason="Rules start from a thing backed by one table."
            >
              Add a rule
            </Button>
          }
        >
          {entity.rules.length === 0 ? (
            <Box variant="small" color="text-body-secondary">
              No rule uses this yet.
            </Box>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {entity.rules.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => onPickRule(name)}
                  style={{
                    textAlign: "left",
                    border: divider,
                    borderRadius: 8,
                    padding: "6px 8px",
                    background: "var(--color-background-container-content, #fff)",
                    cursor: "pointer",
                    font: "inherit",
                  }}
                >
                  <b>{ruleByName[name]?.label ?? name}</b>
                  <Box variant="small" color="text-body-secondary">
                    See how it's worked out
                  </Box>
                </button>
              ))}
            </div>
          )}
        </Section>
      </SpaceBetween>
    </Container>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Box variant="awsui-key-label">{title}</Box>
        {action}
      </div>
      <div style={{ marginTop: 4 }}>{children}</div>
    </div>
  );
}
