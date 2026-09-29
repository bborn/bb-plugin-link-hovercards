// bb-plugin-link-hovercards — frontend entry.
//
// One app overlay listens for the pointer resting on (or, on touch screens, a
// long press of) any link to a GitHub pull request, GitHub issue or Linear
// issue, anywhere in BB, and floats a summary card beside it.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { definePluginApp, useRpc } from "@get-bb/plugin-sdk/app";
import type { GithubResult, LinearResult } from "./contract";
import type { rpcContract } from "./server";
import { IssueCard, LinearCard, PrCard } from "./components/cards";
import { LINK_SELECTOR, linkKey, parseLink, type LinkRef } from "./lib/links";
import { usePortalScopeProps } from "@/lib/portal-scope";

const OPEN_DELAY_MS = 350;
const CLOSE_DELAY_MS = 200;
/** Touch has no hover: holding a link this long opens the card instead. */
const LONG_PRESS_MS = 420;
/** A finger that drifts further than this is scrolling, not pressing. */
const LONG_PRESS_SLOP_PX = 10;
const CARD_WIDTH = 400;
const GAP = 6;
/** Fresh enough to show without refetching; the server keeps its own minute. */
const CLIENT_FRESH_MS = 30_000;

type Result = GithubResult | LinearResult;

// Shared by every card this window opens: re-hovering is instant.
const answers = new Map<string, { at: number; result: Result }>();

function useLinkSummary(ref: LinkRef): Result | null {
  const rpc = useRpc<typeof rpcContract>();
  const key = linkKey(ref);
  const [result, setResult] = useState<Result | null>(() => answers.get(key)?.result ?? null);
  useEffect(() => {
    const hit = answers.get(key);
    setResult(hit?.result ?? null);
    if (hit !== undefined && Date.now() - hit.at < CLIENT_FRESH_MS) return;
    let live = true;
    const request: Promise<Result> =
      ref.source === "github"
        ? rpc.call("github", { kind: ref.kind, repo: ref.repo, number: ref.number })
        : rpc.call("linear", { workspace: ref.workspace, identifier: ref.identifier });
    request.then(
      (next) => {
        answers.set(key, { at: Date.now(), result: next });
        if (live) setResult(next);
      },
      (cause: unknown) => {
        if (live && hit === undefined) {
          setResult({ ok: false, error: cause instanceof Error ? cause.message : String(cause) });
        }
      },
    );
    return () => {
      live = false;
    };
    // `ref` is fully described by `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, rpc]);
  return result;
}

function describe(ref: LinkRef): string {
  return ref.source === "github" ? `${ref.repo} #${ref.number}` : ref.identifier;
}

function CardBody({ target }: { target: LinkRef }) {
  const result = useLinkSummary(target);
  if (result === null) {
    return (
      <div className="flex flex-col gap-2.5 p-3.5" role="status" aria-label="Loading">
        <div className="text-xs text-muted-foreground">{describe(target)}</div>
        <div className="h-4 w-4/5 animate-pulse rounded bg-muted" />
        <div className="h-3 w-full animate-pulse rounded bg-muted" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
      </div>
    );
  }
  if (!result.ok) {
    return (
      <div className="flex flex-col gap-1.5 p-3.5 text-xs">
        <div className="text-muted-foreground">{describe(target)}</div>
        <p className="text-destructive">Couldn't load a preview.</p>
        <p className="line-clamp-3 text-muted-foreground">{result.error}</p>
      </div>
    );
  }
  switch (result.item.type) {
    case "pr":
      return <PrCard pr={result.item} />;
    case "issue":
      return <IssueCard issue={result.item} />;
    case "linear":
      return <LinearCard issue={result.item} />;
  }
}

// ---------------------------------------------------------------------------
// Hover tracking.

// On touch screens a long press on a previewable link belongs to the card, so the
// system's link callout and text selection stay out of its way.
const TOUCH_CSS = `@media (pointer: coarse) {
  ${LINK_SELECTOR} { -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; }
}`;

interface Hovered {
  ref: LinkRef;
  anchor: HTMLAnchorElement;
}

function place(anchor: DOMRect, card: { width: number; height: number }) {
  const margin = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const left = Math.min(Math.max(margin, anchor.left), Math.max(margin, vw - card.width - margin));
  const below = anchor.bottom + GAP;
  const fitsBelow = below + card.height + margin <= vh;
  const above = anchor.top - GAP - card.height;
  const top = fitsBelow || above < margin ? below : above;
  return { left, top };
}

/** The link that replaced `lost` in the page: the one under the pointer, else the only one left. */
function relink(lost: Hovered, at: { x: number; y: number } | null, card: HTMLElement): Hovered | null {
  const href = lost.anchor.href;
  const under = at === null ? null : document.elementFromPoint(at.x, at.y)?.closest("a[href]");
  if (under instanceof HTMLAnchorElement && under.href === href && !card.contains(under)) {
    return { ref: lost.ref, anchor: under };
  }
  const same = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]")).filter(
    (anchor) => anchor.href === href && !card.contains(anchor),
  );
  return same.length === 1 ? { ref: lost.ref, anchor: same[0]! } : null;
}

