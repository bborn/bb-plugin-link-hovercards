// bb-plugin-link-hovercards — backend entry.
//
// Answers one question for the app: what does this link point at? GitHub goes
// through the host entry (host.ts), which runs `gh` on the server's machine,
// because the server has no child_process. Linear goes straight to its API with
// the keys in settings. Each answer is kept briefly so hovering the same link
// twice costs nothing.
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import {
  hostContract,
  rpcContract,
  type GithubRef,
  type GithubResult,
  type LinearRef,
  type LinearResult,
} from "./contract.js";
import { ISSUE_QUERY, WORKSPACE_QUERY, keysFor, linearQuery, parseKeys, parseLinearIssue } from "./lib/linear.js";
import { isObject, str } from "./lib/text.js";

export { rpcContract };

/** How long an answer stays good. Short: CI, review and workflow state move. */
const FRESH_MS = 60_000;
/** A failure is remembered briefly, so a broken source is not hammered on every hover. */
const FAILURE_MS = 10_000;
const CACHE_MAX = 500;
const LINEAR_TIMEOUT_MS = 10_000;

type Result = GithubResult | LinearResult;

export default async function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define({
    linearApiKeys: {
      type: "string",
      label: "Linear API keys",
      description:
        "Personal API keys from Linear → Settings → Security & access. One per workspace; separate several with commas.",
      secret: true,
    },
  });

  const host = bb.hosts.experimental_client({ contract: hostContract });
  const cache = new Map<string, { at: number; result: Result }>();
  const inFlight = new Map<string, Promise<Result>>();
  /** API key → the workspace URL key it belongs to. */
  const keyWorkspaces = new Map<string, Promise<string | null>>();

  settings.onChange(() => {
    keyWorkspaces.clear();
    for (const key of cache.keys()) if (key.startsWith("linear:")) cache.delete(key);
  });

  function remembered<R extends Result>(key: string, load: () => Promise<R>): Promise<R> {
    const hit = cache.get(key);
    if (hit !== undefined && Date.now() - hit.at < (hit.result.ok ? FRESH_MS : FAILURE_MS)) {
      return Promise.resolve(hit.result as R);
    }
    const pending = inFlight.get(key);
    if (pending !== undefined) return pending as Promise<R>;
    const request = load()
      .then((result) => {
        cache.delete(key);
        cache.set(key, { at: Date.now(), result });
        if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
        return result;
      })
      .finally(() => inFlight.delete(key));
    inFlight.set(key, request);
    return request;
  }

  const failure = (cause: unknown) => ({
    ok: false as const,
    error: cause instanceof Error ? cause.message : String(cause),
  });

  /** The server's own machine, else any connected one. */
  async function hostId(): Promise<string | null> {
    const own = (await bb.sdk.system.config()).primaryHostId;
    if (own !== null) return own;
    const hosts = await bb.sdk.hosts.list();
    return hosts.find((entry) => entry.status === "connected")?.id ?? null;
  }

  async function github(ref: GithubRef): Promise<GithubResult> {
    try {
      const id = await hostId();
      if (id === null) return { ok: false, error: "No connected machine to run gh on." };
      return await host.call("github", ref, { hostId: id });
    } catch (cause) {
      return failure(cause);
    }
  }

  const query = (key: string, text: string, variables: Record<string, unknown>) =>
    linearQuery(fetch, key, text, variables, AbortSignal.timeout(LINEAR_TIMEOUT_MS));

  function workspaceOf(key: string): Promise<string | null> {
    let known = keyWorkspaces.get(key);
    if (known === undefined) {
      known = query(key, WORKSPACE_QUERY, {}).then(
        (data) => (isObject(data.organization) ? str(data.organization.urlKey).toLowerCase() || null : null),
        () => {
          // Unknown for now; ask again next time rather than forever.
          keyWorkspaces.delete(key);
          return null;
        },
      );
      keyWorkspaces.set(key, known);
    }
    return known;
  }

  async function linear(ref: LinearRef): Promise<LinearResult> {
    const keys = parseKeys((await settings.get()).linearApiKeys);
    const chosen = keysFor(keys, await Promise.all(keys.map(workspaceOf)), ref.workspace);
    if ("error" in chosen) return { ok: false, error: chosen.error };
    let lastError: unknown = null;
    for (const key of chosen.keys) {
      try {
        const data = await query(key, ISSUE_QUERY, { id: ref.identifier });
        if (!isObject(data.issue)) return { ok: false, error: `${ref.identifier} was not found.` };
        return { ok: true, item: parseLinearIssue(data.issue, ref) };
      } catch (cause) {
        lastError = cause;
      }
    }
    return failure(lastError);
  }

  bb.rpc.register(rpcContract, {
    github: (ref) => remembered(`github:${ref.repo.toLowerCase()}#${ref.number}:${ref.kind}`, () => github(ref)),
    linear: (ref) => remembered(`linear:${ref.workspace}/${ref.identifier}`, () => linear(ref)),
  });

  bb.onDispose(() => {
    cache.clear();
    inFlight.clear();
    keyWorkspaces.clear();
  });
}
