// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import {
  buildBusinessMap,
  humanize,
  layoutBusinessMap,
  relationshipLabel,
  tablesUsedBy,
} from "./model";

const NS = "http://coa.amazon.com/namespace/ns/ontology/induced#";

describe("labels", () => {
  it("turns table names into business words", () => {
    expect(humanize("dim_agency")).toBe("Agency");
    expect(humanize("establishment_position")).toBe("Establishment position");
    expect(humanize("psd_overall_staff_strength")).toBe("PSD overall staff strength");
    expect(humanize("ReemploymentAssessment")).toBe("Reemployment assessment");
    expect(humanize("mpi_hrms")).toBe("MPI HRMS");
  });

  it("drops the key suffix from a relationship", () => {
    expect(relationshipLabel({ uri: `${NS}officer_id`, label: "officer_id" })).toBe("officer");
    expect(relationshipLabel({ uri: `${NS}parent_ministry_code` })).toBe("parent ministry");
  });
});

describe("rules", () => {
  it("finds the tables a rule's SQL reads, qualified or bare", () => {
    const known = ["employment", "officer", "dim_grade", "separation"];
    expect(
      tablesUsedBy(
        {
          name: "women",
          sourceTable: "employment",
          sql: "SELECT … FROM mpi_hrms.employment e JOIN mpi_reference.dim_grade g … JOIN mpi_hrms.officer o",
        },
        known,
      ).sort(),
    ).toEqual(["dim_grade", "employment", "officer"]);
    // A column called officer_id is not the officer table.
    expect(tablesUsedBy({ name: "x", sql: "WHERE officer_id = 1" }, known)).toEqual([]);
  });
});

describe("buildBusinessMap", () => {
  const classes = [
    { uri: `${NS}officer`, label: "officer", comment: "officer" },
    { uri: `${NS}employment`, label: "employment", comment: "One period of employment" },
    { uri: `${NS}dim_agency`, label: "dim_agency" },
    { uri: `${NS}officer`, label: "officer" }, // duplicate across ontologies
  ];
  const model = buildBusinessMap(
    classes,
    [
      { uri: `${NS}officer_id`, label: "officer_id", domain: `${NS}Employment`, range: `${NS}Officer` },
      { uri: `${NS}officer_id2`, label: "officer_id", domain: `${NS}Officer`, range: `${NS}Employment` },
      { uri: `${NS}agency_code`, label: "agency_code", domain: `${NS}Employment`, range: `${NS}DimAgency` },
      { uri: `${NS}orphan`, label: "x_id", domain: `${NS}Missing`, range: `${NS}Officer` },
    ],
    [
      { uri: `${NS}gender`, domain: `${NS}Officer` },
      { uri: `${NS}dob`, domain: `${NS}officer` },
    ],
    [{ name: "headcount", sourceTable: "employment", sql: "FROM mpi_hrms.employment e" }],
    { officer: "HR system", employment: "HR system", dim_agency: "Reference" },
  );

  it("makes one entity per class, with business labels and connections", () => {
    expect(model.entities.map((e) => e.label)).toEqual(["Officer", "Employment", "Agency"]);
    expect(model.entities.find((e) => e.id === "dim_agency")?.connection).toBe("Reference");
    expect(model.connections).toEqual(["HR system", "Reference"]);
  });

  it("resolves CamelCase relationship IRIs and drops duplicates and unknowns", () => {
    expect(model.links).toEqual([
      { source: "employment", target: "officer", label: "officer" },
      { source: "employment", target: "dim_agency", label: "agency" },
    ]);
  });

  it("hides comments that only restate the table name, counts attributes, maps rules", () => {
    const officer = model.entities.find((e) => e.id === "officer")!;
    expect(officer.description).toBe("");
    expect(officer.attributeCount).toBe(2);
    expect(model.entities.find((e) => e.id === "employment")?.rules).toEqual(["headcount"]);
  });

  it("lays every entity out at a finite, distinct position", () => {
    const pos = layoutBusinessMap(model);
    const pts = Object.values(pos);
    expect(pts).toHaveLength(3);
    pts.forEach((p) => expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true));
    expect(new Set(pts.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`)).size).toBe(3);
  });
});

describe("groupLookAlikes", () => {
  it("folds leaf tables with the same connection and links into one circle", () => {
    const cls = ["dim_grade", "psd_by_age", "psd_by_gender", "psd_by_tenure", "officer"].map((t) => ({ uri: `${NS}${t}`, label: t }));
    const rel = (d: string, r: string, l: string) => ({ uri: `${NS}${d}_${l}`, label: l, domain: `${NS}${d}`, range: `${NS}${r}` });
    const model = buildBusinessMap(
      cls,
      [rel("psd_by_age", "dim_grade", "executive_level"), rel("psd_by_gender", "dim_grade", "executive_level"), rel("psd_by_tenure", "dim_grade", "executive_level"), rel("officer", "dim_grade", "grade_code")],
      [],
      [],
      { psd_by_age: "PSD open", psd_by_gender: "PSD open", psd_by_tenure: "PSD open", dim_grade: "Reference", officer: "HR" },
    );
    const group = model.entities.find((e) => e.id === "group:PSD open")!;
    expect(group.label).toBe("PSD open (3 datasets)");
    expect(group.members).toEqual(["PSD by age", "PSD by gender", "PSD by tenure"]);
    expect(model.entities.map((e) => e.id)).not.toContain("psd_by_age");
    expect(model.links).toContainEqual({ source: "group:PSD open", target: "dim_grade", label: "executive level" });
    expect(model.links.filter((l) => l.source === "group:PSD open")).toHaveLength(1);
    // A lone table with its own link is left alone.
    expect(model.entities.map((e) => e.id)).toContain("officer");
  });
});
