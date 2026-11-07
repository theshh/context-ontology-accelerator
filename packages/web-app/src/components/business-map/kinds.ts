// SPDX-License-Identifier: Apache-2.0

/**
 * "Add a kind" — a business user's sub-category of a business thing (e.g.
 * Resignation as a kind of Leaving), stored as a small ontology of its own:
 * one owl:Class with rdfs:subClassOf the parent class, a label and a plain
 * definition. One ontology per kind keeps it additive (nothing in the induced
 * ontology is rewritten) and removable (delete that one ontology).
 */

/** Ontology id prefix every kind ontology carries, so kinds can be recognised. */
export const KIND_ONTOLOGY_PREFIX = "urn:coa:kind:";

/** Lower-kebab slug of a business name, safe in an IRI. */
export function slugify(name: string): string {
  return (
    name
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .toLowerCase()
      .replace(/[\s_]+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 60) || "kind"
  );
}

/** A Turtle string literal: quotes, backslashes and line breaks escaped. */
export function turtleLiteral(text: string): string {
  return `"${text
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, "\\n")
    .replace(/\r/g, "\\n")}"`;
}

export interface KindInput {
  namespaceId: string;
  /** IRI of the business thing this is a kind of. */
  parentUri: string;
  /** Business name, e.g. "Resignation". */
  label: string;
  /** Plain definition, e.g. "Leaving where the reason is RSN (resigned)". */
  definition: string;
}

export interface KindOntology {
  ontologyId: string;
  classUri: string;
  turtle: string;
  filename: string;
}

/** Build the one-class ontology for a new kind. */
export function buildKindOntology(input: KindInput, suffix = Date.now().toString(36)): KindOntology {
  const label = input.label.trim();
  const definition = input.definition.trim();
  if (!label) throw new Error("A kind needs a name.");
  if (!/^[a-z][a-z0-9+.-]*:/i.test(input.parentUri) || /[\s<>"{}|\\^`]/.test(input.parentUri)) {
    throw new Error("The parent is not a valid class IRI.");
  }
  const slug = `${slugify(label)}-${suffix}`;
  const ontologyId = `${KIND_ONTOLOGY_PREFIX}${input.namespaceId}:${slug}`;
  const classUri = `${ontologyId}#${slugify(label).replace(/-/g, "_")}`;
  const lines = [
    "@prefix owl: <http://www.w3.org/2002/07/owl#> .",
    "@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .",
    "",
    `<${ontologyId}> a owl:Ontology ;`,
    `    rdfs:label ${turtleLiteral(`Kind: ${label}`)} .`,
    "",
    `<${classUri}> a owl:Class ;`,
    `    rdfs:label ${turtleLiteral(label)} ;`,
    ...(definition ? [`    rdfs:comment ${turtleLiteral(definition)} ;`] : []),
    `    rdfs:subClassOf <${input.parentUri}> ;`,
    `    rdfs:isDefinedBy <${ontologyId}> .`,
    "",
  ];
  return { ontologyId, classUri, turtle: lines.join("\n"), filename: `${slug}.ttl` };
}
