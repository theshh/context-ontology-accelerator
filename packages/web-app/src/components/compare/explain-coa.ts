// SPDX-License-Identifier: Apache-2.0

/**
 * Turn a COA answer's trace into plain steps a business user can follow:
 * which governed rule the words matched, which business things in the
 * context graph it used and how they connect, the access checks, and how the
 * number was produced. Pure, so it is unit-tested without rendering.
 */
import type { QueryResult, TraceStep } from "@app-types";
import {
  humanize,
  localName,
  relationshipLabel,
} from "@components/business-map/model";

export interface RuleInfo {
  label?: string;
  description?: string;
  unit?: string;
}

/** A relationship between two tables, as the ontology states it. */
export interface GraphLink {
  from: string;
  label: string;
  to: string;
}

export interface ExplainStep {
  title: string;
  text?: string;
  /** Business things (tables) shown as chips. */
  things?: string[];
  /** Relationship lines, e.g. "Employment → position → Establishment position". */
  links?: string[];
  /** Policy documents cited. */
  documents?: string[];
}

interface OverviewLike {
  classes?: { uri?: string; label?: string | null }[];
  objectProperties?: {
    uri?: string;
    label?: string | null;
    domain?: string | null;
    range?: string | null;
  }[];
}

/** Relationships between tables (by lower-case table name) from the ontology overview. */
export function graphLinks(overview: OverviewLike | undefined): GraphLink[] {
  if (!overview) return [];
  const tableOf = new Map<string, string>();
  for (const c of overview.classes ?? []) {
    if (c.uri) tableOf.set(c.uri, (c.label || localName(c.uri)).toLowerCase());
  }
  const links: GraphLink[] = [];
  for (const p of overview.objectProperties ?? []) {
    const from = p.domain ? tableOf.get(p.domain) : undefined;
    const to = p.range ? tableOf.get(p.range) : undefined;
    if (!from || !to || !p.uri) continue;
    links.push({
      from,
      to,
      label: relationshipLabel({ uri: p.uri, label: p.label }),
    });
  }
  return links;
}

/** The first sentence of a rule's definition, without bracketed detail, so the step stays short. */
export function firstSentence(text: string | undefined, max = 140): string {
  if (!text) return "";
  // Bracketed detail (column names, codes) is for the full definition.
  const t = text.replace(/\s*\([^)]*\)/g, "").trim();
  const end = t.search(/[.!?](\s|$)/);
  const first = end >= 0 ? t.slice(0, end + 1) : t;
  return first.length > max ? `${first.slice(0, max - 1).trimEnd()}…` : first;
}

function detailOf(
  trace: readonly TraceStep[],
  step: string,
): Record<string, unknown> | undefined {
  const d = trace.find((t) => t.step === step)?.detail;
  return d && typeof d === "object"
    ? (d as Record<string, unknown>)
    : undefined;
}

function strings(v: unknown): string[] {
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string")
    : [];
}

