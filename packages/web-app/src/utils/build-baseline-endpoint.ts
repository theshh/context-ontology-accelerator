// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/** Build the baseline ("without COA") agent's AgentCore /invocations URL.
 *
 * Same shape and checks as {@link buildQueryEndpoint}: returns undefined when
 * the ARN is missing or the region does not look like an AWS region (prevents
 * URL injection via a tampered runtime-config.json).
 */
export function buildBaselineEndpoint(
  ctx: { region: string; baselineRuntimeArn?: string } | undefined,
): string | undefined {
  if (!ctx?.baselineRuntimeArn) return undefined;
  if (!/^[a-z]{2}-[a-z]+-\d+$/.test(ctx.region)) return undefined;
  const encoded = encodeURIComponent(ctx.baselineRuntimeArn);
  return `https://bedrock-agentcore.${ctx.region}.amazonaws.com/runtimes/${encoded}/invocations?qualifier=DEFAULT`;
}