function HoverCardOverlay() {
  const portalScope = usePortalScopeProps();
  const [hovered, setHovered] = useState<Hovered | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  // Bumped when the page scrolls under an open card, so it re-places.
  const [, setScrolled] = useState(0);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const hoveredRef = useRef<Hovered | null>(null);
  const openTimer = useRef<number | undefined>(undefined);
  /** Where the pointer last was, to find a link again after it re-renders. */
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const closeTimer = useRef<number | undefined>(undefined);

  const show = useCallback((next: Hovered | null) => {
    hoveredRef.current = next;
    setHovered(next);
    if (next === null) setPosition(null);
  }, []);
  const cancelOpen = () => window.clearTimeout(openTimer.current);
  const cancelClose = () => window.clearTimeout(closeTimer.current);
  const scheduleClose = useCallback(() => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => show(null), CLOSE_DELAY_MS);
  }, [show]);

  useEffect(() => {
    const linkAnchor = (target: EventTarget | null): Hovered | null => {
      if (!(target instanceof Element)) return null;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return null;
      if (cardRef.current?.contains(anchor)) return null;
      const ref = parseLink(anchor.href);
      return ref === null ? null : { ref, anchor };
    };

    const onOver = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      pointer.current = { x: event.clientX, y: event.clientY };
      if (cardRef.current?.contains(event.target as Node)) return;
      const next = linkAnchor(event.target);
      if (next === null) return;
      cancelClose();
      if (hoveredRef.current?.anchor === next.anchor) return;
      cancelOpen();
      // Moving from one link to another while a card is up swaps quickly.
      const delay = hoveredRef.current === null ? OPEN_DELAY_MS : 120;
      openTimer.current = window.setTimeout(() => show(next), delay);
    };
    const onOut = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      const left = linkAnchor(event.target);
      if (left === null) return;
      const to = event.relatedTarget;
      if (to instanceof Node && (left.anchor.contains(to) || cardRef.current?.contains(to))) return;
      cancelOpen();
      if (hoveredRef.current !== null) scheduleClose();
    };
    const dismiss = () => {
      cancelOpen();
      cancelClose();
      if (hoveredRef.current !== null) show(null);
    };

    // Touch: a held press opens the card, and swallows the click and context
    // menu that the same press would otherwise produce.
    let press: { x: number; y: number; timer: number } | null = null;
    let pressedAnchor: HTMLAnchorElement | null = null;
    const endPress = () => {
      if (press !== null) window.clearTimeout(press.timer);
      press = null;
    };
    const startPress = (event: PointerEvent) => {
      const next = linkAnchor(event.target);
      if (next === null) return;
      const timer = window.setTimeout(() => {
        press = null;
        pressedAnchor = next.anchor;
        navigator.vibrate?.(8);
        show(next);
      }, LONG_PRESS_MS);
      press = { x: event.clientX, y: event.clientY, timer };
      pointer.current = { x: event.clientX, y: event.clientY };
    };
    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "touch") pointer.current = { x: event.clientX, y: event.clientY };
      if (press === null) return;
      if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > LONG_PRESS_SLOP_PX) endPress();
    };
    const pressed = (target: EventTarget | null) =>
      pressedAnchor !== null && target instanceof Node && pressedAnchor.contains(target);
    const onClick = (event: MouseEvent) => {
      if (!pressed(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      pressedAnchor = null;
    };
    const onContextMenu = (event: MouseEvent) => {
      if (press !== null || pressed(event.target)) event.preventDefault();
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    // Live threads scroll on their own as messages stream in: the card follows
    // its link (the layout effect re-places it, or closes it once the link
    // leaves the screen). Scrolling elsewhere, like a thread beside a panel,
    // leaves the card alone.
    const onScroll = (event: Event) => {
      const open = hoveredRef.current;
      if (open === null) return;
      const target = event.target;
      if (target instanceof Node && target !== document && open.anchor.isConnected && !target.contains(open.anchor)) return;
      setScrolled((count) => count + 1);
    };
    const onDown = (event: PointerEvent) => {
      endPress();
      pressedAnchor = null;
      if (cardRef.current?.contains(event.target as Node)) return;
      dismiss();
      if (event.pointerType === "touch" && event.isPrimary) startPress(event);
    };

    document.addEventListener("pointerover", onOver, true);
    document.addEventListener("pointerout", onOut, true);
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("pointermove", onMove, true);
    document.addEventListener("pointerup", endPress, true);
    document.addEventListener("pointercancel", endPress, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("contextmenu", onContextMenu, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", dismiss);
    window.addEventListener("blur", dismiss);
    return () => {
      cancelOpen();
      cancelClose();
      endPress();
      document.removeEventListener("pointermove", onMove, true);
      document.removeEventListener("pointerup", endPress, true);
      document.removeEventListener("pointercancel", endPress, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("contextmenu", onContextMenu, true);
      document.removeEventListener("pointerover", onOver, true);
      document.removeEventListener("pointerout", onOut, true);
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("blur", dismiss);
    };
  }, [scheduleClose, show]);

  // Place after every render: the card grows when data arrives.
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (hovered === null || card === null) return;
    if (!hovered.anchor.isConnected) {
      // Markdown re-renders (a streaming message, a refreshed preview) swap
      // the link element for an identical one. Follow it instead of closing.
      const again = relink(hovered, pointer.current, card);
      if (again === null) show(null);
      else show(again);
      return;
    }
    const rect = hovered.anchor.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) {
      show(null);
      return;
    }
    const next = place(rect, {
      width: card.offsetWidth,
      height: card.offsetHeight,
    });
    setPosition((previous) =>
      previous !== null && previous.left === next.left && previous.top === next.top ? previous : next,
    );
  });

  const style = <style>{TOUCH_CSS}</style>;
  if (hovered === null) return style;
  const card = createPortal(
    <div
      {...portalScope}
      ref={cardRef}
      role="dialog"
      aria-label={`Preview of ${describe(hovered.ref)}`}
      onPointerEnter={cancelClose}
      onPointerLeave={(event) => {
        if (event.pointerType !== "touch") scheduleClose();
      }}
      style={{
        position: "fixed",
        left: position?.left ?? -9999,
        top: position?.top ?? -9999,
        width: CARD_WIDTH,
        maxWidth: "calc(100vw - 16px)",
        zIndex: 2147483000,
        visibility: position === null ? "hidden" : "visible",
      }}
      className="overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-xl"
    >
      <CardBody key={linkKey(hovered.ref)} target={hovered.ref} />
    </div>,
    document.body,
  );
  return (
    <>
      {style}
      {card}
    </>
  );
}

export default definePluginApp((app) => {
  app.slots.experimental_appOverlay({
    id: "link-hovercards",
    component: HoverCardOverlay,
  });
});
