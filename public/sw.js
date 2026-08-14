// Service Worker for Pitaya PWA — v4 (current IA: Today/Chat/Food/
// Spirit/Journal/Settings; audited 2026-08-14: network-first keeps JS
// fresh, cache is offline-fallback only)
const CACHE_NAME = "pitaya-v4";
const OFFLINE_URL = "/dashboard";

// Assets to cache on install — every URL must resolve or install fails,
// so precache is added per-asset, tolerating individual misses.
const PRECACHE_ASSETS = [
  "/dashboard",
  "/chat",
  "/health/food",
  "/spirit",
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
          .filter((name) => name !== CACHE_NAME)
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

  // Skip API routes - always go to network
  if (event.request.url.includes("/api/")) return;

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
      .catch(() => {
        // Fallback to cache
        return caches.match(event.request).then((cachedResponse) => {
          return cachedResponse || caches.match(OFFLINE_URL);
        });
      })
  );
});

// ─── Push Notification Support ───────────────────────────────────────

self.addEventListener("push", (event) => {
  let data = { title: "Personal OS", body: "You have a reminder", url: "/todos" };

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
    data: { url: data.url || "/todos" },
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

  const url = event.notification.data?.url || "/health";

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
      data: { url: url || "/todos" },
      tag: tag || "reminder",
      renotify: true,
    });
  }
});
