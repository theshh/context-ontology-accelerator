// SPDX-License-Identifier: Apache-2.0

/**
 * "Without context" column of the Playground compare view: what a plain
 * text-to-SQL assistant answers when it sees only the raw table and column
 * names. One card per question, newest last, so it lines up with the chat.
 */
import Box from "@cloudscape-design/components/box";
import Container from "@cloudscape-design/components/container";
import ExpandableSection from "@cloudscape-design/components/expandable-section";
import Header from "@cloudscape-design/components/header";
import SpaceBetween from "@cloudscape-design/components/space-between";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import type { BaselineResult } from "@api-hooks/baseline-query";

export interface BaselineTurn {
  id: string;
  question: string;
  status: "loading" | "done";
  result?: BaselineResult;
}

const ROWS_SHOWN = 5;

export function BaselinePanel({ turns }: { turns: BaselineTurn[] }) {
  return (
    <SpaceBetween size="s">
      <Box variant="awsui-key-label">Without context</Box>
      <Box variant="small" color="text-body-secondary">
        A plain AI assistant that sees only the raw table and column names. No
        business definitions, governed rules or policy documents.
      </Box>
      {turns.length === 0 && (
        <Box color="text-body-secondary" padding={{ top: "m" }}>
          Ask a question to compare the two answers.
        </Box>
      )}
      {turns.map((turn) => (
        <BaselineCard key={turn.id} turn={turn} />
      ))}
    </SpaceBetween>
  );
}

function BaselineCard({ turn }: { turn: BaselineTurn }) {
  const r = turn.result;
  return (
    <Container header={<Header variant="h3">{turn.question}</Header>}>
      {turn.status === "loading" ? (
        <StatusIndicator type="loading">
          Writing SQL from the raw schema
        </StatusIndicator>
      ) : r?.error ? (
        <SpaceBetween size="xs">
          <StatusIndicator type="error">{r.message ?? r.error}</StatusIndicator>
          {r.sql && <Sql sql={r.sql} />}
        </SpaceBetween>
      ) : (
        <SpaceBetween size="xs">
          <div>{r?.answer ?? "No answer."}</div>
          {r?.assumptions && (
            <Box variant="small" color="text-body-secondary">
              Assumed: {r.assumptions}
            </Box>
          )}
          {r?.sql && <Sql sql={r.sql} />}
          {r?.columns && r.rows && r.rows.length > 0 && (
            <ExpandableSection headerText={`Result (${r.rows.length} rows)`}>
              <table style={{ borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>
                    {r.columns.map((c) => (
                      <th
                        key={c}
                        style={{ textAlign: "left", padding: "2px 8px 2px 0" }}
                      >
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {r.rows.slice(0, ROWS_SHOWN).map((row, i) => (
                    <tr key={i}>
                      {row.map((cell, j) => (
                        <td key={j} style={{ padding: "2px 8px 2px 0" }}>
                          {cell ?? ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </ExpandableSection>
          )}
          {r?.elapsedMs !== undefined && (
            <Box variant="small" color="text-body-secondary">
              {(r.elapsedMs / 1000).toFixed(1)} s
            </Box>
          )}
        </SpaceBetween>
      )}
    </Container>
  );
}

function Sql({ sql }: { sql: string }) {
  return (
    <ExpandableSection headerText="SQL it wrote">
      <pre
        style={{
          whiteSpace: "pre-wrap",
          fontSize: 12,
          margin: 0,
          fontFamily: "monospace",
        }}
      >
        {sql}
      </pre>
    </ExpandableSection>
  );
}
