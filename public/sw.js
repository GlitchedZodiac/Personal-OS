// Service Worker for Pitaya PWA — v5 (current IA: Today/Chat/Food/
// Spirit/Journal/Settings; audited 2026-08-14: network-first keeps JS
// fresh, cache is offline-fallback only; v5 2026-08-28: cross-origin GETs
// are no longer intercepted — the MapLibre trail view streams thousands of
// map/terrain tiles that would have grown this cache without bound)
const CACHE_NAME = "pitaya-v7";
// Scripture lives in its own cache. It is the one thing in the app that is genuinely
// immutable — ESV Romans 8 will read the same next year — so it is cached forever and
// kept OUT of the app-shell cache, whose whole job is to be purged on every version bump.
const SCRIPTURE_CACHE = "pitaya-scripture-v1";
const OFFLINE_URL = "/dashboard";

/** offline and nothing cached: answer honestly rather than letting respondWith reject */
function offlineJson() {
  return new Response(JSON.stringify({ error: "offline", offline: true }), {
    status: 503,
    headers: { "Content-Type": "application/json" },
  });
}

// Read-only GETs that are safe to answer from cache when the network is gone. Nothing that
// writes is here, and nothing here is answered from cache while the network works — the app
// must never be able to show him a stale page and let him believe it is the saved one.
// (His unsent ink is handled separately and durably, in lib/ink-outbox.ts.)
const OFFLINE_READ_APIS = [
  "/api/spirit/notebooks",
  "/api/spirit/ink",       // page lists and single pages (/api/spirit/ink/<id>)
  "/api/spirit/highlights",
  "/api/spirit/prefs",
];

// Assets to cache on install — every URL must resolve or install fails,
// so precache is added per-asset, tolerating individual misses.
const PRECACHE_ASSETS = [
  "/dashboard",
  "/chat",
  "/health/food",
  "/spirit",
  "/spirit/desk",
  "/journal",
  "/settings",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
];

// Install event - cache core assets (individually, so one bad route
// can't brick the whole install)
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(PRECACHE_ASSETS.map((url) => cache.add(url)))
    )
  );
  self.skipWaiting();
});

// Activate event - clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME && name !== SCRIPTURE_CACHE)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch event - network first, fallback to cache
self.addEventListener("fetch", (event) => {
  // Skip non-GET requests
  if (event.request.method !== "GET") return;

  // Same-origin only: map/terrain tiles (and any other third-party asset)
  // get the browser's normal HTTP caching, never this cache.
  if (new URL(event.request.url).origin !== self.location.origin) return;

  const path = new URL(event.request.url).pathname;

  // Scripture: cache-first, revalidated in the background. The text cannot change, so serving
  // it from disk is strictly correct — and it means every chapter he has ever opened is still
  // there on a plane, in a basement, or on church wifi that has given up.
  if (path === "/api/spirit/passage") {
    event.respondWith(
      caches.open(SCRIPTURE_CACHE).then((cache) =>
        cache.match(event.request).then((cached) => {
          const live = fetch(event.request)
            .then((response) => {
              if (response.status === 200) cache.put(event.request, response.clone());
              return response;
            })
            .catch(() => cached || offlineJson());
          return cached || live;
        })
      )
    );
    return;
  }

  // The rest of his own data: network-first, cache as a fallback. Fresh whenever there is a
  // network; readable when there is not. Anything not on the allowlist — every mutation, and
  // every route that could mislead him about what is saved — goes straight to the network.
  if (path.startsWith("/api/")) {
    if (!OFFLINE_READ_APIS.some((p) => path === p || path.startsWith(p + "/"))) return;
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((c) => c || offlineJson()))
    );
    return;
  }

  // Immutable build assets (2026-08-29, speed round): content-hashed
  // filenames make cache-first strictly correct — first paint stops
  // waiting on the network for chunks that can never change.
  if (event.request.url.includes("/_next/static/")) {
    event.respondWith(
      caches.match(event.request).then(
        (cached) =>
          cached ||
          fetch(event.request).then((response) => {
            if (response.status === 200) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            }
            return response;
          })
      )
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Clone and cache successful responses
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(async () => {
        // Fallback to cache. The desk is driven by query params (?ctx=free, ?ctx=lesson…), so an
        // exact-URL miss is the COMMON case offline, not the rare one — fall back to the same
        // route without its query before giving up and showing the dashboard.
        const exact = await caches.match(event.request);
        if (exact) return exact;
        const bare = await caches.match(new URL(event.request.url).pathname);
        if (bare) return bare;
        return (await caches.match(OFFLINE_URL)) || offlineJson();
      })
  );
});

// ─── Push Notification Support ───────────────────────────────────────

self.addEventListener("push", (event) => {
  let data = { title: "Pitaya", body: "You have a reminder", url: "/dashboard" };

  try {
    if (event.data) {
      data = event.data.json();
    }
  } catch {
    // Use defaults
  }

  const options = {
    body: data.body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    vibrate: [100, 50, 100],
    data: { url: data.url || "/dashboard" },
    actions: [
      { action: "open", title: "Open" },
      { action: "dismiss", title: "Dismiss" },
    ],
    tag: data.tag || "default",
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

// Handle notification click
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url || "/dashboard";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Focus existing window if available
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      // Open new window
      return self.clients.openWindow(url);
    })
  );
});

// ─── Background Sync for Reminder Checks ─────────────────────────────

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SHOW_NOTIFICATION") {
    const { title, body, url, tag } = event.data;
    self.registration.showNotification(title || "Personal OS", {
      body: body || "Reminder",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      vibrate: [100, 50, 100],
      data: { url: url || "/dashboard" },
      tag: tag || "reminder",
      renotify: true,
    });
  }
});
