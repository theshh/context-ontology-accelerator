// SPDX-License-Identifier: Apache-2.0

/**
 * Data card — what one business thing is, in business words: its definition,
 * the fields it records (with example values), what it connects to, its kinds,
 * and the rules that use it. Kept short: a field's meaning and technical name
 * open when the field is clicked. Three actions let a business user extend it:
 * edit the description, add a rule, add a kind.
 */
import { useState } from "react";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import ButtonDropdown from "@cloudscape-design/components/button-dropdown";
import Container from "@cloudscape-design/components/container";
import Header from "@cloudscape-design/components/header";
import Icon from "@cloudscape-design/components/icon";
import Link from "@cloudscape-design/components/link";
import SpaceBetween from "@cloudscape-design/components/space-between";
import Spinner from "@cloudscape-design/components/spinner";
import { useGetSourceTable } from "@api-hooks/use-get-source-table";
import {
  humanize,
  kindsOf,
  type BusinessMapModel,
  type MapEntity,
} from "./model";

/** Where a business thing's table lives, so the card can read and edit it. */
export interface TableRef {
  sourceId: string;
  tableId: string;
}

const FIELDS_SHOWN = 6;
const EXAMPLES_SHOWN = 3;
/** Descriptions longer than this are clamped to three lines with a "More" link. */
const LONG_DESCRIPTION = 160;

