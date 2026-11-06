// SPDX-License-Identifier: Apache-2.0

/**
 * Business map model — turns a context graph's ontology, its data connections
 * and its governed metrics into the plain-language picture the Business map tab
 * draws: one circle per business thing (ontology class), a labelled line per
 * relationship (object property), the data connection each thing lives in, and
 * the rules (metrics) that use it.
 *
 * Pure functions only, so the mapping is unit-tested without Chart.js.
 */

export interface MapClassInput {
  uri: string;
  label?: string | null;
  comment?: string | null;
}
export interface MapPropertyInput {
  uri: string;
  label?: string | null;
  domain?: string | null;
  range?: string | null;
}
export interface MapRuleInput {
  name: string;
  label?: string | null;
  description?: string | null;
  sourceTable?: string | null;
  sql?: string | null;
  unit?: string | null;
}
/** Table name (lower case, unqualified) → data connection display name. */
export type TableConnections = Record<string, string>;

export interface MapEntity {
  id: string;
  /** Business label, e.g. "Agency" for `dim_agency`. */
  label: string;
  /** The underlying table/class name, for the technical line in the panel. */
  table: string;
  description: string;
  connection: string;
  rules: string[];
  attributeCount: number;
  /** Tables folded into this circle when several look-alike tables were grouped. */
  members?: string[];
}
export interface MapLink {
  source: string;
  target: string;
  label: string;
}
export interface MapRule {
  name: string;
  label: string;
  description: string;
  unit: string;
  entities: string[];
}
export interface BusinessMapModel {
  entities: MapEntity[];
  links: MapLink[];
  rules: MapRule[];
  connections: string[];
}

const PREFIXES = /^(dim|fact|fct|stg|ref|tbl|vw|v)_/i;