export function explainCoa(
  result: QueryResult,
  rules: Readonly<Record<string, RuleInfo>>,
  links: readonly GraphLink[],
): ExplainStep[] {
  const trace = result.trace ?? [];
  const steps: ExplainStep[] = [];

  // 1. Meaning: the words matched a governed rule.
  const match = detailOf(trace, "t1.metric_match");
  const ruleName =
    typeof match?.metricName === "string" ? match.metricName : undefined;
  if (ruleName) {
    const rule = rules[ruleName];
    const words =
      typeof match?.matchedText === "string"
        ? `“${match.matchedText}”`
        : "The question";
    const via = match?.matchSource === "synonym" ? " (a synonym)" : "";
    const summary = firstSentence(rule?.description);
    steps.push({
      title: "Matched a governed rule",
      text: `${words}${via} → ${rule?.label ?? humanize(ruleName)}.${summary ? ` ${summary}` : ""}`,
    });
  }

  // 2. Graph: which business things it used, and how they connect.
  const meta = (result.metadata ?? {}) as Record<string, unknown>;
  const generate = detailOf(trace, "t2.sql.generate");
  const execute = detailOf(trace, "t2.sql.execute");
  const used = [
    ...new Set([...strings(generate?.tables), ...strings(execute?.tables)]),
  ].map((t) => t.toLowerCase());
  const retrieved = strings(meta.retrieved_tables).map((t) => t.toLowerCase());
  const expanded = strings(meta.expanded_tables)
    .map((t) => t.toLowerCase())
    .filter((t) => !retrieved.includes(t));
  if (used.length > 0 || retrieved.length > 0) {
    const considered = [...new Set([...retrieved, ...expanded])].filter(
      (t) => !used.includes(t),
    ).length;
    steps.push({
      title: "Found the business things in the context graph",
      things: (used.length > 0 ? used : retrieved).map(humanize),
      text:
        considered > 0
          ? `Also looked at ${considered} related ${considered === 1 ? "thing" : "things"} and left ${considered === 1 ? "it" : "them"} out.`
          : undefined,
    });
  }
  const usedSet = new Set(used);
  const path = links
    .filter((l) => usedSet.has(l.from) && usedSet.has(l.to) && l.from !== l.to)
    .map((l) => `${humanize(l.from)} → ${l.label} → ${humanize(l.to)}`);
  if (path.length > 0) {
    steps.push({
      title: "Followed the relationships",
      links: [...new Set(path)],
    });
  }

  // 3. Governance: who asked, and the SQL firewall.
  const authorize = detailOf(trace, "t2.sql.authorize");
  const firewall = detailOf(trace, "t2.sql.firewall");
  if (authorize || firewall) {
    const who =
      typeof authorize?.principal === "string"
        ? authorize.principal
        : "the user";
    const allowed =
      authorize?.decision === "allow"
        ? "allowed"
        : String(authorize?.decision ?? "checked");
    const fw = firewall?.decision
      ? `; SQL firewall ${String(firewall.decision)}`
      : "";
    steps.push({
      title: "Checked access",
      text: `Access for ${who}: ${allowed}${fw}.`,
    });
  }

  // 4. How the answer was produced.
  if (result.tier === 1) {
    steps.push({
      title: "Ran the rule",
      text: "Ran the governed rule's own SQL, exactly as written.",
    });
  } else if (execute || result.queryUsed) {
    const rows =
      typeof execute?.rowCount === "number"
        ? `${execute.rowCount} ${execute.rowCount === 1 ? "row" : "rows"}`
        : "the result";
    const how = ruleName
      ? "Wrote SQL from the rule's definition and the things above"
      : "Wrote SQL from the things above";
    const engine =
      typeof execute?.engine === "string"
        ? ` on ${execute.engine === "athena" ? "Amazon Athena" : execute.engine}`
        : "";
    steps.push({
      title: "Ran the query",
      text: `${how}, ran it${engine} and got ${rows}.`,
    });
  }

  // 5. Documents (Tier 3).
  const docs = [
    ...new Set(
      (result.supportingContent ?? [])
        .map((c) => c.sourceDocumentName || c.sourceDoc || c.label)
        .filter((n): n is string => typeof n === "string" && n.length > 0),
    ),
  ];
  if (docs.length > 0) {
    steps.push({ title: "Read the policy documents", documents: docs });
  }
  return steps;
}

/** One-line answer for the card: the sentence COA wrote, else the rule and its value. */
export function coaAnswerText(
  result: QueryResult,
  rows: Record<string, unknown>[] | undefined,
  rules: Readonly<Record<string, RuleInfo>>,
): string {
  if (result.synthesizedAnswer) return result.synthesizedAnswer;
  const match = detailOf(result.trace ?? [], "t1.metric_match");
  const ruleName =
    typeof match?.metricName === "string" ? match.metricName : undefined;
  if (rows && rows.length === 1 && Object.keys(rows[0] ?? {}).length === 1) {
    const value = String(Object.values(rows[0]!)[0] ?? "");
    const label = ruleName
      ? (rules[ruleName]?.label ?? humanize(ruleName))
      : undefined;
    return label ? `${label}: ${value}` : value;
  }
  if (rows && rows.length > 0)
    return `${rows.length} ${rows.length === 1 ? "row" : "rows"} returned.`;
  return "No answer.";
}
