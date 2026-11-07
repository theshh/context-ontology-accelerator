// SPDX-License-Identifier: Apache-2.0

/**
 * Lineage strip — how one rule is worked out, left to right: the rule and its
 * definition, the business things (and their fields) it reads, the data
 * connections those live in, then a way to get the answer. The calculation
 * itself is folded away for technical readers.
 */
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import Container from "@cloudscape-design/components/container";
import ExpandableSection from "@cloudscape-design/components/expandable-section";
import Header from "@cloudscape-design/components/header";
import Link from "@cloudscape-design/components/link";
import { fieldsUsedBy, humanize, type BusinessMapModel, type MapRule } from "./model";

const step: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  border: "1px solid var(--color-border-divider-default, #e9ebed)",
  borderRadius: 10,
  padding: "10px 12px",
  background: "var(--color-background-container-content, #fff)",
};
const arrow: React.CSSProperties = {
  flex: "0 0 28px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "var(--color-text-body-secondary, #5f6b7a)",
  fontSize: 18,
};

interface Props {
  rule: MapRule;
  model: BusinessMapModel;
  onSelect: (id: string) => void;
  onOpenRule: () => void;
  onAsk: () => void;
  onClose: () => void;
}

export function LineageStrip({ rule, model, onSelect, onOpenRule, onAsk, onClose }: Props) {
  const things = model.entities.filter((e) => rule.entities.includes(e.id) || e.rules.includes(rule.name));
  const connections = [...new Set(things.map((t) => t.connection))];
  return (
    <Container
      header={
        <Header
          variant="h2"
          actions={
            <Button variant="icon" iconName="close" ariaLabel="Close" onClick={onClose} />
          }
        >
          How "{rule.label}" is worked out
        </Header>
      }
    >
      <div style={{ display: "flex", alignItems: "stretch" }}>
        <div style={step}>
          <Box variant="awsui-key-label">1 · Rule</Box>
          <Box fontWeight="bold">{rule.label}</Box>
          <Box variant="small" color="text-body-secondary">
            {rule.description || "No definition written yet."}
          </Box>
          <Box margin={{ top: "xxs" }}>
            <Link variant="secondary" fontSize="body-s" onFollow={onOpenRule}>
              Open the rule
            </Link>
          </Box>
        </div>
        <div style={arrow}>→</div>
        <div style={step}>
          <Box variant="awsui-key-label">2 · Uses</Box>
          {things.map((t) => {
            const fields = fieldsUsedBy(rule, t);
            return (
              <div key={t.id} style={{ marginTop: 4 }}>
                <Link onFollow={() => onSelect(t.id)}>
                  <b>{t.label}</b>
                </Link>
                {fields.length > 0 && (
                  <Box variant="small" color="text-body-secondary">
                    {fields.map(humanize).join(", ")}
                  </Box>
                )}
              </div>
            );
          })}
        </div>
        <div style={arrow}>→</div>
        <div style={step}>
          <Box variant="awsui-key-label">3 · Data</Box>
          {connections.map((c) => (
            <Box key={c} margin={{ top: "xxs" }}>
              {c}
            </Box>
          ))}
          <Box variant="small" color="text-body-secondary">
            {things.map((t) => t.table).join(", ")}
          </Box>
        </div>
        <div style={arrow}>→</div>
        <div style={{ ...step, borderColor: "var(--color-border-item-focused, #0972d3)", borderWidth: 2 }}>
          <Box variant="awsui-key-label">4 · Answer</Box>
          <Box variant="small" color="text-body-secondary">
            Calculated the same way every time it's asked.
          </Box>
          <Box margin={{ top: "xs" }}>
            <Button onClick={onAsk}>Ask in Playground</Button>
          </Box>
        </div>
      </div>
      {rule.sql && (
        <Box margin={{ top: "s" }}>
          <ExpandableSection headerText="Show the calculation">
            <pre
              style={{
                margin: 0,
                whiteSpace: "pre-wrap",
                fontSize: 12,
                background: "var(--color-background-code-default, #f4f4f4)",
                padding: 10,
                borderRadius: 6,
              }}
            >
              {rule.sql}
            </pre>
          </ExpandableSection>
        </Box>
      )}
    </Container>
  );
}
