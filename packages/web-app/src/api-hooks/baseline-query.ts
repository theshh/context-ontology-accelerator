// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Client for the baseline ("without COA") agent: one JSON POST to its
 * AgentCore /invocations endpoint with the user's ID token. The agent replays
 * the token to the COA API, so it can only read context graphs the user can.
 */
import { OIDCProvider } from "@auth";

export interface BaselineResult {
  answer?: string;
  sql?: string;
  assumptions?: string;
  columns?: string[];
  rows?: (string | null)[][];
  model?: string;
  databases?: string[];
  /** Names of the skill files the agent was given for this graph. */
  skills?: string[];
  elapsedMs?: number;
  error?: string;
  message?: string;
  requestId?: string;
}

export async function askBaseline(
  endpoint: string,
  oidcConfig: { authority: string; clientId: string },
  namespace: string,
  query: string,
  signal?: AbortSignal,
): Promise<BaselineResult> {
  const provider = OIDCProvider.build(oidcConfig);
  const token = await provider.getIdToken();
  if (!token)
    return { error: "AccessDenied", message: "Please sign in again." };
  // A fresh session per question: the agent keeps no state, and a sticky
  // session would keep routing to an old container after a redeploy.
  // AgentCore requires at least 33 characters.
  const sessionId = `baseline-${crypto.randomUUID()}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Amzn-Bedrock-AgentCore-Runtime-Session-Id": sessionId,
    },
    body: JSON.stringify({ namespace, query }),
    signal,
  });
  if (!response.ok) {
    return {
      error: `HTTP ${response.status}`,
      message: "The baseline agent did not answer.",
    };
  }
  return (await response.json()) as BaselineResult;
}
