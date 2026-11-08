// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useParams } from "react-router-dom";
import { useBreadcrumbTrail } from "@api-hooks/use-breadcrumb-trail";
import { useInView } from "react-intersection-observer";
import {
  Box,
  Button,
  Flashbar,
  Header,
  SegmentedControl,
  SpaceBetween,
  StatusIndicator,
  Toggle,
} from "@cloudscape-design/components";
import { RuntimeConfigContext } from "@components/RuntimeContext";
import { useCurrentNamespace } from "@components/NamespaceProvider";
import { useSplitPanel } from "@components/SplitPanelProvider";
import { useToolsPanel } from "@components/ToolsPanelProvider";
import {
  ChatContainer,
  ChatMessage,
  ChatErrorBoundary,
  SamplePrompts,
} from "@components/Chat";
import { RationalePanel } from "@components/Chat/RationalePanel";
import { usePlaygroundChatSSE } from "@api-hooks/use-playground-chat-sse";
import { useExampleQuestions } from "@api-hooks/use-example-questions";
import type { ChatMessage as ChatMessageType, ExecutionMode } from "@app-types";
import { HomeHelpPanel } from "./HomeHelpPanel";
import { ONBOARDING_ICON } from "@constants/drawer-icons";
import { scrollToBottom } from "@utils/scroll";

import { buildQueryEndpoint } from "@utils/build-query-endpoint";
import { buildBaselineEndpoint } from "@utils/build-baseline-endpoint";
import { askBaseline } from "@api-hooks/baseline-query";
import { useListMetrics } from "@api-hooks/use-metrics";
import { formatMetricRows } from "@utils/format-metric-rows";
import type { BaselineTurn } from "@components/baseline/BaselinePanel";
import { CompareList, type CompareTurn } from "@components/compare/CompareList";
import { graphLinks, type RuleInfo } from "@components/compare/explain-coa";
import { useOntologyOverview } from "@api-hooks/use-ontology-overview";
import { useAppI18n } from "../i18n/LocaleProvider";

/**
 * The execution-mode toggle's options, typed by `ExecutionMode` so the ids sent
 * as `options.mode` and the labels shown to the user stay in one place.
 * `deep-reasoning` was previously labelled "Agentic"; serve still accepts the old
 * wire value, but the UI only ever sends the current one.
 */
