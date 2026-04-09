const CACHE = 'aeu-iot-v3';
const ASSETS = ['/', '/index.html', '/manifest.json'];

// API path prefixes — never cache these
const API_PATHS = ['/breaker', '/acir', '/tswitch'];

function isApiCall(url) {
  try {
    const path = new URL(url).pathname;
    return API_PATHS.some(p => path.startsWith(p));
  } catch { return false; }
}

// ─── INSTALL: cache static assets ────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ─── ACTIVATE: clear old caches ──────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ─── FETCH ───────────────────────────────
self.addEventListener('fetch', e => {
  const url = e.request.url;

  // 1. API calls → always network-first, never cache
  if (isApiCall(url) || url.includes(':5000')) {
    e.respondWith(
      fetch(e.request)
        .catch(() => new Response(
          JSON.stringify({ error: 'offline', success: false }),
          { headers: { 'Content-Type': 'application/json' } }
        ))
    );
    return;
  }

  // 2. Static assets → cache-first, fallback to network
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(resp => {
        // Cache successful GET responses only
        if (
          e.request.method === 'GET' &&
          resp.status === 200 &&
          resp.type !== 'opaque'
        ) {
          const clone = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return resp;
      });
    }).catch(() => {
      // Offline fallback for HTML pages
      if (e.request.destination === 'document') {
        return caches.match('/index.html');
      }
    })
  );
});