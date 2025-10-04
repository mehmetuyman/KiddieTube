self.addEventListener('install', () => {
  console.log('[sw] installed');
});

self.addEventListener('activate', event => {
  event.waitUntil(clients.claim());
  console.log('[sw] activated');
});