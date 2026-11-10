// SPDX-License-Identifier: Apache-2.0

/**
 * Compare view: one row per question, "Agent with skills" and "With context
 * (COA)" side by side in the same card layout, so the two answers line up.
 */
import Box from "@cloudscape-design/components/box";
import SpaceBetween from "@cloudscape-design/components/space-between";
import type { ChatMessage, QueryResult } from "@app-types";
import type { BaselineResult } from "@api-hooks/baseline-query";
import { AnswerCard } from "./AnswerCard";
import {
  coaAnswerText,
  explainCoa,
  type ExplainStep,
  type GraphLink,
  type RuleInfo,
} from "./explain-coa";

export interface CompareTurn {
  id: string;
  question: string;
  baseline?: { status: "loading" | "done"; result?: BaselineResult };
  coa?: ChatMessage;
}

interface Props {
  turns: CompareTurn[];
  rules: Readonly<Record<string, RuleInfo>>;
  links: readonly GraphLink[];
  formatRows: (result: QueryResult) => Record<string, unknown>[] | undefined;
}

export function CompareList({ turns, rules, links, formatRows }: Props) {
  return (
    <SpaceBetween size="l">
      <Box variant="small" color="text-body-secondary">
        Left: an AI agent with the raw table and column names plus a
        hand-written skill file of MPI&apos;s business rules. Right: the same
        question answered with context: the context graph, its governed rules
        and policy documents.
      </Box>
      {turns.map((turn) => (
        <section key={turn.id} aria-label={turn.question}>
          <Box variant="h3" padding={{ bottom: "xs" }}>
            {turn.question}
          </Box>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 16,
              alignItems: "stretch",
            }}
          >
            <BaselineSide turn={turn} />
            <CoaSide
              turn={turn}
              rules={rules}
              links={links}
              formatRows={formatRows}
            />
          </div>
        </section>
      ))}
    </SpaceBetween>
  );
}

function BaselineSide({ turn }: { turn: CompareTurn }) {
  const b = turn.baseline;
  if (!b)
    return (
      <AnswerCard side="without" howTitle="" error="Not asked to the agent." />
    );
  const r = b.result;
  const usedSkills = (r?.skills?.length ?? 0) > 0;
  return (
    <AnswerCard
      side="without"
      loading={
        b.status === "loading"
          ? "Reading its skills and writing SQL"
          : undefined
      }
      error={r?.error ? (r.message ?? r.error) : undefined}
      answer={r?.answer}
      howTitle="How it was worked out"
      how={
        r?.assumptions || r?.sql || r?.skills?.length ? (
          <SpaceBetween size="xs">
            {usedSkills && (
              <Box variant="p">
                <b>Skills used:</b> {r?.skills?.join(", ")}
              </Box>
            )}
            {r?.assumptions && (
              <Box variant="p">
                <b>Assumed:</b> {r.assumptions}
              </Box>
            )}
            {r?.sql && <SqlText sql={r.sql} />}
          </SpaceBetween>
        ) : undefined
      }
      columns={r?.columns}
      rows={r?.rows}
      footer={
        r?.elapsedMs !== undefined
          ? `${(r.elapsedMs / 1000).toFixed(1)} s · ${
              usedSkills
                ? "rules from a skill file"
                : "guessed from column names"
            }`
          : undefined
      }
    />
  );
}

function CoaSide({
  turn,
  rules,
  links,
  formatRows,
}: Omit<Props, "turns"> & { turn: CompareTurn }) {
  const msg = turn.coa;
  if (!msg)
    return (
      <AnswerCard side="with" howTitle="" loading="Waiting for the answer" />
    );
  if (msg.isLoading) {
    return (
      <AnswerCard
        side="with"
        howTitle=""
        loading={msg.stage ? `Working: ${msg.stage}` : "Working"}
      />
    );
  }
  if (msg.error)
    return <AnswerCard side="with" howTitle="" error={msg.error.message} />;
  const result = msg.response?.result;
  if (!result) return <AnswerCard side="with" howTitle="" error="No answer." />;
  const rows = formatRows(result);
  const columns = rows && rows.length > 0 ? Object.keys(rows[0]!) : undefined;
  const ms = (result.trace ?? []).reduce(
    (sum, t) => sum + (t.durationMs ?? 0),
    0,
  );
  const tier =
    result.tier === 1
      ? "governed rule"
      : result.tier === 2
        ? "query from the context graph"
        : "policy documents";
  return (
    <AnswerCard
      side="with"
      answer={coaAnswerText(result, rows, rules)}
      howTitle="How it was worked out"
      how={<Steps steps={explainCoa(result, rules, links)} />}
      sql={result.queryUsed}
      columns={columns}
      rows={rows?.map((r) => Object.values(r))}
      footer={`${(ms / 1000).toFixed(1)} s · ${tier}`}
    />
  );
}

function Steps({ steps }: { steps: ExplainStep[] }) {
  if (steps.length === 0)
    return <Box color="text-body-secondary">No steps recorded.</Box>;
  return (
    <ol style={{ margin: 0, paddingLeft: 20 }}>
      {steps.map((s) => (
        <li key={s.title} style={{ marginBottom: 8 }}>
          <b>{s.title}</b>
          {s.text && <div>{s.text}</div>}
          {s.things && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
                marginTop: 4,
              }}
            >
              {s.things.map((t) => (
                <span
                  key={t}
                  style={{
                    border:
                      "1px solid var(--color-border-status-info, #0972d3)",
                    borderRadius: 12,
                    padding: "0 8px",
                    fontSize: 12,
                  }}
                >
                  {t}
                </span>
              ))}
            </div>
          )}
          {s.links && (
            <ul style={{ margin: "4px 0 0", paddingLeft: 16 }}>
              {s.links.map((l) => (
                <li key={l} style={{ fontSize: 13 }}>
                  {l}
                </li>
              ))}
            </ul>
          )}
          {s.documents && (
            <ul style={{ margin: "4px 0 0", paddingLeft: 16 }}>
              {s.documents.map((d) => (
                <li key={d} style={{ fontSize: 13 }}>
                  {d}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );
}

function SqlText({ sql }: { sql: string }) {
  return (
    <div>
      <b>SQL it wrote:</b>
      <pre
        style={{
          whiteSpace: "pre-wrap",
          fontSize: 12,
          margin: "4px 0 0",
          fontFamily: "monospace",
        }}
      >
        {sql}
      </pre>
    </div>
  );
}
