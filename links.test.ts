import { describe, expect, it } from "vitest";
import { excerpt } from "./lib/text.js";
import { parseLink } from "./lib/links.js";

describe("parseLink", () => {
  it("reads GitHub PR and issue links, including sub-pages", () => {
    expect(parseLink("https://github.com/acme/app/pull/3843")).toEqual({ source: "github", kind: "pr", repo: "acme/app", number: 3843 });
    expect(parseLink("https://github.com/o/r.js/pull/12/files#diff-1")).toMatchObject({ kind: "pr", repo: "o/r.js", number: 12 });
    expect(parseLink("https://www.github.com/o/r/issues/7?q=1")).toMatchObject({ kind: "issue", repo: "o/r", number: 7 });
  });

  it("reads Linear issue links with or without a slug", () => {
    expect(parseLink("https://linear.app/acme/issue/ENG-123/fix-the-thing")).toEqual({
      source: "linear",
      workspace: "acme",
      identifier: "ENG-123",
    });
    expect(parseLink("https://linear.app/Acme/issue/eng-9")).toMatchObject({ workspace: "acme", identifier: "ENG-9" });
  });

  it("ignores everything else", () => {
    for (const href of [
      "https://github.com/o/r/pulls",
      "https://github.com/o/r/pull/12abc",
      "https://github.com/o/r/issues/new",
      "https://evil.com/github.com/o/r/pull/1",
      "https://github.com.evil.com/o/r/pull/1",
      "https://linear.app/acme/project/roadmap-1",
      "https://linear.app/acme/issue/123",
      "/projects/p/threads/t",
    ]) {
      expect(parseLink(href), href).toBeNull();
    }
  });
});

describe("excerpt", () => {
  it("strips markdown down to a line of text", () => {
    expect(
      excerpt("<!-- template -->\n## Summary\n\n- Fixes [the bug](https://x.y) in **sync**\n\n```ts\ncode()\n```\n![shot](a.png)"),
    ).toBe("Fixes the bug in sync");
  });

  it("cuts long bodies on a word", () => {
    const text = excerpt("word ".repeat(200));
    expect(text.length).toBeLessThanOrEqual(281);
    expect(text.endsWith("word…")).toBe(true);
  });
});