const divider = "1px solid var(--color-border-divider-default, #e9ebed)";
const rowStyle: React.CSSProperties = {
  display: "flex",
  boxSizing: "border-box",
  width: "100%",
  gap: 8,
  alignItems: "baseline",
  justifyContent: "space-between",
  padding: "6px 10px",
  border: 0,
  background: "none",
  color: "inherit",
  font: "inherit",
  textAlign: "left",
  cursor: "pointer",
};
const pill: React.CSSProperties = {
  border: divider,
  borderRadius: 14,
  padding: "2px 10px",
  background: "var(--color-background-container-content, #fff)",
  color: "inherit",
  cursor: "pointer",
  font: "inherit",
  fontSize: 13,
};

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
  const [openField, setOpenField] = useState<string | null>(null);
  const [fullDescription, setFullDescription] = useState(false);
  const table = useGetSourceTable(
    namespaceId,
    tableRef?.sourceId ?? "",
    tableRef?.tableId ?? "",
  );
  const biz = table.data?.businessMetadata;
  const description = biz?.description || entity.description;
  const synonyms = biz?.synonyms ?? [];
  const columns = table.data?.columns ?? [];
  const shown = allFields ? columns : columns.slice(0, FIELDS_SHOWN);
  const longDescription = (description?.length ?? 0) > LONG_DESCRIPTION;

  const ruleByName = Object.fromEntries(model.rules.map((r) => [r.name, r]));
  const parent = entity.kindOf
    ? model.entities.find((e) => e.id === entity.kindOf)
    : undefined;
  const kinds = kindsOf(model, entity.id);
  const subtitle = parent ? `A kind of ${parent.label}` : undefined;

  return (
    <Container
      header={
        <Header
          variant="h2"
          description={subtitle}
          actions={
            <ButtonDropdown
              variant="inline-icon"
              ariaLabel={`Edit ${entity.label}`}
              items={[
                {
                  id: "description",
                  text: "Edit description",
                  disabled: !tableRef,
                  disabledReason:
                    "Only things backed by one table can be edited here.",
                },
                {
                  id: "kind",
                  text: "Add a kind",
                  description: `A category of ${entity.label.toLowerCase()}`,
                },
              ]}
              onItemClick={({ detail }) =>
                detail.id === "kind" ? onAddKind() : onEditDescription()
              }
            />
          }
        >
          {entity.label}
        </Header>
      }
    >
      <SpaceBetween size="m">
        <div>
          {description ? (
            <>
              <div
                style={
                  longDescription && !fullDescription
                    ? {
                        display: "-webkit-box",
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }
                    : undefined
                }
              >
                {description}
              </div>
              {longDescription && (
                <div>
                  <Link
                    variant="secondary"
                    fontSize="body-s"
                    onFollow={() => setFullDescription((v) => !v)}
                  >
                    {fullDescription ? "Less" : "More"}
                  </Link>
                </div>
              )}
            </>
          ) : (
            <Box color="text-body-secondary">No description yet.</Box>
          )}
          {synonyms.length > 0 && (
            <Box
              color="text-body-secondary"
              fontSize="body-s"
              margin={{ top: "xxs" }}
            >
              Also called: {synonyms.join(", ")}
            </Box>
          )}
          {entity.members && (
            <Box
              variant="small"
              color="text-body-secondary"
              margin={{ top: "xxs" }}
            >
              Groups {entity.members.length} similar datasets:{" "}
              {entity.members.join(", ")}.
            </Box>
          )}
        </div>

        {tableRef && (
          <Section
            title={columns.length > 0 ? `Fields (${columns.length})` : "Fields"}
          >
            {table.isLoading ? (
              <Spinner />
            ) : columns.length === 0 ? (
              <Box color="text-body-secondary">No fields found.</Box>
            ) : (
              <div>
                <div
                  style={{
                    border: divider,
                    borderRadius: 8,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      ...rowStyle,
                      background:
                        "var(--color-background-container-header, #f4f6f8)",
                      cursor: "default",
                      fontSize: 12,
                      color: "var(--color-text-body-secondary, #5f6b7a)",
                    }}
                  >
                    <span>Field</span>
                    <span>Examples</span>
                  </div>
                  {shown.map((c) => {
                    const name = c.name ?? "";
                    const meaning =
                      c.businessMetadata?.description || c.description || "";
                    const values = c.distinctValues ?? [];
                    const examples =
                      values.slice(0, EXAMPLES_SHOWN).join(", ") +
                      (values.length > EXAMPLES_SHOWN
                        ? ` +${values.length - EXAMPLES_SHOWN}`
                        : "");
                    const open = openField === name;
                    return (
                      <div key={name} style={{ borderTop: divider }}>
                        <button
                          type="button"
                          aria-expanded={open}
                          title={meaning || undefined}
                          onClick={() => setOpenField(open ? null : name)}
                          style={rowStyle}
                        >
                          <span
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            <Icon
                              name={
                                open
                                  ? "caret-down-filled"
                                  : "caret-right-filled"
                              }
                              size="small"
                              variant="subtle"
                            />
                            {humanize(name)}
                          </span>
                          {examples && (
                            <span
                              style={{
                                fontSize: 12,
                                color:
                                  "var(--color-text-body-secondary, #5f6b7a)",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                maxWidth: "55%",
                                minWidth: 0,
                              }}
                            >
                              {examples}
                            </span>
                          )}
                        </button>
                        {open && (
                          <Box
                            variant="small"
                            padding={{ left: "l", right: "s", bottom: "xs" }}
                          >
                            {meaning && <div>{meaning}</div>}
                            {values.length > EXAMPLES_SHOWN && (
                              <div>Values: {values.join(", ")}</div>
                            )}
                            <Box variant="small" color="text-body-secondary">
                              <code>{name}</code>
                            </Box>
                          </Box>
                        )}
                      </div>
                    );
                  })}
                  {columns.length > FIELDS_SHOWN && (
                    <button
                      type="button"
                      aria-expanded={allFields}
                      onClick={() => setAllFields((v) => !v)}
                      style={{
                        ...rowStyle,
                        borderTop: divider,
                        justifyContent: "center",
                        fontSize: 13,
                        color: "var(--color-text-link-default, #0972d3)",
                      }}
                    >
                      {allFields
                        ? "Show fewer"
                        : `Show ${columns.length - FIELDS_SHOWN} more`}
                    </button>
                  )}
                </div>
              </div>
            )}
          </Section>
        )}

        {kinds.length > 0 && (
          <Section title="Kinds">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {kinds.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  title={k.description || undefined}
                  onClick={() => onSelect(k.id)}
                  style={pill}
                >
                  {k.label}
                </button>
              ))}
            </div>
          </Section>
        )}

        <Section
          title={`Rules (${entity.rules.length})`}
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
              None yet
            </Box>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {entity.rules.map((name) => {
                const label = ruleByName[name]?.label ?? name;
                return (
                  <button
                    key={name}
                    type="button"
                    aria-label={`${label}: see how it's worked out`}
                    title="See how it's worked out"
                    onClick={() => onPickRule(name)}
                    style={pill}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}
        </Section>

        {!parent && (
          <Box variant="small" color="text-body-secondary">
            Table <code>{table.data?.tableId ?? entity.table}</code>
          </Box>
        )}
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
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            color: "var(--color-text-body-secondary, #5f6b7a)",
          }}
        >
          {title}
        </span>
        {action}
      </div>
      <div style={{ marginTop: 4 }}>{children}</div>
    </div>
  );
}
