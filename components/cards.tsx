// The card bodies: one per kind of link. Colors come from theme tokens except
// where the state itself is a color (open green, merged purple, Linear's own
// workflow colors).
import type { ReactNode } from "react";
import type { IssueSummary, LinearSummary, PrSummary } from "../contract";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Glyphs (inline so they never depend on a host icon name existing).

function Glyph({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn("size-4 shrink-0", className)}
    >
      {children}
    </svg>
  );
}

function PrGlyph({ pr, className }: { pr: Pick<PrSummary, "state" | "isDraft">; className?: string }) {
  if (pr.state === "merged") {
    return (
      <Glyph className={className}>
        <circle cx="18" cy="18" r="3" />
        <circle cx="6" cy="6" r="3" />
        <path d="M6 21V9a9 9 0 0 0 9 9" />
      </Glyph>
    );
  }
  if (pr.state === "closed") {
    return (
      <Glyph className={className}>
        <circle cx="6" cy="6" r="3" />
        <path d="M6 9v12" />
        <path d="m21 3-6 6" />
        <path d="m21 9-6-6" />
        <path d="M18 11.5V15" />
        <circle cx="18" cy="18" r="3" />
      </Glyph>
    );
  }
  if (pr.isDraft) {
    return (
      <Glyph className={className}>
        <circle cx="18" cy="18" r="3" />
        <circle cx="6" cy="6" r="3" />
        <path d="M18 6V5" />
        <path d="M18 11v-1" />
        <path d="M6 9v12" />
      </Glyph>
    );
  }
  return (
    <Glyph className={className}>
      <circle cx="18" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <path d="M13 6h3a2 2 0 0 1 2 2v7" />
      <path d="M6 9v12" />
    </Glyph>
  );
}

function IssueGlyph({ state, className }: { state: IssueSummary["state"]; className?: string }) {
  return (
    <Glyph className={className}>
      <circle cx="12" cy="12" r="9" />
      {state === "open" ? <circle cx="12" cy="12" r="1.5" fill="currentColor" /> : null}
      {state === "completed" ? <path d="m8.5 12 2.5 2.5 4.5-5" /> : null}
      {state === "not_planned" ? <path d="m5.7 5.7 12.6 12.6" /> : null}
    </Glyph>
  );
}

/** Linear's workflow icon: dashed backlog, empty todo, half-full in progress, filled done. */
function LinearStateGlyph({ state, className }: { state: LinearSummary["state"]; className?: string }) {
  const color = /^#?[0-9a-f]{3,8}$/i.test(state.color) ? `#${state.color.replace(/^#/, "")}` : undefined;
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={cn("size-4 shrink-0", className)} style={{ color }}>
      {state.type === "completed" ? (
        <>
          <circle cx="8" cy="8" r="7" fill="currentColor" />
          <path d="m5 8.2 2 2 4-4.2" fill="none" stroke="var(--color-popover, #fff)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : state.type === "canceled" ? (
        <>
          <circle cx="8" cy="8" r="7" fill="currentColor" />
          <path d="m5.5 5.5 5 5m0-5-5 5" stroke="var(--color-popover, #fff)" strokeWidth="1.6" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle
            cx="8"
            cy="8"
            r="6.2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeDasharray={state.type === "backlog" || state.type === "triage" ? "2 2" : undefined}
          />
          {state.type === "started" ? <path d="M8 4a4 4 0 0 1 0 8Z" fill="currentColor" /> : null}
        </>
      )}
    </svg>
  );
}

const CheckGlyph = ({ className }: { className?: string }) => (
  <Glyph className={className}>
    <path d="M20 6 9 17l-5-5" />
  </Glyph>
);
const CrossGlyph = ({ className }: { className?: string }) => (
  <Glyph className={className}>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </Glyph>
);
const DotGlyph = ({ className }: { className?: string }) => (
  <Glyph className={className}>
    <circle cx="12" cy="12" r="4" fill="currentColor" />
  </Glyph>
);

// ---------------------------------------------------------------------------
// Shared pieces.

