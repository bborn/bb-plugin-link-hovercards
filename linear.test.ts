import { describe, expect, it } from "vitest";
import { linearSummarySchema } from "./contract.js";
import { ISSUE_QUERY, LINEAR_API, keysFor, linearQuery, parseKeys, parseLinearIssue } from "./lib/linear.js";

const ref = { workspace: "acme", identifier: "ENG-42" };

describe("parseKeys", () => {
  it("splits on commas, spaces and newlines and drops repeats", () => {
    expect(parseKeys(" lin_api_a, lin_api_b\nlin_api_a ")).toEqual(["lin_api_a", "lin_api_b"]);
    expect(parseKeys(undefined)).toEqual([]);
  });
});

describe("keysFor", () => {
  it("uses the key for the link's workspace", () => {
    expect(keysFor(["a", "b"], ["other", "acme"], "acme")).toEqual({ keys: ["b"] });
  });

  it("falls back to keys whose workspace could not be read", () => {
    expect(keysFor(["a", "b"], ["other", null], "acme")).toEqual({ keys: ["b"] });
  });

  it("explains a missing or mismatched key", () => {
    expect(keysFor([], [], "acme")).toMatchObject({ error: expect.stringContaining("Add a Linear API key") });
    expect(keysFor(["a"], ["other"], "acme")).toMatchObject({ error: expect.stringContaining('"acme"') });
  });
});

describe("parseLinearIssue", () => {
  it("maps the query answer into a card", () => {
    const issue = parseLinearIssue(
      {
        identifier: "ENG-42",
        title: "Refunds skip the ledger",
        url: "https://linear.app/acme/issue/ENG-42/refunds-skip-the-ledger",
        description: "## Context\nPartial refunds never reach **the ledger**.",
        priority: 2,
        priorityLabel: "High",
        dueDate: "2026-10-01",
        createdAt: "2026-09-20T10:00:00.000Z",
        updatedAt: "2026-09-28T10:00:00.000Z",
        state: { name: "In Review", type: "started", color: "#0f783c" },
        team: { key: "ENG", name: "Engineering" },
        assignee: { displayName: "sam", name: "Sam Lee" },
        project: { name: "Payments" },
        cycle: { number: 12, name: null },
        labels: { nodes: [{ name: "Bug", color: "#eb5757" }] },
        attachments: {
          nodes: [
            { sourceType: "github", url: "https://github.com/acme/app/pull/9" },
            { sourceType: "githubCommit", url: "https://github.com/acme/app/commit/abc" },
            { sourceType: "slack", url: "https://acme.slack.com/archives/1" },
          ],
        },
      },
      ref,
    );
    expect(linearSummarySchema.parse(issue)).toEqual(issue);
    expect(issue).toMatchObject({
      state: { name: "In Review", type: "started" },
      team: "Engineering",
      assignee: "sam",
      priority: 2,
      project: "Payments",
      cycle: "Cycle 12",
      labels: [{ name: "Bug", color: "eb5757" }],
      pullRequests: 1,
      excerpt: "Partial refunds never reach the ledger.",
    });
  });

  it("survives a sparse issue", () => {
    const issue = parseLinearIssue({ title: "Bare", state: { name: "Todo", type: "custom" } }, ref);
    expect(linearSummarySchema.parse(issue)).toEqual(issue);
    expect(issue).toMatchObject({ identifier: "ENG-42", assignee: null, cycle: null, state: { type: "other" } });
  });
});

describe("linearQuery", () => {
  const respond = (status: number, body: unknown) => async () =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  it("sends the key as Authorization and returns data", async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const data = await linearQuery(
      async (url, init) => {
        seen = { url, init };
        return respond(200, { data: { issue: { title: "x" } } })();
      },
      "lin_api_x",
      ISSUE_QUERY,
      { id: "ENG-42" },
    );
    expect(data).toEqual({ issue: { title: "x" } });
    expect(seen!.url).toBe(LINEAR_API);
    expect((seen!.init.headers as Record<string, string>).authorization).toBe("lin_api_x");
    expect(JSON.parse(String(seen!.init.body))).toMatchObject({ variables: { id: "ENG-42" } });
  });

  it("throws Linear's own error message", async () => {
    await expect(
      linearQuery(respond(400, { errors: [{ message: "Authentication required" }] }), "bad", ISSUE_QUERY, {}),
    ).rejects.toThrow("Authentication required");
    await expect(linearQuery(respond(500, {}), "k", ISSUE_QUERY, {})).rejects.toThrow("HTTP 500");
  });
});
