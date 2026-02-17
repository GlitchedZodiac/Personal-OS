/**
 * Client-side data cache for avoiding redundant fetches across page navigations.
 *
 * Module-level Map survives Next.js client-side navigation (the JS module stays
 * loaded). Each entry has a TTL after which it goes stale and is re-fetched in
 * the background (stale-while-revalidate pattern).
 *
 * Usage:
 *   const { data, loading, refresh } = useCachedFetch<MyType>("/api/foo", { ttl: 30_000 });
 *
 * Invalidation:
 *   import { invalidateCache } from "@/lib/cache";
 *   invalidateCache("/api/foo");           // single key
 *   invalidateCache((k) => k.startsWith("/api/health"));  // pattern
 */

"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// ─── Cache store (module-level, persists across navigations) ────

interface CacheEntry<T = unknown> {
  data: T;
  timestamp: number;
  url: string;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>(); // dedupe concurrent requests
const subscribers = new Map<string, Set<() => void>>(); // notify components on invalidation

// ─── Public cache control ────────────────────────────────────────

/**
 * Invalidate cached entries. Pass a string for exact match, or a predicate
 * function to match multiple keys.
 */
export function invalidateCache(
  keyOrPredicate: string | ((key: string) => boolean)
) {
  const keysToInvalidate: string[] = [];

  if (typeof keyOrPredicate === "string") {
    keysToInvalidate.push(keyOrPredicate);
  } else {
    for (const key of cache.keys()) {
      if (keyOrPredicate(key)) keysToInvalidate.push(key);
    }
  }

  for (const key of keysToInvalidate) {
    cache.delete(key);
    inflight.delete(key);
    // Notify subscribers to refetch
    const subs = subscribers.get(key);
    if (subs) {
      subs.forEach((cb) => cb());
    }
  }
}

/**
 * Invalidate all health-related caches. Call this after any mutation
 * (food logged, workout completed, measurement saved, etc.)
 */
export function invalidateHealthCache() {
  invalidateCache((k) => k.startsWith("/api/health"));
}

/**
 * Clear entire cache.
 */
export function clearCache() {
  cache.clear();
  inflight.clear();
}

/**
 * Pre-populate the cache (useful after a mutation when you already have the new data).
 */
export function setCacheEntry<T>(key: string, data: T) {
  cache.set(key, { data, timestamp: Date.now(), url: key });
}

// ─── Hook ────────────────────────────────────────────────────────

interface UseCachedFetchOptions {
  /** Time-to-live in ms. Default 60_000 (1 minute). */
  ttl?: number;
  /** Skip the fetch (e.g. when a dependency isn't ready). */
  skip?: boolean;
  /** If true, always refetch even if cache is fresh. */
  forceRefresh?: boolean;
}

interface UseCachedFetchResult<T> {
  data: T | null;
  loading: boolean;
  /** True only on the very first load (no cached data). */
  initialLoading: boolean;
  error: Error | null;
  /** Force a fresh fetch, bypassing cache. */
  refresh: () => void;
}

export function useCachedFetch<T = unknown>(
  url: string | null,
  options: UseCachedFetchOptions = {}
): UseCachedFetchResult<T> {
  const { ttl = 60_000, skip = false, forceRefresh = false } = options;

  const cacheKey = url || "";
  const cached = cacheKey ? (cache.get(cacheKey) as CacheEntry<T> | undefined) : undefined;
  const isFresh = cached && Date.now() - cached.timestamp < ttl;

  const [data, setData] = useState<T | null>(cached?.data ?? null);
  const [loading, setLoading] = useState(!isFresh && !skip);
  const [initialLoading, setInitialLoading] = useState(!cached && !skip);
  const [error, setError] = useState<Error | null>(null);
  const mountedRef = useRef(true);

  // Use a ref + counter for explicit refresh requests.
  // The ref tracks whether the current render cycle needs a forced fetch
  // without polluting the dependency array for non-refresh re-renders.
  const [fetchTrigger, setFetchTrigger] = useState(0);
  const explicitRefreshRef = useRef(false);

  // Subscribe to invalidation events
  useEffect(() => {
    if (!cacheKey) return;

    const handler = () => {
      explicitRefreshRef.current = true;
      setFetchTrigger((n) => n + 1);
    };

    if (!subscribers.has(cacheKey)) {
      subscribers.set(cacheKey, new Set());
    }
    subscribers.get(cacheKey)!.add(handler);

    return () => {
      subscribers.get(cacheKey)?.delete(handler);
      if (subscribers.get(cacheKey)?.size === 0) {
        subscribers.delete(cacheKey);
      }
    };
  }, [cacheKey]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!url || skip) {
      setLoading(false);
      setInitialLoading(false);
      return;
    }

    const isExplicitRefresh = explicitRefreshRef.current;
    explicitRefreshRef.current = false; // consume the flag

    const cachedEntry = cache.get(url) as CacheEntry<T> | undefined;
    const isStillFresh =
      cachedEntry &&
      Date.now() - cachedEntry.timestamp < ttl &&
      !forceRefresh &&
      !isExplicitRefresh;

    // If fresh cache exists, use it immediately — no network request
    if (isStillFresh) {
      setData(cachedEntry!.data);
      setLoading(false);
      setInitialLoading(false);
      return;
    }

    // If stale cache exists, show it while revalidating (SWR pattern)
    if (cachedEntry && !isExplicitRefresh) {
      setData(cachedEntry.data);
      setInitialLoading(false);
    }

    // Deduplicate concurrent requests for the same URL
    let fetchPromise = inflight.get(url) as Promise<T> | undefined;

    if (!fetchPromise || isExplicitRefresh) {
      // If explicit refresh, force a new fetch even if one is inflight
      if (isExplicitRefresh) {
        inflight.delete(url);
      }

      setLoading(true);

      fetchPromise = fetch(url)
        .then(async (res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const json = await res.json();
          return json as T;
        })
        .finally(() => {
          inflight.delete(url);
        });

      inflight.set(url, fetchPromise);
    } else {
      // Reuse existing inflight request
      setLoading(true);
    }

    fetchPromise
      .then((result) => {
        // Store in cache
        cache.set(url, { data: result, timestamp: Date.now(), url });

        if (mountedRef.current) {
          setData(result);
          setError(null);
        }
      })
      .catch((err) => {
        if (mountedRef.current) {
          setError(err);
        }
      })
      .finally(() => {
        if (mountedRef.current) {
          setLoading(false);
          setInitialLoading(false);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ttl, skip, forceRefresh, fetchTrigger]);

  const refresh = useCallback(() => {
    if (url) {
      cache.delete(url);
      inflight.delete(url);
    }
    explicitRefreshRef.current = true;
    setFetchTrigger((n) => n + 1);
  }, [url]);

  return { data, loading, initialLoading, error, refresh };
}
