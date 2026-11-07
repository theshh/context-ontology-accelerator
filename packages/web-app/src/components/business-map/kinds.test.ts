// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { buildKindOntology, KIND_ONTOLOGY_PREFIX, slugify, turtleLiteral } from "./kinds";

const PARENT = "http://coa.amazon.com/namespace/ns-1/ontology/induced#Separation";

describe("buildKindOntology", () => {
  it("makes one sub-class of the parent, with label and definition", () => {
    const k = buildKindOntology(
      { namespaceId: "ns-1", parentUri: PARENT, label: "Resignation", definition: "Leaving where the reason is RSN" },
      "abc",
    );
    expect(k.ontologyId).toBe(`${KIND_ONTOLOGY_PREFIX}ns-1:resignation-abc`);
    expect(k.classUri).toBe(`${k.ontologyId}#resignation`);
    expect(k.filename).toBe("resignation-abc.ttl");
    expect(k.turtle).toContain(`<${k.classUri}> a owl:Class ;`);
    expect(k.turtle).toContain(`rdfs:subClassOf <${PARENT}>`);
    expect(k.turtle).toContain('rdfs:label "Resignation"');
    expect(k.turtle).toContain('rdfs:comment "Leaving where the reason is RSN"');
  });

  it("escapes user text so it cannot break out of the literal", () => {
    expect(turtleLiteral('say "hi"\n\\ok')).toBe('"say \\"hi\\"\\n\\\\ok"');
    const k = buildKindOntology(
      { namespaceId: "ns-1", parentUri: PARENT, label: 'Odd "name"', definition: "line1\n> <evil> ." },
      "x",
    );
    expect(k.turtle).toContain('rdfs:label "Odd \\"name\\""');
    expect(k.turtle).toContain('rdfs:comment "line1\\n> <evil> ."');
  });

  it("refuses an empty name or an unsafe parent IRI", () => {
    expect(() => buildKindOntology({ namespaceId: "n", parentUri: PARENT, label: " ", definition: "" })).toThrow();
    expect(() =>
      buildKindOntology({ namespaceId: "n", parentUri: "http://x> <y", label: "A", definition: "" }),
    ).toThrow();
  });

  it("slugs names safely", () => {
    expect(slugify("Transfer out (TRO)")).toBe("transfer-out-tro");
    expect(slugify("???")).toBe("kind");
  });
});
