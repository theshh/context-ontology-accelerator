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
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type SimulationNodeDatum,
} from "d3-force";

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

interface LayoutNode extends SimulationNodeDatum {
  id: string;
  group: number;
}

/**
 * Deterministic positions: seed each data connection on its own arc of a circle
 * so related things start together, then settle with d3-force (links pull,
 * circles repel, a weak pull to the centre keeps unlinked things on screen).
 */
export function layoutBusinessMap(
  model: BusinessMapModel,
): Record<string, { x: number; y: number }> {
  const groups = model.connections;
  const conn = new Map(model.entities.map((e) => [e.id, e.connection]));
  const sizeOf = (c: string) => model.entities.filter((e) => e.connection === c).length;

  // 1. Place each data connection as one zone. Zones that share more
  //    relationships pull together, so cross-zone lines stay short; zone size
  //    follows how many things it holds, and zones never overlap.
  interface Zone extends SimulationNodeDatum { id: string; r: number }
  const zones: Zone[] = groups.map((c, i) => {
    const a = (2 * Math.PI * i) / Math.max(groups.length, 1);
    return { id: c, r: 80 + Math.sqrt(sizeOf(c)) * 110, x: Math.cos(a) * 200, y: Math.sin(a) * 140 };
  });
  const weight = new Map<string, number>();
  for (const l of model.links) {
    const a = conn.get(l.source);
    const b = conn.get(l.target);
    if (!a || !b || a === b) continue;
    const k = [a, b].sort().join("|");
    weight.set(k, (weight.get(k) ?? 0) + 1);
  }
  const zoneLinks = [...weight].map(([k, w]) => {
    const [source, target] = k.split("|");
    return { source, target, w };
  });
  const zsim = forceSimulation(zones)
    .force(
      "link",
      forceLink<Zone, { source: string; target: string; w: number }>(zoneLinks)
        .id((d) => d.id)
        .distance((l) => ((l.source as unknown as Zone).r + (l.target as unknown as Zone).r) * 1.05)
        .strength((l) => Math.min(0.2 + l.w * 0.1, 0.8)),
    )
    .force("charge", forceManyBody().strength(-300))
    .force("collide", forceCollide<Zone>((d) => d.r + 24).iterations(4))
    .force("x", forceX(0).strength(0.05))
    .force("y", forceY(0).strength(0.08))
    .stop();
  for (let i = 0; i < 400; i++) zsim.tick();
  const home = new Map(zones.map((z) => [z.id, z]));

  // 2. Place things inside their zone: linked things pull together, circles
  //    repel, and each is held firmly inside its own zone.
  const nodes: LayoutNode[] = model.entities.map((e, i) => {
    const z = home.get(e.connection)!;
    const a = (2 * Math.PI * i) / Math.max(sizeOf(e.connection), 1);
    return {
      id: e.id,
      group: groups.indexOf(e.connection),
      x: (z.x ?? 0) + Math.cos(a) * z.r * 0.4,
      y: (z.y ?? 0) + Math.sin(a) * z.r * 0.4,
    };
  });
  const inner = model.links.filter((l) => conn.get(l.source) === conn.get(l.target));
  const sim = forceSimulation(nodes)
    .force(
      "link",
      forceLink<LayoutNode, { source: string; target: string }>(
        inner.map((l) => ({ source: l.source, target: l.target })),
      )
        .id((d) => d.id)
        .distance(170)
        .strength(0.4),
    )
    .force("charge", forceManyBody().strength(-500).distanceMax(400))
    .force("collide", forceCollide(95))
    .force("x", forceX<LayoutNode>((d) => home.get(groups[d.group])!.x ?? 0).strength(0.25))
    .force("y", forceY<LayoutNode>((d) => home.get(groups[d.group])!.y ?? 0).strength(0.25))
    .stop();
  for (let i = 0; i < 400; i++) {
    sim.tick();
    // Keep every circle inside its zone.
    for (const n of nodes) {
      const z = home.get(groups[n.group])!;
      const dx = (n.x ?? 0) - (z.x ?? 0);
      const dy = (n.y ?? 0) - (z.y ?? 0);
      const d = Math.hypot(dx, dy);
      const max = z.r - 70;
      if (d > max && d > 0) {
        n.x = (z.x ?? 0) + (dx / d) * max;
        n.y = (z.y ?? 0) + (dy / d) * max;
      }
    }
  }
  return Object.fromEntries(nodes.map((d) => [d.id, { x: d.x ?? 0, y: d.y ?? 0 }]));
}

/** Zone centre and radius per data connection, for drawing. */
export function zonesFor(
  model: BusinessMapModel,
  pos: Record<string, { x: number; y: number }>,
): Array<{ connection: string; x: number; y: number; r: number }> {
  return model.connections.map((c) => {
    const pts = model.entities.filter((e) => e.connection === c).map((e) => pos[e.id]);
    const cx = pts.reduce((a, p) => a + p.x, 0) / (pts.length || 1);
    const cy = pts.reduce((a, p) => a + p.y, 0) / (pts.length || 1);
    const r = Math.max(0, ...pts.map((p) => Math.hypot(p.x - cx, p.y - cy))) + 62;
    return { connection: c, x: cx, y: cy, r };
  });
}
