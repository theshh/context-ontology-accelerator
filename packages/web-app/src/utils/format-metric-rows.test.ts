// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { formatMetricRows, matchedMetricName } from "./format-metric-rows";

const trace = [
  { step: "t1.metric_match", detail: { metricName: "vacancy_rate" } },
];
const units = { vacancy_rate: "ratio", headcount: "count" };

describe("formatMetricRows", () => {
  it("shows a ratio rule's value as a percentage", () => {
    expect(
      formatMetricRows([{ value: "0.12663755458515283" }], trace, units),
    ).toEqual([{ value: "12.7%" }]);
  });

  it("leaves counts alone", () => {
    const t = [
      { step: "t1.metric_match", detail: { metricName: "headcount" } },
    ];
    expect(formatMetricRows([{ value: "1963" }], t, units)).toEqual([
      { value: "1963" },
    ]);
  });

  it("never re-scales a value that is already a percentage", () => {
    expect(formatMetricRows([{ value: "12.66" }], trace, units)).toEqual([
      { value: "12.66" },
    ]);
  });

  it("leaves multi-row, multi-column and unmatched answers alone", () => {
    const two = [{ value: "0.1" }, { value: "0.2" }];
    expect(formatMetricRows(two, trace, units)).toBe(two);
    const wide = [{ a: "0.1", b: "0.2" }];
    expect(formatMetricRows(wide, trace, units)).toBe(wide);
    const one = [{ value: "0.1" }];
    expect(formatMetricRows(one, [], units)).toBe(one);
    expect(formatMetricRows(undefined, trace, units)).toBeUndefined();
  });

  it("reads the matched rule from the trace", () => {
    expect(matchedMetricName(trace)).toBe("vacancy_rate");
    expect(matchedMetricName([{ step: "t2.sql.generate" }])).toBeUndefined();
  });
});
