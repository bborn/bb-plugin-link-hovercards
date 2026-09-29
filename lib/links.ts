// Which links get a card. Pure, so it runs in tests without a browser.
import type { GithubRef, LinearRef } from "../contract.js";

export type LinkRef =
  | ({ source: "github" } & GithubRef)
  | ({ source: "linear" } & LinearRef);

const GITHUB = /^https?:\/\/(?:www\.)?github\.com\/([\w.-]+)\/([\w.-]+)\/(pull|issues)\/(\d+)(?:[/?#]|$)/i;
const LINEAR = /^https?:\/\/linear\.app\/([\w-]+)\/issue\/([a-z][a-z0-9_]*-\d+)(?:[/?#]|$)/i;

/**
 * `https://github.com/o/r/pull/12/files` → a GitHub PR ref,
 * `https://linear.app/acme/issue/ENG-7/slug` → a Linear ref, anything else → null.
 */
export function parseLink(href: string): LinkRef | null {
  const github = GITHUB.exec(href);
  if (github !== null) {
    const number = Number(github[4]);
    if (!Number.isSafeInteger(number) || number <= 0) return null;
    return {
      source: "github",
      kind: github[3]!.toLowerCase() === "pull" ? "pr" : "issue",
      repo: `${github[1]}/${github[2]}`,
      number,
    };
  }
  const linear = LINEAR.exec(href);
  if (linear !== null) {
    return { source: "linear", workspace: linear[1]!.toLowerCase(), identifier: linear[2]!.toUpperCase() };
  }
  return null;
}

export function linkKey(ref: LinkRef): string {
  return ref.source === "github"
    ? `github:${ref.repo.toLowerCase()}#${ref.number}`
    : `linear:${ref.workspace}/${ref.identifier}`;
}

/** CSS matching every link `parseLink` might accept; the parser has the final word. */
export const LINK_SELECTOR = [
  'a[href*="github.com/"][href*="/pull/"]',
  'a[href*="github.com/"][href*="/issues/"]',
  'a[href*="linear.app/"][href*="/issue/"]',
].join(", ");
