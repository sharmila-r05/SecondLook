// Second Look's service worker: shows Sarah's and Tom's alerts and opens their family screen when one is tapped.
// It caches nothing, so money is always read fresh from the server.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

function windows() {
  return self.clients.matchAll({ type: "window", includeUncontrolled: true });
}

self.addEventListener("push", (event) => {
  let message = {};
  try {
    message = event.data ? event.data.json() : {};
  } catch {
    message = {};
  }
  const url = typeof message.url === "string" && message.url.startsWith("/family") ? message.url : "/family";
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(typeof message.title === "string" ? message.title : "Second Look", {
        body: typeof message.body === "string" ? message.body : "Something of Mom’s needs a second look.",
        tag: typeof message.tag === "string" ? message.tag : undefined,
        icon: "/icons/icon-192.png",
        badge: "/icons/badge-96.png",
        lang: "en",
        data: { url },
      });
      // An open family screen shows the change straight away instead of at its next refresh.
      for (const client of await windows()) client.postMessage({ type: "second-look:changed" });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url ?? "/family", self.location.origin);
  event.waitUntil(
    (async () => {
      const open = await windows();
      const same = open.find((c) => {
        const u = new URL(c.url);
        return u.pathname === target.pathname && u.searchParams.get("as") === target.searchParams.get("as");
      });
      if (same) {
        same.postMessage({ type: "second-look:changed" });
        return same.focus();
      }
      const ours = open.find((c) => new URL(c.url).origin === target.origin);
      if (ours) {
        try {
          const moved = await ours.navigate(target.href);
          if (moved) return moved.focus();
        } catch {
          // Not controlled by this worker yet: open a fresh window instead.
        }
      }
      return self.clients.openWindow(target.href);
    })(),
  );
});
