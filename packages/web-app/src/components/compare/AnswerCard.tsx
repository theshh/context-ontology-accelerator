// SPDX-License-Identifier: Apache-2.0

/**
 * One answer in the compare view. Both sides use this card so they read the
 * same way: the answer, how it got there, the SQL, the rows, the time.
 */
import Box from "@cloudscape-design/components/box";
import Container from "@cloudscape-design/components/container";
import ExpandableSection from "@cloudscape-design/components/expandable-section";
import SpaceBetween from "@cloudscape-design/components/space-between";
import StatusIndicator from "@cloudscape-design/components/status-indicator";

const ROWS_SHOWN = 5;

export interface AnswerCardProps {
  side: "without" | "with";
  loading?: string;
  error?: string;
  answer?: string;
  howTitle: string;
  how?: React.ReactNode;
  howOpen?: boolean;
  sql?: string;
  columns?: string[];
  rows?: unknown[][];
  footer?: string;
}

export function AnswerCard(props: AnswerCardProps) {
  const {
    side,
    loading,
    error,
    answer,
    howTitle,
    how,
    howOpen,
    sql,
    columns,
    rows,
    footer,
  } = props;
  const accent =
    side === "with"
      ? "var(--color-border-status-info, #0972d3)"
      : "var(--color-border-divider-default, #c6c6cd)";
  return (
    <div
      style={{
        borderTop: `3px solid ${accent}`,
        borderRadius: 16,
        height: "100%",
      }}
    >
      <Container fitHeight>
        <SpaceBetween size="s">
          <Box variant="awsui-key-label">
            {side === "with" ? "With context (COA)" : "Agent with skills"}
          </Box>
          {loading ? (
            <StatusIndicator type="loading">{loading}</StatusIndicator>
          ) : error ? (
            <StatusIndicator type="error">{error}</StatusIndicator>
          ) : (
            <Box fontSize="heading-s" fontWeight="bold">
              {answer ?? "No answer."}
            </Box>
          )}
          {!loading && how && (
            <ExpandableSection headerText={howTitle} defaultExpanded={howOpen}>
              {how}
            </ExpandableSection>
          )}
          {!loading && sql && (
            <ExpandableSection headerText="SQL">
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
          )}
          {!loading && columns && rows && rows.length > 0 && (
            <ExpandableSection
              headerText={`Result (${rows.length} ${rows.length === 1 ? "row" : "rows"})`}
            >
              <table style={{ borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr>
                    {columns.map((c) => (
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
                  {rows.slice(0, ROWS_SHOWN).map((row, i) => (
                    <tr key={i}>
                      {row.map((cell, j) => (
                        <td key={j} style={{ padding: "2px 8px 2px 0" }}>
                          {String(cell ?? "")}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </ExpandableSection>
          )}
          {!loading && footer && (
            <Box variant="small" color="text-body-secondary">
              {footer}
            </Box>
          )}
        </SpaceBetween>
      </Container>
    </div>
  );
}
