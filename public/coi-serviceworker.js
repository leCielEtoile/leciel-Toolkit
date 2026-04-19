/**
 * coi-serviceworker — enables SharedArrayBuffer (required by wasm-vips) by
 * injecting Cross-Origin-Embedder-Policy and Cross-Origin-Opener-Policy headers
 * without needing server-side configuration.
 *
 * Key rules:
 * - COEP: credentialless — added to ALL same-origin responses
 *   (page + JS bundles including worker scripts + WASM files)
 * - COOP: same-origin — added ONLY to navigation responses (HTML documents)
 *   Setting COOP on non-HTML responses (scripts) causes Chrome to block
 *   worker creation with ERR_BLOCKED_BY_RESPONSE.
 *
 * Result: crossOriginIsolated = true, SharedArrayBuffer available,
 * wasm-vips workers load correctly.
 *
 * Scope is registered as "/tools/image-converter/" so it only affects that page.
 */

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)

  // blob: URLs are in-memory and cannot be modified with COEP headers.
  // More importantly, letting the service worker intercept them blocks
  // ffmpeg-core-mt pthread sub-workers from loading, causing encoding to hang.
  if (url.protocol === 'blob:') return

  const isSameOrigin = url.origin === self.location.origin
  const isNavigation = e.request.mode === 'navigate'

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (!res || res.status === 0) return res
        // Leave cross-origin CDN responses untouched — credentialless allows
        // them to load without credentials without needing CORP headers.
        if (!isSameOrigin) return res

        const headers = new Headers(res.headers)
        // COEP on every same-origin response (page, scripts, WASM).
        // Without this on worker scripts, Chrome blocks module worker creation.
        headers.set('Cross-Origin-Embedder-Policy', 'credentialless')
        // COOP only on HTML navigation — setting it on scripts blocks workers.
        if (isNavigation) {
          headers.set('Cross-Origin-Opener-Policy', 'same-origin')
        }
        return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
      })
      .catch(() => fetch(e.request))
  )
})
