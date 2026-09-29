// Full-trust host entry: the only place in this plugin that runs a subprocess,
// so the only place that talks to `gh`.
import { execFile } from "node:child_process";
import { experimental_defineHostEntry } from "@get-bb/plugin-sdk/host";
import { hostContract, type GithubRef } from "./contract.js";
import { GH_PR_FIELDS, isPullRequest, parseIssue, parsePrView } from "./lib/github.js";

const GH_TIMEOUT_MS = 15_000;

function gh(args: string[], signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "gh",
      args,
      { timeout: GH_TIMEOUT_MS, signal, maxBuffer: 4 * 1024 * 1024, encoding: "utf8" },
      (error, stdout, stderr) => {
        if (error === null) resolve(stdout);
        else if ((error as NodeJS.ErrnoException).code === "ENOENT") reject(new Error("gh is not installed on this machine."));
        else reject(new Error(stderr.trim().split("\n").pop() || error.message));
      },
    );
  });
}

const pr = async (ref: GithubRef, signal?: AbortSignal) =>
  parsePrView(
    await gh(["pr", "view", String(ref.number), "--repo", ref.repo, "--json", GH_PR_FIELDS], signal),
    { ...ref, kind: "pr" },
  );

export default experimental_defineHostEntry({
  contract: hostContract,
  handlers: {
    async github(ref, context) {
      try {
        if (ref.kind === "pr") return { ok: true as const, item: await pr(ref, context.signal) };
        // GitHub serves pull requests at /issues/<n> too; show those as PRs.
        const stdout = await gh(["api", `repos/${ref.repo}/issues/${ref.number}`], context.signal);
        const item = isPullRequest(stdout) ? await pr(ref, context.signal) : parseIssue(stdout, ref);
        return { ok: true as const, item };
      } catch (cause) {
        return { ok: false as const, error: cause instanceof Error ? cause.message : String(cause) };
      }
    },
  },
});
