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
