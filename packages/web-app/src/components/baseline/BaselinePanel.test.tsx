// SPDX-License-Identifier: Apache-2.0
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BaselinePanel } from "./BaselinePanel";

describe("BaselinePanel", () => {
  it("explains what the baseline sees before any question", () => {
    render(<BaselinePanel turns={[]} />);
    expect(screen.getByText("Without context")).toBeInTheDocument();
    expect(screen.getByText(/raw table and column names/)).toBeInTheDocument();
  });

  it("shows a loading card, then the answer, SQL and timing", () => {
    const { rerender } = render(
      <BaselinePanel
        turns={[{ id: "1", question: "How many officers?", status: "loading" }]}
      />,
    );
    expect(
      screen.getByText("Writing SQL from the raw schema"),
    ).toBeInTheDocument();
    rerender(
      <BaselinePanel
        turns={[
          {
            id: "1",
            question: "How many officers?",
            status: "done",
            result: {
              answer: "There are 2,112 officers.",
              sql: "SELECT count(*) FROM mpi_hrms.officer",
              assumptions: "Every row is an officer.",
              columns: ["n"],
              rows: [["2112"]],
              elapsedMs: 4200,
            },
          },
        ]}
      />,
    );
    expect(screen.getByText("There are 2,112 officers.")).toBeInTheDocument();
    expect(
      screen.getByText("Assumed: Every row is an officer."),
    ).toBeInTheDocument();
    expect(screen.getByText("SQL it wrote")).toBeInTheDocument();
    expect(screen.getByText("4.2 s")).toBeInTheDocument();
  });

  it("shows the agent's error message", () => {
    render(
      <BaselinePanel
        turns={[
          {
            id: "1",
            question: "q",
            status: "done",
            result: {
              error: "AccessDenied",
              message: "Not allowed to query this context graph",
            },
          },
        ]}
      />,
    );
    expect(
      screen.getByText("Not allowed to query this context graph"),
    ).toBeInTheDocument();
  });
});
