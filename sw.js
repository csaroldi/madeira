/* ============================================================
   SERVICE WORKER — A Field Guide to Madeira (v2)
   Caches the app shell on install, serves from cache when
   offline, falls back to network when online for fresh content.
   ============================================================ */

const CACHE_NAME = 'fieldguide-madeira-v2-2026-06-26';

/* Core files the guide needs to run offline.
   All file paths are relative to the service worker location. */
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json'
];

/* External font files we want cached for offline use.
   These come from Google Fonts CDN. The HTML imports Cormorant
   Garamond and DM Sans in various weights. We cache the CSS and
   let the runtime cache catch the actual woff2 font files as
   they are requested on first load. */
const FONT_CSS_URL = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;0,700;1,300;1,400;1,600&family=DM+Sans:wght@300;400;500;600&display=swap';

/* ============================================================
   INSTALL — prime the cache with the core shell
   ============================================================ */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(CORE_ASSETS).then(() => {
        /* Try to cache the font CSS too. Non-fatal if it fails. */
        return cache.add(FONT_CSS_URL).catch(() => {});
      });
    })
  );
  /* Take control immediately so the first load is served by this SW. */
  self.skipWaiting();
});

/* ============================================================
   ACTIVATE — clean up old caches when the version bumps
   ============================================================ */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

/* ============================================================
   FETCH — cache-first for everything in our cache, network
   fallback otherwise, with runtime caching of Google Fonts
   woff2 files so they work offline after one online visit.
   ============================================================ */
self.addEventListener('fetch', event => {
  const req = event.request;

  /* Only handle GET requests. Ignore POST, PUT, etc. */
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  /* Never cache external links the user taps (Maps, webcams, TTS).
     Let those pass through to the network untouched. */
  const isExternalLink =
    url.hostname.includes('google.com') ||
    url.hostname.includes('netmadeira.com') ||
    url.hostname.includes('translate.google.com');
  if (isExternalLink) return;

  /* Runtime caching for Google Fonts font files.
     First request fetches from network, we cache the response,
     later requests are served from cache even offline. */
  const isGoogleFont =
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com';

  if (isGoogleFont) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(req).then(cached => {
          if (cached) return cached;
          return fetch(req).then(resp => {
            /* Only cache successful responses */
            if (resp && resp.status === 200) {
              cache.put(req, resp.clone());
            }
            return resp;
          }).catch(() => cached);
        })
      )
    );
    return;
  }

  /* Everything else (our own HTML, manifest, etc): cache-first. */
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(resp => {
        /* Opportunistically cache successful same-origin responses
           so subsequent visits work offline. */
        if (resp && resp.status === 200 && url.origin === self.location.origin) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
        }
        return resp;
      }).catch(() => {
        /* Offline and no cache match. Last-ditch: serve the root
           index.html so the user sees something rather than the
           browser's default offline screen. */
        return caches.match('./index.html');
      });
    })
  );
});
