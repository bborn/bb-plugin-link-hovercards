// Turning `gh` output into PR and issue summaries. Pure, so it runs in tests
// without gh.
import type { Checks, GithubRef, IssueSummary, PrSummary } from "../contract.js";
import { count, excerpt, isObject, nonEmpty, str } from "./text.js";

export const GH_PR_FIELDS = [
  "number",
  "title",
  "url",
  "state",
  "isDraft",
  "author",
  "baseRefName",
  "headRefName",
  "additions",
  "deletions",
  "changedFiles",
  "reviewDecision",
  "statusCheckRollup",
  "mergeable",
  "labels",
  "body",
  "createdAt",
  "updatedAt",
  "mergedAt",
  "closedAt",
].join(",");

const FAILED = new Set(["FAILURE", "ERROR", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED", "STARTUP_FAILURE"]);
const SKIPPED = new Set(["SKIPPED", "NEUTRAL", "STALE"]);

/**
 * `statusCheckRollup` mixes CheckRuns (status + conclusion) and legacy
 * StatusContexts (state). Both fold into one tally.
 */
export function tallyChecks(rollup: unknown): Checks | null {
  if (!Array.isArray(rollup) || rollup.length === 0) return null;
  const checks: Checks = { passed: 0, failed: 0, pending: 0, skipped: 0 };
  for (const entry of rollup) {
    if (!isObject(entry)) continue;
    const outcome =
      entry.__typename === "StatusContext"
        ? str(entry.state).toUpperCase()
        : str(entry.status).toUpperCase() === "COMPLETED"
          ? str(entry.conclusion).toUpperCase()
          : "PENDING";
    if (outcome === "SUCCESS") checks.passed += 1;
    else if (FAILED.has(outcome)) checks.failed += 1;
    else if (SKIPPED.has(outcome)) checks.skipped += 1;
    else checks.pending += 1;
  }
  return checks;
}

function reviewDecision(value: unknown): PrSummary["reviewDecision"] {
  switch (str(value).toUpperCase()) {
    case "APPROVED":
      return "approved";
    case "CHANGES_REQUESTED":
      return "changes_requested";
    case "REVIEW_REQUIRED":
      return "review_required";
    default:
      return null;
  }
}

function mergeable(value: unknown): PrSummary["mergeable"] {
  switch (str(value).toUpperCase()) {
    case "MERGEABLE":
      return "mergeable";
    case "CONFLICTING":
      return "conflicting";
    default:
      return "unknown";
  }
}

function state(value: unknown): PrSummary["state"] {
  switch (str(value).toUpperCase()) {
    case "MERGED":
      return "merged";
    case "CLOSED":
      return "closed";
    default:
      return "open";
  }
}

/** Parse `gh pr view --json <GH_PR_FIELDS>` stdout for `ref`. */
export function parsePrView(stdout: string, ref: GithubRef): PrSummary {
  const raw: unknown = JSON.parse(stdout);
  if (!isObject(raw)) throw new Error("gh returned something other than a PR");
  const author = isObject(raw.author) ? str(raw.author.login) : "";
  const labels = parseLabels(raw.labels);
  return {
    type: "pr",
    repo: ref.repo,
    number: ref.number,
    title: str(raw.title),
    url: str(raw.url) || `https://github.com/${ref.repo}/pull/${ref.number}`,
    state: state(raw.state),
    isDraft: raw.isDraft === true,
    author: author || "ghost",
    baseRefName: str(raw.baseRefName),
    headRefName: str(raw.headRefName),
    additions: count(raw.additions),
    deletions: count(raw.deletions),
    changedFiles: count(raw.changedFiles),
    reviewDecision: reviewDecision(raw.reviewDecision),
    checks: tallyChecks(raw.statusCheckRollup),
    mergeable: mergeable(raw.mergeable),
    labels,
    excerpt: excerpt(str(raw.body)),
    createdAt: str(raw.createdAt),
    updatedAt: str(raw.updatedAt),
    mergedAt: nonEmpty(raw.mergedAt),
    closedAt: nonEmpty(raw.closedAt),
  };
}

function parseLabels(value: unknown): { name: string; color: string }[] {
  return Array.isArray(value)
    ? value.filter(isObject).map((label) => ({ name: str(label.name), color: str(label.color) }))
    : [];
}

/** True when `gh api repos/<repo>/issues/<n>` answered with a pull request. */
export function isPullRequest(stdout: string): boolean {
  const raw: unknown = JSON.parse(stdout);
  return isObject(raw) && isObject(raw.pull_request);
}

/** Parse `gh api repos/<repo>/issues/<n>` stdout for `ref`. */
export function parseIssue(stdout: string, ref: GithubRef): IssueSummary {
  const raw: unknown = JSON.parse(stdout);
  if (!isObject(raw)) throw new Error("GitHub returned something other than an issue");
  const closed = str(raw.state) === "closed";
  return {
    type: "issue",
    repo: ref.repo,
    number: ref.number,
    title: str(raw.title),
    url: str(raw.html_url) || `https://github.com/${ref.repo}/issues/${ref.number}`,
    state: !closed ? "open" : str(raw.state_reason) === "not_planned" ? "not_planned" : "completed",
    author: (isObject(raw.user) ? str(raw.user.login) : "") || "ghost",
    assignees: Array.isArray(raw.assignees)
      ? raw.assignees.filter(isObject).map((user) => str(user.login)).filter((login) => login !== "")
      : [],
    labels: parseLabels(raw.labels),
    comments: count(raw.comments),
    excerpt: excerpt(str(raw.body)),
    createdAt: str(raw.created_at),
    updatedAt: str(raw.updated_at),
    closedAt: nonEmpty(raw.closed_at),
  };
}
