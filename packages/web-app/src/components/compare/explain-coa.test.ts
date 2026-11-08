// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import type { QueryResult } from "@app-types";
import {
  coaAnswerText,
  explainCoa,
  firstSentence,
  graphLinks,
} from "./explain-coa";

const NS = "http://coa.amazon.com/namespace/n/ontology/induced#";

// Shapes taken from a live MPI Workforce answer ("vacancy rate on 1 Oct 2026").
const vacancy: QueryResult = {
  tier: 2,
  confidence: { score: 0.8, rationale: "" },
  partial: false,
  resultRows: [{ value: "12.7%" }],
  queryUsed: "SELECT ...",
  metadata: {
    retrieved_tables: [
      "dim_agency",
      "establishment_position",
      "employment",
      "officer",
    ],
    expanded_tables: [
      "dim_agency",
      "establishment_position",
      "employment",
      "officer",
      "dim_grade",
    ],
  },
  trace: [
    {
      step: "t1.metric_match",
      status: "success",
      durationMs: 5,
      detail: {
        metricName: "vacancy_rate",
        matchSource: "name",
        matchedText: "vacancy rate",
      },
    },
    {
      step: "t2.sql.generate",
      status: "success",
      durationMs: 4000,
      detail: { tables: ["employment", "establishment_position"] },
    },
    {
      step: "t2.sql.authorize",
      status: "success",
      durationMs: 50,
      detail: { principal: "satheshn@amazon.com", decision: "allow" },
    },
    {
      step: "t2.sql.firewall",
      status: "success",
      durationMs: 5,
      detail: { decision: "authorized" },
    },
    {
      step: "t2.sql.execute",
      status: "success",
      durationMs: 2000,
      detail: {
        rowCount: 1,
        tables: ["employment", "establishment_position"],
        engine: "athena",
      },
    },
  ],
};

const rules = {
  vacancy_rate: {
    label: "Vacancy rate",
    description: "Funded posts with no active employment / funded posts.",
    unit: "ratio",
  },
};

const overview = {
  classes: [
    { uri: `${NS}employment`, label: "employment" },
    { uri: `${NS}establishment_position`, label: "establishment_position" },
    { uri: `${NS}officer`, label: "officer" },
  ],
  objectProperties: [
    {
      uri: `${NS}position_id`,
      label: "position_id",
      domain: `${NS}employment`,
      range: `${NS}establishment_position`,
    },
    {
      uri: `${NS}officer_id`,
      label: "officer_id",
      domain: `${NS}employment`,
      range: `${NS}officer`,
    },
  ],
};

describe("explainCoa", () => {
  const links = graphLinks(overview);

  it("reads relationships between tables from the ontology", () => {
    expect(links).toEqual([
      { from: "employment", to: "establishment_position", label: "position" },
      { from: "employment", to: "officer", label: "officer" },
    ]);
  });

  it("explains rule match, graph things, path, access and the query", () => {
    const steps = explainCoa(vacancy, rules, links);
    expect(steps.map((s) => s.title)).toEqual([
      "Matched a governed rule",
      "Found the business things in the context graph",
      "Followed the relationships",
      "Checked access",
      "Ran the query",
    ]);
    expect(steps[0]!.text).toBe(
      "“vacancy rate” → Vacancy rate. Funded posts with no active employment / funded posts.",
    );
    expect(steps[1]!.things).toEqual(["Employment", "Establishment position"]);
    expect(steps[1]!.text).toBe(
      "Also looked at 3 related things and left them out.",
    );
    // Only the link between the two tables actually used.
    expect(steps[2]!.links).toEqual([
      "Employment → position → Establishment position",
    ]);
    expect(steps[3]!.text).toBe(
      "Access for satheshn@amazon.com: allowed; SQL firewall authorized.",
    );
    expect(steps[4]!.text).toBe(
      "Wrote SQL from the rule's definition and the things above, ran it on Amazon Athena and got 1 row.",
    );
  });

  it("says when the rule was reached through a synonym", () => {
    const viaSynonym: QueryResult = {
      ...vacancy,
      trace: [
        {
          step: "t1.metric_match",
          status: "success",
          durationMs: 1,
          detail: {
            metricName: "vacancy_rate",
            matchSource: "synonym",
            matchedText: "open posts",
          },
        },
      ],
    };
    expect(explainCoa(viaSynonym, rules, [])[0]!.text).toContain(
      "“open posts” (a synonym) → Vacancy rate.",
    );
  });

  it("lists cited documents for a document answer", () => {
    const doc: QueryResult = {
      tier: 3,
      confidence: { score: 0.7, rationale: "" },
      partial: false,
      trace: [],
      synthesizedAnswer: "64 from 1 Jul 2026.",
      supportingContent: [
        { sourceDocumentName: "MPI-HR-Circular-07-2026.pdf" },
        { sourceDocumentName: "MPI-HR-Circular-07-2026.pdf" },
      ],
    };
    expect(explainCoa(doc, rules, [])).toEqual([
      {
        title: "Read the policy documents",
        documents: ["MPI-HR-Circular-07-2026.pdf"],
      },
    ]);
  });
});

describe("coaAnswerText", () => {
  it("names the rule with its value", () => {
    expect(coaAnswerText(vacancy, vacancy.resultRows, rules)).toBe(
      "Vacancy rate: 12.7%",
    );
  });

  it("prefers COA's own sentence", () => {
    expect(
      coaAnswerText(
        { ...vacancy, synthesizedAnswer: "It was 12.7%." },
        vacancy.resultRows,
        rules,
      ),
    ).toBe("It was 12.7%.");
  });
});

describe("firstSentence", () => {
  it("keeps a long rule definition to its first sentence", () => {
    expect(
      firstSentence(
        "Distinct officers with an active employment on as_of_date (start_date on or before the date, end_date null or on/after it), excluding Temporary staff (employment_type 'T'). Counts Permanent, Contract and Re-employed officers.",
      ),
    ).toBe(
      "Distinct officers with an active employment on as_of_date, excluding Temporary staff.",
    );
    expect(
      firstSentence(
        "Share of funded posts that are empty. Expired posts are not vacancies.",
      ),
    ).toBe("Share of funded posts that are empty.");
    expect(firstSentence(undefined)).toBe("");
  });
});
