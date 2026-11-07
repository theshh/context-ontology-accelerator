// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Simplified-UX switches. These only HIDE UI surfaces; every API call, state
 * field and edit path behind them is left intact, so flipping a flag back to
 * `true` restores the original screen with no other change.
 */

/**
 * Raw technical representations: shared Turtle prefixes, the R2RML mapping
 * document, ontology/class Turtle source and the "Edit raw" toggles. The
 * human-readable tables (classes, properties, column mappings) stay visible.
 */
export const SHOW_TECHNICAL_VIEWS = false;

/** Graph explorer: the flat List view (the Graph view is the only view). */
export const SHOW_EXPLORER_LIST_VIEW = false;

/**
 * Graph explorer: the "Ontologies" tab. With this and the Inducted sources tab
 * both hidden, the Explorer renders just the graph (no header, no tab strip).
 * The ontology list itself is still reachable under Curation -> Ontologies.
 */
export const SHOW_EXPLORER_ONTOLOGIES_TAB = false;

/** Graph explorer: the "Inducted sources" tab. */
export const SHOW_INDUCTED_SOURCES_TAB = false;

/**
 * Archived context graphs in the list and the Playground switcher. When hidden,
 * they are still reachable by choosing "Archived" in the list's status filter
 * (so they can be reactivated or deleted) and by direct URL.
 */
export const SHOW_ARCHIVED_CONTEXT_GRAPHS = false;

/** The Dashboard home page and its side-nav link. "/" opens Context graphs. */
export const SHOW_DASHBOARD = false;

/** Show the Business map tab (a plain-language picture of the graph's things,
 * relationships and rules) on each context graph. */
export const SHOW_BUSINESS_MAP = true;

/**
 * Technical rows in a context graph's Overview "Graph details": the namespace
 * ID, the internal name and VKG health. Display name, owner, status, sources,
 * dates and description stay visible.
 */
export const SHOW_GRAPH_TECHNICAL_DETAILS = false;

/**
 * The "Graph explorer" tab on each context graph. When hidden, the explorer is
 * still reachable from the Business map ("View the full ontology") and by URL,
 * and its tab shows while it is open.
 */
export const SHOW_GRAPH_EXPLORER_TAB = false;

/**
 * Business map: the "Show only what a rule uses" dropdown. When hidden, a rule
 * can still be picked from a data card's Rules list, which narrows the map
 * and opens the rule's lineage as before.
 */
export const SHOW_BUSINESS_MAP_RULE_FILTER = false;

/**
 * Curation -> Ontology induction: the "Reference ontologies" tab (load and
 * manage foundational/uploaded ontologies). When hidden, the page shows the
 * proposals list alone with no tab strip.
 */
export const SHOW_REFERENCE_ONTOLOGIES_TAB = false;

/**
 * The Context graphs list page. When hidden, "Context graphs" opens the
 * current graph (the one last opened, else the first active one) and the
 * top-bar "Context graph" dropdown switches between graphs or creates a new
 * one. The list still shows when there are no graphs yet.
 */
export const SHOW_CONTEXT_GRAPH_LIST = false;

/** The side-nav "Ontology" link (the same page as a graph's Curation tab). */
export const SHOW_ONTOLOGY_NAV_LINK = false;

/**
 * Connection maintenance actions on a connection's page: Re-scan (Re-verify),
 * Reject source and Delete. When hidden, a connection can be added (Connect
 * source) and approved, nothing else.
 */
export const SHOW_CONNECTION_MAINTENANCE_ACTIONS = false;
