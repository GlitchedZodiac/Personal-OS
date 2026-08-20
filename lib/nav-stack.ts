"use client";

import { useCallback, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

// Backlinks, not teleports.
//
// WHY (2026-08-20, his feedback): every ‹ in Spirit was a hardcoded
// `router.push("/spirit")` — twelve of them. Leaving the Reader threw
// him back to the section root instead of the study he came from. The
// bottom tab bar is how you jump to a section; ‹ should be the page you
// were just on.
//
// A tab-scoped stack of pathnames answers the one question a plain
// router.back() can't: is there anywhere in THIS app to go back to, or
// did the PWA cold-start here? Deep-link straight to /spirit/read and ‹
// falls back to the section root rather than leaving the app entirely.
//
// Deliberately reads window.location instead of useSearchParams: these
// are client pages rendered without a Suspense boundary, and the hook
// would force one on every screen that owns a back button.

const KEY = "pitaya-nav-stack";
const LIMIT = 30;

function readStack(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((p) => typeof p === "string") : [];
  } catch {
    return [];
  }
}

function writeStack(stack: string[]) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(stack.slice(-LIMIT)));
  } catch {
    // Private mode / quota — backlinks degrade to the fallback.
  }
}

/** Records each page visited in this tab. Mounted once, in the layout. */
export function useNavStack() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    const stack = readStack();
    if (stack[stack.length - 1] === pathname) return;
    // Going back re-enters the previous entry: pop rather than push, so
    // the stack mirrors history instead of growing on every ‹.
    if (stack[stack.length - 2] === pathname) stack.pop();
    else stack.push(pathname);
    writeStack(stack);
  }, [pathname]);
}

/** The page behind this one, or null when there is nothing behind it. */
export function previousPath(): string | null {
  const stack = readStack();
  return stack.length > 1 ? stack[stack.length - 2] : null;
}

/**
 * An explicit ?from= target, when the caller handed us one. Same-origin
 * paths only: "//evil.example" also starts with "/" and the router would
 * treat it as protocol-relative, so it is rejected along with anything
 * carrying a scheme.
 */
export function fromParam(): string | null {
  if (typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get("from");
  if (!raw) return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  if (/^\/\\/.test(raw)) return null;
  return raw;
}

/**
 * A ‹ handler. Order of preference:
 *   1. an explicit ?from= — the study↔reader round trip carries its step
 *   2. the previous in-app page
 *   3. the section fallback
 */
export function useBackTo(fallback: string) {
  const router = useRouter();
  return useCallback(() => {
    const from = fromParam();
    if (from) {
      router.push(from);
      return;
    }
    if (previousPath()) {
      router.back();
      return;
    }
    router.push(fallback);
  }, [fallback, router]);
}
