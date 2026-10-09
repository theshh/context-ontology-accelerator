// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { resolveContextGraphTab } from "./index";

describe("resolveContextGraphTab", () => {
  it.each([
    ["", { tab: "overview" }],
    ["/sources", { tab: "overview" }],
    ["/sources/src-1/tables/t1", { tab: "overview" }],
    ["/ontology", { tab: "curation", sub: "induction" }],
    ["/ontology/proposals/p1", { tab: "curation", sub: "induction" }],
    ["/ontologies", { tab: "curation", sub: "ontologies" }],
    ["/ontology/induced", { tab: "curation", sub: "ontologies" }],
    ["/ontology/induced/class", { tab: "curation", sub: "ontologies" }],
    ["/metrics", { tab: "curation", sub: "metrics" }],
    ["/metrics/m1/edit", { tab: "curation", sub: "metrics" }],
    ["/ontology/graph", { tab: "explorer" }],
    ["/settings", { tab: "settings" }],
    ["/permissions", { tab: "settings" }],
  ])("maps %s", (rest, expected) => {
    expect(resolveContextGraphTab(rest)).toEqual(expected);
  });
});
