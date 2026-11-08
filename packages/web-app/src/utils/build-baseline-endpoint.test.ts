// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { buildBaselineEndpoint } from "./build-baseline-endpoint";

const arn =
  "arn:aws:bedrock-agentcore:ap-southeast-1:123456789012:runtime/coa_dev_baseline_agent-abc";

describe("buildBaselineEndpoint", () => {
  it("builds the invocations URL from the ARN and region", () => {
    expect(
      buildBaselineEndpoint({
        region: "ap-southeast-1",
        baselineRuntimeArn: arn,
      }),
    ).toBe(
      `https://bedrock-agentcore.ap-southeast-1.amazonaws.com/runtimes/${encodeURIComponent(arn)}/invocations?qualifier=DEFAULT`,
    );
  });

  it("is undefined when the baseline is not deployed", () => {
    expect(buildBaselineEndpoint({ region: "ap-southeast-1" })).toBeUndefined();
    expect(buildBaselineEndpoint(undefined)).toBeUndefined();
  });

  it("refuses a region that could inject a different host", () => {
    expect(
      buildBaselineEndpoint({
        region: "evil.example.com/x",
        baselineRuntimeArn: arn,
      }),
    ).toBeUndefined();
  });
});
