const CACHE_NAME = 'ig-chat-v12';
const urlsToCache = [
    '/',
    '/index.html',
    '/login.html',
    '/style.css',
    '/login.css',
    '/script.js',
    '/login.js',
    '/manifest.json',
    '/assets/icon-192.png',
    '/assets/icon-512.png'
];

self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                // Caching core assets
                return cache.addAll(urlsToCache);
            })
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', event => {
    // We want dynamic fetches for API, so for now we just do Network First, falling back to cache
    if (event.request.url.includes('/api/') || event.request.url.includes('/socket.io/')) {
        event.respondWith(
            fetch(event.request).catch(() => caches.match(event.request))
        );
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) {
                    return response; // Return from cache
                }

                // If not in cache, fetch from network
                return fetch(event.request).then(response => {
                    // Check if we received a valid response
                    if(!response || response.status !== 200 || response.type !== 'basic') {
                        return response;
                    }

                    // Dynamically cache the new response
                    if (event.request.url.startsWith(self.location.origin)) {
                        let responseToCache = response.clone();
                        caches.open(CACHE_NAME)
                            .then(cache => {
                                cache.put(event.request, responseToCache);
                            });
                    }

                    return response;
                }).catch(() => {
                    // Fallbacks for offline when item is not in cache
                    if (event.request.destination === 'document') {
                        return caches.match('/login.html');
                    }
                });
            })
    );
});
