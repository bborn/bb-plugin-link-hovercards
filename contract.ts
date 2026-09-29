// The shapes shared by host.ts, server.ts and app.tsx.
//
// The app finds a link, the server answers what it points at, and the answer
// comes from `gh` on a machine (GitHub) or the Linear API (Linear).
import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

/** `owner/name`. */
export const repoNameSchema = z
  .string()
  .regex(/^[\w.-]+\/[\w.-]+$/, "expected owner/name");

export const githubRefSchema = z
  .object({
    kind: z.enum(["pr", "issue"]),
    repo: repoNameSchema,
    number: z.number().int().positive(),
  })
  .strict();
export type GithubRef = z.infer<typeof githubRefSchema>;

export const linearRefSchema = z
  .object({
    /** The workspace URL key: `linear.app/<workspace>/issue/…`. */
    workspace: z.string().regex(/^[\w-]+$/),
    /** `ENG-123`, upper case. */
    identifier: z.string().regex(/^[A-Z][A-Z0-9_]*-\d+$/),
  })
  .strict();
export type LinearRef = z.infer<typeof linearRefSchema>;

const labelSchema = z.object({ name: z.string(), color: z.string() }).strict();

export const checksSchema = z
  .object({
    passed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    pending: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
  })
  .strict();
export type Checks = z.infer<typeof checksSchema>;

export const prSummarySchema = z
  .object({
    type: z.literal("pr"),
    repo: repoNameSchema,
    number: z.number().int().positive(),
    title: z.string(),
    url: z.string(),
    state: z.enum(["open", "closed", "merged"]),
    isDraft: z.boolean(),
    author: z.string(),
    baseRefName: z.string(),
    headRefName: z.string(),
    additions: z.number().int().nonnegative(),
    deletions: z.number().int().nonnegative(),
    changedFiles: z.number().int().nonnegative(),
    /** Null when the repo does not require reviews, or GitHub has no decision. */
    reviewDecision: z.enum(["approved", "changes_requested", "review_required"]).nullable(),
    /** Null when the head commit has no checks. */
    checks: checksSchema.nullable(),
    mergeable: z.enum(["mergeable", "conflicting", "unknown"]),
    labels: z.array(labelSchema),
    /** The description as plain text, cut short. */
    excerpt: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
    mergedAt: z.string().nullable(),
    closedAt: z.string().nullable(),
  })
  .strict();
export type PrSummary = z.infer<typeof prSummarySchema>;

export const issueSummarySchema = z
  .object({
    type: z.literal("issue"),
    repo: repoNameSchema,
    number: z.number().int().positive(),
    title: z.string(),
    url: z.string(),
    /** `completed` and `not_planned` are the two ways GitHub closes an issue. */
    state: z.enum(["open", "completed", "not_planned"]),
    author: z.string(),
    assignees: z.array(z.string()),
    labels: z.array(labelSchema),
    comments: z.number().int().nonnegative(),
    excerpt: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
    closedAt: z.string().nullable(),
  })
  .strict();
export type IssueSummary = z.infer<typeof issueSummarySchema>;

export const linearSummarySchema = z
  .object({
    type: z.literal("linear"),
    identifier: z.string(),
    title: z.string(),
    url: z.string(),
    /** Linear's own state name ("In Review") with its workflow type and color. */
    state: z
      .object({
        name: z.string(),
        type: z.enum(["triage", "backlog", "unstarted", "started", "completed", "canceled", "other"]),
        color: z.string(),
      })
      .strict(),
    team: z.string(),
    assignee: z.string().nullable(),
    /** 0 none, 1 urgent … 4 low. */
    priority: z.number().int().min(0).max(4),
    priorityLabel: z.string(),
    project: z.string().nullable(),
    cycle: z.string().nullable(),
    labels: z.array(labelSchema),
    /** Pull requests attached to the issue. */
    pullRequests: z.number().int().nonnegative(),
    excerpt: z.string(),
    dueDate: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();
export type LinearSummary = z.infer<typeof linearSummarySchema>;

const githubResultSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), item: z.discriminatedUnion("type", [prSummarySchema, issueSummarySchema]) }).strict(),
  z.object({ ok: z.literal(false), error: z.string() }).strict(),
]);
export type GithubResult = z.infer<typeof githubResultSchema>;

const linearResultSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), item: linearSummarySchema }).strict(),
  z.object({ ok: z.literal(false), error: z.string() }).strict(),
]);
export type LinearResult = z.infer<typeof linearResultSchema>;

/** Server entry → its own host entry. */
export const hostContract = defineRpcContract({
  github: { input: githubRefSchema, output: githubResultSchema },
});

/** App → server. */
export const rpcContract = defineRpcContract({
  github: { input: githubRefSchema, output: githubResultSchema },
  linear: { input: linearRefSchema, output: linearResultSchema },
});