export function ago(iso: string | null): string | null {
  if (iso === null || iso === "") return null;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  const minutes = Math.max(0, Math.round((Date.now() - then) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function Header({ children }: { children: ReactNode }) {
  return <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">{children}</div>;
}

function Dot() {
  return <span aria-hidden="true">·</span>;
}

function Title({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="line-clamp-2 text-[0.95rem] font-semibold leading-snug text-foreground hover:underline"
    >
      {children}
    </a>
  );
}

function Excerpt({ text }: { text: string }) {
  if (text === "") return null;
  return <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">{text}</p>;
}

function Status({ tone, icon, children }: { tone: "good" | "bad" | "wait"; icon: ReactNode; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1",
        tone === "good" && "text-emerald-500",
        tone === "bad" && "text-red-500",
        tone === "wait" && "text-amber-500",
      )}
    >
      {icon}
      {children}
    </span>
  );
}

function Labels({ labels }: { labels: { name: string; color: string }[] }) {
  if (labels.length === 0) return null;
  const style = (color: string) =>
    /^[0-9a-f]{6}$/i.test(color) ? { borderColor: `#${color}99`, backgroundColor: `#${color}26` } : undefined;
  return (
    <div className="flex flex-wrap gap-1">
      {labels.slice(0, 6).map((label) => (
        <span
          key={label.name}
          style={style(label.color)}
          className="rounded-full border border-border px-2 py-px text-[0.68rem] font-medium text-foreground"
        >
          {label.name}
        </span>
      ))}
      {labels.length > 6 ? <span className="px-1 text-[0.68rem] text-muted-foreground">+{labels.length - 6}</span> : null}
    </div>
  );
}

function Footer({ children, trailing }: { children?: ReactNode; trailing: string }) {
  return (
    <div className="flex items-center gap-2 border-t border-border pt-2.5 text-xs text-muted-foreground">
      {children}
      <span className="ml-auto min-w-0 truncate">{trailing}</span>
    </div>
  );
}

const frame = "flex flex-col gap-2.5 p-3.5";

// ---------------------------------------------------------------------------
// GitHub pull request.

function prTone(pr: Pick<PrSummary, "state" | "isDraft">): string {
  if (pr.state === "merged") return "text-violet-500";
  if (pr.state === "closed") return "text-red-500";
  if (pr.isDraft) return "text-muted-foreground";
  return "text-emerald-500";
}

function prLabel(pr: Pick<PrSummary, "state" | "isDraft">): string {
  if (pr.state === "merged") return "Merged";
  if (pr.state === "closed") return "Closed";
  return pr.isDraft ? "Draft" : "Open";
}

function ChecksLine({ checks }: { checks: NonNullable<PrSummary["checks"]> }) {
  const total = checks.passed + checks.failed + checks.pending + checks.skipped;
  if (checks.failed > 0) {
    return (
      <Status tone="bad" icon={<CrossGlyph className="size-3.5" />}>
        {checks.failed} of {total} checks failed
      </Status>
    );
  }
  if (checks.pending > 0) {
    return (
      <Status tone="wait" icon={<DotGlyph className="size-3.5" />}>
        {checks.pending} of {total} checks running
      </Status>
    );
  }
  return (
    <Status tone="good" icon={<CheckGlyph className="size-3.5" />}>
      {checks.passed === 1 ? "1 check passed" : `${checks.passed} checks passed`}
    </Status>
  );
}

function ReviewLine({ decision }: { decision: NonNullable<PrSummary["reviewDecision"]> }) {
  if (decision === "approved") {
    return (
      <Status tone="good" icon={<CheckGlyph className="size-3.5" />}>
        Approved
      </Status>
    );
  }
  if (decision === "changes_requested") {
    return (
      <Status tone="bad" icon={<CrossGlyph className="size-3.5" />}>
        Changes requested
      </Status>
    );
  }
  return (
    <Status tone="wait" icon={<DotGlyph className="size-3.5" />}>
      Review required
    </Status>
  );
}

export function PrCard({ pr }: { pr: PrSummary }) {
  const when =
    pr.state === "merged"
      ? `merged ${ago(pr.mergedAt) ?? ""}`
      : pr.state === "closed"
        ? `closed ${ago(pr.closedAt) ?? ""}`
        : `updated ${ago(pr.updatedAt) ?? ""}`;
  const conflicts = pr.state === "open" && pr.mergeable === "conflicting";
  return (
    <div className={frame}>
      <Header>
        <span className={cn("inline-flex items-center gap-1 font-medium", prTone(pr))}>
          <PrGlyph pr={pr} className="size-3.5" />
          {prLabel(pr)}
        </span>
        <Dot />
        <span className="min-w-0 truncate">
          {pr.repo} #{pr.number}
        </span>
      </Header>
      <Title href={pr.url}>{pr.title}</Title>
      <Excerpt text={pr.excerpt} />
      <div className="flex min-w-0 items-center gap-1 font-mono text-[0.7rem] text-muted-foreground">
        <span className="min-w-0 max-w-[45%] truncate rounded bg-muted px-1.5 py-0.5">{pr.baseRefName}</span>
        <span aria-label="from">←</span>
        <span className="min-w-0 flex-1 truncate">
          <span className="rounded bg-muted px-1.5 py-0.5">{pr.headRefName}</span>
        </span>
      </div>
      {pr.checks === null && pr.reviewDecision === null && !conflicts ? null : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {pr.checks === null ? null : <ChecksLine checks={pr.checks} />}
          {pr.reviewDecision === null ? null : <ReviewLine decision={pr.reviewDecision} />}
          {conflicts ? (
            <Status tone="bad" icon={<CrossGlyph className="size-3.5" />}>
              Conflicts
            </Status>
          ) : null}
        </div>
      )}
      <Labels labels={pr.labels} />
      <Footer trailing={`${pr.author} · ${when.trim()}`}>
        <span className="font-mono text-emerald-500">+{pr.additions.toLocaleString()}</span>
        <span className="font-mono text-red-500">−{pr.deletions.toLocaleString()}</span>
        <span>
          {pr.changedFiles} {pr.changedFiles === 1 ? "file" : "files"}
        </span>
      </Footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// GitHub issue.

export function IssueCard({ issue }: { issue: IssueSummary }) {
  const tone =
    issue.state === "open" ? "text-emerald-500" : issue.state === "completed" ? "text-violet-500" : "text-muted-foreground";
  const label = issue.state === "open" ? "Open" : issue.state === "completed" ? "Closed" : "Not planned";
  const when = issue.state === "open" ? `updated ${ago(issue.updatedAt) ?? ""}` : `closed ${ago(issue.closedAt) ?? ""}`;
  return (
    <div className={frame}>
      <Header>
        <span className={cn("inline-flex items-center gap-1 font-medium", tone)}>
          <IssueGlyph state={issue.state} className="size-3.5" />
          {label}
        </span>
        <Dot />
        <span className="min-w-0 truncate">
          {issue.repo} #{issue.number}
        </span>
      </Header>
      <Title href={issue.url}>{issue.title}</Title>
      <Excerpt text={issue.excerpt} />
      <Labels labels={issue.labels} />
      <Footer trailing={`${issue.author} · ${when.trim()}`}>
        <span>
          {issue.comments} {issue.comments === 1 ? "comment" : "comments"}
        </span>
        {issue.assignees.length === 0 ? null : (
          <span className="min-w-0 truncate">→ {issue.assignees.slice(0, 2).join(", ")}</span>
        )}
      </Footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Linear issue.

/** Linear's priority bars: urgent is a filled square with "!", the rest fill 1-3 bars. */
function PriorityGlyph({ priority }: { priority: number }) {
  if (priority === 1) {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3.5 shrink-0 text-orange-500">
        <rect x="1" y="1" width="14" height="14" rx="3" fill="currentColor" />
        <path d="M8 4.5v4.5M8 11.3v.2" stroke="var(--color-popover, #fff)" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  const filled = priority === 2 ? 3 : priority === 3 ? 2 : 1;
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground">
      {[0, 1, 2].map((bar) => (
        <rect
          key={bar}
          x={2 + bar * 4.5}
          y={10 - bar * 3.5}
          width="3"
          height={4 + bar * 3.5}
          rx="1"
          fill="currentColor"
          opacity={bar < filled ? 1 : 0.3}
        />
      ))}
    </svg>
  );
}

export function LinearCard({ issue }: { issue: LinearSummary }) {
  const context = [issue.project, issue.cycle].filter((part): part is string => part !== null);
  return (
    <div className={frame}>
      <Header>
        <span className="inline-flex items-center gap-1 font-medium text-foreground">
          <LinearStateGlyph state={issue.state} className="size-3.5" />
          {issue.state.name}
        </span>
        <Dot />
        <span className="min-w-0 truncate">
          {issue.identifier}
          {issue.team === "" ? "" : ` · ${issue.team}`}
        </span>
      </Header>
      <Title href={issue.url}>{issue.title}</Title>
      <Excerpt text={issue.excerpt} />
      {context.length === 0 && issue.priority === 0 && issue.dueDate === null ? null : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {issue.priority === 0 ? null : (
            <span className="inline-flex items-center gap-1">
              <PriorityGlyph priority={issue.priority} />
              {issue.priorityLabel}
            </span>
          )}
          {context.length === 0 ? null : <span className="min-w-0 truncate">{context.join(" · ")}</span>}
          {issue.dueDate === null ? null : <span>Due {issue.dueDate}</span>}
        </div>
      )}
      <Labels labels={issue.labels} />
      <Footer trailing={`${issue.assignee ?? "Unassigned"} · updated ${ago(issue.updatedAt) ?? ""}`.trim()}>
        {issue.pullRequests === 0 ? null : (
          <span className="inline-flex items-center gap-1">
            <PrGlyph pr={{ state: "open", isDraft: false }} className="size-3.5" />
            {issue.pullRequests} {issue.pullRequests === 1 ? "PR" : "PRs"}
          </span>
        )}
      </Footer>
    </div>
  );
}
