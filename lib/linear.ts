// Reading Linear issues over its GraphQL API with personal API keys.
//
// A personal key belongs to one workspace, so the setting holds any number of
// them and each link is answered with the key for the workspace in its URL.
import type { LinearRef, LinearSummary } from "../contract.js";
import { excerpt, isObject, nonEmpty, str, type Json } from "./text.js";

export const LINEAR_API = "https://api.linear.app/graphql";

export const ISSUE_QUERY = `query HovercardIssue($id: String!) {
  issue(id: $id) {
    identifier title url description priority priorityLabel dueDate createdAt updatedAt
    state { name type color }
    team { key name }
    assignee { displayName name }
    project { name }
    cycle { number name }
    labels(first: 10) { nodes { name color } }
    attachments(first: 25) { nodes { sourceType url } }
  }
}`;

export const WORKSPACE_QUERY = `query HovercardWorkspace { organization { urlKey } }`;

/** Split the setting into keys: commas, spaces or newlines between them. */
export function parseKeys(value: string | undefined): string[] {
  return [...new Set((value ?? "").split(/[\s,]+/).filter((key) => key !== ""))];
}

/**
 * The keys to try for a link into `workspace`, given the workspace each key
 * belongs to (null when it could not be read). The matching key when there is
 * one; otherwise every unreadable key, since one of them might match.
 */
export function keysFor(
  keys: string[],
  workspaces: (string | null)[],
  workspace: string,
): { keys: string[] } | { error: string } {
  if (keys.length === 0) {
    return { error: "Add a Linear API key in this plugin's settings to preview Linear issues." };
  }
  const matching = keys.filter((_, index) => workspaces[index] === workspace);
  if (matching.length > 0) return { keys: matching };
  const unknown = keys.filter((_, index) => workspaces[index] === null);
  if (unknown.length > 0) return { keys: unknown };
  return { error: `None of the Linear API keys belongs to the "${workspace}" workspace.` };
}

const STATE_TYPES = new Set(["triage", "backlog", "unstarted", "started", "completed", "canceled"]);

/** The `data.issue` object of ISSUE_QUERY as a card. */
export function parseLinearIssue(issue: Json, ref: LinearRef): LinearSummary {
  const state = isObject(issue.state) ? issue.state : {};
  const stateType = str(state.type);
  const cycle = isObject(issue.cycle) ? issue.cycle : null;
  const nodes = (connection: unknown): Json[] =>
    isObject(connection) && Array.isArray(connection.nodes) ? connection.nodes.filter(isObject) : [];
  const priority = typeof issue.priority === "number" ? Math.min(4, Math.max(0, Math.round(issue.priority))) : 0;
  return {
    type: "linear",
    identifier: str(issue.identifier) || ref.identifier,
    title: str(issue.title),
    url: str(issue.url) || `https://linear.app/${ref.workspace}/issue/${ref.identifier}`,
    state: {
      name: str(state.name) || "Unknown",
      type: STATE_TYPES.has(stateType) ? (stateType as LinearSummary["state"]["type"]) : "other",
      color: str(state.color),
    },
    team: isObject(issue.team) ? str(issue.team.name) : "",
    assignee: isObject(issue.assignee) ? nonEmpty(issue.assignee.displayName) ?? nonEmpty(issue.assignee.name) : null,
    priority,
    priorityLabel: str(issue.priorityLabel),
    project: isObject(issue.project) ? nonEmpty(issue.project.name) : null,
    cycle:
      cycle === null
        ? null
        : nonEmpty(cycle.name) ?? (typeof cycle.number === "number" ? `Cycle ${cycle.number}` : null),
    labels: nodes(issue.labels).map((label) => ({ name: str(label.name), color: str(label.color).replace(/^#/, "") })),
    pullRequests: nodes(issue.attachments).filter(
      (attachment) => /github/i.test(str(attachment.sourceType)) && /\/pull\/\d+/.test(str(attachment.url)),
    ).length,
    excerpt: excerpt(str(issue.description)),
    dueDate: nonEmpty(issue.dueDate),
    createdAt: str(issue.createdAt),
    updatedAt: str(issue.updatedAt),
  };
}

type Fetch = (input: string, init: RequestInit) => Promise<Response>;

/** Run one GraphQL query with one key. Throws with Linear's own message. */
export async function linearQuery(
  fetcher: Fetch,
  key: string,
  query: string,
  variables: Json,
  signal?: AbortSignal,
): Promise<Json> {
  const response = await fetcher(LINEAR_API, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: key },
    body: JSON.stringify({ query, variables }),
    signal,
  });
  const body: unknown = await response.json().catch(() => null);
  const errors = isObject(body) && Array.isArray(body.errors) ? body.errors.filter(isObject) : [];
  if (errors.length > 0) throw new Error(str(errors[0]!.message) || "Linear returned an error");
  if (!response.ok) throw new Error(`Linear answered HTTP ${response.status}`);
  if (!isObject(body) || !isObject(body.data)) throw new Error("Linear returned no data");
  return body.data;
}
