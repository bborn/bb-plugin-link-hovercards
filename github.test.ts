import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { issueSummarySchema, prSummarySchema } from "./contract.js";
import { isPullRequest, parseIssue, parsePrView, tallyChecks } from "./lib/github.js";

const fixture = (name: string) => readFileSync(new URL(`./test/${name}`, import.meta.url), "utf8");

describe("tallyChecks", () => {
  it("folds check runs and status contexts together", () => {
    expect(
      tallyChecks([
        { __typename: "CheckRun", status: "COMPLETED", conclusion: "SUCCESS" },
        { __typename: "CheckRun", status: "COMPLETED", conclusion: "FAILURE" },
        { __typename: "CheckRun", status: "IN_PROGRESS", conclusion: "" },
        { __typename: "CheckRun", status: "COMPLETED", conclusion: "SKIPPED" },
        { __typename: "StatusContext", state: "SUCCESS" },
        { __typename: "StatusContext", state: "PENDING" },
        { __typename: "StatusContext", state: "ERROR" },
      ]),
    ).toEqual({ passed: 2, failed: 2, pending: 2, skipped: 1 });
  });

  it("is null when there are no checks", () => {
    expect(tallyChecks([])).toBeNull();
    expect(tallyChecks(null)).toBeNull();
  });
});

describe("parsePrView", () => {
  it("parses real gh output into a valid summary", () => {
    const pr = parsePrView(fixture("cli-cli-merged.json"), { kind: "pr", repo: "cli/cli", number: 14517 });
    expect(prSummarySchema.parse(pr)).toEqual(pr);
    expect(pr).toMatchObject({
      type: "pr",
      state: "merged",
      reviewDecision: "approved",
      checks: { passed: 7, failed: 0, pending: 0, skipped: 6 },
    });
    expect(pr.mergedAt).not.toBeNull();
  });

  it("maps an open draft with conflicts and no decision", () => {
    const pr = parsePrView(
      JSON.stringify({
        title: "WIP",
        state: "OPEN",
        isDraft: true,
        author: { login: "octocat" },
        reviewDecision: "",
        mergeable: "CONFLICTING",
        statusCheckRollup: [],
        labels: [{ name: "bug", color: "d73a4a" }],
        body: "",
        mergedAt: null,
        closedAt: null,
      }),
      { kind: "pr", repo: "o/r", number: 1 },
    );
    expect(pr).toMatchObject({
      state: "open",
      isDraft: true,
      reviewDecision: null,
      checks: null,
      mergeable: "conflicting",
      url: "https://github.com/o/r/pull/1",
      labels: [{ name: "bug", color: "d73a4a" }],
    });
    expect(prSummarySchema.parse(pr)).toEqual(pr);
  });
});

describe("parseIssue", () => {
  it("parses a real closed issue from the REST API", () => {
    const stdout = fixture("cli-cli-issue.json");
    expect(isPullRequest(stdout)).toBe(false);
    const issue = parseIssue(stdout, { kind: "issue", repo: "cli/cli", number: 14495 });
    expect(issueSummarySchema.parse(issue)).toEqual(issue);
    expect(issue).toMatchObject({ type: "issue", state: "completed", comments: 3, author: "CynthiaLuijkx" });
    expect(issue.labels.map((label) => label.name)).toContain("bug");
  });

  it("tells not-planned from completed, and spots PRs behind /issues/", () => {
    const issue = parseIssue(JSON.stringify({ state: "closed", state_reason: "not_planned", title: "x" }), {
      kind: "issue",
      repo: "o/r",
      number: 2,
    });
    expect(issue.state).toBe("not_planned");
    expect(isPullRequest(JSON.stringify({ pull_request: { url: "https://api.github.com/repos/o/r/pulls/2" } }))).toBe(true);
  });
});