/** The last path/fragment segment of an IRI. */
export function localName(iri: string): string {
  const s = iri.replace(/[#/]+$/, "");
  return s.slice(Math.max(s.lastIndexOf("#"), s.lastIndexOf("/")) + 1);
}

/** Underscore/camel table-style name → "Sentence case" words. */
export function humanize(name: string): string {
  const words = name
    .replace(PREFIXES, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_\-.]+/g, " ")
    .trim()
    .toLowerCase();
  if (!words) return name;
  // Short all-letter tokens that read as acronyms in table names (psd, hr, id).
  const fixed = words.replace(/\b(psd|hr|hq|kpi|id|fte|sg|uk|us|mpi|hrms|moe|moh)\b/g, (w) =>
    w.toUpperCase(),
  );
  return fixed.charAt(0).toUpperCase() + fixed.slice(1);
}

/** A relationship's line label: the FK-style property name without its key suffix. */
export function relationshipLabel(prop: MapPropertyInput): string {
  const raw = prop.label || localName(prop.uri);
  const base = raw.replace(/_(id|code|key|no|num|ref)$/i, "");
  return humanize(base).toLowerCase();
}

/** Lower-case table key for an ontology class (its label, else IRI local name). */
export function classTable(c: MapClassInput): string {
  return (c.label || localName(c.uri)).toLowerCase();
}

/** Tables a rule reads, from its declared source table and its SQL text. */
export function tablesUsedBy(rule: MapRuleInput, known: string[]): string[] {
  const hit = new Set<string>();
  const src = (rule.sourceTable ?? "").toLowerCase().split(".").pop();
  if (src && known.includes(src)) hit.add(src);
  const sql = (rule.sql ?? "").toLowerCase();
  for (const t of known) {
    // Table names appear as `db.table`, `"table"` or a bare word.
    if (new RegExp(`(^|[^a-z0-9_])${t}([^a-z0-9_]|$)`).test(sql)) hit.add(t);
  }
  return [...hit];
}

export function buildBusinessMap(
  classes: MapClassInput[],
  objectProperties: MapPropertyInput[],
  datatypeProperties: MapPropertyInput[],
  rules: MapRuleInput[],
  tableConnections: TableConnections,
): BusinessMapModel {
  // One circle per class, de-duplicated across ontologies by IRI.
  const byUri = new Map<string, MapClassInput>();
  for (const c of classes) if (c.uri && !byUri.has(c.uri)) byUri.set(c.uri, c);
  const uniq = [...byUri.values()];
  const tables = uniq.map(classTable);
  // Object properties reference classes by IRI; induced ontologies also mint a
  // CamelCase IRI per table, so match on the normalised local name too.
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const idFor = new Map<string, string>();
  uniq.forEach((c, i) => {
    idFor.set(c.uri, tables[i]);
    idFor.set(norm(localName(c.uri)), tables[i]);
    idFor.set(norm(tables[i]), tables[i]);
  });
  const resolve = (iri?: string | null) =>
    iri ? (idFor.get(iri) ?? idFor.get(norm(localName(iri)))) : undefined;

  const ruleModels: MapRule[] = rules.map((r) => ({
    name: r.name,
    label: r.label || humanize(r.name),
    description: r.description ?? "",
    unit: r.unit ?? "",
    entities: tablesUsedBy(r, tables),
  }));

  const attrs = new Map<string, number>();
  for (const p of datatypeProperties) {
    const d = resolve(p.domain);
    if (d) attrs.set(d, (attrs.get(d) ?? 0) + 1);
  }

  const entities: MapEntity[] = uniq.map((c, i) => {
    const t = tables[i];
    const comment = (c.comment ?? "").trim();
    return {
      id: t,
      label: humanize(c.label || localName(c.uri)),
      table: t,
      // Induced comments often just restate the table name; drop those.
      description:
        comment && norm(comment) !== norm(t) && norm(comment) !== norm(humanize(t))
          ? comment
          : "",
      connection: tableConnections[t] ?? "Other",
      rules: ruleModels.filter((r) => r.entities.includes(t)).map((r) => r.name),
      attributeCount: attrs.get(t) ?? 0,
    };
  });

  const seen = new Set<string>();
  const links: MapLink[] = [];
  for (const p of objectProperties) {
    const s = resolve(p.domain);
    const t = resolve(p.range);
    if (!s || !t || s === t) continue;
    const key = [s, t].sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({ source: s, target: t, label: relationshipLabel(p) });
  }

  const grouped = groupLookAlikes(entities, links);
  const connections = [...new Set(grouped.entities.map((e) => e.connection))].sort(
    (a, b) => (a === "Other" ? 1 : b === "Other" ? -1 : a.localeCompare(b)),
  );
  return { entities: grouped.entities, links: grouped.links, rules: ruleModels, connections };
}

/** Fewest look-alike tables worth folding into one circle. */
const GROUP_MIN = 3;

/**
 * Fold tables that only differ by breakdown into one circle: same data
 * connection, same relationships, and no rule of their own beyond what the
 * group shares. Typical case: a published dataset split by age, gender, tenure.
 * Keeps the picture about business things rather than how a source slices them.
 */
export function groupLookAlikes(
  entities: MapEntity[],
  links: MapLink[],
): { entities: MapEntity[]; links: MapLink[] } {
  const neighbours = new Map<string, string[]>();
  for (const e of entities) neighbours.set(e.id, []);
  for (const l of links) {
    neighbours.get(l.source)?.push(`${l.label}>${l.target}`);
    neighbours.get(l.target)?.push(`${l.label}<${l.source}`);
  }
  const buckets = new Map<string, MapEntity[]>();
  for (const e of entities) {
    const sig = neighbours.get(e.id)!;
    // Only things that connect elsewhere and nothing connects to (leaves).
    if (sig.length === 0 || sig.some((n) => n.includes("<"))) continue;
    const key = `${e.connection}|${[...sig].sort().join(",")}`;
    const list = buckets.get(key) ?? [];
    list.push(e);
    buckets.set(key, list);
  }
  const folded = new Map<string, string>();
  const groups: MapEntity[] = [];
  for (const [, list] of buckets) {
    if (list.length < GROUP_MIN) continue;
    const id = `group:${list[0].connection}`;
    list.forEach((e) => folded.set(e.id, id));
    groups.push({
      id,
      label: `${list[0].connection} (${list.length} datasets)`,
      table: list.map((e) => e.table).join(", "),
      description: list.find((e) => e.description)?.description ?? "",
      connection: list[0].connection,
      rules: [...new Set(list.flatMap((e) => e.rules))],
      attributeCount: list.reduce((n, e) => n + e.attributeCount, 0),
      members: list.map((e) => e.label),
    });
  }
  if (groups.length === 0) return { entities, links };
  const seen = new Set<string>();
  const outLinks: MapLink[] = [];
  for (const l of links) {
    const source = folded.get(l.source) ?? l.source;
    const target = folded.get(l.target) ?? l.target;
    const key = `${source}|${target}|${l.label}`;
    if (source === target || seen.has(key)) continue;
    seen.add(key);
    outLinks.push({ ...l, source, target });
  }
  return {
    entities: [...entities.filter((e) => !folded.has(e.id)), ...groups],
    links: outLinks,
  };
}
