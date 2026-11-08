// SPDX-License-Identifier: Apache-2.0

/**
 * Show a governed rule's single-value answer in its unit: a ratio rule's
 * 0.12663 becomes "12.7%". Only touches the shape a rule answer has (one row,
 * one column) and only when the trace names the rule that matched and that
 * rule's unit is a ratio. Values outside -1..1 are left alone, so an answer
 * that is already a percentage is never multiplied again.
 */

interface TraceStep {
  step?: string;
  detail?: unknown;
}

const RATIO_UNITS = new Set(["ratio", "fraction", "proportion", "share"]);

export function matchedMetricName(
  trace: readonly TraceStep[] | undefined,
): string | undefined {
  const step = (trace ?? []).find((t) => t.step === "t1.metric_match");
  const detail = step?.detail as { metricName?: unknown } | undefined;
  return typeof detail?.metricName === "string" ? detail.metricName : undefined;
}

export function formatMetricRows(
  rows: Record<string, unknown>[] | undefined,
  trace: readonly TraceStep[] | undefined,
  unitByMetric: Readonly<Record<string, string | undefined>>,
): Record<string, unknown>[] | undefined {
  if (!rows || rows.length !== 1) return rows;
  const keys = Object.keys(rows[0] ?? {});
  if (keys.length !== 1) return rows;
  const name = matchedMetricName(trace);
  const unit = name ? unitByMetric[name]?.toLowerCase() : undefined;
  if (!unit || !RATIO_UNITS.has(unit)) return rows;
  const key = keys[0]!;
  const value = Number(rows[0]![key]);
  if (!Number.isFinite(value) || Math.abs(value) > 1) return rows;
  return [{ [key]: `${(value * 100).toFixed(1)}%` }];
}