export const Playground: React.FC = () => {
  const { t } = useAppI18n();
  const executionModeOptions: readonly {
    id: ExecutionMode;
    text: string;
  }[] = [
    { id: "standard", text: t("Standard") },
    { id: "deep-reasoning", text: t("Deep Reasoning") },
  ];
  const runtimeContext = useContext(RuntimeConfigContext);
  const { namespaceId: urlNamespaceId } = useParams<{ namespaceId: string }>();
  const { namespaceId: providerNamespaceId } = useCurrentNamespace();

  const namespaceId =
    providerNamespaceId ||
    urlNamespaceId ||
    (import.meta.env.DEV ? "demo" : "");

  useBreadcrumbTrail([{ text: t("Serve") }, { text: t("Playground") }]);

  const [inputValue, setInputValue] = useState("");
  // Sent as options.mode on every query. Defaults to "standard" to match serve's
  // deployment default; deep reasoning (~140s p50 vs ~30s) is opt-in via the toggle.
  const [mode, setMode] = useState<ExecutionMode>("standard");
  const [selectedMessage, setSelectedMessage] = useState<
    ChatMessageType | undefined
  >();

  const { openPanel, closePanel } = useSplitPanel();
  const { registerDrawer, unregisterDrawer } = useToolsPanel();

  const {
    state,
    sessionId,
    isRestoring,
    showRestoreSpinner: _showRestoreSpinner,
    restoreTimedOut,
    dismissRestoreWarning,
    isStreaming,
    sendQuery,
    newChat,
    retryQuery,
    hasMoreHistory,
    isLoadingOlderHistory,
    requestOlderHistory,
  } = usePlaygroundChatSSE({
    queryEndpoint: buildQueryEndpoint(runtimeContext),
    oidcConfig: runtimeContext?.oidcConfig,
    namespaceId,
  });

  const exampleQuestions = useExampleQuestions(namespaceId);

  // Rule (metric) units, so a ratio rule's answer shows as a percentage.
  const metrics = useListMetrics(namespaceId, 100);
  const unitByMetric = useMemo(
    () =>
      Object.fromEntries(
        (metrics.data?.pages ?? [])
          .flatMap((p) => p.metrics ?? [])
          .filter((m) => m.name)
          .map((m) => [m.name as string, m.unit]),
      ),
    [metrics.data],
  );
  const rules = useMemo<Record<string, RuleInfo>>(
    () =>
      Object.fromEntries(
        (metrics.data?.pages ?? [])
          .flatMap((p) => p.metrics ?? [])
          .filter((m) => m.name)
          .map((m) => [
            m.name as string,
            { label: m.label, description: m.description, unit: m.unit },
          ]),
      ),
    [metrics.data],
  );

  // Compare view: each question also goes to the baseline ("without COA")
  // agent, shown in a column beside the chat. Offered only when deployed.
  const baselineEndpoint = buildBaselineEndpoint(runtimeContext);
  const [compare, setCompare] = useState(false);
  const [baselineTurns, setBaselineTurns] = useState<BaselineTurn[]>([]);
  const askWithoutCoa = useCallback(
    (question: string) => {
      if (!compare || !baselineEndpoint || !runtimeContext?.oidcConfig) return;
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setBaselineTurns((prev) => [
        ...prev,
        { id, question, status: "loading" },
      ]);
      const finish = (result: BaselineTurn["result"]) =>
        setBaselineTurns((prev) =>
          prev.map((turn) =>
            turn.id === id ? { ...turn, status: "done", result } : turn,
          ),
        );
      askBaseline(
        baselineEndpoint,
        runtimeContext.oidcConfig,
        namespaceId,
        question,
      )
        .then(finish)
        .catch(() =>
          finish({
            error: "NetworkError",
            message: "The baseline agent did not answer.",
          }),
        );
    },
    [compare, baselineEndpoint, runtimeContext?.oidcConfig, namespaceId],
  );

  // Auto-load older history when sentinel scrolls into view.
  // onChange fires only on visibility TRANSITIONS (not while staying visible),
  // which prevents the re-trigger loop after prepend.
  const { ref: loadMoreRef } = useInView({
    threshold: 0,
    onChange: (visible) => {
      if (visible && hasMoreHistory && !isLoadingOlderHistory) {
        requestOlderHistory();
      }
    },
  });

  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Relationships between business things, to explain how COA used the graph.
  // The induced ontology's id is fixed per context graph.
  const overview = useOntologyOverview(
    compare ? namespaceId : undefined,
    namespaceId
      ? `http://coa.amazon.com/namespace/${namespaceId}/ontology/induced#`
      : undefined,
  );
  const links = useMemo(() => graphLinks(overview.data), [overview.data]);

  // Pair each "without COA" question with COA's answer to the same question,
  // in order, so the two cards sit side by side.
  const compareTurns = useMemo<CompareTurn[]>(() => {
    const users = state.messages.filter((m) => m.role === "user");
    let from = 0;
    return baselineTurns.map((turn) => {
      const idx = users.findIndex(
        (u, k) => k >= from && u.content.trim() === turn.question.trim(),
      );
      const user = idx >= 0 ? users[idx] : undefined;
      if (idx >= 0) from = idx + 1;
      const coa = user
        ? state.messages.find((m) => m.replyToId === user.id)
        : undefined;
      return {
        id: turn.id,
        question: turn.question,
        baseline: { status: turn.status, result: turn.result },
        coa,
      };
    });
  }, [baselineTurns, state.messages]);

  const handleSubmit = () => {
    const query = inputValue.trim();
    if (!query || !namespaceId) return;
    sendQuery(query, mode);
    askWithoutCoa(query);
    setInputValue("");
    // Scroll to bottom after sending a query (user expects to see their message)
    requestAnimationFrame(() => {
      scrollToBottom(chatScrollRef.current);
    });
  };

  const handleSamplePrompt = useCallback(
    (question: string) => {
      if (!namespaceId) return;
      sendQuery(question, mode);
      askWithoutCoa(question);
      setInputValue("");
    },
    [namespaceId, sendQuery, mode, askWithoutCoa],
  );

  const findUserQuery = useCallback(
    (msg: ChatMessageType): string | undefined => {
      if (!msg.replyToId) return undefined;
      const userMsg = state.messages.find((m) => m.id === msg.replyToId);
      return userMsg?.content;
    },
    [state.messages],
  );

  const handleRationaleClick = useCallback(
    (msg: ChatMessageType) => {
      setSelectedMessage(msg);
      const query = findUserQuery(msg);
      openPanel(
        t("Rationale"),
        <RationalePanel
          message={msg}
          sessionId={sessionId}
          userQuery={query}
        />,
      );
    },
    [openPanel, sessionId, findUserQuery, t],
  );

  // Update the split panel content when the selected message's response arrives
  const selectedMessageId = selectedMessage?.id;
  useEffect(() => {
    if (!selectedMessageId) return;
    const updated = state.messages.find((m) => m.id === selectedMessageId);
    if (updated && updated.response && updated !== selectedMessage) {
      setSelectedMessage(updated);
      const query = findUserQuery(updated);
      openPanel(
        t("Rationale"),
        <RationalePanel
          message={updated}
          sessionId={sessionId}
          userQuery={query}
        />,
      );
    }
  }, [
    state.messages,
    selectedMessageId,
    selectedMessage,
    openPanel,
    sessionId,
    findUserQuery,
    t,
  ]);

  // Register the onboarding drawer on the Playground page
  useEffect(() => {
    registerDrawer({
      id: "onboarding",
      content: <HomeHelpPanel />,
      trigger: {
        iconSvg: ONBOARDING_ICON,
      },
      ariaLabels: {
        drawerName: t("Get started"),
        closeButton: t("Close Get started"),
      },
    });
    return () => {
      closePanel();
      unregisterDrawer("onboarding");
    };
  }, [registerDrawer, unregisterDrawer, closePanel, t]);

  const isReady = !isRestoring && !isStreaming && !!namespaceId;
  const canSubmit = isReady && inputValue.trim().length > 0 && !!namespaceId;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "calc(100vh - 120px)",
        overflow: "hidden",
      }}
    >
      <Header
        variant="h1"
        actions={
          <SpaceBetween direction="horizontal" size="xs" alignItems="center">
            {baselineEndpoint && (
              <Toggle
                checked={compare}
                onChange={({ detail }) => setCompare(detail.checked)}
              >
                Compare without COA
              </Toggle>
            )}
            <SegmentedControl
              selectedId={mode}
              onChange={({ detail }) => {
                // Resolve against the typed option list rather than comparing
                // string literals, so an id and the state setter cannot drift
                // apart — a mismatch is a compile error, not a dead toggle.
                const picked = executionModeOptions.find(
                  (o) => o.id === detail.selectedId,
                );
                if (picked) setMode(picked.id);
              }}
              label={t("Execution mode")}
              options={executionModeOptions}
            />
            <Button
              variant="normal"
              onClick={() => {
                newChat();
                setBaselineTurns([]);
              }}
              disabled={
                state.messages.length === 0 && baselineTurns.length === 0
              }
            >
              {t("New chat")}
            </Button>
          </SpaceBetween>
        }
      >
        {t("Playground")}
      </Header>

      {!runtimeContext?.serveRuntimeArn && (
        <StatusIndicator type="warning">
          {t(
            "Query endpoint not configured. Add serveRuntimeArn to runtime-config.json.",
          )}
        </StatusIndicator>
      )}
      {!namespaceId && (
        <StatusIndicator type="warning">
          {t("No namespace selected. Choose one from the top navigation.")}
        </StatusIndicator>
      )}

      <div
        style={{
          flex: 1,
          display: "flex",
          gap: 16,
          marginTop: "16px",
          minHeight: 0,
        }}
      >
        <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
          <div
            style={{
              position: "absolute",
              inset: 0,
            }}
          >
            {restoreTimedOut && (
              <Flashbar
                items={[
                  {
                    type: "warning",
                    content: t("Previous session history may not have loaded"),
                    dismissible: true,
                    onDismiss: dismissRestoreWarning,
                    id: "restore-timeout-warning",
                  },
                ]}
              />
            )}
            <ChatContainer
              isEmpty={
                state.messages.length === 0 && isReady && !hasMoreHistory
              }
              inputValue={inputValue}
              onInputChange={setInputValue}
              onSubmit={handleSubmit}
              inputDisabled={!isReady || !namespaceId}
              submitDisabled={!canSubmit}
              emptyStateContent={
                <SamplePrompts
                  questions={exampleQuestions}
                  onSelect={handleSamplePrompt}
                  disabled={!isReady || !namespaceId}
                />
              }
            >
              {!isReady && !isStreaming && state.messages.length === 0 && (
                <Box textAlign="center" padding="l">
                  <StatusIndicator type="loading">
                    {!namespaceId ? t("Connecting") : t("Restoring session")}
                  </StatusIndicator>
                </Box>
              )}
              {hasMoreHistory && !isRestoring && (
                <div ref={loadMoreRef}>
                  <Box
                    textAlign="center"
                    padding={{ vertical: "xs" }}
                    color="text-body-secondary"
                    fontSize="body-s"
                  >
                    {isLoadingOlderHistory ? (
                      <StatusIndicator type="loading">
                        {t("Loading earlier messages")}
                      </StatusIndicator>
                    ) : (
                      <Button
                        iconName="angle-up"
                        variant="normal"
                        onClick={requestOlderHistory}
                      >
                        {t("Load earlier messages")}
                      </Button>
                    )}
                  </Box>
                </div>
              )}
              <div ref={chatScrollRef} />
              {compare && baselineEndpoint && baselineTurns.length > 0 && (
                <CompareList
                  turns={compareTurns}
                  rules={rules}
                  links={links}
                  formatRows={(result) =>
                    formatMetricRows(
                      result.resultRows,
                      result.trace,
                      unitByMetric,
                    )
                  }
                />
              )}
              {!(compare && baselineEndpoint && baselineTurns.length > 0) &&
                (isReady || state.messages.length > 0) &&
                state.messages.map((msg) => (
                  <ChatErrorBoundary
                    key={msg.id}
                    onRetry={
                      msg.role === "assistant" && !msg.isLoading
                        ? () => retryQuery(msg, mode)
                        : undefined
                    }
                  >
                    <ChatMessage
                      role={msg.role}
                      messageId={msg.id}
                      state={
                        msg.isLoading
                          ? "loading"
                          : msg.error
                            ? "error"
                            : "success"
                      }
                      content={msg.content}
                      timestamp={msg.timestamp}
                      errorMessage={msg.error?.message}
                      errorDetails={
                        msg.error
                          ? {
                              error: msg.error.error,
                              statusCode: msg.error.statusCode,
                              requestId: msg.error.requestId,
                              details: msg.error.details,
                            }
                          : undefined
                      }
                      onRetry={
                        msg.role === "assistant" && msg.error
                          ? () => retryQuery(msg, mode)
                          : undefined
                      }
                      stage={msg.stage}
                      streamingTokens={msg.streamingTokens}
                      liveTraceSteps={msg.liveTraceSteps}
                      onRationaleClick={
                        msg.role === "assistant" &&
                        msg.response &&
                        (!msg.isRestored ||
                          (msg.response.result?.trace?.length ?? 0) > 0)
                          ? () => handleRationaleClick(msg)
                          : undefined
                      }
                      response={
                        msg.response
                          ? {
                              tier: msg.response.result?.tier ?? 0,
                              confidence:
                                msg.response.result?.confidence?.score ?? 0,
                              rationale:
                                msg.response.result?.confidence?.rationale ??
                                "",
                              synthesizedAnswer:
                                msg.response.result?.synthesizedAnswer,
                              resultRows: formatMetricRows(
                                msg.response.result?.resultRows,
                                msg.response.result?.trace,
                                unitByMetric,
                              ),
                              queryUsed: msg.response.result?.queryUsed,
                              sparqlGenerated:
                                msg.response.result?.sparqlGenerated,
                              executionMode: msg.response.result?.executionMode,
                              latencyMs: (
                                msg.response.result?.trace ?? []
                              ).reduce((sum, t) => sum + t.durationMs, 0),
                              guardrailBlocked:
                                msg.response.result?.guardrailBlocked ?? false,
                              suppressedRows:
                                msg.response.result?.metadata?.suppressedRows,
                              trace: msg.response.result?.trace,
                              supportingContent:
                                msg.response.result?.supportingContent,
                              graphContext: msg.response.result?.graphContext,
                            }
                          : undefined
                      }
                    />
                  </ChatErrorBoundary>
                ))}
            </ChatContainer>
          </div>
        </div>
      </div>
    </div>
  );
};
