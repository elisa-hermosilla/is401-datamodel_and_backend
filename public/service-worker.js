self.addEventListener("push", event => {
  let message = {};
  try { message = event.data ? event.data.json() : {}; }
  catch { message = { body: event.data?.text() || "You have an assignment reminder." }; }

  event.waitUntil(self.registration.showNotification(message.title || "Assignment reminder", {
    body: message.body || "An assignment is coming due.",
    icon: "/favicon.svg",
    badge: "/favicon.svg",
    data: { url: message.url || "/assignments" },
  }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/assignments", self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find(client => new URL(client.url).origin === self.location.origin);
    if (existing) {
      await existing.navigate(target);
      return existing.focus();
    }
    return self.clients.openWindow(target);
  })());
});
