const ALLOWED_ROOT_DOMAIN = "anisrc.top";
const HOST_RE = /^x([a-z0-9]{2})\.anisrc\.top$/i;
const ID_RE = /^[0-9]+$/i;

export async function onRequest(context) {
  const { request } = context;

  /* =========================
     0. WORKER CACHE (EARLY RETURN)
     ========================= */

  const cache = caches.default;
  const cachedResponse = await cache.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  /* =========================
     1. PARSE URL (SAU CACHE)
     ========================= */

  const url = new URL(request.url);

  /* =========================
     2. REFERER PROTECTION
     ========================= */

  const referer = request.headers.get("Referer");

  if (!referer) {
    return Response.redirect(
      "https://www.youtube.com/watch?v=Kq9_r9l8MpI",
      302
    );
  }

  let refererHost;
  try {
    refererHost = new URL(referer).hostname;
  } catch {
    return new Response("Invalid referer", { status: 403 });
  }

  if (
    refererHost !== ALLOWED_ROOT_DOMAIN &&
    !refererHost.endsWith("." + ALLOWED_ROOT_DOMAIN)
  ) {
    return new Response("Hotlink denied", { status: 403 });
  }

  /* =========================
     3. VALIDATE HOSTNAME
     ========================= */

  const hostMatch = HOST_RE.exec(url.hostname);
  if (!hostMatch) {
    return new Response("Invalid host", { status: 403 });
  }

  const shardId = hostMatch[1];

  /* =========================
     4. PATH
     ========================= */

  const pathname = url.pathname.replace(/^\/+/, "");
  if (!pathname) {
    return new Response("Not found", { status: 404 });
  }

  const lower = pathname.toLowerCase();
  let originUrl;

  /* =========================
     5. GLOBAL FILE
     ========================= */

  if (lower === "index.html") {
    originUrl =
      `https://x${shardId}-anisrc-top.pages.dev/index.html`;
  }

  /* =========================
     6. PREVIEW M3U8
     ========================= */

  else if (lower.endsWith(".m3u8")) {
    const previewId = pathname.slice(0, -5);

    if (!ID_RE.test(previewId)) {
      return new Response("Invalid preview id", { status: 403 });
    }

    originUrl =
      `https://${pathname}.x${shardId}-anisrc-top.pages.dev/${pathname}`;
  }

  /* =========================
     7. PREVIEW PNG
     ========================= */

  else if (lower.endsWith(".png")) {
    const dashIndex = pathname.indexOf("-");
    if (dashIndex === -1) {
      return new Response("Invalid image name", { status: 403 });
    }

    const previewId = pathname.slice(0, dashIndex);

    if (!ID_RE.test(previewId)) {
      return new Response("Invalid preview id", { status: 403 });
    }

    originUrl =
      `https://${pathname}.x${shardId}-anisrc-top.pages.dev/${pathname}`;
  }

  /* =========================
     8. BLOCK ALL OTHERS
     ========================= */

  else {
    return new Response("File not allowed", { status: 403 });
  }

  /* =========================
     9. FETCH ORIGIN (CACHE MISS)
     ========================= */

  const originResponse = await fetch(originUrl);

  if (!originResponse.ok) {
    return new Response("File not found", {
      status: originResponse.status
    });
  }

  /* =========================
     10. RESPONSE + STORE CACHE
     ========================= */

  const response = new Response(originResponse.body, originResponse);

  response.headers.set(
    "Cache-Control",
    "public, max-age=31536000, immutable"
  );
  response.headers.set("X-Content-Type-Options", "nosniff");

  await cache.put(request, response.clone());

  return response;
}
