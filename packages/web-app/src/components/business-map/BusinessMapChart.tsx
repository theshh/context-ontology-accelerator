// SPDX-License-Identifier: Apache-2.0

/**
 * BusinessMapChart — the Business map canvas, drawn with Chart.js and the
 * chartjs-chart-graph controller (same look as the approved mockup).
 *
 * Circles are business things, coloured by the data connection they live in and
 * sized by how many rules use them; lines are relationships with a plain label.
 * Hover traces a circle's direct connections, click selects it, and an optional
 * rule highlight shows only the things that rule reads.
 */
import { useEffect, useMemo, useRef } from "react";
import {
  Chart,
  LinearScale,
  PointElement,
  type ChartDataset,
  type Plugin,
  type ScriptableContext,
} from "chart.js";
import { EdgeLine, GraphController } from "chartjs-chart-graph";
import type { BusinessMapModel } from "./model";
import { layoutBusinessMap, zonesFor } from "./model";

Chart.register(GraphController, EdgeLine, LinearScale, PointElement);

/** One colour per data connection (in order); "Other" is always grey. */
export const CONNECTION_COLOURS = [
  "#0972d3",
  "#7d4de2",
  "#00a1a1",
  "#e07941",
  "#c33d69",
  "#2ea597",
  "#8456ce",
  "#b2911c",
];
const OTHER = "#8d99a8";

export function connectionColour(model: BusinessMapModel, connection: string) {
  if (connection === "Other") return OTHER;
  const i = model.connections.filter((c) => c !== "Other").indexOf(connection);
  return CONNECTION_COLOURS[i % CONNECTION_COLOURS.length];
}

/** The colour mixed with white, kept opaque so lines never show through. */
function pale(hex: string, amount = 0.3): string {
  const n = parseInt(hex.slice(1), 16);
  const m = (c: number) => Math.round(255 - (255 - c) * amount);
  return `rgb(${m(n >> 16)}, ${m((n >> 8) & 255)}, ${m(n & 255)})`;
}

const radius = (rules: number) => 14 + Math.min(rules, 6) * 3.5;

interface Props {
  model: BusinessMapModel;
  selected: string | null;
  highlightRule: string | null;
  onSelect: (id: string) => void;
  height?: number;
}

