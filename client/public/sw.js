// Service Worker do Galactic War — recebe e exibe notificações push.
self.addEventListener("push", (event) => {
  let data = { title: "Galactic War", body: "Novidade no seu planeta!", tag: "gw", url: "/" };
  try { if (event.data) data = { ...data, ...event.data.json() }; } catch (e) { /* payload simples */ }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      vibrate: [120, 60, 120],
      data: { url: data.url || "/" },
    })
  );
});

// Ao tocar na notificação: abre/foca o jogo.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) { if ("focus" in c) return c.focus(); }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