export function BusinessMapChart({
  model,
  selected,
  highlightRule,
  onSelect,
  height = 600,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);
  // Read live by Chart.js's scriptable options, so hover/selection redraw
  // without rebuilding the chart.
  const state = useRef({ hover: -1, selected, highlightRule, onSelect });
  state.current.selected = selected;
  state.current.highlightRule = highlightRule;
  state.current.onSelect = onSelect;

  const pos = useMemo(() => layoutBusinessMap(model), [model]);
  const idx = useMemo(
    () => Object.fromEntries(model.entities.map((e, i) => [e.id, i])),
    [model],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || model.entities.length === 0) return;
    const E = model.entities;
    const L = model.links;
    const ruleUses = (i: number, rule: string) => E[i].rules.includes(rule);
    // Dimming follows the pointer (or a chosen rule) only; a selected circle is
    // outlined but does not grey out the rest of the map.
    const focus = () => state.current.hover;
    const active = (i: number) => {
      const r = state.current.highlightRule;
      if (r) return ruleUses(i, r);
      const f = focus();
      if (f < 0) return true;
      return (
        i === f ||
        L.some(
          (l) =>
            (idx[l.source] === f && idx[l.target] === i) ||
            (idx[l.target] === f && idx[l.source] === i),
        )
      );
    };
    const edgeOn = (s: number, t: number) => {
      const r = state.current.highlightRule;
      if (r) return ruleUses(s, r) && ruleUses(t, r);
      const f = focus();
      return f >= 0 && (s === f || t === f);
    };
    const edgeEnds = (raw: unknown): [number, number] => {
      const e = (raw ?? {}) as {
        source?: number | { index?: number };
        target?: number | { index?: number };
      };
      const n = (v: number | { index?: number } | undefined) =>
        typeof v === "object" ? (v?.index ?? -1) : (v ?? -1);
      return [n(e.source), n(e.target)];
    };

    const labels: Plugin<"graph"> = {
      id: "businessMapLabels",
      beforeDatasetsDraw(chart) {
        const { ctx } = chart;
        const pts = chart.getDatasetMeta(0).data;
        // One soft zone per data connection, behind its circles, labelled with
        // the connection's name, so "where does this come from" reads at a glance.
        ctx.save();
        const sx = chart.scales.x;
        const sy = chart.scales.y;
        const scale = Math.abs(sx.getPixelForValue(1) - sx.getPixelForValue(0));
        for (const z of zonesFor(model, pos)) {
          const cx = sx.getPixelForValue(z.x);
          const cy = sy.getPixelForValue(z.y);
          const r = z.r * scale;
          const col = connectionColour(model, z.connection);
          ctx.fillStyle = pale(col, 0.07);
          ctx.strokeStyle = pale(col, 0.25);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.font = "700 11px 'Open Sans', 'Helvetica Neue', Arial, sans-serif";
          ctx.textAlign = "center";
          ctx.fillStyle = col;
          ctx.lineWidth = 3;
          ctx.strokeStyle = "#ffffff";
          ctx.strokeText(z.connection.toUpperCase(), cx, cy - r - 7);
          ctx.fillText(z.connection.toUpperCase(), cx, cy - r - 7);
        }
        ctx.restore();
        ctx.save();
        ctx.shadowColor = "rgba(0,7,22,.18)";
        ctx.shadowBlur = 8;
        ctx.shadowOffsetY = 2;
      },
      afterDatasetDraw(chart) {
        chart.ctx.restore();
      },
      afterDatasetsDraw(chart) {
        const { ctx } = chart;
        const pts = chart.getDatasetMeta(0).data;
        ctx.save();
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = "600 12px 'Open Sans', 'Helvetica Neue', Arial, sans-serif";
        for (const l of L) {
          const p = pts[idx[l.source]];
          const q = pts[idx[l.target]];
          if (!p || !q || !l.label) continue;
          const on = edgeOn(idx[l.source], idx[l.target]);
          // Unfocused lines stay unlabelled so labels never pile up; focused
          // ones say how the two things relate.
          if (!on) continue;
          // Too short to hold a pill without covering the circles' names.
          if (Math.hypot(q.x - p.x, q.y - p.y) < 130) continue;
          const x = (p.x + q.x) / 2;
          const y = (p.y + q.y) / 2;
          const w = ctx.measureText(l.label).width + 14;
          ctx.globalAlpha = on ? 1 : 0.6;
          ctx.fillStyle = "#ffffff";
          ctx.strokeStyle = on ? "#0972d3" : "#d5dbe1";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(x - w / 2, y - 10, w, 20, 10);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = on ? "#033160" : "#5f6b7a";
          ctx.fillText(l.label, x, y + 0.5);
        }
        // Names: most-used things first; a name that would overlap one already
        // drawn is skipped. The hovered circle's name always
        // shows, so every name is one hover away.
        const placed: Array<[number, number, number, number]> = [];
        const hit = (b: [number, number, number, number]) =>
          placed.some((q) => b[0] < q[2] && b[2] > q[0] && b[1] < q[3] && b[3] > q[1]);
        const order = E.map((_, i) => i).sort((a, b) => {
          const h = state.current.hover;
          if (a === h) return -1;
          if (b === h) return 1;
          return E[b].rules.length - E[a].rules.length;
        });
        ctx.font = "700 13.5px 'Open Sans', 'Helvetica Neue', Arial, sans-serif";
        for (const i of order) {
          const e = E[i];
          const p = pts[i];
          if (!p) continue;
          const r = radius(e.rules.length);
          const w = ctx.measureText(e.label).width;
          const box: [number, number, number, number] = [p.x - w / 2 - 3, p.y + r + 5, p.x + w / 2 + 3, p.y + r + 23];
          if (i !== state.current.hover && hit(box)) continue;
          placed.push(box);
          ctx.globalAlpha = active(i) ? 1 : 0.4;
          ctx.lineWidth = 4;
          ctx.strokeStyle = "#ffffff";
          ctx.fillStyle = "#000716";
          ctx.strokeText(e.label, p.x, p.y + r + 14);
          ctx.fillText(e.label, p.x, p.y + r + 14);
        }
        ctx.font = "700 12px 'Open Sans', 'Helvetica Neue', Arial, sans-serif";
        E.forEach((e, i) => {
          const p = pts[i];
          if (!p || !e.rules.length) return;
          ctx.globalAlpha = active(i) ? 1 : 0.4;
          ctx.fillStyle = "#ffffff";
          ctx.fillText(String(e.rules.length), p.x, p.y + 0.5);
        });
        ctx.restore();
      },
    };

    const zs = zonesFor(model, pos);
    const minX = Math.min(...zs.map((z) => z.x - z.r)) - 10;
    const maxX = Math.max(...zs.map((z) => z.x + z.r)) + 10;
    const minY = Math.min(...zs.map((z) => z.y - z.r)) - 10;
    const maxY = Math.max(...zs.map((z) => z.y + z.r)) + 10;
    const chart = new Chart(canvas, {
      type: "graph",
      data: {
        labels: E.map((e) => e.label),
        datasets: [
          {
            data: E.map((e) => ({ x: pos[e.id].x, y: pos[e.id].y })),
            edges: L.map((l) => ({ source: idx[l.source], target: idx[l.target] })),
            pointRadius: (c: ScriptableContext<"graph">) => radius(E[c.dataIndex]?.rules.length ?? 0),
            pointHoverRadius: (c: ScriptableContext<"graph">) => radius(E[c.dataIndex]?.rules.length ?? 0) + 3,
            pointBackgroundColor: (c: ScriptableContext<"graph">) => {
              const e = E[c.dataIndex];
              if (!e) return OTHER;
              const col = connectionColour(model, e.connection);
              return active(c.dataIndex) ? col : pale(col);
            },
            pointBorderColor: (c: ScriptableContext<"graph">) =>
              E[c.dataIndex]?.id === state.current.selected &&
              !state.current.highlightRule
                ? "#000716"
                : "#ffffff",
            pointBorderWidth: (c: ScriptableContext<"graph">) =>
              E[c.dataIndex]?.id === state.current.selected ? 3 : 2.5,
            edgeLineBorderColor: (c: ScriptableContext<"graph">) => {
              const [s, t] = edgeEnds(c.raw);
              return edgeOn(s, t) ? "#0972d3" : "#c3cad3";
            },
            edgeLineBorderWidth: (c: ScriptableContext<"graph">) => {
              const [s, t] = edgeEnds(c.raw);
              return edgeOn(s, t) ? 2.5 : 1.5;
            },
            tension: 0,
            // The edge* options are read by chartjs-chart-graph's EdgeLine, which
            // its dataset typings do not declare.
          } as unknown as ChartDataset<"graph", { x: number; y: number }[]>,
        ],
      },
      options: {
        // The data box keeps its own aspect ratio so zones stay circles.
        maintainAspectRatio: true,
        aspectRatio: (maxX - minX) / (maxY - minY),
        animation: { duration: 200 },
        layout: { padding: { top: 30, bottom: 40, left: 30, right: 30 } },
        scales: {
          x: { display: false, min: minX, max: maxX },
          y: { display: false, min: minY, max: maxY },
        },
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        onHover: (ev, els) => {
          const n = els.length ? els[0].index : -1;
          if (n !== state.current.hover) {
            state.current.hover = n;
            chart.update("none");
          }
          const target = ev.native?.target as HTMLElement | undefined;
          if (target) target.style.cursor = els.length ? "pointer" : "default";
        },
        onClick: (_ev, els) => {
          if (els.length) state.current.onSelect(E[els[0].index].id);
        },
      },
      plugins: [labels],
    });
    chartRef.current = chart;
    return () => {
      chart.destroy();
      chartRef.current = null;
    };
  }, [model, pos, idx]);

  // Selection and rule highlight change only colours: redraw in place.
  useEffect(() => {
    chartRef.current?.update("none");
  }, [selected, highlightRule]);

  return (
    <div style={{ position: "relative", maxHeight: height, display: "flex", justifyContent: "center" }}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`Business map: ${model.entities.length} business things and ${model.links.length} relationships`}
      />
    </div>
  );
}
